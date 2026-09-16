let storeAdminAllStores = [];
let storeAdminFilters = {
    name: '',
    status: ''
};

function formatStoreStatus(status) {
    const map = {
        draft: 'Borrador',
        active: 'Activa',
        expired: 'Expirada'
    };
    return map[status] || status || 'Borrador';
}

function isStoreItemActive(item = {}) {
    if (!item || typeof item !== 'object') return true;

    if (item.is_active !== undefined) return Boolean(item.is_active);
    if (item.active !== undefined) return Boolean(item.active);

    if (item.status && typeof item.status === 'object') {
        if (item.status.disabled !== undefined) return !Boolean(item.status.disabled);
        const statusName = String(item.status.status_name || item.status.name || '').toLowerCase();
        if (statusName.includes('disabled')) return false;
        if (statusName.includes('enabled')) return true;
    }

    if (item.disabled !== undefined) return !Boolean(item.disabled);

    const statusName = String(item.status_name || item.name_status || '').toLowerCase();
    if (statusName.includes('disabled')) return false;
    if (statusName.includes('enabled')) return true;

    const statusId = Number(item.status_id ?? item.id_status ?? 0);
    if (statusId > 0) return statusId !== 2;

    return true;
}

async function loadStoreItemStatusOptions(selectEl, selectedStatusId = null) {
    if (!selectEl) return;

    const session = getSession();
    if (!session) return;

    try {
        const response = await fetch('/.netlify/functions/store-admin?action=item-statuses', {
            method: 'GET',
            headers: { 'x-admin-token': session.token }
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'No se pudieron cargar los estados.');
        }

        const data = await response.json();
        const statuses = Array.isArray(data.statuses) ? data.statuses : [];

        if (!statuses.length) {
            selectEl.innerHTML = '<option value="1">Enabled</option>';
            return;
        }

        const currentValue = Number(selectedStatusId ?? statuses[0].id_status ?? 1);
        selectEl.innerHTML = statuses.map((status) => {
            const statusId = Number(status.id_status);
            const label = status.status_name || `Estado ${statusId}`;
            const selected = statusId === currentValue ? 'selected' : '';
            return `<option value="${statusId}" ${selected}>${label}</option>`;
        }).join('');
    } catch (error) {
        console.error('loadStoreItemStatusOptions failed', error);
        selectEl.innerHTML = '<option value="1">Enabled</option><option value="2">Disabled</option>';
    }
}

function normalizeStoreAdminFilterText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function getFilteredStoreAdminList(stores) {
    const nameFilter = normalizeStoreAdminFilterText(storeAdminFilters.name);
    const statusFilter = String(storeAdminFilters.status || '').trim();

    return stores.filter((store) => {
        const matchesName = !nameFilter || normalizeStoreAdminFilterText(store.nombre_tienda).includes(nameFilter);
        const matchesStatus = !statusFilter || store.status === statusFilter;
        return matchesName && matchesStatus;
    });
}

function bindStoreAdminFilters() {
    const nameInput = document.getElementById('storeAdminFilterName');
    const statusInput = document.getElementById('storeAdminFilterStatus');
    if (!nameInput || !statusInput) return;

    nameInput.value = storeAdminFilters.name;
    statusInput.value = storeAdminFilters.status;

    nameInput.oninput = () => {
        storeAdminFilters.name = nameInput.value;
        renderStoreAdminList(storeAdminAllStores);
    };

    statusInput.onchange = () => {
        storeAdminFilters.status = statusInput.value;
        renderStoreAdminList(storeAdminAllStores);
    };
}

function getStoreAdminStatusText(store) {
    if (store.status === 'active' && store.expires_at) {
        const diff = Math.max(0, new Date(store.expires_at).getTime() - Date.now());
        const totalSeconds = Math.ceil(diff / 1000);
        const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        return `Activa (${minutes}:${seconds})`;
    }
    return formatStoreStatus(store.status);
}

async function syncStoreStatusFromTimestamps() {
    const session = getSession();
    if (!session) return null;

    const response = await fetch('/.netlify/functions/store-admin?action=sync-store-statuses', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-token': session.token,
        }
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.warn('sync-store-statuses failed', data.error || response.statusText);
        return null;
    }

    const data = await response.json().catch(() => ({}));
    return data || null;
}

async function fetchStoreAdminData() {
    const session = getSession();
    if (!session) return [];

    const response = await fetch('/.netlify/functions/store-admin?action=list-stores', {
        method: 'GET',
        headers: { 'x-admin-token': session.token }
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error al cargar tiendas');
    }

    const data = await response.json();
    return data.stores || [];
}

async function createStoreFromAdmin() {
    const session = getSession();
    const name = document.getElementById('storeNameInput')?.value?.trim();
    if (!name) {
        showStoreAdminMessage('Ingresa un nombre para la tienda.', true);
        return;
    }

    const response = await fetch('/.netlify/functions/store-admin?action=create-store', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-token': session.token
        },
        body: JSON.stringify({ nombre_tienda: name })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        showStoreAdminMessage(data.error || 'No se pudo crear la tienda.', true);
        return;
    }

    showStoreAdminMessage('Tienda creada correctamente.', false);
    document.getElementById('storeNameInput').value = '';
    await initStoreAdminPage();
}

async function activateStoreById(storeId) {
    const session = getSession();
    const response = await fetch('/.netlify/functions/store-admin?action=activate-store', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-token': session.token,
        },
        body: JSON.stringify({ store_id: storeId, forceClose: false })
    });

    const data = await response.json().catch(() => ({}));
    if (response.status === 409) {
        const shouldForce = confirm(`La tienda ${data.activeStore?.nombre_tienda || 'otra'} está activa. ¿Deseas cerrarla y activar esta?`);
        if (!shouldForce) return;

        const forceResponse = await fetch('/.netlify/functions/store-admin?action=activate-store', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': session.token,
            },
            body: JSON.stringify({ store_id: storeId, forceClose: true })
        });
        const forceData = await forceResponse.json().catch(() => ({}));
        if (!forceResponse.ok) {
            alert(forceData.error || 'No se pudo activar la tienda.');
            return;
        }
        await initStoreAdminPage();
        return;
    }

    if (!response.ok) {
        alert(data.error || 'No se pudo activar la tienda.');
        return;
    }

    await initStoreAdminPage();
}

async function reopenStoreById(storeId) {
    const session = getSession();
    const response = await fetch('/.netlify/functions/store-admin?action=reopen-store', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-token': session.token,
        },
        body: JSON.stringify({ store_id: storeId })
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'No se pudo reabrir la tienda.');
        return;
    }

    await initStoreAdminPage();
}

function getStorePublicLink(publicToken) {
    const origin = window.location && window.location.origin ? window.location.origin : 'https://entreticas.netlify.app';
    return `${origin}/StoreCatalog/${publicToken}`;
}

function normalizeStoreClientPhoneForWa(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('506')) return digits;
    if (digits.length === 8) return `506${digits}`;
    return digits;
}

