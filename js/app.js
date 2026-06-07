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
// South India proximity bias — Madurai (geographic center of South India)
// Format: lon,lat  (Geoapify uses longitude-first)
const TN_BIAS = '78.1198,9.9252';

// South India states accepted in Tier 3 filtering
const SOUTH_INDIA_STATES = [
  'tamil nadu', 'karnataka', 'kerala', 'andhra pradesh',
  'telangana', 'puducherry', 'pondicherry',
];

// ── Village/hamlet suffix patterns common in Tamil Nadu & South India ─────────
// When a query ends with one of these, Geoapify has poor coverage.
// We skip directly to Nominatim (OSM) which indexes every OSM village node.
const VILLAGE_SUFFIX_RE = /(?:patti|puram|kulam|pettai|mangalam|palayam|eri|thurai|kuppam|agaram|kadu|kottai|thoppu|pattinam|pattanam|pandi|salai|kappu|nallur|nagar|colony|layout|street|road)$/i;
// Also detect Tamil-script input — Nominatim handles Unicode queries natively.
const TAMIL_SCRIPT_RE   = /[஀-௿]/;

function isVillagePattern(q) {
  const t = q.trim().toLowerCase();
  // Village suffix match OR Tamil script input
  return VILLAGE_SUFFIX_RE.test(t) || TAMIL_SCRIPT_RE.test(q);
}

// ── Popular South India locations shown before the user types ─────────────────
const POPULAR_LOCATIONS = [
  { name: 'Chennai Airport',         address: 'Chennai, Tamil Nadu',             icon: 'fa-plane',             lat: 12.9941, lon: 80.1709 },
  { name: 'Madurai Airport',         address: 'Madurai, Tamil Nadu',             icon: 'fa-plane',             lat:  9.8345, lon: 78.0934 },
  { name: 'Coimbatore Airport',      address: 'Coimbatore, Tamil Nadu',          icon: 'fa-plane',             lat: 11.0296, lon: 77.0434 },
  { name: 'Bengaluru Airport',       address: 'Bengaluru, Karnataka',            icon: 'fa-plane',             lat: 13.1979, lon: 77.7063 },
  { name: 'Trichy Airport',          address: 'Trichy, Tamil Nadu',              icon: 'fa-plane',             lat: 10.7654, lon: 78.7093 },
  { name: 'Kodaikanal',              address: 'Dindigul District, Tamil Nadu',   icon: 'fa-mountain',          lat: 10.2381, lon: 77.4892 },
  { name: 'Ooty',                    address: 'Nilgiris, Tamil Nadu',            icon: 'fa-mountain',          lat: 11.4102, lon: 76.6950 },
  { name: 'Munnar',                  address: 'Idukki, Kerala',                  icon: 'fa-mountain',          lat: 10.0889, lon: 77.0595 },
  { name: 'Rameswaram',              address: 'Ramanathapuram, Tamil Nadu',      icon: 'fa-place-of-worship',  lat:  9.2881, lon: 79.3129 },
  { name: 'Kanyakumari',             address: 'Kanyakumari District, Tamil Nadu',icon: 'fa-map-marker-alt',    lat:  8.0883, lon: 77.5385 },
  { name: 'Theni',                   address: 'Theni District, Tamil Nadu',      icon: 'fa-map-pin',           lat: 10.0104, lon: 77.4767 },
  { name: 'Madurai',                 address: 'Tamil Nadu',                      icon: 'fa-city',              lat:  9.9252, lon: 78.1198 },
  { name: 'Chennai',                 address: 'Tamil Nadu',                      icon: 'fa-city',              lat: 13.0827, lon: 80.2707 },
  { name: 'Coimbatore',              address: 'Tamil Nadu',                      icon: 'fa-city',              lat: 11.0168, lon: 76.9558 },
  { name: 'Mysore',                  address: 'Karnataka',                       icon: 'fa-city',              lat: 12.2958, lon: 76.6394 },
];

// ==================== LOCAL VILLAGE DATABASE ====================
// Offline fallback: ~420 Tamil Nadu villages + all major South India cities.
// Loaded once on page start; used when all 5 API tiers return 0 results,
// and for instant results when a village-suffix query matches exactly.

let LOCAL_VILLAGE_DB = null;          // null = not yet loaded, [] = loaded but empty

async function loadVillageDB() {
  if (LOCAL_VILLAGE_DB !== null) return;   // already loaded/attempted
  try {
    const res = await fetch('/data/villages-tamilnadu.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    LOCAL_VILLAGE_DB = Array.isArray(data.villages) ? data.villages : [];
    console.info(`[VillageDB] ✅ Loaded ${LOCAL_VILLAGE_DB.length} villages`);
  } catch (e) {
    console.warn('[VillageDB] ⚠ Could not load local DB:', e.message);
    LOCAL_VILLAGE_DB = [];   // mark as attempted so we don't retry every keystroke
  }
}

/**
 * Levenshtein edit distance — used for fuzzy village name matching.
 * Returns 0 for identical strings; larger values = more different.
 * Capped at strings ≤ 40 chars to keep it fast.
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Single row rolling approach — O(m*n) time, O(n) space
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

/**
 * Search the local village DB.
 * Scoring:
 *   200 — exact name match
 *   170 — alias exact match
 *   150 — name starts with query
 *   120 — query starts with name (user typed a longer form)
 *   100 — name contains query
 *    80 — alias starts with query
 *   60+ — fuzzy match within 25% edit distance (only for query ≥ 5 chars)
 * Returns GeoJSON feature array compatible with renderAutocomplete().
 */
function searchLocalVillageDB(query) {
  if (!LOCAL_VILLAGE_DB || LOCAL_VILLAGE_DB.length === 0) return [];

  const q   = query.trim().toLowerCase();
  const qLen = q.length;
  const results = [];

  for (const v of LOCAL_VILLAGE_DB) {
    const name    = v.n.toLowerCase();
    const aliases = (v.a || []).map(s => s.toLowerCase());
    let score = 0;

    if (name === q)                        score = 200;
    else if (aliases.includes(q))          score = 170;
    else if (name.startsWith(q))           score = 150 + (10 - Math.min(10, name.length - qLen));
    else if (q.startsWith(name))           score = 120;
    else if (name.includes(q))             score = 100;
    else if (aliases.some(a => a.startsWith(q))) score = 80;
    else if (qLen >= 5) {
      const dist    = levenshtein(q, name);
      const maxDist = Math.max(1, Math.floor(qLen * 0.25));  // allow ≤25% edit distance
      if (dist <= maxDist) score = Math.max(10, 70 - dist * 12);
    }

    if (score > 0) results.push({ v, score });
  }

  results.sort((a, b) => b.score - a.score);

  return results.slice(0, 8).map(({ v }) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
    properties: {
      name:           v.n,
      village:        v.n,
      taluk:          v.t,
      county:         v.t,
      state_district: `${v.d} District`,
      state:          'Tamil Nadu',
      country:        'India',
      country_code:   'in',
      formatted:      `${v.n}, ${v.t} Taluk, ${v.d} District, Tamil Nadu`,
      result_type:    'village',
      source:         'local-db',
    },
  }));
}

// ==================== CHENNAI POI DATABASE ====================
// Two-tier Chennai database:
//   Tier A — chennai-pois.json       (504 curated entries, loads at page start)
//   Tier B — chennai-pois-large.json (30k OSM entries,    lazy-loads on first use)
//
// Search order: Large DB (when loaded) → Small curated DB → Geoapify → Nominatim
// Search uses a prefix index so lookups in 30k entries run under 5ms.

