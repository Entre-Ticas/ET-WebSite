(() => {
let currentInvoiceRef = null;
let currentInvoiceNumericId = null;
const feedbackHideTimers = {
    payment: null,
    item: null
};

async function initInvoicePage(invoiceRef) {
    if (!invoiceRef) {
        showInvoiceError('No se especificó una referencia de factura.');
        return;
    }

    currentInvoiceRef = invoiceRef;
    currentInvoiceNumericId = null;
    setPaymentSectionExpanded(false);
    setItemSectionExpanded(false);

    await loadInvoiceDetails(invoiceRef);
}

async function loadInvoiceDetails(invoiceRef) {
    const statusEl = document.getElementById('adminStatus');
    const contentEl = document.getElementById('invoiceContent');
    const noResultsEl = document.getElementById('adminNoResults');

    statusEl.style.display = 'flex';
    contentEl.style.display = 'none';
    noResultsEl.style.display = 'none';

    try {
        const response = await fetch(`/.netlify/functions/invoice?ref=${encodeURIComponent(invoiceRef)}`);

        if (!response.ok) {
            if (response.status === 404) throw new Error('Factura no encontrada.');
            if (response.status === 403) throw new Error('Referencia de factura inválida.');
            throw new Error(`Error del servidor: ${response.statusText}`);
        }

        renderInvoice(await response.json());

        statusEl.style.display = 'none';
        contentEl.style.display = 'block';

        const adminSection = document.getElementById('adminPaymentSection');
        const adminItemSection = document.getElementById('adminItemSection');
        if (adminSection) {
            if (getSession()) {
                adminSection.style.display = 'block';
            } else {
                adminSection.remove();
            }
        }
        if (adminItemSection) {
            if (getSession()) {
                adminItemSection.style.display = 'block';
            } else {
                adminItemSection.remove();
            }
        }
    } catch (error) {
        showInvoiceError(error.message);
    }
}

function renderInvoice(payload) {
    const { invoice, items, payments } = normalizeInvoiceData(payload);
    currentInvoiceNumericId = invoice?.id || currentInvoiceNumericId;
    const isAdmin = Boolean(getSession());

    if (!invoice || (!invoice.id && !currentInvoiceRef)) {
        throw new Error('La factura no contiene datos válidos.');
    }

    const totalAmount = invoice.total_amount ?? items.reduce((sum, item) => {
        return sum + (toNumber(item.price) * toNumber(item.quantity || 1));
    }, 0);
    const totalPaid = invoice.total_paid ?? payments.reduce((sum, payment) => {
        return sum + toNumber(payment.amount);
    }, 0);
    const balanceDue = invoice.balance_due ?? (totalAmount - totalPaid);

    document.getElementById('inv-client-name').textContent = invoice.client_name || 'Cliente no disponible';
    document.getElementById('inv-client-phone').textContent = invoice.client_phone ? `Tel: ${invoice.client_phone}` : 'Tel: --';
    document.getElementById('inv-id').textContent = invoice.id || '--';
    document.getElementById('inv-date').textContent = formatDate(invoice.invoice_date);

    const statusBadge = document.getElementById('inv-status');
    const displayStatus = invoice.paid ? 'Pagada' : 'Pendiente';
    statusBadge.textContent = displayStatus;
    statusBadge.classList.toggle('is-paid', Boolean(invoice.paid));
    statusBadge.classList.toggle('is-pending', !invoice.paid);

    updateInvoiceActionButtons(invoice, isAdmin);

    document.getElementById('inv-total-amount').textContent = formatCurrency(totalAmount);
    document.getElementById('inv-total-paid').textContent = formatCurrency(totalPaid);
    document.getElementById('inv-balance-due').textContent = formatCurrency(balanceDue);
    updateInvoiceGridFooter(totalAmount, totalPaid, balanceDue);

    renderInvoiceDetails(items, payments, isAdmin);
}

function updateInvoiceActionButtons(invoice, isAdmin) {
    const copyBtn = document.getElementById('btnCopyInvoiceLink');
    const paidBtn = document.getElementById('btnToggleInvoicePaid');
    const paidCheckbox = document.getElementById('detailPaidCheckbox');

    if (!isAdmin) {
        if (copyBtn) copyBtn.style.display = 'none';
        if (paidBtn) paidBtn.style.display = 'none';
        return;
    }

    if (copyBtn) {
        copyBtn.style.display = 'inline-flex';
        copyBtn.onclick = () => {
            console.log('DEBUG click copiar link', currentInvoiceNumericId);
            return copiarLinkFactura(copyBtn, currentInvoiceNumericId);
        };
    }

    if (paidCheckbox) {
        paidCheckbox.id = `paid-cb-${currentInvoiceNumericId}`;
        paidCheckbox.checked = Boolean(invoice?.paid);
        paidCheckbox.dataset.paid = String(Boolean(invoice?.paid));
    }

    if (paidBtn) {
        paidBtn.style.display = 'inline-flex';
        paidBtn.classList.toggle('is-paid', Boolean(invoice?.paid));
        paidBtn.innerHTML = `<i class="fas ${Boolean(invoice?.paid) ? 'fa-undo-alt' : 'fa-check-circle'}"></i> ${Boolean(invoice?.paid) ? 'Marcar como pendiente' : 'Marcar como pagada'}`;
        paidBtn.title = Boolean(invoice?.paid) ? 'Marcar como pendiente' : 'Marcar como pagada';
        paidBtn.onclick = () => {
            const checkbox = document.getElementById(`paid-cb-${currentInvoiceNumericId}`) || paidCheckbox;
            if (checkbox) {
                checkbox.dataset.paid = String(Boolean(invoice?.paid));
                confirmInvoiceDetailTogglePaid(currentInvoiceNumericId, checkbox);
            }
        };
    }
}

function confirmInvoiceDetailTogglePaid(invoiceId, checkbox) {
    const currentState = checkbox.dataset.paid !== undefined ? checkbox.dataset.paid === 'true' : checkbox.checked;
    const nextState = !currentState;
    const body = nextState
        ? `<p>¿Está seguro que desea marcar la factura <strong>#${invoiceId}</strong> como <strong>Pagada</strong>?</p>
           <p style="color:#c0392b; margin-top:8px;"><strong>⚠ Esta acción no puede revertirse.</strong><br>La factura dejará de estar disponible para modificaciones.</p>`
        : `<p>¿Está seguro que desea <strong>desmarcar</strong> la factura <strong>#${invoiceId}</strong> como Pagada?</p>`;
    const label = nextState ? 'Sí, Marcar como Pagada' : 'Sí, Desmarcar';
    const footer = `
        <button class="btn btn-secondary" onclick="closeGenericModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="closeGenericModal(); confirmInvoiceDetailPaidAction(${invoiceId}, ${nextState})">${label}</button>
    `;
    openGenericModal('Confirmar cambio de estado', body, footer);
}

async function confirmInvoiceDetailPaidAction(invoiceId, marking) {
    const cb = document.getElementById(`paid-cb-${invoiceId}`);
    if (!cb) return;
    cb.dataset.paid = String(Boolean(marking));
    cb.checked = marking;
    const ok = await toggleInvoiceDetailPaidStatus(invoiceId, cb);
    if (ok && currentInvoiceNumericId === invoiceId) {
        await loadInvoiceDetails(currentInvoiceRef);
    }
}

async function toggleInvoiceDetailPaidStatus(invoiceId, checkbox) {
    const isChecked = checkbox.checked;
    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const response = await fetch('/.netlify/functions/invoices', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify({ id: invoiceId, paid: isChecked })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo actualizar el estado de pago.');
        }

        checkbox.dataset.paid = String(Boolean(isChecked));
        return true;
    } catch (error) {
        alert(`Error: ${error.message}`);
        checkbox.checked = !isChecked;
        checkbox.dataset.paid = String(Boolean(!isChecked));
        return false;
    }
}

function updateInvoiceGridFooter(totalAmount, totalPaid, balanceDue) {
    const totalEl = document.getElementById('inv-grid-total-amount');
    const paidEl = document.getElementById('inv-grid-total-paid');
    const balanceEl = document.getElementById('inv-grid-balance-due');

    if (!totalEl || !paidEl || !balanceEl) return;

    totalEl.textContent = formatCurrency(totalAmount);
    paidEl.textContent = formatCurrency(totalPaid);
    balanceEl.textContent = formatCurrency(balanceDue);
}

function renderInvoiceDetails(items, payments, isAdmin) {
    const tbody = document.querySelector('#invoiceDetailsTable tbody');
    const rowTemplate = document.getElementById('invoiceItemRowTemplate');
    const entries = buildInvoiceEntries(items, payments);

    tbody.innerHTML = '';

    if (!entries.length || !rowTemplate) {
        tbody.appendChild(createEmptyRow('No hay movimientos registrados para esta factura.', 5));
        return;
    }

    entries.forEach(entry => {
        const clone = rowTemplate.content.cloneNode(true);
        const detailCell = clone.querySelector('[data-field="detail"]');
        const amountCell = clone.querySelector('[data-field="amount"]');
        const amountText = entry.kind === 'payment'
            ? `- ${formatCurrency(entry.amount)}`
            : formatCurrency(entry.amount);

        clone.querySelector('[data-field="entryDate"]').textContent = formatDate(entry.date);
        clone.querySelector('[data-field="quantity"]').textContent = entry.quantityLabel;
        clone.querySelector('[data-field="unitPrice"]').textContent = entry.unitPriceLabel;
        amountCell.textContent = amountText;
        amountCell.classList.toggle('invoice-amount-negative', entry.kind === 'payment');

        if (entry.kind === 'item') {
            renderItemDetail(detailCell, entry);
        } else {
            renderPaymentDetail(detailCell, entry);
            renderPaymentReviewInAmount(amountCell, entry, isAdmin);
        }

        tbody.appendChild(clone);
    });
}

function buildInvoiceEntries(items, payments) {
    const itemEntries = items.map(item => ({
        kind: 'item',
        kindLabel: 'Artículo',
        title: item.product_name || '—',
        imageUrl: item.image_url,
        date: item.created_at,
        quantityLabel: toNumber(item.quantity || 1).toLocaleString('es-CR'),
        unitPriceLabel: formatCurrency(item.price),
        amount: item.subtotal ?? (toNumber(item.price) * toNumber(item.quantity || 1)),
        unitPrice: item.price
    }));

    const paymentEntries = payments.map(payment => ({
        kind: 'payment',
        kindLabel: 'Abono',
        id: payment.id,
        title: payment.payment_method || 'Abono',
        reference: payment.reference_code,
        notes: payment.notes,
        date: payment.payment_date,
        bankReviewed: Boolean(payment.bank_reviewed),
        quantityLabel: '—',
        unitPriceLabel: '—',
        amount: payment.amount
    }));

    return [...itemEntries, ...paymentEntries].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'item' ? -1 : 1;
        const aTime = a.date ? new Date(a.date).getTime() : 0;
        const bTime = b.date ? new Date(b.date).getTime() : 0;
        return aTime - bTime;
    });
}

