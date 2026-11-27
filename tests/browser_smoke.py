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
                for attempt in range(3):
                    run=subprocess.run([chrome,"--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--no-first-run","--no-default-browser-check","--disable-background-networking",f"--user-data-dir={tmp}/chrome-{attempt}","--virtual-time-budget=9000","--dump-dom",url],capture_output=True,timeout=60,encoding="utf-8",errors="replace")
                    dom=DOM()
                    dom.feed(run.stdout)
                    if run.returncode==0 and dom.ready and dom.minis==12 and dom.stars==90 and dom.chat and dom.cloud and dom.controls and dom.services == 2 and dom.background:
                        print("Browser: 12 compact constellations, 90 detailed stars, loaded chat and initialized SVG")
                        break
                else:
                    print(run.stdout[-5000:])
                    print(run.stderr[-2000:])
                    raise AssertionError(f"Browser did not initialize: {dom.ready}, mini={dom.minis}, stars={dom.stars}, chat={dom.chat}")
            finally:
                http.shutdown()
                thread.join(timeout=5)

if __name__=="__main__":
    main()
