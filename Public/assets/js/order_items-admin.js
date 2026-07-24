// Gestión de Órdenes (Personal Shopper)

let todasLasOrdenes = [];
let orderItemsGlobalSearch = ''; 
let currentPage = 1;
let rowsPerPage = 10; // Valor por defecto
let orderItemsSortColumn = null; 
let orderItemsSortDir = 'asc';   
let orderItemsColumnFilters = { 
    client_name: '', client_phone: '', product_name: '', size: '', quantity: '',
    price: '', status_name: '', usa_reviewed: '', invoice_id: ''
};

function isEmptyInvoiceFilterValue(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ['-', '—', 'null', 'sin', 'sin factura', 's/f', 'sf', 'none', 'na', 'n/a'].includes(normalized);
}

function resetOrderItemsViewState() {
    orderItemsGlobalSearch = '';
    currentPage = 1;
    rowsPerPage = 10;
    orderItemsSortColumn = null;
    orderItemsSortDir = 'asc';
    orderItemsColumnFilters = {
        client_name: '', client_phone: '', product_name: '', size: '', quantity: '',
        price: '', status_name: '', usa_reviewed: '', invoice_id: ''
    };

    const searchInput = document.getElementById('adminSearchInput');
    if (searchInput) searchInput.value = '';

    const rowsSelector = document.getElementById('rowsPerPageSelector');
    if (rowsSelector) rowsSelector.value = '10';

    const multiSelectToggle = document.getElementById('multiSelectToggle');
    if (multiSelectToggle) multiSelectToggle.checked = false;

    document.querySelectorAll('.admin-filter-row input').forEach(input => {
        input.value = '';
    });
    document.querySelectorAll('.admin-filter-row select').forEach(select => {
        select.value = '';
    });
}

async function cargarEstadosOrdenes() {
    try {
        // Reutilizamos la función de estados de tracking que es genérica.
        const res = await fetch('/.netlify/functions/tracking-status');
        if (!res.ok) throw new Error('No se pudieron cargar los estados.');
        
        const estados = await res.json();
        const options = estados.map(e =>
            `<option value="${e.id_status_tracking}">${e.status_name}</option>`
        ).join('');

        ['editStatus'].forEach(id => {
            const sel = document.getElementById(id);
            if (sel) sel.innerHTML = '<option value="">-- Selecciona --</option>' + options;
        });
    } catch (error) {
        console.error(error.message);
    }
}

async function loadAdminOrders() {
    const gridContainer = document.getElementById('adminGrid');
    if (!gridContainer) {
        console.error("El contenedor 'adminGrid' no existe en el HTML de la página.");
        return;
    }

    const statusEl = document.getElementById('adminStatus');
    statusEl.style.display = 'flex'; // Mostrar 'Cargando...'

    await cargarEstadosOrdenes();

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión no válida');

        const response = await fetch('/.netlify/functions/order-items', {
            headers: { 'x-admin-token': session.token }
        });
        if (response.status === 401) {
            throw new Error('No autorizado. Verificá la sesión de administrador o recargá e iniciá sesión otra vez.');
        }
        if (!response.ok) throw new Error(`Error del servidor: ${response.statusText}`);

        todasLasOrdenes = await response.json();
        renderOrders();

    } catch (err) {
        statusEl.innerHTML = `<p style="color:red;">⚠️ Error al cargar: ${err.message}</p>`;
        statusEl.style.display = 'flex'; // Mantenemos visible el mensaje de error
    } finally {
        // Ocultamos el spinner solo si no hubo un error que mostrar
        if (!statusEl.innerHTML.includes('Error')) {
            statusEl.style.display = 'none';

            // ¡CORRECCIÓN CLAVE! Hacemos visible la tabla aquí.
            const table = document.querySelector('#adminGrid .admin-table');
            if (table) {
                table.style.display = '';
            }
        }
    }
}

