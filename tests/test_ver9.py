"""Placed-image visibility, persistence and editor termination regressions."""
from copy import deepcopy
from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image, ImageDraw

import editor
import marker_images
import storage


class PlacementTests(unittest.TestCase):
    def test_transparent_canvas_is_removed_without_losing_white_subject(self):
        image = Image.new("RGBA", (1000, 800))
        ImageDraw.Draw(image).rectangle((400, 300, 599, 399), fill="white")
        original = image.tobytes()
        result = marker_images.trim_image(image)
        self.assertEqual(result.size, (202, 102))
        self.assertEqual(result.getpixel((100, 50)), (255, 255, 255, 255))
        self.assertEqual(image.tobytes(), original)

    def test_white_margin_is_removed_and_enclosed_white_detail_remains(self):
        image = Image.new("RGB", (1000, 800), "white")
        draw = ImageDraw.Draw(image)
        draw.rectangle((400, 300, 599, 399), fill="red")
        draw.rectangle((450, 330, 549, 369), fill="white")
        result = marker_images.trim_image(image)
        self.assertEqual(result.size, (202, 102))
        self.assertEqual(result.getpixel((100, 50)), (255, 255, 255, 255))

    def test_photo_corners_and_empty_image_do_not_cause_destructive_crop(self):
        image = Image.new("RGB", (100, 80), "blue")
        ImageDraw.Draw(image).rectangle((50, 0, 99, 79), fill="red")
        self.assertEqual(marker_images.trim_image(image).size, image.size)
        blank = Image.new("RGBA", (100, 80))
        self.assertEqual(marker_images.trim_image(blank).size, blank.size)

    def test_large_images_and_trim_preference_survive_real_save_reload(self):
        current = storage.load_guide()
        guide = deepcopy(current)
        marker = next(m for m in guide["markers"] if m["kind"] == "image")
        marker.update(size=900, trimImage=False)
        plan = guide["floorPlans"][0]
        plan["markers"].append(dict(id="test_large_image", kind="image", image=marker["image"],
                                    itemId=None, text="", color="#3274b6", x=50, y=50,
                                    size=1000, rotation=0, layer=1, locked=False, trimImage=True))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "guide.json"
            path.write_text(json.dumps(current, ensure_ascii=False), encoding="utf-8")
            with patch.object(storage, "GUIDE_DATA", path), patch.object(storage, "BACKUP_DIR", Path(directory) / "backups"):
                storage.save_editor_guide({"expectedRevision": current["revision"], "guide": guide})
                loaded = storage.load_guide()
        actual = next(m for m in loaded["markers"] if m["id"] == marker["id"])
        self.assertEqual((actual["size"], actual["trimImage"]), (900, False))
        floor = next(m for m in loaded["floorPlans"][0]["markers"] if m["id"] == "test_large_image")
        self.assertEqual((floor["size"], floor["trimImage"]), (1000, True))
        self.assertEqual([(m["id"], m["x"], m["y"]) for m in loaded["markers"]],
                         [(m["id"], m["x"], m["y"]) for m in current["markers"]])

    def test_pin_limits_and_invalid_trim_preferences_are_rejected(self):
        current = storage.load_guide()
        for change in ("pin_size", "bad_bool", "too_large"):
            guide = deepcopy(current)
            image = next(m for m in guide["markers"] if m["kind"] == "image")
            if change == "pin_size":
                next(m for m in guide["markers"] if m["kind"] == "pin")["size"] = 900
            elif change == "bad_bool":
                image["trimImage"] = "yes"
            else:
                image["size"] = 1201
            with self.subTest(change=change), self.assertRaises(ValueError):
                storage.validate_guide({"expectedRevision": current["revision"], "guide": guide}, current)

    def test_display_route_preserves_source_and_rejects_outside_paths(self):
        client = editor.app.test_client()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "example.png"
            image = Image.new("RGB", (300, 200), "white")
            ImageDraw.Draw(image).rectangle((100, 80, 199, 119), fill="blue")
            image.save(path)
            original = path.read_bytes()
            with patch.object(marker_images, "STATIC_IMAGE_DIR", root):
                response = client.get("/api/marker-image/example.png")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(Image.open(BytesIO(response.data)).size, (102, 42))
                self.assertEqual(client.get("/api/marker-image/../outside.png").status_code, 404)
                self.assertEqual(client.get("/api/marker-image/not-there.png").status_code, 404)
            self.assertEqual(path.read_bytes(), original)

    def test_shutdown_requires_local_editor_token_and_running_editor(self):
        client = editor.app.test_client()
        self.assertEqual(client.get("/api/editor/shutdown").status_code, 405)
        self.assertEqual(client.post("/api/editor/shutdown").status_code, 403)
        headers = {"X-Editor-Token": editor.app.config["EDITOR_SHUTDOWN_TOKEN"]}
        self.assertEqual(client.post("/api/editor/shutdown", headers=headers,
                                     environ_base={"REMOTE_ADDR": "192.0.2.1"}).status_code, 403)
        self.assertEqual(client.post("/api/editor/shutdown", headers=headers).status_code, 503)


if __name__ == "__main__":
    unittest.main()
