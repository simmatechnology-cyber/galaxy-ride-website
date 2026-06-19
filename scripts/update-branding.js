#!/usr/bin/env node
/**
 * One-off branding cleanup script:
 *  - Replaces the old per-page inline emoji data-URI favicon <link> with the
 *    new GR Square Logo favicon/manifest/theme-color block.
 *  - Adds og:image / twitter:image pointing at the GR logo where an
 *    Open Graph / Twitter card block exists but no image was set yet.
 *
 * Run once: node scripts/update-branding.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && f !== 'index.html');

const FAVICON_BLOCK = [
  '<link rel="icon" type="image/x-icon" href="/favicon.ico" />',
  '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />',
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />',
  '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
  '<link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png" />',
  '<link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png" />',
  '<link rel="manifest" href="/manifest.webmanifest" />',
  '<meta name="theme-color" content="#E31E24" />',
].join('\n');

const OLD_FAVICON_RE = /^[ \t]*<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,.*?"\s*\/>[ \t]*$/m;

let faviconCount = 0;
let ogImageCount = 0;
let skippedNoFavicon = [];

for (const file of files) {
  const fp = path.join(ROOT, file);
  let html = fs.readFileSync(fp, 'utf8');
  const original = html;

  if (OLD_FAVICON_RE.test(html)) {
    html = html.replace(OLD_FAVICON_RE, FAVICON_BLOCK);
    faviconCount++;
  } else if (!html.includes('rel="icon"') && !html.includes("rel='icon'")) {
    skippedNoFavicon.push(file);
  }

  // Add og:image right after og:locale (or after og:description if no locale line)
  if (html.includes('property="og:') && !html.includes('property="og:image"')) {
    if (html.includes('property="og:locale"')) {
      html = html.replace(
        /(<meta property="og:locale"[^>]*\/>)/,
        `$1\n<meta property="og:image" content="https://galaxyride.in/assets/images/gr-logo-og.png" />\n<meta property="og:image:width" content="512" />\n<meta property="og:image:height" content="512" />`
      );
      ogImageCount++;
    } else if (html.includes('property="og:description"')) {
      html = html.replace(
        /(<meta property="og:description"[^>]*\/>)/,
        `$1\n<meta property="og:image" content="https://galaxyride.in/assets/images/gr-logo-og.png" />\n<meta property="og:image:width" content="512" />\n<meta property="og:image:height" content="512" />`
      );
      ogImageCount++;
    }
  }

  // Add twitter:image right after twitter:description if a twitter card exists
  if (html.includes('name="twitter:') && !html.includes('name="twitter:image"')) {
    if (html.includes('name="twitter:description"')) {
      html = html.replace(
        /(<meta name="twitter:description"[^>]*\/>)/,
        `$1\n<meta name="twitter:image" content="https://galaxyride.in/assets/images/gr-logo-og.png" />`
      );
    }
  }

  if (html !== original) {
    fs.writeFileSync(fp, html, 'utf8');
  }
}

console.log(`Updated favicon block in ${faviconCount} files.`);
console.log(`Added og:image in ${ogImageCount} files.`);
if (skippedNoFavicon.length) {
  console.log(`Files with no existing favicon tag (left untouched, review manually):`, skippedNoFavicon);
}
