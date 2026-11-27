"""Narrative Intelligence 13: verified dialogue, causality and retrieval.
Derived JSON is disposable; the published text + event journal are authoritative.
"""
import copy
import hashlib
import json
import re
from collections import defaultdict, Counter, deque
from pathlib import Path

EXTRA = {"speech","encounter","commitment_open","commitment_update","secret_open","secret_update","recall","decision","consequence"}
HEARING = {"told","overheard","partial","misunderstood","lied_to"}
REL_FIELDS = ("public","private","unsaid","grievances","expectations")
SCENE_FIELDS = ("goal","outcome","emotion_end","bridge","time_description")
BOUNDARY_FIELDS = ("opening","closing","next_transition","unresolved_actions","unresolved_dialogues")

def require(ok,msg):
    if not ok: raise ValueError("Narrative: "+msg)

def words(text):
    return re.findall(r"[^\W_]+",text.casefold().replace("ё","е"),flags=re.UNICODE)

def stems(word):
    # Conservative heuristic for Russian inflection, not a morphological model.
    result={word}
    if re.fullmatch(r"[а-я]+",word):
        for suffix in ("иями","ами","ями","ого","ему","ому","ыми","ими","ая","яя","ое","ее","ий","ый","ой","ов","ев","ам","ям","ах","ях","ом","ем","ую","юю","ы","и","а","я","у","ю","е","о"):
            if word.endswith(suffix) and len(word)-len(suffix)>=4:result.add(word[:-len(suffix)])
    return result

def paragraphs(body):
    return re.split(r"\n\s*\n",body.strip())

def anchor(source,paras,lo,hi):
    require(isinstance(source,dict),"missing exact text anchor")
    p,a,b=(source.get(k) for k in ("paragraph","start","end"))
    require(type(p) is int and lo<=p<=hi and 1<=p<=len(paras),"paragraph outside scene")
    text=paras[p-1]
    require(type(a) is int and type(b) is int and 0<=a<b<=len(text),"invalid text offsets")
    require(source.get("quote")==text[a:b] and text[a:b].strip(),"quote does not match chapter")
    return copy.deepcopy(source)

def text_fields(d,fields,empty=False):
    for k in fields:
        require(isinstance(d.get(k),str) and (empty or d[k].strip()),"missing "+k)

def list_field(d,k):
    v=d.get(k)
    require(isinstance(v,list),"list required: "+k)
    return v

def refs(d,k,allowed,empty=True):
    v=list_field(d,k)
    require(all(isinstance(x,str) and x in allowed for x in v) and len(v)==len(set(v)) and (empty or v),"invalid refs: "+k)
    return v

def pair(a,b):
    return "|".join(sorted((a,b)))

def ref_event(row):
    return {k:row[k] for k in ("id","chapter","scene","tick","source","type")}

