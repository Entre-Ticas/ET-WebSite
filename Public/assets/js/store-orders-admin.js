let storeOrdersAdminStores = [];
let storeOrdersAdminSelectedStoreId = '';
let storeOrdersAdminAll = [];
let storeOrdersAdminItems = [];
let storeOrdersAdminEditingId = null;
let storeOrdersAdminSearch = '';
let storeOrdersAdminColumnFilters = {};
let storeOrdersAdminRowsPerPage = 10;
let storeOrdersAdminCurrentPage = 1;

function formatStoreOrdersCurrency(value) {
    const numeric = Number(value || 0);
    return new Intl.NumberFormat('es-CR', {
        style: 'currency',
        currency: 'CRC',
        maximumFractionDigits: 0,
    }).format(numeric);
}

async function initStoreOrdersAdminPage() {
    const root = document.getElementById('storeOrdersGrid');
    const statusEl = document.getElementById('storeOrdersStatus');
    const selector = document.getElementById('storeOrdersStoreSelector');

    if (!root || !statusEl || !selector) {
        return;
    }

    const session = getSession();
    if (!session) {
        statusEl.innerHTML = '<p style="color:red;">Debes iniciar sesión para ver esta pantalla.</p>';
        return;
    }

    try {
        const response = await fetch('/.netlify/functions/store-admin?action=list-stores', {
            method: 'GET',
            headers: { 'x-admin-token': session.token }
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'No se pudieron cargar las tiendas.');
        }

        storeOrdersAdminStores = Array.isArray(data.stores) ? data.stores : [];
        selector.innerHTML = '<option value="">Selecciona una tienda</option>' + storeOrdersAdminStores.map((store) => {
            const name = store.nombre_tienda || store.name || `Tienda ${store.id_store}`;
            return `<option value="${store.id_store}">${name}</option>`;
        }).join('');

        if (storeOrdersAdminStores.length) {
            const savedStoreId = localStorage.getItem('selected_store_orders_id');
            const preferredStore = savedStoreId ? storeOrdersAdminStores.find((store) => String(store.id_store) === String(savedStoreId)) : null;
            const chosenStore = preferredStore || storeOrdersAdminStores[0];
            storeOrdersAdminSelectedStoreId = String(chosenStore.id_store);
            selector.value = storeOrdersAdminSelectedStoreId;
            await loadStoreOrdersAdminForStore(storeOrdersAdminSelectedStoreId);
        } else {
            statusEl.innerHTML = '<p>No hay tiendas creadas aún.</p>';
            renderStoreOrdersAdminTable([]);
        }

        selector.onchange = async (event) => {
            const nextStoreId = event.target.value;
            storeOrdersAdminSelectedStoreId = nextStoreId;
            if (nextStoreId) {
                localStorage.setItem('selected_store_orders_id', String(nextStoreId));
                await loadStoreOrdersAdminForStore(nextStoreId);
            } else {
                localStorage.removeItem('selected_store_orders_id');
                storeOrdersAdminAll = [];
                renderStoreOrdersAdminTable([]);
            }
        };
    } catch (error) {
        statusEl.innerHTML = `<p style="color:red;">⚠️ ${error.message}</p>`;
    }
}

async function loadStoreOrdersAdminForStore(storeId) {
    const statusEl = document.getElementById('storeOrdersStatus');
    const table = document.querySelector('#storeOrdersGrid .admin-table');
    if (!storeId) {
        renderStoreOrdersAdminTable([]);
        return;
    }

    if (statusEl) {
        statusEl.innerHTML = '<div class="spinner"></div><p>Cargando compras...</p>';
    }

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión no válida');

        const response = await fetch(`/.netlify/functions/store-admin?action=store-orders-admin-list&store_id=${encodeURIComponent(storeId)}`, {
            method: 'GET',
            headers: { 'x-admin-token': session.token }
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'No se pudieron cargar las compras.');
        }

        storeOrdersAdminAll = Array.isArray(data.orders) ? data.orders : [];
        renderStoreOrdersAdminTable(storeOrdersAdminAll);
        if (table) table.style.display = '';
    } catch (error) {
        if (statusEl) {
            statusEl.innerHTML = `<p style="color:red;">⚠️ ${error.message}</p>`;
        }
    }
}

async function loadStoreOrdersAdminItems(storeId) {
    const session = getSession();
    if (!session || !storeId) return [];

    try {
        const response = await fetch(`/.netlify/functions/store-admin?action=store-items&store_id=${encodeURIComponent(storeId)}`, {
            method: 'GET',
            headers: { 'x-admin-token': session.token }
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'No se pudieron cargar los items de la tienda.');
        }

        storeOrdersAdminItems = Array.isArray(data.items) ? data.items : [];
        return storeOrdersAdminItems;
    } catch (error) {
        console.error('loadStoreOrdersAdminItems', error);
        storeOrdersAdminItems = [];
        return [];
    }
}

function getFilteredStoreOrdersAdmin(orders) {
    const search = String(storeOrdersAdminSearch || '').trim().toLowerCase();
    const filters = storeOrdersAdminColumnFilters || {};

    return orders.filter((order) => {
        const row = {
            id: String(order.id ?? ''),
            store_name: String((storeOrdersAdminStores.find((store) => String(store.id_store) === String(order.store_id))?.nombre_tienda) || ''),
            item_name: String(order.item_name || ''),
            client_phone: String(order.client_phone || ''),
            quantity: String(order.quantity ?? ''),
            unit_price: String(order.unit_price ?? ''),
            total: String(Number(order.quantity || 0) * Number(order.unit_price || 0)),
            contacted: String(Boolean(order.contacted))
        };

        const matchesSearch = !search || Object.values(row).some((value) => value.toLowerCase().includes(search));
        const matchesFilters = Object.entries(filters).every(([key, filterValue]) => {
            if (!filterValue && filterValue !== false) return true;
            const value = row[key] ?? '';
            return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
        });

        return matchesSearch && matchesFilters;
    });
}

