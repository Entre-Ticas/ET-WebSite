exports.handler = async function(event, context) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    // Usamos la SERVICE_ROLE_KEY para operaciones de escritura/administración
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Manejar solicitud GET para obtener todos los productos
    if (event.httpMethod === 'GET') {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_available_products`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });
            if (!response.ok) throw new Error(`Supabase error: ${await response.text()}`);
            const data = await response.json();

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            };
        } catch (error) {
            return { statusCode: 500, body: JSON.stringify({ error: `GET Error: ${error.message}` }) };
        }
    }

    // Manejar solicitud POST para crear un nuevo producto
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body);

            const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/add_product`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
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

            return {
                statusCode: 201, // 201 Created
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            };
        } catch (error) {
            return { statusCode: 500, body: JSON.stringify({ error: `POST Error: ${error.message}` }) };
        }
    }

    return {
        statusCode: 405, // Method Not Allowed
        body: 'Método no permitido'
    };
};