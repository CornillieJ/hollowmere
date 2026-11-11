/**
 * Fullscreen and orientation.
 *
 * On a phone, a game in a browser tab is a game with the address bar over it and
 * a scroll gesture fighting the camera. Asking for fullscreen on the first tap
 * fixes both, and locking to landscape fixes the rest. Both are best effort:
 * iOS Safari refuses fullscreen on anything but video, so every function here
 * reports what actually happened rather than assuming.
 */

/** True when the document is currently fullscreen. */
export function isFullscreen(): boolean {
    if (typeof document === 'undefined') return false;
    return document.fullscreenElement !== null;
}

/** True when the browser can go fullscreen at all. */
export function canFullscreen(element: HTMLElement = document.documentElement): boolean {
    return typeof element.requestFullscreen === 'function';
}

/**
 * Ask for fullscreen. Must be called from a user gesture.
 * @returns True when the document ended up fullscreen.
 */
export async function requestFullscreen(element: HTMLElement = document.documentElement): Promise<boolean> {
    if (isFullscreen()) return true;
    if (!canFullscreen(element)) return false;
    try {
        await element.requestFullscreen({ navigationUI: 'hide' });
        // Where the browser allows it (Chromium), keep Escape for the game: a tap then closes a
        // menu and only a long press leaves fullscreen. Elsewhere Escape leaves fullscreen as usual.
        void (navigator as Navigator & { keyboard?: { lock?: (keys: string[]) => Promise<void> } }).keyboard?.lock?.(['Escape']).catch(() => undefined);
        return isFullscreen();
    } catch {
        // A browser that refuses is not an error worth surfacing.
        return false;
    }
}

/** Leave fullscreen, if we are in it. */
export async function exitFullscreen(): Promise<void> {
    if (!isFullscreen()) return;
    try {
        (navigator as Navigator & { keyboard?: { unlock?: () => void } }).keyboard?.unlock?.();
        await document.exitFullscreen();
    } catch {
        // Ignore.
    }
}

/**
 * Ask for landscape. Silently does nothing where the API is missing, which is
 * every desktop browser and Safari on iOS.
 */
export async function requestLandscape(): Promise<boolean> {
    const orientation = screen.orientation as (ScreenOrientation & { lock?: (mode: string) => Promise<void> }) | undefined;
    if (!orientation?.lock) return false;
    try {
        await orientation.lock('landscape');
        return true;
    } catch {
        return false;
    }
}

export type FullscreenButtonOptions = {
    /** Where to mount it. Defaults to the UI root, top right. */
    parent: HTMLElement;
    /** Which corner of the screen it sits in. Defaults to the top right. */
    corner?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
    /** Also try to lock the orientation. Defaults to true. */
    landscape?: boolean;
    /** Hide the button once fullscreen is on. Defaults to true. */
    hideWhenActive?: boolean;
    /** Called after the state changed. */
    onChange?: (fullscreen: boolean) => void;
};

/**
 * A small button that enters fullscreen and landscape on the first tap.
 * Returns a function that removes it.
 */
export function addFullscreenButton(options: FullscreenButtonOptions): () => void {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `fullscreen-button is-${options.corner ?? 'top-right'}`;
    button.textContent = '⛶';
    button.title = 'Fullscreen';
    options.parent.appendChild(button);

    const update = (): void => {
        const active = isFullscreen();
        button.textContent = active ? '⤡' : '⛶';
        button.title = active ? 'Leave fullscreen' : 'Fullscreen';
        if (options.hideWhenActive ?? true) button.classList.toggle('is-hidden', active);
        options.onChange?.(active);
    };

    const onClick = async (): Promise<void> => {
        if (isFullscreen()) await exitFullscreen();
        else {
            await requestFullscreen();
            if (options.landscape ?? true) await requestLandscape();
        }
        update();
    };

    button.addEventListener('click', () => void onClick());
    const onFullscreenChange = (): void => update();
    document.addEventListener('fullscreenchange', onFullscreenChange);
    update();

    return () => {
        document.removeEventListener('fullscreenchange', onFullscreenChange);
        button.remove();
    };
}
