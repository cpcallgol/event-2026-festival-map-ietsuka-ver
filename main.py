from flask import Flask, jsonify, render_template
from waitress import serve

from storage import GUIDE_LOCK, load_guide
from viewer_config import VIEWER_LAYOUT, VIEWER_PORT
from marker_images import register_image_routes


app = Flask(__name__)
register_image_routes(app)


@app.after_request
def disable_cache(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


@app.get("/")
def index():
    return render_template("index.html", viewer_layout=VIEWER_LAYOUT)


@app.get("/api/guide")
def guide():
    with GUIDE_LOCK:
        return jsonify(load_guide())


@app.get("/health")
def health():
    return {"status": "ok", "program": "viewer"}


if __name__ == "__main__":
    print("紅華祭案内画面を起動しました。")
    print(f"このPC: http://127.0.0.1:{VIEWER_PORT}/")
    print("この版は自分のPC専用です。他のPCからは接続できません。")
    print("終了する場合は Ctrl+C を押してください。")
    serve(app, host="127.0.0.1", port=VIEWER_PORT, threads=8)
