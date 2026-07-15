// Lógica principal y navegación del sitio

async function loadHeaderImage() {
    const logoImg = document.querySelector('header .logo');
    if (!logoImg) return;

    try {
        const response = await fetch(`/.netlify/functions/info-image?id=ImagenET`);
        if (!response.ok) return; // Si falla, simplemente se queda la imagen por defecto.

        const { imageUrl } = await response.json();
        if (imageUrl) {
            logoImg.src = imageUrl;
        }
    } catch (error) {
        console.error('Error al cargar la imagen del encabezado:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar links de redes sociales con variables de setup.js
    if (document.getElementById('btnWhatsappFlotante')) {
        document.getElementById('btnWhatsappFlotante').href = `https://wa.me/${WHATSAPP_NUMBER}`;
    }
    if (document.getElementById('btnTiktokFlotante')) {
        document.getElementById('btnTiktokFlotante').href = `https://www.tiktok.com/@${TikTok_user}`;
    }
    if (document.getElementById('btnInstagramFlotante')) {
        document.getElementById('btnInstagramFlotante').href = `https://www.instagram.com/${Instagram_user}`;
    }
    if (document.getElementById('btnFacebookFlotante')) {
        document.getElementById('btnFacebookFlotante').href = `https://www.facebook.com/${Facebook_user}`;
    }

    loadHeaderImage();

    const handleRouting = () => {
        const parts = window.location.pathname.split('/').filter(Boolean); // ej: ['admin', 'catalog']
        let pageToLoad = parts[0] || 'home'; // Si no hay nada, vamos a home.
        let paramToLoad = parts[1] || null;

        // Manejo especial para rutas anidadas como /admin/catalog
        if (pageToLoad === 'admin' && parts.length > 1) {
            pageToLoad = `admin/${parts[1]}`; // Construye la ruta completa: 'admin/catalog'
            paramToLoad = parts[2] || null; // El siguiente sería el parámetro
        }

        // Si estamos en la página de inicio, no hacemos nada para evitar el bucle de recarga.
        // El contenido de la home ya está en index.html.
        if (pageToLoad !== 'home') {
            loadPage(pageToLoad, paramToLoad);
        }
    };

    handleRouting();

    window.addEventListener('popstate', handleRouting);

    // Cerrar el menú social si se hace clic fuera de él (en cualquier otro sector)
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('socialMenu');
        const links = document.getElementById('socialLinks');
        if (menu && links && links.classList.contains('active') && !menu.contains(e.target)) {
            toggleSocialMenu();
        }
    });
});

function toggleSocialMenu() {
    const links = document.getElementById('socialLinks');
    const collage = document.getElementById('btnToggleCollage');
    const closeIcon = document.getElementById('btnToggleClose');
    
    links.classList.toggle('active');
    
    if (links.classList.contains('active')) {
        collage.style.display = 'none';
        closeIcon.style.display = 'block';
    } else {
        collage.style.display = 'grid';
        closeIcon.style.display = 'none';
    }
}

async function loadPage(page, param = null) {
    const container = document.getElementById('content-area');
    if (!container) return;
    
    const socialLinks = document.getElementById('socialLinks');
    if (socialLinks && socialLinks.classList.contains('active')) {
        toggleSocialMenu();
    }

    // Efecto de salida (hace la pantalla transparente temporalmente)
    container.classList.add('fade-out');
    
    // --- INICIO: LÓGICA DE SEGURIDAD ---
    // Lista de rutas que requieren que el usuario esté autenticado.
    const protectedRoutes = ['admin/tracking', 'admin/catalog', 'admin/order_items'];
    // Verificamos si la página solicitada es protegida Y si el usuario NO tiene una sesión activa.
    // La función getSession() ya existe en auth.js y nos dice si hay un token válido.
    if (protectedRoutes.includes(page) && !getSession()) {
        console.warn(`Acceso no autorizado a la ruta protegida '${page}'. Redirigiendo al inicio.`);
        alert('Debes iniciar sesión para acceder a esta página.');
        
        // Redirigimos a la página de inicio de forma segura.
        window.location.href = '/';
        return; // Detenemos la ejecución para no cargar la página de admin.
    }
    // --- FIN: LÓGICA DE SEGURIDAD ---

    setTimeout(async () => {
        try {
            if (page === 'home') {
                history.pushState({}, '', '/');
                const response = await fetch('/index.html');
                container.innerHTML = (await response.text()).match(/<div id="content-area">([\s\S]*)<\/div>/)[1];
                return;
            }

            // Actualizar URL limpia sin recargar
            const cleanPath = param ? `/${page}/${param}` : `/${page}`;
            history.pushState({ page, param }, '', cleanPath);

            // Importante: Verifica que las carpetas en Netlify tengan estas mayúsculas exactas
            const routes = {
                'calc': 'Calc/calc.html',
                'catalog': 'Catalog/catalog.html',
                'tracking': 'Tracking/tracking.html',
                'admin/tracking': 'admin/tracking-admin.html',
                'admin/catalog': 'admin/catalog-admin.html',
                'admin/order_items': 'admin/order_items-admin.html',
                'info': 'InformationImg/info.html',
                'informacion': 'InformationImg/infoImg.html'
            };
            const url = routes[page];
            if (!url) {
                console.error(`La página '${page}' no está definida en las rutas.`);
                throw new Error("Página no definida");
            }
            
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Error ${response.status}: No se encontró ${url}`);
            
            let html = await response.text();

            container.innerHTML = html;

            if (page === 'calc') {
                // La función init() ya se llama dentro del calc.html revertido
                if (typeof init === 'function') init();
            } else if (page === 'catalog' && typeof loadCatalog === 'function') {
                loadCatalog();
            } else if (page === 'tracking' && typeof buscarTracking === 'function' && param) {
                const input = document.getElementById('trackingNum');
                if (input) { input.value = param; buscarTracking(); }
            } else if (page === 'informacion' && typeof loadInfo === 'function' && param) {
                loadInfo(param);
            } else if (page === 'admin/tracking' && typeof loadAdmin === 'function') {
                loadAdmin();
            } else if (page === 'admin/catalog' && typeof window.initCatalogAdminPage === 'function') {
                // La inicialización se maneja dentro del propio HTML de catalog-admin
                // por lo que no se necesita una llamada explícita aquí.
                // window.initCatalogAdminPage();
            } else if (page === 'admin/order_items' && typeof window.initOrderItemsAdminPage === 'function') {
                window.initOrderItemsAdminPage();
            }

        } catch (error) {
            console.error("Error detallado:", error);
            container.innerHTML = `<h2>Error al cargar la sección.</h2>
                                   <p style="color:red;">Detalle: ${error.message}</p>`;
        }
        finally {
            // Quitar la transparencia siempre, incluso si hubo error
            container.classList.remove('fade-out');
            window.scrollTo(0, 0);
        }
    }, 300);
}

/**
 * Función global para copiar el enlace de rastreo al portapapeles
 * @param {HTMLElement} btn - El botón que disparó el evento
 * @param {string} guia - El número de guía
 */
async function copiarGuia(btn, guia) {
    if (!guia || guia === '—') return;
    try {
        const url = `${window.location.origin}/tracking/${guia}`;
        await navigator.clipboard.writeText(url);
        
        const icon = btn.querySelector('i');
        const originalClass = icon.className;
        icon.className = 'fas fa-check';
        btn.style.color = '#25d366';
        
        setTimeout(() => {
            icon.className = originalClass;
            btn.style.color = '';
        }, 2000);
    } catch (err) {
        console.error('Error al copiar:', err);
    }
}

window.loadPage = loadPage;