function renderOrders() {
    const table = document.querySelector('#adminGrid .admin-table');
    const tbody = document.getElementById('adminTbody');
    const noResults = document.getElementById('adminNoResults');

    if (!table || !tbody || !noResults) {
        console.error("Error: No se encontraron los elementos de la tabla (table, tbody, noResults).");
        return;
    }
    
    // 1. Aplicar búsqueda global
    let lista = todasLasOrdenes.filter(o =>
        !orderItemsGlobalSearch ||
        (o.client_name || '').toLowerCase().includes(orderItemsGlobalSearch) ||
        (o.product_name || '').toLowerCase().includes(orderItemsGlobalSearch) ||
        (o.client_phone || '').toLowerCase().includes(orderItemsGlobalSearch)
    );

    // 2. Aplicar filtros por columna
    lista = lista.filter(o =>
        (o.client_name || '').toLowerCase().includes(orderItemsColumnFilters.client_name) &&
        (o.client_phone || '').toLowerCase().includes(orderItemsColumnFilters.client_phone) &&
        (o.product_name || '').toLowerCase().includes(orderItemsColumnFilters.product_name) &&
        (o.size || '').toLowerCase().includes(orderItemsColumnFilters.size) &&
        String(o.quantity || '').toLowerCase().includes(orderItemsColumnFilters.quantity) &&
        String(o.price || '').toLowerCase().includes(orderItemsColumnFilters.price) &&
        (orderItemsColumnFilters.usa_reviewed === '' || String(o.usa_reviewed) === orderItemsColumnFilters.usa_reviewed) &&
        (
            orderItemsColumnFilters.invoice_id === '' ||
            (
                isEmptyInvoiceFilterValue(orderItemsColumnFilters.invoice_id)
                    ? (o.invoice_id === null || o.invoice_id === undefined || o.invoice_id === '')
                    : String(o.invoice_id ?? '').toLowerCase().includes(orderItemsColumnFilters.invoice_id)
            )
        )
    );

    // 3. Aplicar ordenamiento
    if (orderItemsSortColumn) {
        lista.sort((a, b) => {
            let valA = a[orderItemsSortColumn] || '';
            let valB = b[orderItemsSortColumn] || '';

            if (typeof valA === 'number' && typeof valB === 'number') {
                return orderItemsSortDir === 'asc' ? valA - valB : valB - valA;
            }
            const comparison = String(valA).localeCompare(String(valB), 'es', { sensitivity: 'base' });
            return orderItemsSortDir === 'asc' ? comparison : -comparison;
        });
    }

    const totalRows = lista.length;

    // Si la página actual queda fuera de rango después de un cambio/filtro,
    // la ajustamos para evitar una tabla vacía falsa.
    const totalPages = rowsPerPage === -1 ? 1 : Math.max(1, Math.ceil(totalRows / rowsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    // 4. Aplicar paginación
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = rowsPerPage === -1 ? totalRows : startIndex + rowsPerPage;
    const paginatedItems = lista.slice(startIndex, endIndex);

    // Comprobamos si hay algún filtro activo (global o por columna)
    const isAnyFilterActive = orderItemsGlobalSearch || Object.values(orderItemsColumnFilters).some(v => v !== '');

    if (lista.length === 0 && isAnyFilterActive) {
        noResults.style.display = 'block';
    } else {
        noResults.style.display = 'none';
    }
    
    // Asegurarnos de que la tabla siempre esté visible para mantener los filtros
    table.style.display = '';
    tbody.innerHTML = ''; // Limpiamos el cuerpo antes de renderizar

    const rowsHtml = paginatedItems.map(o => `
            <tr>
                <td class="col-select" style="display: none;"><input type="checkbox" class="row-selector" data-id="${o.id}" onchange="updateOrderMultiSelectActions()"></td>
                <td><img src="${o.image_url || 'https://placehold.co/40x40/E19B9D/FFFFFF?text=?'}" class="admin-table-img" alt="Producto" onclick="openImageModal('${o.image_url || ''}')"></td>
                <td>${o.client_name || ''}</td>
                <td>${o.client_phone || ''}</td>
                <td>${o.product_name || ''}</td>
                <td>${o.size || ''}</td>
                <td>${o.quantity || 0}</td>
                <td>₡${(o.price || 0).toLocaleString('es-CR')}</td>
                <td style="text-align: center;"><input type="checkbox" id="revusa-cb-${o.id}" onclick="confirmToggleUSA(${o.id}, this)" ${o.usa_reviewed ? 'checked' : ''}></td>
                <td class="col-invoice" style="display: none; text-align: center;">${o.invoice_id ?? '—'}</td>
                <td class="admin-actions-cell col-actions">
                    <button class="admin-btn-action btn-edit" onclick="abrirFormEdicion(${o.id})" title="Editar Orden"><i class="fas fa-pencil-alt"></i></button>
                    <button class="admin-btn-action btn-invoice" onclick="verFactura(${o.invoice_id})" title="Ver Factura"><i class="fas fa-file-invoice-dollar"></i></button>
                    <button class="admin-btn-action btn-delete" onclick="eliminarOrden(${o.id})" title="Eliminar Orden"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>`
    ).join('');

    tbody.innerHTML = rowsHtml;
    actualizarIconosOrden();
    // Forzamos la re-evaluación de la visibilidad de la columna de selección
    toggleOrderMultiSelect(document.getElementById('multiSelectToggle')?.checked || false);
    renderOrderPagination(totalRows);
}

function renderOrderPagination(totalRows) {
    const tfoot = document.getElementById('adminTableFooter');
    if (!tfoot) return;

    // Solo ocultar la paginación si el total de filas es menor que la opción más pequeña (10).
    if (totalRows <= 10) {
        tfoot.style.display = 'none';
        return;
    }

    tfoot.style.display = ''; // Hacemos visible el footer

    const totalPages = rowsPerPage === -1 ? 1 : Math.ceil(totalRows / rowsPerPage);
    const startItem = (currentPage - 1) * rowsPerPage + 1;
    const endItem = rowsPerPage === -1 ? totalRows : Math.min(currentPage * rowsPerPage, totalRows);
    
    // Actualizamos el colspan de la celda del footer
    const table = document.querySelector('#adminGrid .admin-table');
    const numColumns = table.querySelector('thead .admin-main-header').cells.length;
    document.getElementById('footerColspan').colSpan = numColumns;

    // Actualizamos los elementos individuales
    const infoEl = document.getElementById('paginationInfo');
    const navEl = document.getElementById('paginationNav');
    const selectorEl = document.getElementById('rowsPerPageSelector');

    if (infoEl) {
        infoEl.innerHTML = `Mostrando <strong>${startItem} - ${endItem}</strong> de <strong>${totalRows}</strong>`;
    }
    if (selectorEl) {
        selectorEl.value = rowsPerPage;
    }
    if (navEl) {
        navEl.innerHTML = `
            <button onclick="changeOrderPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
            <span>Página <strong>${currentPage}</strong> de ${totalPages}</span>
            <button onclick="changeOrderPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
        `;
    }
}

function changeOrderPage(newPage) {
    currentPage = newPage;
    renderOrders();
}

function changeOrderRowsPerPage(value) {
    rowsPerPage = parseInt(value, 10);
    currentPage = 1; // Volver a la primera página
    renderOrders();
}

function verFactura(invoiceId) {
    if (typeof loadPage === 'function') loadPage('admin/invoice', invoiceId);
}

function sortOrdersBy(col) {
    if (orderItemsSortColumn === col) {
        orderItemsSortDir = orderItemsSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        orderItemsSortColumn = col;
        orderItemsSortDir = 'asc';
    }
    renderOrders();
}

function setOrderColumnFilter(col, value) {
    currentPage = 1;
    orderItemsColumnFilters[col] = value.toLowerCase();
    renderOrders();
}

function actualizarIconosOrden() {
    document.querySelectorAll('.admin-table th.sortable').forEach(th => {
        const col = th.dataset.col;
        const arrow = th.querySelector('.sort-arrow');
        if (!arrow) return;
        if (orderItemsSortColumn !== col) {
            arrow.textContent = '↕';
        } else {
            arrow.textContent = orderItemsSortDir === 'asc' ? '▲' : '▼';
        }
    });
}

function filtrarOrdenes() {
    currentPage = 1;
    orderItemsGlobalSearch = document.getElementById('adminSearchInput').value.toLowerCase().trim();
    renderOrders();
}

function toggleOrderActionsColumn(hideActions) {
    const mainHeaderActions = document.querySelector('.admin-main-header .col-actions');
    const filterHeaderActions = document.querySelector('.admin-filter-row .col-actions');
    const actionCells = document.querySelectorAll('.col-actions');

    const mainHeaderInvoice = document.querySelector('.admin-main-header .col-invoice');
    const filterHeaderInvoice = document.querySelector('.admin-filter-row .col-invoice');
    const invoiceCells = document.querySelectorAll('.col-invoice');

    const displayValue = hideActions ? 'none' : '';
    const invoiceDisplayValue = hideActions ? '' : 'none';

    if (mainHeaderActions) mainHeaderActions.style.display = displayValue;
    if (filterHeaderActions) filterHeaderActions.style.display = displayValue;
    actionCells.forEach(cell => {
        cell.style.display = displayValue;
    });

    if (mainHeaderInvoice) mainHeaderInvoice.style.display = invoiceDisplayValue;
    if (filterHeaderInvoice) filterHeaderInvoice.style.display = invoiceDisplayValue;
    invoiceCells.forEach(cell => {
        cell.style.display = invoiceDisplayValue;
    });
}

function toggleOrderMultiSelect(isMultiSelect) {
    const selectColumns = document.querySelectorAll('.col-select');
    selectColumns.forEach(col => {
        col.style.display = isMultiSelect ? '' : 'none';
    });
    toggleOrderActionsColumn(isMultiSelect);

    // Si se desactiva la selección múltiple, limpiamos todo para evitar acciones accidentales.
    if (!isMultiSelect) {
        // 1. Deseleccionamos todas las filas visibles
        document.querySelectorAll('.row-selector').forEach(chk => chk.checked = false);
        
        // 2. Deseleccionamos el checkbox "maestro" de la cabecera
        const selectAllCheckbox = document.querySelector('.admin-main-header .col-select input[type="checkbox"]');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }
    }
    updateOrderMultiSelectActions();
}

function toggleOrderSelectAll(isChecked) {
    const rowCheckboxes = document.querySelectorAll('.row-selector');
    rowCheckboxes.forEach(chk => {
        chk.checked = isChecked;
    });
    updateOrderMultiSelectActions();
}

function getSelectedOrderIds() {
    return Array.from(document.querySelectorAll('.row-selector:checked'))
                .map(chk => Number(chk.dataset.id));
}

function updateOrderMultiSelectActions() {
    const selectedIds = getSelectedOrderIds();
    const actionContainer = document.getElementById('multiActionContainer');
    const label = document.getElementById('multiSelectLabel');
    const isMultiSelectActive = document.getElementById('multiSelectToggle').checked;

    if (!isMultiSelectActive) {
        actionContainer.style.display = 'none';
        label.textContent = 'Seleccionar Varios';
        return;
    }

    const hasSelection = selectedIds.length > 0;
    actionContainer.style.display = hasSelection ? 'flex' : 'none';
    label.textContent = hasSelection ? `${selectedIds.length} Seleccionados` : 'Seleccionar Varios';
}

function handleOrderMultiEdit() {
    const selectedIds = getSelectedOrderIds();
    if (selectedIds.length === 0) return;

    // Obtener las facturas existentes de las órdenes seleccionadas
    const selectedOrders = todasLasOrdenes.filter(o => selectedIds.includes(o.id));
    const existingInvoices = [...new Set(selectedOrders.map(o => o.invoice_id).filter(id => id != null))];

    let invoiceAlertHtml = '';
    if (existingInvoices.length > 0) {
        invoiceAlertHtml = `
            <div class="modal-alert">
                <i class="fas fa-info-circle"></i>
                <span>¿Vas a reasignar estos ítems? Actualmente pertenecen a: <strong>${existingInvoices.join(', ')}</strong></span>
            </div>
        `;
    }

    const title = `Editar ${selectedIds.length} Órdenes`;
    
    const body = `
       
        <p style="font-size: 0.9rem; margin-top: 0; color: #777;">
            Introduce los nuevos valores para los campos que deseas actualizar. Los campos que dejes en blanco no se modificarán.
        </p>
        <div style="text-align: left; margin-bottom: 1rem;">
            <label style="font-weight: bold; font-size: 0.9rem; display: block; margin-bottom: 4px;">Nombre del Cliente:</label>
            <input type="text" id="multiEditClientName" placeholder="Nuevo nombre para todos"
                   style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--pink-light); box-sizing:border-box;">
        </div>
        <div style="text-align: left; margin-bottom: 1rem;">
            <label style="font-weight: bold; font-size: 0.9rem; display: block; margin-bottom: 4px;">Teléfono (últimos 4 dígitos):</label>
            <input type="tel" id="multiEditClientPhone" placeholder="Nuevo teléfono para todos" maxlength="4"
                   style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--pink-light); box-sizing:border-box;">
            <small id="multiEditPhoneError" style="color: red; display: none; margin-top: 4px;">El teléfono debe ser numérico de 4 dígitos.</small>
        </div>
        <div style="text-align: left; margin-top: 1rem;">
            <label style="font-weight: bold; font-size: 0.9rem; display: block; margin-bottom: 4px;">Rev USA:</label>
            <select id="multiEditUsaReviewed"
                    style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--pink-light); box-sizing:border-box;">
                <option value=""> </option>
                <option value="true">Marcar como revisado</option>
                <option value="false">Desmarcar revisado</option>
            </select>
        </div>
        <div style="text-align: left;">
            <label style="font-weight: bold; font-size: 0.9rem; display: block; margin-bottom: 4px;">Asignar a Factura (ID):</label>
            <input type="number" id="multiEditInvoiceId" placeholder="ID de la factura"
                   style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--pink-light); box-sizing:border-box;">
        </div>
        
        <div style="text-align: left;">
            <div id="multiEditError" style="color: red; margin-top: 1rem; font-weight: bold; display: none;"></div>
             ${invoiceAlertHtml}
        </div>
    `;

    const footer = `
        <button class="btn btn-secondary" onclick="closeGenericModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmOrderMultiEdit()">Guardar Cambios</button>
    `;

    openGenericModal(title, body, footer);
}

async function confirmOrderMultiEdit() {
    const idsToUpdate = getSelectedOrderIds();
    const newName = document.getElementById('multiEditClientName').value.trim();
    const newPhone = document.getElementById('multiEditClientPhone').value.trim();
    const newInvoiceId = document.getElementById('multiEditInvoiceId').value.trim();
    const newUsaReviewedRaw = document.getElementById('multiEditUsaReviewed')?.value || '';
    const hasUsaReviewedChange = newUsaReviewedRaw !== '';
    const newUsaReviewed = newUsaReviewedRaw === 'true';
    const generalErrorEl = document.getElementById('multiEditError');
    const phoneErrorEl = document.getElementById('multiEditPhoneError');

    // Validación
    if (newPhone && (!/^\d{4}$/.test(newPhone))) {
        phoneErrorEl.style.display = 'block';
        return;
    }
    phoneErrorEl.style.display = 'none';
    generalErrorEl.style.display = 'none';

    if (idsToUpdate.length === 0 || (!newName && !newPhone && !newInvoiceId && !hasUsaReviewedChange)) {
        closeGenericModal();
        return;
    }

    // Deshabilitar botones para evitar doble clic
    const footerButtons = document.querySelectorAll('#genericModalFooter .btn');
    footerButtons.forEach(btn => btn.disabled = true);
    generalErrorEl.textContent = 'Actualizando...';
    generalErrorEl.style.color = 'var(--brown-text)';
    generalErrorEl.style.display = 'block';

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        // Si no se va a cambiar la factura, no hay nada que validar.
        // El backend ya valida si el ID existe, así que esta lógica es para el frontend.
        // No necesitamos una validación extra aquí por ahora.

        const updatePromises = idsToUpdate.map(id => {
            const orden = todasLasOrdenes.find(o => o.id === id);
            if (!orden) return Promise.resolve(); // Si no se encuentra la orden, se ignora

            const payload = {
                id: id,
                client_name: newName || orden.client_name,
                client_phone: newPhone || orden.client_phone,
                invoice_id: newInvoiceId ? parseInt(newInvoiceId) : orden.invoice_id
            };

            if (hasUsaReviewedChange) {
                payload.usa_reviewed = newUsaReviewed;
            }
            
            // Devolvemos la promesa del fetch para poder manejarla después.
            return fetch('/.netlify/functions/order-items', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
                body: JSON.stringify(payload)
            });
        });

        const responses = await Promise.all(updatePromises);

        // Verificamos si ALGUNA de las respuestas no fue exitosa.
        const failedResponse = responses.find(res => !res.ok);
        if (failedResponse) {
            const errorData = await failedResponse.json();
            throw new Error(errorData.error || `Error ${failedResponse.status}`);
        }

        const modalBody = document.getElementById('genericModalBody');
        modalBody.innerHTML = `✅ Se actualizaron ${idsToUpdate.length} órdenes con éxito.`;
        document.getElementById('genericModalFooter').innerHTML = ''; // Limpiar botones

        modalBody.innerHTML = `✅ Se actualizaron ${idsToUpdate.length} órdenes con éxito.`;
        setTimeout(() => { closeGenericModal(); loadAdminOrders(); }, 1500);

    } catch (error) {
        // Si hay un error, lo mostramos y reactivamos los botones.
        generalErrorEl.textContent = `⚠️ ${error.message}`;
        generalErrorEl.style.color = 'red';
        footerButtons.forEach(btn => btn.disabled = false);
    }
}

