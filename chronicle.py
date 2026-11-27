"""Eternal Chronicle: deterministic replay, validation and local reading."""
from pathlib import Path
import copy
import hashlib
import json
import re
import sqlite3

ROOT = Path(__file__).resolve().parent / "chronicles"
REVIEW = ("canon","voices","knowledge","relationships","timeline","style","repetition")
ID = re.compile(r"[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$")
FIELDS = {"location","health","emotion","alive","items","goals"}
VOICE = {"register","anger","tenderness","address","humor","public","private","avoid","examples"}
PROFILE = {"id","name","aliases","titles","age","appearance","origin","family","biography","temperament","habits","fears","desires","beliefs","abilities","limitations","voice","state"}

def require(ok, message):
    if not ok:
        raise ValueError(message)

def load(root, path):
    return json.loads((root / path).read_text(encoding="utf-8"))

def safe_file(root, path):
    require(isinstance(path,str) and not Path(path).is_absolute() and ".." not in Path(path).parts and "\\" not in path, "Unsafe path")
    p=(root/path).resolve()
    require(p.is_relative_to(root.resolve()) and p.is_file(), f"Missing/unsafe file: {path}")
    return p

def valid_id(value):
    return isinstance(value,str) and bool(ID.fullmatch(value))

def record_index(rows, name):
    require(isinstance(rows,list), f"{name}: list required")
    result={}
    for row in rows:
        require(isinstance(row,dict) and valid_id(row.get("id")), f"{name}: invalid id")
        require(row["id"] not in result, f"{name}: duplicate id {row['id']}")
        result[row["id"]]=copy.deepcopy(row)
    return result

def character_ok(c):
    require(PROFILE <= c.keys() and isinstance(c["voice"],dict) and VOICE <= c["voice"].keys(), "Incomplete character profile")
    require(isinstance(c["state"],dict) and FIELDS <= c["state"].keys(), "Incomplete character state")
    require(isinstance(c["name"],str) and c["name"].strip() and isinstance(c["aliases"],list), "Invalid character names")
    require(type(c["state"]["alive"]) is bool and isinstance(c["state"]["items"],list) and isinstance(c["state"]["goals"],list), "Invalid character state")

def names_ok(characters):
    seen={}
    for c in characters.values():
        character_ok(c)
        for name in [c["name"]]+c["aliases"]:
            require(isinstance(name,str) and name.strip(), "Invalid name")
            key=name.strip().casefold()
            require(key not in seen or seen[key]==c["id"], f"Duplicate name: {name}")
            seen[key]=c["id"]

def initial(root):
    base=load(root,"canon/foundation.json")
    state={k:record_index(base[k],k) for k in ("characters","places","items","facts","threads")}
    require(not base["relationships"] and not base["knowledge"],"Initial relationship/knowledge must use events")
    state.update(relationships={},knowledge={},sources={},last_tick=0,world=base["world"])
    names_ok(state["characters"])
    return state

def pair_key(a,b):
    return a+"->"+b

