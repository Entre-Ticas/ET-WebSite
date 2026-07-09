// Variable para almacenar todos los productos y poder filtrar sobre ella.
let allAdminProducts = [];

/**
 * Función principal para cargar los productos en la página de administración.
 * Llama a la función de Supabase para obtener los datos.
 */
async function loadAdminProducts() {
    const grid = document.getElementById('adminGrid');
    const status = document.getElementById('adminStatus');

    if (!grid || !status) return;

    grid.innerHTML = ''; // Limpiar el grid antes de cargar
    status.style.display = 'flex'; // Mostrar 'Cargando...'

    try {
        // Llama a la función que ya tienes: get_available_products
        const { data, error } = await supabase.rpc('get_available_products');

        if (error) {
            throw error;
        }

        allAdminProducts = data; // Guardar los datos en la variable global
        displayAdminProducts(allAdminProducts); // Mostrar los productos

    } catch (error) {
        console.error('Error al cargar productos para admin:', error);
        status.innerHTML = '<p>😕 Error al cargar los productos. Intenta de nuevo.</p>';
    } finally {
        status.style.display = 'none'; // Ocultar 'Cargando...'
    }
}

/**
 * Muestra los productos en el grid de administración.
 * @param {Array} products - El array de productos a mostrar.
 */
function displayAdminProducts(products) {
    const grid = document.getElementById('adminGrid');
    const noResults = document.getElementById('adminNoResults');
    grid.innerHTML = ''; // Limpiar el grid

    if (products.length === 0) {
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';

    products.forEach(p => {
        const card = `
            <div class="admin-card">
                <img src="${p.image_url || 'https://via.placeholder.com/150'}" alt="${p.product_name}" class="admin-card-img">
                <div class="admin-card-info">
                    <h4 class="admin-card-title">${p.product_name}</h4>
                    <p class="admin-card-details"><strong>Categoría:</strong> ${p.category}</p>
                    <p class="admin-card-details"><strong>Talla:</strong> ${p.size || 'N/A'}</p>
                    <p class="admin-card-details"><strong>Precio:</strong> $${p.price.toFixed(2)}</p>
                    <div class="admin-card-status">
                        <span class="status-dot ${p.is_available ? 'available' : 'unavailable'}"></span>
                        <span>${p.status_name}</span>
                    </div>
                </div>
                <div class="admin-card-actions">
                    <button class="admin-btn-icon" onclick="abrirFormEdicionCompleta(${p.id_product})"><i class="fas fa-pencil-alt"></i></button>
                    <button class="admin-btn-icon" onclick="abrirFormEstado(${p.id_product})"><i class="fa fa-edit"></i></button>
                </div>
            </div>
        `;
        grid.innerHTML += card;
    });
}

/**
 * Filtra los productos basándose en el input de búsqueda.
 */
function filtrarProductos() {
    const searchTerm = document.getElementById('adminSearchInput').value.toLowerCase();
    const filteredProducts = allAdminProducts.filter(p =>
        p.product_name.toLowerCase().includes(searchTerm) ||
        p.category.toLowerCase().includes(searchTerm)
    );
    displayAdminProducts(filteredProducts);
}

/**
 * Initializes the catalog administration page.
 * This function should be called from the main script after Supabase is initialized.
 * It ensures that the Supabase client is available before attempting to load products.
 */
function initCatalogAdminPage() {
    // Check if supabase is defined before attempting to load products
    if (typeof supabase === 'undefined') {
        console.error('Supabase client is not defined. Cannot initialize catalog admin page.');
        const status = document.getElementById('adminStatus');
        if (status) {
            status.innerHTML = '<p>Error: El cliente de Supabase no está configurado. No se pueden cargar los productos.</p>';
            status.style.display = 'block';
        }
        return;
    }
    loadAdminProducts();
}

// Make initCatalogAdminPage globally accessible if this script is loaded directly
// or if main.js needs to call it.
// This assumes catalog-admin.js is loaded as a regular script, not a module.
window.initCatalogAdminPage = initCatalogAdminPage;

// Optional: If you want to automatically load products when the DOM is ready
// AND you are certain that supabase will be defined by then (e.g., main.js loads first)
// document.addEventListener('DOMContentLoaded', initCatalogAdminPage);