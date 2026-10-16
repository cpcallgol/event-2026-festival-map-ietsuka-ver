"use strict";

window.Recommendations = {
    defaults: Object.freeze({enabled: true, title: "模擬店のおすすめ", accentColor: "#168650", backgroundColor: "#fffdf7", textColor: "#392b26", autoRotate: true, intervalSeconds: 7, itemIds: null}),
    settings(guide) { return {...this.defaults, ...guide?.settings?.recommendations}; },
    items(guide, settings = this.settings(guide)) {
        if (settings.itemIds === null) return guide.items.filter((item) => item.type === "stall");
        const items = new Map(guide.items.map((item) => [item.id, item]));
        return settings.itemIds.map((id) => items.get(id)).filter(Boolean);
    },
    paint(element, settings) {
        for (const [field, css] of [["accentColor", "accent"], ["backgroundColor", "background"], ["textColor", "text"]]) {
            element.style.setProperty(`--recommend-${css}`, settings[field]);
        }
        const rgb = settings.accentColor.match(/[a-f\d]{2}/gi).map((hex) => {
            const value = parseInt(hex, 16) / 255;
            return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
        });
        const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        element.style.setProperty("--recommend-header-text", luminance > .179 ? "#222222" : "#ffffff");
    },
};
