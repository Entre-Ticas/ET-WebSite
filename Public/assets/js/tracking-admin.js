// Gestión de paquetes

    let todosLosTrackings = [];
    let trackingAdminIdTracking = null;
    let trackingGlobalSearch = '';
    let trackingSortColumn = null;
    let trackingSortDir = 'asc';
    let trackingColumnFilters = { cliente: '', producto: '', guia: '', fecha: '', estado: '' };

    // Variables de paginación con prefijo único
    let trackingCurrentPage = 1;
    let trackingRowsPerPage = 10;

    registerAdminRowsPerPageDropdown({
        name: 'tracking',
        dropdownId: 'trackingRowsDropdown',
        triggerId: 'trackingRowsPerPageTrigger',
        menuId: 'trackingRowsPerPageMenu',
        labelId: 'trackingRowsPerPageSelectedLabel',
        selectorId: 'rowsPerPageSelector',
        toggleFnName: 'toggleTrackingRowsPerPageDropdown',
        selectFnName: 'selectTrackingRowsPerPage',
        getValue: () => trackingRowsPerPage,
        onSelect: (value) => {
            trackingRowsPerPage = parseInt(value, 10);
            trackingCurrentPage = 1;
            renderTrackings();
        }
    });

    function resetTrackingViewState() {
        trackingGlobalSearch = '';
        trackingSortColumn = null;
        trackingSortDir = 'asc';
        trackingColumnFilters = { cliente: '', producto: '', guia: '', fecha: '', estado: '' };
        trackingCurrentPage = 1;
        trackingRowsPerPage = 10;
        trackingAdminIdTracking = null;

        const searchInput = document.getElementById('adminSearchInput');
        if (searchInput) searchInput.value = '';

        const rowsSelector = document.getElementById('rowsPerPageSelector');
        if (rowsSelector) rowsSelector.value = '10';

        syncAdminRowsPerPageDropdown('tracking');
        closeAdminRowsPerPageDropdown('tracking');

        document.querySelectorAll('.admin-filter-row input').forEach(input => {
            input.value = '';
        });
        document.querySelectorAll('.admin-filter-row select').forEach(select => {
            select.value = '';
        });
    }

    async function cargarEstados() {
        try {
            const res = await fetch('/.netlify/functions/tracking-status');
            if (!res.ok) throw new Error();
            const estados = await res.json();
            const options = estados.map(e =>
                `<option value="${e.id_status_tracking}">${e.status_name}</option>`
            ).join('');
            ['adminSelectEstado', 'nuevoEstado'].forEach(id => {
                const sel = document.getElementById(id);
                if (sel) sel.innerHTML = '<option value="">-- Selecciona --</option>' + options;
            });
        } catch {
            console.error('No se pudieron cargar los estados.');
        }
    }

    async function loadTrackingAdmin() {
        const gridContainer = document.getElementById('adminGrid');
        if (!gridContainer) {
            console.error("El contenedor 'adminGrid' no existe en el HTML de la página.");
            return;
        }

        cargarEstados();

        try {
            const session = getSession();
            if (!session) {
                // La seguridad en main.js debería prevenir esto, pero es una buena salvaguarda.
                throw new Error('401');
            }

            const response = await fetch('/.netlify/functions/tracking', {
                headers: { 'x-admin-token': session.token }
            });
            if (!response.ok) throw new Error(`Error ${response.status}`);

            todosLosTrackings = await response.json();
            const statusEl = document.getElementById('adminStatus');
            statusEl.style.display = 'none';
            document.querySelector('#adminGrid .admin-table').style.display = '';
            renderTrackings();
        } catch (err) {
            statusEl.innerHTML = `<p style="color:red;">⚠️ Error al cargar: ${err.message}</p>`;
        }
    }

    function renderTrackings() {
        const grid = document.getElementById('adminGrid');
        const tbody = document.getElementById('adminTbody');
        const noResults = document.getElementById('adminNoResults');
        if (!grid || !tbody) return;

        // Aplicar búsqueda global
        let lista = todosLosTrackings.filter(t =>
            !trackingGlobalSearch ||
            (t.cliente || '').toLowerCase().includes(trackingGlobalSearch) ||
            (t.producto || '').toLowerCase().includes(trackingGlobalSearch) ||
            (t.codigo_seguimiento_interno || '').toLowerCase().includes(trackingGlobalSearch) ||
            (t.codigo_seguimiento_externo || '').toLowerCase().includes(trackingGlobalSearch)
        );

        // Aplicar filtros por columna
        lista = lista.filter(t => {
            const guia = (t.codigo_seguimiento_externo || t.codigo_seguimiento_interno || t.guia_externa || t.guia_interna || '').toLowerCase();
            const fecha = t.fecha_compra ? new Date(t.fecha_compra).toLocaleDateString('es-CR') : '';
            return (
                (t.cliente || '').toLowerCase().includes(trackingColumnFilters.cliente) &&
                (t.producto || '').toLowerCase().includes(trackingColumnFilters.producto) &&
                guia.includes(trackingColumnFilters.guia) &&
                fecha.includes(trackingColumnFilters.fecha) &&
                (t.ultimo_estado || '').toLowerCase().includes(trackingColumnFilters.estado)
            );
        });

        // Aplicar ordenamiento
        if (trackingSortColumn) {
            lista = [...lista].sort((a, b) => {
                let va = '', vb = '';
                if (trackingSortColumn === 'cliente')  { va = a.cliente || ''; vb = b.cliente || ''; }
                if (trackingSortColumn === 'producto') { va = a.producto || ''; vb = b.producto || ''; }
                if (trackingSortColumn === 'guia')     { va = a.codigo_seguimiento_externo || a.codigo_seguimiento_interno || ''; vb = b.codigo_seguimiento_externo || b.codigo_seguimiento_interno || ''; }
                if (trackingSortColumn === 'fecha')    { va = a.fecha_compra || ''; vb = b.fecha_compra || ''; }
                if (trackingSortColumn === 'estado')   { va = a.ultimo_estado || ''; vb = b.ultimo_estado || ''; }
                const cmp = va.localeCompare(vb, 'es', { sensitivity: 'base' });
                return trackingSortDir === 'asc' ? cmp : -cmp;
            });
        }

        const totalRows = lista.length;

        // Aplicar paginación
        const startIndex = (trackingCurrentPage - 1) * trackingRowsPerPage;
        const endIndex = trackingRowsPerPage === -1 ? totalRows : startIndex + trackingRowsPerPage;
        const paginatedItems = lista.slice(startIndex, endIndex);

        if (paginatedItems.length === 0) {
            noResults.style.display = 'block';
            tbody.innerHTML = '';
            renderTrackingPagination(totalRows);
            return;
        }

        noResults.style.display = 'none';

        const filas = paginatedItems.map(t => {
            const guia  = t.codigo_seguimiento_externo || t.codigo_seguimiento_interno || t.guia_externa || t.guia_interna || '—';
            const fecha = t.fecha_compra ? new Date(t.fecha_compra).toLocaleDateString('es-CR') : '—';
            const guiaCelda = guia !== '—' 
                ? `<button class="admin-btn-copiar" onclick="copiarGuia(this, '${guia.replace(/'/g, "\\'")}')">${guia} <i class="fa-regular fa-copy"></i></button>`
                : '—';
            return `
                <tr>
                    <td>${t.cliente || '—'}</td>
                    <td>${t.producto || '—'}</td>
                    <td class="admin-td-guia">${guiaCelda}</td>
                    <td>${fecha}</td>
                    <td class="admin-td-estado">${t.ultimo_estado || 'Sin estado'}</td>
                    <td class="admin-actions-cell">
                        <div class="admin-actions-inline">
                            <button class="admin-btn-action btn-edit" onclick="openTrackingEditForm(${t.id_tracking})" title="Editar Paquete"><i class="fas fa-pencil-alt"></i></button>
                            <button class="admin-btn-action btn-update" onclick="openTrackingStatusForm(${t.id_tracking})" title="Actualizar Estado"><i class="fa-solid fa-pen-to-square"></i></button>
                            ${guia !== '—' ? `
                                <button class="admin-btn-action btn-track" onclick="irARastreo('${guia.replace(/'/g, "\\'")}')" title="Rastrear paquete"><i class="fa-solid fa-truck-fast"></i></button>
                            ` : ''}
                        </div>
                    </td>
                </tr>`;
        }).join('');

        tbody.innerHTML = filas;
        actualizarTrackingIconosOrden();
        renderTrackingPagination(totalRows);
    }

    function renderTrackingPagination(totalRows) {
        const tfoot = document.getElementById('adminTableFooter');
        if (!tfoot) return;

        if (totalRows <= 10) {
            tfoot.style.display = 'none';
            return;
        }

        tfoot.style.display = '';

        const totalPages = trackingRowsPerPage === -1 ? 1 : Math.ceil(totalRows / trackingRowsPerPage);
        const startItem = (trackingCurrentPage - 1) * trackingRowsPerPage + 1;
        const endItem = trackingRowsPerPage === -1 ? totalRows : Math.min(trackingCurrentPage * trackingRowsPerPage, totalRows);

        const table = document.querySelector('#adminGrid .admin-table');
        const headerRow = table.querySelector('thead tr');
        if (!headerRow) return;

        const numColumns = headerRow.cells.length;
        document.getElementById('footerColspan').colSpan = numColumns;

        const infoEl = document.getElementById('paginationInfo');
        const navEl = document.getElementById('paginationNav');
        const selectorEl = document.getElementById('rowsPerPageSelector');

        infoEl.innerHTML = `Mostrando <strong>${startItem} - ${endItem}</strong> de <strong>${totalRows}</strong>`;
        selectorEl.value = trackingRowsPerPage;
        syncAdminRowsPerPageDropdown('tracking');

        navEl.innerHTML = `
            <button onclick="changeTrackingPage(${trackingCurrentPage - 1})" ${trackingCurrentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
            <span>Página <strong>${trackingCurrentPage}</strong> de ${totalPages}</span>
            <button onclick="changeTrackingPage(${trackingCurrentPage + 1})" ${trackingCurrentPage >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
        `;
    }

    function changeTrackingPage(newPage) {
        trackingCurrentPage = newPage;
        renderTrackings();
    }

    function changeTrackingRowsPerPage(value) {
        trackingRowsPerPage = parseInt(value, 10);
        trackingCurrentPage = 1;
        renderTrackings();
    }

    function actualizarTrackingIconosOrden() {
        document.querySelectorAll('.admin-table th.sortable').forEach(th => {
            const col = th.dataset.col;
            const arrow = th.querySelector('.sort-arrow');
            if (!arrow) return;
            if (trackingSortColumn !== col) arrow.textContent = '↕';
            else arrow.textContent = trackingSortDir === 'asc' ? '▲' : '▼';
        });
    }

    function trackingSortBy(col) {
        if (trackingSortColumn === col) {
            trackingSortDir = trackingSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            trackingSortColumn = col;
            trackingSortDir = 'asc';
        }
        renderTrackings();
    }

    function setTrackingColumnFilter(col, val) {
        trackingCurrentPage = 1;
        trackingColumnFilters[col] = val.toLowerCase();
        renderTrackings();
    }

    function filtrarTrackings() {
        trackingCurrentPage = 1;
        trackingGlobalSearch = document.getElementById('adminSearchInput').value.toLowerCase().trim();
        renderTrackings();
    }

    // ===== FORM: ACTUALIZAR ESTADO =====

    function openTrackingStatusForm(idTracking) {
        const tracking = todosLosTrackings.find(t => t.id_tracking === idTracking);
        if (!tracking) return;

        trackingAdminIdTracking = idTracking;

        const guia = tracking.codigo_seguimiento_externo || tracking.codigo_seguimiento_interno || '—';
        document.getElementById('adminFormPaqueteInfo').innerHTML = `
            <div style="padding:4px 0; border-bottom:1px solid rgba(225,155,157,0.3);"><strong>Cliente:</strong> ${tracking.cliente || '—'}</div>
            <div style="padding:4px 0; border-bottom:1px solid rgba(225,155,157,0.3);"><strong>Producto:</strong> ${tracking.producto || '—'}</div>
            <div style="padding:4px 0; border-bottom:1px solid rgba(225,155,157,0.3);"><strong>Guía:</strong> ${guia}</div>
            <div style="padding:4px 0;"><strong>Estado actual:</strong> ${tracking.ultimo_estado || 'Sin estado'}</div>`;

        document.getElementById('adminSelectEstado').value = '';
        document.getElementById('adminDetalle').value = '';
        document.getElementById('adminMensaje').innerHTML = '';

        document.getElementById('adminGridView').style.display = 'none';
        document.getElementById('adminFormView').style.display = 'block';
        window.scrollTo(0, 0);
    }

    function backToTrackingGrid() {
        document.getElementById('adminFormView').style.display = 'none';
        document.getElementById('adminFormNuevoView').style.display = 'none';
        document.getElementById('adminFormEditView').style.display = 'none';
        document.getElementById('adminGridView').style.display = 'block';
    }

    async function saveTrackingStatus() {
        const idStatus = document.getElementById('adminSelectEstado').value;
        const detalle  = document.getElementById('adminDetalle').value.trim();
        const mensaje  = document.getElementById('adminMensaje');

        if (!trackingAdminIdTracking) return alert('No hay paquete seleccionado.');
        if (!idStatus) return alert('Selecciona un estado.');

        mensaje.innerHTML = 'Guardando...';

        try {
            const session = getSession();
            if (!session) { mensaje.innerHTML = '⚠️ Sesión expirada. Inicia sesión nuevamente.'; return; }

            const response = await fetch('/.netlify/functions/tracking-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
                body: JSON.stringify({
                    id_tracking:        trackingAdminIdTracking,
                    id_status_tracking: parseInt(idStatus),
                    detalle:            detalle || null,
                    fecha_hora:         null
                })
            });

            if (!response.ok) throw new Error('Error al guardar.');

            const idx = todosLosTrackings.findIndex(t => t.id_tracking === trackingAdminIdTracking);
            if (idx !== -1) {
                const selectEl = document.getElementById('adminSelectEstado');
                todosLosTrackings[idx].ultimo_estado = selectEl.options[selectEl.selectedIndex].text;
            }

            mensaje.innerHTML = '✅ Estado guardado correctamente.';
            setTimeout(() => {
                renderTrackings();
                backToTrackingGrid();
            }, 1200);

        } catch (error) {
            mensaje.innerHTML = `⚠️ Error: ${error.message}`;
        }
    }

    // ===== FORM: EDITAR TRACKING EXISTENTE =====

    function openTrackingEditForm(idTracking) {
        // Buscamos el tracking en la lista global
        const trackingId = Number(idTracking);
        const tracking = todosLosTrackings.find(t => t.id_tracking === trackingId);
        if (!tracking) {
            alert('No se encontró el paquete para editar.');
            return;
        }

        trackingAdminIdTracking = trackingId;

        // Rellenar los campos de texto
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        
        setVal('editCliente', tracking.cliente);
        setVal('editProducto', tracking.producto);
        setVal('editGuiaExt',  tracking.codigo_seguimiento_externo || tracking.guia_externa); // Compatibilidad por si el RPC usa otro nombre
        setVal('editGuiaInt',  tracking.codigo_seguimiento_interno || tracking.guia_interna);
        
        // Función interna para formatear fechas de forma segura para inputs tipo date
        const formatDateForInput = (dateStr) => {
            if (!dateStr) return '';
            try {
                // Si el string ya tiene formato ISO (YYYY-MM-DD...), extraemos la parte de la fecha directamente.
                // Esta es la forma más segura de evitar desfases por zonas horarias.
                if (typeof dateStr === 'string' && dateStr.includes('-')) {
                    const parteFecha = dateStr.split('T')[0].split(' ')[0];
                    if (parteFecha.length === 10) return parteFecha;
                }

                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return '';
                
                // Fallback usando métodos UTC para asegurar que no se reste un día
                const year  = d.getUTCFullYear();
                const month = String(d.getUTCMonth() + 1).padStart(2, '0');
                const day   = String(d.getUTCDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            } catch (e) {
                console.error("Error formateando fecha:", e);
                return '';
            }
        };

        // Asignación de fechas
        const inputCompra = document.getElementById('editFechaCompra');
        const inputMiami  = document.getElementById('editFechaMiami');
        if (inputCompra) inputCompra.value = formatDateForInput(tracking.fecha_compra);
        if (inputMiami)  inputMiami.value  = formatDateForInput(tracking.fecha_entrega_miami || tracking.fecha_llegada_miami);

        const msgEl = document.getElementById('editMensaje');
        if (msgEl) msgEl.innerHTML = ''; 

        const gridView = document.getElementById('adminGridView');
        const editView = document.getElementById('adminFormEditView');

        if (gridView && editView) {
            gridView.style.display = 'none';
            editView.style.display = 'block';
        } else {
            console.error("No se encontraron los contenedores 'adminGridView' o 'adminFormEditView' en el HTML.");
            alert("Error técnico: No se puede mostrar el formulario de edición.");
        }
        
        window.scrollTo(0, 0);
    }

    async function saveTrackingFullEdit() {
        const getVal = (id) => document.getElementById(id)?.value?.trim() || '';
        
        const cliente     = getVal('editCliente');
        const producto    = getVal('editProducto');
        const guiaExt     = getVal('editGuiaExt');
        const guiaInt     = getVal('editGuiaInt');
        const fechaCompra = getVal('editFechaCompra');
        const fechaMiami  = document.getElementById('editFechaMiami')?.value || null; // Obtenemos el valor directo del input date
        const mensaje     = document.getElementById('editMensaje') || { set innerHTML(v){} };

        if (!trackingAdminIdTracking) return (mensaje.innerHTML = '⚠️ No hay paquete seleccionado para editar.');
        if (!cliente)  return (mensaje.innerHTML = '⚠️ El cliente es requerido.');
        if (!producto) return (mensaje.innerHTML = '⚠️ El producto es requerido.');
        if (!fechaCompra) return (mensaje.innerHTML = '⚠️ La fecha de compra es requerida.');

        mensaje.innerHTML = 'Guardando cambios...';

        try {
            const session = getSession();
            if (!session) { mensaje.innerHTML = '⚠️ Sesión expirada. Inicia sesión nuevamente.'; return; }

            const response = await fetch(`/.netlify/functions/tracking`, { 
                method: 'PUT', // Cambiamos a PUT para indicar una actualización
                headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
                body: JSON.stringify({
                    id_tracking:                trackingAdminIdTracking,
                    cliente:                    cliente,
                    producto:                   producto,
                    codigo_seguimiento_externo: guiaExt      || null,
                    codigo_seguimiento_interno: guiaInt      || null,
                    fecha_compra:               fechaCompra  || null,
                    fecha_entrega_miami:        fechaMiami   || null
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al guardar los cambios.');
            }

            // Actualizar el tracking en la lista local y refrescar la tabla
            await loadTrackingAdmin(); // Recargar todos los trackings para asegurar la consistencia
            mensaje.innerHTML = '✅ Cambios guardados correctamente.';
            setTimeout(() => { backToTrackingGrid(); }, 1200);

        } catch (error) {
            mensaje.innerHTML = `⚠️ Error: ${error.message}`;
        }
    }
    // ===== FORM: NUEVO TRACKING =====

    function openTrackingNewForm() {
        ['nuevoCliente','nuevoProducto','nuevoGuiaExt','nuevoGuiaInt'].forEach(id => {
            document.getElementById(id).value = '';
        });
        document.getElementById('nuevoFecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('nuevoEstado').value = '1';
        document.getElementById('nuevoMensaje').innerHTML = '';

        document.getElementById('adminGridView').style.display = 'none';
        document.getElementById('adminFormNuevoView').style.display = 'block';
        window.scrollTo(0, 0);
    }

    function closeTrackingNewForm() {
        backToTrackingGrid();
    }

    function irARastreo(guia) {
        if (typeof loadPage === 'function') {
            loadPage('tracking', guia);
        }
    }

    async function guardarNuevoTracking() {
        const cliente     = document.getElementById('nuevoCliente').value.trim();
        const producto    = document.getElementById('nuevoProducto').value.trim();
        const guiaExt     = document.getElementById('nuevoGuiaExt').value.trim();
        const guiaInt     = document.getElementById('nuevoGuiaInt').value.trim();
        const fecha       = document.getElementById('nuevoFecha').value;
        const fechaMiami  = document.getElementById('nuevoFechaMiami').value;
        const estado      = document.getElementById('nuevoEstado').value;
        const mensaje     = document.getElementById('nuevoMensaje');

        if (!cliente)  return (mensaje.innerHTML = '⚠️ El cliente es requerido.');
        if (!producto) return (mensaje.innerHTML = '⚠️ El producto es requerido.');
        if (!fecha)    return (mensaje.innerHTML = '⚠️ La fecha de compra es requerida.');
        if (!estado)   return (mensaje.innerHTML = '⚠️ Selecciona un estado inicial.');

        mensaje.innerHTML = 'Guardando...';

        try {
            const session = getSession();
            if (!session) { mensaje.innerHTML = '⚠️ Sesión expirada. Inicia sesión nuevamente.'; return; }

            const response = await fetch('/.netlify/functions/tracking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
                body: JSON.stringify({
                    cliente,
                    producto,
                    codigo_seguimiento_externo: guiaExt      || null,
                    codigo_seguimiento_interno: guiaInt      || null,
                    fecha_compra:               fecha        || null,
                    fecha_entrega_miami:        fechaMiami   || null,
                    id_status_tracking:         parseInt(estado)
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al guardar.');
            }

            const nuevo = await response.json();
            const selectEl = document.getElementById('nuevoEstado');
            nuevo.ultimo_estado = selectEl.options[selectEl.selectedIndex].text;
            todosLosTrackings.unshift(nuevo);

            mensaje.innerHTML = '✅ Paquete creado correctamente.';
            setTimeout(() => {
                renderTrackings();
                backToTrackingGrid();
            }, 1200);

        } catch (error) {
            mensaje.innerHTML = `⚠️ Error: ${error.message}`;
        }
    }

// Hacemos la función de inicialización global para que main.js pueda llamarla.
function initTrackingAdminPage() {
    resetTrackingViewState();
    loadTrackingAdmin();
}

window.initTrackingAdminPage = initTrackingAdminPage;
