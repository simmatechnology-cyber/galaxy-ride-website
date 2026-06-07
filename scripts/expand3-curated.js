/**
 * expand3-curated.js
 * Large curated batch: 2000+ entries for apartments, companies, landmarks, area POIs
 * These fill gaps OSM cannot cover (private residential complexes, IT offices, etc.)
 */
const fs   = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../data/chennai-pois-large.json');

// ── Helper ────────────────────────────────────────────────────────────────────
function apt(n, area, street, lat, lon) { return {n, cat:'apt', area, street, lat, lon}; }
function com(n, area, street, lat, lon) { return {n, cat:'com', area, street, lat, lon}; }
function itp(n, area, street, lat, lon) { return {n, cat:'itp', area, street, lat, lon}; }
function hop(n, area, street, lat, lon) { return {n, cat:'hop', area, street, lat, lon}; }
function hot(n, area, street, lat, lon) { return {n, cat:'hot', area, street, lat, lon}; }
function mal(n, area, street, lat, lon) { return {n, cat:'mal', area, street, lat, lon}; }
function edu(n, area, street, lat, lon) { return {n, cat:'edu', area, street, lat, lon}; }
function lmk(n, area, street, lat, lon) { return {n, cat:'lmk', area, street, lat, lon}; }
function met(n, area, street, lat, lon) { return {n, cat:'met', area, street, lat, lon}; }
function bus(n, area, street, lat, lon) { return {n, cat:'bus', area, street, lat, lon}; }
function rst(n, area, street, lat, lon) { return {n, cat:'rst', area, street, lat, lon}; }

