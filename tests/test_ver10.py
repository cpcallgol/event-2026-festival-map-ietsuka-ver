"""Global pin numbering and one-time category-label migration."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import storage


class GlobalNumberingTests(unittest.TestCase):
    def test_legacy_labels_become_one_sequence_without_writing_source(self):
        original = storage.GUIDE_DATA.read_bytes()
        legacy = json.loads(original)
        legacy["schemaVersion"] = 6
        upgraded = storage.upgrade_guide(legacy)
        pins = [marker for marker in upgraded["markers"] if marker["kind"] == "pin"]
        self.assertEqual([m["label"] for m in pins], [str(n) for n in range(1, len(pins) + 1)])
        for before, after in zip(legacy["markers"], upgraded["markers"]):
            for key, value in before.items():
                if key != "label":
                    self.assertEqual(after[key], value, (before["id"], key))
        self.assertEqual(upgraded["items"], storage.upgrade_guide(legacy)["items"])
        self.assertEqual(storage.GUIDE_DATA.read_bytes(), original)

    def test_current_manual_order_and_number_gaps_are_not_reassigned_on_load(self):
        current = storage.load_guide()
        pins = [m for m in current["markers"] if m["kind"] == "pin"]
        for number, marker in enumerate(reversed(pins), 20):
            marker["label"] = str(number * 3)
        self.assertEqual(storage.upgrade_guide(current), current)

    def test_global_labels_survive_save_reload_and_viewer_load(self):
        current = storage.load_guide()
        guide = deepcopy(current)
        pins = [m for m in guide["markers"] if m["kind"] == "pin"]
        for number, marker in enumerate(reversed(pins), 1):
            marker["label"] = str(number)
        expected = {m["id"]: m["label"] for m in pins}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "guide.json"
            data.write_text(json.dumps(current, ensure_ascii=False), encoding="utf-8")
            with patch.object(storage, "GUIDE_DATA", data), patch.object(storage, "BACKUP_DIR", root / "backups"):
                saved, _ = storage.save_editor_guide({"expectedRevision": current["revision"], "guide": guide})
                loaded = storage.load_guide()
                self.assertEqual({m["id"]: m["label"] for m in loaded["markers"] if m["kind"] == "pin"}, expected)
                self.assertEqual(saved, loaded)

    def test_same_number_in_different_categories_and_zero_padded_alias_are_rejected(self):
        current = storage.load_guide()
        for padded in (False, True):
            guide = deepcopy(current)
            pins = [m for m in guide["markers"] if m["kind"] == "pin"]
            other = next(m for m in pins if m["categoryId"] != pins[0]["categoryId"])
            other["label"] = ("0" if padded else "") + pins[0]["label"]
            with self.subTest(padded=padded), self.assertRaisesRegex(ValueError, "ピン番号が重複"):
                storage.validate_guide({"expectedRevision": current["revision"], "guide": guide}, current)

    def test_facility_pin_also_uses_the_global_number_pool(self):
        current = storage.load_guide()
        guide = deepcopy(current)
        first = next(m for m in guide["markers"] if m["kind"] == "pin")
        facility = deepcopy(first)
        facility.update(id="test_facility_pin", categoryId="facility", usage="facility", itemIds=[], itemId=None)
        guide["markers"].append(facility)
        with self.assertRaisesRegex(ValueError, "ピン番号が重複"):
            storage.validate_guide({"expectedRevision": current["revision"], "guide": guide}, current)
        facility["label"] = "1001"
        result = storage.validate_guide({"expectedRevision": current["revision"], "guide": guide}, current)
        self.assertEqual(result["markers"][-1]["label"], "1001")


if __name__ == "__main__":
    unittest.main()
