"use strict";

window.EditorShortcuts = {
    bind(options) {
        const dialog = document.getElementById("editorExitDialog");
        const message = document.getElementById("editorExitMessage");
        const confirm = document.getElementById("confirmEditorExit");
        const cancel = document.getElementById("cancelEditorExit");
        let exiting = false;
        cancel.addEventListener("click", () => dialog.close());
        dialog.addEventListener("cancel", (event) => { if (exiting) event.preventDefault(); });
        confirm.addEventListener("click", async () => {
            if (exiting) return;
            exiting = true; confirm.disabled = true; cancel.disabled = true;
            dialog.setAttribute("aria-busy", "true");
            try {
                if (options.isDirty()) {
                    message.textContent = "変更を保存しています…";
                    if (!await options.save()) throw new Error("保存できなかったため終了していません。画面を閉じて保存内容を確認してください。");
                }
                message.textContent = "作成プログラムを終了しています…";
                const response = await fetch("/api/editor/shutdown", {
                    method: "POST",
                    headers: {"X-Editor-Token": document.querySelector('meta[name="editor-shutdown-token"]').content},
                });
                const result = await response.json();
                if (!response.ok || !result.ok) throw new Error(result.message || "終了できませんでした。");
                options.onStopped();
                document.title = "作成プログラムを終了しました";
                document.body.replaceChildren();
                const main = document.createElement("main"); main.className = "editor-stopped";
                const title = document.createElement("h1"); title.textContent = "作成プログラムを終了しました";
                const text = document.createElement("p"); text.textContent = "このタブを閉じてください。再開するときは start_editor.bat を開いてください。";
                main.append(title, text); document.body.append(main);
            } catch (error) {
                message.textContent = error.message || "終了できませんでした。もう一度お試しください。";
                exiting = false; confirm.disabled = false; cancel.disabled = false;
                dialog.removeAttribute("aria-busy"); cancel.focus();
            }
        });
        document.addEventListener("keydown", (event) => {
            const exitKey = event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey && (event.code === "KeyI" || event.key.toLowerCase() === "i");
            if (exitKey) {
                event.preventDefault(); event.stopImmediatePropagation();
                if (event.repeat || event.isComposing || dialog.open || exiting) return;
                const reason = options.exitBlocked();
                if (reason) { options.notify(reason); return; }
                if (document.querySelector("dialog[open]")) { options.notify("開いている画面を閉じてから終了してください。"); return; }
                message.textContent = options.isDirty() ? "未保存の変更を保存してから、作成プログラムを終了します。" : "作成プログラムを終了します。";
                confirm.textContent = options.isDirty() ? "保存して終了" : "終了する";
                dialog.showModal(); cancel.focus();
                return;
            }
            if (event.defaultPrevented || event.isComposing || event.repeat || options.isBusy()) return;
            if (event.key !== "Delete" || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
            if (document.querySelector("dialog[open]")) return;
            if (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
            if (options.deleteSelection(event)) event.preventDefault();
        }, true);
    },
};
