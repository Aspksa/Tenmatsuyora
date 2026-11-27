"""Browser smoke test using preinstalled Chromium/Chrome. No Cloud.ru calls."""
import os
import shutil
import subprocess
import tempfile
import threading
from contextlib import closing
from pathlib import Path
from unittest.mock import patch
from html.parser import HTMLParser
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

class DOM(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ready = False
        self.engine = False
        self.visual = False
        self.layout = ""
        self.overflow = ""
        self.models = 0
        self.depth = 0
        self.minis = 0
        self.stars = 0
        self.chat = False
        self.cloud = False
        self.controls = False
        self.services = 0
        self.background = False
    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        cls = d.get("class", "").split()
        if d.get("id") == "sky":
            self.ready = d.get("data-ready") == "true"
            self.engine = d.get("data-engine") == "d3-force@3.0.0"
            self.visual = d.get("data-visual") == "celestial-11"
        if tag == "body":
            self.layout = d.get("data-layout", "")
            self.overflow = d.get("data-overflow", "")
        self.models += "cloud-model-node" in cls
        self.depth += "sky-depth" in cls
        self.minis += "mini-cluster" in cls
        self.stars += "star-node" in cls
        self.chat |= d.get("id") == "msg-360"
        self.cloud |= "cloud-star" in cls
        self.controls |= d.get("id") == "fullscreen"
        self.services += "service-hub" in cls
        self.background |= d.get("id") == "celestial-background"

def main():
    chrome = os.environ.get("CHROME_PATH") or shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
    if not chrome:
        raise RuntimeError("Browser not found")
    with tempfile.TemporaryDirectory() as tmp, patch.object(server, "DB", Path(tmp)/"test.sqlite"), patch.object(server, "KEY", ""), patch.object(server, "MODEL", ""):
        with closing(server.connect()) as conn, conn:
            conn.executemany("INSERT INTO messages(role,content) VALUES ('user',?)", [(f"Smoke message {i}",) for i in range(1,361)])
        with server.ThreadingHTTPServer(("127.0.0.1",0),server.Handler) as http:
            thread=threading.Thread(target=http.serve_forever,daemon=True)
            thread.start()
            try:
                url=f"http://127.0.0.1:{http.server_port}"
                for size, expected in (("1440,900","side"),("480,900","stack")):
                    for attempt in range(3):
                        run=subprocess.run([chrome,"--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--no-first-run","--no-default-browser-check","--disable-background-networking",f"--window-size={size}",f"--user-data-dir={tmp}/chrome-{size}-{attempt}","--virtual-time-budget=9000","--dump-dom",url],capture_output=True,timeout=60,encoding="utf-8",errors="replace")
                        dom=DOM()
                        dom.feed(run.stdout)
                        if run.returncode==0 and dom.ready and dom.engine and dom.minis==12 and dom.stars==90 and dom.chat and dom.cloud and dom.controls and dom.services==2 and dom.background and dom.visual and dom.models==2 and dom.depth==3 and dom.layout==expected and dom.overflow=="false":
                            print(f"Browser {size}: {expected}, no horizontal overflow, visual engine and archive ready")
                            break
                    else:
                        print(run.stdout[-5000:])
                        print(run.stderr[-2000:])
                        raise AssertionError(f"Browser {size}: ready={dom.ready}, layout={dom.layout}, overflow={dom.overflow}, stars={dom.stars}, visual={dom.visual}")
                reader_run=subprocess.run([chrome,"--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--no-first-run","--window-size=1280,900",f"--user-data-dir={tmp}/reader","--virtual-time-budget=9000","--dump-dom",url+"/chronicles"],capture_output=True,timeout=60,encoding="utf-8",errors="replace")
                if reader_run.returncode!=0 or 'data-ready="true"' not in reader_run.stdout or 'id="chapter"' not in reader_run.stdout:
                    raise AssertionError("Reader did not initialize: "+reader_run.stdout[-2000:]+reader_run.stderr[-1000:])
                print("Browser: local Chronicle reader initialized")
            finally:
                http.shutdown()
                thread.join(timeout=5)

if __name__=="__main__":
    main()
