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
        // --- Obtener una factura específica con sus items y abonos ---
        const [invoiceRes, itemsRes, paymentsRes] = await Promise.all([
            fetch(`${supabaseUrl}/rest/v1/invoices?id=eq.${invoiceId}&select=*`, { headers: sbHeaders }),
            fetch(`${supabaseUrl}/rest/v1/order_items?invoice_id=eq.${invoiceId}&select=*`, { headers: sbHeaders }),
            fetch(`${supabaseUrl}/rest/v1/payments?invoice_id=eq.${invoiceId}&select=*`, { headers: sbHeaders })
        ]);

        if (!invoiceRes.ok) throw new Error('Error obteniendo la factura.');
        const invoices = await invoiceRes.json();
        if (invoices.length === 0) return { statusCode: 404, body: JSON.stringify({ error: 'Factura no encontrada' }) };

        const items = await itemsRes.json();
        const payments = await paymentsRes.json();

        return { statusCode: 200, body: JSON.stringify({ invoice: invoices[0], items, payments }) };

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

    if (!response.ok) throw new Error(`Error eliminando factura: ${await response.text()}`);
    return { statusCode: 204, body: '' };
}