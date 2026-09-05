let todosLosPayments = [];
let activeUnpaidInvoices = [];
let paymentsGlobalSearch = '';
let paymentsCurrentPage = 1;
let paymentsRowsPerPage = 10;
let paymentsSortColumn = 'payment_date';
let paymentsSortDir = 'desc';
let editingPaymentId = null;
let paymentsColumnFilters = {
    id: '', invoice_id: '', client_name: '', client_phone: '', amount: '', payment_method: '', reference_code: '', payment_date: ''
};

registerAdminRowsPerPageDropdown({
    name: 'payments',
    dropdownId: 'paymentsRowsDropdown',
    triggerId: 'paymentsRowsPerPageTrigger',
    menuId: 'paymentsRowsPerPageMenu',
    labelId: 'paymentsRowsPerPageSelectedLabel',
    selectorId: 'paymentsRowsPerPageSelector',
    toggleFnName: 'togglePaymentsRowsPerPageDropdown',
    selectFnName: 'selectPaymentsRowsPerPage',
    getValue: () => paymentsRowsPerPage,
    onSelect: (value) => {
        paymentsRowsPerPage = parseInt(value, 10);
        paymentsCurrentPage = 1;
        renderPayments();
    }
});

function normalizeInvoiceSearchText(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function getActiveUnpaidInvoiceSuggestions(query = '') {
    const normalizedQuery = normalizeInvoiceSearchText(query);

    if (!normalizedQuery) {
        return activeUnpaidInvoices.slice(0, 8);
    }

    return activeUnpaidInvoices
        .filter((invoice) => {
            const idText = String(invoice.id ?? '');
            const nameText = String(invoice.client_name ?? '');
            const phoneText = String(invoice.client_phone ?? '');
            const haystack = `${idText} ${nameText} ${phoneText}`.toLowerCase();
            return haystack.includes(normalizedQuery);
        })
        .slice(0, 8);
}

function bindInvoiceIdAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const wrapper = input.parentElement;
    const list = document.createElement('div');
    list.className = 'bulk-client-suggestions hidden';
    wrapper.appendChild(list);

    const hideSuggestions = () => {
        list.classList.add('hidden');
        list.innerHTML = '';
    };

    const renderSuggestions = () => {
        const suggestions = getActiveUnpaidInvoiceSuggestions(input.value);

        if (!suggestions.length) {
            hideSuggestions();
            return;
        }

        list.innerHTML = suggestions.map((invoice) => `
            <button type="button" class="bulk-client-suggestion" data-id="${invoice.id}">
                <span>#${invoice.id}</span>
                <small>${invoice.client_name || 'Sin nombre'}</small>
                <small>${invoice.client_phone || 'Sin teléfono'}</small>
            </button>
        `).join('');

        list.classList.remove('hidden');

        list.querySelectorAll('.bulk-client-suggestion').forEach((button) => {
            button.addEventListener('click', () => {
                input.value = button.dataset.id;
                hideSuggestions();
            });
        });
    };

    const positionSuggestions = () => {
        const rect = input.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        const width = Math.max(220, Math.min(360, rect.width));
        list.style.position = 'absolute';
        list.style.left = '0px';
        list.style.top = `${rect.height + 8}px`;
        list.style.width = `${width}px`;
        list.style.maxWidth = `${Math.max(220, wrapperRect.width)}px`;
        list.style.zIndex = '30';
    };

    input.addEventListener('input', () => {
        if (!input.value.trim()) {
            hideSuggestions();
            return;
        }
        renderSuggestions();
        positionSuggestions();
    });

    input.addEventListener('focus', () => {
        if (input.value.trim()) {
            renderSuggestions();
            positionSuggestions();
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(hideSuggestions, 180);
    });
}

async function loadActiveUnpaidInvoices() {
    try {
        const session = getSession();
        if (!session) return;

        const response = await fetch('/.netlify/functions/invoices', {
            headers: { 'x-admin-token': session.token }
        });

        if (!response.ok) {
            throw new Error('No se pudieron cargar las facturas activas.');
        }

        const invoices = await response.json();
        activeUnpaidInvoices = Array.isArray(invoices)
            ? invoices
                .filter(invoice => invoice && invoice.paid === false)
                .map(invoice => ({
                    id: Number(invoice.id),
                    client_name: invoice.client_name || 'Sin nombre',
                    client_phone: invoice.client_phone || ''
                }))
                .filter(invoice => Number.isFinite(invoice.id) && invoice.id > 0)
            : [];
    } catch (error) {
        console.warn('Warning: loadActiveUnpaidInvoices', error.message);
        activeUnpaidInvoices = [];
    }
}

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
    syncAdminRowsPerPageDropdown('payments');
    closeAdminRowsPerPageDropdown('payments');

    document.querySelectorAll('.admin-filter-row input').forEach(input => { input.value = ''; });
}

