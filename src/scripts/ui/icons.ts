/**
 * Icons in any UI text.
 *
 * Register a set of icons by name, then write `:name:` wherever text goes: an
 * item's `icon`, a panel row, a toast, a prompt, a button label. Inside the UI
 * root every such token is drawn as the icon, in the colour and at the size of
 * the text around it. Nothing else has to know: components keep setting plain
 * strings.
 *
 * ```ts
 * registerIcons({ coin: '<circle cx="12" cy="12" r="8"/>', wren: { image: portraitUrl } });
 * game.toasts.push(':coin: 20 coins');
 * ```
 *
 * A drawn icon is the inside of a 24 by 24 SVG, stroked. It is used as a mask,
 * so only its shape matters. An `image` icon is shown as it is, e.g. a portrait.
 * The token stays in the element as hidden text, so `textContent` still reads
 * what was written.
 */
export type IconSource = string | { image: string };

export type IconStyle = { strokeWidth?: number; linecap?: 'round' | 'square' | 'butt'; linejoin?: 'round' | 'miter' | 'bevel' };

const icons = new Map<string, { url: string; image: boolean }>();
const TOKEN = /:([a-z][a-z0-9-]*):/g;

/** Add icons, replacing any of the same name. */
export function registerIcons(set: Record<string, IconSource>, style: IconStyle = {}): void {
    for (const [name, source] of Object.entries(set)) {
        if (typeof source !== 'string') {
            icons.set(name, { url: source.image, image: true });
            continue;
        }
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="${style.strokeWidth ?? 2}" stroke-linecap="${style.linecap ?? 'round'}" stroke-linejoin="${style.linejoin ?? 'round'}">${source}</svg>`;
        icons.set(name, { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, image: false });
    }
}

export const hasIcon = (name: string): boolean => icons.has(name);

/** An icon as an element, for code that builds its own markup. */
export function iconElement(name: string): HTMLSpanElement {
    const span = document.createElement('span');
    const icon = icons.get(name);
    span.className = icon?.image ? 'ui-icon ui-icon-image' : 'ui-icon';
    span.dataset.icon = name;
    span.textContent = `:${name}:`;
    if (icon) span.style.setProperty('--icon', `url("${icon.url}")`);
    return span;
}

function convert(node: Text): void {
    const text = node.data;
    const parent = node.parentElement;
    if (!parent || !text.includes(':') || parent.closest('.ui-icon, script, style, textarea, [data-no-icons]')) return;
    TOKEN.lastIndex = 0;
    let match = TOKEN.exec(text);
    let from = 0;
    let pieces: Node[] | undefined;
    while (match) {
        if (icons.has(match[1] as string)) {
            pieces ??= [];
            if (match.index > from) pieces.push(document.createTextNode(text.slice(from, match.index)));
            pieces.push(iconElement(match[1] as string));
            from = match.index + match[0].length;
        }
        match = TOKEN.exec(text);
    }
    if (!pieces) return;
    if (from < text.length) pieces.push(document.createTextNode(text.slice(from)));
    node.replaceWith(...pieces);
}

function scan(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) return convert(node as Text);
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const found: Text[] = [];
    while (walker.nextNode()) found.push(walker.currentNode as Text);
    found.forEach(convert);
}

/** Draw `:name:` tokens as icons everywhere under `root`, now and as its text changes. Returns a function that stops. */
export function watchIcons(root: HTMLElement): () => void {
    scan(root);
    const observer = new MutationObserver((mutations) => {
        if (icons.size === 0) return;
        for (const mutation of mutations) {
            if (mutation.type === 'characterData') scan(mutation.target);
            else mutation.addedNodes.forEach(scan);
        }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
}

/** The few shapes the library's own widgets use. */
registerIcons({
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    more: '<path d="M6 9l6 7 6-7z" fill="#000"/>',
    lock: '<path d="M6 11h12v9H6zM8.500 11V8a3.500 3.500 0 0 1 7 0v3"/>',
    star: '<path d="M12 3l2.700 5.800 6.300.700-4.700 4.300 1.300 6.200L12 16.900 6.400 20l1.300-6.200L3 9.500l6.300-.700z" fill="#000"/>',
    heart: '<path d="M12 20C4 14.500 3.500 9 6.500 6.500 8.700 4.700 11 5.800 12 8c1-2.200 3.300-3.300 5.500-1.500C20.500 9 20 14.500 12 20z" fill="#000"/>',
    'heart-empty': '<path d="M12 20C4 14.500 3.500 9 6.500 6.500 8.700 4.700 11 5.800 12 8c1-2.200 3.300-3.300 5.500-1.500C20.500 9 20 14.500 12 20z"/>',
    fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    shrink: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
    jump: '<path d="M12 20V7M6 12l6-6 6 6M5 3h14"/>',
    run: '<path d="M5 6l6 6-6 6M13 6l6 6-6 6"/>',
    hand: '<path d="M8 13V5.500a1.500 1.500 0 0 1 3 0V11V4a1.500 1.500 0 0 1 3 0v7V5.500a1.500 1.500 0 0 1 3 0V14c0 4-2 7-6 7-3 0-4.500-1.500-6-4l-2-4c1-1.500 2.500-1 3 0z"/>',
});
