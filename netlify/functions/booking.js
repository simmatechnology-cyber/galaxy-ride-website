/**
 * Netlify Function: booking
 * Saves confirmed booking to Firestore.
 * POST /api/booking
 */

const { admin, db } = require('./_firebase-admin');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  // ── CORS preflight ────────────────────────────────────────────────────────
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ── Guard: Firebase must be initialized ───────────────────────────────────
  if (!db) {
    console.error('[booking] Firebase Admin not initialized — check env vars');
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Server configuration error: Firebase not initialized' }),
    };
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let booking;
  try {
    booking = JSON.parse(event.body || '{}');
  } catch (parseErr) {
    console.error('[booking] JSON parse error:', parseErr.message);
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  // ── Validate required fields ──────────────────────────────────────────────
  const required = ['bookingId', 'userId', 'vehicle', 'pickup', 'fare'];
  const missing  = required.filter(k => !booking[k]);
  if (missing.length) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }),
    };
  }

  console.log('[booking] ✓ Request received | bookingId:', booking.bookingId);
  console.log('[booking] customer:', booking.customerName, '|', booking.customerPhone);
  console.log('[booking] vehicle:', booking.vehicle, '| fare: ₹' + booking.fare, '| payment:', booking.paymentMethod);
  console.log('[booking] pickup:', booking.pickup, '→ drop:', booking.drop || 'N/A');

  // ── Firestore batch write ─────────────────────────────────────────────────
  try {
    console.log('[booking] Step 1 → Starting Firestore batch write...');
    const { FieldValue } = admin.firestore;
    const batch          = db.batch();

    // 1. Full booking record → /bookings/{bookingId}
    const bookingRef = db.collection('bookings').doc(booking.bookingId);
    batch.set(bookingRef, {
      bookingId:     booking.bookingId,
      userId:        booking.userId,
      userEmail:     booking.userEmail      || '',
      customerName:  booking.customerName   || '',
      customerPhone: booking.customerPhone  || '',
      vehicle:       booking.vehicle,
      pickup:        booking.pickup,
      drop:          booking.drop           || '',
      date:          booking.date           || '',
      time:          booking.time           || '',
      type:          booking.type           || 'oneway',
      distance:      Number(booking.distance)  || 0,
      fare:          Number(booking.fare)      || 0,
      coupon:        booking.coupon         || '',
      discount:      Number(booking.discount)  || 0,
      paymentMethod: booking.paymentMethod  || 'cash',
      paymentId:     booking.paymentId      || null,
      status:        booking.status         || 'confirmed',
      createdAt:     booking.createdAt      || new Date().toISOString(),
      confirmedAt:   booking.confirmedAt    || new Date().toISOString(),
      savedAt:       FieldValue.serverTimestamp(),
    });

    // 2. Summary → /users/{userId}/bookings/{bookingId}
    const userBookingRef = db
      .collection('users').doc(booking.userId)
      .collection('bookings').doc(booking.bookingId);
    batch.set(userBookingRef, {
      bookingId: booking.bookingId,
      status:    booking.status         || 'confirmed',
      vehicle:   booking.vehicle,
      pickup:    booking.pickup,
      drop:      booking.drop           || '',
      date:      booking.date           || '',
      fare:      Number(booking.fare)   || 0,
      createdAt: booking.createdAt      || new Date().toISOString(),
    });

    await batch.commit();
    console.log('[booking] Step 1 ✓ Firestore batch committed | bookingId:', booking.bookingId);

    // 3. Increment global counter
    console.log('[booking] Step 2 → Incrementing stats/global.totalBookings...');
    await db.collection('stats').doc('global').set(
      { totalBookings: FieldValue.increment(1) },
      { merge: true }
    );
    console.log('[booking] Step 2 ✓ Stats updated');

  } catch (firestoreErr) {
    console.error('[booking] ✗ Firestore error:', firestoreErr.message);
    console.error('[booking] Stack:', firestoreErr.stack);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({
        error:   'Failed to save booking',
        details: firestoreErr.message,
      }),
    };
  }

  // ── Always return success after Firestore commit ──────────────────────────
  console.log('[booking] ✓ Returning success response | bookingId:', booking.bookingId);
  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      success:   true,
      bookingId: booking.bookingId,
      message:   'Booking saved successfully',
    }),
  };
};
