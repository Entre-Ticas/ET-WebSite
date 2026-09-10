const fetch = (...args) => import('node-fetch').then(({ default: nodeFetch }) => nodeFetch(...args));
const { randomUUID } = require('crypto');

function verifyToken(token) {
  if (!token || !process.env.ADMIN_SECRET) return false;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [secret, , expiry] = decoded.split(':');
    return secret === process.env.ADMIN_SECRET && Date.now() <= parseInt(expiry, 10);
  } catch {
    return false;
  }
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

async function supabaseRequest(path, options = {}) {
  const baseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !serviceKey) {
    throw new Error('Faltan variables de entorno de Supabase.');
  }

  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Supabase error: ${response.status}`);
  }

  return text ? JSON.parse(text) : null;
}

function buildPublicToken() {
  return randomUUID();
}

function resolveStoreStatus(store = {}) {
  if (!store || typeof store !== 'object') return 'draft';

  if (typeof store.status === 'string' && store.status.trim()) {
    return store.status.toLowerCase();
  }

  const storeStatusId = Number(store.store_status_id ?? store.storeStatusId ?? 0);
  const genericStatusId = Number(store.id_status ?? store.idStatus ?? 0);
  const expiresAt = store.expires_at ? new Date(store.expires_at).getTime() : null;

  if (storeStatusId === 3 || genericStatusId === 2) return 'expired';
  if (expiresAt && Date.now() > expiresAt) return 'expired';
  if (storeStatusId === 2) return 'active';

  if (store.activated_at || (expiresAt && expiresAt > Date.now())) return 'active';
  if (storeStatusId === 1 || genericStatusId === 1) return 'draft';

  return 'draft';
}

function getStatusPayload(status = 'draft') {
  const normalized = String(status).toLowerCase();

  if (normalized === 'active') {
    return {
      id_status: 1,
      store_status_id: 2,
    };
  }

  if (normalized === 'expired') {
    return {
      id_status: 2,
      store_status_id: 3,
    };
  }

  return {
    id_status: 1,
    store_status_id: 1,
  };
}

function normalizeStore(store = {}) {
  if (!store || typeof store !== 'object') {
    return {
      id_store: null,
      nombre_tienda: 'Tienda',
      status: 'draft',
      public_token: '',
      created_at: new Date().toISOString(),
      activated_at: null,
      expires_at: null,
      store_status_id: null,
    };
  }

  const genericStatusId = Number(store.id_status ?? store.idStatus ?? 0);
  const fallbackStoreStatusId = genericStatusId === 2 ? 3 : null;

  return {
    id_store: store.id_store || store.id || null,
    nombre_tienda: store.nombre_tienda || store.name || 'Tienda',
    status: resolveStoreStatus(store),
    public_token: store.public_token || '',
    created_at: store.created_at || new Date().toISOString(),
    activated_at: store.activated_at || null,
    expires_at: store.expires_at || null,
    store_status_id: store.store_status_id ?? fallbackStoreStatusId ?? null,
  };
}

async function syncExpiredStoresFromTimestamps() {
  const stores = await supabaseRequest('/rest/v1/store?select=*');
  const now = Date.now();
  const staleIds = (stores || [])
    .filter((store) => {
      const status = resolveStoreStatus(store);
      if (status !== 'active') return false;
      const expiresAt = store.expires_at ? new Date(store.expires_at).getTime() : null;
      return expiresAt !== null && expiresAt <= now;
    })
    .map((store) => store.id_store);

  for (const storeId of staleIds) {
    await supabaseRequest(`/rest/v1/store?id_store=eq.${encodeURIComponent(storeId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...getStatusPayload('expired'),
        activated_at: null,
        expires_at: null,
      })
    });
  }

  return staleIds;
}

function firstResult(result) {
  if (Array.isArray(result)) return result[0] ?? null;
  return result ?? null;
}

function normalizeItem(item = {}) {
  const safeItem = item && typeof item === 'object' ? item : {};
  return {
    id: safeItem.id ?? safeItem.id_store_item ?? null,
    store_id: safeItem.store_id ?? safeItem.storeId ?? null,
    name: safeItem.name || 'Sin nombre',
    price: Number(safeItem.price || 0),
    image_url: safeItem.image_url || '',
    quantity: Number(safeItem.quantity || 0),
    description: safeItem.description || '',
  };
}

