// Connection policy for the native host: retry delays and what a failure means.
export const HOST = 'io.github.adamciktomas.paletka';
const MAX_DELAY = 30000;
const FAILURES_BEFORE_REPORT = 3;

export function retryDelay(attempt) {
    return Math.min(MAX_DELAY, 2000 * 2 ** attempt);
}

// 'connecting' | 'no-host' | 'needs-permission'. The Firefox snap reaches the
// host through the desktop portal, which fails with other errors until the
// user allows Paletka while Firefox is focused.
export function classifyFailure(message, browser, failures) {
    if (failures < FAILURES_BEFORE_REPORT)
        return 'connecting';
    const missing = /not found|No such native application/i.test(message ?? '');
    if (browser === 'firefox' && !missing)
        return 'needs-permission';
    return 'no-host';
}

export function browserId({isFirefox, brands}) {
    if (isFirefox)
        return 'firefox';
    return brands.includes('Google Chrome') ? 'chrome' : 'chromium';
}
