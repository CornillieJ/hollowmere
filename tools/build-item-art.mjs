// node tools/build-item-art.mjs [contact-sheet.png]
// Renders every picture in `tools/item-art.mjs` to `static/icons/items/<id>.png`, 32 px square,
// to be shown blown up with hard pixels like everything else in the game.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ART, svg } from './item-art.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const { chromium } = require('playwright-core');
const SIZE = 32;
const out = join(root, 'static/icons/items');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
for (const id of Object.keys(ART)) {
    await page.setContent(`<body style="margin:0;background:transparent">${svg(id).replace('<svg ', `<svg width="${SIZE}" height="${SIZE}" style="display:block" `)}</body>`);
    writeFileSync(join(out, `${id}.png`), await page.screenshot({ omitBackground: true }));
}
const sheet = process.argv[2];
if (sheet) {
    const ids = Object.keys(ART);
    await page.setViewportSize({ width: 10 * 84, height: Math.ceil(ids.length / 10) * 100 });
    await page.setContent(`<body style="margin:0;background:#101412;display:flex;flex-wrap:wrap;font:9px monospace;color:#ccc">${ids.map((id) => `<div style="width:84px;height:100px;text-align:center"><img src="data:image/png;base64,${readFileSync(join(out, `${id}.png`)).toString('base64')}" style="width:64px;height:64px;image-rendering:pixelated;margin-top:6px"><br>${id}</div>`).join('')}</body>`);
    await page.screenshot({ path: sheet });
}
await browser.close();
console.log(`wrote ${Object.keys(ART).length} pictures to ${out}`);
