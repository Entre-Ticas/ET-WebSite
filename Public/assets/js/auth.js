// Autenticación

const INACTIVIDAD_MS = 20 * 60 * 1000;
const DEBOUNCE_MS = 30 * 1000; // reiniciar timer máximo cada 30s
const SESSION_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refrescar si faltan <=5 min
const SESSION_REFRESH_MIN_ATTEMPT_GAP_MS = 20 * 1000; // evita ráfagas de refresh

let _autoLogoutTimer = null;
let _debounceTimer = null;
let _activityListenersAttached = false;
let _refreshInFlight = null;
let _lastRefreshAttemptAt = 0;

function getSession() {
    const token  = localStorage.getItem('et_token');
    const expiry = parseInt(localStorage.getItem('et_expiry') || '0');
    if (!token || Date.now() > expiry) {
        localStorage.removeItem('et_token');
        localStorage.removeItem('et_expiry');
        localStorage.removeItem('et_user');
        return null;
    }

    return { token, user: localStorage.getItem('et_user') };
}

async function refreshBackendSession(force = false) {
    const token = localStorage.getItem('et_token');
    const expiry = parseInt(localStorage.getItem('et_expiry') || '0', 10);

    if (!token || !expiry) return null;
    if (_refreshInFlight) return _refreshInFlight;

    const now = Date.now();
    const msToExpiry = expiry - now;
    const nearExpiry = msToExpiry <= SESSION_REFRESH_BUFFER_MS;

    if (!force && !nearExpiry) {
        return null;
    }

    if (!force && (now - _lastRefreshAttemptAt) < SESSION_REFRESH_MIN_ATTEMPT_GAP_MS) {
        return null;
    }

    _lastRefreshAttemptAt = now;

    _refreshInFlight = (async () => {
        try {
            const response = await fetch('/.netlify/functions/session-refresh', {
                method: 'POST',
                headers: { 'x-admin-token': token }
            });

            if (response.status === 401) {
                cerrarSesion();
                alert('Tu sesión expiró. Iniciá sesión nuevamente.');
                return null;
            }

            if (!response.ok) {
                return null;
            }

            const data = await response.json();
            if (!data?.token || !data?.expiry) {
                return null;
            }

            localStorage.setItem('et_token', data.token);
            localStorage.setItem('et_expiry', String(data.expiry));
            programarAutoLogout();
            return data;
        } catch {
            return null;
        } finally {
            _refreshInFlight = null;
        }
    })();

    return _refreshInFlight;
}

function actualizarNavUser() {
    const session  = getSession();
    const adminLinks = document.querySelectorAll('.navAdminLink');
    const floatBtn = document.getElementById('floatingLoginBtn');

    // Si no hay sesión admin, removemos enlaces del DOM para que no queden expuestos en inspector.
    if (!session) {
        adminLinks.forEach(link => link.remove());
    } else {
        adminLinks.forEach(link => {
            link.style.display = 'inline-block';
        });
    }

    if (floatBtn) {
        if (session) {
            floatBtn.title   = `Cerrar sesión (${session.user})`;
            floatBtn.onclick = cerrarSesion;
            floatBtn.innerHTML = `<i class="fas fa-user-check" style="font-size:1.2rem; color:var(--pink-accent, #E19B9D);"></i>`;
        } else {
            floatBtn.title   = 'Iniciar sesión';
            floatBtn.onclick = abrirLoginModal;
            floatBtn.innerHTML = `<i class="fas fa-user" style="font-size:1.2rem; color:var(--brown-text, #5a3e2b);"></i>`;
        }
    }
}

function getCatalogPublicUrl(publicToken) {
    const origin = window.location && window.location.origin ? window.location.origin : 'https://entreticas.netlify.app';
    return `${origin}/StoreCatalog/${encodeURIComponent(publicToken || '')}`;
}

function formatCatalogCountdown(expiresAt) {
    if (!expiresAt) return '00:00';

    const expiryMs = new Date(expiresAt).getTime();
    const diffMs = Math.max(expiryMs - Date.now(), 0);
    const totalSeconds = Math.ceil(diffMs / 1000);

    if (totalSeconds <= 0) return '00:00';

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateCatalogCountdowns() {
    const countdownEls = document.querySelectorAll('.catalog-nav-countdown');
    countdownEls.forEach((el) => {
        const expiresAt = el.dataset.expiresAt;
        if (!expiresAt) {
            el.textContent = '00:00';
            return;
        }
        el.textContent = formatCatalogCountdown(expiresAt);
    });
}

function renderCatalogNavButton(activeStores = []) {
    const container = document.getElementById('catalogNavContainer');
    if (!container) return;

    const validStores = (activeStores || [])
        .filter((store) => store && store.public_token && store.status === 'active' && store.expires_at)
        .sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime())
        .slice(0, 3);

    if (!validStores.length) {
        container.innerHTML = '<a onclick="loadPage(\'catalog\')">Catálogo</a>';
        return;
    }

    const storeItems = validStores.map((store) => {
        const name = (store.nombre_tienda || 'Tienda').trim() || 'Tienda';
        const publicUrl = getCatalogPublicUrl(store.public_token);
        const countdown = formatCatalogCountdown(store.expires_at);
        return `
            <a href="${publicUrl}" class="catalog-nav-item" data-store-id="${store.id_store || store.public_token}" onclick="event.preventDefault(); window.location.href='${publicUrl}';">
                <span class="catalog-nav-store-name">Tienda ${name}</span>
                <span class="catalog-nav-countdown" data-expires-at="${store.expires_at}">${countdown}</span>
            </a>
        `;
    }).join('');

    const defaultUrl = 'javascript:void(0)';
    container.innerHTML = `
        <div class="catalog-nav-dropdown">
            <button type="button" class="catalog-nav-trigger" onclick="this.parentElement.classList.toggle('open'); this.setAttribute('aria-expanded', String(this.parentElement.classList.contains('open')));" aria-expanded="false">
                <span>Catálogo</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="catalog-nav-menu">
                <a href="${defaultUrl}" class="catalog-nav-option" onclick="event.preventDefault(); loadPage('catalog');">
                    <span>Venta Inmediata</span>
                </a>
                ${storeItems}
            </div>
        </div>
    `;
}

