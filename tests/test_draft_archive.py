"""Check the draft archive separately from published canon."""
import hashlib
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "drafts"
INDEX = ARCHIVE / "index.json"


class DraftArchiveTests(unittest.TestCase):
    def test_archive_integrity(self):
        if not INDEX.exists():
            self.assertFalse(list(ARCHIVE.glob("[0-9]*.md")))
            self.assertFalse(list(ARCHIVE.glob("[0-9]*.json")))
            return
        index = json.loads(INDEX.read_text(encoding="utf-8"))
        self.assertEqual(index["kind"], "unpublished_draft_archive")
        self.assertEqual(index["schema"], 1)
        catalog = json.loads((ROOT / "chronicles/catalog.json").read_text(encoding="utf-8"))
        published = [c["number"] for c in catalog["chapters"]]
        last_published = max(published, default=0)
        self.assertEqual(index["published_through"], last_published or None)
        self.assertEqual(index["next_publication_chapter"], last_published + 1)
        chapters = index["chapters"]
        self.assertTrue(chapters)
        self.assertEqual([c["chapter"] for c in chapters], list(range(last_published + 1, index["last_written"] + 1)))
        self.assertEqual(index["next_writing_chapter"], index["last_written"] + 1)
        self.assertEqual(index["next_scene"], chapters[-1]["next_scene"])
        expected_files = {"index.json", "README.md"}
        total_chars = 0
        total_anchors = 0
        previous = None
        for c in chapters:
            with self.subTest(chapter=c["chapter"]):
                num = f'{c["chapter"]:06d}'
                self.assertEqual(c["path"], f"drafts/{num}.md")
                self.assertEqual(c["metadata"], f"drafts/{num}.json")
                expected_files.update((f"{num}.md", f"{num}.json"))
                text_bytes = (ROOT / c["path"]).read_bytes()
                meta_bytes = (ROOT / c["metadata"]).read_bytes()
                self.assertEqual(hashlib.sha256(text_bytes).hexdigest(), c["text_sha256"])
                self.assertEqual(hashlib.sha256(meta_bytes).hexdigest(), c["metadata_sha256"])
                for data, key in ((text_bytes, "text_blob"), (meta_bytes, "metadata_blob")):
                    blob = b"blob " + str(len(data)).encode("ascii") + b"\0" + data
                    self.assertEqual(hashlib.sha1(blob).hexdigest(), c[key])
                title, body = text_bytes.decode("utf-8").split("\n", 1)
                body = body.strip()
                paragraphs = re.split(r"\n\s*\n", body)
                m = json.loads(meta_bytes)
                self.assertEqual(title, "# " + c["title"])
                self.assertEqual(len(body), c["body_chars"])
                self.assertEqual(m["body_chars"], c["body_chars"])
                self.assertEqual(m["chapter"], c["chapter"])
                self.assertEqual(m["status"], c["status"])
                self.assertIn("unpublished", c["status"])
                self.assertEqual(m["next_scene"], c["next_scene"])
                self.assertEqual(paragraphs[-1], c["closing"])
                if previous:
                    prior = m["prerequisite"]
                    self.assertEqual(prior["chapter"], previous["chapter"])
                    self.assertEqual(prior["blob"], previous["text_blob"])
                    if "closing" in prior:
                        self.assertEqual(prior["closing"], previous["closing"])
                memory = m.get("draft_memory", {})
                anchors = [e["source"] for field in ("evidence", "speech", "commitments") for e in memory.get(field, [])]
                for a in anchors:
                    self.assertGreaterEqual(a["paragraph"], 1)
                    self.assertLessEqual(a["paragraph"], len(paragraphs))
                    paragraph = paragraphs[a["paragraph"] - 1]
                    self.assertTrue(0 <= a["start"] < a["end"] <= len(paragraph))
                    self.assertEqual(paragraph[a["start"]:a["end"]], a["quote"])
                self.assertEqual(len(anchors), c["source_anchors"])
                if memory.get("scenes"):
                    next_paragraph = 1
                    for scene in memory["scenes"]:
                        lo, hi = scene["paragraphs"]
                        self.assertEqual(lo, next_paragraph)
                        self.assertGreaterEqual(hi, lo)
                        next_paragraph = hi + 1
                    self.assertEqual(next_paragraph, len(paragraphs) + 1)
                total_chars += len(body)
                total_anchors += len(anchors)
                previous = c
        self.assertEqual(total_chars, index["body_chars"])
        self.assertEqual(total_anchors, index["source_anchors"])
        self.assertEqual({p.name for p in ARCHIVE.iterdir() if p.is_file() and (p.suffix in (".md", ".json"))}, expected_files)


if __name__ == "__main__":
    unittest.main()
