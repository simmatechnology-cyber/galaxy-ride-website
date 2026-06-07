/**
 * expand2-chennai-db.js
 * Second expansion pass — retries failed queries + adds new categories
 */
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const OUT  = path.resolve(__dirname, '../data/chennai-pois-large.json');
const BBOX = '12.60,79.90,13.35,80.42';

// ──────────────────────────────────────────────
// Area lookup
// ──────────────────────────────────────────────
const AREA_BOXES = [
  {name:'Tiruvottiyur',b:[13.140,80.285,13.195,80.330]},{name:'Madhavaram',b:[13.130,80.215,13.165,80.260]},
  {name:'Kolathur',b:[13.105,80.193,13.135,80.220]},{name:'Perambur',b:[13.100,80.225,13.140,80.260]},
  {name:'Royapuram',b:[13.095,80.275,13.130,80.315]},{name:'Villivakkam',b:[13.095,80.190,13.120,80.220]},
  {name:'Avadi',b:[13.080,80.075,13.145,80.120]},{name:'Ambattur',b:[13.095,80.130,13.140,80.175]},
  {name:'Mogappair',b:[13.070,80.165,13.100,80.205]},{name:'Anna Nagar',b:[13.070,80.195,13.105,80.230]},
  {name:'Shenoy Nagar',b:[13.080,80.215,13.095,80.230]},{name:'Aminjikarai',b:[13.075,80.225,13.093,80.245]},
  {name:'Koyambedu',b:[13.060,80.182,13.080,80.205]},{name:'Vadapalani',b:[13.038,80.200,13.067,80.225]},
  {name:'KK Nagar',b:[13.040,80.185,13.065,80.202]},{name:'Egmore',b:[13.065,80.255,13.090,80.278]},
  {name:'Kilpauk',b:[13.070,80.235,13.095,80.255]},{name:'Nungambakkam',b:[13.047,80.238,13.075,80.260]},
  {name:'T Nagar',b:[13.028,80.220,13.055,80.250]},{name:'Alwarpet',b:[13.022,80.248,13.042,80.268]},
  {name:'Mylapore',b:[13.024,80.260,13.047,80.280]},{name:'Saidapet',b:[13.005,80.218,13.030,80.242]},
  {name:'Guindy',b:[12.990,80.200,13.025,80.235]},{name:'Adyar',b:[12.990,80.245,13.020,80.275]},
  {name:'Besant Nagar',b:[12.980,80.258,13.010,80.282]},{name:'Thiruvanmiyur',b:[12.966,80.247,12.995,80.270]},
  {name:'Taramani',b:[12.960,80.228,12.988,80.250]},{name:'Velachery',b:[12.960,80.200,12.994,80.230]},
  {name:'Alandur',b:[12.990,80.193,13.015,80.220]},{name:'Nanganallur',b:[12.970,80.185,12.995,80.212]},
  {name:'Perungudi',b:[12.946,80.230,12.975,80.258]},{name:'Porur',b:[13.018,80.140,13.058,80.175]},
  {name:'Pallavaram',b:[12.950,80.130,12.985,80.165]},{name:'Chromepet',b:[12.934,80.130,12.960,80.162]},
  {name:'Tambaram',b:[12.895,80.080,12.940,80.118]},{name:'Sholinganallur',b:[12.882,80.212,12.920,80.248]},
  {name:'Thoraipakkam',b:[12.918,80.225,12.950,80.250]},{name:'Medavakkam',b:[12.920,80.182,12.958,80.210]},
  {name:'Pallikaranai',b:[12.912,80.195,12.948,80.228]},{name:'Perumbakkam',b:[12.905,80.190,12.940,80.215]},
  {name:'Navalur',b:[12.835,80.210,12.875,80.240]},{name:'Siruseri',b:[12.820,80.210,12.860,80.240]},
  {name:'Kelambakkam',b:[12.800,80.205,12.840,80.235]},{name:'Neelankarai',b:[12.928,80.244,12.960,80.262]},
  {name:'Palavakkam',b:[12.905,80.244,12.935,80.264]},{name:'Injambakkam',b:[12.878,80.240,12.912,80.262]},
  {name:'Kovalam',b:[12.800,80.200,12.840,80.248]},{name:'Mahabalipuram',b:[12.608,80.170,12.660,80.210]},
  {name:'ECR',b:[12.800,80.240,13.000,80.290]},{name:'OMR',b:[12.800,80.195,13.000,80.240]},
  {name:'GST Road',b:[12.800,80.080,13.010,80.135]},{name:'Poonamallee',b:[13.020,80.090,13.070,80.140]},
  {name:'Pammal',b:[12.960,80.150,12.995,80.185]},{name:'Urapakkam',b:[12.870,80.075,12.910,80.110]},
];
function getArea(lat, lon) {
  for (const a of AREA_BOXES)
    if (lat >= a.b[0] && lon >= a.b[1] && lat <= a.b[2] && lon <= a.b[3]) return a.name;
  if (lat > 13.08) return lon > 80.24 ? 'North Chennai' : 'Northwest Chennai';
  if (lat > 13.00) return lon > 80.24 ? 'Central Chennai' : 'West Chennai';
  return lon > 80.20 ? 'OMR' : 'Tambaram';
}

