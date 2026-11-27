import copy
import unittest
import chronicle as c
import narrative as n

class NarrativeTest(unittest.TestCase):
    def setUp(self):
        self.st=c.initial(c.ROOT)
        self.a="char.tenmatsuyora";self.b="char.other"
        other=copy.deepcopy(self.st["characters"][self.a]);other.update(id=self.b,name="Другой",aliases=[],titles=[])
        self.st["characters"][self.b]=other
        self.scene={"id":"scene.test","participants":[self.a,self.b],"paragraphs":[1,1]}
        self.ch={"number":1}
        self.paras=["Я обещаю вернуться."]
        self.r=n.Replay()
        self.st["facts"]["fact.promise"]={"id":"fact.promise","certainty":"established","text":"обещание","subjects":[self.a]}
        self.st["knowledge"][self.a+"->fact.promise"]={"mode":"witnessed"}
    def event(self,eid,t,data,actors=None,causes=None):
        return {"id":eid,"type":t,"scene":"scene.test","tick":1,"data":data,"source":{"paragraph":1,"start":0,"end":len(self.paras[0]),"quote":self.paras[0]},"actors":actors or [self.a,self.b],"causes":causes or [],"threads":[]}
    def apply(self,e):
        self.r.apply(e,self.scene,self.ch,self.paras,self.st)
        c.event_apply(self.st,e,self.scene)
    def speech(self,mode="full",stance="asserted"):
        return self.event("event.speech","speech",{"speaker":self.a,"to":[self.b],"text":self.paras[0],"emotion":"спокойствие","intent":"обещание","subtext":"","reaction":"","setting":"private","reply_to":None,"recalls":[],"heard":[{"character":self.b,"mode":mode,"fragment":self.paras[0] if mode=="full" else "обещаю","interpretation":"обещание"}],"claims":[{"fact":"fact.promise","stance":stance,"fragment":"обещаю"}]})
    def test_exact_quote(self):
        e=self.speech();e["source"]["quote"]="не тот текст"
        with self.assertRaises(ValueError):self.apply(e)
    def test_hearing_and_causality(self):
        self.apply(self.speech())
        e=self.event("event.know","knowledge",{"character":self.b,"fact":"fact.promise","before":None,"after":{"mode":"told","source":self.a,"note":"услышано","perception":"обещание"},"speech":"event.speech"},causes=["event.speech"])
        self.apply(e)
        self.assertEqual(self.r.causal["event.speech"],["event.know"])
        self.assertEqual(self.r.pairs[n.pair(self.a,self.b)]["dialogues"],["event.speech"])
        e=self.event("event.future","note",{"text":"x"},causes=["event.missing"])
        with self.assertRaises(ValueError):self.apply(e)
    def test_partial_not_full(self):
        self.apply(self.speech("partial"))
        e=self.event("event.know","knowledge",{"character":self.b,"fact":"fact.promise","before":None,"after":{"mode":"told","source":self.a,"note":"услышано","perception":"обещание"},"speech":"event.speech"},causes=["event.speech"])
        with self.assertRaises(ValueError):self.apply(e)
    def test_commitment(self):
        self.apply(self.speech())
        self.apply(self.event("event.open","commitment_open",{"id":"commitment.001","from":self.a,"to":self.b,"kind":"promise","text":"вернуться","condition":"после похода","due_tick":10,"speech":"event.speech"},causes=["event.speech"]))
        self.apply(self.event("event.close","commitment_update",{"id":"commitment.001","before":"open","after":"fulfilled","reason":"вернулась"},causes=["event.open"]))
        self.assertEqual(self.r.commitments["commitment.001"]["status"],"fulfilled")
        with self.assertRaises(ValueError):self.apply(self.event("event.closeagain","commitment_update",{"id":"commitment.001","before":"open","after":"broken","reason":"x"},causes=["event.open"]))
    def test_stemming(self):
        self.assertTrue(n.stems("императрица")&n.stems("императрицы"))
    def test_seed_retrieval(self):
        result=n.retrieve(c.ROOT,characters=[self.a])
        self.assertIn(self.a,result["characters"])
        with self.assertRaises(ValueError):n.retrieve(c.ROOT,characters=["char.invalid"])