async function handleStoreRequest({ httpMethod, headers = {}, queryStringParameters = {}, body = {} }) {
  const action = queryStringParameters.action || body.action || 'list-stores';
  const payload = typeof body === 'string' ? JSON.parse(body || '{}') : body;
  const token = headers['x-admin-token'] || headers['X-Admin-Token'];

  try {
    if (httpMethod === 'GET' && action === 'get-store') {
      const publicToken = queryStringParameters.public_token || payload.public_token || queryStringParameters.token || payload.token;
      if (!publicToken) return jsonResponse(400, { error: 'Falta public_token.' });

      const stores = await supabaseRequest(`/rest/v1/store?public_token=eq.${encodeURIComponent(publicToken)}&select=*`);
      const store = stores && stores[0] ? normalizeStore(stores[0]) : null;
      if (!store) return jsonResponse(404, { error: 'Tienda no encontrada.' });

      const now = Date.now();
      const expiresAt = store.expires_at ? new Date(store.expires_at).getTime() : 0;
      if (store.status !== 'active' || expiresAt <= now) {
        return jsonResponse(410, { error: 'La tienda está expirada o no está activa.' });
      }

      const items = await supabaseRequest(`/rest/v1/store_items?store_id=eq.${encodeURIComponent(store.id_store)}&select=*`);
      return jsonResponse(200, {
        store: {
          id_store: store.id_store,
          nombre_tienda: store.nombre_tienda,
          public_token: store.public_token,
          expires_at: store.expires_at,
        },
        items: (items || []).map(normalizeItem),
        expires_at: store.expires_at,
      });
    }

    if (httpMethod === 'GET' && action === 'list-stores') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      await syncExpiredStoresFromTimestamps();
      const stores = await supabaseRequest('/rest/v1/store?select=*');
      return jsonResponse(200, { stores: (stores || []).map(normalizeStore) });
    }

    if (httpMethod === 'POST' && action === 'sync-store-statuses') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      const syncedIds = await syncExpiredStoresFromTimestamps();
      return jsonResponse(200, { synced: syncedIds.length, ids: syncedIds });
    }

    if (httpMethod === 'POST' && action === 'create-store') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      const name = (payload.nombre_tienda || payload.name || '').trim();
      if (!name) return jsonResponse(400, { error: 'El nombre de la tienda es requerido.' });

      const createdAt = new Date().toISOString();
      const publicToken = buildPublicToken();
      const statusPayload = getStatusPayload('draft');
      const storeToInsert = {
        tienda_code: `tienda-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nombre_tienda: name,
        id_status: statusPayload.id_status,
        store_status_id: statusPayload.store_status_id,
        public_token: publicToken,
        created_at: createdAt,
        activated_at: null,
        expires_at: null,
      };

      const inserted = await supabaseRequest('/rest/v1/store', {
        method: 'POST',
        body: JSON.stringify(storeToInsert),
      });
      return jsonResponse(201, { message: 'Tienda creada.', store: normalizeStore(firstResult(inserted)) });
    }

    if (httpMethod === 'POST' && action === 'update-store') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      const storeId = payload.store_id || payload.storeId || payload.id_store || payload.id;
      if (!storeId) return jsonResponse(400, { error: 'Falta store_id.' });

      const name = (payload.nombre_tienda || payload.name || '').trim();
      if (!name) return jsonResponse(400, { error: 'El nombre de la tienda es requerido.' });

      const updatePayload = { nombre_tienda: name };

      const status = (payload.status || '').trim().toLowerCase();
      if (status) {
        if (!['draft', 'active', 'expired'].includes(status)) {
          return jsonResponse(400, { error: 'Estado inválido. Usa draft, active o expired.' });
        }
        Object.assign(updatePayload, getStatusPayload(status));
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'activated_at')) {
        updatePayload.activated_at = payload.activated_at || null;
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'expires_at')) {
        updatePayload.expires_at = payload.expires_at || null;
      }

      const updated = await supabaseRequest(`/rest/v1/store?id_store=eq.${encodeURIComponent(storeId)}`, {
        method: 'PATCH',
        body: JSON.stringify(updatePayload)
      });
      if (!updated || !updated.length) {
        return jsonResponse(404, { error: 'No se encontró la tienda para editar.', store_id: storeId });
      }
      return jsonResponse(200, { message: 'Tienda actualizada.', store: normalizeStore(firstResult(updated)) });
    }

    if (httpMethod === 'POST' && action === 'activate-store') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      const storeId = payload.store_id || payload.storeId || payload.id_store || payload.id;
      if (!storeId) return jsonResponse(400, { error: 'Falta store_id.' });

      const allStores = await supabaseRequest('/rest/v1/store?select=*');
      const activeStores = (allStores || []).filter((store) => resolveStoreStatus(store) === 'active');
      const hasActiveStore = activeStores.length > 0;

      if (hasActiveStore && !(payload.forceClose === true || payload.force === true)) {
        return jsonResponse(409, { error: 'Ya hay otra tienda activa.', activeStore: normalizeStore(activeStores[0]) });
      }

      if (hasActiveStore && (payload.forceClose === true || payload.force === true)) {
        const activeId = activeStores[0].id_store;
        await supabaseRequest(`/rest/v1/store?id_store=eq.${encodeURIComponent(activeId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...getStatusPayload('expired'), expires_at: new Date().toISOString() })
        });
      }

      const now = new Date();
      const activatedAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      const updated = await supabaseRequest(`/rest/v1/store?id_store=eq.${encodeURIComponent(storeId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...getStatusPayload('active'), activated_at: activatedAt, expires_at: expiresAt })
      });
      if (!updated || !updated.length) {
        return jsonResponse(404, { error: 'No se encontró la tienda para activar.', store_id: storeId });
      }
      return jsonResponse(200, { message: 'Tienda activada.', store: normalizeStore(firstResult(updated)) });
    }

    if (httpMethod === 'POST' && action === 'reopen-store') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      const storeId = payload.store_id || payload.storeId || payload.id_store || payload.id;
      if (!storeId) return jsonResponse(400, { error: 'Falta store_id.' });

      const updated = await supabaseRequest(`/rest/v1/store?id_store=eq.${encodeURIComponent(storeId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...getStatusPayload('draft'), activated_at: null, expires_at: null })
      });
      if (!updated || !updated.length) {
        return jsonResponse(404, { error: 'No se encontró la tienda para reabrir.', store_id: storeId });
      }
      return jsonResponse(200, { message: 'Tienda reabierta como borrador.', store: normalizeStore(firstResult(updated)) });
    }

    if (httpMethod === 'POST' && action === 'add-store-item') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      const item = {
        store_id: payload.store_id || payload.storeId,
        name: payload.name || '',
        price: Number(payload.price || 0),
        image_url: payload.image_url || payload.imageUrl || '',
        quantity: Number(payload.quantity || 0),
        description: payload.description || '',
      };

      if (!item.store_id || !item.name || item.price <= 0) {
        return jsonResponse(400, { error: 'Faltan campos: store_id, name y price.' });
      }

      const inserted = await supabaseRequest('/rest/v1/store_items', {
        method: 'POST',
        body: JSON.stringify(item)
      });
      return jsonResponse(201, { message: 'Item agregado.', item: normalizeItem(firstResult(inserted)) });
    }

    if (httpMethod === 'PUT' && action === 'update-store-item') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      const itemId = payload.id || payload.item_id;
      if (!itemId) return jsonResponse(400, { error: 'Falta id.' });

      const updates = {
        name: payload.name,
        price: payload.price,
        image_url: payload.image_url,
        quantity: payload.quantity,
        description: payload.description,
      };
      Object.keys(updates).forEach((key) => {
        if (updates[key] === undefined) delete updates[key];
      });

      const items = await supabaseRequest(`/rest/v1/store_items?id=eq.${encodeURIComponent(itemId)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
      return jsonResponse(200, { message: 'Item actualizado.', item: normalizeItem(firstResult(items)) });
    }

    if (httpMethod === 'DELETE' && action === 'delete-store-item') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      const itemId = queryStringParameters.id || payload.id || payload.item_id;
      if (!itemId) return jsonResponse(400, { error: 'Falta id.' });

      await supabaseRequest(`/rest/v1/store_items?id=eq.${encodeURIComponent(itemId)}`, { method: 'DELETE' });
      return jsonResponse(200, { message: 'Item eliminado.' });
    }

    if (httpMethod === 'GET' && action === 'store-items') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      const storeId = queryStringParameters.store_id || payload.store_id || payload.storeId;
      if (!storeId) return jsonResponse(400, { error: 'Falta store_id.' });

      const items = await supabaseRequest(`/rest/v1/store_items?store_id=eq.${encodeURIComponent(storeId)}&select=*`);
      return jsonResponse(200, { items: (items || []).map(normalizeItem) });
    }

    if (httpMethod === 'GET' && action === 'store-orders-summary') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      const storeId = queryStringParameters.store_id || payload.store_id || payload.storeId;
      if (!storeId) return jsonResponse(400, { error: 'Falta store_id.' });

      const summary = await supabaseRequest('/rest/v1/rpc/get_store_orders_summary', {
        method: 'POST',
        body: JSON.stringify({ p_store_id: storeId })
      });

      return jsonResponse(200, {
        items: (summary || []).map((row) => ({
          item_id: row.item_id,
          name: row.item_name || 'Sin nombre',
          image_url: row.image_url || '',
          total_quantity: Number(row.total_quantity || 0),
        }))
      });
    }

    if (httpMethod === 'POST' && action === 'create-order') {
      const publicToken = payload.public_token || payload.publicToken || queryStringParameters.public_token;
      const clientPhone = payload.client_phone || payload.phone || payload.clientPhone;
      const items = Array.isArray(payload.items) ? payload.items : [];

      if (!publicToken || !clientPhone || !items.length) {
        return jsonResponse(400, { error: 'Faltan public_token, client_phone o items.' });
      }

      const stores = await supabaseRequest(`/rest/v1/store?public_token=eq.${encodeURIComponent(publicToken)}&select=*`);
      const store = stores && stores[0] ? normalizeStore(stores[0]) : null;
      if (!store) return jsonResponse(404, { error: 'Tienda no encontrada.' });

      const now = Date.now();
      const expiresAt = store.expires_at ? new Date(store.expires_at).getTime() : 0;
      if (store.status !== 'active' || expiresAt <= now) {
        return jsonResponse(410, { error: 'La tienda ya expiró.' });
      }

      const orderGroupId = randomUUID();
      const rows = items.map((item) => ({
        order_group_id: orderGroupId,
        store_id: store.id_store,
        item_id: item.id,
        client_phone: clientPhone,
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.price || 0),
        created_at: new Date().toISOString(),
      }));

      const inserted = await supabaseRequest('/rest/v1/store_orders', {
        method: 'POST',
        body: JSON.stringify(rows)
      });

      const waNumber = (process.env.WHATSAPP_NUMBER || '70328006').replace(/\D/g, '');
      const summary = rows.map((row) => `${row.quantity} x ${row.unit_price}`).join(', ');
      const message = encodeURIComponent(`Hola, quiero confirmar mi pedido de la tienda ${store.nombre_tienda}.\n${summary}`);
      return jsonResponse(201, {
        message: 'Pedido registrado.',
        order_group_id: orderGroupId,
        wa_link: `https://wa.me/${waNumber}?text=${message}`,
        rows: inserted || rows,
      });
    }

    return jsonResponse(405, { error: 'Método o acción no permitida.' });
  } catch (error) {
    console.error('storeCatalogSharedError:', error);
    return jsonResponse(500, { error: error.message || 'Error interno.' });
  }
}

module.exports = {
  verifyToken,
  jsonResponse,
  parseBody,
  handleStoreRequest,
  normalizeStore,
  normalizeItem,
  buildPublicToken,
};
