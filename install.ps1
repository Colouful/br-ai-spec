<#
.SYNOPSIS
    br-ai-spec 规范库安装脚本 (PowerShell)
    适用于 Windows PowerShell 5.1+ / PowerShell Core 7+

.EXAMPLE
    .\install.ps1 init
    .\install.ps1 init C:\projects\my-app
    .\install.ps1 update --ide cursor
    .\install.ps1 check
#>

param(
    [Parameter(Position = 0)]
    [ValidateSet("init", "update", "check", "uninstall", "help")]
    [string]$Command = "help",

    [Parameter(Position = 1)]
    [string]$TargetDir = ".",

    [string]$Ide = "all",

    [string]$Repo = "",

    [switch]$SkipOpenspec,

    [switch]$Help
)

$ErrorActionPreference = "Stop"
$Version = "1.0.0"
$DefaultRepo = "https://github.com/your-org/br-ai-spec.git"
$SpecRepo = if ($Repo) { $Repo } elseif ($env:BR_AI_SPEC_REPO) { $env:BR_AI_SPEC_REPO } else { $DefaultRepo }
$CacheDir = if ($env:BR_AI_SPEC_CACHE) { $env:BR_AI_SPEC_CACHE } else { Join-Path $HOME ".br-ai-spec" }

$IdeDirs = @("claude", "cursor", "opencode", "trae")
$ProjectSpecificRules = @("01-项目概述.md", "03-项目结构.md")

# ---- 输出 ----
function Write-Info  { param($Msg) Write-Host "i " -ForegroundColor Blue -NoNewline; Write-Host $Msg }
function Write-Ok    { param($Msg) Write-Host "√ " -ForegroundColor Green -NoNewline; Write-Host $Msg }
function Write-Warn  { param($Msg) Write-Host "! " -ForegroundColor Yellow -NoNewline; Write-Host $Msg }
function Write-Err   { param($Msg) Write-Host "x " -ForegroundColor Red -NoNewline; Write-Host $Msg }

# ---- 创建 Junction（Windows 目录链接） ----
function New-Link {
    param([string]$Target, [string]$LinkPath)

    if (Test-Path $LinkPath) { Remove-Item $LinkPath -Recurse -Force }

    $resolvedTarget = (Resolve-Path (Join-Path (Split-Path $LinkPath -Parent) $Target) -ErrorAction SilentlyContinue)
    if ($resolvedTarget) {
        New-Item -ItemType Junction -Path $LinkPath -Target $resolvedTarget.Path | Out-Null
    }
    else {
        New-Item -ItemType Junction -Path $LinkPath -Target (Join-Path (Split-Path $LinkPath -Parent) $Target) | Out-Null
    }
}

# ---- 检测规范源 ----
function Get-SourceDir {
    $scriptDir = $PSScriptRoot
    if (!$scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }

    if ($scriptDir -and (Test-Path (Join-Path $scriptDir ".agents/rules")) -and (Test-Path (Join-Path $scriptDir ".agents/skills"))) {
        Write-Info "使用本地规范库: $scriptDir"
        return $scriptDir
    }

    if (Test-Path (Join-Path $CacheDir ".git")) {
        Write-Info "更新规范库缓存..."
        try { git -C $CacheDir pull --quiet 2>$null } catch { Write-Warn "缓存更新失败，使用现有版本" }
    }
    else {
        Write-Info "克隆规范库到 $CacheDir ..."
        git clone --quiet $SpecRepo $CacheDir
        if ($LASTEXITCODE -ne 0) { Write-Err "克隆失败: $SpecRepo"; exit 1 }
    }

    Write-Ok "规范库缓存就绪"
    return $CacheDir
}

# ---- 复制 .agents/ ----
function Copy-Agents {
    param([string]$Target, [string]$Source)

    $agentsDst = Join-Path $Target ".agents"
    New-Item -ItemType Directory -Path (Join-Path $agentsDst "rules") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $agentsDst "skills") -Force | Out-Null

    # skills: 全量同步
    Write-Info "同步 skills ..."
    $skillsDst = Join-Path $agentsDst "skills"
    if (Test-Path $skillsDst) { Remove-Item $skillsDst -Recurse -Force }
    Copy-Item -Path (Join-Path $Source ".agents/skills") -Destination $skillsDst -Recurse

    # rules: 逐文件，保护项目特有规则
    Write-Info "同步 rules ..."
    $rulesSrc = Join-Path $Source ".agents/rules"
    $rulesDst = Join-Path $agentsDst "rules"

    Get-ChildItem -Path $rulesSrc -File | ForEach-Object {
        $name = $_.Name
        $dstFile = Join-Path $rulesDst $name
        $isSpecific = $ProjectSpecificRules -contains $name

        if ($isSpecific -and (Test-Path $dstFile)) {
            Write-Warn "跳过项目特有规则: $name（已存在）"
        }
        else {
            Copy-Item $_.FullName -Destination $dstFile -Force
            if ($isSpecific) { Write-Info "已生成模板: $name -> 请根据项目实际情况修改" }
        }
    }

    Write-Ok ".agents/ 同步完成"
}

