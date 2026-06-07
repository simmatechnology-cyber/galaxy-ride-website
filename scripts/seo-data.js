/* ============================================================
   GALAXY RIDE — SEO DATA
   Single source of truth for the SEO page generator.
   Edit here, then run:  node scripts/generate-seo.js
   ============================================================ */

const SITE = {
  name:    'Galaxy Ride',
  baseUrl: 'https://galaxyride.in',
  phone:   '+91 9597815889',
  phoneRaw:'919597815889',
  email:   'support@galaxyride.in',
  insta:   'https://www.instagram.com/galaxyride.ind.cabs/',
  address: 'Nungambakkam, Chennai - 600034, Tamil Nadu, India',
  region:  'South India',
};

// ── Cities (22) — slug, name, state, airport flag ─────────────────────────
const CITIES = [
  { slug: 'chennai',      name: 'Chennai',      state: 'Tamil Nadu',      airport: 'Chennai International Airport (MAA)' },
  { slug: 'madurai',      name: 'Madurai',      state: 'Tamil Nadu',      airport: 'Madurai Airport (IXM)' },
  { slug: 'coimbatore',   name: 'Coimbatore',   state: 'Tamil Nadu',      airport: 'Coimbatore International Airport (CJB)' },
  { slug: 'trichy',       name: 'Trichy',       state: 'Tamil Nadu',      airport: 'Tiruchirappalli International Airport (TRZ)' },
  { slug: 'salem',        name: 'Salem',        state: 'Tamil Nadu',      airport: 'Salem Airport (SXV)' },
  { slug: 'erode',        name: 'Erode',        state: 'Tamil Nadu',      airport: null },
  { slug: 'theni',        name: 'Theni',        state: 'Tamil Nadu',      airport: null },
  { slug: 'dindigul',     name: 'Dindigul',     state: 'Tamil Nadu',      airport: null },
  { slug: 'tirunelveli',  name: 'Tirunelveli',  state: 'Tamil Nadu',      airport: null },
  { slug: 'thoothukudi',  name: 'Thoothukudi',  state: 'Tamil Nadu',      airport: 'Tuticorin Airport (TCR)' },
  { slug: 'nagercoil',    name: 'Nagercoil',    state: 'Tamil Nadu',      airport: null },
  { slug: 'kanyakumari',  name: 'Kanyakumari',  state: 'Tamil Nadu',      airport: null },
  { slug: 'bangalore',    name: 'Bangalore',    state: 'Karnataka',       airport: 'Kempegowda International Airport (BLR)' },
  { slug: 'mysore',       name: 'Mysore',       state: 'Karnataka',       airport: 'Mysore Airport (MYQ)' },
  { slug: 'mangalore',    name: 'Mangalore',    state: 'Karnataka',       airport: 'Mangalore International Airport (IXE)' },
  { slug: 'hyderabad',    name: 'Hyderabad',    state: 'Telangana',       airport: 'Rajiv Gandhi International Airport (HYD)' },
  { slug: 'vijayawada',   name: 'Vijayawada',   state: 'Andhra Pradesh',  airport: 'Vijayawada Airport (VGA)' },
  { slug: 'visakhapatnam',name: 'Visakhapatnam',state: 'Andhra Pradesh',  airport: 'Visakhapatnam Airport (VTZ)' },
  { slug: 'kochi',        name: 'Kochi',        state: 'Kerala',          airport: 'Cochin International Airport (COK)' },
  { slug: 'trivandrum',   name: 'Trivandrum',   state: 'Kerala',          airport: 'Trivandrum International Airport (TRV)' },
  { slug: 'kozhikode',    name: 'Kozhikode',    state: 'Kerala',          airport: 'Calicut International Airport (CCJ)' },
  { slug: 'pondicherry',  name: 'Pondicherry',  state: 'Puducherry',      airport: null },
];

// ── Services (per city) ────────────────────────────────────────────────────
const SERVICES = [
  { slug: 'airport-taxi',    name: 'Airport Taxi',          icon: '✈️', kw: 'airport taxi, airport transfer, airport pickup, airport drop, 24/7 airport cab' },
  { slug: 'one-way-taxi',    name: 'One Way Taxi',          icon: '➡️', kw: 'one way taxi, one way cab, drop taxi, single trip cab' },
  { slug: 'outstation-taxi', name: 'Outstation Taxi',       icon: '🛣️', kw: 'outstation taxi, outstation cab, intercity taxi, round trip cab' },
  { slug: 'hourly-rental',   name: 'Hourly Rental',         icon: '🕒', kw: 'hourly rental cab, package taxi, hourly cab, local rental' },
  { slug: 'premium-cab',     name: 'Premium Cab Service',   icon: '👑', kw: 'premium cab, luxury taxi, sedan service, SUV service, chauffeur service' },
  { slug: 'acting-driver',   name: 'Acting Driver Service', icon: '👨‍✈️', kw: 'acting driver, professional chauffeur, driver on hire, valet driver' },
];

