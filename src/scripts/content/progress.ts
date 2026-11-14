import type { Achievement } from '../kit';
import type { UpgradeDefinition } from '../game/upgrades';

/**
 * How the farm grows and what counts as getting somewhere: Barnaby's order
 * book and the deeds. What each purchase does, and when each deed is earned,
 * is in `game/boot.ts` (`orderEffects`, `deedChecks`).
 */

/** Barnaby's order book, in the order it is listed. */
export const ORDER_BOOK = [
    {
        id: 'field',
        name: 'More land',
        icon: ':sprout:',
        levels: [
            { cost: 150, name: 'The east field', description: '12 more plots beside the first field.' },
            { cost: 340, name: 'The long field', description: '18 more plots along the south fence.' },
        ],
    },
    {
        id: 'pot',
        name: 'A better pot',
        icon: ':pot:',
        levels: [
            { cost: 180, name: 'Iron pot', description: 'Cooks chowder, omelettes, pale broth and bloom tea.' },
            { cost: 450, name: 'Cauldron', description: 'Cooks pumpkin pie and Hollowveil stew.' },
        ],
    },
    {
        id: 'seeds',
        name: 'Better seeds',
        icon: ':corn:',
        levels: [
            { cost: 80, name: 'Corn seeds', description: 'The store starts stocking corn.' },
            { cost: 170, name: 'Pumpkin seeds', description: 'The store starts stocking pumpkins.' },
        ],
    },
    {
        id: 'bag',
        name: 'A bigger backpack',
        icon: ':bag:',
        levels: [
            { cost: 150, name: 'Stitched backpack', description: '6 slots instead of 3. Also on the store shelf.' },
            { cost: 400, name: 'Leather backpack', description: '10 slots.' },
            { cost: 900, name: "Postman's satchel", description: '16 slots. Fen will not say where the last postman went.' },
        ],
    },
    {
        id: 'can',
        name: 'A bigger watering can',
        icon: ':drop:',
        levels: [
            { cost: 110, name: 'Two-gallon can', description: 'Holds 10 waterings instead of 5.' },
            { cost: 280, name: 'Yoke and pails', description: 'Holds 20 waterings.' },
        ],
    },
    {
        id: 'bikelamp',
        name: 'A lamp for the bicycle',
        icon: ':lantern:',
        levels: [{ cost: 240, name: 'Carbide lamp', description: 'Lights the road ahead while you ride, and the Veil thins round it.' }],
    },
    { id: 'hen', name: 'Another hen', icon: ':hen:', description: 'One more hen in the pen, laying eggs.', levels: [{ cost: 90 }, { cost: 120 }, { cost: 160 }] },
    { id: 'cow', name: 'Another cow', icon: ':cow:', description: 'One more cow in the pen, giving milk.', levels: [{ cost: 260 }, { cost: 360 }] },
] as const satisfies ReadonlyArray<Omit<UpgradeDefinition, 'apply'>>;

export type OrderId = (typeof ORDER_BOOK)[number]['id'];

/** Deeds, in the order the notebook lists them. `hidden` ones stay secret until earned. */
export const DEEDS: Array<Omit<Achievement, 'done'>> = [
    { id: 'harvest', icon: ':sprout:', title: 'Soil is soil', description: 'Pick your first crop.' },
    { id: 'finds', icon: ':locket:', title: 'Put away', description: 'Dig all 8 things out of the field.', hidden: true },
    { id: 'dish', icon: ':pot:', title: 'Something hot', description: 'Cook a dish.' },
    { id: 'delivery', icon: ':alert:', title: 'Worth keeping', description: 'Fill a request.' },
    { id: 'regular', icon: ':basket:', title: 'Part of the village', description: 'Fill 10 requests.' },
    { id: 'trusted', icon: ':deposit:', title: 'Money down', description: 'Take a job that wants a deposit, and deliver it.' },
    { id: 'friend', icon: ':heart:', title: 'Easier to love', description: 'Reach 3 hearts with someone.' },
    { id: 'cauldron', icon: ':cauldron:', title: 'Funerals and weddings', description: 'Own the cauldron.' },
    { id: 'land', icon: ':wheat:', title: 'All of it under seed', description: 'Buy both extra fields.' },
    { id: 'places', icon: ':compass:', title: 'What is in this valley with me', description: 'Find all 5 places off the road.' },
    { id: 'wrap', icon: ':fog:', title: 'There is no out', description: 'Walk out of the valley and come in by the other side.' },
    { id: 'candle', icon: ':candle:', title: 'A little light', description: 'Light a grave candle.' },
    { id: 'letters', icon: ':letter:', title: 'Your neighbour, Pell', description: 'Read every letter.' },
    { id: 'bargain', icon: ':dawn:', title: 'A way home', description: 'Hear Pell out.' },
    { id: 'halfway', icon: ':fire:', title: 'It burns green', description: 'Burn half the price.' },
    { id: 'siege', icon: ':village:', title: 'Shoulder to shoulder', description: 'Be in the village square while they ring the wall.', hidden: true },
    { id: 'overrun', icon: ':ruin:', title: 'Only the porch is mine', description: 'Stand on your porch while the farm is overrun.', hidden: true },
    { id: 'dodge', icon: ':dash:', title: 'Close!', description: 'Step out from under a blow.' },
    { id: 'streak', icon: ':bell:', title: 'A good day', description: 'Fill 3 requests in one day.' },
    { id: 'noticing', icon: ':pencil:', title: 'It is an ordinary valley', description: 'Notice 4 things that are not right.' },
    { id: 'all-wrong', icon: ':mirror:', title: 'Everybody says so', description: 'Notice all 7.', hidden: true },
    { id: 'regulars', icon: ':basket:', title: 'On the day', description: 'Fill 5 regular orders.' },
    { id: 'stayed', icon: ':fog:', title: 'There are worse neighbours', description: 'Let the last day pass, and stay.', hidden: true },
    { id: 'died', icon: ':bed:', title: 'Clean sheets', description: 'Wake up in the infirmary.', hidden: true },
];
