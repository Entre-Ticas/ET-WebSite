let todosLosPayments = [];
let paymentsGlobalSearch = '';
let paymentsCurrentPage = 1;
let paymentsRowsPerPage = 10;
let paymentsSortColumn = 'payment_date';
let paymentsSortDir = 'desc';
let editingPaymentId = null;
let paymentsColumnFilters = {
    id: '', invoice_id: '', client_name: '', client_phone: '', amount: '', payment_method: '', reference_code: '', payment_date: ''
};

function resetPaymentsViewState() {
    paymentsGlobalSearch = '';
    paymentsCurrentPage = 1;
    paymentsRowsPerPage = 10;
    paymentsSortColumn = 'payment_date';
    paymentsSortDir = 'desc';
    paymentsColumnFilters = {
        id: '', invoice_id: '', client_name: '', client_phone: '', amount: '', payment_method: '', reference_code: '', payment_date: ''
    };

    const searchInput = document.getElementById('paymentsSearchInput');
    if (searchInput) searchInput.value = '';

    const rowsSelector = document.getElementById('paymentsRowsPerPageSelector');
    if (rowsSelector) rowsSelector.value = '10';

    document.querySelectorAll('.admin-filter-row input').forEach(input => { input.value = ''; });
}

async function loadAdminPayments() {
    const statusEl = document.getElementById('paymentsStatus');
    statusEl.style.display = 'flex';

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión no válida');

        const response = await fetch('/.netlify/functions/payments', {
            headers: { 'x-admin-token': session.token }
        });
        if (response.status === 401) throw new Error('No autorizado.');
        if (!response.ok) throw new Error(`Error del servidor: ${response.statusText}`);

        todosLosPayments = await response.json();
        renderPayments();

    } catch (error) {
        statusEl.innerHTML = `<p style="color:red;">⚠️ Error al cargar: ${error.message}</p>`;
    } finally {
        if (!statusEl.innerHTML.includes('Error')) {
            statusEl.style.display = 'none';
            const table = document.querySelector('#paymentsGrid .admin-table');
            if (table) table.style.display = '';
        }
    }
}

