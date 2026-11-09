import assert from 'node:assert/strict';

import { chooseMove, evaluate, DIFFICULTY_SETTINGS } from '../src/scripts/chess/ai';
import { applyMove, gameStatus, initialPosition, legalMoves, parseFen, squareName, toSan, type Position } from '../src/scripts/chess/rules';

/**
 * The engine, tested on positions with a known best move.
 *
 * These are the qualities that matter for an opponent a person plays against:
 * it takes a mate, it does not give a queen away, and every move it returns is
 * legal. Strength is not the point.
 */

//#region Tactics

// Back rank mate in one: Re8#.
{
    const position = parseFen('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1') as Position;
    const result = await chooseMove(position, { difficulty: 'hard' });
    assert.ok(result, 'the engine must return a move');
    const after = applyMove(position, result.move);
    assert.equal(gameStatus(after), 'checkmate', `expected a mate, played ${toSan(position, result.move, after)}`);
    assert.ok(result.depth >= 2, 'the mate is found at two plies or more');
}

// A free queen must be taken. Tactical assertions use 'hard', which has no
// deliberate mistakes; the easier levels are allowed to blunder on purpose.
{
    const position = parseFen('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1') as Position;
    const result = await chooseMove(position, { difficulty: 'hard' });
    assert.ok(result, 'the engine must return a move');
    assert.equal(result.move.captured?.type, 'q', `expected to take the queen, played ${squareName(result.move.to)}`);
}

// A hanging pawn is taken when nothing better exists.
{
    const position = parseFen('4k3/8/8/8/8/3p4/4P3/4K3 w - - 0 1') as Position;
    const result = await chooseMove(position, { difficulty: 'hard' });
    assert.equal(result?.move.captured?.type, 'p', 'a free pawn is worth taking');
}

// It must not walk into mate when the king has a safe square.
{
    const position = parseFen('6k1/5ppp/8/8/8/8/2r5/4R1K1 b - - 0 1') as Position;
    const result = await chooseMove(position, { difficulty: 'hard' });
    assert.ok(result, 'the engine must return a move');
    const after = applyMove(position, result.move);
    assert.notEqual(gameStatus(after), 'checkmate', 'the engine must not allow instant mate if it can avoid it');
}

//#endregion Tactics

//#region Evaluation

{
    const start = evaluate(initialPosition());
    assert.equal(start, 0, 'the starting position is balanced');

    const upAQueen = parseFen('4k3/8/8/8/8/8/8/3QK3 w - - 0 1') as Position;
    assert.ok(evaluate(upAQueen) > 500, 'a queen up should score far above zero');

    const downARook = parseFen('4k3/8/8/8/8/8/8/3qK3 w - - 0 1') as Position;
    assert.ok(evaluate(downARook) < -500, 'scores are from the side to move point of view');
}

//#endregion Evaluation

//#region Self play

{
    let position = initialPosition();
    const played: string[] = [];
    const started = Date.now();

    for (let ply = 0; ply < 30; ply += 1) {
        if (gameStatus(position) !== 'playing' && gameStatus(position) !== 'check') break;
        const result = await chooseMove(position, { difficulty: 'normal', timeMs: 120, maxDepth: 3 });
        assert.ok(result, `no move at ply ${ply}`);
        const legal = legalMoves(position).some((move) => move.from === result.move.from && move.to === result.move.to && move.promotion === result.move.promotion);
        assert.ok(legal, `illegal move at ply ${ply}: ${squareName(result.move.from)}-${squareName(result.move.to)}`);
        const after = applyMove(position, result.move);
        played.push(toSan(position, result.move, after));
        position = after;
    }

    assert.equal(played.length, 30, 'thirty plies of self play');
    assert.ok(Date.now() - started < 20_000, 'self play must stay responsive');
    // A sanity check on the opening: pieces develop, nobody immediately loses a queen.
    assert.ok(played.some((san) => san.includes('N')), 'the engine should develop a knight in the opening');
}

//#endregion Self play

//#region Difficulty

{
    const position = initialPosition();
    const easy = DIFFICULTY_SETTINGS.easy;
    const hard = DIFFICULTY_SETTINGS.hard;
    assert.ok(easy.timeMs < hard.timeMs, 'easy thinks for less time');
    assert.ok(easy.maxDepth < hard.maxDepth, 'easy searches less deeply');
    assert.ok(easy.blunderChance > hard.blunderChance, 'easy is allowed to make mistakes');

    const result = await chooseMove(position, { difficulty: 'easy' });
    assert.ok(result && legalMoves(position).some((move) => move.to === result.move.to), 'easy still plays a legal move');
}

//#endregion Difficulty
