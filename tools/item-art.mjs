// The picture of every item, drawn once here as small coloured SVGs and
// rendered to 32 px PNGs by `tools/build-item-art.mjs`.
//
// One style for all of them: a 24 by 24 box, a dark outline, flat colours, one
// highlight. Dishes sit in the same bowl or on the same plate, seeds come in
// the same paper packet, and what differs is what is in them.

const K = '#17120e';
const steam = `<path d="M9 5c-1-1 1-2 0-3M13 5c-1-1 1-2 0-3" fill="none" stroke="#f2f2e8" stroke-width="1.2"/>`;

const bowl = (food, extra = '', hot = true) => `${hot ? steam : ''}
<ellipse cx="12" cy="11" rx="9" ry="3.4" fill="${food}"/>
${extra}
<path d="M3 11c0 6 3.500 9 9 9s9-3 9-9c-2 2.400-16 2.400-18 0z" fill="#b9a078"/>
<path d="M6 16.500c1.500 2 4 2.800 6 2.800" fill="none" stroke="#e2cfa8" stroke-width="1"/>`;

const pot = (food, extra = '') => `${steam}
<ellipse cx="12" cy="9.500" rx="8" ry="2.800" fill="${food}"/>
${extra}
<path d="M4 9.500v6c0 3 3 5 8 5s8-2 8-5v-6c-2 2.200-14 2.200-16 0z" fill="#4a4a52"/>
<path d="M4 12H1.800M20 12h2.200" fill="none"/>
<path d="M6.500 14v3" fill="none" stroke="#8a8a94" stroke-width="1"/>`;

const plate = (food) => `<ellipse cx="12" cy="17" rx="10" ry="4" fill="#d8d2c0"/><ellipse cx="12" cy="16.600" rx="6.500" ry="2.300" fill="#b8b2a0" stroke="none"/>${food}`;

const packet = (color, mark) => `<path d="M6 4.500l1.500-1.500 1.500 1.500 1.500-1.500 1.500 1.500 1.500-1.500 1.500 1.500 1.500-1.500 1.500 1.500v16.500H6z" fill="#d9c9a0"/>
<path d="M6 8h12v3H6z" fill="${color}"/>
${mark}`;

const cup = (liquid, extra = '') => `${steam}
<path d="M5 8h12v7c0 3-2 5-6 5s-6-2-6-5z" fill="#d8d2c0"/>
<ellipse cx="11" cy="8" rx="6" ry="2" fill="${liquid}"/>
<path d="M17 10c3 0 4 1 4 3s-1 3-4 3" fill="none"/>${extra}`;

const backpack = (body, flap, extra = '') => `<path d="M8 6c0-4 8-4 8 0" fill="none"/>
<path d="M5 9c0-2 2-3 4-3h6c2 0 4 1 4 3v10c0 1.500-1 2-2 2H7c-1 0-2-.500-2-2z" fill="${body}"/>
<path d="M5 9c0-2 2-3 4-3h6c2 0 4 1 4 3v3c-3 2-11 2-14 0z" fill="${flap}"/>
<rect x="10.500" y="11" width="3" height="3.500" fill="#c9b060"/>${extra}`;

