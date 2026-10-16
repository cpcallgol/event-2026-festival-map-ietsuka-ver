"use strict";

window.RecommendationEditor = (() => {
    const get = (id) => document.getElementById(id);
    const fields = {title: "recommendTitle", accentColor: "recommendAccent", backgroundColor: "recommendBackground", textColor: "recommendText", intervalSeconds: "recommendInterval"};
    let pending = null, guide, draft, copies, selectedIds, allStalls, previewIndex;
    const imageUrl = (path) => path ? `/static/images/${String(path).split("/").map(encodeURIComponent).join("/")}` : "";
    const settings = () => ({...draft, itemIds: allStalls ? null : [...selectedIds]});

    function finish(value) {
        if (!pending) return;
        const resolve = pending; pending = null;
        get("recommendationDialog").close(); resolve(value);
    }

    function writeFields() {
        for (const [field, id] of Object.entries(fields)) get(id).value = draft[field];
        get("recommendEnabled").checked = draft.enabled;
        get("recommendAuto").checked = draft.autoRotate;
        get("recommendInterval").disabled = !draft.autoRotate;
        get("recommendAll").checked = allStalls;
        get("recommendSelected").checked = !allStalls;
    }

    function renderPreview() {
        if (!pending) return;
        const config = settings(), entries = Recommendations.items(guide, config);
        Recommendations.paint(get("recommendPreview"), config);
        get("recommendPreviewTitle").textContent = config.title || "見出し";
        get("recommendPreviewCounter").textContent = !config.enabled ? "現在は非表示" : entries.length ? `${(previewIndex % entries.length + entries.length) % entries.length + 1} / ${entries.length}` : "";
        const host = get("recommendPreviewContent"); host.replaceChildren();
        for (const id of ["recommendPreviewPrevious", "recommendPreviewNext"]) get(id).disabled = entries.length < 2;
        if (!entries.length) { host.textContent = "表示する企画を選択してください。"; return; }
        previewIndex = (previewIndex % entries.length + entries.length) % entries.length;
        const item = entries[previewIndex];
        if (item.image) { const image = document.createElement("img"); image.src = imageUrl(item.image); image.alt = ""; host.append(image); }
        const text = document.createElement("div"), title = document.createElement("strong"), copy = document.createElement("p");
        title.textContent = item.title;
        copy.textContent = copies[item.id] || item.description || "画像をタッチして内容と場所をご確認ください。";
        text.append(title, copy); host.append(text);
    }

    function renderItems(focusId = null) {
        const entries = allStalls ? guide.items.filter((item) => item.type === "stall") : [
            ...selectedIds.map((id) => guide.items.find((item) => item.id === id)).filter(Boolean),
            ...guide.items.filter((item) => !selectedIds.includes(item.id)),
        ];
        const rows = entries.map((item) => {
            const row = document.createElement("div"); row.className = "recommendation-item-row"; row.dataset.itemId = item.id;
            const heading = document.createElement("div"); heading.className = "recommendation-item-heading";
            const label = document.createElement("label"), check = document.createElement("input"), name = document.createElement("span"), category = document.createElement("small");
            check.type = "checkbox"; check.checked = allStalls || selectedIds.includes(item.id); check.disabled = allStalls;
            check.setAttribute("aria-label", `${item.title}をおすすめに表示`);
            name.textContent = item.title;
            category.textContent = guide.categories.find((entry) => entry.id === item.categoryId)?.label || "";
            name.append(category); label.append(check, name); heading.append(label);
            check.addEventListener("change", () => {
                if (check.checked) selectedIds.push(item.id); else selectedIds = selectedIds.filter((id) => id !== item.id);
                previewIndex = 0; get("recommendError").hidden = true; renderItems(item.id); renderPreview();
            });
            if (!allStalls && check.checked) {
                const order = document.createElement("div"); order.className = "recommendation-order";
                for (const [step, text, description] of [[-1, "↑", "前へ"], [1, "↓", "後ろへ"]]) {
                    const button = document.createElement("button"); button.type = "button"; button.textContent = text;
                    button.setAttribute("aria-label", `${item.title}を表示順の${description}`);
                    const index = selectedIds.indexOf(item.id);
                    button.disabled = index + step < 0 || index + step >= selectedIds.length;
                    button.addEventListener("click", () => {
                        [selectedIds[index], selectedIds[index + step]] = [selectedIds[index + step], selectedIds[index]];
                        previewIndex = index + step; renderItems(item.id); renderPreview();
                    });
                    order.append(button);
                }
                heading.append(order);
            }
            const copy = document.createElement("input"); copy.type = "text"; copy.maxLength = 120;
            copy.value = copies[item.id]; copy.placeholder = "紹介文（空欄なら企画の説明文）";
            copy.setAttribute("aria-label", `${item.title}の紹介文`);
            copy.addEventListener("input", () => { copies[item.id] = copy.value; renderPreview(); });
            row.append(heading, copy); return row;
        });
        if (!rows.length) { const empty = document.createElement("p"); empty.className = "recommendation-note"; empty.textContent = "表示できる企画がまだ登録されていません。"; rows.push(empty); }
        get("recommendItemList").replaceChildren(...rows);
        if (focusId) get("recommendItemList").querySelector(`[data-item-id="${focusId}"] input[type=checkbox]`)?.focus({preventScroll: true});
    }

    function choose(currentGuide) {
        if (pending) finish(undefined);
        guide = currentGuide;
        draft = Recommendations.settings(guide);
        allStalls = draft.itemIds === null;
        selectedIds = allStalls ? guide.items.filter((item) => item.type === "stall").map((item) => item.id) : draft.itemIds.filter((id) => guide.items.some((item) => item.id === id));
        copies = Object.fromEntries(guide.items.map((item) => [item.id, item.catchCopy || ""]));
        previewIndex = 0; get("recommendError").hidden = true;
        const result = new Promise((resolve) => pending = resolve);
        writeFields(); renderItems(); renderPreview();
        get("recommendationDialog").showModal();
        return result;
    }

    document.addEventListener("DOMContentLoaded", () => {
        for (const id of ["recommendationClose", "recommendationCancel"]) get(id).addEventListener("click", () => finish(undefined));
        get("recommendationDialog").addEventListener("cancel", (event) => { event.preventDefault(); event.stopPropagation(); finish(undefined); });
        get("recommendEnabled").addEventListener("change", () => { draft.enabled = get("recommendEnabled").checked; renderPreview(); });
        get("recommendAuto").addEventListener("change", () => { draft.autoRotate = get("recommendAuto").checked; get("recommendInterval").disabled = !draft.autoRotate; });
        for (const [field, id] of Object.entries(fields)) get(id).addEventListener("input", () => {
            const input = get(id);
            if (field !== "intervalSeconds" || input.value !== "" && input.validity.valid) draft[field] = field === "intervalSeconds" ? Number(input.value) : input.value;
            renderPreview();
        });
        for (const id of ["recommendAll", "recommendSelected"]) get(id).addEventListener("change", () => {
            allStalls = get("recommendAll").checked; previewIndex = 0; get("recommendError").hidden = true; renderItems(); renderPreview();
        });
        get("recommendReset").addEventListener("click", () => {
            draft = {...Recommendations.defaults}; allStalls = true;
            selectedIds = guide.items.filter((item) => item.type === "stall").map((item) => item.id);
            previewIndex = 0; writeFields(); renderItems(); renderPreview();
        });
        get("recommendPreviewPrevious").addEventListener("click", () => { previewIndex--; renderPreview(); });
        get("recommendPreviewNext").addEventListener("click", () => { previewIndex++; renderPreview(); });
        get("recommendationConfirm").addEventListener("click", () => {
            get("recommendTitle").value = get("recommendTitle").value.trim(); draft.title = get("recommendTitle").value;
            if (!get("recommendTitle").reportValidity() || !get("recommendInterval").reportValidity()) return;
            if (draft.enabled && !allStalls && !selectedIds.length) {
                get("recommendError").textContent = "表示する企画を1件以上選ぶか、「おすすめを表示する」を外してください。";
                get("recommendError").hidden = false; return;
            }
            finish({settings: settings(), copies: Object.fromEntries(Object.entries(copies).map(([id, copy]) => [id, copy.trim()]))});
        });
    });
    return {choose};
})();