def event_apply(st,e,scene):
    d=e["data"]; t=e["type"]; src={"event":e["id"],"scene":scene["id"],"tick":e["tick"]}
    chars=st["characters"]; places=st["places"]; items=st["items"]; facts=st["facts"]
    def char(cid):
        require(cid in chars, f"Unknown character {cid}")
        return chars[cid]
    def add(kind,record):
        require(isinstance(record,dict) and valid_id(record.get("id")), "Invalid record")
        key=record["id"]; require(not any(key in st[k] for k in ("characters","places","items","facts","threads")),f"Duplicate record {key}")
        st[kind][key]=copy.deepcopy(record);st["sources"][key]=src
    if t=="create_character":
        character_ok(d["record"]);require(not d["record"]["state"]["items"],"New character must acquire items through transfers")
        require(d["record"]["state"]["location"] is None or d["record"]["state"]["location"] in places,"Unknown initial location")
        add("characters",d["record"]);names_ok(chars)
    elif t in ("create_place","create_item"):
        k="places" if t=="create_place" else "items"
        require(isinstance(d["record"].get("name"),str) and d["record"]["name"].strip(),"Missing name")
        if k=="items": require(d["record"].get("owner") is None,"Create item unowned, then transfer")
        add(k,d["record"])
    elif t in ("change_state","change_profile"):
        c=char(d["character"]); field=d["field"]; container=c["state"] if t=="change_state" else c
        require(field in (FIELDS-{"items"} if t=="change_state" else PROFILE-{"id","name","state"}) and field in container,"Invalid change field")
        require(container[field]==d["before"],f"Stale previous value: {c['id']} {field}")
        after=d["after"]
        if field=="location": require(after is None or after in places,"Unknown location")
        if field=="alive": require(type(after) is bool,"Invalid alive")
        if field=="goals": require(isinstance(after,list),"Invalid goals")
        container[field]=copy.deepcopy(after);names_ok(chars)
        st["sources"][c["id"]+"."+field]=src
    elif t=="relationship":
        a,b=d["from"],d["to"];char(a);char(b);require(a!=b,"Self relationship")
        key=pair_key(a,b); old=st["relationships"].get(key)
        require(old==d["before"],"Stale directed relationship")
        v=d["after"];require(isinstance(v,dict),"Invalid relationship")
        for field in ("trust","respect","affection","conflict"):
            require(type(v.get(field)) is int and 0<=v[field]<=100,"Invalid relationship score")
        for field in ("bond","address","reason"):
            require(isinstance(v.get(field),str) and v[field].strip(),"Missing relationship detail")
        for field in ("memories","promises"): require(isinstance(v.get(field),list),"Missing relationship list")
        st["relationships"][key]=copy.deepcopy(v);st["sources"][key]=src
    elif t=="fact":
        r=d["record"];require(r.get("certainty") in ("established","rumor","belief") and isinstance(r.get("text"),str) and r["text"].strip() and isinstance(r.get("category"),str),"Invalid fact")
        require(isinstance(r.get("subjects"),list) and all(x in chars or x in places or x in items for x in r["subjects"]),"Unknown fact subject")
        add("facts",r)
    elif t=="knowledge":
        who,fact=d["character"],d["fact"];char(who);require(fact in facts,"Unknown fact")
        key=pair_key(who,fact); require(st["knowledge"].get(key)==d["before"],"Stale knowledge")
        v=d["after"];require(isinstance(v,dict) and v.get("mode") in ("witnessed","told","inferred","mistaken","forgotten") and isinstance(v.get("note"),str),"Invalid knowledge")
        source=v.get("source")
        if source is not None: char(source)
        if v["mode"]=="witnessed": require(who in scene["participants"],"Absent witness")
        if v["mode"]=="told":
            require(source is not None and source!=who and st["knowledge"].get(pair_key(source,fact),{}).get("mode") in ("witnessed","told","inferred","mistaken"),"Teller does not know fact")
            require(source in scene["participants"] and who in scene["participants"],"Telling participants absent")
        st["knowledge"][key]=copy.deepcopy(v);st["sources"][key]=src
    elif t=="open_thread":
        r=d["record"];require(r.get("status")=="open" and all(isinstance(r.get(k),str) and r[k].strip() for k in ("title","question","stakes")),"Invalid thread")
        require(isinstance(r.get("participants"),list) and all(x in chars for x in r["participants"]),"Unknown thread participant")
        add("threads",r)
    elif t=="close_thread":
        k=d["thread"];require(k in st["threads"] and st["threads"][k]["status"]=="open" and isinstance(d.get("resolution"),str) and d["resolution"].strip(),"Invalid thread close")
        st["threads"][k].update(status="closed",resolution=d["resolution"]);st["sources"][k+".closed"]=src
    elif t=="transfer_item":
        item=d["item"];require(item in items and items[item].get("owner")==d["from"],"Wrong item owner")
        require(d["from"]!=d["to"],"No item transfer")
        if d["from"] is not None:
            c=char(d["from"]);require(item in c["state"]["items"],"Inconsistent item owner");c["state"]["items"].remove(item)
        if d["to"] is not None:
            c=char(d["to"]);require(item not in c["state"]["items"],"Duplicate item");c["state"]["items"].append(item)
        items[item]["owner"]=d["to"];st["sources"][item+".owner"]=src
    elif t=="note":
        require(isinstance(d.get("text"),str) and d["text"].strip(),"Empty note")
    else: raise ValueError("Unknown event type: "+str(t))
    st["sources"][e["id"]]=src

def chapter_text(root,ch):
    raw=safe_file(root,ch["path"]).read_bytes()
    text=raw.decode("utf-8")
    first,sep,body=text.partition("\n")
    require(sep and first=="# "+ch["title"],"Chapter title mismatch")
    return raw,body.strip()

