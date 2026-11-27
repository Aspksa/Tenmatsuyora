"""Local reader must expose archived prose without publishing its private memory."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
import chronicle


class ReadingArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "chronicles"
        self.root.mkdir()
        self.archive = self.root.parent / "drafts"
        self.archive.mkdir()
        self.catalog = {"book": {"title": "Книга"}, "volumes": [{"id": "vol.001", "title": "Том"}], "chapters": []}
        (self.root / "catalog.json").write_text(json.dumps(self.catalog), encoding="utf-8")
        self.raw = "# Глава 1. Начало\n\nСекретное слово в прозе.\n".encode()
        (self.archive / "000001.md").write_bytes(self.raw)
        (self.archive / "000001.json").write_text('{"private":"not-for-reader"}', encoding="utf-8")
        self.index = {"schema": 1, "kind": "unpublished_draft_archive", "published_through": None, "last_written": 1, "next_writing_chapter": 2, "chapters": [{"chapter": 1, "path": "drafts/000001.md", "title": "Глава 1. Начало", "body_chars": len("Секретное слово в прозе."), "text_sha256": hashlib.sha256(self.raw).hexdigest(), "status": "complete_prose_unpublished", "next_scene": "not-for-reader"}]}
        self.write_index()

    def write_index(self):
        (self.archive / "index.json").write_text(json.dumps(self.index), encoding="utf-8")

    def test_local_reader_and_public_boundary(self):
        self.assertEqual(chronicle.public_catalog(self.root)["chapters"], [])
        with self.assertRaises(ValueError):
            chronicle.public_chapter(1, self.root)
        cat = chronicle.reading_catalog(self.root)
        self.assertEqual((cat["published_count"], cat["draft_count"]), (0, 1))
        self.assertEqual(cat["chapters"][0]["status"], "draft")
        self.assertNotIn("not-for-reader", json.dumps(cat))
        chapter = chronicle.reading_chapter(1, self.root)
        self.assertEqual(chapter["text"], "Секретное слово в прозе.")
        self.assertEqual(chapter["status"], "draft")
        self.assertNotIn("not-for-reader", json.dumps(chapter))
        self.assertEqual(chronicle.reading_search("слово", self.root)[0]["number"], 1)
        self.assertEqual(chronicle.reading_search("not-for-reader", self.root), [])
        with self.assertRaises(ValueError):
            chronicle.reading_chapter(2, self.root)
        db = self.root / "reader.sqlite"
        result = chronicle.reader_settings(db, {"chapter": 1, "bookmarks": [1], "position": 555}, len(cat["chapters"]))
        self.assertEqual(result["position"], 555)
        self.assertEqual(chronicle.reader_settings(db)["bookmarks"], [1])

    def test_missing_index_hides_unindexed_files(self):
        (self.archive / "index.json").unlink()
        self.assertEqual(chronicle.reading_catalog(self.root)["chapters"], [])
        with self.assertRaises(ValueError):
            chronicle.reading_chapter(1, self.root)

    def test_invalid_path_and_digest(self):
        self.index["chapters"][0]["path"] = "../chronicles/plan/PLOT.md"
        self.write_index()
        with self.assertRaises(ValueError):
            chronicle.reading_catalog(self.root)
        self.index["chapters"][0]["path"] = "drafts/000001.md"
        self.write_index()
        (self.archive / "000001.md").write_bytes(b"modified")
        with self.assertRaises(ValueError):
            chronicle.reading_chapter(1, self.root)

    def test_real_archive_if_present(self):
        cat = chronicle.reading_catalog()
        for row in cat["chapters"]:
            ch = chronicle.reading_chapter(row["number"])
            self.assertEqual(len(ch["text"]), row["body_chars"])
            self.assertEqual(ch["status"], row["status"])


if __name__ == "__main__":
    unittest.main()
