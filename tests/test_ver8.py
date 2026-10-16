"""Persistence and image regressions for revision 8."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image, ImageDraw
import storage


class Revision8Tests(unittest.TestCase):
    def setUp(self):
        self.current = storage.load_guide()
        self.guide = deepcopy(self.current)

    def roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "guide.json"
            path.write_text(json.dumps(self.current, ensure_ascii=False), encoding="utf-8")
            with patch.object(storage, "GUIDE_DATA", path), patch.object(storage, "BACKUP_DIR", root / "backups"):
                saved, _ = storage.save_editor_guide({"expectedRevision": self.current["revision"], "guide": self.guide})
                return saved, storage.load_guide()

    def test_event_guidance_and_callout_survive_save_and_reload(self):
        event = next(item for item in self.guide["items"] if item["type"] != "facility")
        values = {"duration": "15分", "schedule": "10:00〜15:00", "targetAudience": "小学生以上", "catchCopy": "ものづくりを楽しもう"}
        event.update(values)
        image = next(marker for marker in self.guide["markers"] if marker["kind"] == "image")
        image["callout"] = True
        saved, loaded = self.roundtrip()
        for guide in (saved, loaded):
            result = next(item for item in guide["items"] if item["id"] == event["id"])
            self.assertEqual({key: result[key] for key in values}, values)
            self.assertTrue(next(marker for marker in guide["markers"] if marker["id"] == image["id"])["callout"])
        self.assertEqual(len(loaded["items"]), len(self.current["items"]))

    def test_removed_standard_category_stays_removed_and_custom_color_stays(self):
        removed = "festival"
        target = next(category for category in self.guide["categories"] if category["id"] == "experience")
        target["color"] = "#7a42bc"
        target["label"] = "体験とステージ"
        for item in self.guide["items"]:
            if item["categoryId"] == removed:
                item["categoryId"] = target["id"]
        for marker in self.guide["markers"]:
            if marker["categoryId"] != removed:
                continue
            marker["categoryId"] = target["id"]
        self.guide["categories"] = [category for category in self.guide["categories"] if category["id"] != removed]
        _, loaded = self.roundtrip()
        self.assertNotIn(removed, {category["id"] for category in loaded["categories"]})
        current = next(category for category in loaded["categories"] if category["id"] == target["id"])
        self.assertEqual((current["label"], current["color"]), ("体験とステージ", "#7a42bc"))
        self.assertEqual({item["id"] for item in loaded["items"]}, {item["id"] for item in self.current["items"]})
        self.assertEqual({marker["id"] for marker in loaded["markers"]}, {marker["id"] for marker in self.current["markers"]})

    def test_only_border_connected_background_becomes_transparent(self):
        source = Image.new("RGBA", (80, 80), "white")
        draw = ImageDraw.Draw(source)
        draw.rectangle((20, 20, 60, 60), fill="red")
        draw.rectangle((30, 30, 50, 50), fill="white")
        result = storage._remove_border_background(source, 35)
        self.assertEqual(result.getpixel((0, 0))[3], 0)
        self.assertEqual(result.getpixel((40, 40))[3], 255, "enclosed white detail must remain")
        self.assertEqual(result.getpixel((25, 25)), (255, 0, 0, 255))
        self.assertEqual(source.getpixel((0, 0))[3], 255, "original must stay intact")

    def test_floor_display_bounds_do_not_change_original_coordinates(self):
        for before, after in zip(self.current["floorPlans"], storage.upgrade_guide(self.current)["floorPlans"]):
            self.assertEqual(before["markers"], after["markers"])
            bounds = after["contentBounds"]
            self.assertGreater(bounds["width"], 0)
            self.assertGreater(bounds["height"], 0)
            self.assertLessEqual(bounds["x"] + bounds["width"], 1)
            self.assertLessEqual(bounds["y"] + bounds["height"], 1)

    def test_invalid_new_guidance_or_callout_is_rejected(self):
        event = next(item for item in self.guide["items"] if item["type"] != "facility")
        event["duration"] = "x" * 81
        with self.assertRaises(ValueError):
            storage.validate_guide({"expectedRevision": self.current["revision"], "guide": self.guide}, self.current)
        event["duration"] = ""
        self.guide["markers"][0]["callout"] = "yes"
        with self.assertRaises(ValueError):
            storage.validate_guide({"expectedRevision": self.current["revision"], "guide": self.guide}, self.current)


if __name__ == "__main__":
    unittest.main()

