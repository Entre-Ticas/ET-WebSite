let todosLosClientes = [];
let clientesGlobalSearch = '';
let clientesCurrentPage = 1;
let clientesRowsPerPage = 10;
let clientesSortColumn = 'id';
let clientesSortDir = 'asc';
let editingClientId = null;
let clientesColumnFilters = {
    id: '',
    name: '',
    phone: '',
    phone_last4: '',
    status_name: '',
    is_blacklisted: '',
    created_at: ''
};

registerAdminRowsPerPageDropdown({
    name: 'clients',
    dropdownId: 'clientsRowsDropdown',
    triggerId: 'clientsRowsPerPageTrigger',
    menuId: 'clientsRowsPerPageMenu',
    labelId: 'clientsRowsPerPageSelectedLabel',
    selectorId: 'clientsRowsPerPageSelector',
    toggleFnName: 'toggleClientsRowsPerPageDropdown',
    selectFnName: 'selectClientsRowsPerPage',
    getValue: () => clientesRowsPerPage,
    onSelect: (value) => {
        clientesRowsPerPage = parseInt(value, 10);
        clientesCurrentPage = 1;
        renderClients();
    }
});

function formatClientStatusText(value) {
    const status = Number(value);
    return Number.isFinite(status) && status > 0 ? status : '—';
}

function getClientPhoneLast4(phone) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    return digits.slice(-4) || '—';
}

function updateClientPhoneLast4(fieldId, value) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.value = getClientPhoneLast4(value);
}

function resetClientsViewState() {
    clientesGlobalSearch = '';
    clientesCurrentPage = 1;
    clientesRowsPerPage = 10;
    clientesSortColumn = 'id';
    clientesSortDir = 'asc';
    clientesColumnFilters = {
        id: '',
        name: '',
        phone: '',
        phone_last4: '',
        status_name: '',
        is_blacklisted: '',
        created_at: ''
    };

    const searchInput = document.getElementById('clientsSearchInput');
    if (searchInput) searchInput.value = '';

    const rowsSelector = document.getElementById('clientsRowsPerPageSelector');
    if (rowsSelector) rowsSelector.value = '10';
    syncAdminRowsPerPageDropdown('clients');
    closeAdminRowsPerPageDropdown('clients');

    document.querySelectorAll('#clientsGrid .admin-filter-row input').forEach((input) => {
        input.value = '';
    });
}

async function loadAdminClients() {
    const statusEl = document.getElementById('clientsStatus');
    if (statusEl) statusEl.style.display = 'flex';

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión no válida');

        const response = await fetch('/.netlify/functions/clients', {
            headers: { 'x-admin-token': session.token }
        });

        if (response.status === 401) throw new Error('No autorizado.');
        if (!response.ok) throw new Error(`Error del servidor: ${response.statusText}`);

        todosLosClientes = await response.json();
        renderClients();
    } catch (error) {
        if (statusEl) {
            statusEl.innerHTML = `<p style="color:red;">⚠️ Error al cargar: ${error.message}</p>`;
        }
    } finally {
        if (statusEl && !statusEl.innerHTML.includes('Error')) {
            statusEl.style.display = 'none';
            const table = document.querySelector('#clientsGrid .admin-table');
            if (table) table.style.display = '';
        }
    }
}

