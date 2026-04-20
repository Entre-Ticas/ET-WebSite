exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido.' }) };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ADMIN_SECRET = process.env.ADMIN_SECRET;

    try {
        const { user, password } = JSON.parse(event.body);

        if (!user || !password) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Usuario y contraseña requeridos.' }) };
        }

        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/users?User=eq.${encodeURIComponent(user)}&Contraseña=eq.${encodeURIComponent(password)}&select=id,User,User_Name,id_status`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            }
        );

        const rows = await response.json();

        if (!rows || rows.length === 0) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Credenciales incorrectas.' }) };
        }

        const userData = rows[0];
        const expiry = Date.now() + 8 * 60 * 60 * 1000; // 8 horas
        const token = Buffer.from(`${ADMIN_SECRET}:${userData.id}:${expiry}`).toString('base64');

        return {
            statusCode: 200,
            body: JSON.stringify({
                token,
                expiry,
                user: userData.User,
                name: userData.User_Name
            })
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
