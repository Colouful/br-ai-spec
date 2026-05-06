/**
 * P3.3 审计日志持久化测试
 */

const assert = require('assert');

const {
  AUDIT_EVENT_TYPES,
  AUDIT_SEVERITY,
  AUDIT_RESULT,
  AuditLog,
  createAuditLog,
  redactSensitive,
  redactObject,
} = require('../../src/governance/audit-log');

// ============================================================
// 常量测试
// ============================================================

async function testConstantsExist() {
  console.log('  TC01: 审计常量存在且冻结');
  assert.ok(AUDIT_EVENT_TYPES);
  assert.ok(AUDIT_SEVERITY);
  assert.ok(AUDIT_RESULT);
  assert.strictEqual(Object.isFrozen(AUDIT_EVENT_TYPES), true);
  assert.strictEqual(Object.isFrozen(AUDIT_SEVERITY), true);
  assert.strictEqual(Object.isFrozen(AUDIT_RESULT), true);
  assert.strictEqual(AUDIT_EVENT_TYPES.ASSET_CHANGE, 'asset_change');
  assert.strictEqual(AUDIT_SEVERITY.BLOCKING, 'blocking');
  assert.strictEqual(AUDIT_RESULT.DENIED, 'denied');
}

// ============================================================
// 红脱测试
// ============================================================

async function testRedactSensitive() {
  console.log('  TC02: redactSensitive 红脱敏感信息');
  assert.strictEqual(
    redactSensitive('连接 password=db_secret123 成功'),
    '连接 password=[REDACTED] 成功'
  );
  assert.strictEqual(
    redactSensitive('api_key=sk-1234567890'),
    'api_key=[REDACTED]'
  );
  assert.strictEqual(
    redactSensitive('secret: "my-secret-value"'),
    'secret=[REDACTED]'
  );
  assert.strictEqual(
    redactSensitive('token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0'),
    'token=[REDACTED]'
  );
  assert.strictEqual(
    redactSensitive('access_key=AKIAIOSFODNN7EXAMPLE'),
    'access_key=[REDACTED]'
  );
  assert.strictEqual(
    redactSensitive('正常文本无敏感信息'),
    '正常文本无敏感信息'
  );
}

async function testRedactSensitiveNonString() {
  console.log('  TC03: redactSensitive 非字符串返回原值');
  assert.strictEqual(redactSensitive(123), 123);
  assert.strictEqual(redactSensitive(null), null);
  assert.strictEqual(redactSensitive(undefined), undefined);
}

async function testRedactObject() {
  console.log('  TC04: redactObject 递归红脱对象');
  const input = {
    name: 'test',
    config: {
      password: 'secret123',
      nested: {
        api_key: 'sk-abcdef',
      },
    },
    list: ['token=abc', 'normal'],
  };
  const result = redactObject(input);
  assert.strictEqual(result.name, 'test');
  assert.ok(result.config.password.includes('[REDACTED]'));
  assert.ok(result.config.nested.api_key.includes('[REDACTED]'));
  assert.ok(result.list[0].includes('[REDACTED]'));
  assert.strictEqual(result.list[1], 'normal');
}

// ============================================================
// 写入测试
// ============================================================

async function testRecordEvent() {
  console.log('  TC05: 写入审计事件');
  const log = createAuditLog();
  const entry = log.record({
    eventType: 'asset_change',
    actor: 'user-1',
    target: 'asset-1',
    action: 'publish',
    result: 'success',
    severity: 'info',
    message: '发布资产 asset-1',
  });

  assert.ok(entry.eventId);
  assert.strictEqual(entry.eventType, 'asset_change');
  assert.strictEqual(entry.actor, 'user-1');
  assert.strictEqual(entry.target, 'asset-1');
  assert.strictEqual(entry.action, 'publish');
  assert.strictEqual(entry.result, 'success');
  assert.strictEqual(entry.severity, 'info');
  assert.ok(entry.timestamp);
  assert.strictEqual(log.size, 1);
}

async function testRecordWithRedaction() {
  console.log('  TC06: 写入时自动红脱');
  const log = createAuditLog();
  const entry = log.record({
    eventType: 'security_scan',
    actor: 'system',
    action: 'scan',
    message: '发现 password=admin123',
    metadata: { apiKey: 'api_key=sk-secret' },
  });

  assert.ok(entry.message.includes('[REDACTED]'));
  assert.ok(!entry.message.includes('admin123'));
  assert.ok(entry.metadata.apiKey.includes('[REDACTED]'));
}

async function testRecordInvalidEventType() {
  console.log('  TC07: 无效事件类型报错');
  const log = createAuditLog();
  assert.throws(() => log.record({ eventType: 'invalid' }), /无效事件类型/);
}

async function testRecordInvalidSeverity() {
  console.log('  TC08: 无效严重级别报错');
  const log = createAuditLog();
  assert.throws(
    () => log.record({ eventType: 'asset_change', severity: 'invalid' }),
    /无效严重级别/
  );
}

async function testRecordInvalidResult() {
  console.log('  TC09: 无效结果报错');
  const log = createAuditLog();
  assert.throws(
    () => log.record({ eventType: 'asset_change', result: 'invalid' }),
    /无效结果/
  );
}

async function testRecordDefaults() {
  console.log('  TC10: 写入默认值正确');
  const log = createAuditLog();
  const entry = log.record({ eventType: 'asset_change' });

  assert.strictEqual(entry.actor, 'system');
  assert.strictEqual(entry.target, '');
  assert.strictEqual(entry.action, '');
  assert.strictEqual(entry.result, 'success');
  assert.strictEqual(entry.severity, 'info');
  assert.strictEqual(entry.message, '');
}

async function testMaxEntries() {
  console.log('  TC11: 超出最大条目数时移除最旧的');
  const log = createAuditLog({ maxEntries: 3 });

  log.record({ eventType: 'asset_change', message: 'first' });
  log.record({ eventType: 'asset_change', message: 'second' });
  log.record({ eventType: 'asset_change', message: 'third' });
  log.record({ eventType: 'asset_change', message: 'fourth' });

  assert.strictEqual(log.size, 3);
  const all = log.query();
  assert.strictEqual(all[0].message, 'second');
  assert.strictEqual(all[2].message, 'fourth');
}

// ============================================================
// 查询测试
// ============================================================

async function testQueryByEventType() {
  console.log('  TC12: 按事件类型查询');
  const log = createAuditLog();
  log.record({ eventType: 'asset_change', message: 'a' });
  log.record({ eventType: 'permission_change', message: 'b' });
  log.record({ eventType: 'asset_change', message: 'c' });

  const result = log.query({ eventType: 'asset_change' });
  assert.strictEqual(result.length, 2);
}

async function testQueryByActor() {
  console.log('  TC13: 按操作者查询');
  const log = createAuditLog();
  log.record({ eventType: 'asset_change', actor: 'user-1' });
  log.record({ eventType: 'asset_change', actor: 'user-2' });

  const result = log.query({ actor: 'user-1' });
  assert.strictEqual(result.length, 1);
}

async function testQueryBySeverity() {
  console.log('  TC14: 按严重级别查询');
  const log = createAuditLog();
  log.record({ eventType: 'asset_change', severity: 'info' });
  log.record({ eventType: 'policy_denied', severity: 'error' });

  const result = log.query({ severity: 'error' });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].eventType, 'policy_denied');
}

async function testQueryByResult() {
  console.log('  TC15: 按结果查询');
  const log = createAuditLog();
  log.record({ eventType: 'asset_change', result: 'success' });
  log.record({ eventType: 'policy_denied', result: 'denied' });

  const result = log.query({ result: 'denied' });
  assert.strictEqual(result.length, 1);
}

async function testQueryWithLimit() {
  console.log('  TC16: 查询限制数量');
  const log = createAuditLog();
  for (let i = 0; i < 10; i++) {
    log.record({ eventType: 'asset_change' });
  }

  const result = log.query({ limit: 3 });
  assert.strictEqual(result.length, 3);
}

async function testQueryByTarget() {
  console.log('  TC17: 按目标查询');
  const log = createAuditLog();
  log.record({ eventType: 'asset_change', target: 'asset-1' });
  log.record({ eventType: 'asset_change', target: 'asset-2' });

  const result = log.query({ target: 'asset-1' });
  assert.strictEqual(result.length, 1);
}

// ============================================================
// 统计测试
// ============================================================

async function testGetStats() {
  console.log('  TC18: 获取统计');
  const log = createAuditLog();
  log.record({ eventType: 'asset_change', severity: 'info', result: 'success' });
  log.record({ eventType: 'asset_change', severity: 'warn', result: 'success' });
  log.record({ eventType: 'policy_denied', severity: 'error', result: 'denied' });

  const stats = log.getStats();
  assert.strictEqual(stats.total, 3);
  assert.strictEqual(stats.byType.asset_change, 2);
  assert.strictEqual(stats.byType.policy_denied, 1);
  assert.strictEqual(stats.bySeverity.info, 1);
  assert.strictEqual(stats.bySeverity.warn, 1);
  assert.strictEqual(stats.bySeverity.error, 1);
  assert.strictEqual(stats.byResult.success, 2);
  assert.strictEqual(stats.byResult.denied, 1);
}

