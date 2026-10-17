// ============================================
// FOOD ORDERING SYSTEM - CUSTOMER APP
// ============================================

const CONFIG = {
    API_URL: 'YOUR_APPS_SCRIPT_DEPLOYMENT_URL',
    CURRENCY_SYMBOL: 'BYN'
};

const BALI_API_CONFIGURED = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(CONFIG.API_URL);

// State
let menuItems = [];
let cart = [];
let currentCategory = 'all';
let availableEvents = [];
// Выбор количества на каждой карточке; не зависит от содержимого корзины.
const menuQuantities = new Map();
const MAX_MENU_QUANTITY = 50;
function selectedMenuQuantity(id) {
    return menuQuantities.get(id) || 1;
}
function handleMenuGridClick(event) {
    const button = event.target.closest('button[data-menu-action]');
    if (!button || !elements.menuGrid.contains(button)) return;
    const itemId = Number(button.dataset.id);
    if (!Number.isSafeInteger(itemId) || itemId <= 0) return;
    const product = menuItems.find(item => item.id === itemId && item.available);
    if (!product) return;
    const action = button.dataset.menuAction;
    const quantity = selectedMenuQuantity(itemId);
    if (action === 'add') {
        addToCart(itemId, quantity);
        return;
    }
    const next = Math.min(MAX_MENU_QUANTITY, Math.max(1, quantity + (action === 'plus' ? 1 : -1)));
    menuQuantities.set(itemId, next);
    const card = button.closest('.menu-item');
    if (!card) return;
    const output = card.querySelector('.menu-quantity-value');
    if (output) output.textContent = String(next);
    const minus = card.querySelector('[data-menu-action="minus"]');
    const plus = card.querySelector('[data-menu-action="plus"]');
    if (minus) minus.disabled = next <= 1;
    if (plus) plus.disabled = next >= MAX_MENU_QUANTITY;
}

// Публичный каталог и календарь поступают из Firestore.
window.addEventListener('bali:menu', ({ detail }) => {
    menuItems = detail.items;
    // Цены в старой корзине никогда не используем: пересчитываем по свежему каталогу.
    const actual = new Map(menuItems.filter(x => x.available).map(x => [Number(x.id), x]));
    cart = cart.flatMap(old => {
        const product = actual.get(Number(old.id));
        return product ? [{
            id: product.id, name: product.name, price: product.price,
            quantity: Math.min(50, Math.max(1, Number(old.quantity) || 1))
        }] : [];
    });
    saveCart();
    updateCartUI();
    updateCategoryButtons();
    displayMenuItems(menuItems);
});
window.addEventListener('bali:menu-error', () => showError('Не удалось загрузить меню из Firestore. Проверьте правила доступа.'));
window.addEventListener('bali:events', ({ detail }) => {
    availableEvents = detail.events;
    populateEvents();
});
window.addEventListener('bali:events-error', () => {
    const select = document.getElementById('eventSelect');
    if (select) select.innerHTML = '<option value="">Не удалось загрузить мероприятия</option>';
});
function updateCategoryButtons() {
    const all = [...new Set(menuItems.map(i => i.category).filter(Boolean))];
    if (currentCategory !== 'all' && !all.includes(currentCategory)) currentCategory = 'all';
    elements.categoryFilter.replaceChildren();
    for (const category of ['all', ...all]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'category-btn' + (currentCategory === category ? ' active' : '');
        button.dataset.category = category;
        button.textContent = category === 'all' ? 'Всё меню' : category;
        elements.categoryFilter.append(button);
    }
}
function minskDateToday() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Minsk', day: '2-digit', month: '2-digit', year: 'numeric'
    }).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(x => [x.type,x.value]));
    return p.year + '-' + p.month + '-' + p.day;
}
function populateEvents() {
    const select = document.getElementById('eventSelect');
    if (!select) return;
    const chosen = select.value;
    select.replaceChildren(new Option('Выбери мероприятие', ''));
    for (const event of availableEvents.filter(e => e.preorderEnabled && e.date >= minskDateToday() && e.closesAt?.toDate?.() > new Date())) {
        const opt = new Option(event.date + ' — ' + event.title, event.date);
        select.add(opt);
    }
    if (availableEvents.some(e => e.date === chosen && e.preorderEnabled && e.closesAt?.toDate?.() > new Date())) select.value=chosen;
    document.getElementById('eventDate').value = select.value;
    if (select.length === 1) select.options[0].textContent = 'Доступных мероприятий пока нет';
}
function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c =>
        ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function safeImageUrl(value) {
    try {
        const u = new URL(String(value ?? ''));
        if (u.protocol === 'https:' || u.protocol === 'http:') return escapeHTML(u.href);
    } catch (_) { /* fallback */ }
    return 'https://placehold.co/400x200?text=BALI';
}