function formatStoreCurrency(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return '¢0';
    return `¢${amount.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

async function copyStoreLink(publicToken) {
    const link = getStorePublicLink(publicToken);
    try {
        await navigator.clipboard.writeText(link);
        alert('Enlace copiado al portapapeles.');
    } catch {
        prompt('Copia este enlace:', link);
    }
}

function openStorePublicLink(publicToken) {
    if (!publicToken) return;
    const link = getStorePublicLink(publicToken);
    window.open(link, '_blank', 'noopener,noreferrer');
}

function openStoreOrdersAdminPage(storeId) {
    if (!storeId) return;
    localStorage.setItem('selected_store_orders_id', String(storeId));
    loadPage('admin/store-orders');
}

async function renderStoreAdminList(stores) {
    const root = document.getElementById('storeAdminGrid');
    if (!root) return;

    storeAdminAllStores = Array.isArray(stores) ? stores : [];

    if (!storeAdminAllStores.length) {
        root.innerHTML = '<div class="empty-state">No hay tiendas creadas aún.</div>';
        return;
    }

    const statusOrder = { active: 0, draft: 1, expired: 2 };
    const sortedStores = [...storeAdminAllStores].sort((a, b) => {
        const orderA = statusOrder[a.status] ?? 99;
        const orderB = statusOrder[b.status] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        return (a.nombre_tienda || '').localeCompare(b.nombre_tienda || '', 'es', { sensitivity: 'base' });
    });

    const filteredStores = getFilteredStoreAdminList(sortedStores);

    storeAdminCache = {};
    sortedStores.forEach((store) => { storeAdminCache[store.id_store] = store; });

    root.innerHTML = `
        <div class="admin-grid">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Tienda</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                    <tr class="admin-filter-row">
                        <td><input id="storeAdminFilterName" type="text" placeholder="Filtrar..." /></td>
                        <td>
                            <select id="storeAdminFilterStatus" class="store-admin-status-filter">
                                <option value="">Todos</option>
                                <option value="active">Activa</option>
                                <option value="draft">Borrador</option>
                                <option value="expired">Expirada</option>
                            </select>
                        </td>
                        <td></td>
                    </tr>
                </thead>
                <tbody>
                    ${filteredStores.length ? filteredStores.map((store) => `
                        <tr>
                            <td class="store-name-cell">${store.nombre_tienda}</td>
                            <td><span class="store-badge ${store.status}">${formatStoreStatus(store.status)}</span></td>
                            <td class="admin-actions-cell">
                                <button class="admin-btn-action btn-edit" title="Editar tienda" onclick="openEditStorePanel('${store.id_store}')"><i class="fas fa-pen"></i></button>
                                <button class="admin-btn-action btn-store-add" title="Agregar item a la tienda" onclick="openStoreItemPanel('${store.id_store}')"><i class="fas fa-plus"></i></button>
                                <button class="admin-btn-action btn-invoice" title="Ver items" onclick="viewStoreItems('${store.id_store}')"><i class="fas fa-boxes"></i></button>
                                <button class="admin-btn-action btn-copy" title="Ver compras" onclick="viewStoreOrders('${store.id_store}')"><i class="fas fa-receipt"></i></button>
                                <button class="admin-btn-action btn-order-admin" title="Compras" onclick="openStoreOrdersAdminPage('${store.id_store}')"><i class="fas fa-bag-shopping"></i></button>
                                <button class="admin-btn-action btn-customers" title="Ver clientes" onclick="viewStoreCustomerOrders('${store.id_store}')"><i class="fas fa-user"></i></button>
                                ${store.status === 'draft' ? `<button class="admin-btn-action btn-activate" title="Activar" onclick="activateStoreById('${store.id_store}')"><i class="fas fa-check"></i></button>` : ''}
                                ${store.status === 'expired' ? `<button class="admin-btn-action btn-update" title="Reabrir como borrador" onclick="reopenStoreById('${store.id_store}')"><i class="fas fa-rotate-left"></i></button>` : ''}
                                ${store.status === 'active' ? `<button class="admin-btn-action btn-copy" title="Ir al catálogo" onclick="openStorePublicLink('${store.public_token}')"><i class="fas fa-external-link-alt"></i></button>` : ''}
                                ${store.status === 'active' ? `<button class="admin-btn-action btn-copy" title="Copiar link" onclick="copyStoreLink('${store.public_token}')"><i class="fas fa-link"></i></button>` : ''}
                            </td>
                        </tr>
                    `).join('') : `
                        <tr>
                            <td colspan="3" class="empty-state">No hay tiendas que coincidan con el filtro.</td>
                        </tr>
                    `}
                </tbody>
            </table>
        </div>
    `;

    bindStoreAdminFilters();
}

let pendingStoreItemImageFile = null;

function getPreferredStoreItemImageName(file, itemName) {
    const nameBase = (itemName || '').trim();
    const originalName = (file && file.name) ? file.name : 'producto';
    const extension = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '';
    const normalizedBase = nameBase
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'producto';

    return `${normalizedBase}${extension}`;
}

async function uploadStoreItemImageFile(file, token, itemName = '') {
    const response = await fetch('/.netlify/functions/upload-image', {
        method: 'POST',
        headers: {
            'Content-Type': file.type,
            'x-admin-token': token,
            'x-file-name': getPreferredStoreItemImageName(file, itemName)
        },
        body: file
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || 'No se pudo subir la imagen.');
    }

    if (!data.imageUrl) {
        throw new Error('No se recibió URL de imagen.');
    }

    return data.imageUrl;
}

async function handleStoreItemImageUpload(event, formType) {
    const fileInput = event.target;
    const file = fileInput.files[0];
    if (!file) return;

    const statusEl = document.getElementById(`${formType}ImageStatus`);
    const previewImg = document.getElementById(`${formType}ImagePreview`).querySelector('img');
    const urlHiddenInput = document.getElementById(`${formType}ImageUrl`);

    pendingStoreItemImageFile = file;

    if (previewImg) {
        previewImg.src = URL.createObjectURL(file);
    }

    if (statusEl) {
        statusEl.textContent = 'Vista previa lista. Se subirá al guardar.';
        statusEl.style.color = 'var(--brown-text)';
    }

    if (urlHiddenInput && !urlHiddenInput.value) {
        urlHiddenInput.value = '';
    }
}

function triggerStoreItemFileUpload(formType) {
    document.getElementById(`${formType}ImageUpload`).click();
}

function triggerStoreItemCameraUpload(formType) {
    document.getElementById(`${formType}CameraUpload`).click();
}

async function openStoreItemPanel(storeId) {
    const session = getSession();
    const gridView = document.getElementById('storeAdminGridView');
    const panel = document.getElementById('storeItemFormPanel');
    if (!gridView || !panel) return;

    gridView.style.display = 'none';
    panel.style.display = 'block';
    panel.dataset.storeId = storeId;
    pendingStoreItemImageFile = null;
    panel.innerHTML = `
        <button onclick="closeStoreItemPanel()" class="admin-btn-back">← Volver</button>
        <h3>Cargar item</h3>
        <div class="image-upload-container">
            <label for="storeItemImageUpload">Imagen del Producto</label>
            <div class="image-upload-content">
                <div class="image-preview" id="storeItemImagePreview">
                    <img src="https://placehold.co/100x100/E19B9D/FFFFFF?text=?" alt="Vista previa" />
                </div>
                <div class="image-upload-buttons">
                    <button class="admin-btn" type="button" onclick="triggerStoreItemFileUpload('storeItem')" title="Subir foto"><i class="fas fa-upload"></i></button>
                    <button class="admin-btn" type="button" onclick="triggerStoreItemCameraUpload('storeItem')" title="Tomar foto"><i class="fas fa-camera"></i></button>
                </div>
            </div>
            <input type="file" accept="image/*" id="storeItemImageUpload" class="image-upload-input" onchange="handleStoreItemImageUpload(event, 'storeItem')">
            <input type="file" accept="image/*" capture id="storeItemCameraUpload" class="image-upload-input" onchange="handleStoreItemImageUpload(event, 'storeItem')">
            <input type="hidden" id="storeItemImageUrl">
            <small class="image-upload-status" id="storeItemImageStatus"></small>
        </div>
        <div class="floating-field">
            <input id="storeItemName" class="floating-input" type="text" placeholder=" " autocomplete="new-password" />
            <label class="floating-label">Nombre</label>
        </div>
        <div class="floating-field">
            <input id="storeItemPrice" class="floating-input" type="number" step="0.01" placeholder=" " autocomplete="new-password" />
            <label class="floating-label">Precio</label>
        </div>
        <div class="floating-field">
            <input id="storeItemQuantity" class="floating-input" type="number" min="0" placeholder=" " autocomplete="new-password" />
            <label class="floating-label">Cantidad (NULL = ilimitado)</label>
        </div>
        <div class="floating-field">
            <textarea id="storeItemDescription" class="floating-input" placeholder=" " autocomplete="new-password"></textarea>
            <label class="floating-label">Descripción</label>
        </div>
        <div class="floating-field">
            <select id="storeItemStatusId" class="floating-input" style="width:100%;"></select>
            <label class="floating-label">Estado</label>
        </div>
        <button onclick="saveStoreItem('${storeId}', '${session.token}')"
            style="width:100%; padding:12px; background:var(--pink-accent); color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">
            Guardar Cambios
        </button>
        <div id="storeItemMessage"></div>
    `;

    const statusSelect = document.getElementById('storeItemStatusId');
    if (statusSelect) {
        loadStoreItemStatusOptions(statusSelect, 1);
    }
}

let storeItemsCache = {};

function openEditStoreItemPanel(storeId, itemId) {
    const session = getSession();
    const gridView = document.getElementById('storeAdminGridView');
    const itemsDetailView = document.getElementById('storeItemsDetailView');
    const panel = document.getElementById('storeItemFormPanel');
    if (!panel) return;

    const items = storeItemsCache[storeId] || [];
    const item = items.find((it) => String(it.id) === String(itemId));
    if (!item) return;

    if (itemsDetailView) itemsDetailView.style.display = 'none';
    if (gridView) gridView.style.display = 'none';
    panel.style.display = 'block';
    panel.dataset.storeId = storeId;
    panel.dataset.itemId = itemId;
    pendingStoreItemImageFile = null;
    panel.innerHTML = `
        <button onclick="closeStoreItemPanel()" class="admin-btn-back">← Volver</button>
        <h3>Editar item</h3>
        <div class="image-upload-container">
            <label for="storeItemImageUpload">Imagen del Producto</label>
            <div class="image-upload-content">
                <div class="image-preview" id="storeItemImagePreview">
                    <img src="${String(item.image_url || 'https://placehold.co/100x100/E19B9D/FFFFFF?text=?')}" alt="Vista previa" />
                </div>
                <div class="image-upload-buttons">
                    <button class="admin-btn" type="button" onclick="triggerStoreItemFileUpload('storeItem')" title="Subir foto"><i class="fas fa-upload"></i></button>
                    <button class="admin-btn" type="button" onclick="triggerStoreItemCameraUpload('storeItem')" title="Tomar foto"><i class="fas fa-camera"></i></button>
                </div>
            </div>
            <input type="file" accept="image/*" id="storeItemImageUpload" class="image-upload-input" onchange="handleStoreItemImageUpload(event, 'storeItem')">
            <input type="file" accept="image/*" capture id="storeItemCameraUpload" class="image-upload-input" onchange="handleStoreItemImageUpload(event, 'storeItem')">
            <input type="hidden" id="storeItemImageUrl" value="${String(item.image_url || '').replace(/"/g, '&quot;')}">
            <small class="image-upload-status" id="storeItemImageStatus"></small>
        </div>
        <div class="floating-field">
            <input id="storeItemName" class="floating-input" type="text" placeholder=" " autocomplete="new-password" value="${String(item.name || '').replace(/"/g, '&quot;')}" />
            <label class="floating-label">Nombre</label>
        </div>
        <div class="floating-field">
            <input id="storeItemPrice" class="floating-input" type="number" step="0.01" placeholder=" " autocomplete="new-password" value="${Number(item.price || 0)}" />
            <label class="floating-label">Precio</label>
        </div>
        <div class="floating-field">
            <input id="storeItemQuantity" class="floating-input" type="number" min="0" placeholder=" " autocomplete="new-password" value="${(item.quantity === null || item.quantity === undefined) ? '' : Number(item.quantity)}" />
            <label class="floating-label">Cantidad (NULL = ilimitado)</label>
        </div>
        <div class="floating-field">
            <textarea id="storeItemDescription" class="floating-input" placeholder=" " autocomplete="new-password">${String(item.description || '')}</textarea>
            <label class="floating-label">Descripción</label>
        </div>
        <div class="floating-field">
            <select id="storeItemStatusId" class="floating-input" style="width:100%;"></select>
            <label class="floating-label">Estado</label>
        </div>
        <button onclick="saveStoreItemEdit('${storeId}', '${itemId}', '${session.token}')"
            style="width:100%; padding:12px; background:var(--pink-accent); color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">
            Guardar Cambios
        </button>
        <div id="storeItemMessage"></div>
    `;

    const statusSelect = document.getElementById('storeItemStatusId');
    if (statusSelect) {
        const selectedStatusId = Number(item.status_id ?? item.id_status ?? (isStoreItemActive(item) ? 1 : 2));
        loadStoreItemStatusOptions(statusSelect, selectedStatusId);
    }
}

async function saveStoreItemEdit(storeId, itemId, token) {
    const statusEl = document.getElementById('storeItemImageStatus');
    const urlHiddenInput = document.getElementById('storeItemImageUrl');

    let imageUrl = (urlHiddenInput?.value || '').trim();
    if (pendingStoreItemImageFile) {
        try {
            const itemName = document.getElementById('storeItemName')?.value || '';
            if (statusEl) {
                statusEl.textContent = 'Subiendo imagen...';
                statusEl.style.color = 'var(--brown-text)';
            }
            imageUrl = await uploadStoreItemImageFile(pendingStoreItemImageFile, token, itemName);
            if (urlHiddenInput) urlHiddenInput.value = imageUrl;
            if (statusEl) {
                statusEl.textContent = '✅ Imagen subida.';
                statusEl.style.color = '#28a745';
            }
        } catch (error) {
            if (statusEl) {
                statusEl.textContent = `Error: ${error.message}`;
                statusEl.style.color = 'red';
            }
            showStoreItemMessage(error.message, true);
            return;
        }
    }

    const quantityRaw = document.getElementById('storeItemQuantity').value;
    const statusId = Number(document.getElementById('storeItemStatusId')?.value || 1);
    const payload = {
        id: itemId,
        name: document.getElementById('storeItemName').value.trim(),
        price: Number(document.getElementById('storeItemPrice').value || 0),
        quantity: quantityRaw === '' ? 0 : Number(quantityRaw),
        image_url: imageUrl,
        description: document.getElementById('storeItemDescription').value.trim(),
        status_id: statusId,
        is_active: statusId === 1,
    };

    if (!payload.name || !payload.price || payload.price <= 0) {
        showStoreItemMessage('Nombre y precio válidos son requeridos.', true);
        return;
    }

    const response = await fetch('/.netlify/functions/store-admin?action=update-store-item', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-token': token,
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        showStoreItemMessage(data.error || 'No se pudo actualizar el item.', true);
        return;
    }

    showStoreItemMessage('Item actualizado.', false);
    pendingStoreItemImageFile = null;
    setTimeout(() => {
        closeStoreItemPanel();
    }, 600);
}

function deleteStoreItem(storeId, itemId) {
    const items = storeItemsCache[storeId] || [];
    const item = items.find((it) => String(it.id) === String(itemId));
    const itemName = String(item?.name || `#${itemId}`).replace(/</g, '&lt;');
    const price = Number(item?.price || 0);
    const quantityText = (item?.quantity === null || item?.quantity === undefined || Number(item?.quantity) === 0)
        ? 'Ilimitado'
        : Number(item?.quantity);

    const body = `
        <p>¿Está seguro que desea eliminar el item <strong>${itemName}</strong>?</p>
        <p><strong>Precio:</strong> ₡${price.toLocaleString('es-CR')} | <strong>Cantidad disponible:</strong> ${quantityText}</p>
        <p style="color:#c0392b; margin-top:8px;"><strong>⚠ Esta acción no se puede deshacer.</strong></p>
    `;

    const footer = `
        <button class="btn btn-secondary" onclick="closeGenericModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="confirmDeleteStoreItem('${storeId}', '${itemId}')">Sí, Eliminar</button>
    `;

    openGenericModal('Confirmar Eliminación', body, footer);
}

