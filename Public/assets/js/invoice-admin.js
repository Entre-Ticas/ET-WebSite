let currentInvoiceId = null;

async function initInvoiceAdminPage(invoiceId) {
    if (!invoiceId) {
        showInvoiceError('No se especificó un ID de factura.');
        return;
    }

    currentInvoiceId = invoiceId;
    document.querySelector('.admin-btn-back').onclick = () => history.back();
    setPaymentSectionExpanded(false);

    await loadInvoiceDetails(invoiceId);
}

async function loadInvoiceDetails(invoiceId) {
    const statusEl = document.getElementById('adminStatus');
    const contentEl = document.getElementById('invoiceContent');
    const noResultsEl = document.getElementById('adminNoResults');

    statusEl.style.display = 'flex';
    contentEl.style.display = 'none';
    noResultsEl.style.display = 'none';

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión no válida.');

        const response = await fetch(`/.netlify/functions/invoices?id=${invoiceId}`, {
            headers: { 'x-admin-token': session.token }
        });

        if (!response.ok) {
            if (response.status === 404) throw new Error('Factura no encontrada.');
            throw new Error(`Error del servidor: ${response.statusText}`);
        }

        renderInvoice(await response.json());

        statusEl.style.display = 'none';
        contentEl.style.display = 'block';
    } catch (error) {
        showInvoiceError(error.message);
    }
}

