// Recolors a page with a Paletka palette (minimal: the page background).
export class Recolorer {
    constructor(document, palette) {
        this._doc = document;
        this._palette = palette;
    }

    apply() {
        this._doc.documentElement.style.setProperty('background-color', this._palette.colors.background, 'important');
    }

    update(palette) {
        this._palette = palette;
        this.apply();
    }

    revert() {
        this._doc.documentElement.style.removeProperty('background-color');
    }
}
