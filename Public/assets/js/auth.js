// Autenticación

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

    } catch {
        errorEl.innerHTML = 'Error de conexión.';
    }
}

function cerrarSesion() {
    localStorage.removeItem('et_token');
    localStorage.removeItem('et_expiry');
    localStorage.removeItem('et_user');

    // Detenemos el temporizador de auto-logout para evitar alertas inoportunas.
    clearTimeout(_autoLogoutTimer);

    actualizarNavUser();
    loadPage('home'); // Usamos la función global para navegar al inicio.
}

const INACTIVIDAD_MS = 60 * 60 * 1000; // 1 hora sin actividad
const DEBOUNCE_MS    = 30 * 1000;       // reiniciar timer máximo cada 30s

let _autoLogoutTimer = null;
let _debounceTimer   = null;

function programarAutoLogout() {
    clearTimeout(_autoLogoutTimer);
    if (!getSession()) return;
    _autoLogoutTimer = setTimeout(() => {
        cerrarSesion();
        alert('Tu sesión expiró por inactividad. Iniciá sesión nuevamente.');
    }, INACTIVIDAD_MS);
}

function onActividad() {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(programarAutoLogout, DEBOUNCE_MS);
}

function iniciarDeteccionActividad() {
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evento => {
        document.addEventListener(evento, onActividad, { passive: true });
    });
}

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', () => {
    actualizarNavUser();
    if (getSession()) {
        programarAutoLogout();
        iniciarDeteccionActividad();
    }
});
