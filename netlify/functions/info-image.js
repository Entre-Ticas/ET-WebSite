const SUPABASE_URL = () => process.env.SUPABASE_URL;
const SUPABASE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

const sbHeaders = () => ({
    'apikey': SUPABASE_KEY(),
    'Authorization': `Bearer ${SUPABASE_KEY()}`,
    'Content-Type': 'application/json'
});

exports.handler = async (event) => {
    if (!SUPABASE_URL() || !SUPABASE_KEY()) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Faltan variables de entorno.' }) };
    }

    const id = event.queryStringParameters?.id;
    if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Falta el parámetro "id".' }) };
    }

    try {
        const response = await fetch(`${SUPABASE_URL()}/rest/v1/rpc/get_maintenance_by_name_and_active`, {
            method: 'POST',
            headers: sbHeaders(),
            body: JSON.stringify({ search_name: id }) 
        });

        if (!response.ok) throw new Error(`Supabase error: ${response.status}`);

        const dataArray = await response.json();
        // Imprimimos en los logs de Netlify para depurar
        console.log('Respuesta de Supabase:', JSON.stringify(dataArray));

        // Las funciones RPC de Supabase pueden devolver un objeto o un array con un objeto.
        // Esta lógica maneja ambos casos de forma segura.
        const result = Array.isArray(dataArray) ? dataArray[0] : dataArray;

        return { statusCode: 200, body: JSON.stringify({ imageUrl: result?.value1 || null }) };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};