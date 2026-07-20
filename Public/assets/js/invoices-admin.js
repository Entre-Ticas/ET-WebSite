// Gestión de Facturas

let todasLasFacturas = [];
let invoicesGlobalSearch = '';
let invoicesCurrentPage = 1;
let invoicesRowsPerPage = 10;
let invoicesSortColumn = 'invoice_date'; 
let invoicesSortDir = 'desc';   
let invoicesColumnFilters = { 
    id: '', client_name: '', client_phone: '', invoice_date: '', status_name: '', items_count: '', paid: ''
};

async function loadAdminInvoices() {
    const statusEl = document.getElementById('adminStatus');
    statusEl.style.display = 'flex';

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión no válida');

        const response = await fetch('/.netlify/functions/invoices', {
            headers: { 'x-admin-token': session.token }
        });
        if (response.status === 401) throw new Error('No autorizado.');
        if (!response.ok) throw new Error(`Error del servidor: ${response.statusText}`);

        todasLasFacturas = await response.json();

        renderInvoices();

    } catch (err) {
        statusEl.innerHTML = `<p style="color:red;">⚠️ Error al cargar: ${err.message}</p>`;
    } finally {
        if (!statusEl.innerHTML.includes('Error')) {
            statusEl.style.display = 'none';
            const table = document.querySelector('#adminGrid .admin-table');
            if (table) table.style.display = '';
        }
    }
}

function renderInvoices() {
    const table = document.querySelector('#adminGrid .admin-table');
    const tbody = document.getElementById('adminTbody');
    const noResults = document.getElementById('adminNoResults');

    if (!table || !tbody || !noResults) return;

    // 1. Aplicar búsqueda global
    let lista = todasLasFacturas.filter(f =>
        !invoicesGlobalSearch ||
        (f.client_name || '').toLowerCase().includes(invoicesGlobalSearch) ||
        (f.client_phone || '').toLowerCase().includes(invoicesGlobalSearch) ||
        String(f.id).includes(invoicesGlobalSearch)
    );

    // 2. Aplicar filtros por columna
    lista = lista.filter(f =>
        String(f.id).toLowerCase().includes(invoicesColumnFilters.id) &&
        (f.client_name || '').toLowerCase().includes(invoicesColumnFilters.client_name) &&
        (f.client_phone || '').toLowerCase().includes(invoicesColumnFilters.client_phone) &&
        (f.invoice_date ? new Date(f.invoice_date).toLocaleDateString('es-CR') : '').includes(invoicesColumnFilters.invoice_date) &&
        (f.status_name || '').toLowerCase().includes(invoicesColumnFilters.status_name) &&
        (invoicesColumnFilters.paid === '' || String(f.paid) === invoicesColumnFilters.paid) &&
        String(f.items_count || '0').includes(invoicesColumnFilters.items_count)
    );

    // 3. Aplicar ordenamiento
    if (invoicesSortColumn) {
        lista.sort((a, b) => {
            let valA = a[invoicesSortColumn] || '';
            let valB = b[invoicesSortColumn] || '';

            // CORRECCIÓN: Asegurarnos de que el conteo de items se ordene como número.
            if (invoicesSortColumn === 'items_count') {
                valA = parseInt(valA, 10) || 0;
                valB = parseInt(valB, 10) || 0;
                return invoicesSortDir === 'asc' ? valA - valB : valB - valA;
            }
            if (invoicesSortColumn === 'invoice_date') {
                valA = new Date(valA);
                valB = new Date(valB);
                return invoicesSortDir === 'asc' ? valA - valB : valB - valA;
            }
            const comparison = String(valA).localeCompare(String(valB), 'es', { sensitivity: 'base' });
            return invoicesSortDir === 'asc' ? comparison : -comparison;
        });
    }

    const totalRows = lista.length;

    // 4. Aplicar paginación
    const startIndex = (invoicesCurrentPage - 1) * invoicesRowsPerPage;
    const endIndex = invoicesRowsPerPage === -1 ? totalRows : startIndex + invoicesRowsPerPage;
    const paginatedItems = lista.slice(startIndex, endIndex);

    if (paginatedItems.length === 0) {
        noResults.style.display = 'block';
        table.style.display = 'none';
        tbody.innerHTML = '';
    } else {
        noResults.style.display = 'none';
        table.style.display = '';
    }
    
    const rowsHtml = paginatedItems.map(f => `
            <tr>
                <td class="col-select" style="display: none;"><input type="checkbox" class="row-selector" data-id="${f.id}" onchange="updateMultiSelectActions()"></td>
                <td>${f.id}</td>
                <td>${f.client_name || ''}</td>
                <td>${f.client_phone || ''}</td>
                <td>${f.invoice_date ? new Date(f.invoice_date).toLocaleDateString('es-CR') : 'N/A'}</td>
                <td>${f.status_name || 'N/A'}</td>
                <td style="text-align: center;">${parseInt(f.items_count, 10) || 0}</td>
                <td style="text-align: center;"><input type="checkbox" onchange="togglePaidStatus(${f.id}, this)" ${f.paid ? 'checked' : ''}></td>
                <td class="admin-actions-cell">
                    <button class="admin-btn-action btn-invoice" onclick="verFactura(${f.id})" title="Ver Detalle de Factura"><i class="fas fa-eye"></i></button>
                    <button class="admin-btn-action btn-delete" onclick="eliminarFactura(${f.id})" title="Eliminar Factura"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>`
    ).join('');

    tbody.innerHTML = rowsHtml;
    actualizarIconosOrden();
    toggleMultiSelect(document.getElementById('multiSelectToggle')?.checked || false);
    renderPagination(totalRows);
}

