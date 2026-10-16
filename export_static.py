"""案内画面を GitHub Pages 用の静的ファイルとして docs/ に書き出します。"""

import json
import re
import shutil
from pathlib import PurePosixPath
from urllib.parse import quote

from main import app
from storage import BASE_DIR, GUIDE_LOCK, STATIC_IMAGE_DIR, load_guide


OUTPUT_DIR = BASE_DIR / "docs"
STATIC_DIR = BASE_DIR / "static"
IMAGE_FOLDERS = ("maps", "floors", "ui", "system", "uploads", "library")
STATIC_CONFIG = (
    "<script>"
    'window.KOUKA_STATIC_BASE="static/images/";'
    'window.KOUKA_MARKER_IMAGE_BASE="marker-images/";'
    'window.KOUKA_GUIDE_URL="guide.json";'
    "</script>"
)


def reset_output_dir(path) -> None:
    """docs を空にする。Windows では作業フォルダーとして開かれているとフォルダー自体は消せない。"""
    if not path.exists():
        return
    for child in path.iterdir():
        if child.is_dir() and not child.is_symlink():
            shutil.rmtree(child)
        else:
            child.unlink()
    try:
        path.rmdir()
    except PermissionError:
        pass


def render_index(client) -> str:
    response = client.get("/")
    if response.status_code != 200:
        raise RuntimeError(f"案内画面を作成できませんでした（HTTP {response.status_code}）。")
    html = response.get_data(as_text=True).replace('="/static/', '="static/')
    if 'src="/' in html or 'href="/' in html:
        raise RuntimeError("案内画面に、GitHub Pages で読み込めない絶対パスが残っています。")
    return html.replace("</head>", f"    {STATIC_CONFIG}\n</head>", 1)


def copy_page_assets(html: str) -> None:
    for relative in sorted(set(re.findall(r'(?:href|src)="static/([^"]+)"', html))):
        target = OUTPUT_DIR / "static" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(STATIC_DIR / relative, target)


def referenced_images(value) -> set[str]:
    found = set()
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "image" and isinstance(child, str) and child:
                found.add(child)
            else:
                found |= referenced_images(child)
    elif isinstance(value, list):
        for child in value:
            found |= referenced_images(child)
    return found


def export_marker_images(client, guide) -> None:
    """サーバーが表示時に余白を切り取る画像を、あらかじめ書き出しておく。"""
    for image_path in sorted(referenced_images(guide)):
        if not (STATIC_IMAGE_DIR / image_path).is_file():
            continue
        response = client.get(f"/api/marker-image/{quote(image_path)}")
        if response.status_code != 200:
            continue
        target = OUTPUT_DIR / "marker-images" / PurePosixPath(image_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(response.get_data())


def export() -> None:
    reset_output_dir(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    client = app.test_client()

    html = render_index(client)
    (OUTPUT_DIR / "index.html").write_text(html, encoding="utf-8")
    copy_page_assets(html)

    with GUIDE_LOCK:
        guide = load_guide()
    (OUTPUT_DIR / "guide.json").write_text(json.dumps(guide, ensure_ascii=False, indent=2), encoding="utf-8")

    for folder in IMAGE_FOLDERS:
        source = STATIC_IMAGE_DIR / folder
        if source.exists():
            shutil.copytree(source, OUTPUT_DIR / "static" / "images" / folder)
    export_marker_images(client, guide)

    (OUTPUT_DIR / ".nojekyll").write_text("", encoding="utf-8")


if __name__ == "__main__":
    export()
    print(f"案内画面を書き出しました: {OUTPUT_DIR}")
