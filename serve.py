#!/usr/bin/env python3
"""Static dev server with no-cache headers (Chrome otherwise keeps stale ES modules around)."""
import sys, mimetypes
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
mimetypes.add_type('application/wasm', '.wasm'); mimetypes.add_type('application/octet-stream', '.jsdos'); mimetypes.add_type('text/javascript', '.mjs')
import os, json, time
def version():
    latest = 0
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'games')]
        for f in files:
            if f.endswith(('.js', '.html', '.css', '.mjs')):
                try: latest = max(latest, os.stat(os.path.join(root, f)).st_mtime)
                except OSError: pass
    return str(int(latest))
class H(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/__version'):
            body = json.dumps({'v': version()}).encode(); self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
        super().do_GET()
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate'); self.send_header('Expires', '0'); super().end_headers()
    def log_message(self, fmt, *args):
        if '404' in (args[1] if len(args) > 1 else ''): super().log_message(fmt, *args)
port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
print(f'MIDI Warz → http://localhost:{port}  (no-cache dev server, Ctrl-C to stop)')
ThreadingHTTPServer(('', port), H).serve_forever()
