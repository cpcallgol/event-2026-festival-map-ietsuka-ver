"""Optional experience information, joint grades, sign references and fixed cutout."""
from copy import deepcopy
from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image, ImageDraw
from werkzeug.datastructures import FileStorage

import editor
import storage


class Revision12Tests(unittest.TestCase):
    def setUp(self):
        self.current = storage.load_guide()
        self.guide = deepcopy(self.current)

    def validate(self):
        return storage.validate_guide({"expectedRevision": self.current["revision"], "guide": self.guide}, self.current)

    def roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "guide.json"
            path.write_text(json.dumps(self.current, ensure_ascii=False), encoding="utf-8")
            with patch.object(storage, "GUIDE_DATA", path), patch.object(storage, "BACKUP_DIR", root / "backups"):
                storage.save_editor_guide({"expectedRevision": self.current["revision"], "guide": self.guide})
                return storage.load_guide()

    def test_migration_keeps_manual_numbers_and_existing_guidance_without_writing(self):
        original = storage.GUIDE_DATA.read_bytes()
        raw = json.loads(original)
        self.assertEqual(self.current["schemaVersion"], 8)
        self.assertEqual([(m["id"], m["label"]) for m in self.current["markers"]], [(m["id"], m["label"]) for m in raw["markers"]])
        for item in self.current["items"]:
            before = next(old for old in raw["items"] if old["id"] == item["id"])
            self.assertEqual(item["experienceInfoEnabled"], before["type"] != "facility" and any(before.get(key) for key in storage.EXPERIENCE_FIELDS))
            for key, value in before.items():
                self.assertEqual(item[key], value)
        sign = next(m for m in self.current["markers"] if m["id"] == storage.SIGN_MARKER_ID)
        self.assertEqual(sign["guidePin"]["markerId"], storage.HEADQUARTERS_PIN_ID)
        self.assertEqual(storage.upgrade_guide(self.current), self.current)
        self.assertEqual(storage.GUIDE_DATA.read_bytes(), original)

    def test_every_nonfacility_category_keeps_enabled_and_disabled_information(self):
        expected = {}
        for category in self.guide["categories"]:
            if category["area"] == "facility":
                continue
            entries = [item for item in self.guide["items"] if item["categoryId"] == category["id"]]
            self.assertGreaterEqual(len(entries), 2)
            for item, enabled in zip(entries, (True, False)):
                item.update(experienceInfoEnabled=enabled, duration="15分", schedule="10:00〜15:00", targetAudience="どなたでも", capacity="各回10名・先着順")
                expected[item["id"]] = {field: item[field] for field in (*storage.EXPERIENCE_FIELDS, "experienceInfoEnabled")}
        loaded = self.roundtrip()
        for item_id, values in expected.items():
            actual = next(item for item in loaded["items"] if item["id"] == item_id)
            self.assertEqual({field: actual[field] for field in values}, values)

    def test_facilities_cannot_enable_experience_information(self):
        facility = next(item for item in self.guide["items"] if item["type"] == "facility")
        facility.update(experienceInfoEnabled=True, capacity="10名")
        result = self.validate()
        self.assertFalse(next(item for item in result["items"] if item["id"] == facility["id"])["experienceInfoEnabled"])

    def test_joint_grade_saves_without_dangling_year(self):
        item = next(item for item in self.guide["items"] if item["type"] != "facility" and item["department"] not in {"", "その他"})
        item["grade"] = ""
        loaded = self.roundtrip()
        actual = next(entry for entry in loaded["items"] if entry["id"] == item["id"])
        self.assertEqual((actual["grade"], actual["organizer"]), ("", item["department"]))
        item["grade"] = "3"
        with self.assertRaises(ValueError):
            self.validate()

    def test_capacity_limit_and_boolean_flag_are_validated(self):
        item = next(item for item in self.guide["items"] if item["type"] != "facility")
        item["capacity"] = "x" * 81
        with self.assertRaises(ValueError):
            self.validate()
        item["capacity"] = "10名"
        item["experienceInfoEnabled"] = "false"
        with self.assertRaises(ValueError):
            self.validate()

    def test_sign_keeps_same_destination_after_renumber_save_reload(self):
        target = next(m for m in self.guide["markers"] if m["id"] == storage.HEADQUARTERS_PIN_ID)
        target["label"] = "42"
        sign = next(m for m in self.guide["markers"] if m["id"] == storage.SIGN_MARKER_ID)
        sign["guidePin"].update(x=47.2, y=27.3, size=12)
        loaded = self.roundtrip()
        actual = next(m for m in loaded["markers"] if m["id"] == sign["id"])
        self.assertEqual(actual["guidePin"], sign["guidePin"])
        destination = next(m for m in loaded["markers"] if m["id"] == actual["guidePin"]["markerId"])
        self.assertEqual(destination["label"], "42")
        self.assertEqual((destination["x"], destination["y"]), (target["x"], target["y"]))

    def test_disabled_sign_does_not_reappear_after_reload(self):
        next(m for m in self.guide["markers"] if m["id"] == storage.SIGN_MARKER_ID)["guidePin"] = None
        loaded = self.roundtrip()
        self.assertIsNone(next(m for m in loaded["markers"] if m["id"] == storage.SIGN_MARKER_ID)["guidePin"])

    def test_invalid_sign_reference_position_size_and_kind_are_rejected(self):
        for field, value in (("markerId", "missing"), ("markerId", storage.SIGN_MARKER_ID), ("x", -1), ("y", 101), ("size", 0), ("size", 31)):
            self.guide = deepcopy(self.current)
            sign = next(m for m in self.guide["markers"] if m["id"] == storage.SIGN_MARKER_ID)
            sign["guidePin"][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                self.validate()
        self.guide = deepcopy(self.current)
        target = next(m for m in self.guide["markers"] if m["id"] == storage.HEADQUARTERS_PIN_ID)
        target["guidePin"] = {"markerId": target["id"], **storage.DEFAULT_GUIDE_PIN_POSITION}
        with self.assertRaises(ValueError):
            self.validate()

    def test_upload_always_uses_100_and_keeps_enclosed_detail_and_original(self):
        image = Image.new("RGBA", (100, 100), "white")
        draw = ImageDraw.Draw(image)
        draw.rectangle((10, 0, 99, 99), fill=(235, 235, 235, 255))  # distance 60: removed at 100, retained at 35
        draw.rectangle((25, 25, 75, 75), fill="blue")
        draw.rectangle((40, 40, 60, 60), fill="white")
        buffer = BytesIO()
        image.save(buffer, "PNG")
        original = buffer.getvalue()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(storage, "STATIC_IMAGE_DIR", root / "images"), patch.object(storage, "UPLOAD_IMAGE_DIR", root / "images/uploads"), patch.object(storage, "THUMB_IMAGE_DIR", root / "images/thumbs"), patch.object(storage, "ORIGINAL_IMAGE_DIR", root / "originals"):
                direct = storage.save_uploaded_image(FileStorage(stream=BytesIO(original), filename="direct.png"), True, 35)
                with Image.open(root / "images" / direct["path"]) as result:
                    self.assertEqual(result.getpixel((15, 1))[3], 0)
                    self.assertEqual(result.getpixel((50, 50))[3], 255)
                response = editor.app.test_client().post("/api/editor/upload", data={"image": (BytesIO(original), "route.png"), "removeBackground": "true", "tolerance": "35"})
                self.assertEqual(response.status_code, 200)
                with Image.open(root / "images" / response.json["asset"]["path"]) as result:
                    self.assertEqual(result.getpixel((15, 1))[3], 0)
                    self.assertEqual(result.getpixel((50, 50)), (255, 255, 255, 255))
                kept = storage.save_uploaded_image(FileStorage(stream=BytesIO(original), filename="keep.png"), False)
                with Image.open(root / "images" / kept["path"]) as result:
                    self.assertEqual(result.getpixel((15, 1))[3], 255)
                for path in (root / "originals").iterdir():
                    self.assertEqual(path.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