class Replay:
    def __init__(self):
        self.events={}
        self.speeches={}
        self.commitments={}
        self.secrets={}
        self.pairs=defaultdict(lambda:{"encounters":[],"dialogues":[],"relationship_changes":[],"commitments":[],"secrets":[]})
        self.hero=defaultdict(lambda:{"scenes":[],"events":[],"spoken":[],"heard":[],"knowledge_history":[],"relationships":[],"commitments":[],"secrets":[]})
        self.threads=defaultdict(list)
        self.scenes={}
        self.chapters={}
        self.causal=defaultdict(list)
        self.repeated=[]
        self.paragraph_hashes={}
        self.volume_chapters=defaultdict(list)
        self.topic=defaultdict(set)

    def apply(self,e,scene,ch,paras,st):
        eid=e["id"];d=e["data"];t=e["type"]
        people=set(scene["participants"]);known=set(st["characters"])
        src=anchor(e.get("source"),paras,*scene["paragraphs"])
        causes=refs(e,"causes",self.events)
        require(eid not in self.events,"duplicate event")
        row={"id":eid,"chapter":ch["number"],"scene":scene["id"],"tick":e["tick"],"type":t,"source":src,"causes":causes,"data":copy.deepcopy(d)}
        for cause in causes:self.causal[cause].append(eid)
        for tid in refs(e,"threads",st["threads"]):self.threads[tid].append(eid)
        # Character references are explicit, not inferred from arbitrary prose.
        involved=refs(e,"actors",known|people)
        if t=="speech":
            speaker=d.get("speaker")
            require(speaker in known and speaker in people and speaker in involved,"speaker absent")
            addressees=refs(d,"to",known&people)
            require(speaker not in addressees and set(addressees)<=set(involved),"invalid addressee")
            text_fields(d,("text","emotion","intent","subtext","reaction","setting"),empty=True)
            require(d["text"]==src["quote"] and d["emotion"].strip() and d["intent"].strip(),"speech is not the exact quote")
            require(d["setting"] in ("public","private","inner"),"invalid speech setting")
            hearing=list_field(d,"heard");listeners=set()
            for h in hearing:
                who=h.get("character")
                require(who in known and who in people and who!=speaker and who not in listeners and who in involved,"invalid listener")
                listeners.add(who)
                require(h.get("mode") in ("full","partial","overheard"),"invalid hearing mode")
                text_fields(h,("fragment","interpretation"))
                require(h["fragment"] in d["text"] and (h["mode"]!="full" or h["fragment"]==d["text"]),"heard fragment not in speech")
                self.hero[who]["heard"].append(eid)
                self.pairs[pair(speaker,who)]["dialogues"].append(eid)
            if d["setting"]=="inner":require(not addressees and not hearing,"inner thoughts cannot be heard")
            for who in set(addressees)-listeners:self.pairs[pair(speaker,who)]["dialogues"].append(eid)
            claims=list_field(d,"claims");claim_ids=set()
            for claim in claims:
                fact=claim.get("fact")
                require(fact in st["facts"] and fact not in claim_ids and claim.get("stance") in ("asserted","lie","uncertain","denied"),"invalid speech claim")
                claim_ids.add(fact)
                text_fields(claim,("fragment",))
                require(claim["fragment"] in d["text"],"claim absent from speech")
            reply=d.get("reply_to")
            if reply is not None:
                require(reply in self.speeches,"reply points forward or missing")
                prev=self.speeches[reply]["data"]
                require(speaker in set(prev["to"])|{h["character"] for h in prev["heard"]},"reply speaker was not addressed/heard")
            refs(d,"recalls",self.events)
            self.speeches[eid]=row
            self.hero[speaker]["spoken"].append(eid)
        elif t=="knowledge":
            who,fact=d["character"],d["fact"];v=d["after"];mode=v["mode"]
            require(who in involved,"missing knowledge actor")
            if mode in HEARING:
                speech=d.get("speech")
                require(speech in self.speeches and speech in causes,"knowledge requires earlier speech cause")
                said=self.speeches[speech];sd=said["data"]
                require(v.get("source")==sd["speaker"],"wrong information source")
                listeners=[h for h in sd["heard"] if h["character"]==who]
                require(bool(listeners),"character did not hear speech")
                listener=listeners[0]
                claim=next((x for x in sd["claims"] if x["fact"]==fact),None)
                require(claim is not None,"fact not mentioned")
                fragment_heard=claim["fragment"] in listener["fragment"]
                if mode=="told":
                    require(listener["mode"]=="full" and claim["stance"]=="asserted" and fragment_heard,"told requires actual full assertion")
                elif mode=="overheard":require(listener["mode"]=="overheard" and fragment_heard and claim["stance"]=="asserted","overheard fact not audible")
                elif mode=="partial":require(listener["mode"]=="partial","not partial hearing")
                elif mode=="lied_to":require(claim["stance"]=="lie" and fragment_heard,"not an audible lie")
                elif mode=="misunderstood":require(bool(listener["interpretation"].strip()),"missing interpretation")
                # A hearer's belief is separate from objective truth.
                text_fields(v,("perception",))
            self.hero[who]["knowledge_history"].append(eid)
        elif t=="relationship":
            a,b=d["from"],d["to"]
            require(a in involved and b in involved,"missing relationship actors")
            text_fields(d["after"],REL_FIELDS,empty=True)
            require(bool(causes),"relationship change needs a cause")
            k=pair(a,b);self.pairs[k]["relationship_changes"].append(eid)
            for x in (a,b):self.hero[x]["relationships"].append(eid)
        elif t=="encounter":
            members=refs(d,"characters",known&people,empty=False)
            require(len(members)>=2 and set(members)<=set(involved),"encounter actors")
            text_fields(d,("impression","context"))
            for i,a in enumerate(members):
                for b in members[i+1:]:self.pairs[pair(a,b)]["encounters"].append(eid)
        elif t=="commitment_open":
            cid=d.get("id")
            require(isinstance(cid,str) and re.fullmatch(r"commitment\.[a-z0-9.-]+",cid) and cid not in self.commitments,"commitment ID")
            a,b=d.get("from"),d.get("to")
            require(a in known and b in known and a!=b and {a,b}<=set(involved),"commitment parties")
            text_fields(d,("kind","text","condition"))
            require(d["kind"] in ("promise","oath","debt","duty","conflict","question"),"commitment kind")
            due=d.get("due_tick")
            require(due is None or type(due) is int and due>=e["tick"],"commitment due")
            speech=d.get("speech")
            if speech is not None:
                require(speech in self.speeches and speech in causes and self.speeches[speech]["data"]["speaker"]==a,"wrong commitment speech")
                require(b in self.speeches[speech]["data"]["to"],"promise recipient not addressed")
            self.commitments[cid]={**copy.deepcopy(d),"status":"open","history":[eid]}
            self.pairs[pair(a,b)]["commitments"].append(cid)
            for x in (a,b):self.hero[x]["commitments"].append(cid)
        elif t=="commitment_update":
            cid=d.get("id");require(cid in self.commitments,"unknown commitment")
            v=self.commitments[cid];require(v["status"]==d.get("before")=="open","stale/closed commitment")
            require(d.get("after") in ("fulfilled","broken","released","resolved"),"invalid commitment outcome")
            require({v["from"],v["to"]}<=set(involved),"missing commitment parties")
            text_fields(d,("reason",));require(bool(causes),"commitment outcome needs cause")
            v["status"]=d["after"];v["history"].append(eid)
        elif t=="secret_open":
            sid=d.get("id");fact=d.get("fact")
            require(isinstance(sid,str) and re.fullmatch(r"secret\.[a-z0-9.-]+",sid) and sid not in self.secrets and fact in st["facts"],"invalid secret")
            keepers=refs(d,"keepers",known,empty=False)
            require(all(st["knowledge"].get(k+"->"+fact,{}).get("mode") not in (None,"forgotten") for k in keepers),"keeper does not know secret")
            text_fields(d,("stakes",))
            self.secrets[sid]={**copy.deepcopy(d),"status":"restricted","history":[eid]}
            for i,a in enumerate(keepers):
                self.hero[a]["secrets"].append(sid)
                for b in keepers[i+1:]:self.pairs[pair(a,b)]["secrets"].append(sid)
        elif t=="secret_update":
            sid=d.get("id");require(sid in self.secrets,"unknown secret")
            v=self.secrets[sid];require(v["status"]==d.get("before")=="restricted" and d.get("after") in ("revealed","restricted"),"stale secret")
            keepers=refs(d,"keepers",known,empty=False)
            require(all(st["knowledge"].get(k+"->"+v["fact"],{}).get("mode") not in (None,"forgotten") for k in keepers),"keeper does not know secret")
            text_fields(d,("reason",));require(bool(causes),"secret update needs cause")
            v["status"]=d["after"];v["keepers"]=keepers;v["history"].append(eid)
            for i,a in enumerate(keepers):
                if sid not in self.hero[a]["secrets"]:self.hero[a]["secrets"].append(sid)
                for b in keepers[i+1:]:
                    arr=self.pairs[pair(a,b)]["secrets"]
                    if sid not in arr:arr.append(sid)
        elif t=="recall":
            who=d.get("character");past=d.get("event")
            require(who in known and who in involved and past in self.events and past in causes,"invalid recall")
            require(d.get("remembered_tick")==self.events[past]["tick"],"wrong remembered time")
            text_fields(d,("interpretation","mode"));require(d["mode"] in ("experienced","told","inferred","mistaken"),"recall mode")
            if d["mode"]=="experienced":require(who in self.hero and past in self.hero[who]["events"],"hero did not experience recalled event")
        elif t in ("decision","consequence"):
            text_fields(d,("description","motivation","impact"))
            require(bool(involved),"missing decision actors")
            if t=="consequence":require(bool(causes),"consequence needs prior cause")
        if t=="open_thread":self.threads[d["record"]["id"]].append(eid)
        if t=="close_thread":self.threads[d["thread"]].append(eid)
        for x in involved:self.hero[x]["events"].append(eid)
        self.events[eid]=row

    def scene_start(self,scene,number,paras,expected):
        limits=scene.get("paragraphs")
        require(isinstance(limits,list) and len(limits)==2 and all(type(x) is int for x in limits) and expected==limits[0]<=limits[1]<=len(paras),"scene paragraph coverage")
        text_fields(scene,SCENE_FIELDS)
        for k in ("pending_actions","pending_dialogues"):
            require(all(isinstance(x,str) and x.strip() for x in list_field(scene,k)),"invalid scene pending")
        row={**copy.deepcopy(scene),"chapter":number,"events":[]}
        self.scenes[scene["id"]]=row
        for cid in scene["participants"]:self.hero[cid]["scenes"].append(scene["id"])
        return limits[1]+1

    def chapter_end(self,ch,paras,st):
        n=ch["number"];continuity=ch.get("continuity")
        require(isinstance(continuity,dict),"missing chapter continuity")
        text_fields(continuity,("opening","closing","next_transition"))
        for k in ("unresolved_actions","unresolved_dialogues"):
            require(all(isinstance(x,str) and x.strip() for x in list_field(continuity,k)),"invalid continuity list")
        require(continuity["opening"]==paras[0] and continuity["closing"]==paras[-1],"chapter boundary quote mismatch")
        if n>1:
            require(continuity.get("previous_chapter")==n-1,"broken previous chapter link")
            text_fields(continuity,("transition_from_previous",))
        else:require(continuity.get("previous_chapter") is None,"first chapter previous")
        for p in paras:
            if len(p.strip())<120:continue
            h=hashlib.sha256(" ".join(words(p)).encode()).hexdigest()
            if h in self.paragraph_hashes and self.paragraph_hashes[h]!=n:
                self.repeated.append({"chapter":n,"previous":self.paragraph_hashes[h],"paragraph_hash":h})
            self.paragraph_hashes.setdefault(h,n)
        for v in [*ch["participants"],*ch["places"],*ch["themes"]]:self.topic[v].add(n)
        self.volume_chapters[ch["volume"]].append(n)
        active={cid:copy.deepcopy(st["characters"][cid]["state"]) for cid in ch["participants"]}
        # Chapter-end snapshot, compact: world changes are recoverable from the immutable journal.
        self.chapters[n]={"number":n,"title":ch["title"],"path":ch["path"],"events_path":ch["events"],"sha256":ch["sha256"],"summary":ch["summary"],"continuity":copy.deepcopy(continuity),"scenes":[s["id"] for s in ch["scenes"]],"participants":ch["participants"],"places":ch["places"],"themes":ch["themes"],"related_chapters":ch["related_chapters"],"snapshot":{"last_tick":ch["scenes"][-1]["end_tick"],"characters":active,"open_threads":sorted(k for k,v in st["threads"].items() if v["status"]=="open"),"open_commitments":sorted(k for k,v in self.commitments.items() if v["status"]=="open")}}

    def documents(self,cat,cp,st):
        docs={}
        def add(path,data):docs[path]=data
        for sid,s in self.scenes.items():add("scenes/"+sid+".json",s)
        for n,ch in self.chapters.items():
            events=[e for e in self.events.values() if e["chapter"]==n]
            add(f"chapters/{n:06d}.json",{**ch,"events":events,"dialogues":[x["id"] for x in events if x["type"]=="speech"]})
        for cid in st["characters"]:
            h=self.hero[cid];known=[{"fact":k.split("->",1)[1],"value":v} for k,v in st["knowledge"].items() if k.startswith(cid+"->")]
            relevant=[self.events[x] for x in h["events"][-12:]]
            add("characters/"+cid+".json",{**h,"profile_path":"state/characters/"+cid+".json","known":known,"recent_events":[ref_event(e) for e in relevant],"latest_spoken":h["spoken"][-1] if h["spoken"] else None,"latest_heard":h["heard"][-1] if h["heard"] else None,"chapters":sorted({self.scenes[s]["chapter"] for s in h["scenes"]}|{self.events[e]["chapter"] for e in h["events"]})})
        pair_index={}
        for key,p in self.pairs.items():
            a,b=key.split("|");enc=p["encounters"];dialogs=p["dialogues"]
            filename=a+"--"+b+".json";pair_index[key]="pairs/"+filename
            event_ids=sorted(set(enc+dialogs+p["relationship_changes"]),key=lambda k:(self.events[k]["chapter"],self.events[k]["tick"],k))
            add("pairs/"+filename,{**p,"characters":[a,b],"first_meeting":enc[0] if enc else None,"last_meeting":enc[-1] if enc else None,"last_dialogue":dialogs[-1] if dialogs else None,"current":{k:st["relationships"].get(k) for k in (a+"->"+b,b+"->"+a)},"chapters":sorted({self.events[x]["chapter"] for x in event_ids}),"recent":[ref_event(self.events[x]) for x in event_ids[-12:]]})
        for tid,t in st["threads"].items():
            history=self.threads[tid]
            add("threads/"+tid+".json",{"thread":t,"events":history,"chapters":sorted({self.events[x]["chapter"] for x in history})})
        for cid,v in self.commitments.items():add("commitments/"+cid+".json",v)
        for sid,v in self.secrets.items():
            # Derived actual knowers are distinct from intended keepers.
            knowers={k.split("->",1)[0]:x for k,x in st["knowledge"].items() if k.endswith("->"+v["fact"]) and x["mode"]!="forgotten"}
            add("secrets/"+sid+".json",{**v,"known_or_believed_by":knowers})
        for volume,ns in self.volume_chapters.items():add("volumes/"+volume+".json",{"chapters":ns,"summaries":[{"number":n,"summary":self.chapters[n]["summary"]} for n in ns]})
        event_index={k:{"chapter":e["chapter"],"scene":e["scene"],"type":e["type"],"causes":e["causes"],"effects":self.causal[k]} for k,e in self.events.items()}
        aliases={cid:[c["name"],*c["aliases"],*c["titles"]] for cid,c in st["characters"].items()}
        add("index.json",{"schema":1,"last_chapter":cp["last_chapter"],"events":event_index,"pairs":pair_index,"characters":aliases,"topics":{k:sorted(v) for k,v in self.topic.items()},"threads":sorted(st["threads"]),"commitments":sorted(self.commitments),"secrets":sorted(self.secrets)})
        recent=list(self.chapters.values())[-3:]
        active_ids=sorted({x for ch in recent for x in ch["participants"]})
        open_commitments=[k for k,v in self.commitments.items() if v["status"]=="open"]
        required=sorted({ch["number"] for ch in recent}|{n for ch in recent for n in ch["related_chapters"]}|{self.events[e]["chapter"] for t in cp["open_threads"] for e in self.threads[t][-2:]}|{self.events[self.commitments[k]["history"][0]]["chapter"] for k in open_commitments})
        add("handover/latest.json",{"schema":1,"last_chapter":cp["last_chapter"],"next_chapter":cp["next_chapter"],"last_tick":cp["last_tick"],"summary":cp["summary"],"next_scene":cp["next_scene"],"recent_chapters":[{"number":ch["number"],"path":ch["path"],"continuity":ch["continuity"],"summary":ch["summary"]} for ch in recent],"active_characters":active_ids,"open_threads":cp["open_threads"],"open_commitments":open_commitments,"overdue_commitments":[k for k in open_commitments if self.commitments[k]["due_tick"] is not None and self.commitments[k]["due_tick"]<cp["last_tick"]],"required_chapters":required,"recent_dialogues":[ref_event(e) for e in list(self.speeches.values())[-12:]],"repeat_warnings":self.repeated,"read_first":["START_HERE.md","AGENTS.md","style/STYLE.md","style/VOICES.md","state/checkpoint.json","narrative/index.json"]})
        return docs

