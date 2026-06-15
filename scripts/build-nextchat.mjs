import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repo = 'https://github.com/ChatGPTNextWeb/NextChat.git';
const version = process.env.NEXTCHAT_VERSION || 'v2.16.1';
const basePath = process.env.NEXTCHAT_BASE_PATH || '/nextchat';
const modeArgIndex = process.argv.indexOf('--mode');
const buildMode = modeArgIndex === -1 ? 'standalone' : process.argv[modeArgIndex + 1];
const outputArgIndex = process.argv.indexOf('--output');
const outputDir =
  outputArgIndex === -1 ? path.resolve('web', 'build', 'nextchat') : path.resolve(process.argv[outputArgIndex + 1]);
const keepWorktree = process.env.NEXTCHAT_KEEP_WORKTREE === 'true';
const defaultWorktree = path.join(os.tmpdir(), `done-hub-nextchat-${version.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
const worktree = process.env.NEXTCHAT_WORKTREE ? path.resolve(process.env.NEXTCHAT_WORKTREE) : defaultWorktree;

function run(command, args, options = {}) {
  const needsCmdShim = ['corepack', 'npm', 'npx', 'yarn'].includes(command);
  const executable = process.platform === 'win32' && needsCmdShim ? `${command}.cmd` : command;
  console.log(`[nextchat] ${command} ${args.join(' ')}`);
  execFileSync(executable, args, { stdio: 'inherit', shell: process.platform === 'win32' && needsCmdShim, ...options });
}

function rm(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(src, dest) {
  rm(dest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function copyDirIfExists(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }
  rm(dest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileHash(file) {
  return sha256(fs.readFileSync(file));
}

function buildStamp() {
  const input = {
    name: 'nextchat',
    version,
    basePath,
    buildMode,
    scriptHash: fileHash(scriptPath),
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
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
  if (buildMode === 'export') {
    return fs.existsSync(path.join(repoDir, 'out', 'index.html'));
  }

  return (
    fs.existsSync(path.join(repoDir, '.next', 'standalone', 'server.js')) &&
    fs.existsSync(path.join(repoDir, '.next', 'static')) &&
    fs.existsSync(path.join(repoDir, '.next', 'standalone', '.next', 'static'))
  );
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

function patchNextConfig(repoDir) {
  const configPath = path.join(repoDir, 'next.config.mjs');
  let config = fs.readFileSync(configPath, 'utf8');
  const patch = `
const doneHubBasePath = process.env.NEXTCHAT_BASE_PATH || "";
if (doneHubBasePath) {
  nextConfig.basePath = doneHubBasePath;
}
nextConfig.eslint = {
  ...(nextConfig.eslint || {}),
  ignoreDuringBuilds: true,
};
`;

  if (!config.includes('doneHubBasePath')) {
    config = config.replace('export default nextConfig;', `${patch}\nexport default nextConfig;`);
    fs.writeFileSync(configPath, config);
  }
}

function patchSilentSettingsImport(repoDir) {
  const chatPath = path.join(repoDir, 'app', 'components', 'chat.tsx');
  let chat = fs.readFileSync(chatPath, 'utf8');

  const settingsCommandStart = chat.indexOf('    settings: (text) => {');
  const payloadTypeStart = chat.indexOf('        const payload = JSON.parse(text) as {', settingsCommandStart);
  const payloadTypeCloseMatch = /        };\r?\n\r?\n        console\.log\("\[Command\] got settings from url: ", payload\);/.exec(
    chat.slice(payloadTypeStart)
  );
  const payloadTypeEnd = payloadTypeCloseMatch ? payloadTypeStart + payloadTypeCloseMatch.index : -1;
  const payloadTypeCloseLength = '        };'.length;

  if (
    settingsCommandStart === -1 ||
    payloadTypeStart === -1 ||
    payloadTypeEnd === -1
  ) {
    throw new Error('[nextchat] failed to locate settings import prompt');
  }

  const payloadType = chat.slice(payloadTypeStart, payloadTypeEnd + payloadTypeCloseLength);
  if (!payloadType.includes('customModels?: string;')) {
    const eol = payloadType.includes('\r\n') ? '\r\n' : '\n';
    const patchedPayloadType = payloadType.replace(
      '          url?: string;',
      `          url?: string;${eol}          customModels?: string;`
    );
    chat =
      chat.slice(0, payloadTypeStart) +
      patchedPayloadType +
      chat.slice(payloadTypeEnd + payloadTypeCloseLength);
  }

  const patchedImportBlockStart = chat.indexOf(
    '        if (payload.key || payload.url || payload.customModels) {',
    settingsCommandStart
  );
  const unpatchedImportBlockStart = chat.indexOf('        if (payload.key || payload.url) {', settingsCommandStart);
  if (patchedImportBlockStart !== -1 && unpatchedImportBlockStart === -1) {
    fs.writeFileSync(chatPath, chat);
    return;
  }

  const replacement = `        if (payload.key || payload.url || payload.customModels) {
          // DONE_HUB_SILENT_SETTINGS_IMPORT: playground links are generated by Done Hub.
          if (payload.key) {
            accessStore.update(
              (access) => (access.openaiApiKey = payload.key!),
            );
          }
          if (payload.url) {
            accessStore.update((access) => (access.openaiUrl = payload.url!));
          }
          if (payload.customModels) {
            // DONE_HUB_CUSTOM_MODELS_IMPORT: keep the model selector aligned with Done Hub groups.
            useAppConfig
              .getState()
              .update((config) => (config.customModels = payload.customModels!));
          }
          accessStore.update((access) => (access.useCustomConfig = true));

          try {
            const url = new URL(window.location.href);
            const queryIndex = url.hash.indexOf("?");
            if (queryIndex !== -1) {
              const hashPath = url.hash.slice(0, queryIndex);
              const hashSearch = new URLSearchParams(url.hash.slice(queryIndex + 1));
              hashSearch.delete("settings");
              const nextHashSearch = hashSearch.toString();
              url.hash = nextHashSearch ? \`\${hashPath}?\${nextHashSearch}\` : hashPath;
              window.history.replaceState(null, "", url.toString());
            }
          } catch {
            // Keep the original URL if the browser blocks hash cleanup.
          }
        }`;

  const importBlockCloseMatch = /        }\r?\n      } catch {/.exec(chat.slice(unpatchedImportBlockStart));
  const importBlockEnd = importBlockCloseMatch ? unpatchedImportBlockStart + importBlockCloseMatch.index : -1;
  const importBlockCloseLength = '        }'.length;

  if (unpatchedImportBlockStart === -1 || importBlockEnd === -1) {
    throw new Error('[nextchat] failed to locate settings import prompt');
  }

  const patched =
    chat.slice(0, unpatchedImportBlockStart) +
    replacement +
    chat.slice(importBlockEnd + importBlockCloseLength);

  fs.writeFileSync(chatPath, patched);
}

function installAndBuild(repoDir) {
  const env = {
    ...process.env,
    npm_config_registry: process.env.npm_config_registry || 'https://registry.npmjs.org',
    NEXTCHAT_BASE_PATH: basePath,
    BUILD_MODE: buildMode,
    BUILD_APP: '1'
  };

  try {
    run('corepack', ['enable'], { cwd: repoDir, env });
    run('corepack', ['yarn', 'install', '--frozen-lockfile'], { cwd: repoDir, env });
    run('corepack', ['yarn', buildMode === 'export' ? 'export' : 'build'], { cwd: repoDir, env });
    return;
  } catch (error) {
    console.warn('[nextchat] corepack/yarn failed, falling back to npm.');
  }

  run('npm', ['install', '--legacy-peer-deps'], { cwd: repoDir, env });
  run('npm', ['run', buildMode === 'export' ? 'export' : 'build'], { cwd: repoDir, env });
}

if (!keepWorktree) {
  rm(worktree);
}

if (!fs.existsSync(worktree)) {
  run('git', ['clone', '--depth', '1', '--branch', version, repo, worktree]);
}

patchNextConfig(worktree);
patchSilentSettingsImport(worktree);
const stamp = buildStamp();
const cacheHit = isBuildCacheFresh(worktree, stamp);

if (cacheHit) {
  console.log(`[nextchat] reusing cached ${version} build (${stamp.key.slice(0, 12)}) in ${worktree}`);
} else {
  installAndBuild(worktree);

  if (buildMode !== 'export') {
    copyDirIfExists(path.join(worktree, 'public'), path.join(worktree, '.next', 'standalone', 'public'));
    copyDirIfExists(path.join(worktree, '.next', 'static'), path.join(worktree, '.next', 'standalone', '.next', 'static'));
  }

  writeStamp(worktree, stamp);
}

if (buildMode === 'export') {
  copyDir(path.join(worktree, 'out'), outputDir);
  console.log(`[nextchat] exported ${version} to ${outputDir}`);
} else {
  console.log(`[nextchat] built ${version} in ${worktree}`);
  console.log(`[nextchat] start with: node scripts/start-nextchat.mjs`);
}
