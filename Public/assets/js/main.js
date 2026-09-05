// Lógica principal y navegación del sitio

let homeContentCache = null;
let autofillObserver = null;
const loadedScriptPromises = new Map();

function ensureAutofillTrap(enabled) {
    const existing = document.getElementById('browserAutofillTrap');

    if (!enabled) {
        if (existing) existing.remove();
        return;
    }

    if (existing) return;

    const trap = document.createElement('div');
    trap.id = 'browserAutofillTrap';
    trap.setAttribute('aria-hidden', 'true');
    trap.style.position = 'fixed';
    trap.style.top = '-9999px';
    trap.style.left = '-9999px';
    trap.style.width = '1px';
    trap.style.height = '1px';
    trap.style.opacity = '0';
    trap.style.pointerEvents = 'none';

    trap.innerHTML = [
        '<input type="text" name="username" autocomplete="username" tabindex="-1">',
        '<input type="password" name="password" autocomplete="current-password" tabindex="-1">'
    ].join('');

    document.body.appendChild(trap);
}

function applyGlobalInputHardening(scope = document) {
    const root = scope && typeof scope.querySelectorAll === 'function' ? scope : document;
    const inputs = root.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"], input[type="search"]');

    inputs.forEach((input, index) => {
        if (!input) return;
        if (input.type === 'hidden' || input.type === 'file') return;
        if (input.closest('#loginModal')) return;
        if (input.dataset.allowAutofill === 'true') return;

        const inputType = (input.type || '').toLowerCase();
        const inputId = (input.id || '').toLowerCase();
        const isSearchField = inputType === 'search' || inputId.includes('search');

        input.setAttribute('autocomplete', isSearchField ? 'off' : 'new-password');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('spellcheck', 'false');
        input.setAttribute('aria-autocomplete', 'none');
        input.setAttribute('data-lpignore', 'true');
        input.setAttribute('data-1p-ignore', 'true');

        if (!input.getAttribute('name')) {
            const fallbackName = input.id ? `field_${input.id}` : `field_${index}`;
            input.setAttribute('name', fallbackName);
        }

        if (input.dataset.autofillGuardApplied !== 'true') {
            input.readOnly = true;
            const unlockInput = () => {
                input.readOnly = false;
            };

            input.addEventListener('focus', unlockInput, { once: true });
            input.addEventListener('pointerdown', unlockInput, { once: true });
            input.dataset.autofillGuardApplied = 'true';
        }
    });
}

function initializeAutofillObserver() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea || autofillObserver) return;

    autofillObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (!(node instanceof HTMLElement)) return;

                if (node.matches?.('input[type="text"], input[type="tel"], input[type="number"], input[type="search"]')) {
                    applyGlobalInputHardening(node.parentElement || node);
                    return;
                }

                applyGlobalInputHardening(node);
            });
        });
    });

    autofillObserver.observe(contentArea, { childList: true, subtree: true });
}

window.applyGlobalInputHardening = applyGlobalInputHardening;

function getVisibleNavLinkCount() {
    const nav = document.querySelector('nav');
    if (!nav) return 0;

    return Array.from(nav.querySelectorAll('a')).filter((link) => {
        const style = window.getComputedStyle(link);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }).length;
}

function pickMobileNavColumns(count) {
    const candidates = [3, 4];
    let bestCols = 3;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const cols of candidates) {
        const rows = Math.ceil(count / cols);
        const remainder = count % cols;
        const orphanPenalty = remainder === 1 ? 100 : 0;
        const tooManyRowsPenalty = rows > 3 ? (rows - 3) * 10 : 0;
        const tieBreaker = cols === 4 ? 1 : 0;
        const score = orphanPenalty + tooManyRowsPenalty + tieBreaker;

        if (score < bestScore) {
            bestScore = score;
            bestCols = cols;
        }
    }

    return bestCols;
}

function updateMobileNavColumns() {
    const nav = document.querySelector('nav');
    if (!nav) return;

    const visibleCount = getVisibleNavLinkCount();
    const cols = pickMobileNavColumns(visibleCount || 1);
    nav.style.setProperty('--mobile-nav-cols', String(cols));
}

function loadScriptOnce(src) {
    if (document.querySelector(`script[src="${src}"]`)) {
        return Promise.resolve();
    }

    if (loadedScriptPromises.has(src)) {
        return loadedScriptPromises.get(src);
    }

    const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
        document.head.appendChild(script);
    });

    loadedScriptPromises.set(src, promise);
    return promise;
}

function getScriptsForPage(page) {
    const scriptMap = {
        catalog: ['assets/js/catalog.js'],
        tracking: ['assets/js/tracking.js'],
        info: ['assets/js/infoImg.js'],
        informacion: ['assets/js/infoImg.js'],
        'admin/tracking': ['assets/js/tracking-admin.js'],
        'admin/catalog': ['assets/js/catalog-admin.js'],
        'admin/order': ['assets/js/order_items-admin.js'],
        'admin/invoices': ['assets/js/invoices-admin.js'],
        'admin/payments': ['assets/js/payments-admin.js'],
        invoice: ['assets/js/invoice.js']
    };

    return scriptMap[page] || [];
}