def validate(root=ROOT,check_snapshot=True):
    root=Path(root)
    cat=load(root,"catalog.json"); cp=load(root,"state/checkpoint.json")
    require(cat["schema"]==cp["schema"]==1,"Unknown schema")
    volumes=record_index(cat["volumes"],"volumes")
    st=initial(root); seen_events=set();seen_scenes=set();seen_hash=set(); seen_titles=set(); paths=set()
    last_tick=0; last_volume=0
    for number,ch in enumerate(cat["chapters"],1):
        require(type(ch["number"]) is int and ch["number"]==number,"Chapter order")
        require(ch["volume"] in volumes,"Unknown volume")
        vol_order=list(volumes).index(ch["volume"])
        require(vol_order>=last_volume,"Volume order");last_volume=vol_order
        expected=f"books/vol-{vol_order+1:03d}/chapter-{number:06d}.md"
        require(ch["path"]==expected and ch["events"]==f"events/{number:06d}.json","Noncanonical path")
        paths.add(ch["path"]);paths.add(ch["events"])
        raw,body=chapter_text(root,ch);digest=hashlib.sha256(raw).hexdigest()
        require(ch["sha256"]==digest and digest not in seen_hash,"Chapter hash / duplicate");seen_hash.add(digest)
        title=ch["title"].strip().casefold();require(title and title not in seen_titles,"Duplicate chapter title");seen_titles.add(title)
        require(type(ch["body_chars"]) is int and ch["body_chars"]==len(body) and 15000<=len(body)<=25000,"Chapter length must be 15000–25000")
        paragraphs=[p.strip().casefold() for p in re.split(r"\n\s*\n",body) if len(p.strip())>=120]
        require(len(paragraphs)==len(set(paragraphs)),"Repeated long paragraph")
        require(isinstance(ch["summary"],str) and len(ch["summary"].strip())>=30,"Missing summary")
        require(all(ch["review"].get(k) is True for k in REVIEW) and isinstance(ch["review"].get("notes"),str) and ch["review"]["notes"].strip(),"Review incomplete")
        require(all(type(n) is int and 1<=n<number for n in ch["related_chapters"]),"Invalid related chapter")
        for field in ("participants","places","themes"): require(isinstance(ch[field],list) and len(ch[field])==len(set(ch[field])),"Invalid chapter index")
        scenes=ch["scenes"];require(isinstance(scenes,list) and scenes,"No scenes")
        evdoc=load(root,ch["events"]);require(evdoc["schema"]==1 and evdoc["chapter"]==number and evdoc["events"],"Missing chapter events")
        evs=evdoc["events"];cursor=0
        for scene in scenes:
            sid=scene["id"];require(valid_id(sid) and sid not in seen_scenes,"Duplicate scene");seen_scenes.add(sid)
            start,end=scene["start_tick"],scene["end_tick"]
            require(type(start) is int and type(end) is int and last_tick<=start<=end,"Scene chronology")
            require(scene["pov"] in scene["participants"] and isinstance(scene["summary"],str) and scene["summary"].strip(),"Scene POV/summary")
            tick=start
            while cursor<len(evs) and evs[cursor]["scene"]==sid:
                e=evs[cursor];eid=e["id"];require(valid_id(eid) and eid not in seen_events,"Duplicate event");seen_events.add(eid)
                require(type(e["tick"]) is int and tick<=e["tick"]<=end,"Event chronology");tick=e["tick"]
                event_apply(st,e,scene);cursor+=1
            require(all(p in st["characters"] for p in scene["participants"]),"Unknown scene participant")
            require(scene["place"] is None or scene["place"] in st["places"],"Unknown scene place")
            require(set(scene["participants"])<=set(ch["participants"]),"Missing participant index")
            require(scene["place"] is None or scene["place"] in ch["places"],"Missing place index")
            last_tick=end
        require(cursor==len(evs),"Event outside scene / order mismatch")
        require(all(p in st["characters"] for p in ch["participants"]) and all(p in st["places"] for p in ch["places"]),"Invalid chapter index reference")
    for p in root.glob("books/**/chapter-*.md"):
        require(p.relative_to(root).as_posix() in paths,"Unindexed chapter")
    for p in root.glob("events/*.json"):
        require(p.relative_to(root).as_posix() in paths,"Unindexed event file")
    n=len(cat["chapters"])
    require(cp["last_chapter"]==(n or None) and cp["next_chapter"]==n+1 and cp["last_tick"]==last_tick,"Stale checkpoint")
    require(sorted(cp["open_threads"])==sorted(k for k,v in st["threads"].items() if v["status"]=="open"),"Stale thread checkpoint")
    require(all(isinstance(cp.get(k),str) and cp[k].strip() for k in ("summary","next_scene")),"Empty checkpoint")
    for p in cp["required_reading"]: safe_file(root,p)
    examples=load(root,"style/EXAMPLES.json")
    for ex in examples["examples"]: require(type(ex["chapter"]) is int and 1<=ex["chapter"]<=n and ex["scene"] in {s["id"] for s in cat["chapters"][ex["chapter"]-1]["scenes"]},"Invalid style example")
    st["last_tick"]=last_tick
    # The checked materialized snapshot can be read directly by a fresh GitHub chat.
    if check_snapshot:
        require(load(root,"state/current.json")==st,"Stale current snapshot: run stamp")
        for cid,character in st["characters"].items():
            require(load(root,"state/characters/"+cid+".json")==character_snapshot(st,cid),"Stale character snapshot "+cid)
        actual={p.stem for p in (root/"state/characters").glob("*.json")}
        require(actual==set(st["characters"]),"Unexpected character snapshot")
    entries=load(root,"encyclopedia.json")
    require(entries["schema"]==1,"Unknown encyclopedia schema")
    seen=set()
    for entry in entries["entries"]:
        require(valid_id(entry["id"]) and entry["id"] not in seen,"Duplicate encyclopedia entry")
        seen.add(entry["id"])
        require(entry["kind"] in ("character","world","place","magic","history") and type(entry["visible_after"]) is int and 0<=entry["visible_after"]<=n,"Invalid encyclopedia visibility")
        require(all(isinstance(entry.get(k),str) and entry[k].strip() for k in ("title","text")),"Invalid public entry")
    return cat,cp,st

