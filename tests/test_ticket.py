"""Links from event details to the separate ticket (seiriken) app."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import storage


class TicketLinkTests(unittest.TestCase):
    def setUp(self):
        self.current = storage.load_guide()
        self.guide = deepcopy(self.current)
        self.event = next(item for item in self.guide["items"] if item["type"] != "facility")
        self.facility = next(item for item in self.guide["items"] if item["type"] == "facility")

    def validate(self):
        return storage.validate_guide({"expectedRevision": self.current["revision"], "guide": self.guide}, self.current)

    def saved_item(self, guide, item_id):
        return next(item for item in guide["items"] if item["id"] == item_id)

    def test_existing_items_default_to_no_ticket(self):
        for item in self.current["items"]:
            self.assertIs(item["ticketEnabled"], False)
            self.assertEqual(item["ticketUrl"], "")

    def test_enabled_ticket_round_trips(self):
        self.event.update(ticketEnabled=True, ticketUrl="https://example.com/seiriken/#/")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "guide.json"
            path.write_text(json.dumps(self.current, ensure_ascii=False), encoding="utf-8")
            with patch.object(storage, "GUIDE_DATA", path), patch.object(storage, "DATA_DIR", root), patch.object(storage, "BACKUP_DIR", root / "backups"):
                saved, _ = storage.save_editor_guide({"expectedRevision": self.current["revision"], "guide": self.guide})
                self.assertEqual(saved, storage.load_guide())
        item = self.saved_item(saved, self.event["id"])
        self.assertIs(item["ticketEnabled"], True)
        self.assertEqual(item["ticketUrl"], "https://example.com/seiriken/#/")

    def test_enabled_without_url_uses_default(self):
        self.event.update(ticketEnabled=True, ticketUrl="  ")
        self.assertEqual(self.saved_item(self.validate(), self.event["id"])["ticketUrl"], storage.DEFAULT_TICKET_URL)

    def test_missing_fields_from_older_clients_are_accepted(self):
        self.event.pop("ticketEnabled")
        self.event.pop("ticketUrl")
        item = self.saved_item(self.validate(), self.event["id"])
        self.assertEqual((item["ticketEnabled"], item["ticketUrl"]), (False, ""))

    def test_unsafe_urls_are_rejected(self):
        for url in ("http://example.com/", "javascript:alert(1)", "https://", "https://exa mple.com/", "https://example.com/a\tb", "https://example.com/\x07", "https://" + "a" * 300):
            with self.subTest(url=url):
                self.event.update(ticketEnabled=True, ticketUrl=url)
                with self.assertRaises(ValueError):
                    self.validate()

    def test_invalid_enabled_flag_is_rejected(self):
        self.event["ticketEnabled"] = "yes"
        with self.assertRaises(ValueError):
            self.validate()

    def test_facility_never_shows_ticket(self):
        self.facility.update(ticketEnabled=True, ticketUrl="https://example.com/")
        item = self.saved_item(self.validate(), self.facility["id"])
        self.assertEqual((item["ticketEnabled"], item["ticketUrl"]), (False, ""))


if __name__ == "__main__":
    unittest.main()
