import { fill, SAY } from '../content/thoughts';
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
        onKept: () => void narration.speak(SAY.escapeKept),
        onMissed: () => void narration.speak(SAY.escapeMissed),
    });
    let met = false;
    game.save.register('escape-met', { save: () => met, load: (data) => (met = data === true) });
    // The count starts by itself. Checked all the time, so an older save that never said yes is caught up too.
    game.systems.add({
        name: 'escape-begins',
        update: () => {
            if (pledge.state !== 'idle' || options.day() < ESCAPE.fromDay) return;
            pledge.start(ESCAPE.days);
            void narration.speak(fill(SAY.escapeNote, { price: format(ESCAPE.price), deadline: pledge.deadline, days: ESCAPE.days }));
        },
    });
    const line = (text: string): { text: string; portrait: string } => ({ text, portrait: PELL });

    async function explain(dialogue: DialogueBox): Promise<void> {
        await dialogue.say(
            fill(SAY.pellExplains, { price: format(ESCAPE.price), daysLeft: pledge.daysLeft, deadline: pledge.deadline, daysLost: DAYS_LOST }).map(line),
            'Pell',
        );
        met = true;
        void narration.speak(fill(SAY.afterPell, { remaining: format(pledge.remaining), daysLeft: pledge.daysLeft }));
    }

    async function pay(dialogue: DialogueBox): Promise<void> {
        const purse = coins.value();
        const amounts = [500, 2000].filter((amount) => amount < purse && amount < pledge.remaining);
        const asks = fill(SAY.pellAsks, { remaining: format(pledge.remaining), daysLeft: pledge.daysLeft, purse: format(purse) });
        const amount = await dialogue.say<number>(
            [
                line(asks[0] as string),
                {
                    text: asks[1] as string,
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
        if (pledge.state === 'running') await dialogue.say(fill(SAY.pellBurned, { paid: format(paid), remaining: format(pledge.remaining) }).map(line), 'Pell');
        else await dialogue.say(SAY.pellPaidAll.map(line), 'Pell');
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
            else if (pledge.state === 'missed') await dialogue.say(SAY.pellMissed.map(line), 'Pell');
            else if (pledge.state === 'kept') await dialogue.say(SAY.pellKept.map(line), 'Pell');
            else return false;
            return true;
        },
    };
}