def character_snapshot(st,cid):
    return {"profile":st["characters"][cid],
        "relationships_out":{k:v for k,v in st["relationships"].items() if k.startswith(cid+"->")},
        "relationships_in":{k:v for k,v in st["relationships"].items() if k.endswith("->"+cid)},
        "knowledge":{k:v for k,v in st["knowledge"].items() if k.startswith(cid+"->")},
        "facts":{k:v for k,v in st["facts"].items() if cid in v.get("subjects",[]) or pair_key(cid,k) in st["knowledge"]},
        "sources":{k:v for k,v in st["sources"].items() if k==cid or k.startswith(cid+".") or k.startswith(cid+"->") or k.endswith("->"+cid)}}

def materialize(root,st):
    root=Path(root)
    def write(path,data):
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8",newline="\n")
    write(root/"state/current.json",st)
    folder=root/"state/characters"
    folder.mkdir(parents=True,exist_ok=True)
    for cid in st["characters"]:write(folder/(cid+".json"),character_snapshot(st,cid))
    for p in folder.glob("*.json"):
        if p.stem not in st["characters"]:p.unlink()

def public_encyclopedia(through,root=ROOT):
    n=len(load(root,"catalog.json")["chapters"])
    require(type(through) is int and 0<=through<=n,"Invalid reading chapter")
    return [e for e in load(root,"encyclopedia.json")["entries"] if e["visible_after"]<=through]

def public_catalog(root=ROOT):
    cat=load(root,"catalog.json")
    return {"book":cat["book"],"volumes":cat["volumes"],"chapters":[{k:c[k] for k in ("number","volume","title","body_chars")} for c in cat["chapters"]]}

def public_chapter(number,root=ROOT):
    cat=load(root,"catalog.json")
    if not 1<=number<=len(cat["chapters"]): raise ValueError("Unknown chapter")
    ch=cat["chapters"][number-1];require(ch["number"]==number,"Invalid chapter index")
    raw,body=chapter_text(root,ch)
    require(hashlib.sha256(raw).hexdigest()==ch["sha256"],"Chapter integrity")
    return {"number":number,"title":ch["title"],"text":body}

def search(query,root=ROOT,public=False):
    terms=query.casefold().split()[:8]
    if not terms:return []
    found=[]
    for ch in load(root,"catalog.json")["chapters"]:
        raw,body=chapter_text(root,ch)
        hay=(ch["title"]+" "+body+("" if public else " "+json.dumps(ch,ensure_ascii=False))).casefold()
        if all(t in hay for t in terms): found.append({"number":ch["number"],"title":ch["title"],**({} if public else {"path":ch["path"],"events":ch["events"],"summary":ch["summary"]})})
        if len(found)>=100:break
    return found

def reader_settings(db,data=None,max_chapter=0):
    from contextlib import closing
    with closing(sqlite3.connect(db,timeout=10)) as conn, conn:
        conn.execute("CREATE TABLE IF NOT EXISTS chronicle_reader(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)")
        row=conn.execute("SELECT value FROM chronicle_reader WHERE id=1").fetchone()
        result=json.loads(row[0]) if row else {"chapter":0,"position":0,"font":20,"theme":"night","bookmarks":[]}
        if data is not None:
            require(isinstance(data,dict),"Invalid reader settings")
            def integer(key,lo,hi):
                v=data.get(key,result[key]);require(type(v) is int and lo<=v<=hi,"Invalid "+key);return v
            chapter=integer("chapter",0,max_chapter);position=integer("position",0,10000);font=integer("font",16,32)
            theme=data.get("theme",result["theme"]);require(theme in ("night","paper"),"Invalid theme")
            marks=data.get("bookmarks",result["bookmarks"]);require(isinstance(marks,list) and len(marks)<=200 and all(type(x) is int and 1<=x<=max_chapter for x in marks),"Invalid bookmarks")
            result={"chapter":chapter,"position":position,"font":font,"theme":theme,"bookmarks":sorted(set(marks))}
            conn.execute("INSERT OR REPLACE INTO chronicle_reader VALUES(1,?)",(json.dumps(result),))
        return result
