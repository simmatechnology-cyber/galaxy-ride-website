/* ============================================================
   GALAXY RIDE — MAIN APPLICATION SCRIPT
   Covers: UI, booking logic, fare calc, Geoapify, Razorpay, Firebase auth
   ============================================================ */

'use strict';

// ==================== CONSTANTS ====================

const GEOAPIFY_API_KEY   = `f2c4aa48a5944f29a6170f9d0c7898a5`;
// NOTE: The Razorpay key is NOT hardcoded here. The publishable key_id is
// returned by /api/create-order (read from server env vars) and used at
// checkout time. The secret key never leaves the server.

// Geoapify endpoint URLs
const GEO_AUTOCOMPLETE = 'https://api.geoapify.com/v1/geocode/autocomplete';
const GEO_SEARCH       = 'https://api.geoapify.com/v1/geocode/search';
// Nominatim (OpenStreetMap official geocoder) — deepest India village coverage
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
// Tamil Nadu proximity bias — Tiruchirappalli (geographic center of TN)
// Format: lon,lat  (Geoapify uses longitude-first)
const TN_BIAS = '78.6869,10.7905';

const TARIFF = {
  local: {
    bike:   { base: 50,  included: 5, perKm: 9,  peakPerKm: 0,  maxKm: 30 },
    auto:   { base: 100, included: 5, perKm: 14, peakPerKm: 16, maxKm: 100 },
    mini:   { base: 110, included: 3, perKm: 18, peakPerKm: 20, maxKm: 100 },
    sedan:  { base: 110, included: 3, perKm: 19, peakPerKm: 24, maxKm: 100 },
    suv:    { base: 120, included: 3, perKm: 22, peakPerKm: 28, maxKm: 100 },
    innova: { base: 130, included: 3, perKm: 24, peakPerKm: 30, maxKm: 100 },
  },
  outstation: {
    mini:   { perKm: 13, driverBata: 400 },
    sedan:  { perKm: 14, driverBata: 400 },
    suv:    { perKm: 18, driverBata: 400 },
    innova: { perKm: 22, driverBata: 400 },
  },
  hourly: {
    sedan:  [400, 800, 1200, 1613, 2000, 2400, 2700, 3000, 3523, 3950],
    suv:    [1050,1550,2000,2500,2821,3450,3900,4313,4853,5500],
    innova: [2000,2600,3200,3800,4300,4900,5400,6000,6500,7500],
  },
  peakHours: [
    { start: 4, end: 6 },
    { start: 17, end: 20 },
  ],
};

const COUPONS = {
  GALAXY100: { type: 'flat',    value: 100,  minOrder: 200 },
  FIRST50:   { type: 'percent', value: 10,   minOrder: 150, max: 200 },
  RIDE20:    { type: 'percent', value: 20,   minOrder: 300, max: 300 },
};

// ==================== STATE ====================

const state = {
  currentTab: 'oneway',
  passengers: 1,
  selectedVehicle: null,
  pickupCoords: null,
  dropCoords: null,
  distance: null,
  fare: 0,
  couponDiscount: 0,
  appliedCoupon: null,
  bookingData: null,
  // Separate timers so pickup/drop debounces never cancel each other
  pickupTimeout: null,
  dropTimeout: null,
};

// ==================== DOM HELPERS ====================

const $  = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function show(id)  { $(id)?.classList.remove('hidden'); }
function hide(id)  { $(id)?.classList.add('hidden'); }
function toggle(id){ $(id)?.classList.toggle('hidden'); }

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
  setMinDate();
  setupNavScroll();
  setupHamburger();
  setupAutocomplete();
  setupClickOutside();
  setupScrollSpy();
  setupBackToTop();
  animateOnScroll();
  setupWaPopup();
  setupPrefillFromUrl();
});

// ==================== ONE-CLICK BOOKING PREFILL (from destination pages) ====================

/**
 * Reads booking params from the URL (set by destination tour pages &
 * trip-planner.html) and pre-fills the booking form so the customer only
 * needs to confirm & pay. Supported params:
 *   pickup, drop, vehicle, passengers, type (oneway|roundtrip|hourly), date
 */
function setupPrefillFromUrl() {
  const p = new URLSearchParams(window.location.search);
  if (![...p.keys()].length) return;

  const type = p.get('type');
  if (type && ['oneway', 'roundtrip', 'hourly'].includes(type)) {
    const btn = document.querySelector(`.tab-btn[data-tab="${type}"]`);
    if (btn) switchTab(type, btn);
  }

  const pickup = p.get('pickup');
  const drop   = p.get('drop');
  const date   = p.get('date');
  if (pickup && $('pickup')) $('pickup').value = pickup;
  if (drop   && $('drop'))   $('drop').value   = drop;
  if (date   && $('date'))   $('date').value   = date;

  const vehicle = p.get('vehicle');
  if (vehicle) {
    const radio = document.querySelector(`input[name="vehicle"][value="${vehicle}"]`);
    if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
  }

  const passengers = parseInt(p.get('passengers'), 10);
  if (passengers >= 1) changePassengers(passengers - (state.passengers || 1));

  // Bring the booking card into view and flash it
  const card = $('bookingCard');
  if (card) {
    setTimeout(() => {
      $('home')?.scrollIntoView({ behavior: 'smooth' });
      card.classList.add('prefill-flash');
      setTimeout(() => card.classList.remove('prefill-flash'), 1800);
    }, 250);
  }
}

// ==================== WHATSAPP POPUP (auto after 15s) ====================

function setupWaPopup() {
  const popup = $('waPopup');
  if (!popup) return;
  // Don't re-show if the user already dismissed it this session
  if (sessionStorage.getItem('waPopupDismissed') === '1') return;
  setTimeout(() => {
    if (sessionStorage.getItem('waPopupDismissed') !== '1') popup.classList.add('show');
  }, 15000);
}

function dismissWaPopup() {
  $('waPopup')?.classList.remove('show');
  try { sessionStorage.setItem('waPopupDismissed', '1'); } catch { /**/ }
}

// ==================== NAVBAR ====================

function setupNavScroll() {
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });
}

function setupHamburger() {
  const btn   = $('hamburger');
  const links = $('navLinks');
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    links.classList.toggle('open');
  });
  // Close on link click
  $$('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      btn.classList.remove('active');
      links.classList.remove('open');
    });
  });
}

function setupScrollSpy() {
  const sections = $$('section[id]');
  const links    = $$('.nav-link');
  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(s => {
      if (window.scrollY >= s.offsetTop - 120) current = s.id;
    });
    links.forEach(l => {
      l.classList.toggle('active', l.getAttribute('href') === `#${current}`);
    });
  }, { passive: true });
}

function setupBackToTop() {
  const btn = $('backToTop');
  window.addEventListener('scroll', () => {
    btn.classList.toggle('hidden', window.scrollY < 400);
  }, { passive: true });
}

// ==================== BOOKING TABS ====================

function switchTab(tab, el) {
  state.currentTab = tab;
  $$('.tab-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');

  const isRound  = tab === 'roundtrip';
  const isHourly = tab === 'hourly';

  $('returnDateRow').classList.toggle('hidden', !isRound);
  $('hourlyPackageGroup').classList.toggle('hidden', !isHourly);

  // Drop location not needed for hourly
  const dropGroup = $('drop')?.closest('.form-group');
  if (dropGroup) dropGroup.style.opacity = isHourly ? '0.5' : '1';
  $('drop').required = !isHourly;

  calculateFare();
}

// ==================== DATE & TIME ====================

function setMinDate() {
  const dateInput = $('date');
  if (!dateInput) return;
  const today = new Date();
  dateInput.min = today.toISOString().split('T')[0];
  dateInput.value = today.toISOString().split('T')[0];

  const timeInput = $('time');
  if (!timeInput) return;
  const now = new Date(Date.now() + 60 * 60 * 1000); // +1hr
  timeInput.value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  dateInput.addEventListener('change', calculateFare);
  timeInput.addEventListener('change', calculateFare);
}

function isPeakHour(date, timeStr) {
  const [h] = timeStr.split(':').map(Number);
  return TARIFF.peakHours.some(p => h >= p.start && h < p.end);
}

// ==================== PASSENGERS ====================

function changePassengers(delta) {
  state.passengers = Math.max(1, Math.min(6, state.passengers + delta));
  $('passengerCount').textContent = state.passengers;

  // Disable SUV/Innova if <= 4 passengers, enable all otherwise
  const suvOpts = $$('.vehicle-option[data-vehicle="suv"], .vehicle-option[data-vehicle="innova"]');
  suvOpts.forEach(o => {
    const radio = o.querySelector('input');
    const dimmed = state.passengers <= 4;
    // Don't actually disable — just let them choose; note capacity visually
    if (dimmed) {
      o.style.opacity = '0.7';
    } else {
      o.style.opacity = '1';
    }
  });
  calculateFare();
}

// ==================== VEHICLE SELECTION ====================

function selectVehicleAndScroll(vehicle) {
  const radio = document.querySelector(`input[name="vehicle"][value="${vehicle}"]`);
  if (radio) {
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
  }
  $('home').scrollIntoView({ behavior: 'smooth' });
}

