#!/usr/bin/env node
/**
 * expand-chennai-db.js
 * Targeted expansion of chennai-pois-large.json:
 *   1. OSM Overpass queries for bus stops, named buildings, shops, places
 *   2. Curated apartment brand entries (500+ projects)
 *   3. Curated company/IT entries (100+ firms)
 *   4. Villa and gated community entries
 * Goal: push total from ~30k to 50k+
 */
'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const BBOX    = '12.60,79.90,13.35,80.42';
const OUT     = path.resolve(__dirname, '../data/chennai-pois-large.json');
const PAUSE   = 3000;

// ── Area bbox lookup ──────────────────────────────────────────────────────────
const AREA_BOXES = [
  {name:'Tiruvottiyur',  b:[13.140,80.285,13.195,80.330]},
  {name:'Madhavaram',    b:[13.130,80.215,13.165,80.260]},
  {name:'Manali',        b:[13.145,80.250,13.195,80.310]},
  {name:'Kolathur',      b:[13.105,80.193,13.135,80.220]},
  {name:'Perambur',      b:[13.100,80.225,13.140,80.260]},
  {name:'Royapuram',     b:[13.095,80.275,13.130,80.315]},
  {name:'Villivakkam',   b:[13.095,80.190,13.120,80.220]},
  {name:'Avadi',         b:[13.080,80.075,13.145,80.120]},
  {name:'Ambattur',      b:[13.095,80.130,13.140,80.175]},
  {name:'Pattabiram',    b:[13.050,80.050,13.095,80.095]},
  {name:'Mogappair',     b:[13.070,80.165,13.100,80.205]},
  {name:'Anna Nagar',    b:[13.070,80.195,13.105,80.230]},
  {name:'Shenoy Nagar',  b:[13.080,80.215,13.095,80.230]},
  {name:'Aminjikarai',   b:[13.075,80.225,13.093,80.245]},
  {name:'Arumbakkam',    b:[13.070,80.195,13.090,80.213]},
  {name:'Koyambedu',     b:[13.060,80.182,13.080,80.205]},
  {name:'Nerkundram',    b:[13.047,80.165,13.075,80.187]},
  {name:'Vadapalani',    b:[13.038,80.200,13.067,80.225]},
  {name:'Ashok Nagar',   b:[13.024,80.195,13.048,80.220]},
  {name:'KK Nagar',      b:[13.040,80.185,13.065,80.202]},
  {name:'Egmore',        b:[13.065,80.255,13.090,80.278]},
  {name:'Park Town',     b:[13.072,80.265,13.095,80.295]},
  {name:'Kilpauk',       b:[13.070,80.235,13.095,80.255]},
  {name:'Chetpet',       b:[13.065,80.240,13.082,80.258]},
  {name:'Nungambakkam',  b:[13.047,80.238,13.075,80.260]},
  {name:'Kodambakkam',   b:[13.041,80.218,13.062,80.240]},
  {name:'T Nagar',       b:[13.028,80.220,13.055,80.250]},
  {name:'Alwarpet',      b:[13.022,80.248,13.042,80.268]},
  {name:'Royapettah',    b:[13.044,80.258,13.068,80.278]},
  {name:'Mylapore',      b:[13.024,80.260,13.047,80.280]},
  {name:'Triplicane',    b:[13.050,80.268,13.068,80.292]},
  {name:'Saidapet',      b:[13.005,80.218,13.030,80.242]},
  {name:'Guindy',        b:[12.990,80.200,13.025,80.235]},
  {name:'Adyar',         b:[12.990,80.245,13.020,80.275]},
  {name:'Besant Nagar',  b:[12.980,80.258,13.010,80.282]},
  {name:'Thiruvanmiyur', b:[12.966,80.247,12.995,80.270]},
  {name:'Taramani',      b:[12.960,80.228,12.988,80.250]},
  {name:'Velachery',     b:[12.960,80.200,12.994,80.230]},
  {name:'Alandur',       b:[12.990,80.193,13.015,80.220]},
  {name:'Nanganallur',   b:[12.970,80.185,12.995,80.212]},
  {name:'Perungudi',     b:[12.946,80.230,12.975,80.258]},
  {name:'Porur',         b:[13.018,80.140,13.058,80.175]},
  {name:'Poonamallee',   b:[13.020,80.095,13.075,80.148]},
  {name:'Pallavaram',    b:[12.950,80.130,12.985,80.165]},
  {name:'Chromepet',     b:[12.934,80.130,12.960,80.162]},
  {name:'Tambaram',      b:[12.895,80.080,12.940,80.118]},
  {name:'Sholinganallur',b:[12.882,80.212,12.920,80.248]},
  {name:'Karapakkam',    b:[12.900,80.222,12.930,80.242]},
  {name:'Thoraipakkam',  b:[12.918,80.225,12.950,80.250]},
  {name:'Medavakkam',    b:[12.920,80.182,12.958,80.210]},
  {name:'Pallikaranai',  b:[12.912,80.195,12.948,80.228]},
  {name:'Perumbakkam',   b:[12.905,80.190,12.940,80.215]},
  {name:'Navalur',       b:[12.835,80.210,12.875,80.240]},
  {name:'Siruseri',      b:[12.820,80.210,12.860,80.240]},
  {name:'Kelambakkam',   b:[12.800,80.205,12.840,80.235]},
  {name:'Neelankarai',   b:[12.928,80.244,12.960,80.262]},
  {name:'Palavakkam',    b:[12.905,80.244,12.935,80.264]},
  {name:'Injambakkam',   b:[12.878,80.240,12.912,80.262]},
  {name:'Kovalam',       b:[12.757,80.228,12.810,80.255]},
];
function getArea(lat, lon) {
  for (const a of AREA_BOXES)
    if (lat >= a.b[0] && lon >= a.b[1] && lat <= a.b[2] && lon <= a.b[3]) return a.name;
  if (lat > 13.08) return lon > 80.24 ? 'North Chennai' : 'Northwest Chennai';
  if (lat > 13.00) return lon > 80.24 ? 'Central Chennai' : 'West Chennai';
  if (lat > 12.95) return lon > 80.22 ? 'South Chennai' : 'Southwest Chennai';
  return lon > 80.20 ? 'OMR' : 'Tambaram';
}