function handleOrderMultiDelete() {
    const selectedIds = getSelectedOrderIds();
    if (selectedIds.length === 0) return;

    const title = 'Confirmar Eliminación';
    const body = `¿Estás seguro de que deseas eliminar <strong>${selectedIds.length}</strong> órdenes seleccionadas? Esta acción no se puede deshacer.`;
    
    const footer = `
        <button class="btn btn-secondary" onclick="closeGenericModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="confirmOrderMultiDelete()">Eliminar</button>
    `;

    openGenericModal(title, body, footer);
}

async function confirmOrderMultiDelete() {
    const idsToDelete = getSelectedOrderIds();
    if (idsToDelete.length === 0) {
        closeGenericModal();
        return;
    }

    const modalBody = document.getElementById('genericModalBody');
    const modalFooter = document.getElementById('genericModalFooter');
    modalBody.innerHTML = `<div class="spinner"></div><p>Eliminando ${idsToDelete.length} órdenes...</p>`;
    modalFooter.innerHTML = ''; // Ocultar botones durante el proceso

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const deletePromises = idsToDelete.map(id => 
            fetch(`/.netlify/functions/order-items?id=${id}`, {
                method: 'DELETE',
                headers: { 'x-admin-token': session.token }
            })
        );

        // Esperamos a que todas las promesas se completen
        await Promise.all(deletePromises);

        modalBody.innerHTML = `✅ Se eliminaron ${idsToDelete.length} órdenes con éxito.`;
        setTimeout(() => { closeGenericModal(); loadAdminOrders(); }, 1500);

    } catch (error) {
        modalBody.innerHTML = `⚠️ Error al eliminar: ${error.message}`;
    }
}

