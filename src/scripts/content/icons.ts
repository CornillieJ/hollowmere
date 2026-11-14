import { registerIcons } from '../kit';

/**
 * Every picture the screens use, drawn for this game: no emoji anywhere.
 *
 * Each is the inside of a 24 by 24 SVG, stroked with square ends like the
 * lettering on a camcorder display. Write `:name:` in any text on screen (an
 * item's icon, a row, a toast) and it is drawn in the colour of that text.
 * The faces of the farmer and the villagers are added later, as small pictures
 * taken of their models: see `portraits.ts`.
 */
const ICONS: Record<string, string> = {
    letter: '<path d="M3 6h18v12H3zM3 7l9 7 9-7"/>',
    candle: '<path d="M9 11h6v10H9zM12 11V9"/><path d="M12 2c-2 3-2 5 0 6 2-1 2-3 0-6z" fill="#000"/>',
    bread: '<path d="M4 11c0-3 3-5 8-5s8 2 8 5c0 1-1 2-2 2v6H6v-6c-1 0-2-1-2-2zM9 10v3M13 10v3"/>',
    axe: '<path d="M6 21L16 6"/><path d="M13 3l7 3-2 7c-4-1-6-5-5-10z" fill="#000"/>',
    key: '<circle cx="8" cy="8" r="4"/><path d="M11 11l9 9M16 16l3-3"/>',
    sprout: '<path d="M12 21v-9M12 13C7 13 5 10 5 6c5 0 7 3 7 7zM12 12c4 0 6-2 6-5-4 0-6 2-6 5z"/>',
    fog: '<path d="M3 8h13M8 12h13M3 16h10M16 16h5"/>',
    bed: '<path d="M3 5v15M3 16h18v4M21 16v-4H9v4M4 12h4"/>',
    blank: '<rect x="8" y="8" width="8" height="8"/>',
    rain: '<path d="M6 13a4 4 0 0 1 1-8 5 5 0 0 1 10 1 3.500 3.500 0 0 1 0 7zM8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
    scroll: '<path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4"/>',
    pot: '<path d="M4 10h16v5a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6zM2 10h20M9 6c-1-2 1-2 0-4M15 6c-1-2 1-2 0-4"/>',
    village: '<path d="M2 20v-8l4-4 4 4v8zM10 20V9l5-5 5 5v11zM14 20v-5h3v5"/>',
    book: '<path d="M5 4h13v16H5zM8 4v16M11 8h4"/>',
    rabbit: '<path d="M9 10V3c2 0 3 3 3 6 0-3 1-6 3-6v7c3 1 4 4 4 6 0 3-3 5-7 5s-7-2-7-5c0-2 1-5 4-6z"/>',
    sign: '<path d="M12 21V4M5 6h12l3 3-3 3H5z"/>',
    hill: '<path d="M2 20l7-12 4 6 3-4 6 10z"/>',
    wheat: '<path d="M12 22V5M12 5c-2-1-2-3 0-4 2 1 2 3 0 4zM12 10c-3 0-4-2-4-4 3 0 4 2 4 4zM12 10c3 0 4-2 4-4-3 0-4 2-4 4zM12 15c-3 0-4-2-4-4 3 0 4 2 4 4zM12 15c3 0 4-2 4-4-3 0-4 2-4 4z"/>',
    none: '<circle cx="12" cy="12" r="7"/><path d="M7 17L17 7"/>',
    mark: '<path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" fill="#000"/>',
    moon: '<path d="M19 14A8 8 0 1 1 10 5a6 6 0 0 0 9 9z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
    alert: '<path d="M10.500 3h3l-.700 12h-1.600z" fill="#000"/><rect x="10.500" y="18" width="3" height="3" fill="#000"/>',
    basket: '<path d="M4 11h16l-2 9H6zM8 11l4-7 4 7M9 14v3M12 14v3M15 14v3"/>',
    plate: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
    door: '<path d="M6 21V3h12v18zM4 21h16"/><rect x="14" y="11" width="2" height="2" fill="#000"/>',
    coat: '<path d="M9 3L3 7l2 5 2-1v10h10V11l2 1 2-5-6-4-3 4zM12 7v14"/>',
    drop: '<path d="M12 3C8 9 6 12 6 15a6 6 0 0 0 12 0c0-3-2-6-6-12z"/>',
    pencil: '<path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4"/>',
    box: '<path d="M3 8l9-5 9 5v9l-9 5-9-5zM3 8l9 5 9-5M12 13v9"/>',
    arrow: '<path d="M12 22 6 12a7 7 0 1 1 12 0zM12 5a3.200 3.200 0 1 0 0 6.400 3.200 3.200 0 1 0 0-6.400z" fill="#000" fill-rule="evenodd" stroke-width="1"/>',
    use: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="#000"/>',
    bag: '<path d="M6 9h12l1 12H5zM9 9V6a3 3 0 0 1 6 0v3M9 14h6"/>',
    notebook: '<path d="M3 5h8l1 2 1-2h8v14h-8l-1 2-1-2H3zM12 7v12"/>',
    sparkle: '<path d="M9 3l1.500 5 5 1.500-5 1.500L9 16l-1.500-5-5-1.500 5-1.500zM18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="#000"/>',
    cat: '<path d="M5 20V5l4 4h6l4-4v15z"/><path d="M9 13v2M15 13v2M11 17h2"/>',
    coin: '<circle cx="12" cy="12" r="8"/><rect x="10" y="10" width="4" height="4"/>',
    dawn: '<path d="M2 18h20M5 18a7 7 0 0 1 14 0M12 4v3M4 9l2 2M20 9l-2 2"/>',
    corn: '<path d="M12 3c3 2 4 6 4 10s-1 6-4 8c-3-2-4-4-4-8s1-8 4-10zM9 9h6M8.500 13h7M9.500 17h5M12 4v16"/>',
    hen: '<path d="M5 9c0-3 2-4 4-4s3 1 3 3v2h6l2-2v5c0 4-3 6-7 6s-8-3-8-10zM3 9h2M11 20v2M14 20v2"/><rect x="8" y="7" width="1.500" height="1.500" fill="#000"/>',
    cow: '<path d="M5 8L3 4M19 8l2-4M5 8h14v7l-3 6H8l-3-6zM9 17h6"/><rect x="8" y="11" width="2" height="2" fill="#000"/><rect x="14" y="11" width="2" height="2" fill="#000"/>',
    deposit: '<path d="M5 8c0-1.500 3-3 7-3s7 1.500 7 3-3 3-7 3-7-1.500-7-3zM5 8v4c0 1.500 3 3 7 3s7-1.500 7-3V8M5 12v4c0 1.500 3 3 7 3s7-1.500 7-3v-4"/>',
    cauldron: '<path d="M4 9h16M5 9c-2 6 1 11 7 11s9-5 7-11M8 20l-1 2M16 20l1 2M7 9V6h10v3"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.500 8.500l-2 5-5 2 2-5z" fill="#000"/>',
    fire: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 2 3-5z"/><path d="M12 13c1 2 2 2 2 4a2 2 0 0 1-4 0c0-2 1-2 2-4z" fill="#000"/>',
    ruin: '<path d="M3 21V9l4-3v6l3-2v5l3-4v10M17 21v-6l4-2v8M2 21h20"/>',
    dash: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
    bell: '<path d="M6 17v-6a6 6 0 0 1 12 0v6l2 2H4zM10 21h4M12 3v2"/>',
    mirror: '<ellipse cx="12" cy="9" rx="6" ry="7"/><path d="M12 16v6M9 22h6M9 7l3-2"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    house: '<path d="M3 11l9-8 9 8M5 10v11h14V10M10 21v-6h4v6"/>',
    cloud: '<path d="M6 18a4 4 0 0 1 1-8 5 5 0 0 1 10 1 3.500 3.500 0 0 1 0 7z"/>',
    cold: '<path d="M12 2v20M3.500 7l17 10M3.500 17l17-10M9 4l3 3 3-3M9 20l3-3 3 3"/>',
    hot: '<path d="M7 20c-2-3 2-5 0-8s2-5 0-8M12 20c-2-3 2-5 0-8s2-5 0-8M17 20c-2-3 2-5 0-8s2-5 0-8"/>',
    bike: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16l4-8h6l2 8M10 8l4 8M8 6h4M16 8l-1-3h3"/>',
    scarecrow: '<path d="M12 22V10M4 13h16M7 6h10M9 6V3h6v3"/><rect x="10" y="6" width="4" height="4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
    lantern: '<path d="M9 3h6M12 3v3M8 6h8l1 3v9l-1 3H8l-1-3V9zM7 9h10M7 18h10"/><path d="M12 11c-1 2-1 3 0 4 1-1 1-2 0-4z" fill="#000"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 17.500v1"/>',
    cart: '<path d="M2 4h3l3 11h10l2-8H6"/><rect x="8" y="18" width="2.500" height="2.500" fill="#000"/><rect x="15.500" y="18" width="2.500" height="2.500" fill="#000"/>',
    egg: '<path d="M12 3c4 0 7 6 7 11a7 7 0 0 1-14 0c0-5 3-11 7-11z"/>',
    turnip: '<path d="M12 9c5 0 7 2 7 5s-4 5-7 8c-3-3-7-5-7-8s2-5 7-5zM12 9V3M12 6L8 3M12 6l4-3"/>',
    pumpkin: '<path d="M12 7c-6 0-9 3-9 7s3 6 9 6 9-2 9-6-3-7-9-7zM12 7V3h3M12 7c-3 3-3 10 0 13M12 7c3 3 3 10 0 13"/>',
    stop: '<circle cx="12" cy="12" r="9"/><path d="M7 12h10"/>',
    left: '<path d="M16 4l-9 8 9 8z" fill="#000"/>',
    right: '<path d="M8 4l9 8-9 8z" fill="#000"/>',
    fence: '<path d="M5 21V7l2-3 2 3v14M15 21V7l2-3 2 3v14M3 11h18M3 16h18"/>',
    seed: '<path d="M12 4c4 2 6 6 6 9a6 6 0 0 1-12 0c0-3 2-7 6-9zM12 9v8"/>',
    milk: '<path d="M9 3h6v4l2 3v11H7V10l2-3zM7 13h10"/>',
    wood: '<path d="M17 9H3v7h14"/><ellipse cx="17" cy="12.500" rx="3" ry="3.500"/><path d="M6 12.500h6"/>',
    bloom: '<path d="M12 22v-9M12 13c-4 0-6-3-6-7 3 0 5 1 6 4 1-3 3-4 6-4 0 4-2 7-6 7zM12 10V3"/><circle cx="12" cy="3" r="1.200" fill="#000"/>',
    mushroom: '<path d="M3 12c0-5 4-8 9-8s9 3 9 8zM10 12v8h4v-8"/>',
    bowl: '<path d="M3 11h18a9 8 0 0 1-18 0zM8 21h8"/>',
    pan: '<circle cx="10" cy="13" r="7"/><path d="M15 8l6-5"/><circle cx="10" cy="13" r="2.500" fill="#000"/>',
    pie: '<path d="M2 12h20l-3 7H5zM4 12c1-4 4-6 8-6s7 2 8 6M10 9l1 1M14 9l-1 1"/>',
    biscuit: '<circle cx="12" cy="12" r="8"/><rect x="8" y="8" width="2" height="2" fill="#000"/><rect x="14" y="9" width="2" height="2" fill="#000"/><rect x="9" y="14" width="2" height="2" fill="#000"/><rect x="14" y="14" width="2" height="2" fill="#000"/>',
    loaf: '<path d="M5 15L15 5c2-2 6 2 4 4L9 19c-2 2-6-2-4-4zM9 12l3 3M12 9l3 3"/>',
    cup: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 5h-2M3 22h15"/>',
    cakes: '<path d="M4 10h16v3H4zM3 14h18v3H3zM5 18h14v3H5zM9 6h6v3H9z"/>',
    oil: '<path d="M8 3h5v4l4 3v11H6V9l2-2zM9 14h5"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 4-8 8-8s8 3 8 8"/>',
    eye: '<path d="M2 12c4-6 16-6 20 0-4 6-16 6-20 0z"/><circle cx="12" cy="12" r="3" fill="#000"/>',
};

const FACES = ['farmer', 'barnaby', 'wren', 'fen', 'hollis', 'pike', 'pell'];

export function registerGameIcons(): void {
    registerIcons(ICONS, { strokeWidth: 2.2, linecap: 'square', linejoin: 'miter' });
    // Until the portraits are taken, a face is the outline of a head.
    registerIcons(Object.fromEntries(FACES.map((id) => [`face-${id}`, ICONS.person as string])), { strokeWidth: 2.2, linecap: 'square', linejoin: 'miter' });
}