async function fetchActiveCatalogStores() {
    try {
        const response = await fetch('/.netlify/functions/store-admin?action=list-active-stores', { cache: 'no-store' });
        if (response.ok) {
            const data = await response.json().catch(() => ({}));
            const stores = Array.isArray(data.stores) ? data.stores : [];
            if (stores.length) {
                return stores;
            }
        }
    } catch (error) {
        console.warn('No se pudo cargar la lista pública de tiendas activas.', error);
    }

    const session = getSession();
    if (!session) return [];

    try {
        const response = await fetch('/.netlify/functions/store-admin?action=list-stores', {
            method: 'GET',
            headers: { 'x-admin-token': session.token }
        });
        if (!response.ok) return [];
        const data = await response.json().catch(() => ({}));
        const stores = Array.isArray(data.stores) ? data.stores : [];
        return stores.filter((store) => store && store.status === 'active' && store.public_token && store.expires_at);
    } catch (error) {
        console.warn('No se pudo cargar la lista de tiendas activas como admin.', error);
        return [];
    }
}

async function refreshCatalogNavState() {
    const stores = await fetchActiveCatalogStores();
    renderCatalogNavButton(stores);
    updateCatalogCountdowns();
}

document.addEventListener('click', (event) => {
    const dropdown = event.target.closest('.catalog-nav-dropdown');
    const allDropdowns = document.querySelectorAll('.catalog-nav-dropdown');
    allDropdowns.forEach((item) => {
        if (item !== dropdown) item.classList.remove('open');
    });
});

function abrirLoginModal() {
    const modal = document.getElementById('loginModal');
    modal.style.display = 'flex';
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').innerHTML = '';
}

function cerrarLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
}

async function iniciarSesion() {
    const user     = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl  = document.getElementById('loginError');

    if (!user || !password) { errorEl.innerHTML = 'Completa todos los campos.'; return; }
    errorEl.innerHTML = 'Verificando...';

    try {
        const response = await fetch('/.netlify/functions/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user, password })
        });

        const data = await response.json();

        if (!response.ok) { errorEl.innerHTML = data.error || 'Credenciales incorrectas.'; return; }

        localStorage.setItem('et_token',  data.token);
        localStorage.setItem('et_expiry', data.expiry);
        localStorage.setItem('et_user',   data.name || data.user);

        cerrarLoginModal();
        actualizarNavUser();
        programarAutoLogout();
        iniciarDeteccionActividad();
        await refreshBackendSession(true);
        window.location.reload();

    } catch {
        errorEl.innerHTML = 'Error de conexión.';
    }
}

function cerrarSesion() {
    localStorage.removeItem('et_token');
    localStorage.removeItem('et_expiry');
    localStorage.removeItem('et_user');
    _lastRefreshAttemptAt = 0;

    // Detenemos el temporizador de auto-logout para evitar alertas inoportunas.
    clearTimeout(_autoLogoutTimer);

    actualizarNavUser();
    loadPage('home'); // Usamos la función global para navegar al inicio.
}

function programarAutoLogout() {
    clearTimeout(_autoLogoutTimer);
    if (!getSession()) return;
    _autoLogoutTimer = setTimeout(() => {
        cerrarSesion();
        alert('Tu sesión expiró por inactividad. Iniciá sesión nuevamente.');
    }, INACTIVIDAD_MS);
}

function onActividad() {
    if (!getSession()) return;

    refreshBackendSession(false);
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(programarAutoLogout, DEBOUNCE_MS);
}

function iniciarDeteccionActividad() {
    if (_activityListenersAttached) return;

    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evento => {
        document.addEventListener(evento, onActividad, { passive: true });
    });

    _activityListenersAttached = true;
}

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', () => {
    actualizarNavUser();
    refreshCatalogNavState();
    setInterval(updateCatalogCountdowns, 1000);
    if (getSession()) {
        programarAutoLogout();
        iniciarDeteccionActividad();
        refreshBackendSession(false);
    }
});
