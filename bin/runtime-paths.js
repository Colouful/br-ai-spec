const fs = require('fs');
const path = require('path');

function buildEntry(targetDir, relPath, legacyRelPath = null) {
  const legacyRelPaths = Array.isArray(legacyRelPath)
    ? legacyRelPath.filter(Boolean)
    : [legacyRelPath].filter(Boolean);
  return {
    relPath,
    path: path.join(targetDir, relPath),
    legacyRelPath: legacyRelPaths[0] || null,
    legacyPath: legacyRelPaths[0] ? path.join(targetDir, legacyRelPaths[0]) : null,
    legacyRelPaths,
    legacyPaths: legacyRelPaths.map((item) => path.join(targetDir, item)),
  };
}

function resolveRuntimePaths(targetDir) {
  return {
    aiSpecDir: buildEntry(targetDir, path.join('.ai-spec')),
    internalDir: buildEntry(targetDir, path.join('.ai-spec', 'internal')),
    currentRun: buildEntry(targetDir, path.join('.ai-spec', 'current-run.json')),
    runsDir: buildEntry(
      targetDir,
      path.join('.ai-spec', '.history', 'runs'),
      [path.join('.ai-spec', 'internal', 'history', 'runs'), path.join('.ai-spec', 'runs')],
    ),
    tmpDir: buildEntry(targetDir, path.join('.ai-spec', 'internal', 'tmp'), path.join('.ai-spec', 'tmp')),
    tmpTaskOrchestratorReply: buildEntry(
      targetDir,
      path.join('.ai-spec', 'internal', 'tmp', 'task-orchestrator-reply.md'),
      path.join('.ai-spec', 'tmp', 'task-orchestrator-reply.md'),
    ),
    tmpCurrentDispatch: buildEntry(
      targetDir,
      path.join('.ai-spec', 'internal', 'tmp', 'current-dispatch.json'),
      path.join('.ai-spec', 'tmp', 'current-dispatch.json'),
    ),
    tmpCurrentExecution: buildEntry(
      targetDir,
      path.join('.ai-spec', 'internal', 'tmp', 'current-execution.json'),
      path.join('.ai-spec', 'tmp', 'current-execution.json'),
    ),
    tmpCurrentRuntimeAction: buildEntry(
      targetDir,
      path.join('.ai-spec', 'internal', 'tmp', 'current-runtime-action.json'),
      path.join('.ai-spec', 'tmp', 'current-runtime-action.json'),
    ),
    currentDispatch: buildEntry(
      targetDir,
      path.join('.ai-spec', 'internal', 'current-dispatch.json'),
      path.join('.ai-spec', 'current-dispatch.json'),
    ),
    dispatchesDir: buildEntry(
      targetDir,
      path.join('.ai-spec', '.history', 'dispatches'),
      [
        path.join('.ai-spec', 'internal', 'history', 'dispatches'),
        path.join('.ai-spec', 'internal', 'dispatches'),
        path.join('.ai-spec', 'dispatches'),
      ],
    ),
    currentExecutionJson: buildEntry(
      targetDir,
      path.join('.ai-spec', 'internal', 'current-execution.json'),
      path.join('.ai-spec', 'current-execution.json'),
    ),
    currentExecutionMd: buildEntry(
      targetDir,
      path.join('.ai-spec', 'internal', 'current-execution.md'),
      path.join('.ai-spec', 'current-execution.md'),
    ),
    executionsDir: buildEntry(
      targetDir,
      path.join('.ai-spec', '.history', 'executions'),
      [
        path.join('.ai-spec', 'internal', 'history', 'executions'),
        path.join('.ai-spec', 'internal', 'executions'),
        path.join('.ai-spec', 'executions'),
      ],
    ),
    currentRuntimeActionJson: buildEntry(
      targetDir,
      path.join('.ai-spec', 'internal', 'current-runtime-action.json'),
      path.join('.ai-spec', 'current-runtime-action.json'),
    ),
    currentRuntimeActionMd: buildEntry(
      targetDir,
      path.join('.ai-spec', 'internal', 'current-runtime-action.md'),
      path.join('.ai-spec', 'current-runtime-action.md'),
    ),
    runtimeActionsDir: buildEntry(
      targetDir,
      path.join('.ai-spec', '.history', 'runtime-actions'),
      [
        path.join('.ai-spec', 'internal', 'history', 'runtime-actions'),
        path.join('.ai-spec', 'internal', 'runtime-actions'),
        path.join('.ai-spec', 'runtime-actions'),
      ],
    ),
    runnerConsumedDir: buildEntry(
      targetDir,
      path.join('.ai-spec', 'internal', 'runner', 'consumed'),
      path.join('.ai-spec', 'runner', 'consumed'),
    ),
  };
}

function getExistingPath(entry) {
  if (fs.existsSync(entry.path)) {
    return entry.path;
  }
  for (const candidate of entry.legacyPaths || []) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return entry.path;
}

function getExistingRelPath(entry) {
  if (fs.existsSync(entry.path)) {
    return entry.relPath;
  }
  const legacyRelPaths = entry.legacyRelPaths || [];
  const legacyPaths = entry.legacyPaths || [];
  for (let index = 0; index < legacyPaths.length; index += 1) {
    if (fs.existsSync(legacyPaths[index])) {
      return legacyRelPaths[index];
    }
  }
  return entry.relPath;
}

function getCandidatePaths(entry) {
  return [entry.path, ...(entry.legacyPaths || [])].filter(Boolean);
}

function shouldPersistHistory() {
  return process.env.AI_SPEC_PERSIST_HISTORY === '1' || process.env.BR_AI_SPEC_DEBUG_HISTORY === '1';
}

module.exports = {
  resolveRuntimePaths,
  getExistingPath,
  getExistingRelPath,
  getCandidatePaths,
  shouldPersistHistory,
};