const CAT_LABELS = {
  met: 'Metro Station', bus: 'Bus Stand',  hop: 'Hospital',
  hot: 'Hotel',         itp: 'IT Park',    mal: 'Mall',
  com: 'Company',       str: 'Street',     apt: 'Apartment',
  lmk: 'Landmark',     edu: 'College',    tem: 'Temple',
  sta: 'Railway Station', mkt: 'Market',  rst: 'Restaurant',
};
const CAT_ICONS = {
  met: 'fa-subway',      bus: 'fa-bus',        hop: 'fa-hospital',
  hot: 'fa-hotel',       itp: 'fa-laptop',     mal: 'fa-shopping-bag',
  com: 'fa-building',    str: 'fa-road',        apt: 'fa-home',
  lmk: 'fa-map-marker-alt', edu: 'fa-graduation-cap', tem: 'fa-place-of-worship',
  sta: 'fa-train',       mkt: 'fa-store',       rst: 'fa-utensils',
};

// ── Category priority for tie-breaking (higher = shown first) ────────────────
// Priority order: Apartments > Companies > IT Parks > Hospitals > Hotels >
//                 Malls > Metro > Railway > Bus > Education > Landmark >
//                 Temple > Restaurant > Market > Street/Road
const CAT_PRIORITY = {
  apt:90, com:88, itp:85, hop:82, hot:78, mal:75,
  met:72, sta:68, bus:65, edu:62, lmk:60, tem:55,
  rst:50, mkt:48, str:20,
};

// ── Small curated DB (504 entries) — loaded at page start ─────────────────────
let CHENNAI_POI_DB = null;

