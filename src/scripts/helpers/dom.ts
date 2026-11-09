/**
 * Small DOM helpers for the UI modules.
 *
 * Text always goes in through `textContent`, never `innerHTML`, so a player
 * name from a save file can never inject markup.
 */
export type ElementOptions = {
    className?: string;
    /** Plain text content. Always escaped by the DOM. */
    text?: string;
    /** Appended to the parent when given. */
    parent?: HTMLElement;
    id?: string;
    title?: string;
    /** Extra attributes, e.g. `{ type: 'button', role: 'menuitem' }`. */
    attributes?: Record<string, string>;
};

/** Create an element with the given options. */
export function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, options: ElementOptions = {}): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (options.className) element.className = options.className;
    if (options.id) element.id = options.id;
    if (options.title) element.title = options.title;
    if (options.text !== undefined) element.textContent = options.text;
    if (options.attributes) {
        for (const [name, value] of Object.entries(options.attributes)) element.setAttribute(name, value);
    }
    options.parent?.appendChild(element);
    return element;
}

/** Create a `div` with the given class name. */
export function div(className: string, text?: string, parent?: HTMLElement): HTMLDivElement {
    const options: ElementOptions = { className };
    if (text !== undefined) options.text = text;
    if (parent) options.parent = parent;
    return createElement('div', options);
}

/** Create a button that calls `onClick`. */
export function button(label: string, onClick: () => void, options: ElementOptions = {}): HTMLButtonElement {
    const element = createElement('button', { ...options, text: label, attributes: { type: 'button', ...(options.attributes ?? {}) } });
    element.addEventListener('click', onClick);
    return element;
}

/** Replace the text content of an element. */
export function setText(element: HTMLElement, text: string): void {
    if (element.textContent !== text) element.textContent = text;
}

/** Add or remove the shared `is-hidden` class. */
export function setVisible(element: HTMLElement, visible: boolean): void {
    element.classList.toggle('is-hidden', !visible);
}

/** Toggle an element's visibility and report the new state. */
export function toggleVisible(element: HTMLElement): boolean {
    const visible = element.classList.contains('is-hidden');
    setVisible(element, visible);
    return visible;
}

/** Add an event listener and return a function that removes it. */
export function on<K extends keyof HTMLElementEventMap>(element: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions): () => void {
    element.addEventListener(type, handler as EventListener, options);
    return () => element.removeEventListener(type, handler as EventListener, options);
}

/** Remove every child of an element. */
export function clearChildren(element: HTMLElement): void {
    while (element.firstChild) element.removeChild(element.firstChild);
}

/** Find a required element, throwing a clear error when it is missing. */
export function requireElement<T extends HTMLElement>(selector: string, root: ParentNode = document): T {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`[dom] expected to find "${selector}"`);
    return element;
}

/** Wait for the next animation frame. Useful to let the browser paint before heavy work. */
export function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
