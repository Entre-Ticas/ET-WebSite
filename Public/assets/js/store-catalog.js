const STORE_CART_KEY = 'et_store_cart';
const STORE_CLIENT_PHONE_KEY = 'et_store_client_phone';

function getStoreCatalogToken() {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const directToken = pathParts[pathParts.length - 1];
    if (directToken && directToken !== 'StoreCatalog') return directToken;
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
}

function getStoreCart() {
    try {
        return JSON.parse(sessionStorage.getItem(STORE_CART_KEY) || '{}');
    } catch {
        return {};
    }
}

function getStoreClientPhone() {
    const raw = localStorage.getItem(STORE_CLIENT_PHONE_KEY) || '';
    return raw.trim();
}

function saveStoreClientPhone(phone) {
    if (!phone) return;
    localStorage.setItem(STORE_CLIENT_PHONE_KEY, phone.trim());
}

function saveStoreCart(cart) {
    sessionStorage.setItem(STORE_CART_KEY, JSON.stringify(cart));
}

function normalizeStorePhoneInput(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}`;
}

function isValidStorePhone(value) {
    const normalized = normalizeStorePhoneInput(value);
    return /^\d{4}-\d{4}$/.test(normalized) || /^\d{4}$/.test(normalized);
}

function applyStorePhoneMask() {
    const input = document.getElementById('storeClientPhone');
    if (!input) return;
    input.value = normalizeStorePhoneInput(input.value);
}

function showStorePhoneConfirmation() {
    const label = document.getElementById('storePhoneConfirmedLabel');
    const value = document.getElementById('storePhoneConfirmedValue');
    if (!label || !value) return;

    const phone = getStoreClientPhone();
    value.textContent = phone || '-';
    label.style.display = 'flex';
}

function ensurePhoneModalState() {
    const modal = document.getElementById('storePhoneModal');
    const savedPhone = getStoreClientPhone();
    const phoneInput = document.getElementById('storeClientPhone');
    const errorBox = document.getElementById('storePhoneError');

    if (!modal || !phoneInput) return;

    if (savedPhone) {
        modal.style.display = 'none';
        phoneInput.value = savedPhone;
        showStorePhoneConfirmation();
        if (errorBox) errorBox.style.display = 'none';
        return;
    }

    modal.style.display = 'flex';
    phoneInput.value = '';
    showStorePhoneConfirmation();
    if (errorBox) errorBox.style.display = 'none';
}

function openPhoneEditModal() {
    const modal = document.getElementById('storePhoneModal');
    const input = document.getElementById('storeClientPhone');
    const errorBox = document.getElementById('storePhoneError');
    if (!modal || !input) return;

    input.value = getStoreClientPhone() || '';
    if (errorBox) {
        errorBox.style.display = 'none';
        errorBox.textContent = 'Debes ingresar un teléfono válido antes de continuar.';
    }
    modal.style.display = 'flex';
}

function savePhoneFromModal() {
    const input = document.getElementById('storeClientPhone');
    const errorBox = document.getElementById('storePhoneError');
    const modal = document.getElementById('storePhoneModal');
    const phone = normalizeStorePhoneInput(input?.value || '');

    if (!isValidStorePhone(phone)) {
        if (errorBox) {
            errorBox.textContent = 'Debes ingresar un teléfono válido antes de continuar.';
            errorBox.style.display = 'block';
        }
        return;
    }

    saveStoreClientPhone(phone);
    if (input) input.value = phone;
    if (errorBox) errorBox.style.display = 'none';
    if (modal) modal.style.display = 'none';
    showStorePhoneConfirmation();
}

function addToCart(itemId, itemName, itemPrice, itemImage) {
    const cart = getStoreCart();
    const nextQty = (cart[itemId]?.qty || 0) + 1;
    cart[itemId] = { qty: nextQty, name: itemName, price: Number(itemPrice || 0), image: itemImage || '' };
    saveStoreCart(cart);
    renderStoreCart();
    renderStoreCatalogGrid();
}

function decreaseFromCart(itemId) {
    const cart = getStoreCart();
    if (!cart[itemId]) return;
    if (cart[itemId].qty <= 1) {
        delete cart[itemId];
    } else {
        cart[itemId].qty -= 1;
    }
    saveStoreCart(cart);
    renderStoreCart();
    renderStoreCatalogGrid();
}

function calculateCartTotal(cart) {
    return Object.values(cart).reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.price || 0)), 0);
}

function updateStoreCartBadge() {
    const cartBtn = document.getElementById('storeCartButton');
    if (!cartBtn) return;

    const cart = getStoreCart();
    const totalItems = Object.values(cart).reduce((sum, item) => sum + Number(item.qty || 0), 0);
    let badge = document.getElementById('storeCartBadge');

    if (!badge) {
        badge = document.createElement('span');
        badge.id = 'storeCartBadge';
        badge.style.position = 'absolute';
        badge.style.top = '-6px';
        badge.style.left = '-6px';
        badge.style.minWidth = '18px';
        badge.style.height = '18px';
        badge.style.padding = '0 5px';
        badge.style.borderRadius = '999px';
        badge.style.background = '#d81b60';
        badge.style.color = '#fff';
        badge.style.fontSize = '0.7rem';
        badge.style.fontWeight = '700';
        badge.style.lineHeight = '18px';
        badge.style.textAlign = 'center';
        badge.style.boxShadow = '0 2px 6px rgba(0,0,0,0.18)';
        badge.style.display = 'none';
        cartBtn.style.position = 'relative';
        cartBtn.appendChild(badge);
    }

    if (totalItems > 0) {
        badge.textContent = String(totalItems);
        badge.style.display = 'inline-block';
    } else {
        badge.textContent = '0';
        badge.style.display = 'none';
    }
}

function renderStoreCart() {
    const cart = getStoreCart();
    const body = document.getElementById('storeCartBody');
    if (!body) return;

    const items = Object.entries(cart);
    if (!items.length) {
        body.innerHTML = '<p>Tu carrito está vacío.</p>';
        return;
    }

    const total = calculateCartTotal(cart);
    const deposit = Math.round(total * 0.5);
    body.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:0.8rem;">
            ${items.map(([id, item]) => `
                <div style="display:flex; justify-content:space-between; gap:1rem; align-items:center; border-bottom:1px solid #f0dfe5; padding-bottom:0.7rem;">
                    <div style="display:flex; align-items:center; gap:0.8rem;">
                        <img src="${item.image || 'https://placehold.co/80x80?text=No+img'}" style="width:48px; height:48px; object-fit:cover; border-radius:10px;" />
                        <div>
                            <div><strong>${item.name}</strong></div>
                            <div style="font-size:0.82rem; color:#666;">Cantidad: ${item.qty}</div>
                        </div>
                    </div>
                    <div>₡${(Number(item.price || 0) * Number(item.qty || 0)).toLocaleString('es-CR')}</div>
                </div>
            `).join('')}
            <div style="display:flex; justify-content:space-between; align-items:center; font-weight:700; padding-top:0.5rem;">
                <span>Total</span>
                <span>₡${total.toLocaleString('es-CR')}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-weight:800; font-size:1.3rem; color:#a42169; padding-top:0.5rem;">
                <span>Depósito (50%)</span>
                <span>₡${deposit.toLocaleString('es-CR')}</span>
            </div>
        </div>
    `;
}

