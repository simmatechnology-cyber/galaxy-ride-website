#!/usr/bin/env node
/**
 * build-chennai-db.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Downloads Chennai POI data from OpenStreetMap via the public Overpass API
 * and outputs data/chennai-pois-large.json for the Galaxy Ride autocomplete.
 *
 * Usage:  node scripts/build-chennai-db.js
 * Output: data/chennai-pois-large.json  (~20 000+ named places)
 *
 * Rate-limit: 2 s pause between Overpass requests (public API courtesy limit).
 * Total runtime: ~3–5 minutes for all 14 category queries.
 * ──────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Chennai extended bounding box ─────────────────────────────────────────────
// Covers Chennai + suburbs: Tambaram, Avadi, Porur, OMR corridor, ECR
// Format for Overpass: south,west,north,east
const BBOX = '12.60,79.90,13.35,80.42';

const OUT_FILE = path.resolve(__dirname, '../data/chennai-pois-large.json');
const OVERPASS = 'overpass-api.de';
const PAUSE_MS = 2500;   // ms between queries (respect rate limit)

// ── Area bounding boxes for auto-tagging (lat_min, lon_min, lat_max, lon_max) ─
// When an OSM node has no addr:suburb tag, we assign the area by coordinates.
const AREA_BOXES = [
  // North Chennai
  { name: 'Tiruvottiyur',    b: [13.140, 80.285, 13.195, 80.330] },
  { name: 'Madhavaram',      b: [13.130, 80.215, 13.165, 80.260] },
  { name: 'Manali',          b: [13.145, 80.250, 13.195, 80.310] },
  { name: 'Ennore',          b: [13.195, 80.290, 13.260, 80.350] },
  { name: 'Kolathur',        b: [13.105, 80.193, 13.135, 80.220] },
  { name: 'Perambur',        b: [13.100, 80.225, 13.140, 80.260] },
  { name: 'Vyasarpadi',      b: [13.115, 80.255, 13.145, 80.290] },
  { name: 'Royapuram',       b: [13.095, 80.275, 13.130, 80.315] },
  { name: 'Villivakkam',     b: [13.095, 80.190, 13.120, 80.220] },
  // Northwest / Ambattur belt
  { name: 'Avadi',           b: [13.080, 80.075, 13.145, 80.120] },
  { name: 'Ambattur',        b: [13.095, 80.130, 13.140, 80.175] },
  { name: 'Pattabiram',      b: [13.050, 80.050, 13.095, 80.095] },
  { name: 'Thirumazhisai',   b: [13.040, 80.050, 13.075, 80.090] },
  // Anna Nagar / Mogappair belt
  { name: 'Mogappair',       b: [13.070, 80.165, 13.100, 80.205] },
  { name: 'Anna Nagar',      b: [13.070, 80.195, 13.105, 80.230] },
  { name: 'Shenoy Nagar',    b: [13.080, 80.215, 13.095, 80.230] },
  { name: 'Aminjikarai',     b: [13.075, 80.225, 13.093, 80.245] },
  { name: 'Arumbakkam',      b: [13.070, 80.195, 13.090, 80.213] },
  // Koyambedu / Vadapalani belt
  { name: 'Koyambedu',       b: [13.060, 80.182, 13.080, 80.205] },
  { name: 'Nerkundram',      b: [13.047, 80.165, 13.075, 80.187] },
  { name: 'Vadapalani',      b: [13.038, 80.200, 13.067, 80.225] },
  { name: 'Ashok Nagar',     b: [13.024, 80.195, 13.048, 80.220] },
  { name: 'KK Nagar',        b: [13.040, 80.185, 13.065, 80.202] },
  // Egmore / Park Town / Fort
  { name: 'Egmore',          b: [13.065, 80.255, 13.090, 80.278] },
  { name: 'Park Town',       b: [13.072, 80.265, 13.095, 80.295] },
  { name: 'Fort',            b: [13.076, 80.278, 13.100, 80.310] },
  { name: 'Kilpauk',         b: [13.070, 80.235, 13.095, 80.255] },
  { name: 'Chetpet',         b: [13.065, 80.240, 13.082, 80.258] },
  { name: 'Nungambakkam',    b: [13.047, 80.238, 13.075, 80.260] },
  // Kodambakkam / Teynampet
  { name: 'Kodambakkam',     b: [13.041, 80.218, 13.062, 80.240] },
  { name: 'T Nagar',         b: [13.028, 80.220, 13.055, 80.250] },
  { name: 'Alwarpet',        b: [13.022, 80.248, 13.042, 80.268] },
  { name: 'Teynampet',       b: [13.032, 80.248, 13.050, 80.265] },
  { name: 'Royapettah',      b: [13.044, 80.258, 13.068, 80.278] },
  // South Chennai
  { name: 'Mylapore',        b: [13.024, 80.260, 13.047, 80.280] },
  { name: 'Santhome',        b: [13.026, 80.270, 13.046, 80.290] },
  { name: 'Triplicane',      b: [13.050, 80.268, 13.068, 80.292] },
  { name: 'Chepauk',         b: [13.052, 80.272, 13.072, 80.292] },
  { name: 'Marina',          b: [13.040, 80.276, 13.070, 80.302] },
  { name: 'Saidapet',        b: [13.005, 80.218, 13.030, 80.242] },
  { name: 'Guindy',          b: [12.990, 80.200, 13.025, 80.235] },
  { name: 'Adyar',           b: [12.990, 80.245, 13.020, 80.275] },
  { name: 'Besant Nagar',    b: [12.980, 80.258, 13.010, 80.282] },
  { name: 'Thiruvanmiyur',   b: [12.966, 80.247, 12.995, 80.270] },
  // Velachery / Taramani belt
  { name: 'Taramani',        b: [12.960, 80.228, 12.988, 80.250] },
  { name: 'Velachery',       b: [12.960, 80.200, 12.994, 80.230] },
  { name: 'Alandur',         b: [12.990, 80.193, 13.015, 80.220] },
  { name: 'Nanganallur',     b: [12.970, 80.185, 12.995, 80.212] },
  { name: 'Perungudi',       b: [12.946, 80.230, 12.975, 80.258] },
  // Southwest Chennai
  { name: 'Porur',           b: [13.018, 80.140, 13.058, 80.175] },
  { name: 'Maduravoyil',     b: [13.050, 80.160, 13.080, 80.193] },
  { name: 'Poonamallee',     b: [13.020, 80.095, 13.075, 80.148] },
  // Tambaram belt
  { name: 'Pallavaram',      b: [12.950, 80.130, 12.985, 80.165] },
  { name: 'Chromepet',       b: [12.934, 80.130, 12.960, 80.162] },
  { name: 'Tambaram',        b: [12.895, 80.080, 12.940, 80.118] },
  // OMR corridor
  { name: 'Sholinganallur',  b: [12.882, 80.212, 12.920, 80.248] },
  { name: 'Karapakkam',      b: [12.900, 80.222, 12.930, 80.242] },
  { name: 'Thoraipakkam',    b: [12.918, 80.225, 12.950, 80.250] },
  { name: 'Medavakkam',      b: [12.920, 80.182, 12.958, 80.210] },
  { name: 'Pallikaranai',    b: [12.912, 80.195, 12.948, 80.228] },
  { name: 'Perumbakkam',     b: [12.905, 80.190, 12.940, 80.215] },
  { name: 'Navalur',         b: [12.835, 80.210, 12.875, 80.240] },
  { name: 'Siruseri',        b: [12.820, 80.210, 12.860, 80.240] },
  { name: 'Kelambakkam',     b: [12.800, 80.205, 12.840, 80.235] },
  // ECR
  { name: 'Neelankarai',     b: [12.928, 80.244, 12.960, 80.262] },
  { name: 'Palavakkam',      b: [12.905, 80.244, 12.935, 80.264] },
  { name: 'Injambakkam',     b: [12.878, 80.240, 12.912, 80.262] },
  { name: 'Kovalam',         b: [12.757, 80.228, 12.810, 80.255] },
];

function getArea(lat, lon) {
  for (const a of AREA_BOXES) {
    if (lat >= a.b[0] && lon >= a.b[1] && lat <= a.b[2] && lon <= a.b[3]) return a.name;
  }
  // Fallback: rough quadrant labelling
  if (lat > 13.08)  return lon > 80.24 ? 'North Chennai' : 'Northwest Chennai';
  if (lat > 13.00)  return lon > 80.24 ? 'Central Chennai' : 'West Chennai';
  if (lat > 12.95)  return lon > 80.22 ? 'South Chennai' : 'Southwest Chennai';
  return lon > 80.20 ? 'OMR' : 'Tambaram';
}

// ── OSM tag → our 3-letter category code ─────────────────────────────────────
function osm2cat(tags) {
  const a = tags.amenity || '';
  const b = tags.building || '';
  const s = tags.shop || '';
  const o = tags.office || '';
  const h = tags.highway || '';
  const l = tags.leisure || '';
  const r = tags.railway || '';
  const pt = tags.public_transport || '';
  const tu = tags.tourism || '';
  const la = tags.landuse || '';

  if (/hospital|clinic|health_centre|nursing_home/.test(a)) return 'hop';
  if (/dentist|doctors|pharmacy/.test(a))                    return 'hop';
  if (/school|university|college|library|kindergarten/.test(a)) return 'edu';
  if (/hotel|guest_house|hostel|motel/.test(a))              return 'hot';
  if (/hotel|hostel/.test(tu))                               return 'hot';
  if (/restaurant|cafe|fast_food|food_court/.test(a))        return 'rst';
  if (/mall|supermarket|department_store/.test(s))           return 'mal';
  if (/mall|supermarket/.test(a))                            return 'mal';
  if (/place_of_worship/.test(a))                            return 'tem';
  if (/bus_station/.test(a))                                 return 'bus';
  if (/station|halt/.test(r))                                return 'sta';
  if (/station/.test(pt))                                    return 'met';
  if (/apartments|residential/.test(b))                      return 'apt';
  if (/it_park|technology_park/.test(la))                    return 'itp';
  if (/it|technology|coworking|company/.test(o))             return 'itp';
  if (/office/.test(o))                                      return 'com';
  if (/commercial/.test(b))                                  return 'com';
  if (/park|garden|stadium|sports_centre/.test(l))           return 'lmk';
  if (/primary|secondary|tertiary|residential/.test(h))      return 'str';
  if (/motorway|trunk/.test(h))                              return 'str';
  if (/supermarket|department_store|clothes|electronics/.test(s)) return 'mkt';
  return 'lmk';
}

// ── Overpass queries ──────────────────────────────────────────────────────────
// Each entry produces one HTTP request. Categories kept broad to maximise recall.
const QUERIES = [
  {
    label: 'Healthcare (hospitals, clinics, pharmacies)',
    ql: `[out:json][timeout:90];(node["amenity"~"^(hospital|clinic|doctors|pharmacy|nursing_home|health_centre|dentist)$"]["name"](${BBOX});way["amenity"~"^(hospital|clinic|doctors|pharmacy|nursing_home|health_centre|dentist)$"]["name"](${BBOX}););out center tags;`,
  },
  {
    label: 'Education (schools, colleges, universities)',
    ql: `[out:json][timeout:90];(node["amenity"~"^(school|university|college|library|kindergarten)$"]["name"](${BBOX});way["amenity"~"^(school|university|college|library|kindergarten)$"]["name"](${BBOX}););out center tags;`,
  },
  {
    label: 'Hotels & accommodation',
    ql: `[out:json][timeout:90];(node["amenity"~"^(hotel|guest_house|hostel|motel)$"]["name"](${BBOX});way["amenity"~"^(hotel|guest_house|hostel|motel)$"]["name"](${BBOX});node["tourism"~"^(hotel|hostel|motel)$"]["name"](${BBOX});way["tourism"~"^(hotel|hostel|motel)$"]["name"](${BBOX}););out center tags;`,
  },
  {
    label: 'Restaurants, cafes & food',
    ql: `[out:json][timeout:90];(node["amenity"~"^(restaurant|cafe|fast_food|food_court|bar)$"]["name"](${BBOX});way["amenity"~"^(restaurant|cafe|fast_food|food_court|bar)$"]["name"](${BBOX}););out center tags;`,
  },
  {
    label: 'Shopping (malls, supermarkets, department stores)',
    ql: `[out:json][timeout:90];(node["shop"~"^(mall|supermarket|department_store|clothes|electronics|hardware|jewellery)$"]["name"](${BBOX});way["shop"~"^(mall|supermarket|department_store|clothes|electronics|hardware|jewellery)$"]["name"](${BBOX});node["amenity"~"^(marketplace)$"]["name"](${BBOX});way["amenity"~"^(marketplace)$"]["name"](${BBOX}););out center tags;`,
  },
  {
    label: 'Religious places (temples, mosques, churches)',
    ql: `[out:json][timeout:90];(node["amenity"="place_of_worship"]["name"](${BBOX});way["amenity"="place_of_worship"]["name"](${BBOX}););out center tags;`,
  },
  {
    label: 'Transport (railway stations, bus stations)',
    ql: `[out:json][timeout:90];(node["railway"~"^(station|halt)$"]["name"](${BBOX});way["railway"~"^(station|halt)$"]["name"](${BBOX});node["amenity"~"^(bus_station)$"]["name"](${BBOX});way["amenity"~"^(bus_station)$"]["name"](${BBOX});node["highway"="bus_stop"]["name"](${BBOX}););out center tags;`,
  },
  {
    label: 'Metro / public transit stations',
    ql: `[out:json][timeout:90];(node["station"="subway"]["name"](${BBOX});way["station"="subway"]["name"](${BBOX});node["public_transport"~"^(station|stop_position)$"]["train"="yes"]["name"](${BBOX});node["public_transport"="station"]["name"](${BBOX});way["public_transport"="station"]["name"](${BBOX}););out center tags;`,
  },
  {
    label: 'Residential buildings & apartments',
    ql: `[out:json][timeout:90];(way["building"~"^(apartments|residential|house|detached|terrace)$"]["name"](${BBOX});node["building"~"^(apartments|residential)$"]["name"](${BBOX}););out center tags;`,
  },
  {
    label: 'Offices & IT parks',
    ql: `[out:json][timeout:90];(node["office"]["name"](${BBOX});way["office"]["name"](${BBOX});node["building"="office"]["name"](${BBOX});way["building"="office"]["name"](${BBOX});way["landuse"~"^(commercial|industrial|retail)$"]["name"](${BBOX}););out center tags;`,
  },
  {
    label: 'Streets & named roads',
    ql: `[out:json][timeout:90];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"]["name"](${BBOX}););out center tags;`,
  },
  {
    label: 'Leisure & landmarks (parks, stadiums, attractions)',
    ql: `[out:json][timeout:90];(node["leisure"]["name"](${BBOX});way["leisure"]["name"](${BBOX});node["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park)$"]["name"](${BBOX});way["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park)$"]["name"](${BBOX});node["historic"]["name"](${BBOX});way["historic"]["name"](${BBOX}););out center tags;`,
  },
  {
    label: 'Banks & ATMs',
    ql: `[out:json][timeout:90];(node["amenity"~"^(bank|atm)$"]["name"](${BBOX});way["amenity"~"^(bank)$"]["name"](${BBOX}););out center tags;`,
  },
  {
    label: 'Fuel stations & garages',
    ql: `[out:json][timeout:90];(node["amenity"~"^(fuel|car_wash|car_repair)$"]["name"](${BBOX});way["amenity"~"^(fuel)$"]["name"](${BBOX}););out center tags;`,
  },
];

// ── HTTP helper ───────────────────────────────────────────────────────────────
function postOverpass(ql) {
  return new Promise((resolve, reject) => {
    const body    = `data=${encodeURIComponent(ql)}`;
    const options = {
      hostname: OVERPASS,
      path:     '/api/interpreter',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent':     'GalaxyRide-DBBuild/1.0',
      },
      timeout: 120_000,
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
          reject(new Error(`JSON parse failed: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Normalise a single OSM element → our POI object ──────────────────────────
function normalize(el) {
  const tags = el.tags || {};
  const name = (tags.name || tags['name:en'] || '').trim();
  if (!name || name.length < 2) return null;

  // Coordinates: node = lon/lat directly; way = center.lat/center.lon
  const lat = el.type === 'node' ? el.lat : (el.center ? el.center.lat : null);
  const lon = el.type === 'node' ? el.lon : (el.center ? el.center.lon : null);
  if (!lat || !lon) return null;

  const cat  = osm2cat(tags);
  const area = tags['addr:suburb']
            || tags['addr:neighbourhood']
            || tags['addr:quarter']
            || getArea(lat, lon);

  const poi = {
    n:   name,
    cat,
    area,
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
    _id: `${el.type[0]}${el.id}`,   // temp field for dedup; stripped before output
  };

  // Build alias list from OSM name variants
  const aliases = [];
  for (const k of ['alt_name', 'old_name', 'short_name', 'loc_name', 'name:en']) {
    const v = tags[k];
    if (v && v !== name && v.trim().length > 1) aliases.push(v.trim());
  }
  if (aliases.length) poi.a = aliases;

  return poi;
}

// ── Quality filter ────────────────────────────────────────────────────────────
const SKIP_RE = /\b(under\s*construction|demolished|closed|defunct|proposed|temporary)\b/i;
const MIN_NAME_LEN = 3;

function isGoodPOI(p) {
  if (!p) return false;
  if (p.n.length < MIN_NAME_LEN) return false;
  if (SKIP_RE.test(p.n)) return false;
  // Skip roads shorter than 4 chars (numbered lanes like "12A")
  if (p.cat === 'str' && p.n.length < 5) return false;
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🗺  Chennai POI Database Builder');
  console.log(`   Bounding box: ${BBOX}`);
  console.log(`   Output: ${OUT_FILE}`);
  console.log(`   Queries: ${QUERIES.length}\n`);

  const allById = new Map();   // osm_id → poi (for deduplication)
  let totalRaw  = 0;

  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    console.log(`[${String(i + 1).padStart(2)}/${QUERIES.length}] ${q.label} …`);

    let data;
    let attempts = 0;
    while (attempts < 3) {
      try {
        data = await postOverpass(q.ql);
        break;
      } catch (err) {
        attempts++;
        console.warn(`        ⚠ attempt ${attempts} failed: ${err.message}`);
        if (attempts < 3) await sleep(5000);
      }
    }
    if (!data || !data.elements) {
      console.warn(`        ❌ skipped (no data)\n`);
      continue;
    }

    const elements = data.elements;
    totalRaw += elements.length;

    let added = 0;
    for (const el of elements) {
      const p = normalize(el);
      if (!isGoodPOI(p)) continue;
      if (!allById.has(p._id)) {
        allById.set(p._id, p);
        added++;
      }
    }

    console.log(`        ✅ ${elements.length} raw → +${added} new (total: ${allById.size})\n`);

    // Rate limit pause (skip after last query)
    if (i < QUERIES.length - 1) await sleep(PAUSE_MS);
  }

  console.log(`\n── Post-processing ────────────────────────────────`);
  console.log(`   Raw OSM elements fetched : ${totalRaw}`);
  console.log(`   Unique named POIs        : ${allById.size}`);

  // Strip temp _id field and convert to array
  const pois = [];
  for (const p of allById.values()) {
    delete p._id;
    pois.push(p);
  }

  // Sort: streets last, then by name
  pois.sort((a, b) => {
    if (a.cat === 'str' && b.cat !== 'str') return  1;
    if (a.cat !== 'str' && b.cat === 'str') return -1;
    return a.n.localeCompare(b.n);
  });

  // Category breakdown
  const cats = {};
  pois.forEach(p => cats[p.cat] = (cats[p.cat] || 0) + 1);
  console.log('\n   Category breakdown:');
  const CAT_NAMES = {
    hop:'Hospital', edu:'Education', hot:'Hotel', rst:'Restaurant',
    mal:'Mall', tem:'Temple', bus:'Bus Stand', sta:'Railway Station',
    met:'Metro Station', apt:'Apartment', itp:'IT Park', com:'Company',
    str:'Street', mkt:'Market', lmk:'Landmark', oth:'Other',
  };
  Object.entries(cats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`     ${(CAT_NAMES[k] || k).padEnd(18)} ${v}`));

  console.log(`\n   Total POIs in output     : ${pois.length}`);

  // ── Write output ──────────────────────────────────────────────────────────
  const output = {
    meta: {
      version:     '2.0',
      source:      'OpenStreetMap via Overpass API',
      bbox:        BBOX,
      city:        'Chennai',
      state:       'Tamil Nadu',
      built:       new Date().toISOString().slice(0, 10),
      count:       pois.length,
      categories:  CAT_NAMES,
    },
    pois,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(output), 'utf8');

  const sizeMB = (fs.statSync(OUT_FILE).size / 1_048_576).toFixed(2);
  console.log(`\n✅ Written: ${OUT_FILE}  (${sizeMB} MB, ${pois.length} POIs)`);
  console.log(`   Run \`node scripts/build-chennai-db.js\` again to refresh.\n`);
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