function handleOrderMultiBulkUSA() {
    const selectedIds = getSelectedOrderIds();
    if (selectedIds.length === 0) return;

    const selectedOrders = todasLasOrdenes.filter(o => selectedIds.includes(o.id));
    const yaRevisadas = selectedOrders.filter(o => o.usa_reviewed).length;
    const sinRevisar = selectedOrders.length - yaRevisadas;

    const body = `
        <p>¿Está seguro que desea marcar <strong>${selectedIds.length} orden(es)</strong> como <strong>Revisadas en USA</strong>?</p>
        ${yaRevisadas > 0 ? `<p style="color:#c0392b; margin-top:6px;"><strong>⚠ ${yaRevisadas} ya están revisadas</strong> y serán sobrescritas.</p>` : ''}
        <p style="margin-top:6px; color:#666;">Se actualizarán ${sinRevisar} orden(es) nuevas.</p>
    `;
    const footer = `
        <button class="btn btn-secondary" onclick="closeGenericModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="closeGenericModal(); confirmBulkUSA()">Sí, Marcar Rev USA</button>
    `;
    openGenericModal('Confirmar Rev USA masivo', body, footer);
}

async function confirmBulkUSA() {
    const idsToUpdate = getSelectedOrderIds();
    if (idsToUpdate.length === 0) return;

    openGenericModal('Rev USA masivo', '<p>Actualizando...</p>', '');

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const updatePromises = idsToUpdate.map(id => {
            const orden = todasLasOrdenes.find(o => o.id === id);
            if (!orden) return Promise.resolve();
            return fetch('/.netlify/functions/order-items', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
                body: JSON.stringify({
                    id,
                    usa_reviewed: true,
                    client_phone: orden.client_phone,
                    created_at: orden.created_at
                })
            });
        });

        await Promise.all(updatePromises);

        document.getElementById('genericModalBody').innerHTML = `✅ Se marcaron ${idsToUpdate.length} órdenes como Rev USA.`;
        setTimeout(() => { closeGenericModal(); loadAdminOrders(); }, 1500);

    } catch (error) {
        document.getElementById('genericModalBody').innerHTML = `⚠️ Error: ${error.message}`;
    }
}

