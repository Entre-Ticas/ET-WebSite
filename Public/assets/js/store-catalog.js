const STORE_CART_KEY = 'et_store_cart';
const STORE_CLIENT_PHONE_KEY = 'et_store_client_phone';
const STORE_CLIENT_NAME_KEY = 'et_store_client_name';

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

function getStoreClientName() {
    const raw = localStorage.getItem(STORE_CLIENT_NAME_KEY) || '';
    return raw.trim();
}

function saveStoreClientName(name) {
    if (!name) return;
    localStorage.setItem(STORE_CLIENT_NAME_KEY, name.trim());
}

function isValidStoreClientName(value) {
    return String(value || '').trim().length >= 2;
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
    return /^\d{4}-\d{4}$/.test(normalized);
}

function applyStorePhoneMask() {
    const input = document.getElementById('storeClientPhone');
    if (!input) return;
    input.value = normalizeStorePhoneInput(input.value);
}

function showStorePhoneConfirmation() {
    const label = document.getElementById('storePhoneConfirmedLabel');
    const value = document.getElementById('storePhoneConfirmedValue');
    const nameValue = document.getElementById('storeNameConfirmedValue');
    if (!label || !value) return;

    const phone = getStoreClientPhone();
    const name = getStoreClientName();
    value.textContent = phone || '-';
    if (nameValue) nameValue.textContent = name || '-';
    label.style.display = 'flex';
}

function ensurePhoneModalState() {
    const modal = document.getElementById('storePhoneModal');
    const savedPhone = getStoreClientPhone();
    const savedName = getStoreClientName();
    const phoneInput = document.getElementById('storeClientPhone');
    const nameInput = document.getElementById('storeClientName');
    const errorBox = document.getElementById('storePhoneError');

    if (!modal || !phoneInput) return;

    if (savedPhone && savedName) {
        modal.style.display = 'none';
        phoneInput.value = savedPhone;
        if (nameInput) nameInput.value = savedName;
        showStorePhoneConfirmation();
        if (errorBox) errorBox.style.display = 'none';
        return;
    }

    modal.style.display = 'flex';
    phoneInput.value = savedPhone || '';
    if (nameInput) nameInput.value = savedName || '';
    showStorePhoneConfirmation();
    if (errorBox) errorBox.style.display = 'none';
}

function openPhoneEditModal() {
    const modal = document.getElementById('storePhoneModal');
    const input = document.getElementById('storeClientPhone');
    const nameInput = document.getElementById('storeClientName');
    const errorBox = document.getElementById('storePhoneError');
    if (!modal || !input) return;

    input.value = getStoreClientPhone() || '';
    if (nameInput) nameInput.value = getStoreClientName() || '';
    if (errorBox) {
        errorBox.style.display = 'none';
        errorBox.textContent = 'Debes ingresar un nombre y un teléfono válido (8 dígitos) antes de continuar.';
    }
    modal.style.display = 'flex';
}

function savePhoneFromModal() {
    const input = document.getElementById('storeClientPhone');
    const nameInput = document.getElementById('storeClientName');
    const errorBox = document.getElementById('storePhoneError');
    const modal = document.getElementById('storePhoneModal');
    const phone = normalizeStorePhoneInput(input?.value || '');
    const name = (nameInput?.value || '').trim();

    if (!isValidStoreClientName(name)) {
        if (errorBox) {
            errorBox.textContent = 'Debes ingresar tu nombre antes de continuar.';
            errorBox.style.display = 'block';
        }
        return;
    }

    if (!isValidStorePhone(phone)) {
        if (errorBox) {
            errorBox.textContent = 'El teléfono debe tener 8 dígitos numéricos (formato 0000-0000).';
            errorBox.style.display = 'block';
        }
        return;
    }

    saveStoreClientName(name);
    saveStoreClientPhone(phone);
    if (input) input.value = phone;
    if (nameInput) nameInput.value = name;
    if (errorBox) errorBox.style.display = 'none';
    if (modal) modal.style.display = 'none';
    showStorePhoneConfirmation();
}

