const SUPABASE_URL = () => process.env.SUPABASE_URL;
const SUPABASE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = () => process.env.ADMIN_SECRET;

// Helper para verificar el token de administrador
function verifyToken(token) {
    if (!token || !ADMIN_SECRET()) return false;
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [secret, , expiry] = decoded.split(':');
        return secret === ADMIN_SECRET() && Date.now() <= parseInt(expiry);
    } catch { return false; }
}

exports.handler = async (event) => {
    // Verificar token de administrador
    if (!verifyToken(event.headers['x-admin-token'])) {
        return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado.' }) };
    }
    
    // Verificar variables de entorno
    if (!SUPABASE_URL() || !SUPABASE_KEY()) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Faltan variables de entorno de Supabase.' }) };
    }

    try {
        // Los datos del archivo vienen en las cabeceras
        const fileName = event.headers['x-file-name'];
        const contentType = event.headers['content-type'];

        if (!fileName || !contentType || !event.body) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos del archivo (nombre, tipo o cuerpo).' }) };
        }

        const bucket = 'order-items-images'; // Nombre del bucket en Supabase Storage
        const filePath = `${Date.now()}-${fileName}`;

        // El cuerpo del evento viene codificado en Base64, lo convertimos a un Buffer binario.
        const fileBuffer = Buffer.from(event.body, 'base64');

        // Subimos el buffer directamente a Supabase Storage
        const response = await fetch(`${SUPABASE_URL()}/storage/v1/object/${bucket}/${filePath}`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY(),
                'Content-Type': contentType
            },
            body: fileBuffer
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error de Supabase Storage:', errorText);
            throw new Error(`Error al subir a Supabase: ${errorText}`);
        }

        const publicUrl = `${SUPABASE_URL()}/storage/v1/object/public/${bucket}/${filePath}`;

        return { statusCode: 200, body: JSON.stringify({ imageUrl: publicUrl }) };

    } catch (error) {
        console.error('Error en upload-image:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};