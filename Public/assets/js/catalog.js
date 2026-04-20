// Lógica del Catálogo de Productos
let allProducts = [];

function getDriveThumb(url) {
    if (!url) return '';
    // Regex específica para capturar el ID entre /d/ y /view o el final de la cadena
    const driveMatch = url.match(/(?:\/d\/|id=)([-\w]{25,})/);
    if (driveMatch && driveMatch[1]) {
        // Endpoint de miniaturas oficial de Google Drive
        return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w800`;
    }
    // Si no es un link de Drive pero empieza con http, lo devolvemos tal cual
    return url.startsWith('http') ? url : '';
}

async function loadCatalog() {
    const statusEl = document.getElementById('catalogStatus');
    if (!statusEl) return;

    try {
        // Llamada a la función serverless
        const response = await fetch('/.netlify/functions/catalog');
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Error del servidor: ${response.status}`);
        }

        allProducts = await response.json();

        statusEl.style.display = 'none';
        if (allProducts.length === 0) {
            statusEl.innerHTML = '<p>No se encontraron productos.</p>';
            statusEl.style.display = 'block';
            return;
        }

        renderProducts(allProducts);

    } catch (err) {
        statusEl.innerHTML = `<p class="error-msg">⚠️ Error al cargar: ${err.message}</p>`;
    }
}

function renderProducts(products) {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    grid.innerHTML = '';

    products.forEach(p => {
        const thumbSrc = getDriveThumb(p.img);
        // Si es una imagen de Drive, ajustamos el parámetro 'sz' para alta calidad (1200px) en el modal
        const isDrive = thumbSrc.includes('drive.google.com/thumbnail');
        const fullSrc = isDrive ? thumbSrc.replace('sz=w800', 'sz=w1200') : thumbSrc;

        const stockStatus = (p.stock || "").toString().toLowerCase();
        let badgeClass = 'badge-order';
        let isOutOfStock = false;
        let btnText = '<i class="fab fa-whatsapp"></i> ¡Lo quiero!';
        let waMsg = `Hola! Me interesa:\n*${p.name}*\nTalla: ${p.size}\nPrecio: ${p.price}\nCategoría: ${p.category} 🛍️`;

        if (stockStatus === 'entrega inmediata') badgeClass = 'badge-now';
        if (stockStatus === 'no disponible') {
            badgeClass = 'badge-out';
            isOutOfStock = true;
            btnText = '<i class="fa fa-magic"></i> ¡Consíguemelos!';
            waMsg = `Hola! Vi que están agotados pero deseo unos iguales:\n*${p.name}*`;
        }

        const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waMsg)}`;
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="product-img-wrapper ${isOutOfStock ? 'img-sepia' : ''}" onclick="openModal('${fullSrc}')">
                <img src="${thumbSrc}" alt="${p.name}" loading="lazy" onerror="this.onerror=null; this.src='https://placehold.co/400x400?text=Imagen+no+disponible'">
                <span class="product-badge ${badgeClass}">${p.stock}</span>
            </div>
            <div class="product-info">
                <span class="product-cat">${p.category}</span>
                <p class="product-name">${p.name}</p>
                <p class="product-size">Talla: ${p.size}</p>
                <p class="product-price">₡${p.price}</p>
                <a class="btn-consultar ${isOutOfStock ? 'btn-out-of-stock' : ''}" href="${waLink}" target="_blank">${btnText}</a>
            </div>`;
        grid.appendChild(card);
    });
}

function filterProducts() {
    const q = document.getElementById('searchInput').value.toLowerCase().trim();
    const filtered = allProducts.filter(f => 
        f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
    );
    renderProducts(filtered);
    document.getElementById('noResults').style.display = filtered.length === 0 ? 'block' : 'none';
}

function openModal(src) {
    document.getElementById('modalImg').src = src;
    document.getElementById('imgModal').classList.add('active');
}

function closeModal() {
    document.getElementById('imgModal').classList.remove('active');
}

// Eventos globales para el modal
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });