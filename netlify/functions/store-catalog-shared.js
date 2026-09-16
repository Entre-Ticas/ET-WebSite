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

async function resolveStatusIdByName(statusName = 'Enabled') {
  const valuesToTry = [];
  const rawValue = String(statusName ?? '').trim();

  if (rawValue) {
    valuesToTry.push(rawValue);
    valuesToTry.push(rawValue.toLowerCase());
    valuesToTry.push(rawValue.charAt(0).toUpperCase() + rawValue.slice(1).toLowerCase());
  }

  const booleanFriendlyNames = {
    true: ['Enabled', 'Activo', 'Active'],
    false: ['Disabled', 'Desactivado', 'Inactive']
  };

  if (typeof statusName === 'boolean') {
    valuesToTry.push(...(booleanFriendlyNames[String(statusName)] || []));
  }

  const uniqueValues = [...new Set(valuesToTry.filter(Boolean))];

  for (const value of uniqueValues) {
    try {
      const rows = await supabaseRequest(`/rest/v1/status?status_name=eq.${encodeURIComponent(value)}&select=id_status`);
      const first = firstResult(rows);
      if (first && first.id_status !== undefined) return Number(first.id_status);
    } catch {
      // continue with next candidate
    }
  }

  const boolValue = typeof statusName === 'boolean' ? statusName : null;
  if (boolValue !== null) {
    try {
      const rows = await supabaseRequest(`/rest/v1/status?disabled=eq.${String(boolValue).toLowerCase()}&select=id_status`);
      const first = firstResult(rows);
      if (first && first.id_status !== undefined) return Number(first.id_status);
    } catch {
      // fallback handled below
    }
  }

  return null;
}

function itemIsActive(item = {}) {
  const explicit = item.is_active;
  if (explicit !== undefined) return Boolean(explicit);

  const statusName = String(item.status_name || item.status || '').toLowerCase();
  if (statusName.includes('activo') || statusName.includes('active')) return true;
  if (statusName.includes('desactiv') || statusName.includes('inactive') || statusName.includes('inactivo')) return false;

  const statusId = Number(item.status_id ?? item.id_status ?? 0);
  if (statusId > 0) return statusId !== 2;

  return true;
}

function normalizeItem(item = {}) {
  const safeItem = item && typeof item === 'object' ? item : {};
  const isActive = itemIsActive(safeItem);

  return {
    id: safeItem.id ?? safeItem.id_store_item ?? null,
    store_id: safeItem.store_id ?? safeItem.storeId ?? null,
    name: safeItem.name || 'Sin nombre',
    price: Number(safeItem.price || 0),
    image_url: safeItem.image_url || '',
    quantity: (safeItem.quantity === null || safeItem.quantity === undefined || safeItem.quantity === '')
      ? null
      : Number(safeItem.quantity),
    description: safeItem.description || '',
    is_active: isActive,
    status: isActive ? 'active' : 'inactive',
    status_id: safeItem.status_id ?? safeItem.id_status ?? null,
    status_name: safeItem.status_name || safeItem.status?.status_name || null,
  };
}

function formatStoreCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '¢0';
  return `¢${amount.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function normalizePhoneDigits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function getExistingContactField(orderSample = {}) {
  const availableFields = Object.keys(orderSample || {});
  const preferredFields = [
    'contacted',
    'contactado',
    'confirmado',
    'contact_status',
    'contact_status_id',
    'status_contacted',
    'status',
    'confirmed',
    'estado_contacto',
    'is_contacted'
  ];

  return preferredFields.find((field) => availableFields.includes(field)) || null;
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
      const visibleItems = (items || []).filter((item) => itemIsActive(item));

      return jsonResponse(200, {
        store: {
          id_store: store.id_store,
          nombre_tienda: store.nombre_tienda,
          public_token: store.public_token,
          expires_at: store.expires_at,
        },
        items: visibleItems.map(normalizeItem),
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

      const isActive = payload.is_active !== undefined ? Boolean(payload.is_active) : true;
      const statusId = payload.status_id !== undefined ? Number(payload.status_id) : null;
      const resolvedStatusId = statusId || (await resolveStatusIdByName(isActive ? 'Activo' : 'Desactivado'));

      const item = {
        store_id: payload.store_id || payload.storeId,
        name: payload.name || '',
        price: Number(payload.price || 0),
        image_url: payload.image_url || payload.imageUrl || '',
        quantity: (payload.quantity === null || payload.quantity === undefined || payload.quantity === '')
          ? null
          : Number(payload.quantity),
        description: payload.description || '',
      };

      if (resolvedStatusId !== null) {
        item.status_id = resolvedStatusId;
      }

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

      if (payload.status_id !== undefined) {
        updates.status_id = Number(payload.status_id);
      } else if (payload.is_active !== undefined) {
        const resolvedStatusId = await resolveStatusIdByName(Boolean(payload.is_active) ? 'Activo' : 'Desactivado');
        if (resolvedStatusId !== null) updates.status_id = resolvedStatusId;
      }

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

    if (httpMethod === 'GET' && action === 'item-statuses') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });

      const statuses = await supabaseRequest('/rest/v1/status?select=id_status,status_name,disabled&order=id_status.asc');
      return jsonResponse(200, {
        statuses: (statuses || []).map((status) => ({
          id_status: status.id_status,
          status_name: status.status_name,
          disabled: Boolean(status.disabled),
        }))
      });
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

    if (httpMethod === 'GET' && action === 'store-customer-orders') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      const storeId = queryStringParameters.store_id || payload.store_id || payload.storeId;
      if (!storeId) return jsonResponse(400, { error: 'Falta store_id.' });

      const orders = await supabaseRequest(`/rest/v1/store_orders?store_id=eq.${encodeURIComponent(storeId)}&select=id,client_id,client_phone,item_id,quantity,unit_price,created_at,contacted,order_group_id`);
      if (!Array.isArray(orders) || !orders.length) {
        return jsonResponse(200, { customers: [] });
      }

      const clientIds = [...new Set(orders.map((row) => row.client_id).filter((id) => id !== null && id !== undefined && id !== ''))];
      const clientMap = {};
      if (clientIds.length) {
        const clients = await supabaseRequest(`/rest/v1/clients?id=in.(${clientIds.join(',')})&select=id,name,phone,phone_last4`);
        (clients || []).forEach((client) => {
          clientMap[client.id] = client;
        });
      }

      const itemIds = [...new Set(orders.map((row) => row.item_id).filter(Boolean))];
      const itemMap = {};
      if (itemIds.length) {
        const items = await supabaseRequest(`/rest/v1/store_items?id=in.(${itemIds.join(',')})&select=id,name,image_url`);
        (items || []).forEach((item) => {
          itemMap[item.id] = item;
        });
      }

      const grouped = {};
      for (const order of orders) {
        const phone = String(order.client_phone || '').trim();
        if (!phone) continue;

        const orderGroupId = order.order_group_id || String(order.id);
        const key = `${phone}|${orderGroupId}`;
        const linkedClient = order.client_id ? clientMap[order.client_id] || null : null;

        if (!grouped[key]) {
          grouped[key] = {
            phone,
            phone_digits: String(phone).replace(/\D/g, ''),
            order_group_id: orderGroupId,
            client_id: linkedClient ? linkedClient.id : null,
            client_name: linkedClient ? linkedClient.name : null,
            client_phone: linkedClient ? linkedClient.phone : null,
            client_phone_last4: linkedClient ? (linkedClient.phone_last4 || String(linkedClient.phone || '').slice(-4)) : null,
            is_matched: Boolean(linkedClient),
            contacted: Boolean(order.contacted),
            items: [],
            total_quantity: 0,
          };
        }

        if (linkedClient && !grouped[key].client_name) {
          grouped[key].client_id = linkedClient.id;
          grouped[key].client_name = linkedClient.name || null;
          grouped[key].client_phone = linkedClient.phone || null;
          grouped[key].client_phone_last4 = linkedClient.phone_last4 || String(linkedClient.phone || '').slice(-4);
          grouped[key].is_matched = true;
        }

        const item = itemMap[order.item_id] || {};
        const name = item.name || 'Artículo sin nombre';
        const quantity = Number(order.quantity || 0);
        const unitPrice = Number(order.unit_price || item.price || 0);
        grouped[key].total_quantity += quantity;

        const existingItem = grouped[key].items.find((entry) => entry.item_id === order.item_id);
        if (existingItem) {
          existingItem.quantity += quantity;
          existingItem.unit_price = existingItem.unit_price || unitPrice;
        } else {
          grouped[key].items.push({
            item_id: order.item_id,
            name,
            quantity,
            unit_price: unitPrice,
            image_url: item.image_url || '',
          });
        }
      }

      return jsonResponse(200, {
        customers: Object.values(grouped)
          .map((customer) => ({
            phone: customer.phone,
            phone_digits: customer.phone_digits,
            order_group_id: customer.order_group_id,
            client_id: customer.client_id || null,
            client_name: customer.client_name || null,
            client_phone: customer.client_phone || null,
            client_phone_last4: customer.client_phone_last4 || customer.phone_digits.slice(-4),
            is_matched: Boolean(customer.is_matched),
            contacted: Boolean(customer.contacted),
            total_quantity: Number(customer.total_quantity || 0),
            items: customer.items.map((item) => ({
              item_id: item.item_id,
              name: item.name,
              quantity: Number(item.quantity || 0),
              unit_price: Number(item.unit_price || 0),
              image_url: item.image_url || '',
            }))
          }))
          .sort((a, b) => (b.total_quantity || 0) - (a.total_quantity || 0) || String(a.phone).localeCompare(String(b.phone)))
      });
    }

    if (httpMethod === 'GET' && action === 'find-client-matches') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      const rawPhone = queryStringParameters.phone || payload.phone || '';
      const normalizedPhone = normalizePhoneDigits(rawPhone);
      if (!normalizedPhone) return jsonResponse(200, { matches: [] });

      try {
        const clients = await supabaseRequest('/rest/v1/clients?select=id,name,phone,phone_last4,status_id,is_blacklisted,created_at');
        const last4 = normalizedPhone.slice(-4);
        const matches = (clients || [])
          .filter((client) => {
            const clientDigits = normalizePhoneDigits(client.phone || '');
            return clientDigits === normalizedPhone || clientDigits.endsWith(last4) || (client.phone_last4 && String(client.phone_last4).endsWith(last4));
          })
          .map((client) => ({
            id: client.id,
            name: client.name || 'Cliente sin nombre',
            phone: client.phone || '',
            phone_last4: client.phone_last4 || String(client.phone || '').slice(-4),
            is_blacklisted: Boolean(client.is_blacklisted),
            status_id: client.status_id || null,
            created_at: client.created_at || null,
          }))
          .sort((a, b) => String(a.name).localeCompare(String(b.name)));

        return jsonResponse(200, { matches });
      } catch (error) {
        return jsonResponse(200, { matches: [] });
      }
    }

    if (httpMethod === 'POST' && action === 'create-client-match') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      const name = String(payload.name || '').trim();
      const phone = String(payload.phone || '').trim();
      if (!name || !phone) return jsonResponse(400, { error: 'Faltan nombre o teléfono.' });

      const normalizedPhone = normalizePhoneDigits(phone);
      const last4 = normalizedPhone.slice(-4);

      try {
        const existing = await supabaseRequest(`/rest/v1/clients?phone=eq.${encodeURIComponent(phone)}&select=id,name,phone,phone_last4,status_id,is_blacklisted`);
        if (Array.isArray(existing) && existing.length) {
          const client = existing[0];
          return jsonResponse(200, {
            client: {
              id: client.id,
              name: client.name,
              phone: client.phone,
              phone_last4: client.phone_last4 || last4,
            },
            created: false,
          });
        }
      } catch (_error) {
        // Continue to create when the table is available but the exact match query fails.
      }

      try {
        const result = await supabaseRequest('/rest/v1/clients', {
          method: 'POST',
          body: JSON.stringify({
            name,
            phone,
            phone_last4: last4,
            address: payload.address || null,
            is_blacklisted: Boolean(payload.is_blacklisted || false),
            status_id: payload.status_id ?? 1,
            created_at: new Date().toISOString(),
          })
        });

        const client = Array.isArray(result) ? result[0] : result;
        return jsonResponse(201, {
          client: client || {
            id: null,
            name,
            phone,
            phone_last4: last4,
          },
          created: true,
        });
      } catch (error) {
        return jsonResponse(500, { error: error.message || 'No se pudo crear el cliente.' });
      }
    }

    if (httpMethod === 'POST' && action === 'link-store-orders-client') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      const phone = String(payload.phone || '').trim();
      const clientId = Number(payload.client_id || payload.clientId);
      if (!phone || !clientId) return jsonResponse(400, { error: 'Falta teléfono o client_id.' });

      try {
        const orders = await supabaseRequest('/rest/v1/store_orders?select=id,client_phone,client_id');
        const normalizedPhone = normalizePhoneDigits(phone);
        const last4 = normalizedPhone.slice(-4);

        const matches = (orders || []).filter((order) => {
          const rowPhone = normalizePhoneDigits(order.client_phone || '');
          return rowPhone === normalizedPhone || rowPhone.endsWith(last4) || (order.client_id != null && Number(order.client_id) === Number(clientId));
        });

        let updatedCount = 0;
        for (const order of matches) {
          await supabaseRequest(`/rest/v1/store_orders?id=eq.${encodeURIComponent(order.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ client_id: clientId })
          });
          updatedCount += 1;
        }

        return jsonResponse(200, {
          updated: updatedCount,
          client_id: clientId,
          phone,
        });
      } catch (error) {
        return jsonResponse(500, { error: error.message || 'No se pudo vincular el cliente.' });
      }
    }

    if (httpMethod === 'POST' && action === 'mark-store-customer-contacted') {
      if (!verifyToken(token)) return jsonResponse(401, { error: 'No autorizado.' });
      const phone = String(payload.phone || '').trim();
      const orderGroupId = payload.order_group_id || payload.orderGroupId || null;
      if (!phone) return jsonResponse(400, { error: 'Falta teléfono.' });

      try {
        const orders = await supabaseRequest('/rest/v1/store_orders?select=*');
        const normalizedPhone = normalizePhoneDigits(phone);
        const last4 = normalizedPhone.slice(-4);
        const matches = (orders || []).filter((order) => {
          const rowPhone = normalizePhoneDigits(order.client_phone || '');
          const samePhone = rowPhone === normalizedPhone || rowPhone.endsWith(last4);
          const sameGroup = !orderGroupId || order.order_group_id === orderGroupId || String(order.id) === String(orderGroupId);
          return samePhone && sameGroup;
        });

        if (!matches.length) {
          return jsonResponse(200, { updated: 0, phone, order_group_id: orderGroupId, message: 'No hubo coincidencias para marcar contacto.' });
        }

        const contactField = getExistingContactField((orders || [])[0] || {});
        if (!contactField) {
          return jsonResponse(400, {
            error: 'La tabla store_orders no tiene un campo de contacto activo. Debe existir una columna como contacted, confirmado o contact_status.'
          });
        }

        const successfulPatch = [];
        for (const order of matches) {
          const patchBody = {};

          if (['contacted', 'contactado', 'confirmado', 'confirmed', 'is_contacted'].includes(contactField)) {
            patchBody[contactField] = true;
          } else if (['status', 'contact_status', 'contact_status_id', 'estado_contacto', 'status_contacted'].includes(contactField)) {
            patchBody[contactField] = 'contactado';
          }

          const updated = await supabaseRequest(`/rest/v1/store_orders?id=eq.${encodeURIComponent(order.id)}`, {
            method: 'PATCH',
            body: JSON.stringify(patchBody)
          });

          successfulPatch.push(updated);
        }

        return jsonResponse(200, { updated: successfulPatch.length, phone, order_group_id: orderGroupId, contactField });
      } catch (error) {
        return jsonResponse(500, { error: error.message || 'No se pudo marcar como contactado.' });
      }
    }

    if (httpMethod === 'POST' && action === 'create-order') {
      const publicToken = payload.public_token || payload.publicToken || queryStringParameters.public_token;
      const clientPhone = payload.client_phone || payload.phone || payload.clientPhone;
      const clientName = payload.client_name || payload.clientName || '';
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
      const totalAmount = items.reduce((sum, item) => sum + (Number(item.quantity || 1) * Number(item.price || 0)), 0);
      const fiftyPercentAmount = totalAmount / 2;
      const reminderLine = `Recorda que el monto total es ${formatStoreCurrency(totalAmount)} y el monto del 50% es ${formatStoreCurrency(fiftyPercentAmount)}`;
      const summary = items.map((item) => {
        const quantity = Number(item.quantity || 1);
        const price = Number(item.price || 0);
        return `${item.name || 'Item'}: ${quantity} x ${formatStoreCurrency(price)}`;
      }).join('\n');
      const customerGreeting = clientName ? `Hola soy *${clientName}*\n` : 'Hola\n';
      const message = encodeURIComponent(`${customerGreeting}Quiero confirmar mi pedido de la tienda ${store.nombre_tienda}.\n\n${reminderLine}\n\n${summary}\n\nCódigo de pedido: ${orderGroupId}`);
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
