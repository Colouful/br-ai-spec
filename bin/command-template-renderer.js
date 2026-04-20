const fs = require('fs');
const path = require('path');

const LOCAL_CLI_PATTERN = /\.\/node_modules\/\.bin\/ai-spec-auto/g;

function resolveGlobalLauncherCommand(platform = process.platform) {
  if (platform === 'win32') {
    return '"%USERPROFILE%\\.ai-spec-auto\\bin\\ai-spec-auto.cmd"';
  }
  return '"$HOME/.ai-spec-auto/bin/ai-spec-auto"';
}

function renderCommandTemplateContent(content, options = {}) {
  const platform = options.platform || process.platform;
  const launcherCommand = options.launcherCommand || resolveGlobalLauncherCommand(platform);
  return String(content).replace(LOCAL_CLI_PATTERN, launcherCommand);
}

function readRenderedCommandTemplate(sourcePath, options = {}) {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  return renderCommandTemplateContent(raw, options);
}

module.exports = {
  resolveGlobalLauncherCommand,
  renderCommandTemplateContent,
  readRenderedCommandTemplate,
};
