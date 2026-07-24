const SUPABASE_URL = () => process.env.SUPABASE_URL;
const SUPABASE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = () => process.env.ADMIN_SECRET;

const sbHeaders = () => ({
    'apikey': SUPABASE_KEY(),
    'Content-Type': 'application/json',
});

function verifyToken(token) {
    if (!token) return false;
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [secret, , expiry] = decoded.split(':');
        return secret === ADMIN_SECRET() && Date.now() <= parseInt(expiry);
    } catch { return false; }
}

exports.handler = async (event) => {
    const method = event.httpMethod;

    if (!SUPABASE_URL() || !SUPABASE_KEY()) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Faltan variables de entorno de Supabase.' }) };
    }

    // --- OBTENER PRODUCTOS (Público) ---
    if (method === 'GET') {
        try {
            const response = await fetch(`${SUPABASE_URL()}/rest/v1/rpc/get_available_products`, {
                method: 'POST',
                headers: sbHeaders(),
                body: JSON.stringify({})
            });

            if (!response.ok) throw new Error(`Supabase error: ${await response.text()}`);
            const rows = await response.json();

            const productos = rows.map(r => ({
                id:       r.id_product,
                img:      r.image_url      || '',
                category: r.category_name  || 'General',
                name:     r.product_name   || 'Sin nombre',
                size:     r.size           || 'N/A',
                price:    r.price          || '0',
                stock:    r.product_status || 'No disponible'
            }));

            return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(productos) };
        } catch (error) {
            return { statusCode: 500, body: JSON.stringify({ error: `GET Error: ${error.message}` }) };
        }
    }

    // --- CREAR PRODUCTO (Admin) ---
    if (method === 'POST') {
        if (!verifyToken(event.headers['x-admin-token'])) {
            return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado.' }) };
        }
        try {
            const body = JSON.parse(event.body);
            const response = await fetch(`${SUPABASE_URL()}/rest/v1/rpc/add_product`, {
                method: 'POST',
                headers: sbHeaders(),
                body: JSON.stringify({
                    p_name: body.name,
                    p_category: body.category,
                    p_size: body.size,
                    p_price: body.price,
                    p_image_url: body.image_url,
                    p_initial_status_id: body.status_id
                })
            });

            if (!response.ok) throw new Error(`Supabase error: ${await response.text()}`);
            const data = await response.json();
            return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
        } catch (error) {
            return { statusCode: 500, body: JSON.stringify({ error: `POST Error: ${error.message}` }) };
        }
    }

    // --- ELIMINAR PRODUCTO (Admin) ---
    if (method === 'DELETE') {
        if (!verifyToken(event.headers['x-admin-token'])) {
            return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado.' }) };
        }
        try {
            const productId = event.queryStringParameters.id;
            if (!productId) return { statusCode: 400, body: JSON.stringify({ message: 'ID de producto no proporcionado.' }) };

            const { imageUrl } = JSON.parse(event.body || '{}');

            const dbResponse = await fetch(`${SUPABASE_URL()}/rest/v1/rpc/delete_product`, {
                method: 'POST',
                headers: sbHeaders(),
                body: JSON.stringify({ p_id: productId })
            });

            if (!dbResponse.ok) throw new Error(`Error al eliminar de la base de datos: ${await dbResponse.text()}`);

            if (imageUrl) {
                try {
                    const urlParts = new URL(imageUrl);
                    const pathParts = urlParts.pathname.split('/');
                    const bucketName = pathParts[5];
                    const filePath = pathParts.slice(6).join('/');
                    if (bucketName && filePath) {
                        await fetch(`${SUPABASE_URL()}/storage/v1/object/${bucketName}/${filePath}`, { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY() } });
                    }
                } catch (storageError) { console.warn(`Registro de BD eliminado, pero falló borrado de archivo: ${storageError.message}`); }
            }
            return { statusCode: 200, body: JSON.stringify({ message: 'Producto eliminado correctamente.' }) };
        } catch (error) {
            return { statusCode: 500, body: JSON.stringify({ error: `DELETE Error: ${error.message}` }) };
        }
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido.' }) };
};
