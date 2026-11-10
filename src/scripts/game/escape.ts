import { addPledge, type NarrationHandle, type PledgeHandle, type ResourceHandle } from '../kit';
import type { DialogueBox } from '../ui/dialogue-box';

/**
 * The way out. Pell, who had the farm before and now stands on the hill above
 * the fog, knows how to wake up: he found it too late to use it himself. He
 * will teach it for a price, and only before a deadline. Saying yes starts the
 * countdown. It can be paid in parts, and he waits on the hill to be called on.
 *
 * Paid in full, the next night's sleep is the last one here. If the last day
 * passes first, the farmer never wakes, and the game goes on as a life.
 */
export const ESCAPE = {
    /** Coins to burn at the old tree. */
    price: 12000,
    /** Days allowed, counting the day the farmer says yes. */
    days: 60,
    /** The first day Pell asks to be met on the hill. */
    fromDay: 3,
};

const PELL = '🕯';

export type EscapeHandle = {
    readonly pledge: PledgeHandle;
    /** True from the day Pell is ready to talk until the farmer has answered him. */
    readonly waiting: boolean;
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
        hudLabel: 'to wake',
        format,
        onKept: () => void narration.speak(['That is all of it. Burned.', 'Pell says the rest is simple: go home, lie down in that bed, and mean it. (Sleep at the farmhouse door.)']),
        onMissed: () =>
            void narration.speak([
                'The last day came and went.',
                'I tried to say the name of my own street this morning. I said "Hollowmere". It felt true.',
                'So I am not going home. There are worse places. There are worse neighbours. The field wants planting.',
            ]),
    });
    const line = (text: string): { text: string; portrait: string } => ({ text, portrait: PELL });

    async function offer(dialogue: DialogueBox): Promise<void> {
        const yes = await dialogue.say<boolean>(
            [
                line('You came. Good. Up here, above the fog, I can still put words in a row.'),
                line('There is a way to wake. Your own bed. Your real life. I found it too late to use it. You are not too late.'),
                line(`It costs. Everything that crosses costs. ${format(ESCAPE.price)}, burned here at the old tree. A little at a time, or all at once.`),
                line(`And there is a clock on it. ${ESCAPE.days} days from the day you say yes. After that the valley has your name by heart, and you never wake.`),
                {
                    text: `${format(ESCAPE.price)} within ${ESCAPE.days} days, or you stay, as I stayed. The days start the moment you say yes. Do you say yes?`,
                    portrait: PELL,
                    choices: [
                        { label: `Yes (${ESCAPE.days} days start now)`, value: true },
                        { label: 'Not yet', value: false },
                    ],
                },
            ],
            'Pell',
        );
        if (!yes) {
            await dialogue.say([line('Then I will wait. I am good at it now. Come back and say yes.')], 'Pell');
            return;
        }
        pledge.start(ESCAPE.days);
        await dialogue.say([line('Then it has begun. I will be here. Call on me when you have coins to burn.'), line('And do not die out there. Each time you do, 3 of your days go with you.')], 'Pell');
        void narration.speak([
            `${format(ESCAPE.price)} in ${ESCAPE.days} days. That is a great deal of soup.`,
            'But it is a way home. (Bring coins to Pell on the hill whenever there are some to spare. What is left, and the days, show at the bottom right.)',
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
            return options.day() >= ESCAPE.fromDay && pledge.state === 'idle';
        },
        talk: async (dialogue) => {
            if (pledge.state === 'running') await pay(dialogue);
            else if (pledge.state === 'idle' && options.day() >= ESCAPE.fromDay) await offer(dialogue);
            else if (pledge.state === 'missed') await dialogue.say([line('The day passed. I am sorry. I did say.'), line('You will stop minding. That is the worst thing I can tell you, and it is also the kindest.')], 'Pell');
            else if (pledge.state === 'kept') await dialogue.say([line('It is paid. Go home and sleep.')], 'Pell');
            else return false;
            return true;
        },
    };
}
