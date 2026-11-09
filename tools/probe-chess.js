// Chess probe: plays real games through the same path a tap takes and checks,
// after every move, that what is drawn matches the rules position.
//   node tools/smoke.mjs "http://localhost:5180/?demo=chess" tools/probe-chess.js
(async () => {
    const game = window.__game;
    const { board, chess, flow } = game.world;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const failures = [];
    const expect = (condition, message) => condition || failures.push(message);

    const cell = (name) => ({ x: name.charCodeAt(0) - 97, z: Number(name[1]) - 1 });
    const meshes = () => {
        let count = 0;
        board.root.traverse((node) => node.userData?.tag === 'piece' && node.parent === board.root && (count += 1));
        return count;
    };
    // Every drawn piece must stand on its cell, and every occupied square must be drawn once.
    const consistent = (label) => {
        const occupied = chess.position.board.filter(Boolean).length;
        expect(board.pieces.length === occupied, `${label}: board has ${board.pieces.length} pieces, position has ${occupied}`);
        expect(meshes() === occupied, `${label}: scene shows ${meshes()} piece objects, position has ${occupied}`);
        for (const piece of board.pieces) {
            const home = board.cellToWorld(piece.cell);
            const off = Math.hypot(piece.object.position.x - home.x, piece.object.position.z - home.z);
            expect(off < 0.05, `${label}: piece on ${String.fromCharCode(97 + piece.cell.x)}${piece.cell.z + 1} drawn ${off.toFixed(2)} away`);
            const rule = chess.position.board[piece.cell.z * 8 + piece.cell.x];
            expect(rule && rule.type === piece.data.type && rule.color === piece.data.color, `${label}: wrong piece drawn on ${piece.cell.x},${piece.cell.z}`);
        }
    };
    const move = async (from, to) => {
        board.click(cell(from));
        expect(chess.selectedFrom !== undefined, `${from}: tap did not select`);
        board.click(cell(to));
        await board.whenSettled();
        await sleep(30);
        consistent(`${from}-${to}`);
    };

    flow.start();
    chess.newGame('local');
    await sleep(100);
    consistent('start');

    // Selecting, reselecting and deselecting.
    board.click(cell('e2'));
    board.click(cell('d2'));
    expect(chess.selectedFrom === 11, 'tapping another own piece switches the selection');
    board.click(cell('d2'));
    expect(chess.selectedFrom === undefined, 'tapping the selected piece again deselects it');

    // Capture, en passant, castling.
    await move('e2', 'e4');
    await move('d7', 'd5');
    await move('e4', 'd5');
    expect(chess.capturedBy('w').join() === 'p', 'white took a pawn');
    await move('e7', 'e5');
    await move('d5', 'e6');
    expect(!board.pieceAt(cell('e5')), 'en passant removed the pawn beside');
    await move('f7', 'e6');
    await move('g1', 'f3');
    await move('g8', 'f6');
    await move('f1', 'c4');
    await move('f8', 'c5');
    await move('e1', 'g1');
    expect(board.pieceAt(cell('f1'))?.data.type === 'r', 'castling moved the rook to f1');

    // Undo goes back one ply in a two player game, and redraws.
    chess.undo();
    await sleep(30);
    consistent('undo');
    expect(board.pieceAt(cell('e1'))?.data.type === 'k', 'undo put the king back');

    // Promotion through the dialog.
    chess.restore({ fen: '7k/P7/8/8/8/8/8/K7 w - - 0 1', history: [], mode: 'local', difficulty: 'normal' });
    board.click(cell('a7'));
    board.click(cell('a8'));
    await sleep(50);
    const knight = [...document.querySelectorAll('.choice-option')].find((button) => button.textContent.includes('Knight'));
    expect(knight, 'promotion dialog offers a knight');
    knight?.click();
    // The dialog resolves on a microtask, so let the move start before waiting for it.
    await sleep(20);
    await board.whenSettled();
    await sleep(30);
    consistent('promotion');
    expect(board.pieceAt(cell('a8'))?.object.name === 'wn', 'the promoted piece is a knight model');

    // Checkmate ends the game and blocks further taps.
    chess.newGame('local');
    await move('f2', 'f3');
    await move('e7', 'e5');
    await move('g2', 'g4');
    await move('d8', 'h4');
    expect(chess.result?.startsWith('Checkmate'), `fool's mate is checkmate, got ${chess.result}`);
    board.click(cell('a2'));
    expect(chess.selectedFrom === undefined, 'no selection after the game ended');

    // The engine answers, and its reply is drawn.
    chess.newGame('white');
    await move('e2', 'e4');
    for (let waited = 0; chess.thinking && waited < 8000; waited += 100) await sleep(100);
    await board.whenSettled();
    await sleep(30);
    consistent('engine reply');
    expect(chess.history.length === 2, `engine replied, history ${chess.history.map((entry) => entry.san).join(' ')}`);

    return { ok: failures.length === 0, failures, moves: chess.history.map((entry) => entry.san) };
})();
