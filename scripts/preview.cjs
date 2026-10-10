const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const allowed = new Set(['/index.html', '/src/app.mjs', '/src/model.mjs', '/src/styles.css', '/assets/app-icon.png']);
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const filename = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!allowed.has(filename)) { response.writeHead(404); response.end('Not found'); return; }
  fs.readFile(path.join(root, filename), (error, buffer) => {
    if (error) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(buffer);
  });
});
server.listen(port, '127.0.0.1', () => console.log(`Daynote preview: http://127.0.0.1:${port}`));
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
