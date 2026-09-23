const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const STATUS_ABIERTA = 1; // Asumimos que el ID del estado 'Abierta' o 'Activa' es 1. ¡Verifícalo en tu tabla `status`!

const sbHeaders = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
};

// Utilidad de verificación de token (consistente con el resto del proyecto)
const ADMIN_SECRET = process.env.ADMIN_SECRET;
function verifyToken(token) {
    if (!token) return false;
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [secret, , expiry] = decoded.split(':');
        return secret === ADMIN_SECRET && Date.now() <= parseInt(expiry);
    } catch (e) {
        console.error('Error de verificación de token:', e.message);
        return false;
    }
}

exports.handler = async (event, context) => {
    const headers = event?.headers || {};
    const token = headers['x-admin-token'] || headers['X-Admin-Token'] || headers['X-ADMIN-TOKEN'];
    const unauthorized = {
        statusCode: 401,
        body: JSON.stringify({ error: 'No autorizado. Se requiere token de administrador.' }),
    };

    if (!token) {
        return unauthorized;
    }

    if (!verifyToken(token)) {
        return unauthorized;
    }

    if (!supabaseUrl || !supabaseKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Falta la configuración de Supabase en Netlify.' })
        };
    }

    try {
        switch (event.httpMethod) {
            case 'GET':
                return await getOrderItems(event);
            case 'POST':
                return await createOrderItem(event);
            case 'PUT':
                return await updateOrderItem(event);
            case 'DELETE':
                return await deleteOrderItem(event);
            default:
                return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
        }
    } catch (error) {
        console.error('Error en la función order-items:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error interno del servidor.', details: error.message }),
        };
    }
};

