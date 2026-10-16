"""Recommendations for every category and the supplied gym floor plan."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import storage


class Revision13Tests(unittest.TestCase):
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
            with patch.object(storage, "GUIDE_DATA", path), patch.object(storage, "DATA_DIR", root), patch.object(storage, "BACKUP_DIR", root / "backups"):
                saved, _ = storage.save_editor_guide({"expectedRevision": self.current["revision"], "guide": self.guide})
                self.assertEqual(saved, storage.load_guide())
                return saved

    def test_title_migration_keeps_source_and_manual_pin_order(self):
        original = storage.GUIDE_DATA.read_bytes()
        raw = json.loads(original)
        self.assertEqual(self.current["settings"]["subtitle"], "ものづくりフェスタ")
        self.assertEqual(self.current["settings"]["windowTitle"], "ものづくり＆紅華祭")
        self.assertEqual(self.current["settings"]["recommendations"], storage.DEFAULT_RECOMMENDATIONS)
        for key in ("items", "markers"):
            self.assertEqual(self.current[key], storage.upgrade_guide(raw)[key])
        self.assertEqual([(m["id"], m["label"], m["x"], m["y"]) for m in self.current["markers"]], [(m["id"], m["label"], m["x"], m["y"]) for m in raw["markers"]])
        raw["settings"]["subtitle"] = "学生のものづくり"
        self.assertEqual(storage.upgrade_guide(raw)["settings"]["subtitle"], "学生のものづくり")
        self.assertEqual(storage.GUIDE_DATA.read_bytes(), original)

    def test_every_category_and_custom_title_order_copy_colors_survive_save(self):
        entries = [next(item for item in self.guide["items"] if item["categoryId"] == category["id"]) for category in self.guide["categories"]]
        ids = [item["id"] for item in reversed(entries)]
        self.guide["settings"]["recommendations"].update(title="体験・企画のご紹介", itemIds=ids, accentColor="#6834a1", backgroundColor="#fff4dd", textColor="#332244", autoRotate=False, intervalSeconds=12)
        for item in entries:
            item["catchCopy"] = "まずはココ！<小学生歓迎>"
        saved = self.roundtrip()
        self.assertEqual(saved["settings"]["recommendations"], self.guide["settings"]["recommendations"])
        for item in entries:
            self.assertEqual(next(entry for entry in saved["items"] if entry["id"] == item["id"])["catchCopy"], item["catchCopy"])
        self.assertEqual(len(saved["items"]), len(self.current["items"]))

    def test_all_stalls_mode_and_explicit_empty_selection_remain_distinct(self):
        self.guide["settings"]["recommendations"]["itemIds"] = None
        self.assertIsNone(self.roundtrip()["settings"]["recommendations"]["itemIds"])
        self.guide["settings"]["recommendations"].update(enabled=False, itemIds=[])
        self.assertEqual(self.roundtrip()["settings"]["recommendations"]["itemIds"], [])

    def test_invalid_recommendation_settings_are_rejected(self):
        cases = [("enabled", "true"), ("autoRotate", 1), ("intervalSeconds", 0), ("intervalSeconds", 121), ("intervalSeconds", 1.5), ("intervalSeconds", float("nan")), ("title", ""), ("title", "x" * 41), ("accentColor", "red"), ("backgroundColor", "url(x)"), ("textColor", "#fff"), ("itemIds", "all"), ("itemIds", ["missing"]), ("itemIds", [self.current["items"][0]["id"]] * 2)]
        for field, value in cases:
            self.guide = deepcopy(self.current)
            self.guide["settings"]["recommendations"][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                self.validate()

    def test_deleting_selected_event_removes_reference_without_selecting_other_events(self):
        removed = next(item for item in self.guide["items"] if item["type"] == "stall")
        self.guide["settings"]["recommendations"]["itemIds"] = [removed["id"]]
        self.guide["items"] = [item for item in self.guide["items"] if item["id"] != removed["id"]]
        for marker in self.guide["markers"]:
            marker["itemIds"] = [item_id for item_id in marker["itemIds"] if item_id != removed["id"]]
            marker["itemId"] = marker["itemIds"][0] if marker["itemIds"] else None
        for plan in self.guide["floorPlans"]:
            plan["markers"] = [marker for marker in plan["markers"] if marker.get("itemId") != removed["id"]]
        self.assertEqual(self.roundtrip()["settings"]["recommendations"]["itemIds"], [])

    def test_gym_floor_placement_saves_with_no_floor_number(self):
        original = storage.GUIDE_DATA.read_bytes()
        image = (storage.STATIC_IMAGE_DIR / "floors/体育館.png").read_bytes()
        plan = next(plan for plan in self.guide["floorPlans"] if plan["id"] == "gym")
        self.assertEqual((plan["label"], plan["building"], plan["floor"]), ("体育館", "体育館", ""))
        item = next(item for item in self.guide["items"] if item["building"] == "体育館" and item["type"] != "facility")
        plan["markers"].append(dict(id="test_gym_item", kind="item", itemId=item["id"], image=None, text="", color="#0064c8", x=45, y=40, size=150, rotation=0, layer=1, locked=False, trimImage=True))
        saved = self.roundtrip()
        gym = next(plan for plan in saved["floorPlans"] if plan["id"] == "gym")
        self.assertEqual(gym["markers"][0]["itemId"], item["id"])
        self.assertEqual((storage.STATIC_IMAGE_DIR / gym["image"]).read_bytes(), image)
        self.assertEqual(storage.GUIDE_DATA.read_bytes(), original)
        for old in self.current["floorPlans"]:
            if old["id"] != "gym":
                self.assertEqual(next(plan for plan in saved["floorPlans"] if plan["id"] == old["id"])["markers"], old["markers"])

    def test_wrong_building_cannot_be_placed_on_gym_floor(self):
        item = next(item for item in self.guide["items"] if item["type"] != "facility" and item["building"] not in {"体育館", ""})
        gym = next(plan for plan in self.guide["floorPlans"] if plan["id"] == "gym")
        gym["markers"].append(dict(id="wrong_gym_item", kind="item", itemId=item["id"], image=None, text="", color="#0064c8", x=45, y=40, size=150, rotation=0, layer=1, locked=False))
        with self.assertRaisesRegex(ValueError, "場所と配置先"):
            self.validate()


if __name__ == "__main__":
    unittest.main()