function volverAlGrid() {
    document.getElementById('adminGridView').style.display = 'block';
    document.getElementById('adminFormNuevoView').style.display = 'none';
    document.getElementById('adminFormEditView').style.display = 'none';
}

function abrirFormNuevo() {
    document.getElementById('adminGridView').style.display = 'none';
    document.getElementById('adminFormNuevoView').style.display = 'block';
    // Limpiar formulario
    const ids = ['nuevoClientName', 'nuevoClientPhone', 'nuevoProductName', 'nuevoSize', 'nuevoPrice']; // Aseguramos que 'nuevoClientPhone' esté en la lista.
    ids.forEach(id => document.getElementById(id).value = '');
    document.getElementById('nuevoQuantity').value = '1';
    document.getElementById('nuevoMensaje').innerHTML = '';

    // Resetear el campo de imagen
    document.getElementById('nuevoImageUrl').value = '';
    const preview = document.getElementById('nuevoImagePreview');
    if (preview) preview.querySelector('img').src = 'https://placehold.co/100x100/E19B9D/FFFFFF?text=?';
    document.getElementById('nuevoImageStatus').textContent = '';
    document.getElementById('nuevoImageUpload').value = null;
    document.getElementById('nuevoCameraUpload').value = null;
}

async function guardarNuevaOrden() {
    const mensajeEl = document.getElementById('nuevoMensaje');
    const botonGuardar = document.getElementById('btnGuardarNuevaOrden');
    mensajeEl.style.color = 'red';
    
    const client_name = document.getElementById('nuevoClientName').value.trim();
    const client_phone = document.getElementById('nuevoClientPhone').value.trim();
    const product_name = document.getElementById('nuevoProductName').value.trim();
    const price = parseFloat(document.getElementById('nuevoPrice').value);
    
    if (!client_name || !client_phone || !product_name || !price) {
        mensajeEl.textContent = 'Por favor, completa todos los campos obligatorios (*).';
        return;
    }
    if (isNaN(price) || price <= 0) {
        mensajeEl.textContent = 'El precio debe ser un número válido y mayor que cero.';
        return;
    }
    
    mensajeEl.textContent = 'Guardando...';
    mensajeEl.style.color = 'var(--brown-text)';
    botonGuardar.disabled = true;
    
    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada. Inicia sesión de nuevo.');
        
        const response = await fetch('/.netlify/functions/order-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify({
                client_name: client_name,
                client_phone: client_phone,
                product_name: product_name,
                size: document.getElementById('nuevoSize').value.trim() || null,
                quantity: parseInt(document.getElementById('nuevoQuantity').value),
                price: price,
                image_url: document.getElementById('nuevoImageUrl').value || null, // Obtener URL del campo oculto
                id_status: 1 // Por defecto, se crea como 'Pendiente' o 'Activo'
            })
        });

        if (!response.ok) throw new Error((await response.json()).error || 'No se pudo guardar.');

        mensajeEl.textContent = '✅ ¡Orden guardada con éxito!';
        mensajeEl.style.color = '#28a745';

        setTimeout(async () => {
            await loadAdminOrders(); // Recargamos los datos en segundo plano
            abrirFormNuevo();        // Limpiamos el formulario para la siguiente orden
            botonGuardar.disabled = false; // Reactivamos el botón DESPUÉS de limpiar
        }, 1500);
    } catch (error) {
        mensajeEl.textContent = `Error: ${error.message}`;
        botonGuardar.disabled = false;
    }
}

