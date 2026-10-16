"use strict";

// Map positions use image-relative percentages; all editor layout coordinates are pixels.
const DESIGN_WIDTH = 1600;
const DESIGN_HEIGHT = 900;
const state = {
    guide: null, assets: [], selectedMarkerId: null, openMarkerId: null,
    selectedItemId: null, draft: null, dirty: false, busy: false,
    drag: null, imagePurpose: null, pendingDelete: null, lastTap: null,
    numbering: null, overlayEditing: false, provisionalMarkerId: null,
    assetMode: null, assetsLoaded: false, editingCategoryId: null, deletingCategoryId: null,
};
const $ = (id) => document.getElementById(id);
const clone = (value) => JSON.parse(JSON.stringify(value));
const markerById = (id) => state.guide.markers.find((marker) => marker.id === id);
const itemById = (id) => state.guide.items.find((item) => item.id === id);
const categoryById = (id) => state.guide.categories.find((category) => category.id === id);
const linkedItems = (marker) => (marker?.itemIds || []).map(itemById).filter(Boolean);
const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const assetUrl = (path) => path ? `/static/images/${String(path).split("/").map(encodeURIComponent).join("/")}` : "";
const floorOverlayLayout = () => state.guide?.settings?.floorOverlay;
const FACILITY_ICONS = [
    {name: "男性用トイレ", path: "library/男性用トイレ.png"},
    {name: "女性用トイレ", path: "library/女性用トイレ.png"},
    {name: "多目的トイレ", path: "floors/多目的トイレ.png"},
    {name: "受付", path: "library/受付.png"},
    {name: "授乳室", path: "library/授乳室.png"},
    {name: "喫煙場所", path: "library/喫煙場所.png"},
    {name: "ウォーターサーバー", path: "library/ウォーターサーバー.png"},
];
const ARROW_ASSET = {name: "矢印", path: "floors/矢印.png"};
const DETAIL_INPUT_FIELDS = ["title", "department", "grade", "organization", "building", "floor", "description", "duration", "schedule", "targetAudience", "capacity", "catchCopy"];
let toastTimer;

function createPinSvg(labelValue, color) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 80 112");
    svg.setAttribute("aria-hidden", "true");
    const shape = document.createElementNS(ns, "path");
    shape.setAttribute("d", "M40 0C17.9 0 0 17.9 0 40c0 28 40 72 40 72s40-44 40-72C80 17.9 62.1 0 40 0Z");
    shape.setAttribute("fill", color);
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", "40"); circle.setAttribute("cy", "39"); circle.setAttribute("r", "19"); circle.setAttribute("fill", "#fff");
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", "40"); text.setAttribute("y", "40"); text.setAttribute("text-anchor", "middle"); text.setAttribute("dominant-baseline", "central");
    text.setAttribute("font-size", String(labelValue).length > 2 ? "17" : "26"); text.setAttribute("font-weight", "900"); text.setAttribute("fill", color);
    text.textContent = labelValue;
    svg.append(shape, circle, text);
    return svg;
}
function imageElement(path, alt = "") {
    const image = document.createElement("img"); image.src = assetUrl(path); image.alt = alt; image.draggable = false; return image;
}
function toast(message, error = false) {
    clearTimeout(toastTimer);
    $("toast").textContent = message;
    $("toast").className = `toast visible${error ? " error" : ""}`;
    toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 4600);
}
function markDirty() { state.dirty = true; renderSaveState(); }
function renderSaveState() {
    $("saveState").className = `save-state${state.dirty ? "" : " saved"}`;
    $("saveState").textContent = state.busy ? "処理中…" : state.numbering ? "ピン番号を手動割り当て中" : state.draft ? "詳細情報を編集中" : state.dirty ? "未保存の変更があります" : "保存済み";
    $("saveButton").disabled = state.busy || Boolean(state.draft) || Boolean(state.numbering) || !state.guide;
    $("saveButton").title = state.numbering ? "番号の手動割り当てを完了または取り消してください" : state.draft ? "詳細情報を決定または取り消してから保存してください" : "";
}
function setBusy(busy, message = "処理しています") {
    state.busy = busy;
    $("loadingOverlay").hidden = !busy;
    $("loadingText").textContent = message;
    renderSaveState();
    updateControls();
}
function fitCanvas() {
    const scale = Math.min(innerWidth / DESIGN_WIDTH, innerHeight / DESIGN_HEIGHT);
    $("screenShell").style.width = `${DESIGN_WIDTH * scale}px`;
    $("screenShell").style.height = `${DESIGN_HEIGHT * scale}px`;
    $("editorCanvas").style.transform = `scale(${scale})`;
    fitMap();
}
function fitMap() {
    const img = $("mapImage"), area = $("mapArea");
    if (!img.naturalWidth) return;
    const ratio = img.naturalWidth / img.naturalHeight;
    const width = Math.min(area.clientWidth, area.clientHeight * ratio);
    $("mapStage").style.width = `${width}px`;
    $("mapStage").style.height = `${width / ratio}px`;
    renderFloorOverlayEditor();
}
function updateControls() {
    const blocked = state.busy || Boolean(state.draft) || Boolean(state.numbering) || !state.guide;
    ["pinButton", "facilityButton", "imageButton", "floorOverlayButton", "addIconButton"].forEach((id) => $(id).disabled = blocked);
    $("previewButton").disabled = blocked;
    $("renumberButton").disabled = blocked;
    const marker = state.guide && markerById(state.selectedMarkerId);
    const imageSelected = marker?.kind === "image";
    const signSelected = imageSelected && marker.usage === "decoration";
    $("guidePinButton").hidden = !signSelected;
    $("guidePinButton").disabled = blocked || !signSelected;
    $("renumberButton").hidden = Boolean(signSelected);
    const minSize = imageSelected ? 24 : 28, maxSize = imageSelected ? 1200 : 260;
    const overlay = Boolean(state.overlayEditing && floorOverlayLayout());
    $("floorOverlayButton").classList.toggle("is-active", overlay);
    $("floorOverlayButton").setAttribute("aria-pressed", String(overlay));
    ["sizeInput", "sizeUpButton", "sizeDownButton"].forEach((id) => $(id).disabled = blocked || (!marker && !overlay));
    $("lockInput").disabled = blocked || !marker;
    $("trash").disabled = blocked || !marker;
    $("rotateImageButton").disabled = blocked || marker?.kind !== "image";
    $("calloutInput").disabled = blocked || marker?.kind !== "image";
    $("calloutInput").checked = Boolean(marker?.callout);
    $("trimImageInput").disabled = blocked || !imageSelected;
    $("trimImageInput").checked = imageSelected && marker.trimImage !== false;
    $("categoryManagerButton").disabled = blocked;
    $("recommendationButton").disabled = blocked;
    if (state.guide) {
        $("facilityButton").disabled = blocked || !state.guide.categories.some((entry) => entry.area === "facility");
        $("pinButton").disabled = blocked || !state.guide.categories.some((entry) => entry.area !== "facility");
    }
    if ((marker || overlay) && document.activeElement !== $("sizeInput")) $("sizeInput").value = overlay ? floorOverlayLayout().width : marker.size;
    $("sizeInput").min = overlay ? "20" : String(minSize);
    $("sizeInput").max = overlay ? "75" : String(maxSize);
    $("sizeLabel").textContent = overlay ? "幅(%)" : imageSelected ? "画像(長辺)" : "サイズ";
    $("lockInput").checked = Boolean(marker?.locked);
    $("selectionName").textContent = overlay ? "フロア案内枠" : marker ? (marker.kind === "pin" ? `${categoryById(marker.categoryId)?.label || ""}・${marker.label}` : "画像") : "未選択";
    $("mapSelectionMessage").textContent = overlay ? "フロア案内枠を選択中（ドラッグで移動）" : marker ? `${marker.kind === "pin" ? `${categoryById(marker.categoryId)?.label || ""}・ピン${marker.label}` : "画像"}を選択中${marker.locked ? "（位置固定）" : ""}` : "ピン・画像・フロア案内枠を選択すると編集できます";
    $("sizeHint").textContent = overlay ? "表示幅 ／ 20〜75%" : imageSelected ? "画像本体 ／ 24〜1200" : marker ? `ピン ${marker.label} ／ 28〜260` : "変更する対象をタップ";
    if ((marker || overlay) && !blocked) {
        const size = overlay ? floorOverlayLayout().width : marker.size;
        $("sizeUpButton").disabled = size >= (overlay ? 75 : maxSize);
        $("sizeDownButton").disabled = size <= (overlay ? 20 : minSize);
    }
    if (state.openMarkerId) {
        const openMarker = markerById(state.openMarkerId);
        if (openMarker?.usage === "facility" && linkedItems(openMarker).length >= 1) $("addIconButton").disabled = true;
    }
    renderSaveState();
}
function updateMarkerPosition(marker, element) {
    element.style.left = `${marker.x}%`; element.style.top = `${marker.y}%`;
    element.style.setProperty("--size", `${marker.size}px`);
    element.style.setProperty("--rotation", `${marker.rotation || 0}deg`);
    if (marker.kind === "image") MarkerImages.refresh(element, marker);
}
function renderFloorOverlayEditor() {
    const element = $("floorOverlayEditor");
    const layout = floorOverlayLayout();
    if (!element || !layout || !state.overlayEditing) {
        if (element) element.hidden = true;
        return;
    }
    element.hidden = false;
    element.style.left = `${layout.x}%`;
    element.style.top = `${layout.y}%`;
    element.style.width = `${layout.width}%`;
    element.classList.add("is-selected");
}
function selectFloorOverlay() {
    if (state.busy || state.draft || state.numbering) return;
    state.openMarkerId = null; state.selectedItemId = null;
    state.selectedMarkerId = null;
    state.overlayEditing = true;
    document.querySelectorAll(".map-marker").forEach((node) => node.classList.remove("is-selected"));
    renderPanel();
    renderFloorOverlayEditor();
    updateControls();
    toast("青い枠をドラッグして表示位置を調整できます。");
}