function renderItemDetail(cell, entry) {
    cell.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'invoice-detail-cell';

    const textBlock = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = entry.title;
    textBlock.appendChild(title);

    if (entry.imageUrl) {
        textBlock.appendChild(document.createElement('br'));
        const photoLink = document.createElement('a');
        photoLink.href = '#';
        photoLink.className = 'invoice-photo-link';
        photoLink.textContent = 'Ver foto';
        photoLink.onclick = (event) => {
            event.preventDefault();
            openImageModal(entry.imageUrl);
        };
        textBlock.appendChild(photoLink);
    }

    wrapper.appendChild(textBlock);
    cell.appendChild(wrapper);
}

function renderPaymentDetail(cell, entry) {
    cell.innerHTML = '';

    const title = document.createElement('strong');
    title.textContent = entry.title;
    cell.appendChild(title);

    if (entry.reference) {
        appendSecondaryText(cell, `Referencia: ${entry.reference}`);
    }
    if (entry.notes) {
        appendSecondaryText(cell, entry.notes);
    }

    cell.appendChild(document.createElement('br'));
    const badge = document.createElement('span');
    badge.className = 'invoice-entry-badge is-payment';
    badge.textContent = entry.kindLabel || 'Abono';
    cell.appendChild(badge);
}

function renderPaymentReviewInAmount(cell, entry, isAdmin) {
    if (!isAdmin || !entry.id) return;

    cell.appendChild(document.createElement('br'));

    const reviewWrap = document.createElement('label');
    reviewWrap.className = 'invoice-payment-review-toggle in-amount';

    const reviewCheckbox = document.createElement('input');
    reviewCheckbox.type = 'checkbox';
    reviewCheckbox.id = `inv-bankrev-cb-${entry.id}`;
    reviewCheckbox.checked = Boolean(entry.bankReviewed);
    reviewCheckbox.addEventListener('change', () => confirmToggleInvoicePaymentBank(entry.id, reviewCheckbox));

    const reviewText = document.createElement('span');
    reviewText.textContent = 'Rev.';

    reviewWrap.appendChild(reviewCheckbox);
    reviewWrap.appendChild(reviewText);
    cell.appendChild(reviewWrap);
}