// ── Stand-alone airport SEO pages ──────────────────────────────────────────
const AIRPORTS = [
  { slug: 'chennai-airport-taxi',     city: 'Chennai',     airport: 'Chennai International Airport (MAA)' },
  { slug: 'madurai-airport-taxi',     city: 'Madurai',     airport: 'Madurai Airport (IXM)' },
  { slug: 'coimbatore-airport-taxi',  city: 'Coimbatore',  airport: 'Coimbatore International Airport (CJB)' },
  { slug: 'trichy-airport-taxi',      city: 'Trichy',      airport: 'Tiruchirappalli International Airport (TRZ)' },
  { slug: 'bangalore-airport-taxi',   city: 'Bangalore',   airport: 'Kempegowda International Airport (BLR)' },
  { slug: 'hyderabad-airport-taxi',   city: 'Hyderabad',   airport: 'Rajiv Gandhi International Airport (HYD)' },
  { slug: 'kochi-airport-taxi',       city: 'Kochi',       airport: 'Cochin International Airport (COK)' },
];

// ── Popular routes (distance km, time, sedan fare estimate ₹) ──────────────
const ROUTES = [
  { from: 'Chennai',    to: 'Madurai',     km: 460, hrs: '8h',  fare: 6500, stops: 'Villupuram, Trichy, Dindigul' },
  { from: 'Madurai',    to: 'Chennai',     km: 460, hrs: '8h',  fare: 6500, stops: 'Dindigul, Trichy, Villupuram' },
  { from: 'Chennai',    to: 'Bangalore',   km: 350, hrs: '6h',  fare: 5200, stops: 'Vellore, Krishnagiri, Hosur' },
  { from: 'Bangalore',  to: 'Chennai',     km: 350, hrs: '6h',  fare: 5200, stops: 'Hosur, Krishnagiri, Vellore' },
  { from: 'Chennai',    to: 'Coimbatore',  km: 510, hrs: '9h',  fare: 7000, stops: 'Salem, Erode' },
  { from: 'Chennai',    to: 'Trichy',      km: 330, hrs: '5h 30m', fare: 4800, stops: 'Villupuram, Perambalur' },
  { from: 'Chennai',    to: 'Pondicherry', km: 160, hrs: '3h',  fare: 2800, stops: 'Mahabalipuram, Marakkanam' },
  { from: 'Madurai',    to: 'Rameswaram',  km: 175, hrs: '3h 30m', fare: 3000, stops: 'Ramanathapuram, Mandapam' },
  { from: 'Madurai',    to: 'Kodaikanal',  km: 115, hrs: '3h',  fare: 2600, stops: 'Batlagundu, Perumalmalai' },
  { from: 'Theni',      to: 'Madurai',     km: 75,  hrs: '1h 45m', fare: 1600, stops: 'Andipatti, Usilampatti' },
  { from: 'Theni',      to: 'Chennai',     km: 520, hrs: '9h',  fare: 7200, stops: 'Madurai, Trichy, Villupuram' },
  { from: 'Madurai',    to: 'Bangalore',   km: 430, hrs: '7h 30m', fare: 6200, stops: 'Dindigul, Salem, Hosur' },
  { from: 'Coimbatore', to: 'Bangalore',   km: 365, hrs: '7h',  fare: 5400, stops: 'Sathyamangalam, Chamarajanagar' },
  { from: 'Chennai',    to: 'Salem',       km: 340, hrs: '5h 45m', fare: 4900, stops: 'Vellore, Krishnagiri' },
  { from: 'Chennai',    to: 'Tirupati',    km: 135, hrs: '3h',  fare: 2600, stops: 'Sriperumbudur, Puttur' },
  { from: 'Chennai',    to: 'Vellore',     km: 140, hrs: '2h 45m', fare: 2500, stops: 'Sriperumbudur, Kanchipuram' },
];

// ── Hill station routes ────────────────────────────────────────────────────
const HILL_ROUTES = [
  { from: 'Chennai',    to: 'Ooty',        km: 555, hrs: '10h', fare: 7800, stops: 'Salem, Mettupalayam, Coonoor' },
  { from: 'Chennai',    to: 'Kodaikanal',  km: 535, hrs: '9h 30m', fare: 7500, stops: 'Trichy, Dindigul, Batlagundu' },
  { from: 'Madurai',    to: 'Kodaikanal',  km: 115, hrs: '3h',  fare: 2600, stops: 'Batlagundu, Perumalmalai' },
  { from: 'Coimbatore', to: 'Ooty',        km: 85,  hrs: '2h 30m', fare: 2200, stops: 'Mettupalayam, Coonoor' },
  { from: 'Bangalore',  to: 'Ooty',        km: 270, hrs: '6h',  fare: 4500, stops: 'Mysore, Bandipur, Gudalur' },
  { from: 'Madurai',    to: 'Munnar',      km: 160, hrs: '4h',  fare: 3400, stops: 'Theni, Bodinayakanur' },
  { from: 'Theni',      to: 'Munnar',      km: 80,  hrs: '2h 30m', fare: 2000, stops: 'Bodinayakanur, Chinnar' },
  { from: 'Madurai',    to: 'Thekkady',    km: 140, hrs: '3h 30m', fare: 3000, stops: 'Theni, Kumily' },
];

