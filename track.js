// ============================================
// FOOD ORDERING SYSTEM - ORDER TRACKING
// ============================================

const CONFIG = {
    API_URL: 'YOUR_APPS_SCRIPT_DEPLOYMENT_URL',
    CURRENCY_SYMBOL: 'BYN',
    AUTO_REFRESH_INTERVAL: 30000 // 30 seconds
};

// State
let currentOrderId = null;
let refreshInterval = null;

// Status mapping
const STATUS_STEPS = {
    'pending': 0,
    'preparing': 1,
    'ready': 2,
    'out_for_delivery': 3,
    'delivered': 4
};

const STATUS_LABELS = {
    'pending': 'Pending',
    'preparing': 'Preparing',
    'ready': 'Ready',
    'out_for_delivery': 'Out for Delivery',
    'delivered': 'Delivered'
};

// DOM Elements
const elements = {
    orderIdInput: document.getElementById('orderIdInput'),
    trackBtn: document.getElementById('trackBtn'),
    trackInputContainer: document.getElementById('trackInputContainer'),
    orderStatusContainer: document.getElementById('orderStatusContainer'),
    errorMessage: document.getElementById('errorMessage'),
    errorText: document.getElementById('errorText'),
    trackAnotherBtn: document.getElementById('trackAnotherBtn'),

    // Order details
    statusBadge: document.getElementById('statusBadge'),
    orderIdDisplay: document.getElementById('orderIdDisplay'),
    orderDateDisplay: document.getElementById('orderDateDisplay'),
    customerNameDisplay: document.getElementById('customerNameDisplay'),
    customerPhoneDisplay: document.getElementById('customerPhoneDisplay'),
    deliveryAddressDisplay: document.getElementById('deliveryAddressDisplay'),
    orderItemsList: document.getElementById('orderItemsList'),
    orderTotalDisplay: document.getElementById('orderTotalDisplay'),
    orderNotesSection: document.getElementById('orderNotesSection'),
    orderNotesDisplay: document.getElementById('orderNotesDisplay')
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    attachEventListeners();
    checkForStoredOrderId();
});

function attachEventListeners() {
    elements.trackBtn.addEventListener('click', handleTrackOrder);
    elements.orderIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleTrackOrder();
        }
    });
    elements.trackAnotherBtn.addEventListener('click', resetTracking);
}

function checkForStoredOrderId() {
    // Check if there's a last order ID in localStorage
    const lastOrderId = localStorage.getItem('last_order_id');
    if (lastOrderId) {
        elements.orderIdInput.value = lastOrderId;
    }

    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const orderIdParam = urlParams.get('id');
    if (orderIdParam) {
        elements.orderIdInput.value = orderIdParam;
        handleTrackOrder();
    }
}

// ============================================
// API CALLS
// ============================================

async function fetchOrder(orderId) {
    try {
        const response = await fetch(`${CONFIG.API_URL}?path=order&id=${encodeURIComponent(orderId)}`, {
            redirect: 'follow'
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching order:', error);
        return { success: false, error: 'Unable to connect to server' };
    }
}

// ============================================
// TRACKING
// ============================================

async function handleTrackOrder() {
    const orderId = elements.orderIdInput.value.trim();

    if (!orderId) {
        showError('Please enter an order ID');
        return;
    }

    // Disable button during fetch
    elements.trackBtn.disabled = true;
    elements.trackBtn.innerHTML = '<span>Tracking...</span>';

    const result = await fetchOrder(orderId);

    elements.trackBtn.disabled = false;
    elements.trackBtn.innerHTML = '<span>Track Order</span><span class="btn-icon">🔍</span>';

    if (result.success && result.order) {
        const order = result.order;
        elements.trackInputContainer.classList.add('hidden');
        elements.orderStatusContainer.classList.remove('hidden');

        // Update progress steps
        updateProgressSteps(order.status);

        // Update status badge
        elements.statusBadge.textContent = STATUS_LABELS[order.status] || order.status;
        elements.statusBadge.className = `status-badge ${order.status}`;

        // Update order details
        elements.orderIdDisplay.textContent = order.order_id;
        elements.orderDateDisplay.textContent = formatDate(order.order_date);
        elements.customerNameDisplay.textContent = order.customer_name;
        elements.customerPhoneDisplay.textContent = order.customer_phone;
        elements.deliveryAddressDisplay.textContent = order.delivery_address;

        // Update items list
        elements.orderItemsList.innerHTML = order.items
            .map(item => `
            <div class="order-item-row">
                <div class="item-info">
                    <span class="item-qty">${item.quantity}×</span>
                    <span>${item.name}</span>
                </div>
                <span>${CONFIG.CURRENCY_SYMBOL}${(item.price * item.quantity).toFixed(2)}</span>
            </div>
        `)
            .join('');

        // Update total
        elements.orderTotalDisplay.textContent = `${CONFIG.CURRENCY_SYMBOL}${order.total_amount.toFixed(2)}`;

        // Update notes
        if (order.notes && order.notes.trim()) {
            elements.orderNotesSection.classList.remove('hidden');
            elements.orderNotesDisplay.textContent = order.notes;
        } else {
            elements.orderNotesSection.classList.add('hidden');
        }

        // Show QR Code
        const qrSection = document.getElementById('qrSection');
        const qrImg = document.getElementById('orderQrCode');
        if (qrSection && qrImg) {
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${order.order_id}`;
            qrSection.style.display = 'block';
        }
    } else {
        showError(result.error || 'Order not found');
        hideOrderStatus();
        stopAutoRefresh();
    }
}

function updateProgressSteps(currentStatus) {
    const currentStep = STATUS_STEPS[currentStatus] || 0;
    const steps = document.querySelectorAll('.progress-step');

    steps.forEach((step, index) => {
        step.classList.remove('active', 'completed');

        if (index < currentStep) {
            step.classList.add('completed');
        } else if (index === currentStep) {
            step.classList.add('active');
        }
    });
}

function resetTracking() {
    elements.trackInputContainer.classList.remove('hidden');
    elements.orderStatusContainer.classList.add('hidden');
    elements.orderIdInput.value = '';
    elements.orderIdInput.focus();
    currentOrderId = null;
    stopAutoRefresh();
    hideError();
}

// ============================================
// AUTO-REFRESH
// ============================================

function startAutoRefresh() {
    stopAutoRefresh(); // Clear any existing interval

    refreshInterval = setInterval(async () => {
        if (currentOrderId) {
            const result = await fetchOrder(currentOrderId);
            if (result.success && result.order) {
                displayOrderStatus(result.order);

                // Stop refreshing if delivered
                if (result.order.status === 'delivered') {
                    stopAutoRefresh();
                }
            }
        }
    }, CONFIG.AUTO_REFRESH_INTERVAL);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

// ============================================
// ERROR HANDLING
// ============================================

function showError(message) {
    elements.errorMessage.classList.remove('hidden');
    elements.errorText.textContent = message;
}

function hideError() {
    elements.errorMessage.classList.add('hidden');
}

function hideOrderStatus() {
    elements.orderStatusContainer.classList.add('hidden');
}

// ============================================
// UTILITIES
// ============================================

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return date.toLocaleDateString('en-US', options);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});
