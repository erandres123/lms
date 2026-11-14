/* Public Firebase web config (safe to ship). Served from the app root. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDUiuLGdwFmx2IMqfyInaAxaK3KCmEJkvY',
  authDomain: 'my-lms-f144c.firebaseapp.com',
  projectId: 'my-lms-f144c',
  storageBucket: 'my-lms-f144c.firebasestorage.app',
  messagingSenderId: '621717584327',
  appId: '1:621717584327:web:ba3d90bb9460dddc8001e2',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // The SDK already displays messages that carry a notification payload.
  if (payload.notification) return;
  const data = payload.data || {};
  self.registration.showNotification(data.title || 'LMS', {
    body: data.body || '',
    icon: '/icons/Icon-192.png',
    badge: '/icons/Icon-192.png',
    data,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          client.navigate('/inbox');
          return client.focus();
        }
      }
      return clients.openWindow('/inbox');
    }),
  );
});
