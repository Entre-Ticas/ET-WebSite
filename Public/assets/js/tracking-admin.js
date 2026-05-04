// Gestión de paquetes

let todosLosTrackings = [];
let adminIdTracking = null;
let globalSearch = '';
let sortColumn = null;
let sortDir = 'asc';
let columnFilters = { cliente: '', producto: '', guia: '', fecha: '', estado: '' };

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

async function loadAdmin() {
    const statusEl = document.getElementById('adminStatus');
    if (!statusEl) return;

    cargarEstados();

    try {
        const response = await fetch('/.netlify/functions/tracking');
        if (!response.ok) throw new Error(`Error ${response.status}`);

        todosLosTrackings = await response.json();
        statusEl.style.display = 'none';
        renderTrackings();
    } catch (err) {
        statusEl.innerHTML = `<p style="color:red;">⚠️ Error al cargar: ${err.message}</p>`;
    }
}

function renderTrackings() {
    const grid = document.getElementById('adminGrid');
    const noResults = document.getElementById('adminNoResults');
    if (!grid) return;

    // Aplicar búsqueda global
    let lista = todosLosTrackings.filter(t =>
        !globalSearch ||
        (t.cliente || '').toLowerCase().includes(globalSearch) ||
        (t.producto || '').toLowerCase().includes(globalSearch) ||
        (t.codigo_seguimiento_interno || '').toLowerCase().includes(globalSearch) ||
        (t.codigo_seguimiento_externo || '').toLowerCase().includes(globalSearch)
    );

    // Aplicar filtros por columna
    lista = lista.filter(t => {
        const guia = (t.codigo_seguimiento_externo || t.codigo_seguimiento_interno || '').toLowerCase();
        const fecha = t.fecha_compra
            ? new Date(t.fecha_compra).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '';
        return (
            (t.cliente || '').toLowerCase().includes(columnFilters.cliente) &&
            (t.producto || '').toLowerCase().includes(columnFilters.producto) &&
            guia.includes(columnFilters.guia) &&
            fecha.includes(columnFilters.fecha) &&
            (t.ultimo_estado || '').toLowerCase().includes(columnFilters.estado)
        );
    });

    // Aplicar ordenamiento
    if (sortColumn) {
        lista = [...lista].sort((a, b) => {
            let va = '', vb = '';
            if (sortColumn === 'cliente')  { va = a.cliente || ''; vb = b.cliente || ''; }
            if (sortColumn === 'producto') { va = a.producto || ''; vb = b.producto || ''; }
            if (sortColumn === 'guia')     { va = a.codigo_seguimiento_externo || a.codigo_seguimiento_interno || ''; vb = b.codigo_seguimiento_externo || b.codigo_seguimiento_interno || ''; }
            if (sortColumn === 'fecha')    { va = a.fecha_compra || ''; vb = b.fecha_compra || ''; }
            if (sortColumn === 'estado')   { va = a.ultimo_estado || ''; vb = b.ultimo_estado || ''; }
            const cmp = va.localeCompare(vb, 'es', { sensitivity: 'base' });
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }

    noResults.style.display = lista.length === 0 ? 'block' : 'none';

    const arrow = col => {
        if (sortColumn !== col) return '<span class="sort-arrow">↕</span>';
        return `<span class="sort-arrow">${sortDir === 'asc' ? '▲' : '▼'}</span>`;
    };

    const filas = lista.map(t => {
        const guia  = t.codigo_seguimiento_externo || t.codigo_seguimiento_interno || '—';
        const fecha = t.fecha_compra
            ? new Date(t.fecha_compra).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—';
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
                    <button class="admin-btn-actualizar" onclick="abrirFormEstado(${t.id_tracking})" title="Actualizar Estado"><i class="fa-solid fa-pen-to-square"></i></button>
                    ${guia !== '—' ? `<button class="admin-btn-track" onclick="irARastreo('${guia.replace(/'/g, "\\'")}')" title="Rastrear paquete"><i class="fa-solid fa-truck-fast"></i></button>` : ''}
                </td>
            </tr>`;
    }).join('');

    const focusedCol = document.activeElement?.dataset?.col || null;

    const cf = columnFilters;
    grid.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th class="sortable" onclick="sortBy('cliente')">Cliente ${arrow('cliente')}</th>
                    <th class="sortable" onclick="sortBy('producto')">Producto ${arrow('producto')}</th>
                    <th class="sortable" onclick="sortBy('guia')">Guía ${arrow('guia')}</th>
                    <th class="sortable" onclick="sortBy('fecha')">F. Compra ${arrow('fecha')}</th>
                    <th class="sortable" onclick="sortBy('estado')">Estado Actual ${arrow('estado')}</th>
                    <th></th>
                </tr>
                <tr class="admin-filter-row">
                    <td><input type="text" data-col="cliente" placeholder="Filtrar..." value="${cf.cliente}" oninput="setColumnFilter('cliente', this.value)" /></td>
                    <td><input type="text" data-col="producto" placeholder="Filtrar..." value="${cf.producto}" oninput="setColumnFilter('producto', this.value)" /></td>
                    <td><input type="text" data-col="guia"     placeholder="Filtrar..." value="${cf.guia}"     oninput="setColumnFilter('guia', this.value)" /></td>
                    <td><input type="text" data-col="fecha"    placeholder="Filtrar..." value="${cf.fecha}"    oninput="setColumnFilter('fecha', this.value)" /></td>
                    <td><input type="text" data-col="estado"   placeholder="Filtrar..." value="${cf.estado}"   oninput="setColumnFilter('estado', this.value)" /></td>
                    <td></td>
                </tr>
            </thead>
            <tbody>${filas}</tbody>
        </table>`;

    if (focusedCol) {
        const input = grid.querySelector(`input[data-col="${focusedCol}"]`);
        if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }
}

function sortBy(col) {
    if (sortColumn === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = col;
        sortDir = 'asc';
    }
    renderTrackings();
}

function setColumnFilter(col, val) {
    columnFilters[col] = val.toLowerCase();
    renderTrackings();
}

function filtrarTrackings() {
    globalSearch = document.getElementById('adminSearchInput').value.toLowerCase().trim();
    renderTrackings();
}

// ===== FORM: ACTUALIZAR ESTADO =====

function abrirFormEstado(idTracking) {
    const tracking = todosLosTrackings.find(t => t.id_tracking === idTracking);
    if (!tracking) return;

    adminIdTracking = idTracking;

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

function volverAlGrid() {
    document.getElementById('adminFormView').style.display = 'none';
    document.getElementById('adminFormNuevoView').style.display = 'none';
    document.getElementById('adminGridView').style.display = 'block';
}

async function guardarEstado() {
    const idStatus = document.getElementById('adminSelectEstado').value;
    const detalle  = document.getElementById('adminDetalle').value.trim();
    const mensaje  = document.getElementById('adminMensaje');

    if (!adminIdTracking) return alert('No hay paquete seleccionado.');
    if (!idStatus) return alert('Selecciona un estado.');

    mensaje.innerHTML = 'Guardando...';

    try {
        const session = getSession();
        if (!session) { mensaje.innerHTML = '⚠️ Sesión expirada. Inicia sesión nuevamente.'; return; }

        const response = await fetch('/.netlify/functions/tracking-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify({
                id_tracking:        adminIdTracking,
                id_status_tracking: parseInt(idStatus),
                detalle:            detalle || null,
                fecha_hora:         null
            })
        });

        if (!response.ok) throw new Error('Error al guardar.');

        const idx = todosLosTrackings.findIndex(t => t.id_tracking === adminIdTracking);
        if (idx !== -1) {
            const selectEl = document.getElementById('adminSelectEstado');
            todosLosTrackings[idx].ultimo_estado = selectEl.options[selectEl.selectedIndex].text;
        }

        mensaje.innerHTML = '✅ Estado guardado correctamente.';
        setTimeout(() => {
            renderTrackings();
            volverAlGrid();
        }, 1200);

    } catch (error) {
        mensaje.innerHTML = `⚠️ Error: ${error.message}`;
    }
}

// ===== FORM: NUEVO TRACKING =====

function abrirFormNuevo() {
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

function cerrarFormNuevo() {
    volverAlGrid();
}

function irARastreo(guia) {
    if (typeof loadPage === 'function') {
        loadPage('tracking', guia);
    }
}

function copiarGuia(btn, guia) {
    const url = `${window.location.origin}/tracking/${guia}`;
    navigator.clipboard.writeText(url).then(() => {
        const original = btn.innerHTML;
        btn.innerHTML = '✅ Copiado';
        btn.disabled = true;
        setTimeout(() => { btn.innerHTML = original; btn.disabled = false; }, 1500);
    }).catch(() => {
        alert('No se pudo copiar: ' + url);
    });
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
            volverAlGrid();
        }, 1200);

    } catch (error) {
        mensaje.innerHTML = `⚠️ Error: ${error.message}`;
    }
}
