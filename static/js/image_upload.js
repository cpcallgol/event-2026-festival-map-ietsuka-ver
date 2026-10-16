"use strict";

window.ImageUploadChoice = (() => {
    let pending = null, original = null, file = null, url = null;
    const get = (id) => document.getElementById(id);
    function finish(accepted) {
        if (!pending) return;
        const resolve = pending; pending = null;
        const choice = accepted ? {file, removeBackground: get("imageUploadTransparent").checked, tolerance: 100} : null;
        get("imageUploadDialog").close();
        if (url) URL.revokeObjectURL(url);
        url = null; original = null; file = null; resolve(choice);
    }
    function preview() {
        if (!original) return;
        const context = get("imageUploadPreview").getContext("2d");
        const pixels = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
        const remove = get("imageUploadTransparent").checked;
        const tolerance = 100;
        get("imageUploadToleranceRow").hidden = !remove;
        if (remove) {
            const width = pixels.width, height = pixels.height, data = pixels.data;
            const queue = new Int32Array(width * height);
            for (const corner of [0, width - 1, (height - 1) * width, width * height - 1]) {
                const index = corner * 4;
                if (data[index + 3] === 0) continue;
                const color = Array.from(data.slice(index, index + 4));
                let head = 0, tail = 0;
                const visit = (position) => {
                    const p = position * 4;
                    if (data[p + 3] === 0) return;
                    const distance = Math.abs(data[p] - color[0]) + Math.abs(data[p + 1] - color[1]) + Math.abs(data[p + 2] - color[2]) + Math.abs(data[p + 3] - color[3]);
                    if (distance > tolerance) return;
                    data[p] = 255; data[p + 1] = 255; data[p + 2] = 255; data[p + 3] = 0;
                    queue[tail++] = position;
                };
                visit(corner);
                while (head < tail) {
                    const position = queue[head++], x = position % width;
                    if (x > 0) visit(position - 1);
                    if (x < width - 1) visit(position + 1);
                    if (position >= width) visit(position - width);
                    if (position < width * (height - 1)) visit(position + width);
                }
            }
        }
        context.putImageData(pixels, 0, 0);
        get("imageUploadStatus").textContent = remove ? "格子模様の部分が透明になります。" : "元の背景のまま追加します。";
    }
    function choose(selectedFile) {
        if (pending) finish(false);
        file = selectedFile;
        get("imageUploadName").textContent = selectedFile.name;
        get("imageUploadTransparent").checked = false;
        get("imageUploadToleranceRow").hidden = true;
        get("imageUploadConfirm").disabled = true;
        get("imageUploadStatus").textContent = "画像を読み込んでいます";
        const canvas = get("imageUploadPreview"); canvas.width = 1; canvas.height = 1;
        const result = new Promise((resolve) => pending = resolve);
        get("imageUploadDialog").showModal();
        const image = new Image(); url = URL.createObjectURL(selectedFile);
        image.onload = () => {
            if (!pending || file !== selectedFile) return;
            if (image.naturalWidth > 8000 || image.naturalHeight > 8000) {
                get("imageUploadStatus").textContent = "画像サイズは縦横8000px以内にしてください。"; return;
            }
            const ratio = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
            canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
            const context = canvas.getContext("2d"); context.drawImage(image, 0, 0, canvas.width, canvas.height);
            original = context.getImageData(0, 0, canvas.width, canvas.height);
            preview(); get("imageUploadConfirm").disabled = false;
        };
        image.onerror = () => { if (pending) get("imageUploadStatus").textContent = "この画像を読み込めません。別のPNG・JPEG・WebP画像を選んでください。"; };
        image.src = url; return result;
    }
    document.addEventListener("DOMContentLoaded", () => {
        get("imageUploadTransparent").addEventListener("change", preview);
        get("imageUploadConfirm").addEventListener("click", () => finish(true));
        for (const id of ["imageUploadCancel", "imageUploadClose"]) get(id).addEventListener("click", () => finish(false));
        get("imageUploadDialog").addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
    });
    return {choose};
})();

