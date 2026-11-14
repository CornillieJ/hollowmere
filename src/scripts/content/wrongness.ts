/**
 * The things that are not right in the valley, and the things it leaves lying
 * about. Nothing here is ever explained, by anyone. The logic that shows them
 * is in `game/wrongness.ts`, `game/omens.ts` and `game/whispers.ts`.
 */

export type WrongId = 'scarecrow' | 'sign' | 'denial' | 'house' | 'double' | 'clock' | 'night';

export const WRONG_FROM: Record<WrongId, number> = { sign: 2, scarecrow: 3, denial: 4, clock: 5, house: 6, night: 7, double: 8 };

export const NOTES: Record<WrongId, { title: string; text: string }> = {
    scarecrow: { title: 'The scarecrow', text: 'It is nearer the house each morning, and it faces the door. I carry it back. I do not remember ever moving it.' },
    sign: { title: 'The signpost', text: 'The board at the gate does not say what it said. Nobody has painted it. The paint is old.' },
    denial: { title: 'Yesterday', text: 'I talked to them yesterday. They say I did not, and they are not lying. They never lie.' },
    house: { title: 'The house in the woods', text: 'A house off the road, with a lamp in the window. When I walked up to it there was grass, and not a mark on the grass.' },
    double: { title: 'Somebody on the road', text: 'Standing still, at dusk, a long way down the road. My coat. My ears. Nobody there when I reached the place.' },
    clock: { title: 'The hour', text: 'For a moment it was a time that is not a time. Then it was the right one again, and I could not swear to which is true.' },
    night: { title: 'In the night', text: 'Things are done before I wake. The field watered. A second plate. I live alone here.' },
};

export const DENIALS: Record<string, string> = {
    barnaby: 'Yesterday? You were not in yesterday. I have the book open here: there is a line ruled for you, and nothing written on it.',
    wren: 'We did not talk yesterday! I would remember. I talked to the other one. The one who looks like you from behind.',
    fen: 'I did not see you yesterday. I called at your door and it was opened, but not by you. I know your face. That one had it on wrong.',
    hollis: 'Yesterday, dear? No. Yesterday you sat with me the whole afternoon and never said a word. I thought it so restful.',
    pike: 'You were not here yesterday. Your smell was. It went twice round the square and then home, without you.',
};

/** What the board at the gate says, by how far along things are. */
export const SIGNS: Array<[string, string]> = [
    ['HOLLOWVEIL  >', '1 mile'],
    ['HOLLOWVEIL  >', 'not far'],
    ['<  HOLLOWVEIL', 'you live here'],
    ['HOLLOWVEIL', 'there is no other place'],
    ['STAY', 'we like you'],
];

export const NIGHT_ROWS: Array<{ icon: string; title: string }> = [
    { icon: ':plate:', title: 'There were 2 plates on the table' },
    { icon: ':bed:', title: 'The bed was made. You were in it' },
    { icon: ':door:', title: 'The door was bolted from the outside' },
    { icon: ':coat:', title: 'Your coat was wet. It did not rain' },
    { icon: ':candle:', title: 'A candle had burned down on the sill. You own no such candle' },
];

export type OmenKind = 'blood' | 'trail' | 'boot' | 'basket' | 'lantern' | 'shawl' | 'wheel';

type Omen = { kind: OmenKind; x: number; z: number; fromDay: number; yaw?: number };

/** Mostly along the road and across the open ground between it and the pool. */
export const OMENS: Omen[] = [
    { kind: 'blood', x: -30, z: 33, fromDay: 2 },
    { kind: 'boot', x: -17, z: 19.5, fromDay: 2, yaw: 0.8 },
    { kind: 'trail', x: -2, z: 9, fromDay: 3, yaw: 2.3 },
    { kind: 'basket', x: 14, z: -7, fromDay: 3 },
    { kind: 'blood', x: 15.5, z: -6, fromDay: 3 },
    { kind: 'lantern', x: 31, z: -22, fromDay: 4, yaw: 1 },
    { kind: 'blood', x: 40, z: 12, fromDay: 4 },
    { kind: 'trail', x: 42, z: 14, fromDay: 4, yaw: 0.6 },
    { kind: 'shawl', x: -40, z: 2, fromDay: 5 },
    { kind: 'wheel', x: -22, z: 52, fromDay: 5, yaw: 0.4 },
    { kind: 'blood', x: -38.5, z: 24, fromDay: 6 },
    { kind: 'trail', x: -37, z: 22.5, fromDay: 6, yaw: -0.4 },
    { kind: 'boot', x: 46, z: -8, fromDay: 7, yaw: 2 },
    { kind: 'blood', x: -55, z: 22, fromDay: 8 },
    { kind: 'basket', x: 60, z: 20, fromDay: 8 },
    { kind: 'blood', x: 36, z: -31, fromDay: 9 },
    { kind: 'trail', x: 34, z: -33, fromDay: 9, yaw: 1.2 },
    { kind: 'shawl', x: -8, z: 40, fromDay: 10 },
];

export const OMEN_THOUGHTS: Record<OmenKind, string[]> = {
    blood: ['Blood. A lot of it, and not old.', 'Nobody in the village said anyone was hurt.'],
    trail: ['Something heavy was dragged through here. Into the trees.'],
    boot: ['One boot. Laced. Whoever wore it did not take it off.'],
    basket: ['A market basket, tipped over. The eggs are still in it.'],
    lantern: ['A lantern, broken. The glass is on the inside. It was dropped while it was lit.'],
    shawl: ['One of Mother Hollis\'s shawls, lying in the grass. Finished. Folded.'],
    wheel: ['A cart wheel. No cart.'],
};

/** A dim line in the morning panel every other day from day 3. Nothing comes of any of them. */
export const MORNING_SIGNS = [
    'Small muddy prints on the porch, going in. None coming out.',
    'The dog slept facing the door all night.',
    'Your boots were by the bed, laced, and wet.',
    'The well bucket was down. You left it up.',
    'Someone has swept the porch.',
    'A long scratch on the outside of the door, at the height of your face.',
    'The scarecrow has dew on it everywhere except its face.',
    'The hens would not come out until the sun was up.',
    'A chair was pulled out from the table, facing the bed.',
    'Your name was said once, outside, just before you woke. Not loudly.',
    'The kettle was warm.',
    'Fog on the inside of the window. Something was written in it, and then rubbed out.',
];

/** Heard in the fog at night, from nowhere in particular. */
export const VOICES = [
    '"Is that you, dear? Come away from the road."',
    '"I can see you! Can you see me?"',
    '"Store is open. Store is always open."',
    '"Signed for. Signed for. Signed for."',
    '"Over here." It was your own voice.',
];
