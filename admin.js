// ============================================
// FOOD ORDERING SYSTEM - ADMIN PANEL
// ============================================

const CONFIG = {
    API_URL: 'YOUR_APPS_SCRIPT_DEPLOYMENT_URL',
    CURRENCY_SYMBOL: 'BYN',
    AUTO_REFRESH_INTERVAL: 30000 // 30 seconds
};

// State
let authToken = null;
let allOrders = [];
let allMenuItems = [];
let currentFilter = 'all';
let currentTab = 'orders';
let refreshInterval = null;
let currentOrder = null;
let isEditMode = false;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});

function checkAuth() {
    const storedToken = localStorage.getItem('admin_token');

    if (storedToken) {
        authToken = storedToken;
        showDashboard();
        initializeDashboard();
    } else {
        showLogin();
    }
}

function showLogin() {
    document.getElementById('loginContainer').classList.remove('hidden');
    document.getElementById('adminDashboard').classList.add('hidden');

    document.getElementById('loginForm').addEventListener('submit', handleLogin);
}

function showDashboard() {
    document.getElementById('loginContainer').classList.add('hidden');
    document.getElementById('adminDashboard').classList.remove('hidden');
}

function initializeDashboard() {
    attachDashboardListeners();
    loadOrders();
    loadMenuItems();
    startAutoRefresh();
}

function attachDashboardListeners() {
    // Tab navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', handleTabChange);
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Refresh
    document.getElementById('refreshBtn').addEventListener('click', handleRefresh);

    // Order filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', handleFilterChange);
    });

    // Menu management
    document.getElementById('addMenuItemBtn').addEventListener('click', () => openMenuItemModal());
    document.getElementById('closeMenuModal').addEventListener('click', closeMenuModal);
    document.getElementById('cancelMenuEdit').addEventListener('click', closeMenuModal);
    document.getElementById('menuItemForm').addEventListener('submit', handleMenuItemSubmit);

    // Order modal - editing
    document.getElementById('closeOrderModal').addEventListener('click', closeOrderModal);
    document.getElementById('toggleEditMode').addEventListener('click', toggleOrderEditMode);
    document.getElementById('saveOrderBtn').addEventListener('click', saveOrderChanges);
    document.getElementById('cancelOrderEdit').addEventListener('click', cancelOrderEdit);

    // Settings
    document.getElementById('settingsForm').addEventListener('submit', handleSettingsSave);
    document.getElementById('passwordForm').addEventListener('submit', handlePasswordChange);

    // Overlay
    document.getElementById('overlay').addEventListener('click', closeAllModals);
}

// ============================================
// AUTHENTICATION
// ============================================



async function handleLogin(e) {
    e.preventDefault();


    const password = document.getElementById('adminPassword').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const errorEl = document.getElementById('loginError');

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Logging in...</span>';
    errorEl.classList.add('hidden');

    try {


        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' }, // Use text/plain to avoid preflight OPTIONS request if possible for simple requests, though body is JSON
            body: JSON.stringify({
                path: 'admin/login',
                password: password
            })
        });



        const text = await response.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error('Server returned non-JSON response: ' + text.substring(0, 50));
        }

        if (data.success && data.token) {

            authToken = data.token;
            localStorage.setItem('admin_token', authToken);
            showDashboard();
            initializeDashboard();
        } else {

            errorEl.textContent = data.error || 'Login failed';
            errorEl.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Login</span><span>→</span>';
        }
    } catch (error) {

        console.error('Login error:', error);
        errorEl.textContent = 'Connection error: ' + error.message;
        errorEl.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Login</span><span>→</span>';
    }
}

function handleLogout() {
    localStorage.removeItem('admin_token');
    authToken = null;
    stopAutoRefresh();
    showLogin();

    // Reset form
    document.getElementById('adminPassword').value = '';
}

// Order Editing Functions
function toggleOrderEditMode() {
    isEditMode = !isEditMode;
    const btn = document.getElementById('toggleEditMode');
    const footer = document.getElementById('orderModalFooter');
    const editText = document.getElementById('editModeText');

    if (isEditMode) {
        btn.classList.add('active');
        editText.textContent = 'Cancel Edit';
        footer.classList.remove('hidden');
        makeOrderEditable(currentOrder);
    } else {
        btn.classList.remove('active');
        editText.textContent = 'Edit';
        footer.classList.add('hidden');
        displayOrderDetails(currentOrder);
    }
}

function makeOrderEditable(order) {
    const modalBody = document.getElementById('orderModalBody');
    modalBody.innerHTML = `
        <div class="order-detail-section">
            <h4>Order Information</h4>
            <div class="detail-row">
                <span class="detail-label">Order ID:</span>
                <input class="editable-field" value="${order.order_id}" disabled>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <select class="editable-field" id="editStatus">
                    <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="preparing" ${order.status === 'preparing' ? 'selected' : ''}>Preparing</option>
                    <option value="ready" ${order.status === 'ready' ? 'selected' : ''}>Ready</option>
                    <option value="out_for_delivery" ${order.status === 'out_for_delivery' ? 'selected' : ''}>Out for Delivery</option>
                    <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                </select>
            </div>
        </div>
        
        <div class="order-detail-section">
            <h4>Customer Details</h4>
            <div class="detail-row">
                <span class="detail-label">Name:</span>
                <input class="editable-field" id="editCustomerName" value="${order.customer_name}">
            </div>
            <div class="detail-row">
                <span class="detail-label">Phone:</span>
                <input class="editable-field" id="editCustomerPhone" value="${order.customer_phone}">
            </div>
            <div class="detail-row">
                <span class="detail-label">Address:</span>
                <textarea class="editable-field editable-textarea" id="editDeliveryAddress">${order.delivery_address}</textarea>
            </div>
        </div>
        
        <div class="order-detail-section">
            <h4>Order Items</h4>
            ${order.items.map(item => `
                <div class="detail-row">
                    <span>${item.quantity}× ${item.name}</span>
                    <span>${CONFIG.CURRENCY_SYMBOL}${(item.price * item.quantity).toFixed(2)}</span>
                </div>
            `).join('')}
            <div class="detail-row" style="font-weight: 700; border-top: 2px solid var(--border-color); margin-top: 0.5rem; padding-top: 0.5rem;">
                <span>Total:</span>
                <span>${CONFIG.CURRENCY_SYMBOL}${order.total_amount.toFixed(2)}</span>
            </div>
        </div>
        
        <div class="order-detail-section">
            <h4>Special Instructions</h4>
            <textarea class="editable-field editable-textarea" id="editNotes">${order.notes || ''}</textarea>
        </div>
    `;
}

async function saveOrderChanges() {
    const updatedOrder = {
        path: 'order/update',
        token: authToken,
        order_id: currentOrder.order_id,
        customer_name: document.getElementById('editCustomerName').value,
        customer_phone: document.getElementById('editCustomerPhone').value,
        delivery_address: document.getElementById('editDeliveryAddress').value,
        status: document.getElementById('editStatus').value,
        notes: document.getElementById('editNotes').value
    };

    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(updatedOrder)
        });

        const data = await response.json();

        if (data.success) {
            alert('Order updated successfully!');
            isEditMode = false;
            closeOrderModal();
            loadOrders();
        } else {
            alert('Failed to update order: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error updating order:', error);
        alert('Failed to update order');
    }
}

function cancelOrderEdit() {
    isEditMode = false;
    document.getElementById('toggleEditMode').classList.remove('active');
    document.getElementById('editModeText').textContent = 'Edit';
    document.getElementById('orderModalFooter').classList.add('hidden');
    displayOrderDetails(currentOrder);
}