function renderPayments() {
    const table = document.querySelector('#paymentsGrid .admin-table');
    const tbody = document.getElementById('paymentsTbody');
    const noResults = document.getElementById('paymentsNoResults');

    if (!table || !tbody || !noResults) return;

    let lista = todosLosPayments.filter(p =>
        !paymentsGlobalSearch ||
        String(p.id || '').toLowerCase().includes(paymentsGlobalSearch) ||
        String(p.invoice_id || '').toLowerCase().includes(paymentsGlobalSearch) ||
        (p.client_name || '').toLowerCase().includes(paymentsGlobalSearch) ||
        (p.client_phone || '').toLowerCase().includes(paymentsGlobalSearch) ||
        (p.payment_method || '').toLowerCase().includes(paymentsGlobalSearch) ||
        (p.reference_code || '').toLowerCase().includes(paymentsGlobalSearch)
    );

    lista = lista.filter(p =>
        String(p.id || '').toLowerCase().includes(paymentsColumnFilters.id) &&
        String(p.invoice_id || '').toLowerCase().includes(paymentsColumnFilters.invoice_id) &&
        (p.client_name || '').toLowerCase().includes(paymentsColumnFilters.client_name) &&
        (p.client_phone || '').toLowerCase().includes(paymentsColumnFilters.client_phone) &&
        String(p.amount || '').toLowerCase().includes(paymentsColumnFilters.amount) &&
        (p.payment_method || '').toLowerCase().includes(paymentsColumnFilters.payment_method) &&
        (p.reference_code || '').toLowerCase().includes(paymentsColumnFilters.reference_code) &&
        (p.payment_date ? new Date(p.payment_date).toLocaleDateString('es-CR') : '').toLowerCase().includes(paymentsColumnFilters.payment_date)
    );

    if (paymentsSortColumn) {
        lista.sort((a, b) => {
            let valA = a[paymentsSortColumn] || '';
            let valB = b[paymentsSortColumn] || '';

            if (paymentsSortColumn === 'payment_date') {
                valA = new Date(valA);
                valB = new Date(valB);
                return paymentsSortDir === 'asc' ? valA - valB : valB - valA;
            }
            if (paymentsSortColumn === 'amount') {
                valA = Number(valA) || 0;
                valB = Number(valB) || 0;
                return paymentsSortDir === 'asc' ? valA - valB : valB - valA;
            }

            const comparison = String(valA).localeCompare(String(valB), 'es', { sensitivity: 'base' });
            return paymentsSortDir === 'asc' ? comparison : -comparison;
        });
    }

    const totalRows = lista.length;
    const totalPages = paymentsRowsPerPage === -1 ? 1 : Math.max(1, Math.ceil(totalRows / paymentsRowsPerPage));
    if (paymentsCurrentPage > totalPages) paymentsCurrentPage = totalPages;

    const startIndex = (paymentsCurrentPage - 1) * paymentsRowsPerPage;
    const endIndex = paymentsRowsPerPage === -1 ? totalRows : startIndex + paymentsRowsPerPage;
    const pageItems = lista.slice(startIndex, endIndex);

    const isAnyFilterActive = paymentsGlobalSearch || Object.values(paymentsColumnFilters).some(v => v !== '');
    noResults.style.display = (lista.length === 0 && isAnyFilterActive) ? 'block' : 'none';
    table.style.display = '';

    tbody.innerHTML = pageItems.map(p => `
        <tr>
            <td>${p.id}</td>
            <td>${p.invoice_id ?? ''}</td>
            <td>${p.client_name || '—'}</td>
            <td>${p.client_phone || '—'}</td>
            <td>₡${Number(p.amount || 0).toLocaleString('es-CR')}</td>
            <td>${p.payment_method || '—'}</td>
            <td>${p.reference_code || '—'}</td>
            <td>${p.payment_date ? new Date(p.payment_date).toLocaleDateString('es-CR') : 'N/A'}</td>
            <td class="admin-actions-cell">
                <button class="admin-btn-action btn-edit" onclick="openPaymentEditForm(${p.id})" title="Editar Abono"><i class="fas fa-pencil-alt"></i></button>
                <button class="admin-btn-action btn-delete" onclick="deletePayment(${p.id})" title="Eliminar Abono"><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>
    `).join('');

    updatePaymentsSortIcons();
    renderPaymentsPagination(totalRows);
}

function renderPaymentsPagination(totalRows) {
    const tfoot = document.getElementById('paymentsTableFooter');
    if (!tfoot) return;

    if (totalRows <= 10) {
        tfoot.style.display = 'none';
        return;
    }

    tfoot.style.display = '';

    const totalPages = paymentsRowsPerPage === -1 ? 1 : Math.ceil(totalRows / paymentsRowsPerPage);
    const startItem = (paymentsCurrentPage - 1) * paymentsRowsPerPage + 1;
    const endItem = paymentsRowsPerPage === -1 ? totalRows : Math.min(paymentsCurrentPage * paymentsRowsPerPage, totalRows);

    const table = document.querySelector('#paymentsGrid .admin-table');
    const numColumns = table.querySelector('thead .admin-main-header').cells.length;
    document.getElementById('paymentsFooterColspan').colSpan = numColumns;

    const infoEl = document.getElementById('paymentsPaginationInfo');
    const navEl = document.getElementById('paymentsPaginationNav');
    const selectorEl = document.getElementById('paymentsRowsPerPageSelector');

    if (infoEl) infoEl.innerHTML = `Mostrando <strong>${startItem} - ${endItem}</strong> de <strong>${totalRows}</strong>`;
    if (selectorEl) selectorEl.value = paymentsRowsPerPage;
    if (navEl) {
        navEl.innerHTML = `
            <button onclick="changePaymentsPage(${paymentsCurrentPage - 1})" ${paymentsCurrentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
            <span>Página <strong>${paymentsCurrentPage}</strong> de ${totalPages}</span>
            <button onclick="changePaymentsPage(${paymentsCurrentPage + 1})" ${paymentsCurrentPage >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
        `;
    }
}