async function loadAdminPayments() {
    const statusEl = document.getElementById('paymentsStatus');
    statusEl.style.display = 'flex';

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión no válida');

        await loadActiveUnpaidInvoices();

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
            <td style="text-align:center;"><input type="checkbox" id="bankrev-cb-${p.id}" onclick="confirmTogglePaymentBank(${p.id}, this)" ${p.bank_reviewed ? 'checked' : ''}></td>
            <td class="admin-actions-cell">
                <button class="admin-btn-action btn-edit" onclick="openPaymentEditForm(${p.id})" title="Editar Abono"><i class="fas fa-pencil-alt"></i></button>
                <button class="admin-btn-action btn-copy" onclick="copiarLinkFactura(this, ${p.invoice_id ?? 'null'})" title="Copiar Link de Factura"><i class="fas fa-copy"></i></button>
                <button class="admin-btn-action btn-invoice" onclick="verFactura(${p.invoice_id ?? 'null'})" title="Ir a Factura"><i class="fas fa-file-invoice-dollar"></i></button>
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
    syncAdminRowsPerPageDropdown('payments');
    if (navEl) {
        navEl.innerHTML = `
            <button onclick="changePaymentsPage(${paymentsCurrentPage - 1})" ${paymentsCurrentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
            <span>Página <strong>${paymentsCurrentPage}</strong> de ${totalPages}</span>
            <button onclick="changePaymentsPage(${paymentsCurrentPage + 1})" ${paymentsCurrentPage >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
        `;
    }
}

function copiarLinkFactura(btn, invoiceId) {
    return copyInvoiceLink(btn, invoiceId, {
        missingMessage: 'Este abono no tiene factura asociada.'
    });
}

