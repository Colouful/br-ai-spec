const assert = require('assert');

const {
  resolveGlobalLauncherCommand,
  renderCommandTemplateContent,
} = require('../../bin/command-template-renderer');

function main() {
  assert.strictEqual(resolveGlobalLauncherCommand('darwin'), '"$HOME/.ai-spec-auto/bin/ai-spec-auto"');
  assert.strictEqual(resolveGlobalLauncherCommand('linux'), '"$HOME/.ai-spec-auto/bin/ai-spec-auto"');
  assert.strictEqual(resolveGlobalLauncherCommand('win32'), '"%USERPROFILE%\\.ai-spec-auto\\bin\\ai-spec-auto.cmd"');

  const renderedUnix = renderCommandTemplateContent(
    './node_modules/.bin/ai-spec-auto protocol-step --target . --json',
    { platform: 'darwin' },
  );
  assert.strictEqual(renderedUnix, '"$HOME/.ai-spec-auto/bin/ai-spec-auto" protocol-step --target . --json');

  const renderedWindows = renderCommandTemplateContent(
    './node_modules/.bin/ai-spec-auto protocol-status --target . --json',
    { platform: 'win32' },
  );
  assert.strictEqual(renderedWindows, '"%USERPROFILE%\\.ai-spec-auto\\bin\\ai-spec-auto.cmd" protocol-status --target . --json');

  console.log('command template renderer test passed: launcher command rendering works');
}

main();
