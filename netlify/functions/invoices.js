const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sbHeaders = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
};

const ADMIN_SECRET = process.env.ADMIN_SECRET;
function verifyToken(token) {
    if (!token) return false;
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [secret, , expiry] = decoded.split(':');
        return secret === ADMIN_SECRET && Date.now() <= parseInt(expiry);
    } catch (e) {
        return false;
    }
}

exports.handler = async (event, context) => {
    const token = event.headers['x-admin-token'];
    if (!verifyToken(token)) {
        return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado.' }) };
    }

    try {
        switch (event.httpMethod) {
            case 'GET':
                return await getInvoices(event);
            case 'POST':
                return await createInvoice(event);
            case 'PUT':
                return await updateInvoice(event);
            case 'DELETE':
                return await deleteInvoice(event);
            default:
                return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
        }
    } catch (error) {
        console.error('Error en la función invoices:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error interno del servidor.', details: error.message }),
        };
    }
};

async function getInvoices(event) {
    const invoiceId = event.queryStringParameters.id;

    if (invoiceId) {
        const summaryPayload = await getInvoiceSummary(invoiceId);

        if (!summaryPayload) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Factura no encontrada' }) };
        }

        return { statusCode: 200, body: JSON.stringify(summaryPayload) };

    } else {
        const rpcUrl = `${supabaseUrl}/rest/v1/rpc/get_admin_invoices`;
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: sbHeaders
        });

        if (!response.ok) throw new Error(`Error de Supabase: ${await response.text()}`);
        
        const data = await response.json();
        return { statusCode: 200, body: JSON.stringify(data) };
    }
}

async function getInvoiceSummary(invoiceId) {
    const invoiceHeader = await getInvoiceHeader(invoiceId);
    if (!invoiceHeader) {
        return null;
    }

    const rpcUrl = `${supabaseUrl}/rest/v1/rpc/get_invoice_summary`;
    const rpcResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ p_invoice_id: Number(invoiceId) })
    });

    if (rpcResponse.ok) {
        const rpcData = await rpcResponse.json();
        const normalized = normalizeInvoiceSummaryResponse(rpcData, invoiceHeader);

        if (normalized) {
            return normalized;
        }
    } else {
        console.warn(`get_invoice_summary falló para factura ${invoiceId}: ${await rpcResponse.text()}`);
    }

    return await getInvoiceSummaryFallback(invoiceId, invoiceHeader);
}

async function getInvoiceHeader(invoiceId) {
    const invoiceRes = await fetch(`${supabaseUrl}/rest/v1/invoices?id=eq.${invoiceId}&select=*`, { headers: sbHeaders });

    if (!invoiceRes.ok) throw new Error('Error obteniendo la factura.');

    const invoices = await invoiceRes.json();
    if (invoices.length === 0) return null;

    const invoice = invoices[0];
    invoice.status_name = await getInvoiceStatusName(invoice.id_status);
    return invoice;
}

async function getInvoiceStatusName(statusId) {
    if (!statusId) return null;

    const statusRes = await fetch(`${supabaseUrl}/rest/v1/status?id_status=eq.${statusId}&select=status_name`, { headers: sbHeaders });
    if (!statusRes.ok) return null;

    const statuses = await statusRes.json();
    return statuses[0]?.status_name || null;
}