// ==================== GEOAPIFY AUTOCOMPLETE ====================

/**
 * API key validity check.  Detects:
 *   - undefined / null / empty
 *   - the placeholder string "YOUR_GEOAPIFY_API_KEY"
 *   - any obviously-too-short value (real keys are 32 hex chars)
 */
function isApiKeyValid() {
  const k = GEOAPIFY_API_KEY;
  return typeof k === 'string' && k.length >= 16 && !/^YOUR_/i.test(k);
}

// One-time sanity check at script load — surfaces config errors fast.
if (!isApiKeyValid()) {
  console.error(
    '[Geoapify] ❌ API key is missing or looks invalid. ' +
    'Set GEOAPIFY_API_KEY at the top of app.js. Got:',
    GEOAPIFY_API_KEY ? `"${String(GEOAPIFY_API_KEY).slice(0, 4)}…(${String(GEOAPIFY_API_KEY).length} chars)"` : '(undefined)'
  );
} else {
  console.info(
    '[Geoapify] ✅ API key loaded:',
    `${GEOAPIFY_API_KEY.slice(0, 4)}…${GEOAPIFY_API_KEY.slice(-4)}`
  );
}

/**
 * Stable, named onSelect handlers per field — used by both the live input
 * listener and the Retry button so retries restore the exact same flow.
 */
function acPickupSelect(result) {
  const pickupInput   = $('pickup');
  state.pickupCoords  = result.coords;
  pickupInput.value   = result.label;
  closeDropdown('pickupDropdown', pickupInput);
  if (state.dropCoords) calcDistance(); else calculateFare();
}

function acDropSelect(result) {
  const dropInput   = $('drop');
  state.dropCoords  = result.coords;
  dropInput.value   = result.label;
  closeDropdown('dropDropdown', dropInput);
  if (state.pickupCoords) calcDistance(); else calculateFare();
}

function setupAutocomplete() {
  const pickupInput = $('pickup');
  const dropInput   = $('drop');

  if (pickupInput) {
    // Clear stored coords + GPS full-address on every manual edit so stale
    // data from a previous GPS fix never contaminates a manually-typed booking.
    pickupInput.addEventListener('input', () => {
      state.pickupCoords       = null;
      state.distance           = null;
      state.pickupFullAddress  = null;
      pickupInput.dataset.fullAddress = '';
      pickupInput.title               = '';
      acDebounce('pickup', pickupInput.value, 'pickupDropdown', acPickupSelect);
    });
  }

  if (dropInput) {
    dropInput.addEventListener('input', () => {
      state.dropCoords = null;
      state.distance   = null;
      acDebounce('drop', dropInput.value, 'dropDropdown', acDropSelect);
    });
  }

  // Keyboard navigation for both dropdowns
  [
    { input: pickupInput, dropdownId: 'pickupDropdown' },
    { input: dropInput,   dropdownId: 'dropDropdown'   },
  ].forEach(({ input, dropdownId }) => {
    if (!input) return;
    input.addEventListener('keydown', (e) => handleAcKeydown(e, dropdownId));
  });
}

// --- Separate debounce per field (pickup vs drop never cancel each other) ---
function acDebounce(field, query, dropdownId, onSelect) {
  const timerKey = field === 'pickup' ? 'pickupTimeout' : 'dropTimeout';
  clearTimeout(state[timerKey]);

  const inputEl = $(field === 'pickup' ? 'pickup' : 'drop');
  const group   = inputEl?.closest('.autocomplete-group');

  // Require at least 3 characters — avoids wasting API quota on single-char
  // queries and prevents Geoapify from returning irrelevant broad results.
  if (!query || query.trim().length < 3) {
    closeDropdown(dropdownId, inputEl);
    return;
  }

  // Show loading indicator immediately so the user gets feedback
  showAcLoading(dropdownId);
  if (group) group.classList.add('is-open');

  state[timerKey] = setTimeout(
    () => fetchAutocomplete(query.trim(), dropdownId, onSelect, field),
    400
  );
}

// --- Show spinner inside the dropdown while waiting for the API ---
function showAcLoading(dropdownId) {
  const dropdown = $(dropdownId);
  if (!dropdown) return;
  dropdown.innerHTML = `<div class="ac-loading"><i class="fas fa-circle-notch"></i> Finding locations…</div>`;
  dropdown.classList.remove('hidden');
}

/**
 * Map HTTP status codes to specific, actionable user/developer messages.
 * Each case explains the *most likely* cause so debugging is fast.
 */
function describeGeoapifyStatus(status) {
  switch (status) {
    case 400: return 'Bad request — query format invalid.';
    case 401: return 'API key rejected. Verify GEOAPIFY_API_KEY is correct.';
    case 403: return 'Key forbidden. Check domain/HTTP referrer restrictions in your Geoapify dashboard.';
    case 404: return 'Endpoint not found — check the URL.';
    case 429: return 'Rate limit exceeded. Free tier = 3,000 req/day. Wait a moment.';
  }
  if (status >= 500 && status < 600) return 'Geoapify server error. Try again shortly.';
  return `Request failed (HTTP ${status}).`;
}

/**
 * Render an error state inside the dropdown with an optional Retry button.
 * The Retry button re-runs the *same* fetch, bypassing debounce.
 */
function showAcError(dropdownId, message, retryArgs) {
  const dropdown = $(dropdownId);
  if (!dropdown) return;

  const showRetry = !!retryArgs;
  dropdown.innerHTML = `
    <div class="ac-empty" style="display:flex; flex-direction:column; gap:10px; align-items:center; padding:16px;">
      <div style="display:flex; gap:8px; align-items:flex-start;">
        <i class="fas fa-exclamation-circle" style="color:var(--danger); margin-top:2px;"></i>
        <span style="text-align:left;">${escapeHtml(message)}</span>
      </div>
      ${showRetry ? `
        <button type="button" class="ac-retry-btn" style="
          background:var(--primary); color:#fff; border:none; cursor:pointer;
          padding:6px 14px; border-radius:9999px; font-size:12px; font-weight:600;
          display:inline-flex; align-items:center; gap:6px;
        ">
          <i class="fas fa-redo"></i> Retry
        </button>
      ` : ''}
    </div>`;
  dropdown.classList.remove('hidden');

  if (showRetry) {
    const btn = dropdown.querySelector('.ac-retry-btn');
    btn?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const { query, field, onSelect } = retryArgs;
      showAcLoading(dropdownId);
      fetchAutocomplete(query, dropdownId, onSelect, field);
    });
  }
}

// ── Type priority table used by rankAndDedup ────────────────────────────────
// Higher score = shown first. Amenity covers apartments, buildings, shops,
// landmarks. Street beats locality/area. City/postcode are last resort.
const RESULT_TYPE_SCORE = {
  amenity:  50,
  building: 50,
  street:   30,
  locality: 20,
  village:  20,
  hamlet:   20,
  suburb:   15,
  city:     10,
  county:    5,
  postcode: -10,
};

/**
 * rankAndDedup — sort results by relevance and remove near-duplicates.
 *
 * Scoring:
 *   +100  exact name match
 *   + 80  name starts with query
 *   + 40  name contains query
 *   + 20  only full formatted address contains query
 *   + RESULT_TYPE_SCORE[type]  type priority (amenity > street > area > city)
 *   + 20  name contains apartment/flat/villa/residency/tower/complex
 *
 * Dedup: skip any result whose centre is within 150 m of an already-kept
 * result (except amenities — two distinct buildings can be neighbours).
 * Also skips duplicate place_ids from Geoapify.
 *
 * Cap: returns at most 10 results.
 */
