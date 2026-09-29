const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

/**
 * Creates an embedded HTTP static server with SPA fallback for Chromatix
 * @param {string} staticDir
 * @returns {Promise<{ server: http.Server, url: string, port: number }>}
 */
function startStaticServer(staticDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Parse request path, strip query strings
      const reqPath = decodeURI(req.url.split('?')[0]);
      let safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
      let filePath = path.join(staticDir, safePath);

      // Check if file exists
      fs.stat(filePath, (err, stats) => {
        if (!err && stats.isFile()) {
          serveFile(res, filePath);
          return;
        }

        // Silently handle vercel analytics requests in desktop app
        if (reqPath.startsWith('/_vercel')) {
          res.writeHead(200, { 'Content-Type': 'application/javascript' });
          res.end('/* vercel analytics disabled in desktop */');
          return;
        }

        // If request has a file extension that wasn't found, return 404 (don't serve index.html)
        if (path.extname(safePath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('File not found');
          return;
        }

        // SPA Fallback: for clean routes without extensions (e.g. /settings, /albums), serve index.html
        const indexPath = path.join(staticDir, 'index.html');
        fs.stat(indexPath, (indexErr, indexStats) => {
          if (!indexErr && indexStats.isFile()) {
            serveFile(res, indexPath);
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
          }
        });
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const url = `http://127.0.0.1:${port}`;
      console.log(`[StaticServer] Serving Chromatix at ${url}`);
      resolve({ server, url, port });
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

module.exports = {
  startStaticServer,
};

