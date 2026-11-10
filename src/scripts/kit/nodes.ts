import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { randomInt } from '../helpers/random';
import type { PhysicsBody } from '../physics/physics';

//#region Resource nodes

/**
 * Things in the world to gather from: trees to chop, rocks to mine, mushrooms
 * to pick. A node takes a number of hits, maybe with a tool in hand, drops
 * items when it gives way, and grows back after a while.
 *
 * ```ts
 * const nodes = addResourceNodes(game, {
 *     kinds: {
 *         tree: { name: 'tree', verb: 'Chop', tool: 'axe', toolName: 'axe', hits: 4, drops: [{ itemId: 'wood', amount: [2, 4] }], respawnSeconds: 600, solid: { radius: 0.45, height: 4 } },
 *         mushroom: { name: 'mushrooms', verb: 'Pick', hits: 1, drops: [{ itemId: 'mushroom', amount: 1 }], respawnSeconds: 300 },
 *     },
 *     nodes: trees.map((object) => ({ kind: 'tree', object })),
 *     held: () => hotbar.selectedId,
 *     give: (itemId, amount) => bag.add(itemId, amount),
 * });
 * ```
 */
export type NodeKind = {
    /** Used in the prompt: "Chop the tree". */
    name: string;
    verb: string;
    /** Item id that must be held. Omit for bare hands. */
    tool?: string;
    /** How the tool is named in the "you need..." prompt. */
    toolName?: string;
    /** Hits before it gives way. */
    hits: number;
    drops: Array<{ itemId: string; amount: number | [number, number] }>;
    /** Seconds until it is back. Omit for a node that is gone for good. */
    respawnSeconds?: number;
    /** A collider around the node, removed while it is down. */
    solid?: { radius: number; height: number };
    /** What is left behind while it is down, e.g. a stump. */
    remains?: (node: ResourceNode) => THREE.Object3D;
    range?: number;
};

export type ResourceNode = {
    index: number;
    kind: NodeKind;
    kindId: string;
    /** The standing visual, already placed in the scene. */
    object: THREE.Object3D;
    hitsLeft: number;
    /** Seconds until it returns; 0 while standing. */
    respawnIn: number;
    readonly depleted: boolean;
};

export type AddResourceNodesOptions = {
    kinds: Record<string, NodeKind>;
    nodes: Array<{ kind: string; object: THREE.Object3D }>;
    /** The item in the player's hand, for tool checks. */
    held?: () => string | undefined;
    /** Receives the drops. */
    give: (itemId: string, amount: number) => void;
    onHit?: (node: ResourceNode) => void;
    onDepleted?: (node: ResourceNode, drops: Array<{ itemId: string; amount: number }>) => void;
    /** Save key. Omit to not save. */
    persist?: string;
};

export type ResourceNodesHandle = {
    readonly nodes: ResourceNode[];
    /** Hit a node as if the player pressed the key at it. Returns false when the tool is wrong or it is down. */
    hit: (node: ResourceNode) => boolean;
    /** Hit the closest standing node within reach of the player, e.g. from a hotbar "use". */
    hitNearest: (range?: number) => boolean;
    /** Bring every node back now. */
    restore: () => void;
    dispose: () => void;
};

type Internal = ResourceNode & { hitsLeft: number; respawnIn: number; body: PhysicsBody | undefined; remains: THREE.Object3D | undefined; shake: number; baseRotation: THREE.Euler };