function renderPagination(totalRows) {
    const tfoot = document.getElementById('adminTableFooter');
    if (!tfoot) return;

    if (totalRows <= 10) {
        tfoot.style.display = 'none';
        return;
    }

    tfoot.style.display = '';

    const totalPages = invoicesRowsPerPage === -1 ? 1 : Math.ceil(totalRows / invoicesRowsPerPage);
    const startItem = (invoicesCurrentPage - 1) * invoicesRowsPerPage + 1;
    const endItem = invoicesRowsPerPage === -1 ? totalRows : Math.min(invoicesCurrentPage * invoicesRowsPerPage, totalRows);
    
    const table = document.querySelector('#adminGrid .admin-table');
    const numColumns = table.querySelector('thead .admin-main-header').cells.length;
    document.getElementById('footerColspan').colSpan = numColumns;

    const infoEl = document.getElementById('paginationInfo');
    const navEl = document.getElementById('paginationNav');
    const selectorEl = document.getElementById('rowsPerPageSelector');

    if (infoEl) infoEl.innerHTML = `Mostrando <strong>${startItem} - ${endItem}</strong> de <strong>${totalRows}</strong>`;
    if (selectorEl) selectorEl.value = invoicesRowsPerPage;
    if (navEl) {
        navEl.innerHTML = `
            <button onclick="changeInvoicePage(${invoicesCurrentPage - 1})" ${invoicesCurrentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
            <span>Página <strong>${invoicesCurrentPage}</strong> de ${totalPages}</span>
            <button onclick="changeInvoicePage(${invoicesCurrentPage + 1})" ${invoicesCurrentPage >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
        `;
    }
}

function changeInvoicePage(newPage) {
    invoicesCurrentPage = newPage;
    renderInvoices();
}

function changeRowsPerPage(value) {
    invoicesRowsPerPage = parseInt(value, 10);
    invoicesCurrentPage = 1;
    renderInvoices();
}

function verFactura(invoiceId) {
    if (typeof loadPage === 'function') loadPage('admin/invoice', invoiceId);
}

function sortBy(col) {
    if (invoicesSortColumn === col) {
        invoicesSortDir = invoicesSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        invoicesSortColumn = col;
        invoicesSortDir = 'asc';
    }
    renderInvoices();
}

function setColumnFilter(col, value) {
    invoicesCurrentPage = 1;
    invoicesColumnFilters[col] = value.toLowerCase();
    renderInvoices();
}

function actualizarIconosOrden() {
    document.querySelectorAll('.admin-table th.sortable').forEach(th => {
        const col = th.dataset.col;
        const arrow = th.querySelector('.sort-arrow');
        if (!arrow) return;
        if (invoicesSortColumn !== col) {
            arrow.textContent = '↕';
        } else {
            arrow.textContent = invoicesSortDir === 'asc' ? '▲' : '▼';
        }
    });
}

function filtrarFacturas() {
    invoicesCurrentPage = 1;
    invoicesGlobalSearch = document.getElementById('adminSearchInput').value.toLowerCase().trim();
    renderInvoices();
}

// --- Lógica de Selección Múltiple (Copiada y Adaptada) ---

