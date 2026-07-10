/**
 * firebase.js — Galaxy Ride Firebase initialization (ES module)
 * Exposes auth, Firestore db, and helper functions to window for app.js
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
  updateDoc,
  deleteField,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';
import {
  getMessaging,
  getToken as getMessagingToken,
  onMessage as onMessagingMessage,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js';

// ── Config ───────────────────────────────────────────────────────────────────
// authDomain is set to galaxyride.in so the Google Sign-In popup handler
// runs under /__/auth/handler on our own domain rather than on
// firebaseapp.com. That path must be reverse-proxied to
// https://galaxyride-4f219.firebaseapp.com/__/auth/* at the web-server
// level — see the "/__/auth/*" redirect in netlify.toml (Netlify) and
// the ProxyPass block in deploy/vps/apache-galaxyride.conf.snippet
// (VPS/Apache). Also requires galaxyride.in to be listed under Firebase
// Console → Authentication → Settings → Authorized domains.
const firebaseConfig = {
  apiKey:            window.FIREBASE_API_KEY            || "AIzaSyBcmBnSMiMJui28q9AlBvoVVHH6wmbgm_c",
  authDomain:        window.FIREBASE_AUTH_DOMAIN        || "galaxyride.in",
  projectId:         window.FIREBASE_PROJECT_ID         || "galaxyride-4f219",
  storageBucket:     window.FIREBASE_STORAGE_BUCKET     || "galaxyride-4f219.firebasestorage.app",
  messagingSenderId: window.FIREBASE_MESSAGING_SENDER_ID || "351465763874",
  appId:             window.FIREBASE_APP_ID             || "1:351465763874:web:e2f89a58a686661566467b",
};

// ── Initialize ────────────────────────────────────────────────────────────────
const app            = initializeApp(firebaseConfig);
const auth           = getAuth(app);
const db             = getFirestore(app);
const storage        = getStorage(app);
const googleProvider = new GoogleAuthProvider();
let   messaging      = null;

// Initialize FCM messaging (only works in browsers that support Service Workers)
try {
  messaging = getMessaging(app);
} catch (_) {
  // Safari / older browsers that don't support FCM — silently skip
}

// Persist login across page reloads
setPersistence(auth, browserLocalPersistence).catch(console.warn);

// ── FCM token helper ──────────────────────────────────────────────────────────
const FCM_VAPID_KEY = 'YOUR_VAPID_KEY'; // Replace with your VAPID public key from Firebase Console

async function fbRequestFcmToken(userId) {
  if (!messaging) return null;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    // Register the service worker before requesting token
    let swReg;
    try {
      swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    } catch (swErr) {
      console.warn('[FCM] SW register failed:', swErr.message);
    }

    const token = await getMessagingToken(messaging, {
      vapidKey:          FCM_VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (token && userId) {
      // Save token to users/{uid}
      await setDoc(doc(db, 'users', userId), {
        fcmToken:          token,
        fcmTokenUpdatedAt: serverTimestamp(),
      }, { merge: true });
      console.log('[FCM] Token saved for user:', userId);
    }

    // Listen for foreground messages
    onMessagingMessage(messaging, (payload) => {
      console.log('[FCM] Foreground message:', payload);
      const notif = payload.notification;
      if (notif && typeof Notification !== 'undefined') {
        new Notification(notif.title || 'Galaxy Ride', { body: notif.body, icon: '/assets/logo.png' });
      }
    });

    return token;
  } catch (e) {
    console.warn('[FCM] Token request failed (non-fatal):', e.message);
    return null;
  }
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

/**
 * Create or merge user profile doc in Firestore → users/{uid}
 */
async function fbSaveUserProfile(user, extra = {}) {
  try {
    await setDoc(
      doc(db, 'users', user.uid),
      {
        uid:         user.uid,
        email:       user.email,
        displayName: user.displayName || '',
        photoURL:    user.photoURL    || '',
        updatedAt:   serverTimestamp(),
        ...extra,
      },
      { merge: true }
    );
  } catch (e) {
    console.warn('Profile save failed:', e.message);
  }
}

/**
 * Save a confirmed booking to Firestore
 * → bookings/{bookingId}
 * → users/{userId}/bookings/{bookingId}
 * → stats/global (increment counter)
 */