async function confirmDeleteStoreItem(storeId, itemId) {
    const modalBody = document.getElementById('genericModalBody');
    const modalFooter = document.getElementById('genericModalFooter');
    if (modalBody) modalBody.innerHTML = '<div class="spinner"></div><p>Eliminando item...</p>';
    if (modalFooter) modalFooter.innerHTML = '';

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const response = await fetch(`/.netlify/functions/store-admin?action=delete-store-item&id=${encodeURIComponent(itemId)}`, {
            method: 'DELETE',
            headers: { 'x-admin-token': session.token }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo eliminar el item.');
        }

        if (modalBody) modalBody.innerHTML = '✅ Item eliminado con éxito.';
        setTimeout(() => {
            closeGenericModal();
            viewStoreItems(storeId);
        }, 900);
    } catch (error) {
        if (modalBody) modalBody.innerHTML = `⚠️ Error al eliminar: ${error.message}`;
        if (modalFooter) modalFooter.innerHTML = '<button class="btn btn-secondary" onclick="closeGenericModal()">Cerrar</button>';
    }
}

function closeStoreItemPanel() {
    const gridView = document.getElementById('storeAdminGridView');
    const itemsDetailView = document.getElementById('storeItemsDetailView');
    const panel = document.getElementById('storeItemFormPanel');
    if (!panel) return;

    const isEditMode = Boolean(panel.dataset.itemId);
    const storeId = panel.dataset.storeId;
    panel.style.display = 'none';
    panel.innerHTML = '';
    delete panel.dataset.itemId;
    delete panel.dataset.storeId;

    if (isEditMode && itemsDetailView && storeId) {
        viewStoreItems(storeId);
        return;
    }

    if (gridView) gridView.style.display = 'block';
}

let storeAdminCache = {};

function toDatetimeLocalValue(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

function openEditStorePanel(storeId) {
    const gridView = document.getElementById('storeAdminGridView');
    const panel = document.getElementById('storeEditFormPanel');
    if (!gridView || !panel) return;

    const store = storeAdminCache[storeId] || {};

    gridView.style.display = 'none';
    panel.style.display = 'block';
    panel.dataset.storeId = storeId;
    panel.innerHTML = `
        <button onclick="closeEditStorePanel()" class="admin-btn-back">← Volver</button>
        <h3>Editar tienda</h3>
        <div class="floating-field">
            <input id="storeEditName" class="floating-input" type="text" placeholder=" " autocomplete="new-password" value="${String(store.nombre_tienda || '').replace(/"/g, '&quot;')}" />
            <label class="floating-label">Nombre</label>
        </div>
        <div class="floating-field">
            <select id="storeEditStatus" class="floating-input">
                <option value="draft" ${store.status === 'draft' ? 'selected' : ''}>Borrador</option>
                <option value="active" ${store.status === 'active' ? 'selected' : ''}>Activa</option>
                <option value="expired" ${store.status === 'expired' ? 'selected' : ''}>Expirada</option>
            </select>
            <label class="floating-label">Estado</label>
        </div>
        <div class="floating-field">
            <input id="storeEditActivatedAt" class="floating-input" type="datetime-local" placeholder=" " value="${toDatetimeLocalValue(store.activated_at)}" />
            <label class="floating-label">Activada en</label>
        </div>
        <div class="floating-field">
            <input id="storeEditExpiresAt" class="floating-input" type="datetime-local" placeholder=" " value="${toDatetimeLocalValue(store.expires_at)}" />
            <label class="floating-label">Expira en</label>
        </div>
        <button onclick="saveStoreEdit('${storeId}')"
            style="width:100%; padding:12px; background:var(--pink-accent); color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">
            Guardar Cambios
        </button>
        <div id="storeEditMessage"></div>
    `;
}

function closeEditStorePanel() {
    const gridView = document.getElementById('storeAdminGridView');
    const panel = document.getElementById('storeEditFormPanel');
    if (!gridView || !panel) return;
    panel.style.display = 'none';
    panel.innerHTML = '';
    gridView.style.display = 'block';
}

async function saveStoreEdit(storeId) {
    const session = getSession();
    const name = document.getElementById('storeEditName').value.trim();
    const status = document.getElementById('storeEditStatus').value;
    const activatedAt = fromDatetimeLocalValue(document.getElementById('storeEditActivatedAt').value);
    const expiresAt = fromDatetimeLocalValue(document.getElementById('storeEditExpiresAt').value);
    const messageEl = document.getElementById('storeEditMessage');

    if (!name) {
        if (messageEl) { messageEl.textContent = 'Ingresa un nombre para la tienda.'; messageEl.style.color = '#b00020'; }
        return;
    }

    const response = await fetch('/.netlify/functions/store-admin?action=update-store', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-token': session.token,
        },
        body: JSON.stringify({
            store_id: storeId,
            nombre_tienda: name,
            status,
            activated_at: activatedAt,
            expires_at: expiresAt,
        })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (messageEl) { messageEl.textContent = data.error || 'No se pudo actualizar la tienda.'; messageEl.style.color = '#b00020'; }
        return;
    }

    if (messageEl) { messageEl.textContent = 'Tienda actualizada.'; messageEl.style.color = '#2e7d32'; }
    setTimeout(() => {
        closeEditStorePanel();
        initStoreAdminPage();
    }, 600);
}

