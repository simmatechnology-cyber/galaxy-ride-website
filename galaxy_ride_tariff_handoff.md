# Galaxy Ride — Tariff Handoff for Driver App

**Source**: `web/galaxy-ride/js/app.js` — `TARIFF` object + `HILL_CHARGE` constant + `COUPONS` object  
**Last verified**: July 2026  
**Status**: ✅ ACTIVE — this is the single source of truth the live fare engine uses  
**Admin reference UI**: `admin-pricing.html` (password-protected, read-only mirror, not linked from public site)  
**Firestore tariff config**: ❌ None — rates are hardcoded in `app.js`; no Firestore collection for tariff

---

## 1. Trip Types

| Tab value | Label | Notes |
|-----------|-------|-------|
| `oneway` | One Way | One-direction trip. Outstation tier kicks in automatically when km > 100. |
| `roundtrip` | Round Trip | Same route back. All distance fares × 2; bata and waiting are NOT doubled. |
| `hourly` | Hourly Rental | Fixed package (1–10 hrs) with included km limit; no separate outstation. |

> **Outstation is not a separate tab.** It is a threshold (`km > 100 && tab !== 'hourly'`) applied inside `computeFare()` on top of `oneway` or `roundtrip`.

---

## 2. Vehicles

| Code | Label | Seats |
|------|-------|-------|
| `bike` | Bike / Two-wheeler | 1 |
| `auto` | Auto Rickshaw | 3 |
| `mini` | Mini / Hatchback | 4 |
| `sedan` | Sedan | 4 |
| `suv` | MUV / SUV | 6 |
| `innova` | Innova / Crysta | 7 |

> `bike` and `auto` are available for local city trips only. They do NOT appear in the outstation or hourly tables.

---

## 3. Local / City Tariff (`km ≤ 100`, tab = `oneway` or `roundtrip`)

Source: `TARIFF.local` in `js/app.js`

| Vehicle | Base Fare | Included KM | Per KM (Normal) | Per KM (Peak) | Max KM |
|---------|-----------|-------------|-----------------|----------------|--------|
| Bike | ₹50 | 5 km | ₹9 | ₹10 | 30 km |
| Auto | ₹100 | 5 km | ₹14 | ₹16 | 100 km |
| Mini | ₹110 | 3 km | ₹18 | ₹20 | 100 km |
| Sedan | ₹110 | 3 km | ₹19 | ₹24 | 100 km |
| SUV | ₹150 | 3 km | ₹22 | ₹28 | 100 km |
| Innova | ₹250 | 3 km | ₹24 | ₹30 | 100 km |

### Peak Hour Windows
| Window | Hours (24h) |
|--------|-------------|
| Early morning | 4:00 AM – 5:59 AM |
| Evening rush | 5:00 PM – 7:59 PM |

**Peak surcharge rule**: `peakSurcharge = (peakPerKm − perKm) × extraKm`  
Peak applies only when `km ≤ 100` AND tab ≠ `hourly`. It is never double-charged — the base cityFare always uses the normal rate; only the *difference* is added as surcharge.

---

## 4. Outstation Tariff (`km > 100`, tab = `oneway` or `roundtrip`)

Source: `TARIFF.outstation` in `js/app.js`

| Vehicle | Per KM (Outstation zone) | Driver Bata | Min KM/Day |
|---------|--------------------------|-------------|------------|
| Mini | ₹13/km | ₹400/day | 250 km |
| Sedan | ₹13/km | ₹400/day | 250 km |
| SUV | ₹18/km | ₹400/day | 250 km |
| Innova | ₹22/km | ₹400/day | 250 km |

> `bike` and `auto` are not available for outstation. The engine falls back to the vehicle's `local.perKm` rate if no outstation entry exists.

### 3-Tier Outstation Fare Structure

```
Segment 1 (0 – included km):  baseFare (flat, from TARIFF.local)
Segment 2 (included – 100 km): cityFare = (100 − included) × local.perKm
Segment 3 (>100 km):           outstationFare = (km − 100) × outstation.perKm
+ driverBata (flat per trip)
```

Example — Sedan, 200 km one-way:
```
baseFare       = ₹110
cityFare       = (100 − 3) × ₹19 = 97 × 19 = ₹1,843
outstationFare = (200 − 100) × ₹13 = ₹1,300
driverBata     = ₹400
subtotal       = ₹3,653
```

---

## 5. Hourly Rental Packages

Source: `TARIFF.hourly` + `TARIFF.hourlyKmLimit` in `js/app.js`

