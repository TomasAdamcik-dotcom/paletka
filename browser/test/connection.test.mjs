import {test} from 'node:test';
import assert from 'node:assert/strict';

import {retryDelay, classifyFailure, browserId} from '../src/connection.js';

test('reconnect delays double up to 30 s', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(retryDelay), [2000, 4000, 8000, 16000, 30000, 30000]);
});

test('the first failures only mean connecting', () => {
    assert.equal(classifyFailure('Specified native messaging host not found.', 'chrome', 1), 'connecting');
});

test('after three failures a missing host is reported', () => {
    assert.equal(classifyFailure('Specified native messaging host not found.', 'chrome', 3), 'no-host');
    assert.equal(classifyFailure('No such native application io.github.adamciktomas.paletka', 'firefox', 3), 'no-host');
});

test('Firefox failing for another reason waits for the portal permission', () => {
    assert.equal(classifyFailure('An unexpected error occurred', 'firefox', 3), 'needs-permission');
    assert.equal(classifyFailure('An unexpected error occurred', 'chrome', 3), 'no-host');
});

test('the browser is told apart from its API and brands', () => {
    assert.equal(browserId({isFirefox: true, brands: []}), 'firefox');
    assert.equal(browserId({isFirefox: false, brands: ['Chromium', 'Google Chrome']}), 'chrome');
    assert.equal(browserId({isFirefox: false, brands: ['Chromium']}), 'chromium');
});
