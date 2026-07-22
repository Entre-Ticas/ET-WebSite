let currentInvoiceId = null;

async function initInvoiceAdminPage(invoiceId) {
    if (!invoiceId) {
        showInvoiceError('No se especificó un ID de factura.');
        return;
    }

    currentInvoiceId = invoiceId;
    document.querySelector('.admin-btn-back').onclick = () => history.back();

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

    renderInvoiceItems(items);
    renderInvoicePayments(payments);
}

function renderInvoiceItems(items) {
    const tbody = document.querySelector('#invoiceItemsTable tbody');
    const rowTemplate = document.getElementById('invoiceItemRowTemplate');

    tbody.innerHTML = '';

    if (!items.length || !rowTemplate) {
        tbody.appendChild(createEmptyRow('No hay artículos asociados a esta factura.', 4));
        return;
    }

    items.forEach(item => {
        const clone = rowTemplate.content.cloneNode(true);
        const productCell = clone.querySelector('[data-field="productName"]');
        const quantity = toNumber(item.quantity || 1);
        const unitPrice = toNumber(item.price);

        productCell.textContent = item.product_name || '—';
        if (item.size) {
            appendSecondaryText(productCell, `Talla: ${item.size}`);
        }

        clone.querySelector('[data-field="quantity"]').textContent = quantity.toLocaleString('es-CR');
        clone.querySelector('[data-field="unitPrice"]').textContent = formatCurrency(unitPrice);
        clone.querySelector('[data-field="subtotal"]').textContent = formatCurrency(unitPrice * quantity);

        tbody.appendChild(clone);
    });
}

function renderInvoicePayments(payments) {
    const tbody = document.querySelector('#invoicePaymentsTable tbody');
    const rowTemplate = document.getElementById('invoicePaymentRowTemplate');

    tbody.innerHTML = '';

    if (!payments.length || !rowTemplate) {
        tbody.appendChild(createEmptyRow('No hay abonos registrados para esta factura.', 4));
        return;
    }

    payments.forEach(payment => {
        const clone = rowTemplate.content.cloneNode(true);
        const referenceCell = clone.querySelector('[data-field="reference"]');

        clone.querySelector('[data-field="paymentDate"]').textContent = formatDate(payment.payment_date);
        clone.querySelector('[data-field="amount"]').textContent = formatCurrency(payment.amount);
        clone.querySelector('[data-field="method"]').textContent = payment.payment_method || '--';

        referenceCell.textContent = payment.reference_code || '--';
        if (payment.notes) {
            appendSecondaryText(referenceCell, payment.notes);
        }

        tbody.appendChild(clone);
    });
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
        size: pickFirst(source, ['size', 'talla'])
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
    alert('Función para guardar abono aún no implementada.');
}

function volverAlGrid() {
    history.back();
}

window.initInvoiceAdminPage = initInvoiceAdminPage;