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
    if (!BALI_API_CONFIGURED) {
        elements.menuGrid.innerHTML = '<div class="loading-state"><p>Меню BALI появится здесь после подключения каталога и цен.</p></div>';
        return;
    }
    try {
        showLoading();

        const response = await fetch(`${CONFIG.API_URL}?path=menu`);
        const data = await response.json();

        if (data.success) {
            menuItems = data.items;
            displayMenuItems(menuItems);
        } else {
            showError('Failed to load menu items');
        }
    } catch (error) {
        console.error('Error fetching menu:', error);
        showError('Unable to connect to server');
    }
}

async function placeOrder(orderData) {
    // Заказы пока заблокированы на сервере до проверки ID-токенов и прав.
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(CONFIG.API_URL)) {
        return { success: false, error: 'Приём предзаказов пока не подключён. Настройте безопасный сервер.' };
    }
    try {
        const token = await window.BaliAuth?.getIdToken();
        if (!token) return { success: false, error: 'Необходимо войти через Google' };
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify({
                path: 'order/create',
                id_token: token,
                ...orderData
            })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error placing order:', error);
        return { success: false, error: 'Unable to connect to server' };
    }
}

// ============================================
// MENU DISPLAY
// ============================================

function displayMenuItems(items) {
    if (!items || items.length === 0) {
        elements.menuGrid.innerHTML = `
            <div class="loading-state">
                <p>No menu items available</p>
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

    // Attach add to cart listeners
    document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemId = parseInt(e.currentTarget.dataset.id);
            addToCart(itemId);
        });
    });
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
                    : `<button class="add-to-cart-btn" data-id="${id}">В корзину +</button>`
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

function addToCart(itemId) {
    const item = menuItems.find(i => i.id === itemId);
    if (!item) return;

    const existingItem = cart.find(i => i.id === itemId);

    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: 1
        });
    }

    saveCart();
    updateCartUI();

    // Brief animation feedback
    const btn = document.querySelector(`[data-id="${itemId}"]`);
    if (btn) {
        btn.style.transform = 'scale(0.95)';
        setTimeout(() => btn.style.transform = '', 100);
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
    const eventDate = document.getElementById('eventDate').value;
    const tableNumber = document.getElementById('tableNumber').value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !tableNumber) {
        alert('Укажите дату мероприятия и номер столика.');
        return;
    }

    const formData = {
        customer_uid: customer.uid,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_email: customer.email,
        event_date: eventDate,
        table_number: tableNumber,
        notes: document.getElementById('orderNotes').value,
        items: cart,
        total_amount: calculateTotal()
    };

    // Disable button
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Placing Order...</span>';

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
        submitBtn.innerHTML = '<span>Place Order</span><span class="btn-icon">→</span>';
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

// ============================================
// UTILITIES
// ============================================

function closeAllModals() {
    closeCart();
    closeCheckout();
    closeSuccess();
}