function toLocalDateTimeInputValue(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function backToPaymentsGrid() {
    document.getElementById('paymentsGridView').style.display = 'block';
    document.getElementById('paymentsNewView').style.display = 'none';
    document.getElementById('paymentsEditView').style.display = 'none';
}

function openNewPaymentForm() {
    backToPaymentsGrid();
    document.getElementById('paymentsGridView').style.display = 'none';
    document.getElementById('paymentsNewView').style.display = 'block';

    document.getElementById('newPaymentInvoiceId').value = '';
    document.getElementById('newPaymentAmount').value = '';
    document.getElementById('newPaymentMethod').value = '';
    document.getElementById('newPaymentRef').value = '';
    document.getElementById('newPaymentDate').value = '';
    document.getElementById('newPaymentNotes').value = '';
    const err = document.getElementById('newPaymentError');
    err.textContent = '';
    err.style.color = 'red';
}

async function saveNewPayment() {
    const err = document.getElementById('newPaymentError');
    const btn = document.getElementById('btnSaveNewPayment');

    const invoiceId = document.getElementById('newPaymentInvoiceId').value.trim();
    const amount = document.getElementById('newPaymentAmount').value.trim();

    if (!invoiceId || !amount) {
        err.textContent = 'Factura ID y monto son obligatorios.';
        err.style.color = 'red';
        return;
    }

    err.textContent = 'Guardando...';
    err.style.color = 'var(--brown-text)';
    btn.disabled = true;

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const payload = {
            invoice_id: Number(invoiceId),
            amount: Number(amount),
            payment_method: document.getElementById('newPaymentMethod').value.trim() || null,
            reference_code: document.getElementById('newPaymentRef').value.trim() || null,
            notes: document.getElementById('newPaymentNotes').value.trim() || null
        };

        const dateVal = document.getElementById('newPaymentDate').value;
        if (dateVal) payload.payment_date = new Date(dateVal).toISOString();

        const response = await fetch('/.netlify/functions/payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo crear el abono.');
        }

        err.textContent = '✅ Abono creado correctamente.';
        err.style.color = '#28a745';

        await loadAdminPayments();
        backToPaymentsGrid();

    } catch (error) {
        err.textContent = `Error: ${error.message}`;
        err.style.color = 'red';
    } finally {
        btn.disabled = false;
    }
}

function openPaymentEditForm(paymentId) {
    const payment = todosLosPayments.find(p => Number(p.id) === Number(paymentId));
    if (!payment) return;

    editingPaymentId = Number(paymentId);

    document.getElementById('paymentsGridView').style.display = 'none';
    document.getElementById('paymentsEditView').style.display = 'block';

    document.getElementById('editPaymentInvoiceId').value = payment.invoice_id || '';
    document.getElementById('editPaymentAmount').value = payment.amount || '';
    document.getElementById('editPaymentMethod').value = payment.payment_method || '';
    document.getElementById('editPaymentRef').value = payment.reference_code || '';
    document.getElementById('editPaymentDate').value = toLocalDateTimeInputValue(payment.payment_date);
    document.getElementById('editPaymentNotes').value = payment.notes || '';

    const err = document.getElementById('editPaymentError');
    err.textContent = '';
    err.style.color = 'red';
}