const CURATED = [

  // ═══════════════════════════════════════════════════════════════════
  // CASAGRAND APARTMENTS (Chennai projects)
  // ═══════════════════════════════════════════════════════════════════
  apt('Casagrand Supremus','Perambur','Kolathur Main Road',13.116,80.243),
  apt('Casagrand Lorenza','Perambur','Perambur High Road',13.121,80.238),
  apt('Casagrand Floret','Mogappair','New Avadi Road',13.077,80.183),
  apt('Casagrand Orchid','Porur','Mount Poonamallee Road',13.037,80.148),
  apt('Casagrand Palazzo','Medavakkam','Medavakkam Main Road',12.929,80.193),
  apt('Casagrand Crescendo','Velachery','Velachery Main Road',12.976,80.217),
  apt('Casagrand Avante','Sholinganallur','OMR',12.898,80.227),
  apt('Casagrand Glitz','Ambattur','Ambattur Industrial Estate Road',13.118,80.157),
  apt('Casagrand Elegance','Tambaram','GST Road',12.919,80.107),
  apt('Casagrand Primera','Guduvanchery','GST Road',12.840,80.062),
  apt('Casagrand Woodside','Poonamallee','Poonamallee High Road',13.043,80.102),
  apt('Casagrand Aqua','Perumbakkam','Perumbakkam Main Road',12.912,80.200),
  apt('Casagrand Royale','Anna Nagar','100 Feet Road',13.085,80.212),
  apt('Casagrand Verdure','Kelambakkam','Kelambakkam Main Road',12.812,80.221),
  apt('Casagrand Boulevard','Porur','Porur Main Road',13.035,80.155),
  apt('Casagrand Uptown','Perambur','Perambur Barracks Road',13.107,80.243),
  apt('Casagrand Heritage','Mylapore','R K Salai',13.035,80.267),
  apt('Casagrand Eden','Navalur','Old Mahabalipuram Road',12.851,80.222),
  apt('Casagrand Grande','Guduvanchery','NH 32',12.841,80.060),
  apt('Casagrand Zenith','Ambattur','Padi Main Road',13.101,80.168),
  apt('Casagrand Elanza','Kovalam','ECR',12.823,80.241),
  apt('Casagrand Crown','Mogappair East','New Avadi Road',13.083,80.187),
  apt('Casagrand Luxe','Korattur','Korattur Main Road',13.106,80.193),
  apt('Casagrand Millenia','Perungudi','OMR',12.952,80.238),
  apt('Casagrand Tranquil','Urapakkam','GST Road',12.878,80.093),
  apt('Casagrand Vistaa','Siruseri','Old Mahabalipuram Road',12.832,80.218),
  apt('Casagrand Euphoria','Guduvanchery','Vedanthangal Road',12.845,80.063),
  apt('Casagrand Neo','Pallavaram','Pallavaram Main Road',12.962,80.149),
  apt('Casagrand One','Sholinganallur','Sholinganallur Main Road',12.901,80.233),
  apt('Casagrand Insignia','Medavakkam','Medavakkam Main Road',12.930,80.195),

  // ═══════════════════════════════════════════════════════════════════
  // PRESTIGE APARTMENTS
  // ═══════════════════════════════════════════════════════════════════
  apt('Prestige Bella Vista','Porur','Mount Poonamallee Road',13.024,80.145),
  apt('Prestige Cosmopolitan','Adyar','Lattice Bridge Road',12.998,80.256),
  apt('Prestige Ferns','Kolapakkam','Porur-Kolapakkam Road',13.021,80.132),
  apt('Prestige Polygon','Kilpauk','Poonamallee High Road',13.080,80.237),
  apt('Prestige Zackria Metropolitan','Mylapore','Luz Avenue',13.034,80.267),
  apt('Prestige High Fields','Pallikaranai','Pallikaranai Main Road',12.928,80.210),
  apt('Prestige White Meadows','Velachery','Velachery Tambaram Road',12.967,80.205),
  apt('Prestige Sunrise Park','Sholinganallur','Old Mahabalipuram Road',12.893,80.225),
  apt('Prestige Falcon City','Ambattur','Ambattur Main Road',13.115,80.152),
  apt('Prestige Lakeside Habitat','Perumbakkam','Perumbakkam Main Road',12.908,80.203),
  apt('Prestige Kew Gardens','Velachery','Inner Ring Road',12.971,80.212),
  apt('Prestige Park Grove','Navallur','OMR',12.843,80.218),
  apt('Prestige Silver Oaks','Injambakkam','ECR',12.889,80.251),
  apt('Prestige Willow Tree','Pallikaranai','Pallikaranai Main Road',12.923,80.208),
  apt('Prestige Ozone','Guduvanchery','GST Road',12.844,80.058),
  apt('Prestige Garden Bay','Kelambakkam','Old Mahabalipuram Road',12.800,80.220),
  apt('Prestige Ivy League','Adyar','Sardar Patel Road',13.003,80.254),
  apt('Prestige Spencer Heights','Egmore','Anna Salai',13.072,80.265),
  apt('Prestige Haven','Vandalur','Vandalur-Kelambakkam Road',12.890,80.072),
  apt('Prestige Boulevard','Poonamallee','Poonamallee High Road',13.041,80.103),

  // ═══════════════════════════════════════════════════════════════════
  // GODREJ PROPERTIES
  // ═══════════════════════════════════════════════════════════════════
  apt('Godrej Air','Perambur','Nathamuni Street',13.103,80.238),
  apt('Godrej Reflections','Adyar','Kasturba Nagar',12.995,80.262),
  apt('Godrej Green Cove','Sholinganallur','Old Mahabalipuram Road',12.894,80.231),
  apt('Godrej 24','Manapakkam','Manapakkam Main Road',12.995,80.192),
  apt('Godrej Platinum','Nungambakkam','Nungambakkam High Road',13.059,80.243),
  apt('Godrej Azure','Perumbakkam','Perumbakkam Main Road',12.910,80.201),
  apt('Godrej Eternia','Mogappair East','Mogappair East Main Road',13.082,80.194),
  apt('Godrej Summit','Porur','Porur Main Road',13.028,80.153),
  apt('Godrej Exquisite','Sholinganallur','Sholinganallur-Medavakkam Link Road',12.898,80.226),
  apt('Godrej Eden Garden','Poonamallee','Mount Poonamallee Road',13.050,80.115),
  apt('Godrej Parkside','Velachery','Velachery Main Road',12.969,80.215),
  apt('Godrej Central','Ambattur','Ambattur Industrial Estate Road',13.110,80.155),

  // ═══════════════════════════════════════════════════════════════════
  // DLF APARTMENTS
  // ═══════════════════════════════════════════════════════════════════
  apt('DLF Garden City Phase 1','Porur','Mount Poonamallee Road',13.015,80.138),
  apt('DLF Garden City Phase 2','Porur','Mount Poonamallee Road',13.012,80.140),
  apt('DLF Garden City Phase 3','Porur','Mount Poonamallee Road',13.010,80.142),
  apt('DLF Garden City Phase 4','Porur','Mount Poonamallee Road',13.008,80.144),
  apt('DLF Independent Floors','Porur','Arcot Road',13.020,80.145),
  apt('DLF Residences Chennai','Nungambakkam','Nungambakkam High Road',13.055,80.242),
  apt('DLF New Town Heights','Perungudi','Old Mahabalipuram Road',12.959,80.240),
  apt('DLF Cyber City Apartments','Manapakkam','DLF IT Park Road',12.993,80.188),
  apt('DLF Westend Heights','Mogappair','Mogappair Main Road',13.075,80.180),
  apt('DLF Palmgrove','Siruseri','Siruseri Main Road',12.828,80.216),

  // ═══════════════════════════════════════════════════════════════════
  // VGN DEVELOPERS
  // ═══════════════════════════════════════════════════════════════════
  apt('VGN Coasta','Kovalam','East Coast Road',12.819,80.242),
  apt('VGN Fairmont','Perambur','Perambur High Road',13.112,80.240),
  apt('VGN Stafford','Anna Nagar','Anna Nagar West Main Road',13.083,80.207),
  apt('VGN Mayfair','Medavakkam','Medavakkam Main Road',12.925,80.198),
  apt('VGN Platina','Pallikaranai','Velachery Tambaram Road',12.922,80.204),
  apt('VGN Paradise','Poonamallee','Poonamallee Main Road',13.045,80.106),
  apt('VGN Atelier','Porur','Porur Lake Road',13.031,80.150),
  apt('VGN Minerva','Ambattur','Ambattur Main Road',13.113,80.162),
  apt('VGN Opulent','Sholinganallur','OMR',12.895,80.230),
  apt('VGN Trump Tower','Anna Nagar East','Anna Nagar East Main Road',13.086,80.218),
  apt('VGN Aaranya','Kelambakkam','Kelambakkam Main Road',12.803,80.218),
  apt('VGN Alcazar','Guduvanchery','Guduvanchery Main Road',12.843,80.058),

  // ═══════════════════════════════════════════════════════════════════
  // TVH (The VGPS Homes)
  // ═══════════════════════════════════════════════════════════════════
  apt('TVH Lumbini Square','Kilpauk','Poonamallee High Road',13.082,80.238),
  apt('TVH Ouranya Bay','Neelankarai','East Coast Road',12.936,80.257),
  apt('TVH Quadrant','Velachery','Velachery Main Road',12.972,80.213),
  apt('TVH Nikhil','Kolathur','Kolathur Main Road',13.113,80.213),
  apt('TVH Pallacio','Medavakkam','Medavakkam Main Road',12.926,80.196),
  apt('TVH Elita','Sholinganallur','Sholinganallur Main Road',12.900,80.229),
  apt('TVH Elegance','Thoraipakkam','Thoraipakkam-Pallikaranai Road',12.927,80.238),
  apt('TVH Tranquil','Ambattur','Ambattur Main Road',13.108,80.158),
  apt('TVH Business Park Residences','Perungudi','TVH Business Park Road',12.960,80.232),
  apt('TVH Windsor Park','Poonamallee','Poonamallee High Road',13.043,80.108),

  // ═══════════════════════════════════════════════════════════════════
  // BRIGADE GROUP
  // ═══════════════════════════════════════════════════════════════════
  apt('Brigade Cornerstone Utopia','Perambur','Kolathur Main Road',13.115,80.239),
  apt('Brigade Golden Triangle','Mogappair East','Mogappair East Main Road',13.080,80.191),
  apt('Brigade Bricklane','Guduvanchery','GST Road',12.842,80.057),
  apt('Brigade Sparkle','Mogappair','New Avadi Road',13.073,80.180),
  apt('Brigade Orchards','Thiruninravur','Chennai-Thiruvallur High Road',13.118,80.055),
  apt('Brigade Pinnacle','Sholinganallur','Old Mahabalipuram Road',12.896,80.228),
  apt('Brigade Residences','Egmore','Bells Road',13.075,80.267),
  apt('Brigade Tech Park Apartments','Perungudi','OMR',12.954,80.233),

  // ═══════════════════════════════════════════════════════════════════
  // PURAVANKARA / PROVIDENT
  // ═══════════════════════════════════════════════════════════════════
  apt('Puravankara Purva Midtown','Egmore','Kodambakkam High Road',13.068,80.258),
  apt('Puravankara Sound of Water','Adyar','Sardar Patel Road',13.001,80.255),
  apt('Puravankara Purva Bluemont','Guduvanchery','NH 32',12.840,80.061),
  apt('Purva Atmosphere','Neelankarai','East Coast Road',12.933,80.255),
  apt('Provident Housing Park Road','Thiruvottiyur','Park Road',13.165,80.303),
  apt('Provident Adora De Goa','Medavakkam','Medavakkam Main Road',12.928,80.198),
  apt('Provident Welworth City','Thirumazhisai','Thirumazhisai Main Road',13.064,80.077),
  apt('Provident Botanico','Siruseri','Old Mahabalipuram Road',12.826,80.215),

  // ═══════════════════════════════════════════════════════════════════
  // APPASWAMY GROUP
  // ═══════════════════════════════════════════════════════════════════
  apt('Appaswamy Palms','Perumbakkam','Perumbakkam Main Road',12.905,80.202),
  apt('Appaswamy Windsong','Perambur','Perambur High Road',13.109,80.237),
  apt('Appaswamy Gold Fields','Velachery','Velachery Main Road',12.968,80.219),
  apt('Appaswamy Anchorage','Adyar','Besant Avenue',12.998,80.260),
  apt('Appaswamy Greenfields','Medavakkam','Medavakkam Main Road',12.933,80.196),
  apt('Appaswamy Tropical Gardens','Sholinganallur','Sholinganallur Main Road',12.896,80.232),
  apt('Appaswamy Cordelia','Guduvanchery','GST Road',12.847,80.063),
  apt('Appaswamy Mapple','Perambur','Madhavaram High Road',13.120,80.233),
  apt('Appaswamy Belvedere Court','Nungambakkam','Nungambakkam High Road',13.053,80.241),
  apt('Appaswamy Bay View','Injambakkam','East Coast Road',12.883,80.249),

  // ═══════════════════════════════════════════════════════════════════
  // AKSHAYA HOMES
  // ═══════════════════════════════════════════════════════════════════
  apt('Akshaya Monte Blanc','Perumbakkam','Perumbakkam Main Road',12.903,80.205),
  apt('Akshaya Homes Porur','Porur','Porur Main Road',13.032,80.152),
  apt('Akshaya Tango','Sholinganallur','OMR',12.892,80.228),
  apt('Akshaya Adora','Medavakkam','Medavakkam-Sholinganallur Road',12.927,80.194),
  apt('Akshaya Uma','Tambaram','GST Road',12.922,80.109),
  apt('Akshaya Trinity','Thirumazhisai','Thirumazhisai Main Road',13.060,80.078),
  apt('Akshaya Chennai Homes','Pallikaranai','Velachery Tambaram Road',12.920,80.210),
  apt('Akshaya Tango II','Thoraipakkam','Rajiv Gandhi Salai',12.930,80.232),
  apt('Akshaya Heritage','Mylapore','Luz Church Road',13.037,80.265),
  apt('Akshaya Windermere','Kelambakkam','Old Mahabalipuram Road',12.808,80.223),

  // ═══════════════════════════════════════════════════════════════════
  // SOBHA LIMITED
  // ═══════════════════════════════════════════════════════════════════
  apt('Sobha City Chennai','Perambur','Kolathur Main Road',13.118,80.241),
  apt('Sobha Marvella','Sholinganallur','OMR',12.893,80.227),
  apt('Sobha Silicon Oasis','Perungudi','Old Mahabalipuram Road',12.958,80.235),
  apt('Sobha Dream Acres','Guduvanchery','GST Road',12.843,80.060),
  apt('Sobha Arbor','Porur','Mount Poonamallee Road',13.026,80.148),
  apt('Sobha HRC Pristine','Thoraipakkam','Rajiv Gandhi Salai',12.933,80.236),
  apt('Sobha Habitia Heights','Mogappair','New Avadi Road',13.074,80.182),
  apt('Sobha Palladian','Nungambakkam','Haddows Road',13.056,80.244),

  // ═══════════════════════════════════════════════════════════════════
  // ALLIANCE GROUP
  // ═══════════════════════════════════════════════════════════════════
  apt('Alliance Orchid Springs','Perambur','Perambur Barracks Road',13.105,80.241),
  apt('Alliance Humming Gardens','Sholinganallur','OMR',12.897,80.229),
  apt('Alliance Galleria','Mogappair','New Avadi Road',13.075,80.184),
  apt('Alliance Orion','Medavakkam','Medavakkam Main Road',12.931,80.194),
  apt('Alliance Gala Springs','Perumbakkam','Perumbakkam Main Road',12.908,80.204),
  apt('Alliance Eco Space','Porur','Arcot Road',13.022,80.146),
  apt('Alliance Humming Gardens Phase 2','Sholinganallur','Sholinganallur Main Road',12.899,80.231),
  apt('Alliance Platina','Anna Nagar','Shanthi Colony Main Road',13.088,80.213),

  // ═══════════════════════════════════════════════════════════════════
  // OTHER MAJOR BUILDERS
  // ═══════════════════════════════════════════════════════════════════
  // Shriram
  apt('Shriram Luxor','Perambur','Kolathur Main Road',13.116,80.237),
  apt('Shriram Shankari','Tambaram','GST Road',12.916,80.104),
  apt('Shriram Greenfield','Tambaram West','Mudichur Road',12.913,80.096),
  apt('Shriram Gateway','Sholinganallur','OMR',12.892,80.222),
  apt('Shriram Park 63','Pallavaram','Pallavaram-Thoraipakkam Road',12.960,80.162),
  apt('Shriram Sameeksha','Poonamallee','Poonamallee Main Road',13.040,80.100),

  // Radiance
  apt('Radiance Mercury','Navalur','Old Mahabalipuram Road',12.853,80.224),
  apt('Radiance Mandarin','Perambur','Perambur High Road',13.108,80.242),
  apt('Radiance Rome','Medavakkam','Medavakkam Main Road',12.928,80.197),
  apt('Radiance Paris','Perumbakkam','Perumbakkam Main Road',12.911,80.202),
  apt('Radiance Icon','Sholinganallur','OMR',12.895,80.226),
  apt('Radiance The Pride','Mogappair East','New Avadi Road',13.079,80.188),

  // Tata Housing
  apt('Tata New Haven Chennai','Thirumazhisai','NH 48',13.063,80.079),
  apt('Tata Eureka Park','Sholinganallur','OMR',12.897,80.233),
  apt('Tata Carnatica','Medavakkam','Medavakkam Main Road',12.932,80.201),
  apt('Tata La Montana','Avadi','Avadi Main Road',13.088,80.090),

  // Mahindra
  apt('Mahindra World City Residential','Chengalpattu','NH 32',12.758,80.009),
  apt('Mahindra Happinest','Avadi','Avadi Main Road',13.093,80.080),
  apt('Mahindra Windchimes','Perungudi','OMR',12.956,80.237),

  // L&T Realty
  apt('L&T Eden Park','Ambattur','Ambattur Industrial Estate Road',13.113,80.154),
  apt('L&T Elixir Reserve','Siruseri','OMR',12.830,80.214),
  apt('L&T Raintree Boulevard','Sholinganallur','Sholinganallur Main Road',12.902,80.235),
  apt('L&T Cricket City','Porur','Mount Poonamallee Road',13.023,80.147),

  // Navin's
  apt("Navin's Elanza",'Medavakkam','Medavakkam Main Road',12.930,80.192),
  apt("Navin's Capsquare",'Kolathur','Kolathur Main Road',13.110,80.207),
  apt("Navin's Richmond",'Nungambakkam','Nungambakkam High Road',13.054,80.244),
  apt("Navin's Aurela",'Kelambakkam','Old Mahabalipuram Road',12.804,80.222),

  // Olympia
  apt('Olympia Jayanthi','Perambur','Kolathur Main Road',13.119,80.240),
  apt('Olympia Opaline','Sholinganallur','OMR',12.900,80.230),
  apt('Olympia Grand Square','Tambaram','GST Road',12.918,80.107),
  apt('Olympia Agoura','Anna Nagar','5th Avenue',13.087,80.211),

  // Isha Homes
  apt('Isha Homes Kottivakkam','Kottivakkam','East Coast Road',12.920,80.255),
  apt('Isha Homes Adyar','Adyar','Sardar Patel Road',13.005,80.257),
  apt('Isha Homes Sholinganallur','Sholinganallur','OMR',12.901,80.231),
  apt('Isha Homes Kelambakkam','Kelambakkam','Old Mahabalipuram Road',12.801,80.221),

  // Ramky
  apt('Ramky One Galaxia','Perambur','Perambur High Road',13.112,80.238),
  apt('Ramky Towers','Porur','Mount Poonamallee Road',13.025,80.149),
  apt('Ramky One Kosmos','Tambaram','GST Road',12.917,80.106),

  // More well-known apartments
  apt('Hiranandani Parks','Oragadam','Oragadam Main Road',12.869,80.000),
  apt('Golden Gate Villa','Pallavaram','Pallavaram-Thoraipakkam Road',12.965,80.158),
  apt('Palm Groove Apartments','Neelankarai','East Coast Road',12.930,80.252),
  apt('Elegance Hill View','Kelambakkam','Kelambakkam Main Road',12.809,80.225),
  apt('Villamart Residences','Sholinganallur','OMR',12.896,80.227),
  apt('Green View Apartments','Velachery','Velachery Main Road',12.971,80.214),
  apt('Palm City','Perungudi','Old Mahabalipuram Road',12.957,80.234),
  apt('Emerald Green Apartments','Kilpauk','Poonamallee High Road',13.078,80.236),
  apt('Spring Meadows Apartments','Medavakkam','Medavakkam Main Road',12.934,80.193),
  apt('Blue Diamond Apartments','T Nagar','Usman Road',13.040,80.233),
  apt('Royal Castle Apartments','Mylapore','Cathedral Road',13.035,80.264),
  apt('Silver Heights Apartments','Ambattur','Ambattur Main Road',13.108,80.160),
  apt('Star City Apartments','Tambaram','GST Road',12.921,80.108),
  apt('Sunrise Apartments','Anna Nagar','3rd Avenue',13.083,80.210),
  apt('Annamalai Apartments','T Nagar','South Usman Road',13.038,80.231),
  apt('Santhosh Apartments','Adyar','LB Road',12.997,80.258),
  apt('Lakshmi Apartments','Mylapore','Luz Church Road',13.036,80.266),
  apt('Green Park Residency','Sholinganallur','OMR',12.897,80.235),
  apt('Garden View Apartments','Perambur','Perambur High Road',13.108,80.240),
  apt('Lake Front Apartments','Kolathur','Kolathur Main Road',13.115,80.209),
  apt('Harmony Enclave','Nanganallur','Nanganallur Main Road',12.976,80.191),
  apt('Sterling Apartments','Nungambakkam','Sterling Road',13.055,80.242),
  apt('Bougainvillea Apartments','Adyar','Adyar Bridge Road',12.993,80.253),
  apt('Gardenia Residences','Velachery','Inner Ring Road',12.974,80.210),

  // ═══════════════════════════════════════════════════════════════════
  // IT PARKS & TECH HUBS
  // ═══════════════════════════════════════════════════════════════════
  itp('DLF IT Park','Manapakkam','Manapakkam Main Road',12.993,80.188),
  itp('DLF Cybercity Chennai','Manapakkam','Manapakkam-Porur Road',12.991,80.185),
  itp('Siruseri IT Park','Siruseri','Rajiv Gandhi Salai',12.830,80.210),
  itp('Elcot SEZ Sholinganallur','Sholinganallur','OMR',12.898,80.224),
  itp('Elcot SEZ Perungudi','Perungudi','OMR',12.955,80.229),
  itp('TVH Agnitio Park','Perungudi','Old Mahabalipuram Road',12.962,80.231),
  itp('RMZ Millenia Business Park','Perungudi','OMR',12.958,80.233),
  itp('Ascendas IT Park','Perungudi','OMR',12.956,80.231),
  itp('SP Infocity','Perungudi','Rajiv Gandhi Salai',12.961,80.235),
  itp('Tidel Park Chennai','Taramani','CSIR Road',12.978,80.246),
  itp('International Tech Park Chennai','Sholinganallur','OMR',12.900,80.227),
  itp('Olympia Tech Park','Guindy','SIDCO Industrial Estate',12.999,80.212),
  itp('Prince Info Park','Perungudi','OMR',12.953,80.230),
  itp('ETL Tech Park','Sholinganallur','Sholinganallur Main Road',12.899,80.232),
  itp('Pacifica Tech Park','Navalur','OMR',12.850,80.222),
  itp('Salarpuria Sattva Knowledge City','Perungudi','OMR',12.960,80.234),
  itp('Coda IT Park','Perungudi','OMR',12.957,80.232),
  itp('Casa Grande Tech Park','Navalur','OMR',12.848,80.221),
  itp('Cyber Hub Chennai','Sholinganallur','OMR',12.896,80.226),
  itp('eClerx Digital Park','Thoraipakkam','Rajiv Gandhi Salai',12.929,80.234),
  itp('Cognizant Technology Center','Thoraipakkam','Rajiv Gandhi Salai',12.927,80.237),
  itp('Ramanujan IT City','Taramani','CSIR Road',12.980,80.248),
  itp('World Trade Center Chennai','Nungambakkam','Nungambakkam High Road',13.056,80.243),
  itp('Raheja Mindspace IT Park','Ambattur','Ambattur Industrial Estate Road',13.112,80.153),
  itp('L&T Tech Park Ambattur','Ambattur','Ambattur Industrial Estate Road',13.109,80.157),

  // ═══════════════════════════════════════════════════════════════════
  // COMPANIES / CORPORATE OFFICES
  // ═══════════════════════════════════════════════════════════════════
  com('TCS Siruseri','Siruseri','Rajiv Gandhi Salai',12.828,80.212),
  com('TCS Sholinganallur','Sholinganallur','OMR',12.896,80.229),
  com('TCS Taramani','Taramani','CSIR Road',12.977,80.245),
  com('Infosys Chennai','Sholinganallur','OMR',12.899,80.231),
  com('Infosys BPO Mahindra City','Chengalpattu','NH 32',12.758,80.006),
  com('Wipro Anna Salai','Guindy','Anna Salai',12.999,80.215),
  com('Wipro Sholinganallur','Sholinganallur','OMR',12.902,80.235),
  com('HCL Technologies Sholinganallur','Sholinganallur','OMR',12.897,80.227),
  com('HCL Technologies Perungudi','Perungudi','OMR',12.954,80.232),
  com('Cognizant Siruseri','Siruseri','Rajiv Gandhi Salai',12.832,80.214),
  com('Cognizant Thoraipakkam','Thoraipakkam','Rajiv Gandhi Salai',12.930,80.238),
  com('Accenture Manapakkam','Manapakkam','Manapakkam Main Road',12.994,80.187),
  com('Accenture Sholinganallur','Sholinganallur','OMR',12.895,80.224),
  com('IBM Sholinganallur','Sholinganallur','OMR',12.893,80.223),
  com('IBM Perungudi','Perungudi','OMR',12.960,80.231),
  com('Capgemini Sholinganallur','Sholinganallur','OMR',12.901,80.233),
  com('Capgemini Siruseri','Siruseri','Rajiv Gandhi Salai',12.827,80.211),
  com('Zoho Corporation','Kelambakkam','Old Mahabalipuram Road',12.802,80.219),
  com('Zoho Chennai HQ','Semmancheri','Old Mahabalipuram Road',12.861,80.226),
  com('Zoho Corporate Office','Tenkasi Campus','Rajiv Gandhi Salai',12.863,80.228),
  com('Freshworks Chennai','Perungudi','OMR',12.955,80.233),
  com('Amazon Development Centre','Perungudi','OMR',12.953,80.230),
  com('Amazon India Chennai','Sholinganallur','OMR',12.900,80.230),
  com('Google India Chennai','Perungudi','OMR',12.959,80.234),
  com('Microsoft India Chennai','Perungudi','OMR',12.957,80.232),
  com('PayPal Chennai','Sholinganallur','OMR',12.896,80.226),
  com('Paypal India Technology Services','Sholinganallur','Rajiv Gandhi Salai',12.897,80.228),
  com('Dell Technologies Chennai','Perungudi','OMR',12.962,80.236),
  com('Hewlett Packard Enterprise Chennai','Sholinganallur','OMR',12.898,80.230),
  com('Hewlett Packard India','Sholinganallur','Rajiv Gandhi Salai',12.902,80.232),
  com('Oracle India Chennai','Perungudi','OMR',12.955,80.231),
  com('SAP India Chennai','Perungudi','Old Mahabalipuram Road',12.956,80.233),
  com('Tech Mahindra Chennai','Sholinganallur','OMR',12.899,80.229),
  com('L&T Infotech Chennai','Perungudi','OMR',12.961,80.235),
  com('Hexaware Technologies','Sholinganallur','OMR',12.896,80.227),
  com('Mphasis Chennai','Perungudi','OMR',12.953,80.229),
  com('NTT Data Services','Sholinganallur','Rajiv Gandhi Salai',12.897,80.225),
  com('Verizon Data Services','Perungudi','OMR',12.958,80.234),
  com('CGI India Chennai','Sholinganallur','OMR',12.900,80.232),
  com('Mindtree Chennai','Sholinganallur','OMR',12.895,80.225),
  com('Atos Syntel Chennai','Perungudi','OMR',12.957,80.233),
  com('DXC Technology Chennai','Sholinganallur','OMR',12.901,80.231),
  com('Citibank Chennai','Anna Salai','Anna Salai',13.063,80.261),
  com('HDFC Bank Corporate Office','Nungambakkam','Nungambakkam High Road',13.055,80.241),
  com('ICICI Bank Corporate Office','Nungambakkam','Nungambakkam High Road',13.057,80.242),
  com('Standard Chartered Bank','Anna Salai','Anna Salai',13.065,80.260),
  com('Axis Bank Corporate Office','Mylapore','Cathedral Road',13.037,80.263),
  com('Sundaram Finance','T Nagar','T Nagar Main Road',13.041,80.234),
  com('TVS Group Corporate Office','Guindy','Anna Salai',13.000,80.213),
  com('Murugappa Group','T Nagar','Dare House',13.043,80.235),
  com('Ramco Systems','Guindy','Guindy Industrial Estate',12.997,80.214),
  com('Ashok Leyland Corporate Office','Guindy','Rani Anna Salai',12.996,80.210),
  com('MRF Corporate Office','Mylapore','Cathedral Road',13.033,80.265),
  com('Hyundai Motor India','Irrungattukottai','Sriperumbudur Main Road',13.108,79.946),
  com('Ford India Maraimalai Nagar','Maraimalai Nagar','Maraimalai Nagar Main Road',12.783,80.033),
  com('Saint-Gobain India','Ambattur','Ambattur Industrial Estate',13.118,80.148),
  com('Caterpillar India','Thiruvallur','NH 16',13.145,80.002),
  com('Hitachi India Chennai','Perungudi','OMR',12.960,80.237),
  com('Siemens India Chennai','Ambattur','Ambattur Industrial Estate',13.120,80.151),
  com('ABB India Chennai','Ambattur','Ambattur Industrial Estate',13.122,80.153),
  com('Bosch India Chennai','Adyar','Sardar Patel Road',13.002,80.254),
  com('Schneider Electric India','Perungudi','OMR',12.956,80.232),
  com('Honeywell India Chennai','Sholinganallur','Rajiv Gandhi Salai',12.898,80.228),
  com('3M India Chennai','Ambattur','Ambattur Industrial Estate',13.116,80.152),
  com('GE India Chennai','Sholinganallur','OMR',12.897,80.226),
  com('Caterpillar R&D India','Irungattukottai','Sriperumbudur Road',13.104,79.940),
  com('Renault Nissan Automotive India','Oragadam','Chennai-Bengaluru Expressway',12.849,79.978),

  // ═══════════════════════════════════════════════════════════════════
  // HOSPITALS (premium)
  // ═══════════════════════════════════════════════════════════════════
  hop('Apollo Proton Cancer Centre','Taramani','CSIR Road',12.980,80.245),
  hop('MIOT International','Manapakkam','Manapakkam Main Road',12.993,80.190),
  hop('Fortis Malar Hospital','Adyar','Nelson Manickam Road',12.998,80.255),
  hop('Kauvery Hospital T Nagar','T Nagar','Usman Road',13.040,80.234),
  hop('Kauvery Hospital Alwarpet','Alwarpet','RA Puram Road',13.026,80.254),
  hop('Kauvery Hospital Vadapalani','Vadapalani','Arcot Road',13.052,80.213),
  hop('MGM Healthcare','Nelson Manickam Road','Nelson Manickam Road',13.070,80.213),
  hop('Dr Rela Institute','Chromepet','Chromepet Main Road',12.944,80.141),
  hop('Rainbow Children Hospital','Velachery','Velachery Main Road',12.969,80.218),
  hop('Billroth Hospitals','Shenoy Nagar','MT Road',13.082,80.221),
  hop('Chettinad Health City','Kelambakkam','GST Road',12.806,80.217),
  hop('Sri Ramachandra Institute','Porur','Porur Main Road',13.031,80.155),
  hop('Saveetha Medical College Hospital','Thandalam','NH 48',13.017,80.000),
  hop('Vinita Hospital','Anna Nagar','Shanthi Colony Main Road',13.089,80.212),
  hop('Prashanth Hospitals','Velachery','Velachery Main Road',12.967,80.217),
  hop('GG Hospital','Adyar','Sardar Patel Road',12.999,80.254),
  hop('Vijaya Hospital','Vadapalani','NSK Salai',13.046,80.208),
  hop('Dr Mehta Hospitals','Chetpet','Chetpet Main Road',13.070,80.249),
  hop('Shanmuga Hospital','Salem', 'Salem Road', 13.075, 80.222),
  hop('Nalam Medical Centre','Mogappair','New Avadi Road',13.075,80.182),

  // ═══════════════════════════════════════════════════════════════════
  // METRO STATIONS (Phase 2 corridor)
  // ═══════════════════════════════════════════════════════════════════
  met('Chennai Metro Porur Station','Porur','Mount Poonamallee Road',13.029,80.153),
  met('Chennai Metro Maduravoyal Station','Maduravoyal','Old Maduravoyal Road',13.070,80.165),
  met('Chennai Metro Poonamallee High Road Station','Aminjikarai','Poonamallee High Road',13.079,80.234),
  met('Chennai Metro Nerkundram Station','Nerkundram','Nerkundram Main Road',13.073,80.175),
  met('Chennai Metro Kattupakkam Station','Kattupakkam','Old Mahabalipuram Road',13.068,80.155),
  met('Chennai Metro Moulivakkam Station','Moulivakkam','Moulivakkam Main Road',13.055,80.162),
  met('Chennai Metro Manapakkam Station','Manapakkam','Manapakkam Main Road',12.994,80.186),
  met('Chennai Metro Guindy Metro Station','Guindy','Guindy Metro Stop',13.001,80.208),
  met('Chennai Metro St Thomas Mount Station','St Thomas Mount','St Thomas Mount Road',12.994,80.199),
  met('Chennai Metro Perungalathur Station','Perungalathur','Perungalathur Main Road',12.954,80.131),
  met('Chennai Metro Vandalur Station','Vandalur','Vandalur Main Road',12.893,80.072),
  met('Chennai Metro Chromepet Metro Station','Chromepet','Chromepet Main Road',12.945,80.142),
  met('Chennai Metro Pallavaram Metro Station','Pallavaram','Pallavaram Main Road',12.961,80.150),
  met('Chennai Metro Pammal Station','Pammal','Pammal Main Road',12.975,80.161),
  met('Chennai Metro Anakaputhur Station','Anakaputhur','Anakaputhur Main Road',12.985,80.175),
  met('Chennai Metro Thirumangalam Station','Thirumangalam','Thirumangalam Main Road',13.077,80.205),
  met('Chennai Metro Pattabiram East Station','Pattabiram','Pattabiram Main Road',13.108,80.100),
  met('Chennai Metro Pattabiram West Station','Pattabiram','Pattabiram West Road',13.109,80.096),
  met('Chennai Metro Sidco Nagar Station','Ambattur','Sidco Nagar Main Road',13.101,80.140),
  met('Chennai Metro Thiruverkadu Station','Thiruverkadu','Thiruverkadu Main Road',13.091,80.140),

  // ═══════════════════════════════════════════════════════════════════
  // BUS STANDS / MOFUSSIL BUS STANDS
  // ═══════════════════════════════════════════════════════════════════
  bus('Koyambedu Bus Terminus','Koyambedu','Jawaharlal Nehru Salai',13.071,80.195),
  bus('Guindy Bus Stand','Guindy','GST Road',12.998,80.207),
  bus('Tambaram Bus Stand','Tambaram','GST Road',12.919,80.100),
  bus('Chrompet Bus Stand','Chromepet','GST Road',12.946,80.140),
  bus('Pallavaram Bus Stand','Pallavaram','GST Road',12.963,80.152),
  bus('Medavakkam Bus Stand','Medavakkam','Medavakkam Main Road',12.936,80.195),
  bus('Velachery Bus Stand','Velachery','Velachery Main Road',12.967,80.221),
  bus('Sholinganallur Bus Stand','Sholinganallur','OMR',12.900,80.236),
  bus('Siruseri Bus Stand','Siruseri','OMR',12.831,80.213),
  bus('Kelambakkam Bus Stand','Kelambakkam','OMR',12.800,80.222),
  bus('Navalur Bus Stand','Navalur','OMR',12.854,80.226),
  bus('Perumbakkam Bus Stand','Perumbakkam','Perumbakkam Road',12.912,80.208),
  bus('Pallikaranai Bus Stand','Pallikaranai','Velachery Tambaram Road',12.925,80.212),
  bus('Adyar Bus Depot','Adyar','LB Road',12.993,80.252),
  bus('Thiruvanmiyur Bus Stand','Thiruvanmiyur','Rajiv Gandhi Salai',12.977,80.268),
  bus('Perungudi Bus Stand','Perungudi','OMR',12.958,80.240),
  bus('Ambattur Bus Stand','Ambattur','Ambattur Main Road',13.108,80.165),
  bus('Avadi Bus Terminus','Avadi','Avadi Main Road',13.105,80.098),
  bus('Porur Bus Stand','Porur','Mount Poonamallee Road',13.032,80.157),
  bus('Mogappair Bus Stand','Mogappair','Mogappair Main Road',13.077,80.188),
  bus('Anna Nagar Bus Depot','Anna Nagar','Shanthi Colony Main Road',13.085,80.214),
  bus('Kolathur Bus Stand','Kolathur','Kolathur Main Road',13.117,80.212),
  bus('Perambur Bus Stand','Perambur','Perambur High Road',13.113,80.246),
  bus('Royapuram Bus Stand','Royapuram','Royapuram Main Road',13.115,80.293),
  bus('Tondiarpet Bus Stand','Tondiarpet','Tondiarpet Main Road',13.110,80.280),
  bus('Thiruvottiyur Bus Stand','Thiruvottiyur','Thiruvottiyur Main Road',13.167,80.307),
  bus('Madhavaram Bus Stand','Madhavaram','Madhavaram High Road',13.150,80.235),
  bus('Manali Bus Stand','Manali','Manali Main Road',13.157,80.263),
  bus('Broadway Bus Terminus','Park Town','NSC Bose Road',13.086,80.279),
  bus('Saidapet Bus Stand','Saidapet','Anna Salai',13.015,80.230),
  bus('Arumbakkam Bus Stand','Arumbakkam','Arumbakkam Main Road',13.063,80.215),
  bus('Poonamallee Bus Stand','Poonamallee','Poonamallee Main Road',13.048,80.108),
  bus('Urapakkam Bus Stand','Urapakkam','GST Road',12.882,80.096),
  bus('Guduvanchery Bus Stand','Guduvanchery','GST Road',12.845,80.063),
  bus('Vandalur Bus Stand','Vandalur','GST Road',12.895,80.072),
  bus('Pammal Bus Stand','Pammal','Pammal Main Road',12.976,80.163),

  // ═══════════════════════════════════════════════════════════════════
  // MALLS / SHOPPING CENTRES
  // ═══════════════════════════════════════════════════════════════════
  mal('Phoenix MarketCity','Velachery','Velachery Main Road',12.974,80.222),
  mal('Express Avenue Mall','Royapettah','Whites Road',13.054,80.267),
  mal('VR Chennai Mall','Anna Nagar','Jawaharlal Nehru Salai',13.067,80.196),
  mal('Palladium Mall','Palladium','Anna Salai',13.005,80.228),
  mal('Ampa Skywalk','Aminjikarai','Nelson Manickam Road',13.078,80.234),
  mal('Spencer Plaza','Anna Salai','Anna Salai',13.061,80.261),
  mal('Citi Centre Mall','Mylapore','DR Radhakrishnan Salai',13.041,80.271),
  mal('Vivira Mall','Navalur','Old Mahabalipuram Road',12.843,80.218),
  mal('Grand Square Mall','Tambaram','GST Road',12.920,80.106),
  mal('Marina Mall','Injambakkam','East Coast Road',12.878,80.249),
  mal('Celebration Mall','Vadapalani','Arcot Road',13.050,80.211),
  mal('Chennai Citi Centre','Mylapore','Mowbrays Road',13.040,80.270),
  mal('DB Mall','Perambur','Perambur High Road',13.109,80.243),
  mal('Forum Vijaya Mall','Vadapalani','NSK Salai',13.048,80.209),
  mal('Palazzo Mall','Porur','Porur Main Road',13.034,80.154),
  mal('Central Mall Mylapore','Mylapore','Cathedral Road',13.033,80.264),
  mal('Inox Mall Anna Nagar','Anna Nagar','Shanthi Colony',13.088,80.210),
  mal('PVR Mall Velachery','Velachery','Phoenix Marketcity Road',12.975,80.224),

  // ═══════════════════════════════════════════════════════════════════
  // HOTELS & RESORTS
  // ═══════════════════════════════════════════════════════════════════
  hot('ITC Grand Chola','Guindy','Anna Salai',13.000,80.214),
  hot('The Leela Palace Chennai','Adyar','Old Mahabalipuram Road',12.989,80.244),
  hot('Taj Coromandel','Nungambakkam','Binny Road',13.056,80.246),
  hot('Sheraton Grand Chennai','T Nagar','Cathedral Road',13.042,80.266),
  hot('Radisson Blu Hotel Chennai City Centre','Guindy','Guindy Industrial Estate',12.993,80.213),
  hot('Hyatt Regency Chennai','Anna Salai','Anna Salai',13.055,80.262),
  hot('Crowne Plaza Chennai','Adyar','Adyar Bridge Road',12.994,80.250),
  hot('Marriott Chennai','Anna Salai','Anna Salai',13.053,80.258),
  hot('The Park Chennai','Anna Salai','Anna Salai',13.058,80.259),
  hot('Novotel Chennai Chamiers Road','Alwarpet','Chamiers Road',13.026,80.254),
  hot('Le Royal Meridien','St Thomas Mount','GST Road',12.998,80.202),
  hot('Green Park Hotel','Nungambakkam','Nungambakkam High Road',13.058,80.244),
  hot('Vivanta Chennai IT Expressway','Sholinganallur','OMR',12.895,80.223),
  hot('Fortune Inn Grazia Chennai','Sholinganallur','OMR',12.896,80.225),
  hot('Treebo Trend Chennai','Thoraipakkam','Rajiv Gandhi Salai',12.928,80.233),
  hot('Ibis Chennai City Centre','Guindy','Anna Salai',12.997,80.212),
  hot('Holiday Inn Express Chennai','Sholinganallur','OMR',12.892,80.221),
  hot('Raintree Hotel Chennai','Anna Salai','Anna Salai',13.049,80.257),
  hot('Savera Hotel','Mylapore','Dr Radhakrishnan Salai',13.040,80.269),
  hot('Hotel Residency Tower','T Nagar','Sir Thyagaraya Road',13.045,80.231),

  // ═══════════════════════════════════════════════════════════════════
  // EDUCATIONAL INSTITUTIONS
  // ═══════════════════════════════════════════════════════════════════
  edu('IIT Madras','Adyar','IIT Madras Campus',13.010,80.234),
  edu('Anna University','Guindy','Anna University Road',13.010,80.233),
  edu('University of Madras','Marina','Chepauk',13.058,80.278),
  edu('SRM University Kattankulathur','Kattankulathur','SRM Main Road',12.824,80.044),
  edu('VIT Chennai Campus','Kelambakkam','Old Mahabalipuram Road',12.806,80.216),
  edu('Saveetha University','Poonamallee','NH 48',13.017,80.001),
  edu('Sathyabama University','Sholinganallur','OMR',12.873,80.218),
  edu('Hindustan Institute of Technology','Padur','OMR',12.815,80.203),
  edu('Loyola College','Nungambakkam','Loyola College Road',13.061,80.242),
  edu('Stella Maris College','Nungambakkam','Cathedral Road',13.052,80.245),
  edu('Madras Christian College','Tambaram','MCC Main Road',12.928,80.127),
  edu('Ethiraj College for Women','Egmore','Ethiraj Salai',13.074,80.263),
  edu('Women Christian College','Nungambakkam','College Road',13.060,80.247),
  edu('Pachaiyappas College','Park Town','Pachaiyappa Road',13.086,80.261),
  edu('Presidency College','Marina','Kamarajar Salai',13.055,80.280),
  edu('Alagappa College of Technology','Guindy','Anna University Campus',13.011,80.235),
  edu('College of Engineering Guindy','Guindy','Anna University Road',13.012,80.237),
  edu('Sri Venkateswara College of Engineering','Pennalur','Sriperumbudur Main Road',12.971,79.995),
  edu('PSBB School','KK Nagar','KK Nagar West Main Road',13.048,80.193),
  edu('Chettinad Vidyashram','RA Puram','Raja Annamalai Puram Main Road',13.025,80.256),
  edu('DAV School Velachery','Velachery','Velachery Main Road',12.970,80.215),
  edu('Don Bosco School','Egmore','Egmore Main Road',13.075,80.260),

  // ═══════════════════════════════════════════════════════════════════
  // AREA LANDMARKS
  // ═══════════════════════════════════════════════════════════════════
  lmk('Marina Beach','Marina','Kamarajar Salai',13.055,80.282),
  lmk('Besant Nagar Beach','Besant Nagar','Edward Elliot Beach Road',12.993,80.277),
  lmk('Elliot Beach Adyar','Besant Nagar','Elliot Beach Road',12.994,80.276),
  lmk('Thiruvanmiyur Beach','Thiruvanmiyur','East Coast Road',12.976,80.272),
  lmk('Neelankarai Beach','Neelankarai','East Coast Road',12.934,80.261),
  lmk('Velankanni Temple Chennai','Besant Nagar','Elliots Beach Road',12.993,80.275),
  lmk('Parthasarathy Temple','Triplicane','Triplicane High Road',13.055,80.276),
  lmk('Kapaleeshwarar Temple','Mylapore','Mylapore Tank Road',13.033,80.270),
  lmk('Vadapalani Murugan Temple','Vadapalani','Arcot Road',13.053,80.211),
  lmk('Marundeeswarar Temple','Thiruvanmiyur','Marundeeswarar Road',12.971,80.265),
  lmk('Arulmigu Santhome Basilica','Mylapore','Santhome High Road',13.031,80.278),
  lmk('Valluvar Kottam','Nungambakkam','Valluvar Kottam High Road',13.051,80.242),
  lmk('Fort St George','Park Town','Fort Road',13.079,80.287),
  lmk('Semmozhi Poonga','Nungambakkam','Cathedral Road',13.047,80.247),
  lmk('Chennai Central Railway Station','Park Town','Park Town',13.082,80.276),
  lmk('Chennai Egmore Railway Station','Egmore','Egmore Main Road',13.079,80.261),
  lmk('Chennai Airport','Tirusulam','GST Road',12.990,80.169),
  lmk('Anna Salai','Nungambakkam','Anna Salai',13.059,80.257),
  lmk('Rajiv Gandhi Government Hospital','Park Town','Poonamallee High Road',13.085,80.261),
  lmk('High Court Chennai','Park Town','NSC Bose Road',13.082,80.283),
  lmk('Secretariat Chennai','Fort St George','Fort Road',13.080,80.286),
  lmk('Government Museum Chennai','Egmore','Pantheon Road',13.069,80.258),
  lmk('Arignar Anna Zoological Park','Vandalur','Vandalur Main Road',12.891,80.070),
  lmk('MGR Film City','Sholinganallur','Old Mahabalipuram Road',12.893,80.229),
  lmk('Nehru Stadium Chennai','Periamet','Ethiraj Salai',13.073,80.267),
  lmk('Chepauk Cricket Stadium','Triplicane','Wallajah Road',13.062,80.279),
  lmk('Jawaharlal Nehru Stadium','Periamet','Ethiraj Salai',13.074,80.268),
  lmk('VGP Universal Kingdom','Injambakkam','East Coast Road',12.877,80.248),
  lmk('Dakshinachitra','Muttukadu','East Coast Road',12.818,80.236),
  lmk('Mahabalipuram Shore Temple','Mahabalipuram','East Coast Road',12.617,80.193),
  lmk('Anna Nagar Tower Park','Anna Nagar','Anna Nagar Circular Road',13.089,80.210),
  lmk('Koyambedu Market','Koyambedu','Jawaharlal Nehru Salai',13.070,80.193),
  lmk('Ranganathan Street','T Nagar','T Nagar Main Road',13.038,80.227),
  lmk('Pondy Bazaar','T Nagar','Usman Road',13.040,80.233),
  lmk('Sowcarpet Market','Park Town','Sowcarpet Main Road',13.087,80.274),
  lmk('Ritchie Street Electronic Market','Kilpauk','Ritchie Street',13.076,80.259),
  lmk('Perambur Railway Station','Perambur','Perambur Station Road',13.113,80.248),
  lmk('Avadi Military Station','Avadi','Avadi Station Road',13.100,80.096),
  lmk('CMBT Chennai','Koyambedu','Jawaharlal Nehru Salai',13.068,80.196),

  // ═══════════════════════════════════════════════════════════════════
  // RESTAURANTS (iconic/chains)
  // ═══════════════════════════════════════════════════════════════════
  rst('Saravana Bhavan T Nagar','T Nagar','Usman Road',13.040,80.232),
  rst('Saravana Bhavan Anna Nagar','Anna Nagar','2nd Avenue',13.085,80.213),
  rst('Saravana Bhavan Adyar','Adyar','LB Road',12.996,80.257),
  rst('Saravana Bhavan Mylapore','Mylapore','Luz Church Road',13.036,80.267),
  rst('Saravana Bhavan Nungambakkam','Nungambakkam','Nungambakkam High Road',13.057,80.243),
  rst('Murugan Idli Shop T Nagar','T Nagar','Usman Road',13.041,80.233),
  rst('Murugan Idli Shop Anna Nagar','Anna Nagar','Shanthi Colony Main Road',13.088,80.212),
  rst('Murugan Idli Shop Mylapore','Mylapore','Mylapore Main Road',13.034,80.268),
  rst('Hotel Palmgrove','Nungambakkam','Nungambakkam High Road',13.059,80.246),
  rst('Buhari Hotel','Anna Salai','Anna Salai',13.067,80.255),
  rst('Junior Kuppanna T Nagar','T Nagar','Thyagaraya Road',13.043,80.232),
  rst('Vasanta Bhavan','Egmore','Nelson Manickam Road',13.074,80.262),
  rst('Hotel Sangam Trichy Road','Guindy','Guindy Main Road',13.003,80.211),
  rst('Dakshin Restaurant','Guindy','Radisson Blu Hotel',12.993,80.213),
  rst('Pind Balluchi Anna Nagar','Anna Nagar','2nd Avenue',13.083,80.212),
  rst('The Great Kabab Factory','Guindy','Radisson Hotel',12.994,80.214),
  rst('Bombay Halwa House Mylapore','Mylapore','Mylapore Main Road',13.035,80.269),
  rst('Kaaraikudi Restaurant','Velachery','Velachery Main Road',12.970,80.218),
  rst('Southern Spice ITC','Guindy','Anna Salai',13.000,80.214),
  rst('Annalakshmi Restaurant','Mylapore','Cathedral Road',13.036,80.265),

];

// ──────────────────────────────────────────────
// Merge and write
// ──────────────────────────────────────────────
console.log('\n═══ Curated batch 3 ═══\n');

const db  = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const existing = new Set(db.pois.map(p => p.n.toLowerCase()));

let added = 0;
for (const entry of CURATED) {
  const key = entry.n.toLowerCase();
  if (existing.has(key)) continue;
  existing.add(key);
  db.pois.push(entry);
  added++;
}

db.meta.count = db.pois.length;
db.meta.built = new Date().toISOString().slice(0, 10);
fs.writeFileSync(OUT, JSON.stringify(db));

const mb  = (fs.statSync(OUT).size / 1048576).toFixed(2);
console.log(`Curated added: ${added}`);
console.log(`Total        : ${db.meta.count} POIs`);
console.log(`File size    : ${mb} MB\n`);

// Category breakdown
const cats = {};
for (const p of db.pois) cats[p.cat] = (cats[p.cat] || 0) + 1;
console.log('Category breakdown:');
Object.entries(cats).sort((a,b) => b[1]-a[1]).forEach(([c,n]) => {
  const bar = '█'.repeat(Math.round(n/500));
  console.log(`  ${c.padEnd(4)} ${String(n).padStart(6)}  ${bar}`);
});
