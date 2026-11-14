import type { EndingSlide } from '../game/ending';

/** The 2 ways the game ends, a picture and a sentence at a time. */
export const WAKE_SLIDES: EndingSlide[] = [
    { picture: ':bed:', text: 'You lie down in the bed that is not yours, and this time you mean it.' },
    { picture: ':fog:', text: 'The Veil comes in under the door, as it does every night. Tonight it does not stop at the blanket.' },
    { picture: ':candle:', text: 'Somewhere a goat closes a ledger. Somewhere a child buries half of something. On the hill, a tall thin shape lifts one hand, and keeps it lifted.' },
    { picture: ':blank:', text: 'Then a ceiling. Yours. The crack in the plaster you have meant to fill for years.' },
    { picture: ':rain:', text: 'Rain on the window, of the ordinary kind. A kitchen you could cross in the dark.' },
    { picture: ':scroll:', text: 'On the pillow: a folded slip with your name on it, in your own hand. And one pale turnip seed.' },
    { picture: ':sprout:', text: 'You plant it. Of course you plant it. It comes up leaning away from the road.' },
];

export const STAY_SLIDES: EndingSlide[] = [
    { picture: ':pot:', text: 'The last day went by like the others. You delivered soup. It was still hot.' },
    { picture: ':village:', text: 'This morning you tried to say the name of your own street. You said "Hollowveil". It felt true.' },
    { picture: ':book:', text: 'Barnaby has moved your name. Not to the black book. To the one under the counter, that has no colour, and that he does not rule lines in.' },
    { picture: ':rabbit:', text: 'Wren says you smell the same as everybody now. She says it as the nicest thing she knows.' },
    { picture: ':sign:', text: 'The scarecrow stays on its post. The signpost says what it always said. Nothing is wrong any more. That is how you can tell.' },
    { picture: ':hill:', text: 'Up on the hill, Pell lowers his hand.' },
    { picture: ':wheat:', text: 'There is a field to plant, and people to feed. There are worse places. There are worse neighbours.' },
];

/** The lines under the title of a few menus. `{days}` is filled in by the game. */
export const SCREENS = {
    title: 'A farm for the hollow, behind the veil.',
    died: 'Someone found you in the Veil and carried you to the infirmary. {days} days are missing. Your tools were set by the bed. What you carried was not brought back with you.',
    woke: 'Your own ceiling. Your own kitchen, and rain of the ordinary kind. On the pillow beside you: a folded slip with your name on it, and one pale turnip seed.',
};
