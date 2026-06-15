import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const version = process.env.MJCHAT_VERSION || 'v2.26.5';
const basePath = process.env.MJCHAT_BASE_PATH || '/mjchat/';
const port = process.env.MJCHAT_PORT || '3002';
const userTempDir = path.join(os.homedir(), 'AppData', 'Local', 'Temp');
const tempDir = process.platform === 'win32' && fs.existsSync(userTempDir) ? userTempDir : fs.realpathSync(os.tmpdir());
const worktree = process.env.MJCHAT_WORKTREE || path.join(tempDir, `done-hub-mjchat-${version.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
const distDir = path.join(worktree, 'dist');

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.ico') return 'image/x-icon';
  return 'application/octet-stream';
}

if (fs.existsSync(distDir)) {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (!requestUrl.pathname.startsWith(normalizedBase)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const relativePath = decodeURIComponent(requestUrl.pathname.slice(normalizedBase.length));
    const candidate = path.resolve(distDir, relativePath || 'index.html');
    const filePath = candidate.startsWith(distDir) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(distDir, 'index.html');

    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });

  server.listen(Number(port), '127.0.0.1', () => {
    console.log(`[mjchat] serving ${distDir} at http://127.0.0.1:${port}${normalizedBase}`);
  });
} else {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(command, ['run', 'preview', '--', '--host', '127.0.0.1', '--port', port], {
    cwd: worktree,
    env: {
      ...process.env,
      MJCHAT_BASE_PATH: basePath
    },
    shell: process.platform === 'win32',
    stdio: 'inherit'
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}
