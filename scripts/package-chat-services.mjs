import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const version = process.env.NEXTCHAT_VERSION || 'v2.16.1';
const mjVersion = process.env.MJCHAT_VERSION || 'v2.26.5';
const nextchatWorktree = process.env.NEXTCHAT_WORKTREE
  ? path.resolve(process.env.NEXTCHAT_WORKTREE)
  : path.join(os.tmpdir(), `done-hub-nextchat-${version.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
const userTempDir = path.join(os.homedir(), 'AppData', 'Local', 'Temp');
const tempDir = process.platform === 'win32' && fs.existsSync(userTempDir) ? userTempDir : fs.realpathSync(os.tmpdir());
const mjchatWorktree = process.env.MJCHAT_WORKTREE
  ? path.resolve(process.env.MJCHAT_WORKTREE)
  : path.join(tempDir, `done-hub-mjchat-${mjVersion.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
const outputArgIndex = process.argv.indexOf('--output');
const outputDir = outputArgIndex === -1 ? path.resolve('release', 'done-hub') : path.resolve(process.argv[outputArgIndex + 1]);

function rm(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`missing required build output: ${src}`);
  }
  rm(dest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`missing required file: ${src}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

copyDir(path.join(nextchatWorktree, '.next', 'standalone'), path.join(outputDir, 'nextchat', '.next', 'standalone'));
copyDir(path.join(nextchatWorktree, '.next', 'static'), path.join(outputDir, 'nextchat', '.next', 'static'));
copyDir(path.join(mjchatWorktree, 'dist'), path.join(outputDir, 'mjchat', 'dist'));

const publicDir = path.join(nextchatWorktree, 'public');
if (fs.existsSync(publicDir)) {
  copyDir(publicDir, path.join(outputDir, 'nextchat', 'public'));
}

copyFile(path.join(scriptDir, 'start-nextchat.mjs'), path.join(outputDir, 'scripts', 'start-nextchat.mjs'));
copyFile(path.join(scriptDir, 'start-midjourney-proxy.mjs'), path.join(outputDir, 'scripts', 'start-midjourney-proxy.mjs'));
copyFile(path.join(scriptDir, 'start-bundled-services.mjs'), path.join(outputDir, 'scripts', 'start-bundled-services.mjs'));

const startSh = path.join(outputDir, 'start.sh');
fs.writeFileSync(startSh, '#!/bin/sh\nDIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec node "$DIR/scripts/start-bundled-services.mjs" "$@"\n');
fs.chmodSync(startSh, 0o755);
fs.writeFileSync(path.join(outputDir, 'start.cmd'), '@echo off\r\nnode "%~dp0scripts\\start-bundled-services.mjs" %*\r\n');

console.log(`[release] packaged chat services into ${outputDir}`);