function renderClients() {
    const table = document.querySelector('#clientsGrid .admin-table');
    const tbody = document.getElementById('clientsTbody');
    const noResults = document.getElementById('clientsNoResults');

    if (!table || !tbody || !noResults) return;

    let lista = todosLosClientes.filter((cliente) => {
        if (!clientesGlobalSearch) return true;
        const texto = [
            cliente.id,
            cliente.name,
            cliente.phone,
            cliente.phone_last4,
            cliente.status_name || cliente.status_id,
            cliente.is_blacklisted ? 'bloqueado' : 'activo',
            cliente.created_at
        ].join(' ').toLowerCase();
        return texto.includes(clientesGlobalSearch.toLowerCase());
    });

    lista = lista.filter((cliente) => {
        return String(cliente.id || '').toLowerCase().includes(String(clientesColumnFilters.id || '').toLowerCase()) &&
            (cliente.name || '').toLowerCase().includes(String(clientesColumnFilters.name || '').toLowerCase()) &&
            (cliente.phone || '').toLowerCase().includes(String(clientesColumnFilters.phone || '').toLowerCase()) &&
            (cliente.phone_last4 || '').toLowerCase().includes(String(clientesColumnFilters.phone_last4 || '').toLowerCase()) &&
            String(cliente.status_name || cliente.status_id || '').toLowerCase().includes(String(clientesColumnFilters.status_name || '').toLowerCase()) &&
            String(Boolean(cliente.is_blacklisted)).toLowerCase().includes(String(clientesColumnFilters.is_blacklisted || '').toLowerCase()) &&
            (cliente.created_at ? new Date(cliente.created_at).toLocaleDateString('es-CR') : '').toLowerCase().includes(String(clientesColumnFilters.created_at || '').toLowerCase());
    });

    if (clientesSortColumn) {
        lista.sort((a, b) => {
            let valA = a[clientesSortColumn] ?? '';
            let valB = b[clientesSortColumn] ?? '';

            const numericA = Number(valA);
            const numericB = Number(valB);
            if (
                (clientesSortColumn === 'id' || clientesSortColumn === 'status_id') &&
                Number.isFinite(numericA) &&
                Number.isFinite(numericB)
            ) {
                return clientesSortDir === 'asc' ? numericA - numericB : numericB - numericA;
            }

            if (clientesSortColumn === 'created_at') {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
                return clientesSortDir === 'asc' ? valA - valB : valB - valA;
            }

            if (clientesSortColumn === 'status_name') {
                valA = String(valA || '');
                valB = String(valB || '');
                const comparison = valA.localeCompare(valB, 'es', { sensitivity: 'base' });
                return clientesSortDir === 'asc' ? comparison : -comparison;
            }

            if (clientesSortColumn === 'is_blacklisted') {
                valA = Boolean(valA) ? 1 : 0;
                valB = Boolean(valB) ? 1 : 0;
                return clientesSortDir === 'asc' ? valA - valB : valB - valA;
            }

            const comparison = String(valA).localeCompare(String(valB), 'es', { sensitivity: 'base' });
            return clientesSortDir === 'asc' ? comparison : -comparison;
        });
    }

    const totalRows = lista.length;
    const totalPages = clientesRowsPerPage === -1 ? 1 : Math.max(1, Math.ceil(totalRows / clientesRowsPerPage));
    if (clientesCurrentPage > totalPages) clientesCurrentPage = totalPages;

    const startIndex = (clientesCurrentPage - 1) * clientesRowsPerPage;
    const endIndex = clientesRowsPerPage === -1 ? totalRows : startIndex + clientesRowsPerPage;
    const pageItems = lista.slice(startIndex, endIndex);

    const isAnyFilterActive = clientesGlobalSearch || Object.values(clientesColumnFilters).some((v) => v !== '');
    noResults.style.display = (lista.length === 0 && isAnyFilterActive) ? 'block' : 'none';
    table.style.display = '';

    tbody.innerHTML = pageItems.map((cliente) => `
        <tr>
            <td>${cliente.id ?? '—'}</td>
            <td>${cliente.name || '—'}</td>
            <td>${cliente.phone || '—'}</td>
            <td>${cliente.phone_last4 || getClientPhoneLast4(cliente.phone)}</td>
            <td>${cliente.status_name || formatClientStatusText(cliente.status_id)}</td>
            <td>
                <input type="checkbox" ${cliente.is_blacklisted ? 'checked' : ''} onclick="toggleClientBlacklisted(${cliente.id}, this.checked)" />
            </td>
            <td>${cliente.created_at ? new Date(cliente.created_at).toLocaleDateString('es-CR') : '—'}</td>
            <td class="admin-actions-cell">
                <button class="admin-btn-action btn-edit" onclick="openClientEditForm(${cliente.id})" title="Editar cliente"><i class="fas fa-pencil-alt"></i></button>
                <button class="admin-btn-action btn-delete" onclick="deleteClient(${cliente.id})" title="Eliminar cliente"><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>
    `).join('');

    updateClientsSortIcons();
    renderClientsPagination(totalRows);
}

