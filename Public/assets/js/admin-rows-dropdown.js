const adminRowsPerPageDropdownRegistry = new Map();
let adminRowsPerPageDropdownListenersInstalled = false;

function capitalizeAdminRowsPerPageName(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function getAdminRowsPerPageDropdownConfig(name) {
    return adminRowsPerPageDropdownRegistry.get(name) || null;
}

function getAdminRowsPerPageDropdownElements(config) {
    return {
        dropdown: document.getElementById(config.dropdownId),
        trigger: document.getElementById(config.triggerId),
        menu: document.getElementById(config.menuId),
        label: document.getElementById(config.labelId),
        selector: document.getElementById(config.selectorId)
    };
}

function closeAdminRowsPerPageDropdown(name) {
    const config = getAdminRowsPerPageDropdownConfig(name);
    if (!config) return;

    const { dropdown, trigger, menu } = getAdminRowsPerPageDropdownElements(config);
    if (!dropdown || !trigger) return;

    dropdown.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');

    if (menu) {
        menu.style.top = '';
        menu.style.left = '';
        menu.style.right = '';
        menu.style.minWidth = '';
    }
}

function positionAdminRowsPerPageDropdownMenu(name) {
    const config = getAdminRowsPerPageDropdownConfig(name);
    if (!config) return;

    const { dropdown, trigger, menu } = getAdminRowsPerPageDropdownElements(config);
    if (!dropdown || !trigger || !menu || !dropdown.classList.contains('open')) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;

    menu.style.minWidth = `${Math.max(88, Math.round(rect.width))}px`;
    menu.style.right = 'auto';

    const menuWidth = menu.offsetWidth || Math.max(88, Math.round(rect.width));
    const menuHeight = menu.offsetHeight || 180;

    let top = rect.bottom + 6;
    if (top + menuHeight > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, rect.top - menuHeight - 6);
    }

    let left = rect.left - menuWidth - 6;
    if (left < viewportPadding) {
        left = Math.min(window.innerWidth - viewportPadding - menuWidth, rect.left);
    }
    if (left < viewportPadding) {
        left = viewportPadding;
    }
    if (left + menuWidth > window.innerWidth - viewportPadding) {
        left = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
    }

    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
}

function syncAdminRowsPerPageDropdown(name) {
    const config = getAdminRowsPerPageDropdownConfig(name);
    if (!config) return;

    const { label, menu, selector } = getAdminRowsPerPageDropdownElements(config);
    if (!label || !menu || !selector) return;

    const currentValue = String(selector.value || (config.getValue?.() ?? ''));
    const selectedOption = selector.querySelector(`option[value="${currentValue}"]`);
    label.textContent = selectedOption ? selectedOption.textContent : currentValue;

    menu.querySelectorAll('button[data-value]').forEach((button) => {
        const isActive = button.getAttribute('data-value') === currentValue;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
}

function toggleAdminRowsPerPageDropdown(name, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const config = getAdminRowsPerPageDropdownConfig(name);
    if (!config) return;

    const { dropdown, trigger } = getAdminRowsPerPageDropdownElements(config);
    if (!dropdown || !trigger) return;

    const shouldOpen = !dropdown.classList.contains('open');
    closeAdminRowsPerPageDropdown(name);

    if (shouldOpen) {
        dropdown.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(() => positionAdminRowsPerPageDropdownMenu(name));
    }
}

function selectAdminRowsPerPageDropdown(name, value) {
    const config = getAdminRowsPerPageDropdownConfig(name);
    if (!config) return;

    const { selector } = getAdminRowsPerPageDropdownElements(config);
    if (!selector) return;

    selector.value = String(value);
    syncAdminRowsPerPageDropdown(name);
    closeAdminRowsPerPageDropdown(name);
    if (typeof config.onSelect === 'function') {
        config.onSelect(value);
    }
}

function installAdminRowsPerPageDropdownListeners() {
    if (adminRowsPerPageDropdownListenersInstalled) return;
    adminRowsPerPageDropdownListenersInstalled = true;

    document.addEventListener('click', (event) => {
        adminRowsPerPageDropdownRegistry.forEach((config, name) => {
            const { dropdown } = getAdminRowsPerPageDropdownElements(config);
            if (!dropdown) return;
            if (!dropdown.contains(event.target)) {
                closeAdminRowsPerPageDropdown(name);
            }
        });
    });

    window.addEventListener('resize', () => {
        adminRowsPerPageDropdownRegistry.forEach((_config, name) => {
            positionAdminRowsPerPageDropdownMenu(name);
        });
    });

    window.addEventListener('scroll', () => {
        adminRowsPerPageDropdownRegistry.forEach((_config, name) => {
            positionAdminRowsPerPageDropdownMenu(name);
        });
    }, true);
}

function registerAdminRowsPerPageDropdown(config) {
    if (!config || !config.name) {
        throw new Error('registerAdminRowsPerPageDropdown requires a name.');
    }

    adminRowsPerPageDropdownRegistry.set(config.name, config);
    installAdminRowsPerPageDropdownListeners();

    const toggleName = config.toggleFnName || `toggle${capitalizeAdminRowsPerPageName(config.name)}RowsPerPageDropdown`;
    const selectName = config.selectFnName || `select${capitalizeAdminRowsPerPageName(config.name)}RowsPerPage`;

    window[toggleName] = (event) => toggleAdminRowsPerPageDropdown(config.name, event);
    window[selectName] = (value) => selectAdminRowsPerPageDropdown(config.name, value);

    syncAdminRowsPerPageDropdown(config.name);
}

window.registerAdminRowsPerPageDropdown = registerAdminRowsPerPageDropdown;
window.syncAdminRowsPerPageDropdown = syncAdminRowsPerPageDropdown;
window.closeAdminRowsPerPageDropdown = closeAdminRowsPerPageDropdown;
window.positionAdminRowsPerPageDropdownMenu = positionAdminRowsPerPageDropdownMenu;
window.toggleAdminRowsPerPageDropdown = toggleAdminRowsPerPageDropdown;
window.selectAdminRowsPerPageDropdown = selectAdminRowsPerPageDropdown;

function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(text);
    }

    return new Promise((resolve, reject) => {
        const tempInput = document.createElement('input');
        tempInput.type = 'text';
        tempInput.value = text;
        tempInput.setAttribute('readonly', 'readonly');
        tempInput.style.position = 'fixed';
        tempInput.style.opacity = '0';
        tempInput.style.pointerEvents = 'none';

        document.body.appendChild(tempInput);
        tempInput.focus();
        tempInput.select();
        tempInput.setSelectionRange(0, tempInput.value.length);

        const copied = document.execCommand('copy');
        document.body.removeChild(tempInput);

        if (copied) {
            resolve();
            return;
        }

        reject(new Error('Tu dispositivo no permitió copiar el link.'));
    });
}