async function saveStoreItem(storeId, token) {
    const statusEl = document.getElementById('storeItemImageStatus');
    const urlHiddenInput = document.getElementById('storeItemImageUrl');

    let imageUrl = (urlHiddenInput?.value || '').trim();
    if (pendingStoreItemImageFile) {
        try {
            const itemName = document.getElementById('storeItemName')?.value || '';
            if (statusEl) {
                statusEl.textContent = 'Subiendo imagen...';
                statusEl.style.color = 'var(--brown-text)';
            }
            imageUrl = await uploadStoreItemImageFile(pendingStoreItemImageFile, token, itemName);
            if (urlHiddenInput) urlHiddenInput.value = imageUrl;
            if (statusEl) {
                statusEl.textContent = '✅ Imagen subida.';
                statusEl.style.color = '#28a745';
            }
        } catch (error) {
            if (statusEl) {
                statusEl.textContent = `Error: ${error.message}`;
                statusEl.style.color = 'red';
            }
            showStoreItemMessage(error.message, true);
            return;
        }
    }

    const quantityRaw = document.getElementById('storeItemQuantity').value;
    const statusId = Number(document.getElementById('storeItemStatusId')?.value || 1);
    const payload = {
        store_id: storeId,
        name: document.getElementById('storeItemName').value.trim(),
        price: Number(document.getElementById('storeItemPrice').value || 0),
        quantity: quantityRaw === '' ? 0 : Number(quantityRaw),
        image_url: imageUrl,
        description: document.getElementById('storeItemDescription').value.trim(),
        status_id: statusId,
        is_active: statusId === 1,
    };

    if (!payload.name || !payload.price || payload.price <= 0) {
        showStoreItemMessage('Nombre y precio válidos son requeridos.', true);
        return;
    }

    const response = await fetch('/.netlify/functions/store-admin?action=add-store-item', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-token': token,
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        showStoreItemMessage(data.error || 'Error al guardar el item.', true);
        return;
    }

    showStoreItemMessage('Item guardado correctamente.', false);
    pendingStoreItemImageFile = null;
    setTimeout(() => {
        const currentStoreId = document.getElementById('storeItemFormPanel')?.dataset?.storeId || storeId;
        if (currentStoreId) {
            openStoreItemPanel(currentStoreId);
        } else {
            closeStoreItemPanel();
        }
    }, 600);
}

function getSelectedStoreItemIds() {
    return Array.from(document.querySelectorAll('.row-selector:checked'))
        .map((checkbox) => String(checkbox.dataset.id));
}

function toggleStoreItemsMultiSelect(isMultiSelect) {
    const selectColumns = document.querySelectorAll('.col-select');
    selectColumns.forEach((col) => {
        col.style.display = isMultiSelect ? '' : 'none';
    });

    const actionContainer = document.getElementById('storeItemsMultiActionContainer');
    const label = document.getElementById('storeItemsMultiSelectLabel');

    if (!isMultiSelect) {
        document.querySelectorAll('.row-selector').forEach((chk) => {
            chk.checked = false;
        });

        const selectAllCheckbox = document.querySelector('.admin-main-header .col-select input[type="checkbox"]');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }
    }

    updateStoreItemsSelectionState();

    if (actionContainer && !isMultiSelect) {
        actionContainer.style.display = 'none';
    }

    if (label) {
        label.textContent = 'Seleccionar Varios';
    }
}

function toggleStoreItemsSelectAll(isChecked) {
    document.querySelectorAll('.row-selector').forEach((chk) => {
        chk.checked = isChecked;
    });
    updateStoreItemsSelectionState();
}

function updateStoreItemsSelectionState() {
    const selectedIds = getSelectedStoreItemIds();
    const actionContainer = document.getElementById('storeItemsMultiActionContainer');
    const label = document.getElementById('storeItemsMultiSelectLabel');
    const isMultiSelectActive = document.getElementById('storeItemsMultiSelectToggle')?.checked;

    if (!isMultiSelectActive) {
        if (actionContainer) actionContainer.style.display = 'none';
        if (label) label.textContent = 'Seleccionar Varios';
        return;
    }

    const hasSelection = selectedIds.length > 0;
    if (actionContainer) {
        actionContainer.style.display = hasSelection ? 'flex' : 'none';
    }

    if (label) {
        label.textContent = hasSelection ? `${selectedIds.length} Seleccionados` : 'Seleccionar Varios';
    }

    const selectAllCheckbox = document.querySelector('.admin-main-header .col-select input[type="checkbox"]');
    const allRowCheckboxes = document.querySelectorAll('.row-selector');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = allRowCheckboxes.length > 0 && selectedIds.length === allRowCheckboxes.length;
    }
}

function handleStoreItemsMultiDelete() {
    const selectedIds = getSelectedStoreItemIds();
    if (selectedIds.length === 0) return;

    const storeId = document.getElementById('storeItemsDetailView')?.dataset.storeId;
    const selectedItems = (storeItemsCache[storeId] || []).filter((item) => selectedIds.includes(String(item.id)));
    const groupedItems = new Map();

    selectedItems.forEach((item) => {
        const key = `${String(item.name || 'Sin nombre').replace(/</g, '&lt;')}-${Number(item.price || 0)}`;
        if (!groupedItems.has(key)) {
            groupedItems.set(key, {
                name: String(item.name || 'Sin nombre').replace(/</g, '&lt;'),
                price: Number(item.price || 0),
                count: 0
            });
        }
        groupedItems.get(key).count += 1;
    });

    const detailList = Array.from(groupedItems.values()).map((entry) => {
        const totalEntryValue = entry.price * entry.count;
        return `
            <div style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px; color:#5f3b2c;">
                <span><strong>${entry.count}x</strong> ${entry.name}</span>
                <span>₡${totalEntryValue.toLocaleString('es-CR')}</span>
            </div>
        `;
    }).join('');

    const title = 'Confirmar Eliminación';
    const body = `
        <p>¿Estás seguro de que deseas eliminar <strong>${selectedIds.length}</strong> items seleccionados? Esta acción no se puede deshacer.</p>
        <div style="margin-top:12px; padding-top:10px; border-top:1px solid #eee; color:#5f3b2c;">
            <div style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.03em; color:#8a5a49; margin-bottom:8px; font-weight:700;">Resumen</div>
            ${detailList || '<p style="margin:0;">Sin detalle disponible.</p>'}
        </div>
    `;

    const footer = `
        <button class="btn btn-secondary" onclick="closeGenericModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="confirmStoreItemsMultiDelete()">Eliminar</button>
    `;

    openGenericModal(title, body, footer);
}

async function confirmStoreItemsMultiDelete() {
    const idsToDelete = getSelectedStoreItemIds();
    if (idsToDelete.length === 0) {
        closeGenericModal();
        return;
    }

    const modalBody = document.getElementById('genericModalBody');
    const modalFooter = document.getElementById('genericModalFooter');
    if (modalBody) modalBody.innerHTML = `<div class="spinner"></div><p>Eliminando ${idsToDelete.length} items...</p>`;
    if (modalFooter) modalFooter.innerHTML = '';

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const deletePromises = idsToDelete.map((itemId) =>
            fetch(`/.netlify/functions/store-admin?action=delete-store-item&id=${encodeURIComponent(itemId)}`, {
                method: 'DELETE',
                headers: { 'x-admin-token': session.token }
            }).then(async (response) => {
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || 'No se pudo eliminar uno de los items.');
                }
            })
        );

        await Promise.all(deletePromises);

        if (modalBody) modalBody.innerHTML = `✅ Se eliminaron ${idsToDelete.length} items con éxito.`;
        setTimeout(() => {
            closeGenericModal();
            const storeId = document.getElementById('storeItemsDetailView')?.dataset.storeId;
            if (storeId) viewStoreItems(storeId);
        }, 1500);
    } catch (error) {
        if (modalBody) modalBody.innerHTML = `⚠️ Error al eliminar: ${error.message}`;
        if (modalFooter) modalFooter.innerHTML = '<button class="btn btn-secondary" onclick="closeGenericModal()">Cerrar</button>';
    }
}