def build(root,cat,cp,base):
    """Replay only the declared sources; no AI or fabricated facts."""
    r=Replay();st=base.initial(root)
    for ch in cat["chapters"]:
        _,body=base.chapter_text(root,ch);paras=paragraphs(body)
        events=base.load(root,ch["events"])["events"];cursor=0;expected=1
        for scene in ch["scenes"]:
            expected=r.scene_start(scene,ch["number"],paras,expected)
            while cursor<len(events) and events[cursor]["scene"]==scene["id"]:
                e=events[cursor];r.apply(e,scene,ch,paras,st)
                base.event_apply(st,e,scene)
                r.scenes[scene["id"]]["events"].append(e["id"])
                cursor+=1
        require(expected==len(paras)+1,"scene ranges do not cover whole chapter")
        require(cursor==len(events),"unassigned event")
        r.chapter_end(ch,paras,st)
    for ex in base.load(root,"style/EXAMPLES.json")["examples"]:
        ch=cat["chapters"][ex["chapter"]-1];scene=r.scenes[ex["scene"]]
        _,body=base.chapter_text(root,ch)
        anchor(ex.get("source"),paragraphs(body),*scene["paragraphs"])
    docs=r.documents(cat,cp,st)
    # Digest both prose-independent rules and all generated documents; chapter hashes
    # are included in catalog, while event bytes are verified here independently.
    inputs=["catalog.json","canon/foundation.json","state/checkpoint.json","style/STYLE.md","style/VOICES.md","style/EXAMPLES.json","plan/PLOT.md","plan/UNKNOWN.md","START_HERE.md","AGENTS.md"]
    inputs += [ch["events"] for ch in cat["chapters"]]
    docs["manifest.json"]={"schema":1,"last_chapter":cp["last_chapter"],"inputs":{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in inputs},"documents":{p:hashlib.sha256(encode(v)).hexdigest() for p,v in docs.items()}}
    return docs