# ---- 创建 IDE 链接 ----
function New-IdeLinks {
    param([string]$Target)

    foreach ($ide in $IdeDirs) {
        if ($Ide -ne "all" -and $Ide -ne $ide) { continue }

        $ideDir = Join-Path $Target ".$ide"
        New-Item -ItemType Directory -Path $ideDir -Force | Out-Null

        New-Link -Target "../.agents/rules"  -LinkPath (Join-Path $ideDir "rules")
        New-Link -Target "../.agents/skills" -LinkPath (Join-Path $ideDir "skills")
        Write-Ok ".$ide/ 链接就绪"
    }
}

# ---- 复制 Cursor 额外文件 ----
function Copy-CursorExtras {
    param([string]$Target, [string]$Source)

    if ($Ide -ne "all" -and $Ide -ne "cursor") { return }

    $cursorDst = Join-Path $Target ".cursor"
    New-Item -ItemType Directory -Path $cursorDst -Force | Out-Null

    $cmdsSrc = Join-Path $Source ".cursor/commands"
    if (Test-Path $cmdsSrc) {
        $cmdsDst = Join-Path $cursorDst "commands"
        New-Item -ItemType Directory -Path $cmdsDst -Force | Out-Null
        Copy-Item -Path (Join-Path $cmdsSrc "*.md") -Destination $cmdsDst -Force -ErrorAction SilentlyContinue
        Write-Ok ".cursor/commands/ 已同步"
    }

    $mcpSrc = Join-Path $Source ".cursor/mcp.json"
    $mcpDst = Join-Path $cursorDst "mcp.json"
    if ((Test-Path $mcpSrc) -and !(Test-Path $mcpDst)) {
        Copy-Item $mcpSrc -Destination $mcpDst
        Write-Warn ".cursor/mcp.json 已生成 -> 请替换 project-id 与 access-token"
    }
}

# ---- 检查工具 ----
function Test-Tools {
    Write-Info "工具环境："

    try { $v = git --version; Write-Ok "  git $($v -replace 'git version ','')" }
    catch { Write-Err "  git 未安装" }

    try { $v = node --version; Write-Ok "  node $v" }
    catch { Write-Warn "  node 未安装（OpenSpec 需要）" }

    try { npx --version | Out-Null; Write-Ok "  npx 可用" }
    catch { Write-Warn "  npx 不可用" }

    try {
        npx openspec --version 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Ok "  openspec 已安装" }
        else { Write-Warn "  openspec 未安装（可选，仅 Cursor SDD 流程需要）" }
    }
    catch { Write-Warn "  openspec 未安装（可选）" }
}

# ---- 安装报告 ----
function Write-Report {
    param([string]$Target)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Ok "安装完成！"
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Info "后续步骤："
    Write-Host "  1. 编辑 .agents/rules/01-项目概述.md  填写项目定位和技术栈"
    Write-Host "  2. 编辑 .agents/rules/03-项目结构.md  填写项目目录结构"
    Write-Host "  3. 修改 .cursor/mcp.json            替换 project-id 与 token"
    Write-Host '  4. 在 AI IDE 中输入 "初始化项目规范" 让 AI 自动生成 01/03'
    Write-Host ""
}

# ============================================================================
# 子命令实现
# ============================================================================

function Invoke-Init {
    param([string]$Dir)
    $target = (Resolve-Path $Dir -ErrorAction SilentlyContinue)
    if (!$target) { New-Item -ItemType Directory -Path $Dir -Force | Out-Null; $target = Resolve-Path $Dir }
    $target = $target.Path
    Write-Info "初始化项目: $target"

    $source = Get-SourceDir
    Copy-Agents -Target $target -Source $source
    New-IdeLinks -Target $target
    Copy-CursorExtras -Target $target -Source $source
    Test-Tools
    Write-Report -Target $target
}

function Invoke-Update {
    param([string]$Dir)
    $target = (Resolve-Path $Dir).Path
    if (!(Test-Path (Join-Path $target ".agents"))) { Write-Err "$target 未找到 .agents/，请先运行 init"; exit 1 }
    Write-Info "更新规范: $target"

    $source = Get-SourceDir
    Copy-Agents -Target $target -Source $source
    New-IdeLinks -Target $target
    Copy-CursorExtras -Target $target -Source $source
    Write-Ok "更新完成"
}