export const ART = {
    // Tools
    'watering-can': `<path d="M9 6c0-4 7-4 7 0" fill="none" stroke-width="1.800"/><path d="M6 8h11l-1 13H7z" fill="#6f8f9a"/><path d="M6.500 11L1.500 6.500l1.500-2 4 3.500z" fill="#5a7884"/><path d="M17 11c5-1 5 7-.500 6" fill="none" stroke-width="1.800"/><path d="M9 11l.500 7" stroke="#b4d0d8" stroke-width="1.200" fill="none"/><path d="M6 8h11" stroke="#3e5a64" stroke-width="2.200" fill="none"/>`,
    axe: `<path d="M5 21l1.800 1.200L17 7.500 15 6z" fill="#8a6238"/><path d="M12.500 3.500l8 3-1.500 7c-4.500-.500-7.500-4.500-6.500-10z" fill="#b8bcc0"/><path d="M18.500 13l1.500-6.500" stroke="#f2f2e8" stroke-width="1" fill="none"/>`,
    'fence-kit': `<path d="M4 21V7l2.500-3L9 7v14zM15 21V7l2.500-3L20 7v14z" fill="#9a6a3c"/><path d="M2 10h20v3H2zM2 16h20v3H2z" fill="#b8854c"/>`,

    // Seeds: one packet, the crop on its band
    'turnip-seed': packet('#b46ab0', `<circle cx="12" cy="16" r="2.600" fill="#e8dcd0"/><path d="M12 13.400c-1-1.500 0-2.500 0-2.500s1 1 0 2.500z" fill="#5f9a52"/>`),
    'wheat-seed': packet('#d9b24a', `<path d="M12 20v-7" fill="none"/><path d="M12 13c-2-.500-2-2.500-2-2.500s2 0 2 2.500zM12 13c2-.500 2-2.500 2-2.500s-2 0-2 2.500zM12 16.500c-2-.500-2-2.500-2-2.500s2 0 2 2.500zM12 16.500c2-.500 2-2.500 2-2.500s-2 0-2 2.500z" fill="#e8c860"/>`),
    'corn-seed': packet('#e0c040', `<path d="M10 19c-1-3 0-6 2-6s3 3 2 6z" fill="#f0d24a"/><path d="M10 19c-1.500-1-2-3-1-4.500M14 19c1.500-1 2-3 1-4.500" fill="none" stroke="#5f9a52" stroke-width="1.300"/>`),
    'pumpkin-seed': packet('#e07a2a', `<ellipse cx="12" cy="16.500" rx="3.600" ry="2.800" fill="#e8862e"/><path d="M12 13.700v-1.500" fill="none" stroke="#5f9a52" stroke-width="1.400"/><path d="M12 14v5" fill="none" stroke="#a85a18" stroke-width=".800"/>`),

    // Straight from the farm
    turnip: `<path d="M12 9c-2-3-1-6 0-7 1 1 2 4 0 7zM10 9.500C7 8 6 5.500 6 4c2 0 4 2 4 5.500zM14 9.500c3-1.500 4-4 4-5.500-2 0-4 2-4 5.500z" fill="#5f9a52"/><path d="M5 13c0-3 3-4.500 7-4.500s7 1.500 7 4.500c0 4-4 6-6 8.500l-1 1-1-1c-2-2.500-6-4.500-6-8.500z" fill="#e8dcd0"/><path d="M5 13c0-3 3-4.500 7-4.500s7 1.500 7 4.500c-3 1.500-11 1.500-14 0z" fill="#b46ab0"/>`,
    wheat: `<path d="M12 23V8" fill="none" stroke="#b08a30" stroke-width="1.600"/><path d="M12 8c-2.500-1-2.500-4.500 0-6 2.500 1.500 2.500 5 0 6zM12 12.500C8.500 12.500 7 10 7 7.500c3 0 5 2 5 5zM12 12.500c3.500 0 5-2.500 5-5-3 0-5 2-5 5zM12 17.500C8.500 17.500 7 15 7 12.500c3 0 5 2 5 5zM12 17.500c3.500 0 5-2.500 5-5-3 0-5 2-5 5z" fill="#e8c860"/>`,
    corn: `<path d="M8 20C6 14 8 4 12 2c4 2 6 12 4 18-2 2-6 2-8 0z" fill="#f0d24a"/><path d="M10 5v14M14 5v14M8.500 9h7M8 13h8M8.500 17h7" fill="none" stroke="#b8922a" stroke-width=".900"/><path d="M8 20c-4-2-5-8-3-12 2 2 4 6 4 12zM16 20c4-2 5-8 3-12-2 2-4 6-4 12z" fill="#5f9a52"/>`,
    pumpkin: `<path d="M12 8V4.500h3" fill="none" stroke="#4a7a3c" stroke-width="2"/><ellipse cx="12" cy="14.500" rx="9.500" ry="7" fill="#e8862e"/><path d="M12 7.500c-4 3-4 11 0 14M12 7.500c4 3 4 11 0 14" fill="none" stroke="#a85a18" stroke-width="1.100"/><path d="M5.500 11c-1 2-1 4 0 6" fill="none" stroke="#f6b060" stroke-width="1"/>`,
    egg: `<path d="M12 3c-4 0-7 6-7 11s3 7.500 7 7.500 7-2.500 7-7.500S16 3 12 3z" fill="#efe6d4"/><path d="M8.500 9c-1 2-1.500 4-1 6" fill="none" stroke="#fffaf0" stroke-width="1.200"/>`,
    milk: `<path d="M9 2.500h6v3.500l2.500 3.500V21h-11V9.500L9 6z" fill="#eef0f2"/><path d="M9 2.500h6V5H9z" fill="#5a84b8"/><path d="M6.500 13h11v4h-11z" fill="#8fb4dc"/>`,
    wood: `<path d="M3 10l12-5 6 3.500v6L9 20l-6-4z" fill="#8a6238"/><ellipse cx="6" cy="13.500" rx="3" ry="4" fill="#d6b07a" transform="rotate(-20 6 13.500)"/><ellipse cx="6" cy="13.500" rx="1.200" ry="1.700" fill="none" stroke="#a07a48" stroke-width=".900" transform="rotate(-20 6 13.500)"/><path d="M11 9.500l7-3M12 14l8-3.500" fill="none" stroke="#5e4022" stroke-width="1"/>`,
    mushroom: `<path d="M10 12h4l1 9H9z" fill="#e6e0cc"/><path d="M2.500 13C2.500 7 7 3 12 3s9.500 4 9.500 10c-4 1.500-15 1.500-19 0z" fill="#cfd8c8"/><circle cx="8" cy="8.500" r="1.300" fill="#9fb0a0" stroke="none"/><circle cx="14.500" cy="7" r="1.600" fill="#9fb0a0" stroke="none"/><circle cx="17" cy="10.500" r="1" fill="#9fb0a0" stroke="none"/>`,
    veilbloom: `<path d="M12 23v-9" fill="none" stroke="#3c6a4a" stroke-width="1.800"/><path d="M12 14C8 14 4 11 4 6c3 0 6 1.500 8 5 2-3.500 5-5 8-5 0 5-4 8-8 8z" fill="#bfe8e0"/><path d="M12 14c-2-3-2-8 0-11 2 3 2 8 0 11z" fill="#e8fff8"/><circle cx="12" cy="11.500" r="1.400" fill="#fff6c8"/>`,

    // Dug up
    'find-coin': `<circle cx="12" cy="12" r="9" fill="#b89a4a"/><circle cx="12" cy="12" r="6" fill="#d4b860"/><path d="M9.500 11c.500-.800 1.500-.800 2 0M12.500 11c.500-.800 1.500-.800 2 0M10 15h4" fill="none" stroke-width="1.100"/>`,
    'find-key': `<path d="M12.500 10.500l8.500 8.500-2 2-1.500-1.500-1.500 1.500-2-2 1.500-1.500-5-5z" fill="#9aa0a8"/><circle cx="8" cy="8" r="5" fill="#b4bac2"/><circle cx="8" cy="8" r="1.800" fill="#2a2620"/>`,
    'find-tooth': `<path d="M6.500 3C3 3 3 7 4 10.500c1 3 1 6 2 9.500.800 2.500 3 1 3-2s1-4 3-4 3 1 3 4 2.200 4.500 3 2c1-3.500 1-6.500 2-9.500C21 7 21 3 17.500 3 15.500 3 14 4.500 12 4.500S8.500 3 6.500 3z" fill="#efe8d8"/><path d="M6.500 6.500c-.800 1.500-.500 3 0 4.500" fill="none" stroke="#fffaf0" stroke-width="1.200"/>`,
    'find-ring': `<circle cx="12" cy="14.500" r="7" fill="#e2c04a"/><circle cx="12" cy="14.500" r="4.200" fill="#2a2620"/><path d="M9.500 6.500L12 2.500l2.500 4L12 9z" fill="#bfe8f0"/>`,
    'find-button': `<circle cx="12" cy="12" r="9" fill="#e6dcc4"/><circle cx="12" cy="12" r="6" fill="none" stroke="#b8ac90" stroke-width="1.100"/><circle cx="9.800" cy="9.800" r="1.100" fill="${K}"/><circle cx="14.200" cy="9.800" r="1.100" fill="${K}"/><circle cx="9.800" cy="14.200" r="1.100" fill="${K}"/><circle cx="14.200" cy="14.200" r="1.100" fill="${K}"/>`,
    'find-spoon': `<path d="M10.500 10l3 .500 3.500 4.500-2 7.500-3-.800 1.500-5.500-3-3.500z" fill="#a8aeb4"/><ellipse cx="11" cy="6.500" rx="4.500" ry="5" fill="#c4cad0" transform="rotate(-15 11 6.500)"/><path d="M9 4.500c-.800 1-.800 2.500 0 3.500" fill="none" stroke="#f2f2f2" stroke-width="1.200"/>`,
    'find-bell': `<path d="M9 5h6l-1-2.500h-4z" fill="#8a6238"/><path d="M6 19c0-9 1-14 6-14s6 5 6 14z" fill="#b08040"/><path d="M4.500 19h15v2.500h-15z" fill="#8a6030"/><path d="M9 9c-1 3-1 6-1 8" fill="none" stroke="#e0b870" stroke-width="1.200"/>`,
    'find-locket': `<path d="M7 2.500l5 5 5-5" fill="none" stroke="#c9b060" stroke-width="1.400"/><path d="M12 7.500c-4.500 0-7 3-7 7s3 7 7 7 7-3 7-7-2.500-7-7-7z" fill="#d4b860"/><path d="M9.500 16.500v-3l2.500-2 2.500 2v3z" fill="#5a4a3a"/><rect x="11.200" y="14" width="1.600" height="1.600" fill="#ffe9a0" stroke="none"/>`,

    // From the pool
    'pale-fish': `<path d="M2.500 12c4-6 11-6 15 0-4 6-11 6-15 0z" fill="#c8d4d0"/><path d="M17 12l5-4.500v9z" fill="#a8b8b4"/><path d="M9 8.500c1 2 1 5 0 7" fill="none" stroke="#8fa09c" stroke-width="1"/><circle cx="6" cy="11.500" r="1" fill="#e8f0ec" stroke-width=".800"/>`,
    eel: `<path d="M3 7c4-4 6 2 9 0s5-3 8 0c1.500 1.500 1 4-1 4.500-3 .800-4-2-7 0s-5 6-9 2" fill="none" stroke="${K}" stroke-width="5.500" stroke-linecap="round"/><path d="M3 7c4-4 6 2 9 0s5-3 8 0c1.500 1.500 1 4-1 4.500-3 .800-4-2-7 0s-5 6-9 2" fill="none" stroke="#2c343c" stroke-width="3" stroke-linecap="round"/><path d="M4 6.500c3-2.500 5 1.500 8 0" fill="none" stroke="#5a6874" stroke-width="1"/>`,

    // Cooked: the clay pot
    'turnip-soup': bowl('#e6d2dc', `<circle cx="9" cy="11" r="1.300" fill="#b46ab0" stroke="none"/><circle cx="14" cy="10.500" r="1.100" fill="#b46ab0" stroke="none"/><path d="M11 12l1.500-.800" stroke="#5f9a52" stroke-width="1.200" fill="none"/>`),
    'boiled-egg': `${steam}<path d="M6 13h12v3c0 3-2 4.500-6 4.500s-6-1.500-6-4.500z" fill="#8fb4dc"/><path d="M9.500 20.500h5v2h-5z" fill="#6f94bc"/><path d="M12 5c-3 0-5 4-5 8h10c0-4-2-8-5-8z" fill="#efe6d4"/><path d="M7 11l2-1.500 2 1.500 2-1.500 2 1.500 2-1.500" fill="none" stroke-width="1"/>`,
    bread: `<path d="M3 14c0-5 4-8 9-8s9 3 9 8c0 3-1 5-3 5H6c-2 0-3-2-3-5z" fill="#c48a48"/><path d="M8 8.500l-2 4M12.500 7.500l-2 5M17 8.500l-2 4" fill="none" stroke="#f0d09a" stroke-width="1.400"/><path d="M5 18h14" fill="none" stroke="#8a5a28" stroke-width="1"/>`,

    // The iron pot
    'corn-chowder': bowl('#f0dc78', `<circle cx="8.500" cy="11" r="1" fill="#e8b020" stroke="none"/><circle cx="12" cy="10" r="1" fill="#e8b020" stroke="none"/><circle cx="15.500" cy="11.300" r="1" fill="#e8b020" stroke="none"/><circle cx="11" cy="12.500" r=".900" fill="#fff6d8" stroke="none"/>`),
    omelette: plate(`<path d="M4 15c0-4 4-6 8-6s8 2 8 5c0 2-3 3.500-8 3.500S4 17 4 15z" fill="#f2d048"/><path d="M8 12c2-1 5-1 7 0" fill="none" stroke="#fff0a0" stroke-width="1.200"/><circle cx="10" cy="14.500" r=".900" fill="#5f9a52" stroke="none"/><circle cx="14.500" cy="13.500" r=".900" fill="#c8482e" stroke="none"/>`),
    'pale-broth': bowl('#cfe4d8', `<path d="M8 11c0-1.500 2-2 3-1M13.500 11.500c0-1.500 2-2 3-1" fill="#e6f2ea" stroke-width=".900"/><circle cx="12" cy="10" r=".800" fill="#fff" stroke="none"/>`),
    'bloom-tea': cup('#9fdccc', `<path d="M9 8c.800-1.500 3.200-1.500 4 0-1 .800-3 .800-4 0z" fill="#e8fff8" stroke-width=".800"/>`),
    'fish-supper': plate(`<path d="M5 15c3-4 8-4 11 0-3 3-8 3-11 0z" fill="#d89a48"/><path d="M16 15l3.500-2.500v5z" fill="#b87a30"/><path d="M8.500 13.500l1 3M11.500 13l1 3.500" fill="none" stroke="#8a5a20" stroke-width=".900"/><path d="M4.500 11.500l3-1.500 1 2z" fill="#b46ab0"/>`),

    // The cauldron
    'pumpkin-pie': `${steam}<path d="M2.500 12h19l-3 8h-13z" fill="#c48a48"/><ellipse cx="12" cy="12" rx="9.500" ry="3.500" fill="#e07a2a"/><path d="M2.500 12c0 1.500 1 2 2.500 1.500s2 .800 3.500.500 2-.500 3.500 0 2 .500 3.500 0 2-.800 3.500-.500 2.500 0 2.500-1.500" fill="none" stroke="#e8c080" stroke-width="1.600"/><circle cx="12" cy="11.500" r="1.300" fill="#fff6e0" stroke-width=".800"/>`,
    'hollow-stew': pot('#6a4a5a', `<circle cx="9" cy="9.500" r="1.200" fill="#e8862e" stroke="none"/><circle cx="13" cy="9" r="1" fill="#cfd8c8" stroke="none"/><circle cx="15.500" cy="10" r=".900" fill="#f0d24a" stroke="none"/><path d="M10.500 10.500l1.500.500" stroke="#bfe8e0" stroke-width="1" fill="none"/>`),

    // Taught by the village
    'counted-biscuits': `<circle cx="8" cy="15" r="5.500" fill="#e2c890"/><circle cx="16" cy="15" r="5.500" fill="#e2c890"/><circle cx="12" cy="8.500" r="5.500" fill="#ecd6a4"/><circle cx="10.500" cy="7.500" r=".700" fill="${K}" stroke="none"/><circle cx="13.500" cy="7.500" r=".700" fill="${K}" stroke="none"/><circle cx="12" cy="10.200" r=".700" fill="${K}" stroke="none"/><circle cx="6.500" cy="15" r=".700" fill="${K}" stroke="none"/><circle cx="17.500" cy="15" r=".700" fill="${K}" stroke="none"/>`,
    'turnip-mash': bowl('#f0e8e0', `<path d="M7 11c1-3 3-4 5-4s4 1 5 4c-3 1.500-7 1.500-10 0z" fill="#f6f0ea"/><path d="M12 5.500c-1-1.500 0-2.500 0-2.500s1 1 0 2.500z" fill="#5f9a52" stroke-width=".800"/><path d="M10 9.500c1-.800 3-.800 4 0" fill="none" stroke="#c9a0c6" stroke-width="1.100"/>`, false),
    'postmans-loaf': `<path d="M3 11c0-4 4-6 9-6s9 2 9 6v7c0 1-1 2-2 2H5c-1 0-2-1-2-2z" fill="#a8703a"/><path d="M3 11c0-4 4-6 9-6s9 2 9 6c-4 2-14 2-18 0z" fill="#c8904c"/><path d="M5 13.500h14v3.500H5z" fill="#e8e0c8"/><path d="M12 13.500v3.500" fill="none" stroke="#c8482e" stroke-width="1.600"/>`,
    'warm-milk': cup('#f6f2e8'),
    'corn-cakes': plate(`<ellipse cx="12" cy="15.500" rx="6" ry="2.300" fill="#e8b84a"/><ellipse cx="12" cy="13" rx="6" ry="2.300" fill="#f0c860"/><ellipse cx="12" cy="10.500" rx="6" ry="2.300" fill="#f6d878"/><path d="M10 10c1-.800 3-.800 4 0" fill="none" stroke="#fff0b0" stroke-width="1.100"/><rect x="11" y="8.500" width="2.400" height="1.800" fill="#fff6c8" stroke-width=".800"/>`),

    // Kept things
    'backpack-1': backpack('#8a7a5a', '#a08e68', `<path d="M8 15v4M16 15v4" fill="none" stroke="#e8e0c8" stroke-width="1" stroke-dasharray="1 1"/>`),
    'backpack-2': backpack('#7a4a2a', '#96603a', `<path d="M5 16h14" fill="none" stroke="#5a341c" stroke-width="1.200"/>`),
    'backpack-3': backpack('#3e5a7a', '#52749a', `<path d="M8.500 16.500l3.500 2.500 3.500-2.500v3.500h-7z" fill="#e8e0c8" stroke-width=".900"/>`),
    candle: `<path d="M12 2c-2.500 3-2.500 5.500 0 7 2.500-1.500 2.500-4 0-7z" fill="#ffc848"/><path d="M12 5c-1 1.500-1 2.500 0 3.200 1-.700 1-1.700 0-3.200z" fill="#fff6c8" stroke="none"/><path d="M8.500 10h7v11h-7z" fill="#e8e2d0"/><path d="M8.500 12c1 1.500 1.500 0 2.500 1.500" fill="none" stroke="#c8c0a8" stroke-width="1"/><path d="M6 21h12" fill="none" stroke-width="2"/>`,
    lantern: `<path d="M9 5c0-3 6-3 6 0" fill="none"/><path d="M7 5h10v2.500H7zM7 19h10v2.500H7z" fill="#4a4a52"/><path d="M8 7.500h8V19H8z" fill="#ffd060"/><path d="M12 10c-1.500 2-1.500 4 0 5 1.500-1 1.500-3 0-5z" fill="#fff6c8" stroke-width=".800"/><path d="M8 7.500V19M16 7.500V19" fill="none" stroke-width="1.800"/>`,
    scarecrow: `<path d="M11 10h2v13h-2z" fill="#8a6238"/><path d="M2.500 11h19v2.500h-19z" fill="#8a6238"/><path d="M7.500 10.500h9l1 9h-11z" fill="#3a3a44"/><path d="M8 6.500h8v5H8z" fill="#d6c08a"/><path d="M5 6.500h14L16 2.500H8z" fill="#c8a040"/><path d="M10 8.500h.010M14 8.500h.010" stroke-width="1.600" stroke-linecap="round"/><path d="M10.500 9.500v2.500" fill="none" stroke="#8fc0e0" stroke-width="1.100"/>`,
    'lamp-oil': `<path d="M10 2.500h4v3h-4z" fill="#8a6238"/><path d="M10 5.500h4l3 4.500v9c0 1.500-1 2.500-2.500 2.500h-5C8 21.500 7 20.500 7 19v-9z" fill="#9cc0a0"/><path d="M7 14c3 1.500 7 1.500 10 0v5c0 1.500-1 2.500-2.500 2.500h-5C8 21.500 7 20.500 7 19z" fill="#d8a838"/><path d="M9.500 9.500v3" fill="none" stroke="#e0f0e0" stroke-width="1.100"/>`,
    'name-slip': `<path d="M4 5h12l4 4v11H4z" fill="#e8e0c8"/><path d="M16 5v4h4" fill="#c8c0a4"/><path d="M7 11h8M7 14h10M7 17h6" fill="none" stroke="#6a5a4a" stroke-width="1.200"/>`,
};

/** One picture as a full SVG document. */
export const svg = (id) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="${K}" stroke-width="1.500" stroke-linejoin="round" stroke-linecap="round">${ART[id]}</svg>`;
