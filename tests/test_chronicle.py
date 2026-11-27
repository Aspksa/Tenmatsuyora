import copy
import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path
import chronicle as c

class ChronicleTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/"chronicles"
        shutil.copytree(c.ROOT,self.root)
        # Isolate tests from the future growing novel; no actual chapter is replaced.
        cat=c.load(self.root,"catalog.json");cat["chapters"]=[];self.write("catalog.json",cat)
        for p in self.root.glob("books/**/chapter-*.md"):p.unlink()
        for p in self.root.glob("events/*.json"):p.unlink()
        cp=c.load(self.root,"state/checkpoint.json");cp.update(last_chapter=None,next_chapter=1,last_tick=0,open_threads=[]);self.write("state/checkpoint.json",cp)
        self.write("style/EXAMPLES.json",{"schema":1,"examples":[]})
        enc=c.load(self.root,"encyclopedia.json");enc["entries"]=[e for e in enc["entries"] if e["visible_after"]==0];self.write("encyclopedia.json",enc)
        c.materialize(self.root,c.initial(self.root))
    def write(self,path,value):
        p=self.root/path;p.parent.mkdir(parents=True,exist_ok=True)
        p.write_text(json.dumps(value,ensure_ascii=False),encoding="utf-8")
    def fixture(self):
        cat=c.load(self.root,"catalog.json")
        body="\n\n".join(f"Тестовый абзац {i}: "+"слово "*32 for i in range(80)).strip()
        raw=("# Начало\n\n"+body+"\n").encode()
        p=self.root/"books/vol-001/chapter-000001.md";p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
        actor="char.tenmatsuyora";sid="scene.000001.001"
        ch={"number":1,"volume":"vol.001","title":"Начало","path":"books/vol-001/chapter-000001.md","events":"events/000001.json","sha256":hashlib.sha256(raw).hexdigest(),"body_chars":len(body),"summary":"Тестовый пересказ, не являющийся настоящей главой.","participants":[actor],"places":[],"themes":["тест"],"related_chapters":[],"scenes":[{"id":sid,"pov":actor,"participants":[actor],"place":None,"start_tick":1,"end_tick":2,"summary":"Тест"}],"review":{**{k:True for k in c.REVIEW},"notes":"fixture"}}
        paras=c.narrative.paragraphs(body)
        ch["scenes"][0].update(paragraphs=[1,len(paras)],goal="Тест",outcome="Тест",emotion_end="Тест",bridge="Тест",time_description="Тест",pending_actions=[],pending_dialogues=[])
        ch["continuity"]={"opening":paras[0],"closing":paras[-1],"previous_chapter":None,"next_transition":"Продолжение", "unresolved_actions":[],"unresolved_dialogues":[]}
        cat["chapters"]=[ch];self.write("catalog.json",cat)
        ev={"schema":1,"chapter":1,"events":[{"id":"event.000001.001","tick":1,"scene":sid,"type":"change_state","data":{"character":actor,"field":"health","before":"не установлено","after":"здорова"}}]}
        ev["events"][0].update(source={"paragraph":1,"start":0,"end":8,"quote":paras[0][:8]},actors=[actor],causes=[],threads=[])
        self.write(ch["events"],ev)
        cp=c.load(self.root,"state/checkpoint.json");cp.update(last_chapter=1,next_chapter=2,last_tick=2);self.write("state/checkpoint.json",cp)
        _,_,st=c.validate(self.root,check_snapshot=False);c.materialize(self.root,st)
        return cat,ev,cp
    def test_seed(self):
        cat,cp,st=c.validate(self.root);self.assertEqual(cp["next_chapter"],len(cat["chapters"])+1)
    def test_replay_and_reader(self):
        self.fixture();cat,cp,st=c.validate(self.root)
        self.assertEqual(st["characters"]["char.tenmatsuyora"]["state"]["health"],"здорова")
        self.assertEqual(c.public_chapter(1,self.root)["title"],"Начало")
        self.assertNotIn("summary",c.public_catalog(self.root)["chapters"][0])
        self.assertEqual(len(c.search("слово",self.root,public=True)),1)
    def test_indexed_retrieval_and_history(self):
        self.fixture()
        result=c.narrative.retrieve(self.root,"слова",entities=["char.tenmatsuyora"],event_ids=["event.000001.001"])
        self.assertEqual(result["ranked"][0]["number"],1)
        self.assertTrue(any("lexical" in x for x in result["ranked"][0]["reasons"]))
        self.assertEqual(c.state_at(0,self.root)["characters"]["char.tenmatsuyora"]["state"]["health"],"не установлено")
        self.assertEqual(c.state_at(1,self.root)["characters"]["char.tenmatsuyora"]["state"]["health"],"здорова")
        with self.assertRaises(ValueError):c.state_at(2,self.root)
        with self.assertRaises(ValueError):c.narrative.retrieve(self.root,entities=["../unsafe"])
    def test_stale_event(self):
        cat,ev,cp=self.fixture();ev["events"][0]["data"]["before"]="неверно";self.write("events/000001.json",ev)
        with self.assertRaises(ValueError):c.validate(self.root)
    def test_checkpoint_and_hash(self):
        cat,ev,cp=self.fixture();cp["next_chapter"]=3;self.write("state/checkpoint.json",cp)
        with self.assertRaises(ValueError):c.validate(self.root)
        cp["next_chapter"]=2;self.write("state/checkpoint.json",cp);cat["chapters"][0]["sha256"]="0"*64;self.write("catalog.json",cat)
        with self.assertRaises(ValueError):c.validate(self.root)
    def test_snapshot_and_spoiler_boundary(self):
        self.fixture()
        st=c.load(self.root,"state/current.json");st["last_tick"]=99;self.write("state/current.json",st)
        with self.assertRaises(ValueError):c.validate(self.root)
        _,_,st=c.validate(self.root,check_snapshot=False);c.materialize(self.root,st)
        enc=c.load(self.root,"encyclopedia.json");enc["entries"].append({"id":"entry.test","kind":"history","title":"Тайна","text":"Только после главы","visible_after":1});self.write("encyclopedia.json",enc)
        self.assertNotIn("entry.test",[e["id"] for e in c.public_encyclopedia(0,self.root)])
        self.assertIn("entry.test",[e["id"] for e in c.public_encyclopedia(1,self.root)])
        c.validate(self.root)
    def test_reader_settings(self):
        db=Path(self.temp.name)/"reader.sqlite"
        c.reader_settings(db,{"chapter":1,"position":4500,"font":24,"theme":"paper","bookmarks":[1]},1)
        self.assertEqual(c.reader_settings(db)["position"],4500)
        with self.assertRaises(ValueError):c.reader_settings(db,{"chapter":2},1)
    def test_directed_knowledge_and_transfer(self):
        st=c.initial(self.root);a="char.tenmatsuyora";b="char.other"
        other=copy.deepcopy(st["characters"][a]);other.update(id=b,name="Другой",aliases=[])
        scene={"id":"scene.test","participants":[a,b]}
        def event(t,d):c.event_apply(st,{"id":"event."+t,"tick":1,"type":t,"data":d},scene)
        event("create_character",{"record":other})
        v={"trust":20,"respect":50,"affection":0,"conflict":0,"bond":"знакомство","address":"вы","reason":"встреча","memories":[],"promises":[]}
        event("relationship",{"from":a,"to":b,"before":None,"after":v})
        self.assertNotIn(c.pair_key(b,a),st["relationships"])
        event("fact",{"record":{"id":"fact.secret","text":"Тайна","certainty":"established","category":"тайна","subjects":[a]}})
        with self.assertRaises(ValueError):event("knowledge",{"character":b,"fact":"fact.secret","before":None,"after":{"mode":"told","source":a,"note":"слух"}})
        event("knowledge",{"character":a,"fact":"fact.secret","before":None,"after":{"mode":"witnessed","source":None,"note":"видела"}})
        event("knowledge",{"character":b,"fact":"fact.secret","before":None,"after":{"mode":"told","source":a,"note":"сообщено"}})
        event("create_item",{"record":{"id":"item.test","name":"Кольцо","owner":None}})
        event("transfer_item",{"item":"item.test","from":None,"to":a})
        with self.assertRaises(ValueError):event("transfer_item",{"item":"item.test","from":None,"to":b})
        event("transfer_item",{"item":"item.test","from":a,"to":b})
        self.assertEqual(st["items"]["item.test"]["owner"],b)