function confirmToggleInvoicePaymentBank(paymentId, checkbox) {
    const marking = checkbox.checked;
    checkbox.checked = !marking;

    const body = marking
        ? `<p>¿Está seguro de marcar el abono <strong>#${paymentId}</strong> como <strong>revisado en banco</strong>?</p>`
        : `<p>¿Está seguro de desmarcar el abono <strong>#${paymentId}</strong> como revisado en banco?</p>`;
    const label = marking ? 'Sí, Confirmar' : 'Sí, Desmarcar';
    const footer = `
        <button class="btn btn-secondary" onclick="closeGenericModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="closeGenericModal(); doToggleInvoicePaymentBank(${Number(paymentId)}, ${marking})">${label}</button>
    `;
    openGenericModal('Confirmar revisión en banco', body, footer);
}

async function doToggleInvoicePaymentBank(paymentId, marking) {
    const checkbox = document.getElementById(`inv-bankrev-cb-${paymentId}`);
    if (!checkbox) return;
    checkbox.checked = marking;
    await toggleInvoicePaymentReviewStatus(paymentId, checkbox);
}

async function toggleInvoicePaymentReviewStatus(paymentId, checkbox) {
    const isChecked = checkbox.checked;

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const response = await fetch('/.netlify/functions/payments', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify({ id: Number(paymentId), bank_reviewed: isChecked })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Respuesta de error no es JSON.' }));
            throw new Error(errorData.error || `Error ${response.status}: No se pudo actualizar el estado.`);
        }
    } catch (error) {
        checkbox.checked = !isChecked;
        alert(`Error al actualizar: ${error.message}`);
    }
}