function verFactura(invoiceId) {
    return openInvoiceInNewTab(invoiceId, null, {
        missingMessage: 'Este abono no tiene factura asociada.'
    });
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
    document.getElementById('newPaymentBankReviewed').checked = false;
    document.getElementById('newPaymentNotes').value = '';
    bindInvoiceIdAutocomplete('newPaymentInvoiceId');
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

    const parsedInvoiceId = Number(invoiceId);
    if (!Number.isFinite(parsedInvoiceId) || parsedInvoiceId <= 0) {
        err.textContent = 'Factura ID inválido.';
        err.style.color = 'red';
        return;
    }

    const invoiceLookup = activeUnpaidInvoices.find(invoice => Number(invoice.id) === parsedInvoiceId);
    if (!invoiceLookup) {
        err.textContent = 'La factura no existe o ya está pagada.';
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
            invoice_id: parsedInvoiceId,
            amount: Number(amount),
            payment_method: document.getElementById('newPaymentMethod').value.trim() || null,
            reference_code: document.getElementById('newPaymentRef').value.trim() || null,
            notes: document.getElementById('newPaymentNotes').value.trim() || null,
            bank_reviewed: document.getElementById('newPaymentBankReviewed').checked
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
    document.getElementById('editPaymentBankReviewed').checked = !!payment.bank_reviewed;
    document.getElementById('editPaymentNotes').value = payment.notes || '';
    bindInvoiceIdAutocomplete('editPaymentInvoiceId');

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

    const parsedInvoiceId = Number(invoiceId);
    if (!Number.isFinite(parsedInvoiceId) || parsedInvoiceId <= 0) {
        err.textContent = 'Factura ID inválido.';
        err.style.color = 'red';
        return;
    }

    const invoiceLookup = activeUnpaidInvoices.find(invoice => Number(invoice.id) === parsedInvoiceId);
    if (!invoiceLookup && Number(document.getElementById('editPaymentInvoiceId').value) !== Number(editingPaymentId)) {
        err.textContent = 'La factura no existe o ya está pagada.';
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
            invoice_id: parsedInvoiceId,
            amount: Number(amount),
            payment_method: document.getElementById('editPaymentMethod').value.trim() || null,
            reference_code: document.getElementById('editPaymentRef').value.trim() || null,
            notes: document.getElementById('editPaymentNotes').value.trim() || null,
            bank_reviewed: document.getElementById('editPaymentBankReviewed').checked
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

function confirmTogglePaymentBank(paymentId, checkbox) {
    const marking = checkbox.checked;
    checkbox.checked = !marking;

    const body = marking
        ? `<p>¿Está seguro de marcar el abono <strong>#${paymentId}</strong> como <strong>revisado en banco</strong>?</p>`
        : `<p>¿Está seguro de desmarcar el abono <strong>#${paymentId}</strong> como revisado en banco?</p>`;
    const label = marking ? 'Sí, Confirmar' : 'Sí, Desmarcar';
    const footer = `
        <button class="btn btn-secondary" onclick="closeGenericModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="closeGenericModal(); doTogglePaymentBank(${paymentId}, ${marking})">${label}</button>
    `;
    openGenericModal('Confirmar revisión en banco', body, footer);
}

async function doTogglePaymentBank(paymentId, marking) {
    const checkbox = document.getElementById(`bankrev-cb-${paymentId}`);
    if (!checkbox) return;
    checkbox.checked = marking;
    await togglePaymentReviewStatus(paymentId, 'bank_reviewed', checkbox);
}

async function togglePaymentReviewStatus(paymentId, field, checkbox) {
    const isChecked = checkbox.checked;
    const payment = todosLosPayments.find(p => Number(p.id) === Number(paymentId));
    if (payment) {
        payment[field] = isChecked;
    } else {
        alert(`Error interno: No se encontró el abono con ID ${paymentId} para actualizar.`);
        checkbox.checked = !isChecked;
        return;
    }

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const response = await fetch('/.netlify/functions/payments', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify({ id: paymentId, [field]: isChecked })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Respuesta de error no es JSON.' }));
            throw new Error(errorData.error || `Error ${response.status}: No se pudo actualizar el estado.`);
        }
    } catch (error) {
        alert(`Error al actualizar: ${error.message}`);
        checkbox.checked = !isChecked;
        if (payment) payment[field] = !isChecked;
    }
}
function deletePayment(id) {
    const payment = todosLosPayments.find(p => Number(p.id) === Number(id));
    const clientName = escapePaymentDeleteText(payment?.client_name || 'Cliente no disponible');
    const invoiceId = payment?.invoice_id ?? '--';
    const paymentMethod = escapePaymentDeleteText(payment?.payment_method || 'Sin método');
    const referenceCode = payment?.reference_code ? escapePaymentDeleteText(payment.reference_code) : 'Sin referencia';
    const amount = `₡${Number(payment?.amount || 0).toLocaleString('es-CR')}`;

    const title = 'Confirmar Eliminación';
    const body = `
        <p>¿Está seguro que desea eliminar el abono de <strong>${clientName}</strong>?</p>
        <p><strong>Factura #:</strong> ${invoiceId} | <strong>Método:</strong> ${paymentMethod}</p>
        <p><strong>Referencia:</strong> ${referenceCode}</p>
        <p><strong>Monto:</strong> ${amount}</p>
        <p style="color:#c0392b; margin-top:8px;"><strong>⚠ Esta acción no se puede deshacer.</strong></p>
    `;
    const footer = `
        <button class="btn btn-secondary" onclick="closeGenericModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="confirmDeletePayment(${Number(id)})">Eliminar</button>
    `;
    openGenericModal(title, body, footer);
}

function escapePaymentDeleteText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
