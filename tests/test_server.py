import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server

class HistoryTests(unittest.TestCase):
    def test_local_and_validation(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(server, "DB", Path(tmp)/"test.sqlite"), patch.object(server, "KEY", ""), patch.object(server, "MODEL", ""):
            self.assertIn("сохранено", server.process("Привет"))
            self.assertEqual(server.state()["count"], 1)
            self.assertEqual(server.state()["messages"][0]["content"], "Привет")
            with self.assertRaises(ValueError):
                server.process(" ")
            self.assertEqual(server.state()["count"], 1)

    def test_cloud_mock(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(server, "DB", Path(tmp)/"test.sqlite"), patch.object(server, "KEY", "test"), patch.object(server, "MODEL", "test"), patch.object(server, "generate", return_value="Ответ"):
            self.assertEqual(server.process("Запрос"), "")
            self.assertEqual([x["role"] for x in server.state()["messages"]], ["user","assistant"])

    def test_failure_retains_message(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(server, "DB", Path(tmp)/"test.sqlite"), patch.object(server, "KEY", "test"), patch.object(server, "MODEL", "test"), patch.object(server, "generate", side_effect=OSError):
            self.assertIn("Автоповтора нет", server.process("Запрос"))
            self.assertEqual(server.state()["count"], 1)

if __name__ == "__main__":
    unittest.main()