function Invoke-Check {
    param([string]$Dir)
    $target = (Resolve-Path $Dir -ErrorAction SilentlyContinue)
    if (!$target) { $target = $Dir } else { $target = $target.Path }
    $hasIssue = $false

    Write-Host ""
    Write-Info "=== 安装状态检查: $target ==="
    Write-Host ""

    $agentsDir = Join-Path $target ".agents"
    if (Test-Path $agentsDir) {
        Write-Ok ".agents/ 存在"
        if (Test-Path (Join-Path $agentsDir "rules"))  { Write-Ok "  rules/ 存在" }  else { Write-Err "  rules/ 缺失";  $hasIssue = $true }
        if (Test-Path (Join-Path $agentsDir "skills")) { Write-Ok "  skills/ 存在" } else { Write-Err "  skills/ 缺失"; $hasIssue = $true }
    }
    else { Write-Err ".agents/ 不存在"; $hasIssue = $true }

    foreach ($ide in $IdeDirs) {
        $d = Join-Path $target ".$ide"
        if (Test-Path $d) {
            foreach ($sub in @("rules", "skills")) {
                $p = Join-Path $d $sub
                if (Test-Path $p) { Write-Ok ".$ide/$sub 链接有效" }
                else { Write-Err ".$ide/$sub 链接无效"; $hasIssue = $true }
            }
        }
        else { Write-Warn ".$ide/ 不存在" }
    }

    Write-Host ""
    Test-Tools
    Write-Host ""
    if ($hasIssue) { Write-Err "存在问题，建议运行: .\install.ps1 init" }
    else { Write-Ok "全部检查通过" }
}

function Invoke-Uninstall {
    param([string]$Dir)
    $target = (Resolve-Path $Dir).Path
    Write-Warn "将移除 $target 下的规范库文件（.agents/ 及 IDE 链接）"
    $ans = Read-Host "确认？(y/N)"
    if ($ans -notmatch '^[Yy]$') { Write-Info "已取消"; return }

    foreach ($ide in $IdeDirs) {
        $ideDir = Join-Path $target ".$ide"
        Remove-Item (Join-Path $ideDir "rules")  -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item (Join-Path $ideDir "skills") -Recurse -Force -ErrorAction SilentlyContinue
        if ((Get-ChildItem $ideDir -Force -ErrorAction SilentlyContinue | Measure-Object).Count -eq 0) {
            Remove-Item $ideDir -Force -ErrorAction SilentlyContinue
        }
    }
    Remove-Item (Join-Path $target ".agents") -Recurse -Force -ErrorAction SilentlyContinue
    Write-Ok "卸载完成"
}

function Show-Usage {
    Write-Host ""
    Write-Host "br-ai-spec 规范库安装工具 v$Version" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法: .\install.ps1 <命令> [目标目录] [选项]" -ForegroundColor White
    Write-Host ""
    Write-Host "命令:" -ForegroundColor White
    Write-Host "  init [dir]        首次安装到目标项目（默认当前目录）"
    Write-Host "  update [dir]      更新通用规范，保留项目特有规则"
    Write-Host "  check [dir]       检查安装状态与链接有效性"
    Write-Host "  uninstall [dir]   卸载规范库"
    Write-Host ""
    Write-Host "选项:" -ForegroundColor White
    Write-Host "  -Ide <name>       指定 IDE (cursor|claude|opencode|trae|all)  默认 all"
    Write-Host "  -Repo <url>       自定义规范库地址"
    Write-Host "  -SkipOpenspec     不安装 openspec 相关文件"
    Write-Host ""
    Write-Host "示例:" -ForegroundColor White
    Write-Host "  .\install.ps1 init"
    Write-Host "  .\install.ps1 init C:\projects\my-app"
    Write-Host "  .\install.ps1 update -Ide cursor"
    Write-Host "  .\install.ps1 check"
    Write-Host ""
    Write-Host "远程安装:" -ForegroundColor White
    Write-Host '  irm <raw-url>/install.ps1 | iex'
    Write-Host ""
}

# ============================================================================
# 入口
# ============================================================================

if ($Help) { Show-Usage; exit 0 }

switch ($Command) {
    "init"      { Invoke-Init -Dir $TargetDir }
    "update"    { Invoke-Update -Dir $TargetDir }
    "check"     { Invoke-Check -Dir $TargetDir }
    "uninstall" { Invoke-Uninstall -Dir $TargetDir }
    "help"      { Show-Usage }
    default     { Show-Usage }
}