function createEmptyRow(message, colspan) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    row.className = 'invoice-empty-row';
    cell.colSpan = colspan;
    cell.textContent = message;
    row.appendChild(cell);
    return row;
}

function appendSecondaryText(cell, text) {
    const note = document.createElement('span');
    note.className = 'invoice-row-note';
    note.textContent = text;
    cell.appendChild(document.createElement('br'));
    cell.appendChild(note);
}

function normalizeInvoiceData(payload) {
    if (!payload) return { invoice: {}, items: [], payments: [] };

    if (Array.isArray(payload)) return normalizeFlattenedInvoiceRows(payload);

    if (payload.invoice || payload.items || payload.payments || payload.order_items || payload.abonos) {
        return normalizeStructuredInvoiceObject(payload);
    }

    return normalizeStructuredInvoiceObject({ invoice: payload });
}

function normalizeStructuredInvoiceObject(payload) {
    const invoiceSource = payload.invoice || payload.factura || payload.summary || payload;
    const itemsSource = payload.items || payload.order_items || payload.invoice_items || payload.articulos || payload.detalles || [];
    const paymentsSource = payload.payments || payload.abonos || payload.payment_history || payload.historial_abonos || [];

    return {
        invoice: extractInvoiceFields(invoiceSource),
        items: coerceArray(itemsSource).map(extractItemFields).filter(hasMeaningfulItem),
        payments: coerceArray(paymentsSource).map(extractPaymentFields).filter(hasMeaningfulPayment)
    };
}

