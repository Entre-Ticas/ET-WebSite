// Lógica principal y navegación del sitio
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

    // Routing basado en pathname: /tracking/qwerty → page=tracking, param=qwerty
    const handleRouting = () => {
        const parts = window.location.pathname.split('/').filter(Boolean);
        const pageName = parts[0] || null;
        const param    = parts[1] || null;
        if (pageName) loadPage(pageName, param);
    };

    // Ejecutar al cargar la página
    handleRouting();

    // Escuchar navegación con botones atrás/adelante del browser
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
    
    // Colapsar el menú social si está abierto al cambiar de página
    const socialLinks = document.getElementById('socialLinks');
    if (socialLinks && socialLinks.classList.contains('active')) {
        toggleSocialMenu();
    }

    // Efecto de salida (hace la pantalla transparente temporalmente)
    container.classList.add('fade-out');
    
    setTimeout(async () => {
        try {
            if (page === 'home') {
                history.pushState({}, '', '/');
                location.reload();
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
                'admin': 'Tracking/tracking-admin.html'
            };

            const url = routes[page];
            if (!url) throw new Error("Página no definida");

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Error ${response.status}: No se encontró ${url}`);
            
            const html = await response.text();
            container.innerHTML = html;

            if (page === 'calc') {
                // La función init() ya se llama dentro del calc.html revertido
                if (typeof init === 'function') init();
            } else if (page === 'catalog' && typeof loadCatalog === 'function') {
                loadCatalog();
            } else if (page === 'tracking' && typeof buscarTracking === 'function' && param) {
                const input = document.getElementById('trackingNum');
                if (input) { input.value = param; buscarTracking(); }
            } else if (page === 'admin' && typeof loadAdmin === 'function') {
                loadAdmin();
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