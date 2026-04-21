/**
 * ai-spec-auto visual <subcmd>
 *
 * Opt-in 接入入口，完全不参与 init / sync 主链。仅在用户主动调用时才落盘
 * .ai-spec/visual-bridge.json，并提供连通性自检。
 *
 * 子命令：
 *   - init     交互式生成 visual-bridge.json
 *   - disable  关闭 enabled
 *   - status   显示当前桥接配置 + inbox 状态
 *   - test     单次 ping visual + 拉取 pending + 推送一条 receipt 探针
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const { URL } = require('url');

const BRIDGE_REL_PATH = '.ai-spec/visual-bridge.json';
const INBOX_REL_PATH = '.ai-spec/inbox';

function bridgePath(targetDir) {
  return path.join(targetDir, BRIDGE_REL_PATH);
}

function inboxPath(targetDir) {
  return path.join(targetDir, INBOX_REL_PATH);
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_err) {
    // noop
  }
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (_err) {
    return null;
  }
}

function loadBridge(targetDir) {
  return safeReadJson(bridgePath(targetDir));
}

function writeBridge(targetDir, data) {
  const file = bridgePath(targetDir);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  return file;
}

function ask(rl, question, defaultValue) {
  return new Promise((resolve) => {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    rl.question(`${question}${suffix}: `, (answer) => {
      const trimmed = String(answer || '').trim();
      resolve(trimmed || defaultValue || '');
    });
  });
}

function generateConnectToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function runInit(targetDir, args) {
  const yes = args.includes('--yes') || args.includes('-y');
  const existing = loadBridge(targetDir) || {};

  let serverUrl = existing.server_url || 'http://localhost:3000';
  let workspaceId = existing.workspace_id || path.basename(targetDir);
  let agentId = existing.agent_id || 'ai-spec-auto';
  let pushMode = existing.push_mode || 'hook';
  let inboxTransport = existing.inbox_transport || 'http-pull';
  let pollHint = existing.poll_interval_hint || 'on-cli-tick';
  let connectToken = existing.connect_token || generateConnectToken();

  if (!yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      serverUrl = await ask(rl, 'Visual server URL', serverUrl);
      workspaceId = await ask(rl, 'Workspace ID', workspaceId);
      agentId = await ask(rl, 'Agent ID', agentId);
      pushMode = await ask(rl, 'Push mode (hook|collector)', pushMode);
      inboxTransport = await ask(rl, 'Inbox transport (http-pull|file-inbox)', inboxTransport);
      pollHint = await ask(rl, 'Poll interval hint', pollHint);
      const useToken = await ask(rl, 'Connect token (leave empty to keep generated)', '');
      if (useToken) connectToken = useToken;
    } finally {
      rl.close();
    }
  }

  const data = {
    schema_version: 1,
    enabled: true,
    server_url: serverUrl,
    workspace_id: workspaceId,
    agent_id: agentId,
    connect_token: connectToken,
    push_mode: pushMode,
    inbox_transport: inboxTransport,
    poll_interval_hint: pollHint,
    updated_at: new Date().toISOString(),
  };
  const file = writeBridge(targetDir, data);

  if (inboxTransport === 'file-inbox' || inboxTransport === 'http-pull') {
    ensureDir(inboxPath(targetDir));
  }

  console.log(`[visual] bridge written: ${file}`);
  console.log('[visual] connect_token (share with visual UI):');
  console.log(`         ${connectToken}`);
  return 0;
}

function runDisable(targetDir) {
  const existing = loadBridge(targetDir);
  if (!existing) {
    console.log('[visual] bridge not configured; nothing to disable');
    return 0;
  }
  const next = { ...existing, enabled: false, updated_at: new Date().toISOString() };
  writeBridge(targetDir, next);
  console.log('[visual] bridge disabled');
  return 0;
}

function runStatus(targetDir) {
  const bridge = loadBridge(targetDir);
  if (!bridge) {
    console.log('[visual] not configured (.ai-spec/visual-bridge.json absent)');
    return 0;
  }
  const inboxDir = inboxPath(targetDir);
  let pending = 0;
  let applied = 0;
  if (fs.existsSync(inboxDir)) {
    try {
      const items = fs.readdirSync(inboxDir);
      pending = items.filter((name) => /^control-.*\.json$/.test(name)).length;
      const appliedDir = path.join(inboxDir, '.applied');
      if (fs.existsSync(appliedDir)) {
        applied = fs.readdirSync(appliedDir).length;
      }
    } catch (_err) {
      // noop
    }
  }

  console.log(JSON.stringify({
    enabled: !!bridge.enabled,
    server_url: bridge.server_url || null,
    workspace_id: bridge.workspace_id || null,
    agent_id: bridge.agent_id || null,
    push_mode: bridge.push_mode || null,
    inbox_transport: bridge.inbox_transport || 'http-pull',
    inbox: { pending, applied },
    updated_at: bridge.updated_at || null,
  }, null, 2));
  return 0;
}

function httpPing(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      resolve({ ok: false, error: `invalid url: ${err.message}` });
      return;
    }
    const protocol = parsed.protocol === 'https:' ? https : http;
    const req = protocol.request(parsed, { method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 500, statusCode: res.statusCode, body: body.slice(0, 200) });
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('timeout')), timeoutMs);
    req.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
    req.on('close', () => clearTimeout(timer));
    req.end();
  });
}

async function runTest(targetDir) {
  const bridge = loadBridge(targetDir);
  if (!bridge || !bridge.enabled) {
    console.log('[visual] bridge disabled or missing; nothing to test');
    return 0;
  }
  const serverUrl = bridge.server_url;
  if (!serverUrl) {
    console.error('[visual] missing server_url');
    return 1;
  }

  const ping = await httpPing(serverUrl);
  console.log(`[visual] ping ${serverUrl} → ${ping.ok ? 'ok' : 'fail'}${ping.statusCode ? ` (status ${ping.statusCode})` : ''}${ping.error ? ` (${ping.error})` : ''}`);

  let pulled = 0;
  try {
    const { pullPendingControls } = require('../internal/visual-hooks/control-puller');
    const result = await pullPendingControls({ targetDir, timeoutMs: 1500 });
    pulled = result.written || 0;
    console.log(`[visual] pull pending → ${pulled} written (transport=${result.transport})`);
  } catch (err) {
    console.log(`[visual] pull pending failed: ${err.message}`);
  }

  try {
    const { pushReceipts } = require('../internal/visual-hooks/receipt-pusher');
    const probe = [{
      eventType: 'control.receipt',
      outbox_id: `probe_${Date.now()}`,
      command: 'approve_gate',
      result: 'applied',
      reason: 'visual test probe',
      applied_state_snapshot: null,
      received_at: new Date().toISOString(),
    }];
    const pushResult = await pushReceipts({ targetDir, receipts: probe, timeoutMs: 1500 });
    console.log(`[visual] push probe receipt → ${pushResult.pushed ? 'ok' : 'fail'}${pushResult.error ? ` (${pushResult.error})` : ''}`);
  } catch (err) {
    console.log(`[visual] push probe failed: ${err.message}`);
  }

  return 0;
}

function printUsage() {
  console.log('Usage: ai-spec-auto visual <init|disable|status|test> [--target <dir>]');
}

async function main(argv) {
  const args = [...argv];
  let target = process.cwd();
  const remaining = [];
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--target') {
      target = path.resolve(process.cwd(), args.shift() || '.');
    } else {
      remaining.push(arg);
    }
  }

  const sub = remaining.shift();
  if (!sub || sub === '-h' || sub === '--help') {
    printUsage();
    return 0;
  }

  switch (sub) {
    case 'init':
      return runInit(target, remaining);
    case 'disable':
      return runDisable(target);
    case 'status':
      return runStatus(target);
    case 'test':
      return runTest(target);
    default:
      printUsage();
      return 1;
  }
}

module.exports = { main };
