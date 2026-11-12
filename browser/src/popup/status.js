// The popup's status line for the background's connection state.
const NAMES = {chrome: 'Chrome', chromium: 'Chromium', firefox: 'Firefox'};

export function statusText({state, palette, browser}) {
    switch (state) {
    case 'connected':
        return palette?.active
            ? `${palette.name}, ${palette.dark ? 'dark' : 'light'}`
            : 'Ubuntu theme: pages keep their colors';
    case 'no-host':
        return `In Paletka → Settings → Browsers, turn on ${NAMES[browser] ?? 'this browser'}.`;
    case 'needs-permission':
        return 'Click into this Firefox window and allow Paletka in the system dialog.';
    default:
        return 'Connecting to Paletka…';
    }
}
