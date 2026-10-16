import json
import secrets
from threading import Event, Timer

from flask import Flask, jsonify, render_template, request
from waitress import create_server
from viewer_config import EDITOR_PORT, VIEWER_LAYOUT

from storage import (
    GUIDE_LOCK,
    RevisionConflict,
    list_assets,
    load_guide,
    save_editor_guide,
    save_uploaded_image,
)
from marker_images import register_image_routes


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024
app.config["EDITOR_SHUTDOWN_TOKEN"] = secrets.token_urlsafe(32)
register_image_routes(app)


@app.after_request
def disable_cache(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


@app.get("/")
def editor_page():
    return render_template("editor.html", shutdown_token=app.config["EDITOR_SHUTDOWN_TOKEN"])


@app.get("/preview")
def preview_page():
    return render_template("index.html", viewer_layout=VIEWER_LAYOUT)


@app.get("/floors")
def floor_editor_page():
    return render_template("floor_editor.html", shutdown_token=app.config["EDITOR_SHUTDOWN_TOKEN"])


@app.get("/api/guide")
@app.get("/api/editor/guide")
def get_guide():
    with GUIDE_LOCK:
        return jsonify(load_guide())


@app.get("/api/editor/assets")
def get_assets():
    return jsonify({"ok": True, "assets": list_assets()})


@app.post("/api/editor/save")
def save_guide():
    try:
        guide, backup = save_editor_guide(request.get_json(silent=True))
    except RevisionConflict as error:
        return jsonify({"ok": False, "message": str(error)}), 409
    except ValueError as error:
        return jsonify({"ok": False, "message": str(error)}), 400
    except (OSError, json.JSONDecodeError):
        app.logger.exception("編集データの保存に失敗しました。")
        return jsonify({"ok": False, "message": "データを保存できませんでした。"}), 500
    return jsonify({"ok": True, "guide": guide, "backup": backup})


@app.post("/api/editor/upload")
def upload_image():
    try:
        remove_background = request.form.get("removeBackground") == "true"
        asset = save_uploaded_image(request.files.get("image"), remove_background, 100)
    except (TypeError, ValueError) as error:
        return jsonify({"ok": False, "message": str(error)}), 400
    except OSError:
        app.logger.exception("画像の保存に失敗しました。")
        return jsonify({"ok": False, "message": "画像を保存できませんでした。"}), 500
    return jsonify({"ok": True, "asset": asset})


@app.get("/health")
def health():
    return {"status": "ok", "program": "editor"}


@app.post("/api/editor/shutdown")
def shutdown_editor():
    token = request.headers.get("X-Editor-Token", "")
    if request.remote_addr not in {"127.0.0.1", "::1"} or not secrets.compare_digest(token, app.config["EDITOR_SHUTDOWN_TOKEN"]):
        return jsonify({"ok": False, "message": "作成画面から終了してください。"}), 403
    callback = app.config.get("EDITOR_SHUTDOWN_CALLBACK")
    if callback is None:
        return jsonify({"ok": False, "message": "start_editor.bat で起動した作成プログラムから終了してください。"}), 503
    # Let the local response reach the browser before closing its connection.
    timer = Timer(.5, callback)
    timer.daemon = True
    timer.start()
    return jsonify({"ok": True})


def run_editor():
    stopped = Event()
    server = create_server(app, host="127.0.0.1", port=EDITOR_PORT, threads=6)
    app.config["EDITOR_SHUTDOWN_CALLBACK"] = stopped.set
    try:
        while not stopped.is_set():
            server.asyncore.loop(timeout=.2, count=1, map=server._map,
                                 use_poll=server.adj.asyncore_use_poll)
    except KeyboardInterrupt:
        pass
    finally:
        # Finish active saves/uploads before releasing the listening socket.
        server.task_dispatcher.shutdown(cancel_pending=False, timeout=10)
        server.asyncore.close_all(map=server._map)
        app.config["EDITOR_SHUTDOWN_CALLBACK"] = None
        print("作成プログラムを終了しました。")


@app.errorhandler(413)
def file_too_large(_error):
    return jsonify({"ok": False, "message": "画像は25MB以下にしてください。"}), 413


if __name__ == "__main__":
    print("紅華祭UI作成プログラムを起動しました。")
    print(f"ブラウザーで http://127.0.0.1:{EDITOR_PORT}/ を開いてください。")
    print(f"プレビュー: http://127.0.0.1:{EDITOR_PORT}/preview")
    print("作成画面で Ctrl+Alt+I、またはこの画面で Ctrl+C を押すと終了します。")
    run_editor()