// ── Tourism (hill station / sightseeing taxi pages) ───────────────────────
const TOURISM = [
  { slug: 'kodaikanal-taxi',  name: 'Kodaikanal',  state: 'Tamil Nadu', desc: 'misty hill station with lakes, viewpoints and pine forests' },
  { slug: 'ooty-taxi',        name: 'Ooty',        state: 'Tamil Nadu', desc: 'the Queen of Hill Stations with tea gardens and a toy train' },
  { slug: 'yercaud-taxi',     name: 'Yercaud',     state: 'Tamil Nadu', desc: 'a serene coffee-scented hill retreat in the Shevaroy Hills' },
  { slug: 'munnar-taxi',      name: 'Munnar',      state: 'Kerala',     desc: 'rolling tea estates and misty mountains in Kerala' },
  { slug: 'thekkady-taxi',    name: 'Thekkady',    state: 'Kerala',     desc: 'wildlife, spice plantations and the Periyar Tiger Reserve' },
  { slug: 'valparai-taxi',    name: 'Valparai',    state: 'Tamil Nadu', desc: 'tea estates, waterfalls and 40 hairpin bends' },
  { slug: 'rameswaram-taxi',  name: 'Rameswaram',  state: 'Tamil Nadu', desc: 'sacred temples, the Pamban bridge and pristine beaches' },
  { slug: 'kanyakumari-taxi', name: 'Kanyakumari', state: 'Tamil Nadu', desc: 'the southern tip of India with sunrise and sunset views' },
  { slug: 'hogenakkal-taxi',  name: 'Hogenakkal',  state: 'Tamil Nadu', desc: 'the Niagara of India with coracle rides on the Kaveri' },
  { slug: 'courtallam-taxi',  name: 'Courtallam',  state: 'Tamil Nadu', desc: 'the Spa of South India famous for its medicinal waterfalls' },
  { slug: 'yelagiri-taxi',    name: 'Yelagiri',    state: 'Tamil Nadu', desc: 'a quiet hill station with orchards, lakes and trekking' },
  { slug: 'wayanad-taxi',     name: 'Wayanad',     state: 'Kerala',     desc: 'lush forests, waterfalls and wildlife in Kerala' },
];

// ── Service-only landing pages ─────────────────────────────────────────────
const SERVICE_PAGES = [
  { slug: 'one-way-taxi',        name: 'One Way Taxi',          icon: '➡️',  kw: 'one way taxi, one way cab, drop taxi, single trip taxi south india' },
  { slug: 'outstation-taxi',     name: 'Outstation Taxi',       icon: '🛣️',  kw: 'outstation taxi, intercity cab, round trip taxi, outstation cab booking' },
  { slug: 'airport-taxi',        name: 'Airport Taxi',          icon: '✈️',  kw: 'airport taxi, airport transfer, airport cab, 24/7 airport pickup' },
  { slug: 'hourly-rental',       name: 'Hourly Rental',         icon: '🕒',  kw: 'hourly rental cab, package taxi, local rental, hourly cab booking' },
  { slug: 'premium-cab-service', name: 'Premium Cab Service',   icon: '👑',  kw: 'premium cab, luxury taxi, chauffeur service, sedan and SUV service' },
  { slug: 'corporate-travel',    name: 'Corporate Travel',      icon: '💼',  kw: 'corporate taxi, business travel cab, employee transport, GST billing' },
  { slug: 'acting-driver',       name: 'Acting Driver Service', icon: '👨‍✈️', kw: 'acting driver, driver on hire, professional chauffeur, valet driver' },
  { slug: 'wedding-car-service', name: 'Wedding Car Service',   icon: '💒',  kw: 'wedding car, decorated cab, luxury wedding taxi, marriage car rental' },
  { slug: 'family-tour-taxi',    name: 'Family Tour Taxi',      icon: '👨‍👩‍👧‍👦', kw: 'family tour taxi, family trip cab, sightseeing taxi, tour package cab' },
];

// ── Premium trust points (E-E-A-T) ─────────────────────────────────────────
const TRUST_POINTS = [
  'No Hidden Charges', 'Transparent Pricing', 'Verified Drivers', 'Professional Chauffeurs',
  'South Indian Drivers', 'Tamil / Hindi / English Speaking Drivers', '24/7 Support', 'Airport Specialists',
  'Family Friendly', 'Corporate Friendly', 'Premium Sedan & SUV Service', 'Clean Vehicles', 'Safe Night Travel',
];

module.exports = { SITE, CITIES, SERVICES, AIRPORTS, ROUTES, HILL_ROUTES, TOURISM, SERVICE_PAGES, TRUST_POINTS };
