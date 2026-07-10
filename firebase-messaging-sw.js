// Firebase Cloud Messaging Service Worker
// Required for background push notifications on the customer website.
// Must be served at /firebase-messaging-sw.js (root of the domain).

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyBcmBnSMiMJui28q9AlBvoVVHH6wmbgm_c",
  authDomain:        "galaxyride.in",
  projectId:         "galaxyride-4f219",
  storageBucket:     "galaxyride-4f219.firebasestorage.app",
  messagingSenderId: "351465763874",
  appId:             "1:351465763874:web:e2f89a58a686661566467b",
});

const messaging = firebase.messaging();

// Handle background messages (app is not in focus)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message:', payload);
  const { title = 'Galaxy Ride', body = '' } = payload.notification || {};
  self.registration.showNotification(title, {
    body,
    icon:  '/assets/logo.png',
    badge: '/assets/badge.png',
    data:  payload.data || {},
  });
});

// Notification click — open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('https://galaxyride.in')
  );
});
