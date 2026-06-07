# Galaxy Ride — Setup & Deployment Guide

## Prerequisites
- Node.js 18+ (https://nodejs.org)
- Netlify account (connected to galaxyride.in)
- Firebase project
- Geoapify API key
- Razorpay account

---

## 1. Install Dependencies

```bash
npm install
```

---

## 2. Configure API Keys

### Option A: Netlify Environment Variables (Recommended for Production)
Set these in Netlify → Site Settings → Environment Variables:

| Variable | Value |
|---|---|
| `GEOAPIFY_API_KEY` | Your Geoapify API key |
| `FIREBASE_API_KEY` | Firebase web API key |
| `FIREBASE_AUTH_DOMAIN` | your-project.firebaseapp.com |
| `FIREBASE_PROJECT_ID` | your-project-id |
| `FIREBASE_STORAGE_BUCKET` | your-project.appspot.com |
| `FIREBASE_MESSAGING_SENDER_ID` | Sender ID |
| `FIREBASE_APP_ID` | App ID |
| `FIREBASE_DATABASE_URL` | https://your-project-default-rtdb.firebaseio.com |
| `FIREBASE_PRIVATE_KEY` | Service account private key (for functions) |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `RAZORPAY_KEY_ID` | rzp_live_xxxxxxxxxx |
| `RAZORPAY_KEY_SECRET` | Your Razorpay secret |

### Option B: For local development
Create a `.env` file (copy from `.env.example`) and fill in your keys.

Then add this script to `index.html` **before** the Firebase script tag:
```html
<script>
  window.GEOAPIFY_API_KEY  = 'your_key_here';
  window.RAZORPAY_KEY_ID   = 'rzp_test_xxxxxxxxxxxx';
  window.FIREBASE_API_KEY  = 'your_firebase_key';
  // ... other Firebase config values
</script>
```

---

## 3. Firebase Setup

1. Go to https://console.firebase.google.com
2. Create a new project (or use existing)
3. Enable **Authentication**:
   - Email/Password provider
   - Google provider
4. Enable **Realtime Database**:
   - Create database in your region
   - Set rules:
   ```json
   {
     "rules": {
       "bookings": {
         "$bookingId": {
           ".read":  "$bookingId === auth.uid || root.child('users').child(auth.uid).exists()",
           ".write": "auth !== null"
         }
       },
       "users": {
         "$uid": {
           ".read":  "$uid === auth.uid",
           ".write": "$uid === auth.uid"
         }
       },
       "stats": {
         ".read": true,
         ".write": "auth !== null"
       }
     }
   }
   ```
5. Get your **Service Account** key (Project Settings → Service Accounts → Generate new private key) for Netlify Functions

---

## 4. Geoapify Setup

1. Sign up at https://www.geoapify.com
2. Create an API key
3. Free tier: 3,000 requests/day
4. Set `GEOAPIFY_API_KEY` in your environment

---

## 5. Razorpay Setup

1. Sign up at https://razorpay.com
2. Get your Key ID and Key Secret from Dashboard → Settings → API Keys
3. For testing, use test keys (rzp_test_...)
4. For production, use live keys (rzp_live_...)

---

## 6. Deploy to Netlify

### Method 1: Netlify CLI (Recommended)
```bash
npm install -g netlify-cli
netlify login
netlify link --id 213eb56c-57a6-46b6-9fef-aece57983f0d
netlify deploy --prod
```

### Method 2: Drag & Drop
1. Go to https://app.netlify.com/projects/melodious-kulfi-c85e39
2. Drag the entire `galaxy-ride` folder to the deploy zone

### Method 3: Git Integration
```bash
git init
git add .
git commit -m "Galaxy Ride - Initial deployment"
git remote add origin YOUR_GITHUB_REPO_URL
git push origin main
```
Then connect the repo in Netlify Dashboard.

---

## 7. Project Structure

```
galaxy-ride/
├── index.html              ← Main website (all sections)
├── css/
│   └── styles.css          ← Full responsive styles
├── js/
│   └── app.js              ← All UI logic, Geoapify, Razorpay, Firebase auth
├── netlify/
│   └── functions/
│       ├── create-order.js ← Razorpay order creation
│       ├── verify-payment.js ← Payment signature verification
│       └── booking.js      ← Booking save to Firebase
├── netlify.toml            ← Netlify configuration
├── package.json
├── .env.example            ← Environment variable template
└── SETUP.md                ← This file
```

---

## 8. Features Included

- ✅ Full responsive design (mobile, tablet, desktop)
- ✅ Firebase Authentication (Google + Email/Password)
- ✅ Geoapify location autocomplete & distance calculation
- ✅ Razorpay payment gateway (online + cash)
- ✅ Real-time fare calculation (local/outstation/hourly)
- ✅ Peak hour detection & surcharge
- ✅ Coupon code system
- ✅ Booking confirmation with Firebase save
- ✅ All pricing tables (local, outstation, hourly, full day)
- ✅ Vehicle selection with fare preview
- ✅ FAQ accordion
- ✅ Testimonials section
- ✅ Contact form
- ✅ Netlify Functions for secure backend operations
- ✅ Scroll animations & smooth UX
- ✅ Back to top button
- ✅ Toast notifications