async function fbSaveBooking(booking) {
  try {
    // Full booking record
    await setDoc(doc(db, 'bookings', booking.bookingId), {
      ...booking,
      // Driver app Customer Duty orders/filters on `createdAt` as a
      // Firestore Timestamp — overwrite whatever string was on `booking`
      // (see netlify/functions/booking.js for the matching server-side fix).
      createdAt:      serverTimestamp(),
      createdAtIso:   booking.createdAt || new Date().toISOString(),
      tripType:       booking.type || booking.tripType || 'oneway',
      createdServer:  serverTimestamp(),
    });

    // Reference in user sub-collection
    await setDoc(
      doc(db, 'users', booking.userId, 'bookings', booking.bookingId),
      {
        bookingId:  booking.bookingId,
        status:     booking.status || 'confirmed',
        vehicle:    booking.vehicle,
        pickup:     booking.pickup,
        drop:       booking.drop       || '',
        date:       booking.date,
        fare:       booking.fare,
        createdAt:  booking.createdAt,
      }
    );

    // Increment global counter
    await setDoc(
      doc(db, 'stats', 'global'),
      { totalBookings: increment(1) },
      { merge: true }
    );
  } catch (e) {
    console.warn('Booking save failed:', e.message);
    throw e;
  }
}

/**
 * Save trip to trip_requests collection → admin app reads this live
 * Schema matches what the admin app expects
 */
async function fbSaveTripRequest(trip) {
  try {
    await setDoc(doc(db, 'trip_requests', trip.tripId), {
      tripId:        trip.tripId,
      customerName:  trip.customerName  || '',
      customerPhone: trip.customerPhone || '',
      customerEmail: trip.customerEmail || '',
      pickup:        trip.pickup        || '',
      pickupAddress: trip.pickup        || '',
      pickupLat:     trip.pickupLat     || 0,
      pickupLng:     trip.pickupLng     || 0,
      drop:          trip.drop          || '',
      dropAddress:   trip.drop          || '',
      dropLat:       trip.dropLat       || 0,
      dropLng:       trip.dropLng       || 0,
      tripType:      trip.tripType      || 'oneway',
      vehicleType:   trip.vehicleType   || '',
      date:          trip.date          || '',
      time:          trip.time          || '',
      passengers:    trip.passengers    || 1,
      estimatedFare: trip.estimatedFare || 0,
      fare:          trip.estimatedFare || 0,
      paymentMethod: trip.paymentMethod || 'cash',
      paymentStatus: trip.paymentStatus || 'cash_pending',
      status:        'pending',
      driverId:      '',
      driverName:    '',
      distanceKm:    trip.distanceKm    || 0,
      createdAt:     serverTimestamp(),
    });
    console.log('[Firebase] trip_requests saved:', trip.tripId);
  } catch (e) {
    console.error('[Firebase] trip_requests save failed:', e.message);
    throw e;
  }
}

async function fbSaveNotification(notification) {
  try {
    const ref = doc(db, 'notifications', notification.id || notification.bookingId + '_new');
    await setDoc(ref, {
      ...notification,
      createdAt: serverTimestamp(),
      read: false,
    });
  } catch (e) {
    console.warn('[Firebase] notification save failed (non-fatal):', e.message);
  }
}

/**
 * Listen to a trip_request document in real-time.
 * Returns an unsubscribe function — call it to stop listening.
 */
function fbListenToTripRequest(tripId, callback) {
  const unsubscribe = onSnapshot(
    doc(db, 'trip_requests', tripId),
    (snap) => {
      if (snap.exists()) {
        callback(snap.data());
      }
    },
    (err) => console.error('[Firebase] onSnapshot error:', err.message)
  );
  return unsubscribe;
}

/**
 * Travel Services — log a redirect/search analytics event.
 * Collection: travelRedirectAnalytics  (NO booking record is created)
 * Returns the new doc id, or null on failure (analytics must never block UX).
 */
async function fbSaveTravelRedirect(payload) {
  try {
    const doc0 = {
      serviceType:    payload.serviceType    || '',   // bus | train | flight | hotel
      eventType:      payload.eventType      || 'search', // search | redirect
      searchQuery:    payload.searchQuery    || {},    // {from,to,date,...}
      routeKey:       payload.routeKey       || '',    // "Chennai→Madurai" for aggregation
      redirectPartner:payload.redirectPartner|| '',    // redbus | irctc | ...
      redirectUrl:    payload.redirectUrl    || '',
      deviceType:     payload.deviceType     || 'desktop',
      userId:         payload.userId         || null,
      timestamp:      serverTimestamp(),               // searchTime
      createdAt:      serverTimestamp(),
    };
    // Flat structured fields (e.g. flight: origin, destination, departureDate,
    // returnDate, passengers) stored top-level for easy querying / reporting.
    if (payload.details && typeof payload.details === 'object') {
      Object.assign(doc0, payload.details);
    }
    const ref = await addDoc(collection(db, 'travelRedirectAnalytics'), doc0);
    console.log('[Travel] analytics logged:', payload.serviceType, payload.eventType, ref.id);
    return ref.id;
  } catch (e) {
    console.warn('[Travel] analytics log failed (non-blocking):', e.message);
    return null;
  }
}