function rankAndDedup(features, query) {
  if (!features.length) return features;

  const q = query.toLowerCase().trim();

  const scored = features.map((f) => {
    const p    = f.properties;
    const name = (p.name || p.address_line1 || '').toLowerCase();
    const full = (p.formatted || '').toLowerCase();

    let score = RESULT_TYPE_SCORE[p.result_type] ?? 10;

    // Match quality boost
    if      (name === q)            score += 100;
    else if (name.startsWith(q))    score +=  80;
    else if (name.includes(q))      score +=  40;
    else if (full.includes(q))      score +=  20;

    // Apartment / building keyword boost
    if (/\b(apartment|flat|flats|villa|villas|residency|residencies|tower|towers|complex|block|layout|colony|nagar|garden|enclave)\b/i.test(p.name || '')) {
      score += 20;
    }

    return { f, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const kept    = [];
  const seenIds = new Set();
  const seenPts = [];

  for (const { f } of scored) {
    const p   = f.properties;
    const pid = p.place_id || p.osm_id;

    // Skip exact duplicate place IDs
    if (pid) {
      if (seenIds.has(String(pid))) continue;
      seenIds.add(String(pid));
    }

    // Proximity dedup (skip if within 150 m of an already-kept non-amenity)
    const lon = f.geometry?.coordinates?.[0] ?? p.lon;
    const lat = f.geometry?.coordinates?.[1] ?? p.lat;
    if (lon && lat && p.result_type !== 'amenity') {
      const tooClose = seenPts.some(pt => {
        const dLat = Math.abs(pt.lat - lat) * 111000;
        const dLon = Math.abs(pt.lon - lon) * 111000 * Math.cos(lat * Math.PI / 180);
        return Math.hypot(dLat, dLon) < 150;
      });
      if (tooClose) continue;
    }
    if (lon && lat) seenPts.push({ lat, lon });

    kept.push(f);
    if (kept.length >= 10) break;
  }

  return kept;
}

/**
 * 4-tier location search:
 *
 *  Tier 1 — Geoapify autocomplete + India filter + TN bias          (fast, cities/towns)
 *  Tier 2 — Geoapify geocode/search + India filter + TN bias        (full OSM, villages/buildings)
 *  Tier 3 — Geoapify geocode/search + "query Tamil Nadu India"      (regional context fallback)
 *  Tier 4 — Nominatim (OpenStreetMap official geocoder)             (maximum rural coverage)
 *
 * Each tier returns up to 10 candidates.
 * Results are ranked by rankAndDedup() before rendering.
 * Tiers escalate only when the ranked result set is empty after dedup.
 */
async function fetchAutocomplete(query, dropdownId, onSelect, field, searchTier = 1) {
  const dropdown = $(dropdownId);
  if (!dropdown) return;

  if (!isApiKeyValid()) {
    console.error('[Location] aborting — API key not configured.');
    showAcError(dropdownId, 'API key not configured. See console for details.', null);
    return;
  }

  if (!query || query.trim().length < 3) {
    closeDropdown(dropdownId, null);
    return;
  }

  const q         = query.trim();
  const sq        = encodeURIComponent(q);
  const retryArgs = { query: q, field, onSelect };

  // ── Build URL for each tier ───────────────────────────────────────────────
  let url, tierLabel, isNominatim = false;

  if (searchTier === 1) {
    tierLabel = 'Geoapify-autocomplete[IN+TN]';
    url = `${GEO_AUTOCOMPLETE}?text=${sq}&lang=en&limit=10` +
          `&filter[countrycode]=in&bias[proximity]=${TN_BIAS}` +
          `&apiKey=${GEOAPIFY_API_KEY}`;

  } else if (searchTier === 2) {
    tierLabel = 'Geoapify-search[IN+TN]';
    url = `${GEO_SEARCH}?text=${sq}&lang=en&limit=10` +
          `&filter[countrycode]=in&bias[proximity]=${TN_BIAS}` +
          `&apiKey=${GEOAPIFY_API_KEY}`;

  } else if (searchTier === 3) {
    tierLabel = 'Geoapify-search[TN-suffix]';
    const sqTN = encodeURIComponent(q + ' Tamil Nadu India');
    url = `${GEO_SEARCH}?text=${sqTN}&lang=en&limit=10` +
          `&apiKey=${GEOAPIFY_API_KEY}`;

  } else {
    tierLabel = 'Nominatim-OSM[IN]';
    isNominatim = true;
    const sqTN = encodeURIComponent(q + ' Tamil Nadu');
    url = `${NOMINATIM_SEARCH}?q=${sqTN}&format=json&limit=10` +
          `&countrycodes=in&addressdetails=1&accept-language=en`;
  }

  // Redact Geoapify key from logs (Nominatim URL is already safe)
  const safeLog = isNominatim
    ? url
    : url.replace(GEOAPIFY_API_KEY, `${GEOAPIFY_API_KEY.slice(0,4)}…KEY`);
  console.log(`[Search] query="${q}" tier=${searchTier} (${tierLabel}) →`, safeLog);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  let res;
  try {
    const fetchOpts = isNominatim
      ? { headers: { 'Accept-Language': 'en', 'User-Agent': 'GalaxyRide/1.0' } }
      : {};
    res = await fetch(url, fetchOpts);
  } catch (netErr) {
    console.error(`[Search] tier=${searchTier} network error:`, netErr.message);
    showAcError(dropdownId, 'Network error. Check your internet connection.', retryArgs);
    return;
  }

  console.log(`[Search] tier=${searchTier} ← HTTP ${res.status}`);

  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch { /**/ }
    console.error(`[Search] tier=${searchTier} HTTP ${res.status}:`, body);
    if (searchTier < 4) {
      console.warn(`[Search] escalating tier ${searchTier} → ${searchTier + 1}`);
      return fetchAutocomplete(q, dropdownId, onSelect, field, searchTier + 1);
    }
    showAcError(dropdownId, describeGeoapifyStatus(res.status), retryArgs);
    return;
  }

  // ── Parse ─────────────────────────────────────────────────────────────────
  let rawData;
  try {
    rawData = await res.json();
  } catch (parseErr) {
    console.error('[Location] JSON parse error:', parseErr.message);
    showAcError(dropdownId, 'Unexpected response from server.', retryArgs);
    return;
  }

  console.log(`[Search] tier=${searchTier} raw response:`, rawData);

  // Normalized GeoJSON features for ranking + rendering.
  // MUST be declared (strict mode) — assigned in both branches below.
  let features;

  // ── Normalize Nominatim → Geoapify GeoJSON feature shape ─────────────────
  if (isNominatim) {
    if (!Array.isArray(rawData)) {
      console.warn('[Location] Nominatim unexpected shape:', rawData);
      renderAutocomplete([], dropdownId, onSelect, q);
      return;
    }
    features = rawData.map(item => {
      // Map Nominatim class/type → result_type used by ranking + icons
      // buildings and amenities (apartments, shops, landmarks) → 'amenity'
      // highways/roads → 'street'
      // place types → city / locality
      let result_type = 'locality';
      if (item.class === 'building' || item.class === 'amenity' ||
          item.type  === 'apartments' || item.type === 'residential') {
        result_type = 'amenity';
      } else if (item.class === 'highway' || item.class === 'road') {
        result_type = 'street';
      } else if (item.type === 'city' || item.type === 'town') {
        result_type = 'city';
      } else if (item.type === 'village' || item.type === 'hamlet') {
        result_type = 'locality';
      }

      // Best display name: named entity first, then fall back to admin areas
      const displayName = item.name
        || item.address?.house_name
        || item.address?.building
        || item.address?.village || item.address?.hamlet
        || item.address?.suburb  || item.address?.town
        || item.address?.city    || item.display_name.split(',')[0];

      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [parseFloat(item.lon), parseFloat(item.lat)] },
        properties: {
          osm_id:    item.osm_id,
          name:      displayName,
          building:  item.address?.building,
          village:   item.address?.village,
          hamlet:    item.address?.hamlet,
          suburb:    item.address?.suburb,
          town:      item.address?.town,
          city:      item.address?.city || item.address?.town,
          county:    item.address?.county,
          state:     item.address?.state,
          country:   item.address?.country_code === 'in' ? 'India' : item.address?.country,
          formatted: item.display_name,
          result_type,
        },
      };
    });
  } else {
    if (!rawData || !Array.isArray(rawData.features)) {
      console.warn('[Location] Geoapify unexpected shape:', rawData);
      showAcError(dropdownId, 'Unexpected response shape.', retryArgs);
      return;
    }
    features = rawData.features;
  }

  // ── Tier 3 state guard ────────────────────────────────────────────────────
  // "query Tamil Nadu India" can match wrong-state results (e.g. "Nadu, UP").
  // Keep only Tamil Nadu results; escalate to Tier 4 if all are filtered out.
  if (searchTier === 3 && features.length > 0) {
    const tnFeatures = features.filter(f => {
      const s = (f.properties.state || '').toLowerCase();
      return s.includes('tamil') || s === 'tn';
    });
    if (tnFeatures.length > 0) {
      const ranked = rankAndDedup(tnFeatures, q);
      console.log(`[Search] Tier 3 — ${ranked.length} TN results ranked (${features.length} raw)`);
      renderAutocomplete(ranked, dropdownId, onSelect, q);
      return;
    }
    console.log('[Search] Tier 3: all results non-TN — escalating to Tier 4 (Nominatim)...');
    return fetchAutocomplete(q, dropdownId, onSelect, field, 4);
  }

  console.log(`[Search] Tier ${searchTier} (${tierLabel}) → ${features.length} raw results for "${q}"`);

  // ── Rank + dedup ─────────────────────────────────────────────────────────
  const ranked = rankAndDedup(features, q);
  console.log(`[Search] Tier ${searchTier} → ${ranked.length} ranked results`);

  // ── Escalate on 0 results after dedup ────────────────────────────────────
  if (ranked.length === 0) {
    if (searchTier < 4) {
      console.log(`[Location] 0 results at tier ${searchTier} — escalating to tier ${searchTier + 1}...`);
      return fetchAutocomplete(q, dropdownId, onSelect, field, searchTier + 1);
    }
    // All 4 tiers exhausted — structured failure log for debugging
    console.warn('[Search] ❌ No results found:', {
      query:           q,
      tiers_attempted: 4,
      timestamp:       new Date().toISOString(),
      suggestion:      'Location may not exist in Geoapify/OSM. Try nearby town or district name.',
    });
    renderAutocomplete([], dropdownId, onSelect, q);
    return;
  }

  renderAutocomplete(ranked, dropdownId, onSelect, q);
}

