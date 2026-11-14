/**
 * The letters in the mailbox. One arrives each morning from the second day.
 *
 * They are from Pell, who had the farm before, written to whoever wakes there
 * next. He is kind, he is tired, and he is not where a letter-writer should be.
 * Fen delivers them because the name on the envelope has finally come to match.
 * The third asks the farmer up the hill, where Pell waits with a way home.
 */
export type Letter = { day: number; lines: string[] };

export const LETTERS: Letter[] = [
    {
        day: 2,
        lines: [
            'To whoever wakes in my bed.',
            'You will have tried the road out by now. The fog takes you and puts you down on the far side. They call it the Veil here. Do not take it to heart, it does that to everyone.',
            'The seeds grow fast here. Eat. Feed the village. They are good people, in the way that weather is good.',
            'I will write again. I have the time. P.',
        ],
    },
    {
        day: 3,
        lines: [
            'You are settling in. I can tell by the smoke from the pot.',
            'I woke here too, you know. I had a kitchen somewhere, and a dog that was only a dog. I kept the names in my head as long as I could.',
            'Write yours down tonight. Put it under the bed. You will want it later, and it will not be where you left it.',
            'There is a way home. It is not cheap and it does not wait. I have put the sum under your door. Come up the hill when you have read it, west of the chapel, to the old tree. Above the Veil I can still think.',
            'P.',
        ],
    },
    {
        day: 4,
        lines: [
            'A word about Mother Hollis. She will tell you I was not kind. She is right.',
            'I was afraid of them. Of the child most of all. I would not sit at their table, and a village notices an empty chair.',
            'They did not hurt me. I want you to know that. They walked me out at dusk, very gently, and Pike sat with me until it was done.',
            'Be kinder than I was. It is not hard. They make it easy. P.',
        ],
    },
    {
        day: 5,
        lines: [
            'It is not so bad, out here. It is quiet. I am never hungry, only reminded.',
            'The others do not talk. I think they could. I think they are being polite.',
            'I watch your lamp from the road at night. I hope that is a comfort and not the other thing.',
            'P.',
        ],
    },
    {
        day: 6,
        lines: [
            'Last one. My hands are not what they were, and Fen says the name on the envelope is nearly right now.',
            'You know me by now: the tall one on the hill, by the old tree. I do not chase. I never learned how.',
            'Come up once more. Bring nothing. I kept something of yours safe, from the morning you arrived.',
            'Your neighbour, Pell.',
        ],
    },
];

/** What Pell says, in his way, when the farmer finally stops at the bend. */
export const PELL_SPEAKS = [
    '...',
    'You... came.',
    'I kept it... for you.',
    'The name. You wrote it... and put it under the bed.',
    'Take it home. Read it... every morning. It helps.',
    'Good... neighbour.',
];
