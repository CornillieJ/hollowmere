import { div } from '../helpers/dom';
import { SYSTEM_ORDER } from '../core/systems';
import type { DayCycle } from '../game/daycycle';
import type { HotbarHandle, ResourceHandle } from '../kit';

/**
 * The two plates at the top of the screen, and what a phone shows instead of
 * the row of pockets.
 *
 * Top left: what to do next, as a note pinned up by somebody with unsteady
 * hands. Top right: the day, the hour and the purse, with the place's name
 * hanging under it while the farmer stands in a light. Both are dark enough to
 * read over the Veil at noon.
 *
 * On a touch screen the row of pockets is folded away: most work picks its own
 * tool. One round button shows what is in the hand, and opens the row for the
 * few things that still need choosing (which seeds, a candle, a fence, food).
 */
/** What the held-item button says before the plates take it over. Also how they find it. */
export const HELD_PLACEHOLDER = '∅';

export type PlatesOptions = {
    dayCycle: DayCycle;
    isNight: () => boolean;
    coins: ResourceHandle;
    format: (amount: number) => string;
    hotbar: HotbarHandle;
    /** A second line under the purse, e.g. what is still owed. Empty hides it. */
    note?: () => string;
};

export type PlatesHandle = {
    /** The name of the lit place the farmer stands in, or nothing. */
    setPlace: (name: string | undefined) => void;
    /** Open or close the row of pockets on a touch screen. */
    togglePockets: (open?: boolean) => void;
};

export function setupPlates(game: Game, options: PlatesOptions): PlatesHandle {
    const { dayCycle, coins, hotbar } = options;
    const root = game.hud.root;

    root.querySelector('.hud-objective')?.classList.add('hv-plate', 'hv-quest');

    const clock = div('hv-plate hv-clock click-through', undefined, root);
    const top = div('hv-clock-top', undefined, clock);
    const day = div('hv-clock-day', '', top);
    const time = div('hv-clock-time', '', top);
    const purse = div('hv-clock-coins', '', clock);
    const note = div('hv-clock-note is-hidden', '', clock);
    // Hangs under the clock, however tall the clock is.
    const place = div('hv-place is-hidden', '', clock);

    const setCoins = (): void => {
        purse.textContent = options.format(coins.value());
    };
    setCoins();
    coins.onChange((_value, delta) => {
        setCoins();
        if (delta <= 0) return;
        purse.classList.remove('is-bump');
        // Reading a layout value restarts the animation for back-to-back payments.
        void purse.offsetWidth;
        purse.classList.add('is-bump');
    });

    // The round button that stands in for the pockets on a phone: the last of the touch buttons.
    const held = [...document.querySelectorAll<HTMLElement>('.touch-button')].find((element) => element.textContent === HELD_PLACEHOLDER);
    held?.classList.add('hv-held');
    const bar = hotbar.bar.root;
    const togglePockets = (open?: boolean): void => {
        bar.classList.toggle('is-open', open ?? !bar.classList.contains('is-open'));
    };
    // Choosing something puts the row away again.
    bar.addEventListener('click', () => togglePockets(false));

    let shown = '';
    let heldShown = '';
    game.systems.add({
        name: 'plates',
        order: SYSTEM_ORDER.EFFECTS,
        always: true,
        update: () => {
            const night = options.isNight();
            const text = `${night ? '☾' : '☀'}|${dayCycle.day}|${dayCycle.clock}|${dayCycle.stalled}|${options.note?.() ?? ''}`;
            if (text !== shown) {
                shown = text;
                day.textContent = `${night ? '☾ Night' : '☀ Day'} ${dayCycle.day}`;
                time.textContent = dayCycle.clock;
                clock.classList.toggle('is-night', night);
                clock.classList.toggle('is-late', dayCycle.stalled);
                const owed = options.note?.() ?? '';
                note.textContent = owed;
                note.classList.toggle('is-hidden', owed.length === 0);
            }
            if (!held) return;
            const slot = hotbar.selected;
            const inHand = slot ? `${slot.definition.icon ?? '?'}|${slot.definition.badge ?? ''}|${slot.amount > 1 ? slot.amount : ''}` : '';
            if (inHand === heldShown) return;
            heldShown = inHand;
            const [icon, badge, amount] = inHand.split('|');
            held.textContent = icon || '∅';
            if (badge) div('item-badge', badge, held);
            if (amount) div('hv-held-count', amount, held);
        },
    });

    return {
        setPlace: (name) => {
            place.textContent = name ? `🕯 ${name}` : '';
            place.classList.toggle('is-hidden', !name);
        },
        togglePockets,
    };
}
