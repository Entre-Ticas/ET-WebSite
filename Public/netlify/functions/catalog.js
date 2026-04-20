exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido.' }) };
    }
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Faltan variables de entorno de Supabase.' }) };
    }

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

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Supabase error ${response.status}: ${err}`);
        }

        const rows = await response.json();

        const productos = rows.map(r => ({
            img:      r.image_url   || '',
            category: r.category    || 'General',
            name:     r.product_name,
            size:     r.size        || 'N/A',
            price:    r.price       || '',
            stock:    r.product_status || 'No disponible'
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productos)
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