async function viewStoreItems(storeId) {
    const session = getSession();
    const response = await fetch(`/.netlify/functions/store-admin?action=store-items&store_id=${encodeURIComponent(storeId)}`, {
        method: 'GET',
        headers: { 'x-admin-token': session.token }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        alert(data.error || 'No se pudieron cargar los items.');
        return;
    }

    const gridView = document.getElementById('storeAdminGridView');
    const detailView = document.getElementById('storeItemsDetailView');
    if (!gridView || !detailView) return;

    gridView.style.display = 'none';
    detailView.style.display = 'block';
    detailView.dataset.storeId = storeId;
    detailView.innerHTML = `
        <button onclick="closeStoreItemsPanel()" class="admin-btn-back">← Volver</button>
        <div class="store-item-detail-header">
            <div class="store-item-detail-title-wrap">
                <i class="fas fa-box" style="font-size:1.8rem; color:var(--pink-accent);"></i>
                <h3>Items de la tienda</h3>
            </div>
        </div>
        <div class="admin-multi-select-toolbar">
            <label for="storeItemsMultiSelectToggle">
                <input type="checkbox" id="storeItemsMultiSelectToggle" onchange="toggleStoreItemsMultiSelect(this.checked)">
                <span id="storeItemsMultiSelectLabel">Seleccionar Varios</span>
            </label>
            <div id="storeItemsMultiActionContainer" style="display: none;">
                <button id="storeItemsMultiDeleteBtn" class="admin-btn-action btn-delete" onclick="handleStoreItemsMultiDelete()" title="Eliminar Seleccionados"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
        <div class="admin-grid">
            <table class="admin-table">
                <thead>
                    <tr class="admin-main-header">
                        <th class="col-select" style="display: none;"><input type="checkbox" onchange="toggleStoreItemsSelectAll(this.checked)"></th>
                        <th>Foto</th>
                        <th>Nombre</th>
                        <th>Precio</th>
                        <th>Cant.</th>
                        <th>Estado</th>
                        <th>Descripción</th>
                        <th class="col-actions">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${(data.items || []).map(item => {
                        const imageButton = item.image_url
                            ? `<button type="button" class="admin-table-img-btn" data-image-url="${String(item.image_url || '').replace(/"/g, '&quot;')}" title="Ver imagen"><i class="fas fa-camera"></i></button>`
                            : '';
                        const itemIsActive = isStoreItemActive(item);

                        return `
                            <tr>
                                <td class="col-select" style="display: none;"><input type="checkbox" class="row-selector" data-id="${item.id}" onchange="updateStoreItemsSelectionState()"></td>
                                <td>${imageButton}</td>
                                <td class="store-name-cell">${item.name || 'Sin nombre'}</td>
                                <td>₡${Number(item.price || 0).toLocaleString('es-CR')}</td>
                                <td>${(item.quantity === null || item.quantity === undefined || Number(item.quantity) === 0) ? 'Ilimitado' : Number(item.quantity)}</td>
                                <td>${itemIsActive ? '<span style="color:#1f7a45; font-weight:700;">Activo</span>' : '<span style="color:#b23d3d; font-weight:700;">Desactivado</span>'}</td>
                                <td class="store-item-description">${item.description || 'Sin descripción'}</td>
                                <td class="admin-actions-cell col-actions">
                                    <button class="admin-btn-action btn-edit" title="Editar item" onclick="openEditStoreItemPanel('${storeId}', '${item.id}')"><i class="fas fa-pen"></i></button>
                                    <button class="admin-btn-action btn-delete" title="Eliminar item" onclick="deleteStoreItem('${storeId}', '${item.id}')"><i class="fas fa-trash-alt"></i></button>
                                </td>
                            </tr>
                        `;
                    }).join('') || `
                        <tr>
                            <td colspan="8" style="text-align:center; color:#7a5246; padding:1.2rem;">No hay items cargados.</td>
                        </tr>
                    `}
                </tbody>
            </table>
        </div>
    `;

    storeItemsCache[storeId] = data.items || [];

    detailView.querySelectorAll('.admin-table-img-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const src = button.dataset.imageUrl || '';
            if (src) openImageModal(src);
        });
    });

    toggleStoreItemsMultiSelect(document.getElementById('storeItemsMultiSelectToggle')?.checked || false);
}

function closeStoreItemsPanel() {
    const gridView = document.getElementById('storeAdminGridView');
    const detailView = document.getElementById('storeItemsDetailView');
    if (!gridView || !detailView) return;
    detailView.style.display = 'none';
    detailView.innerHTML = '';
    gridView.style.display = 'block';
}

async function viewStoreOrders(storeId) {
    const session = getSession();
    const response = await fetch(`/.netlify/functions/store-admin?action=store-orders-summary&store_id=${encodeURIComponent(storeId)}`, {
        method: 'GET',
        headers: { 'x-admin-token': session.token }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        alert(data.error || 'No se pudieron cargar las compras.');
        return;
    }

    const gridView = document.getElementById('storeAdminGridView');
    const detailView = document.getElementById('storeOrdersDetailView');
    if (!gridView || !detailView) return;

    gridView.style.display = 'none';
    detailView.style.display = 'block';
    detailView.innerHTML = `
        <button onclick="closeStoreOrdersPanel()" class="admin-btn-back">← Volver</button>
        <div class="store-item-detail-header">
            <div class="store-item-detail-title-wrap">
                <i class="fas fa-receipt" style="font-size:1.8rem; color:var(--pink-accent);"></i>
                <h3>Compras de la tienda</h3>
            </div>
        </div>
        <div class="admin-grid">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Foto</th>
                        <th>Artículo</th>
                        <th>Cantidad</th>
                    </tr>
                </thead>
                <tbody>
                    ${(data.items || []).map(item => {
                        const imageButton = item.image_url
                            ? `<button type="button" class="admin-table-img-btn" data-image-url="${String(item.image_url || '').replace(/"/g, '&quot;')}" title="Ver imagen"><i class="fas fa-camera"></i></button>`
                            : '';

                        return `
                            <tr>
                                <td>${imageButton}</td>
                                <td class="store-name-cell">${item.name || 'Sin nombre'}</td>
                                <td>${Number(item.total_quantity || 0)}</td>
                            </tr>
                        `;
                    }).join('') || `
                        <tr>
                            <td colspan="3" style="text-align:center; color:#7a5246; padding:1.2rem;">Aún no hay compras registradas.</td>
                        </tr>
                    `}
                </tbody>
            </table>
        </div>
    `;

    detailView.querySelectorAll('.admin-table-img-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const src = button.dataset.imageUrl || '';
            if (src) openImageModal(src);
        });
    });
}

let storeCustomerOrdersState = {
    storeId: null,
    customers: [],
    globalSearch: '',
    filters: {
        phone: '',
        items: '',
        total: ''
    },
    currentPage: 1,
    rowsPerPage: 10,
    showOnlyUncontacted: true
};

function isStoreCustomerUncontacted(customer) {
    const rawValue = customer?.contacted ?? customer?.contactado ?? customer?.confirmado ?? customer?.contact_status ?? customer?.status_contacted ?? customer?.contact_status_id;
    if (rawValue === undefined || rawValue === null || rawValue === '') {
        return true;
    }

    const normalized = String(rawValue).trim().toLowerCase();
    if (['true', '1', 'yes', 'si', 'sí', 'contactado', 'confirmado', 'closed', 'done', 'ok'].includes(normalized)) {
        return false;
    }

    if (['false', '0', 'no', 'pending', 'sin_contactar', 'sin contactar', 'uncontacted', 'not_contacted', 'not contacted'].includes(normalized)) {
        return true;
    }

    return !Boolean(rawValue);
}

function normalizeStoreCustomerOrdersSearch(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function normalizeStorePhoneDigits(value) {
    return String(value || '').replace(/\D/g, '');
}

function getLast4PhoneDigits(value) {
    const digits = normalizeStorePhoneDigits(value);
    return digits.slice(-4);
}

async function openStoreCustomerLinkModal(phoneValue) {
    const phone = String(phoneValue || '').trim();
    const session = getSession();
    if (!session) {
        alert('Debes iniciar sesión para vincular clientes.');
        return;
    }

    try {
        const response = await fetch(`/.netlify/functions/store-admin?action=find-client-matches&phone=${encodeURIComponent(phone)}`, {
            method: 'GET',
            headers: { 'x-admin-token': session.token }
        });
        const data = await response.json().catch(() => ({ matches: [] }));
        const matches = Array.isArray(data.matches) ? data.matches : [];

        if (!matches.length) {
            openGenericModal(
                'Cliente no encontrado',
                `
                    <div style="display:grid; gap:1rem;">
                        <p style="margin:0; color:#5c3d34; font-weight:600;">No encontramos un cliente relacionado con este teléfono: <strong>${phone}</strong>.</p>
                        <p style="margin:0; color:#7b4d54;">Si es un cliente nuevo, puedes crearlo y vincularlo inmediatamente.</p>
                    </div>
                `,
                `
                    <button class="btn btn-secondary" type="button" onclick="closeGenericModal()">Cancelar</button>
                    <button class="btn btn-primary" type="button" onclick="openStoreCustomerCreateModal('${String(phone).replace(/'/g, "\\'")}')">Crear nuevo cliente</button>
                `
            );
            return;
        }

        const options = matches.map((client) => `
            <option value="${client.id}">
                ${client.name || 'Cliente sin nombre'} · ${client.phone || 'Sin teléfono'}
            </option>
        `).join('');

        openGenericModal(
            'Vincular cliente',
            `
                <div style="display:grid; gap:1rem;">
                    <p style="margin:0; color:#5c3d34; font-weight:600;">Hay varios clientes con coincidencia por teléfono o terminación.</p>
                    <label style="display:grid; gap:0.45rem; font-size:0.95rem; color:#5c3d34; font-weight:700;">
                        Selecciona un cliente:
                        <select id="storeCustomerMatchSelect" style="width:100%; padding:0.8rem 0.9rem; border-radius:12px; border:1px solid #f1c9d1; background:#fff; color:#412c2d; font-size:1rem;">
                            ${options}
                        </select>
                    </label>
                    <button class="btn btn-secondary" type="button" onclick="openStoreCustomerCreateModal('${String(phone).replace(/'/g, "\\'")}')" style="justify-self:start;">Cliente nuevo</button>
                </div>
            `,
            `
                <button class="btn btn-secondary" type="button" onclick="closeGenericModal()">Cancelar</button>
                <button class="btn btn-primary" type="button" onclick="confirmStoreCustomerLink('${String(phone).replace(/'/g, "\\'")}')">Guardar</button>
            `
        );
    } catch (error) {
        openGenericModal(
            'No se pudo buscar cliente',
            `<p style="margin:0; color:#5c3d34;">${error.message || 'Error al buscar coincidencias.'}</p>`,
            '<button class="btn btn-secondary" type="button" onclick="closeGenericModal()">Cerrar</button>'
        );
    }
}

async function confirmStoreCustomerLink(phoneValue) {
    const select = document.getElementById('storeCustomerMatchSelect');
    const clientId = select?.value;
    if (!clientId) {
        alert('Debes seleccionar un cliente.');
        return;
    }

    const session = getSession();
    const response = await fetch('/.netlify/functions/store-admin', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-token': session.token,
        },
        body: JSON.stringify({
            action: 'link-store-orders-client',
            phone: phoneValue,
            client_id: clientId,
        })
    });
    const data = await response.json().catch(() => ({ error: 'Error al vincular cliente.' }));
    closeGenericModal();
    if (!response.ok) {
        openGenericModal(
            'No se pudo vincular',
            `<p style="margin:0; color:#5c3d34;">${data.error || 'No se pudo vincular el cliente.'}</p>`,
            '<button class="btn btn-primary" type="button" onclick="closeGenericModal()">OK</button>'
        );
        return;
    }

    openGenericModal(
        'Cliente vinculado',
        '<p style="margin:0; color:#5c3d34;">Cliente vinculado correctamente.</p>',
        '<button class="btn btn-primary" type="button" onclick="closeGenericModal(); const storeId = storeCustomerOrdersState.storeId; if (storeId) viewStoreCustomerOrders(storeId);">OK</button>'
    );
}

function openStoreCustomerCreateModal(phoneValue) {
    const safePhone = String(phoneValue || '').trim();
    closeGenericModal();
    openGenericModal(
        'Crear cliente nuevo',
        `
            <div style="display:grid; gap:1rem;">
                <label style="display:grid; gap:0.4rem; font-size:0.95rem; color:#5c3d34; font-weight:700;">
                    Nombre del cliente
                    <input id="storeCustomerNewName" type="text" value="" placeholder="Ej: Michael" style="padding:0.8rem 0.9rem; border-radius:12px; border:1px solid #f1c9d1; background:#fff; color:#412c2d; font-size:1rem;" />
                </label>
                <label style="display:grid; gap:0.4rem; font-size:0.95rem; color:#5c3d34; font-weight:700;">
                    Teléfono
                    <input id="storeCustomerNewPhone" type="text" value="${safePhone}" placeholder="Ej: 0204 o 8326-0204" style="padding:0.8rem 0.9rem; border-radius:12px; border:1px solid #f1c9d1; background:#fff; color:#412c2d; font-size:1rem;" />
                </label>
            </div>
        `,
        `
            <button class="btn btn-secondary" type="button" onclick="closeGenericModal()">Cancelar</button>
            <button class="btn btn-primary" type="button" onclick="saveStoreCustomerFromModal('${safePhone.replace(/'/g, "\\'")}')">Guardar</button>
        `
    );
}

async function saveStoreCustomerFromModal(phoneValue) {
    const nameInput = document.getElementById('storeCustomerNewName');
    const phoneInput = document.getElementById('storeCustomerNewPhone');
    const name = String(nameInput?.value || '').trim();
    const phone = String(phoneInput?.value || '').trim();
    if (!name || !phone) {
        alert('Debes ingresar nombre y teléfono.');
        return;
    }

    const session = getSession();
    const response = await fetch('/.netlify/functions/store-admin', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-token': session.token,
        },
        body: JSON.stringify({
            action: 'create-client-match',
            name,
            phone,
            status_id: 1,
        })
    });
    const data = await response.json().catch(() => ({ error: 'Error al crear el cliente.' }));
    closeGenericModal();
    if (!response.ok) {
        openGenericModal(
            'No se pudo crear',
            `<p style="margin:0; color:#5c3d34;">${data.error || 'No se pudo crear el cliente.'}</p>`,
            '<button class="btn btn-primary" type="button" onclick="closeGenericModal()">OK</button>'
        );
        return;
    }

    const clientId = data.client && data.client.id;
    let successMessage = `Cliente ${name} guardado correctamente.`;
    if (clientId) {
        const linkRes = await fetch('/.netlify/functions/store-admin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': session.token,
            },
            body: JSON.stringify({
                action: 'link-store-orders-client',
                phone,
                client_id: clientId,
            })
        });
        await linkRes.json().catch(() => ({}));
        successMessage = `Cliente ${name} guardado y vinculado correctamente.`;
    }

    openGenericModal(
        'Cliente guardado',
        `<p style="margin:0; color:#5c3d34;">${successMessage}</p>`,
        '<button class="btn btn-primary" type="button" onclick="closeGenericModal(); const storeId = storeCustomerOrdersState.storeId; if (storeId) viewStoreCustomerOrders(storeId);">OK</button>'
    );
}

function getFilteredStoreCustomerOrders(customers) {
    const searchTerm = normalizeStoreCustomerOrdersSearch(storeCustomerOrdersState.globalSearch);
    const phoneFilter = normalizeStoreCustomerOrdersSearch(storeCustomerOrdersState.filters.phone);
    const clientFilter = normalizeStoreCustomerOrdersSearch(storeCustomerOrdersState.filters.client);
    const itemsFilter = normalizeStoreCustomerOrdersSearch(storeCustomerOrdersState.filters.items);
    const totalFilter = normalizeStoreCustomerOrdersSearch(storeCustomerOrdersState.filters.total);
    const onlyUncontacted = storeCustomerOrdersState.showOnlyUncontacted !== false;

    return customers.filter((customer) => {
        const phone = String(customer.phone || customer.phone_digits || 'Sin teléfono');
        const clientName = String(customer.client_name || 'Sin cliente');
        const clientMeta = customer.is_matched ? 'Matcheado' : 'Sin match';
        const itemText = (customer.items || []).map((item) => `${item.name || ''} ${item.quantity || ''}`).join(' ');
        const totalText = String(Number(customer.total_quantity || 0));
        const matchesContactStatus = !onlyUncontacted || isStoreCustomerUncontacted(customer);

        const matchesSearch = !searchTerm || [phone, clientName, clientMeta, itemText, totalText].some((value) => normalizeStoreCustomerOrdersSearch(value).includes(searchTerm));
        const matchesPhone = !phoneFilter || normalizeStoreCustomerOrdersSearch(phone).includes(phoneFilter);
        const matchesClient = !clientFilter || normalizeStoreCustomerOrdersSearch(clientName).includes(clientFilter) || normalizeStoreCustomerOrdersSearch(clientMeta).includes(clientFilter);
        const matchesItems = !itemsFilter || normalizeStoreCustomerOrdersSearch(itemText).includes(itemsFilter);
        const matchesTotal = !totalFilter || totalText.includes(totalFilter);

        return matchesContactStatus && matchesSearch && matchesPhone && matchesClient && matchesItems && matchesTotal;
    });
}

function renderStoreCustomerOrdersTable() {
    const detailView = document.getElementById('storeOrdersDetailView');
    if (!detailView) return;

    const customers = storeCustomerOrdersState.customers || [];
    const filteredCustomers = getFilteredStoreCustomerOrders(customers);
    let totalRows = filteredCustomers.length;
    const totalPages = storeCustomerOrdersState.rowsPerPage === -1 ? 1 : Math.max(1, Math.ceil(totalRows / storeCustomerOrdersState.rowsPerPage));
    if (storeCustomerOrdersState.currentPage > totalPages) {
        storeCustomerOrdersState.currentPage = totalPages;
    }
    if (storeCustomerOrdersState.currentPage < 1) {
        storeCustomerOrdersState.currentPage = 1;
    }

    const startIndex = storeCustomerOrdersState.rowsPerPage === -1 ? 0 : (storeCustomerOrdersState.currentPage - 1) * storeCustomerOrdersState.rowsPerPage;
    const endIndex = storeCustomerOrdersState.rowsPerPage === -1 ? totalRows : startIndex + storeCustomerOrdersState.rowsPerPage;
    const paginatedCustomers = filteredCustomers.slice(startIndex, endIndex);

    const searchInput = document.getElementById('storeCustomerOrdersSearchInput');
    const clientInput = document.getElementById('storeCustomerOrdersClientFilter');
    const itemsInput = document.getElementById('storeCustomerOrdersItemsFilter');
    const totalInput = document.getElementById('storeCustomerOrdersTotalFilter');
    const rowsPerPageSelect = document.getElementById('storeCustomerOrdersRowsPerPage');
    const paginationInfo = document.getElementById('storeCustomerOrdersPaginationInfo');
    const paginationNav = document.getElementById('storeCustomerOrdersPaginationNav');
    const paginationContainer = document.getElementById('storeCustomerOrdersPaginationContainer');
    const tableBody = document.getElementById('storeCustomerOrdersTableBody');

    if (!searchInput || !clientInput || !itemsInput || !totalInput || !tableBody || !rowsPerPageSelect || !paginationInfo || !paginationNav || !paginationContainer) {
        detailView.innerHTML = `
            <button onclick="closeStoreOrdersPanel()" class="admin-btn-back">← Volver</button>
            <div class="store-item-detail-header">
                <div class="store-item-detail-title-wrap">
                    <i class="fas fa-user" style="font-size:1.8rem; color:var(--pink-accent);"></i>
                    <h3>Clientes con compras</h3>
                </div>
            </div>
            <div class="admin-search-bar" style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                <input id="storeCustomerOrdersSearchInput" type="text" placeholder="🔍 Buscar por cliente, teléfono, item o total..." value="${String(storeCustomerOrdersState.globalSearch || '').replace(/"/g, '&quot;')}" oninput="setStoreCustomerOrdersGlobalSearch(this.value)" style="flex:1 1 280px; min-width:220px;" />
                <button type="button" class="btn btn-secondary" onclick="resetStoreCustomerOrdersFilters()" style="display:inline-flex; align-items:center; justify-content:center; gap:0.45rem; white-space:nowrap;">
                    <i class="fas fa-broom" aria-hidden="true"></i>
                    <span>Limpiar todo</span>
                </button>
            </div>
            <div class="admin-filter-chips">
                <label class="admin-filter-option">
                    <input type="radio" name="storeCustomerOrdersContactFilter" value="pending" ${storeCustomerOrdersState.showOnlyUncontacted !== false ? 'checked' : ''} onchange="setStoreCustomerOrdersContactFilter(true)" />
                    <span>Solo sin contactar</span>
                </label>
                <label class="admin-filter-option">
                    <input type="radio" name="storeCustomerOrdersContactFilter" value="all" ${storeCustomerOrdersState.showOnlyUncontacted === false ? 'checked' : ''} onchange="setStoreCustomerOrdersContactFilter(false)" />
                    <span>Mostrar todos</span>
                </label>
            </div>
            <div class="admin-grid">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Cliente</th>
                            <th>Items solicitados</th>
                            <th>Totales</th>
                            <th>Acción</th>
                        </tr>
                        <tr class="admin-filter-row">
                            <td><input id="storeCustomerOrdersClientFilter" type="text" placeholder="Filtrar..." value="${String(storeCustomerOrdersState.filters.client || '').replace(/"/g, '&quot;')}" oninput="setStoreCustomerOrdersColumnFilter('client', this.value)" /></td>
                            <td><input id="storeCustomerOrdersItemsFilter" type="text" placeholder="Filtrar..." value="${String(storeCustomerOrdersState.filters.items || '').replace(/"/g, '&quot;')}" oninput="setStoreCustomerOrdersColumnFilter('items', this.value)" /></td>
                            <td><input id="storeCustomerOrdersTotalFilter" type="text" placeholder="Filtrar..." value="${String(storeCustomerOrdersState.filters.total || '').replace(/"/g, '&quot;')}" oninput="setStoreCustomerOrdersColumnFilter('total', this.value)" /></td>
                            <td class="col-actions"></td>
                        </tr>
                    </thead>
                    <tbody id="storeCustomerOrdersTableBody">
                        ${paginatedCustomers.length ? paginatedCustomers.map((customer) => {
                            const phoneDigits = normalizeStoreClientPhoneForWa(customer.phone_digits || customer.phone || '');
                            const customerItems = customer.items || [];
                            const totalAmount = customerItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unit_price || item.price || 0)), 0);
                            const fiftyPercentAmount = totalAmount / 2;
                            const reminderLine = `Recorda que el monto total es ${formatStoreCurrency(totalAmount)} y el monto del 50% es ${formatStoreCurrency(fiftyPercentAmount)}`;
                            const adminSummary = customerItems.map((item) => `- ${item.name || 'Item'}: ${Number(item.quantity || 0)} x ${formatStoreCurrency(Number(item.unit_price || item.price || 0))}`).join('\n');
                            const waText = encodeURIComponent(`Hola!\n\nYa agregamos tu pedido.\n\n${reminderLine}\n\nLo que incluimos fue lo siguiente:\n\n${adminSummary || '- Productos sin detalle'}\n\nMuchas gracias por tu compra.`);
                            const waLink = phoneDigits ? `https://wa.me/${phoneDigits}?text=${waText}` : '#';
                            const itemList = customerItems.map((item) => `<div>${item.name || 'Sin nombre'}: ${Number(item.quantity || 0)}</div>`).join('');
                            const phoneValue = String(customer.phone || '');
                            const orderGroupId = String(customer.order_group_id || '');
                            const isMatched = Boolean(customer.is_matched && customer.client_name);
                            const clientName = isMatched ? customer.client_name : 'SIN MATCH';
                            const clientPhone = isMatched ? (customer.client_phone || customer.phone || 'Sin teléfono') : (customer.phone || customer.phone_digits || 'Sin teléfono');
                            return `
                                <tr>
                                    <td>
                                        ${isMatched ? `
                                            <div class="store-client-name">${clientName}</div>
                                            <small class="store-client-meta">${clientPhone}</small>
                                        ` : `
                                            <div class="store-match-badge unmatched">SIN MATCH</div>
                                            <small class="store-client-meta">${clientPhone}</small>
                                        `}
                                    </td>
                                    <td>${itemList || '<span style="color:#7a5246;">Sin items</span>'}</td>
                                    <td>${Number(customer.total_quantity || 0)}</td>
                                    <td class="admin-actions-cell">
                                        <span class="admin-actions-inline">
                                            <button class="admin-btn-action btn-edit" type="button" title="Vincular cliente" onclick="openStoreCustomerLinkModal('${phoneValue.replace(/'/g, "\\'")}')" aria-label="Vincular cliente">
                                                <i class="fas fa-user-plus"></i>
                                            </button>
                                            <button class="admin-btn-action btn-copy" type="button" title="Reconfirmar por WhatsApp" onclick="markStoreCustomerOrdersAsContacted('${phoneValue.replace(/'/g, "\\'")}', '${waLink.replace(/'/g, "\\'")}', '${orderGroupId.replace(/'/g, "\\'")}')" aria-label="Reconfirmar por WhatsApp">
                                                <i class="fab fa-whatsapp"></i>
                                            </button>
                                        </span>
                                    </td>
                                </tr>
                            `;
                        }).join('') : `
                            <tr>
                                <td colspan="4" style="text-align:center; color:#7a5246; padding:1.2rem;">No se encontraron clientes con esa búsqueda.</td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </div>
            <div class="admin-pagination-container order-pagination-layout" id="storeCustomerOrdersPaginationContainer" style="margin-top: 1rem; ${totalRows <= 10 ? 'display:none;' : ''}">
                <div class="pagination-info" id="storeCustomerOrdersPaginationInfo">
                    Mostrando <strong>${totalRows === 0 ? 0 : startIndex + 1}</strong> - <strong>${Math.min(endIndex, totalRows)}</strong> de <strong>${totalRows}</strong>
                </div>
                <div class="pagination-rows-selector order-pagination-rows">
                    <span>Filas:</span>
                    <select id="storeCustomerOrdersRowsPerPage" onchange="changeStoreCustomerOrdersRowsPerPage(this.value)">
                        <option value="10" ${storeCustomerOrdersState.rowsPerPage === 10 ? 'selected' : ''}>10</option>
                        <option value="30" ${storeCustomerOrdersState.rowsPerPage === 30 ? 'selected' : ''}>30</option>
                        <option value="50" ${storeCustomerOrdersState.rowsPerPage === 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${storeCustomerOrdersState.rowsPerPage === 100 ? 'selected' : ''}>100</option>
                        <option value="-1" ${storeCustomerOrdersState.rowsPerPage === -1 ? 'selected' : ''}>Todos</option>
                    </select>
                </div>
                <div class="pagination-nav" id="storeCustomerOrdersPaginationNav">
                    <button type="button" onclick="changeStoreCustomerOrdersPage(${storeCustomerOrdersState.currentPage - 1})" ${storeCustomerOrdersState.currentPage <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
                    <span>Página <strong>${storeCustomerOrdersState.currentPage}</strong> de ${totalPages}</span>
                    <button type="button" onclick="changeStoreCustomerOrdersPage(${storeCustomerOrdersState.currentPage + 1})" ${storeCustomerOrdersState.currentPage >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
                </div>
            </div>
        `;
        return;
    }

    if (searchInput) searchInput.value = storeCustomerOrdersState.globalSearch || '';
    if (clientInput) clientInput.value = storeCustomerOrdersState.filters.client || '';
    if (itemsInput) itemsInput.value = storeCustomerOrdersState.filters.items || '';
    if (totalInput) totalInput.value = storeCustomerOrdersState.filters.total || '';
    document.querySelectorAll('input[name="storeCustomerOrdersContactFilter"]').forEach((radio) => {
        radio.checked = radio.value === 'pending'
            ? storeCustomerOrdersState.showOnlyUncontacted !== false
            : storeCustomerOrdersState.showOnlyUncontacted === false;
    });

    tableBody.innerHTML = paginatedCustomers.length ? paginatedCustomers.map((customer) => {
        const phoneDigits = normalizeStoreClientPhoneForWa(customer.phone_digits || customer.phone || '');
        const customerItems = customer.items || [];
        const totalAmount = customerItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unit_price || item.price || 0)), 0);
        const fiftyPercentAmount = totalAmount / 2;
        const reminderLine = `Recorda que el monto total es ${formatStoreCurrency(totalAmount)} y el monto del 50% es ${formatStoreCurrency(fiftyPercentAmount)}`;
        const adminSummary = customerItems.map((item) => `- ${item.name || 'Item'}: ${Number(item.quantity || 0)} x ${formatStoreCurrency(Number(item.unit_price || item.price || 0))}`).join('\n');
        const waText = encodeURIComponent(`Hola!\n\nYa agregamos tu pedido.\n\n${reminderLine}\n\nLo que incluimos fue lo siguiente:\n\n${adminSummary || '- Productos sin detalle'}\n\nMuchas gracias por tu compra.`);
        const waLink = phoneDigits ? `https://wa.me/${phoneDigits}?text=${waText}` : '#';
        const itemList = customerItems.map((item) => `<div>${item.name || 'Sin nombre'}: ${Number(item.quantity || 0)}</div>`).join('');
        const phoneValue = String(customer.phone || '');
        const orderGroupId = String(customer.order_group_id || '');
        const isMatched = Boolean(customer.is_matched && customer.client_name);
        const clientName = isMatched ? customer.client_name : 'SIN MATCH';
        const clientPhone = isMatched ? (customer.client_phone || customer.phone || 'Sin teléfono') : (customer.phone || customer.phone_digits || 'Sin teléfono');
        return `
            <tr>
                <td>
                    ${isMatched ? `
                        <div class="store-client-name">${clientName}</div>
                        <small class="store-client-meta">${clientPhone}</small>
                    ` : `
                        <div class="store-match-badge unmatched">SIN MATCH</div>
                        <small class="store-client-meta">${clientPhone}</small>
                    `}
                </td>
                <td>${itemList || '<span style="color:#7a5246;">Sin items</span>'}</td>
                <td>${Number(customer.total_quantity || 0)}</td>
                <td class="admin-actions-cell">
                    <span class="admin-actions-inline">
                        <button class="admin-btn-action btn-edit" type="button" title="Vincular cliente" onclick="openStoreCustomerLinkModal('${phoneValue.replace(/'/g, "\\'")}')" aria-label="Vincular cliente">
                            <i class="fas fa-user-plus"></i>
                        </button>
                        <button class="admin-btn-action btn-copy" type="button" title="Reconfirmar por WhatsApp" onclick="markStoreCustomerOrdersAsContacted('${phoneValue.replace(/'/g, "\\'")}', '${waLink.replace(/'/g, "\\'")}', '${orderGroupId.replace(/'/g, "\\'")}')" aria-label="Reconfirmar por WhatsApp">
                            <i class="fab fa-whatsapp"></i>
                        </button>
                    </span>
                </td>
            </tr>
        `;
    }).join('') : `
        <tr>
            <td colspan="4" style="text-align:center; color:#7a5246; padding:1.2rem;">No se encontraron clientes con esa búsqueda.</td>
        </tr>
    `;

    rowsPerPageSelect.value = String(storeCustomerOrdersState.rowsPerPage);
    paginationInfo.innerHTML = `Mostrando <strong>${totalRows === 0 ? 0 : startIndex + 1}</strong> - <strong>${Math.min(endIndex, totalRows)}</strong> de <strong>${totalRows}</strong>`;
    paginationContainer.style.display = totalRows <= 10 ? 'none' : '';
    paginationNav.innerHTML = `
        <button type="button" onclick="changeStoreCustomerOrdersPage(${storeCustomerOrdersState.currentPage - 1})" ${storeCustomerOrdersState.currentPage <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
        <span>Página <strong>${storeCustomerOrdersState.currentPage}</strong> de ${totalPages}</span>
        <button type="button" onclick="changeStoreCustomerOrdersPage(${storeCustomerOrdersState.currentPage + 1})" ${storeCustomerOrdersState.currentPage >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
    `;
}

