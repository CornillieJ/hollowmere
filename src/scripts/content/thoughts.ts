/**
 * Everything the farmer says to themself, and the longer things other people say
 * in passing. Kept here, apart from the game logic, so the voice can be read
 * and rewritten in one place.
 *
 * Writing rules:
 *  - The farmer is dry, a little scared, and uses contractions.
 *  - A hint on how to play goes last, in brackets.
 *  - Something is wrong with the village and its people. Nobody says what.
 *
 * `{name}` in a line is filled in by the game with `fill`.
 */

/** Fill `{name}` slots in lines with values. */
export function fill(lines: string[], values: Record<string, string | number>): string[] {
    return lines.map((line) => line.replace(/\{(\w+)\}/g, (slot, key: string) => (key in values ? String(values[key]) : slot)));
}

/** Thought once, the first time something happens. Looked up by id. */
export const THOUGHTS: Record<string, string[]> = {
    late: [
        "They weren't expecting anybody at the door after dark. They paid half as much again and didn't count it.",
        '(Every delivery made at night pays 50% more. The road there is the price.)',
    ],
    scarecrow: [
        "There. It isn't looking at the field. It's looking at the house.",
        "Barnaby says they weep in the small hours, and that I shouldn't go and ask one why.",
    ],
    find: [
        "Something hard under the roots. That isn't a stone.",
        "Somebody's things are in this field. Barnaby will buy them, I'd bet, and I'd bet he won't ask where they came from.",
    ],
    'finds-all': [
        "That's 8 things out of 1 field. A whole life's worth of small things.",
        "Nobody loses all that by accident. Whoever farmed here before me didn't leave. They were put away.",
    ],
    golden: [
        "It's gold. Not the colour of gold: gold, all through, and heavy with it.",
        "Things grow how they like here. I'm not going to complain about this one.",
    ],
    bloom: [
        "It came away in my hand like it wanted to. Still glowing.",
        "They only open in the dark, away from the lamps. Of course they do. Barnaby will pay for this, and I'll have earned it.",
    ],
    basket: [
        "There's a cloth in the basket on the handlebars. Somebody was riding hot food about before I was.",
        '(A dish cools half as fast while you ride.)',
    ],
    hot: [
        "Hot from the pot. It won't stay that way: {hours} hours, maybe, then it's only warm, then it's cold.",
        "They pay more for hot food, and every visit eats hours. So who gets theirs first is worth a thought.",
    ],
    barn: [
        "Straw, horses, one lamp. This place seems safe.",
    ],
    candle: [
        "A little light, and they keep off. It won't burn long.",
    ],
    lantern: [
        "There. A ring of light they won't step into, and the Veil pulls back from it a little.",
        "It's got a day of oil in it. A flask buys another day. If I let it go dark it's only a post.",
    ],
    wade: [
        "Cold. And it drags at my legs. I'm not getting anywhere fast in this.",
    ],
    night: [
        "Night. There are more of them now, and they've stopped wandering. They're standing still, facing the house.",
        "A lamp, a candle, a door. Or the bicycle, and I don't stop.",
    ],
    scent: [
        "They turned their heads. All of them, the same way, as I came past with the basket.",
        "It's the food. They can smell it while it's hot. The more I carry, the further off they notice, and the more of them come.",
    ],
    yard: [
        "The fog's moving differently now. Closer. As if it's stopped waiting to see what I'd do.",
        "From here on they'll come looking. The porch light, the barn lamp, the village lamps: that's where I'm safe.",
    ],
    thick: [
        "I can hardly see my own hands. It wasn't like this at noon, or near the lamps.",
        "The Veil's thickest late in the day and far from any light. A lantern on the way would make a hole in it.",
    ],
    wrap: [
        "The Veil went solid white, and then it thinned again.",
        "I'm on the far side of the valley. I walked out one way and came back in by the other. There's no out.",
    ],
    fishing: [
        "Somebody left a rod here, and the line's still good. Black water, no wind. Something lives in it, I've seen the rings.",
        "(When the float goes under, press E at once. Too soon or too late and the hook comes back bare.)",
    ],
    eel: [
        "That's not a fish. It's as long as my arm and it hasn't got a face.",
        "It's still pulling. Barnaby can have it.",
    ],
    'pool-back': [
        "Cold, right up to the shoulder. And then a strap in my hand. Mine.",
        "Everything I was carrying when they got me. All laid out down there, in a row.",
        "I never felt the bottom. I felt it being handed up.",
    ],
    hill: [
        "Pell's note says to come up the hill, to the old tree. And the days are counting whether I go or not.",
        '(The west path from the chapel. :hill: on the compass.)',
    ],
    edge: [
        "The fog's getting thicker out here. I can't see the ground in front of me. This must be what they mean by the Veil.",
    ],
    dusk: [
        "The light's going. There'll be more of them soon.",
        "A lamp, a door, or the bicycle. Not the open road.",
    ],
    hollow: [
        "It's seen me. It doesn't hurry. It doesn't need to, I think.",
        "(They're slow. Walk away and they lose interest.)",
    ],
    'first-hollow': [
        "There. Out past the trees. That's not a person. It stands like a coat on a hook.",
        "It isn't coming any closer. Something about the lamps, I think. It stays where the light stops.",
    ],
    'dog-growl': [
        "The dog's gone stiff. It's growling at the fog, and I can't see a thing out there.",
        "It can smell them before I can see them. That's worth more than the lamp.",
    ],
    'dog-pet': [
        "Thin as a rake, and it leans on my leg like it's known me for years.",
        "All right. You can stay. I don't know what I'll call you.",
    ],
    dog: [
        "There's a dog on the porch. Grey, thin, one ear down. It looks at me as if I were late.",
        "It isn't afraid of the fog. I wish I knew whether that was a good sign. (Press E to pet it. It follows you, and it growls when one of them is near.)",
    ],
    pedlar: [
        "Nobody comes up this road. And yet here's a cart, and a fox in a hat behind it, smiling like we'd arranged it.",
        '"I pay better than the shopkeeper," it says. "Anything at all. I\'m not from round here either."',
    ],

    // Places, the first time the farmer comes near them: see `SIGHTS` in `world.ts`.
    pool: ["Still water. Not a breath of wind on it.", "Black, and it doesn't show the sky. I don't think I'll drink from it."],
    lookout: ["Above the fog, at last.", "From up here it nearly looks like home. Nearly."],
    stones: ['Somebody stood these up. Somebody still keeps the candle lit.'],
    ruin: ["Another farm. So there was another farmer.", "The scarecrow's facing the house."],
    graveyard: ["One of these is open. And there's nobody in it."],

    // Things that are not right, noticed once each: see `game/wrongness.ts`.
    'wrong-scarecrow': ['The scarecrow is not where it was. It is nearer the house.', 'I must have moved it. I must have.'],
    'wrong-denial': ['I did speak to them yesterday. I remember what was said.', 'They are not lying. Nobody here lies. So one of us was somewhere else yesterday, and they seem very sure it was me.'],
    'wrong-house': ['There was a house here. A lamp in the window. I saw it from the road.', 'There is not a mark on the grass.'],
    'wrong-double': ['Somebody was standing in the road. Standing quite still. My coat. My ears.', 'There is nobody here now. There are no tracks but mine, and mine come from both directions.'],
    'wrong-clock': ['The hour. For a moment it was not an hour at all.', 'It is right again now. I think it is right.'],
    'wrong-scarecrow-door': ["The scarecrow's standing at the edge of the porch light. Facing the door.", "I didn't put it there. I'm going to carry it back, and I'm not going to think about it."],
    'wrong-sign': ['"{bottom}." It did not say that. It said a mile.', 'Nobody has painted it. The paint is old and cracked right through the letters.'],

    note: [
        "A sheet of paper, weighed down with a stone. Red letters, dried hard, written with a fingertip:",
        '"THEY STOP AT THE LIGHT. REMEMBER THAT."',
        "That isn't ink. Somebody wanted me to know it badly enough to bleed for it. Lamps, candles, a lit porch. I'll remember.",
    ],
};