// --- Highlight the query match within a text string ---
// Returns safe HTML — matching portion wrapped in <strong class="ac-match">.
function highlightMatch(text, query) {
  if (!query || !text) return escapeHtml(text || '');
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(text);
  return (
    escapeHtml(text.slice(0, idx)) +
    `<strong class="ac-match">${escapeHtml(text.slice(idx, idx + query.length))}</strong>` +
    escapeHtml(text.slice(idx + query.length))
  );
}

// --- Render the suggestion list ---
// query is optional — passed when known, used to bold the matching portion of the name.
function renderAutocomplete(features, dropdownId, onSelect, query = '') {
  const dropdown = $(dropdownId);
  if (!dropdown) return;

  if (!features.length) {
    dropdown.innerHTML = `
      <div class="ac-empty" style="padding:14px 16px; text-align:left;">
        <div style="font-weight:600; margin-bottom:4px;">Location not found</div>
        <div style="font-size:12px; opacity:0.75;">Try: nearby town, taluk, or district name.<br>
        Example: search "Salem" or "Namakkal" instead of a small village.</div>
      </div>`;
    dropdown.classList.remove('hidden');
    return;
  }

  dropdown.innerHTML = features.map((f, i) => {
    const p = f.properties;

    // Name priority: specific entity → administrative area
    const name =
      p.name ||
      p.building ||                     // Nominatim building name
      p.hamlet || p.village || p.suburb || p.town || p.quarter ||
      p.street || p.city ||
      p.address_line1 ||
      p.formatted || 'Unknown';

    // Address sub-line for disambiguation
    const rawParts = [
      p.building && p.building !== name ? p.building : null,
      p.hamlet   && p.hamlet   !== name ? p.hamlet   : null,
      p.village  && p.village  !== name ? p.village  : null,
      p.suburb   && p.suburb   !== name ? p.suburb   : null,
      p.city     && p.city     !== name ? p.city     : null,
      p.county,
      p.state_district,
      p.state,
    ];
    const address = rawParts.filter(Boolean).join(', ')
                 || p.address_line2
                 || p.formatted
                 || '';

    // Icon per result_type (amenity = apartment/building/shop/landmark)
    const icon = p.result_type === 'amenity'                           ? 'fa-building'
               : p.result_type === 'street'                            ? 'fa-road'
               : p.result_type === 'city'                              ? 'fa-city'
               : (p.result_type === 'locality' ||
                  p.result_type === 'village'  ||
                  p.result_type === 'hamlet')                          ? 'fa-map-pin'
               : p.result_type === 'postcode'                          ? 'fa-envelope'
               : 'fa-map-marker-alt';

    // Bold the matching part of the name
    const nameHtml = highlightMatch(name, query);

    return `<div class="autocomplete-item" tabindex="0" role="option" data-idx="${i}" aria-label="${escapeHtml(p.formatted || name)}">
      <i class="fas ${icon}"></i>
      <div>
        <div class="place-name">${nameHtml}</div>
        ${address ? `<div class="place-address">${escapeHtml(address)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  dropdown.classList.remove('hidden');

  // Click handler — mousedown fires before blur so input stays focused
  dropdown.querySelectorAll('.autocomplete-item').forEach((item, i) => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();

      const f = features[i];
      const p = f.properties;

      // Coordinates: GeoJSON geometry gives [lon, lat]; Geoapify search also puts lat/lon in properties
      const lon = f.geometry?.coordinates?.[0] ?? p.lon;
      const lat = f.geometry?.coordinates?.[1] ?? p.lat;
      const coords = { lon, lat };

      // Label to fill into the input — use formatted or reconstruct from parts
      const label = p.formatted
        || [p.name || p.village || p.hamlet, p.city || p.town, p.state].filter(Boolean).join(', ')
        || p.name || '';

      onSelect({ coords, label });
    });
  });
}

// --- Keyboard: Arrow up/down + Enter + Escape inside a dropdown ---
function handleAcKeydown(e, dropdownId) {
  const dropdown = $(dropdownId);
  if (!dropdown || dropdown.classList.contains('hidden')) return;

  const items = Array.from(dropdown.querySelectorAll('.autocomplete-item'));
  if (!items.length) return;

  const current = dropdown.querySelector('.ac-highlighted');
  let idx = items.indexOf(current);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    current?.classList.remove('ac-highlighted');
    idx = (idx + 1) % items.length;
    items[idx].classList.add('ac-highlighted');
    items[idx].scrollIntoView({ block: 'nearest' });

  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    current?.classList.remove('ac-highlighted');
    idx = idx <= 0 ? items.length - 1 : idx - 1;
    items[idx].classList.add('ac-highlighted');
    items[idx].scrollIntoView({ block: 'nearest' });

  } else if (e.key === 'Enter' && current) {
    e.preventDefault();
    current.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

  } else if (e.key === 'Escape') {
    closeDropdown(dropdownId, e.target);
  }
}

// --- Close a dropdown and remove the open marker from its parent group ---
function closeDropdown(dropdownId, inputEl) {
  const dropdown = $(dropdownId);
  if (dropdown) {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
  }
  const group = inputEl?.closest('.autocomplete-group');
  if (group) group.classList.remove('is-open');
}

function setupClickOutside() {
  document.addEventListener('click', (e) => {
    // Compare the clicked element's containing group against each input's group.
    // This correctly keeps the dropdown open when clicking the "Use Location"
    // button, the label, or any other element inside the same group.
    const clickedGroup = e.target.closest('.autocomplete-group');
    const pickupGroup  = $('pickup')?.closest('.autocomplete-group');
    const dropGroup    = $('drop')?.closest('.autocomplete-group');

    if (clickedGroup !== pickupGroup) closeDropdown('pickupDropdown', $('pickup'));
    if (clickedGroup !== dropGroup)   closeDropdown('dropDropdown',   $('drop'));

    if (!e.target.closest('.user-menu')) hide('userDropdown');
  });
}

// ==================== GEOLOCATION ====================

/**
 * Build a short, human-readable pickup label from Geoapify reverse-geocode properties.
 *
 * Rules:
 *   accuracy < 100m  → "Current Location"   (pin is precise, clean label)
 *   accuracy ≥ 100m  → "Village/Town, District"  (cell-tower fix, show area for confirmation)
 *   no geocode data  → raw "lat, lon"
 *
 * Returns: { short, full }
 *   short — what shows in the input box
 *   full  — stored internally and sent with booking
 */
function buildPickupLabel(props, accuracy, lat, lon) {
  // ── Fallback: no API data ─────────────────────────────────────────────────
  if (!props) {
    const coords = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    return { short: coords, full: coords };
  }

  const full = props.formatted || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  // ── Accurate GPS fix (< 100 m) → clean "Current Location" label ──────────
  if (accuracy < 100) {
    return { short: 'Current Location', full };
  }

  // ── Approximate fix (≥ 100 m) → show area/district so user can verify ────
  const primary = props.village
    || props.hamlet
    || props.suburb
    || props.quarter
    || props.town
    || props.city
    || '';

  const district = props.county       // district/taluk in India
    || props.state_district
    || '';

  let short = [primary, district].filter(Boolean).join(', ');

  // Final fallback if nothing useful was extracted
  if (!short) short = props.city || props.state || 'Current Location';

  return { short, full };
}