| Hours | KM Limit | Mini | Sedan | SUV | Innova |
|-------|----------|------|-------|-----|--------|
| 1 hr | 15 km | ₹300 | ₹400 | ₹1,050 | ₹2,000 |
| 2 hrs | 25 km | ₹560 | ₹800 | ₹1,550 | ₹2,600 |
| 3 hrs | 40 km | ₹820 | ₹1,200 | ₹2,000 | ₹3,200 |
| 4 hrs | 50 km | ₹1,100 | ₹1,613 | ₹2,500 | ₹3,800 |
| 5 hrs | 60 km | ₹1,400 | ₹2,000 | ₹2,821 | ₹4,300 |
| 6 hrs | 75 km | ₹1,680 | ₹2,400 | ₹3,450 | ₹4,900 |
| 7 hrs | 85 km | ₹1,950 | ₹2,700 | ₹3,900 | ₹5,400 |
| 8 hrs | 100 km | ₹2,200 | ₹3,000 | ₹4,313 | ₹6,000 |
| 9 hrs | 110 km | ₹2,500 | ₹3,523 | ₹4,853 | ₹6,500 |
| 10 hrs | 120 km | ₹2,800 | ₹3,950 | ₹5,500 | ₹7,500 |

**Extra km beyond package limit**: billed at the vehicle's `local.perKm` rate (Mini ₹18, Sedan ₹19, SUV ₹22, Innova ₹24).  
**Peak surcharge**: NOT applied on hourly packages.  
**Hill charge**: NOT applied on hourly packages.

---

## 6. Surcharges & Add-ons

### Waiting Charge
| Rule | Value |
|------|-------|
| Free grace period | 5 minutes (caller passes only billable minutes) |
| Rate after grace | ₹2 per minute |
| Source | `TARIFF.waiting.perMin = 2` |

> The website's fare engine accepts `waitingMins` as an input to `computeFare()`. The driver app should compute `waitingMins = max(0, actualWaitMin − 5)` and pass it in.

### Hill Station Charge
| Rule | Value |
|------|-------|
| Amount | ₹400 flat |
| Trigger | Pickup **or** drop location name contains any hill station keyword (case-insensitive substring match) |
| Source | `HILL_CHARGE = 400` constant in `js/app.js` |
| Applies to | `oneway` and `roundtrip` only — **NOT hourly** |

> ⚠️ **Data inconsistency**: `TARIFF.outstation.hillsCharge = 500` exists in the TARIFF object but is **never read** by the fare engine. The active value is the `HILL_CHARGE = 400` constant. Driver app must use ₹400.

**Hill Station List** (substring-matched, case-insensitive):

| State | Stations |
|-------|----------|
| Tamil Nadu | Kodaikanal, Ooty, Coonoor, Kotagiri, Yercaud, Valparai, Yelagiri, Kolli Hills |
| Kerala | Munnar, Thekkady, Wayanad, Vagamon, Idukki |
| Karnataka | Coorg, Chikmagalur, Sakleshpur |

### Toll & Parking
- **Not included** in the computed fare.
- Collected separately at actual cost during the trip.
- Driver app should show: *"Toll & parking charges are extra, collected at actual cost."*

### Permit Charges
- No permit charge is modelled in the fare engine. If applicable, collected separately.

### GST / Tax
- No GST line item in the fare engine. Fares are all-inclusive except toll/parking.

### Night Charge / Luggage
- No night charge or luggage charge in the fare engine.

---

## 7. Coupon / Discount

Source: `COUPONS` object in `js/app.js`

| Code | Type | Value | Min Order | Cap |
|------|------|-------|-----------|-----|
| `GALAXY100` | Flat | ₹100 off | ₹200 | No cap |
| `FIRST50` | Percent | 10% off | ₹150 | Max ₹200 |
| `RIDE20` | Percent | 20% off | ₹300 | Max ₹300 |

**Coupon application rule**: `discount = calculateCouponDiscount(code, subtotal + hillCharge)`  
Coupon is applied **after** hillCharge is added to subtotal, **before** the final total.  
Input is case-insensitive; stored/matched uppercase.

---

## 8. Exact Fare Formula Flow

```
computeFare(vehicle, km, tab, applyPeak, hourlyHrs, waitingMins = 0)
│
├── if tab === 'hourly'
│     baseFare     = TARIFF.hourly[vehicle][hourlyHrs - 1]
│     kmLimit      = TARIFF.hourlyKmLimit[hourlyHrs - 1]
│     extraKmCharge = max(0, km - kmLimit) × local.perKm
│     subtotal     = baseFare + extraKmCharge
│     return { baseFare, extraKmCharge, subtotal, isHourly: true }
│
└── else (oneway / roundtrip)
      baseFare = TARIFF.local[vehicle].base
      isOutstation = (km > 100)
      │
      ├── if isOutstation
      │     cityKm        = 100 − local.included
      │     outstationKm  = km − 100
      │     cityFare      = cityKm × local.perKm
      │     outstationFare = outstationKm × outstation.perKm
      │     driverBata    = outstation.driverBata  (₹400)
      │
      └── else (city ≤ 100 km)
            extraKm       = max(0, km − local.included)
            cityFare      = extraKm × local.perKm
            peakSurcharge = applyPeak ? extraKm × (peakPerKm − perKm) : 0

      waitingCharge = max(0, waitingMins) × TARIFF.waiting.perMin  (₹2)

      if tab === 'roundtrip':
        cityFare       × 2
        outstationFare × 2
        peakSurcharge  × 2
        (bata and waiting NOT doubled)

      subtotal = baseFare + cityFare + outstationFare + driverBata
               + peakSurcharge + waitingCharge

      return { baseFare, cityFare, outstationFare, driverBata,
               peakSurcharge, waitingCharge, subtotal, isOutstation }

── After computeFare() returns (in calculateFare()):
   hillCharge = isHillStation(pickup) || isHillStation(drop) ? 400 : 0
   discount   = calculateCouponDiscount(couponCode, subtotal + hillCharge)
   total      = max(0, subtotal + hillCharge − discount)
```