function renderClientsPagination(totalRows) {
    const tfoot = document.getElementById('clientsTableFooter');
    if (!tfoot) return;

    if (totalRows <= 10) {
        tfoot.style.display = 'none';
        return;
    }

    tfoot.style.display = '';

    const totalPages = clientesRowsPerPage === -1 ? 1 : Math.ceil(totalRows / clientesRowsPerPage);
    const startItem = (clientesCurrentPage - 1) * clientesRowsPerPage + 1;
    const endItem = clientesRowsPerPage === -1 ? totalRows : Math.min(clientesCurrentPage * clientesRowsPerPage, totalRows);

    const table = document.querySelector('#clientsGrid .admin-table');
    const numColumns = table.querySelector('thead .admin-main-header').cells.length;
    document.getElementById('clientsFooterColspan').colSpan = numColumns;

    const infoEl = document.getElementById('clientsPaginationInfo');
    const navEl = document.getElementById('clientsPaginationNav');
    const selectorEl = document.getElementById('clientsRowsPerPageSelector');

    if (infoEl) infoEl.innerHTML = `Mostrando <strong>${startItem} - ${endItem}</strong> de <strong>${totalRows}</strong>`;
    if (selectorEl) selectorEl.value = clientesRowsPerPage;
    syncAdminRowsPerPageDropdown('clients');
    if (navEl) {
        navEl.innerHTML = `
            <button onclick="changeClientsPage(${clientesCurrentPage - 1})" ${clientesCurrentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
            <span>Página <strong>${clientesCurrentPage}</strong> de ${totalPages}</span>
            <button onclick="changeClientsPage(${clientesCurrentPage + 1})" ${clientesCurrentPage >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
        `;
    }
}

function backToClientsGrid() {
    const gridView = document.getElementById('clientsGridView');
    const newView = document.getElementById('clientsNewView');
    const editView = document.getElementById('clientsEditView');
    if (gridView) gridView.style.display = 'block';
    if (newView) newView.style.display = 'none';
    if (editView) editView.style.display = 'none';
    editingClientId = null;
}

async function loadClientStatusOptions() {
    const session = getSession();
    if (!session) return;

    const statusSelects = [
        document.getElementById('newClientStatusId'),
        document.getElementById('editClientStatusId')
    ].filter(Boolean);

    if (!statusSelects.length) return;

    try {
        const response = await fetch('/.netlify/functions/clients?include_statuses=1', {
            headers: { 'x-admin-token': session.token }
        });

        if (!response.ok) {
            throw new Error('No se pudieron cargar los estados.');
        }

        const statuses = await response.json();
        const options = Array.isArray(statuses) ? statuses : [];

        statusSelects.forEach((select) => {
            select.innerHTML = options.length
                ? options.map((status) => `<option value="${Number(status.id) || ''}">${String(status.name || 'Sin nombre')}</option>`).join('')
                : '<option value="">Sin estados disponibles</option>';

            const defaultValue = options.find((status) => Number(status.id) === 1)?.id ?? options[0]?.id ?? '';
            if (defaultValue !== '') {
                select.value = String(defaultValue);
            }
        });
    } catch (error) {
        statusSelects.forEach((select) => {
            select.innerHTML = '<option value="">Error cargando estados</option>';
        });
    }
}

