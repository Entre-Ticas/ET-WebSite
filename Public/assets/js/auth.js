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

    // Itera sobre todos los enlaces de administrador y los muestra o esconde.
    adminLinks.forEach(link => {
        // Usamos 'inline-block' o 'inline' para que se muestren en la barra de navegación.
        link.style.display = session ? 'inline-block' : 'none';
    });

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
    if (getSession()) {
        programarAutoLogout();
        iniciarDeteccionActividad();
        refreshBackendSession(false);
    }
});