function displayOrderDetails(order) {
    const modalBody = document.getElementById('orderModalBody');
    modalBody.innerHTML = `
        <div class="order-detail-section">
            <h4>Order Information</h4>
            <div class="detail-row">
                <span class="detail-label">Order ID:</span>
                <span class="detail-value">${order.order_id}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Date:</span>
                <span class="detail-value">${formatDate(order.order_date)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value">${order.status}</span>
            </div>
        </div>
        
        <div class="order-detail-section">
            <h4>Customer Details</h4>
            <div class="detail-row">
                <span class="detail-label">Name:</span>
                <span class="detail-value">${order.customer_name}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Phone:</span>
                <span class="detail-value">${order.customer_phone}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Address:</span>
                <span class="detail-value">${order.delivery_address}</span>
            </div>
        </div>
        
        <div class="order-detail-section">
            <h4>Order Items</h4>
            ${order.items.map(item => `
                <div class="detail-row">
                    <span>${item.quantity}× ${item.name}</span>
                    <span>${CONFIG.CURRENCY_SYMBOL}${(item.price * item.quantity).toFixed(2)}</span>
                </div>
            `).join('')}
            <div class="detail-row" style="font-weight: 700; border-top: 2px solid var(--border-color); margin-top: 0.5rem; padding-top: 0.5rem;">
                <span>Total:</span>
                <span>${CONFIG.CURRENCY_SYMBOL}${order.total_amount.toFixed(2)}</span>
            </div>
        </div>
        
        ${order.notes ? `
            <div class="order-detail-section">
                <h4>Special Instructions</h4>
                <p style="color: var(--text-secondary);">${order.notes}</p>
            </div>
        ` : ''}
    `;
}

// Password Change
async function handlePasswordChange(e) {
    e.preventDefault();

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        alert('New passwords do not match!');
        return;
    }

    if (newPassword.length < 4) {
        alert('Password must be at least 4 characters long!');
        return;
    }

    try {
        // First verify current password
        const verifyResponse = await fetch(CONFIG.API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                path: 'admin/login',
                password: currentPassword
            })
        });

        const verifyData = await verifyResponse.json();

        if (!verifyData.success) {
            alert('Current password is incorrect!');
            return;
        }

        // Update password
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                path: 'config/update',
                token: authToken,
                updates: {
                    admin_password: newPassword
                }
            })
        });

        const data = await response.json();

        if (data.success) {
            alert('Password changed successfully! Please login again.');
            handleLogout();
        } else {
            alert('Failed to change password: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error changing password:', error);
        alert('Failed to change password');
    }
}

// Rest of the existing functions remain the same...
// (TAB MANAGEMENT, ORDERS, MENU, SETTINGS, etc.)

function handleTabChange(e) {
    const tabName = e.currentTarget.dataset.tab;

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    e.currentTarget.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(`${tabName}Tab`).classList.add('active');

    const titles = { orders: 'Orders Management', menu: 'Menu Management', settings: 'Settings' };
    document.getElementById('pageTitle').textContent = titles[tabName];

    currentTab = tabName;

    if (tabName === 'menu') loadMenuItems();
    else if (tabName === 'settings') loadSettings();
}

function handleRefresh() {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spinning');

    if (currentTab === 'orders') {
        loadOrders().finally(() => setTimeout(() => btn.classList.remove('spinning'), 500));
    } else if (currentTab === 'menu') {
        loadMenuItems().finally(() => setTimeout(() => btn.classList.remove('spinning'), 500));
    }
}