def encode(v):
    return (json.dumps(v,ensure_ascii=False,indent=2,sort_keys=True)+"\n").encode("utf-8")

def materialize(root,docs):
    folder=root/"narrative"
    folder.mkdir(exist_ok=True)
    for path,v in docs.items():
        p=folder/path;p.parent.mkdir(parents=True,exist_ok=True)
        p.write_bytes(encode(v))
    for p in folder.rglob("*.json"):
        if p.relative_to(folder).as_posix() not in docs:p.unlink()

def verify(root,docs):
    folder=root/"narrative"
    actual={p.relative_to(folder).as_posix() for p in folder.rglob("*.json")}
    require(actual==set(docs),"generated narrative file set stale; run stamp")
    for path,v in docs.items():require((folder/path).read_bytes()==encode(v),"stale narrative file: "+path)

def retrieve(root,query="",characters=(),thread=None,limit=20):
    """Bounded lexical + exact entity + causal expansion, with explicit sources."""
    folder=root/"narrative"
    def get(path):return json.loads((folder/path).read_text(encoding="utf-8"))
    index=get("index.json");handover=get("handover/latest.json")
    scores=Counter();reasons=defaultdict(set);seeds=set()
    def score(n,value,reason):scores[n]+=value;reasons[n].add(reason)
    q=words(query);qstems=[stems(x) for x in q]
    resolved=set(characters)
    for cid,names in index["characters"].items():
        if any(set(words(name)) and all(any(stems(w)&t for t in qstems) for w in words(name)) for name in names):resolved.add(cid)
    require(resolved<=set(index["characters"]),"unknown requested character")
    for cid in resolved:
        h=get("characters/"+cid+".json")
        for n in h["chapters"]:score(n,3,"character "+cid)
        for e in h["spoken"][-2:]+h["heard"][-2:]:seeds.add(e)
    pair_docs=[]
    for key,path in index["pairs"].items():
        if set(key.split("|"))<=resolved:
            p=get(path);pair_docs.append(p)
            for n in p["chapters"]:score(n,6,"pair "+key)
            for e in (p["first_meeting"],p["last_meeting"],p["last_dialogue"]):
                if e:seeds.add(e)
            for cid in p["commitments"]:
                v=get("commitments/"+cid+".json")
                if v["status"]=="open":seeds.add(v["history"][0])
    if thread:
        require(thread in index["threads"],"unknown requested thread")
        t=get("threads/"+thread+".json")
        for n in t["chapters"]:score(n,8,"thread "+thread)
        seeds.update(t["events"][-4:])
    cat=json.loads((root/"catalog.json").read_text(encoding="utf-8"))
    for ch in cat["chapters"]:
        n=ch["number"]
        if q:
            text=(root/ch["path"]).read_text(encoding="utf-8")
            vocab=set().union(*(stems(w) for w in words(text+" "+ch["summary"]+" "+" ".join(ch["themes"]))))
            hits=sum(bool(vocab&t) for t in qstems)
            if hits:score(n,2*hits,"lexical "+str(hits)+"/"+str(len(q)))
        if n in handover["required_chapters"]:score(n,2,"handover")
    visited=set();queue=deque((s,0) for s in sorted(seeds))
    while queue and len(visited)<150:
        eid,depth=queue.popleft()
        if eid in visited or eid not in index["events"]:continue
        visited.add(eid);e=index["events"][eid];score(e["chapter"],max(1,8-depth*2),"event "+eid)
        if depth<2:queue.extend((x,depth+1) for x in e["causes"]+e["effects"])
    ranked=sorted(scores,key=lambda n:(-scores[n],-n))[:max(1,min(100,limit))]
    # Last dialogue/meeting/open obligation sources are mandatory, not silently displaced by lexical hits.
    mandatory=sorted({index["events"][e]["chapter"] for e in seeds if e in index["events"]}|set(handover["required_chapters"]))
    selected=list(dict.fromkeys(mandatory+ranked))
    return {"characters":sorted(resolved),"pairs":pair_docs,"mandatory_chapters":mandatory,"ranked":[{"number":n,"path":cat["chapters"][n-1]["path"],"score":scores[n],"reasons":sorted(reasons[n])} for n in selected],"events":[{"id":e,**index["events"][e]} for e in sorted(visited)],"coverage":{"requested_characters":len(characters),"resolved_characters":len(resolved),"mandatory_count":len(mandatory),"graph_truncated":bool(queue),"lexical_is_heuristic":True},"handover":handover}
