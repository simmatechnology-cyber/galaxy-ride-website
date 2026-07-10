/**
 * Netlify Function: notify
 * Sends FCM push notifications for Galaxy Ride events.
 * POST /api/notify
 *
 * Body: { event, bookingId, driverId?, customerId?, adminUid? }
 * Events:
 *   new_booking      → notify admin (topic: admin_notifications)
 *   driver_assigned  → notify driver by token
 *   trip_started     → notify customer by token
 *   trip_completed   → notify customer by token
 *   booking_cancelled→ notify driver + customer
 */

const { admin, db } = require('./_firebase-admin');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!db) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Firebase not initialized' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { eventType, bookingId, driverId, customerId } = body;
  if (!eventType || !bookingId) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'eventType and bookingId required' }) };
  }

  const messaging = admin.messaging();
  const results = [];

  try {
    if (eventType === 'new_booking') {
      // Notify all admins via topic
      const msg = await messaging.send({
        topic: 'admin_notifications',
        notification: {
          title: '🚖 New Booking',
          body:  `Booking ${bookingId} needs assignment`,
        },
        data: { type: 'new_booking', bookingId },
      });
      results.push({ target: 'admin_topic', messageId: msg });

      // Also notify individual admin tokens
      const adminsSnap = await db.collection('admins').where('isActive', '==', true).get();
      for (const adminDoc of adminsSnap.docs) {
        const token = adminDoc.data().fcmToken;
        if (token) {
          try {
            const r = await messaging.send({
              token,
              notification: { title: '🚖 New Booking', body: `Booking ${bookingId}` },
              data: { type: 'new_booking', bookingId },
            });
            results.push({ target: 'admin_token:' + adminDoc.id, messageId: r });
          } catch (_) {}
        }
      }
    }

    if (eventType === 'driver_assigned' && driverId) {
      const driverDoc = await db.collection('drivers').doc(driverId).get();
      const token = driverDoc.data()?.fcmToken;
      if (token) {
        const r = await messaging.send({
          token,
          notification: { title: '🚗 New Trip Assigned', body: `Booking ${bookingId} is ready for pickup` },
          data: { type: 'driver_assigned', bookingId },
        });
        results.push({ target: 'driver:' + driverId, messageId: r });
      } else {
        results.push({ target: 'driver:' + driverId, skipped: 'no fcmToken' });
      }
    }

    if ((eventType === 'trip_started' || eventType === 'trip_completed') && customerId) {
      const userDoc = await db.collection('users').doc(customerId).get();
      const token = userDoc.data()?.fcmToken;
      if (token) {
        const titleMap = { trip_started: '🚗 Driver On Way', trip_completed: '✅ Trip Completed' };
        const bodyMap  = { trip_started: 'Your driver has started the trip', trip_completed: 'Trip completed. Thank you!' };
        const r = await messaging.send({
          token,
          notification: { title: titleMap[eventType], body: bodyMap[eventType] },
          data: { type: eventType, bookingId },
        });
        results.push({ target: 'customer:' + customerId, messageId: r });
      } else {
        results.push({ target: 'customer:' + customerId, skipped: 'no fcmToken' });
      }
    }

    // Log to Firestore notifications collection
    await db.collection('notifications').add({
      bookingId,
      type:      eventType,
      results,
      sentAt:    admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true, sent: results.length, results }),
    };
  } catch (e) {
    console.error('[notify] Error:', e.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