---

## 9. Firestore / Config Locations

| What | Location | Notes |
|------|----------|-------|
| **Active fare rates** | `js/app.js` → `TARIFF` object (line ~489) | Single source of truth. Never in Firestore. |
| **Hill charge constant** | `js/app.js` → `HILL_CHARGE = 400` (line ~532) | Separate from TARIFF object |
| **Hill station list** | `js/app.js` → `HILL_STATIONS[]` (line ~534) | Substring-matched |
| **Coupon codes** | `js/app.js` → `COUPONS` object (line ~563) | Hardcoded |
| **Admin reference** | `admin-pricing.html` | Password-protected read-only mirror. Not authoritative. |
| **Bookings** | Firestore `bookings/{bookingId}` | Full booking record including fare |
| **Trip requests** | Firestore `trip_requests/{bookingId}` | Driver app assignment queue |
| **User bookings** | Firestore `users/{uid}/bookings/{bookingId}` | Customer-side subcollection |

**No Firestore collection stores tariff rates.** The fare engine is entirely client-side in `js/app.js`.  
To change a rate, edit the `TARIFF` object in `js/app.js` and redeploy to the VPS.

---

## 10. Driver App — Fare Snapshot JSON Schema

This is the schema the driver app should use to compute and display fares, matching the website engine exactly.

```json
{
  "bookingId": "GR<base36_timestamp><4_random_chars>",
  "tripType": "oneway | roundtrip | hourly",
  "vehicleType": "mini | sedan | suv | innova",
  "distanceKm": 0,
  "hourlyPackageHrs": null,

  "fareBreakdown": {
    "baseFare": 0,
    "cityFare": 0,
    "outstationFare": 0,
    "driverBata": 0,
    "peakSurcharge": 0,
    "waitingCharge": 0,
    "extraKmCharge": 0,
    "hillCharge": 0,
    "subtotal": 0,
    "couponCode": null,
    "couponDiscount": 0,
    "total": 0
  },

  "fareFlags": {
    "isOutstation": false,
    "isHourly": false,
    "isPeakHour": false,
    "hasHillCharge": false
  },

  "tariffSnapshot": {
    "vehicle": "sedan",
    "base": 110,
    "included": 3,
    "localPerKm": 19,
    "outstationPerKm": 13,
    "driverBataPerDay": 400,
    "waitingPerMin": 2,
    "hillChargeFlatRate": 400
  },

  "pickup": "",
  "drop": "",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "passengers": 1,
  "paymentMethod": "cash | online",
  "paymentStatus": "cash_pending | paid",
  "customerName": "",
  "customerPhone": "",
  "customerEmail": "",
  "status": "pending | confirmed | assigned | en_route | started | completed | cancelled",
  "driverId": "",
  "driverName": ""
}
```

### Key Driver App Implementation Notes

1. **Outstation threshold**: `km > 100` triggers outstation tier automatically. No manual flag needed from the customer.
2. **Round trip**: Multiply `cityFare`, `outstationFare`, and `peakSurcharge` by 2. Do NOT multiply `driverBata` or `waitingCharge`.
3. **Hill charge**: Check both pickup and drop names against the hill station list. Apply ₹400 flat. Skip for hourly rides.
4. **Peak detection**: Parse departure time hour (0–23). Peak if `4 ≤ h < 6` OR `17 ≤ h < 20`. Only apply on city rides (km ≤ 100, tab ≠ hourly).
5. **Waiting**: Driver should start charging after 5-minute grace. Meter = `max(0, waitMin − 5) × ₹2`.
6. **Bata**: ₹400/day flat. Current engine adds 1 bata per trip for outstation (not per day of multi-day trips — multi-day logic is not yet in the engine).
7. **Toll/Parking**: Collect at actuals separately. Not in fare engine.
8. **Coupon**: If driver app doesn't accept coupon entry, omit coupon fields. The website already validates and stores the discount in the booking.
9. **Booking ID format**: `"GR" + Date.now().toString(36).toUpperCase() + 4 random alphanumeric chars`.
