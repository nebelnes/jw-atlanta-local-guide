#!/usr/bin/env node
// Tiny static file server for local preview and browser tests. No dependencies.
// Usage: npm run serve            → http://localhost:8080
//        PORT=5000 npm run serve  → http://localhost:5000

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = normalize(join(root, rel));
    if (file !== root && !file.startsWith(root + sep)) throw Object.assign(new Error("forbidden"), { status: 403 });
    if (!(await stat(file)).isFile()) throw Object.assign(new Error("not found"), { status: 404 });
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(await readFile(file));
  } catch (err) {
    const status = err.status ?? (err.code === "ENOENT" ? 404 : 500);
    res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    res.end(status === 404 ? "Not found" : status === 403 ? "Forbidden" : "Server error");
  }
}).listen(port, host, () => {
  console.log(`Serving ${root} at http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
});
