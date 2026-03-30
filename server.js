import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relativePath = decoded === '/' ? 'index.html' : decoded.replace(/^[/\\]+/, '');
  const normalized = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  return path.join(ROOT, normalized);
}

function send(res, statusCode, headers, body) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function cacheHeadersFor(targetPath) {
  const name = path.basename(targetPath);
  if (name === 'snapshot-version.json') {
    return { 'Cache-Control': 'no-store, no-cache, must-revalidate' };
  }
  if (name === 'app-snapshot.json') {
    return { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' };
  }
  return {};
}

const server = http.createServer((req, res) => {
  const filePath = safeResolve(req.url || '/');
  if (!filePath.startsWith(ROOT)) {
    send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden');
    return;
  }

  fs.stat(filePath, (statErr, stat) => {
    let targetPath = filePath;
    if (!statErr && stat.isDirectory()) {
      targetPath = path.join(filePath, 'index.html');
    }

    fs.readFile(targetPath, (readErr, data) => {
      if (readErr) {
        send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not Found');
        return;
      }
      const ext = path.extname(targetPath).toLowerCase();
      send(res, 200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        ...cacheHeadersFor(targetPath)
      }, data);
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`INFINITAS Table Maker Web running at http://${HOST}:${PORT}`);
});
