import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const nextchatPort = process.env.NEXTCHAT_PORT || '3001';
const mjchatPort = process.env.MJCHAT_PORT || '3002';
const nextchatBasePath = process.env.NEXTCHAT_BASE_PATH || '/nextchat';
const mjchatBasePath = process.env.MJCHAT_BASE_PATH || '/mjchat/';
const attempts = Number(process.env.CHAT_SERVICE_CHECK_ATTEMPTS || 90);

const children = [];

function spawnService(name, script, env) {
  const child = spawn(process.execPath, [path.join(scriptDir, script)], {
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: false
  });

  child.once('exit', (code) => {
    if (!child.killed) {
      console.error(`[check] ${name} exited early with code ${code}`);
    }
  });

  children.push(child);
  return child;
}

function waitForHttp(name, url, child) {
  return new Promise((resolve, reject) => {
    let count = 0;

    const tick = () => {
      if (child.exitCode !== null) {
        reject(new Error(`${name} exited before responding at ${url}`));
        return;
      }

      const req = http.get(url, { timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 500) {
          console.log(`[check] ${name} is ready at ${url}`);
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

const nextchat = spawnService('ChatGPT Next', 'start-nextchat.mjs', {
  NEXTCHAT_PORT: nextchatPort,
  NEXTCHAT_BASE_PATH: nextchatBasePath
});
const mjchat = spawnService('chatgpt-web-midjourney-proxy', 'start-midjourney-proxy.mjs', {
  MJCHAT_PORT: mjchatPort,
  MJCHAT_BASE_PATH: mjchatBasePath
});

try {
  await Promise.all([
    waitForHttp('ChatGPT Next', `http://127.0.0.1:${nextchatPort}${nextchatBasePath}`, nextchat),
    waitForHttp('chatgpt-web-midjourney-proxy', `http://127.0.0.1:${mjchatPort}${mjchatBasePath}`, mjchat)
  ]);
  cleanup();
} catch (error) {
  cleanup();
  console.error(`[check] ${error.message}`);
  process.exit(1);
}
