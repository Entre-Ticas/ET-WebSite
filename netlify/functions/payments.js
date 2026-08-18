const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sbHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
};

const ADMIN_SECRET = process.env.ADMIN_SECRET;
function verifyToken(token) {
    if (!token) return false;
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [secret, , expiry] = decoded.split(':');
        return secret === ADMIN_SECRET && Date.now() <= parseInt(expiry, 10);
    } catch (e) {
        return false;
    }
}

exports.handler = async (event) => {
    const token = event.headers['x-admin-token'];
    if (!verifyToken(token)) {
        return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado.' }) };
    }

    try {
        switch (event.httpMethod) {
            case 'GET':
                return await getPayments(event);
            case 'POST':
                return await createPayment(event);
            case 'PUT':
                return await updatePayment(event);
            case 'DELETE':
                return await deletePayment(event);
            default:
                return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
        }
    } catch (error) {
        console.error('Error en la función payments:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error interno del servidor.', details: error.message })
        };
    }
};

async function getPayments(event) {
    const paymentId = event.queryStringParameters?.id;

    const select = 'id,invoice_id,amount,payment_method,reference_code,notes,payment_date,created_at,bank_reviewed';
    const baseUrl = `${supabaseUrl}/rest/v1/payments?select=${encodeURIComponent(select)}&order=payment_date.desc`;
    const url = paymentId ? `${baseUrl}&id=eq.${paymentId}` : baseUrl;

    const paymentsRes = await fetch(url, { headers: sbHeaders });
    if (!paymentsRes.ok) throw new Error(`Error cargando pagos: ${await paymentsRes.text()}`);

    const payments = await paymentsRes.json();
    if (!payments.length) {
        return { statusCode: 200, body: JSON.stringify([]) };
    }

    const invoiceIds = [...new Set(payments.map(p => Number(p.invoice_id)).filter(Number.isFinite))];
    let invoicesMap = new Map();

    if (invoiceIds.length) {
        const inClause = invoiceIds.join(',');
        const invoicesUrl = `${supabaseUrl}/rest/v1/invoices?id=in.(${inClause})&select=id,client_name,client_phone,id_status,paid`;
        const invoicesRes = await fetch(invoicesUrl, { headers: sbHeaders });
        if (!invoicesRes.ok) throw new Error(`Error cargando facturas de pagos: ${await invoicesRes.text()}`);

        const invoices = await invoicesRes.json();
        invoicesMap = new Map(invoices.map(inv => [Number(inv.id), inv]));
    }

    const enriched = payments.map(payment => {
        const invoice = invoicesMap.get(Number(payment.invoice_id)) || {};
        return {
            ...payment,
            client_name: invoice.client_name || null,
            client_phone: invoice.client_phone || null,
            invoice_status_id: invoice.id_status || null,
            invoice_paid: typeof invoice.paid === 'boolean' ? invoice.paid : null,
            bank_reviewed: typeof payment.bank_reviewed === 'boolean' ? payment.bank_reviewed : false
        };
    });

    return { statusCode: 200, body: JSON.stringify(enriched) };
}

async function createPayment(event) {
    const body = JSON.parse(event.body || '{}');

    const invoiceId = Number(body.invoice_id);
    const amount = Number(body.amount);

    if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Se requiere invoice_id válido.' }) };
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'El monto debe ser mayor a 0.' }) };
    }

    const invoiceExistsRes = await fetch(`${supabaseUrl}/rest/v1/invoices?id=eq.${invoiceId}&select=id&limit=1`, {
        headers: sbHeaders
    });
    if (!invoiceExistsRes.ok) throw new Error(`Error validando factura: ${await invoiceExistsRes.text()}`);

    const existing = await invoiceExistsRes.json();
    if (!existing.length) {
        return { statusCode: 404, body: JSON.stringify({ error: `La factura ${invoiceId} no existe.` }) };
    }

    const payload = {
        invoice_id: invoiceId,
        amount,
        payment_method: body.payment_method ? String(body.payment_method).trim() : null,
        reference_code: body.reference_code ? String(body.reference_code).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
        payment_date: body.payment_date || new Date().toISOString(),
        bank_reviewed: typeof body.bank_reviewed === 'boolean' ? body.bank_reviewed : false
    };

    const res = await fetch(`${supabaseUrl}/rest/v1/payments`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Error creando pago: ${await res.text()}`);

    const [payment] = await res.json();
    return { statusCode: 201, body: JSON.stringify(payment) };
}

async function updatePayment(event) {
    const body = JSON.parse(event.body || '{}');
    const { id, ...updateData } = body;

    const paymentId = Number(id);
    if (!Number.isFinite(paymentId) || paymentId <= 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Se requiere el id del pago para actualizar.' }) };
    }

    if (updateData.invoice_id !== undefined) {
        const invoiceId = Number(updateData.invoice_id);
        if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'invoice_id inválido.' }) };
        }

        const invoiceExistsRes = await fetch(`${supabaseUrl}/rest/v1/invoices?id=eq.${invoiceId}&select=id&limit=1`, {
            headers: sbHeaders
        });
        if (!invoiceExistsRes.ok) throw new Error(`Error validando factura: ${await invoiceExistsRes.text()}`);

        const existing = await invoiceExistsRes.json();
        if (!existing.length) {
            return { statusCode: 404, body: JSON.stringify({ error: `La factura ${invoiceId} no existe.` }) };
        }

        updateData.invoice_id = invoiceId;
    }

    if (updateData.amount !== undefined) {
        const amount = Number(updateData.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'El monto debe ser mayor a 0.' }) };
        }
        updateData.amount = amount;
    }

    if (updateData.payment_method !== undefined) {
        updateData.payment_method = updateData.payment_method ? String(updateData.payment_method).trim() : null;
    }
    if (updateData.reference_code !== undefined) {
        updateData.reference_code = updateData.reference_code ? String(updateData.reference_code).trim() : null;
    }
    if (updateData.notes !== undefined) {
        updateData.notes = updateData.notes ? String(updateData.notes).trim() : null;
    }
    if (updateData.bank_reviewed !== undefined) {
        updateData.bank_reviewed = Boolean(updateData.bank_reviewed);
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/payments?id=eq.${paymentId}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(updateData)
    });

    if (!res.ok) throw new Error(`Error actualizando pago: ${await res.text()}`);

    const [payment] = await res.json();
    return { statusCode: 200, body: JSON.stringify(payment) };
}

async function deletePayment(event) {
    const paymentId = Number(event.queryStringParameters?.id);
    if (!Number.isFinite(paymentId) || paymentId <= 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Se requiere el parámetro id para eliminar.' }) };
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/payments?id=eq.${paymentId}`, {
        method: 'DELETE',
        headers: sbHeaders
    });

    if (!res.ok) throw new Error(`Error eliminando pago: ${await res.text()}`);

    return { statusCode: 204, body: '' };
}