// DOM Elements
const elements = {
    menuGrid: document.getElementById('menuGrid'),
    cartSidebar: document.getElementById('cartSidebar'),
    cartItems: document.getElementById('cartItems'),
    cartCount: document.getElementById('cartCount'),
    totalAmount: document.getElementById('totalAmount'),
    overlay: document.getElementById('overlay'),
    checkoutModal: document.getElementById('checkoutModal'),
    successModal: document.getElementById('successModal'),
    checkoutForm: document.getElementById('checkoutForm'),
    checkoutItems: document.getElementById('checkoutItems'),
    checkoutTotal: document.getElementById('checkoutTotal'),
    displayOrderId: document.getElementById('displayOrderId'),
    categoryFilter: document.getElementById('categoryFilter')
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    loadCart();
    initializeApp();
    attachEventListeners();
});

function initializeApp() {
    fetchMenuItems();
}

async function loadConfig() {
    if (!BALI_API_CONFIGURED) return;
    try {
        const response = await fetch(`${CONFIG.API_URL}?path=config`);
        const data = await response.json();
        if (data.success && data.config) {
            if (data.config.restaurant_name) {
                document.querySelector('.logo-text').textContent = data.config.restaurant_name;
                document.title = `${data.config.restaurant_name} - Order Food Online`;
            }
            if (data.config.currency_symbol) {
                CONFIG.CURRENCY_SYMBOL = data.config.currency_symbol;
                updateCartUI(); // Update any existing prices in UI
            }
        }
    } catch (e) {
        console.warn('Failed to load config:', e);
    }
}

function attachEventListeners() {
    const eventSelect = document.getElementById('eventSelect');
    if (eventSelect) eventSelect.addEventListener('change', () => {
        document.getElementById('eventDate').value = eventSelect.value;
    });

    // Управление количеством над кнопкой «В корзину» (на всех карточках меню).
    elements.menuGrid.addEventListener('click', handleMenuGridClick);

    // Cart controls
    document.getElementById('cartBtn').addEventListener('click', openCart);
    document.getElementById('closeCart').addEventListener('click', closeCart);
    document.getElementById('checkoutBtn').addEventListener('click', openCheckout);

    // Modal controls
    document.getElementById('closeCheckout').addEventListener('click', closeCheckout);
    document.getElementById('closeSuccess').addEventListener('click', closeSuccess);
    elements.overlay.addEventListener('click', closeAllModals);

    // Form submission
    elements.checkoutForm.addEventListener('submit', handleCheckout);

    // Category filter
    elements.categoryFilter.addEventListener('click', handleCategoryFilter);

    document.getElementById('myOrdersBtn').addEventListener('click', openMyOrders);
    document.getElementById('closeMyOrders').addEventListener('click', closeMyOrders);
    document.getElementById('successMyOrders').addEventListener('click', async () => {
        closeSuccess();
        await openMyOrders();
    });

    // Location Sharing
    const shareBtn = document.getElementById('shareLocationBtn');
    if (shareBtn) shareBtn.addEventListener('click', handleShareLocation);

    // Reload on success close
    document.getElementById('closeSuccess').addEventListener('click', () => {
        window.location.reload();
    });
}

// ============================================
// API CALLS
// ============================================

async function fetchMenuItems() {
    elements.menuGrid.innerHTML = '<div class="loading-state"><p>Загружаем меню BALI...</p></div>';
}

let editingOrderId = null;
async function placeOrder(orderData) {
    try {
        if (!window.BaliOrders) throw new Error('Модуль предзаказов ещё загружается. Обновите страницу.');
        const result = await window.BaliOrders.save(orderData, editingOrderId);
        editingOrderId = null;
        return result;
    } catch (error) {
        return { success:false, error: window.BaliOrders?.errorText(error) || error.message };
    }
}