async function markStoreCustomerOrdersAsContacted(phoneValue, waLink, orderGroupId) {
    const session = getSession();
    const cleanedPhone = String(phoneValue || '').trim();
    const cleanedOrderGroupId = orderGroupId ? String(orderGroupId).trim() : null;

    try {
        if (!session || !cleanedPhone) {
            throw new Error('No hay sesión activa o falta el teléfono');
        }

        const response = await fetch('/.netlify/functions/store-admin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': session.token,
            },
            body: JSON.stringify({
                action: 'mark-store-customer-contacted',
                phone: cleanedPhone,
                order_group_id: cleanedOrderGroupId,
            })
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result?.error || 'No se pudo guardar el estado CONTACTED en la base de datos.');
        }

        if (waLink && waLink !== '#') {
            window.open(waLink, '_blank', 'noopener,noreferrer');
        }

        const storeId = storeCustomerOrdersState.storeId;
        if (storeId) {
            setTimeout(() => viewStoreCustomerOrders(storeId), 250);
        } else {
            setTimeout(() => window.location.reload(), 250);
        }
    } catch (error) {
        const message = error?.message || 'No se pudo marcar como CONTACTED.';
        if (typeof openGenericModal === 'function') {
            openGenericModal('No se pudo actualizar la orden', `<p>${message}</p>`, '<button class="btn btn-secondary" type="button" onclick="closeGenericModal()">Cerrar</button>');
        } else {
            console.error(message);
        }
    }
}

