import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const bundleDir = path.resolve(scriptDir, '..');
const nextchatPort = process.env.NEXTCHAT_PORT || '3001';
const mjchatPort = process.env.MJCHAT_PORT || '3002';
const nextchatBasePath = process.env.NEXTCHAT_BASE_PATH || '/nextchat';
const mjchatBasePath = process.env.MJCHAT_BASE_PATH || '/mjchat/';
const nextchatVersion = process.env.NEXTCHAT_VERSION || 'v2.16.1';
const mjchatVersion = process.env.MJCHAT_VERSION || 'v2.26.5';

const executableCandidates = process.platform === 'win32'
  ? ['done-hub.exe']
  : ['done-hub', 'done-hub-macos', 'done-hub-arm64'];
const doneHubBinary = process.env.DONE_HUB_BINARY || executableCandidates
  .map((name) => path.join(bundleDir, name))
  .find((candidate) => fs.existsSync(candidate));

if (!doneHubBinary) {
  console.error('[bundle] cannot find Done Hub binary in release bundle');
  process.exit(1);
}

const children = [];

function spawnChild(name, command, args, options = {}) {
  console.log(`[bundle] starting ${name}`);
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options
  });
  child.once('exit', (code) => {
    if (!child.killed) {
      console.error(`[bundle] ${name} exited with code ${code}`);
      cleanup();
      process.exit(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

function waitForHttp(name, url, attempts = 60) {
  return new Promise((resolve, reject) => {
    let count = 0;

    const tick = () => {
      const req = http.get(url, { timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 500) {
          console.log(`[bundle] ${name} is ready at ${url}`);
          resolve();
          return;
        }
        retry();
      });

      req.on('timeout', () => {
        req.destroy();
        retry();
      });
      req.on('error', retry);
    };

    const retry = () => {
      count += 1;
      if (count >= attempts) {
        reject(new Error(`${name} did not respond at ${url}`));
        return;
      }
      setTimeout(tick, 1000);
    };

    tick();
  });
}

function cleanup() {
  for (const child of children) {
    child.kill();
  }
}

process.once('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.once('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

spawnChild('ChatGPT Next', process.execPath, [path.join(scriptDir, 'start-nextchat.mjs')], {
  env: {
    ...process.env,
    NEXTCHAT_WORKTREE: path.join(bundleDir, 'nextchat'),
    NEXTCHAT_PORT: nextchatPort,
    NEXTCHAT_BASE_PATH: nextchatBasePath,
    NEXTCHAT_VERSION: nextchatVersion,
    NEXTCHAT_URL: `http://127.0.0.1:${nextchatPort}`
  }
});

spawnChild('chatgpt-web-midjourney-proxy', process.execPath, [path.join(scriptDir, 'start-midjourney-proxy.mjs')], {
  env: {
    ...process.env,
    MJCHAT_WORKTREE: path.join(bundleDir, 'mjchat'),
    MJCHAT_PORT: mjchatPort,
    MJCHAT_BASE_PATH: mjchatBasePath,
    MJCHAT_VERSION: mjchatVersion,
    MJCHAT_URL: `http://127.0.0.1:${mjchatPort}`
  }
});

await Promise.all([
  waitForHttp('ChatGPT Next', `http://127.0.0.1:${nextchatPort}${nextchatBasePath}`),
  waitForHttp('chatgpt-web-midjourney-proxy', `http://127.0.0.1:${mjchatPort}${mjchatBasePath}`)
]);

spawnChild('Done Hub', doneHubBinary, process.argv.slice(2), {
  cwd: bundleDir,
  env: {
    ...process.env,
    NEXTCHAT_URL: `http://127.0.0.1:${nextchatPort}`,
    MJCHAT_URL: `http://127.0.0.1:${mjchatPort}`,
    NEXTCHAT_BASE_PATH: nextchatBasePath,
    MJCHAT_BASE_PATH: mjchatBasePath,
    NEXTCHAT_VERSION: nextchatVersion,
    MJCHAT_VERSION: mjchatVersion
  }
});
