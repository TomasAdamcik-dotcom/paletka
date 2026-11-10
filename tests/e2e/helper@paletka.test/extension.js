// Test-only helper, never shipped: unlocks Eval/Screenshot D-Bus APIs.
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class E2EHelper extends Extension {
    enable() {
        global.context.unsafe_mode = true;
    }

    disable() {
        global.context.unsafe_mode = false;
    }
}
