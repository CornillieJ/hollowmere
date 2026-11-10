#!/usr/bin/env node
/**
 * Pull library updates from the template into a game built from it.
 *
 * A repository created with "use this template" has an unrelated history, so
 * `git merge` is not the right tool: every file conflicts. What actually
 * differs is ownership. The template owns the library; the game owns its entry
 * point, its content and its configuration. This script copies the library
 * paths from the template and leaves everything else alone.
 *
 *   node tools/sync-template.mjs [template-remote] [branch]
 *
 * Run it from the game repository. Add the template once first:
 *
 *   git remote add template https://github.com/CornillieJ/threejs-game-start.git
 *   git config remote.template.fetch "+refs/heads/*:refs/remotes/template/*"
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Paths the template owns. Everything else in the game repo is the game's. */
export const LIBRARY_PATHS = [
    'src/scripts/Constants',
    'src/scripts/core',
    'src/scripts/input',
    'src/scripts/controls',
    'src/scripts/physics',
    'src/scripts/helpers',
    'src/scripts/fx',
    'src/scripts/audio',
    'src/scripts/ui',
    'src/scripts/game',
    'src/scripts/setup',
    'src/scripts/types',
    'src/scripts/init.ts',
    'src/scripts/kit',
    // The ready-made game setups. A game that customized one can skip it by
    // keeping its own copy under a different name.
    'src/scripts/templates',
    'src/css/style.css',
    'tools/smoke.mjs',
    'tools/unit.mjs',
    // Generic probes any game can run.
    'tools/probe-mobile.js',
    // The sync script itself, so a game that has it keeps getting updates. A game
    // made before it existed needs one manual copy.
    'tools/sync-template.mjs',
    'tests/math.test.ts',
    'tests/pathfinding.test.ts',
    'tests/profiler.test.ts',
    'tests/mesh-batch.test.ts',
    'tests/board-geometry.test.ts',
    'tests/inventory.test.ts',
    'tests/progression.test.ts',
    'tests/homestead.test.ts',
];

/**
 * Game packs: a whole game's worth of code and assets on top of the library.
 * Only the packs a game lists in `package.json` under `"templatePacks"` are
 * synced, so a farming game never receives a chess set.
 */
export const PACKS = {
    chess: ['src/scripts/chess', 'static/models/chess', 'tools/probe-chess.js', 'tests/rules.test.ts', 'tests/ai.test.ts'],
};

/**
 * Deliberately NOT synced: `package.json`, `index.html`, `readme.md`, `.env`,
 * `tsconfig.json` and `vite.config.ts`. Those carry the game's identity, its port
 * and any compiler options it added, so a library update must not overwrite them.
 */
const remote = process.argv[2] ?? 'template';
// A second argument syncs from a branch other than main, e.g. while a template change is still in review.
const branch = process.argv[3] ?? 'main';
const git = (args) => execFileSync('git', args, { stdio: 'inherit' });

git(['fetch', remote]);

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const packs = (manifest.templatePacks ?? []).flatMap((name) => PACKS[name] ?? (console.warn(`unknown pack ${name}`), []));

let copied = 0;
for (const path of [...LIBRARY_PATHS, ...packs]) {
    try {
        git(['checkout', `${remote}/${branch}`, '--', path]);
        copied += 1;
    } catch {
        // A path the template added after this game was made, or one it dropped.
        console.warn(`skipped ${path}`);
    }
}

console.log(`\ncopied ${copied} library paths from ${remote}/${branch}`);
console.log('now run: npm run typecheck && npm test');