async function loadChennaiDB() {
  if (CHENNAI_POI_DB !== null) return;
  try {
    const res = await fetch('/data/chennai-pois.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    CHENNAI_POI_DB = Array.isArray(data.pois) ? data.pois : [];
    console.info(`[ChennaiDB] ✅ Curated DB loaded (${CHENNAI_POI_DB.length} POIs)`);
  } catch (e) {
    console.warn('[ChennaiDB] ⚠ Could not load curated DB:', e.message);
    CHENNAI_POI_DB = [];
  }
}

// ── Large OSM DB (30k entries) — lazy-loaded on first Chennai query ───────────
let CHENNAI_LARGE_DB    = null;   // null=not attempted, []=loaded (empty on error)
let CHENNAI_LARGE_LOADING = false;
// Prefix search index: 2-5 char lowercase token → Int32Array of POI indices
// Built once after the large DB loads. Enables O(1) candidate lookup.
let CHENNAI_INDEX = null;

async function loadChennaiLargeDB() {
  if (CHENNAI_LARGE_DB !== null || CHENNAI_LARGE_LOADING) return;
  CHENNAI_LARGE_LOADING = true;
  try {
    const t0  = performance.now();
    const res = await fetch('/data/chennai-pois-large.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Merge curated small DB entries first (they have better names/aliases)
    const small  = CHENNAI_POI_DB || [];
    const byName = new Map(small.map(p => [p.n.toLowerCase(), p]));
    const large  = Array.isArray(data.pois) ? data.pois : [];

    // Deduplicate: keep curated entry when the same name exists in both
    const merged = [...small];
    for (const p of large) {
      if (!byName.has(p.n.toLowerCase())) merged.push(p);
    }

    CHENNAI_LARGE_DB = merged;
    buildChennaiIndex(CHENNAI_LARGE_DB);

    const ms = (performance.now() - t0).toFixed(0);
    console.info(`[ChennaiDB] ✅ Large DB loaded & indexed (${CHENNAI_LARGE_DB.length} POIs, ${ms}ms)`);
  } catch (e) {
    console.warn('[ChennaiDB] ⚠ Could not load large DB — falling back to curated:', e.message);
    CHENNAI_LARGE_DB = CHENNAI_POI_DB || [];
    if (CHENNAI_LARGE_DB.length > 0) buildChennaiIndex(CHENNAI_LARGE_DB);
  } finally {
    CHENNAI_LARGE_LOADING = false;
  }
}

/**
 * Build a prefix search index from a POI array.
 *
 * For each POI at index i we tokenise its name + area into lowercase words,
 * then register every 2-5 char prefix of each word against i.
 * Index structure: Map<string, number[]>  (prefix → array of poi indices)
 *
 * This reduces a 30k linear scan to typically <300 candidates per query.
 */
function buildChennaiIndex(pois) {
  const t0  = performance.now();
  const idx = new Map();

  for (let i = 0; i < pois.length; i++) {
    const p    = pois[i];
    const text = ((p.n || '') + ' ' + (p.area || '')).toLowerCase();
    const toks = text.split(/[\s,.()\-\/]+/).filter(t => t.length >= 2);

    for (const tok of toks) {
      const maxLen = Math.min(tok.length, 6);
      for (let len = 2; len <= maxLen; len++) {
        const key = tok.slice(0, len);
        let arr   = idx.get(key);
        if (!arr) { arr = []; idx.set(key, arr); }
        arr.push(i);
      }
    }
    // Also index aliases
    if (p.a) {
      for (const alias of p.a) {
        const at = alias.toLowerCase().split(/[\s,.()\-\/]+/).filter(t => t.length >= 2);
        for (const tok of at) {
          const key = tok.slice(0, Math.min(tok.length, 5));
          let arr   = idx.get(key);
          if (!arr) { arr = []; idx.set(key, arr); }
          arr.push(i);
        }
      }
    }
  }

  CHENNAI_INDEX = idx;
  const ms = (performance.now() - t0).toFixed(0);
  console.info(`[ChennaiDB] 🔍 Index built: ${idx.size} prefixes in ${ms}ms`);
}

// ── Chennai area keywords ─────────────────────────────────────────────────────
const CHENNAI_CONTEXT_RE = /\b(?:chennai|anna\s*nagar|t\s*nagar|tnagar|omr|velachery|adyar|tambaram|guindy|nungambakkam|mylapore|egmore|perambur|koyambedu|ambattur|sholinganallur|porur|kodambakkam|vadapalani|saidapet|kilpauk|mogappair|kolathur|chromepet|chrompet|pallavaram|thoraipakkam|perungudi|taramani|tidel|siruseri|kelambakkam|medavakkam|pallikaranai|villivakkam|avadi|poonamallee|besant\s*nagar|thiruvanmiyur|alwarpet|royapettah|chetpet|triplicane|chepauk|marina|parrys|broadway|royapuram|tiruvottiyur|madhavaram|arumbakkam|aminjikarai|shenoy\s*nagar|ashok\s*nagar|kk\s*nagar|nanganallur|alandur|maraimalai\s*nagar|ecr|gst|potheri|mahabalipuram|mamallapuram|sriperumbudur|nerkundram|mogappair|navalur|perungalathur|kovilambakkam|palavakkam|neelankarai|injambakkam|akkarai)\b/i;

function isChennaiContext(q) {
  return CHENNAI_CONTEXT_RE.test(q.trim());
}

/**
 * Search Chennai POIs.  Uses the prefix index when available (large DB),
 * falls back to linear scan of the curated small DB.
 *
 * Scoring:
 *   220 — exact name match
 *   190 — alias exact match
 *   170 — name starts with query  (full query = prefix of name)
 *   155 — all query words match name+area tokens
 *   140 — any single query word starts the name
 *   125 — name contains query as substring
 *   110 — alias starts with query
 *    95 — alias contains query
 *    85 — area exactly matches query
 *    75 — area starts with query
 *    65 — area contains query
 *    55 — name+area contains query
 *    40 — fuzzy (≤22% edit distance, query ≥ 4 chars)
 *
 * Category priority bonus (lmk/apt/itp > str) added to break ties.
 * Streets are deprioritised unless the query looks like a road name.
 */
function searchChennaiDB(query) {
  const t0     = performance.now();
  const active = CHENNAI_LARGE_DB || CHENNAI_POI_DB;
  if (!active || active.length === 0) return [];

  const q      = query.trim().toLowerCase();
  const qLen   = q.length;
  const qWords = q.split(/\s+/).filter(Boolean);

  // ── Candidate selection via index (large DB only) ─────────────────────────
  let candidates; // array of POI objects or null (= scan all)

  if (CHENNAI_INDEX && qLen >= 2) {
    const sets   = [];
    const scored = new Set();

    for (const w of qWords) {
      const key  = w.slice(0, Math.min(w.length, 6));
      const idxs = CHENNAI_INDEX.get(key) || [];
      sets.push(new Set(idxs));
      for (const i of idxs) scored.add(i);
    }

    // Prefer indices that appear in ALL word sets (intersection gives better precision)
    let inter;
    if (sets.length > 1) {
      inter = sets[0];
      for (let s = 1; s < sets.length; s++) {
        inter = new Set([...inter].filter(x => sets[s].has(x)));
      }
    }
    const candidateSet = (inter && inter.size > 0) ? inter : scored;

    // If no index hit, scan all (short query / unknown prefix)
    candidates = candidateSet.size > 0
      ? [...candidateSet].map(i => active[i])
      : null;
  }

  // ── Scoring pass ─────────────────────────────────────────────────────────
  const pool    = candidates || active;
  const results = [];
  const isRoadQ = /\b(?:road|street|salai|nagar|marg|path|lane|avenue|way|rd|st)\b/i.test(q);

  // Token-aware word check: every query word must be a prefix of at least one
  // token in the target string (prevents "bus" from matching "business").
  function allWordsMatch(target, words) {
    const toks = target.split(/[\s,.()\-\/]+/).filter(Boolean);
    return words.every(w => toks.some(tok => tok.startsWith(w)));
  }

  for (const p of pool) {
    const name    = p.n.toLowerCase();
    const area    = (p.area || '').toLowerCase();
    const aliases = p.a ? p.a.map(s => s.toLowerCase()) : [];
    const na      = name + ' ' + area;
    let score     = 0;

    if (name === q)                                                       score = 220;
    else if (aliases.includes(q))                                         score = 190;
    else if (name.startsWith(q))                                          score = 170 + Math.max(0, 8 - (name.length - qLen));
    else if (qWords.length > 1 && allWordsMatch(na, qWords))             score = 155;
    else if (qWords.length > 1 && qWords[0] && name.startsWith(qWords[0])) score = 140;
    else if (name.includes(q))                                            score = 125;
    else if (aliases.some(a => a.startsWith(q)))                         score = 110;
    else if (aliases.some(a => a.includes(q)))                           score = 95;
    else if (area === q)                                                  score = 85;
    else if (area.startsWith(q))                                          score = 75;
    else if (area.includes(q))                                            score = 65;
    else if (na.includes(q))                                              score = 55;
    else if (qLen >= 4) {
      const dist    = levenshtein(q, name);
      const maxDist = Math.max(1, Math.floor(qLen * 0.22));
      if (dist <= maxDist) score = Math.max(10, 45 - dist * 10);
    }

    if (score === 0) continue;

    // Category priority tie-breaker
    score += (CAT_PRIORITY[p.cat] || 30);

    // Deprioritise streets unless query looks like a road query
    if (p.cat === 'str' && !isRoadQ) score -= 25;

    results.push({ p, score });
  }

  results.sort((a, b) => b.score - a.score);

  // Deduplicate by name (keep highest-scored entry for each unique name)
  const seenNames = new Set();
  const deduped   = [];
  for (const r of results) {
    const key = r.p.n.toLowerCase();
    if (!seenNames.has(key)) { seenNames.add(key); deduped.push(r); }
    if (deduped.length >= 10) break;
  }

  const ms  = (performance.now() - t0).toFixed(1);
  const src = CHENNAI_LARGE_DB ? 'large-db' : 'curated-db';
  console.log(`[Search] 🏙 Chennai "${q}" → ${deduped.length} results [${src}, ${ms}ms, pool=${pool.length}]`);

  return deduped.map(({ p }) => {
    // Address format: "Street, Area" when street is present, else just "Area"
    const streetArea = p.street
      ? `${p.street}, ${p.area}`
      : p.area || 'Chennai';
    // Full formatted: "Name / Street, Area / Chennai, Tamil Nadu"
    const formatted = p.street
      ? `${p.n} / ${p.street}, ${p.area} / Chennai, Tamil Nadu`
      : `${p.n} / ${p.area} / Chennai, Tamil Nadu`;

    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: {
        name:         p.n,
        // hamlet carries the street — renderAutocomplete shows it before suburb
        hamlet:       p.street || null,
        suburb:       p.area,
        city:         'Chennai',
        state:        'Tamil Nadu',
        country:      'India',
        country_code: 'in',
        // pre-built display address used as fallback and for input fill
        formatted,
        // address_line2 is the sub-line shown in the dropdown
        address_line2: streetArea + ', Chennai, Tamil Nadu',
        result_type:  p.cat === 'str' ? 'street'
                    : p.cat === 'apt' ? 'locality'
                    : 'amenity',
        poi_category: p.cat,
        poi_icon:     CAT_ICONS[p.cat] || 'fa-map-marker-alt',
        poi_label:    CAT_LABELS[p.cat] || 'Place',
        source:       'chennai-db',
      },
    };
  });
}

// ── Search result cache — prevents redundant API calls for repeated queries ───
const AC_CACHE     = new Map();
const AC_CACHE_MAX = 200;

function cacheSet(key, value) {
  if (AC_CACHE.size >= AC_CACHE_MAX) {
    // Evict the oldest (first inserted) entry
    AC_CACHE.delete(AC_CACHE.keys().next().value);
  }
  AC_CACHE.set(key.toLowerCase(), value);
}

function cacheGet(key) {
  return AC_CACHE.get(key.toLowerCase()) ?? null;
}

// ── Galaxy Ride Master Tariff — single source of truth ───────────────────────
// Matches the published pricing table on index.html exactly.
// computeFare() reads ONLY this object — never hardcodes values.
const TARIFF = {
  // ── City / Local rides (≤ 100 km) ─────────────────────────────────────────
  local: {
    //         base  free  normal  peak    maxKm
    bike:   { base: 50,  included: 5, perKm: 9,  peakPerKm: 10, maxKm: 30  },
    auto:   { base: 100, included: 5, perKm: 14, peakPerKm: 16, maxKm: 100 },
    mini:   { base: 110, included: 3, perKm: 18, peakPerKm: 20, maxKm: 100 },
    sedan:  { base: 110, included: 3, perKm: 19, peakPerKm: 24, maxKm: 100 },
    suv:    { base: 150, included: 3, perKm: 22, peakPerKm: 28, maxKm: 100 },
    innova: { base: 250, included: 3, perKm: 24, peakPerKm: 30, maxKm: 100 },
  },

  // ── Outstation rides (> 100 km) ────────────────────────────────────────────
  outstation: {
    //         perKm  driverBata  minKmPerDay
    mini:   { perKm: 13, driverBata: 400, minKmPerDay: 250 },
    sedan:  { perKm: 13, driverBata: 400, minKmPerDay: 250 },
    suv:    { perKm: 18, driverBata: 400, minKmPerDay: 250 },
    innova: { perKm: 22, driverBata: 400, minKmPerDay: 250 },
    hillsCharge: 500,
  },

  // ── Hourly packages — index 0 = 1 hr, index 9 = 10 hr ────────────────────
  hourly: {
    mini:   [ 300,  560,  820, 1100, 1400, 1680, 1950, 2200, 2500, 2800],
    sedan:  [ 400,  800, 1200, 1613, 2000, 2400, 2700, 3000, 3523, 3950],
    suv:    [1050, 1550, 2000, 2500, 2821, 3450, 3900, 4313, 4853, 5500],
    innova: [2000, 2600, 3200, 3800, 4300, 4900, 5400, 6000, 6500, 7500],
  },
  // Included km per hourly package (index matches hours above)
  hourlyKmLimit: [15, 25, 40, 50, 60, 75, 85, 100, 110, 120],

  // ── Full-day (12 hr / 180 km) packages ────────────────────────────────────
  fullday: {
    sedan:  { fare: 4500, kmLimit: 180, extraPerKm: 19 },
    suv:    { fare: 6000, kmLimit: 180, extraPerKm: 22 },
    innova: { fare: 8000, kmLimit: 180, extraPerKm: 24 },
  },

  // ── Waiting charge ─────────────────────────────────────────────────────────
  waiting: { perMin: 2 },          // ₹2 per minute after first 5 min free

  // ── Peak hour windows (24-h clock) ────────────────────────────────────────
  peakHours: [
    { start: 4,  end: 6  },        // 4 AM – 6 AM
    { start: 17, end: 20 },        // 5 PM – 8 PM
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
  // Preload local DBs in background so they're ready for the first keystroke
  loadVillageDB();            // Tamil Nadu villages (~276 entries, ~50KB)
  loadChennaiDB();            // Chennai curated POIs (~504 entries, ~60KB)
  // Large Chennai DB (~30k entries, ~2.5MB) starts loading after a short delay
  // to avoid competing with critical page resources on first load.
  setTimeout(loadChennaiLargeDB, 3000);
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

  // Snapshot all params immediately (synchronous — URL won't change)
  const type       = p.get('type');
  const pickup     = p.get('pickup');
  const drop       = p.get('drop');
  const date       = p.get('date');
  const vehicle    = p.get('vehicle');
  const passengers = parseInt(p.get('passengers'), 10);

  // Defer ALL DOM writes to run after the full init stack (setMinDate,
  // setupAutocomplete, etc.) has settled.  Without this delay the browser's
  // own autocomplete / form-reset timing can overwrite values we set here.
  setTimeout(() => {
    // 1. Switch trip type tab first (so returnDateRow visibility is correct)
    if (type && ['oneway', 'roundtrip', 'hourly'].includes(type)) {
      const btn = document.querySelector(`.tab-btn[data-tab="${type}"]`);
      if (btn) switchTab(type, btn);
    }

    // 2. Fill text inputs (direct assignment — does NOT fire `input` event,
    //    so Geoapify autocomplete listener is never triggered)
    const pickupEl = $('pickup');
    const dropEl   = $('drop');
    const dateEl   = $('date');
    if (pickup && pickupEl) pickupEl.value = pickup;
    if (drop   && dropEl)   dropEl.value   = drop;
    if (date   && dateEl)   dateEl.value   = date;

    // 3. Select vehicle radio
    if (vehicle) {
      const radio = document.querySelector(`input[name="vehicle"][value="${vehicle}"]`);
      if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
    }

    // 4. Set passenger count (changePassengers accepts a delta)
    if (passengers >= 1) {
      const delta = passengers - (state.passengers || 1);
      if (delta !== 0) changePassengers(delta);
    }

    // 5. Scroll to booking card and flash it
    $('home')?.scrollIntoView({ behavior: 'smooth' });
    const card = $('bookingCard');
    if (card) {
      card.classList.add('prefill-flash');
      setTimeout(() => card.classList.remove('prefill-flash'), 1800);
    }
  }, 120);
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
      state.pickupCoords        = null;
      state.distance            = null;
      state.duration            = null;
      state.durationEstimated   = false;
      state.pickupFullAddress   = null;
      pickupInput.dataset.fullAddress = '';
      pickupInput.title               = '';
      acDebounce('pickup', pickupInput.value, 'pickupDropdown', acPickupSelect);
    });
  }

  if (dropInput) {
    dropInput.addEventListener('input', () => {
      state.dropCoords          = null;
      state.distance            = null;
      state.duration            = null;
      state.durationEstimated   = false;
      acDebounce('drop', dropInput.value, 'dropDropdown', acDropSelect);
    });
  }

  // Show popular destinations on focus when the field is empty
  [
    { input: pickupInput, dropdownId: 'pickupDropdown', onSelect: acPickupSelect },
    { input: dropInput,   dropdownId: 'dropDropdown',   onSelect: acDropSelect   },
  ].forEach(({ input, dropdownId, onSelect }) => {
    if (!input) return;
    input.addEventListener('focus', () => {
      // Pre-warm large Chennai DB as soon as user taps a location field
      if (CHENNAI_LARGE_DB === null) loadChennaiLargeDB();
      if (!input.value.trim()) {
        showPopularSuggestions(dropdownId, input, onSelect);
      }
    });
  });

  // Keyboard navigation for both dropdowns
  [
    { input: pickupInput, dropdownId: 'pickupDropdown' },
    { input: dropInput,   dropdownId: 'dropDropdown'   },
  ].forEach(({ input, dropdownId }) => {
    if (!input) return;
    input.addEventListener('keydown', (e) => handleAcKeydown(e, dropdownId));
  });
}