function resetStoreCustomerOrdersFilters() {
    storeCustomerOrdersState.globalSearch = '';
    storeCustomerOrdersState.filters = { client: '', phone: '', items: '', total: '' };
    storeCustomerOrdersState.currentPage = 1;
    storeCustomerOrdersState.rowsPerPage = 10;
    storeCustomerOrdersState.showOnlyUncontacted = true;

    const searchInput = document.getElementById('storeCustomerOrdersSearchInput');
    if (searchInput) searchInput.value = '';

    const clientInput = document.getElementById('storeCustomerOrdersClientFilter');
    const itemsInput = document.getElementById('storeCustomerOrdersItemsFilter');
    const totalInput = document.getElementById('storeCustomerOrdersTotalFilter');
    const rowsPerPageSelect = document.getElementById('storeCustomerOrdersRowsPerPage');

    if (clientInput) clientInput.value = '';
    if (itemsInput) itemsInput.value = '';
    if (totalInput) totalInput.value = '';
    if (rowsPerPageSelect) rowsPerPageSelect.value = '10';

    document.querySelectorAll('input[name="storeCustomerOrdersContactFilter"]').forEach((radio) => {
        radio.checked = radio.value === 'pending';
    });

    renderStoreCustomerOrdersTable();
}

function setStoreCustomerOrdersGlobalSearch(value) {
    storeCustomerOrdersState.globalSearch = value;
    storeCustomerOrdersState.currentPage = 1;
    renderStoreCustomerOrdersTable();
}