function toggleFloorOverlay() {
    if (state.busy || state.draft || state.numbering) return;
    if (!state.overlayEditing) {
        selectFloorOverlay();
        return;
    }
    state.overlayEditing = false;
    renderFloorOverlayEditor();
    updateControls();
    toast("フロア案内枠を閉じました。");
}
function beginFloorOverlayDrag(event) {
    const layout = floorOverlayLayout();
    if (!layout || state.busy || state.draft || state.numbering || event.button !== 0 || state.drag) return;
    event.preventDefault();
    selectFloorOverlay();
    const element = $("floorOverlayEditor");
    const rect = $("mapStage").getBoundingClientRect();
    const drag = {kind: "floorOverlay", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originalX: layout.x, originalY: layout.y, rect, moved: false};
    state.drag = drag;
    element.setPointerCapture(event.pointerId);
    const move = (e) => {
        if (e.pointerId !== drag.pointerId) return;
        const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        element.classList.add("dragging");
        layout.x = Math.min(100 - layout.width, Math.max(0, drag.originalX + dx / rect.width * 100));
        layout.y = Math.min(100 - layout.width / 2, Math.max(0, drag.originalY + dy / rect.height * 100));
        renderFloorOverlayEditor();
    };
    const finish = (e, cancelled = false) => {
        if (e.pointerId !== drag.pointerId || state.drag !== drag) return;
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", end);
        element.removeEventListener("pointercancel", cancel);
        if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
        state.drag = null;
        element.classList.remove("dragging");
        if (cancelled) { layout.x = drag.originalX; layout.y = drag.originalY; }
        else if (drag.moved) { layout.x = Number(layout.x.toFixed(2)); layout.y = Number(layout.y.toFixed(2)); markDirty(); }
        renderFloorOverlayEditor();
    };
    const end = (e) => finish(e, false);
    const cancel = (e) => finish(e, true);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", cancel);
}
function renderMarkers() {
    $("mapMarkers").replaceChildren(...state.guide.markers.map((marker) => {
        const button = document.createElement("button");
        button.type = "button"; button.className = `map-marker${marker.kind === "image" ? " is-image" : ""}`;
        button.classList.toggle("is-facility", marker.usage === "facility");
        button.classList.toggle("has-callout", marker.kind === "image" && Boolean(marker.callout));
        button.style.setProperty("--marker-color", marker.color || "#3274b6");
        button.dataset.markerId = marker.id;
        button.classList.toggle("is-selected", marker.id === state.selectedMarkerId);
        button.classList.toggle("is-locked", Boolean(marker.locked));
        button.classList.toggle("numbering-target", Boolean(state.numbering?.pinIds.includes(marker.id)));
        button.classList.toggle("numbered", Boolean(state.numbering?.assignedIds.includes(marker.id)));
        button.style.zIndex = marker.layer + 1;
        updateMarkerPosition(marker, button);
        const category = categoryById(marker.categoryId);
        const label = marker.kind === "pin" ? `${category?.label || ""} ピン${marker.label}` : linkedItems(marker)[0]?.title || (marker.usage === "decoration" ? "装飾画像" : "施設画像");
        button.setAttribute("aria-label", label);
        button.title = marker.kind === "pin" ? `${label}（ダブルクリックで編集）` : label;
        if (marker.kind === "pin") button.append(createPinSvg(marker.label, marker.color));
        else {
            const image = imageElement(marker.image);
            MarkerImages.attach(image, marker.image, marker, button);
            button.append(image);
            GuidePin.attach(button, marker, state.guide, createPinSvg);
            let dirtyBeforeResize;
            MarkerImages.addResizeHandle(button, marker, {
                canStart: () => !state.busy && !state.draft && !state.numbering && !state.drag,
                start: () => { dirtyBeforeResize = state.dirty; state.drag = {resizing: true}; state.lastTap = null; selectMarker(marker.id); },
                resize: (size) => { if (state.selectedMarkerId !== marker.id) selectMarker(marker.id); applySize(size, true); },
                finish: (cancelled) => { state.drag = null; if (cancelled) { state.dirty = dirtyBeforeResize; renderSaveState(); } },
            });
        }
        if (marker.kind === "image" && marker.callout) {
            const tail = document.createElement("span"); tail.className = "callout-tail"; tail.setAttribute("aria-hidden", "true"); button.append(tail);
        }
        button.addEventListener("pointerdown", (event) => beginDrag(event, marker, button));
        button.addEventListener("dblclick", (event) => { event.preventDefault(); if (!state.busy && !state.draft && !state.numbering && (marker.kind === "pin" || marker.usage === "facility")) openPin(marker.id); });
        button.addEventListener("keydown", (event) => {
            if (["Enter", " "].includes(event.key)) {
                event.preventDefault();
                if (state.numbering) { assignManualNumber(marker.id); return; }
                if (!state.busy && !state.draft) { selectMarker(marker.id); if (marker.kind === "pin" || marker.usage === "facility") openPin(marker.id); }
            }
        });
        return button;
    }));
    updateControls();
}
function selectMarker(id) {
    if (state.draft || state.busy) return;
    state.overlayEditing = false;
    state.selectedMarkerId = id;
    renderFloorOverlayEditor();
    document.querySelectorAll(".map-marker").forEach((node) => node.classList.toggle("is-selected", node.dataset.markerId === id));
    updateControls();
}
function nextPinLabel() {
    const used = new Set(state.guide.markers.filter((marker) => marker.kind === "pin").map((marker) => marker.label));
    let number = 1; while (used.has(String(number))) number += 1;
    return String(number);
}
function newMarker(fields) {
    return { id: uid("marker"), itemId: null, itemIds: [], usage: "experience", kind: "pin", categoryId: "experience", label: "", color: "#e50062", image: null, x: 50, y: 50, size: 40, rotation: 0, layer: Math.min(100, Math.max(0, ...state.guide.markers.map((m) => m.layer)) + 1), locked: false, ...fields };
}
function closeCategory() { $("categoryPopover").hidden = true; $("pinButton").setAttribute("aria-expanded", "false"); }
function addPin() {
    if (state.busy || state.draft) return;
    if (state.guide.markers.length >= 800) { toast("ピン・画像は800件以内で登録してください。", true); return; }
    const category = categoryById($("categoryInput").value);
    if (!category) return;
    const usage = category.area === "facility" ? "facility" : category.area === "bottom-right" ? "stall" : "experience";
    const marker = newMarker({categoryId: category.id, color: category.color, usage, label: nextPinLabel()});
    state.guide.markers.push(marker); state.selectedMarkerId = marker.id;
    closeCategory(); renderMarkers(); markDirty();
    toast("中央にピンを配置しました。ドラッグで移動できます。");
}
function applySize(raw, finalize = false) {
    if (state.overlayEditing) {
        const layout = floorOverlayLayout();
        if (!layout || state.draft || state.busy) return;
        let width = Number(raw);
        if (String(raw).trim() === "" || !Number.isFinite(width)) { if (finalize) $("sizeInput").value = layout.width; return; }
        if (!finalize && (width < 20 || width > 75)) return;
        width = Math.round(Math.min(75, Math.max(20, width)) * 10) / 10;
        const nextX = Math.min(layout.x, 100 - width);
        const nextY = Math.min(layout.y, 100 - width / 2);
        if (width !== layout.width || nextX !== layout.x || nextY !== layout.y) { layout.width = width; layout.x = nextX; layout.y = nextY; markDirty(); }
        if (finalize) $("sizeInput").value = width;
        renderFloorOverlayEditor(); updateControls();
        return;
    }
    const marker = markerById(state.selectedMarkerId);
    if (!marker || state.draft || state.busy) return;
    const minSize = marker.kind === "image" ? 24 : 28, maxSize = marker.kind === "image" ? 1200 : 260;
    let size = Number(raw);
    if (String(raw).trim() === "" || !Number.isFinite(size)) { if (finalize) $("sizeInput").value = marker.size; return; }
    if (!finalize && (size < minSize || size > maxSize)) return;
    size = Math.round(Math.min(maxSize, Math.max(minSize, size)) * 10) / 10;
    if (size !== marker.size) { marker.size = size; markDirty(); }
    if (finalize) $("sizeInput").value = size;
    const element = document.querySelector(`[data-marker-id="${marker.id}"]`);
    if (element) updateMarkerPosition(marker, element);
    updateControls();
}
function overTrash(event) {
    const r = $("trash").getBoundingClientRect();
    return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
}
function beginDrag(event, marker, element) {
    if (state.numbering) {
        event.preventDefault();
        assignManualNumber(marker.id);
        return;
    }
    if (state.busy || state.draft || event.button !== 0 || state.drag) return;
    event.preventDefault(); selectMarker(marker.id); element.focus({preventScroll: true});
    if (marker.locked) { toast("このピン・画像は位置固定されています。位置固定を外すと移動できます。"); return; }
    const drag = { marker, element, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originalX: marker.x, originalY: marker.y, rect: $("mapStage").getBoundingClientRect(), moved: false };
    state.drag = drag; element.setPointerCapture(event.pointerId);
    const move = (e) => {
        if (e.pointerId !== drag.pointerId) return;
        const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) < 5) return;
        drag.moved = true; element.classList.add("dragging");
        marker.x = Math.min(100, Math.max(0, drag.originalX + dx / drag.rect.width * 100));
        marker.y = Math.min(100, Math.max(0, drag.originalY + dy / drag.rect.height * 100));
        updateMarkerPosition(marker, element); $("trash").classList.toggle("is-over", overTrash(e));
    };
    const end = (e) => {
        if (e.pointerId !== drag.pointerId) return;
        element.removeEventListener("pointermove", move); element.removeEventListener("pointerup", end); element.removeEventListener("pointercancel", cancel); element.removeEventListener("lostpointercapture", cancel);
        if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
        state.drag = null; element.classList.remove("dragging"); $("trash").classList.remove("is-over");
        if (drag.moved) {
            state.lastTap = null;
            if (overTrash(e)) {
                marker.x = drag.originalX; marker.y = drag.originalY; updateMarkerPosition(marker, element);
                requestDeleteMarker(marker.id);
            }
            else { marker.x = Number(marker.x.toFixed(3)); marker.y = Number(marker.y.toFixed(3)); markDirty(); }
        } else if (e.pointerType === "touch") {
            const now = Date.now();
            if (state.lastTap?.id === marker.id && now - state.lastTap.time < 450 && (marker.kind === "pin" || marker.usage === "facility")) { state.lastTap = null; openPin(marker.id); }
            else state.lastTap = {id: marker.id, time: now};
        }
    };
    const cancel = (e) => {
        if (e.pointerId !== drag.pointerId || state.drag !== drag) return;
        marker.x = drag.originalX; marker.y = drag.originalY; updateMarkerPosition(marker, element);
        drag.moved = false; state.lastTap = null;
        // Cancellation must not be treated as a tap or trash drop.
        end({pointerId: e.pointerId, pointerType: "cancelled"});
    };
    element.addEventListener("pointermove", move); element.addEventListener("pointerup", end); element.addEventListener("pointercancel", cancel); element.addEventListener("lostpointercapture", cancel);
}
function openPin(id) {
    if (state.draft || state.busy) return;
    const marker = markerById(id); if (!marker || (marker.kind !== "pin" && marker.usage !== "facility")) return;
    state.openMarkerId = id; state.selectedItemId = null; selectMarker(id); renderPanel();
    if (marker.usage === "facility") {
        const item = linkedItems(marker)[0];
        beginDraft(item?.image || marker.image, item || null);
    }
}
function closePanel() {
    if (state.busy) return;
    if (state.draft) { cancelDraft(); return; }
    state.openMarkerId = null; state.selectedItemId = null; renderPanel();
}
function renderPanel() {
    const marker = markerById(state.openMarkerId);
    $("sidePanel").hidden = !marker; $("workspace").classList.toggle("has-panel", Boolean(marker));
    if (marker) {
        $("sidePinVisual").replaceChildren(marker.kind === "pin" ? createPinSvg(marker.label, marker.color) : imageElement(marker.image));
        $("sideCategory").textContent = categoryById(marker.categoryId)?.label || "ピンの編集";
        $("closePanelButton").hidden = Boolean(state.draft);
        $("closePanelButton").title = "編集欄を閉じる";
        $("iconListPanel").hidden = Boolean(state.draft); $("detailForm").hidden = !state.draft;
        if (!state.draft) renderIconList();
    }
    updateControls(); fitMap();
}
function renderIconList() {
    const items = linkedItems(markerById(state.openMarkerId));
    const nodes = items.map((item) => {
        const button = document.createElement("button"); button.type = "button"; button.className = "icon-card";
        button.classList.toggle("is-selected", item.id === state.selectedItemId); button.setAttribute("aria-pressed", String(item.id === state.selectedItemId)); button.dataset.itemId = item.id;
        button.append(imageElement(item.image)); const title = document.createElement("span"); title.textContent = item.title; button.append(title);
        button.addEventListener("click", () => { state.selectedItemId = item.id; renderIconList(); });
        button.addEventListener("dblclick", () => beginDraft(item.image, item));
        return button;
    });
    if (!nodes.length) { const empty = document.createElement("p"); empty.className = "empty-list"; empty.textContent = "このピンにはまだアイコンがありません。上の「アイコン追加」から登録できます。"; nodes.push(empty); }
    $("iconList").replaceChildren(...nodes);
    $("deleteIconButton").disabled = !state.selectedItemId || state.busy;
    $("editIconButton").disabled = !state.selectedItemId || state.busy;
    $("iconSelectionHint").textContent = state.selectedItemId ? `選択中：${itemById(state.selectedItemId)?.title || ""}` : "アイコンを選択して編集・削除できます";
}
function beginDraft(image, existing = null, initial = {}) {
    const marker = markerById(state.openMarkerId); if (!marker || state.draft || state.busy) return;
    if (!existing && state.guide.items.length >= 500) { toast("企画は500件以内で登録してください。", true); return; }
    state.draft = existing ? clone(existing) : {id: uid("item"), type: marker.usage, categoryId: marker.categoryId, title: "", image, department: "", grade: "", organization: "", building: "", floor: "", organizer: "", description: "", waitState: "none", waitMinutes: null, experienceInfoEnabled: false, ...initial};
    state.draft.isNew = !existing;
    $("detailForm").reset();
    for (const field of DETAIL_INPUT_FIELDS) { $(`${field}Input`).value = state.draft[field] || ""; $(`${field}Input`).setCustomValidity(""); }
    $("experienceInfoEnabledInput").checked = state.draft.experienceInfoEnabled === true;
    $("detailImage").src = assetUrl(state.draft.image);
    $("legacyNotice").hidden = !existing || existing.detailsVersion >= (state.draft.type === "facility" ? 3 : 2);
    syncDraftForm(); syncDepartment(); syncBuilding(); closeCategory(); renderPanel();
    $("detailForm").querySelector(".detail-fields").scrollTop = 0;
    $("titleInput").focus({preventScroll: true});
}
function syncDraftForm() {
    const facility = state.draft?.type === "facility";
    $("detailForm").classList.toggle("is-facility-draft", facility);
    $("titleFieldLabel").textContent = facility ? "施設名" : "企画・展示名";
    $("titleInput").placeholder = facility ? "施設名を入力" : "企画・展示名を入力";
    $("departmentFields").hidden = facility;
    $("organizationField").hidden = facility;
    $("descriptionField").hidden = facility;
    $("experienceInfoToggle").hidden = facility;
    $("experienceInfoEnabledInput").disabled = facility;
    if (facility) $("experienceInfoEnabledInput").checked = false;
    syncExperienceInfo();
    $("catchCopyField").hidden = facility || state.draft?.type !== "stall";
    $("departmentInput").required = !facility;
    $("descriptionInput").required = !facility;
    $("departmentInput").disabled = facility;
    $("descriptionInput").disabled = facility;
    if (facility) {
        $("departmentInput").value = ""; $("gradeInput").value = ""; $("organizationInput").value = ""; $("descriptionInput").value = "";
    }
}
function syncExperienceInfo() {
    const enabled = state.draft?.type !== "facility" && $("experienceInfoEnabledInput").checked;
    $("experienceDetailsFields").hidden = !enabled;
    $("experienceDetailsFields").disabled = !enabled;
}
function syncDepartment() {
    if (state.draft?.type === "facility") {
        $("departmentInput").disabled = true; $("gradeInput").disabled = true; $("gradeInput").required = false;
        $("organizationInput").disabled = true; $("organizationInput").required = false;
        return;
    }
    const department = $("departmentInput").value;
    const regular = Boolean(department && department !== "その他");
    $("gradeInput").disabled = !regular; $("gradeInput").required = false;
    $("organizationInput").disabled = department !== "その他"; $("organizationInput").required = department === "その他";
    if (!regular) $("gradeInput").value = "";
    if (department !== "その他") $("organizationInput").value = "";
    $("organizationInput").setCustomValidity("");
}
function syncBuilding() {
    const needsFloor = /^[1-9]$/.test($("buildingInput").value) || $("buildingInput").value === "本館";
    $("floorInput").disabled = !needsFloor;
    $("floorInput").required = needsFloor;
    $("floorRequired").hidden = !needsFloor;
    if (!needsFloor) $("floorInput").value = "";
    $("floorInput").setCustomValidity("");
}
function confirmDraft(event) {
    event.preventDefault(); if (!state.draft || state.busy) return;
    for (const field of ["title", "organization", "description"]) {
        const input = $(`${field}Input`); input.value = input.value.trim();
        input.setCustomValidity(input.required && !input.disabled && !input.value ? "この項目を入力してください。" : "");
    }
    if (!$("detailForm").reportValidity()) return;
    const marker = markerById(state.openMarkerId); if (!marker) return;
    const item = clone(state.draft); delete item.isNew;
    for (const field of DETAIL_INPUT_FIELDS) item[field] = $(`${field}Input`).value.trim();
    item.experienceInfoEnabled = item.type !== "facility" && $("experienceInfoEnabledInput").checked;
    if (item.type === "facility") {
        item.department = ""; item.grade = ""; item.organization = ""; item.organizer = ""; item.description = ""; item.detailsVersion = 3;
        for (const field of ["duration", "schedule", "targetAudience", "capacity"]) item[field] = "";
    } else {
        item.organizer = item.department === "その他" ? item.organization : item.grade ? `${item.department} ${item.grade}年` : item.department;
        item.detailsVersion = 2;
    }
    if (state.draft.isNew) { state.guide.items.push(item); marker.itemIds.push(item.id); }
    else {
        const previous = itemById(item.id);
        const locationChanged = previous && (previous.building !== item.building || previous.floor !== item.floor);
        const index = state.guide.items.findIndex((entry) => entry.id === item.id); state.guide.items[index] = item;
        if (locationChanged) state.guide.floorPlans?.forEach((plan) => { plan.markers = plan.markers.filter((entry) => entry.itemId !== item.id); });
    }
    marker.itemId = marker.itemIds[0] || null;
    if (marker.usage === "facility" && marker.kind === "image") marker.image = item.image;
    if (state.provisionalMarkerId === marker.id) state.provisionalMarkerId = null;
    state.selectedItemId = item.id; state.draft = null;
    if (item.type === "facility") { state.openMarkerId = null; state.selectedItemId = null; }
    markDirty(); renderMarkers(); renderPanel();
    toast("企画情報を決定しました。「すべて保存」で保存できます。");
}
function cancelDraft() {
    if (state.busy) return;
    const provisionalId = state.provisionalMarkerId;
    state.draft = null; state.provisionalMarkerId = null;
    if (provisionalId) {
        state.guide.markers = state.guide.markers.filter((marker) => marker.id !== provisionalId);
        state.openMarkerId = null; state.selectedMarkerId = null; state.selectedItemId = null;
        renderMarkers(); renderPanel(); toast("施設画像の追加を取り消しました。");
        return;
    }
    if (markerById(state.openMarkerId)?.usage === "facility") { state.openMarkerId = null; state.selectedItemId = null; }
    renderPanel(); toast("入力を取り消しました。");
}
function requestDeleteItem() {
    const item = itemById(state.selectedItemId); if (!item || state.busy) return;
    state.pendingDelete = {kind: "item", id: item.id};
    $("deleteTitle").textContent = "このアイコンを削除しますか？";
    $("deletePreview").replaceChildren(imageElement(item.image, item.title));
    $("deleteItemName").textContent = item.title;
    $("deleteMessage").textContent = "このピンから企画情報を削除します。元の画像素材は残ります。";
    $("deleteDialog").showModal(); $("cancelDeleteButton").focus();
}
function requestDeleteMarker(markerId = state.selectedMarkerId) {
    const marker = markerById(markerId); if (!marker || state.draft || state.busy || state.numbering || state.drag) return;
    state.selectedMarkerId = marker.id;
    state.pendingDelete = {kind: "marker", id: marker.id};
    $("deleteTitle").textContent = "選択中のピン・画像を削除しますか？";
    $("deletePreview").replaceChildren(marker.kind === "pin" ? createPinSvg(marker.label, marker.color) : imageElement(marker.image));
    $("deleteItemName").textContent = marker.kind === "pin" ? `ピン ${marker.label}` : linkedItems(marker)[0]?.title || "装飾画像";
    $("deleteMessage").textContent = marker.itemIds.length ? `この場所に登録した企画情報（${marker.itemIds.length}件）も削除します。` : "地図上の配置だけを削除します。元の画像素材は残ります。";
    $("deleteDialog").showModal(); $("cancelDeleteButton").focus();
}
function confirmDelete() {
    const pending = state.pendingDelete; if (!pending) return;
    $("deleteDialog").close(); state.pendingDelete = null;
    if (pending.kind === "marker") { removeMarker(pending.id); return; }
    state.guide.items = state.guide.items.filter((item) => item.id !== pending.id);
    state.guide.markers.forEach((marker) => { marker.itemIds = marker.itemIds.filter((id) => id !== pending.id); marker.itemId = marker.itemIds[0] || null; });
    state.guide.floorPlans?.forEach((plan) => { plan.markers = plan.markers.filter((marker) => marker.itemId !== pending.id); });
    state.selectedItemId = null; markDirty(); renderPanel(); toast("アイコンを削除しました。");
}
function removeMarker(id) {
    const marker = markerById(id); if (!marker) return;
    const ids = new Set(marker.itemIds);
    state.guide.items = state.guide.items.filter((item) => !ids.has(item.id));
    state.guide.floorPlans?.forEach((plan) => { plan.markers = plan.markers.filter((marker) => !ids.has(marker.itemId)); });
    state.guide.markers = state.guide.markers.filter((entry) => entry.id !== id);
    state.guide.markers.forEach((entry) => { if (entry.guidePin?.markerId === id) entry.guidePin = null; });
    if (state.selectedMarkerId === id) state.selectedMarkerId = null;
    if (state.openMarkerId === id) { state.openMarkerId = null; state.selectedItemId = null; }
    renderMarkers(); renderPanel(); markDirty(); toast("ピン・画像と、その場所の企画情報を削除しました。");
}
async function openAssetPicker(kind) {
    if (!state.guide || state.busy || state.draft || state.numbering) return;
    closeCategory();
    state.assetMode = kind;
    $("assetSearchInput").value = "";
    $("assetDialogTitle").textContent = kind === "facility" ? "施設のアイコンを選ぶ" : "マップに置く画像を選ぶ";
    $("assetDialogHelp").textContent = kind === "facility" ? "トイレ・受付などを選び、施設名と場所を登録します。" : "矢印やイラストを、企画情報を入力せずに置けます。";
    $("assetStatus").textContent = "";
    renderAssetPicker();
    $("assetDialog").showModal();
    $("assetSearchInput").focus();
    if (kind === "decoration" && !state.assetsLoaded) {
        $("assetStatus").textContent = "画像素材を読み込んでいます…";
        try {
            const response = await fetch("/api/editor/assets", {cache: "no-store"});
            const result = await response.json();
            if (!response.ok || !result.ok) throw new Error("画像素材を読み込めませんでした。");
            state.assets = [...new Map([...result.assets, ...state.assets].map((asset) => [asset.path, asset])).values()];
            state.assetsLoaded = true;
            if ($("assetDialog").open && state.assetMode === kind) { $("assetStatus").textContent = ""; renderAssetPicker(); }
        } catch (error) {
            if ($("assetDialog").open && state.assetMode === kind) $("assetStatus").textContent = `${error.message}「PCの画像を追加」も使えます。`;
        }
    }
}
function renderAssetPicker() {
    const query = $("assetSearchInput").value.trim().toLocaleLowerCase("ja");
    const assets = state.assetMode === "facility" ? FACILITY_ICONS : [ARROW_ASSET, ...state.assets];
    const matches = assets.filter((asset) => asset.name.toLocaleLowerCase("ja").includes(query));
    const buttons = matches.map((asset) => {
        const button = document.createElement("button"); button.type = "button"; button.className = "asset-choice"; button.dataset.assetPath = asset.path;
        button.append(imageElement(asset.thumbnail || asset.path));
        const name = document.createElement("strong"); name.textContent = asset.name; button.append(name);
        button.setAttribute("aria-label", `${asset.name}を選ぶ`);
        button.addEventListener("click", () => {
            const kind = state.assetMode;
            $("assetDialog").close(); state.assetMode = null;
            state.imagePurpose = {kind, markerId: state.openMarkerId};
            useImage(asset);
        });
        return button;
    });
    if (!buttons.length) { const empty = document.createElement("p"); empty.className = "asset-empty"; empty.textContent = "一致する画像はありません。別の名前で探すか、PCの画像を追加してください。"; buttons.push(empty); }
    $("assetGrid").replaceChildren(...buttons);
}
function rotateSelectedImage() {
    const marker = markerById(state.selectedMarkerId);
    if (!marker || marker.kind !== "image" || state.busy || state.draft || state.numbering) return;
    marker.rotation = ((Number(marker.rotation || 0) + 90 + 180) % 360) - 180;
    renderMarkers(); markDirty(); toast("画像を90°回転しました。");
}
function chooseImage(kind) {
    if (state.busy || (state.draft && kind !== "replace")) return;
    if (kind === "item" && !state.openMarkerId) return;
    closeCategory(); state.imagePurpose = {kind, markerId: state.openMarkerId};
    $("imageFileInput").value = ""; $("imageFileInput").click();
}
function useImage(asset) {
    const purpose = state.imagePurpose; state.imagePurpose = null; if (!purpose) return;
    if (purpose.kind === "replace") {
        if (state.draft) { state.draft.image = asset.path; $("detailImage").src = assetUrl(asset.path); }
    } else if (purpose.kind === "item") {
        if (state.openMarkerId === purpose.markerId) beginDraft(asset.path);
    } else if (purpose.kind === "decoration") {
        if (state.guide.markers.length >= 800) { toast("ピン・画像は800件以内で登録してください。", true); return; }
        const marker = newMarker({usage: "decoration", kind: "image", categoryId: null, label: "", image: asset.path, size: 80});
        state.guide.markers.push(marker); state.selectedMarkerId = marker.id;
        state.openMarkerId = null; state.selectedItemId = null; state.overlayEditing = false;
        renderFloorOverlayEditor(); renderMarkers(); renderPanel(); markDirty();
        toast("画像を置きました。ドラッグ・サイズ変更・90°回転ができます。");
    } else {
        if (state.guide.markers.length >= 800 || state.guide.items.length >= 500) { toast("登録件数の上限に達しました。", true); return; }
        const category = state.guide.categories.find((entry) => entry.area === "facility");
        if (!category) { toast("カテゴリー管理で「施設案内」のカテゴリーを追加してください。", true); return; }
        const marker = newMarker({usage: "facility", kind: "image", categoryId: category.id, color: category.color, image: asset.path, size: 64, callout: asset.name.includes("ウォーターサーバー"), itemId: null, itemIds: []});
        state.guide.markers.push(marker); state.selectedMarkerId = marker.id; state.openMarkerId = marker.id; state.provisionalMarkerId = marker.id;
        renderMarkers();
        beginDraft(asset.path, null, {title: asset.name.slice(0, 80) || "施設案内"});
        toast("施設名と場所を入力して「決定」を押してください。");
    }
}
async function uploadImage(event) {
    const file = event.target.files[0]; if (!file || !state.imagePurpose) return;
    if (file.size > 25 * 1024 * 1024) { toast("画像は25MB以下にしてください。", true); state.imagePurpose = null; return; }
    const choice = await ImageUploadChoice.choose(file);
    if (!choice) { state.imagePurpose = null; return; }
    const data = new FormData(); data.append("image", choice.file); data.append("removeBackground", String(choice.removeBackground)); data.append("tolerance", String(choice.tolerance));
    setBusy(true, "画像を読み込んでいます");
    try {
        const response = await fetch("/api/editor/upload", {method: "POST", body: data});
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || "画像を追加できませんでした。");
        state.assets.push(result.asset); setBusy(false); useImage(result.asset);
    } catch (error) { state.imagePurpose = null; setBusy(false); toast(error.message || "画像を追加できませんでした。", true); }
}
function syncRenumberDialog() {
    const mode = document.querySelector('input[name="renumberMode"]:checked').value;
    const count = state.guide.markers.filter((marker) => marker.kind === "pin").length;
    $("startRenumberButton").disabled = count === 0;
    $("renumberHelp").textContent = count === 0 ? "番号を付けるピンがありません。先に標準ピンを配置してください。" : mode === "manual" ? `カテゴリーに関係なく、${count}本のピンを1番にしたいものから順番に押してください。` : `${count}本のピンを登録順に、カテゴリー共通の1番から割り当てます。`;
}
function openRenumberDialog() {
    if (state.busy || state.draft || state.numbering) return;
    document.querySelector('input[name="renumberMode"][value="auto"]').checked = true;
    syncRenumberDialog(); $("renumberDialog").showModal();
}
function autoRenumber() {
    const pins = state.guide.markers.filter((marker) => marker.kind === "pin");
    if (!pins.length) { toast("番号を付けるピンがありません。"); return; }
    pins.forEach((marker, index) => { marker.label = String(index + 1); });
    renderMarkers(); if (state.openMarkerId) renderPanel(); markDirty(); toast("すべてのピンを共通の通し番号に振り直しました。");
}
function beginManualNumbering() {
    const pins = state.guide.markers.filter((marker) => marker.kind === "pin");
    if (!pins.length) { toast("番号を付けるピンがありません。", true); return; }
    state.numbering = {
        pinIds: pins.map((marker) => marker.id),
        assignedIds: [],
        originalLabels: Object.fromEntries(pins.map((marker) => [marker.id, marker.label])),
        next: 1,
    };
    pins.forEach((marker) => { marker.label = ""; });
    state.openMarkerId = null; state.selectedItemId = null; state.selectedMarkerId = null;
    $("workspace").classList.add("manual-numbering");
    $("defaultToolbarMessage").hidden = true; $("manualNumberingBar").hidden = false;
    updateManualNumberingStatus(); renderMarkers(); renderPanel();
    toast("1番にしたいピンから順番に押してください。");
}
function updateManualNumberingStatus() {
    if (!state.numbering) return;
    const assigned = state.numbering.assignedIds.length, total = state.numbering.pinIds.length;
    $("manualNumberingStatus").textContent = assigned === total ? `共通番号：${total}本の割り当てが完了しました。「完了」を押してください。` : `共通番号：次は ${state.numbering.next} 番（${assigned}/${total}）`;
    $("finishManualNumberingButton").disabled = state.numbering.assignedIds.length !== state.numbering.pinIds.length;
    renderSaveState();
}
function assignManualNumber(markerId) {
    if (!state.numbering) return;
    if (!state.numbering.pinIds.includes(markerId)) { toast("番号を付けるピンを押してください。", true); return; }
    if (state.numbering.assignedIds.includes(markerId)) { toast("このピンにはすでに番号を割り当てています。"); return; }
    markerById(markerId).label = String(state.numbering.next++);
    state.numbering.assignedIds.push(markerId); updateManualNumberingStatus(); renderMarkers();
}
function finishManualNumbering() {
    if (!state.numbering || state.numbering.assignedIds.length !== state.numbering.pinIds.length) return;
    state.numbering = null; $("workspace").classList.remove("manual-numbering");
    $("defaultToolbarMessage").hidden = false; $("manualNumberingBar").hidden = true;
    renderMarkers(); markDirty(); toast("手動でピン番号を割り当てました。");
}
function cancelManualNumbering() {
    if (!state.numbering) return;
    Object.entries(state.numbering.originalLabels).forEach(([id, label]) => { const marker = markerById(id); if (marker) marker.label = label; });
    state.numbering = null; $("workspace").classList.remove("manual-numbering");
    $("defaultToolbarMessage").hidden = false; $("manualNumberingBar").hidden = true;
    renderMarkers(); toast("番号の手動割り当てを取り消しました。");
}
function startRenumbering() {
    const mode = document.querySelector('input[name="renumberMode"]:checked').value;
    $("renumberDialog").close();
    if (mode === "manual") beginManualNumbering(); else autoRenumber();
}
async function saveGuide() {
    if (state.busy || state.draft || state.numbering || state.drag || !state.guide) return false;
    closeCategory(); setBusy(true, "案内マップを保存しています");
    try {
        const response = await fetch("/api/editor/save", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({expectedRevision: state.guide.revision, guide: state.guide})});
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || "保存できませんでした。");
        state.guide = result.guide; state.dirty = false;
        refreshCategoryChoices();
        renderMarkers(); renderPanel(); setBusy(false);
        toast("保存しました。案内画面へ約15秒以内に反映されます。"); return true;
    } catch (error) {
        setBusy(false); $("saveState").className = "save-state error"; $("saveState").textContent = "保存できませんでした";
        toast(error.message || "通信を確認して、もう一度保存してください。", true); return false;
    }
}
function refreshCategoryChoices() {
    const selected = $("categoryInput").value;
    const options = (categories) => categories.map((category) => {
        const option = document.createElement("option"); option.value = category.id; option.textContent = category.label; return option;
    });
    $("categoryInput").replaceChildren(...options(state.guide.categories.filter((category) => category.area !== "facility")));
    if (categoryById(selected)?.area !== "facility") $("categoryInput").value = selected;
    if (!$("categoryInput").value && $("categoryInput").options.length) $("categoryInput").selectedIndex = 0;
    $("categorySwatch").style.background = categoryById($("categoryInput").value)?.color || "#d4c7bb";
}
function openCategoryManager() {
    if (state.busy || state.draft || state.numbering || !state.guide) return;
    closeCategory(); renderCategoryManager(); editCategory(null); $("categoryManagerDialog").showModal();
}
function renderCategoryManager() {
    const areaNames = {"top": "上段", "bottom-left": "下段左", "bottom-right": "下段右", "facility": "施設案内"};
    $("categoryManagerList").replaceChildren(...state.guide.categories.map((category) => {
        const row = document.createElement("div"); row.className = "category-manager-row"; row.dataset.categoryId = category.id;
        const swatch = document.createElement("span"); swatch.className = "category-manager-swatch"; swatch.style.background = category.color;
        const label = document.createElement("strong"); label.textContent = category.label;
        const count = document.createElement("small"); count.textContent = areaNames[category.area] + " / " + state.guide.items.filter((item) => item.categoryId === category.id).length + "件";
        const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "変更"; edit.addEventListener("click", () => editCategory(category.id));
        const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "削除"; remove.className = "danger-outline"; remove.disabled = state.guide.categories.length <= 1;
        remove.addEventListener("click", () => requestDeleteCategory(category.id));
        row.append(swatch, label, count, edit, remove); return row;
    }));
}
function editCategory(id) {
    state.editingCategoryId = id;
    const category = categoryById(id);
    $("categoryEditTitle").textContent = category ? "カテゴリーを変更" : "カテゴリーを追加";
    $("confirmCategoryButton").textContent = category ? "変更を決定" : "追加";
    $("categoryNameInput").value = category?.label || "";
    $("categoryNameInput").setCustomValidity("");
    $("categoryColorInput").value = category?.color || "#8b4eb5";
    $("categoryAreaInput").value = category?.area || "top";
    $("categoryDescriptionInput").value = category?.description || "";
    const used = state.guide.items.some((item) => item.categoryId === id) || state.guide.markers.some((marker) => marker.categoryId === id && marker.usage !== "decoration");
    $("categoryAreaInput").disabled = Boolean(category && used);
}
function confirmCategory(event) {
    event.preventDefault();
    const label = $("categoryNameInput").value.trim();
    if (!label) { $("categoryNameInput").setCustomValidity("カテゴリー名を入力してください。"); $("categoryEditForm").reportValidity(); return; }
    if (state.guide.categories.some((category) => category.id !== state.editingCategoryId && category.label === label)) {
        $("categoryNameInput").setCustomValidity("同じ名前のカテゴリーがあります。"); $("categoryEditForm").reportValidity(); return;
    }
    if (!state.editingCategoryId && state.guide.categories.length >= 20) { toast("カテゴリーは20件以内にしてください。", true); return; }
    const category = categoryById(state.editingCategoryId);
    const values = {label, color: $("categoryColorInput").value, area: $("categoryAreaInput").value, description: $("categoryDescriptionInput").value.trim()};
    if (category) {
        Object.assign(category, values);
        const affectedItems = new Set(state.guide.items.filter((item) => item.categoryId === category.id).map((item) => item.id));
        state.guide.markers.filter((marker) => marker.categoryId === category.id).forEach((marker) => marker.color = category.color);
        state.guide.floorPlans.forEach((plan) => plan.markers.filter((marker) => affectedItems.has(marker.itemId)).forEach((marker) => marker.color = category.color));
    } else state.guide.categories.push({id: uid("category"), ...values});
    refreshCategoryChoices(); renderCategoryManager(); renderMarkers(); renderPanel(); markDirty(); editCategory(null);
    toast("カテゴリーを変更しました。「すべて保存」で保存できます。");
}
function requestDeleteCategory(id) {
    const category = categoryById(id);
    if (!category || state.guide.categories.length <= 1) return;
    const referenced = state.guide.items.some((item) => item.categoryId === id) || state.guide.markers.some((marker) => marker.categoryId === id && marker.usage !== "decoration");
    const targets = state.guide.categories.filter((entry) => entry.id !== id && (entry.area === "facility") === (category.area === "facility"));
    if (referenced && !targets.length) { toast("先に同じ種類の移動先カテゴリーを追加してください。企画・ピンを保持するため、移動先が必要です。", true); return; }
    state.deletingCategoryId = id;
    $("categoryDeleteDescription").textContent = "「" + category.label + "」を削除します。";
    $("categoryTransferField").hidden = !referenced;
    $("categoryTransferInput").replaceChildren(...targets.map((entry) => {
        const option = document.createElement("option"); option.value = entry.id; option.textContent = entry.label; return option;
    }));
    $("categoryDeleteDialog").showModal();
}
function deleteCategory() {
    const id = state.deletingCategoryId, category = categoryById(id);
    if (!category) return;
    const target = categoryById($("categoryTransferInput").value);
    const movedItems = new Set(state.guide.items.filter((item) => item.categoryId === id).map((item) => item.id));
    const used = movedItems.size || state.guide.markers.some((marker) => marker.categoryId === id && marker.usage !== "decoration");
    if (used && !target) return;
    state.guide.items.filter((item) => movedItems.has(item.id)).forEach((item) => item.categoryId = target.id);
    for (const marker of state.guide.markers.filter((entry) => entry.categoryId === id)) {
        if (marker.usage === "decoration") { marker.categoryId = null; continue; }
        marker.categoryId = target.id; marker.color = target.color;
    }
    if (target) state.guide.floorPlans.forEach((plan) => plan.markers.filter((marker) => movedItems.has(marker.itemId)).forEach((marker) => marker.color = target.color));
    state.guide.categories = state.guide.categories.filter((entry) => entry.id !== id);
    state.deletingCategoryId = null; $("categoryDeleteDialog").close();
    refreshCategoryChoices(); renderCategoryManager(); editCategory(null); renderMarkers(); renderPanel(); markDirty();
    toast("カテゴリーを削除しました。登録した企画・ピンは保持しています。");
}

