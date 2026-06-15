import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repo = 'https://github.com/Dooy/chatgpt-web-midjourney-proxy.git';
const version = process.env.MJCHAT_VERSION || 'v2.26.5';
const basePath = process.env.MJCHAT_BASE_PATH || '/mjchat/';
const keepWorktree = process.env.MJCHAT_KEEP_WORKTREE === 'true';
const userTempDir = path.join(os.homedir(), 'AppData', 'Local', 'Temp');
const tempDir = process.platform === 'win32' && fs.existsSync(userTempDir) ? userTempDir : fs.realpathSync(os.tmpdir());
const defaultWorktree = path.join(tempDir, `done-hub-mjchat-${version.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
const worktree = process.env.MJCHAT_WORKTREE ? path.resolve(process.env.MJCHAT_WORKTREE) : defaultWorktree;

function run(command, args, options = {}) {
  const needsCmdShim = ['corepack', 'npm', 'npx', 'pnpm'].includes(command);
  const executable = process.platform === 'win32' && needsCmdShim ? `${command}.cmd` : command;
  console.log(`[mjchat] ${command} ${args.join(' ')}`);
  execFileSync(executable, args, { stdio: 'inherit', shell: process.platform === 'win32' && needsCmdShim, ...options });
}

function rm(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileHash(file) {
  return sha256(fs.readFileSync(file));
}

function buildStamp() {
  const input = {
    name: 'mjchat',
    version,
    basePath,
    scriptHash: fileHash(scriptPath),
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    openLongReply: process.env.VITE_GLOB_OPEN_LONG_REPLY || 'false',
    appPwa: process.env.VITE_GLOB_APP_PWA || 'false',
    clientSession: process.env.VITE_DONE_HUB_CLIENT_SESSION || 'true',
  };

  return {
    ...input,
    key: sha256(JSON.stringify(input)),
  };
}

function stampPath(repoDir) {
  return path.join(repoDir, '.done-hub-build-stamp.json');
}

function readStamp(repoDir) {
  try {
    return JSON.parse(fs.readFileSync(stampPath(repoDir), 'utf8'));
  } catch {
    return null;
  }
}

function expectedBuildOutputExists(repoDir) {
  return fs.existsSync(path.join(repoDir, 'dist', 'index.html'));
}

function isBuildCacheFresh(repoDir, expectedStamp) {
  const currentStamp = readStamp(repoDir);
  return currentStamp?.key === expectedStamp.key && expectedBuildOutputExists(repoDir);
}

function writeStamp(repoDir, stamp) {
  fs.writeFileSync(
    stampPath(repoDir),
    JSON.stringify(
      {
        ...stamp,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

function patchViteConfig(repoDir) {
  const configPath = path.join(repoDir, 'vite.config.ts');
  let config = fs.readFileSync(configPath, 'utf8');
  const marker = 'const doneHubBasePath = process.env.MJCHAT_BASE_PATH || "/"';

  if (!config.includes(marker)) {
    config = config.replace(
      'const viteEnv = loadEnv(env.mode, process.cwd()) as unknown as ImportMetaEnv',
      `const viteEnv = loadEnv(env.mode, process.cwd()) as unknown as ImportMetaEnv\n  ${marker}`
    );
    config = config.replace('return {\n    resolve:', 'return {\n    base: doneHubBasePath,\n    resolve:');
    fs.writeFileSync(configPath, config);
  }

  config = fs.readFileSync(configPath, 'utf8');
  if (!config.includes("env.VITE_GLOB_APP_PWA === 'true' && VitePWA")) {
    config = config.replace('VitePWA({ // env.VITE_GLOB_APP_PWA === \'true\' &&', "env.VITE_GLOB_APP_PWA === 'true' && VitePWA({");
    fs.writeFileSync(configPath, config);
  }
}

function patchClientSession(repoDir) {
  const apiPath = path.join(repoDir, 'src', 'api', 'index.ts');
  let api = fs.readFileSync(apiPath, 'utf8');
  const from = 'if (homeStore.myData.isClient)';
  const to = 'if (import.meta.env.VITE_DONE_HUB_CLIENT_SESSION === "true" || homeStore.myData.isClient)';

  if (api.includes(from) && !api.includes('VITE_DONE_HUB_CLIENT_SESSION')) {
    api = api.replace(from, to);
    fs.writeFileSync(apiPath, api);
  }
}

function installAndBuild(repoDir) {
	const env = {
		...process.env,
    npm_config_registry: process.env.npm_config_registry || 'https://registry.npmjs.org',
    MJCHAT_BASE_PATH: basePath,
    VITE_GLOB_API_URL: '/api',
		VITE_APP_API_BASE_URL: 'http://127.0.0.1:3000',
		VITE_GLOB_OPEN_LONG_REPLY: process.env.VITE_GLOB_OPEN_LONG_REPLY || 'false',
		VITE_GLOB_APP_PWA: process.env.VITE_GLOB_APP_PWA || 'false',
		VITE_DONE_HUB_CLIENT_SESSION: process.env.VITE_DONE_HUB_CLIENT_SESSION || 'true'
	};

	run('npm', ['install', '--legacy-peer-deps'], { cwd: repoDir, env });
	run('npm', ['run', 'build'], { cwd: repoDir, env });
}

if (!keepWorktree) {
  rm(worktree);
}

if (!fs.existsSync(worktree)) {
  run('git', ['clone', '--depth', '1', '--branch', version, repo, worktree]);
}

patchViteConfig(worktree);
patchClientSession(worktree);
const stamp = buildStamp();

if (isBuildCacheFresh(worktree, stamp)) {
  console.log(`[mjchat] reusing cached ${version} build (${stamp.key.slice(0, 12)}) in ${worktree}`);
} else {
  installAndBuild(worktree);
  writeStamp(worktree, stamp);
}

console.log(`[mjchat] built ${version} in ${worktree}`);
console.log(`[mjchat] start with: node scripts/start-midjourney-proxy.mjs`);