function openStoreCart() {
    renderStoreCart();
    const modal = document.getElementById('storeCartModal');
    if (modal) modal.style.display = 'flex';
}

function closeStoreCart() {
    const modal = document.getElementById('storeCartModal');
    if (modal) modal.style.display = 'none';
}

async function confirmStoreOrder() {
    const phone = getStoreClientPhone();
    const token = getStoreCatalogToken();
    const cart = getStoreCart();
    const entries = Object.entries(cart).map(([id, item]) => ({ id, quantity: Number(item.qty || 0), price: Number(item.price || 0), name: item.name }));

    if (!phone || !entries.length) {
        ensurePhoneModalState();
        return;
    }

    const response = await fetch('/.netlify/functions/store-admin?action=create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            public_token: token,
            client_phone: phone,
            items: entries.map((entry) => ({ id: entry.id, quantity: entry.quantity, price: entry.price }))
        })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        alert(data.error || 'No se pudo confirmar la compra.');
        return;
    }

    sessionStorage.removeItem(STORE_CART_KEY);
    renderStoreCatalogGrid();
    renderStoreCart();
    closeStoreCart();
    if (data.wa_link) {
        window.open(data.wa_link, '_blank');
    }
}

function renderStoreCatalogGrid() {
    const container = document.getElementById('storeCatalogGrid');
    if (!container || !window.__storeCatalogItems) return;

    const cart = getStoreCart();
    container.innerHTML = window.__storeCatalogItems.map((item) => {
        const qty = cart[item.id]?.qty || 0;
        const itemName = String(item.name).replace(/"/g, '&quot;');
        const itemImage = String(item.image_url || '').replace(/"/g, '&quot;');

        const quantityControls = `
            <div style="position:absolute; left:12px; right:12px; bottom:12px; z-index:2; display:flex; align-items:center; justify-content:center; gap:0.55rem; padding:0.42rem 0.6rem; border:1px solid rgba(198, 131, 156, 0.8); border-radius:14px; background:rgba(249, 237, 242, 0.96); box-shadow:0 8px 18px rgba(132, 76, 96, 0.12), inset 0 1px 0 rgba(255,255,255,0.8);">
                <button type="button" data-action="decrease" data-item-id="${item.id}" style="width:34px; height:34px; border:1px solid rgba(198, 131, 156, 0.7); border-radius:10px; background:#fff; color:#5d2d42; font-size:1.5rem; line-height:1; cursor:pointer; box-shadow:inset 0 1px 0 rgba(255,255,255,0.8);">−</button>
                <span style="min-width:2.2rem; text-align:center; font-weight:700; color:#5d2d42; font-size:1.1rem; background:#fff; border:1px solid rgba(198, 131, 156, 0.7); border-radius:10px; padding:0.25rem 0.5rem; box-shadow:inset 0 1px 0 rgba(255,255,255,0.8);">${qty}</span>
                <button type="button" data-action="increase" data-item-id="${item.id}" data-item-name="${itemName}" data-item-price="${Number(item.price || 0)}" data-item-image="${itemImage}" style="width:34px; height:34px; border:1px solid rgba(198, 131, 156, 0.7); border-radius:10px; background:#fff; color:#5d2d42; font-size:1.5rem; line-height:1; cursor:pointer; box-shadow:inset 0 1px 0 rgba(255,255,255,0.8);">+</button>
            </div>
        `;

        const addButton = `
            <button type="button" data-action="increase" data-item-id="${item.id}" data-item-name="${itemName}" data-item-price="${Number(item.price || 0)}" data-item-image="${itemImage}" style="position:absolute; left:12px; right:12px; bottom:12px; z-index:2; width:auto; padding:0.75rem 0.9rem; border:1px solid rgba(198, 131, 156, 0.75); border-radius:12px; background:rgba(243, 191, 209, 0.96); color:#5d2d42; font-size:0.95rem; font-weight:700; cursor:pointer; box-shadow:0 8px 16px rgba(132, 76, 96, 0.12), inset 0 1px 0 rgba(255,255,255,0.8);">Agregar al carrito</button>
        `;

        return `
            <div style="background:#fff; border:1px solid #f4d9e8; border-radius:16px; overflow:hidden; box-shadow:0 8px 20px rgba(0,0,0,0.04); display:flex; flex-direction:column; height:100%; min-height:420px;">
                <div style="position:relative; width:100%; height:290px; background:#f7eef2;">
                    <img data-open-image="true" data-image-src="${String(item.image_url || 'https://placehold.co/500x500?text=No+img')}" src="${item.image_url || 'https://placehold.co/500x500?text=No+img'}" alt="${item.name}" style="width:100%; height:100%; object-fit:cover; display:block; cursor:pointer;" />
                    ${qty === 0 ? addButton : quantityControls}
                </div>
                <div style="padding:0.9rem; display:flex; flex-direction:column; flex:1;">
                    ${item.description ? `<div style="display:inline-block; background:#efebed; color:#5d2d42; border-radius:999px; padding:0.35rem 0.7rem; font-size:0.72rem; font-weight:700; margin-bottom:0.7rem;">${item.description}</div>` : ''}
                    <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; color:#9b7f8d;">Tienda</div>
                    <h3 style="margin:0.35rem 0; font-size:1.05rem;">${item.name}</h3>
                    <div style="font-weight:700; color:#b33b7b; margin:0.4rem 0;">₡${Number(item.price || 0).toLocaleString('es-CR')}</div>
                    <div style="color:#666; font-size:0.82rem;">${item.quantity || 0} disponibles</div>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('[data-action="increase"]').forEach((button) => {
        button.addEventListener('click', () => {
            const itemId = Number(button.dataset.itemId);
            const itemName = button.dataset.itemName || '';
            const itemPrice = Number(button.dataset.itemPrice || 0);
            const itemImage = button.dataset.itemImage || '';
            addToCart(itemId, itemName, itemPrice, itemImage);
        });
    });

    container.querySelectorAll('[data-action="decrease"]').forEach((button) => {
        button.addEventListener('click', () => {
            const itemId = Number(button.dataset.itemId);
            decreaseFromCart(itemId);
        });
    });

    container.querySelectorAll('[data-open-image="true"]').forEach((img) => {
        img.addEventListener('click', () => {
            const src = img.dataset.imageSrc || '';
            if (src) {
                openImageModal(src);
            }
        });
    });

    updateStoreCartBadge();
}

function startStoreCatalogCountdown(expiresAt) {
    const el = document.getElementById('storeCountdown');
    if (!el || !expiresAt) return;

    let timerId = null;

    const showClosingWarning = (totalSeconds) => {
        const modalBody = `
            <div style="padding:0.15rem 0 0.2rem;">
                <div style="background:#fcebf0; border:1px solid #f0c9d7; border-radius:14px; color:#6b2d49; font-weight:700; padding:1rem 1.2rem; text-align:center; font-size:1.08rem; margin-bottom:1.2rem;">
                    La tienda está por cerrarse.
                </div>
                <div style="text-align:center; font-size:1.2rem; font-weight:700; color:#6b2d49;">
                    Quedan <span id="storeClosingCountdown">${totalSeconds}</span> segundos.
                </div>
            </div>
        `;

        const modalFooter = `
            <button class="btn btn-primary" type="button" onclick="closeGenericModal()" style="min-width:180px; border-radius:12px; padding:0.8rem 1.1rem; font-size:1.05rem; font-weight:700; background:#efb2c5; border:none; color:#5b2140; box-shadow:inset 0 1px 0 rgba(255,255,255,0.7);">
                Entendido
            </button>
        `;

        if (typeof window.openGenericModal === 'function') {
            window.openGenericModal('Tienda por cerrar', modalBody, modalFooter);
            const countdownEl = document.getElementById('storeClosingCountdown');
            if (countdownEl) countdownEl.textContent = String(totalSeconds);
        } else {
            alert(`La tienda está por cerrarse. Quedan ${totalSeconds} segundos.`);
        }
    };

    const tick = () => {
        const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
        const totalSeconds = Math.ceil(remaining / 1000);
        const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        el.textContent = `${minutes}:${seconds}`;

        if (totalSeconds <= 300) {
            el.style.background = '#fff1d6';
            el.style.color = '#9a5d00';
        }

        if (totalSeconds <= 10 && totalSeconds > 0) {
            showClosingWarning(totalSeconds);
        }

        if (totalSeconds <= 0) {
            el.textContent = '00:00';
            if (typeof window.closeGenericModal === 'function') {
                window.closeGenericModal();
            }
            clearInterval(timerId);
            window.location.href = '/';
        }
    };

    tick();
    timerId = setInterval(tick, 1000);
}

async function loadStoreCatalog() {
    const token = getStoreCatalogToken();
    const status = document.getElementById('storeCatalogStatus');
    const title = document.getElementById('storeCatalogTitle');
    const meta = document.getElementById('storeCatalogMeta');

    if (!token) {
        if (status) {
            status.innerHTML = '<p>Token de tienda no válido.</p>';
        }
        return;
    }

    try {
        const response = await fetch(`/.netlify/functions/get-store?public_token=${encodeURIComponent(token)}`, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'No se pudo cargar el catálogo.');
        }

        const data = await response.json();
        window.__storeCatalogItems = data.items || [];
        if (title) title.textContent = data.store?.nombre_tienda || 'Catálogo de tienda';
        if (meta) meta.textContent = 'Tienda activa';
        renderStoreCatalogGrid();
        startStoreCatalogCountdown(data.expires_at || data.store?.expires_at);
        if (status) status.style.display = 'none';

        const cartBtn = document.getElementById('storeCartButton');
        if (cartBtn) cartBtn.onclick = openStoreCart;
    updateStoreCartBadge();

    } catch (error) {
        if (status) {
            status.innerHTML = `<p class="error-msg">⚠️ ${error.message}</p>`;
        }
    }
}

window.addEventListener('beforeunload', (event) => {
    const cart = getStoreCart();
    if (Object.keys(cart).length > 0) {
        event.preventDefault();
        event.returnValue = '';
    }
});

function initStoreCatalogPhoneModal() {
    const phoneInput = document.getElementById('storeClientPhone');
    const saveBtn = document.getElementById('storePhoneSaveBtn');
    const editBtn = document.getElementById('storePhoneEditBtn');
    if (!phoneInput || !saveBtn) return;

    phoneInput.oninput = applyStorePhoneMask;
    phoneInput.onkeydown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            savePhoneFromModal();
        }
    };
    saveBtn.onclick = savePhoneFromModal;
    if (editBtn) {
        editBtn.onclick = openPhoneEditModal;
    }

    document.onkeydown = (event) => {
        const modal = document.getElementById('storePhoneModal');
        const errorBox = document.getElementById('storePhoneError');
        if (event.key === 'Escape' && modal && modal.style.display !== 'none') {
            event.preventDefault();
            event.stopPropagation();
            if (errorBox) {
                errorBox.style.display = 'block';
                errorBox.textContent = 'Este dato es obligatorio. Debes guardar el teléfono para continuar.';
            }
        }
    };
}

function initStoreCatalogPage() {
    initStoreCatalogPhoneModal();
    ensurePhoneModalState();
    loadStoreCatalog();
    renderStoreCart();
    updateStoreCartBadge();
}

window.loadStoreCatalog = loadStoreCatalog;
window.openStoreCart = openStoreCart;
window.closeStoreCart = closeStoreCart;
window.confirmStoreOrder = confirmStoreOrder;
window.addToCart = addToCart;
window.decreaseFromCart = decreaseFromCart;
window.savePhoneFromModal = savePhoneFromModal;
window.normalizeStorePhoneInput = normalizeStorePhoneInput;
window.ensurePhoneModalState = ensurePhoneModalState;
window.initStoreCatalogPage = initStoreCatalogPage;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStoreCatalogPage, { once: true });
} else {
    initStoreCatalogPage();
}
