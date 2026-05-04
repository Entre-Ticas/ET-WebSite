exports.handler = async (event) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // GET → devuelve lista de estados
    if (event.httpMethod === 'GET') {
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            return { statusCode: 500, body: JSON.stringify({ error: 'Faltan variables de entorno.' }) };
        }
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/status_tracking?select=id_status_tracking,status_name&order=id_status_tracking.asc`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });
            if (!res.ok) throw new Error(`Supabase ${res.status}`);
            const data = await res.json();
            return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
        } catch (error) {
            return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        }
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido.' }) };
    }

    const ADMIN_SECRET = process.env.ADMIN_SECRET;

    // Verificar token
    const token = event.headers['x-admin-token'];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado.' }) };
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [secret, , expiry] = decoded.split(':');
        if (secret !== ADMIN_SECRET || Date.now() > parseInt(expiry)) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Sesión inválida o expirada.' }) };
        }
    } catch {
        return { statusCode: 401, body: JSON.stringify({ error: 'Token inválido.' }) };
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Faltan variables de entorno.' }) };
    }

    try {
        const { id_tracking, id_status_tracking, detalle, fecha_hora } = JSON.parse(event.body);

        if (!id_tracking || !id_status_tracking) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Faltan campos requeridos.' }) };
        }

        const response = await fetch(`${SUPABASE_URL}/rest/v1/tracking_historial`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                id_tracking,
                id_status_tracking,
                detalle: detalle || null,
                fecha_hora: fecha_hora || new Date().toISOString()
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Supabase error ${response.status}: ${err}`);
        }

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (error) {
        console.error('Error en add-tracking-status:', error.message);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
