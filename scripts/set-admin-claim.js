/**
 * set-admin-claim.js
 * Run ONCE to grant admin custom claim to a Firebase user.
 *
 * Usage:
 *   node scripts/set-admin-claim.js <userEmail>
 *
 * Prerequisites:
 *   - netlify/functions/serviceAccountkey.json must exist
 *   - npm install firebase-admin  (already installed)
 *
 * Example:
 *   node scripts/set-admin-claim.js admin@galaxyride.com
 */

const admin = require('firebase-admin');
const path  = require('path');

// Load service account key (lowercase 'k' in filename)
const serviceAccount = require(path.join(__dirname, '..', 'netlify', 'functions', 'serviceAccountkey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const emailArg = process.argv[2];
if (!emailArg) {
  console.error('Usage: node scripts/set-admin-claim.js <userEmail>');
  process.exit(1);
}

async function setAdminClaim(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`✅ Admin claim set for: ${email} (uid: ${user.uid})`);
    console.log('   The user must sign out and sign back in for the claim to take effect.');
  } catch (err) {
    console.error('❌ Failed:', err.message);
  } finally {
    process.exit(0);
  }
}

setAdminClaim(emailArg);