function renderStoreOrdersAdminTable(orders) {
    const tbody = document.getElementById('storeOrdersTbody');
    const table = document.querySelector('#storeOrdersGrid .admin-table');
    const noResults = document.getElementById('storeOrdersNoResults');
    const statusEl = document.getElementById('storeOrdersStatus');
    const footer = document.getElementById('storeOrdersTableFooter');
    const paginationInfo = document.getElementById('storeOrdersPaginationInfo');
    const paginationNav = document.getElementById('storeOrdersPaginationNav');
    const rowsSelector = document.getElementById('storeOrdersRowsPerPageSelector');

    if (!tbody || !table || !noResults) return;

    const filteredOrders = getFilteredStoreOrdersAdmin(orders);

    if (!filteredOrders.length) {
        tbody.innerHTML = '';
        table.style.display = 'none';
        noResults.style.display = 'block';
        if (footer) footer.style.display = 'none';
        if (statusEl) statusEl.innerHTML = '<p>Sin compras en esta tienda.</p>';
        return;
    }

    const totalRows = filteredOrders.length;
    const totalPages = storeOrdersAdminRowsPerPage === -1 ? 1 : Math.max(1, Math.ceil(totalRows / storeOrdersAdminRowsPerPage));
    if (storeOrdersAdminCurrentPage > totalPages) storeOrdersAdminCurrentPage = totalPages;
    if (storeOrdersAdminCurrentPage < 1) storeOrdersAdminCurrentPage = 1;

    const startIndex = storeOrdersAdminRowsPerPage === -1 ? 0 : (storeOrdersAdminCurrentPage - 1) * storeOrdersAdminRowsPerPage;
    const endIndex = storeOrdersAdminRowsPerPage === -1 ? totalRows : startIndex + storeOrdersAdminRowsPerPage;
    const pageOrders = filteredOrders.slice(startIndex, endIndex);

    noResults.style.display = 'none';
    table.style.display = '';
    if (footer) footer.style.display = totalRows > 10 ? '' : 'none';
    if (rowsSelector) rowsSelector.value = String(storeOrdersAdminRowsPerPage);
    if (paginationInfo) {
        paginationInfo.innerHTML = `Mostrando <strong>${totalRows === 0 ? 0 : startIndex + 1}</strong> - <strong>${Math.min(endIndex, totalRows)}</strong> de <strong>${totalRows}</strong>`;
    }
    if (paginationNav) {
        paginationNav.innerHTML = `
            <button type="button" onclick="changeStoreOrdersPage(${storeOrdersAdminCurrentPage - 1})" ${storeOrdersAdminCurrentPage <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
            <span>Página <strong>${storeOrdersAdminCurrentPage}</strong> de ${totalPages}</span>
            <button type="button" onclick="changeStoreOrdersPage(${storeOrdersAdminCurrentPage + 1})" ${storeOrdersAdminCurrentPage >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
        `;
    }

    const selectedStore = storeOrdersAdminStores.find((store) => String(store.id_store) === String(storeOrdersAdminSelectedStoreId));
    const storeName = selectedStore ? (selectedStore.nombre_tienda || selectedStore.name || `Tienda ${selectedStore.id_store}`) : 'Tienda';

    tbody.innerHTML = pageOrders.map((order) => {
        const quantity = Number(order.quantity || 0);
        const unitPrice = Number(order.unit_price || 0);
        const total = quantity * unitPrice;
        const contactState = order.contacted ? 'Sí' : 'No';
        const date = order.created_at ? new Date(order.created_at).toLocaleString('es-CR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : '—';

        return `
            <tr>
                <td>${order.id ?? '—'}</td>
                <td>${storeName}</td>
                <td>${order.item_name || '—'}</td>
                <td>${order.client_phone || '—'}</td>
                <td>${quantity}</td>
                <td>${formatStoreOrdersCurrency(unitPrice)}</td>
                <td>${formatStoreOrdersCurrency(total)}</td>
                <td>${contactState}</td>
                <td>${date}</td>
                <td class="admin-actions-cell">
                    <span class="admin-actions-inline">
                        <button class="admin-btn-action btn-edit" type="button" title="Editar compra" onclick="openEditStoreOrderForm(${order.id})"><i class="fas fa-pencil-alt"></i></button>
                        <button class="admin-btn-action btn-delete" type="button" title="Eliminar compra" onclick="deleteStoreOrder(${order.id})"><i class="fas fa-trash-alt"></i></button>
                    </span>
                </td>
            </tr>
        `;
    }).join('');

    if (statusEl) {
        statusEl.innerHTML = '<p>Compras cargadas.</p>';
    }
}

toggleStoreOrdersRowsPerPageDropdown = function (event) {
    const menu = document.getElementById('storeOrdersRowsPerPageMenu');
    if (!menu) return;
    event?.stopPropagation?.();
    const isOpen = menu.classList.contains('open');
    document.querySelectorAll('.order-rows-menu').forEach((el) => el.classList.remove('open'));
    if (!isOpen) menu.classList.add('open');
};

function selectStoreOrdersRowsPerPage(value) {
    changeStoreOrdersRowsPerPage(value);
    const menu = document.getElementById('storeOrdersRowsPerPageMenu');
    if (menu) menu.classList.remove('open');
}

function changeStoreOrdersRowsPerPage(value) {
    const parsed = Number(value);
    storeOrdersAdminRowsPerPage = Number.isFinite(parsed) ? parsed : 10;
    storeOrdersAdminCurrentPage = 1;
    const label = document.getElementById('storeOrdersRowsPerPageSelectedLabel');
    if (label) label.textContent = value === '-1' ? 'Todos' : String(value);
    renderStoreOrdersAdminTable(storeOrdersAdminAll);
}

function searchStoreOrdersAdmin(value) {
    storeOrdersAdminSearch = value || '';
    storeOrdersAdminCurrentPage = 1;
    renderStoreOrdersAdminTable(storeOrdersAdminAll);
}

function setStoreOrdersColumnFilter(column, value) {
    storeOrdersAdminColumnFilters[column] = value;
    storeOrdersAdminCurrentPage = 1;
    renderStoreOrdersAdminTable(storeOrdersAdminAll);
}

function changeStoreOrdersPage(page) {
    if (page < 1) return;
    const totalRows = getFilteredStoreOrdersAdmin(storeOrdersAdminAll).length;
    const totalPages = storeOrdersAdminRowsPerPage === -1 ? 1 : Math.max(1, Math.ceil(totalRows / storeOrdersAdminRowsPerPage));
    if (page > totalPages) return;
    storeOrdersAdminCurrentPage = page;
    renderStoreOrdersAdminTable(storeOrdersAdminAll);
}

async function openNewStoreOrderForm() {
    if (!storeOrdersAdminSelectedStoreId) {
        alert('Primero selecciona una tienda.');
        return;
    }

    storeOrdersAdminEditingId = null;
    const items = await loadStoreOrdersAdminItems(storeOrdersAdminSelectedStoreId);
    const formPanel = document.getElementById('storeOrdersFormPanel');
    if (!formPanel) return;

    formPanel.style.display = 'block';
    formPanel.innerHTML = `
        <div class="container">
            <div class="card" style="cursor:default;">
                <button onclick="closeStoreOrdersForm()" class="admin-btn-back" type="button">← Volver</button>
                <i class="fas fa-cart-plus" style="font-size:2rem; color:var(--pink-accent); margin-top:0.5rem;"></i>
                <h3 style="margin:0.5rem 0;">Nueva compra</h3>
                <div style="text-align:left;">
                    <div class="floating-field">
                        <select id="storeOrderStoreId" class="floating-input" style="appearance:auto;" required>
                            ${storeOrdersAdminStores.map((store) => {
                                const selected = String(store.id_store) === String(storeOrdersAdminSelectedStoreId) ? 'selected' : '';
                                return `<option value="${store.id_store}" ${selected}>${store.nombre_tienda || store.name || `Tienda ${store.id_store}`}</option>`;
                            }).join('')}
                        </select>
                        <label for="storeOrderStoreId" class="floating-label">Tienda</label>
                    </div>

                    <div class="floating-field">
                        <select id="storeOrderItemId" class="floating-input" style="appearance:auto;" required>
                            <option value="">Selecciona un item</option>
                            ${items.map((item) => `<option value="${item.id}">${item.name}</option>`).join('')}
                        </select>
                        <label for="storeOrderItemId" class="floating-label">Item</label>
                    </div>

                    <div class="floating-field">
                        <input type="tel" id="storeOrderClientPhone" class="floating-input" placeholder=" " autocomplete="off">
                        <label for="storeOrderClientPhone" class="floating-label">Teléfono del cliente</label>
                    </div>

                    <div class="floating-field">
                        <input type="number" min="1" step="1" id="storeOrderQuantity" class="floating-input" value="1" placeholder=" ">
                        <label for="storeOrderQuantity" class="floating-label">Cantidad</label>
                    </div>

                    <div class="floating-field">
                        <input type="number" min="0" step="0.01" id="storeOrderUnitPrice" class="floating-input" value="0" placeholder=" ">
                        <label for="storeOrderUnitPrice" class="floating-label">Precio unitario</label>
                    </div>

                    <label class="custom-checkbox-container">
                        <input type="checkbox" id="storeOrderContacted">
                        <span class="checkbox-label">Contacto confirmado</span>
                    </label>

                    <button type="button" class="admin-btn-agregar" onclick="saveStoreOrderForm()" style="width:100%; margin-top:1rem;">Guardar compra</button>
                </div>
            </div>
        </div>
    `;
}

async function openEditStoreOrderForm(orderId) {
    const order = storeOrdersAdminAll.find((item) => Number(item.id) === Number(orderId));
    if (!order) return;

    storeOrdersAdminEditingId = Number(orderId);
    const items = await loadStoreOrdersAdminItems(String(order.store_id || storeOrdersAdminSelectedStoreId));
    const formPanel = document.getElementById('storeOrdersFormPanel');
    if (!formPanel) return;

    formPanel.style.display = 'block';
    formPanel.innerHTML = `
        <div class="container">
            <div class="card" style="cursor:default;">
                <button onclick="closeStoreOrdersForm()" class="admin-btn-back" type="button">← Volver</button>
                <i class="fas fa-pencil-alt" style="font-size:2rem; color:var(--pink-accent); margin-top:0.5rem;"></i>
                <h3 style="margin:0.5rem 0;">Editar compra</h3>
                <div style="text-align:left;">
                    <div class="floating-field">
                        <select id="storeOrderStoreId" class="floating-input" style="appearance:auto;" required>
                            ${storeOrdersAdminStores.map((store) => {
                                const selected = String(store.id_store) === String(order.store_id) ? 'selected' : '';
                                return `<option value="${store.id_store}" ${selected}>${store.nombre_tienda || store.name || `Tienda ${store.id_store}`}</option>`;
                            }).join('')}
                        </select>
                        <label for="storeOrderStoreId" class="floating-label">Tienda</label>
                    </div>

                    <div class="floating-field">
                        <select id="storeOrderItemId" class="floating-input" style="appearance:auto;" required>
                            <option value="">Selecciona un item</option>
                            ${items.map((item) => `<option value="${item.id}" ${String(item.id) === String(order.item_id) ? 'selected' : ''}>${item.name}</option>`).join('')}
                        </select>
                        <label for="storeOrderItemId" class="floating-label">Item</label>
                    </div>

                    <div class="floating-field">
                        <input type="tel" id="storeOrderClientPhone" class="floating-input" value="${String(order.client_phone || '').replace(/"/g, '&quot;')}" placeholder=" " autocomplete="off">
                        <label for="storeOrderClientPhone" class="floating-label">Teléfono del cliente</label>
                    </div>

                    <div class="floating-field">
                        <input type="number" min="1" step="1" id="storeOrderQuantity" class="floating-input" value="${Number(order.quantity || 1)}" placeholder=" ">
                        <label for="storeOrderQuantity" class="floating-label">Cantidad</label>
                    </div>

                    <div class="floating-field">
                        <input type="number" min="0" step="0.01" id="storeOrderUnitPrice" class="floating-input" value="${Number(order.unit_price || 0)}" placeholder=" ">
                        <label for="storeOrderUnitPrice" class="floating-label">Precio unitario</label>
                    </div>

                    <label class="custom-checkbox-container">
                        <input type="checkbox" id="storeOrderContacted" ${order.contacted ? 'checked' : ''}>
                        <span class="checkbox-label">Contacto confirmado</span>
                    </label>

                    <button type="button" class="admin-btn-agregar" onclick="saveStoreOrderForm()" style="width:100%; margin-top:1rem;">Guardar cambios</button>
                </div>
            </div>
        </div>
    `;
}

function closeStoreOrdersForm() {
    const panel = document.getElementById('storeOrdersFormPanel');
    if (panel) panel.style.display = 'none';
    storeOrdersAdminEditingId = null;
}

async function saveStoreOrderForm() {
    const session = getSession();
    if (!session) {
        alert('Debes iniciar sesión para guardar.');
        return;
    }

    const storeId = document.getElementById('storeOrderStoreId')?.value;
    const itemId = document.getElementById('storeOrderItemId')?.value;
    const clientPhone = document.getElementById('storeOrderClientPhone')?.value?.trim();
    const quantity = Number(document.getElementById('storeOrderQuantity')?.value || 1);
    const unitPrice = Number(document.getElementById('storeOrderUnitPrice')?.value || 0);
    const contacted = document.getElementById('storeOrderContacted')?.checked || false;

    if (!storeId || !itemId || !clientPhone) {
        alert('Completa la tienda, el item y el teléfono.');
        return;
    }

    const payload = {
        action: storeOrdersAdminEditingId ? 'update-store-order' : 'create-store-order',
        store_id: Number(storeId),
        item_id: Number(itemId),
        client_phone: clientPhone,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
        contacted,
    };

    if (storeOrdersAdminEditingId) {
        payload.id = Number(storeOrdersAdminEditingId);
    }

    const method = storeOrdersAdminEditingId ? 'PATCH' : 'POST';

    try {
        const response = await fetch('/.netlify/functions/store-admin', {
            method,
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': session.token,
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'No se pudo guardar la compra.');
        }

        closeStoreOrdersForm();
        await loadStoreOrdersAdminForStore(storeId);
        const selector = document.getElementById('storeOrdersStoreSelector');
        if (selector) selector.value = String(storeId);
        storeOrdersAdminSelectedStoreId = String(storeId);
    } catch (error) {
        alert(error.message || 'No se pudo guardar la compra.');
    }
}

async function deleteStoreOrder(orderId) {
    const session = getSession();
    if (!session) {
        alert('Debes iniciar sesión para borrar compras.');
        return;
    }

    const confirmed = window.confirm('¿Deseas eliminar esta compra?');
    if (!confirmed) return;

    try {
        const response = await fetch('/.netlify/functions/store-admin', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': session.token,
            },
            body: JSON.stringify({ action: 'delete-store-order', id: orderId })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'No se pudo eliminar la compra.');
        }

        await loadStoreOrdersAdminForStore(storeOrdersAdminSelectedStoreId);
    } catch (error) {
        alert(error.message || 'No se pudo eliminar la compra.');
    }
}

window.initStoreOrdersAdminPage = initStoreOrdersAdminPage;
window.openNewStoreOrderForm = openNewStoreOrderForm;
window.openEditStoreOrderForm = openEditStoreOrderForm;
window.closeStoreOrdersForm = closeStoreOrdersForm;
window.saveStoreOrderForm = saveStoreOrderForm;
window.deleteStoreOrder = deleteStoreOrder;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStoreOrdersAdminPage);
} else {
    initStoreOrdersAdminPage();
}
