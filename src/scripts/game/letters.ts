import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { createBillboardLabel, faceCamera } from '../helpers/text';
import { DialogueBox } from '../ui/dialogue-box';
import { createHollow, dressFolk, FolkAnimator } from '../content/folk';
import { modelled } from './models';
import { LETTERS, PELL_SPEAKS } from '../content/letters';
import type { NarrationHandle } from '../kit';

/**
 * The mailbox by the porch, and the one who fills it.
 *
 * A letter is waiting each morning from the second day. The one who writes
 * them stands on the hill above the fog, harmless, and waits to be called on:
 * first with a way home, and after the last letter with something he kept.
 */
export type LettersOptions = {
    mailbox: THREE.Vector3;
    /** Where Pell stands, and which way he faces when nobody is near. */
    hill: THREE.Vector3;
    hillYaw: number;
    /** Pell's talk about going home. Resolves false when he has nothing to say about it yet. */
    deal: (dialogue: DialogueBox) => Promise<boolean>;
    day: () => number;
    narration: NarrationHandle;
    /** Called once, when Pell hands over what he kept. */
    onGift: () => void;
};

export type LettersHandle = {
    /** How many letters have been read. */
    readonly read: number;
    readonly total: number;
    readonly metPell: boolean;
    /** True when an unread letter is in the box. */
    readonly waiting: boolean;
    readNext: () => Promise<void>;
    greetPell: () => Promise<void>;
};

export function setupLetters(game: Game, options: LettersOptions): LettersHandle {
    const box = new DialogueBox(game.screens.layer('modal'), { speed: 45 });
    let read = 0;
    let metPell = false;
    let busy = false;

    const waiting = (): boolean => read < LETTERS.length && options.day() >= (LETTERS[read]?.day ?? Infinity);

    /** Show lines in the dialogue box with the game held still, like any conversation. */
    const show = (lines: string[], speaker: string, portrait: string): Promise<void> => session(async () => void (await box.say(lines.map((text) => ({ text, portrait })), speaker)));

    /** Hold the game still with the dialogue box up for as long as `talk` runs. */
    async function session(talk: () => Promise<void>): Promise<void> {
        if (busy) return;
        busy = true;
        game.time.pause(box);
        game.screens.show('modal', box);
        try {
            await talk();
        } finally {
            game.screens.hide('modal', box);
            game.time.resume(box);
            busy = false;
        }
    }

    //#region Mailbox

    const mailbox = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3c2e, roughness: 1, flatShading: true });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), wood);
    post.position.y = 0.55;
    const tin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.46), new THREE.MeshStandardMaterial({ color: 0x5a6058, roughness: 0.7, flatShading: true }));
    tin.position.y = 1.2;
    const flag = createBillboardLabel('✉', { x: 0, y: 1.8, z: 0 }, { fontSize: 0.4, color: 0xffe2a0 });
    mailbox.add(post, tin, flag);
    modelled(game, 'mailbox', mailbox);
    mailbox.position.copy(options.mailbox);
    game.scene.add(mailbox);

    async function readNext(): Promise<void> {
        const letter = LETTERS[read];
        if (!letter || !waiting()) return;
        await show(letter.lines, `A letter (${read + 1} of ${LETTERS.length})`, '✉');
        read += 1;
        if (read === 1) void options.narration.speak(['No stamp. And it knows which bed I woke in.']);
    }

    game.interactions.add(mailbox, {
        prompt: 'Read the letter',
        blockedPrompt: () => (read >= LETTERS.length ? 'The mailbox is empty. It will stay empty now.' : 'The mailbox is empty'),
        range: 2,
        canInteract: waiting,
        onInteract: () => void readNext(),
    });

    //#endregion Mailbox

    //#region Pell

    const rig = createHollow(1);
    // Taller than the rest, and dressed: Mother Hollis finished his shawl.
    rig.root.scale.setScalar(1.22);
    const shawl = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0x5a4a52, roughness: 1, flatShading: true, side: THREE.DoubleSide }));
    shawl.position.y = 0.62;
    rig.torso.add(shawl);
    rig.root.position.copy(options.hill);
    rig.root.rotation.y = options.hillYaw;
    rig.root.name = 'pell';
    game.scene.add(rig.root);
    void dressFolk(game, rig, 'pell');
    const animator = new FolkAnimator(rig, { stutter: 3, armSwing: 0.1 });
    const head = rig.head;

    async function greetPell(): Promise<void> {
        // After the last letter he hands over what he kept, once.
        if (read >= LETTERS.length && !metPell) {
            await show(PELL_SPEAKS, 'Pell', '🕯');
            metPell = true;
            options.onGift();
            return;
        }
        let spoke = false;
        await session(async () => void (spoke = await options.deal(box)));
        if (!spoke) void options.narration.speak(['Taller than the others, and wrapped in a shawl. It does not turn. It does not reach.', 'It is looking out over the fog, at the farm. I will leave it be. For now.']);
    }

    game.interactions.add(rig.root, { prompt: () => (read >= 2 ? 'Talk to Pell' : 'Look at the tall one'), range: 2.6, onInteract: () => void greetPell() });

    //#endregion Pell

    game.systems.add({
        name: 'letters',
        order: SYSTEM_ORDER.GAMEPLAY + 9,
        update: (delta) => {
            flag.visible = waiting();
            if (flag.visible) faceCamera(flag, game.camera);
            animator.update(0, delta);
            // He does not turn his body. Only the head follows whoever passes.
            const player = game.player?.position;
            if (!player) return;
            const toPlayer = Math.atan2(player.x - rig.root.position.x, player.z - rig.root.position.z) - rig.root.rotation.y;
            const near = player.distanceTo(rig.root.position) < 14;
            const turn = near ? THREE.MathUtils.clamp(Math.atan2(Math.sin(toPlayer), Math.cos(toPlayer)), -1.3, 1.3) : 0;
            head.rotation.y += (turn - head.rotation.y) * Math.min(1, delta * 1.5);
        },
    });

    game.save.register('letters', {
        save: () => ({ read, metPell }),
        load: (data) => {
            const saved = data as { read?: number; metPell?: boolean } | undefined;
            read = saved?.read ?? 0;
            metPell = saved?.metPell ?? false;
        },
    });

    return {
        get read() {
            return read;
        },
        total: LETTERS.length,
        get metPell() {
            return metPell;
        },
        get waiting() {
            return waiting();
        },
        readNext,
        greetPell,
    };
}
