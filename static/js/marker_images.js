"use strict";

// Use the visible image's aspect ratio in every editor and viewer.
window.MarkerImages = {
    refresh(element, marker) {
        const ratio = Number(element.dataset.imageRatio) || 1;
        element.style.setProperty("--content-width", `${marker.size * Math.min(1, ratio)}px`);
        element.style.setProperty("--content-height", `${marker.size * Math.min(1, 1 / ratio)}px`);
        if (marker.guidePin) element.style.setProperty("--guide-pin-size", `${marker.size * marker.guidePin.size / 100}px`);
    },
    attach(image, path, marker, element) {
        const trim = marker.trimImage !== false;
        element.classList.toggle("uses-content-size", trim);
        const encoded = String(path || "").split("/").map(encodeURIComponent).join("/");
        const original = `${window.KOUKA_STATIC_BASE ?? "/static/images/"}${encoded}`;
        image.addEventListener("load", () => {
            element.dataset.imageRatio = String(image.naturalWidth / image.naturalHeight || 1);
            this.refresh(element, marker);
        });
        image.addEventListener("error", () => {
            if (image.getAttribute("src") !== original) image.src = original;
        });
        image.src = trim ? `${window.KOUKA_MARKER_IMAGE_BASE ?? "/api/marker-image/"}${encoded}` : original;
        this.refresh(element, marker);
    },
    addResizeHandle(element, marker, options) {
        const handle = document.createElement("span");
        handle.className = "marker-resize-handle";
        handle.tabIndex = 0;
        handle.setAttribute("role", "button");
        handle.setAttribute("aria-label", "画像のサイズ変更。ドラッグ、または矢印キーで調整");
        handle.title = "ドラッグして画像本体の大きさを変更";
        handle.textContent = "↔";
        handle.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); });
        handle.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); });
        handle.addEventListener("keydown", (event) => {
            const step = {ArrowUp: 10, ArrowRight: 10, ArrowDown: -10, ArrowLeft: -10}[event.key];
            if (!step || !options.canStart()) return;
            event.preventDefault(); event.stopPropagation();
            options.resize(marker.size + step);
        });
        handle.addEventListener("pointerdown", (event) => {
            event.stopPropagation();
            if (event.button !== 0 || !options.canStart()) return;
            event.preventDefault();
            const rect = element.getBoundingClientRect();
            const center = {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
            const start = {x: event.clientX - center.x, y: event.clientY - center.y};
            const distance = start.x ** 2 + start.y ** 2;
            if (!distance) return;
            const originalSize = marker.size;
            options.start();
            handle.setPointerCapture(event.pointerId);
            const move = (e) => {
                if (e.pointerId !== event.pointerId) return;
                const factor = ((e.clientX - center.x) * start.x + (e.clientY - center.y) * start.y) / distance;
                options.resize(Math.round(originalSize * Math.max(.01, factor)));
            };
            const finish = (e, cancelled = false) => {
                if (e.pointerId !== event.pointerId) return;
                handle.removeEventListener("pointermove", move);
                handle.removeEventListener("pointerup", finish);
                handle.removeEventListener("pointercancel", cancel);
                handle.removeEventListener("lostpointercapture", cancel);
                if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
                options.finish(cancelled);
            };
            const cancel = (e) => {
                if (e.pointerId !== event.pointerId) return;
                options.resize(originalSize);
                finish(e, true);
            };
            handle.addEventListener("pointermove", move);
            handle.addEventListener("pointerup", finish);
            handle.addEventListener("pointercancel", cancel);
            handle.addEventListener("lostpointercapture", cancel);
        });
        element.append(handle);
    },
};
