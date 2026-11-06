"""Optional event descriptions with a show/hide switch."""
from copy import deepcopy
import unittest

import storage


class DescriptionToggleTests(unittest.TestCase):
    def setUp(self):
        self.current = storage.load_guide()
        self.guide = deepcopy(self.current)
        self.event = next(item for item in self.guide["items"] if item["type"] != "facility")
        self.facility = next(item for item in self.guide["items"] if item["type"] == "facility")

    def validate(self):
        return storage.validate_guide({"expectedRevision": self.current["revision"], "guide": self.guide}, self.current)

    def saved(self, item):
        return next(entry for entry in self.validate()["items"] if entry["id"] == item["id"])

    def test_existing_events_show_description_and_facilities_do_not(self):
        for item in self.current["items"]:
            self.assertIs(item["descriptionEnabled"], item["type"] != "facility")

    def test_event_can_be_saved_without_description(self):
        self.event.update(description="", descriptionEnabled=True, detailsVersion=2)
        self.assertEqual(self.saved(self.event)["description"], "")

    def test_hidden_description_keeps_its_text(self):
        self.event.update(description="あとで表示する説明", descriptionEnabled=False)
        item = self.saved(self.event)
        self.assertEqual((item["descriptionEnabled"], item["description"]), (False, "あとで表示する説明"))

    def test_missing_flag_from_older_clients_shows_description(self):
        self.event.pop("descriptionEnabled")
        self.assertIs(self.saved(self.event)["descriptionEnabled"], True)

    def test_invalid_flag_is_rejected(self):
        self.event["descriptionEnabled"] = "yes"
        with self.assertRaises(ValueError):
            self.validate()

    def test_facility_never_shows_description(self):
        self.facility["descriptionEnabled"] = True
        self.assertIs(self.saved(self.facility)["descriptionEnabled"], False)


if __name__ == "__main__":
    unittest.main()
