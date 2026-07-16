if (window.location.pathname.includes('/admin/order_items')) {
    // Gestión de Órdenes (Personal Shopper)

    let todasLasOrdenes = [];
    let globalSearch = '';
    let sortColumn = null;
    let sortDir = 'asc';
    let columnFilters = {
        client_name: '', client_phone: '', product_name: '', size: '', quantity: '',
        price: '', status_name: '', usa_reviewed: '', bank_reviewed: ''
    };

    async function cargarEstadosOrdenes() {
        try {
            // Reutilizamos la función de estados de tracking que es genérica.
            const res = await fetch('/.netlify/functions/tracking-status');
            if (!res.ok) throw new Error('No se pudieron cargar los estados.');
            
            const estados = await res.json();
            const options = estados.map(e =>
                `<option value="${e.id_status_tracking}">${e.status_name}</option>`
            ).join('');

            ['editStatus'].forEach(id => {
                const sel = document.getElementById(id);
                if (sel) sel.innerHTML = '<option value="">-- Selecciona --</option>' + options;
            });
        } catch (error) {
            console.error(error.message);
        }
    }

    async function loadAdminOrders() {
        const table = document.querySelector('#adminGrid .admin-table');
        const statusEl = document.getElementById('adminStatus');

        if (!table || !statusEl) {
            console.error("No se encontraron elementos de la tabla o estado en el DOM.");
            return;
        }

        table.style.display = 'none'; // Ocultar la tabla mientras se carga
        statusEl.style.display = 'flex'; // Mostrar 'Cargando...'

        await cargarEstadosOrdenes();

        try {
            const session = getSession();
            if (!session) throw new Error('Sesión no válida');

            const response = await fetch('/.netlify/functions/order-items', {
                headers: { 'x-admin-token': session.token }
            });
            if (response.status === 401) {
                throw new Error('No autorizado. Verificá la sesión de administrador o recargá e iniciá sesión otra vez.');
            }
            if (!response.ok) throw new Error(`Error del servidor: ${response.statusText}`);

            todasLasOrdenes = await response.json();
            renderOrders();

        } catch (err) {
            statusEl.innerHTML = `<p style="color:red;">⚠️ Error al cargar: ${err.message}</p>`;
        } finally {
            statusEl.style.display = 'none';
        }
    }

    function renderOrders() {
        const table = document.querySelector('#adminGrid .admin-table');
        const tbody = document.getElementById('adminTbody');
        const noResults = document.getElementById('adminNoResults');

        if (!table || !tbody || !noResults) return;

        // 1. Aplicar búsqueda global
        let lista = todasLasOrdenes.filter(o =>
            !globalSearch ||
            (o.client_name || '').toLowerCase().includes(globalSearch) ||
            (o.product_name || '').toLowerCase().includes(globalSearch) ||
            (o.client_phone || '').toLowerCase().includes(globalSearch)
        );

        // 2. Aplicar filtros por columna
        lista = lista.filter(o =>
            (o.client_name || '').toLowerCase().includes(columnFilters.client_name) &&
            (o.client_phone || '').toLowerCase().includes(columnFilters.client_phone) &&
            (o.product_name || '').toLowerCase().includes(columnFilters.product_name) &&
            (o.size || '').toLowerCase().includes(columnFilters.size) &&
            String(o.quantity || '').toLowerCase().includes(columnFilters.quantity) &&
            String(o.price || '').toLowerCase().includes(columnFilters.price) &&
            (o.status_name || '').toLowerCase().includes(columnFilters.status_name) &&
            (columnFilters.usa_reviewed === '' || String(o.usa_reviewed) === columnFilters.usa_reviewed) &&
            (columnFilters.bank_reviewed === '' || String(o.bank_reviewed) === columnFilters.bank_reviewed)
        );

        // 3. Aplicar ordenamiento
        if (sortColumn) {
            lista.sort((a, b) => {
                let valA = a[sortColumn] || '';
                let valB = b[sortColumn] || '';

                if (typeof valA === 'number' && typeof valB === 'number') {
                    return sortDir === 'asc' ? valA - valB : valB - valA;
                }
                const comparison = String(valA).localeCompare(String(valB), 'es', { sensitivity: 'base' });
                return sortDir === 'asc' ? comparison : -comparison;
            });
        }

        const ordenes = lista; // Renombramos para el resto de la función

        if (ordenes.length === 0) {
            noResults.style.display = 'block';
            table.style.display = 'none';
            tbody.innerHTML = '';
            return;
        }
        
        noResults.style.display = 'none';
        table.style.display = '';

        const rowsHtml = ordenes.map(o => `
                <tr>
                    <td><img src="${o.image_url || 'https://placehold.co/40x40/E19B9D/FFFFFF?text=?'}" class="admin-table-img" alt="Producto"></td>
                    <td>${o.client_name || ''}</td>
                    <td>${o.client_phone || ''}</td>
                    <td>${o.product_name || ''}</td>
                    <td>${o.size || ''}</td>
                    <td>${o.quantity || 0}</td>
                    <td>₡${(o.price || 0).toLocaleString('es-CR')}</td>
                    <td><span class="status-dot" style="background-color: ${o.id_status === 9 ? '#28a745' : '#ffc107'};"></span> ${o.status_name || 'Pendiente'}</td>
                    <td style="text-align: center;"><input type="checkbox" onchange="toggleReviewStatus(${o.id}, 'usa_reviewed', this)" ${o.usa_reviewed ? 'checked' : ''}></td>
                    <td style="text-align: center;"><input type="checkbox" onchange="toggleReviewStatus(${o.id}, 'bank_reviewed', this)" ${o.bank_reviewed ? 'checked' : ''}></td>
                    <td class="admin-actions-cell">
                        <button class="admin-btn-icon" onclick="abrirFormEdicion(${o.id})" title="Editar Orden"><i class="fas fa-pencil-alt"></i></button>
                        <button class="admin-btn-icon btn-delete" onclick="eliminarOrden(${o.id})" title="Eliminar Orden"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>`
        ).join('');

        tbody.innerHTML = rowsHtml;
        actualizarIconosOrden();
    }

    function sortBy(col) {
        if (sortColumn === col) {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            sortColumn = col;
            sortDir = 'asc';
        }
        renderOrders();
    }

    function setColumnFilter(col, value) {
        columnFilters[col] = value.toLowerCase();
        renderOrders();
    }

    function actualizarIconosOrden() {
        document.querySelectorAll('.admin-table th.sortable').forEach(th => {
            const col = th.dataset.col;
            const arrow = th.querySelector('.sort-arrow');
            if (!arrow) return;
            if (sortColumn !== col) {
                arrow.textContent = '↕';
            } else {
                arrow.textContent = sortDir === 'asc' ? '▲' : '▼';
            }
        });
    }

    function filtrarOrdenes() {
        globalSearch = document.getElementById('adminSearchInput').value.toLowerCase().trim();
        renderOrders();
    }

    function volverAlGrid() {
        document.getElementById('adminGridView').style.display = 'block';
        document.getElementById('adminFormNuevoView').style.display = 'none';
        document.getElementById('adminFormEditView').style.display = 'none';
    }

    function abrirFormNuevo() {
        document.getElementById('adminGridView').style.display = 'none';
        document.getElementById('adminFormNuevoView').style.display = 'block';
        // Limpiar formulario
        const ids = ['nuevoClientName', 'nuevoClientPhone', 'nuevoProductName', 'nuevoSize', 'nuevoPrice'];
        ids.forEach(id => document.getElementById(id).value = '');
        document.getElementById('nuevoQuantity').value = '1';
        document.getElementById('nuevoMensaje').innerHTML = '';

        // Resetear el campo de imagen
        document.getElementById('nuevoImageUrl').value = '';
        const preview = document.getElementById('nuevoImagePreview');
        if (preview) preview.querySelector('img').src = 'https://placehold.co/100x100/E19B9D/FFFFFF?text=?';
        document.getElementById('nuevoImageStatus').textContent = '';
        document.getElementById('nuevoImageUpload').value = null;
        document.getElementById('nuevoCameraUpload').value = null;
    }

    async function guardarNuevaOrden() {
        const mensajeEl = document.getElementById('nuevoMensaje');
        mensajeEl.style.color = 'red';
        
        const client_name = document.getElementById('nuevoClientName').value.trim();
        const product_name = document.getElementById('nuevoProductName').value.trim();
        const price = parseFloat(document.getElementById('nuevoPrice').value);
        
        if (!client_name || !product_name || !price) {
            mensajeEl.textContent = 'Por favor, completa todos los campos obligatorios (*).';
            return;
        }
        if (isNaN(price) || price <= 0) {
            mensajeEl.textContent = 'El precio debe ser un número válido y mayor que cero.';
            return;
        }
        
        mensajeEl.textContent = 'Guardando...';
        mensajeEl.style.color = 'var(--brown-text)';
        
        try {
            const session = getSession();
            if (!session) throw new Error('Sesión expirada.');
            
            const response = await fetch('/.netlify/functions/order-items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
                body: JSON.stringify({
                    client_name: client_name,
                    client_phone: document.getElementById('nuevoClientPhone').value.trim() || null,
                    product_name: product_name,
                    size: document.getElementById('nuevoSize').value.trim() || null,
                    quantity: parseInt(document.getElementById('nuevoQuantity').value),
                    price: price,
                    image_url: document.getElementById('nuevoImageUrl').value || null, // Obtener URL del campo oculto
                    id_status: 1 // Por defecto, se crea como 'Pendiente' o 'Activo'
                })
            });

            if (!response.ok) throw new Error((await response.json()).error || 'No se pudo guardar.');

            mensajeEl.textContent = '✅ ¡Orden guardada con éxito!';
            mensajeEl.style.color = '#28a745';

            setTimeout(async () => {
                await loadAdminOrders();
                volverAlGrid();
            }, 1500);

        } catch (error) {
            mensajeEl.textContent = `Error: ${error.message}`;
        }
    }

    let ordenIdActual = null;

    function abrirFormEdicion(id) {
        const orderId = Number(id);
        const orden = todasLasOrdenes.find(o => Number(o.id) === orderId);
        if (!orden) return;
        ordenIdActual = orderId;

        const setVal = (elId, val) => {
            const el = document.getElementById(elId);
            if (el) el.value = val || '';
        };

        setVal('editNombre', orden.client_name); // Corresponde a 'editNombre' en el HTML
        setVal('editProducto', orden.product_name); // Corresponde a 'editProducto'
        setVal('editTalla', orden.size);
        setVal('editCantidad', orden.quantity);
        setVal('editPrecio', orden.price);
        
        // Manejo del campo de imagen
        setVal('editImageUrl', orden.image_url); // Campo oculto
        const preview = document.getElementById('editImagePreview');
        if (preview) preview.querySelector('img').src = orden.image_url || 'https://placehold.co/100x100/E19B9D/FFFFFF?text=?';
        const imageStatusEl = document.getElementById('editImageStatus');
        if (imageStatusEl) imageStatusEl.textContent = '';
        document.getElementById('editImageUpload').value = null;
        document.getElementById('editCameraUpload').value = null;

        document.getElementById('editMensaje').innerHTML = '';
        
        document.getElementById('adminGridView').style.display = 'none';
        document.getElementById('adminFormEditView').style.display = 'block';
    }

    async function guardarEdicion() {
        const mensajeEl = document.getElementById('editMensaje');
        mensajeEl.style.color = 'red';

        const client_name = document.getElementById('editNombre').value.trim();
        const product_name = document.getElementById('editProducto').value.trim();
        const price = parseFloat(document.getElementById('editPrecio').value);
        const quantity = parseInt(document.getElementById('editCantidad').value);

        if (!client_name || !product_name || !price || !quantity) {
            mensajeEl.textContent = 'Por favor, completa todos los campos obligatorios (*).';
            return;
        }

        mensajeEl.textContent = 'Guardando...';
        mensajeEl.style.color = 'var(--brown-text)';

        try {
            const session = getSession();
            if (!session) throw new Error('Sesión expirada.');

            const response = await fetch('/.netlify/functions/order-items', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
                body: JSON.stringify({
                    id: ordenIdActual,
                    client_name: client_name,
                    client_phone: todasLasOrdenes.find(o => Number(o.id) === Number(ordenIdActual))?.client_phone || null, // Mantenemos el teléfono que ya existía
                    product_name: product_name,
                    size: document.getElementById('editTalla').value.trim() || null,
                    quantity: quantity,
                    price: price,
                    image_url: document.getElementById('editImageUrl').value || null, // Obtener URL del campo oculto
                    id_status: todasLasOrdenes.find(o => Number(o.id) === Number(ordenIdActual))?.id_status || 1, // Mantenemos el estado que ya existía, ya que el campo no está en el form.
                    created_at: todasLasOrdenes.find(o => Number(o.id) === Number(ordenIdActual))?.created_at // Enviamos la fecha de creación original
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'No se pudo actualizar la orden.');
            }

            mensajeEl.textContent = '✅ ¡Orden actualizada con éxito!';
            mensajeEl.style.color = '#28a745';

            setTimeout(async () => {
                await loadAdminOrders();
                volverAlGrid();
            }, 1500);

        } catch (error) {
            mensajeEl.textContent = `Error: ${error.message}`;
        }
    }

    async function toggleReviewStatus(orderId, field, checkbox) {
        const isChecked = checkbox.checked;

        // Actualizar el estado local primero para una UI optimista
        const orden = todasLasOrdenes.find(o => Number(o.id) === Number(orderId));
        if (orden) {
            orden[field] = isChecked;
        } else {
            alert(`Error interno: No se encontró la orden con ID ${orderId} para actualizar.`);
            // Revertir el cambio en la UI porque no se puede procesar
            checkbox.checked = !isChecked;
            return;
        }

        try {
            const session = getSession();
            if (!session) throw new Error('Sesión expirada.');

            const body = {
                id: orderId,
                [field]: isChecked,
                client_phone: orden?.client_phone || null, // Requerido por la política RLS para la actualización.
                created_at: orden?.created_at // Requerido por la política RLS para la actualización.
            };

            const response = await fetch('/.netlify/functions/order-items', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Respuesta de error no es JSON.' }));
                throw new Error(errorData.error || `Error ${response.status}: No se pudo actualizar el estado.`);
            }

            // El estado ya se actualizó localmente, la API lo confirmó.

        } catch (error) {
            alert(`Error al actualizar: ${error.message}`);
            // Revertir el cambio en la UI si la API falla
            checkbox.checked = !isChecked;
            if (orden) orden[field] = !isChecked;
        }
    }

    // Alias para que el botón del HTML funcione sin cambios
    function guardarEdicionCompleta() {
        guardarEdicion();
    }

    async function eliminarOrden(id) {
        if (!confirm('¿Estás seguro de que deseas eliminar esta orden? Esta acción no se puede deshacer.')) {
            return;
        }

        const status = document.getElementById('adminStatus');
        status.innerHTML = '<div class="spinner"></div><p>Eliminando orden...</p>';
        status.style.display = 'flex';

        try {
            const session = getSession();
            if (!session) throw new Error('Sesión expirada.');

            const response = await fetch(`/.netlify/functions/order-items?id=${id}`, {
                method: 'DELETE',
                headers: { 'x-admin-token': session.token }
            });

            if (!response.ok) throw new Error((await response.json()).error || 'No se pudo eliminar la orden.');

            await loadAdminOrders();

        } catch (error) {
            alert(`Error al eliminar: ${error.message}`);
        }
    }

    async function handleImageUpload(event, formType) {
        const fileInput = event.target;
        const file = fileInput.files[0];
        if (!file) return;

        const statusEl = document.getElementById(`${formType}ImageStatus`);
        const previewImg = document.getElementById(`${formType}ImagePreview`).querySelector('img');
        const urlHiddenInput = document.getElementById(`${formType}ImageUrl`);

        statusEl.textContent = 'Subiendo imagen...';
        statusEl.style.color = 'var(--brown-text)';

        try {
            const session = getSession();
            if (!session) throw new Error('Sesión expirada.');

            // 1. Enviar el archivo binario directamente a la función de Netlify
            const response = await fetch('/.netlify/functions/upload-image', {
                method: 'POST',
                headers: {
                    'Content-Type': file.type,
                    'x-admin-token': session.token,
                    'x-file-name': file.name // Enviamos el nombre del archivo en una cabecera personalizada
                },
                body: file // Enviamos el objeto File directamente
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'No se pudo subir la imagen.');
            }

            const { imageUrl } = await response.json();

            // 2. Actualizar la UI con la nueva URL
            urlHiddenInput.value = imageUrl;
            previewImg.src = imageUrl;
            statusEl.textContent = '✅ Imagen subida.';
            statusEl.style.color = '#28a745';

        } catch (error) {
            statusEl.textContent = `Error: ${error.message}`;
            statusEl.style.color = 'red';
        }
    }

    function triggerFileUpload(formType) {
        // Dispara el clic en el input para seleccionar archivos del dispositivo
        document.getElementById(`${formType}ImageUpload`).click();
    }

    function triggerCameraUpload(formType) {
        // Dispara el clic en el input que tiene el atributo 'capture' para abrir la cámara
        document.getElementById(`${formType}CameraUpload`).click();
    }


    window.initOrderItemsAdminPage = loadAdminOrders;
}