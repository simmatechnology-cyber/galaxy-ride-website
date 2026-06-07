/* ============================================================
   GALAXY RIDE — SEO PAGE GENERATOR
   Generates city/airport/route/tourism/service SEO pages,
   sitemap.xml and robots.txt — all in the NeoMotion X style.
   Run:  node scripts/generate-seo.js
   ============================================================ */

const fs   = require('fs');
const path = require('path');
const { SITE, CITIES, SERVICES, AIRPORTS, ROUTES, HILL_ROUTES, TOURISM, SERVICE_PAGES, TRUST_POINTS } = require('./seo-data');
const { DESTINATIONS, FARE_ORIGINS, INFO_ORIGINS, FARE_RULES, VEHICLES } = require('./destinations-data');

const ROOT = path.join(__dirname, '..');
const esc  = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const urls = []; // collected for sitemap

// ── Shared building blocks ────────────────────────────────────────────────
function head({ title, desc, slug, keywords, schema }) {
  const canonical = `${SITE.baseUrl}/${slug}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta name="keywords" content="${esc(keywords)}" />
<link rel="canonical" href="${canonical}" />
<meta name="robots" content="index, follow" />
<!-- Open Graph -->
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:site_name" content="${SITE.name}" />
<meta property="og:locale" content="en_IN" />
<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Poppins:wght@600;700;800;900&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
<link rel="stylesheet" href="css/styles.css" />
<link rel="stylesheet" href="css/seo.css" />
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%23E31E24'/><text y='.9em' font-size='62' x='16'>🚕</text></svg>" />
${schema.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n')}
</head>
<body class="seo-body">`;
}

function header() {
  return `
<header class="seo-nav">
  <a class="seo-logo" href="index.html"><span class="b">GR</span> Galaxy Ride</a>
  <nav class="seo-nav-links">
    <a href="index.html#home">Book Now</a>
    <a href="index.html#services">Services</a>
    <a href="index.html#contact">Contact</a>
    <a href="tel:${SITE.phoneRaw}" class="seo-nav-call"><i class="fas fa-phone"></i> ${SITE.phone}</a>
  </nav>
</header>`;
}

function breadcrumbHtml(items) {
  return `<nav class="seo-crumbs" aria-label="Breadcrumb">${
    items.map((it, i) => i < items.length - 1
      ? `<a href="${it.url}">${esc(it.name)}</a><span>/</span>`
      : `<span class="cur">${esc(it.name)}</span>`).join('')
  }</nav>`;
}

function trustGrid() {
  return `<section class="seo-trust">
    <h2>Why Choose Galaxy Ride</h2>
    <div class="seo-trust-grid">
      ${TRUST_POINTS.map(p => `<div class="seo-trust-item"><i class="fas fa-circle-check"></i> ${esc(p)}</div>`).join('')}
    </div>
  </section>`;
}