let ordenIdActual = null;

function abrirFormEdicion(id) {
    const orderId = Number(id);
    const orden = todasLasOrdenes.find(o => Number(o.id) === orderId);
    if (!orden) return;
    ordenIdActual = orderId;

    const setVal = (elId, val) => {
        const el = document.getElementById(elId);
        if (el) el.value = val || '';
    };

    setVal('editNombre', orden.client_name); // Corresponde a 'editNombre' en el HTML
    setVal('editClientPhone', orden.client_phone);
    setVal('editProducto', orden.product_name); // Corresponde a 'editProducto'
    setVal('editTalla', orden.size);
    setVal('editCantidad', orden.quantity);
    setVal('editPrecio', orden.price);
    
    // Rellenar checkboxes
    const setChecked = (elId, val) => { const el = document.getElementById(elId); if (el) el.checked = val || false; };
    setChecked('editUsaReviewed', orden.usa_reviewed);

    // Manejo del campo de imagen
    setVal('editImageUrl', orden.image_url); // Campo oculto
    const preview = document.getElementById('editImagePreview');
    if (preview) preview.querySelector('img').src = orden.image_url || 'https://placehold.co/100x100/E19B9D/FFFFFF?text=?';
    const imageStatusEl = document.getElementById('editImageStatus');
    if (imageStatusEl) imageStatusEl.textContent = '';
    document.getElementById('editImageUpload').value = null;
    document.getElementById('editCameraUpload').value = null;

    document.getElementById('editMensaje').innerHTML = '';
    
    document.getElementById('adminGridView').style.display = 'none';
    document.getElementById('adminFormEditView').style.display = 'block';
}

