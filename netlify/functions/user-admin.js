const argon2 = require('argon2');

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
    // Importar node-fetch para usar fetch en el entorno de Node.js
    const fetch = (await import('node-fetch')).default;

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido.' }) };
    }

    if (!verifyToken(event.headers['x-admin-token'])) {
        return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado.' }) };
    }

    try {
        const { user, password, name } = JSON.parse(event.body);

        if (!user || !password || !name) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Usuario, contraseña y nombre son requeridos.' }) };
        }

        // Hashear la contraseña antes de guardarla
        const hashedPassword = await argon2.hash(password);

        const response = await fetch(`${SUPABASE_URL()}/rest/v1/users`, {
            method: 'POST',
            headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
            body: JSON.stringify({
                User: user,
                Contraseña: hashedPassword,
                User_Name: name,
                id_status: 1 // Por defecto, usuario activo
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            // Manejar error de usuario duplicado
            if (errorText.includes('duplicate key value')) {
                throw new Error('El nombre de usuario ya existe.');
            }
            throw new Error(`Error de Supabase: ${errorText}`);
        }

        return { statusCode: 201, body: JSON.stringify({ message: 'Usuario creado exitosamente.' }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};