function faqHtml(faqs) {
  return `<section class="seo-faq">
    <h2>Frequently Asked Questions</h2>
    <div class="seo-faq-list">
      ${faqs.map(f => `<details class="seo-faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}
    </div>
  </section>`;
}

function relatedLinks(title, links) {
  return `<section class="seo-related">
    <h2>${esc(title)}</h2>
    <div class="seo-related-grid">
      ${links.map(l => `<a href="${l.url}">${esc(l.name)} <i class="fas fa-arrow-right"></i></a>`).join('')}
    </div>
  </section>`;
}

function cta(headline) {
  return `<section class="seo-cta">
    <h2>${esc(headline)}</h2>
    <p>Transparent pricing · Verified drivers · 24/7 support</p>
    <div class="seo-cta-btns">
      <a href="index.html#home" class="seo-btn primary"><i class="fas fa-car"></i> Book Now</a>
      <a href="https://wa.me/${SITE.phoneRaw}" target="_blank" rel="noopener" class="seo-btn wa"><i class="fab fa-whatsapp"></i> WhatsApp</a>
      <a href="tel:${SITE.phoneRaw}" class="seo-btn call"><i class="fas fa-phone"></i> Call Now</a>
    </div>
  </section>`;
}

function footer() {
  return `
<footer class="seo-foot">
  <div class="seo-foot-inner">
    <div>
      <strong>Galaxy Ride</strong>
      <p>${esc(SITE.address)}</p>
      <p><i class="fas fa-phone"></i> <a href="tel:${SITE.phoneRaw}">${SITE.phone}</a> &nbsp;·&nbsp;
         <i class="fab fa-instagram"></i> <a href="${SITE.insta}" target="_blank" rel="noopener">@galaxyride.ind.cabs</a></p>
    </div>
    <div class="seo-foot-links">
      <a href="index.html">Home</a><a href="about-us.html">About</a><a href="safety-policy.html">Safety</a>
      <a href="privacy-policy.html">Privacy</a><a href="terms-and-conditions.html">Terms</a><a href="refund-policy.html">Refund</a>
    </div>
  </div>
  <div class="seo-foot-bottom">© 2025 Galaxy Ride · Safe, Reliable, Affordable taxi service across South India.</div>
</footer>
</body></html>`;
}

// ── Schema helpers ─────────────────────────────────────────────────────────
function orgSchema() {
  return {
    '@context': 'https://schema.org', '@type': ['Organization', 'LocalBusiness', 'TaxiService'],
    name: SITE.name, url: SITE.baseUrl, telephone: SITE.phone, email: SITE.email,
    address: { '@type': 'PostalAddress', streetAddress: 'Nungambakkam', addressLocality: 'Chennai', postalCode: '600034', addressRegion: 'Tamil Nadu', addressCountry: 'IN' },
    areaServed: ['Tamil Nadu','Karnataka','Kerala','Andhra Pradesh','Telangana','Puducherry'],
    sameAs: [SITE.insta],
    contactPoint: { '@type': 'ContactPoint', telephone: SITE.phone, contactType: 'customer service', availableLanguage: ['Tamil','Hindi','English'] },
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '1200' },
  };
}
function faqSchema(faqs) {
  return { '@context':'https://schema.org','@type':'FAQPage', mainEntity: faqs.map(f => ({ '@type':'Question', name:f.q, acceptedAnswer:{ '@type':'Answer', text:f.a } })) };
}
function breadcrumbSchema(items) {
  return { '@context':'https://schema.org','@type':'BreadcrumbList', itemListElement: items.map((it,i)=>({ '@type':'ListItem', position:i+1, name:it.name, item:`${SITE.baseUrl}/${it.url}` })) };
}

// ── Page writer ────────────────────────────────────────────────────────────
function write(slug, html, priority = '0.7') {
  fs.writeFileSync(path.join(ROOT, `${slug}.html`), html, 'utf8');
  urls.push({ slug, priority });
}

// ── 1. CITY × SERVICE pages ────────────────────────────────────────────────
function genCityService(city, svc) {
  const slug  = `${city.slug}-${svc.slug}`;
  const title = `${svc.name} in ${city.name} | Galaxy Ride ${city.name} Taxi`;
  const desc  = `Book ${svc.name.toLowerCase()} in ${city.name}, ${city.state}. Galaxy Ride offers transparent fares, verified drivers and 24/7 support. Call ${SITE.phone}.`;
  const crumbs = [{name:'Home',url:'index.html'},{name:city.name,url:`${city.slug}-airport-taxi`},{name:svc.name,url:slug}];
  const faqs = [
    { q:`How do I book a ${svc.name.toLowerCase()} in ${city.name}?`, a:`Book online at Galaxy Ride, call ${SITE.phone}, or message us on WhatsApp. Instant confirmation with upfront fare.` },
    { q:`Are there hidden charges for ${svc.name.toLowerCase()} in ${city.name}?`, a:`No. Galaxy Ride offers transparent pricing — you see the full fare before booking. Tolls and parking, where applicable, are shown separately.` },
    { q:`Is night travel safe with Galaxy Ride in ${city.name}?`, a:`Yes. All drivers are police-verified, GPS-tracked, and trained for safe night travel across ${city.state}.` },
    { q:`What vehicles are available?`, a:`Mini, Sedan, SUV/MUV and Innova — choose premium sedan or luxury SUV for ${svc.name.toLowerCase()} in ${city.name}.` },
  ];
  const related = SERVICES.filter(s=>s.slug!==svc.slug).map(s=>({name:`${city.name} ${s.name}`,url:`${city.slug}-${s.slug}`}));
  const html =
    head({ title, desc, slug, keywords:`${svc.kw}, ${city.name.toLowerCase()} taxi, ${city.name.toLowerCase()} cab, taxi in ${city.name.toLowerCase()}`, schema:[orgSchema(), faqSchema(faqs), breadcrumbSchema(crumbs)] })
    + header()
    + `<main class="seo-main">
        ${breadcrumbHtml(crumbs)}
        <section class="seo-hero">
          <span class="seo-tag">${svc.icon} ${esc(svc.name)} · ${esc(city.name)}</span>
          <h1>${esc(svc.name)} in ${esc(city.name)}</h1>
          <p>Reliable, affordable ${esc(svc.name.toLowerCase())} across ${esc(city.name)}, ${esc(city.state)}. Verified drivers, transparent fares, premium vehicles and round-the-clock support.</p>
          <div class="seo-cta-btns">
            <a href="index.html#home" class="seo-btn primary"><i class="fas fa-car"></i> Book Now</a>
            <a href="tel:${SITE.phoneRaw}" class="seo-btn call"><i class="fas fa-phone"></i> ${SITE.phone}</a>
          </div>
        </section>
        <section class="seo-copy">
          <h2>Best ${esc(svc.name)} in ${esc(city.name)}</h2>
          <p>Galaxy Ride is ${esc(city.name)}'s trusted choice for ${esc(svc.name.toLowerCase())}. Whether it's an early-morning airport run, a one-way drop, an outstation trip or a premium chauffeur-driven sedan, our ${esc(city.name)} fleet is clean, comfortable and on time. ${city.airport ? `We are airport specialists serving ${esc(city.airport)}.` : ''} Our drivers speak Tamil, Hindi and English and know every route in and around ${esc(city.name)}.</p>
        </section>
        ${trustGrid()}
        ${faqHtml(faqs)}
        ${relatedLinks(`More Taxi Services in ${city.name}`, related)}
        ${cta(`Book your ${svc.name} in ${city.name} today`)}
      </main>`
    + footer();
  write(slug, html, '0.8');
}

// ── 2. AIRPORT pages ───────────────────────────────────────────────────────
function genAirport(a) {
  const slug = a.slug;
  const title = `${a.city} Airport Taxi | 24/7 Airport Transfer — Galaxy Ride`;
  const desc  = `Book ${a.city} airport taxi for pickup & drop at ${a.airport}. Flat fares, flight tracking, 24/7 service. Call ${SITE.phone}.`;
  const crumbs = [{name:'Home',url:'index.html'},{name:`${a.city} Airport Taxi`,url:slug}];
  const faqs = [
    { q:`How much is ${a.city} airport taxi?`, a:`Fares depend on distance and vehicle. Galaxy Ride offers flat, upfront airport fares with no surge — see your exact price before booking.` },
    { q:`Do you track my flight?`, a:`Yes. We monitor your flight and adjust pickup time automatically for delays at ${a.airport}.` },
    { q:`Is ${a.city} airport pickup available 24/7?`, a:`Yes, Galaxy Ride airport taxi runs 24/7, 365 days a year, including early-morning and late-night flights.` },
    { q:`Can I pre-book an airport drop?`, a:`Absolutely. Pre-book online or by phone and your driver arrives 15 minutes early for a stress-free airport drop.` },
  ];
  const related = ROUTES.filter(r=>r.from===a.city||r.to===a.city).slice(0,6).map(r=>({name:`${r.from} to ${r.to} Taxi`,url:`${slugRoute(r)}`}));
  const html =
    head({ title, desc, slug, keywords:`${a.city.toLowerCase()} airport taxi, ${a.city.toLowerCase()} airport cab, airport transfer ${a.city.toLowerCase()}, airport pickup, airport drop, 24/7 airport cab`, schema:[orgSchema(), faqSchema(faqs), breadcrumbSchema(crumbs)] })
    + header()
    + `<main class="seo-main">
        ${breadcrumbHtml(crumbs)}
        <section class="seo-hero">
          <span class="seo-tag">✈️ Airport Specialists</span>
          <h1>${esc(a.city)} Airport Taxi</h1>
          <p>24/7 airport pickup & drop at ${esc(a.airport)}. Flat fares, live flight tracking, clean premium cabs and professional chauffeurs.</p>
          <div class="seo-cta-btns">
            <a href="index.html#home" class="seo-btn primary"><i class="fas fa-plane"></i> Book Airport Taxi</a>
            <a href="tel:${SITE.phoneRaw}" class="seo-btn call"><i class="fas fa-phone"></i> ${SITE.phone}</a>
          </div>
        </section>
        <section class="seo-copy">
          <h2>Reliable Airport Transfers in ${esc(a.city)}</h2>
          <p>Galaxy Ride is the airport specialist for ${esc(a.airport)}. We offer punctual airport pickups and drops with flight tracking, meet-and-greet service, and flat upfront fares — no surge pricing, ever. Travelling early or arriving late? Our 24/7 fleet and verified drivers make every ${esc(a.city)} airport transfer smooth and safe.</p>
        </section>
        ${trustGrid()}
        ${faqHtml(faqs)}
        ${related.length?relatedLinks(`Popular Routes from ${a.city}`, related):''}
        ${cta(`Book ${a.city} Airport Taxi now`)}
      </main>`
    + footer();
  write(slug, html, '0.9');
}

// ── 3. ROUTE pages ─────────────────────────────────────────────────────────
function slugRoute(r) { return `${r.from.toLowerCase().replace(/\s+/g,'-')}-to-${r.to.toLowerCase().replace(/\s+/g,'-')}-taxi`; }
function genRoute(r, isHill) {
  const slug = slugRoute(r);
  const title = `${r.from} to ${r.to} Taxi | Fare ₹${r.fare}, ${r.km} km — Galaxy Ride`;
  const desc  = `Book ${r.from} to ${r.to} taxi. Distance ${r.km} km, travel time ${r.hrs}, sedan fare from ₹${r.fare}. ${isHill?'Experienced hill-station drivers. ':''}Call ${SITE.phone}.`;
  const crumbs = [{name:'Home',url:'index.html'},{name:'Outstation',url:'outstation-taxi'},{name:`${r.from} to ${r.to}`,url:slug}];
  const faqs = [
    { q:`How much is ${r.from} to ${r.to} taxi?`, a:`A one-way ${r.from} to ${r.to} sedan taxi starts from around ₹${r.fare}. Final fare depends on vehicle type, one-way vs round trip, tolls and driver allowance — shown upfront before booking.` },
    { q:`What is the distance and travel time from ${r.from} to ${r.to}?`, a:`The distance is about ${r.km} km and the journey takes approximately ${r.hrs} by road.` },
    { q:`What are the popular stops on the ${r.from} to ${r.to} route?`, a:`Popular stops include ${r.stops}.` },
    { q:`Is the ${r.from} to ${r.to} cab available for one-way trips?`, a:`Yes. Galaxy Ride offers both one-way and round-trip ${r.from} to ${r.to} taxis with transparent pricing and no hidden charges.` },
    ...(isHill?[{ q:`Are your drivers experienced for hill driving?`, a:`Yes — our ${r.to} route drivers are specially experienced in safe hill-station and ghat-road driving.` }]:[]),
  ];
  const relatedRoutes = [...ROUTES, ...HILL_ROUTES].filter(x=>slugRoute(x)!==slug && (x.from===r.from||x.to===r.to||x.from===r.to||x.to===r.from)).slice(0,6).map(x=>({name:`${x.from} to ${x.to} Taxi`,url:slugRoute(x)}));
  const html =
    head({ title, desc, slug, keywords:`${r.from.toLowerCase()} to ${r.to.toLowerCase()} taxi, ${r.from.toLowerCase()} to ${r.to.toLowerCase()} cab, ${r.from.toLowerCase()} ${r.to.toLowerCase()} outstation, ${isHill?'hill station taxi, mountain cab':'outstation taxi, one way taxi'}`, schema:[orgSchema(), faqSchema(faqs), breadcrumbSchema(crumbs)] })
    + header()
    + `<main class="seo-main">
        ${breadcrumbHtml(crumbs)}
        <section class="seo-hero">
          <span class="seo-tag">${isHill?'⛰️ Hill Station Taxi':'🛣️ Outstation Taxi'}</span>
          <h1>${esc(r.from)} to ${esc(r.to)} Taxi</h1>
          <p>One-way & round-trip cabs from ${esc(r.from)} to ${esc(r.to)}. Transparent fares, clean vehicles, ${isHill?'experienced hill-station drivers':'professional drivers'} and 24/7 support.</p>
          <div class="seo-cta-btns">
            <a href="index.html#home" class="seo-btn primary"><i class="fas fa-car"></i> Book This Route</a>
            <a href="https://wa.me/${SITE.phoneRaw}" target="_blank" rel="noopener" class="seo-btn wa"><i class="fab fa-whatsapp"></i> WhatsApp</a>
          </div>
        </section>
        <section class="seo-route-facts">
          <div class="rf"><i class="fas fa-route"></i><div><small>Distance</small><strong>${r.km} km</strong></div></div>
          <div class="rf"><i class="fas fa-clock"></i><div><small>Travel Time</small><strong>${esc(r.hrs)}</strong></div></div>
          <div class="rf"><i class="fas fa-indian-rupee-sign"></i><div><small>Sedan Fare from</small><strong>₹${r.fare}</strong></div></div>
          <div class="rf"><i class="fas fa-location-dot"></i><div><small>Popular Stops</small><strong>${esc(r.stops)}</strong></div></div>
        </section>
        <section class="seo-copy">
          <h2>${esc(r.from)} to ${esc(r.to)} Cab Booking</h2>
          <p>Travelling from ${esc(r.from)} to ${esc(r.to)}? Galaxy Ride offers comfortable, affordable taxis for this ${r.km} km route — typically ${esc(r.hrs)} of driving. Choose a one-way drop or a round trip, pick your vehicle (Sedan, SUV or Innova), and pay a transparent fare with no hidden charges. Break your journey at popular stops like ${esc(r.stops)}. ${isHill?'Our drivers are experienced in safe ghat-road and hill-station driving.':'Our verified drivers ensure a safe, on-time journey day or night.'}</p>
        </section>
        ${trustGrid()}
        ${faqHtml(faqs)}
        ${relatedRoutes.length?relatedLinks('Related Routes', relatedRoutes):''}
        ${cta(`Book ${r.from} to ${r.to} taxi now`)}
      </main>`
    + footer();
  write(slug, html, isHill?'0.85':'0.85');
}

// ── 4. TOURISM pages ───────────────────────────────────────────────────────
function genTourism(t) {
  const slug = t.slug;
  const title = `${t.name} Taxi | Tour Package & Sightseeing Cab — Galaxy Ride`;
  const desc  = `Book ${t.name} taxi for tour packages, sightseeing & family trips. Explore ${t.desc}. Experienced drivers, clean cabs. Call ${SITE.phone}.`;
  const crumbs = [{name:'Home',url:'index.html'},{name:'Tourism',url:'family-tour-taxi'},{name:`${t.name} Taxi`,url:slug}];
  const faqs = [
    { q:`How do I book a ${t.name} taxi?`, a:`Book online at Galaxy Ride or call ${SITE.phone}. We offer point-to-point cabs and full ${t.name} tour packages with sightseeing.` },
    { q:`Do you offer ${t.name} sightseeing packages?`, a:`Yes — full-day and multi-day ${t.name} sightseeing packages with experienced local drivers and flexible itineraries.` },
    { q:`Is ${t.name} taxi good for family trips?`, a:`Absolutely. Our clean, family-friendly SUVs and sedans are ideal for ${t.name} family tours and group travel.` },
  ];
  const related = TOURISM.filter(x=>x.slug!==slug).slice(0,6).map(x=>({name:`${x.name} Taxi`,url:x.slug}));
  const html =
    head({ title, desc, slug, keywords:`${t.name.toLowerCase()} taxi, ${t.name.toLowerCase()} cab, ${t.name.toLowerCase()} tour package, hill station taxi, sightseeing taxi, tourist cab, family trip cab`, schema:[orgSchema(), faqSchema(faqs), breadcrumbSchema(crumbs)] })
    + header()
    + `<main class="seo-main">
        ${breadcrumbHtml(crumbs)}
        <section class="seo-hero">
          <span class="seo-tag">🏞️ Tourism Taxi · ${esc(t.state)}</span>
          <h1>${esc(t.name)} Taxi & Tour Packages</h1>
          <p>Explore ${esc(t.desc)}. Galaxy Ride offers sightseeing cabs, tour packages and family-trip taxis with experienced local drivers.</p>
          <div class="seo-cta-btns">
            <a href="index.html#home" class="seo-btn primary"><i class="fas fa-mountain-sun"></i> Plan My Trip</a>
            <a href="tel:${SITE.phoneRaw}" class="seo-btn call"><i class="fas fa-phone"></i> ${SITE.phone}</a>
          </div>
        </section>
        <section class="seo-copy">
          <h2>${esc(t.name)} Sightseeing & Tour Cab</h2>
          <p>Discover ${esc(t.name)} — ${esc(t.desc)} — with Galaxy Ride. Our tourism taxis come with experienced drivers who know the best viewpoints, timings and routes. Choose a one-way cab, a full-day sightseeing package, or a multi-day ${esc(t.name)} tour for your family. Clean vehicles, transparent pricing and safe hill driving guaranteed.</p>
        </section>
        ${trustGrid()}
        ${faqHtml(faqs)}
        ${relatedLinks('More Tourism Destinations', related)}
        ${cta(`Book your ${t.name} tour taxi`)}
      </main>`
    + footer();
  write(slug, html, '0.8');
}

// ── 5. SERVICE landing pages ───────────────────────────────────────────────
function genService(s) {
  const slug = s.slug;
  const title = `${s.name} in South India | Galaxy Ride`;
  const desc  = `Galaxy Ride ${s.name.toLowerCase()} across Tamil Nadu, Karnataka, Kerala, Andhra Pradesh, Telangana & Puducherry. Transparent fares, verified drivers. Call ${SITE.phone}.`;
  const crumbs = [{name:'Home',url:'index.html'},{name:s.name,url:slug}];
  const faqs = [
    { q:`What is included in Galaxy Ride ${s.name.toLowerCase()}?`, a:`${s.name} with verified drivers, clean vehicles, transparent upfront pricing and 24/7 support across South India.` },
    { q:`Which cities do you cover for ${s.name.toLowerCase()}?`, a:`We serve Chennai, Madurai, Coimbatore, Trichy, Bangalore, Hyderabad, Kochi and 15+ more cities across six South Indian states.` },
    { q:`Are there hidden charges?`, a:`No. Galaxy Ride pricing is fully transparent — you see the complete fare before you confirm.` },
  ];
  const related = SERVICE_PAGES.filter(x=>x.slug!==slug).map(x=>({name:x.name,url:x.slug}));
  const html =
    head({ title, desc, slug, keywords:s.kw, schema:[orgSchema(), faqSchema(faqs), breadcrumbSchema(crumbs)] })
    + header()
    + `<main class="seo-main">
        ${breadcrumbHtml(crumbs)}
        <section class="seo-hero">
          <span class="seo-tag">${s.icon} ${esc(s.name)}</span>
          <h1>${esc(s.name)} Across South India</h1>
          <p>${esc(desc)}</p>
          <div class="seo-cta-btns">
            <a href="index.html#home" class="seo-btn primary"><i class="fas fa-car"></i> Book Now</a>
            <a href="tel:${SITE.phoneRaw}" class="seo-btn call"><i class="fas fa-phone"></i> ${SITE.phone}</a>
          </div>
        </section>
        <section class="seo-copy">
          <h2>${esc(s.name)} You Can Trust</h2>
          <p>Galaxy Ride delivers premium ${esc(s.name.toLowerCase())} across Tamil Nadu, Karnataka, Kerala, Andhra Pradesh, Telangana and Puducherry. Verified, professional, multilingual drivers; clean Sedan, SUV and Innova vehicles; transparent pricing with no hidden charges; and 24/7 customer support. Book online, by phone or on WhatsApp in seconds.</p>
        </section>
        ${trustGrid()}
        ${faqHtml(faqs)}
        ${relatedLinks('Other Services', related)}
        ${cta(`Book ${s.name} now`)}
      </main>`
    + footer();
  write(slug, html, '0.8');
}

// ── 6. E-E-A-T content pages ───────────────────────────────────────────────
function genContentPage(slug, title, heading, paragraphs) {
  const desc = `${heading} — Galaxy Ride. ${paragraphs[0].slice(0,140)}`;
  const crumbs = [{name:'Home',url:'index.html'},{name:heading,url:slug}];
  const html =
    head({ title, desc, slug, keywords:`galaxy ride ${heading.toLowerCase()}, taxi service south india`, schema:[orgSchema(), breadcrumbSchema(crumbs)] })
    + header()
    + `<main class="seo-main seo-article">
        ${breadcrumbHtml(crumbs)}
        <h1>${esc(heading)}</h1>
        ${paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}
        ${cta('Ready to ride with Galaxy Ride?')}
      </main>`
    + footer();
  write(slug, html, '0.5');
}

// ── 7. DESTINATION tour-taxi pages (tourism booking engine) ────────────────
function recoVehicle(pax) {
  if (pax <= 2) return 'sedan';
  if (pax <= 4) return 'suv';
  if (pax <= 7) return 'innova';
  return 'traveller';
}
function fareFor(km, vkey) {
  const lc = FARE_RULES.local[vkey], oc = FARE_RULES.outstation[vkey];
  if (km <= 100) return Math.round((lc.base + Math.max(0, km - lc.included) * lc.perKm) / 10) * 10;
  const cityKm = 100 - lc.included, outKm = km - 100;
  return Math.round((lc.base + cityKm * lc.perKm + outKm * oc.perKm + oc.driverBata) / 50) * 50;
}

function genDestination(d) {
  const slug  = `${d.slug}-tour-taxi`;
  const title = `${d.name} Tour Taxi | Chennai to ${d.name} Cab | Galaxy Ride`;
  const desc  = `Book ${d.name} taxi & tour package with Galaxy Ride. Outstation cab, one-way & family trip to ${d.name}, ${d.state}. Distances, day-wise plan, instant fare & booking. Call ${SITE.phone}.`;
  const keywords = `${d.name.toLowerCase()} tour taxi, ${d.name.toLowerCase()} taxi, ${d.name.toLowerCase()} cab, chennai to ${d.name.toLowerCase()} taxi, ${d.name.toLowerCase()} tour package, ${d.name.toLowerCase()} outstation cab, ${d.name.toLowerCase()} family trip, ${d.tags.join(', ').toLowerCase()}`;
  const crumbs = [{name:'Home',url:'index.html'},{name:'Tour Packages',url:'family-tour-taxi'},{name:`${d.name} Tour Taxi`,url:slug}];

  const fareOrigins = FARE_ORIGINS.filter(o => d.dist[o.slug] != null);
  const infoOrigins = INFO_ORIGINS.filter(s => d.dist[s] != null).map(s => ({ name: FARE_ORIGINS.find(o=>o.slug===s).name, km: d.dist[s] }));
  const defOrigin   = fareOrigins[0];
  const defKm       = d.dist[defOrigin.slug];
  const defReco     = recoVehicle(4);

  const waMsg = encodeURIComponent(`Hi Galaxy Ride, I want a trip package for ${d.name}`);

  // auto FAQ
  const faqs = [
    { q:`How much is a Chennai to ${d.name} taxi?`, a:`A one-way Chennai to ${d.name} cab covers about ${d.dist.chennai || infoOrigins[0].km} km. Use the Smart Fare Calculator above for an instant Mini/Sedan/SUV/Innova/Traveller estimate, or call ${SITE.phone}. Final fare is shown upfront with no hidden charges.` },
    { q:`What is the best time to visit ${d.name}?`, a:`The best season for ${d.name} is ${d.bestSeason}. We recommend ${d.duration} for a relaxed trip. ${d.weather}` },
    { q:`Which vehicle is best for a ${d.name} trip?`, a:`For couples a Sedan is ideal, families prefer an SUV/MUV, and larger groups choose an Innova or a 12-seat Tempo Traveller. The fare calculator recommends a vehicle based on your group size.` },
    { q:`Does Galaxy Ride offer ${d.name} tour packages?`, a:`Yes. We offer one-way drops, round trips and full ${d.duration} ${d.name} tour packages with experienced drivers, day-wise itineraries and sightseeing. Book online or on WhatsApp.` },
    { q:`Are the roads to ${d.name} good?`, a:`${d.roads}` },
  ];

  const schema = [
    orgSchema(),
    faqSchema(faqs),
    breadcrumbSchema(crumbs),
    {
      '@context':'https://schema.org','@type':'TouristDestination',
      name:`${d.name}, ${d.state}`, description:d.tagline,
      address:{ '@type':'PostalAddress', addressRegion:d.state, addressCountry:'IN' },
      includesAttraction: d.attractions.map(a=>({ '@type':'TouristAttraction', name:a.n, description:a.d })),
      touristType: d.tags,
    },
    {
      '@context':'https://schema.org','@type':'Product',
      name:`${d.name} Tour Taxi — Galaxy Ride`, description:desc,
      aggregateRating:{ '@type':'AggregateRating', ratingValue:'4.8', reviewCount:'1200' },
      review: d.reviews.map(r=>({ '@type':'Review', author:{ '@type':'Person', name:r.name }, reviewRating:{ '@type':'Rating', ratingValue:'5' }, reviewBody:r.text })),
    },
  ];

  const heroStyle = d.img ? ` style="background-image:linear-gradient(160deg, rgba(12,15,30,0.78), rgba(7,9,28,0.92)), url('${d.img}');background-size:cover;background-position:center;"` : '';

  // default fare table (Chennai) rendered server-side for SEO; JS updates on change
  const fareRows = VEHICLES.map(v => {
    const reco = v.key === defReco;
    return `<tr data-veh="${v.key}"${reco?' class="reco"':''}>
      <td><strong>${v.label}</strong><small>${v.seats}</small></td>
      <td class="grFare" data-veh="${v.key}">₹${fareFor(defKm, v.key).toLocaleString('en-IN')}</td>
      <td class="grReco">${reco?'<span class="grBadge">Recommended</span>':''}</td>
    </tr>`;
  }).join('');

  const planTabs = [1,2,3].map(n => `<button class="grPlanTab${n===1?' active':''}" onclick="grPlan(${n},this)">${n} Day${n>1?'s':''}</button>`).join('');
  const planPanes = [1,2,3].map(n => `<div class="grPlanPane${n===1?' active':''}" id="grPlan${n}">
      ${d.plans[n].map(p=>`<div class="grPlanRow"><span class="grPlanWhen">${esc(p.t)}</span><p>${esc(p.d)}</p></div>`).join('')}
    </div>`).join('');

  const related = [
    { name:'Book a Cab', url:'index.html#home' },
    { name:'Airport Taxi', url:'airport-taxi' },
    { name:'One Way Taxi', url:'one-way-taxi' },
    { name:'Outstation Taxi', url:'outstation-taxi' },
    ...DESTINATIONS.filter(x=>x.slug!==d.slug).slice(0,8).map(x=>({ name:`${x.name} Tour Taxi`, url:`${x.slug}-tour-taxi` })),
  ];

  const grData = JSON.stringify({ name:d.name, dist:d.dist, rules:FARE_RULES, vehicles:VEHICLES, origins:fareOrigins });

  const html =
    head({ title, desc, slug, keywords, schema })
    + header()
    + `<main class="seo-main">
        ${breadcrumbHtml(crumbs)}
        <section class="seo-hero gr-hero"${heroStyle}>
          <span class="seo-tag">📍 ${esc(d.name)} · ${esc(d.state)}</span>
          <h1>${esc(d.name)} Tour Taxi & Tour Packages</h1>
          <p>${esc(d.tagline)}</p>
          <div class="gr-tags">${d.tags.map(t=>`<span class="gr-tag">${esc(t)}</span>`).join('')}</div>
          <div class="seo-cta-btns">
            <a href="#grBook" class="seo-btn primary"><i class="fas fa-car"></i> Book This Trip</a>
            <a href="https://wa.me/${SITE.phoneRaw}?text=${waMsg}" target="_blank" rel="noopener" class="seo-btn wa"><i class="fab fa-whatsapp"></i> Plan on WhatsApp</a>
            <a href="tel:${SITE.phoneRaw}" class="seo-btn call"><i class="fas fa-phone"></i> Call Now</a>
          </div>
        </section>

        <section class="seo-copy gr-block">
          <h2>Travel Information — ${esc(d.name)}</h2>
          <div class="gr-info-grid">
            <div class="gr-info"><i class="fas fa-clock"></i><div><small>Best Season</small><strong>${esc(d.bestSeason)}</strong></div></div>
            <div class="gr-info"><i class="fas fa-calendar-check"></i><div><small>Ideal Duration</small><strong>${esc(d.duration)}</strong></div></div>
            <div class="gr-info"><i class="fas fa-cloud-sun"></i><div><small>Weather</small><strong>${esc(d.weather)}</strong></div></div>
            <div class="gr-info"><i class="fas fa-road"></i><div><small>Road Conditions</small><strong>${esc(d.roads)}</strong></div></div>
          </div>
          <h3 class="gr-sub">Distance to ${esc(d.name)}</h3>
          <div class="gr-dist-grid">
            ${infoOrigins.map(o=>`<div class="gr-dist"><span>From ${esc(o.name)}</span><strong>${o.km} km</strong></div>`).join('')}
          </div>
        </section>

        <section class="gr-block">
          <h2>Top Attractions in ${esc(d.name)}</h2>
          <div class="gr-attr-grid">
            ${d.attractions.map(a=>`<div class="gr-attr"><i class="fas fa-location-dot"></i><div><strong>${esc(a.n)}</strong><p>${esc(a.d)}</p></div></div>`).join('')}
          </div>
        </section>

        <section class="gr-block">
          <h2>AI Trip Planner — ${esc(d.name)}</h2>
          <p class="gr-muted">Choose how many days you have. Galaxy Ride suggests an optimised day-wise plan.</p>
          <div class="gr-plan-tabs">${planTabs}</div>
          ${planPanes}
        </section>

        <section class="gr-block" id="grBook">
          <h2>Smart Fare Calculator &amp; Instant Booking</h2>
          <p class="gr-muted">Select your pickup city and group size for an instant estimate, then book in one click.</p>
          <div class="gr-fare-card">
            <div class="gr-fare-controls">
              <label>Pickup City
                <select id="grOrigin" onchange="grCalc()">
                  ${fareOrigins.map(o=>`<option value="${o.slug}">${esc(o.name)} → ${esc(d.name)}</option>`).join('')}
                </select>
              </label>
              <label>Passengers
                <select id="grPax" onchange="grCalc()">
                  ${[1,2,3,4,5,6,7,8,10,12].map(n=>`<option value="${n}"${n===4?' selected':''}>${n} Passenger${n>1?'s':''}</option>`).join('')}
                </select>
              </label>
              <label>Travel Date
                <input type="date" id="grDate" />
              </label>
            </div>
            <div class="gr-fare-table-wrap">
              <table class="gr-fare-table">
                <thead><tr><th>Vehicle</th><th>Est. Fare (one way)</th><th></th></tr></thead>
                <tbody id="grFareBody">${fareRows}</tbody>
              </table>
            </div>
            <p class="gr-fare-note"><i class="fas fa-circle-info"></i> Estimates for a one-way drop including driver bata. Round trips, tolls &amp; parking shown before you confirm. <span id="grRecoNote"></span></p>
            <div class="gr-fare-actions">
              <button type="button" class="seo-btn primary" onclick="grBook()"><i class="fas fa-arrow-right"></i> Book This Trip</button>
              <a href="https://wa.me/${SITE.phoneRaw}?text=${waMsg}" target="_blank" rel="noopener" class="seo-btn wa"><i class="fab fa-whatsapp"></i> Need Help Planning?</a>
            </div>
          </div>
        </section>

        <section class="gr-block">
          <h2>What Travellers Say</h2>
          <div class="gr-rev-grid">
            ${d.reviews.map(r=>`<div class="gr-rev"><div class="gr-rev-stars">★★★★★</div><p>"${esc(r.text)}"</p><div class="gr-rev-by"><span class="gr-rev-av">${esc(r.name[0])}</span><div><strong>${esc(r.name)}</strong><small>${esc(r.city)}</small></div></div></div>`).join('')}
          </div>
        </section>

        ${trustGrid()}
        ${faqHtml(faqs)}
        ${relatedLinks(`Plan More & Book`, related)}
        ${cta(`Book your ${d.name} trip with Galaxy Ride`)}
      </main>
      <script>
      (function(){
        var GR_DEST = ${grData};
        window.GR_DEST = GR_DEST;
        function fareFor(km, v){
          var lc = GR_DEST.rules.local[v], oc = GR_DEST.rules.outstation[v];
          if(km <= 100) return Math.round((lc.base + Math.max(0,km-lc.included)*lc.perKm)/10)*10;
          var cityKm = 100 - lc.included, outKm = km - 100;
          return Math.round((lc.base + cityKm*lc.perKm + outKm*oc.perKm + oc.driverBata)/50)*50;
        }
        function reco(pax){ pax=+pax; if(pax<=2)return 'sedan'; if(pax<=4)return 'suv'; if(pax<=7)return 'innova'; return 'traveller'; }
        window.grCalc = function(){
          var o = document.getElementById('grOrigin').value;
          var km = GR_DEST.dist[o];
          var pax = document.getElementById('grPax').value;
          var rv = reco(pax);
          GR_DEST.vehicles.forEach(function(v){
            var cell = document.querySelector('.grFare[data-veh="'+v.key+'"]');
            if(cell) cell.textContent = '₹' + fareFor(km, v.key).toLocaleString('en-IN');
            var row = document.querySelector('tr[data-veh="'+v.key+'"]');
            if(row){ row.classList.toggle('reco', v.key===rv);
              var rc = row.querySelector('.grReco');
              if(rc) rc.innerHTML = v.key===rv ? '<span class="grBadge">Recommended</span>' : '';
            }
          });
          var lbl = (GR_DEST.vehicles.find(function(x){return x.key===rv;})||{}).label || '';
          document.getElementById('grRecoNote').textContent = 'For ' + pax + ' passenger' + (pax>1?'s':'') + ' we recommend the ' + lbl + '.';
        };
        window.grBook = function(){
          var o = document.getElementById('grOrigin').value;
          var oname = (GR_DEST.origins.find(function(x){return x.slug===o;})||{}).name || '';
          var pax = document.getElementById('grPax').value;
          var date = document.getElementById('grDate').value;
          var v = reco(pax);
          var params = new URLSearchParams({ pickup: oname, drop: GR_DEST.name, vehicle: v, passengers: pax, type: 'roundtrip' });
          if(date) params.set('date', date);
          window.location.href = 'index.html?' + params.toString() + '#home';
        };
        window.grPlan = function(n, el){
          document.querySelectorAll('.grPlanTab').forEach(function(t){ t.classList.remove('active'); });
          document.querySelectorAll('.grPlanPane').forEach(function(p){ p.classList.remove('active'); });
          el.classList.add('active');
          document.getElementById('grPlan'+n).classList.add('active');
        };
        // set min date = today
        var dt = document.getElementById('grDate');
        if(dt){ var t = new Date().toISOString().split('T')[0]; dt.min = t; dt.value = t; }
        grCalc();
      })();
      </script>`
    + footer();
  write(slug, html, '0.9');
}

// ════════════════════════════════════════════════════════════════════════
//  GENERATE EVERYTHING
// ════════════════════════════════════════════════════════════════════════
let count = 0;
CITIES.forEach(c => SERVICES.forEach(s => { genCityService(c, s); count++; }));
AIRPORTS.forEach(a => { genAirport(a); count++; });
ROUTES.forEach(r => { genRoute(r, false); count++; });
HILL_ROUTES.forEach(r => { genRoute(r, true); count++; });
TOURISM.forEach(t => { genTourism(t); count++; });
SERVICE_PAGES.forEach(s => { genService(s); count++; });
DESTINATIONS.forEach(d => { genDestination(d); count++; });

// E-E-A-T pages
genContentPage('about-us', 'About Galaxy Ride | Trusted South India Taxi Service', 'About Galaxy Ride', [
  'Galaxy Ride is a premium taxi and chauffeur service operating across South India — Tamil Nadu, Karnataka, Kerala, Andhra Pradesh, Telangana and Puducherry. We make every journey safe, reliable and affordable.',
  'From airport transfers and one-way drops to outstation trips, hill-station tours and acting-driver services, our fleet of clean Sedans, SUVs and Innovas is driven by verified, professional, multilingual chauffeurs.',
  'Our mission is simple: transparent pricing with no hidden charges, punctual service, and 24/7 support. Thousands of riders trust Galaxy Ride for daily commutes, business travel and family holidays.',
]);
genContentPage('safety-policy', 'Safety Policy | Galaxy Ride', 'Safety Policy', [
  'Your safety is our highest priority. Every Galaxy Ride driver undergoes a 4-step verification: identity check, police background verification, vehicle inspection and a professional training programme.',
  'All vehicles are GPS-tracked in real time, sanitised regularly and maintained to high standards. We follow strict protocols for night travel, women passengers and family trips.',
  'In case of any emergency, our 24/7 support team and emergency contact line are always available. Share your live trip with family for added peace of mind.',
]);
genContentPage('driver-verification', 'Driver Verification | Galaxy Ride', 'Driver Verification Process', [
  'Every Galaxy Ride chauffeur is thoroughly vetted before taking a single ride. We verify government ID, driving licence and address, and run a police background check.',
  'Drivers complete vehicle inspection and a customer-service and safe-driving training programme. Our hill-station drivers receive additional ghat-road training.',
  'We continuously monitor ratings and feedback. Only professional, courteous, multilingual drivers represent Galaxy Ride.',
]);
genContentPage('privacy-policy', 'Privacy Policy | Galaxy Ride', 'Privacy Policy', [
  'Galaxy Ride respects your privacy. We collect only the information needed to provide and improve our taxi services — such as your name, contact number, pickup and drop locations.',
  'Your data is stored securely and never sold. Payment is processed through secure, PCI-compliant gateways. We do not store card details on our servers.',
  'You may request access to or deletion of your data at any time by contacting support@galaxyride.in.',
]);
genContentPage('terms-and-conditions', 'Terms & Conditions | Galaxy Ride', 'Terms & Conditions', [
  'By booking with Galaxy Ride you agree to these terms. Fares are quoted upfront and may include tolls, parking and driver allowance for outstation trips, shown transparently before confirmation.',
  'Cancellations made up to one hour before pickup are eligible for a full refund. Late cancellations may incur a fee. Waiting charges may apply beyond the included free waiting time.',
  'Galaxy Ride is not liable for delays caused by traffic, weather or events beyond our control, but we will always do our best to keep you informed and on time.',
]);
genContentPage('refund-policy', 'Refund Policy | Galaxy Ride', 'Refund Policy', [
  'Cancel your booking up to one hour before pickup for a full refund. Refunds for prepaid online bookings are processed within 5–7 business days to the original payment method.',
  'For cancellations within one hour of pickup, a nominal cancellation fee may apply. No-shows are non-refundable.',
  'For any refund query, contact our 24/7 support at support@galaxyride.in or call ' + SITE.phone + '.',
]);
genContentPage('contact-us', 'Contact Galaxy Ride | 24/7 Taxi Booking South India', 'Contact Us', [
  'Reach Galaxy Ride 24/7 for bookings, support and enquiries. Call or WhatsApp ' + SITE.phone + ', email support@galaxyride.in, or use the booking form on our homepage.',
  'Head Office: Nungambakkam, Chennai - 600034, Tamil Nadu, India. Follow us on Instagram @galaxyride.ind.cabs for offers and updates.',
  'Our average response time is just 5 minutes — we are always here to help you ride safely across South India.',
]);
count += 7;

// ── sitemap.xml (deduped by slug — keep highest priority) ──────────────────
const today = new Date().toISOString().split('T')[0];
const bySlug = new Map();
for (const u of urls) {
  const prev = bySlug.get(u.slug);
  if (!prev || parseFloat(u.priority) > parseFloat(prev.priority)) bySlug.set(u.slug, u);
}
const uniqueUrls = [...bySlug.values()];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE.baseUrl}/</loc><lastmod>${today}</lastmod><priority>1.0</priority></url>
${uniqueUrls.map(u=>`  <url><loc>${SITE.baseUrl}/${u.slug}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf8');

// ── robots.txt ─────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(ROOT, 'robots.txt'),
`User-agent: *
Allow: /
Disallow: /netlify/
Disallow: /scripts/

Sitemap: ${SITE.baseUrl}/sitemap.xml
`, 'utf8');

console.log(`✓ Generated ${count} page writes → ${uniqueUrls.length} unique pages + sitemap.xml (${uniqueUrls.length+1} URLs) + robots.txt`);