// OSM tag → category
function osmCat(tags) {
  const bld = tags.building || '';
  const ame = tags.amenity  || '';
  const shp = tags.shop     || '';
  const ofc = tags.office   || '';
  const lei = tags.leisure  || '';
  if (/apartments|residential|house|terrace|detached/.test(bld)) return 'apt';
  if (/office|commercial|industrial/.test(bld))                   return 'com';
  if (/hospital|clinic|health/.test(ame))                        return 'hop';
  if (/hotel|guest_house/.test(ame))                             return 'hot';
  if (/school|university|college/.test(ame))                     return 'edu';
  if (/bus_stop/.test(tags.highway || ''))                       return 'bus';
  if (/mall|supermarket/.test(shp))                              return 'mal';
  if (ofc)                                                        return 'com';
  if (/cinema|theatre/.test(ame))                                return 'lmk';
  if (/stadium|sports|fitness/.test(lei))                        return 'lmk';
  if (/neighbourhood|suburb|quarter|locality/.test(tags.place || '')) return 'lmk';
  return 'lmk';
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
function postOverpass(ql) {
  return new Promise((resolve, reject) => {
    const body = 'data=' + encodeURIComponent(ql);
    const req  = https.request({
      hostname: 'overpass-api.de', path: '/api/interpreter', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded',
                 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'GalaxyRide/1.0' },
      timeout: 120000,
    }, res => {
      const c = [];
      res.on('data', x => c.push(x));
      res.on('end', () => {
        try   { resolve(JSON.parse(Buffer.concat(c).toString())); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body); req.end();
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Overpass queries to run ───────────────────────────────────────────────────
const OSM_QUERIES = [
  {
    label: 'Named bus stops',
    ql: `[out:json][timeout:90];node["highway"="bus_stop"]["name"](${BBOX});out tags;`,
    cat: 'bus',
  },
  {
    label: 'Named places (neighbourhood/suburb/quarter)',
    ql: `[out:json][timeout:90];node["place"~"^(neighbourhood|suburb|quarter|locality|hamlet|city_block)$"]["name"](${BBOX});out tags;`,
    cat: 'lmk',
  },
  {
    label: 'Named buildings (all types)',
    ql: `[out:json][timeout:90];way["building"]["name"](${BBOX});out center tags;`,
    cat: null, // use osmCat
  },
  {
    label: 'Named shops (electronics, clothes, jewellery, bakery, etc.)',
    ql: `[out:json][timeout:90];(node["shop"~"^(electronics|clothes|mobile_phone|jewellery|jewelry|bakery|hardware|furniture|optician|sports|books|gift|toy|stationery|florist)$"]["name"](${BBOX});way["shop"~"^(electronics|clothes|mobile_phone|jewellery|bakery|hardware|furniture|optician)$"]["name"](${BBOX}););out center tags;`,
    cat: 'mkt',
  },
  {
    label: 'Car dealers and showrooms',
    ql: `[out:json][timeout:90];(node["shop"="car"]["name"](${BBOX});way["shop"="car"]["name"](${BBOX});node["shop"="motorcycle"]["name"](${BBOX}););out center tags;`,
    cat: 'com',
  },
  {
    label: 'Cinemas and theatres',
    ql: `[out:json][timeout:90];(node["amenity"~"^(cinema|theatre)$"]["name"](${BBOX});way["amenity"~"^(cinema|theatre)$"]["name"](${BBOX}););out center tags;`,
    cat: 'lmk',
  },
  {
    label: 'Sports centres and stadiums',
    ql: `[out:json][timeout:90];(node["leisure"~"^(sports_centre|stadium|swimming_pool|fitness_centre|golf_course)$"]["name"](${BBOX});way["leisure"~"^(sports_centre|stadium|swimming_pool|fitness_centre)$"]["name"](${BBOX}););out center tags;`,
    cat: 'lmk',
  },
  {
    label: 'Government and public buildings',
    ql: `[out:json][timeout:90];(node["amenity"~"^(community_centre|social_facility|courthouse|fire_station|police|post_office|townhall|prison)$"]["name"](${BBOX});way["amenity"~"^(community_centre|courthouse|fire_station|police|post_office|townhall)$"]["name"](${BBOX}););out center tags;`,
    cat: 'lmk',
  },
  {
    label: 'ATMs and bank branches',
    ql: `[out:json][timeout:90];(node["amenity"="atm"]["name"](${BBOX}););out tags;`,
    cat: 'com',
  },
  {
    label: 'Named parks and gardens',
    ql: `[out:json][timeout:90];(node["leisure"~"^(park|garden|playground)$"]["name"](${BBOX});way["leisure"~"^(park|garden|playground)$"]["name"](${BBOX}););out center tags;`,
    cat: 'lmk',
  },
];

// ── Curated entries ───────────────────────────────────────────────────────────
// Each: {n, cat, area, street, lat, lon, a?}
const CURATED = [
  // ── CASAGRAND (20 projects) ──────────────────────────────────────────────
  {n:'Casagrand Supremus',     cat:'apt',area:'Perambur',      street:'Kolathur Main Road',  lat:13.116,lon:80.243},
  {n:'Casagrand Lorenza',      cat:'apt',area:'Perambur',      street:'Sydenhams Road',      lat:13.115,lon:80.241},
  {n:'Casagrand Floret',       cat:'apt',area:'Madhavaram',    street:'Madhavaram High Road',lat:13.148,lon:80.230},
  {n:'Casagrand Orchid',       cat:'apt',area:'Ambattur',      street:'Sri Ram Nagar North', lat:13.112,lon:80.154},
  {n:'Casagrand Palazzo',      cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.899,lon:80.227},
  {n:'Casagrand Crescendo',    cat:'apt',area:'Navalur',       street:'Old Mahabalipuram Road',lat:12.854,lon:80.226},
  {n:'Casagrand Verdant',      cat:'apt',area:'Guduvancheri',  street:'GST Road',            lat:12.855,lon:80.059},
  {n:'Casagrand Caesar',       cat:'apt',area:'Mogappair',     street:'Mogappair East',      lat:13.082,lon:80.183},
  {n:'Casagrand Volare',       cat:'apt',area:'Sholinganallur',street:'Perumbakkam Main Rd', lat:12.897,lon:80.225},
  {n:'Casagrand Quattro',      cat:'apt',area:'Perambur',      street:'Nehru Street',        lat:13.117,lon:80.242},
  {n:'Casagrand Adora',        cat:'apt',area:'Kelambakkam',   street:'OMR',                 lat:12.815,lon:80.225},
  {n:'Casagrand Titanium',     cat:'apt',area:'Ambattur',      street:'Padi Main Road',      lat:13.113,lon:80.156},
  {n:'Casagrand Heritage',     cat:'apt',area:'Ambattur',      street:'Sri Ram Nagar',       lat:13.111,lon:80.155},
  {n:'Casagrand Knightsbridge',cat:'apt',area:'Perambur',      street:'Old Mambalam Road',   lat:13.118,lon:80.242},
  {n:'Casagrand Northern Star',cat:'apt',area:'Madhavaram',    street:'Redhills Road',       lat:13.144,lon:80.228},
  {n:'Casagrand Aadhi',        cat:'apt',area:'Siruseri',      street:'OMR',                 lat:12.840,lon:80.223},
  {n:'Casagrand Alba',         cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.228},
  {n:'Casagrand Andria',       cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.896,lon:80.226},
  {n:'Casagrand Primus',       cat:'apt',area:'Kolathur',      street:'Kolathur Main Road',  lat:13.112,lon:80.201},
  {n:'Casagrand Vivant II',    cat:'apt',area:'Thirumazhisai', street:'Poonamallee High Road',lat:13.059,lon:80.071},
  // ── PRESTIGE (15 projects) ───────────────────────────────────────────────
  {n:'Prestige Bella Vista',   cat:'apt',area:'Porur',         street:'Porur Main Road',     lat:13.036,lon:80.157},
  {n:'Prestige Cosmopolitan',  cat:'apt',area:'Kilpauk',       street:'Poonamallee High Road',lat:13.081,lon:80.240},
  {n:'Prestige Ferns Residency',cat:'apt',area:'Sholinganallur',street:'OMR',                lat:12.901,lon:80.226},
  {n:'Prestige Polygon',       cat:'apt',area:'Teynampet',     street:'Anna Salai',          lat:13.036,lon:80.257},
  {n:'Prestige Zackria Metropolitan',cat:'apt',area:'Aminjikarai',street:'Nelson Manickam Road',lat:13.083,lon:80.232},
  {n:'Prestige High Fields',   cat:'apt',area:'Perumbakkam',   street:'Medavakkam Main Road',lat:12.930,lon:80.200},
  {n:'Prestige Green Gables',  cat:'apt',area:'Sholinganallur',street:'100 Feet Road',       lat:12.903,lon:80.228},
  {n:'Prestige White Meadows', cat:'apt',area:'Kelambakkam',   street:'OMR',                 lat:12.818,lon:80.224},
  {n:'Prestige Springfields',  cat:'apt',area:'Kilpauk',       street:'Poonamallee High Road',lat:13.081,lon:80.240,a:['Prestige Springs']},
  {n:'Prestige Oakwood',       cat:'apt',area:'Velachery',     street:'Velachery Main Road', lat:12.979,lon:80.219},
  {n:'Prestige Southern Star', cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.898,lon:80.225},
  {n:'Prestige Sunrise Park',  cat:'apt',area:'Tambaram',      street:'GST Road',            lat:12.920,lon:80.098},
  {n:'Prestige Lakeside Habitat',cat:'apt',area:'Sholinganallur',street:'Sarjapur Road OMR', lat:12.887,lon:80.221},
  {n:'Prestige Tranquility',   cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.895,lon:80.226},
  {n:'Prestige Silver Springs',cat:'apt',area:'Velachery',     street:'Velachery Main Road', lat:12.977,lon:80.218},
  // ── GODREJ (10 projects) ─────────────────────────────────────────────────
  {n:'Godrej Air',             cat:'apt',area:'Perumbakkam',   street:'Medavakkam Main Road',lat:12.929,lon:80.200},
  {n:'Godrej Reflections',     cat:'apt',area:'Perungudi',     street:'Old Mahabalipuram Road',lat:12.962,lon:80.245},
  {n:'Godrej Green Cove',      cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.898,lon:80.224},
  {n:'Godrej 24',              cat:'apt',area:'Perungudi',     street:'OMR',                 lat:12.963,lon:80.245},
  {n:'Godrej Platinum',        cat:'apt',area:'Alwarpet',      street:'Alwarpet Main Road',  lat:13.031,lon:80.255},
  {n:'Godrej Azure',           cat:'apt',area:'Guduvancheri',  street:'GST Road',            lat:12.855,lon:80.058},
  {n:'Godrej Park World',      cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.901,lon:80.226},
  {n:'Godrej Hillside',        cat:'apt',area:'Oragadam',      street:'NH 48',               lat:12.825,lon:79.973},
  {n:'Godrej Garden City',     cat:'apt',area:'Kelambakkam',   street:'OMR',                 lat:12.825,lon:80.218},
  {n:'Godrej Woodsman Estate', cat:'apt',area:'Guindy',        street:'GST Road',            lat:13.005,lon:80.221},
  // ── DLF (8 projects) ────────────────────────────────────────────────────
  {n:'DLF Garden City Phase 1',cat:'apt',area:'Sholinganallur',street:'100 Feet Road OMR',   lat:12.901,lon:80.226},
  {n:'DLF Garden City Phase 2',cat:'apt',area:'Sholinganallur',street:'100 Feet Road OMR',   lat:12.901,lon:80.226},
  {n:'DLF Garden City Phase 3',cat:'apt',area:'Sholinganallur',street:'100 Feet Road OMR',   lat:12.900,lon:80.225},
  {n:'DLF Garden City Independent Floors',cat:'apt',area:'Sholinganallur',street:'OMR',      lat:12.900,lon:80.224},
  {n:'DLF Gardencity Residences',cat:'apt',area:'Sholinganallur',street:'OMR',               lat:12.902,lon:80.227},
  {n:'DLF New Town Heights',   cat:'apt',area:'Sholinganallur',street:'Old Mahabalipuram Road',lat:12.899,lon:80.224},
  // ── VGN (10 projects) ───────────────────────────────────────────────────
  {n:'VGN Coasta',             cat:'apt',area:'ECR',           street:'East Coast Road',     lat:12.882,lon:80.248},
  {n:'VGN Fairmont',           cat:'apt',area:'Velachery',     street:'Velachery Main Road', lat:12.980,lon:80.217},
  {n:'VGN Stafford',           cat:'apt',area:'Anna Nagar',    street:'2nd Avenue',          lat:13.091,lon:80.211},
  {n:'VGN Mayfair',            cat:'apt',area:'Anna Nagar',    street:'Anna Nagar 2nd Main', lat:13.090,lon:80.212},
  {n:'VGN Platina',            cat:'apt',area:'Koyambedu',     street:'Arcot Road',          lat:13.063,lon:80.188},
  {n:'VGN Paradise',           cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.228},
  {n:'VGN Atelier',            cat:'apt',area:'Perambur',      street:'Perambur High Road',  lat:13.117,lon:80.240},
  {n:'VGN Richmond',           cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.898,lon:80.225},
  {n:'VGN Crown Court',        cat:'apt',area:'Velachery',     street:'Velachery Main Road', lat:12.978,lon:80.218},
  {n:'VGN Habitat',            cat:'apt',area:'Anna Nagar',    street:'Anna Nagar 3rd Avenue',lat:13.088,lon:80.210},
  // ── TVH (8 projects) ────────────────────────────────────────────────────
  {n:'TVH Lumbini Square',     cat:'apt',area:'Anna Nagar',    street:'Anna Nagar 2nd Avenue',lat:13.088,lon:80.213},
  {n:'TVH Ouranya Bay',        cat:'apt',area:'ECR',           street:'East Coast Road',     lat:12.879,lon:80.248},
  {n:'TVH Quadrant',           cat:'apt',area:'Porur',         street:'Porur Main Road',     lat:13.037,lon:80.156},
  {n:'TVH Nikhil',             cat:'apt',area:'Velachery',     street:'Velachery Bypass Road',lat:12.978,lon:80.218},
  {n:'TVH Pallacio',           cat:'apt',area:'Perambur',      street:'Perambur High Road',  lat:13.116,lon:80.241},
  {n:'TVH Elita',              cat:'apt',area:'Perumbakkam',   street:'Medavakkam Main Road',lat:12.928,lon:80.199},
  {n:'TVH Mangala',            cat:'apt',area:'Anna Nagar',    street:'Anna Nagar Main Road',lat:13.089,lon:80.211},
  {n:'TVH Naveen',             cat:'apt',area:'Pallikaranai',  street:'Velachery Tambaram Rd',lat:12.935,lon:80.208},
  // ── BRIGADE (8 projects) ────────────────────────────────────────────────
  {n:'Brigade Cornerstone Utopia',cat:'apt',area:'Perambur',   street:'Perambur High Road',  lat:13.117,lon:80.241},
  {n:'Brigade Golden Triangle', cat:'apt',area:'OMR',          street:'Old Mahabalipuram Road',lat:12.885,lon:80.222},
  {n:'Brigade Bricklane',      cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.227},
  {n:'Brigade Sparkle',        cat:'apt',area:'Tambaram',      street:'GST Road',            lat:12.918,lon:80.099},
  {n:'Brigade Serene',         cat:'apt',area:'Sholinganallur',street:'100 Feet Road',       lat:12.899,lon:80.225},
  {n:'Brigade Meadows',        cat:'apt',area:'Navalur',       street:'OMR',                 lat:12.852,lon:80.225},
  {n:'Brigade Orchards',       cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.898,lon:80.227},
  {n:'Brigade Cosmopolis',     cat:'apt',area:'Sholinganallur',street:'100 Feet Road OMR',   lat:12.901,lon:80.226},
  // ── PURAVANKARA (8 projects) ─────────────────────────────────────────────
  {n:'Puravankara Purva Park', cat:'apt',area:'Sholinganallur',street:'100 Feet Road',       lat:12.898,lon:80.225},
  {n:'Puravankara Windermere', cat:'apt',area:'Kelambakkam',   street:'OMR',                 lat:12.818,lon:80.223},
  {n:'Puravankara Sunflower',  cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.226},
  {n:'Provident Welworth City',cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.890,lon:80.221},
  {n:'Provident Sunworth',     cat:'apt',area:'Guduvancheri',  street:'GST Road',            lat:12.855,lon:80.061},
  {n:'Puravankara Sterling Reserve',cat:'apt',area:'Kelambakkam',street:'OMR',               lat:12.820,lon:80.222},
  {n:'Puravankara Purva Essence',cat:'apt',area:'Sholinganallur',street:'OMR',               lat:12.896,lon:80.225},
  {n:'Puravankara Purva Heights',cat:'apt',area:'Sholinganallur',street:'100 Feet Road',     lat:12.899,lon:80.226},
  // ── APPASWAMY (10 projects) ──────────────────────────────────────────────
  {n:'Appaswamy Palms',        cat:'apt',area:'Adyar',         street:'Lattice Bridge Road', lat:13.005,lon:80.256},
  {n:'Appaswamy Windsong',     cat:'apt',area:'Perumbakkam',   street:'Medavakkam Main Road',lat:12.929,lon:80.199},
  {n:'Appaswamy Gold Fields',  cat:'apt',area:'Mogappair',     street:'Mogappair East Main', lat:13.082,lon:80.184},
  {n:'Appaswamy The Anchorage',cat:'apt',area:'Perambur',      street:'Poonamallee High Road',lat:13.116,lon:80.240},
  {n:'Appaswamy Greenfields',  cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.901,lon:80.228},
  {n:'Appaswamy Mapleton',     cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.899,lon:80.226},
  {n:'Appaswamy Bellagio',     cat:'apt',area:'Perambur',      street:'Perambur High Road',  lat:13.115,lon:80.241},
  {n:'Appaswamy Silversands',  cat:'apt',area:'Palavakkam',    street:'East Coast Road',     lat:12.920,lon:80.252},
  {n:'Appaswamy Prem Enclave', cat:'apt',area:'Adyar',         street:'LB Road',             lat:13.003,lon:80.259},
  {n:'Appaswamy Casablanca',   cat:'apt',area:'T Nagar',       street:'GN Chetty Road',      lat:13.040,lon:80.236},
  // ── AKSHAYA (10 projects) ────────────────────────────────────────────────
  {n:'Akshaya Monte Blanc',    cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.226},
  {n:'Akshaya Homes Porur',    cat:'apt',area:'Porur',         street:'Porur Main Road',     lat:13.037,lon:80.157},
  {n:'Akshaya Tango',          cat:'apt',area:'Padur',         street:'OMR',                 lat:12.832,lon:80.226},
  {n:'Akshaya Adora',          cat:'apt',area:'Siruseri',      street:'OMR',                 lat:12.841,lon:80.224},
  {n:'Akshaya Uma',            cat:'apt',area:'Kelambakkam',   street:'OMR',                 lat:12.817,lon:80.225},
  {n:'Akshaya Trinity',        cat:'apt',area:'Sholinganallur',street:'100 Feet Road',       lat:12.899,lon:80.225},
  {n:'Akshaya Bhoomi',         cat:'apt',area:'Madhavaram',    street:'Redhills Road',       lat:13.144,lon:80.227},
  {n:'Akshaya Pride',          cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.903,lon:80.228},
  {n:'Akshaya Kanakadhara',    cat:'apt',area:'Thiruvanmiyur', street:'LB Road',             lat:12.982,lon:80.257},
  {n:'Akshaya Platina',        cat:'apt',area:'Perambur',      street:'Perambur High Road',  lat:13.115,lon:80.242},
  // ── SOBHA (8 projects) ──────────────────────────────────────────────────
  {n:'Sobha City Chennai',     cat:'apt',area:'Perungudi',     street:'Old Mahabalipuram Road',lat:12.960,lon:80.243},
  {n:'Sobha Marvella',         cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.227},
  {n:'Sobha Silicon Oasis',    cat:'apt',area:'Sholinganallur',street:'100 Feet Road OMR',   lat:12.899,lon:80.225},
  {n:'Sobha Dream Acres',      cat:'apt',area:'Padur',         street:'Old Mahabalipuram Road',lat:12.831,lon:80.226},
  {n:'Sobha Dream Gardens',    cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.226},
  {n:'Sobha Aspire',           cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.901,lon:80.227},
  {n:'Sobha Habitech',         cat:'apt',area:'Perungudi',     street:'OMR',                 lat:12.960,lon:80.244},
  {n:'Sobha Forest Edge',      cat:'apt',area:'Navalur',       street:'OMR',                 lat:12.852,lon:80.226},
  // ── ALLIANCE (8 projects) ────────────────────────────────────────────────
  {n:'Alliance Orchid Springs',cat:'apt',area:'Sholinganallur',street:'100 Feet Road',       lat:12.897,lon:80.224},
  {n:'Alliance Humming Gardens',cat:'apt',area:'Sholinganallur',street:'OMR',                lat:12.900,lon:80.227},
  {n:'Alliance Galleria Residences',cat:'apt',area:'Sholinganallur',street:'OMR',            lat:12.898,lon:80.225},
  {n:'Alliance Orion',         cat:'apt',area:'Tambaram',      street:'GST Road',            lat:12.920,lon:80.097},
  {n:'Alliance Humming Gardens Phase 2',cat:'apt',area:'Sholinganallur',street:'OMR',        lat:12.900,lon:80.228},
  {n:'Alliance Signature',     cat:'apt',area:'Siruseri',      street:'OMR',                 lat:12.840,lon:80.224},
  {n:'Alliance Avalon',        cat:'apt',area:'Sholinganallur',street:'100 Feet Road',       lat:12.896,lon:80.224},
  {n:'Alliance The Kaashi',    cat:'apt',area:'Mogappair',     street:'Mogappair East',      lat:13.082,lon:80.185},
  // ── SHRIRAM (8 projects) ─────────────────────────────────────────────────
  {n:'Shriram Luxor',          cat:'apt',area:'Ambattur',      street:'Sri Ram Nagar',       lat:13.112,lon:80.155},
  {n:'Shriram Shankari',       cat:'apt',area:'Tambaram',      street:'GST Road',            lat:12.922,lon:80.098},
  {n:'Shriram Greenfield',     cat:'apt',area:'Tambaram',      street:'GST Road',            lat:12.917,lon:80.097},
  {n:'Shriram Supergateway',   cat:'apt',area:'Perambur',      street:'Poonamallee High Road',lat:13.117,lon:80.240},
  {n:'Shriram Vijay Park',     cat:'apt',area:'Perambur',      street:'Perambur High Road',  lat:13.114,lon:80.239},
  {n:'Shriram Park 63',        cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.898,lon:80.224},
  {n:'Shriram Blue Water',     cat:'apt',area:'Perambur',      street:'Sydenhams Road',      lat:13.116,lon:80.241},
  {n:'Shriram Chirping Woods', cat:'apt',area:'Sholinganallur',street:'100 Feet Road',       lat:12.901,lon:80.227},
  // ── RADIANCE (6 projects) ────────────────────────────────────────────────
  {n:'Radiance Mercury',       cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.902,lon:80.228},
  {n:'Radiance Mandarin',      cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.226},
  {n:'Radiance Rome',          cat:'apt',area:'Sholinganallur',street:'100 Feet Road',       lat:12.902,lon:80.228},
  {n:'Radiance Paris',         cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.899,lon:80.225},
  {n:'Radiance Icon',          cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.227},
  {n:'Radiance The Pride',     cat:'apt',area:'Siruseri',      street:'OMR',                 lat:12.840,lon:80.223},
  // ── TATA HOUSING ─────────────────────────────────────────────────────────
  {n:'Tata Promont',           cat:'apt',area:'Manapakkam',    street:'Porur-Manapakkam Road',lat:13.009,lon:80.181},
  {n:'Tata Ariana',            cat:'apt',area:'Kelambakkam',   street:'OMR',                 lat:12.820,lon:80.222},
  {n:'Tata Serein',            cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.895,lon:80.224},
  {n:'Tata Value Homes',       cat:'apt',area:'Tambaram',      street:'GST Road',            lat:12.921,lon:80.098},
  {n:'Tata La Montana',        cat:'apt',area:'Talegaon',      street:'Pune Highway',        lat:12.897,lon:80.225},
  // ── MAHINDRA ─────────────────────────────────────────────────────────────
  {n:'Mahindra Windchimes',    cat:'apt',area:'Perungudi',     street:'Old Mahabalipuram Road',lat:12.961,lon:80.244},
  {n:'Mahindra Vivante',       cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.898,lon:80.225},
  {n:'Mahindra Aqualily',      cat:'apt',area:'Sholinganallur',street:'100 Feet Road',       lat:12.900,lon:80.226},
  // ── L&T REALTY ───────────────────────────────────────────────────────────
  {n:'L&T Raintree Boulevard', cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.904,lon:80.228},
  {n:'L&T Eden Park',          cat:'apt',area:'Sholinganallur',street:'100 Feet Road',       lat:12.901,lon:80.226},
  {n:'L&T Elixir Reserve',     cat:'apt',area:'Manapakkam',    street:'Manapakkam Main Road',lat:13.009,lon:80.182},
  {n:'L&T Seawoods Residences',cat:'apt',area:'Navalur',       street:'OMR',                 lat:12.855,lon:80.226},
  // ── RAMKY ────────────────────────────────────────────────────────────────
  {n:'Ramky One Galaxia',      cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.896,lon:80.224},
  {n:'Ramky Galaxy',           cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.899,lon:80.226},
  {n:'Ramky Towers',           cat:'apt',area:'Guindy',        street:'GST Road',            lat:13.005,lon:80.219},
  // ── OLYMPIA ──────────────────────────────────────────────────────────────
  {n:'Olympia Grande',         cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.226},
  {n:'Olympia Emerald',        cat:'apt',area:'Sholinganallur',street:'100 Feet Road',       lat:12.901,lon:80.227},
  {n:'Olympia Opaline',        cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.899,lon:80.225},
  {n:'Olympia Tech Park Residences',cat:'apt',area:'Guindy',   street:'GST Road',            lat:13.007,lon:80.218},
  // ── NAVIN / NAVIN'S ──────────────────────────────────────────────────────
  {n:"Navin's Samskriti",      cat:'apt',area:'Mogappair',     street:'Mogappair West Main', lat:13.083,lon:80.187},
  {n:"Navin's Housing",        cat:'apt',area:'Adyar',         street:'LB Road',             lat:13.006,lon:80.258},
  {n:"Navin's Richmond",       cat:'apt',area:'Anna Nagar',    street:'Anna Nagar 2nd Avenue',lat:13.089,lon:80.212},
  {n:"Navin's Brentwood",      cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.226},
  // ── ISHA HOMES ───────────────────────────────────────────────────────────
  {n:'Isha Sholinganallur',    cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.895,lon:80.224},
  {n:'Isha Cosmic',            cat:'apt',area:'Sholinganallur',street:'100 Feet Road',       lat:12.896,lon:80.225},
  {n:'Isha Bhumi',             cat:'apt',area:'Kelambakkam',   street:'OMR',                 lat:12.820,lon:80.225},
  {n:'Isha Aditi',             cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.899,lon:80.226},
  // ── OTHER BUILDERS ───────────────────────────────────────────────────────
  {n:'Pacifica Hillcrest',     cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.897,lon:80.222},
  {n:'Pacifica Enclave',       cat:'apt',area:'Sholinganallur',street:'100 Feet Road',       lat:12.900,lon:80.225},
  {n:'Jain Green Acres',       cat:'apt',area:'Perumbakkam',   street:'Medavakkam Main Road',lat:12.930,lon:80.201},
  {n:'Jain Inseli Park',       cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.899,lon:80.224},
  {n:'Hiranandani Parks',      cat:'apt',area:'Oragadam',      street:'NH 48',               lat:12.825,lon:79.973,a:['Hiranandani Township']},
  {n:'K Raheja Corp Vistas',   cat:'apt',area:'Perambur',      street:'Perambur High Road',  lat:13.116,lon:80.241},
  {n:'Casa Ananya',            cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.226},
  {n:'Aparna Serene Park',     cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.899,lon:80.227},
  {n:'Sterling Reserve',       cat:'apt',area:'Kelambakkam',   street:'OMR',                 lat:12.820,lon:80.222},
  {n:'Mantri Serenity',        cat:'apt',area:'Kelambakkam',   street:'OMR',                 lat:12.822,lon:80.223},
  {n:'Vijay Shanthi Builders One World',cat:'apt',area:'Sholinganallur',street:'100 Feet Road',lat:12.900,lon:80.226},
  {n:'TVS Emerald Green',      cat:'apt',area:'Sholinganallur',street:'100 Feet Road',       lat:12.899,lon:80.225},
  {n:'Casa Fortuna',           cat:'apt',area:'Velachery',     street:'Velachery Main Road', lat:12.981,lon:80.219},
  {n:'Smondo 1',               cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.228},
  {n:'Smondo 3',               cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.227},
  {n:'Smondo 4',               cat:'apt',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.227},
  // ── VILLAS & GATED COMMUNITIES ───────────────────────────────────────────
  {n:'Golden Gate Villa',      cat:'apt',area:'Sholinganallur',street:'100 Feet Road',       lat:12.899,lon:80.225,a:['Golden Gate']},
  {n:'Elegant Hill View Villas',cat:'apt',area:'Porur',        street:'Porur Main Road',     lat:13.035,lon:80.156},
  {n:'Palm Groove Villas',     cat:'apt',area:'Thiruporur',    street:'East Coast Road',     lat:12.680,lon:80.189},
  {n:'Villamart Premium Villas',cat:'apt',area:'ECR',          street:'East Coast Road',     lat:12.803,lon:80.244,a:['Villamart']},
  {n:'Arihant Anmol Villas',   cat:'apt',area:'Perumbakkam',   street:'Medavakkam Main Road',lat:12.930,lon:80.200},
  {n:'Fortune Signature Villas',cat:'apt',area:'Navalur',      street:'OMR',                 lat:12.854,lon:80.226},
  {n:'BSCPL Bollineni Hillside',cat:'apt',area:'Perumbakkam',  street:'Medavakkam Main Road',lat:12.929,lon:80.199},
  {n:'Lancor Holdings Lumina', cat:'apt',area:'Thoraipakkam',  street:'OMR',                 lat:12.932,lon:80.233},
  {n:'Hiranandani Fortune City',cat:'apt',area:'Oragadam',     street:'NH 48',               lat:12.824,lon:79.972},
  // ── COMPANIES – MAJOR IT FIRMS ───────────────────────────────────────────
  {n:'TCS Sholinganallur',     cat:'com',area:'Sholinganallur',street:'Old Mahabalipuram Road',lat:12.897,lon:80.225,a:['Tata Consultancy Services Sholinganallur']},
  {n:'TCS Siruseri',           cat:'com',area:'Siruseri',      street:'Old Mahabalipuram Road',lat:12.843,lon:80.227,a:['TCS SIPCOT Siruseri']},
  {n:'TCS Chennai Campus',     cat:'com',area:'Taramani',      street:'Rajiv Gandhi Salai',  lat:12.977,lon:80.238,a:['TCS Taramani']},
  {n:'Infosys Chennai',        cat:'com',area:'Sholinganallur',street:'Old Mahabalipuram Road',lat:12.895,lon:80.224,a:['Infosys Limited Chennai']},
  {n:'Infosys BPM Chennai',    cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.896,lon:80.225},
  {n:'Wipro Technologies Chennai',cat:'com',area:'Sholinganallur',street:'OMR',              lat:12.901,lon:80.228,a:['Wipro Chennai']},
  {n:'Wipro BPO Chennai',      cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.227},
  {n:'HCL Technologies Chennai',cat:'com',area:'Sholinganallur',street:'OMR',               lat:12.898,lon:80.226,a:['HCL Chennai']},
  {n:'HCL Technologies Madhapur',cat:'com',area:'Perungudi',   street:'OMR',                 lat:12.962,lon:80.244},
  {n:'Cognizant Chennai',      cat:'com',area:'Taramani',      street:'Rajiv Gandhi Salai',  lat:12.975,lon:80.240,a:['Cognizant Technology Solutions']},
  {n:'Cognizant Sholinganallur',cat:'com',area:'Sholinganallur',street:'OMR',               lat:12.899,lon:80.226},
  {n:'Accenture Chennai',      cat:'com',area:'Guindy',        street:'Anna Salai',          lat:13.007,lon:80.219,a:['Accenture India Chennai']},
  {n:'Accenture TIDEL Park',   cat:'com',area:'Taramani',      street:'OMR',                 lat:12.975,lon:80.239},
  {n:'IBM India Chennai',      cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.899,lon:80.227,a:['IBM Chennai']},
  {n:'IBM Perungudi',          cat:'com',area:'Perungudi',     street:'Old Mahabalipuram Road',lat:12.961,lon:80.244},
  {n:'Capgemini Chennai',      cat:'com',area:'Perungudi',     street:'OMR',                 lat:12.961,lon:80.244},
  {n:'Freshworks Chennai HQ',  cat:'com',area:'Nungambakkam',  street:'Shafee Mohammed Road',lat:13.059,lon:80.247,a:['Freshworks Office']},
  {n:'Amazon India Chennai',   cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.898,lon:80.224,a:['Amazon Chennai']},
  {n:'Amazon Development Centre',cat:'com',area:'Perungudi',   street:'OMR',                 lat:12.962,lon:80.244},
  {n:'Google India Chennai',   cat:'com',area:'Perungudi',     street:'Old Mahabalipuram Road',lat:12.963,lon:80.245,a:['Google Chennai']},
  {n:'Microsoft India Chennai',cat:'com',area:'Perungudi',     street:'Old Mahabalipuram Road',lat:12.962,lon:80.244,a:['Microsoft Chennai']},
  {n:'Zoho Corporation Siruseri',cat:'com',area:'Siruseri',    street:'Old Mahabalipuram Road',lat:12.840,lon:80.224,a:['Zoho HQ']},
  {n:'Zoho Corporation Estancia',cat:'com',area:'Padur',       street:'Old Mahabalipuram Road',lat:12.831,lon:80.226},
  {n:'L&T Infotech Chennai',   cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.901,lon:80.225,a:['LTIMindtree Chennai','LnT Infotech']},
  {n:'Tech Mahindra Chennai',  cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.227,a:['Tech Mahindra Sholinganallur']},
  {n:'Hexaware Technologies',  cat:'com',area:'Sholinganallur',street:'100 Feet Road',       lat:12.900,lon:80.229},
  {n:'Mphasis Chennai',        cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.899,lon:80.225},
  {n:'Sutherland Global Chennai',cat:'com',area:'Sholinganallur',street:'OMR',              lat:12.900,lon:80.224,a:['Sutherland Global Services']},
  {n:'PayPal India Chennai',   cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.898,lon:80.226,a:['PayPal Chennai']},
  {n:'DXC Technology Chennai', cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.898,lon:80.224},
  {n:'NTT Data Chennai',       cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.899,lon:80.228},
  {n:'Syntel India Chennai',   cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.225,a:['Syntel Chennai']},
  {n:'CGI Group Chennai',      cat:'com',area:'Taramani',      street:'Rajiv Gandhi Salai',  lat:12.976,lon:80.239},
  {n:'Unisys India Chennai',   cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.899,lon:80.226},
  {n:'Verizon Data Services Chennai',cat:'com',area:'Sholinganallur',street:'OMR',           lat:12.901,lon:80.228,a:['Verizon Chennai']},
  {n:'Virtusa Chennai',        cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.225},
  {n:'KPMG Chennai',           cat:'com',area:'Nungambakkam',  street:'Shafee Mohammed Road',lat:13.059,lon:80.248},
  {n:'Deloitte Chennai',       cat:'com',area:'Guindy',        street:'Anna Salai',          lat:13.006,lon:80.218},
  {n:'PwC Chennai',            cat:'com',area:'Nungambakkam',  street:'Nungambakkam High Road',lat:13.060,lon:80.247},
  {n:'EY Chennai',             cat:'com',area:'Anna Salai',    street:'Mount Road',          lat:13.063,lon:80.253},
  {n:'Ford India Chennai HQ',  cat:'com',area:'Nungambakkam',  street:'Nungambakkam High Road',lat:13.058,lon:80.247,a:['Ford India']},
  {n:'Hyundai Motor India Chennai',cat:'com',area:'Nungambakkam',street:'Nungambakkam High Road',lat:13.058,lon:80.247,a:['Hyundai India']},
  {n:'Samsung India Chennai',  cat:'com',area:'Sriperumbudur', street:'NH 48',               lat:12.968,lon:79.944,a:['Samsung Chennai']},
  {n:'Nokia India Chennai',    cat:'com',area:'Sriperumbudur', street:'NH 48',               lat:12.965,lon:79.950,a:['Nokia Chennai']},
  {n:'Kone Elevator India',    cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.228},
  {n:'Sundaram Finance Chennai',cat:'com',area:'Anna Salai',   street:'Anna Salai',          lat:13.062,lon:80.252},
  {n:'Cholamandalam Investment',cat:'com',area:'Nungambakkam', street:'Nungambakkam High Road',lat:13.058,lon:80.248,a:['Chola Finance']},
  {n:'Shriram Finance Chennai',cat:'com',area:'Nungambakkam',  street:'Nungambakkam High Road',lat:13.059,lon:80.247,a:['Shriram Capital']},
  {n:'Murugappa Group HQ',     cat:'com',area:'Nungambakkam',  street:'Nungambakkam High Road',lat:13.058,lon:80.249,a:['EID Parry']},
  {n:'TVS Motor Company Chennai',cat:'com',area:'Ambattur',    street:'NH 48',               lat:13.114,lon:80.155,a:['TVS Motors']},
  {n:'Ashok Leyland Chennai',  cat:'com',area:'Ennore',        street:'Ennore Expressway',   lat:13.213,lon:80.310},
  {n:'MRF Tyres Chennai',      cat:'com',area:'Tiruvottiyur',  street:'Tiruvottiyur High Road',lat:13.162,lon:80.300,a:['MRF Limited']},
  {n:'Redington India',        cat:'com',area:'Perungudi',     street:'Old Mahabalipuram Road',lat:12.960,lon:80.243},
  {n:'Flextronics India Chennai',cat:'com',area:'Sriperumbudur',street:'NH 48',              lat:12.964,lon:79.949,a:['Flex Ltd Chennai']},
  {n:'Saint-Gobain India',     cat:'com',area:'Sriperumbudur', street:'NH 48',               lat:12.968,lon:79.943},
  {n:'GE India Chennai',       cat:'com',area:'Perungudi',     street:'OMR',                 lat:12.962,lon:80.244,a:['GE Digital India']},
  {n:'Fujitsu India Chennai',  cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.901,lon:80.226},
  {n:'CSS Corp Chennai',       cat:'com',area:'Sholinganallur',street:'OMR',                 lat:12.900,lon:80.225,a:['CSS Corp']},
  {n:'Sify Technologies Chennai',cat:'com',area:'Sholinganallur',street:'OMR',              lat:12.898,lon:80.226,a:['Sify Chennai']},
  {n:'TVH Business Park',      cat:'itp',area:'Velachery',     street:'Velachery Main Road', lat:12.979,lon:80.220,a:['TVH Business Hub']},
  {n:'Estancia IT Park',       cat:'itp',area:'Padur',         street:'Old Mahabalipuram Road',lat:12.831,lon:80.226},
  {n:'Cyber Gateway Chennai',  cat:'itp',area:'OMR',           street:'Old Mahabalipuram Road',lat:12.895,lon:80.225},
  {n:'AM Tech Park',           cat:'itp',area:'Ambattur',      street:'Sri Ram Nagar',       lat:13.114,lon:80.156},
  {n:'Rayala Techno Park',     cat:'itp',area:'Ambattur',      street:'Ambattur IE Road',    lat:13.114,lon:80.155},
  {n:'KG IT Park',             cat:'itp',area:'Anna Nagar',    street:'Anna Nagar 2nd Avenue',lat:13.091,lon:80.214},
  {n:'Prince Info City',       cat:'itp',area:'Anna Nagar',    street:'Poonamallee High Road',lat:13.088,lon:80.214,a:['Prince IT Park']},
  {n:'Navins IT Park',         cat:'itp',area:'Mogappair',     street:'Mogappair West Main', lat:13.082,lon:80.186},
  {n:'GRT IT Towers',          cat:'itp',area:'Velachery',     street:'Velachery Main Road', lat:12.979,lon:80.220},
  {n:'Tidal Park Phase 2',     cat:'itp',area:'Taramani',      street:'Rajiv Gandhi Salai',  lat:12.973,lon:80.237,a:['Tidel Park 2']},
  {n:'Tecci Park',             cat:'itp',area:'Sholinganallur',street:'100 Feet Road',       lat:12.903,lon:80.230},
  {n:'Lakshmi Infocity',       cat:'itp',area:'Perungudi',     street:'OMR',                 lat:12.960,lon:80.243},
  {n:'Chennai One SEZ',        cat:'itp',area:'Sholinganallur',street:'Old Mahabalipuram Road',lat:12.900,lon:80.226},
  {n:'VBC Ferro Alloys IT Park',cat:'itp',area:'Taramani',     street:'Rajiv Gandhi Salai',  lat:12.977,lon:80.238},
  // ── REMAINING METRO STATIONS (Phase 2) ───────────────────────────────────
  {n:'Porur Metro Station',    cat:'met',area:'Porur',         street:'Porur Main Road',     lat:13.036,lon:80.157,a:['Porur Metro']},
  {n:'Poonamallee High Road Metro',cat:'met',area:'Poonamallee',street:'Poonamallee High Road',lat:13.049,lon:80.132,a:['Poonamallee Metro']},
  {n:'Nerkundram Metro Station',cat:'met',area:'Nerkundram',   street:'NH 48',               lat:13.050,lon:80.175,a:['Nerkundram Metro']},
  {n:'Maduravoyal Metro',      cat:'met',area:'Maduravoyil',   street:'Poonamallee High Road',lat:13.065,lon:80.172,a:['Maduravoyal Metro Station']},
  {n:'Kattupakkam Metro',      cat:'met',area:'Poonamallee',   street:'Poonamallee High Road',lat:13.055,lon:80.149,a:['Kattupakkam Metro Station']},
  {n:'Sidco Nagar Metro',      cat:'met',area:'Ambattur',      street:'Ambattur IE Road',    lat:13.108,lon:80.167,a:['Sidco Metro']},
  {n:'Thiruverkadu Metro',     cat:'met',area:'Avadi',         street:'Poonamallee High Road',lat:13.075,lon:80.124,a:['Thiruverkadu Metro Station']},
  {n:'Moulivakkam Metro',      cat:'met',area:'Porur',         street:'Porur-Kundrathur Road',lat:13.029,lon:80.163,a:['Moulivakkam Metro Station']},
  {n:'Anakaputhur Metro',      cat:'met',area:'Anakaputhur',   street:'GST Road',            lat:12.998,lon:80.187,a:['Anakaputhur Metro Station']},
  {n:'Poonamallee Metro Terminus',cat:'met',area:'Poonamallee',street:'Poonamallee High Road',lat:13.045,lon:80.118},
  {n:'St Thomas Mount Metro Station',cat:'met',area:'St Thomas Mount',street:'GST Road',     lat:13.003,lon:80.207,a:['Arignar Anna Alandur Metro']},
  {n:'Perungalathur Metro',    cat:'met',area:'Perungalathur', street:'GST Road',            lat:12.892,lon:80.080,a:['Perungalathur Metro Station']},
  {n:'Vandalur Metro',         cat:'met',area:'Vandalur',      street:'GST Road',            lat:12.891,lon:80.080,a:['Vandalur Metro Station']},
  {n:'Chromepet Metro',        cat:'met',area:'Chromepet',     street:'GST Road',            lat:12.951,lon:80.141,a:['Chrompet Metro Station']},
  {n:'Pallavaram Metro',       cat:'met',area:'Pallavaram',    street:'GST Road',            lat:12.968,lon:80.150,a:['Pallavaram Metro Station']},
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const data    = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const existing = new Set(data.pois.map(p => p.n.toLowerCase()));
  const startCount = data.pois.length;
  let osmAdded = 0, curatedAdded = 0;

  function addIfNew(p) {
    if (!p.n || p.n.length < 3) return false;
    const key = p.n.toLowerCase();
    if (existing.has(key)) return false;
    existing.add(key);
    data.pois.push(p);
    return true;
  }

  // ── 1. OSM Overpass expansion ───────────────────────────────────────────
  console.log('\n═══ Phase 1: OSM expansion ═══');
  for (let i = 0; i < OSM_QUERIES.length; i++) {
    const q = OSM_QUERIES[i];
    console.log(`[${i+1}/${OSM_QUERIES.length}] ${q.label}`);
    let raw;
    for (let att = 0; att < 3; att++) {
      try { raw = await postOverpass(q.ql); break; }
      catch (e) { console.warn(`  retry ${att+1}: ${e.message}`); await sleep(4000); }
    }
    if (!raw || !raw.elements) { console.warn('  SKIPPED'); continue; }

    let n = 0;
    for (const el of raw.elements) {
      const tags = el.tags || {};
      const name = (tags.name || '').trim();
      if (!name || name.length < 3) continue;
      const lat  = el.type === 'node' ? el.lat : (el.center ? el.center.lat : null);
      const lon  = el.type === 'node' ? el.lon : (el.center ? el.center.lon : null);
      if (!lat || !lon) continue;
      const cat    = q.cat || osmCat(tags);
      const area   = tags['addr:suburb'] || tags['addr:neighbourhood'] || getArea(lat, lon);
      const street = tags['addr:street'] || '';
      const p = { n: name, cat, area,
        lat: Math.round(lat * 10000) / 10000,
        lon: Math.round(lon * 10000) / 10000 };
      if (street) p.street = street;
      const aa = [];
      for (const k of ['alt_name', 'short_name', 'loc_name']) {
        if (tags[k] && tags[k] !== name) aa.push(tags[k]);
      }
      if (aa.length) p.a = aa;
      if (addIfNew(p)) n++;
    }
    osmAdded += n;
    console.log(`  → +${n} added | total: ${data.pois.length}`);
    if (i < OSM_QUERIES.length - 1) await sleep(PAUSE);
  }

  // ── 2. Curated apartment / company / metro additions ───────────────────
  console.log('\n═══ Phase 2: Curated entries ═══');
  for (const p of CURATED) {
    if (addIfNew(p)) curatedAdded++;
  }
  console.log(`Curated added: ${curatedAdded}`);

  // ── 3. Save ─────────────────────────────────────────────────────────────
  data.meta.count = data.pois.length;
  data.meta.built = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(OUT, JSON.stringify(data));

  const sizeMB = (fs.statSync(OUT).size / 1_048_576).toFixed(2);
  console.log(`\n✅ Done!`);
  console.log(`   Before : ${startCount.toLocaleString()}`);
  console.log(`   OSM+   : +${osmAdded.toLocaleString()}`);
  console.log(`   Curated: +${curatedAdded}`);
  console.log(`   Total  : ${data.pois.length.toLocaleString()} POIs`);
  console.log(`   File   : ${sizeMB} MB`);
}

main().catch(err => { console.error(err); process.exit(1); });
