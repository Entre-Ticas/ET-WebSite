let currentInvoiceId = null;

async function initInvoiceAdminPage(invoiceId) {
    if (!invoiceId) {
        showInvoiceError("No se especificó un ID de factura.");
        return;
    }
    currentInvoiceId = invoiceId;
    // La función volverAlGrid ahora necesita saber a dónde regresar.
    // Usamos el historial del navegador para una mejor experiencia de usuario.
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
        if (!session) throw new Error("Sesión no válida.");

        // A futuro, esta será la Netlify Function que crearemos.
        const response = await fetch(`/.netlify/functions/invoices?id=${invoiceId}`, {
            headers: { 'x-admin-token': session.token }
        });

        if (!response.ok) {
            if (response.status === 404) throw new Error("Factura no encontrada.");
            throw new Error(`Error del servidor: ${response.statusText}`);
        }

        const data = await response.json();
        renderInvoice(data);

        statusEl.style.display = 'none';
        contentEl.style.display = 'block';

    } catch (error) {
        showInvoiceError(error.message);
    }
}

function renderInvoice(data) {
    const { invoice, items, payments } = data;

    // Renderizar cabecera y resumen
    document.getElementById('inv-client-name').textContent = invoice.client_name;
    document.getElementById('inv-client-phone').textContent = `Tel: ${invoice.client_phone}`;
    document.getElementById('inv-id').textContent = invoice.id;
    document.getElementById('inv-date').textContent = new Date(invoice.invoice_date).toLocaleDateString('es-CR');
    document.getElementById('inv-status').textContent = invoice.paid ? 'Pagada' : 'Pendiente';

    // Calcular y renderizar totales
    const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalPaid = payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
    const balanceDue = totalAmount - totalPaid;

    document.getElementById('inv-total-amount').textContent = `₡${totalAmount.toLocaleString('es-CR')}`;
    document.getElementById('inv-total-paid').textContent = `₡${totalPaid.toLocaleString('es-CR')}`;
    document.getElementById('inv-balance-due').textContent = `₡${balanceDue.toLocaleString('es-CR')}`;

    // Renderizar tabla de artículos
    const itemsTbody = document.getElementById('invoiceItemsTable').querySelector('tbody');
    itemsTbody.innerHTML = items.map(item => `
        <tr>
            <td>${item.product_name}</td>
            <td>${item.quantity}</td>
            <td>₡${item.price.toLocaleString('es-CR')}</td>
            <td>₡${(item.price * item.quantity).toLocaleString('es-CR')}</td>
        </tr>
    `).join('');

    // Renderizar tabla de abonos
    const paymentsTbody = document.getElementById('invoicePaymentsTable').querySelector('tbody');
    paymentsTbody.innerHTML = payments.map(p => `
        <tr>
            <td>${new Date(p.payment_date).toLocaleDateString('es-CR')}</td>
            <td>₡${parseFloat(p.amount).toLocaleString('es-CR')}</td>
            <td>${p.payment_method || '--'}</td>
            <td>${p.reference_code || '--'}</td>
        </tr>
    `).join('');
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
    // Lógica para guardar un nuevo abono (se implementará en el futuro)
    alert("Función para guardar abono aún no implementada.");
}

function volverAlGrid() {
    // Esta función es llamada por el botón "Volver", pero la hemos mejorado
    // para usar el historial del navegador.
    history.back();
}

window.initInvoiceAdminPage = initInvoiceAdminPage;