async function getOrderItems(event) {
    // Por ahora, mantenemos la llamada a la función existente para no romper la vista de admin.
    // En un futuro paso, podríamos mejorar esto.
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_admin_order_items`, {
        method: 'POST',
        headers: sbHeaders
    });

    if (!response.ok) throw new Error(`Error de Supabase: ${await response.text()}`);

    const data = await response.json();
    return { statusCode: 200, body: JSON.stringify(data) };
}

async function createOrderItem(event) {
    if (!event || !event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'No se recibieron datos en el body del request.' })
        };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'El cuerpo del request no es JSON válido.' })
        };
    }

    const { client_phone, client_name, product_name, quantity, price, size, image_url, client_entries, client_id, clientId, IDClient, order_group_id, orderGroupId } = body;
    const resolvedClientId = client_id ?? clientId ?? IDClient ?? null;
    const normalizedClientId = resolvedClientId !== null && resolvedClientId !== '' ? Number(resolvedClientId) : null;
    const resolvedOrderGroupId = order_group_id ?? orderGroupId ?? null;

    const hasBulkEntries = Array.isArray(client_entries) && client_entries.length > 0;

    if (hasBulkEntries) {
        if (!product_name || !price) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Faltan campos obligatorios para carga masiva: product_name, price.' })
            };
        }

        const parsedPrice = Number(price);
        if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'El precio debe ser mayor a cero.' }) };
        }

        const normalizedEntries = [];
        for (let i = 0; i < client_entries.length; i += 1) {
            const entry = client_entries[i] || {};
            const entryName = String(entry.client_name || '').trim();
            const entryPhone = String(entry.client_phone || '').trim();
            const entryQty = parseInt(entry.quantity, 10);

            if (!entryName || !entryPhone) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: `Fila ${i + 1}: client_name y client_phone son obligatorios.` })
                };
            }

            if (!/^\d{4}$/.test(entryPhone)) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: `Fila ${i + 1}: client_phone debe tener 4 dígitos.` })
                };
            }

            normalizedEntries.push({
                client_name: entryName,
                client_phone: entryPhone,
                quantity: Number.isFinite(entryQty) && entryQty > 0 ? entryQty : 1
            });
        }

        const insertedRows = [];
        for (const entry of normalizedEntries) {
            const invoiceId = await findOrCreateOpenInvoice(entry.client_phone, entry.client_name);
            const itemToInsert = {
                client_phone: entry.client_phone,
                client_name: entry.client_name,
                product_name,
                quantity: entry.quantity,
                price: parsedPrice,
                size,
                image_url,
                invoice_id: invoiceId,
                id_status: STATUS_ABIERTA,
                usa_reviewed: false
            };

            const createdItem = await insertOrderItem(itemToInsert);
            insertedRows.push(createdItem);
        }

        return {
            statusCode: 201,
            body: JSON.stringify({
                inserted_count: insertedRows.length,
                items: insertedRows
            })
        };
    }

    if (!client_phone || !client_name || !product_name || !price) { // Mantenemos la validación original
        console.error("Validación fallida: Faltan campos obligatorios.");
        return { statusCode: 400, body: JSON.stringify({ error: 'Faltan campos obligatorios: client_phone, client_name, product_name, price.' }) };
    }

    // --- INICIA LA NUEVA LÓGICA ---

    const invoiceId = await findOrCreateOpenInvoice(client_phone, client_name, normalizedClientId);

    // 3. Insertar el nuevo order_item asignándole el invoiceId.
    const itemToInsert = {
        client_phone: client_phone,
        client_name: client_name,
        product_name: product_name,
        quantity: quantity || 1,
        price: price,
        size: size,
        image_url: image_url,
        client_id: normalizedClientId,
        invoice_id: invoiceId,
        id_status: STATUS_ABIERTA,
        usa_reviewed: false
    };


    const new_item = await insertOrderItem(itemToInsert);
    await markMatchingStoreOrdersAsInvoiced({
        phone: client_phone,
        clientId: normalizedClientId,
        orderGroupId: resolvedOrderGroupId,
    });

    return { statusCode: 201, body: JSON.stringify(new_item) };
}

async function markMatchingStoreOrdersAsInvoiced({ phone = '', clientId = null, orderGroupId = null } = {}) {
    const normalizedPhone = String(phone || '').replace(/\D/g, '');
    const numericClientId = Number.isFinite(Number(clientId)) && Number(clientId) > 0 ? Number(clientId) : null;

    if (!orderGroupId && !normalizedPhone && !numericClientId) {
        return 0;
    }

    try {
        const response = await fetch(`${supabaseUrl}/rest/v1/store_orders?select=*`, { headers: sbHeaders });
        if (!response.ok) {
            const errorText = await response.text();
            console.warn('Fallo al buscar store_orders para marcar is_invoiced:', errorText);
            return 0;
        }

        const orders = await response.json();
        const matches = (orders || []).filter((order) => {
            const rowGroupId = String(order.order_group_id || '');
            const rowPhone = String(order.client_phone || '').replace(/\D/g, '');

            if (orderGroupId) {
                return String(rowGroupId) === String(orderGroupId) || String(order.id) === String(orderGroupId);
            }

            // Solo como fallback último recurso, y sin cruzar a todos los clientes iguales.
            if (normalizedPhone && rowPhone) {
                return rowPhone === normalizedPhone;
            }

            if (numericClientId && order.client_id != null) {
                return Number(order.client_id) === Number(numericClientId);
            }

            return false;
        });

        let updated = 0;
        for (const order of matches) {
            const patchResponse = await fetch(`${supabaseUrl}/rest/v1/store_orders?id=eq.${encodeURIComponent(order.id)}`, {
                method: 'PATCH',
                headers: { ...sbHeaders, 'Prefer': 'return=representation' },
                body: JSON.stringify({ is_invoiced: true })
            });

            if (patchResponse.ok) updated += 1;
        }

        return updated;
    } catch (error) {
        console.error('Error marcando store_orders como facturados:', error.message || error);
        return 0;
    }
}

async function findOrCreateOpenInvoice(clientPhone, clientName, clientId = null) {
    const normalizedPhone = String(clientPhone || '').trim();
    const normalizedName = String(clientName || '').trim();
    const numericClientId = Number.isFinite(Number(clientId)) && Number(clientId) > 0 ? Number(clientId) : null;

    const buildInvoiceQuery = ({ includeStatus, includePaid }) => {
        const url = new URL(`${supabaseUrl}/rest/v1/invoices`);
        url.searchParams.set('select', 'id,client_phone,client_name,client_id');
        if (normalizedPhone) url.searchParams.set('client_phone', `eq.${normalizedPhone}`);
        if (normalizedName) url.searchParams.set('client_name', `eq.${normalizedName}`);
        if (numericClientId) url.searchParams.set('client_id', `eq.${numericClientId}`);
        if (includeStatus) url.searchParams.set('id_status', `eq.${STATUS_ABIERTA}`);
        if (includePaid) url.searchParams.set('paid', 'eq.false');
        url.searchParams.set('order', 'created_at.desc,id.desc');
        url.searchParams.set('limit', '1');
        return url.toString();
    };

    const candidateQueries = [
        buildInvoiceQuery({ includeStatus: true, includePaid: true }),
        buildInvoiceQuery({ includeStatus: false, includePaid: false }),
    ];

    for (const queryUrl of candidateQueries) {
        try {
            const findResponse = await fetch(queryUrl, { headers: sbHeaders });
            const findResponseText = await findResponse.text();
            if (!findResponse.ok) {
                console.warn('Fallo buscando factura:', findResponseText);
                continue;
            }
            const openInvoices = JSON.parse(findResponseText || '[]');
            const openInvoice = Array.isArray(openInvoices) ? openInvoices[0] : null;
            if (openInvoice) return openInvoice.id;
        } catch (_error) {
            continue;
        }
    }

    const createInvoiceUrl = `${supabaseUrl}/rest/v1/invoices`;
    const createPayload = {
        client_phone: normalizedPhone,
        client_name: normalizedName,
        paid: false,
        client_id: numericClientId
    };

    if (Number.isInteger(STATUS_ABIERTA)) {
        createPayload.id_status = STATUS_ABIERTA;
    }

    const createResponse = await fetch(createInvoiceUrl, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify(createPayload)
    });

    if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('Error al crear la factura.', errorText);
        throw new Error(`Error creando factura: ${errorText}`);
    }

    const newInvoice = await createResponse.json();
    return newInvoice[0]?.id ?? newInvoice?.id;
}

async function insertOrderItem(itemToInsert) {
    const createItemUrl = `${supabaseUrl}/rest/v1/order_items`;
    const payload = { ...itemToInsert };
    const itemResponse = await fetch(createItemUrl, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify(payload)
    });

    if (!itemResponse.ok) {
        const errorText = await itemResponse.text();
        console.error('Error al insertar order_item.', errorText);

        const normalizedErrorText = String(errorText || '').toLowerCase();
        const missingInvoiceColumn = normalizedErrorText.includes('invoice_id') || normalizedErrorText.includes('column "invoice_id"') || normalizedErrorText.includes('does not exist');
        const missingClientColumn = normalizedErrorText.includes('client_id') || normalizedErrorText.includes('column "client_id"') || normalizedErrorText.includes('idclient') || normalizedErrorText.includes('column "idclient"');

        if (missingInvoiceColumn || missingClientColumn) {
            throw new Error(
                'Falta enlazar la fila porque la tabla order_items no tiene las columnas necesarias: invoice_id y/o client_id. Ejecuta la migración SQL en Supabase antes de volver a facturar.'
            );
        }

        throw new Error(`Error insertando item: ${errorText}`);
    }

    const [newItem] = await itemResponse.json();
    return newItem;
}

async function updateOrderItem(event) {
    const body = JSON.parse(event.body);
    const { id, ...updateData } = body;

    if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Se requiere el ID del item para actualizar.' }) };
    }

    // --- INICIO: Validación de Llave Foránea ---
    // Si se está intentando asignar una factura, verificamos que exista primero.
    if (updateData.invoice_id) {
        const checkInvoiceUrl = `${supabaseUrl}/rest/v1/invoices?id=eq.${updateData.invoice_id}&select=id&limit=1`;
        const checkResponse = await fetch(checkInvoiceUrl, { headers: sbHeaders });
        
        if (!checkResponse.ok) throw new Error(`Error verificando factura: ${await checkResponse.text()}`);

        const existingInvoice = await checkResponse.json();
        if (!existingInvoice || existingInvoice.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: `La factura con ID ${updateData.invoice_id} no existe.` }) };
        }
    }
    // --- FIN: Validación ---

    const updateUrl = `${supabaseUrl}/rest/v1/order_items?id=eq.${id}`;
    const response = await fetch(updateUrl, {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify(updateData)
    });

    if (!response.ok) throw new Error(`Error actualizando item: ${await response.text()}`);

    const [data] = await response.json();
    return { statusCode: 200, body: JSON.stringify(data) };
}

async function deleteOrderItem(event) {
    const id = event.queryStringParameters.id;

    if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Se requiere el parámetro "id" para eliminar.' }) };
    }

    const deleteUrl = `${supabaseUrl}/rest/v1/order_items?id=eq.${id}`;
    const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: sbHeaders
    });

    if (!response.ok) throw new Error(`Error eliminando item: ${await response.text()}`);
    return { statusCode: 204, body: '' }; // 204 No Content
}