/**
 * Travel Services — fetch recent analytics events for the admin dashboard.
 * Returns an array (most recent first), capped at `max`.
 */
async function fbGetTravelAnalytics(max = 500) {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'travelRedirectAnalytics'),
        orderBy('createdAt', 'desc'),
        limit(max)
      )
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Travel] analytics fetch failed:', e.message);
    return [];
  }
}

/**
 * Driver Registration — submit an application.
 *  1. Uploads each document to Storage → driver-documents/{appId}/{field}
 *  2. Saves the application to Firestore → driverApplications/{appId}
 *  3. status = 'pending', generates Application ID
 *
 * @param {object} data  text fields
 * @param {object} files { drivingLicense, rcBook, insurance, driverPhoto } (File objects, may be null)
 * @returns {Promise<string>} the generated Application ID
 */
async function fbSubmitDriverApplication(data, files) {
  // Generate Application ID
  const appId = 'DRV' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

  // 1. Upload documents (skip any that are missing)
  const documents = {};
  const entries = Object.entries(files || {});
  for (const [field, file] of entries) {
    if (!file) continue;
    const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `driver-documents/${appId}/${field}.${ext}`;
    const snap = await uploadBytes(storageRef(storage, path), file);
    documents[field] = await getDownloadURL(snap.ref);
  }

  // 2. Save the application
  await setDoc(doc(db, 'driverApplications', appId), {
    applicationId:  appId,
    fullName:       data.fullName       || '',
    mobile:         data.mobile         || '',
    email:          data.email          || '',
    city:           data.city           || '',
    vehicleType:    data.vehicleType    || '',
    vehicleNumber:  data.vehicleNumber  || '',
    licenseNumber:  data.licenseNumber  || '',
    aadhaarNumber:  data.aadhaarNumber  || '',
    documents,                                  // { drivingLicense: url, rcBook: url, ... }
    status:         'pending',
    userId:         data.userId         || null,
    submittedAt:    serverTimestamp(),
    statusNote:     '',
  });

  console.log('[Driver] application submitted:', appId);
  return appId;
}

/**
 * Admin — fetch all driver applications (most recent first).
 */
async function fbGetDriverApplications(max = 500) {
  try {
    const snap = await getDocs(
      query(collection(db, 'driverApplications'), orderBy('submittedAt', 'desc'), limit(max))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Driver] fetch applications failed:', e.message);
    return [];
  }
}

/**
 * Admin — update an application's status.
 * status: 'approved' | 'rejected' | 'more_docs' | 'pending'
 */
async function fbUpdateDriverApplicationStatus(appId, status, note = '') {
  await setDoc(
    doc(db, 'driverApplications', appId),
    { status, statusNote: note, reviewedAt: serverTimestamp() },
    { merge: true }
  );
  console.log('[Driver] status updated:', appId, '→', status);
}

/**
 * Live listener for a single application (so the applicant sees approval).
 */
function fbListenToDriverApplication(appId, callback) {
  return onSnapshot(doc(db, 'driverApplications', appId), (snap) => {
    if (snap.exists()) callback(snap.data());
  }, (err) => console.error('[Driver] onSnapshot error:', err.message));
}

/**
 * Save a contact-form submission → contact_messages/{auto-id}
 */
async function fbSaveContactMessage(data) {
  const ref = await addDoc(collection(db, 'contact_messages'), {
    name:      data.name    || '',
    phone:     data.phone   || '',
    email:     data.email   || '',
    message:   data.message || '',
    status:    'new',
    userId:    window._currentUser?.uid || null,
    createdAt: serverTimestamp(),
  });
  console.log('[Contact] message saved:', ref.id);
  return ref.id;
}

/**
 * Fetch all bookings for the signed-in user
 */
async function fbGetUserBookings(userId) {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'bookings'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      )
    );
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.warn('Fetch bookings failed:', e.message);
    return [];
  }
}