async function guardarEdicion() {
    const mensajeEl = document.getElementById('editMensaje');
    const botonGuardar = document.getElementById('btnGuardarEdicion');
    mensajeEl.style.color = 'red';

    const client_name = document.getElementById('editNombre').value.trim();
    const product_name = document.getElementById('editProducto').value.trim();
    const price = parseFloat(document.getElementById('editPrecio').value);
    const quantity = parseInt(document.getElementById('editCantidad').value);

    if (!client_name || !product_name || !price || !quantity) {
        mensajeEl.textContent = 'Por favor, completa todos los campos obligatorios (*).';
        return;
    }

    mensajeEl.textContent = 'Guardando...';
    mensajeEl.style.color = 'var(--brown-text)';
    botonGuardar.disabled = true;

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada. Inicia sesión de nuevo.');

        const response = await fetch('/.netlify/functions/order-items', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify({
                id: ordenIdActual,
                client_name: client_name,
                client_phone: document.getElementById('editClientPhone').value.trim() || null,
                product_name: product_name,
                size: document.getElementById('editTalla').value.trim() || null,
                quantity: quantity,
                price: price,
                image_url: document.getElementById('editImageUrl').value || null, // Obtener URL del campo oculto
                id_status: todasLasOrdenes.find(o => Number(o.id) === Number(ordenIdActual))?.id_status || 1, // Mantenemos el estado que ya existía, ya que el campo no está en el form.
                created_at: todasLasOrdenes.find(o => Number(o.id) === Number(ordenIdActual))?.created_at, // Enviamos la fecha de creación original
                usa_reviewed: document.getElementById('editUsaReviewed').checked
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo actualizar la orden.');
        }

        mensajeEl.textContent = '✅ ¡Orden actualizada con éxito!';
        mensajeEl.style.color = '#28a745';

        setTimeout(async () => {
            await loadAdminOrders();
            volverAlGrid();
            botonGuardar.disabled = false; // Reactivamos el botón DESPUÉS de volver al grid
        }, 1500);

    } catch (error) {
        mensajeEl.textContent = `Error: ${error.message}`;
        botonGuardar.disabled = false;
    }
}

function confirmToggleUSA(orderId, checkbox) {
    const marking = checkbox.checked;
    // Revertir visualmente — el modal decide si proceder
    checkbox.checked = !marking;
    const body = marking
        ? `<p>¿Está seguro que desea marcar la orden <strong>#${orderId}</strong> como <strong>Revisada en USA</strong>?</p>
           <p style="color:#c0392b; margin-top:8px;"><strong>⚠ Confirme antes de continuar.</strong></p>`
        : `<p>¿Está seguro que desea <strong>desmarcar</strong> la orden <strong>#${orderId}</strong> como Revisada en USA?</p>`;
    const label = marking ? 'Sí, Confirmar' : 'Sí, Desmarcar';
    const footer = `
        <button class="btn btn-secondary" onclick="closeGenericModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="closeGenericModal(); doToggleUSA(${orderId}, ${marking})">${label}</button>
    `;
    openGenericModal('Confirmar RevUSA', body, footer);
}

async function doToggleUSA(orderId, marking) {
    const cb = document.getElementById(`revusa-cb-${orderId}`);
    if (!cb) return;
    cb.checked = marking;
    await toggleReviewStatus(orderId, 'usa_reviewed', cb);
}

async function toggleReviewStatus(orderId, field, checkbox) {
    const isChecked = checkbox.checked;

    // Actualizar el estado local primero para una UI optimista
    const orden = todasLasOrdenes.find(o => Number(o.id) === Number(orderId));
    if (orden) {
        orden[field] = isChecked;
    } else {
        alert(`Error interno: No se encontró la orden con ID ${orderId} para actualizar.`);
        // Revertir el cambio en la UI porque no se puede procesar
        checkbox.checked = !isChecked;
        return;
    }

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const body = {
            id: orderId,
            [field]: isChecked,
            client_phone: orden?.client_phone || null, // Requerido por la política RLS para la actualización.
            created_at: orden?.created_at // Requerido por la política RLS para la actualización.
        };

        const response = await fetch('/.netlify/functions/order-items', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Respuesta de error no es JSON.' }));
            throw new Error(errorData.error || `Error ${response.status}: No se pudo actualizar el estado.`);
        }

        // El estado ya se actualizó localmente, la API lo confirmó.

    } catch (error) {
        alert(`Error al actualizar: ${error.message}`);
        // Revertir el cambio en la UI si la API falla
        checkbox.checked = !isChecked;
        if (orden) orden[field] = !isChecked;
    }
}