async function loadOrders() {
    try {
        const response = await fetch(`${CONFIG.API_URL}?path=orders&token=${encodeURIComponent(authToken)}&t=${new Date().getTime()}`, {
            redirect: 'follow'
        });
        const data = await response.json();

        if (data.success && data.orders) {
            allOrders = data.orders;
            updateOrderCounts();
            displayOrders();
        } else if (data.error === 'Unauthorized') {
            handleLogout();
        }
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

function updateOrderCounts() {
    const counts = { all: allOrders.length, pending: 0, preparing: 0, ready: 0, out_for_delivery: 0, delivered: 0 };

    allOrders.forEach(order => {
        if (counts.hasOwnProperty(order.status)) counts[order.status]++;
    });

    document.getElementById('countAll').textContent = counts.all;
    document.getElementById('countPending').textContent = counts.pending;
    document.getElementById('countPreparing').textContent = counts.preparing;
    document.getElementById('countReady').textContent = counts.ready;
    document.getElementById('countOutForDelivery').textContent = counts.out_for_delivery;
    document.getElementById('countDelivered').textContent = counts.delivered;
    document.getElementById('pendingCount').textContent = counts.pending;
}

function displayOrders() {
    const tbody = document.getElementById('ordersTableBody');
    const filtered = currentFilter === 'all' ? allOrders : allOrders.filter(order => order.status === currentFilter);

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-cell"><p>No orders found</p></td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(order => `
        <tr>
            <td class="order-id-cell">${order.order_id}</td>
            <td>${formatDate(order.order_date)}</td>
            <td class="customer-cell">${order.customer_name}<br><small>${order.customer_phone}</small></td>
            <td class="items-preview">${getItemsPreview(order.items)}</td>
            <td class="amount-cell">${CONFIG.CURRENCY_SYMBOL}${order.total_amount.toFixed(2)}</td>
            <td>
                <select class="status-select ${order.status}" data-order-id="${order.order_id}">
                    <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="preparing" ${order.status === 'preparing' ? 'selected' : ''}>Preparing</option>
                    <option value="ready" ${order.status === 'ready' ? 'selected' : ''}>Ready</option>
                    <option value="out_for_delivery" ${order.status === 'out_for_delivery' ? 'selected' : ''}>Out for Delivery</option>
                    <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                </select>
            </td>
            <td><button class="view-btn" data-order-id="${order.order_id}">View</button></td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.status-select').forEach(select => select.addEventListener('change', handleStatusChange));
    tbody.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', handleViewOrder));
}

function handleFilterChange(e) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    e.currentTarget.classList.add('active');
    currentFilter = e.currentTarget.dataset.status;
    displayOrders();
}

async function handleStatusChange(e) {
    const orderId = e.target.dataset.orderId;
    const newStatus = e.target.value;

    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ path: 'order/update', token: authToken, order_id: orderId, status: newStatus })
        });

        const data = await response.json();

        if (data.success) {
            const order = allOrders.find(o => o.order_id === orderId);
            if (order) order.status = newStatus;
            updateOrderCounts();
            displayOrders();
        } else {
            alert('Failed to update status: ' + (data.error || 'Unknown error'));
            loadOrders();
        }
    } catch (error) {
        console.error('Error updating status:', error);
        alert('Failed to update status');
    }
}

function handleViewOrder(e) {
    const orderId = e.target.dataset.orderId;
    const order = allOrders.find(o => o.order_id === orderId);

    if (!order) return;

    currentOrder = order;
    isEditMode = false;
    document.getElementById('toggleEditMode').classList.remove('active');
    document.getElementById('editModeText').textContent = 'Edit';
    document.getElementById('orderModalFooter').classList.add('hidden');

    displayOrderDetails(order);

    document.getElementById('orderModal').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

function closeOrderModal() {
    document.getElementById('orderModal').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
}

async function loadMenuItems() {
    try {
        const response = await fetch(`${CONFIG.API_URL}?path=menu&t=${new Date().getTime()}`, {
            redirect: 'follow'
        });
        const data = await response.json();

        if (data.success && data.items) {
            allMenuItems = data.items;
            displayMenuItems();
        }
    } catch (error) {
        console.error('Error loading menu items:', error);
    }
}

function displayMenuItems() {
    const grid = document.getElementById('menuItemsGrid');
    if (!grid) return;

    grid.innerHTML = allMenuItems.map(item => `
        <div class="admin-menu-item">
            <img src="${item.image_url || 'https://via.placeholder.com/400x200?text=No+Image'}" alt="${item.name}">
            <div class="admin-menu-item-content">
                <span class="item-category">${item.category}</span>
                <span class="item-availability ${item.available ? 'available' : 'unavailable'}">
                    ${item.available ? 'Available' : 'Unavailable'}
                </span>
                <div class="item-header">
                    <h3 class="item-name">${item.name}</h3>
                    <span class="item-price">${CONFIG.CURRENCY_SYMBOL}${item.price.toFixed(2)}</span>
                </div>
                <p class="item-description">${item.description}</p>
                <div class="item-actions">
                    <button class="edit-item-btn" data-id="${item.id}">Edit</button>
                    <button class="delete-item-btn" data-id="${item.id}">Delete</button>
                </div>
            </div>
        </div>
    `).join('');

    grid.querySelectorAll('.edit-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemId = parseInt(e.target.dataset.id);
            const item = allMenuItems.find(i => i.id === itemId);
            if (item) openMenuItemModal(item);
        });
    });

    grid.querySelectorAll('.delete-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemId = parseInt(e.target.dataset.id);
            handleDeleteMenuItem(itemId);
        });
    });
}

