import { addPledge, type NarrationHandle, type PledgeHandle, type ResourceHandle } from '../kit';
import type { DialogueBox } from '../ui/dialogue-box';

/**
 * The way out. Pell, who had the farm before and now stands on the hill above
 * the fog, knows how to wake up: he found it too late to use it himself. He
 * will teach it for a price, and only before a deadline. Nobody is asked: his
 * note is under the door on the morning of day 3 and the days count from then,
 * so there is no saving up first. It can be paid in parts, and he waits on the
 * hill to be called on.
 *
 * Paid in full, the next night's sleep is the last one here. If the last day
 * passes first, the farmer never wakes, and the game goes on as a life.
 */
export const ESCAPE = {
    /** Coins to burn at the old tree. */
    price: 6000,
    /** Days allowed, counting the day the note arrives. An evening's play, not a season's. */
    days: 25,
    /** The day Pell's note is under the door, and the count begins. */
    fromDay: 3,
};

/** Days gone each time the farmer dies. */
export const DAYS_LOST = 2;

const PELL = ':face-pell:';

export type EscapeHandle = {
    readonly pledge: PledgeHandle;
    /** True from the day the count begins until the farmer has been up the hill to hear why. */
    readonly waiting: boolean;
    /** True once Pell has explained himself. */
    readonly met: boolean;
    /**
     * Pell's side of a meeting on the hill: the offer, or taking a payment.
     * @returns False when he has nothing to say about it yet.
     */
    talk: (dialogue: DialogueBox) => Promise<boolean>;
};

export function setupEscape(game: Game, options: { coins: ResourceHandle; day: () => number; narration: NarrationHandle; format: (amount: number) => string }): EscapeHandle {
    const { coins, narration, format } = options;
    const pledge = addPledge(game, {
        id: 'escape',
        target: ESCAPE.price,
        currency: coins,
        day: options.day,
        format,
        onKept: () => void narration.speak(['That is all of it. Burned.', 'Pell says the rest is simple: go home, lie down in that bed, and mean it. (Sleep at the farmhouse door.)']),
        onMissed: () =>
            void narration.speak([
                'The last day came and went.',
                'I tried to say the name of my own street this morning. I said "Hollowveil". It felt true.',
                'So I am not going home. I think I will know it properly when I have slept on it. (Go to bed.)',
            ]),
    });
    let met = false;
    game.save.register('escape-met', { save: () => met, load: (data) => (met = data === true) });
    // The count starts by itself. Checked all the time, so an older save that never said yes is caught up too.
    game.systems.add({
        name: 'escape-begins',
        update: () => {
            if (pledge.state !== 'idle' || options.day() < ESCAPE.fromDay) return;
            pledge.start(ESCAPE.days);
            void narration.speak([
                'A note under the door. The hand is careful, as if every word had to be fetched.',
                `"There is a way to wake. It costs ${format(ESCAPE.price)}, and you have until the end of day ${pledge.deadline}. The days are already counting. Come up the hill. Pell."`,
                `${ESCAPE.days} days. So I had better find out what he means. (The west path from the chapel. :hill: on the compass.)`,
            ]);
        },
    });
    const line = (text: string): { text: string; portrait: string } => ({ text, portrait: PELL });

    async function explain(dialogue: DialogueBox): Promise<void> {
        await dialogue.say(
            [
                line('You came. Good. Up here, above the Veil, I can still put words in a row.'),
                line('You have heard them say it by now. The Veil, for the fog: it is what hangs between sleeping and waking. The Hollow, for us out in it: what is left of a dreamer who never woke.'),
                line('Hollow, behind the Veil. That is all the name of the village ever meant. And you keep a farm in it.'),
                line('There is a way to wake. Your own bed. Your real life. I found it too late to use it. You are not too late.'),
                line(`It costs. Everything that crosses costs. ${format(ESCAPE.price)}, burned here at the old tree. A little at a time, or all at once.`),
                line(`And there is a clock on it. It started the morning my note reached you: nobody gets to choose the day. You have ${pledge.daysLeft} left, to the end of day ${pledge.deadline}. After that the Veil closes over your name, and you never wake. You would be Hollow, as I am.`),
                line('I will be here. Call on me when you have coins to burn.'),
                line(`And do not die out there. Each time you do, ${DAYS_LOST} of your days go with you.`),
            ],
            'Pell',
        );
        met = true;
        void narration.speak([
            `${format(pledge.remaining)} in ${pledge.daysLeft} days. That is a great deal of soup.`,
            'Hollowveil Farm. So that is what I have been calling home: a farm for the hollow, on the wrong side of the veil.',
            'But there is a way back through. (Bring coins to Pell on the hill whenever there are some to spare. What is left, and the days, show under the clock.)',
        ]);
    }

    async function pay(dialogue: DialogueBox): Promise<void> {
        const purse = coins.value();
        const amounts = [500, 2000].filter((amount) => amount < purse && amount < pledge.remaining);
        const amount = await dialogue.say<number>(
            [
                line(`${format(pledge.remaining)} still to burn, and ${pledge.daysLeft} days to find it in.`),
                {
                    text: `You have ${format(purse)} on you. How much goes on the fire today?`,
                    portrait: PELL,
                    choices: [
                        ...amounts.map((value) => ({ label: `Burn ${format(value)}`, value })),
                        ...(purse > 0 ? [{ label: `Burn ${format(Math.min(purse, pledge.remaining))} (${purse >= pledge.remaining ? 'all that is left to pay' : 'everything I have'})`, value: purse }] : []),
                        { label: 'Nothing today', value: 0 },
                    ],
                },
            ],
            'Pell',
        );
        if (!amount) return;
        const paid = pledge.pay(amount);
        if (pledge.state === 'running') await dialogue.say([line(`${format(paid)}. It burns green. ${format(pledge.remaining)} to go.`)], 'Pell');
        else await dialogue.say([line('That is the last of it. I did not think anyone would.'), line('Go home. Sleep. Mean it. And when you wake, plant something for me.')], 'Pell');
    }

    return {
        pledge,
        get waiting() {
            return pledge.state === 'running' && !met;
        },
        get met() {
            return met;
        },
        talk: async (dialogue) => {
            if (pledge.state === 'running' && !met) await explain(dialogue);
            else if (pledge.state === 'running') await pay(dialogue);
            else if (pledge.state === 'missed') await dialogue.say([line('The day passed. I am sorry. I did say.'), line('You will stop minding. That is the worst thing I can tell you, and it is also the kindest.')], 'Pell');
            else if (pledge.state === 'kept') await dialogue.say([line('It is paid. Go home and sleep.')], 'Pell');
            else return false;
            return true;
        },
    };
}
