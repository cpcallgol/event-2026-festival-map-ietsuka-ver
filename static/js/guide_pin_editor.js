"use strict";

window.GuidePinEditor = (() => {
    const defaults = {x: 45.5, y: 25.5, size: 10};
    const get = (id) => document.getElementById(id);
    let pending = null, draft = null, source = null, guide = null, createSvg = null;
    let endDrag = null;

    function finish(value) {
        if (!pending) return;
        if (endDrag) endDrag();
        const resolve = pending;
        pending = null;
        get("guidePinPreviewImage").onload = null;
        get("guidePinPreviewImage").onerror = null;
        get("guidePinDialog").close();
        resolve(value);
    }

    function writePosition() {
        for (const [field, id] of [["x", "guidePinX"], ["y", "guidePinY"], ["size", "guidePinSize"]]) {
            get(id).value = draft[field];
        }
    }

    function renderPreview() {
        if (!pending) return;
        const enabled = get("guidePinEnabled").checked;
        get("guidePinControls").disabled = !enabled;
        const stage = get("guidePinPreviewStage");
        const size = Math.max(stage.clientWidth, stage.clientHeight);
        GuidePin.attach(stage, {...source, size, guidePin: enabled ? draft : null}, guide, createSvg);
    }

    function readPosition() {
        for (const [field, id] of [["x", "guidePinX"], ["y", "guidePinY"], ["size", "guidePinSize"]]) {
            const input = get(id);
            if (input.value !== "" && input.validity.valid) draft[field] = Number(input.value);
        }
        renderPreview();
    }

    function choose(marker, currentGuide, svgFactory) {
        if (pending) finish(undefined);
        source = marker;
        guide = currentGuide;
        createSvg = svgFactory;
        const pins = guide.markers.filter((entry) => entry.kind === "pin");
        const target = get("guidePinTarget");
        target.replaceChildren(...pins.map((pin) => {
            const option = document.createElement("option");
            option.value = pin.id;
            const titles = (pin.itemIds || []).map((id) => guide.items.find((item) => item.id === id)?.title).filter(Boolean);
            option.textContent = `ピン${pin.label || "（未採番）"}${titles.length ? ` — ${titles.join("・")}` : ""}`;
            return option;
        }));
        draft = {...defaults, markerId: (pins.find((pin) => pin.label === "1") || pins[0])?.id || "", ...marker.guidePin};
        if (!pins.some((pin) => pin.id === draft.markerId)) draft.markerId = pins[0]?.id || "";
        target.value = draft.markerId;
        get("guidePinEnabled").checked = Boolean(marker.guidePin && pins.length);
        get("guidePinEnabled").disabled = !pins.length;
        get("guidePinHelp").textContent = pins.length
            ? "番号を振り直すと、看板の番号も連動します。閲覧中は押しても反応しません。"
            : "案内先のピンがありません。先にマップにピンを追加してください。";
        writePosition();
        const result = new Promise((resolve) => pending = resolve);
        const image = get("guidePinPreviewImage"), stage = get("guidePinPreviewStage");
        stage.style.width = "240px";
        image.style.aspectRatio = marker.trimImage === false ? "1" : "auto";
        image.style.objectFit = "contain";
        const encoded = String(marker.image).split("/").map(encodeURIComponent).join("/");
        const original = `/static/images/${encoded}`;
        image.onload = () => {
            if (!pending || source !== marker) return;
            const ratio = marker.trimImage === false ? 1 : image.naturalWidth / image.naturalHeight || 1;
            stage.style.width = `${Math.min(440, 260 * ratio)}px`;
            renderPreview();
        };
        image.onerror = () => { if (pending && image.getAttribute("src") !== original) image.src = original; };
        image.src = marker.trimImage === false ? original : `/api/marker-image/${encoded}`;
        get("guidePinDialog").showModal();
        renderPreview();
        return result;
    }

    document.addEventListener("DOMContentLoaded", () => {
        for (const id of ["guidePinClose", "guidePinCancel"]) get(id).addEventListener("click", () => finish(undefined));
        get("guidePinDialog").addEventListener("cancel", (event) => {
            event.preventDefault(); event.stopPropagation(); finish(undefined);
        });
        get("guidePinEnabled").addEventListener("change", renderPreview);
        get("guidePinTarget").addEventListener("change", () => { draft.markerId = get("guidePinTarget").value; renderPreview(); });
        for (const id of ["guidePinX", "guidePinY", "guidePinSize"]) {
            get(id).required = true;
            get(id).addEventListener("input", readPosition);
        }
        get("guidePinReset").addEventListener("click", () => { Object.assign(draft, defaults); writePosition(); renderPreview(); });
        get("guidePinConfirm").addEventListener("click", () => {
            if (!get("guidePinEnabled").checked) { finish(null); return; }
            for (const id of ["guidePinTarget", "guidePinX", "guidePinY", "guidePinSize"]) {
                if (!get(id).reportValidity()) return;
            }
            if (!guide.markers.some((pin) => pin.id === draft.markerId && pin.kind === "pin")) return;
            readPosition();
            finish({...draft});
        });
        get("guidePinPreviewStage").addEventListener("pointerdown", (event) => {
            const badge = event.target.closest(".sign-guide-pin");
            if (!badge || event.button !== 0 || !pending || endDrag) return;
            event.preventDefault();
            const start = {x: draft.x, y: draft.y};
            badge.setPointerCapture(event.pointerId);
            const move = (e) => {
                if (e.pointerId !== event.pointerId) return;
                const rect = get("guidePinPreviewStage").getBoundingClientRect();
                const percent = (value, origin, length) => Math.round(Math.max(0, Math.min(100, (value - origin) / length * 100)) * 10) / 10;
                draft.x = percent(e.clientX, rect.left, rect.width);
                draft.y = percent(e.clientY, rect.top, rect.height);
                writePosition();
                badge.style.left = `${draft.x}%`; badge.style.top = `${draft.y}%`;
            };
            const finishDrag = (e) => { if (!e || e.pointerId === event.pointerId) cleanup(); };
            const cancelDrag = (e) => {
                if (e.pointerId !== event.pointerId) return;
                Object.assign(draft, start); writePosition(); cleanup(); renderPreview();
            };
            const cleanup = () => {
                badge.removeEventListener("pointermove", move);
                badge.removeEventListener("pointerup", finishDrag);
                badge.removeEventListener("pointercancel", cancelDrag);
                badge.removeEventListener("lostpointercapture", cancelDrag);
                endDrag = null;
                if (badge.hasPointerCapture(event.pointerId)) badge.releasePointerCapture(event.pointerId);
            };
            endDrag = cleanup;
            badge.addEventListener("pointermove", move);
            badge.addEventListener("pointerup", finishDrag);
            badge.addEventListener("pointercancel", cancelDrag);
            badge.addEventListener("lostpointercapture", cancelDrag);
        });
        window.addEventListener("resize", renderPreview);
    });
    return {choose};
})();