// ============================================
// MENU DISPLAY
// ============================================

function displayMenuItems(items) {
    if (!items || items.length === 0) {
        elements.menuGrid.innerHTML = `
            <div class="loading-state">
                <p>Меню ещё не заполнено администратором.</p>
            </div>
        `;
        return;
    }

    // Filter by category
    const filteredItems = currentCategory === 'all'
        ? items
        : items.filter(item => item.category === currentCategory);

    elements.menuGrid.innerHTML = filteredItems
        .map(item => createMenuItemHTML(item))
        .join('');

    // Кнопки обрабатываются централизованно через handleMenuGridClick.
}

function createMenuItemHTML(item) {
    const unavailable = !item.available;
    const id = Number(item.id);
    const price = Number(item.price) || 0;
    if (!Number.isSafeInteger(id) || id < 0 || price < 0) return '';
    return `
        <div class="menu-item ${unavailable ? 'unavailable' : ''}" data-id="${id}">
            <img src="${safeImageUrl(item.image_url)}"
                alt="${escapeHTML(item.name)}" class="menu-item-image">
            <div class="menu-item-content">
                <span class="menu-item-category">${escapeHTML(item.category)}</span>
                <div class="menu-item-header">
                    <h3 class="menu-item-name">${escapeHTML(item.name)}</h3>
                    <span class="menu-item-price">${CONFIG.CURRENCY_SYMBOL} ${price.toFixed(2)}</span>
                </div>
                <p class="menu-item-description">${escapeHTML(item.description)}</p>
                ${unavailable
                    ? '<span class="unavailable-badge">Недоступно</span>'
                    : `<div class="menu-purchase-controls">
                        <div class="menu-quantity" role="group" aria-label="Количество: ${escapeHTML(item.name)}">
                            <button type="button" class="menu-quantity-btn" data-menu-action="minus" data-id="${id}" aria-label="Уменьшить количество: ${escapeHTML(item.name)}" ${selectedMenuQuantity(id) === 1 ? 'disabled' : ''}>−</button>
                            <span class="menu-quantity-value" aria-live="polite">${selectedMenuQuantity(id)}</span>
                            <button type="button" class="menu-quantity-btn" data-menu-action="plus" data-id="${id}" aria-label="Увеличить количество: ${escapeHTML(item.name)}" ${selectedMenuQuantity(id) === MAX_MENU_QUANTITY ? 'disabled' : ''}>+</button>
                        </div>
                        <button type="button" class="add-to-cart-btn" data-menu-action="add" data-id="${id}">В корзину</button>
                    </div>`
                }
            </div>
        </div>
    `;
}