function normalizeFlattenedInvoiceRows(rows) {
    const invoice = extractInvoiceFields(rows[0] || {});
    const itemsMap = new Map();
    const paymentsMap = new Map();

    rows.forEach((row, index) => {
        const item = extractItemFields(row);
        const payment = extractPaymentFields(row);

        if (hasMeaningfulItem(item)) {
            const itemKey = item.id || `${item.product_name || 'item'}-${index}`;
            if (!itemsMap.has(itemKey)) itemsMap.set(itemKey, item);
        }

        if (hasMeaningfulPayment(payment)) {
            const paymentKey = payment.id || `${payment.reference_code || 'payment'}-${index}`;
            if (!paymentsMap.has(paymentKey)) paymentsMap.set(paymentKey, payment);
        }
    });

    return {
        invoice,
        items: Array.from(itemsMap.values()),
        payments: Array.from(paymentsMap.values())
    };
}

function extractInvoiceFields(source) {
    const paidValue = toBoolean(pickFirst(source, ['paid', 'is_paid', 'pagada']));
    const rawStatusName = pickFirst(source, ['status_name', 'estado', 'invoice_status']);
    const normalizedStatusName = rawStatusName && ['Enabled', 'Disabled', 'enabled', 'disabled'].includes(String(rawStatusName).trim())
        ? null
        : rawStatusName;

    return {
        id: pickFirst(source, ['invoice_id', 'id']),
        client_name: pickFirst(source, ['client_name', 'cliente']),
        client_phone: pickFirst(source, ['client_phone', 'telefono']),
        invoice_date: pickFirst(source, ['invoice_date', 'fecha_factura', 'created_at']),
        paid: paidValue,
        status_name: normalizedStatusName || (paidValue ? 'Pagada' : 'Pendiente'),
        total_amount: toNullableNumber(pickFirst(source, ['total_amount', 'invoice_total', 'items_total'])),
        total_paid: toNullableNumber(pickFirst(source, ['total_paid', 'payments_total', 'paid_amount'])),
        balance_due: toNullableNumber(pickFirst(source, ['balance_due', 'pending_balance', 'saldo_pendiente']))
    };
}

function extractItemFields(source) {
    return {
        id: pickFirst(source, ['order_item_id', 'item_id', 'id']),
        product_name: pickFirst(source, ['product_name', 'producto']),
        quantity: toNullableNumber(pickFirst(source, ['quantity', 'cantidad'])),
        price: toNullableNumber(pickFirst(source, ['price', 'precio'])),
        size: pickFirst(source, ['size', 'talla']),
        image_url: pickFirst(source, ['image_url', 'foto']),
        subtotal: toNullableNumber(pickFirst(source, ['subtotal', 'monto_total'])),
        created_at: pickFirst(source, ['created_at', 'fecha'])
    };
}

function extractPaymentFields(source) {
    return {
        id: pickFirst(source, ['payment_id', 'id']),
        payment_date: pickFirst(source, ['payment_date', 'fecha_abono', 'created_at']),
        amount: toNullableNumber(pickFirst(source, ['amount', 'monto'])),
        payment_method: pickFirst(source, ['payment_method', 'metodo_pago']),
        reference_code: pickFirst(source, ['reference_code', 'referencia']),
        notes: pickFirst(source, ['notes', 'nota']),
        bank_reviewed: toBoolean(pickFirst(source, ['bank_reviewed', 'revisado_banco', 'reviewed_in_bank']))
    };
}