async function getInvoiceSummaryFallback(invoiceId, invoiceHeader) {
    const [itemsRes, paymentsRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/order_items?invoice_id=eq.${invoiceId}&select=*`, { headers: sbHeaders }),
        fetch(`${supabaseUrl}/rest/v1/payments?invoice_id=eq.${invoiceId}&select=*`, { headers: sbHeaders })
    ]);

    const items = itemsRes.ok ? await itemsRes.json() : [];
    const payments = paymentsRes.ok ? await paymentsRes.json() : [];

    return { invoice: invoiceHeader, items, payments };
}

function normalizeInvoiceSummaryResponse(payload, invoiceHeader) {
    if (payload == null) {
        return null;
    }

    if (Array.isArray(payload) && payload.length === 0) {
        return { invoice: invoiceHeader, items: [], payments: [] };
    }

    if (hasStructuredInvoicePayload(payload)) {
        return {
            invoice: { ...invoiceHeader, ...payload.invoice },
            items: payload.items,
            payments: payload.payments
        };
    }

    if (Array.isArray(payload)) {
        return normalizeInvoiceSummaryRows(payload, invoiceHeader);
    }

    if (typeof payload === 'object') {
        return normalizeStructuredInvoiceObject(payload, invoiceHeader);
    }

    return null;
}

function hasStructuredInvoicePayload(payload) {
    return Boolean(
        payload &&
        typeof payload === 'object' &&
        payload.invoice &&
        Array.isArray(payload.items) &&
        Array.isArray(payload.payments)
    );
}

function normalizeStructuredInvoiceObject(payload, invoiceHeader) {
    const invoiceSource = payload.invoice || payload.factura || payload.summary || payload;
    const itemsSource = payload.items || payload.order_items || payload.invoice_items || payload.articulos || payload.detalles || [];
    const paymentsSource = payload.payments || payload.abonos || payload.payment_history || payload.historial_abonos || [];

    const invoice = { ...invoiceHeader, ...extractInvoiceFields(invoiceSource, invoiceHeader.id) };
    const items = toArray(itemsSource).map(extractItemFields).filter(hasMeaningfulItem);
    const payments = toArray(paymentsSource).map(extractPaymentFields).filter(hasMeaningfulPayment);

    if (!invoice.id && !items.length && !payments.length) {
        return null;
    }

    return { invoice, items, payments };
}

function normalizeInvoiceSummaryRows(rows, invoiceHeader) {
    const itemsMap = new Map();
    const paymentsMap = new Map();

    rows.forEach((row, index) => {
        const item = extractSummaryItemRow(row);
        const payment = extractSummaryPaymentRow(row);

        if (hasMeaningfulItem(item)) {
            const itemKey = item.id || `${item.product_name || 'item'}-${index}`;
            if (!itemsMap.has(itemKey)) itemsMap.set(itemKey, item);
        }

        if (hasMeaningfulPayment(payment)) {
            const paymentKey = payment.id || `${payment.reference_code || 'payment'}-${index}`;
            if (!paymentsMap.has(paymentKey)) paymentsMap.set(paymentKey, payment);
        }
    });

    if (!invoiceHeader.id && !itemsMap.size && !paymentsMap.size) {
        return null;
    }

    return {
        invoice: invoiceHeader,
        items: Array.from(itemsMap.values()),
        payments: Array.from(paymentsMap.values())
    };
}

function extractSummaryItemRow(source) {
    if (source?.tipo_registro !== 'ITEM') {
        return {};
    }

    return {
        product_name: source.descripcion_o_producto,
        quantity: toNullableNumber(source.cantidad),
        price: toNullableNumber(source.precio_unitario),
        image_url: source.foto,
        subtotal: toNullableNumber(source.monto_total),
        created_at: source.fecha
    };
}

function extractSummaryPaymentRow(source) {
    if (source?.tipo_registro !== 'PAYMENT') {
        return {};
    }

    const parsed = parsePaymentDescription(source.descripcion_o_producto);

    return {
        payment_date: source.fecha,
        amount: toNullableNumber(source.monto_total ?? source.precio_unitario),
        payment_method: parsed.payment_method,
        reference_code: parsed.reference_code
    };
}

function parsePaymentDescription(description) {
    if (!description) {
        return { payment_method: null, reference_code: null };
    }

    const match = String(description).match(/^(.*?)(?:\s*\(Ref:\s*(.*)\))?$/);
    if (!match) {
        return { payment_method: description, reference_code: null };
    }

    return {
        payment_method: match[1]?.trim() || null,
        reference_code: match[2]?.trim() || null
    };
}

function extractInvoiceFields(source, invoiceId) {
    return {
        id: pickFirst(source, ['invoice_id', 'id']) || Number(invoiceId),
        client_name: pickFirst(source, ['client_name', 'cliente']),
        client_phone: pickFirst(source, ['client_phone', 'telefono']),
        invoice_date: pickFirst(source, ['invoice_date', 'fecha_factura', 'created_at']),
        paid: toBoolean(pickFirst(source, ['paid', 'is_paid', 'pagada'])),
        status_name: pickFirst(source, ['status_name', 'estado', 'invoice_status']),
        total_amount: toNullableNumber(pickFirst(source, ['total_amount', 'invoice_total', 'items_total'])),
        total_paid: toNullableNumber(pickFirst(source, ['total_paid', 'payments_total', 'paid_amount'])),
        balance_due: toNullableNumber(pickFirst(source, ['balance_due', 'pending_balance', 'saldo_pendiente']))
    };
}

function extractItemFields(source) {
    return {
        id: pickFirst(source, ['order_item_id', 'item_id', 'id']),
        product_name: pickFirst(source, ['product_name', 'producto']),
        quantity: toNullableNumber(pickFirst(source, ['quantity', 'cantidad'])),
        price: toNullableNumber(pickFirst(source, ['price', 'precio'])),
        size: pickFirst(source, ['size', 'talla'])
    };
}

function extractPaymentFields(source) {
    return {
        id: pickFirst(source, ['payment_id', 'id']),
        payment_date: pickFirst(source, ['payment_date', 'fecha_abono', 'created_at']),
        amount: toNullableNumber(pickFirst(source, ['amount', 'monto'])),
        payment_method: pickFirst(source, ['payment_method', 'metodo_pago']),
        reference_code: pickFirst(source, ['reference_code', 'referencia']),
        notes: pickFirst(source, ['notes', 'nota'])
    };
}

function hasMeaningfulItem(item) {
    return Boolean(item.product_name || item.quantity !== null || item.price !== null);
}

function hasMeaningfulPayment(payment) {
    return Boolean(payment.payment_date || payment.amount !== null || payment.reference_code || payment.payment_method);
}

function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
}

function pickFirst(source, keys) {
    if (!source || typeof source !== 'object') return null;

    for (const key of keys) {
        if (source[key] !== undefined && source[key] !== null) {
            return source[key];
        }
    }

    return null;
}

function toBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    if (typeof value === 'number') return value === 1;
    return false;
}

function toNullableNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

async function updateInvoice(event) {
    const body = JSON.parse(event.body);
    const { id, ...updateData } = body;

    if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Se requiere el ID de la factura para actualizar.' }) };
    }

    const updateUrl = `${supabaseUrl}/rest/v1/invoices?id=eq.${id}`;
    const response = await fetch(updateUrl, {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify(updateData)
    });

    if (!response.ok) throw new Error(`Error actualizando factura: ${await response.text()}`);

    const [data] = await response.json();
    return { statusCode: 200, body: JSON.stringify(data) };
}

async function createInvoice(event) {
    const body = JSON.parse(event.body || '{}');

    if (body.invoice_id !== undefined || body.amount !== undefined) {
        return await createPayment(body);
    }

    const {
        client_name,
        client_phone,
        id_status,
        paid,
        invoice_date
    } = body;

    if (!client_name || !client_phone) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Se requieren client_name y client_phone.' })
        };
    }

    const payload = {
        client_name: String(client_name).trim(),
        client_phone: String(client_phone).trim(),
        id_status: Number.isFinite(Number(id_status)) ? Number(id_status) : 1,
        paid: typeof paid === 'boolean' ? paid : false
    };

    if (invoice_date) {
        payload.invoice_date = invoice_date;
    }

    const createUrl = `${supabaseUrl}/rest/v1/invoices`;
    const response = await fetch(createUrl, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Error creando factura: ${await response.text()}`);

    const [data] = await response.json();
    return { statusCode: 201, body: JSON.stringify(data) };
}