// ── Show pre-typed popular South India destinations ───────────────────────────
function showPopularSuggestions(dropdownId, inputEl, onSelect) {
  const dropdown = $(dropdownId);
  if (!dropdown) return;
  const group = inputEl?.closest('.autocomplete-group');

  dropdown.innerHTML = `
    <div class="ac-popular-header">
      <i class="fas fa-fire"></i> Popular Destinations
    </div>
    ${POPULAR_LOCATIONS.map((loc, i) => `
      <div class="autocomplete-item ac-popular-item" tabindex="0" role="option" data-idx="${i}"
           aria-label="${escapeHtml(loc.name + ', ' + loc.address)}">
        <i class="fas ${loc.icon}"></i>
        <div>
          <div class="place-name">${escapeHtml(loc.name)}</div>
          <div class="place-address">${escapeHtml(loc.address)}</div>
        </div>
      </div>`).join('')}`;
  dropdown.classList.remove('hidden');
  if (group) group.classList.add('is-open');

  dropdown.querySelectorAll('.ac-popular-item').forEach((item, i) => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const loc = POPULAR_LOCATIONS[i];
      onSelect({
        coords: { lat: loc.lat, lon: loc.lon },
        label:  `${loc.name}, ${loc.address}`,
      });
    });
  });
}