function hasMeaningfulItem(item) {
    return Boolean(item.product_name || item.quantity !== null || item.price !== null);
}

function hasMeaningfulPayment(payment) {
    return Boolean(
        payment.payment_date ||
        payment.amount !== null ||
        payment.reference_code ||
        payment.payment_method ||
        payment.bank_reviewed === true
    );
}

function coerceArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
}

function pickFirst(source, keys) {
    if (!source || typeof source !== 'object') return null;
    for (const key of keys) {
        if (source[key] !== undefined && source[key] !== null) return source[key];
    }
    return null;
}

function toBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    if (typeof value === 'number') return value === 1;
    return false;
}

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value) {
    return `₡${toNumber(value).toLocaleString('es-CR')}`;
}

function formatDate(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    return `${day}/${month}`;
}

function showInvoiceError(message) {
    const statusEl = document.getElementById('adminStatus');
    const contentEl = document.getElementById('invoiceContent');
    const noResultsEl = document.getElementById('adminNoResults');

    statusEl.style.display = 'none';
    contentEl.style.display = 'none';
    noResultsEl.style.display = 'block';
    noResultsEl.textContent = `😕 ${message}`;
}

function setSectionFeedback(sectionKey, message, type = '', autoHideMs = 0) {
    const feedbackEl = document.getElementById(sectionKey === 'payment' ? 'paymentFeedback' : 'itemFeedback');
    if (!feedbackEl) return;

    if (feedbackHideTimers[sectionKey]) {
        clearTimeout(feedbackHideTimers[sectionKey]);
        feedbackHideTimers[sectionKey] = null;
    }

    feedbackEl.textContent = message || '';
    feedbackEl.classList.remove('is-success', 'is-error');

    if (type === 'success') feedbackEl.classList.add('is-success');
    if (type === 'error') feedbackEl.classList.add('is-error');

    if (autoHideMs > 0 && message) {
        feedbackHideTimers[sectionKey] = setTimeout(() => {
            feedbackEl.textContent = '';
            feedbackEl.classList.remove('is-success', 'is-error');
            feedbackHideTimers[sectionKey] = null;
        }, autoHideMs);
    }
}

