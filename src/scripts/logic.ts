import { boot } from './game/boot';

/** Entry point: the game lives in `scripts/game`, the content in `scripts/content`. */
window.addEventListener('load', () => {
    void boot();
});