function renderInvoice(payload) {
    const { invoice, items, payments } = normalizeInvoiceData(payload);

    if (!invoice || (!invoice.id && !currentInvoiceId)) {
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
    document.getElementById('inv-id').textContent = invoice.id || currentInvoiceId;
    document.getElementById('inv-date').textContent = formatDate(invoice.invoice_date);

    const statusBadge = document.getElementById('inv-status');
    statusBadge.textContent = invoice.status_name || (invoice.paid ? 'Pagada' : 'Pendiente');
    statusBadge.classList.toggle('is-paid', Boolean(invoice.paid));
    statusBadge.classList.toggle('is-pending', !invoice.paid);

    document.getElementById('inv-total-amount').textContent = formatCurrency(totalAmount);
    document.getElementById('inv-total-paid').textContent = formatCurrency(totalPaid);
    document.getElementById('inv-balance-due').textContent = formatCurrency(balanceDue);
    updateInvoiceGridFooter(totalAmount, totalPaid, balanceDue);

    renderInvoiceDetails(items, payments);
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

function renderInvoiceDetails(items, payments) {
    const tbody = document.querySelector('#invoiceDetailsTable tbody');
    const rowTemplate = document.getElementById('invoiceItemRowTemplate');
    const entries = buildInvoiceEntries(items, payments);

    tbody.innerHTML = '';

    if (!entries.length || !rowTemplate) {
        tbody.appendChild(createEmptyRow('No hay movimientos registrados para esta factura.', 6));
        return;
    }

    entries.forEach(entry => {
        const clone = rowTemplate.content.cloneNode(true);
        const detailCell = clone.querySelector('[data-field="detail"]');
        const amountCell = clone.querySelector('[data-field="amount"]');
        const amountText = entry.kind === 'payment'
            ? `- ${formatCurrency(entry.amount)}`
            : formatCurrency(entry.amount);

        clone.querySelector('[data-field="entryType"]').innerHTML = `<span class="invoice-entry-badge ${entry.kind === 'item' ? 'is-item' : 'is-payment'}">${entry.kindLabel}</span>`;
        clone.querySelector('[data-field="entryDate"]').textContent = formatDate(entry.date);
        clone.querySelector('[data-field="quantity"]').textContent = entry.quantityLabel;
        clone.querySelector('[data-field="unitPrice"]').textContent = entry.unitPriceLabel;
        amountCell.textContent = amountText;
        amountCell.classList.toggle('invoice-amount-negative', entry.kind === 'payment');

        if (entry.kind === 'item') {
            renderItemDetail(detailCell, entry);
        } else {
            renderPaymentDetail(detailCell, entry);
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
        title: payment.payment_method || 'Abono',
        reference: payment.reference_code,
        notes: payment.notes,
        date: payment.payment_date,
        quantityLabel: '—',
        unitPriceLabel: '—',
        amount: payment.amount
    }));

    return [...itemEntries, ...paymentEntries].sort((a, b) => {
        if (a.kind !== b.kind) {
            return a.kind === 'item' ? -1 : 1;
        }

        const aTime = a.date ? new Date(a.date).getTime() : 0;
        const bTime = b.date ? new Date(b.date).getTime() : 0;
        return aTime - bTime;
    });
}

function renderItemDetail(cell, entry) {
    cell.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'invoice-detail-cell';

    if (entry.imageUrl) {
        const imageButton = document.createElement('button');
        imageButton.type = 'button';
        imageButton.className = 'invoice-thumb-button';
        imageButton.onclick = () => openImageModal(entry.imageUrl);

        const image = document.createElement('img');
        image.src = entry.imageUrl;
        image.alt = entry.title;
        image.className = 'invoice-thumb';

        imageButton.appendChild(image);
        wrapper.appendChild(imageButton);
    }

    const textBlock = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = entry.title;
    textBlock.appendChild(title);

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
    if (!payload) {
        return { invoice: {}, items: [], payments: [] };
    }

    if (Array.isArray(payload)) {
        return normalizeFlattenedInvoiceRows(payload);
    }

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
    return {
        id: pickFirst(source, ['invoice_id', 'id']),
        client_name: pickFirst(source, ['client_name', 'cliente']),
        client_phone: pickFirst(source, ['client_phone', 'telefono']),
        invoice_date: pickFirst(source, ['invoice_date', 'fecha_factura', 'created_at']),
        paid: toBoolean(pickFirst(source, ['paid', 'is_paid', 'pagada'])),
        status_name: pickFirst(source, ['status_name', 'estado', 'invoice_status']),
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
        notes: pickFirst(source, ['notes', 'nota'])
    };
}

function hasMeaningfulItem(item) {
    return Boolean(item.product_name || item.quantity !== null || item.price !== null);
}

function hasMeaningfulPayment(payment) {
    return Boolean(payment.payment_date || payment.amount !== null || payment.reference_code || payment.payment_method);
}

function coerceArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
}

function pickFirst(source, keys) {
    if (!source || typeof source !== 'object') return null;

    for (const key of keys) {
        if (source[key] !== undefined && source[key] !== null) {
            return source[key];
        }
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

    return date.toLocaleDateString('es-CR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
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

async function guardarNuevoAbono() {
    const messageEl = document.getElementById('paymentMensaje');
    const amountEl = document.getElementById('paymentAmount');
    const methodEl = document.getElementById('paymentMethod');
    const refEl = document.getElementById('paymentRef');
    const saveBtn = document.getElementById('btnGuardarAbono');

    if (!currentInvoiceId) {
        if (messageEl) {
            messageEl.textContent = '⚠️ No hay una factura activa para registrar el abono.';
        }
        return;
    }

    const amount = Number(amountEl?.value);
    const paymentMethod = methodEl?.value.trim() || null;
    const referenceCode = refEl?.value.trim() || null;

    if (!Number.isFinite(amount) || amount <= 0) {
        if (messageEl) messageEl.textContent = '⚠️ El monto debe ser mayor a 0.';
        return;
    }

    if (messageEl) messageEl.textContent = 'Guardando abono...';
    if (saveBtn) saveBtn.disabled = true;

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión no válida.');

        const response = await fetch('/.netlify/functions/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify({
                invoice_id: Number(currentInvoiceId),
                amount,
                payment_method: paymentMethod,
                reference_code: referenceCode
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo guardar el abono.');
        }

        if (amountEl) amountEl.value = '';
        if (methodEl) methodEl.value = '';
        if (refEl) refEl.value = '';

        if (messageEl) messageEl.textContent = '✅ Abono agregado correctamente.';

        await loadInvoiceDetails(currentInvoiceId);
        setPaymentSectionExpanded(false);
    } catch (error) {
        if (messageEl) messageEl.textContent = `⚠️ ${error.message}`;
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

function setPaymentSectionExpanded(isExpanded) {
    const collapseEl = document.getElementById('paymentFormCollapse');
    const toggleEl = document.getElementById('togglePaymentForm');
    if (!collapseEl || !toggleEl) return;

    collapseEl.style.display = isExpanded ? 'block' : 'none';
    toggleEl.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    toggleEl.classList.toggle('is-open', isExpanded);
}

function volverAlGrid() {
    history.back();
}

window.togglePaymentSection = togglePaymentSection;
window.initInvoiceAdminPage = initInvoiceAdminPage;
window.guardarNuevoAbono = guardarNuevoAbono;