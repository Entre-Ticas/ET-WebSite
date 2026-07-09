exports.handler = async function(event, context) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY; // Usamos la anon key pública para leer datos

    try {
        // Construimos la URL para leer de la tabla 'product_status'
        const url = `${SUPABASE_URL}/rest/v1/product_status?select=id,name&order=id`;

        const response = await fetch(url, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (!response.ok) throw new Error(`Supabase error: ${await response.text()}`);
        const data = await response.json();

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};