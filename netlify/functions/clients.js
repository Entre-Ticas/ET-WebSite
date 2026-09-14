const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

const sbHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
};

function verifyToken(token) {
    if (!token) return false;
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [secret, , expiry] = decoded.split(':');
        return secret === ADMIN_SECRET && Date.now() <= parseInt(expiry, 10);
    } catch (error) {
        return false;
    }
}

function normalizePhoneDigits(value) {
    return String(value ?? '').replace(/\D/g, '');
}

function sanitizeClientPayload(body = {}) {
    const name = String(body.name ?? '').trim();
    const phone = String(body.phone ?? '').trim();
    const phoneDigits = normalizePhoneDigits(phone);
    const statusId = Number(body.status_id ?? 1);
    const isBlacklisted = Boolean(body.is_blacklisted ?? false);

    return {
        name,
        phone,
        phoneDigits,
        phone_last4: phoneDigits.slice(-4),
        status_id: Number.isFinite(statusId) && statusId > 0 ? statusId : 1,
        is_blacklisted: isBlacklisted,
    };
}

exports.handler = async (event) => {
    const token = event.headers['x-admin-token'];
    if (!verifyToken(token)) {
        return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado.' }) };
    }

    try {
        switch (event.httpMethod) {
            case 'GET':
                return await getClients(event);
            case 'POST':
                return await createClient(event);
            case 'PUT':
                return await updateClient(event);
            case 'DELETE':
                return await deleteClient(event);
            default:
                return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
        }
    } catch (error) {
        console.error('Error en la función clients:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error interno del servidor.', details: error.message })
        };
    }
};

async function getClientStatuses() {
    const statusRes = await fetch(`${supabaseUrl}/rest/v1/status?select=id_status,status_name,disabled&order=id_status.asc`, { headers: sbHeaders });
    if (!statusRes.ok) {
        throw new Error(`Error cargando estados: ${await statusRes.text()}`);
    }

    const statuses = await statusRes.json();
    const filteredStatuses = (Array.isArray(statuses) ? statuses : [])
        .filter((status) => status && Number(status.id_status) > 0)
        .map((status) => ({
            id: Number(status.id_status),
            name: status.status_name || `Estado ${status.id_status}`,
            disabled: Boolean(status.disabled)
        }));

    return { statusCode: 200, body: JSON.stringify(filteredStatuses) };
}

async function getClients(event) {
    const includeStatuses = event.queryStringParameters?.include_statuses === '1' || event.queryStringParameters?.statuses === '1';
    if (includeStatuses) {
        return getClientStatuses();
    }

    const clientId = event.queryStringParameters?.id;
    const select = 'id,name,phone,phone_last4,status_id,is_blacklisted,created_at';
    const baseUrl = `${supabaseUrl}/rest/v1/clients?select=${encodeURIComponent(select)}&order=id.asc`;
    const url = clientId ? `${baseUrl}&id=eq.${clientId}` : baseUrl;

    const res = await fetch(url, { headers: sbHeaders });
    if (!res.ok) {
        throw new Error(`Error cargando clientes: ${await res.text()}`);
    }

    const clients = await res.json();
    const statusRes = await fetch(`${supabaseUrl}/rest/v1/status?select=id_status,status_name`, { headers: sbHeaders });
    const statuses = statusRes.ok ? await statusRes.json() : [];
    const statusMap = Object.fromEntries((statuses || []).map((status) => [Number(status.id_status), status.status_name || '']))

    const enrichedClients = (Array.isArray(clients) ? clients : []).map((client) => ({
        ...client,
        status_name: statusMap[Number(client.status_id)] || null
    }));

    return { statusCode: 200, body: JSON.stringify(enrichedClients) };
}

async function createClient(event) {
    const body = JSON.parse(event.body || '{}');
    const payload = sanitizeClientPayload(body);

    if (!payload.name || !payload.phone) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Nombre y teléfono son requeridos.' }) };
    }

    const clientData = {
        name: payload.name,
        phone: payload.phone,
        phone_last4: payload.phone_last4,
        status_id: payload.status_id,
        is_blacklisted: payload.is_blacklisted,
        created_at: body.created_at || new Date().toISOString(),
    };

    const res = await fetch(`${supabaseUrl}/rest/v1/clients`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(clientData)
    });

    if (!res.ok) {
        throw new Error(`Error creando cliente: ${await res.text()}`);
    }

    const [client] = await res.json();
    return { statusCode: 201, body: JSON.stringify(client || clientData) };
}

async function updateClient(event) {
    const body = JSON.parse(event.body || '{}');
    const clientId = Number(body.id);
    if (!Number.isFinite(clientId) || clientId <= 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Se requiere el id del cliente para actualizar.' }) };
    }

    const updateData = {};
    if (body.name !== undefined) {
        const name = String(body.name ?? '').trim();
        if (!name) {
            return { statusCode: 400, body: JSON.stringify({ error: 'El nombre no puede quedar vacío.' }) };
        }
        updateData.name = name;
    }

    if (body.phone !== undefined) {
        const phone = String(body.phone ?? '').trim();
        if (!phone) {
            return { statusCode: 400, body: JSON.stringify({ error: 'El teléfono no puede quedar vacío.' }) };
        }
        const digits = normalizePhoneDigits(phone);
        updateData.phone = phone;
        updateData.phone_last4 = digits.slice(-4);
    }

    if (body.status_id !== undefined) {
        const statusId = Number(body.status_id);
        updateData.status_id = Number.isFinite(statusId) && statusId > 0 ? statusId : 1;
    }

    if (body.is_blacklisted !== undefined) {
        updateData.is_blacklisted = Boolean(body.is_blacklisted);
    }

    if (!Object.keys(updateData).length) {
        return { statusCode: 400, body: JSON.stringify({ error: 'No hay campos para actualizar.' }) };
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/clients?id=eq.${clientId}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(updateData)
    });

    if (!res.ok) {
        throw new Error(`Error actualizando cliente: ${await res.text()}`);
    }

    const [client] = await res.json();
    return { statusCode: 200, body: JSON.stringify(client || { id: clientId, ...updateData }) };
}

async function deleteClient(event) {
    const clientId = Number(event.queryStringParameters?.id);
    if (!Number.isFinite(clientId) || clientId <= 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Se requiere el parámetro id para eliminar.' }) };
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/clients?id=eq.${clientId}`, {
        method: 'DELETE',
        headers: sbHeaders
    });

    if (!res.ok) {
        throw new Error(`Error eliminando cliente: ${await res.text()}`);
    }

    return { statusCode: 204, body: '' };
}
