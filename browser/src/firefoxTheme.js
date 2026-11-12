// Firefox's own window (tabs, toolbar, address bar) in the theme colors,
// for the browser.theme API.
export function firefoxThemeFor(palette) {
    const c = palette.colors;
    return {colors: {
        frame: c.headerbar_bg, frame_inactive: c.headerbar_bg, tab_background_text: c.headerbar_fg,
        tab_selected: c.background, tab_text: c.foreground, tab_line: c.accent,
        toolbar: c.background, toolbar_text: c.foreground, icons: c.foreground,
        toolbar_field: c.surface, toolbar_field_text: c.foreground,
        toolbar_field_focus: c.surface, toolbar_field_text_focus: c.foreground,
        popup: c.surface, popup_text: c.foreground, sidebar: c.surface, sidebar_text: c.foreground,
        ntp_background: c.background, ntp_text: c.foreground,
    }};
}