async function openNewClientForm() {
    const gridView = document.getElementById('clientsGridView');
    const newView = document.getElementById('clientsNewView');
    if (gridView) gridView.style.display = 'none';
    if (newView) newView.style.display = 'block';

    await loadClientStatusOptions();

    document.getElementById('newClientName').value = '';
    document.getElementById('newClientPhone').value = '';
    document.getElementById('newClientPhoneLast4').value = '';
    const newStatusSelect = document.getElementById('newClientStatusId');
    if (newStatusSelect && newStatusSelect.options.length) {
        newStatusSelect.value = String(newStatusSelect.options[0].value || '');
    }
    document.getElementById('newClientBlacklisted').checked = false;
    document.getElementById('newClientError').textContent = '';

    document.getElementById('newClientPhone').addEventListener('input', function () {
        updateClientPhoneLast4('newClientPhoneLast4', this.value);
    });
}

async function saveNewClient() {
    const errorEl = document.getElementById('newClientError');
    const name = document.getElementById('newClientName').value.trim();
    const phone = document.getElementById('newClientPhone').value.trim();
    const statusId = Number(document.getElementById('newClientStatusId')?.value || 1);
    const isBlacklisted = document.getElementById('newClientBlacklisted').checked;

    if (!name || !phone) {
        errorEl.textContent = 'Nombre y teléfono son obligatorios.';
        errorEl.style.color = 'red';
        return;
    }

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        errorEl.textContent = 'Guardando...';
        errorEl.style.color = 'var(--brown-text)';

        const response = await fetch('/.netlify/functions/clients', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': session.token
            },
            body: JSON.stringify({
                name,
                phone,
                status_id: statusId,
                is_blacklisted: isBlacklisted
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'No se pudo crear el cliente.');
        }

        backToClientsGrid();
        await loadAdminClients();
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.style.color = 'red';
    }
}

async function openClientEditForm(clientId) {
    const client = todosLosClientes.find((item) => Number(item.id) === Number(clientId));
    if (!client) return;

    editingClientId = Number(clientId);
    const gridView = document.getElementById('clientsGridView');
    const editView = document.getElementById('clientsEditView');
    if (gridView) gridView.style.display = 'none';
    if (editView) editView.style.display = 'block';

    await loadClientStatusOptions();

    const editStatusSelect = document.getElementById('editClientStatusId');
    const clientStatusId = Number(client.status_id ?? 1);
    if (editStatusSelect) {
        const matchingOption = Array.from(editStatusSelect.options).find((option) => Number(option.value) === clientStatusId);
        editStatusSelect.value = matchingOption ? String(clientStatusId) : (editStatusSelect.options[0]?.value || '');
    }

    document.getElementById('editClientName').value = client.name || '';
    document.getElementById('editClientPhone').value = client.phone || '';
    document.getElementById('editClientPhoneLast4').value = client.phone_last4 || getClientPhoneLast4(client.phone);
    document.getElementById('editClientBlacklisted').checked = Boolean(client.is_blacklisted);
    document.getElementById('editClientError').textContent = '';

    document.getElementById('editClientPhone').addEventListener('input', function () {
        updateClientPhoneLast4('editClientPhoneLast4', this.value);
    });
}

async function saveClientEdit() {
    if (!editingClientId) return;

    const errorEl = document.getElementById('editClientError');
    const name = document.getElementById('editClientName').value.trim();
    const phone = document.getElementById('editClientPhone').value.trim();
    const statusId = Number(document.getElementById('editClientStatusId')?.value || 1);
    const isBlacklisted = document.getElementById('editClientBlacklisted').checked;

    if (!name || !phone) {
        errorEl.textContent = 'Nombre y teléfono son obligatorios.';
        errorEl.style.color = 'red';
        return;
    }

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        errorEl.textContent = 'Guardando...';
        errorEl.style.color = 'var(--brown-text)';

        const response = await fetch('/.netlify/functions/clients', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': session.token
            },
            body: JSON.stringify({
                id: editingClientId,
                name,
                phone,
                status_id: statusId,
                is_blacklisted: isBlacklisted
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'No se pudo actualizar el cliente.');
        }

        backToClientsGrid();
        await loadAdminClients();
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.style.color = 'red';
    }
}

