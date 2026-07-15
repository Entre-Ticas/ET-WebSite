const SUPABASE_URL = () => process.env.SUPABASE_URL;
const SUPABASE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = () => process.env.ADMIN_SECRET;

const sbHeaders = () => ({
    'apikey': SUPABASE_KEY(),
    'Content-Type': 'application/json',
});

function requireOrderItemsEnv() {
    const missing = [];
    if (!SUPABASE_URL()) missing.push('SUPABASE_URL');
    if (!SUPABASE_KEY()) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!ADMIN_SECRET()) missing.push('ADMIN_SECRET');
    if (missing.length > 0) {
        throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
    }
}

function verifyToken(token) {
    if (!token || !ADMIN_SECRET()) return false;
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [secret, , expiry] = decoded.split(':');
        return secret === ADMIN_SECRET() && Date.now() <= parseInt(expiry);
    } catch { return false; }
}

exports.handler = async (event) => {
    // La verificación de variables de entorno se hace en cada función para claridad.
    try {
        requireOrderItemsEnv();
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    const token = event.headers['x-admin-token'];
    const user = await verifyToken(token);
    if (!user) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: 'Acceso no autorizado.' }),
        };
    }

    switch (event.httpMethod) {
        case 'GET':
            return getOrders(event);
        case 'POST':
            return createOrder(event);
        case 'PUT':
            return updateOrder(event);
        case 'DELETE':
            return deleteOrder(event);
        default:
            return { statusCode: 405, body: 'Método no permitido' };
    }
};

async function getOrders() {
    try {
        const response = await fetch(`${SUPABASE_URL()}/rest/v1/rpc/get_admin_order_items`, {
            method: 'POST',
            headers: sbHeaders()
        });

        if (!response.ok) throw new Error(`Supabase error: ${await response.text()}`);
        const data = await response.json();

        return {
            statusCode: 200,
            body: JSON.stringify(data),
        };
    } catch (error) {
        console.error('Error en getOrders:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'No se pudieron obtener las órdenes.' }),
        };
    }
}

async function createOrder(event) {
    try {
        const payload = JSON.parse(event.body);
        const insertData = {
            client_name: payload.client_name,
            client_phone: payload.client_phone,
            product_name: payload.product_name,
            size: payload.size,
            quantity: payload.quantity,
            price: payload.price,
            image_url: payload.image_url,
            id_status: payload.id_status || 1,
            created_at: new Date().toISOString() // Añadimos la fecha de creación
        };

        const response = await fetch(`${SUPABASE_URL()}/rest/v1/order_items`, {
            method: 'POST',
            headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
            body: JSON.stringify(insertData)
        });

        if (!response.ok) throw new Error(`Supabase error: ${await response.text()}`);
        const [data] = await response.json();
        return { statusCode: 201, body: JSON.stringify(data) };
    } catch (error) {
        console.error('Error en createOrder:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'No se pudo crear la orden.' }) };
    }
}

async function updateOrder(event) {
    try {
        const payload = JSON.parse(event.body);
        if (payload.id === undefined || payload.id === null) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Se requiere un ID para actualizar.' })
            };
        }

        const orderId = Number(payload.id);
        const updateData = {
            client_name: payload.client_name,
            client_phone: payload.client_phone,
            product_name: payload.product_name,
            size: payload.size,
            quantity: payload.quantity,
            price: payload.price,
            image_url: payload.image_url,
            id_status: payload.id_status
        };

        const beforeResponse = await fetch(`${SUPABASE_URL()}/rest/v1/order_items?id=eq.${orderId}&select=*`, {
            method: 'GET',
            headers: sbHeaders()
        });

        if (!beforeResponse.ok) throw new Error(`Supabase error: ${await beforeResponse.text()}`);

        const beforeRows = await beforeResponse.json();
        if (!Array.isArray(beforeRows) || beforeRows.length === 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: `No se encontró la orden con ID ${orderId} para actualizar.` })
            };
        }

        const response = await fetch(`${SUPABASE_URL()}/rest/v1/order_items?id=eq.${orderId}`, {
            method: 'PATCH',
            headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
            body: JSON.stringify(updateData)
        });

        if (!response.ok) throw new Error(`Supabase error: ${await response.text()}`);

        const afterResponse = await fetch(`${SUPABASE_URL()}/rest/v1/order_items?id=eq.${orderId}&select=*`, {
            method: 'GET',
            headers: sbHeaders()
        });

        if (!afterResponse.ok) throw new Error(`Supabase error: ${await afterResponse.text()}`);

        const afterRows = await afterResponse.json();
        const updatedRow = Array.isArray(afterRows) ? afterRows[0] : null;

        if (!updatedRow) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: `No se encontró la orden con ID ${orderId} para actualizar.` })
            };
        }

        const updated =
            String(updatedRow.client_name ?? '') === String(updateData.client_name ?? '') &&
            String(updatedRow.client_phone ?? '') === String(updateData.client_phone ?? '') &&
            String(updatedRow.product_name ?? '') === String(updateData.product_name ?? '') &&
            String(updatedRow.size ?? '') === String(updateData.size ?? '') &&
            Number(updatedRow.quantity) === Number(updateData.quantity) &&
            Number(updatedRow.price) === Number(updateData.price) &&
            String(updatedRow.image_url ?? '') === String(updateData.image_url ?? '') &&
            Number(updatedRow.id_status) === Number(updateData.id_status);

        if (!updated) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: `La orden con ID ${orderId} no se actualizó en la base.` })
            };
        }

        return { statusCode: 200, body: JSON.stringify(updatedRow) };
    } catch (error) {
        console.error('Error en updateOrder:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function deleteOrder(event) {
    const id = event.queryStringParameters?.id;
    if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Se requiere un ID para eliminar.' }) };
    }
    try {
        const response = await fetch(`${SUPABASE_URL()}/rest/v1/order_items?id=eq.${id}`, {
            method: 'DELETE',
            headers: { ...sbHeaders(), 'Prefer': 'return=minimal' }
        });

        if (!response.ok) throw new Error(`Supabase error: ${await response.text()}`);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Orden eliminada correctamente.' }),
        };
    } catch (error) {
        console.error('Error en deleteOrder:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'No se pudo eliminar la orden.' }) };
    }
}