function bindEvents() {
    $("recommendationButton").addEventListener("click", async () => {
        if (state.busy || state.draft || state.numbering || !state.guide) return;
        const choice = await RecommendationEditor.choose(state.guide);
        if (!choice) return;
        state.guide.settings.recommendations = choice.settings;
        state.guide.items.forEach((item) => { if (Object.hasOwn(choice.copies, item.id)) item.catchCopy = choice.copies[item.id]; });
        markDirty(); toast("おすすめの表示設定を変更しました。「すべて保存」で反映されます。");
    });
    $("experienceInfoEnabledInput").addEventListener("change", syncExperienceInfo);
    $("guidePinButton").addEventListener("click", async () => {
        const marker = markerById(state.selectedMarkerId);
        if (!marker || marker.kind !== "image" || marker.usage !== "decoration" || state.busy || state.draft || state.numbering) return;
        const choice = await GuidePinEditor.choose(marker, state.guide, createPinSvg);
        if (choice === undefined) return;
        marker.guidePin = choice; renderMarkers(); markDirty();
        toast(choice ? "看板に案内番号を設定しました。「すべて保存」で反映されます。" : "看板の案内番号を非表示にしました。");
    });
    EditorShortcuts.bind({
        isBusy: () => state.busy || !state.guide || Boolean(state.draft || state.numbering || state.drag),
        isDirty: () => state.dirty,
        exitBlocked: () => state.busy || !state.guide ? "処理が終わってから終了してください。" : state.draft ? "詳細情報を「決定」または「取り消し」してから終了してください。" : state.numbering ? "番号の割り当てを完了または取り消してから終了してください。" : state.drag ? "ドラッグ操作を終えてから終了してください。" : "",
        save: saveGuide, notify: toast,
        onStopped: () => { state.dirty = false; state.draft = null; state.numbering = null; },
        deleteSelection: (event) => {
            if (event.target.closest("#iconList, #iconListPanel .panel-footer") && state.selectedItemId) { requestDeleteItem(); return true; }
            if (!state.selectedMarkerId || state.overlayEditing) return false;
            requestDeleteMarker(); return true;
        },
    });
    $("trimImageInput").addEventListener("change", () => {
        const marker = markerById(state.selectedMarkerId);
        if (!marker || marker.kind !== "image" || state.busy || state.draft || state.numbering) return;
        marker.trimImage = $("trimImageInput").checked; renderMarkers(); markDirty();
    });
    $("categoryManagerButton").addEventListener("click", openCategoryManager);
    $("closeCategoryManager").addEventListener("click", () => $("categoryManagerDialog").close());
    $("newCategoryButton").addEventListener("click", () => editCategory(null));
    $("categoryEditForm").addEventListener("submit", confirmCategory);
    $("categoryNameInput").addEventListener("input", () => $("categoryNameInput").setCustomValidity(""));
    $("cancelCategoryDelete").addEventListener("click", () => { $("categoryDeleteDialog").close(); state.deletingCategoryId = null; });
    $("confirmCategoryDelete").addEventListener("click", deleteCategory);
    $("calloutInput").addEventListener("change", () => {
        const marker = markerById(state.selectedMarkerId);
        if (!marker || marker.kind !== "image") return;
        marker.callout = $("calloutInput").checked; renderMarkers(); markDirty();
    });
    window.addEventListener("resize", fitCanvas);
    $("mapImage").addEventListener("load", fitMap);
    $("pinButton").addEventListener("click", () => { const open = $("categoryPopover").hidden; $("categoryPopover").hidden = !open; $("pinButton").setAttribute("aria-expanded", String(open)); if (open) $("categoryInput").focus(); });
    $("categoryInput").addEventListener("change", () => $("categorySwatch").style.background = categoryById($("categoryInput").value).color);
    $("cancelPinButton").addEventListener("click", closeCategory); $("addPinButton").addEventListener("click", addPin);
    document.addEventListener("pointerdown", (event) => { if (!event.target.closest(".pin-tool")) closeCategory(); });
    $("facilityButton").addEventListener("click", () => openAssetPicker("facility"));
    $("imageButton").addEventListener("click", () => openAssetPicker("decoration"));
    $("rotateImageButton").addEventListener("click", rotateSelectedImage);
    const closeAssetPicker = () => { $("assetDialog").close(); state.assetMode = null; };
    $("closeAssetDialog").addEventListener("click", closeAssetPicker);
    $("cancelAssetDialog").addEventListener("click", closeAssetPicker);
    $("assetDialog").addEventListener("cancel", () => state.assetMode = null);
    $("assetSearchInput").addEventListener("input", renderAssetPicker);
    $("uploadAssetButton").addEventListener("click", () => { const kind = state.assetMode; closeAssetPicker(); chooseImage(kind); });
    $("floorOverlayButton").addEventListener("click", toggleFloorOverlay);
    $("floorOverlayEditor").addEventListener("pointerdown", beginFloorOverlayDrag);
    $("addIconButton").addEventListener("click", () => chooseImage("item"));
    $("changeIconButton").addEventListener("click", () => chooseImage("replace"));
    $("imageFileInput").addEventListener("change", uploadImage);
    $("imageFileInput").addEventListener("cancel", () => state.imagePurpose = null);
    $("sizeInput").addEventListener("input", () => applySize($("sizeInput").value));
    $("sizeInput").addEventListener("change", () => applySize($("sizeInput").value, true));
    $("sizeUpButton").addEventListener("click", () => applySize(state.overlayEditing ? floorOverlayLayout().width + 1 : markerById(state.selectedMarkerId).size + 1, true));
    $("sizeDownButton").addEventListener("click", () => applySize(state.overlayEditing ? floorOverlayLayout().width - 1 : markerById(state.selectedMarkerId).size - 1, true));
    $("lockInput").addEventListener("change", () => { const marker = markerById(state.selectedMarkerId); if (!marker) return; marker.locked = $("lockInput").checked; renderMarkers(); markDirty(); toast(marker.locked ? "位置を固定しました。" : "位置固定を解除しました。"); });
    $("renumberButton").addEventListener("click", openRenumberDialog);
    document.querySelectorAll('input[name="renumberMode"]').forEach((input) => input.addEventListener("change", syncRenumberDialog));
    $("cancelRenumberButton").addEventListener("click", () => $("renumberDialog").close());
    $("startRenumberButton").addEventListener("click", startRenumbering);
    $("finishManualNumberingButton").addEventListener("click", finishManualNumbering);
    $("cancelManualNumberingButton").addEventListener("click", cancelManualNumbering);
    $("closePanelButton").addEventListener("click", closePanel);
    $("departmentInput").addEventListener("change", syncDepartment);
    $("buildingInput").addEventListener("change", syncBuilding);
    ["title", "organization", "description"].forEach((field) => $(`${field}Input`).addEventListener("input", () => $(`${field}Input`).setCustomValidity("")));
    $("detailForm").addEventListener("submit", confirmDraft);
    $("cancelDetailButton").addEventListener("click", cancelDraft);
    $("editIconButton").addEventListener("click", () => { const item = itemById(state.selectedItemId); if (item) beginDraft(item.image, item); });
    $("deleteIconButton").addEventListener("click", requestDeleteItem);
    $("trash").addEventListener("click", () => requestDeleteMarker());
    $("cancelDeleteButton").addEventListener("click", () => { state.pendingDelete = null; $("deleteDialog").close(); });
    $("deleteDialog").addEventListener("cancel", () => state.pendingDelete = null);
    $("confirmDeleteButton").addEventListener("click", confirmDelete);
    $("saveButton").addEventListener("click", saveGuide);
    $("floorEditorButton").addEventListener("click", () => { location.href = "/floors"; });
    $("previewButton").addEventListener("click", () => { window.open("/preview", "guidePreview"); if (state.dirty) toast("保存済みの案内画面を開きました。変更の反映には「すべて保存」を押してください。"); });
    $("retryButton").addEventListener("click", () => location.reload());
    window.addEventListener("beforeunload", (event) => { if (state.dirty || state.draft || state.numbering) { event.preventDefault(); event.returnValue = ""; } });
    document.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveGuide(); }
        if (event.key === "Escape" && !$("deleteDialog").open && !$("renumberDialog").open) closeCategory();
    });
}
async function start() {
    fitCanvas(); bindEvents();
    $("pinToolVisual").replaceChildren(createPinSvg("1", "#ee4b43"));
    try {
        const guideResponse = await fetch("/api/editor/guide", {cache: "no-store"});
        if (!guideResponse.ok) throw new Error("編集データを読み込めませんでした。");
        state.guide = await guideResponse.json();
        state.guide.markers.forEach((marker) => { if (typeof marker.locked !== "boolean") marker.locked = false; });
        state.guide.settings.floorOverlay ||= {x: 2, y: 50, width: 42};
        $("mapImage").src = assetUrl(state.guide.settings.mapImage);
        refreshCategoryChoices();
        renderMarkers(); renderPanel(); $("loadingOverlay").hidden = true;
    } catch (error) { $("loadingText").textContent = error.message; $("retryButton").hidden = false; $("saveButton").disabled = true; $("saveState").textContent = "読み込みエラー"; }
}
start();
