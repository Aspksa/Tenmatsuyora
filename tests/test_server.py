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

    def test_graph_keeps_archive(self):
        from contextlib import closing
        with tempfile.TemporaryDirectory() as tmp, patch.object(server, "DB", Path(tmp)/"test.sqlite"):
            with closing(server.connect()) as conn, conn:
                conn.executemany("INSERT INTO messages(role,content) VALUES ('user',?)", [(str(i),) for i in range(10000)])
            s=server.state()
            self.assertEqual(len(s["messages"]), 200)
            self.assertEqual(sum(g["count"] for g in s["groups"]), 10000)
            self.assertEqual(len(s["groups"]), 334)
            self.assertEqual(len(server.cluster(0)), 30)
            self.assertEqual(len(server.cluster(333)), 10)

    def test_preferences_and_exact_archive_slots(self):
        from contextlib import closing
        with tempfile.TemporaryDirectory() as tmp, patch.object(server, "DB", Path(tmp)/"test.sqlite"):
            with closing(server.connect()) as conn, conn:
                conn.execute("INSERT INTO messages(id,role,content) VALUES (1,'user','a'), (3,'user','b'), (30,'assistant','c')")
            self.assertEqual(server.state()["groups"][0]["mask"], (1<<0)|(1<<2)|(1<<29))
            saved=server.save_preferences({"glow": 5, "speed": .5, "camera": {"x": 42,"y": -17,"k": 2}, "auto": False})
            self.assertEqual(saved["glow"],1.5)
            self.assertEqual(server.state()["preferences"],saved)
            self.assertEqual(server.save_preferences({"speed": float("nan")})["speed"],1)

    def test_operation_real_context_and_links(self):
        from contextlib import closing
        with tempfile.TemporaryDirectory() as tmp, patch.object(server, "DB", Path(tmp)/"test.sqlite"), patch.object(server, "KEY", "test"), patch.object(server, "MODEL", "test"):
            with closing(server.connect()) as conn, conn:
                conn.executemany("INSERT INTO messages(role,content) VALUES ('user',?)", [("гараж" if i==0 else "прочее",) for i in range(25)])
            class Reply:
                def __enter__(self):
                    return self
                def __exit__(self, *args):
                    pass
                def read(self, *args):
                    return b'{"choices":[{"message":{"content":"OK"}}]}'
            with patch.object(server.urllib.request, "urlopen", return_value=Reply()):
                token="a"*32
                self.assertEqual(server.process("гараж",token),"")
                events=server.operation(token)
                self.assertTrue(events["done"])
                kinds=[e["kind"] for e in events["events"]]
                self.assertLess(kinds.index("memory_found"), kinds.index("cloud_start"))
                self.assertLess(kinds.index("cloud_received"), kinds.index("response_delivered"))
                self.assertIn(1,next(e for e in events["events"] if e["kind"]=="memory_found")["older_ids"])
                self.assertIn({"answer_id":27,"source_id":1},server.state()["context_links"])
            with self.assertRaises(ValueError):
                server.process("повтор",token)

if __name__ == "__main__":
    unittest.main()