export function addResourceNodes(game: Game, options: AddResourceNodesOptions): ResourceNodesHandle {
    const removers: Array<() => void> = [];
    const hasTool = (kind: NodeKind): boolean => !kind.tool || options.held?.() === kind.tool;

    const nodes: Internal[] = options.nodes.map((entry, index) => {
        const kind = options.kinds[entry.kind];
        if (!kind) throw new Error(`[nodes] unknown node kind "${entry.kind}"`);
        entry.object.updateMatrixWorld(true);
        const position = entry.object.getWorldPosition(new THREE.Vector3());
        const body = kind.solid
            ? game.physics.add({
                  kind: 'fixed',
                  shape: { type: 'cylinder', radius: kind.solid.radius, height: kind.solid.height },
                  position: new THREE.Vector3(position.x, position.y + kind.solid.height / 2, position.z),
                  syncObject: false,
                  tag: 'wall',
              })
            : undefined;
        const node: Internal = {
            index,
            kind,
            kindId: entry.kind,
            object: entry.object,
            hitsLeft: kind.hits,
            respawnIn: 0,
            body,
            remains: undefined,
            shake: 0,
            baseRotation: entry.object.rotation.clone(),
            get depleted() {
                return this.respawnIn > 0 || this.hitsLeft <= 0;
            },
        };
        removers.push(
            game.interactions.add(entry.object, {
                prompt: `${kind.verb} the ${kind.name}`,
                blockedPrompt: `Hold the ${kind.toolName ?? kind.tool ?? 'tool'} to ${kind.verb.toLowerCase()} this`,
                range: kind.range ?? 2.3,
                canInteract: () => hasTool(kind),
                onInteract: () => void hit(node),
            }),
        );
        return node;
    });

    function setDown(node: Internal, down: boolean): void {
        node.object.visible = !down;
        node.body?.setEnabled(!down);
        game.interactions.setEnabled(node.object, !down);
        if (down && node.kind.remains && !node.remains) {
            node.remains = node.kind.remains(node);
            node.remains.position.copy(node.object.position);
            node.object.parent?.add(node.remains);
        }
        if (node.remains) node.remains.visible = down;
        if (!down) {
            node.hitsLeft = node.kind.hits;
            node.respawnIn = 0;
        }
    }

    function hit(node: Internal): boolean {
        if (node.depleted || !hasTool(node.kind)) return false;
        node.hitsLeft -= 1;
        node.shake = 0.35;
        options.onHit?.(node);
        if (node.hitsLeft > 0) return true;
        const drops = node.kind.drops.map((drop) => ({ itemId: drop.itemId, amount: Array.isArray(drop.amount) ? randomInt(drop.amount[0], drop.amount[1]) : drop.amount }));
        for (const drop of drops) options.give(drop.itemId, drop.amount);
        // A node without a respawn time stays down: mark it with a time that never runs out.
        node.respawnIn = node.kind.respawnSeconds ?? Infinity;
        setDown(node, true);
        options.onDepleted?.(node, drops);
        return true;
    }

    removers.push(
        game.systems.add({
            name: 'resource-nodes',
            order: SYSTEM_ORDER.GAMEPLAY + 2,
            update: (delta) => {
                for (const node of nodes) {
                    if (node.shake > 0) {
                        // A quick wobble that dies out, so every hit lands visibly.
                        node.shake = Math.max(0, node.shake - delta);
                        node.object.rotation.z = node.baseRotation.z + Math.sin(node.shake * 40) * node.shake * 0.25;
                    }
                    if (node.respawnIn <= 0 || node.respawnIn === Infinity) continue;
                    node.respawnIn -= delta;
                    if (node.respawnIn <= 0) setDown(node, false);
                }
            },
        }),
    );

    if (options.persist) {
        removers.push(
            game.save.register(options.persist, {
                // Only the nodes that are down: [index, seconds left]. -1 stands for "gone for good".
                save: () => nodes.filter((node) => node.respawnIn > 0).map((node) => [node.index, Number.isFinite(node.respawnIn) ? Math.round(node.respawnIn) : -1]),
                load: (data) => {
                    const down = new Map((Array.isArray(data) ? (data as Array<[number, number]>) : []).map(([index, seconds]) => [index, seconds]));
                    for (const node of nodes) {
                        const seconds = down.get(node.index);
                        setDown(node, seconds !== undefined);
                        if (seconds !== undefined) {
                            node.hitsLeft = 0;
                            node.respawnIn = seconds < 0 ? Infinity : Math.max(1, seconds);
                        }
                    }
                },
            }),
        );
    }

    return {
        nodes,
        hit: (node) => hit(node as Internal),
        hitNearest: (range = 2.3) => {
            const player = game.player?.position;
            if (!player) return false;
            let best: Internal | undefined;
            let bestDistance = range;
            for (const node of nodes) {
                if (node.depleted) continue;
                const distance = Math.hypot(node.object.position.x - player.x, node.object.position.z - player.z);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = node;
                }
            }
            return best ? hit(best) : false;
        },
        restore: () => {
            for (const node of nodes) setDown(node, false);
        },
        dispose: () => {
            for (const remove of removers) remove();
            for (const node of nodes) {
                if (node.body) game.physics.remove(node.body);
                node.remains?.removeFromParent();
            }
        },
    };
}

//#endregion Resource nodes