// ============================================================
// 导出测试
// ============================================================

async function testExportJson() {
  console.log('  TC19: 导出 JSON 格式');
  const log = createAuditLog();
  log.record({ eventType: 'asset_change' });

  const json = log.export('json');
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].eventType, 'asset_change');
}

async function testExportNdjson() {
  console.log('  TC20: 导出 NDJSON 格式');
  const log = createAuditLog();
  log.record({ eventType: 'asset_change' });
  log.record({ eventType: 'permission_change' });

  const ndjson = log.export('ndjson');
  const lines = ndjson.split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(JSON.parse(lines[0]).eventType, 'asset_change');
  assert.strictEqual(JSON.parse(lines[1]).eventType, 'permission_change');
}

// ============================================================
// 清空与重置
// ============================================================

async function testClear() {
  console.log('  TC21: 清空审计日志');
  const log = createAuditLog();
  log.record({ eventType: 'asset_change' });
  log.record({ eventType: 'permission_change' });
  assert.strictEqual(log.size, 2);

  log.clear();
  assert.strictEqual(log.size, 0);
}

async function testToJSON() {
  console.log('  TC22: toJSON 导出');
  const log = createAuditLog();
  log.record({ eventType: 'asset_change', message: 'test' });

  const arr = log.toJSON();
  assert.strictEqual(arr.length, 1);
  assert.strictEqual(arr[0].eventType, 'asset_change');
}

// ============================================================
// 返回副本
// ============================================================

async function testQueryReturnsCopy() {
  console.log('  TC23: query 返回副本');
  const log = createAuditLog();
  log.record({ eventType: 'asset_change' });

  const result = log.query();
  result[0].eventType = 'modified';

  const result2 = log.query();
  assert.strictEqual(result2[0].eventType, 'asset_change');
}

// ============================================================
// 完整场景
// ============================================================

async function testFullAuditScenario() {
  console.log('  TC24: 完整审计场景');
  const log = createAuditLog();

  // 记录资产变更
  log.record({
    eventType: 'asset_change',
    actor: 'dev-1',
    target: 'login-module',
    action: 'publish',
    result: 'success',
    message: '发布 login-module v2.0.0',
  });

  // 记录权限变更
  log.record({
    eventType: 'permission_change',
    actor: 'admin',
    target: 'user-1',
    action: 'grant',
    result: 'success',
    severity: 'warn',
    message: '授予 user-1 publish 权限',
  });

  // 记录策略拒绝
  log.record({
    eventType: 'policy_denied',
    actor: 'dev-2',
    target: 'secrets.yml',
    action: 'read',
    result: 'denied',
    severity: 'error',
    message: '读取 secrets.yml 被安全策略拒绝',
  });

  // 验证统计
  const stats = log.getStats();
  assert.strictEqual(stats.total, 3);
  assert.strictEqual(stats.byType.asset_change, 1);
  assert.strictEqual(stats.byType.permission_change, 1);
  assert.strictEqual(stats.byType.policy_denied, 1);

  // 验证查询
  const denied = log.query({ result: 'denied' });
  assert.strictEqual(denied.length, 1);
  assert.strictEqual(denied[0].eventType, 'policy_denied');

  // 验证导出
  const json = JSON.parse(log.export('json'));
  assert.strictEqual(json.length, 3);
}

// ============================================================
// 主测试入口
// ============================================================

async function main() {
  console.log('=== audit-log.test.js ===');

  const tests = [
    testConstantsExist,
    testRedactSensitive,
    testRedactSensitiveNonString,
    testRedactObject,
    testRecordEvent,
    testRecordWithRedaction,
    testRecordInvalidEventType,
    testRecordInvalidSeverity,
    testRecordInvalidResult,
    testRecordDefaults,
    testMaxEntries,
    testQueryByEventType,
    testQueryByActor,
    testQueryBySeverity,
    testQueryByResult,
    testQueryWithLimit,
    testQueryByTarget,
    testGetStats,
    testExportJson,
    testExportNdjson,
    testClear,
    testToJSON,
    testQueryReturnsCopy,
    testFullAuditScenario,
  ];

  let passed = 0;
  let failed = 0;

  for (const testFn of tests) {
    try {
      await testFn();
      passed++;
    } catch (err) {
      failed++;
      console.error(`  FAIL: ${testFn.name} — ${err.message}`);
    }
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败, 共 ${tests.length} 个`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