async function createPayment(body) {
    const invoiceId = Number(body.invoice_id);
    const amount = Number(body.amount);

    if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Se requiere un invoice_id válido para registrar el abono.' })
        };
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'El monto del abono debe ser mayor a 0.' })
        };
    }

    const existsRes = await fetch(`${supabaseUrl}/rest/v1/invoices?id=eq.${invoiceId}&select=id&limit=1`, {
        headers: sbHeaders
    });

    if (!existsRes.ok) {
        throw new Error(`Error validando factura para abono: ${await existsRes.text()}`);
    }

    const existing = await existsRes.json();
    if (!existing.length) {
        return {
            statusCode: 404,
            body: JSON.stringify({ error: `La factura ${invoiceId} no existe.` })
        };
    }

    const paymentPayload = {
        invoice_id: invoiceId,
        amount,
        payment_method: body.payment_method ? String(body.payment_method).trim() : null,
        reference_code: body.reference_code ? String(body.reference_code).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
        payment_date: body.payment_date || new Date().toISOString()
    };

    const createPaymentUrl = `${supabaseUrl}/rest/v1/payments`;
    const paymentRes = await fetch(createPaymentUrl, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify(paymentPayload)
    });

    if (!paymentRes.ok) {
        throw new Error(`Error creando abono: ${await paymentRes.text()}`);
    }

    const [payment] = await paymentRes.json();
    return { statusCode: 201, body: JSON.stringify(payment) };
}

async function deleteInvoice(event) {
    const id = event.queryStringParameters.id;
    if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Se requiere el parámetro "id" para eliminar.' }) };
    }

    // Por seguridad, primero desvinculamos los order_items
    const unlinkUrl = `${supabaseUrl}/rest/v1/order_items?invoice_id=eq.${id}`;
    await fetch(unlinkUrl, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({ invoice_id: null })
    });

    // Ahora eliminamos la factura
    const deleteUrl = `${supabaseUrl}/rest/v1/invoices?id=eq.${id}`;
    const response = await fetch(deleteUrl, { method: 'DELETE', headers: sbHeaders });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        if (errorBody.code === '23503') {
            return {
                statusCode: 409, // 409 Conflict es más apropiado aquí.
                body: JSON.stringify({ error: 'No se puede eliminar. La factura tiene órdenes o abonos (pagos) asignados.' })
            };
        }
        // Para otros errores, mantenemos el comportamiento anterior.
        throw new Error(`Error eliminando factura: ${JSON.stringify(errorBody)}`);
    }

    return { statusCode: 204, body: '' };
}