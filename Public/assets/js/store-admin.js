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
                                <button class="admin-btn-action btn-edit" title="Agregar item a la tienda" onclick="openStoreItemPanel('${store.id_store}')"><i class="fas fa-plus"></i></button>
                                <button class="admin-btn-action btn-invoice" title="Ver items" onclick="viewStoreItems('${store.id_store}')"><i class="fas fa-boxes"></i></button>
                                <button class="admin-btn-action btn-copy" title="Ver compras" onclick="viewStoreOrders('${store.id_store}')"><i class="fas fa-receipt"></i></button>
                                <button class="admin-btn-action btn-update" title="Ver clientes" onclick="viewStoreCustomerOrders('${store.id_store}')"><i class="fas fa-user"></i></button>
                                ${store.status === 'draft' ? `<button class="admin-btn-action btn-update" title="Activar" onclick="activateStoreById('${store.id_store}')"><i class="fas fa-check"></i></button>` : ''}
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
            <label class="floating-label">Cantidad (0 o vacío = ilimitado)</label>
        </div>
        <div class="floating-field">
            <textarea id="storeItemDescription" class="floating-input" placeholder=" " autocomplete="new-password"></textarea>
            <label class="floating-label">Descripción</label>
        </div>
        <button onclick="saveStoreItem('${storeId}', '${session.token}')"
            style="width:100%; padding:12px; background:var(--pink-accent); color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">
            Guardar Cambios
        </button>
        <div id="storeItemMessage"></div>
    `;
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
            <label class="floating-label">Cantidad (0 o vacío = ilimitado)</label>
        </div>
        <div class="floating-field">
            <textarea id="storeItemDescription" class="floating-input" placeholder=" " autocomplete="new-password">${String(item.description || '')}</textarea>
            <label class="floating-label">Descripción</label>
        </div>
        <button onclick="saveStoreItemEdit('${storeId}', '${itemId}', '${session.token}')"
            style="width:100%; padding:12px; background:var(--pink-accent); color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">
            Guardar Cambios
        </button>
        <div id="storeItemMessage"></div>
    `;
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
    const payload = {
        id: itemId,
        name: document.getElementById('storeItemName').value.trim(),
        price: Number(document.getElementById('storeItemPrice').value || 0),
        quantity: quantityRaw === '' ? null : Number(quantityRaw),
        image_url: imageUrl,
        description: document.getElementById('storeItemDescription').value.trim(),
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
    const payload = {
        store_id: storeId,
        name: document.getElementById('storeItemName').value.trim(),
        price: Number(document.getElementById('storeItemPrice').value || 0),
        quantity: quantityRaw === '' ? null : Number(quantityRaw),
        image_url: imageUrl,
        description: document.getElementById('storeItemDescription').value.trim(),
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
        closeStoreItemPanel();
        initStoreAdminPage();
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
                        <th>Descripción</th>
                        <th class="col-actions">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${(data.items || []).map(item => {
                        const imageButton = item.image_url
                            ? `<button type="button" class="admin-table-img-btn" data-image-url="${String(item.image_url || '').replace(/"/g, '&quot;')}" title="Ver imagen"><i class="fas fa-camera"></i></button>`
                            : '';

                        return `
                            <tr>
                                <td class="col-select" style="display: none;"><input type="checkbox" class="row-selector" data-id="${item.id}" onchange="updateStoreItemsSelectionState()"></td>
                                <td>${imageButton}</td>
                                <td class="store-name-cell">${item.name || 'Sin nombre'}</td>
                                <td>₡${Number(item.price || 0).toLocaleString('es-CR')}</td>
                                <td>${(item.quantity === null || item.quantity === undefined || Number(item.quantity) === 0) ? 'Ilimitado' : Number(item.quantity)}</td>
                                <td class="store-item-description">${item.description || 'Sin descripción'}</td>
                                <td class="admin-actions-cell col-actions">
                                    <button class="admin-btn-action btn-edit" title="Editar item" onclick="openEditStoreItemPanel('${storeId}', '${item.id}')"><i class="fas fa-pen"></i></button>
                                    <button class="admin-btn-action btn-delete" title="Eliminar item" onclick="deleteStoreItem('${storeId}', '${item.id}')"><i class="fas fa-trash-alt"></i></button>
                                </td>
                            </tr>
                        `;
                    }).join('') || `
                        <tr>
                            <td colspan="7" style="text-align:center; color:#7a5246; padding:1.2rem;">No hay items cargados.</td>
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
    gridView.style.display = 'none';
    detailView.style.display = 'block';
    detailView.innerHTML = `
        <button onclick="closeStoreOrdersPanel()" class="admin-btn-back">← Volver</button>
        <div class="store-item-detail-header">
            <div class="store-item-detail-title-wrap">
                <i class="fas fa-user" style="font-size:1.8rem; color:var(--pink-accent);"></i>
                <h3>Clientes con compras</h3>
            </div>
        </div>
        <div class="admin-grid">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Teléfono</th>
                        <th>Items solicitados</th>
                        <th>Totales</th>
                        <th>Acción</th>
                    </tr>
                </thead>
                <tbody>
                    ${customers.length ? customers.map((customer) => {
                        const phoneDigits = normalizeStoreClientPhoneForWa(customer.phone_digits || customer.phone || '');
                        const adminSummary = (customer.items || []).map((item) => `- ${item.name || 'Item'}: ${Number(item.quantity || 0)} x ${formatStoreCurrency(Number(item.unit_price || item.price || 0))}`).join('\n');
                        const waText = encodeURIComponent(`Hola, quiero confirmar tu pedido:\n${adminSummary}\n\nGracias.`);
                        const waLink = phoneDigits ? `https://wa.me/${phoneDigits}?text=${waText}` : '#';
                        const itemList = (customer.items || []).map((item) => `<div>${item.name || 'Sin nombre'}: ${Number(item.quantity || 0)}</div>`).join('');
                        return `
                            <tr>
                                <td class="store-name-cell">${String(customer.phone || 'Sin teléfono')}</td>
                                <td>${itemList || '<span style="color:#7a5246;">Sin items</span>'}</td>
                                <td>${Number(customer.total_quantity || 0)}</td>
                                <td>
                                    <a class="admin-btn-action btn-copy" title="Reconfirmar por WhatsApp" href="${waLink}" target="_blank" rel="noopener noreferrer" aria-label="Reconfirmar por WhatsApp">
                                        <i class="fab fa-whatsapp"></i>
                                    </a>
                                </td>
                            </tr>
                        `;
                    }).join('') : `
                        <tr>
                            <td colspan="4" style="text-align:center; color:#7a5246; padding:1.2rem;">Aún no hay clientes con compras registradas.</td>
                        </tr>
                    `}
                </tbody>
            </table>
        </div>
    `;
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

    await syncStoreStatusFromTimestamps();

    const stores = await fetchStoreAdminData().catch((error) => {
        root.innerHTML = `<p style="color:red;">${error.message}</p>`;
        return [];
    });

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