function useCurrentLocation() {
  // ── Guard: browser support ────────────────────────────────────────────────
  if (!navigator.geolocation) {
    console.error('[GeoLoc] navigator.geolocation not available in this browser/context.');
    showToast('error', 'Location not supported by this browser.');
    return;
  }

  const input     = $('pickup');
  const btn       = document.querySelector('.location-btn');
  const ICON_IDLE = '<i class="fas fa-crosshairs"></i>';
  const ICON_SPIN = '<i class="fas fa-spinner fa-spin"></i>';

  function setBtnState(loading) {
    if (btn)   { btn.innerHTML = loading ? ICON_SPIN : ICON_IDLE; btn.disabled = loading; }
    if (input) { input.disabled = loading; }
  }

  function setPickup(short, full) {
    if (!input) return;
    input.value                  = short;
    input.dataset.fullAddress    = full;       // booking system reads this
    input.title                  = full;       // tooltip on hover
    state.pickupFullAddress      = full;       // also kept in state
  }

  setBtnState(true);
  console.log('[GeoLoc] Requesting browser location permission…');

  navigator.geolocation.getCurrentPosition(

    // ── SUCCESS ──────────────────────────────────────────────────────────────
    async (pos) => {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      console.log(`[GeoLoc] ✓ Position — lat: ${lat}, lon: ${lon}, accuracy: ±${Math.round(accuracy)}m`);

      state.pickupCoords = { lat, lon };

      try {
        const url = `https://api.geoapify.com/v1/geocode/reverse` +
                    `?lat=${lat}&lon=${lon}&lang=en&apiKey=${GEOAPIFY_API_KEY}`;
        console.log('[GeoLoc] Reverse geocoding…');
        const res = await fetch(url);

        if (!res.ok) throw new Error(`HTTP ${res.status} from reverse geocode`);

        const data  = await res.json();
        const props = data.features?.[0]?.properties || null;
        console.log('[GeoLoc] Reverse geocode props:', props);

        const { short, full } = buildPickupLabel(props, accuracy, lat, lon);
        console.log(`[GeoLoc] Label → short: "${short}" | full: "${full}"`);

        setPickup(short, full);
        if (state.dropCoords) calcDistance();
        showToast('success', 'Current location set as pickup!');

      } catch (fetchErr) {
        console.warn('[GeoLoc] Reverse geocode failed:', fetchErr.message);
        const coords = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        setPickup(coords, coords);
        showToast('info', 'Location found — address lookup unavailable, coordinates used.');
      } finally {
        setBtnState(false);
      }
    },

    // ── ERROR ─────────────────────────────────────────────────────────────────
    (err) => {
      setBtnState(false);

      const messages = {
        1: 'Location permission denied. Enable it in browser/device settings and try again.',
        2: 'GPS signal unavailable. Check your device location settings.',
        3: 'Location request timed out. Move to an open area and try again.',
      };
      const msg = messages[err.code] || `Location error (code ${err.code}): ${err.message}`;

      console.error(`[GeoLoc] ✗ code: ${err.code}, message: "${err.message}"`);
      showToast('error', msg);
    },

    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// ==================== DISTANCE CALCULATION ====================

async function calcDistance() {
  if (!state.pickupCoords || !state.dropCoords) return;
  try {
    const { lat: fromLat, lon: fromLon } = state.pickupCoords;
    const { lat: toLat,   lon: toLon   } = state.dropCoords;
    const url = `https://api.geoapify.com/v1/routing?waypoints=${fromLat},${fromLon}|${toLat},${toLon}&mode=drive&apiKey=${GEOAPIFY_API_KEY}`;
    const res  = await fetch(url);
    const data = await res.json();
    const meters = data.features?.[0]?.properties?.distance || 0;
    state.distance = Math.ceil(meters / 1000);
    calculateFare();
  } catch (e) {
    // Fallback to straight-line distance
    state.distance = haversineKm(state.pickupCoords, state.dropCoords);
    calculateFare();
  }
}

function haversineKm(a, b) {
  const R    = 6371;
  const dLat = deg2rad(b.lat - a.lat);
  const dLon = deg2rad(b.lon - a.lon);
  const h    = Math.sin(dLat/2)**2 + Math.cos(deg2rad(a.lat))*Math.cos(deg2rad(b.lat))*Math.sin(dLon/2)**2;
  return Math.ceil(2 * R * Math.asin(Math.sqrt(h)));
}

function deg2rad(d) { return d * (Math.PI / 180); }

// ==================== SWAP LOCATIONS ====================

function swapLocations() {
  const pu = $('pickup'), dr = $('drop');
  [pu.value, dr.value] = [dr.value, pu.value];
  [state.pickupCoords, state.dropCoords] = [state.dropCoords, state.pickupCoords];
  calculateFare();
}

// ==================== FARE CALCULATION ====================

/**
 * Pure fare engine — single source of truth used by both the fare-preview
 * breakdown AND the per-vehicle price tags so they can never disagree.
 *
 * @returns {object|null} breakdown: { baseFare, cityFare, outstationFare,
 *          driverBata, peakSurcharge, subtotal, isOutstation } or null if
 *          the vehicle has no tariff for the given tab.
 */
function computeFare(vehicle, km, tab, applyPeak, hourlyHrs) {
  let baseFare = 0, cityFare = 0, outstationFare = 0, driverBata = 0, peakSurcharge = 0;
  const isOutstation = km > 100 && tab !== 'hourly';

  if (tab === 'hourly') {
    if (hourlyHrs > 0) {
      const table = TARIFF.hourly[vehicle] || TARIFF.hourly.sedan;
      baseFare = table[hourlyHrs - 1] || 0;
    }
  } else {
    const t = TARIFF.local[vehicle];
    if (!t) return null;
    baseFare = t.base;

    if (isOutstation) {
      // 3-tier: base covers first 3km, city rate km 4-100, outstation rate km 101+
      const cityKm       = Math.max(0, 100 - t.included);
      const outstationKm = Math.max(0, km - 100);
      const ot           = TARIFF.outstation[vehicle];
      cityFare       = cityKm * t.perKm;
      outstationFare = ot ? outstationKm * ot.perKm : outstationKm * t.perKm;
      driverBata     = ot ? ot.driverBata : 400;
    } else {
      const extraKm = Math.max(0, km - t.included);
      const rate    = applyPeak && t.peakPerKm > 0 ? t.peakPerKm : t.perKm;
      cityFare      = extraKm * rate;
      if (applyPeak && t.peakPerKm > 0) {
        peakSurcharge = Math.round(cityFare * 0.15);
      }
    }
  }

  // Round trip doubles distance fares (not bata)
  if (tab === 'roundtrip') {
    cityFare       *= 2;
    outstationFare *= 2;
  }

  const subtotal = baseFare + cityFare + outstationFare + driverBata + peakSurcharge;
  return { baseFare, cityFare, outstationFare, driverBata, peakSurcharge, subtotal, isOutstation };
}

function calculateFare() {
  const vehicle = document.querySelector('input[name="vehicle"]:checked')?.value;
  state.selectedVehicle = vehicle;

  if (!vehicle) { hide('farePreview'); return; }

  const dateVal  = $('date')?.value;
  const timeVal  = $('time')?.value;
  const isPeak   = dateVal && timeVal && isPeakHour(dateVal, timeVal);

  const km           = state.distance || 0;
  const hourlyHrs    = state.currentTab === 'hourly' ? (parseInt($('hourlyPackage')?.value) || 0) : 0;
  // Peak surcharge: city rides only, ≤ 100km only
  const applyPeak    = isPeak && state.currentTab !== 'hourly' && km <= 100;

  const fare = computeFare(vehicle, km, state.currentTab, applyPeak, hourlyHrs);
  if (!fare) return;
  const { baseFare, cityFare, outstationFare, driverBata, peakSurcharge, subtotal, isOutstation } = fare;

  const discount = calculateCouponDiscount(state.appliedCoupon, subtotal);
  const total    = Math.max(0, subtotal - discount);

  state.fare          = total;
  state.couponDiscount = discount;

  // Update UI
  $('baseFareDisplay').textContent     = `₹${baseFare}`;
  $('distanceDisplay').textContent     = isOutstation ? 100 - (TARIFF.local[vehicle]?.included || 3) : km;
  $('distanceFareDisplay').textContent = `₹${cityFare}`;

  $('outstationFareRow').classList.toggle('hidden', !isOutstation);
  $('outstationKmDisplay').textContent  = Math.max(0, km - 100);
  $('outstationFareDisplay').textContent = `₹${outstationFare}`;

  $('driverBataRow').classList.toggle('hidden', !isOutstation);
  $('driverBataDisplay').textContent   = `₹${driverBata}`;

  $('peakRow').classList.toggle('hidden', !applyPeak || peakSurcharge === 0);
  $('peakFareDisplay').textContent     = `₹${peakSurcharge}`;

  $('totalFareDisplay').textContent    = `₹${total}`;

  $('couponRow').classList.toggle('hidden', discount === 0);
  $('couponDiscountDisplay').textContent = `-₹${discount}`;

  // Update vehicle price tags for ALL vehicles using the SAME fare engine,
  // so each card's price matches what the user will actually pay (incl. peak
  // surcharge, outstation tiers, round-trip doubling).
  ['mini','sedan','suv','innova'].forEach(v => {
    const el = $(`${v}Price`);
    if (el) {
      if (km > 0) {
        const f = computeFare(v, km, state.currentTab, applyPeak, hourlyHrs);
        el.textContent = f ? `₹${f.subtotal}` : `₹${TARIFF.local[v]?.base || '—'}`;
      } else {
        el.textContent = `₹${TARIFF.local[v]?.base || '—'}`;
      }
    }
  });

  show('farePreview');
}

function calculateCouponDiscount(code, subtotal) {
  if (!code) return 0;
  const c = COUPONS[code.toUpperCase()];
  if (!c || subtotal < c.minOrder) return 0;
  if (c.type === 'flat') return Math.min(c.value, subtotal);
  if (c.type === 'percent') return Math.min(Math.round(subtotal * c.value / 100), c.max || Infinity);
  return 0;
}

// ==================== COUPON ====================

function applyCoupon() {
  const code = $('couponCode')?.value?.trim().toUpperCase();
  const msg  = $('couponMessage');
  const dateVal = $('date')?.value;
  const timeVal = $('time')?.value;

  if (!code) { showCouponMsg('error', 'Please enter a coupon code.'); return; }

  const coupon = COUPONS[code];
  if (!coupon) { showCouponMsg('error', 'Invalid coupon code.'); state.appliedCoupon = null; calculateFare(); return; }

  const subtotal = state.fare + state.couponDiscount;
  if (subtotal < coupon.minOrder) {
    showCouponMsg('error', `Minimum order ₹${coupon.minOrder} required.`);
    return;
  }

  state.appliedCoupon = code;
  calculateFare();
  const discount = calculateCouponDiscount(code, state.fare + state.couponDiscount);
  showCouponMsg('success', `🎉 Coupon applied! You saved ₹${discount}.`);
}

function showCouponMsg(type, text) {
  const el = $('couponMessage');
  el.textContent  = text;
  el.className    = `coupon-message ${type}`;
  show('couponMessage');
  if (type === 'error') setTimeout(() => hide('couponMessage'), 3000);
}

// ==================== PRICING TABS ====================

function showPricingTab(tab, el) {
  $$('.price-tab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  $$('.pricing-table-wrap').forEach(w => w.classList.remove('active'));
  $(`pricing${tab.charAt(0).toUpperCase() + tab.slice(1)}`)?.classList.add('active');
}

// ==================== FAQ ====================

function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  const isOpen = item.classList.contains('active');
  $$('.faq-item').forEach(i => i.classList.remove('active'));
  if (!isOpen) item.classList.add('active');
}

// ==================== BOOKING SUBMIT ====================

function handleBookingSubmit(e) {
  e.preventDefault();

  if (!state.selectedVehicle) {
    showToast('error', 'Please select a vehicle type.');
    return;
  }
  if (!$('pickup').value.trim()) {
    showToast('error', 'Please enter pickup location.');
    return;
  }
  if (state.currentTab !== 'hourly' && !$('drop').value.trim()) {
    showToast('error', 'Please enter drop location.');
    return;
  }

  // Validate time is at least 30 min from now
  const dateVal  = $('date').value;
  const timeVal  = $('time').value;
  if (dateVal && timeVal) {
    const selected = new Date(`${dateVal}T${timeVal}`);
    const minTime  = new Date(Date.now() + 30 * 60 * 1000);
    if (selected < minTime) {
      showToast('error', 'Pickup time must be at least 30 minutes from now.');
      return;
    }
  }

  // Check auth
  if (!window._currentUser) {
    showToast('info', 'Please sign in to book a ride.');
    openAuthModal('login');
    return;
  }

  // Open customer details modal — pre-fill from auth user
  openCustomerDetailsModal();
}

function openCustomerDetailsModal() {
  const user = window._currentUser;
  if (user) {
    const nameEl  = $('custName');
    const emailEl = $('custEmail');
    const phoneEl = $('custPhone');
    if (nameEl  && !nameEl.value)  nameEl.value  = user.displayName || '';
    if (emailEl && !emailEl.value) emailEl.value = user.email || '';
    if (phoneEl && !phoneEl.value) phoneEl.value = window._currentUserPhone || '';
  }
  openModal('customerModal');
}

function handleCustomerDetailsSubmit(e) {
  e.preventDefault();
  const name  = $('custName').value.trim();
  const phone = $('custPhone').value.trim();
  const email = $('custEmail').value.trim();

  if (!name)  { showToast('error', 'Please enter your full name.');    return; }
  if (!phone) { showToast('error', 'Please enter your phone number.'); return; }
  if (!email) { showToast('error', 'Please enter your email address.'); return; }

  // Store customer details in state
  state.customerDetails = { name, phone, email };

  closeModal('customerModal');
  buildBookingData();
  openModal('bookingModal');
}

function buildBookingData() {
  const cust        = state.customerDetails || {};
  const pickupInput = $('pickup');
  // Use the full address stored by GPS (dataset.fullAddress) when available,
  // otherwise fall back to whatever the user typed.
  const pickupFull  = pickupInput?.dataset?.fullAddress || pickupInput?.value || '';

  state.bookingData = {
    type:          state.currentTab,
    pickup:        pickupFull,
    drop:          $('drop')?.value || '',
    date:          $('date').value,
    time:          $('time').value,
    passengers:    state.passengers,
    vehicle:       state.selectedVehicle,
    distance:      state.distance,
    fare:          state.fare,
    coupon:        state.appliedCoupon,
    discount:      state.couponDiscount,
    userId:        window._currentUser?.uid,
    userEmail:     cust.email   || window._currentUser?.email || '',
    customerName:  cust.name    || window._currentUser?.displayName || 'Guest',
    customerPhone: cust.phone   || window._currentUserPhone || '',
    createdAt:     new Date().toISOString(),
  };
  renderBookingSummary();
}

function renderBookingSummary() {
  const d    = state.bookingData;
  const wrap = $('bookingSummary');
  wrap.innerHTML = `
    <div class="summary-row"><span>Trip Type</span><span>${capitalize(d.type)}</span></div>
    <div class="summary-row"><span>Pickup</span><span>${d.pickup}</span></div>
    ${d.drop ? `<div class="summary-row"><span>Drop</span><span>${d.drop}</span></div>` : ''}
    <div class="summary-row"><span>Date & Time</span><span>${formatDate(d.date)} at ${d.time}</span></div>
    <div class="summary-row"><span>Vehicle</span><span>${capitalize(d.vehicle)}</span></div>
    <div class="summary-row"><span>Passengers</span><span>${d.passengers}</span></div>
    ${d.distance ? `<div class="summary-row"><span>Distance</span><span>~${d.distance} km</span></div>` : ''}
    ${d.discount > 0 ? `<div class="summary-row"><span>Discount</span><span style="color:var(--success)">-₹${d.discount}</span></div>` : ''}
    <div class="summary-row summary-total"><span><strong>Total Fare</strong></span><span>₹${d.fare}</span></div>
  `;
  const payBtn = $('payBtnText');
  const method = document.querySelector('input[name="paymentMethod"]:checked')?.value;
  if (payBtn) payBtn.textContent = method === 'cash' ? 'Confirm Booking' : `Pay ₹${d.fare}`;
}

// Update pay button when method changes
document.addEventListener('change', (e) => {
  if (e.target.name === 'paymentMethod') {
    const txt = $('payBtnText');
    if (txt && state.bookingData) {
      txt.textContent = e.target.value === 'cash' ? 'Confirm Booking' : `Pay ₹${state.bookingData.fare}`;
    }
  }
});

// ==================== PAYMENT ====================

async function processPayment() {
  const method = document.querySelector('input[name="paymentMethod"]:checked')?.value;
  const btn    = $('payBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

  if (method === 'cash') {
    await confirmBooking('cash', null);
    return;
  }

  // Create Razorpay order via Netlify function
  try {
    const response = await fetch('/api/create-order', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        amount:    state.bookingData.fare * 100, // paise
        currency:  'INR',
        notes:     { booking: JSON.stringify(state.bookingData) },
      }),
    });
    const order = await response.json();

    // Server must return a valid order + publishable key (from env vars).
    if (!response.ok || !order.id || !order.key) {
      console.error('[GR] create-order failed:', order);
      showToast('error', order.error || 'Could not start payment. Please try again.');
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-lock"></i> <span id="payBtnText">Pay ₹${state.bookingData.fare}</span>`;
      return;
    }

    const options = {
      key:         order.key,   // ← publishable key from server env (never hardcoded)
      amount:      order.amount,
      currency:    order.currency,
      name:        'Galaxy Ride',
      description: `${capitalize(state.bookingData.type)} - ${capitalize(state.bookingData.vehicle)}`,
      order_id:    order.id,
      prefill: {
        name:    window._currentUser?.displayName || '',
        email:   window._currentUser?.email || '',
        contact: window._currentUser?.phoneNumber || '',
      },
      theme:    { color: '#E31E24' },
      handler:  async (response) => {
        await verifyAndConfirm(response, order.id);
      },
      modal: {
        ondismiss: () => {
          btn.disabled = false;
          btn.innerHTML = `<i class="fas fa-lock"></i> <span id="payBtnText">Pay ₹${state.bookingData.fare}</span>`;
        },
      },
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', (r) => {
      showToast('error', `Payment failed: ${r.error.description}`);
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-lock"></i> <span id="payBtnText">Pay ₹${state.bookingData.fare}</span>`;
    });
    rzp.open();

  } catch (err) {
    console.error('Payment error:', err);
    showToast('error', 'Payment initialization failed. Please try again.');
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-lock"></i> <span id="payBtnText">Pay ₹${state.bookingData.fare}</span>`;
  }
}

