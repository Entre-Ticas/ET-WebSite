// Variable para almacenar todos los productos y poder filtrar sobre ella.
let allCatalogProducts = [];
let catalogCurrentPage = 1;
let catalogRowsPerPage = 10;
// NOTA: El ordenamiento y filtro por columna no están implementados aún en esta vista.
// Se deja preparado para el futuro.

function resetCatalogViewState() {
    catalogCurrentPage = 1;
    catalogRowsPerPage = 10;

    const searchInput = document.getElementById('adminSearchInput');
    if (searchInput) searchInput.value = '';

    const rowsSelector = document.getElementById('rowsPerPageSelector');
    if (rowsSelector) rowsSelector.value = '10';
}

async function loadAdminProducts() {
    const gridContainer = document.getElementById('adminGrid');
    if (!gridContainer) {
        console.error("El contenedor 'adminGrid' no existe en el HTML de la página.");
        return;
    }

    const status = document.getElementById('adminStatus');
    status.style.display = 'flex'; // Mostrar 'Cargando...'

    try {
        // CORRECCIÓN: Apuntar a la función unificada 'catalog'
        const response = await fetch('/.netlify/functions/catalog');

        if (!response.ok) {
            throw new Error(`Error del servidor: ${response.statusText}`);
        }
        const data = await response.json();
        allCatalogProducts = data; // Guardar los datos en la variable global

        await cargarOpcionesDeEstado();

        // Ocultamos el spinner ANTES de renderizar, para que la tabla aparezca correctamente.
        status.style.display = 'none';
        
        displayAdminProducts(allCatalogProducts); // Mostrar los productos

    } catch (error) {
        console.error('Error al cargar productos para admin:', error);
        status.innerHTML = '<p>😕 Error al cargar los productos. Intenta de nuevo.</p>';
    }
}

function displayAdminProducts(products) {
    const table = document.querySelector('#adminGrid .admin-table');
    const tbody = document.getElementById('adminTbody');
    const noResults = document.getElementById('adminNoResults');

    if (!table || !tbody || !noResults) {
        console.error('No se encontraron los elementos de la tabla de administración en el DOM.');
        return;
    }

    tbody.innerHTML = ''; // Limpiar solo el cuerpo de la tabla

    const totalRows = products.length;

    // Aplicar paginación
    const startIndex = (catalogCurrentPage - 1) * catalogRowsPerPage;
    const endIndex = catalogRowsPerPage === -1 ? totalRows : startIndex + catalogRowsPerPage;
    const paginatedItems = products.slice(startIndex, endIndex);

    if (paginatedItems.length === 0) {
        noResults.style.display = 'block';
        table.style.display = 'none'; // Ocultar la tabla si no hay productos
        tbody.innerHTML = ''; // Limpiamos el cuerpo de la tabla
        // Aún así, renderizamos la paginación para poder navegar
        renderCatalogPagination(totalRows); 
        return; // Salimos para no intentar renderizar filas vacías
    }
    
    noResults.style.display = 'none';
    table.style.display = ''; // Asegurarse de que la tabla sea visible
    
    paginatedItems.forEach(p => {
        const imageUrl = p.img || ''; // CORRECCIÓN: Usar 'img' que viene del backend
        tbody.innerHTML += `
            <tr>
                <td><img src="${imageUrl || 'https://placehold.co/40x40/E19B9D/FFFFFF?text=?'}" alt="${p.name}" class="admin-table-img" onclick="openImageModal('${imageUrl || ''}')"></td>
                <td>${p.name}</td>
                <td>${p.category}</td>
                <td>₡${p.price ? p.price.toLocaleString('es-CR') : '0'}</td>
                <td><span class="status-dot ${p.stock === 'entrega inmediata' ? 'available' : 'unavailable'}"></span> ${p.stock}</td>
                <td>
                    <button class="admin-btn-action btn-edit" onclick="catalogOpenEditForm(${p.id})" title="Editar Producto"><i class="fas fa-pencil-alt"></i></button>
                    <button class="admin-btn-action btn-update" onclick="catalogOpenStatusForm(${p.id})" title="Actualizar Estado"><i class="fa fa-edit"></i></button>
                    <button class="admin-btn-action btn-delete" onclick="eliminarProducto(${p.id}, '${imageUrl}')" title="Eliminar Producto"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>
        `;
    });

    renderCatalogPagination(totalRows);
}

