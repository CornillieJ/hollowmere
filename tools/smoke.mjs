#!/usr/bin/env node
/**
 * Headless smoke test for this template.
 *
 * Fails on any console error, uncaught exception or failed request, so a
 * regression cannot pass as "looks fine". An optional probe file in `tools/`
 * runs after the page settles and its result is printed as JSON.
 *
 *   node tools/smoke.mjs
 *   node tools/smoke.mjs http://localhost:5180/ tools/probe-combat.js
 *
 * Needs `playwright-core` plus a Chromium binary. Override the browser with
 * CHROMIUM=/path/to/chrome and the settle time with SMOKE_WAIT=ms.
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5180/';
const probePath = process.argv[3];
const waitMs = Number(process.env.SMOKE_WAIT ?? 9000);
// --mobile emulates a phone: small viewport, coarse pointer, touch events.
const mobile = process.argv.includes('--mobile');

const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage(
    mobile
        ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36' }
        : { viewport: { width: 1280, height: 800 } },
);

const problems = [];
page.on('console', (message) => {
    if (message.type() === 'error') problems.push('console.error: ' + message.text().slice(0, 300));
});
page.on('pageerror', (error) => problems.push('UNCAUGHT: ' + String(error).slice(0, 300)));
page.on('requestfailed', (request) => {
    // Troika spawns a web worker from a blob url; tearing the page down reports it
    // as a failed request even though nothing was wrong.
    if (request.url().startsWith('blob:')) return;
    problems.push('REQUEST FAILED: ' + request.url().slice(0, 150));
});
page.on('response', (response) => {
    if (response.status() >= 400) problems.push('HTTP ' + response.status() + ': ' + response.url().slice(0, 150));
});

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(waitMs);

if (probePath) {
    const source = readFileSync(probePath, 'utf8');
    const result = await page.evaluate(source);
    console.log('probe ->', JSON.stringify(result, null, 2));
}

await page.screenshot({ path: process.env.SMOKE_SHOT ?? '/tmp/opencode/smoke.png' });
await browser.close();

const unique = [...new Set(problems)];
if (unique.length > 0) {
    console.log('\nFAIL - ' + unique.length + ' problem(s):');
    for (const line of unique) console.log(' - ' + line);
    process.exit(1);
}
console.log('\nPASS - no console errors, exceptions or failed requests');