async function verifyAndConfirm(rzpResponse, orderId) {
  console.log('[GR] verifyAndConfirm() → orderId:', orderId);
  console.log('[GR] razorpay_payment_id:', rzpResponse.razorpay_payment_id);
  try {
    console.log('[GR] Calling /api/verify-payment...');
    const res = await fetch('/api/verify-payment', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        razorpay_order_id:   orderId,
        razorpay_payment_id: rzpResponse.razorpay_payment_id,
        razorpay_signature:  rzpResponse.razorpay_signature,
      }),
    });
    const data = await res.json();
    console.log('[GR] /api/verify-payment response:', data);

    if (data.verified) {
      console.log('[GR] Payment verified ✓ → calling confirmBooking()');
      await confirmBooking('online', rzpResponse.razorpay_payment_id);
    } else {
      console.error('[GR] Payment verification FAILED — signature mismatch');
      showToast('error', 'Payment verification failed. Contact support.');
    }
  } catch (e) {
    console.error('[GR] verifyAndConfirm error:', e);
    showToast('error', 'Could not verify payment. Contact support.');
  }
}

async function confirmBooking(paymentMethod, paymentId) {
  const bookingId = generateBookingId();
  const booking   = {
    ...state.bookingData,
    bookingId,
    paymentMethod,
    paymentId:   paymentId || null,
    status:      'confirmed',
    confirmedAt: new Date().toISOString(),
  };

  console.log('[GR] confirmBooking() start');
  console.log('[GR] bookingId:', bookingId);
  console.log('[GR] paymentMethod:', paymentMethod, '| paymentId:', paymentId);
  console.log('[GR] booking payload:', booking);

  // Step 1: Save to Firestore (client-side)
  try {
    console.log('[GR] Step 1 → Firestore client save...');
    const fns = window._firebaseFns;
    if (fns?.saveBooking) {
      await fns.saveBooking(booking);
      console.log('[GR] Step 1 ✓ Firestore client save OK');
    } else {
      console.warn('[GR] Step 1 ✗ saveBooking not available — Firebase not ready?');
    }
  } catch (e) {
    console.error('[GR] Step 1 ✗ Firestore client save failed:', e.message);
  }

  // Step 2: Call /api/booking (server-side Firestore + Telegram)
  try {
    console.log('[GR] Step 2 → Calling /api/booking...');
    const res  = await fetch('/api/booking', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(booking),
    });
    const data = await res.json();
    console.log('[GR] Step 2 /api/booking status:', res.status);
    console.log('[GR] Step 2 /api/booking response:', data);

    if (res.ok && data.success) {
      console.log('[GR] Step 2 ✓ Booking saved to server | Telegram notification triggered');
    } else {
      console.error('[GR] Step 2 ✗ /api/booking returned error:', data.error || data);
    }
  } catch (e) {
    console.error('[GR] Step 2 ✗ /api/booking fetch failed:', e.message);
  }

  // Step 3: Save to trip_requests (admin app reads this live)
  try {
    console.log('[GR] Step 3 → Saving to trip_requests...');
    const fns = window._firebaseFns;
    if (fns?.saveTripRequest) {
      const tripRequest = {
        tripId:        bookingId,
        customerName:  booking.customerName,
        customerPhone: booking.customerPhone,
        customerEmail: booking.userEmail,
        pickup:        booking.pickup,
        drop:          booking.drop,
        tripType:      booking.type,
        vehicleType:   booking.vehicle,
        date:          booking.date,
        time:          booking.time,
        passengers:    booking.passengers,
        estimatedFare: booking.fare,
        paymentMethod: paymentMethod,
        paymentStatus: paymentMethod === 'online' ? 'paid' : 'cash_pending',
        distanceKm:    booking.distance || 0,
      };
      await fns.saveTripRequest(tripRequest);
      console.log('[GR] Step 3 ✓ trip_requests saved');
    }
  } catch (e) {
    console.warn('[GR] Step 3 ✗ trip_requests save failed (non-fatal):', e.message);
  }

  console.log('[GR] confirmBooking() complete → showing trip status screen');
  closeModal('bookingModal');
  showTripStatusScreen(bookingId, booking);
}

