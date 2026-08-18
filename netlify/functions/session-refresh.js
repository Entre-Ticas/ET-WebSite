exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido.' }) };
    }

    const ADMIN_SECRET = process.env.ADMIN_SECRET;
    const currentToken = event.headers['x-admin-token'];

    if (!ADMIN_SECRET || !currentToken) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Sesión inválida o expirada.' }) };
    }

    try {
        const decoded = Buffer.from(currentToken, 'base64').toString('utf8');
        const [secret, userId, expiry] = decoded.split(':');
        const parsedExpiry = parseInt(expiry || '0', 10);

        if (!secret || !userId || !parsedExpiry) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Sesión inválida o expirada.' }) };
        }

        if (secret !== ADMIN_SECRET || Date.now() > parsedExpiry) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Sesión inválida o expirada.' }) };
        }

        const newExpiry = Date.now() + (20 * 60 * 1000); // TEMP TEST: 20 minutos deslizante
        const newToken = Buffer.from(`${ADMIN_SECRET}:${userId}:${newExpiry}`).toString('base64');

        return {
            statusCode: 200,
            body: JSON.stringify({ token: newToken, expiry: newExpiry })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'No se pudo refrescar la sesión.', details: error.message })
        };
    }
};