function toggleMultiSelect(isMultiSelect) {
    document.querySelectorAll('.col-select').forEach(col => {
        col.style.display = isMultiSelect ? '' : 'none';
    });
    if (!isMultiSelect) {
        document.querySelectorAll('.row-selector').forEach(chk => chk.checked = false);
        const selectAllCheckbox = document.querySelector('.admin-main-header .col-select input[type="checkbox"]');
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
    }
    updateMultiSelectActions();
}

function toggleSelectAll(isChecked) {
    document.querySelectorAll('.row-selector').forEach(chk => {
        chk.checked = isChecked;
    });
    updateMultiSelectActions();
}

function getSelectedInvoiceIds() {
    return Array.from(document.querySelectorAll('.row-selector:checked'))
                .map(chk => Number(chk.dataset.id));
}

function updateMultiSelectActions() {
    const selectedIds = getSelectedInvoiceIds();
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

async function togglePaidStatus(invoiceId, checkbox) {
    const isChecked = checkbox.checked;
    const factura = todasLasFacturas.find(f => f.id === invoiceId);
    if (factura) factura.paid = isChecked;

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const response = await fetch('/.netlify/functions/invoices', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify({ id: invoiceId, paid: isChecked })
        });

        if (!response.ok) throw new Error('No se pudo actualizar el estado de pago.');

    } catch (error) {
        alert(`Error: ${error.message}`);
        if (factura) factura.paid = !isChecked;
        checkbox.checked = !isChecked;
    }
}

function handleMultiEdit() {
    const selectedIds = getSelectedInvoiceIds();
    if (selectedIds.length === 0) return;
    
    // Aquí iría la lógica para abrir un modal y editar campos de las facturas seleccionadas.
    // Por ejemplo, cambiar el estado (abierta, cerrada, etc.) o marcarlas como pagadas.
    openGenericModal(
        `Editar ${selectedIds.length} Facturas`,
        `<p>La edición múltiple de facturas aún no está implementada.</p>
         <p>IDs seleccionados: ${selectedIds.join(', ')}</p>`,
        `<button class="btn btn-secondary" onclick="closeGenericModal()">Cerrar</button>`
    );
}

async function handleMultiDelete() {
    const idsToDelete = getSelectedInvoiceIds();
    if (idsToDelete.length === 0) return;

    const title = 'Confirmar Eliminación';
    const body = `¿Estás seguro de que deseas eliminar <strong>${idsToDelete.length}</strong> facturas? Esta acción también podría afectar a las órdenes asociadas.`;
    const footer = `
        <button class="btn btn-secondary" onclick="closeGenericModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="confirmMultiDelete()">Eliminar</button>
    `;
    openGenericModal(title, body, footer);
}

async function confirmMultiDelete() {
    const idsToDelete = getSelectedInvoiceIds();
    if (idsToDelete.length === 0) return closeGenericModal();

    const modalBody = document.getElementById('genericModalBody');
    const modalFooter = document.getElementById('genericModalFooter');
    modalBody.innerHTML = `<div class="spinner"></div><p>Eliminando ${idsToDelete.length} facturas...</p>`;
    modalFooter.innerHTML = '';

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const deletePromises = idsToDelete.map(id => 
            fetch(`/.netlify/functions/invoices?id=${id}`, {
                method: 'DELETE',
                headers: { 'x-admin-token': session.token }
            })
        );

        const responses = await Promise.all(deletePromises);
        const failed = responses.find(res => !res.ok);
        if (failed) throw new Error('Al menos una factura no se pudo eliminar.');

        modalBody.innerHTML = `✅ Se eliminaron ${idsToDelete.length} facturas con éxito.`;
        setTimeout(() => { closeGenericModal(); loadAdminInvoices(); }, 1500);

    } catch (error) {
        modalBody.innerHTML = `⚠️ Error al eliminar: ${error.message}`;
        modalFooter.innerHTML = `<button class="btn btn-secondary" onclick="closeGenericModal()">Cerrar</button>`;
    }
}

function eliminarFactura(id) {
    // Reutilizamos la lógica de selección múltiple para una sola factura
    document.querySelectorAll('.row-selector').forEach(chk => chk.checked = (Number(chk.dataset.id) === id));
    handleMultiDelete();
}

function initInvoicesAdminPage() {
    loadAdminInvoices();
}

window.initInvoicesAdminPage = initInvoicesAdminPage;