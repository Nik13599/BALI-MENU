const CONFIG = {
    API_URL: 'YOUR_APPS_SCRIPT_DEPLOYMENT_URL'
};

let html5QrcodeScanner = null;
let authToken = localStorage.getItem('delivery_token');

document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        showScanner();
    } else {
        showLogin();
    }

    // Event Listeners
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('manualSearchBtn').addEventListener('click', handleManualSearch);
    document.getElementById('markDeliveredBtn').addEventListener('click', markAsDelivered);
});

async function handleLogin() {
    const password = document.getElementById('deliveryPassword').value;
    if (!password) return alert('Please enter password');

    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                path: 'admin/login',
                password: password
            })
        });

        const data = await response.json();
        if (data.success) {
            authToken = data.token;
            localStorage.setItem('delivery_token', authToken);
            showScanner();
        } else {
            alert('Invalid Password');
        }
    } catch (e) {
        alert('Login failed: ' + e);
        console.error(e);
    }
}

function handleLogout() {
    authToken = null;
    localStorage.removeItem('delivery_token');
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
    }
    showLogin();
}

function showLogin() {
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('scannerSection').classList.add('hidden');
}

function showScanner() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('scannerSection').classList.remove('hidden');

    // Initialize Scanner
    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5QrcodeScanner(
            "reader", { fps: 10, qrbox: 250 }
        );
        html5QrcodeScanner.render(onScanSuccess);
    }
}

function onScanSuccess(decodedText, decodedResult) {
    // Stop scanning after success
    // html5QrcodeScanner.clear();
    document.getElementById('manualOrderId').value = decodedText;
    fetchOrderDetails(decodedText);
}

function handleManualSearch() {
    const id = document.getElementById('manualOrderId').value;
    if (id) fetchOrderDetails(id);
}

async function fetchOrderDetails(orderId) {
    try {
        // Use admin endpoint 'orders' to find specific order or 'order' endpoint
        // The public 'order' endpoint works with ID alone.
        const response = await fetch(`${CONFIG.API_URL}?path=order&id=${orderId}`);
        const data = await response.json();

        if (data.success && data.order) {
            displayOrder(data.order);
        } else {
            alert('Order not found');
            document.getElementById('orderDetails').classList.add('hidden');
        }
    } catch (e) {
        alert('Error fetching order');
        console.error(e);
    }
}

function displayOrder(order) {
    document.getElementById('dispId').textContent = order.order_id;
    document.getElementById('dispName').textContent = order.customer_name;
    document.getElementById('dispAddress').textContent = order.delivery_address;
    document.getElementById('dispStatus').textContent = order.status;

    // Map Link
    const mapLink = document.getElementById('mapLink');
    if (order.delivery_address.includes('Pinned Location')) {
        // Extract lat,long from "Pinned Location: lat, long]"
        const match = order.delivery_address.match(/Pinned Location: ([^\]]+)/);
        if (match) {
            mapLink.href = `https://www.google.com/maps?q=${match[1].trim()}`;
            mapLink.style.display = 'block';
            mapLink.textContent = '📍 Open Exact Location in Maps';
        } else {
            mapLink.style.display = 'none';
        }
    } else {
        // Generic search
        mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`;
        mapLink.style.display = 'block';
        mapLink.textContent = '📍 Search Address in Maps';
    }

    document.getElementById('orderDetails').classList.remove('hidden');

    // Setup Mark Delivered button context
    document.getElementById('markDeliveredBtn').dataset.orderId = order.order_id;
}

async function markAsDelivered() {
    const orderId = document.getElementById('markDeliveredBtn').dataset.orderId;
    if (!confirm(`Mark Order ${orderId} as Delivered?`)) return;

    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                path: 'order/update',
                token: authToken, // Need admin token for updates
                order_id: orderId,
                status: 'delivered'
            })
        });

        const data = await response.json();
        if (data.success) {
            alert('Order marked as DELIVERED!');
            fetchOrderDetails(orderId); // Refresh
        } else {
            alert('Failed: ' + data.error);
        }
    } catch (e) {
        alert('Error updating status');
    }
}