function setStoreCustomerOrdersContactFilter(showOnlyUncontacted) {
    storeCustomerOrdersState.showOnlyUncontacted = Boolean(showOnlyUncontacted);
    storeCustomerOrdersState.currentPage = 1;
    renderStoreCustomerOrdersTable();
}

function setStoreCustomerOrdersColumnFilter(column, value) {
    storeCustomerOrdersState.filters[column] = value;
    storeCustomerOrdersState.currentPage = 1;
    renderStoreCustomerOrdersTable();
}

function changeStoreCustomerOrdersPage(page) {
    if (page < 1) return;
    const totalPages = storeCustomerOrdersState.rowsPerPage === -1 ? 1 : Math.max(1, Math.ceil(getFilteredStoreCustomerOrders(storeCustomerOrdersState.customers).length / storeCustomerOrdersState.rowsPerPage));
    if (page > totalPages) return;
    storeCustomerOrdersState.currentPage = page;
    renderStoreCustomerOrdersTable();
}

function changeStoreCustomerOrdersRowsPerPage(value) {
    const parsed = Number(value);
    storeCustomerOrdersState.rowsPerPage = Number.isFinite(parsed) ? parsed : 10;
    storeCustomerOrdersState.currentPage = 1;
    renderStoreCustomerOrdersTable();
}

async function viewStoreCustomerOrders(storeId) {
    const session = getSession();
    const response = await fetch(`/.netlify/functions/store-admin?action=store-customer-orders&store_id=${encodeURIComponent(storeId)}`, {
        method: 'GET',
        headers: { 'x-admin-token': session.token }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        alert(data.error || 'No se pudieron cargar las compras por cliente.');
        return;
    }

    const gridView = document.getElementById('storeAdminGridView');
    const detailView = document.getElementById('storeOrdersDetailView');
    if (!gridView || !detailView) return;

    const customers = Array.isArray(data.customers) ? data.customers : [];
    storeCustomerOrdersState = {
        storeId,
        customers,
        globalSearch: '',
        filters: { client: '', phone: '', items: '', total: '' },
        currentPage: 1,
        rowsPerPage: 10,
        showOnlyUncontacted: true
    };

    gridView.style.display = 'none';
    detailView.style.display = 'block';
    renderStoreCustomerOrdersTable();
}

function closeStoreOrdersPanel() {
    const gridView = document.getElementById('storeAdminGridView');
    const detailView = document.getElementById('storeOrdersDetailView');
    if (!gridView || !detailView) return;
    detailView.style.display = 'none';
    detailView.innerHTML = '';
    gridView.style.display = 'block';
}

function showStoreAdminMessage(msg, isError) {
    const el = document.getElementById('storeAdminMessage');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? '#b00020' : '#2e7d32';
}

function showStoreItemMessage(msg, isError) {
    const el = document.getElementById('storeItemMessage');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? '#b00020' : '#2e7d32';
}

let storeAdminRefreshTimer = null;

function startStoreAdminAutoRefresh() {
    // Auto-refresh deshabilitado: recargaba la lista mientras se veían
    // detalles (items/compras), interrumpiendo la vista del admin.
}

async function initStoreAdminPage() {
    const session = getSession();
    const root = document.getElementById('storeAdminPage');
    if (!root) return;

    if (!session) {
        root.innerHTML = '<p>Debes iniciar sesión para administrar tiendas.</p>';
        return;
    }

    root.innerHTML = `
        <div id="storeAdminGridView">
            <div class="admin-header">
                <h2>🛍️ STORE-ADMIN</h2>
                <p>Cargando tiendas...</p>
            </div>
            <div class="admin-search-bar">
                <input id="storeNameInput" type="text" placeholder="Nombre de la nueva tienda" autocomplete="new-password" disabled />
                <button class="admin-btn-agregar" disabled>+ Nueva tienda</button>
            </div>
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:2rem 1rem; gap:0.75rem; color:#7a5246;">
                <div class="spinner"></div>
                <p style="margin:0; font-weight:600;">Cargando tiendas...</p>
            </div>
        </div>
        <div id="storeItemsDetailView" class="store-items-detail-view" style="display:none;"></div>
        <div id="storeOrdersDetailView" class="store-items-detail-view" style="display:none;"></div>
        <div id="storeItemFormPanel" class="store-item-panel" style="display:none;"></div>
        <div id="storeEditFormPanel" class="store-item-panel" style="display:none;"></div>
    `;

    const [stores] = await Promise.all([
        fetchStoreAdminData().catch((error) => {
            root.innerHTML = `<p style="color:red;">${error.message}</p>`;
            return [];
        }),
        syncStoreStatusFromTimestamps().catch(() => null)
    ]);

    root.innerHTML = `
        <div id="storeAdminGridView">
            <div class="admin-header">
                <h2>🛍️ STORE-ADMIN</h2>
                <p>Gestiona tiendas, activación y catalogación.</p>
            </div>
            <div class="admin-search-bar">
                <input id="storeNameInput" type="text" placeholder="Nombre de la nueva tienda" autocomplete="new-password" />
                <button class="admin-btn-agregar" onclick="createStoreFromAdmin()">+ Nueva tienda</button>
            </div>
            <div id="storeAdminMessage" style="margin: 0.8rem 0; font-weight: bold;"></div>
            <div id="storeAdminGrid" class="store-admin-grid"></div>
        </div>
        <div id="storeItemsDetailView" class="store-items-detail-view" style="display:none;"></div>
        <div id="storeOrdersDetailView" class="store-items-detail-view" style="display:none;"></div>
        <div id="storeItemFormPanel" class="store-item-panel" style="display:none;"></div>
        <div id="storeEditFormPanel" class="store-item-panel" style="display:none;"></div>
    `;

    renderStoreAdminList(stores);
    startStoreAdminAutoRefresh();
}

window.initStoreAdminPage = initStoreAdminPage;
window.syncStoreStatusFromTimestamps = syncStoreStatusFromTimestamps;
window.createStoreFromAdmin = createStoreFromAdmin;
window.activateStoreById = activateStoreById;
window.reopenStoreById = reopenStoreById;
window.copyStoreLink = copyStoreLink;
window.openStorePublicLink = openStorePublicLink;
window.openStoreItemPanel = openStoreItemPanel;
window.closeStoreItemPanel = closeStoreItemPanel;
window.openEditStorePanel = openEditStorePanel;
window.closeEditStorePanel = closeEditStorePanel;
window.saveStoreEdit = saveStoreEdit;
window.viewStoreOrders = viewStoreOrders;
window.viewStoreCustomerOrders = viewStoreCustomerOrders;
window.openStoreOrdersAdminPage = openStoreOrdersAdminPage;
window.closeStoreOrdersPanel = closeStoreOrdersPanel;
window.saveStoreItem = saveStoreItem;
window.viewStoreItems = viewStoreItems;
window.closeStoreItemsPanel = closeStoreItemsPanel;
window.openEditStoreItemPanel = openEditStoreItemPanel;
window.saveStoreItemEdit = saveStoreItemEdit;
window.deleteStoreItem = deleteStoreItem;
window.confirmDeleteStoreItem = confirmDeleteStoreItem;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initStoreAdminPage();
    });
} else {
    initStoreAdminPage();
}