async function getInvoicePublicRef(invoiceId, missingMessage = 'No se encontró una referencia válida para la factura.') {
    if (!invoiceId) {
        throw new Error(missingMessage);
    }

    const session = typeof getSession === 'function' ? getSession() : null;
    if (!session) throw new Error('Sesión no válida.');

    const response = await fetch(`/.netlify/functions/invoices?id=${invoiceId}`, {
        headers: { 'x-admin-token': session.token }
    });

    if (!response.ok) {
        throw new Error('No se pudo generar el enlace seguro de factura.');
    }

    const payload = await response.json();
    const publicRef = payload?.invoice?.public_ref;

    if (!publicRef) {
        throw new Error(missingMessage);
    }

    return publicRef;
}

async function copyInvoiceLink(btn, invoiceId, options = {}) {
    const {
        missingMessage = 'No se encontró una referencia válida para la factura.',
        successTitle = 'Link copiado',
        restoreTitle = 'Copiar Link de Factura',
        errorMessage = 'No se pudo copiar el link de la factura.'
    } = options;

    try {
        const publicRef = await getInvoicePublicRef(invoiceId, missingMessage);
        const invoiceUrl = `${window.location.origin}/invoice/${encodeURIComponent(publicRef)}`;
        await copyTextToClipboard(invoiceUrl);

        const icon = btn?.querySelector('i');
        const originalClass = icon?.className;

        if (icon) {
            icon.className = 'fas fa-check';
        }
        if (btn) {
            btn.style.color = '#25d366';
            btn.title = successTitle;
        }

        setTimeout(() => {
            if (icon && originalClass) {
                icon.className = originalClass;
            }
            if (btn) {
                btn.style.color = '';
                btn.title = restoreTitle;
            }
        }, 2000);
    } catch (error) {
        alert(error.message || errorMessage);
    }
}

async function openInvoiceInNewTab(invoiceId, publicRef = null, options = {}) {
    const {
        missingMessage = 'No se encontró una referencia válida para la factura.',
        loadingTitle = 'Cargando factura...',
        loadingMessage = 'Cargando factura...',
        errorMessage = 'No se pudo abrir la factura.'
    } = options;

    const newTab = window.open('', '_blank');
    if (!newTab) {
        alert('Tu navegador bloqueó la nueva pestaña. Habilita popups para este sitio.');
        return;
    }

    try {
        newTab.document.title = loadingTitle;
        newTab.document.body.innerHTML = `<p style="font-family:Segoe UI,Arial,sans-serif;padding:16px;color:#5b4a55;">${loadingMessage}</p>`;
    } catch (_error) {
        // Si el navegador restringe escritura inicial, continuamos con la navegación normal.
    }

    try {
        const refToUse = publicRef || await getInvoicePublicRef(invoiceId, missingMessage);
        const invoiceUrl = `${window.location.origin}/invoice/${encodeURIComponent(refToUse)}`;
        newTab.location.href = invoiceUrl;
    } catch (error) {
        if (!newTab.closed) {
            newTab.close();
        }
        alert(error.message || errorMessage);
    }
}
