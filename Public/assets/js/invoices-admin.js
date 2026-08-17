// Gestión de Facturas

let todasLasFacturas = [];
let invoicesGlobalSearch = '';
let invoicesCurrentPage = 1;
let invoicesRowsPerPage = 10;
let invoicesSortColumn = 'invoice_date'; 
let invoicesSortDir = 'desc';   
let editingInvoiceId = null;
let invoicesColumnFilters = { 
    id: '', client_name: '', client_phone: '', invoice_date: '', status_name: '', items_count: '', paid: ''
};

function resetInvoicesViewState() {
    invoicesGlobalSearch = '';
    invoicesCurrentPage = 1;
    invoicesRowsPerPage = 10;
    invoicesSortColumn = 'invoice_date';
    invoicesSortDir = 'desc';
    invoicesColumnFilters = {
        id: '', client_name: '', client_phone: '', invoice_date: '', status_name: '', items_count: '', paid: ''
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

            if (invoicesSortColumn === 'items_count') {
                return invoicesSortDir === 'asc'
                    ? String(valA).localeCompare(String(valB), 'es', { sensitivity: 'base' })
                    : String(valB).localeCompare(String(valA), 'es', { sensitivity: 'base' });
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
    const totalPages = invoicesRowsPerPage === -1 ? 1 : Math.max(1, Math.ceil(totalRows / invoicesRowsPerPage));
    if (invoicesCurrentPage > totalPages) invoicesCurrentPage = totalPages;
    if (invoicesCurrentPage < 1) invoicesCurrentPage = 1;

    // 4. Aplicar paginación
    const startIndex = (invoicesCurrentPage - 1) * invoicesRowsPerPage;
    const endIndex = invoicesRowsPerPage === -1 ? totalRows : startIndex + invoicesRowsPerPage;
    const paginatedItems = lista.slice(startIndex, endIndex);

    const isAnyFilterActive = invoicesGlobalSearch || Object.values(invoicesColumnFilters).some(v => v !== '');
    noResults.style.display = (lista.length === 0 && isAnyFilterActive) ? 'block' : 'none';
    table.style.display = '';
    tbody.innerHTML = '';
    
    const rowsHtml = paginatedItems.map(f => `
            <tr>
                <td class="col-select" style="display: none;"><input type="checkbox" class="row-selector" data-id="${f.id}" onchange="updateInvoiceMultiSelectActions()"></td>
                <td>${f.id}</td>
                <td>${f.client_name || ''}</td>
                <td>${f.client_phone || ''}</td>
                <td>${f.invoice_date ? new Date(f.invoice_date).toLocaleDateString('es-CR') : 'N/A'}</td>
                <td>${f.status_name || 'N/A'}</td>
                <td style="text-align: center;">${f.items_count || '0'}</td>
                <td style="text-align: center;"><input type="checkbox" id="paid-cb-${f.id}" onclick="confirmTogglePaid(${f.id}, this)" ${f.paid ? 'checked' : ''}></td>
                <td class="admin-actions-cell">
                    <button class="admin-btn-action btn-edit" onclick="openInvoiceEditForm(${f.id})" title="Editar Factura"><i class="fas fa-pencil-alt"></i></button>
                    <button class="admin-btn-action btn-invoice" onclick="viewInvoiceDetail('${f.public_ref || ''}', ${f.id})" title="Ver Detalle de Factura"><i class="fas fa-file-invoice-dollar"></i></button>
                    <button class="admin-btn-action btn-delete" onclick="eliminarFactura(${f.id})" title="Eliminar Factura"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>`
    ).join('');

    tbody.innerHTML = rowsHtml;
    updateInvoiceSortIcons();
    toggleInvoiceMultiSelect(document.getElementById('multiSelectToggle')?.checked || false);
    renderInvoicePagination(totalRows);
}

function renderInvoicePagination(totalRows) {
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

function changeInvoiceRowsPerPage(value) {
    invoicesRowsPerPage = parseInt(value, 10);
    invoicesCurrentPage = 1;
    renderInvoices();
}

async function viewInvoiceDetail(publicRef, invoiceId) {
    try {
        let refToUse = publicRef;

        if (!refToUse) {
            const session = getSession();
            if (!session) throw new Error('Sesión no válida.');

            const response = await fetch(`/.netlify/functions/invoices?id=${invoiceId}`, {
                headers: { 'x-admin-token': session.token }
            });

            if (!response.ok) {
                throw new Error('No se pudo generar el enlace seguro de factura.');
            }

            const payload = await response.json();
            refToUse = payload?.invoice?.public_ref || null;
        }

        if (!refToUse) {
            throw new Error('No se encontró una referencia válida para la factura.');
        }

        if (typeof loadPage === 'function') loadPage('invoice', refToUse);
    } catch (error) {
        alert(error.message || 'No se pudo abrir la factura.');
    }
}

function backToInvoicesGrid() {
    const gridView = document.getElementById('adminGridView');
    const newView = document.getElementById('adminFormNuevoView');
    const editView = document.getElementById('adminFormEditView');

    if (gridView) gridView.style.display = 'block';
    if (newView) newView.style.display = 'none';
    if (editView) editView.style.display = 'none';
}

function toLocalDateTimeInputValue(value) {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const pad = (n) => String(n).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());

    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function openNewInvoiceForm() {
    const gridView = document.getElementById('adminGridView');
    const newView = document.getElementById('adminFormNuevoView');

    if (gridView) gridView.style.display = 'none';
    if (newView) newView.style.display = 'block';

    const nameEl = document.getElementById('newInvoiceClientName');
    const phoneEl = document.getElementById('newInvoiceClientPhone');
    const dateEl = document.getElementById('newInvoiceDate');
    const statusEl = document.getElementById('newInvoiceStatusId');
    const paidEl = document.getElementById('newInvoicePaid');
    const errorEl = document.getElementById('newInvoiceError');

    if (nameEl) nameEl.value = '';
    if (phoneEl) phoneEl.value = '';
    if (dateEl) dateEl.value = '';
    if (statusEl) statusEl.value = '';
    if (paidEl) paidEl.checked = false;
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.color = 'red';
    }
}

async function saveNewInvoice() {
    const errorEl = document.getElementById('newInvoiceError');
    const saveBtn = document.getElementById('btnGuardarNuevaFactura');

    const clientName = document.getElementById('newInvoiceClientName')?.value.trim() || '';
    const clientPhone = document.getElementById('newInvoiceClientPhone')?.value.trim() || '';
    const invoiceDate = document.getElementById('newInvoiceDate')?.value || '';
    const statusIdRaw = document.getElementById('newInvoiceStatusId')?.value.trim() || '';
    const paid = document.getElementById('newInvoicePaid')?.checked || false;

    if (!clientName || !clientPhone) {
        errorEl.textContent = 'Nombre y telefono son obligatorios.';
        errorEl.style.color = 'red';
        return;
    }

    if (errorEl) {
        errorEl.textContent = 'Guardando...';
        errorEl.style.color = 'var(--brown-text)';
    }
    if (saveBtn) saveBtn.disabled = true;

    try {
        const session = getSession();
        if (!session) throw new Error('Sesion expirada.');

        const payload = {
            client_name: clientName,
            client_phone: clientPhone,
            paid
        };

        if (invoiceDate) {
            payload.invoice_date = new Date(invoiceDate).toISOString();
        }

        if (statusIdRaw) {
            payload.id_status = parseInt(statusIdRaw, 10);
        }

        const response = await fetch('/.netlify/functions/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo crear la factura.');
        }

        if (errorEl) {
            errorEl.textContent = '✅ Factura creada correctamente.';
            errorEl.style.color = '#28a745';
        }

        await loadAdminInvoices();
        backToInvoicesGrid();

    } catch (error) {
        if (errorEl) {
            errorEl.textContent = `Error: ${error.message}`;
            errorEl.style.color = 'red';
        }
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function openInvoiceEditForm(invoiceId) {
    const factura = todasLasFacturas.find(f => Number(f.id) === Number(invoiceId));
    if (!factura) return;

    editingInvoiceId = Number(invoiceId);

    const gridView = document.getElementById('adminGridView');
    const editView = document.getElementById('adminFormEditView');

    if (gridView) gridView.style.display = 'none';
    if (editView) editView.style.display = 'block';

    const nameEl = document.getElementById('editInvoiceClientName');
    const phoneEl = document.getElementById('editInvoiceClientPhone');
    const dateEl = document.getElementById('editInvoiceDate');
    const statusEl = document.getElementById('editInvoiceStatusId');
    const paidEl = document.getElementById('editInvoicePaid');
    const errorEl = document.getElementById('editInvoiceError');

    if (nameEl) nameEl.value = factura.client_name || '';
    if (phoneEl) phoneEl.value = factura.client_phone || '';
    if (dateEl) dateEl.value = toLocalDateTimeInputValue(factura.invoice_date);
    if (statusEl) statusEl.value = factura.id_status || 1;
    if (paidEl) paidEl.checked = Boolean(factura.paid);
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.color = 'red';
    }
}

async function saveInvoiceEdit() {
    const errorEl = document.getElementById('editInvoiceError');
    const saveBtn = document.getElementById('btnGuardarEdicionFactura');

    if (!editingInvoiceId) {
        if (errorEl) {
            errorEl.textContent = 'No hay factura seleccionada para editar.';
            errorEl.style.color = 'red';
        }
        return;
    }

    const clientName = document.getElementById('editInvoiceClientName')?.value.trim() || '';
    const clientPhone = document.getElementById('editInvoiceClientPhone')?.value.trim() || '';
    const invoiceDate = document.getElementById('editInvoiceDate')?.value || '';
    const statusIdRaw = document.getElementById('editInvoiceStatusId')?.value.trim() || '';
    const paid = document.getElementById('editInvoicePaid')?.checked || false;

    if (!clientName || !clientPhone) {
        if (errorEl) {
            errorEl.textContent = 'Nombre y telefono son obligatorios.';
            errorEl.style.color = 'red';
        }
        return;
    }

    if (!/^\d{1,4}$/.test(clientPhone)) {
        if (errorEl) {
            errorEl.textContent = 'El telefono debe ser numerico y de maximo 4 digitos.';
            errorEl.style.color = 'red';
        }
        return;
    }

    if (errorEl) {
        errorEl.textContent = 'Guardando...';
        errorEl.style.color = 'var(--brown-text)';
    }
    if (saveBtn) saveBtn.disabled = true;

    try {
        const session = getSession();
        if (!session) throw new Error('Sesion expirada.');

        const payload = {
            id: editingInvoiceId,
            client_name: clientName,
            client_phone: clientPhone,
            paid,
            id_status: statusIdRaw ? parseInt(statusIdRaw, 10) : 1
        };

        if (invoiceDate) {
            payload.invoice_date = new Date(invoiceDate).toISOString();
        }

        const response = await fetch('/.netlify/functions/invoices', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo actualizar la factura.');
        }

        if (errorEl) {
            errorEl.textContent = '✅ Factura actualizada correctamente.';
            errorEl.style.color = '#28a745';
        }

        await loadAdminInvoices();
        backToInvoicesGrid();
    } catch (error) {
        if (errorEl) {
            errorEl.textContent = `Error: ${error.message}`;
            errorEl.style.color = 'red';
        }
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function sortInvoicesBy(col) {
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

function updateInvoiceSortIcons() {
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


function toggleInvoiceMultiSelect(isMultiSelect) {
    document.querySelectorAll('.col-select').forEach(col => {
        col.style.display = isMultiSelect ? '' : 'none';
    });
    if (!isMultiSelect) {
        document.querySelectorAll('.row-selector').forEach(chk => chk.checked = false);
        const selectAllCheckbox = document.querySelector('.admin-main-header .col-select input[type="checkbox"]');
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
    }
    updateInvoiceMultiSelectActions();
}

function toggleInvoiceSelectAll(isChecked) {
    document.querySelectorAll('.row-selector').forEach(chk => {
        chk.checked = isChecked;
    });
    updateInvoiceMultiSelectActions();
}

function getSelectedInvoiceIds() {
    return Array.from(document.querySelectorAll('.row-selector:checked'))
                .map(chk => Number(chk.dataset.id));
}

function updateInvoiceMultiSelectActions() {
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

function confirmTogglePaid(invoiceId, checkbox) {
    const marking = checkbox.checked;
    checkbox.checked = !marking;
    const body = marking
        ? `<p>¿Está seguro que desea marcar la factura <strong>#${invoiceId}</strong> como <strong>Pagada</strong>?</p>
           <p style="color:#c0392b; margin-top:8px;"><strong>⚠ Esta acción no puede revertirse.</strong><br>La factura dejará de estar disponible para modificaciones.</p>`
        : `<p>¿Está seguro que desea <strong>desmarcar</strong> la factura <strong>#${invoiceId}</strong> como Pagada?</p>`;
    const label = marking ? 'Sí, Marcar como Pagada' : 'Sí, Desmarcar';
    const footer = `
        <button class="btn btn-secondary" onclick="closeGenericModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="closeGenericModal(); confirmPaidAction(${invoiceId}, ${marking})">${label}</button>
    `;
    openGenericModal('Confirmar cambio de estado', body, footer);
}

async function confirmPaidAction(invoiceId, marking) {
    const cb = document.getElementById(`paid-cb-${invoiceId}`);
    if (!cb) return;
    cb.checked = marking;
    await togglePaidStatus(invoiceId, cb);
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
        const failedResponse = responses.find(res => !res.ok);

        if (failedResponse) {
            // Intentamos leer el cuerpo del error para un mensaje más específico.
            const errorData = await failedResponse.json().catch(() => ({}));
            // Usamos el mensaje del backend si existe, si no, uno genérico.
            throw new Error(errorData.error || 'Al menos una factura no se pudo eliminar.');
        }

        const successfulDeletes = responses.filter(res => res.ok).length;
        modalBody.innerHTML = `✅ Se eliminaron ${successfulDeletes} facturas con éxito.`;
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
    backToInvoicesGrid();
    editingInvoiceId = null;
    resetInvoicesViewState();
    loadAdminInvoices();
}

window.initInvoicesAdminPage = initInvoicesAdminPage;
window.openInvoiceEditForm = openInvoiceEditForm;
window.saveInvoiceEdit = saveInvoiceEdit;
window.backToInvoicesGrid = backToInvoicesGrid;