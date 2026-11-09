#!/usr/bin/env node
/**
 * Unit test runner for TypeScript files that need no browser.
 *
 * There is no test framework here on purpose. A test file is just a module that
 * asserts and throws, and this runner bundles it with esbuild (so extensionless
 * imports work, exactly like the app) and then imports it with Node. Failure is
 * an uncaught exception or a non-zero exit code.
 *
 *   node tools/unit.mjs                    # every tests/*.test.ts
 *   node tools/unit.mjs tests/rules.test.ts
 *
 * Pure logic (rules, maths, pathfinding, scoring, save formats) suits this well.
 * Anything that touches WebGL or the DOM belongs in tools/smoke.mjs instead.
 */
import { globSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const args = process.argv.slice(2);
const files = args.length > 0 ? args : globSync('tests/**/*.test.ts');

if (files.length === 0) {
    console.log('no test files found (expected tests/**/*.test.ts)');
    process.exit(args.length > 0 ? 1 : 0);
}

const outDir = mkdtempSync(join(tmpdir(), 'unit-'));
let failed = 0;
const started = Date.now();

for (const file of files.sort()) {
    const name = relative(process.cwd(), resolve(file));
    const outfile = join(outDir, `${name.replace(/[^a-zA-Z0-9]/g, '_')}.mjs`);
    try {
        await build({
            entryPoints: [file],
            outfile,
            bundle: true,
            platform: 'node',
            format: 'esm',
            target: 'node22',
            // Node built-ins stay external. Everything else is bundled, so the
            // output lands next to no node_modules and still resolves.
            external: ['node:*'],
            logLevel: 'warning',
        });
    } catch (error) {
        console.log(`FAIL ${name} (could not build)`);
        console.log(String(error).split('\n').slice(0, 8).join('\n'));
        failed += 1;
        continue;
    }

    const fileStarted = Date.now();
    try {
        await import(pathToFileURL(outfile).href);
        console.log(`PASS ${name} (${Date.now() - fileStarted} ms)`);
    } catch (error) {
        console.log(`FAIL ${name}`);
        console.log(String(error).split('\n').slice(0, 12).map((line) => `     ${line}`).join('\n'));
        failed += 1;
    }
}

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${files.length - failed}/${files.length} test files passed in ${Date.now() - started} ms`);
process.exit(failed === 0 ? 0 : 1);
