/**
 * Shared Firebase Admin initializer for Netlify Functions.
 *
 * Uses the firebase-admin namespace API (compatible with v9–v12).
 * Guards with admin.apps.length so initializeApp() is called only once
 * per Lambda process — safe on warm restarts.
 *
 * Exports: { admin, db }
 *   admin  — full admin namespace (use admin.firestore.FieldValue etc.)
 *   db     — Firestore instance
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Netlify stores multiline env values with literal \n — restore real newlines
  const privateKey  = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      '[Firebase Admin] One or more required env vars are missing:\n' +
      '  FIREBASE_PROJECT_ID  → ' + (projectId   ? 'OK' : 'MISSING') + '\n' +
      '  FIREBASE_CLIENT_EMAIL → ' + (clientEmail ? 'OK' : 'MISSING') + '\n' +
      '  FIREBASE_PRIVATE_KEY  → ' + (privateKey  ? 'OK' : 'MISSING')
    );
    // Do NOT throw here — let each handler return its own 500 with a clear message
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    console.log('[Firebase Admin] Initialized for project:', projectId);
  }
}

// admin.firestore() returns the existing instance on repeated calls — safe to call here
const db = admin.apps.length ? admin.firestore() : null;

module.exports = { admin, db };