function openMenuItemModal(item = null) {
    const modal = document.getElementById('menuItemModal');
    const title = document.getElementById('menuModalTitle');
    const form = document.getElementById('menuItemForm');

    if (item) {
        title.textContent = 'Edit Menu Item';
        document.getElementById('menuItemId').value = item.id;
        document.getElementById('itemName').value = item.name;
        document.getElementById('itemDescription').value = item.description;
        document.getElementById('itemPrice').value = item.price;
        document.getElementById('itemCategory').value = item.category;
        document.getElementById('itemImageUrl').value = item.image_url || '';
        document.getElementById('itemAvailable').checked = item.available;
    } else {
        title.textContent = 'Add Menu Item';
        form.reset();
        document.getElementById('menuItemId').value = '';
    }

    modal.classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

function closeMenuModal() {
    document.getElementById('menuItemModal').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
}

async function handleMenuItemSubmit(e) {
    e.preventDefault();

    const itemId = document.getElementById('menuItemId').value;
    const isEdit = !!itemId;

    const itemData = {
        path: isEdit ? 'menu/update' : 'menu/create',
        token: authToken,
        name: document.getElementById('itemName').value,
        description: document.getElementById('itemDescription').value,
        price: parseFloat(document.getElementById('itemPrice').value),
        category: document.getElementById('itemCategory').value,
        image_url: document.getElementById('itemImageUrl').value,
        available: document.getElementById('itemAvailable').checked
    };

    if (isEdit) itemData.id = parseInt(itemId);

    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(itemData)
        });

        const data = await response.json();

        if (data.success) {
            closeMenuModal();
            loadMenuItems();
        } else {
            alert('Failed to save menu item: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving menu item:', error);
        alert('Failed to save menu item: ' + error.message);
    }
}

async function handleDeleteMenuItem(itemId) {
    if (!confirm('Are you sure you want to delete this menu item?')) return;

    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ path: 'menu/delete', token: authToken, itemId: itemId })
        });

        const data = await response.json();

        if (data.success) {
            loadMenuItems();
        } else {
            alert('Failed to delete item: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error deleting item:', error);
        alert('Failed to delete item');
    }
}

async function loadSettings() {
    try {
        const response = await fetch(`${CONFIG.API_URL}?path=config&t=${new Date().getTime()}`, {
            redirect: 'follow'
        });
        const data = await response.json();

        if (data.success && data.config) {
            document.getElementById('restaurantName').value = data.config.restaurant_name || '';
            document.getElementById('restaurantPhone').value = data.config.contact_phone || '';
            document.getElementById('restaurantEmail').value = data.config.contact_email || '';
            document.getElementById('restaurantAddress').value = data.config.address || '';
            document.getElementById('logoUrl').value = data.config.logo_url || '';
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function handleSettingsSave(e) {
    e.preventDefault();

    const updates = {
        restaurant_name: document.getElementById('restaurantName').value,
        contact_phone: document.getElementById('restaurantPhone').value,
        contact_email: document.getElementById('restaurantEmail').value,
        address: document.getElementById('restaurantAddress').value,
        logo_url: document.getElementById('logoUrl').value
    };

    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ path: 'config/update', token: authToken, updates: updates })
        });

        const data = await response.json();

        if (data.success) {
            alert('Settings saved successfully!');
        } else {
            alert('Failed to save settings: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('Failed to save settings');
    }
}

function startAutoRefresh() {
    stopAutoRefresh();
    refreshInterval = setInterval(() => {
        if (currentTab === 'orders' && authToken) loadOrders();
    }, CONFIG.AUTO_REFRESH_INTERVAL);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getItemsPreview(items) {
    if (!items || items.length === 0) return 'No items';
    const preview = items.slice(0, 2).map(item => `${item.quantity}× ${item.name}`).join(', ');
    return items.length > 2 ? `${preview}, +${items.length - 2} more` : preview;
}

function closeAllModals() {
    closeOrderModal();
    closeMenuModal();
}

window.addEventListener('beforeunload', () => stopAutoRefresh());