// Alias para que el botón del HTML funcione sin cambios
function guardarEdicionCompleta() {
    guardarEdicion();
}

async function eliminarOrden(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta orden? Esta acción no se puede deshacer.')) {
        return;
    }

    const status = document.getElementById('adminStatus');
    status.innerHTML = '<div class="spinner"></div><p>Eliminando orden...</p>';
    status.style.display = 'flex';

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const response = await fetch(`/.netlify/functions/order-items?id=${id}`, {
            method: 'DELETE',
            headers: { 'x-admin-token': session.token }
        });

        if (!response.ok) throw new Error((await response.json()).error || 'No se pudo eliminar la orden.');

        await loadAdminOrders();

    } catch (error) {
        alert(`Error al eliminar: ${error.message}`);
    }
}

async function handleImageUpload(event, formType) {
    const fileInput = event.target;
    const file = fileInput.files[0];
    if (!file) return;

    const statusEl = document.getElementById(`${formType}ImageStatus`);
    const previewImg = document.getElementById(`${formType}ImagePreview`).querySelector('img');
    const urlHiddenInput = document.getElementById(`${formType}ImageUrl`);

    statusEl.textContent = 'Subiendo imagen...';
    statusEl.style.color = 'var(--brown-text)';

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        // 1. Enviar el archivo binario directamente a la función de Netlify
        const response = await fetch('/.netlify/functions/upload-image', {
            method: 'POST',
            headers: {
                'Content-Type': file.type,
                'x-admin-token': session.token,
                'x-file-name': file.name // Enviamos el nombre del archivo en una cabecera personalizada
            },
            body: file // Enviamos el objeto File directamente
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'No se pudo subir la imagen.');
        }

        const { imageUrl } = await response.json();

        // 2. Actualizar la UI con la nueva URL
        urlHiddenInput.value = imageUrl;
        previewImg.src = imageUrl;
        statusEl.textContent = '✅ Imagen subida.';
        statusEl.style.color = '#28a745';

    } catch (error) {
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.style.color = 'red';
    }
}

function triggerFileUpload(formType) {
    // Dispara el clic en el input para seleccionar archivos del dispositivo
    document.getElementById(`${formType}ImageUpload`).click();
}

function triggerCameraUpload(formType) {
    // Dispara el clic en el input que tiene el atributo 'capture' para abrir la cámara
    document.getElementById(`${formType}CameraUpload`).click();
}


function initOrderItemsAdminPage() {
    resetOrderItemsViewState();
    loadAdminOrders();
}

window.initOrderItemsAdminPage = initOrderItemsAdminPage;

function updateQuantity(inputId, delta) {
    const input = document.getElementById(inputId);
    if (!input) return;

    let currentValue = parseInt(input.value, 10) || 0;
    let newValue = currentValue + delta;

    // Asegurarse de que el valor no sea menor que el mínimo (1)
    if (newValue < 1) {
        newValue = 1;
    }
    input.value = newValue;
}