function renderCatalogPagination(totalRows) {
    const tfoot = document.getElementById('adminTableFooter');
    if (!tfoot) return;

    if (totalRows <= 10) {
        tfoot.style.display = 'none';
        return;
    }

    tfoot.style.display = '';

    const totalPages = catalogRowsPerPage === -1 ? 1 : Math.ceil(totalRows / catalogRowsPerPage);
    const startItem = (catalogCurrentPage - 1) * catalogRowsPerPage + 1;
    const endItem = catalogRowsPerPage === -1 ? totalRows : Math.min(catalogCurrentPage * catalogRowsPerPage, totalRows);

    const table = document.querySelector('#adminGrid .admin-table');
    // Hacemos la búsqueda del encabezado más robusta para que encuentre la primera fila del thead.
    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return; // Salir si no hay encabezado

    const numColumns = headerRow.cells.length;
    document.getElementById('footerColspan').colSpan = numColumns;

    const infoEl = document.getElementById('paginationInfo');
    const navEl = document.getElementById('paginationNav');
    const selectorEl = document.getElementById('rowsPerPageSelector');

    // CORRECCIÓN: Asegurarse de que todos los elementos se actualicen.
    // La lógica anterior tenía condicionales que podían fallar.
    // Esta versión es más directa y robusta.
    infoEl.innerHTML = `Mostrando <strong>${startItem} - ${endItem}</strong> de <strong>${totalRows}</strong>`;
    selectorEl.value = catalogRowsPerPage;
    
    navEl.innerHTML = `
        <button onclick="changeCatalogPage(${catalogCurrentPage - 1})" ${catalogCurrentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
        <span>Página <strong>${catalogCurrentPage}</strong> de ${totalPages}</span>
        <button onclick="changeCatalogPage(${catalogCurrentPage + 1})" ${catalogCurrentPage >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
    `;
}

function changeCatalogPage(newPage) {
    catalogCurrentPage = newPage;
    filtrarProductos(); // Re-filtramos para aplicar la nueva página
}

function changeCatalogRowsPerPage(value) {
    catalogRowsPerPage = parseInt(value, 10);
    catalogCurrentPage = 1;
    filtrarProductos(); // Re-filtramos con el nuevo número de filas
}

/**
 * Filtra los productos basándose en el input de búsqueda.
 */
function filtrarProductos() {
    // Al filtrar, siempre volvemos a la primera página para evitar confusiones.
    if (typeof catalogCurrentPage === 'undefined' || catalogCurrentPage === 0) catalogCurrentPage = 1;

    const searchTerm = document.getElementById('adminSearchInput').value.toLowerCase();
    const filteredProducts = allCatalogProducts.filter(p =>
        p.name.toLowerCase().includes(searchTerm) ||
        p.category.toLowerCase().includes(searchTerm)
    );
    displayAdminProducts(filteredProducts);
}

function catalogOpenNewForm() {
    document.getElementById('adminGridView').style.display = 'none';
    document.getElementById('adminFormNuevoView').style.display = 'block';
    // Limpiar el formulario por si tenía datos previos
    document.getElementById('nuevoNombre').value = '';
    document.getElementById('nuevaCategoria').value = '';
    document.getElementById('nuevaTalla').value = '';
    document.getElementById('nuevoPrecio').value = '';
    document.getElementById('nuevaImagen').value = '';
    document.getElementById('nuevoEstado').value = '';
    document.getElementById('nuevoMensaje').innerHTML = '';
}

/**
 * Oculta los formularios y muestra la vista de grid principal.
 */
function catalogBackToGrid() {
    document.getElementById('adminGridView').style.display = 'block';
    document.getElementById('adminFormNuevoView').style.display = 'none';
    document.getElementById('adminFormView').style.display = 'none';
    document.getElementById('adminFormEditView').style.display = 'none';
}