// ──────────────────────────────────────────────
// Overpass POST helper (3 retries)
// ──────────────────────────────────────────────
function post(ql) {
  return new Promise((resolve, reject) => {
    const body = 'data=' + encodeURIComponent(ql);
    const req = https.request({
      hostname: 'overpass-api.de', path: '/api/interpreter', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded',
                 'Content-Length': Buffer.byteLength(body),
                 'User-Agent': 'GalaxyRide/1.0' },
      timeout: 120000,
    }, r => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const txt = Buffer.concat(chunks).toString();
        if (txt.trimStart().startsWith('<')) { reject(new Error('XML error response')); return; }
        try { resolve(JSON.parse(txt)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body); req.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ──────────────────────────────────────────────
// Merge query results into existing DB
// ──────────────────────────────────────────────
async function runQuery(label, ql, cat) {
  process.stdout.write(`  ${label} ... `);
  let data;
  for (let i = 0; i < 3; i++) {
    try { data = await post(ql); break; }
    catch (e) { process.stdout.write(`[retry ${i+1}] `); await sleep(5000); }
  }
  if (!data || !data.elements) { console.log('SKIPPED'); return 0; }

  const db    = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const existing = new Set(db.pois.map(p => p.n.toLowerCase()));
  let added = 0;

  for (const el of data.elements) {
    const tags = el.tags || {};
    const name = (tags.name || '').trim();
    if (!name || name.length < 3) continue;
    const lat = el.type === 'node' ? el.lat : (el.center ? el.center.lat : null);
    const lon = el.type === 'node' ? el.lon : (el.center ? el.center.lon : null);
    if (!lat || !lon) continue;
    const key = name.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    const area   = tags['addr:suburb'] || tags['addr:neighbourhood'] || getArea(lat, lon);
    const street = tags['addr:street'] || '';
    const p = { n: name, cat, area,
                lat: Math.round(lat * 10000) / 10000,
                lon: Math.round(lon * 10000) / 10000 };
    if (street) p.street = street;
    db.pois.push(p);
    added++;
  }
  db.meta.count = db.pois.length;
  db.meta.built = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(OUT, JSON.stringify(db));
  const mb = (fs.statSync(OUT).size / 1048576).toFixed(2);
  console.log(`+${added} | total: ${db.pois.length} | ${mb} MB`);
  return added;
}

// ──────────────────────────────────────────────
// All queries
// ──────────────────────────────────────────────
async function main() {
  console.log('\n═══ Retry pass + new categories ═══\n');

  // 1. Bus stops (individual stops, high volume)
  await runQuery('Bus stops (highway=bus_stop)',
    `[out:json][timeout:90];node["highway"="bus_stop"]["name"](${BBOX});out tags;`, 'bus');
  await sleep(3000);

  // 2. Named neighbourhood / suburb places
  await runQuery('Named places (neighbourhood/suburb)',
    `[out:json][timeout:90];node["place"~"^(neighbourhood|suburb|quarter|locality|hamlet)$"]["name"](${BBOX});out tags;`, 'lmk');
  await sleep(3000);

  // 3. ATMs
  await runQuery('ATMs',
    `[out:json][timeout:90];node["amenity"="atm"]["name"](${BBOX});out tags;`, 'com');
  await sleep(3000);

  // 4. Banks (ways)
  await runQuery('Banks (ways)',
    `[out:json][timeout:90];way["amenity"="bank"]["name"](${BBOX});out center tags;`, 'com');
  await sleep(3000);

  // 5. Parks & gardens
  await runQuery('Parks and gardens',
    `[out:json][timeout:90];(node["leisure"~"^(park|garden|playground)$"]["name"](${BBOX});way["leisure"~"^(park|garden|playground)$"]["name"](${BBOX}););out center tags;`, 'lmk');
  await sleep(3000);

  // 6. Sports centres & stadiums
  await runQuery('Sports centres and stadiums',
    `[out:json][timeout:90];(node["leisure"~"^(sports_centre|stadium|swimming_pool|fitness_centre)$"]["name"](${BBOX});way["leisure"~"^(sports_centre|stadium|swimming_pool|fitness_centre)$"]["name"](${BBOX}););out center tags;`, 'lmk');
  await sleep(3000);

  // 7. Fuel stations (petrol bunks)
  await runQuery('Fuel / petrol bunks',
    `[out:json][timeout:90];(node["amenity"="fuel"]["name"](${BBOX});way["amenity"="fuel"]["name"](${BBOX}););out center tags;`, 'lmk');
  await sleep(3000);

  // 8. Pharmacies
  await runQuery('Pharmacies / medical stores',
    `[out:json][timeout:90];(node["amenity"="pharmacy"]["name"](${BBOX});way["amenity"="pharmacy"]["name"](${BBOX}););out center tags;`, 'hop');
  await sleep(3000);

  // 9. Named waterways / lakes / tanks
  await runQuery('Waterways (rivers, lakes, tanks)',
    `[out:json][timeout:90];(way["waterway"]["name"](${BBOX});way["natural"="water"]["name"](${BBOX});node["natural"~"^(water|spring|bay)$"]["name"](${BBOX}););out center tags;`, 'lmk');
  await sleep(3000);

  // 10. Named residential buildings (building=residential/apartments + name)
  await runQuery('Residential buildings (OSM)',
    `[out:json][timeout:90];way["building"~"^(residential|apartments|house|bungalow|detached|terrace)$"]["name"](${BBOX});out center tags;`, 'apt');
  await sleep(3000);

  // 11. Named industrial/commercial buildings
  await runQuery('Industrial / commercial buildings',
    `[out:json][timeout:90];way["building"~"^(industrial|commercial|warehouse|factory|office)$"]["name"](${BBOX});out center tags;`, 'com');
  await sleep(3000);

  // 12. Named tourism spots
  await runQuery('Tourism / attractions',
    `[out:json][timeout:90];(node["tourism"]["name"](${BBOX});way["tourism"]["name"](${BBOX}););out center tags;`, 'lmk');
  await sleep(3000);

  // 13. Supermarkets / hypermarkets
  await runQuery('Supermarkets and hypermarkets',
    `[out:json][timeout:90];(node["shop"~"^(supermarket|hypermarket|department_store|mall)$"]["name"](${BBOX});way["shop"~"^(supermarket|hypermarket|department_store|mall)$"]["name"](${BBOX}););out center tags;`, 'mal');
  await sleep(3000);

  // 14. More restaurants / fast food
  await runQuery('Restaurants and fast food',
    `[out:json][timeout:90];(node["amenity"~"^(restaurant|fast_food|food_court|cafe)$"]["name"](${BBOX});way["amenity"~"^(restaurant|fast_food|food_court|cafe)$"]["name"](${BBOX}););out center tags;`, 'rst');
  await sleep(3000);

  // 15. Named gates / entrances (useful for apartment entry points)
  await runQuery('Named gates and entrances',
    `[out:json][timeout:90];node["barrier"~"^(gate|toll_booth)$"]["name"](${BBOX});out tags;`, 'lmk');
  await sleep(3000);

  // 16. Named bridges
  await runQuery('Named bridges',
    `[out:json][timeout:90];way["bridge"]["name"](${BBOX});out center tags;`, 'lmk');
  await sleep(3000);

  // Final stats
  const final = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const mb = (fs.statSync(OUT).size / 1048576).toFixed(2);
  console.log('\n✅ All done!');
  console.log('   Total  :', final.meta.count, 'POIs');
  console.log('   Size   :', mb, 'MB');

  // Category breakdown
  const cats = {};
  for (const p of final.pois) cats[p.cat] = (cats[p.cat] || 0) + 1;
  console.log('\nCategory breakdown:');
  Object.entries(cats).sort((a,b) => b[1]-a[1]).forEach(([c,n]) => console.log(`  ${c}: ${n}`));
}

main().catch(console.error);