document.addEventListener('DOMContentLoaded', () => {
    // Guardar el contenido original de HOME antes de cualquier navegación
    const container = document.getElementById('content-area');
    if (container) {
        homeContentCache = container.innerHTML;
    }

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

    updateMobileNavColumns();
    initializeAutofillObserver();
    applyGlobalInputHardening(document.getElementById('content-area') || document);

    const nav = document.querySelector('nav');
    if (nav) {
        const observer = new MutationObserver(() => {
            updateMobileNavColumns();
        });
        observer.observe(nav, {
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });
    }

    window.addEventListener('resize', updateMobileNavColumns);

    const handleRouting = () => {
        const parts = window.location.pathname.split('/').filter(Boolean); // ej: ['admin', 'catalog']
        let pageToLoad = parts[0] || 'home'; // Si no hay nada, vamos a home.
        let paramToLoad = parts[1] || null;

        // Manejo especial para rutas anidadas como /admin/catalog
        if (pageToLoad === 'admin' && parts.length > 1) {
            pageToLoad = `admin/${parts[1]}`; // Construye la ruta completa: 'admin/catalog'
            paramToLoad = parts[2] || null; // El siguiente sería el parámetro
        }

        if (paramToLoad) {
            try {
                paramToLoad = decodeURIComponent(paramToLoad);
            } catch (_error) {
                // Mantener valor original si no es un URI componente válido.
            }
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

        // --- LÓGICA GLOBAL PARA CERRAR MODAL DE IMAGEN ---
        // Si se hace clic en el fondo oscuro del modal...
        if (e.target.id === 'imgModal') {
            closeImageModal();
        }
        // Si se hace clic en el botón de cerrar (o en el ícono dentro de él)...
        if (e.target.closest('.close-btn')) {
            closeImageModal();
        }
        // --- FIN LÓGICA GLOBAL ---

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
    const protectedRoutes = ['admin/tracking', 'admin/catalog', 'admin/order', 'admin/invoices', 'admin/payments'];
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
            const scriptsToLoad = getScriptsForPage(page);
            if (scriptsToLoad.length > 0) {
                await Promise.all(scriptsToLoad.map((src) => loadScriptOnce(src)));
            }

            if (page === 'home') {
                history.pushState({}, '', '/');
                container.innerHTML = homeContentCache || (await fetch('/index.html').then(r => r.text())).match(/<div id="content-area">([\s\S]*)<\/div>/)[1];
                ensureAutofillTrap(false);
                applyGlobalInputHardening(container);
                
                container.classList.remove('fade-out');
                window.scrollTo(0, 0);
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
                'admin/order': 'admin/order_items-admin.html', // Nueva ruta estándar
                'admin/invoices': 'admin/invoices-admin.html',
                'admin/payments': 'admin/payments-admin.html',
                'invoice': 'invoice/invoice.html',
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
            ensureAutofillTrap(page !== 'home');
            applyGlobalInputHardening(container);

            // Ejecutamos la limpieza en el siguiente ciclo de eventos,
            // asegurando que el DOM se haya actualizado.
            setTimeout(() => cleanupLegacyModalEvents(), 0);

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
            // --- INICIALIZACIÓN DE PÁGINAS DE ADMINISTRACIÓN ---
            } else if (page === 'admin/tracking' && typeof window.initTrackingAdminPage === 'function') {
                window.initTrackingAdminPage();
            } else if (page === 'admin/catalog' && typeof window.initCatalogAdminPage === 'function') {
                window.initCatalogAdminPage();
            } else if (page === 'admin/order' && typeof window.initOrderItemsAdminPage === 'function') {
                window.initOrderItemsAdminPage();
            } else if (page === 'admin/invoices' && typeof window.initInvoicesAdminPage === 'function') {
                window.initInvoicesAdminPage();
            } else if (page === 'invoice' && typeof window.initInvoicePage === 'function' && param) {
                window.initInvoicePage(param);
            } else if (page === 'admin/payments' && typeof window.initPaymentsAdminPage === 'function') {
                window.initPaymentsAdminPage();
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

/**
 * Abre el modal para mostrar una imagen en grande.
 * @param {string} src - La URL de la imagen a mostrar.
 */
function openImageModal(src) {
    if (!src) return; // No hacer nada si no hay imagen
    const modal = document.getElementById('imgModal');
    const modalImg = document.getElementById('modalImg');
    if (modal && modalImg) {
        modalImg.src = src;
        modal.classList.add('active');
    }
}

/** Cierra el modal de la imagen. */
function closeImageModal() {
    document.getElementById('imgModal')?.classList.remove('active');
}

/**
 * Busca y elimina los atributos onclick obsoletos del modal de imagen
 * para prevenir errores en la consola. La lógica de cierre real
 * está centralizada en el event listener global de main.js.
 */
function cleanupLegacyModalEvents() {
    const modalOverlay = document.getElementById('imgModal');
    const modalCloseBtn = modalOverlay?.querySelector('.close-btn');

    if (modalOverlay) modalOverlay.removeAttribute('onclick');
    if (modalCloseBtn) modalCloseBtn.removeAttribute('onclick');
}

/**
 * Abre un modal genérico con contenido personalizado.
 * @param {string} title - El título para el encabezado del modal.
 * @param {string} bodyHtml - El contenido HTML para el cuerpo del modal.
 * @param {string} footerHtml - El HTML para los botones del pie de página.
 */
function openGenericModal(title, bodyHtml, footerHtml = '') {
    document.getElementById('genericModalTitle').textContent = title;
    document.getElementById('genericModalBody').innerHTML = bodyHtml;
    
    // Si se provee un footer personalizado, lo usamos.
    // Si no, la función no hace nada y se usan los botones por defecto del HTML.
    if (footerHtml !== '') {
        document.getElementById('genericModalFooter').innerHTML = footerHtml;
    }

    document.getElementById('genericModal').classList.add('active');
}

/** Cierra el modal genérico. */
function closeGenericModal() {
    document.getElementById('genericModal').classList.remove('active');
}


window.loadPage = loadPage;