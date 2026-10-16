"use strict";

// Original images and percentage coordinates stay unchanged at every zoom level.
window.FloorMapView = class FloorMapView {
    constructor(viewport, stage, image, options = {}) {
        this.viewport = viewport; this.stage = stage; this.image = image; this.options = options;
        this.plan = null; this.zoom = 1; this.baseScale = 1; this.x = 0; this.y = 0; this.pan = null;
        viewport.classList.add("floor-pan-viewport"); stage.classList.add("floor-pan-stage");
        image.addEventListener("load", () => this.reset());
        viewport.addEventListener("pointerdown", (event) => this.beginPan(event));
        viewport.addEventListener("click", (event) => {
            if (this.suppressClick) { event.preventDefault(); event.stopPropagation(); this.suppressClick = false; }
        }, true);
        viewport.addEventListener("wheel", (event) => {
            if (!event.ctrlKey) return;
            event.preventDefault(); this.setZoom(this.zoom + (event.deltaY < 0 ? .25 : -.25));
        }, {passive: false});
    }
    setPlan(plan) {
        const changed = this.plan?.id !== plan?.id; this.plan = plan;
        if (changed) { this.zoom = 1; this.x = 0; this.y = 0; }
        const next = this.options.assetUrl(plan.image);
        if (this.image.getAttribute("src") !== next) this.image.src = next;
        else if (changed) this.reset(); else this.render();
    }
    drawingBounds() {
        const b = this.plan?.contentBounds || {x: 0, y: 0, width: 1, height: 1};
        let left = b.x, top = b.y, right = b.x + b.width, bottom = b.y + b.height;
        const ratio = this.image.naturalWidth / this.image.naturalHeight || 1.414;
        for (const marker of this.plan?.markers || []) {
            const halfX = Math.max(.02, marker.size / 1000 * .6), halfY = halfX * ratio;
            left = Math.min(left, marker.x / 100 - halfX); top = Math.min(top, marker.y / 100 - halfY);
            right = Math.max(right, marker.x / 100 + halfX); bottom = Math.max(bottom, marker.y / 100 + halfY);
        }
        left = Math.max(0, left); top = Math.max(0, top); right = Math.min(1, right); bottom = Math.min(1, bottom);
        return {x: left, y: top, width: Math.max(.05, right - left), height: Math.max(.05, bottom - top)};
    }
    reset() {
        if (!this.image.naturalWidth || !this.viewport.clientWidth || !this.viewport.clientHeight) return;
        this.zoom = 1;
        const ratio = this.image.naturalWidth / this.image.naturalHeight; this.width = 1000; this.height = 1000 / ratio;
        const b = this.drawingBounds();
        this.baseScale = Math.min(Math.max(1, this.viewport.clientWidth - 24) / (this.width * b.width), Math.max(1, this.viewport.clientHeight - 24) / (this.height * b.height));
        this.x = this.viewport.clientWidth / 2 - (b.x + b.width / 2) * this.width * this.baseScale;
        this.y = this.viewport.clientHeight / 2 - (b.y + b.height / 2) * this.height * this.baseScale;
        this.render();
    }
    resize() { const zoom = this.zoom; this.reset(); this.setZoom(zoom); }
    setZoom(value) {
        if (!this.width) return;
        const next = Math.max(1, Math.min(6, value)), factor = next / this.zoom;
        const centerX = this.viewport.clientWidth / 2, centerY = this.viewport.clientHeight / 2;
        this.x = centerX - (centerX - this.x) * factor; this.y = centerY - (centerY - this.y) * factor;
        this.zoom = next; this.render();
    }
    render() {
        if (!this.width) return;
        this.stage.style.width = this.width + "px"; this.stage.style.height = this.height + "px";
        this.stage.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.baseScale * this.zoom})`;
        if (this.options.onChange) this.options.onChange(this);
    }
    beginPan(event) {
        if (event.button !== 0 || this.pan || event.target.closest("button, input, select, .floor-marker, .floor-overlay-marker[data-item-id]")) return;
        event.preventDefault(); event.stopPropagation();
        const rect = this.viewport.getBoundingClientRect(), pxScale = rect.width / this.viewport.clientWidth || 1;
        const start = {pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: this.x, y: this.y};
        this.pan = start; this.viewport.setPointerCapture(event.pointerId);
        const move = (e) => {
            if (e.pointerId !== start.pointerId) return;
            const dx = (e.clientX - start.clientX) / pxScale, dy = (e.clientY - start.clientY) / pxScale;
            if (Math.hypot(dx, dy) > 4) this.suppressClick = true;
            const visible = 36, scale = this.baseScale * this.zoom;
            this.x = Math.min(this.viewport.clientWidth - visible, Math.max(visible - this.width * scale, start.x + dx));
            this.y = Math.min(this.viewport.clientHeight - visible, Math.max(visible - this.height * scale, start.y + dy));
            this.render();
        };
        const finish = (e) => {
            if (e.pointerId !== start.pointerId) return;
            if (this.viewport.hasPointerCapture(e.pointerId)) this.viewport.releasePointerCapture(e.pointerId);
            this.viewport.removeEventListener("pointermove", move); this.viewport.removeEventListener("pointerup", finish); this.viewport.removeEventListener("pointercancel", finish);
            this.pan = null;
        };
        this.viewport.addEventListener("pointermove", move); this.viewport.addEventListener("pointerup", finish); this.viewport.addEventListener("pointercancel", finish);
    }
};

