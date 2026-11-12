// The One MSP Phone icons (12 Nov 2026): the One MSP logo (teal tile, white ring, orange dot) with a white phone handset
// in place of the centre dot. Measured from aem-crm/frontend/public/one-icon-512.png. Handset = Material "call" icon.
// usage: node make-icons.js <sharp module path> <assets dir>
const sharp = require(process.argv[2]);
const fs = require('fs');
const path = require('path');
const out = process.argv[3];
const TEAL = '#17868b', ORANGE = '#f2711c';
const HANDSET = 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z';

// The mark on a 512 canvas, centred on 256,256: ring r 152 (stroke 39), orange dot r 40 at 380,172, handset ~126 px.
const mark = (fg = '#ffffff', dot = ORANGE) => `
  <circle cx="256" cy="256" r="152" fill="none" stroke="${fg}" stroke-width="39"/>
  <g transform="translate(172 172) scale(7)"><path d="${HANDSET}" fill="${fg}"/></g>
  <circle cx="380" cy="172" r="40" fill="${dot}"/>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${body}</svg>`;

const variants = {
  // Rounded tile, as the ONE logo: desktop app, favicon, splash, the master.
  rounded: svg(`<rect width="512" height="512" rx="104" fill="${TEAL}"/>${mark()}`),
  // Full-bleed square for iOS (the system rounds it; no transparency allowed).
  square: svg(`<rect width="512" height="512" fill="${TEAL}"/>${mark()}`),
  // Android adaptive icon: mark only, inside the 66% safe zone; background is plain teal.
  foreground: svg(`<g transform="translate(256 256) scale(0.6) translate(-256 -256)">${mark()}</g>`),
  background: svg(`<rect width="512" height="512" fill="${TEAL}"/>`),
  monochrome: svg(`<g transform="translate(256 256) scale(0.6) translate(-256 -256)">${mark('#ffffff', '#ffffff')}</g>`),
};

(async () => {
  fs.mkdirSync(path.join(out, 'brand'), { recursive: true });
  fs.writeFileSync(path.join(out, 'brand', 'one-msp-phone.svg'), variants.rounded);
  const png = (v, size, file, flat) => {
    let s = sharp(Buffer.from(variants[v]), { density: 72 * size / 512 }).resize(size, size);
    if (flat) s = s.flatten({ background: TEAL });
    return s.png().toFile(path.join(out, file));
  };
  await png('square', 1024, 'icon.png', true);
  await png('rounded', 1024, 'desktop-icon.png');
  await png('foreground', 1024, 'android-icon-foreground.png');
  await png('background', 1024, 'android-icon-background.png', true);
  await png('monochrome', 1024, 'android-icon-monochrome.png');
  await png('rounded', 1024, 'splash-icon.png');
  await png('rounded', 48, 'favicon.png');
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