async function guardarNuevoProducto() {
    const mensajeEl = document.getElementById('nuevoMensaje');
    mensajeEl.style.color = 'red'; // Color por defecto para errores

    // Recopilar datos del formulario
    const nombre = document.getElementById('nuevoNombre').value.trim();
    const categoria = document.getElementById('nuevaCategoria').value.trim();
    const talla = document.getElementById('nuevaTalla').value.trim();
    const precio = parseFloat(document.getElementById('nuevoPrecio').value);
    const imagenUrl = document.getElementById('nuevaImagen').value.trim();
    const idEstado = parseInt(document.getElementById('nuevoEstado').value);

    if (!nombre || !categoria || !precio || !imagenUrl || !idEstado) {
        mensajeEl.textContent = 'Por favor, completa todos los campos obligatorios (*).';
        return;
    }
    if (isNaN(precio) || precio <= 0) {
        mensajeEl.textContent = 'El precio debe ser un número válido y mayor que cero.';
        return;
    }

    mensajeEl.textContent = 'Guardando...';
    mensajeEl.style.color = 'var(--brown-text)';

    try {
        const session = getSession();
        if (!session) {
            mensajeEl.textContent = '⚠️ Sesión expirada. Inicia sesión nuevamente.';
            return;
        }

        // CORRECCIÓN: Apuntar a la función unificada 'catalog'
        const response = await fetch('/.netlify/functions/catalog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': session.token },
            body: JSON.stringify({
                name: nombre,
                category: categoria,
                size: talla || null,
                price: precio,
                image_url: imagenUrl,
                status_id: idEstado
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'No se pudo guardar el producto.');
        }

        mensajeEl.textContent = '✅ ¡Producto guardado con éxito!';
        mensajeEl.style.color = '#28a745';

        setTimeout(() => {
            loadAdminProducts(); 
            catalogBackToGrid();     
        }, 1500);

    } catch (error) {
        console.error('Error al guardar el producto:', error);
        mensajeEl.textContent = `Error al guardar: ${error.message}`;
        mensajeEl.style.color = 'red';
    }
}

async function eliminarProducto(id, imageUrl) {
    if (!confirm('¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer.')) {
        return;
    }

    const status = document.getElementById('adminStatus');
    status.innerHTML = '<div class="spinner"></div><p>Eliminando producto...</p>';
    status.style.display = 'flex';

    try {
        const session = getSession();
        if (!session) {
            throw new Error('Sesión expirada. Inicia sesión nuevamente.');
        }

        // CORRECCIÓN: Apuntar a la función unificada 'catalog'
        const response = await fetch(`/.netlify/functions/catalog?id=${id}`, {
            method: 'DELETE',
            headers: {
                'x-admin-token': session.token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ imageUrl: imageUrl })
        });

        if (!response.ok) {
            let errorMessage = `Error del servidor: ${response.status}`;
            try {
                // Intenta leer el error como JSON
                const errorData = await response.json();
                errorMessage = errorData.message || JSON.stringify(errorData);
            } catch (e) {
                // Si falla, lee el error como texto plano
                errorMessage = await response.text();
            }
            throw new Error(errorMessage || 'No se pudo eliminar el producto.');
        }

        // Recargar la lista de productos para reflejar el cambio
        await loadAdminProducts();

    } catch (error) {
        console.error('Error al eliminar el producto:', error);
        alert(`Error: ${error.message}`);
    } finally {
        status.style.display = 'none';
    }
}

async function cargarOpcionesDeEstado() {
    try {
        // const res = await fetch('/.netlify/functions/catalog-status');
        // if (!res.ok) throw new Error('No se pudieron cargar los estados.');
        
        // const estados = await res.json();
        // const options = estados.map(e =>
        //     `<option value="${e.id}">${e.name}</option>`
        // ).join('');

        // ['nuevoEstado', 'adminSelectEstado'].forEach(id => {
        //     const sel = document.getElementById(id);
        //     if (sel) sel.innerHTML = '<option value="">-- Selecciona --</option>' + options;
        // });
    } catch (error) {
        console.error(error.message);
    }
}

function initCatalogAdminPage() {
    resetCatalogViewState();
    // Simplemente llama a la función de carga, que ya no depende de un cliente de Supabase.
    loadAdminProducts();
}

// Evita colisiones globales con tracking/order/invoices.
function catalogOpenStatusForm(productId) {
    console.warn('catalogOpenStatusForm no está implementada.', productId);
    alert('La actualización de estado para catálogo aún no está implementada en esta versión.');
}

function catalogSaveStatus() {
    alert('Guardar estado de catálogo aún no está implementado.');
}

function catalogOpenEditForm(productId) {
    console.warn('catalogOpenEditForm no está implementada.', productId);
    alert('La edición completa de catálogo aún no está implementada en esta versión.');
}

function catalogSaveFullEdit() {
    alert('Guardar edición de catálogo aún no está implementado.');
}

// Make initCatalogAdminPage globally accessible if this script is loaded directly
// or if main.js needs to call it.
// This assumes catalog-admin.js is loaded as a regular script, not a module.
window.initCatalogAdminPage = initCatalogAdminPage;
