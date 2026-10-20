// Keep saved tracking links usable. Orders now require the owner's Google login.
const destination = new URL('./index.html', location.href);
destination.searchParams.set('view', 'orders');
destination.hash = 'profile';
location.replace(destination.href);
