"""CLI for the writer; no third-party packages."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import chronicle as c

def guard(base):
    repo=c.ROOT.parent
    def old(path):
        return subprocess.check_output(["git","show",f"{base}:chronicles/{path}"],cwd=repo)
    listing=subprocess.check_output(["git","ls-tree","-r","--name-only",base,"--","chronicles/catalog.json"],cwd=repo,text=True)
    if not listing.strip(): return
    cat=json.loads(old("catalog.json"))
    new=c.load(c.ROOT,"catalog.json")
    c.require(new["chapters"][:len(cat["chapters"])]==cat["chapters"],"Published catalog cannot be rewritten")
    if cat["chapters"]:
        c.require(old("canon/foundation.json")== (c.ROOT/"canon/foundation.json").read_bytes(),"Published foundation cannot be rewritten")
    for ch in cat["chapters"]:
        for p in (ch["path"],ch["events"]):
            c.require(old(p)==(c.ROOT/p).read_bytes(),"Published file changed: "+p)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("command",choices=["validate","context","search","stamp"])
    parser.add_argument("query",nargs="?",default="")
    parser.add_argument("--base")
    args=parser.parse_args()
    if args.command=="stamp":
        cat=c.load(c.ROOT,"catalog.json")
        for ch in cat["chapters"]:
            raw,body=c.chapter_text(c.ROOT,ch)
            ch.update(sha256=hashlib.sha256(raw).hexdigest(),body_chars=len(body))
        (c.ROOT/"catalog.json").write_text(json.dumps(cat,ensure_ascii=False,indent=2)+"\n",encoding="utf-8",newline="\n")
        return
    cat,cp,st=c.validate()
    if args.base:guard(args.base)
    if args.command=="validate":print("Chronicle valid:",len(cat["chapters"]),"chapters")
    elif args.command=="search":print(json.dumps(c.search(args.query),ensure_ascii=False,indent=2))
    else: print(json.dumps({"checkpoint":cp,"state":st,"recent":cat["chapters"][-3:]},ensure_ascii=False,indent=2))
if __name__=="__main__":
    try:main()
    except (ValueError,KeyError,TypeError,OSError) as exc:raise SystemExit("Chronicle error: "+str(exc))