// ── Admin: fetch all bookings ─────────────────────────────────────────────────
async function fbGetAllBookings(max = 200) {
  try {
    const snap = await getDocs(
      query(collection(db, 'bookings'), orderBy('createdAt', 'desc'), limit(max))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Admin] fetch bookings failed:', e.message);
    return [];
  }
}

// ── Admin: real-time listener on all bookings ─────────────────────────────────
function fbListenAllBookings(callback, max = 100) {
  return onSnapshot(
    query(collection(db, 'bookings'), orderBy('createdAt', 'desc'), limit(max)),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.error('[Admin] bookings listener error:', err.message)
  );
}

// ── Admin: update booking status ──────────────────────────────────────────────
async function fbUpdateBookingStatus(bookingId, status, note = '') {
  await updateDoc(doc(db, 'bookings', bookingId), {
    status,
    statusNote:  note,
    updatedAt:   serverTimestamp(),
  });
  // Mirror status to trip_requests collection
  try {
    await updateDoc(doc(db, 'trip_requests', bookingId), {
      status, updatedAt: serverTimestamp(),
    });
  } catch (_) { /* trip_request may not exist for older bookings */ }
  console.log('[Admin] booking status updated:', bookingId, '→', status);
}

// ── Admin: real-time listener on trip_requests ────────────────────────────────
function fbListenTripRequests(callback, max = 100) {
  return onSnapshot(
    query(collection(db, 'trip_requests'), orderBy('createdAt', 'desc'), limit(max)),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.error('[Admin] trip_requests listener error:', err.message)
  );
}

// ── Admin: assign driver to a trip ────────────────────────────────────────────
async function fbAssignDriver(tripId, driver) {
  // driver = { driverId, driverName, driverPhone, vehicleNumber }
  const updates = {
    status:       'assigned',
    driverId:     driver.driverId,
    driverName:   driver.driverName,
    driverPhone:  driver.driverPhone  || '',
    vehicleNumber:driver.vehicleNumber || '',
    assignedAt:   serverTimestamp(),
  };
  await updateDoc(doc(db, 'trip_requests', tripId), updates);
  // Also mirror to bookings collection
  try {
    await updateDoc(doc(db, 'bookings', tripId), {
      ...updates, updatedAt: serverTimestamp(),
    });
  } catch (_) {}
  console.log('[Admin] driver assigned:', tripId, '→', driver.driverName);
}

// ── Admin: unassign driver from a trip ────────────────────────────────────────
async function fbUnassignDriver(tripId) {
  const updates = {
    status:       'pending',
    driverId:     '',
    driverName:   '',
    driverPhone:  '',
    vehicleNumber:'',
    assignedAt:   deleteField(),
  };
  await updateDoc(doc(db, 'trip_requests', tripId), updates);
  try {
    await updateDoc(doc(db, 'bookings', tripId), {
      ...updates, updatedAt: serverTimestamp(),
    });
  } catch (_) {}
}

// ── Drivers collection: save approved driver ──────────────────────────────────
async function fbSaveDriver(driver) {
  // driver = { driverId(uid), name, phone, email, vehicleType, vehicleNumber, city }
  await setDoc(doc(db, 'drivers', driver.driverId), {
    ...driver,
    status:    driver.status || 'available',
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ── Drivers collection: fetch all available drivers ───────────────────────────
async function fbGetDrivers(statusFilter = null) {
  try {
    let q = collection(db, 'drivers');
    if (statusFilter) {
      q = query(q, where('status', '==', statusFilter));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Drivers] fetch failed:', e.message);
    return [];
  }
}

// ── Drivers collection: update driver status ─────────────────────────────────
async function fbUpdateDriverStatus(driverId, status) {
  await updateDoc(doc(db, 'drivers', driverId), {
    status, updatedAt: serverTimestamp(),
  });
}

// ── Driver: fetch assigned trips for a driver ─────────────────────────────────
async function fbGetDriverTrips(driverId, max = 50) {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'trip_requests'),
        where('driverId', '==', driverId),
        orderBy('createdAt', 'desc'),
        limit(max)
      )
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Driver] fetch trips failed:', e.message);
    return [];
  }
}

// ── Driver: real-time listener for driver's trips ─────────────────────────────
function fbListenDriverTrips(driverId, callback) {
  return onSnapshot(
    query(
      collection(db, 'trip_requests'),
      where('driverId', '==', driverId),
      orderBy('createdAt', 'desc'),
      limit(30)
    ),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.error('[Driver] trips listener error:', err.message)
  );
}