/** Said every time it happens, not only once. */
export const SAY = {
    /** Waking in the infirmary after dying. */
    wake: ["The infirmary. Clean sheets. Nobody about.", '{days} days gone, and my pockets with them. Whoever was waiting on me has given up.', "They left my tools by the cot. Back to the farm, then. And I'll be more careful."],
    /** A lost tool turns up again. */
    toolBack: ['My {tool}, leaning against the door. Fen must have found it on the road.'],
    /** No seeds, no money, nothing growing. */
    rescueSeeds: ["A paper twist of turnip seeds on the doorstep.", 'Barnaby has written on it: "On account. Do not let it happen twice."'],
    firstLetter: ['No stamp. And it knows which bed I woke in.'],
    /** Walking up to Pell before the letters have said who he is. */
    pellSilent: ['Taller than the others, and wrapped in a shawl. It does not turn. It does not reach.', 'It is looking out over the fog, at the farm. I will leave it be. For now.'],
    escapeNote: [
        'A note under the door. The hand is careful, as if every word had to be fetched.',
        '"There is a way to wake. It costs {price}, and you have until the end of day {deadline}. The days are already counting. Come up the hill. Pell."',
        '{days} days. So I had better find out what he means. (The west path from the chapel. :hill: on the compass.)',
    ],
    escapeKept: ["That's all of it. Burned.", 'Pell says the rest is simple: go home, lie down in that bed, and mean it. (Sleep at the farmhouse door.)'],
    escapeMissed: [
        'The last day came and went.',
        'I tried to say the name of my own street this morning. I said "Hollowveil". It felt true.',
        "So I'm not going home. I expect I'll know it properly once I've slept on it. (Go to bed.)",
    ],
    /** Pell on the hill, the first time. */
    pellExplains: [
        'You came. Good. Up here, above the Veil, I can still put words in a row.',
        'You have heard them say it by now. The Veil, for the fog: it is what hangs between sleeping and waking. The Hollow, for us out in it: what is left of a dreamer who never woke.',
        'Hollow, behind the Veil. That is all the name of the village ever meant. And you keep a farm in it.',
        'There is a way to wake. Your own bed. Your real life. I found it too late to use it. You are not too late.',
        'It costs. Everything that crosses costs. {price}, burned here at the old tree. A little at a time, or all at once.',
        'And there is a clock on it. It started the morning my note reached you: nobody gets to choose the day. You have {daysLeft} left, to the end of day {deadline}. After that the Veil closes over your name, and you never wake. You would be Hollow, as I am.',
        'I will be here. Call on me when you have coins to burn.',
        'And do not die out there. Each time you do, {daysLost} of your days go with you.',
    ],
    afterPell: [
        "{remaining} in {daysLeft} days. That's a lot of soup.",
        "Hollowveil Farm. So that's what I've been calling home: a farm for the hollow, on the wrong side of the veil.",
        'But there is a way back through. (Bring coins to Pell on the hill whenever there are some to spare. What is left, and the days, show under the clock.)',
    ],
};
