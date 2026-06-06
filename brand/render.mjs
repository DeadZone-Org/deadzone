import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
const B = '/downloads/mantle-dora/deadzone';
const render = (src, out, width) => {
  const svg = readFileSync(`${B}/brand/${src}`, 'utf8');
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
  writeFileSync(out, png);
  console.log('  wrote', out.replace(B + '/', ''), `${width}px`);
};
mkdirSync(`${B}/mobile/assets`, { recursive: true });
mkdirSync(`${B}/web/public`, { recursive: true });
render('icon.svg', `${B}/mobile/assets/icon.png`, 1024);            // iOS + general app icon
render('adaptive-foreground.svg', `${B}/mobile/assets/adaptive-icon.png`, 1024); // Android foreground
render('icon.svg', `${B}/mobile/assets/splash-icon.png`, 512);     // splash
render('mark.svg', `${B}/mobile/assets/favicon.png`, 64);
render('icon.svg', `${B}/web/public/favicon.png`, 256);            // web favicon
copyFileSync(`${B}/brand/mark.svg`, `${B}/web/public/logo.svg`);   // web logo (vector)
copyFileSync(`${B}/brand/icon.svg`, `${B}/web/public/favicon.svg`);
console.log('  copied logo.svg + favicon.svg to web/public');