function getCatalogItemStockLimit(itemId) {
    const items = window.__storeCatalogItems || [];
    const catalogItem = items.find((it) => String(it.id) === String(itemId));
    if (!catalogItem) return { hasLimit: false, maxQty: null };
    const hasLimit = catalogItem.quantity !== null && catalogItem.quantity !== undefined && Number(catalogItem.quantity) > 0;
    return { hasLimit, maxQty: hasLimit ? Number(catalogItem.quantity) : null };
}

function addToCart(itemId, itemName, itemPrice, itemImage, maxQty) {
    const cart = getStoreCart();
    const currentQty = cart[itemId]?.qty || 0;
    const hasLimit = maxQty !== null && maxQty !== undefined && !Number.isNaN(Number(maxQty));
    if (hasLimit && currentQty >= Number(maxQty)) return;
    const nextQty = currentQty + 1;
    cart[itemId] = { qty: nextQty, name: itemName, price: Number(itemPrice || 0), image: itemImage || '', maxQty: hasLimit ? Number(maxQty) : null };
    saveStoreCart(cart);
    renderStoreCart();
    renderStoreCatalogGrid();
}

function increaseCartItem(itemId) {
    const cart = getStoreCart();
    const item = cart[itemId];
    if (!item) return;
    const { hasLimit, maxQty } = getCatalogItemStockLimit(itemId);
    if (hasLimit && Number(item.qty || 0) >= maxQty) return;
    item.qty = Number(item.qty || 0) + 1;
    item.maxQty = maxQty;
    saveStoreCart(cart);
    renderStoreCart();
    renderStoreCatalogGrid();
}

