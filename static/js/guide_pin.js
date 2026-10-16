"use strict";

window.GuidePin = {
    attach(element, marker, guide, createSvg) {
        element.querySelector(":scope > .sign-guide-pin")?.remove();
        const config = marker.guidePin;
        if (marker.kind !== "image" || marker.usage !== "decoration" || !config) return;
        const target = guide.markers.find((entry) => entry.id === config.markerId && entry.kind === "pin");
        if (!target || !target.label) return;
        const badge = document.createElement("span");
        badge.className = "sign-guide-pin";
        badge.dataset.guidePinFor = target.id;
        badge.setAttribute("aria-hidden", "true");
        badge.style.left = `${config.x}%`; badge.style.top = `${config.y}%`;
        element.style.setProperty("--guide-pin-size", `${marker.size * config.size / 100}px`);
        badge.append(createSvg(target.label, target.color));
        element.append(badge);
        return badge;
    },
};