// ── Driver: update a trip's status (accept / start / complete / cancel) ───────
async function fbUpdateTripStatus(tripId, status, extra = {}) {
  const updates = { status, updatedAt: serverTimestamp(), ...extra };
  await updateDoc(doc(db, 'trip_requests', tripId), updates);
  try {
    await updateDoc(doc(db, 'bookings', tripId), updates);
  } catch (_) {}
  console.log('[Driver] trip status updated:', tripId, '→', status);
}

// ── Admin: fetch KPI stats ────────────────────────────────────────────────────
async function fbGetAdminStats() {
  try {
    const [statsSnap, pendingSnap, assignedSnap] = await Promise.all([
      getDoc(doc(db, 'stats', 'global')),
      getDocs(query(collection(db, 'trip_requests'), where('status', '==', 'pending'),   limit(1))),
      getDocs(query(collection(db, 'trip_requests'), where('status', '==', 'assigned'),  limit(1))),
    ]);
    const global = statsSnap.exists() ? statsSnap.data() : {};
    return {
      totalBookings: global.totalBookings  || 0,
      pendingCount:  pendingSnap.size,
      assignedCount: assignedSnap.size,
    };
  } catch (e) {
    console.warn('[Admin] stats fetch failed:', e.message);
    return { totalBookings: 0, pendingCount: 0, assignedCount: 0 };
  }
}

// ── Expose to window (app.js is a classic script, not a module) ───────────────
window._firebaseAuth    = auth;
window._firebaseDb      = db;
window._firebaseStorage = storage;
window._googleProvider  = googleProvider;

window._firebaseFns = {
  // Auth
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  // Firestore helpers
  saveUserProfile:     fbSaveUserProfile,
  saveBooking:         fbSaveBooking,
  getUserBookings:     fbGetUserBookings,
  saveTripRequest:     fbSaveTripRequest,
  listenToTripRequest: fbListenToTripRequest,
  // Travel Services (redirect model — analytics only)
  saveTravelRedirect:  fbSaveTravelRedirect,
  getTravelAnalytics:  fbGetTravelAnalytics,
  // Contact form
  saveContactMessage:  fbSaveContactMessage,
  // Driver registration
  submitDriverApplication:       fbSubmitDriverApplication,
  getDriverApplications:         fbGetDriverApplications,
  updateDriverApplicationStatus: fbUpdateDriverApplicationStatus,
  listenToDriverApplication:     fbListenToDriverApplication,
  // Admin booking management
  getAllBookings:         fbGetAllBookings,
  listenAllBookings:     fbListenAllBookings,
  updateBookingStatus:   fbUpdateBookingStatus,
  listenTripRequests:    fbListenTripRequests,
  assignDriver:          fbAssignDriver,
  unassignDriver:        fbUnassignDriver,
  getAdminStats:         fbGetAdminStats,
  // Driver management
  saveDriver:            fbSaveDriver,
  getDrivers:            fbGetDrivers,
  updateDriverStatus:    fbUpdateDriverStatus,
  getDriverTrips:        fbGetDriverTrips,
  listenDriverTrips:     fbListenDriverTrips,
  updateTripStatus:      fbUpdateTripStatus,
  saveNotification:      fbSaveNotification,
  requestFcmToken:       fbRequestFcmToken,
};

// ── Auth state listener ───────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  const authBtns = document.getElementById('authBtns');
  const userMenu = document.getElementById('userMenu');
  const nameEl   = document.getElementById('userDisplayName');
  const avatarEl = document.getElementById('userAvatar');

  if (user) {
    authBtns?.classList.add('hidden');
    userMenu?.classList.remove('hidden');
    const name = user.displayName || user.email.split('@')[0];
    if (nameEl)   nameEl.textContent   = name;
    if (avatarEl) avatarEl.textContent = name[0].toUpperCase();
    window._currentUser = user;

    // Load saved phone from Firestore profile so booking data can include it
    try {
      const profileSnap = await getDoc(doc(db, 'users', user.uid));
      window._currentUserPhone = profileSnap.exists() ? (profileSnap.data().phone || '') : '';
    } catch {
      window._currentUserPhone = '';
    }

    // Request FCM push notification token (fire-and-forget, non-blocking)
    fbRequestFcmToken(user.uid).catch(() => {});
  } else {
    authBtns?.classList.remove('hidden');
    userMenu?.classList.add('hidden');
    window._currentUser      = null;
    window._currentUserPhone = '';
  }
});