async function toggleClientBlacklisted(clientId, checked) {
    const session = getSession();
    if (!session) return;

    try {
        const response = await fetch('/.netlify/functions/clients', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': session.token
            },
            body: JSON.stringify({
                id: clientId,
                is_blacklisted: checked
            })
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'No se pudo actualizar el estado del cliente.');
        }

        await loadAdminClients();
    } catch (error) {
        console.error(error);
        await loadAdminClients();
    }
}

function deleteClient(clientId) {
    const client = todosLosClientes.find((item) => Number(item.id) === Number(clientId));
    const clientName = client?.name || `#${clientId}`;
    const body = `<p>¿Está seguro que desea eliminar al cliente <strong>${clientName}</strong>?</p>`;
    const footer = `
        <button class="btn btn-secondary" onclick="closeGenericModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="confirmDeleteClient(${clientId})">Sí, Eliminar</button>
    `;
    openGenericModal('Confirmar Eliminación', body, footer);
}

async function confirmDeleteClient(clientId) {
    const modalBody = document.getElementById('genericModalBody');
    const modalFooter = document.getElementById('genericModalFooter');
    if (modalBody) modalBody.innerHTML = '<div class="spinner"></div><p>Eliminando cliente...</p>';
    if (modalFooter) modalFooter.innerHTML = '';

    try {
        const session = getSession();
        if (!session) throw new Error('Sesión expirada.');

        const response = await fetch(`/.netlify/functions/clients?id=${encodeURIComponent(clientId)}`, {
            method: 'DELETE',
            headers: { 'x-admin-token': session.token }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'No se pudo eliminar el cliente.');
        }

        if (modalBody) modalBody.innerHTML = '✅ Cliente eliminado con éxito.';
        setTimeout(() => {
            closeGenericModal();
            loadAdminClients();
        }, 900);
    } catch (error) {
        if (modalBody) modalBody.innerHTML = `⚠️ Error al eliminar: ${error.message}`;
        if (modalFooter) modalFooter.innerHTML = '<button class="btn btn-secondary" onclick="closeGenericModal()">Cerrar</button>';
    }
}

function filterClients() {
    clientesGlobalSearch = document.getElementById('clientsSearchInput')?.value || '';
    clientesCurrentPage = 1;
    renderClients();
}

function setClientColumnFilter(column, value) {
    clientesColumnFilters[column] = value.trim().toLowerCase();
    clientesCurrentPage = 1;
    renderClients();
}

function sortClientsBy(column) {
    if (clientesSortColumn === column) {
        clientesSortDir = clientesSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        clientesSortColumn = column;
        clientesSortDir = 'asc';
    }
    renderClients();
}

function updateClientsSortIcons() {
    document.querySelectorAll('#clientsGrid .sortable').forEach((header) => {
        const arrow = header.querySelector('.sort-arrow');
        if (!arrow) return;

        const isActive = header.dataset.col === clientesSortColumn;
        arrow.textContent = isActive ? (clientesSortDir === 'asc' ? '↑' : '↓') : '↕';
    });
}

function changeClientsPage(nextPage) {
    const totalPages = clientesRowsPerPage === -1 ? 1 : Math.max(1, Math.ceil(todosLosClientes.length / clientesRowsPerPage));
    clientesCurrentPage = Math.min(Math.max(nextPage, 1), totalPages);
    renderClients();
}

function changeClientsRowsPerPage(value) {
    clientesRowsPerPage = parseInt(value, 10);
    clientesCurrentPage = 1;
    renderClients();
}

function toggleClientsRowsPerPageDropdown(event) {
    toggleAdminRowsPerPageDropdown('clients', event);
}

function selectClientsRowsPerPage(value) {
    selectAdminRowsPerPage('clients', value, () => {
        clientesRowsPerPage = parseInt(value, 10);
        clientesCurrentPage = 1;
        renderClients();
    });
}

window.initClientsAdminPage = function initClientsAdminPage() {
    resetClientsViewState();
    loadAdminClients();
};
