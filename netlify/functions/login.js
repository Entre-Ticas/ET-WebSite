const argon2 = require('argon2');

exports.handler = async (event) => {
    // Importar node-fetch para usar fetch en el entorno de Node.js
    const fetch = (await import('node-fetch')).default;

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

        // 1. Buscamos al usuario por su nombre para obtener el hash de la contraseña guardada.
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/users?User=eq.${encodeURIComponent(user)}&select=id,User,User_Name,Contraseña`,
            {
                headers: {
                    'apikey': SUPABASE_KEY
                }
            }
        );

        const payload = await response.json();

        if (!response.ok) {
            const details = typeof payload === 'string' ? payload : JSON.stringify(payload);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `No se pudo consultar la tabla users. ${details}` })
            };
        }

        if (!Array.isArray(payload) || payload.length === 0) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Credenciales incorrectas.' }) };
        }

        const userData = payload[0];
        const hashedPasswordFromDB = userData?.Contraseña;

        if (!hashedPasswordFromDB) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'La columna Contraseña no existe o no tiene valor en users.' })
            };
        }

        // 2. Usamos argon2 para verificar si la contraseña ingresada coincide con el hash.
        if (await argon2.verify(hashedPasswordFromDB, password)) {
            // ¡Contraseña correcta! Generamos el token de sesión.
            const expiry = Date.now() + 20 * 60 * 1000; // TEMP TEST: 20 minutos
            const token = Buffer.from(`${ADMIN_SECRET}:${userData.id}:${expiry}`).toString('base64');

            return {
                statusCode: 200,
                body: JSON.stringify({ token, expiry, user: userData.User, name: userData.User_Name })
            };
        } else {
            // Contraseña incorrecta.
            return { statusCode: 401, body: JSON.stringify({ error: 'Credenciales incorrectas.' }) };
        }
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