async function guardarNuevoAbono() {
    const messageEl = document.getElementById('paymentMensaje');
    const amountEl = document.getElementById('paymentAmount');
    const methodEl = document.getElementById('paymentMethod');
    const refEl = document.getElementById('paymentRef');
    const bankReviewedEl = document.getElementById('paymentBankReviewed');
    const saveBtn = document.getElementById('btnGuardarAbono');

    if (!currentInvoiceNumericId) {
        if (messageEl) messageEl.textContent = '⚠️ No hay una factura activa para registrar el abono.';
        setSectionFeedback('payment', '⚠️ No hay una factura activa para registrar el abono.', 'error');
        return;
    }

    const amount = Number(amountEl?.value);
    const paymentMethod = methodEl?.value.trim() || null;
    const referenceCode = refEl?.value.trim() || null;

    if (!Number.isFinite(amount) || amount <= 0) {
        if (messageEl) messageEl.textContent = '⚠️ El monto debe ser mayor a 0.';
        setSectionFeedback('payment', '⚠️ El monto debe ser mayor a 0.', 'error');
        return;
    }

    const session = getSession();
    if (!session) {
        if (messageEl) messageEl.textContent = '⚠️ Sesión no válida.';
        setSectionFeedback('payment', '⚠️ Sesión no válida.', 'error');
        return;
    }

    if (messageEl) messageEl.textContent = 'Guardando abono...';
    setSectionFeedback('payment', 'Guardando abono...');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const response = await fetch('/.netlify/functions/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify({
                invoice_id: Number(currentInvoiceNumericId),
                amount,
                payment_method: paymentMethod,
                reference_code: referenceCode,
                bank_reviewed: !!bankReviewedEl?.checked
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo guardar el abono.');
        }

        if (amountEl) amountEl.value = '';
        if (methodEl) methodEl.value = '';
        if (refEl) refEl.value = '';
        if (bankReviewedEl) bankReviewedEl.checked = false;

        if (messageEl) messageEl.textContent = '✅ Abono agregado correctamente.';
        setSectionFeedback('payment', '✅ Abono agregado correctamente.', 'success', 2000);

        await loadInvoiceDetails(currentInvoiceRef);
        setPaymentSectionExpanded(false);
    } catch (error) {
        if (messageEl) messageEl.textContent = `⚠️ ${error.message}`;
        setSectionFeedback('payment', `⚠️ ${error.message}`, 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

async function guardarNuevoArticulo() {
    const messageEl = document.getElementById('itemMensaje');
    const productEl = document.getElementById('invoiceItemProductName');
    const quantityEl = document.getElementById('invoiceItemQuantity');
    const priceEl = document.getElementById('invoiceItemPrice');
    const imageUrlEl = document.getElementById('invoiceItemImageUrl');
    const imageStatusEl = document.getElementById('invoiceItemImageStatus');
    const previewImg = document.querySelector('#invoiceItemImagePreview img');
    const saveBtn = document.getElementById('btnGuardarArticulo');

    if (!currentInvoiceNumericId) {
        if (messageEl) messageEl.textContent = '⚠️ No hay una factura activa para agregar la orden.';
        setSectionFeedback('item', '⚠️ No hay una factura activa para agregar la orden.', 'error');
        return;
    }

    const productName = productEl?.value.trim() || '';
    const quantity = Number(quantityEl?.value);
    const price = Number(priceEl?.value);
    const imageUrl = imageUrlEl?.value.trim() || null;

    if (!productName) {
        if (messageEl) messageEl.textContent = '⚠️ El nombre del producto es obligatorio.';
        setSectionFeedback('item', '⚠️ El nombre del producto es obligatorio.', 'error');
        return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
        if (messageEl) messageEl.textContent = '⚠️ La cantidad debe ser mayor a 0.';
        setSectionFeedback('item', '⚠️ La cantidad debe ser mayor a 0.', 'error');
        return;
    }

    if (!Number.isFinite(price) || price <= 0) {
        if (messageEl) messageEl.textContent = '⚠️ El precio debe ser mayor a 0.';
        setSectionFeedback('item', '⚠️ El precio debe ser mayor a 0.', 'error');
        return;
    }

    const session = getSession();
    if (!session) {
        if (messageEl) messageEl.textContent = '⚠️ Sesión no válida.';
        setSectionFeedback('item', '⚠️ Sesión no válida.', 'error');
        return;
    }

    if (messageEl) messageEl.textContent = 'Guardando orden...';
    setSectionFeedback('item', 'Guardando orden...');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const response = await fetch('/.netlify/functions/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify({
                invoice_id: Number(currentInvoiceNumericId),
                product_name: productName,
                quantity: Math.max(1, Math.floor(quantity)),
                price,
                image_url: imageUrl
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo guardar la orden.');
        }

        if (productEl) productEl.value = '';
        if (quantityEl) quantityEl.value = '1';
        if (priceEl) priceEl.value = '';
        if (imageUrlEl) imageUrlEl.value = '';
        if (imageStatusEl) imageStatusEl.textContent = '';
        if (previewImg) previewImg.src = 'https://placehold.co/100x100/E19B9D/FFFFFF?text=?';

        if (messageEl) messageEl.textContent = '✅ Orden agregada correctamente.';
        setSectionFeedback('item', '✅ Orden agregada correctamente.', 'success', 2000);

        await loadInvoiceDetails(currentInvoiceRef);
        setItemSectionExpanded(false);
    } catch (error) {
        if (messageEl) messageEl.textContent = `⚠️ ${error.message}`;
        setSectionFeedback('item', `⚠️ ${error.message}`, 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function togglePaymentSection() {
    const collapseEl = document.getElementById('paymentFormCollapse');
    if (!collapseEl) return;
    const isExpanded = collapseEl.style.display !== 'none';
    setPaymentSectionExpanded(!isExpanded);
}

function toggleItemSection() {
    const collapseEl = document.getElementById('itemFormCollapse');
    if (!collapseEl) return;
    const isExpanded = collapseEl.style.display !== 'none';
    setItemSectionExpanded(!isExpanded);
}

function setPaymentSectionExpanded(isExpanded) {
    const collapseEl = document.getElementById('paymentFormCollapse');
    const toggleEl = document.getElementById('togglePaymentForm');
    if (!collapseEl || !toggleEl) return;
    collapseEl.style.display = isExpanded ? 'block' : 'none';
    toggleEl.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    toggleEl.classList.toggle('is-open', isExpanded);
}

function setItemSectionExpanded(isExpanded) {
    const collapseEl = document.getElementById('itemFormCollapse');
    const toggleEl = document.getElementById('toggleItemForm');
    if (!collapseEl || !toggleEl) return;
    collapseEl.style.display = isExpanded ? 'block' : 'none';
    toggleEl.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    toggleEl.classList.toggle('is-open', isExpanded);
}

async function handleInvoiceItemImageUpload(event) {
    const fileInput = event.target;
    const file = fileInput.files[0];
    if (!file) return;

    const statusEl = document.getElementById('invoiceItemImageStatus');
    const previewImg = document.querySelector('#invoiceItemImagePreview img');
    const urlHiddenInput = document.getElementById('invoiceItemImageUrl');

    if (statusEl) {
        statusEl.textContent = 'Subiendo imagen...';
        statusEl.style.color = 'var(--brown-text)';
    }

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const response = await fetch('/.netlify/functions/upload-image', {
            method: 'POST',
            headers: {
                'Content-Type': file.type,
                'x-admin-token': session.token,
                'x-file-name': file.name
            },
            body: file
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'No se pudo subir la imagen.');
        }

        const { imageUrl } = await response.json();

        if (urlHiddenInput) urlHiddenInput.value = imageUrl;
        if (previewImg) previewImg.src = imageUrl;
        if (statusEl) {
            statusEl.textContent = '✅ Imagen subida.';
            statusEl.style.color = '#28a745';
        }
    } catch (error) {
        if (statusEl) {
            statusEl.textContent = `Error: ${error.message}`;
            statusEl.style.color = 'red';
        }
    }
}

function triggerInvoiceItemFileUpload() {
    const input = document.getElementById('invoiceItemImageUpload');
    if (input) input.click();
}

function triggerInvoiceItemCameraUpload() {
    const input = document.getElementById('invoiceItemCameraUpload');
    if (input) input.click();
}

function updateInvoiceItemQuantity(inputId, delta) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const min = Number(input.min) || 1;
    const max = Number(input.max) || 9999;
    const currentValue = parseInt(input.value, 10) || min;
    const nextValue = Math.min(max, Math.max(min, currentValue + delta));
    input.value = String(nextValue);
}

function volverAlGrid() {
    history.back();
}

window.togglePaymentSection = togglePaymentSection;
window.toggleItemSection = toggleItemSection;
window.guardarNuevoAbono = guardarNuevoAbono;
window.guardarNuevoArticulo = guardarNuevoArticulo;
window.handleInvoiceItemImageUpload = handleInvoiceItemImageUpload;
window.triggerInvoiceItemFileUpload = triggerInvoiceItemFileUpload;
window.triggerInvoiceItemCameraUpload = triggerInvoiceItemCameraUpload;
window.updateInvoiceItemQuantity = updateInvoiceItemQuantity;
window.doToggleInvoicePaymentBank = doToggleInvoicePaymentBank;
window.initInvoicePage = initInvoicePage;
window.confirmInvoiceDetailTogglePaid = confirmInvoiceDetailTogglePaid;
window.confirmInvoiceDetailPaidAction = confirmInvoiceDetailPaidAction;
window.toggleInvoiceDetailPaidStatus = toggleInvoiceDetailPaidStatus;
})();
