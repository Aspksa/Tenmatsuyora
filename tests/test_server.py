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

    def test_sse_content_and_incomplete(self):
        chunks = [b'data: {"choices":[{"delta":{"reasoning_content":"hidden"}}]}\n', b'data: {"choices":[{"delta":{"content":"Hello"}}]}\n', b'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}\n', b'data: [DONE]\n']
        self.assertEqual(server.read_stream(chunks), "Hello world")
        with self.assertRaises(ValueError):
            server.read_stream(chunks[:2])

    def test_catalog_and_cached_vectors(self):
        from contextlib import closing
        with tempfile.TemporaryDirectory() as tmp, patch.object(server, "DB", Path(tmp)/"test.sqlite"), patch.object(server, "KEY", "test"):
            import hashlib
            with closing(server.connect()) as conn, conn:
                conn.execute("INSERT INTO embedding_cache VALUES (?,?,?)", ("m",hashlib.sha256(b"a").hexdigest(),"[1,0]"))
            with patch.object(server.urllib.request, "build_opener", side_effect=AssertionError("unexpected network")):
                self.assertEqual(server.cached_vectors("m",["a","a"]),[[1,0],[1,0]])
            self.assertAlmostEqual(server.cosine([1,0],[1,0]),1)
            with self.assertRaises(ValueError):
                server.cosine([1],[1,2])

    def test_catalog_configuration(self):
        catalog=[{"id":"chat","category":"llm"},{"id":"embed","category":"embedding"}]
        with tempfile.TemporaryDirectory() as tmp, patch.object(server, "DB", Path(tmp)/"test.sqlite"), patch.object(server,"KEY",""), patch.object(server,"MODEL",""), patch.object(server,"CATALOG",[]), patch.object(server,"VERIFIED",False), patch.object(server,"EMBED_MODEL",""), patch.object(server,"catalog_for",return_value=catalog):
            self.assertTrue(server.configure_cloud({"key":"test","model":"chat"})["verified"])
            with self.assertRaises(ValueError):
                server.configure_cloud({"model":"chat","embedding":"embed"})
            self.assertEqual(server.configure_cloud({"model":"chat","embedding":"embed","semantic_consent":True})["embedding"],"embed")
            self.assertFalse(server.configure_cloud({"clear":True})["has_key"])

    def test_physical_layout_persistence(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(server,"DB",Path(tmp)/"test.sqlite"):
            server.save("user","first")
            rows=[{"kind":"group","entity_id":0,"x":12,"y":-34},{"kind":"star","entity_id":1,"x":4,"y":5},{"kind":"star","entity_id":999,"x":2,"y":2}]
            self.assertTrue(server.save_layout({"rows":rows})["saved"])
            result=server.state()["layout"]
            self.assertEqual(len(result),2)
            self.assertEqual(server.cluster_layout(0)[0]["entity_id"],1)
            with self.assertRaises(ValueError):
                server.save_layout({"rows":[{"kind":"star","entity_id":1,"x":float("nan"),"y":0}]})
            with self.assertRaises(ValueError):
                server.save_layout({"rows":[{"kind":"star","entity_id":1,"x":200,"y":0}]})

    def test_semantic_links_are_not_plain_context(self):
        from contextlib import closing
        with tempfile.TemporaryDirectory() as tmp, patch.object(server,"DB",Path(tmp)/"test.sqlite"), patch.object(server,"KEY","test"), patch.object(server,"MODEL","test"):
            server.save("user","old")
            def reply():
                server.LOCAL.context_ids=[1,2]
                server.LOCAL.semantic_ids=[1]
                return "answer"
            with patch.object(server,"generate",side_effect=reply):
                self.assertEqual(server.process("query"),"")
            self.assertEqual(server.state()["semantic_links"],[{"query_id":2,"source_id":1}])
            self.assertEqual(len(server.state()["context_links"]),2)

if __name__ == "__main__":
    unittest.main()
