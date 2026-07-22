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
    const token = event.headers['x-admin-token'];
    const unauthorized = {
        statusCode: 401,
        body: JSON.stringify({ error: 'No autorizado. Se requiere token de administrador.' }),
    };

    if (!verifyToken(token)) {
        return unauthorized;
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
    const body = JSON.parse(event.body);

    const { client_phone, client_name, product_name, quantity, price, size, image_url } = body;

    if (!client_phone || !client_name || !product_name || !price) { // Mantenemos la validación original
        console.error("Validación fallida: Faltan campos obligatorios.");
        return { statusCode: 400, body: JSON.stringify({ error: 'Faltan campos obligatorios: client_phone, client_name, product_name, price.' }) };
    }

    // --- INICIA LA NUEVA LÓGICA ---

    // 1. Buscar una factura "abierta" para ese cliente.
    const findInvoiceUrl = `${supabaseUrl}/rest/v1/invoices?select=id&client_phone=eq.${client_phone}&id_status=eq.${STATUS_ABIERTA}&limit=1`;
    const findResponse = await fetch(findInvoiceUrl, { headers: sbHeaders });

    if (!findResponse.ok) throw new Error(`Error buscando factura: ${await findResponse.text()}`);

    const open_invoices = await findResponse.json();
    const open_invoice = open_invoices[0] || null;

    let invoiceId;

    // 2. Decidir si crear una nueva factura o usar la existente.
    if (open_invoice) {
        invoiceId = open_invoice.id;
    } else {
        const createInvoiceUrl = `${supabaseUrl}/rest/v1/invoices`;
        const createResponse = await fetch(createInvoiceUrl, {
            method: 'POST',
            headers: { ...sbHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify({
                client_phone: client_phone,
                client_name: client_name,
                id_status: STATUS_ABIERTA,
                paid: false
            })
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            console.error("¡ERROR FATAL al crear la factura! Abortando.", errorText);
            throw new Error(`Error creando factura: ${errorText}`);
        }

        const [new_invoice] = await createResponse.json();
        invoiceId = new_invoice.id;
    }

    // 3. Insertar el nuevo order_item asignándole el invoiceId.
    const itemToInsert = {
        client_phone: client_phone, // Enviando el teléfono del cliente
        client_name: client_name,   // Enviando el nombre del cliente
        product_name: product_name,
        quantity: quantity || 1,
        price: price,
        size: size,
        image_url: image_url,
        invoice_id: invoiceId, // ¡Aquí se asigna la factura!
        id_status: STATUS_ABIERTA, // El item también nace 'Activo'
        usa_reviewed: false
    };


    const createItemUrl = `${supabaseUrl}/rest/v1/order_items`;
    const itemResponse = await fetch(createItemUrl, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify(itemToInsert)
    });

    if (!itemResponse.ok) {
        const errorText = await itemResponse.text();
        console.error("¡ERROR FATAL al insertar el order_item! Abortando.", errorText);
        throw new Error(`Error insertando item: ${errorText}`);
    }

    const [new_item] = await itemResponse.json();

    return { statusCode: 201, body: JSON.stringify(new_item) };
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