// ── Trip status screen ─────────────────────────────────────────────────────────
let _tripStatusUnsubscribe = null;

function showTripStatusScreen(tripId, booking) {
  // Populate static details
  $('statusTripId').textContent   = tripId;
  $('statusPickup').textContent   = booking.pickup || '—';
  $('statusDrop').textContent     = booking.drop   || (booking.type === 'hourly' ? 'Hourly Package' : '—');
  $('statusVehicle').textContent  = capitalize(booking.vehicle || '—');
  $('statusDateTime').textContent = `${formatDate(booking.date)} at ${booking.time}`;
  $('statusFare').textContent     = `₹${booking.fare}`;

  // Update WhatsApp link with trip ID
  const waLink = $('waSupport');
  if (waLink) waLink.href = `https://wa.me/919597815889?text=Hi%2C+my+Trip+ID+is+${tripId}`;

  // Reset status badge to pending
  updateTripStatusUI({ status: 'pending' });

  // Show modal
  $('tripStatusModal').classList.remove('hidden');

  // Start real-time listener
  if (_tripStatusUnsubscribe) _tripStatusUnsubscribe();
  const fns = window._firebaseFns;
  if (fns?.listenToTripRequest) {
    _tripStatusUnsubscribe = fns.listenToTripRequest(tripId, (data) => {
      console.log('[GR] Trip status update:', data.status);
      updateTripStatusUI(data);
    });
  }

  showToast('success', `🎉 Booking confirmed! Trip ID: ${tripId}`);
}

function updateTripStatusUI(data) {
  const badge    = $('statusBadge');
  const iconEl   = $('statusIcon');
  const textEl   = $('statusText');
  const driverEl = $('driverInfoCard');

  const map = {
    pending:   { icon: 'fas fa-clock',          text: 'Finding your driver…',  cls: ''          },
    accepted:  { icon: 'fas fa-user-check',      text: 'Driver Assigned ✓',    cls: 'accepted'  },
    ongoing:   { icon: 'fas fa-car',             text: 'Trip in Progress 🚗',   cls: 'ongoing'   },
    completed: { icon: 'fas fa-check-circle',    text: 'Trip Completed ✅',     cls: 'completed' },
    cancelled: { icon: 'fas fa-times-circle',    text: 'Trip Cancelled ❌',     cls: 'cancelled' },
  };

  const s = map[data.status] || map.pending;
  badge.className  = `status-badge ${s.cls}`;
  iconEl.className = s.icon;
  textEl.textContent = s.text;

  // Show driver info when assigned
  if (data.driverName && data.status !== 'pending') {
    $('driverNameDisplay').textContent = data.driverName;
    driverEl.classList.remove('hidden');
  } else {
    driverEl.classList.add('hidden');
  }

  // Stop listener when trip is terminal
  if ((data.status === 'completed' || data.status === 'cancelled') && _tripStatusUnsubscribe) {
    _tripStatusUnsubscribe();
    _tripStatusUnsubscribe = null;
  }
}


function generateBookingId() {
  return 'GR' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
}

// ==================== AUTH ====================

function openAuthModal(tab = 'login') {
  switchAuthTab(tab);
  openModal('authModal');
}

function switchAuthTab(tab) {
  $('loginTab').classList.toggle('hidden', tab !== 'login');
  $('signupTab').classList.toggle('hidden', tab !== 'signup');
}

async function signInWithGoogle() {
  try {
    const result = await window._firebaseFns.signInWithPopup(window._firebaseAuth, window._googleProvider);
    await saveUserProfile(result.user);
    closeModal('authModal');
    showToast('success', `Welcome, ${result.user.displayName || 'User'}!`);
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') {
      showToast('error', e.message || 'Google sign-in failed.');
    }
  }
}

async function handleEmailLogin(e) {
  e.preventDefault();
  const btn = $('loginBtn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Signing in...';

  try {
    const result = await window._firebaseFns.signInWithEmailAndPassword(
      window._firebaseAuth,
      $('loginEmail').value.trim(),
      $('loginPassword').value
    );
    closeModal('authModal');
    showToast('success', `Welcome back, ${result.user.displayName || result.user.email}!`);
  } catch (e) {
    showToast('error', friendlyAuthError(e.code));
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Sign In';
  }
}

async function handleEmailSignup(e) {
  e.preventDefault();
  const btn = $('signupBtn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Creating account...';

  try {
    const first = $('signupFirstName').value.trim();
    const last  = $('signupLastName').value.trim();
    const result = await window._firebaseFns.createUserWithEmailAndPassword(
      window._firebaseAuth,
      $('signupEmail').value.trim(),
      $('signupPassword').value
    );
    await window._firebaseFns.updateProfile(result.user, { displayName: `${first} ${last}` });
    await saveUserProfile(result.user, { phone: $('signupPhone').value.trim() });
    closeModal('authModal');
    showToast('success', `Welcome to Galaxy Ride, ${first}!`);
  } catch (e) {
    showToast('error', friendlyAuthError(e.code));
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Create Account';
  }
}

async function saveUserProfile(user, extra = {}) {
  const fns = window._firebaseFns;
  if (!fns?.saveUserProfile) return;
  await fns.saveUserProfile(user, extra);
}

async function signOutUser() {
  try {
    await window._firebaseFns.signOut(window._firebaseAuth);
    showToast('info', 'You have been signed out.');
    hide('userDropdown');
  } catch (e) {
    showToast('error', 'Sign out failed.');
  }
}

async function forgotPassword() {
  const email = $('loginEmail')?.value?.trim();
  if (!email) { showToast('error', 'Enter your email address first.'); return; }
  try {
    await window._firebaseFns.sendPasswordResetEmail(window._firebaseAuth, email);
    showToast('success', 'Password reset email sent!');
  } catch (e) {
    showToast('error', friendlyAuthError(e.code));
  }
}

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':        'No account found with this email.',
    'auth/wrong-password':        'Incorrect password.',
    'auth/email-already-in-use':  'Email is already registered.',
    'auth/weak-password':         'Password must be at least 8 characters.',
    'auth/invalid-email':         'Invalid email address.',
    'auth/too-many-requests':     'Too many attempts. Try again later.',
    'auth/network-request-failed':'Network error. Check your connection.',
  };
  return map[code] || 'Authentication failed. Please try again.';
}