async function savePaymentEdit() {
    const err = document.getElementById('editPaymentError');
    const btn = document.getElementById('btnSavePaymentEdit');

    if (!editingPaymentId) {
        err.textContent = 'No hay abono seleccionado para editar.';
        err.style.color = 'red';
        return;
    }

    const invoiceId = document.getElementById('editPaymentInvoiceId').value.trim();
    const amount = document.getElementById('editPaymentAmount').value.trim();

    if (!invoiceId || !amount) {
        err.textContent = 'Factura ID y monto son obligatorios.';
        err.style.color = 'red';
        return;
    }

    err.textContent = 'Guardando...';
    err.style.color = 'var(--brown-text)';
    btn.disabled = true;

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const payload = {
            id: editingPaymentId,
            invoice_id: Number(invoiceId),
            amount: Number(amount),
            payment_method: document.getElementById('editPaymentMethod').value.trim() || null,
            reference_code: document.getElementById('editPaymentRef').value.trim() || null,
            notes: document.getElementById('editPaymentNotes').value.trim() || null
        };

        const dateVal = document.getElementById('editPaymentDate').value;
        if (dateVal) payload.payment_date = new Date(dateVal).toISOString();

        const response = await fetch('/.netlify/functions/payments', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo actualizar el abono.');
        }

        err.textContent = '✅ Abono actualizado correctamente.';
        err.style.color = '#28a745';

        await loadAdminPayments();
        backToPaymentsGrid();

    } catch (error) {
        err.textContent = `Error: ${error.message}`;
        err.style.color = 'red';
    } finally {
        btn.disabled = false;
    }
}

function sortPaymentsBy(col) {
    if (paymentsSortColumn === col) {
        paymentsSortDir = paymentsSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        paymentsSortColumn = col;
        paymentsSortDir = 'asc';
    }
    renderPayments();
}

function setPaymentColumnFilter(col, value) {
    paymentsCurrentPage = 1;
    paymentsColumnFilters[col] = value.toLowerCase();
    renderPayments();
}

function updatePaymentsSortIcons() {
    document.querySelectorAll('.admin-table th.sortable').forEach(th => {
        const col = th.dataset.col;
        const arrow = th.querySelector('.sort-arrow');
        if (!arrow) return;

        if (paymentsSortColumn !== col) {
            arrow.textContent = '↕';
        } else {
            arrow.textContent = paymentsSortDir === 'asc' ? '▲' : '▼';
        }
    });
}

function filterPayments() {
    paymentsCurrentPage = 1;
    paymentsGlobalSearch = document.getElementById('paymentsSearchInput').value.toLowerCase().trim();
    renderPayments();
}
function deletePayment(id) {
    const title = 'Confirmar Eliminación';
    const body = '¿Estás seguro de que deseas eliminar este abono? Esta acción no se puede deshacer.';
    const footer = `
        <button class="btn btn-secondary" onclick="closeGenericModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="confirmDeletePayment(${Number(id)})">Eliminar</button>
    `;
    openGenericModal(title, body, footer);
}

async function confirmDeletePayment(id) {
    const modalBody = document.getElementById('genericModalBody');
    const modalFooter = document.getElementById('genericModalFooter');
    modalBody.innerHTML = '<div class="spinner"></div><p>Eliminando abono...</p>';
    modalFooter.innerHTML = '';

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const response = await fetch(`/.netlify/functions/payments?id=${Number(id)}`, {
            method: 'DELETE',
            headers: { 'x-admin-token': session.token }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo eliminar el abono.');
        }

        modalBody.innerHTML = '✅ Abono eliminado correctamente.';
        setTimeout(() => { closeGenericModal(); loadAdminPayments(); }, 1200);
    } catch (error) {
        modalBody.innerHTML = `⚠️ Error al eliminar: ${error.message}`;
        modalFooter.innerHTML = '<button class="btn btn-secondary" onclick="closeGenericModal()">Cerrar</button>';
    }
}

function changePaymentsPage(newPage) {
    paymentsCurrentPage = newPage;
    renderPayments();
}

function changePaymentsRowsPerPage(value) {
    paymentsRowsPerPage = parseInt(value, 10);
    paymentsCurrentPage = 1;
    renderPayments();
}

function initPaymentsAdminPage() {
    backToPaymentsGrid();
    editingPaymentId = null;
    resetPaymentsViewState();
    loadAdminPayments();
}

window.initPaymentsAdminPage = initPaymentsAdminPage;