function showLoading() {
    elements.menuGrid.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading menu...</p>
        </div>
    `;
}

function showError(message) {
    elements.menuGrid.innerHTML = `
        <div class="loading-state">
            <p style="color: var(--error-color)">❌ ${message}</p>
        </div>
    `;
}

// ============================================
// CATEGORY FILTER
// ============================================

function handleCategoryFilter(e) {
    if (e.target.classList.contains('category-btn')) {
        // Update active button
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        e.target.classList.add('active');

        // Update category and redisplay
        currentCategory = e.target.dataset.category;
        displayMenuItems(menuItems);
    }
}

// ============================================
// CART MANAGEMENT
// ============================================

function addToCart(itemId, quantity = 1) {
    const item = menuItems.find(i => i.id === itemId);
    if (!item || !item.available) return;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_MENU_QUANTITY) return;
    const existingItem = cart.find(i => i.id === itemId);
    const amountAlreadyInCart = existingItem?.quantity || 0;
    if (amountAlreadyInCart + quantity > MAX_MENU_QUANTITY) {
        alert('Не более 50 единиц одного блюда в корзине. Сейчас в корзине: ' + amountAlreadyInCart + '.');
        return;
    }
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity
        });
    }
    saveCart();
    updateCartUI();
    const button = elements.menuGrid.querySelector('.add-to-cart-btn[data-id="' + itemId + '"]');
    if (button) {
        button.classList.add('menu-add-success');
        window.setTimeout(() => button.classList.remove('menu-add-success'), 280);
    }
}

function removeFromCart(itemId) {
    cart = cart.filter(item => item.id !== itemId);
    saveCart();
    updateCartUI();
}

function updateQuantity(itemId, delta) {
    const item = cart.find(i => i.id === itemId);
    if (!item) return;
    if (item.quantity + delta > 50) {
        alert('Не более 50 единиц одного блюда.'); return;
    }

    item.quantity += delta;

    if (item.quantity <= 0) {
        removeFromCart(itemId);
    } else {
        saveCart();
        updateCartUI();
    }
}

function updateCartUI() {
    // Update cart count
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    elements.cartCount.textContent = totalItems;

    // Update cart items display
    if (cart.length === 0) {
        elements.cartItems.innerHTML = `
            <div class="empty-cart">
                <span class="empty-icon">🛒</span>
                <p>Your cart is empty</p>
                <p class="empty-subtitle">Add items from the menu</p>
            </div>
        `;
        document.getElementById('checkoutBtn').disabled = true;
    } else {
        elements.cartItems.innerHTML = cart
            .map(item => createCartItemHTML(item))
            .join('');
        document.getElementById('checkoutBtn').disabled = false;

        // Attach remove and quantity listeners
        attachCartListeners();
    }

    // Update total
    const total = calculateTotal();
    elements.totalAmount.textContent = `${CONFIG.CURRENCY_SYMBOL}${total.toFixed(2)}`;
}

function createCartItemHTML(item) {
    return `
        <div class="cart-item" data-id="${item.id}">
            <div class="cart-item-header">
                <span class="cart-item-name">${escapeHTML(item.name)}</span>
                <button class="remove-item" data-id="${item.id}">✕</button>
            </div>
            <div class="cart-item-details">
                <div class="quantity-controls">
                    <button class="qty-btn qty-minus" data-id="${item.id}">-</button>
                    <span class="qty-value">${item.quantity}</span>
                    <button class="qty-btn qty-plus" data-id="${item.id}">+</button>
                </div>
                <span class="cart-item-price">${CONFIG.CURRENCY_SYMBOL}${(item.price * item.quantity).toFixed(2)}</span>
            </div>
        </div>
    `;
}

function attachCartListeners() {
    // Remove buttons
    document.querySelectorAll('.remove-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemId = parseInt(e.currentTarget.dataset.id);
            removeFromCart(itemId);
        });
    });

    // Quantity buttons
    document.querySelectorAll('.qty-minus').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemId = parseInt(e.currentTarget.dataset.id);
            updateQuantity(itemId, -1);
        });
    });

    document.querySelectorAll('.qty-plus').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemId = parseInt(e.currentTarget.dataset.id);
            updateQuantity(itemId, 1);
        });
    });
}

function calculateTotal() {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

function saveCart() {
    localStorage.setItem('foodhub_cart', JSON.stringify(cart));
}

function loadCart() {
    try {
        const parsed = JSON.parse(localStorage.getItem('foodhub_cart') || '[]');
        cart = Array.isArray(parsed) ? parsed.slice(0, 100).filter(item =>
            Number.isSafeInteger(Number(item.id)) &&
            Number.isFinite(Number(item.price)) &&
            Number(item.price) >= 0 &&
            Number.isInteger(Number(item.quantity)) &&
            Number(item.quantity) >= 1 && Number(item.quantity) <= 99
        ).map(item => ({
            id: Number(item.id),
            name: String(item.name ?? '').slice(0, 150),
            price: Number(item.price),
            quantity: Number(item.quantity)
        })) : [];
    } catch (error) {
        cart = [];
    }
    updateCartUI();
}

function clearCart() {
    cart = [];
    saveCart();
    updateCartUI();
}

// ============================================
// CART SIDEBAR
// ============================================

function openCart() {
    elements.cartSidebar.classList.add('active');
    elements.overlay.classList.add('active');
}

function closeCart() {
    elements.cartSidebar.classList.remove('active');
    elements.overlay.classList.remove('active');
}

// ============================================
// CHECKOUT & LOCATION
// ============================================

async function openCheckout() {
    if (cart.length === 0) return;

    // Незарегистрированный пользователь не может попасть к оформлению.
    if (!window.BaliAuth) {
        alert('Модуль авторизации недоступен. Проверьте соединение и настройки Firebase.');
        return;
    }
    if (!(await window.BaliAuth.requireProfile())) return;
    const customer = window.BaliAuth.getProfile();
    if (!customer) return;
    document.getElementById('customerName').value = customer.name;
    document.getElementById('customerPhone').value = customer.phone;
    document.getElementById('customerEmail').value = customer.email;

    closeCart();

    // Populate checkout items
    elements.checkoutItems.innerHTML = cart
        .map(item => `
            <div class="summary-item">
                <span>${escapeHTML(item.name)} × ${item.quantity}</span>
                <span>${CONFIG.CURRENCY_SYMBOL}${(item.price * item.quantity).toFixed(2)}</span>
            </div>
        `)
        .join('');

    elements.checkoutTotal.textContent = `${CONFIG.CURRENCY_SYMBOL}${calculateTotal().toFixed(2)}`;

    elements.checkoutModal.classList.add('active');
    elements.overlay.classList.add('active');
}

function closeCheckout() {
    elements.checkoutModal.classList.remove('active');
    elements.overlay.classList.remove('active');
}

function handleShareLocation() {
    const btn = document.getElementById('shareLocationBtn');
    const addressInput = document.getElementById('deliveryAddress');

    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }

    btn.classList.add('loading');
    btn.textContent = '📍 Locating...';

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            document.getElementById('latitude').value = lat;
            document.getElementById('longitude').value = lng;

            // Format link and append to address
            const currentVal = addressInput.value;
            const pinText = `[Pinned Location: ${lat}, ${lng}]`;

            if (!currentVal.includes('Pinned Location')) {
                addressInput.value = (currentVal ? currentVal + '\n' : '') + pinText;
            }

            btn.classList.remove('loading');
            btn.textContent = '📍 Location Pinned!';
            setTimeout(() => btn.textContent = '📍 Pin Location', 3000);
        },
        (error) => {
            console.error('Error getting location:', error);
            btn.classList.remove('loading');
            btn.textContent = '📍 Failed';
            alert('Unable to retrieve your location. Please ensure you are using HTTPS or localhost.');
            setTimeout(() => btn.textContent = '📍 Pin Location', 3000);
        }
    );
}

async function handleCheckout(e) {
    e.preventDefault();

    // Проверяем актуальную авторизацию повторно перед отправкой.
    if (!window.BaliAuth || !(await window.BaliAuth.requireProfile())) return;
    const customer = window.BaliAuth.getProfile();
    if (!customer) return;
    const eventDate = document.getElementById('eventSelect').value;
    const tableNumber = document.getElementById('tableNumber').value.trim();
    const bookingId = document.getElementById('bookingId').value.trim();
    if (!availableEvents.some(e => e.date === eventDate && e.preorderEnabled && e.closesAt?.toDate?.() > new Date())) {
        alert('Выберите доступное мероприятие из списка.');
        return;
    }
    if (!tableNumber && !bookingId) {
        alert('Укажите номер столика или ID бронирования.');
        return;
    }

    const formData = {
        customer_uid: customer.uid,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_email: customer.email,
        event_date: eventDate,
        table_number: tableNumber,
        booking_id: bookingId,
        notes: document.getElementById('orderNotes').value,
        items: cart,
        total_amount: calculateTotal()
    };

    // Disable button
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем...';

    const result = await placeOrder(formData);

    if (result.success) {
        // Show success modal
        elements.displayOrderId.textContent = result.order_id;

        // Store order ID for tracking
        localStorage.setItem('last_order_id', result.order_id);

        closeCheckout();
        showSuccess();

        // Clear cart
        clearCart();

        // Reset form
        elements.checkoutForm.reset();
        submitBtn.disabled = false;
        submitBtn.textContent = 'Отправить предзаказ';
    } else {
        alert('Failed to place order: ' + (result.error || 'Unknown error'));
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Place Order</span><span class="btn-icon">→</span>';
    }
}

function showSuccess() {
    elements.successModal.classList.add('active');
    elements.overlay.classList.add('active');
}

function closeSuccess() {
    elements.successModal.classList.remove('active');
    elements.overlay.classList.remove('active');
}

let myOrders = [];
window.addEventListener('bali:orders', ({detail}) => {
    myOrders = detail.orders;
    renderMyOrders();
});
window.addEventListener('bali:orders-error', ({detail}) => {
    const list = document.getElementById('myOrdersList');
    if(list) list.textContent = 'Не удалось получить предзаказы: ' + detail.message;
});
async function openMyOrders() {
    if (!window.BaliAuth || !(await window.BaliAuth.requireProfile())) return;
    closeCart();
    closeCheckout();
    document.getElementById('myOrdersModal').classList.add('active');
    document.getElementById('myOrdersModal').setAttribute('aria-hidden','false');
    elements.overlay.classList.add('active');
    renderMyOrders();
}
function closeMyOrders() {
    document.getElementById('myOrdersModal')?.classList.remove('active');
    document.getElementById('myOrdersModal')?.setAttribute('aria-hidden','true');
    if (!elements.checkoutModal.classList.contains('active') &&
        !elements.successModal.classList.contains('active') &&
        !elements.cartSidebar.classList.contains('active')) {
        elements.overlay.classList.remove('active');
    }
}
function renderMyOrders() {
    const list = document.getElementById('myOrdersList');
    if (!list) return;
    list.replaceChildren();
    if (!myOrders.length) {
        const empty = document.createElement('p');
        empty.textContent = 'Пока нет оформленных предзаказов.';
        list.append(empty);
        return;
    }
    const statusText = {
        pending:'Ожидает подтверждения',
        confirmed:'Подтверждён',
        completed:'Выполнен',
        cancelled:'Отменён'
    };
    for (const order of myOrders) {
        const card = document.createElement('article');
        card.className='bali-order-card';
        const head = document.createElement('h4');
        head.textContent='№ '+order.id+' · '+(statusText[order.status]||order.status);
        const meta = document.createElement('p');
        meta.textContent=order.eventDate+' · '+(order.tableNumber?'Столик '+order.tableNumber:'ID '+order.bookingId);
        const items = document.createElement('ul');
        for(const item of order.items||[]) {
            const li = document.createElement('li');
            li.textContent=item.name+' × '+item.quantity+' — '+(item.quantity*item.unitPrice).toFixed(2)+' BYN';
            items.append(li);
        }
        const sum = document.createElement('strong');
        sum.textContent='Итого: '+Number(order.total||0).toFixed(2)+' BYN';
        card.append(head,meta,items,sum);
        if(order.status === 'pending') {
            const actions = document.createElement('div');
            actions.className='bali-order-actions';
            const edit = document.createElement('button');
            edit.type='button';edit.textContent='Изменить';edit.className='auth-btn';
            edit.addEventListener('click',()=>editMyOrder(order.id));
            const cancel = document.createElement('button');
            cancel.type='button';cancel.textContent='Отменить';cancel.className='auth-outline-btn';
            cancel.addEventListener('click',async()=>{
                if(!confirm('Отменить этот предзаказ?'))return;
                cancel.disabled=true;
                try{await window.BaliOrders.cancel(order.id);}
                catch(error){alert(window.BaliOrders.errorText(error));cancel.disabled=false;}
            });
            actions.append(edit,cancel);card.append(actions);
        }
        list.append(card);
    }
}
async function editMyOrder(orderId) {
    try {
        const order = await window.BaliOrders.getOrderWithItems(orderId);
        if(order.status !== 'pending') throw new Error('Предзаказ уже подтверждён.');
        const ids = new Set(order.items.map(x=>x.id));
        if(order.items.length>12) throw new Error('В предзаказе больше 12 разных позиций.');
        const known = new Map(menuItems.filter(x=>x.available).map(x=>[x.id,x]));
        if([...ids].some(id=>!known.has(id)))
            throw new Error('Некоторые блюда больше недоступны. Обратитесь к администратору.');
        cart = order.items.map(line=>({
            id:line.id,name:known.get(line.id).name,price:known.get(line.id).price,
            quantity:line.quantity
        }));
        saveCart();updateCartUI();
        editingOrderId=orderId;
        closeMyOrders();
        await openCheckout();
        const select=document.getElementById('eventSelect');
        select.value=order.eventDate;
        document.getElementById('eventDate').value=order.eventDate;
        document.getElementById('tableNumber').value=order.tableNumber;
        document.getElementById('bookingId').value=order.bookingId;
        document.getElementById('orderNotes').value=order.notes||'';
    }catch(error){alert(window.BaliOrders?.errorText(error)||error.message);}
}

// ============================================
// UTILITIES
// ============================================

function closeAllModals() {
    closeCart();
    closeCheckout();
    closeSuccess();
    closeMyOrders();
}