function removeCartItem(itemId) {
    const cart = getStoreCart();
    if (!cart[itemId]) return;
    delete cart[itemId];
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

function updateStoreTopbarOffset() {
    const topbarActions = document.getElementById('storeTopbarActions');
    if (!topbarActions) return;

    const siteNav = document.querySelector('nav');
    const navHeight = siteNav ? Math.ceil(siteNav.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--site-nav-height', `${navHeight}px`);
}

function renderStoreClosedState(message) {
    const status = document.getElementById('storeCatalogStatus');
    const grid = document.getElementById('storeCatalogGrid');
    const countdown = document.getElementById('storeCountdown');
    const cartButton = document.getElementById('storeCartButton');
    const title = document.getElementById('storeCatalogTitle');
    const phoneLabel = document.getElementById('storePhoneConfirmedLabel');

    if (countdown) countdown.style.display = 'none';
    if (cartButton) cartButton.style.display = 'none';
    if (grid) grid.style.display = 'none';
    if (title) title.style.display = 'none';
    if (phoneLabel) phoneLabel.style.display = 'none';
    if (!status) return;

    status.style.display = 'flex';
    status.style.justifyContent = 'center';
    status.style.alignItems = 'center';
    status.style.padding = '2.25rem 0.25rem 1rem';
    status.innerHTML = `
        <div style="width:min(100%, 720px); background:linear-gradient(180deg, rgba(255,255,255,0.9), rgba(253,239,244,0.95)); border:1px solid #f2c8d9; border-radius:28px; box-shadow:0 18px 45px rgba(120, 45, 85, 0.12); overflow:hidden; text-align:center; padding:2rem 1.5rem 1.7rem;">
            <div style="width:74px; height:74px; margin:0 auto 1rem; border-radius:24px; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg, #fde3ec 0%, #f9c9db 100%); color:#a94a78; font-size:1.9rem; box-shadow:0 10px 22px rgba(177,73,120,0.14);">
                <i class="fas fa-door-closed" aria-hidden="true"></i>
            </div>
            <div style="display:inline-flex; align-items:center; gap:0.45rem; padding:0.32rem 0.75rem; border-radius:999px; background:#fff5f8; color:#b14978; font-size:0.82rem; font-weight:800; letter-spacing:0.03em; text-transform:uppercase; margin-bottom:0.85rem;">
                Tienda cerrada
            </div>
            <h3 style="margin:0 0 0.8rem; color:#6b2d4a; font-size:2rem; line-height:1.1;">Por ahora no hay compras disponibles</h3>
            <p style="margin:0 auto 1.3rem; max-width:560px; font-size:1.05rem; line-height:1.65; color:#7a3c5f;">${message}</p>
            <div style="display:flex; justify-content:center; gap:0.8rem; flex-wrap:wrap; align-items:center;">
                <a href="/" style="display:inline-flex; align-items:center; justify-content:center; min-width:160px; padding:0.85rem 1.05rem; border-radius:999px; background:var(--pink-accent); color:#fff; text-decoration:none; font-weight:800; border:1px solid var(--pink-accent); box-shadow:0 12px 24px rgba(225,155,157,0.22);">Volver al inicio</a>
                <span style="color:#8f5a71; font-size:0.95rem;">Si necesitas ayuda, contacta con la tienda por WhatsApp.</span>
            </div>
        </div>
    `;
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
    const customerName = getStoreClientName() || 'Sin nombre';
    const customerPhone = getStoreClientPhone() || 'Sin teléfono';
    body.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:0.9rem;">
            <div style="padding:0.85rem 1rem; border:1px solid #f0dfe5; border-radius:16px; background:#fff9fb; box-shadow:0 8px 18px rgba(177,73,120,0.04); display:flex; flex-direction:column; gap:0.35rem;">
                <div style="font-size:0.75rem; letter-spacing:0.08em; text-transform:uppercase; color:#a64b7b; font-weight:800; margin-bottom:0.1rem;">Cliente</div>
                <div style="display:flex; justify-content:space-between; align-items:center; gap:0.8rem; flex-wrap:nowrap; white-space:nowrap;">
                    <div style="display:inline-block; white-space:nowrap;"><strong>Nombre:</strong> ${customerName}</div>
                    <div style="display:inline-block; white-space:nowrap;"><strong>Número:</strong> ${customerPhone}</div>
                </div>
            </div>
            <div style="padding:0.85rem 1rem; border:1px solid #f0dfe5; border-radius:16px; background:linear-gradient(180deg, #fffafc 0%, #fff0f6 100%); box-shadow:0 8px 18px rgba(177,73,120,0.05);">
                <div style="font-size:0.75rem; letter-spacing:0.08em; text-transform:uppercase; color:#a64b7b; font-weight:800; margin-bottom:0.5rem;">Productos</div>
                ${items.map(([id, item]) => {
                    const { hasLimit, maxQty } = getCatalogItemStockLimit(id);
                    const reachedLimit = hasLimit && Number(item.qty || 0) >= maxQty;
                    return `
                    <div style="display:flex; justify-content:space-between; gap:1rem; align-items:center; border-bottom:1px solid #f0dfe5; padding-bottom:0.7rem; margin-bottom:0.7rem;">
                        <div style="display:flex; align-items:center; gap:0.8rem; flex:1; min-width:0;">
                            <img src="${item.image || 'https://placehold.co/80x80?text=No+img'}" style="width:48px; height:48px; object-fit:cover; border-radius:10px; border:1px solid rgba(177,73,120,0.12);" />
                            <div style="min-width:0; flex:1;">
                                <div style="font-weight:700; color:#5d2d42; word-break:break-word;">${item.name}</div>
                                <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.35rem;">
                                    <div style="display:flex; flex-direction:column; align-items:flex-start; gap:0.2rem;">
                                        <div style="display:flex; align-items:center; transform:scale(0.9); transform-origin:left center;">
                                            <button type="button" onclick="decreaseFromCart('${id}')" style="background-color:#fceaf1; border:1px solid #e19b9d; color:#5d2d42; cursor:pointer; font-size:1.2rem; font-weight:bold; width:34px; height:34px; border-radius:10px 0 0 10px;">−</button>
                                            <input type="number" value="${item.qty}" readonly min="0" style="width:56px; height:34px; text-align:center; border:1px solid #e19b9d; border-left:none; border-right:none; font-size:1rem; font-weight:bold; border-radius:0; margin:0; box-sizing:border-box; appearance:textfield; -moz-appearance:textfield; color:#5d2d42; background:#fff;" />
                                            <button type="button" onclick="increaseCartItem('${id}')" ${reachedLimit ? 'disabled' : ''} style="background-color:#fceaf1; border:1px solid #e19b9d; color:#5d2d42; cursor:pointer; font-size:1.2rem; font-weight:bold; width:34px; height:34px; border-radius:0 10px 10px 0; ${reachedLimit ? 'opacity:0.45; cursor:not-allowed;' : ''}">+</button>
                                        </div>
                                    </div>
                                    <button type="button" onclick="removeCartItem('${id}')" title="Eliminar del carrito" style="width:28px; height:28px; border:1px solid rgba(220,53,69,0.4); border-radius:9px; background:#fff5f5; color:#dc3545; font-size:0.85rem; line-height:1; cursor:pointer; margin-top:0; align-self:center;"><i class="fas fa-trash-alt"></i></button>
                                </div>
                            </div>
                        </div>
                        <div style="font-weight:800; color:#6d2d4a; white-space:nowrap;">₡${(Number(item.price || 0) * Number(item.qty || 0)).toLocaleString('es-CR')}</div>
                    </div>
                `;
                }).join('')}
            </div>
        
            <div style="display:flex; justify-content:space-between; align-items:center; font-weight:700; padding-top:0.2rem;">
                <span>Total</span>
                <span>₡${total.toLocaleString('es-CR')}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-weight:800; font-size:1.9rem; line-height:1.2; color:#a42169; padding-top:0.2rem;">
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

function openOrderConfirmModal() {
    const modal = document.getElementById('storeConfirmModal');
    const summary = document.getElementById('storeConfirmSummary');
    const nameValue = document.getElementById('storeConfirmName');
    const phoneValue = document.getElementById('storeConfirmPhone');

    if (!modal || !summary || !nameValue || !phoneValue) return;

    const name = getStoreClientName();
    const phone = getStoreClientPhone();
    const cart = getStoreCart();
    const entries = Object.entries(cart).map(([id, item]) => ({ id, quantity: Number(item.qty || 0), price: Number(item.price || 0), name: item.name }));

    if (entries.length) {
        summary.innerHTML = entries
            .map((entry) => `<li style="margin:0;">${entry.name} (${entry.quantity})</li>`)
            .join('');
    } else {
        summary.innerHTML = '<li style="margin:0;">Seguro que desea confirmar la compra.</li>';
    }

    nameValue.textContent = name;
    phoneValue.textContent = phone;
    modal.style.display = 'flex';
}

function closeOrderConfirmModal() {
    const modal = document.getElementById('storeConfirmModal');
    if (modal) modal.style.display = 'none';
}

async function confirmStoreOrder() {
    const phone = getStoreClientPhone();
    const name = getStoreClientName();
    const cart = getStoreCart();
    const entries = Object.entries(cart).map(([id, item]) => ({ id, quantity: Number(item.qty || 0), price: Number(item.price || 0), name: item.name }));

    if (!phone || !name || !entries.length) {
        ensurePhoneModalState();
        return;
    }

    openOrderConfirmModal();
}

async function submitConfirmedStoreOrder() {
    const phone = getStoreClientPhone();
    const name = getStoreClientName();
    const token = getStoreCatalogToken();
    const cart = getStoreCart();
    const entries = Object.entries(cart).map(([id, item]) => ({ id, quantity: Number(item.qty || 0), price: Number(item.price || 0), name: item.name }));

    if (!phone || !name || !entries.length) {
        closeOrderConfirmModal();
        ensurePhoneModalState();
        return;
    }

    const response = await fetch('/.netlify/functions/store-admin?action=create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            public_token: token,
            client_phone: phone,
            client_name: name,
            items: entries.map((entry) => ({ id: entry.id, quantity: entry.quantity, price: entry.price, name: entry.name }))
        })
    });

    const data = await response.json().catch(() => ({}));
    closeOrderConfirmModal();

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
        const hasLimit = item.quantity !== null && item.quantity !== undefined && Number(item.quantity) > 0;
        const maxQty = hasLimit ? Number(item.quantity) : null;
        const reachedLimit = hasLimit && qty >= maxQty;

        const quantityControls = `
            <div style="position:absolute; left:12px; right:12px; bottom:12px; z-index:2; display:flex; align-items:center; justify-content:center; gap:0.55rem; padding:0.42rem 0.6rem; border:1px solid rgba(198, 131, 156, 0.8); border-radius:14px; background:rgba(249, 237, 242, 0.96); box-shadow:0 8px 18px rgba(132, 76, 96, 0.12), inset 0 1px 0 rgba(255,255,255,0.8);">
                <button type="button" data-action="decrease" data-item-id="${item.id}" style="width:34px; height:34px; border:1px solid rgba(198, 131, 156, 0.7); border-radius:10px; background:#fff; color:#5d2d42; font-size:1.5rem; line-height:1; cursor:pointer; box-shadow:inset 0 1px 0 rgba(255,255,255,0.8);">−</button>
                <span style="min-width:2.2rem; text-align:center; font-weight:700; color:#5d2d42; font-size:1.1rem; background:#fff; border:1px solid rgba(198, 131, 156, 0.7); border-radius:10px; padding:0.25rem 0.5rem; box-shadow:inset 0 1px 0 rgba(255,255,255,0.8);">${qty}</span>
                <button type="button" data-action="increase" data-item-id="${item.id}" data-item-name="${itemName}" data-item-price="${Number(item.price || 0)}" data-item-image="${itemImage}" data-max-qty="${hasLimit ? maxQty : ''}" ${reachedLimit ? 'disabled' : ''} style="width:34px; height:34px; border:1px solid rgba(198, 131, 156, 0.7); border-radius:10px; background:#fff; color:#5d2d42; font-size:1.5rem; line-height:1; cursor:pointer; box-shadow:inset 0 1px 0 rgba(255,255,255,0.8); ${reachedLimit ? 'opacity:0.45; cursor:not-allowed;' : ''}">+</button>
            </div>
        `;

        const addButton = `
            <button type="button" data-action="increase" data-item-id="${item.id}" data-item-name="${itemName}" data-item-price="${Number(item.price || 0)}" data-item-image="${itemImage}" data-max-qty="${hasLimit ? maxQty : ''}" style="position:absolute; left:12px; right:12px; bottom:12px; z-index:2; width:auto; padding:0.75rem 0.9rem; border:1px solid rgba(198, 131, 156, 0.75); border-radius:12px; background:rgba(243, 191, 209, 0.96); color:#5d2d42; font-size:0.95rem; font-weight:700; cursor:pointer; box-shadow:0 8px 16px rgba(132, 76, 96, 0.12), inset 0 1px 0 rgba(255,255,255,0.8);">Agregar al carrito</button>
        `;

        return `
            <div style="background:#fff; border:1px solid #f4d9e8; border-radius:16px; overflow:hidden; box-shadow:0 8px 20px rgba(0,0,0,0.04); display:flex; flex-direction:column; height:100%; min-height:420px;">
                <div style="position:relative; width:100%; height:290px; background:#f7eef2;">
                    <img data-open-image="true" data-image-src="${String(item.image_url || 'https://placehold.co/500x500?text=No+img')}" src="${item.image_url || 'https://placehold.co/500x500?text=No+img'}" alt="${item.name}" style="width:100%; height:100%; object-fit:cover; display:block; cursor:pointer;" />
                    ${qty === 0 ? addButton : quantityControls}
                </div>
                <div style="padding:0.9rem; display:flex; flex-direction:column; flex:1;">
                    ${item.description ? `<div style="display:inline-block; background:#efebed; color:#5d2d42; border-radius:999px; padding:0.35rem 0.7rem; font-size:0.72rem; font-weight:700; margin-bottom:0.7rem;">${item.description}</div>` : ''}
                    <h3 style="margin:0.35rem 0; font-size:1.05rem;">${item.name}</h3>
                    <div style="font-weight:700; color:#b33b7b; margin:0.4rem 0;">₡${Number(item.price || 0).toLocaleString('es-CR')}</div>
                    ${hasLimit ? `<div style="color:#666; font-size:0.82rem;">${maxQty} disponibles</div>` : ''}
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('[data-action="increase"]').forEach((button) => {
        button.addEventListener('click', () => {
            if (button.disabled) return;
            const itemId = Number(button.dataset.itemId);
            const itemName = button.dataset.itemName || '';
            const itemPrice = Number(button.dataset.itemPrice || 0);
            const itemImage = button.dataset.itemImage || '';
            const maxQtyRaw = button.dataset.maxQty;
            const maxQty = maxQtyRaw === '' || maxQtyRaw === undefined ? null : Number(maxQtyRaw);
            addToCart(itemId, itemName, itemPrice, itemImage, maxQty);
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
            const closedMessage = data.error || 'La tienda está cerrada en este momento.';
            if (response.status === 410 || /expirada|no está activa|cerrada/i.test(closedMessage)) {
                renderStoreClosedState(closedMessage);
                if (title) title.textContent = 'Tienda cerrada';
                if (meta) meta.textContent = 'Catálogo temporalmente no disponible';
                return;
            }
            throw new Error(closedMessage || 'No se pudo cargar el catálogo.');
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
        const closedMessage = error?.message || 'La tienda está cerrada en este momento.';
        if (/expirada|no está activa|cerrada/i.test(closedMessage)) {
            renderStoreClosedState(closedMessage);
            if (title) title.textContent = 'Tienda cerrada';
            if (meta) meta.textContent = 'Catálogo temporalmente no disponible';
            return;
        }
        if (status) {
            status.innerHTML = `<p class="error-msg">⚠️ ${error.message}</p>`;
        }
    }
}

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
    updateStoreTopbarOffset();
    loadStoreCatalog();
    renderStoreCart();
    updateStoreCartBadge();

    window.addEventListener('resize', () => {
        updateStoreTopbarOffset();
    }, { passive: true });
    window.addEventListener('orientationchange', () => {
        updateStoreTopbarOffset();
    }, { passive: true });
    window.addEventListener('load', () => {
        updateStoreTopbarOffset();
    }, { once: true });
}

window.loadStoreCatalog = loadStoreCatalog;
window.openStoreCart = openStoreCart;
window.closeStoreCart = closeStoreCart;
window.confirmStoreOrder = confirmStoreOrder;
window.addToCart = addToCart;
window.decreaseFromCart = decreaseFromCart;
window.increaseCartItem = increaseCartItem;
window.removeCartItem = removeCartItem;
window.savePhoneFromModal = savePhoneFromModal;
window.normalizeStorePhoneInput = normalizeStorePhoneInput;
window.ensurePhoneModalState = ensurePhoneModalState;
window.initStoreCatalogPage = initStoreCatalogPage;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStoreCatalogPage, { once: true });
} else {
    initStoreCatalogPage();
}
