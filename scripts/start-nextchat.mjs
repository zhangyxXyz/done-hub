import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const version = process.env.NEXTCHAT_VERSION || 'v2.16.1';
const basePath = process.env.NEXTCHAT_BASE_PATH || '/nextchat';
const port = process.env.NEXTCHAT_PORT || '3001';
const worktree = process.env.NEXTCHAT_WORKTREE || path.join(os.tmpdir(), `done-hub-nextchat-${version.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
const standaloneServer = path.join(worktree, '.next', 'standalone', 'server.js');
const usesStandalone = fs.existsSync(standaloneServer);

const command = process.platform === 'win32' ? (usesStandalone ? 'node.exe' : 'npm.cmd') : usesStandalone ? 'node' : 'npm';
const args = usesStandalone ? [standaloneServer] : ['run', 'start', '--', '-p', port];
const child = spawn(command, args, {
  cwd: usesStandalone ? path.dirname(standaloneServer) : worktree,
  env: {
    ...process.env,
    NEXTCHAT_BASE_PATH: basePath,
    PORT: port,
    HOSTNAME: process.env.NEXTCHAT_HOST || '127.0.0.1'
  },
  shell: process.platform === 'win32',
  stdio: 'inherit'
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
