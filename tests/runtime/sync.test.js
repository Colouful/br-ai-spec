const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createManifest(profile = 'vue', ides = ['cursor']) {
  return {
    schema_version: 1,
    manifest_type: 'hub-install',
    profile,
    ides,
    scenario_packages: [],
    roles: ['task-orchestrator'],
    skills: ['create-proposal'],
    rules: ['api-standard'],
    entry_role: 'task-orchestrator',
  };
}

function runCli(args, extraEnv = {}) {
  return spawnSync('node', ['./bin/cli.js', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
}

function runCliAsync(args, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', ['./bin/cli.js', ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ status: code, stdout, stderr });
    });
  });
}

function runInstall(args, extraEnv = {}) {
  return spawnSync('bash', ['./install.sh', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
}

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.once('error', (error) => {
      if (error && (error.code === 'EPERM' || error.code === 'EACCES')) {
        resolve({
          server: null,
          origin: null,
          skipped: true,
          reason: `${error.code}: ${error.message}`,
        });
        return;
      }

      throw error;
    });
    server.listen(0, () => {
      const address = server.address();
      resolve({
        server,
        origin: `http://127.0.0.1:${address.port}`,
        skipped: false,
        reason: null,
      });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function main() {
  const localTarget = createWorkspace('br-ai-spec-sync-local-');
  const localManifestPath = path.join(localTarget, 'manifest.json');
  writeJsonFile(localManifestPath, createManifest('vue'));

  let result = runCli(['sync', localTarget, '--manifest', localManifestPath, '--json']);
  assert.strictEqual(result.status, 0, result.stderr);
  let payload = JSON.parse(result.stdout);
  assert.strictEqual(payload.kind, 'sync-result');
  assert.strictEqual(payload.source.manifest, path.resolve(localManifestPath));
  assert.strictEqual(
    JSON.parse(fs.readFileSync(path.join(localTarget, '.ai-spec', 'manifest.json'), 'utf8')).profile,
    'vue',
  );

  const ideOverrideTarget = createWorkspace('br-ai-spec-sync-ide-');
  const ideOverrideManifestPath = path.join(ideOverrideTarget, 'manifest.json');
  writeJsonFile(ideOverrideManifestPath, createManifest('vue', ['cursor', 'claude']));
  result = runCli(['sync', ideOverrideTarget, '--manifest', ideOverrideManifestPath, '--json']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(ideOverrideTarget, '.cursor', 'commands', 'opsx-propose.md')));
  assert.ok(fs.existsSync(path.join(ideOverrideTarget, '.cursor', 'commands', 'opsx-apply.md')));
  assert.ok(fs.existsSync(path.join(ideOverrideTarget, '.cursor', 'commands', 'opsx-archive.md')));
  assert.ok(fs.existsSync(path.join(ideOverrideTarget, '.cursor', 'commands', 'opsx-explore.md')));
  assert.ok(fs.existsSync(path.join(ideOverrideTarget, '.claude', 'commands', 'spec-start.md')));
  assert.ok(!fs.existsSync(path.join(ideOverrideTarget, '.claude', 'commands', 'opsx-propose.md')));

  const remoteTarget = createWorkspace('br-ai-spec-sync-remote-');
  const remoteServer = await startServer((req, res) => {
    if (req.url === '/manifest.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(createManifest('react')));
      return;
    }
    if (req.url === '/invalid.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{not-json');
      return;
    }
    if (req.url === '/timeout.json') {
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  if (!remoteServer.skipped) {
    const { server, origin } = remoteServer;
    try {
      const remoteManifestUrl = `${origin}/manifest.json`;
      result = await runCliAsync(['sync', remoteTarget, '--manifest', remoteManifestUrl, '--json']);
      assert.strictEqual(result.status, 0, result.stderr);
      payload = JSON.parse(result.stdout);
      assert.strictEqual(payload.source.manifest, remoteManifestUrl);

      const lock = JSON.parse(fs.readFileSync(path.join(remoteTarget, '.ai-spec', 'lock.json'), 'utf8'));
      const sources = JSON.parse(fs.readFileSync(path.join(remoteTarget, '.ai-spec', 'sources.json'), 'utf8'));
      assert.strictEqual(lock.source.manifest, remoteManifestUrl);
      assert.strictEqual(sources.manifest.source, remoteManifestUrl);

      result = await runCliAsync(['sync', createWorkspace('br-ai-spec-sync-invalid-'), '--manifest', `${origin}/invalid.json`, '--json']);
      assert.strictEqual(result.status, 1);
      assert.ok(result.stderr.includes('Remote manifest is not valid JSON'));

      result = await runCliAsync(['sync', createWorkspace('br-ai-spec-sync-404-'), '--manifest', `${origin}/missing.json`, '--json']);
      assert.strictEqual(result.status, 1);
      assert.ok(result.stderr.includes('Remote manifest request failed with status 404'));

      result = await runCliAsync(
        ['sync', createWorkspace('br-ai-spec-sync-timeout-'), '--manifest', `${origin}/timeout.json`, '--json'],
        { AI_SPEC_REMOTE_MANIFEST_TIMEOUT_MS: '50' },
      );
      assert.strictEqual(result.status, 1);
      assert.ok(result.stderr.includes('Remote manifest request timed out after 50ms'));
    } finally {
      await closeServer(server);
    }
  } else {
    console.warn(`sync test notice: remote HTTP manifest checks skipped (${remoteServer.reason})`);
  }

  const wrapperTarget = createWorkspace('br-ai-spec-install-sync-');
  const wrapperManifestPath = path.join(wrapperTarget, 'wrapper-manifest.json');
  writeJsonFile(wrapperManifestPath, createManifest('vue', ['cursor', 'claude']));
  result = runInstall(['sync', wrapperTarget, '--manifest', wrapperManifestPath], {
    BR_AI_SPEC_LOCAL: repoRoot,
  });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(wrapperTarget, '.ai-spec', 'lock.json')));
  assert.ok(fs.existsSync(path.join(wrapperTarget, '.cursor', 'commands', 'opsx-propose.md')));
  assert.ok(!fs.existsSync(path.join(wrapperTarget, '.claude', 'commands', 'opsx-propose.md')));

  console.log('sync test passed: local/remote manifests, cursor-only command overrides, remote failures, timeout handling, and install.sh sync wrapper all behave as expected');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
