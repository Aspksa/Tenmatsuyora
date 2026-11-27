import json
import os
import sqlite3
import threading
import urllib.request
import webbrowser
import re
import math
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB = ROOT / "data" / "history.sqlite3"
KEY = os.environ.get("CLOUD_RU_API_KEY", "").strip()
MODEL = os.environ.get("CLOUD_RU_MODEL", "").strip()
LOCK = threading.Lock()
CLOUD_URL = "https://foundation-models.api.cloud.ru/v1/chat/completions"

def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL)")
    conn.execute("CREATE TABLE IF NOT EXISTS visual_preferences (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)")
    return conn

def save(role, content):
    with closing(connect()) as conn, conn:
        conn.execute("INSERT INTO messages(role,content) VALUES (?,?)", (role, content))

def state():
    with closing(connect()) as conn:
        rows = conn.execute("SELECT id,role,content FROM messages ORDER BY id DESC LIMIT 200").fetchall()
        count = conn.execute("SELECT count(*) FROM messages").fetchone()[0]
        groups = [dict(row) for row in conn.execute("SELECT (id-1)/30 AS page, count(*) AS count, sum(1 << ((id-1)%30)) AS mask FROM messages GROUP BY (id-1)/30 ORDER BY page")]
        pref = conn.execute("SELECT value FROM visual_preferences WHERE id=1").fetchone()
    return {"preferences": json.loads(pref[0]) if pref else {}, "messages": [dict(row) for row in reversed(rows)], "count": count, "groups": groups, "configured": bool(KEY and MODEL), "model": MODEL if KEY and MODEL else ""}

def save_preferences(value):
    if not isinstance(value, dict):
        raise ValueError("Invalid preferences")
    def num(v, lo, hi, default):
        return min(hi, max(lo, v)) if type(v) in (float, int) and math.isfinite(v) else default
    camera = value.get("camera")
    camera = {"x": num(camera.get("x"), -100000, 100000, 0), "y": num(camera.get("y"), -100000, 100000, 0), "k": num(camera.get("k"), .035, 3, 1)} if isinstance(camera, dict) else None
    clean = {"glow": num(value.get("glow"), .25, 1.5, 1), "speed": num(value.get("speed"), 0, 2, 1), "quality": "low" if value.get("quality") == "low" else "high", "camera": camera, "auto": value.get("auto") is not False}
    with closing(connect()) as conn, conn:
        conn.execute("INSERT INTO visual_preferences(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value", (json.dumps(clean),))
    return clean

def cluster(page):
    with closing(connect()) as conn:
        return [dict(row) for row in conn.execute("SELECT id,role,content FROM messages WHERE id BETWEEN ? AND ? ORDER BY id", (page*30+1, page*30+30))]

def generate():
    context = [{"role": m["role"], "content": m["content"]} for m in state()["messages"][-20:]]
    req = urllib.request.Request(CLOUD_URL, data=json.dumps({"model": MODEL, "messages": context, "max_completion_tokens": 1500, "stream": False}).encode(), headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=90) as response:
        payload = json.load(response)
    answer = payload["choices"][0]["message"]["content"]
    if not isinstance(answer, str) or not answer.strip():
        raise ValueError("Empty response")
    return answer

def process(content):
    if not isinstance(content, str) or not 1 <= len(content.strip()) <= 12000:
        raise ValueError("Введите от 1 до 12000 символов")
    with LOCK:
        save("user", content.strip())
        if not (KEY and MODEL):
            return "Сообщение сохранено. Для ответа настройте Cloud.ru."
        try:
            save("assistant", generate())
            return ""
        except (OSError, ValueError, KeyError, IndexError, TypeError):
            return "Сообщение сохранено. Cloud.ru не вернул ответ; проверьте настройки. Автоповтора нет."

ASSETS = {"/": ("index.html", "text/html; charset=utf-8"), "/style.css": ("style.css", "text/css; charset=utf-8"), "/app.js": ("app.js", "text/javascript; charset=utf-8"), "/geometry.js": ("geometry.js", "text/javascript; charset=utf-8"), "/star.svg": ("star.svg", "image/svg+xml")}

class Handler(BaseHTTPRequestHandler):
    def allowed(self):
        return self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}"

    def respond(self, status, content, mime):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(content)

    def json(self, status, data):
        self.respond(status, json.dumps(data, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def do_GET(self):
        if not self.allowed():
            return self.json(403, {"error":"Invalid host"})
        if self.path == "/api/state":
            return self.json(200, state())
        match = re.fullmatch(r"/api/cluster/([0-9]{1,12})", self.path)
        if match:
            return self.json(200, {"messages": cluster(int(match.group(1)))})
        if self.path not in ASSETS:
            return self.json(404, {"error":"Not found"})
        name, mime = ASSETS[self.path]
        path = ROOT / "static" / name
        if not path.is_file():
            return self.json(503, {"error":"Run npm run build"})
        self.respond(200, path.read_bytes(), mime)

    def do_POST(self):
        if not self.allowed() or self.headers.get("Origin") != f"http://127.0.0.1:{self.server.server_port}" or self.headers.get("X-Tenma") != "1":
            return self.json(403, {"error":"Invalid origin"})
        if self.path not in ("/api/message", "/api/preferences"):
            return self.json(404, {"error":"Not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 100000:
                raise ValueError("Invalid request size")
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError("Invalid request")
            if self.path == "/api/preferences":
                return self.json(200, {"preferences": save_preferences(data)})
            notice = process(data.get("content"))
            self.json(200, {"notice":notice})
        except (ValueError, UnicodeError):
            self.json(400, {"error":"Некорректное сообщение"})

def main():
    if not all((ROOT / "static" / name).is_file() for name in ("app.js", "geometry.js")):
        raise SystemExit("Run npm install and npm run build first")
    with closing(connect()):
        pass
    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        url = f"http://127.0.0.1:{server.server_port}"
        print(f"Tenmatsuyora: {url}", flush=True)
        if "--no-browser" not in os.sys.argv:
            threading.Timer(.3, lambda: webbrowser.open(url)).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass

if __name__ == "__main__":
    main()