function togglePassword(id) {
  const input = $(id);
  const btn   = input?.nextElementSibling;
  if (!input || !btn) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.querySelector('i').className = input.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}

function toggleUserDropdown() {
  toggle('userDropdown');
}

function showProfile()     { showToast('info', 'Profile page coming soon!'); }
function showMyBookings()  { showToast('info', 'My bookings page coming soon!'); }
function showWallet()      { showToast('info', 'Wallet feature coming soon!'); }
// ==================== DRIVER REGISTRATION ====================

const driverFiles = { drivingLicense: null, rcBook: null, insurance: null, driverPhoto: null };
let _driverStatusUnsub = null;

function openDriverSignup() {
  // Reset to the form view each time
  $('driverFormView')?.classList.remove('hidden');
  $('driverSuccessView')?.classList.add('hidden');
  openModal('driverModal');
}

function openDriverInfo() {
  // Scroll to the earnings section to learn more
  closeModal('driverModal');
  $('earnings')?.scrollIntoView({ behavior: 'smooth' });
}

// Map upload input id → driverFiles key
const _driverFileKey = {
  drvDocLicense:   'drivingLicense',
  drvDocRC:        'rcBook',
  drvDocInsurance: 'insurance',
  drvDocPhoto:     'driverPhoto',
};

function driverFileChosen(input, labelId) {
  const file = input.files?.[0] || null;
  const key  = _driverFileKey[input.id];
  if (key) driverFiles[key] = file;
  const label = $(labelId);
  if (label) {
    label.textContent = file ? file.name : 'Tap to upload';
    label.closest('.upload-box')?.classList.toggle('has-file', !!file);
  }
}

async function submitDriverApplication(e) {
  e.preventDefault();

  const data = {
    fullName:      $('drvFullName').value.trim(),
    mobile:        $('drvMobile').value.trim(),
    email:         $('drvEmail').value.trim(),
    city:          $('drvCity').value.trim(),
    vehicleType:   $('drvVehicleType').value,
    vehicleNumber: $('drvVehicleNumber').value.trim().toUpperCase(),
    licenseNumber: $('drvLicense').value.trim(),
    aadhaarNumber: $('drvAadhaar').value.trim(),
    userId:        window._currentUser?.uid || null,
  };

  // ── Validation ────────────────────────────────────────────────────────────
  if (!data.fullName)                 { showToast('error', 'Please enter your full name.'); return; }
  if (!/^\d{10}$/.test(data.mobile))  { showToast('error', 'Enter a valid 10-digit mobile number.'); return; }
  if (!data.city)                     { showToast('error', 'Please enter your city.'); return; }
  if (!data.vehicleType)              { showToast('error', 'Please select a vehicle type.'); return; }
  if (!data.vehicleNumber)            { showToast('error', 'Please enter your vehicle number.'); return; }
  if (!data.licenseNumber)            { showToast('error', 'Please enter your driving license number.'); return; }
  if (!/^\d{12}$/.test(data.aadhaarNumber)) { showToast('error', 'Enter a valid 12-digit Aadhaar number.'); return; }
  if (!driverFiles.drivingLicense)    { showToast('error', 'Please upload your Driving License.'); return; }
  if (!driverFiles.rcBook)            { showToast('error', 'Please upload your RC Book.'); return; }
  if (!driverFiles.insurance)         { showToast('error', 'Please upload your Insurance document.'); return; }
  if (!driverFiles.driverPhoto)       { showToast('error', 'Please upload your Driver Photo.'); return; }

  const fns = window._firebaseFns;
  if (!fns?.submitDriverApplication) { showToast('error', 'Service unavailable. Please try again later.'); return; }

  const btn = $('drvSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…';

  try {
    const appId = await fns.submitDriverApplication(data, { ...driverFiles });

    // Show success view with the generated Application ID
    $('drvAppId').textContent = appId;
    $('driverFormView').classList.add('hidden');
    $('driverSuccessView').classList.remove('hidden');
    showToast('success', 'Application submitted successfully!');

    // Live status — applicant sees approval/rejection in real time
    if (_driverStatusUnsub) _driverStatusUnsub();
    if (fns.listenToDriverApplication) {
      _driverStatusUnsub = fns.listenToDriverApplication(appId, (d) => updateDriverStatusUI(d.status, d.statusNote));
    }
  } catch (err) {
    console.error('[Driver] submit failed:', err);
    showToast('error', 'Submission failed. Please check your connection and try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Application';
  }
}

function updateDriverStatusUI(status, note) {
  const box = $('drvStatusLive');
  if (!box) return;
  const map = {
    pending:   { cls: 'pending',  icon: 'fa-clock',         text: 'Pending Review' },
    approved:  { cls: 'approved', icon: 'fa-circle-check',  text: 'Approved ✓' },
    rejected:  { cls: 'rejected', icon: 'fa-circle-xmark',  text: 'Not Approved' },
    more_docs: { cls: 'pending',  icon: 'fa-file-arrow-up', text: 'More Documents Requested' },
  };
  const s = map[status] || map.pending;
  box.innerHTML = `<span class="dsl-badge ${s.cls}"><i class="fas ${s.icon}"></i> ${s.text}</span>`
    + (note ? `<p class="dsl-note">${escapeHtml(note)}</p>` : '');

  if (status === 'approved') {
    showToast('success', 'Your Galaxy Ride Driver Application has been approved.');
  }
}
function showAppDownload(p){ showToast('info', `${p === 'android' ? 'Android' : 'iOS'} app coming soon!`); }

// ==================== CONTACT FORM ====================

async function handleContactSubmit(e) {
  e.preventDefault();
  const form = e.target;

  const data = {
    name:    $('cName')?.value.trim()  || '',
    phone:   $('cPhone')?.value.trim() || '',
    email:   $('cEmail')?.value.trim() || '',
    message: $('cMsg')?.value.trim()   || '',
  };

  // ── Validation ────────────────────────────────────────────────────────────
  if (!data.name)    { showToast('error', 'Please enter your name.');    $('cName')?.focus();  return; }
  if (!data.phone)   { showToast('error', 'Please enter your phone number.'); $('cPhone')?.focus(); return; }
  if (!data.message) { showToast('error', 'Please enter a message.');    $('cMsg')?.focus();   return; }

  // ── Loading state ─────────────────────────────────────────────────────────
  const btn = form.querySelector('button[type="submit"]');
  const btnHtml = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…'; }

  try {
    const fns = window._firebaseFns;
    if (fns?.saveContactMessage) {
      await fns.saveContactMessage(data);
    } else {
      console.warn('[Contact] Firebase not ready — message not persisted');
    }
    showToast('success', 'Thank you for contacting Galaxy Ride. Our team will contact you shortly.');
    form.reset();
  } catch (err) {
    console.error('[Contact] save failed:', err);
    showToast('error', 'Could not send your message. Please try again or call us directly.');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = btnHtml; }
  }
}

// ==================== MODALS ====================

function openModal(id) {
  show(id);
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  hide(id);
  document.body.style.overflow = '';
}
function closeModalOnOverlay(e, id) {
  if (e.target.id === id) closeModal(id);
}

// ==================== TOAST ====================

let toastTimeout;
function showToast(type, message) {
  const toast    = $('toast');
  const icon     = $('toastIcon');
  const msgEl    = $('toastMessage');
  const iconMap  = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };

  toast.className  = `toast ${type}`;
  icon.className   = `toast-icon fas ${iconMap[type] || 'fa-info-circle'}`;
  msgEl.textContent = message;
  show('toast');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => hideToast(), 4000);
}
function hideToast() { hide('toast'); }

// ==================== TRIP PLANNER ====================

function openTripPlanner(destination) {
  window.location.href = `trip-planner.html?destination=${encodeURIComponent(destination)}`;
}

// ==================== SCROLL TO BOOKING ====================

function scrollToBooking() {
  $('home').scrollIntoView({ behavior: 'smooth' });
}

// ==================== ANIMATE ON SCROLL ====================

function animateOnScroll() {
  const cards = $$('.service-card, .vehicle-showcase-card, .why-card, .faq-item, .testimonial-card, .earnings-card');
  cards.forEach(card => {
    card.style.opacity    = '0';
    card.style.transform  = 'translateY(24px)';
    card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  });

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity   = '1';
        e.target.style.transform = 'translateY(0)';
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  cards.forEach(c => obs.observe(c));
}

// ==================== UTILS ====================

function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
