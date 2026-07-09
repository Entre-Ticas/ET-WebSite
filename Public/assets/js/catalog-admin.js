// Variable para almacenar todos los productos y poder filtrar sobre ella.
let allCatalogProducts = [];

async function loadAdminProducts() {
    const table = document.querySelector('#adminGrid .admin-table');
    const status = document.getElementById('adminStatus');

    if (!table || !status) {
        console.error("No se encontraron elementos de la tabla o estado en el DOM.");
        return;
    }

    table.style.display = 'none'; // Ocultar la tabla mientras se carga
    status.style.display = 'flex'; // Mostrar 'Cargando...'

    try {
        // Llama a una función de Netlify, igual que lo hace tracking-admin.js
        const response = await fetch('/.netlify/functions/catalog-products');

        if (!response.ok) {
            throw new Error(`Error del servidor: ${response.statusText}`);
        }
        const data = await response.json();
        allCatalogProducts = data; // Guardar los datos en la variable global

        await cargarOpcionesDeEstado();

        displayAdminProducts(allCatalogProducts); // Mostrar los productos

    } catch (error) {
        console.error('Error al cargar productos para admin:', error);
        status.innerHTML = '<p>😕 Error al cargar los productos. Intenta de nuevo.</p>';
    } finally {
        status.style.display = 'none'; // Ocultar 'Cargando...'
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

    if (products.length === 0) {
        noResults.style.display = 'block';
        table.style.display = 'none'; // Ocultar la tabla si no hay productos
        return;
    }
    
    noResults.style.display = 'none';
    table.style.display = ''; // Asegurarse de que la tabla sea visible
    
    products.forEach(p => {
        tbody.innerHTML += `
            <tr>
                <td><img src="${p.image_url || 'https://placehold.co/20x20/E19B9D/FFFFFF?text=ET'}" alt="${p.product_name}" class="admin-table-img"></td>
                <td>${p.product_name}</td>
                <td>${p.category}</td>
                <td>₡${p.price ? p.price.toLocaleString('es-CR') : '0'}</td>
                <td><span class="status-dot ${p.is_available ? 'available' : 'unavailable'}"></span> ${p.status_name}</td>
                <td>
                    <button class="admin-btn-icon" onclick="abrirFormEdicionCompleta(${p.id_product})" title="Editar Producto"><i class="fas fa-pencil-alt"></i></button>
                    <button class="admin-btn-icon" onclick="abrirFormEstado(${p.id_product})" title="Actualizar Estado"><i class="fa fa-edit"></i></button>
                </td>
            </tr>
        `;
    });
}

/**
 * Filtra los productos basándose en el input de búsqueda.
 */
function filtrarProductos() {
    const searchTerm = document.getElementById('adminSearchInput').value.toLowerCase();
    const filteredProducts = allCatalogProducts.filter(p =>
        p.product_name.toLowerCase().includes(searchTerm) ||
        p.category.toLowerCase().includes(searchTerm)
    );
    displayAdminProducts(filteredProducts);
}

function abrirFormNuevo() {
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
function volverAlGrid() {
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

        const response = await fetch('/.netlify/functions/catalog-products', {
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

        if (error) {
            throw error;
        }

        mensajeEl.textContent = '✅ ¡Producto guardado con éxito!';
        mensajeEl.style.color = '#28a745';

        setTimeout(() => {
            loadAdminProducts(); 
            volverAlGrid();     
        }, 1500);

    } catch (error) {
        console.error('Error al guardar el producto:', error);
        mensajeEl.textContent = `Error al guardar: ${error.message}`;
        mensajeEl.style.color = 'red';
    }
}

async function cargarOpcionesDeEstado() {
    try {
        const res = await fetch('/.netlify/functions/catalog-status');
        if (!res.ok) throw new Error('No se pudieron cargar los estados.');
        
        const estados = await res.json();
        const options = estados.map(e =>
            `<option value="${e.id}">${e.name}</option>`
        ).join('');

        ['nuevoEstado', 'adminSelectEstado'].forEach(id => {
            const sel = document.getElementById(id);
            if (sel) sel.innerHTML = '<option value="">-- Selecciona --</option>' + options;
        });
    } catch (error) {
        console.error(error.message);
    }
}

function initCatalogAdminPage() {
    // Simplemente llama a la función de carga, que ya no depende de un cliente de Supabase.
    loadAdminProducts();
}

// Make initCatalogAdminPage globally accessible if this script is loaded directly
// or if main.js needs to call it.
// This assumes catalog-admin.js is loaded as a regular script, not a module.
window.initCatalogAdminPage = initCatalogAdminPage;
