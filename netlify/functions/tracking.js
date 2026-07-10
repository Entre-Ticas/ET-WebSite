const SUPABASE_URL    = () => process.env.SUPABASE_URL;
const SUPABASE_KEY    = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET    = () => process.env.ADMIN_SECRET;

const sbHeaders = () => ({
    'apikey':        SUPABASE_KEY(),
    'Authorization': `Bearer ${SUPABASE_KEY()}`,
    'Content-Type':  'application/json'
});

function verifyToken(token) {
    if (!token) return false;
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [secret, , expiry] = decoded.split(':');
        return secret === ADMIN_SECRET() && Date.now() <= parseInt(expiry);
    } catch { return false; }
}

function missingEnv() {
    return !SUPABASE_URL() || !SUPABASE_KEY();
}

// GET /.netlify/functions/tracking?num=XXX  → tracking individual
// GET /.netlify/functions/tracking           → todos los trackings (requiere token)
// POST /.netlify/functions/tracking          → crear nuevo tracking (requiere token)
exports.handler = async (event) => {
    if (missingEnv()) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Faltan variables de entorno.' }) };
    }

    const method = event.httpMethod;
    const num    = event.queryStringParameters?.num;

    // ── GET individual ──────────────────────────────────────────────────────
    if (method === 'GET' && num) {
        const body = JSON.stringify({ p_numero_guia: num.trim() });
        try {
            const [resInfo, resHistorial] = await Promise.all([
                fetch(`${SUPABASE_URL()}/rest/v1/rpc/get_tracking_by_guia`,           { method: 'POST', headers: sbHeaders(), body }),
                fetch(`${SUPABASE_URL()}/rest/v1/rpc/get_tracking_historial_by_guia`, { method: 'POST', headers: sbHeaders(), body })
            ]);

            if (!resInfo.ok) throw new Error(`Supabase ${resInfo.status}: ${await resInfo.text()}`);
            if (!resHistorial.ok) throw new Error(`Supabase ${resHistorial.status}: ${await resHistorial.text()}`);

            const [infoRows, historial] = await Promise.all([resInfo.json(), resHistorial.json()]);
            if (!infoRows || infoRows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ error: 'No encontrado' }) };
            }

            const info = infoRows[0];
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    info: {
                        id_tracking:         info.id_tracking,
                        cliente:             info.cliente,
                        producto:            info.producto,
                        nombre_tienda:       info.nombre_tienda,
                        fecha_compra:        info.fecha_compra,
                        fecha_entrega_miami: info.fecha_entrega_miami,
                        tracking_status:     info.tracking_status
                    },
                    historial: historial || []
                })
            };
        } catch (error) {
            return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        }
    }

    // ── GET todos (admin) ───────────────────────────────────────────────────
    if (method === 'GET') {
        if (!verifyToken(event.headers['x-admin-token'])) {
            return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado.' }) };
        }
        try {
            const response = await fetch(`${SUPABASE_URL()}/rest/v1/rpc/get_all_trackings`, {
                method:  'POST',
                headers: sbHeaders()
            });
            if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
            const rows = await response.json();
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rows)
            };
        } catch (error) {
            return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        }
    }

    // ── PUT actualizar tracking (admin) ───────────────────────────────────────
    if (method === 'PUT') {
        if (!verifyToken(event.headers['x-admin-token'])) {
            return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado.' }) };
        }
        try {
            const {
                id_tracking,
                cliente, producto,
                codigo_seguimiento_externo, codigo_seguimiento_interno,
                fecha_compra, fecha_entrega_miami
            } = JSON.parse(event.body);

            if (!id_tracking || !cliente || !producto || !fecha_compra) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Faltan campos requeridos para la actualización.' }) };
            }

            const updatePayload = {
                cliente,
                producto,
                codigo_seguimiento_externo: codigo_seguimiento_externo || null,
                codigo_seguimiento_interno: codigo_seguimiento_interno || null,
                fecha_compra:               fecha_compra               || null,
                fecha_entrega_miami:        fecha_entrega_miami        || null
            };

            const response = await fetch(`${SUPABASE_URL()}/rest/v1/tracking?id_tracking=eq.${id_tracking}`, {
                method:  'PATCH', // Usamos PATCH para actualizaciones parciales
                headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
                body: JSON.stringify(updatePayload)
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Supabase error ${response.status}: ${err}`);
            }

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, message: 'Tracking actualizado correctamente.' })
            };

        } catch (error) {
            console.error('Error en update-tracking:', error.message);
            return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        }
    }

    // ── POST crear nuevo tracking (admin) ───────────────────────────────────
    if (method === 'POST') {
        if (!verifyToken(event.headers['x-admin-token'])) {
            return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado.' }) };
        }
        try {
            const {
                cliente, producto,
                codigo_seguimiento_externo, codigo_seguimiento_interno,
                fecha_compra, fecha_entrega_miami, id_status_tracking
            } = JSON.parse(event.body);

            if (!cliente || !producto || !id_status_tracking) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Faltan campos requeridos.' }) };
            }

            const resTracking = await fetch(`${SUPABASE_URL()}/rest/v1/tracking`, {
                method:  'POST',
                headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
                body: JSON.stringify({
                    cliente, producto,
                    codigo_seguimiento_externo: codigo_seguimiento_externo || null,
                    codigo_seguimiento_interno: codigo_seguimiento_interno || null,
                    fecha_compra:               fecha_compra               || null,
                    fecha_entrega_miami:        fecha_entrega_miami        || null
                })
            });
            if (!resTracking.ok) throw new Error(`Supabase ${resTracking.status}: ${await resTracking.text()}`);
            const [nuevoTracking] = await resTracking.json();

            const resStatus = await fetch(`${SUPABASE_URL()}/rest/v1/tracking_historial`, {
                method:  'POST',
                headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
                body: JSON.stringify({
                    id_tracking:        nuevoTracking.id_tracking,
                    id_status_tracking,
                    detalle:            null,
                    fecha_hora:         new Date().toISOString()
                })
            });
            if (!resStatus.ok) throw new Error(`Supabase ${resStatus.status}: ${await resStatus.text()}`);

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nuevoTracking)
            };
        } catch (error) {
            return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        }
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido.' }) };
};