// --- Separate debounce per field (pickup vs drop never cancel each other) ---
function acDebounce(field, query, dropdownId, onSelect) {
  const timerKey = field === 'pickup' ? 'pickupTimeout' : 'dropTimeout';
  clearTimeout(state[timerKey]);

  const inputEl = $(field === 'pickup' ? 'pickup' : 'drop');
  const group   = inputEl?.closest('.autocomplete-group');

  // Require at least 2 characters before firing an API call
  if (!query || query.trim().length < 2) {
    // If completely cleared, restore popular suggestions; otherwise just close
    if (!query || !query.trim()) {
      showPopularSuggestions(dropdownId, inputEl, onSelect);
    } else {
      closeDropdown(dropdownId, inputEl);
    }
    return;
  }

  // Show loading indicator immediately so the user gets feedback
  showAcLoading(dropdownId);
  if (group) group.classList.add('is-open');

  state[timerKey] = setTimeout(
    () => fetchAutocomplete(query.trim(), dropdownId, onSelect, field),
    250                      // 250 ms debounce — fast enough for South India villages
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

    // India-specific POI boosts — ensures airports, stations, temples rank above generic areas
    const nameAndAddr = (p.name || '') + ' ' + (p.formatted || '');
    if (/airport|aerodrome/i.test(nameAndAddr))                             score += 35;
    if (/railway station|train station|junction|central station|rail terminus/i.test(nameAndAddr)) score += 28;
    if (/bus stand|bus station|bus depot|ksrtc|setc|tnstc/i.test(nameAndAddr)) score += 22;
    if (/temple|kovil|mandir|amman|swamy|devasthanam/i.test(nameAndAddr))   score += 12;
    if (/masjid|mosque|dargah|church|cathedral/i.test(nameAndAddr))         score += 10;
    if (/hospital|medical college|nursing home/i.test(nameAndAddr))         score +=  8;
    if (/resort|hotel|lodge|guest house/i.test(nameAndAddr))                score +=  8;
    if (/college|university|institute|school/i.test(nameAndAddr))           score +=  6;

    // ── State-level priority: Tamil Nadu first, then other South India states ──
    // This ensures "Theni" always ranks above anything else when typing "the",
    // "Madurai" above "Madrid" for "mad", etc.
    const state = (p.state || '').toLowerCase();
    if (state.includes('tamil nadu'))     score += 200;
    else if (state.includes('karnataka') ||
             state.includes('kerala')    ||
             state.includes('andhra')    ||
             state.includes('telangana') ||
             state.includes('puducherry') ||
             state.includes('pondicherry')) score += 80;

    // ── Explicit boost for key Tamil Nadu cities / towns / villages ─────────────
    // Applied when the result name exactly matches (or starts with) a known city.
    // Ensures these always surface at the top of their respective prefix searches.
    const TN_CITY_BOOSTS = {
      'chennai': 120, 'madurai': 120, 'coimbatore': 100, 'trichy': 100,
      'tiruchirappalli': 100, 'salem': 100, 'tirunelveli': 100, 'tuticorin': 90,
      'thoothukudi': 90, 'erode': 90, 'vellore': 90, 'karur': 90,
      'namakkal': 90, 'theni': 90, 'dindigul': 90, 'kodaikanal': 120,
      'ooty': 120, 'udhagamandalam': 100, 'periyakulam': 90,
      'devadanapatti': 90, 'batlagundu': 90, 'bodinayakanur': 90,
      'chinnamanur': 90, 'cumbum': 90, 'andipatti': 90, 'usilampatti': 90,
      'tiruppur': 90, 'tirupur': 90, 'krishnagiri': 80, 'dharmapuri': 80,
      'cuddalore': 80, 'nagapattinam': 80, 'thanjavur': 90, 'tanjore': 80,
      'kumbakonam': 80, 'pudukkottai': 80, 'sivaganga': 80,
      'ramanathapuram': 80, 'rameswaram': 100, 'kanyakumari': 100,
      'nagercoil': 90, 'tirunelveli junction': 90, 'madurai airport': 100,
      'chennai airport': 100, 'coimbatore airport': 100, 'trichy airport': 100,
    };
    const resultName = (p.name || '').toLowerCase();
    if (TN_CITY_BOOSTS[resultName] !== undefined) {
      score += TN_CITY_BOOSTS[resultName];
    } else {
      // Partial match — check if a known city name starts with the result name
      for (const [city, boost] of Object.entries(TN_CITY_BOOSTS)) {
        if (city.startsWith(resultName) && resultName.length >= 3) {
          score += Math.round(boost * 0.7);
          break;
        }
      }
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
 *  Tier 3 — Nominatim/OSM bare query                               (villages, hamlets, panchayats)
 *  Tier 4 — Nominatim/OSM + Tamil Nadu context                    (ambiguous TN village names)
 *  Tier 5 — Nominatim/OSM + South India context                   (last-resort wider fallback)
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

  if (!query || query.trim().length < 2) {
    closeDropdown(dropdownId, null);
    return;
  }

  const q         = query.trim();

  // ── Cache hit — serve instantly, skip all API tiers ─────────────────────────
  if (searchTier === 1) {
    const cached = cacheGet(q);
    if (cached) {
      console.log(`[Search] 📦 Cache hit for "${q}" (${cached.length} results)`);
      const inputEl = $(field === 'pickup' ? 'pickup' : 'drop');
      const group   = inputEl?.closest('.autocomplete-group');
      if (group) group.classList.add('is-open');
      renderAutocomplete(cached, dropdownId, onSelect, q);
      return;
    }
  }

  // ── Chennai POI shortcut ─────────────────────────────────────────────────────
  // Pre-Tier 1: search local Chennai DB (up to 30k entries) before any API call.
  // Large DB lazy-loads in background; curated small DB serves immediate results.
  if (searchTier === 1 && isChennaiContext(q)) {
    // Ensure curated DB is loaded (fast, ~40KB)
    if (CHENNAI_POI_DB === null) await loadChennaiDB();
    // Trigger large DB load in background if not yet started
    if (CHENNAI_LARGE_DB === null) loadChennaiLargeDB();

    const chennaiHits = searchChennaiDB(q);
    if (chennaiHits.length > 0) {
      cacheSet(q, chennaiHits);
      const inputEl = $(field === 'pickup' ? 'pickup' : 'drop');
      const group   = inputEl?.closest('.autocomplete-group');
      if (group) group.classList.add('is-open');
      renderAutocomplete(chennaiHits, dropdownId, onSelect, q);
      return;
    }
    // No local match → fall through to Geoapify (with Chennai proximity bias)
    console.log(`[Search] Chennai context "${q}" not in local DB → Geoapify Tier 1`);
  }

  // ── Village shortcut — local DB first (instant), then Nominatim ─────────────
  // Geoapify has limited coverage for small Tamil Nadu villages.
  // For village-suffix / Tamil-script queries:
  //   1. Try local DB immediately (<2ms, no network)
  //   2. If not in local DB → jump to Nominatim (Tier 3), skip Geoapify
  if (searchTier === 1 && isVillagePattern(q)) {
    // Ensure DB is loaded (no-op if already loading/loaded)
    if (LOCAL_VILLAGE_DB === null) loadVillageDB();

    const localHits = LOCAL_VILLAGE_DB ? searchLocalVillageDB(q) : [];
    if (localHits.length > 0) {
      console.log(`[Search] 📍 Local DB instant hit: "${q}" → ${localHits.length} result(s)`);
      cacheSet(q, localHits);
      const inputEl = $(field === 'pickup' ? 'pickup' : 'drop');
      const group   = inputEl?.closest('.autocomplete-group');
      if (group) group.classList.add('is-open');
      renderAutocomplete(localHits, dropdownId, onSelect, q);
      return;
    }
    console.log(`[Search] Village pattern "${q}" not in local DB → Nominatim Tier 3`);
    return fetchAutocomplete(q, dropdownId, onSelect, field, 3);
  }

  const sq        = encodeURIComponent(q);
  const retryArgs = { query: q, field, onSelect };

  // ── Build URL for each tier ───────────────────────────────────────────────
  let url, tierLabel, isNominatim = false;

  // ── Tier structure ────────────────────────────────────────────────────────────
  // Tier 1: Geoapify autocomplete  — fast, good for cities/airports/popular places
  // Tier 2: Geoapify search        — broader, handles roads/buildings Geoapify knows
  // Tier 3: Nominatim bare         — OSM village-level data, exact name match
  // Tier 4: Nominatim + "Tamil Nadu" context — anchors ambiguous names to TN
  // Tier 5: Nominatim + "South India" context — last-resort wider search
  //
  // Geoapify filter/bias uses COLON notation (bracket notation is silently ignored):
  //   ✅ filter=countrycode:in   ✅ bias=proximity:lon,lat
  //   ❌ filter[countrycode]=in  ❌ bias[proximity]=lon,lat

  // Chennai-specific proximity bias (lat/lon of Chennai city center)
  const CHENNAI_BIAS = '80.2707,13.0827';
  const activeBias   = isChennaiContext(q) ? CHENNAI_BIAS : TN_BIAS;

  if (searchTier === 1) {
    tierLabel = 'Geoapify-autocomplete[IN+TN-bias]';
    url = `${GEO_AUTOCOMPLETE}?text=${sq}&lang=en&limit=10` +
          `&filter=countrycode:in&bias=proximity:${activeBias}` +
          `&apiKey=${GEOAPIFY_API_KEY}`;

  } else if (searchTier === 2) {
    tierLabel = 'Geoapify-search[IN+TN-bias]';
    url = `${GEO_SEARCH}?text=${sq}&lang=en&limit=10` +
          `&filter=countrycode:in&bias=proximity:${activeBias}` +
          `&apiKey=${GEOAPIFY_API_KEY}`;

  } else if (searchTier === 3) {
    // Nominatim/OSM — best coverage for TN villages, hamlets, panchayats, streets
    tierLabel = 'Nominatim-OSM[IN-bare]';
    isNominatim = true;
    url = `${NOMINATIM_SEARCH}?q=${sq}&format=json&limit=20` +
          `&countrycodes=in&addressdetails=1&namedetails=1&accept-language=en`;

  } else if (searchTier === 4) {
    // Nominatim with Tamil Nadu state context — improves recall for ambiguous village names
    tierLabel = 'Nominatim-OSM[TN-context]';
    isNominatim = true;
    const sqTN = encodeURIComponent(q + ' Tamil Nadu');
    url = `${NOMINATIM_SEARCH}?q=${sqTN}&format=json&limit=15` +
          `&countrycodes=in&addressdetails=1&namedetails=1&accept-language=en`;

  } else {
    // Tier 5: Nominatim with South India context — catches AP/Karnataka/Kerala villages
    tierLabel = 'Nominatim-OSM[SouthIndia-context]';
    isNominatim = true;
    const sqSI = encodeURIComponent(q + ' South India');
    url = `${NOMINATIM_SEARCH}?q=${sqSI}&format=json&limit=10` +
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
    if (searchTier < 5) {
      console.warn(`[Search] escalating tier ${searchTier} → ${searchTier + 1} (HTTP error)`);
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
          state:          item.address?.state,
          // In TN/South India: county = Taluk/Block, state_district = District
          taluk:          item.address?.county || '',
          state_district: item.address?.state_district || item.address?.county || '',
          country:        item.address?.country_code === 'in' ? 'India' : (item.address?.country || ''),
          country_code:   (item.address?.country_code || '').toLowerCase(),
          formatted:      item.display_name,
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

  // ── Hard India-only post-filter (defensive — catches any API filter failure) ─
  // Removes results whose country_code or country property explicitly points
  // outside India. Results with no country data are kept (trust the API filter).
  const beforeFilter = features.length;
  features = features.filter(f => {
    const p    = f.properties;
    const code = (p.country_code || p.countrycode || '').toLowerCase();
    const name = (p.country || '').toLowerCase();
    // If we have explicit country data that is NOT India → reject
    if (code && code !== 'in') return false;
    if (name && name !== 'india') return false;
    return true;
  });
  if (features.length < beforeFilter) {
    console.log(`[Search] 🚫 India filter removed ${beforeFilter - features.length} non-India result(s)`);
  }

  console.log(`[Search] Tier ${searchTier} (${tierLabel}) → ${features.length} raw results for "${q}"`);

  // ── Rank + dedup ─────────────────────────────────────────────────────────
  const ranked = rankAndDedup(features, q);
  console.log(`[Search] Tier ${searchTier} → ${ranked.length} ranked results`);

  // ── Escalate on 0 results (5-tier pipeline + local DB fallback) ─────────────
  if (ranked.length === 0) {
    if (searchTier < 5) {
      console.log(`[Location] 0 results at tier ${searchTier} — escalating to tier ${searchTier + 1}...`);
      return fetchAutocomplete(q, dropdownId, onSelect, field, searchTier + 1);
    }
    // All 5 API tiers exhausted — try local village DB with fuzzy matching
    if (LOCAL_VILLAGE_DB && LOCAL_VILLAGE_DB.length > 0) {
      const localFuzzy = searchLocalVillageDB(q);
      if (localFuzzy.length > 0) {
        console.log(`[Search] 📍 Local DB fuzzy fallback: "${q}" → ${localFuzzy.length} result(s)`);
        cacheSet(q, localFuzzy);
        renderAutocomplete(localFuzzy, dropdownId, onSelect, q);
        return;
      }
    }
    // Truly not found anywhere
    console.warn('[Search] ❌ No results found after all 5 tiers + local DB:', {
      query:      q,
      timestamp:  new Date().toISOString(),
      suggestion: 'Village may not be mapped in OpenStreetMap. Try taluk or district name.',
    });
    renderAutocomplete([], dropdownId, onSelect, q);
    return;
  }

  // Store results in cache before rendering (only when we have actual results)
  cacheSet(q, ranked);
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
        <div style="font-size:12px; opacity:0.75;">
          Village may not be in OpenStreetMap yet.<br>
          Try: full name + taluk (e.g. "Pullakapatti Periyakulam")<br>
          or search by nearby town / district.
        </div>
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

    // Address sub-line: Village → Taluk → District → State
    // De-duplicate: skip any part that equals name or a previously included part.
    const seen = new Set([name.toLowerCase()]);
    function addPart(val) {
      if (!val) return null;
      const v = val.trim();
      if (!v || seen.has(v.toLowerCase())) return null;
      seen.add(v.toLowerCase());
      return v;
    }

    // Build address hierarchy from most-specific to most-general
    const addrParts = [
      addPart(p.building),
      addPart(p.hamlet),
      addPart(p.village),
      addPart(p.suburb),
      addPart(p.quarter),
      addPart(p.town  && p.town  !== p.city ? p.town  : null),
      addPart(p.city),
      // Taluk / Block (county field in Nominatim for TN)
      addPart(p.taluk),
      // District — prefer state_district over county (may already be taluk)
      addPart(p.state_district !== p.taluk ? p.state_district : null),
      addPart(p.state),
    ];
    let address = addrParts.filter(Boolean).join(', ')
                || p.address_line2
                || p.formatted
                || '';
    // Chennai DB: show "Street / Area / Chennai, Tamil Nadu" address format
    // poi_label (category) is shown via the icon; address line shows location path.
    if (p.source === 'chennai-db') {
      // Build clean address: use hamlet (street) + suburb (area) + city/state
      const streetPart = p.hamlet ? `${p.hamlet}, ` : '';
      const areaPart   = p.suburb || '';
      address = areaPart
        ? `${streetPart}${areaPart}, Chennai, Tamil Nadu`
        : 'Chennai, Tamil Nadu';
    }

    // Icon — Chennai DB has pre-computed category icons; fall through for others
    const nameAddr = (name + ' ' + address).toLowerCase();
    const icon = p.poi_icon                                                       ? p.poi_icon
               : /airport|aerodrome/.test(nameAddr)                              ? 'fa-plane'
               : /railway station|train station|junction|rail terminus/.test(nameAddr) ? 'fa-train'
               : /bus stand|bus station|bus depot|ksrtc|setc|tnstc/.test(nameAddr) ? 'fa-bus'
               : /temple|kovil|mandir|amman|swamy|devasthanam/.test(nameAddr)    ? 'fa-place-of-worship'
               : /masjid|mosque|dargah/.test(nameAddr)                           ? 'fa-mosque'
               : /church|cathedral/.test(nameAddr)                               ? 'fa-church'
               : /hospital|medical|clinic/.test(nameAddr)                        ? 'fa-hospital'
               : /resort|hotel|lodge/.test(nameAddr)                             ? 'fa-hotel'
               : p.result_type === 'amenity'                                     ? 'fa-building'
               : p.result_type === 'street'                                      ? 'fa-road'
               : p.result_type === 'city'                                        ? 'fa-city'
               : (p.result_type === 'locality' ||
                  p.result_type === 'village'  ||
                  p.result_type === 'hamlet')                                    ? 'fa-map-pin'
               : p.result_type === 'postcode'                                    ? 'fa-envelope'
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

      // Label to fill into the input
      // Chennai DB: fill with just the POI name (clean, no slash format)
      // Other sources: use formatted address or reconstruct
      const label = p.source === 'chennai-db'
        ? (p.name || '')
        : (p.name && p.city
            ? `${p.name}, ${p.city}`
            : p.formatted
              || [p.name || p.village || p.hamlet, p.city || p.town, p.state].filter(Boolean).join(', ')
              || p.name || '');

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

  // Show a loading state in the route info row while API call is in flight
  const routeRow = $('routeInfoRow');
  const routeEl  = $('routeInfoDisplay');
  if (routeRow) routeRow.classList.remove('hidden');
  if (routeEl)  routeEl.textContent = 'Calculating route…';

  try {
    const { lat: fromLat, lon: fromLon } = state.pickupCoords;
    const { lat: toLat,   lon: toLon   } = state.dropCoords;

    // Geoapify Routing API — waypoints in lat,lon order
    const url = `https://api.geoapify.com/v1/routing` +
      `?waypoints=${fromLat},${fromLon}|${toLat},${toLon}` +
      `&mode=drive&apiKey=${GEOAPIFY_API_KEY}`;

    const res = await fetch(url);

    // Non-2xx responses resolve without throwing — must check explicitly
    if (!res.ok) {
      throw new Error(`Routing API HTTP ${res.status}`);
    }

    const data    = await res.json();
    const props   = data.features?.[0]?.properties;
    const meters  = props?.distance;
    const seconds = props?.time;

    // Treat zero or missing distance as a failure — fall through to haversine
    if (!meters || meters <= 0) {
      throw new Error('Routing API returned zero or missing distance');
    }

    state.distance          = Math.ceil(meters / 1000);
    state.duration          = seconds ? Math.round(seconds / 60) : null; // store as minutes
    state.durationEstimated = false;
    console.log(`[Route] API ✓  ${state.distance} km  ${state.duration ? formatDuration(state.duration) : ''}`);

  } catch (e) {
    // Straight-line haversine × 1.25 road-correction factor (always works, no API needed)
    console.warn('[Route] API failed — haversine fallback:', e.message);
    const crow = haversineKm(state.pickupCoords, state.dropCoords);
    state.distance = Math.round(crow * 1.25);
    // Estimate drive time at ~55 km/h average inter-city speed
    state.duration = Math.round((state.distance / 55) * 60);
    state.durationEstimated = true;
    console.log(`[Route] Fallback  straight=${crow} km  road≈${state.distance} km`);
  }

  calculateFare();
}

function haversineKm(a, b) {
  const R    = 6371;
  const dLat = deg2rad(b.lat - a.lat);
  const dLon = deg2rad(b.lon - a.lon);
  const h    = Math.sin(dLat/2)**2 + Math.cos(deg2rad(a.lat))*Math.cos(deg2rad(b.lat))*Math.sin(dLon/2)**2;
  return Math.ceil(2 * R * Math.asin(Math.sqrt(h)));
}

function deg2rad(d) { return d * (Math.PI / 180); }

/** Format minutes into a human-readable duration string, e.g. "~5h 30m" */
function formatDuration(mins) {
  if (!mins || mins <= 0) return '';
  if (mins < 60) return `~${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}

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
 * Peak surcharge is calculated as the DIFFERENCE between peak and normal rate
 * so the cityFare line always shows the standard per-km fare and the
 * peakSurcharge line shows only the extra amount — never double-counted.
 *
 * @param {string}  vehicle      'mini'|'sedan'|'suv'|'innova'|'auto'|'bike'
 * @param {number}  km           trip distance in kilometres
 * @param {string}  tab          'oneway'|'roundtrip'|'hourly'|'fullday'
 * @param {boolean} applyPeak    true if departure is during a peak window
 * @param {number}  hourlyHrs    1–10 (only used when tab==='hourly')
 * @param {number}  waitingMins  extra waiting minutes beyond 5-min grace
 * @returns {object|null}        full fare breakdown, or null for unsupported config
 */
function computeFare(vehicle, km, tab, applyPeak, hourlyHrs, waitingMins = 0) {
  let baseFare      = 0;
  let cityFare      = 0;
  let outstationFare = 0;
  let driverBata    = 0;
  let peakSurcharge = 0;
  let waitingCharge = 0;
  let extraKmCharge = 0;   // for fullday over-limit km

  const isOutstation = km > 100 && tab !== 'hourly' && tab !== 'fullday';

  // ── Full-day package ──────────────────────────────────────────────────────
  if (tab === 'fullday') {
    const fd = TARIFF.fullday[vehicle];
    if (!fd) return null;
    baseFare      = fd.fare;
    extraKmCharge = km > fd.kmLimit ? Math.round((km - fd.kmLimit) * fd.extraPerKm) : 0;
    const subtotal = baseFare + extraKmCharge;
    return { baseFare, cityFare:0, outstationFare:0, driverBata:0,
             peakSurcharge:0, waitingCharge:0, extraKmCharge, subtotal,
             isOutstation:false, isFullday:true };
  }

  // ── Hourly package ────────────────────────────────────────────────────────
  if (tab === 'hourly') {
    if (hourlyHrs < 1) return null;
    const table   = TARIFF.hourly[vehicle] || TARIFF.hourly.sedan;
    baseFare      = table[hourlyHrs - 1] || 0;
    // Extra km beyond package limit (rare but possible)
    const kmLimit = TARIFF.hourlyKmLimit[hourlyHrs - 1] || 0;
    extraKmCharge = km > kmLimit ? Math.round((km - kmLimit) * (TARIFF.local[vehicle]?.perKm || 19)) : 0;
    const subtotal = baseFare + extraKmCharge;
    return { baseFare, cityFare:0, outstationFare:0, driverBata:0,
             peakSurcharge:0, waitingCharge:0, extraKmCharge, subtotal,
             isOutstation:false, isHourly:true };
  }

  // ── One-way / Round-trip ──────────────────────────────────────────────────
  const t = TARIFF.local[vehicle];
  if (!t) return null;
  baseFare = t.base;

  if (isOutstation) {
    // 3-tier: base covers first `included` km, city rate up to 100 km, outstation rate beyond
    const cityKm       = Math.max(0, 100 - t.included);
    const outstationKm = Math.max(0, km - 100);
    const ot           = TARIFF.outstation[vehicle];
    cityFare       = Math.round(cityKm * t.perKm);
    outstationFare = ot ? Math.round(outstationKm * ot.perKm) : Math.round(outstationKm * t.perKm);
    driverBata     = ot ? ot.driverBata : 400;
  } else {
    const extraKm = Math.max(0, km - t.included);
    // cityFare is always at the NORMAL per-km rate
    cityFare      = Math.round(extraKm * t.perKm);
    // peakSurcharge = extra per km during peak (difference, never duplicated)
    if (applyPeak && t.peakPerKm > t.perKm) {
      peakSurcharge = Math.round(extraKm * (t.peakPerKm - t.perKm));
    }
  }

  // Waiting charge (₹2/min after 5-min free grace — caller passes only billable mins)
  waitingCharge = Math.round(Math.max(0, waitingMins) * TARIFF.waiting.perMin);

  // Round trip doubles all distance fares (bata and waiting are not doubled)
  if (tab === 'roundtrip') {
    cityFare       *= 2;
    outstationFare *= 2;
    peakSurcharge  *= 2;
  }

  const subtotal = baseFare + cityFare + outstationFare + driverBata + peakSurcharge + waitingCharge;
  return { baseFare, cityFare, outstationFare, driverBata, peakSurcharge,
           waitingCharge, extraKmCharge:0, subtotal, isOutstation };
}

function calculateFare() {
  const vehicle = document.querySelector('input[name="vehicle"]:checked')?.value;
  state.selectedVehicle = vehicle;

  if (!vehicle) { hide('farePreview'); return; }

  const dateVal  = $('date')?.value;
  const timeVal  = $('time')?.value;
  const isPeak   = dateVal && timeVal && isPeakHour(dateVal, timeVal);

  // Treat NaN / null / undefined as 0 so we never pass garbage to computeFare
  const rawKm     = state.distance;
  const km        = (typeof rawKm === 'number' && isFinite(rawKm) && rawKm > 0) ? rawKm : 0;
  const tab       = state.currentTab;
  const hourlyHrs = tab === 'hourly' ? (parseInt($('hourlyPackage')?.value) || 0) : 0;
  // Peak surcharge applies only to city one-way/roundtrip rides ≤ 100 km
  const applyPeak = isPeak && tab !== 'hourly' && tab !== 'fullday' && km <= 100;

  const fare = computeFare(vehicle, km, tab, applyPeak, hourlyHrs);
  if (!fare) return;

  const {
    baseFare, cityFare, outstationFare, driverBata,
    peakSurcharge, waitingCharge, extraKmCharge,
    subtotal, isOutstation, isHourly, isFullday,
  } = fare;

  const discount = calculateCouponDiscount(state.appliedCoupon, subtotal);
  const total    = Math.max(0, subtotal - discount);

  state.fare           = total;
  state.couponDiscount = discount;

  // ── Route info row (Distance + Duration) ─────────────────────────────────
  const routeInfoRow = $('routeInfoRow');
  const routeInfoEl  = $('routeInfoDisplay');
  if (routeInfoRow && routeInfoEl) {
    if (km > 0) {
      const dur     = state.duration ? ` · ${formatDuration(state.duration)}` : '';
      const estMark = state.durationEstimated ? ' (est.)' : '';
      routeInfoEl.textContent = `${km} km${dur}${estMark}`;
      routeInfoRow.classList.remove('hidden');
    } else {
      routeInfoRow.classList.add('hidden');
    }
  }

  // ── Fare breakdown UI ─────────────────────────────────────────────────────
  $('baseFareDisplay').textContent     = `₹${baseFare}`;

  // Distance fare row: hide for hourly/fullday (those show a package rate)
  const showDistRow = !isHourly && !isFullday;
  // For outstation: show the city-rate portion (included km → 100 km)
  // For local: show the actual trip km beyond the free included distance
  const cityBillKm  = isOutstation
    ? (100 - (TARIFF.local[vehicle]?.included || 3))
    : Math.max(0, km - (TARIFF.local[vehicle]?.included || 3));
  $('distanceDisplay').textContent     = cityBillKm;
  $('distanceFareDisplay').textContent = `₹${cityFare}`;
  $('distanceFareRow')?.classList.toggle('hidden', !showDistRow || cityFare === 0);

  // Extra km row (hourly over-limit / fullday over-limit)
  const extraKmRow = $('extraKmRow');
  if (extraKmRow) {
    extraKmRow.classList.toggle('hidden', extraKmCharge === 0);
    const extraKmEl = $('extraKmDisplay');
    if (extraKmEl) extraKmEl.textContent = `₹${extraKmCharge}`;
  }

  // Outstation rows
  $('outstationFareRow').classList.toggle('hidden', !isOutstation);
  $('outstationKmDisplay').textContent   = Math.max(0, km - 100);
  $('outstationFareDisplay').textContent = `₹${outstationFare}`;

  $('driverBataRow').classList.toggle('hidden', !isOutstation);
  $('driverBataDisplay').textContent     = `₹${driverBata}`;

  // Peak surcharge row (shows extra amount only — not the full peak rate)
  $('peakRow').classList.toggle('hidden', peakSurcharge === 0);
  $('peakFareDisplay').textContent       = `₹${peakSurcharge}`;

  // Waiting charge row
  const waitRow = $('waitingRow');
  if (waitRow) {
    waitRow.classList.toggle('hidden', waitingCharge === 0);
    const waitEl = $('waitingDisplay');
    if (waitEl) waitEl.textContent = `₹${waitingCharge}`;
  }

  $('totalFareDisplay').textContent      = `₹${total}`;

  $('couponRow').classList.toggle('hidden', discount === 0);
  $('couponDiscountDisplay').textContent = `-₹${discount}`;

  // ── Per-vehicle price tags (use same engine so they match exactly) ─────────
  ['mini','sedan','suv','innova'].forEach(v => {
    const el = $(`${v}Price`);
    if (!el) return;
    const f = km > 0 || isHourly || isFullday
      ? computeFare(v, km, tab, applyPeak, hourlyHrs)
      : null;
    el.textContent = f
      ? `₹${f.subtotal}`
      : (isFullday
          ? (TARIFF.fullday[v] ? `₹${TARIFF.fullday[v].fare}` : '—')
          : `₹${TARIFF.local[v]?.base || '—'}`);
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
