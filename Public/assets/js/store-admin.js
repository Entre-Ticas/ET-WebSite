function formatStoreStatus(status) {
    const map = {
        draft: 'Borrador',
        active: 'Activa',
        expired: 'Expirada'
    };
    return map[status] || status || 'Borrador';
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

    if (!stores.length) {
        root.innerHTML = '<div class="empty-state">No hay tiendas creadas aún.</div>';
        return;
    }

    const statusOrder = { active: 0, draft: 1, expired: 2 };
    const sortedStores = [...stores].sort((a, b) => {
        const orderA = statusOrder[a.status] ?? 99;
        const orderB = statusOrder[b.status] ?? 99;
        return orderA - orderB;
    });

    storeAdminCache = {};
    sortedStores.forEach((store) => { storeAdminCache[store.id_store] = store; });

    root.innerHTML = `
        <div class="admin-grid">
            <table class="admin-table store-admin-table">
                <thead>
                    <tr>
                        <th>Tienda</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                    <tr class="admin-filter-row">
                        <td><input type="text" placeholder="Filtrar..." /></td>
                        <td><input type="text" placeholder="Filtrar..." /></td>
                        <td></td>
                    </tr>
                </thead>
                <tbody>
                    ${sortedStores.map((store) => `
                        <tr>
                            <td class="store-name-cell">${store.nombre_tienda}</td>
                            <td><span class="store-badge ${store.status}">${formatStoreStatus(store.status)}</span></td>
                            <td class="store-action-cell">
                                <button class="admin-btn-action btn-edit" title="Abrir tienda" onclick="openStoreItemPanel('${store.id_store}')"><i class="fas fa-store"></i></button>
                                <button class="admin-btn-action btn-edit" title="Editar tienda" onclick="openEditStorePanel('${store.id_store}')"><i class="fas fa-pen"></i></button>
                                <button class="admin-btn-action btn-invoice" title="Ver items" onclick="viewStoreItems('${store.id_store}')"><i class="fas fa-boxes"></i></button>
                                <button class="admin-btn-action btn-copy" title="Ver compras" onclick="viewStoreOrders('${store.id_store}')"><i class="fas fa-receipt"></i></button>
                                ${store.status === 'draft' ? `<button class="admin-btn-action btn-update" title="Activar" onclick="activateStoreById('${store.id_store}')"><i class="fas fa-check"></i></button>` : ''}
                                ${store.status === 'expired' ? `<button class="admin-btn-action btn-update" title="Reabrir como borrador" onclick="reopenStoreById('${store.id_store}')"><i class="fas fa-rotate-left"></i></button>` : ''}
                                ${store.status === 'active' ? `<button class="admin-btn-action btn-copy" title="Ir al catálogo" onclick="openStorePublicLink('${store.public_token}')"><i class="fas fa-external-link-alt"></i></button>` : ''}
                                ${store.status === 'active' ? `<button class="admin-btn-action btn-copy" title="Copiar link" onclick="copyStoreLink('${store.public_token}')"><i class="fas fa-link"></i></button>` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function openStoreItemPanel(storeId) {
    const session = getSession();
    const gridView = document.getElementById('storeAdminGridView');
    const panel = document.getElementById('storeItemFormPanel');
    if (!gridView || !panel) return;

    gridView.style.display = 'none';
    panel.style.display = 'block';
    panel.dataset.storeId = storeId;
    panel.innerHTML = `
        <button onclick="closeStoreItemPanel()" class="admin-btn-back">← Volver</button>
        <h3>Cargar item</h3>
        <div class="floating-field">
            <input id="storeItemName" class="floating-input" type="text" placeholder=" " autocomplete="new-password" />
            <label class="floating-label">Nombre</label>
        </div>
        <div class="floating-field">
            <input id="storeItemPrice" class="floating-input" type="number" step="0.01" placeholder=" " autocomplete="new-password" />
            <label class="floating-label">Precio</label>
        </div>
        <div class="floating-field">
            <input id="storeItemQuantity" class="floating-input" type="number" min="1" value="1" placeholder=" " autocomplete="new-password" />
            <label class="floating-label">Cantidad</label>
        </div>
        <div class="floating-field">
            <input id="storeItemImageUrl" class="floating-input" type="text" placeholder=" " autocomplete="new-password" />
            <label class="floating-label">URL de imagen</label>
        </div>
        <div class="floating-field">
            <textarea id="storeItemDescription" class="floating-input" placeholder=" " autocomplete="new-password"></textarea>
            <label class="floating-label">Descripción</label>
        </div>
        <button class="admin-btn success" onclick="saveStoreItem('${storeId}', '${session.token}')">Guardar</button>
        <div id="storeItemMessage"></div>
    `;
}

function closeStoreItemPanel() {
    const gridView = document.getElementById('storeAdminGridView');
    const panel = document.getElementById('storeItemFormPanel');
    if (!gridView || !panel) return;
    panel.style.display = 'none';
    panel.innerHTML = '';
    gridView.style.display = 'block';
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
        <button class="admin-btn success" onclick="saveStoreEdit('${storeId}')">Guardar</button>
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
    const payload = {
        store_id: storeId,
        name: document.getElementById('storeItemName').value.trim(),
        price: Number(document.getElementById('storeItemPrice').value || 0),
        quantity: Number(document.getElementById('storeItemQuantity').value || 1),
        image_url: document.getElementById('storeItemImageUrl').value.trim(),
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
    setTimeout(() => {
        closeStoreItemPanel();
        initStoreAdminPage();
    }, 600);
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
    detailView.innerHTML = `
        <button onclick="closeStoreItemsPanel()" class="admin-btn-back">← Volver</button>
        <div class="store-item-detail-header">
            <div class="store-item-detail-title-wrap">
                <i class="fas fa-box" style="font-size:1.8rem; color:var(--pink-accent);"></i>
                <h3>Items de la tienda</h3>
            </div>
        </div>
        <div class="admin-grid">
            <table class="admin-table store-items-table">
                <thead>
                    <tr>
                        <th>Foto</th>
                        <th>Nombre</th>
                        <th>Precio</th>
                        <th>Cant.</th>
                        <th>Descripción</th>
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
                                <td>₡${Number(item.price || 0).toLocaleString('es-CR')}</td>
                                <td>${Number(item.quantity || 0)}</td>
                                <td class="store-item-description">${item.description || 'Sin descripción'}</td>
                            </tr>
                        `;
                    }).join('') || `
                        <tr>
                            <td colspan="5" style="text-align:center; color:#7a5246; padding:1.2rem;">No hay items cargados.</td>
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
            <table class="admin-table store-items-table">
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
window.closeStoreOrdersPanel = closeStoreOrdersPanel;
window.saveStoreItem = saveStoreItem;
window.viewStoreItems = viewStoreItems;
window.closeStoreItemsPanel = closeStoreItemsPanel;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initStoreAdminPage();
    });
} else {
    initStoreAdminPage();
}
