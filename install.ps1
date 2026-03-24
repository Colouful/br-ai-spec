<#
.SYNOPSIS
    ex-ai-spec  规范库安装脚本 (PowerShell)
    适用于 Windows PowerShell 5.1+ / PowerShell Core 7+

.EXAMPLE
    .\install.ps1 init
    .\install.ps1 init C:\projects\my-app --profile react --level L2
    .\install.ps1 update
    .\install.ps1 check
    .\install.ps1 uninstall --force
#>

$ErrorActionPreference = "Stop"

# ============================================================================
# 参数解析（手动解析以支持 --profile 风格参数）
# ============================================================================

$Version = "2.0.0"
$DefaultRepo = "http://git.100credit.cn/zhenwei.li/ex-ai-spec .git"

$script:Command = ""
$script:TargetDir = "."
$script:Profile = "vue"
$script:Level = "L3"
$script:IdeFilter = "default"
$script:SpecRepo = if ($env:BR_AI_SPEC_REPO) { $env:BR_AI_SPEC_REPO } else { $DefaultRepo }
$script:CacheDir = if ($env:BR_AI_SPEC_CACHE) { $env:BR_AI_SPEC_CACHE } else { Join-Path $HOME ".ex-ai-spec " }
$script:SpecBranch = if ($env:BR_AI_SPEC_BRANCH) { $env:BR_AI_SPEC_BRANCH } else { "main" }
$script:Uipro = "ask"
$script:InstallLint = "ask"
$script:InstallHusky = "ask"
$script:RefreshCache = $false
$script:Force = $false
$script:ProfileExplicit = $false
$script:LevelExplicit = $false
$script:SourceDir = ""
$script:PkgManager = ""

$IdeDirs = @("claude", "cursor", "opencode", "trae")
$ProjectSpecificRules = @("01-项目概述.md", "03-项目结构.md")
$AvailableProfiles = @("react", "vue")
$NodeMinVersion = 18

# 解析命令行参数
$i = 0
while ($i -lt $args.Count) {
    $arg = $args[$i]
    switch -Regex ($arg) {
        "^(init|update|check|uninstall|help)$" {
            if (-not $script:Command) { $script:Command = $arg }
            else { $script:TargetDir = $arg }
        }
        "^--profile$" {
            if ($i + 1 -ge $args.Count -or $args[$i + 1] -match '^--') {
                Write-Err "选项 --profile 需要一个参数值"; exit 1
            }
            $i++; $script:Profile = $args[$i]; $script:ProfileExplicit = $true
        }
        "^--level$" {
            if ($i + 1 -ge $args.Count -or $args[$i + 1] -match '^--') {
                Write-Err "选项 --level 需要一个参数值"; exit 1
            }
            $i++; $script:Level = $args[$i]; $script:LevelExplicit = $true
        }
        "^--ide$" {
            if ($i + 1 -ge $args.Count -or $args[$i + 1] -match '^--') {
                Write-Err "选项 --ide 需要一个参数值"; exit 1
            }
            $i++; $script:IdeFilter = $args[$i]
        }
        "^--repo$" {
            if ($i + 1 -ge $args.Count -or $args[$i + 1] -match '^--') {
                Write-Err "选项 --repo 需要一个参数值"; exit 1
            }
            $i++; $script:SpecRepo = $args[$i]
        }
        "^--lint$" { $script:InstallLint = "yes" }
        "^--no-lint$" { $script:InstallLint = "no" }
        "^--husky$" { $script:InstallHusky = "yes" }
        "^--no-husky$" { $script:InstallHusky = "no" }
        "^--uipro$" { $script:Uipro = "yes" }
        "^--no-uipro$" { $script:Uipro = "no" }
        "^--refresh-cache$" { $script:RefreshCache = $true }
        "^(-y|--force)$" { $script:Force = $true }
        "^(-h|--help)$" { $script:Command = "help" }
        default {
            if ($script:Command) { $script:TargetDir = $arg }
            else { $script:Command = "help" }
        }
    }
    $i++
}

if (-not $script:Command) { $script:Command = "help" }

# ============================================================================
# 输出函数
# ============================================================================

function Write-Info  { param($Msg) Write-Host "i " -ForegroundColor Blue -NoNewline; Write-Host $Msg }
function Write-Ok    { param($Msg) Write-Host "√ " -ForegroundColor Green -NoNewline; Write-Host $Msg }
function Write-Warn  { param($Msg) Write-Host "! " -ForegroundColor Yellow -NoNewline; Write-Host $Msg }
function Write-Err   { param($Msg) Write-Host "x " -ForegroundColor Red -NoNewline; Write-Host $Msg }

# ============================================================================
# 工具函数
# ============================================================================

function New-Link {
    param([string]$Target, [string]$LinkPath)
    $parentDir = Split-Path $LinkPath -Parent
    $resolvedTarget = $null
    try { $resolvedTarget = (Resolve-Path (Join-Path $parentDir $Target) -ErrorAction Stop).Path } catch {}

    if ((Test-Path $LinkPath) -and $resolvedTarget) {
        $item = Get-Item $LinkPath -Force -ErrorAction SilentlyContinue
        if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            $existingTarget = $item.Target
            if ($existingTarget -eq $resolvedTarget) { return }
        }
        Remove-Item $LinkPath -Recurse -Force -ErrorAction SilentlyContinue
    } elseif (Test-Path $LinkPath) {
        Remove-Item $LinkPath -Recurse -Force -ErrorAction SilentlyContinue
    }

    if ($resolvedTarget) {
        cmd /c "mklink /J `"$LinkPath`" `"$resolvedTarget`"" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { return }
    }
    $fallbackTarget = Join-Path $parentDir $Target
    try { Copy-Item -Path $fallbackTarget -Destination $LinkPath -Recurse -Force } catch {
        Write-Warn "链接创建失败: $LinkPath -> $Target"
    }
}

function Test-NodeEnv {
    try {
        $nodeVer = (node --version 2>$null)
        if (-not $nodeVer) { throw "not found" }
        $major = [int]($nodeVer -replace '^v','').Split('.')[0]
        if ($major -lt $NodeMinVersion) {
            Write-Err "Node.js 版本过低: $nodeVer (最低要求: v$NodeMinVersion)"
            Write-Host "  请升级 Node.js: nvm install $NodeMinVersion"
            exit 1
        }
        Write-Ok "Node.js $nodeVer 环境就绪"
    } catch {
        Write-Err "未检测到 Node.js 环境"
        Write-Host "  请先安装 Node.js (>= $NodeMinVersion): https://nodejs.org"
        exit 1
    }
    $hasNpm = $null -ne (Get-Command npm -ErrorAction SilentlyContinue)
    $hasPnpm = $null -ne (Get-Command pnpm -ErrorAction SilentlyContinue)
    if (-not $hasNpm -and -not $hasPnpm) {
        Write-Err "未找到 npm 或 pnpm，请确认 Node.js 安装完整"
        exit 1
    }
}

function Get-PkgManager {
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        $script:PkgManager = "pnpm"
        $ver = pnpm --version 2>$null
        Write-Ok "使用包管理器: pnpm ($ver)"
        return
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Warn "未找到 npm 或 pnpm，跳过依赖安装"
        $script:PkgManager = ""
        return
    }
    Write-Info "未检测到 pnpm，正在通过 npm 安装（超时 120 秒）..."
    $installOk = $false
    try {
        $job = Start-Job -ScriptBlock { npm install -g pnpm 2>$null | Out-Null }
        if (Wait-Job $job -Timeout 120) {
            Receive-Job $job -ErrorAction SilentlyContinue
            $installOk = $true
        } else {
            Stop-Job $job
        }
        Remove-Job $job -Force
    } catch {}
    if ($installOk -and (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-Ok "pnpm 安装成功"
        $script:PkgManager = "pnpm"
    } else {
        Write-Warn "pnpm 安装失败或超时，回退使用 npm"
        $script:PkgManager = "npm"
    }
}

# ============================================================================
# 检测规范源
# ============================================================================

function Get-SourceDir {
    # npm 包模式：优先使用 BR_AI_SPEC_LOCAL 指向的规范文件
    if ($env:BR_AI_SPEC_LOCAL -and
        (Test-Path (Join-Path $env:BR_AI_SPEC_LOCAL ".agents/rules/common")) -and
        (Test-Path (Join-Path $env:BR_AI_SPEC_LOCAL ".agents/skills/common"))) {
        $script:SourceDir = $env:BR_AI_SPEC_LOCAL
        Write-Info "使用 npm 包内规范库: $($script:SourceDir)"
        return
    }

    $scriptDir = $PSScriptRoot
    if (-not $scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }

    if ($scriptDir -and
        (Test-Path (Join-Path $scriptDir ".agents/rules/common")) -and
        (Test-Path (Join-Path $scriptDir ".agents/skills/common"))) {
        Write-Info "使用本地规范库: $scriptDir"
        $script:SourceDir = $scriptDir
        return
    }

    if ($script:RefreshCache -and (Test-Path $script:CacheDir)) {
        Write-Info "清除缓存目录..."
        Remove-Item $script:CacheDir -Recurse -Force
    }

    if (Test-Path (Join-Path $script:CacheDir ".git")) {
        Write-Info "更新规范库缓存..."
        try { git -C $script:CacheDir pull --quiet 2>$null }
        catch { Write-Warn "缓存更新失败，将使用本地缓存（可能非最新版本）" }
    } else {
        Write-Info "克隆规范库到 $($script:CacheDir) ..."
        git clone --quiet -b $script:SpecBranch $script:SpecRepo $script:CacheDir
        if ($LASTEXITCODE -ne 0) { Write-Err "克隆失败: $($script:SpecRepo)"; exit 1 }
    }

    Write-Ok "规范库缓存就绪"
    $script:SourceDir = $script:CacheDir
}

# ============================================================================
# 交互式选择
# ============================================================================

function Select-Profile {
    Write-Host ""
    Write-Info "选择技术栈 Profile："
    Write-Host "  1) vue    -- Vue 3 + TypeScript + Pinia + Vue Router"
    Write-Host "  2) react  -- React + TypeScript + Antd + Zustand"
    Write-Host ""
    $choice = Read-Host "请选择 (1/2) [默认 1]"
    switch ($choice) {
        "2" { $script:Profile = "react" }
        default { $script:Profile = "vue" }
    }
    Write-Ok "已选择 Profile: $($script:Profile)"
}

function Select-Level {
    Write-Host ""
    Write-Info "选择安装层级："
    Write-Host "  L1) 最小接入 -- 只接入 .agents（规范 + 技能）"
    Write-Host "  L2) 标准接入 -- .agents + 工具适配层 + MCP 模板"
    Write-Host "  L3) 完整接入 -- 在 L2 基础上引入 OpenSpec 流程"
    Write-Host ""
    $choice = Read-Host "请选择 (L1/L2/L3) [默认 L3]"
    switch -Regex ($choice) {
        "^(L1|l1|1)$" { $script:Level = "L1" }
        "^(L2|l2|2)$" { $script:Level = "L2" }
        default { $script:Level = "L3" }
    }
    Write-Ok "已选择层级: $($script:Level)"
}

function Select-Uipro {
    Write-Host ""
    Write-Info "是否安装 UI UX Pro Max 设计智能技能？"
    Write-Host "  提供 67 种 UI 风格、161 套配色方案、57 组字体搭配、99 条 UX 准则"
    Write-Host "  适用于需要 AI 自主做出设计决策的场景（无设计稿时特别有用）"
    Write-Host ""
    $choice = Read-Host "安装 UI UX Pro Max? (Y/n) [默认 Y]"
    if ($choice -match '^[Nn]') {
        $script:Uipro = "no"; Write-Info "跳过 UI UX Pro Max"
    } else {
        $script:Uipro = "yes"; Write-Ok "将安装 UI UX Pro Max"
    }
}

function Select-LintTools {
    Write-Host ""
    Write-Info "是否安装 ESLint + Prettier + Stylelint 配置？"
    Write-Host "  部署配置文件并安装对应依赖包"
    Write-Host ""
    $choice = Read-Host "安装 lint/format 工具? (Y/n) [默认 Y]"
    if ($choice -match '^[Nn]') {
        $script:InstallLint = "no"; Write-Info "跳过 lint/format 工具"
    } else {
        $script:InstallLint = "yes"; Write-Ok "将安装 lint/format 工具"
    }

    Write-Host ""
    Write-Info "是否安装 Husky 提交校验（husky + lint-staged + commitlint）？"
    Write-Host "  注册 Git hooks，提交前自动 lint，校验 commit message"
    Write-Host ""
    $choice = Read-Host "安装提交校验? (y/N) [默认 N]"
    if ($choice -match '^[Yy]') {
        $script:InstallHusky = "yes"; Write-Ok "将安装提交校验"
    } else {
        $script:InstallHusky = "no"; Write-Info "跳过提交校验"
    }
}

# ============================================================================
# 核心功能
# ============================================================================

function Copy-Agents {
    param([string]$Target)
    $agentsDst = Join-Path $Target ".agents"
    New-Item -ItemType Directory -Path (Join-Path $agentsDst "rules") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $agentsDst "skills") -Force | Out-Null

    $srcCommonRules   = Join-Path $script:SourceDir ".agents/rules/common"
    $srcProfileRules  = Join-Path $script:SourceDir ".agents/rules/profiles/$($script:Profile)"
    $srcCommonSkills  = Join-Path $script:SourceDir ".agents/skills/common"
    $srcProfileSkills = Join-Path $script:SourceDir ".agents/skills/profiles/$($script:Profile)"

    if (-not (Test-Path $srcProfileRules)) {
        Write-Err "Profile '$($script:Profile)' 的 rules 目录不存在: $srcProfileRules"
        exit 1
    }

    Write-Info "同步 rules (common + profiles/$($script:Profile)) ..."
    $rulesDst = Join-Path $agentsDst "rules"

    # common rules
    Get-ChildItem -Path $srcCommonRules -Filter "*.md" -File -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item $_.FullName -Destination (Join-Path $rulesDst $_.Name) -Force
    }

    # profile rules (protect project-specific)
    Get-ChildItem -Path $srcProfileRules -Filter "*.md" -File -ErrorAction SilentlyContinue | ForEach-Object {
        $dstFile = Join-Path $rulesDst $_.Name
        $isSpecific = $ProjectSpecificRules -contains $_.Name
        if ($isSpecific -and (Test-Path $dstFile)) {
            Write-Warn "跳过项目特有规则: $($_.Name)（已存在）"
        } else {
            Copy-Item $_.FullName -Destination $dstFile -Force
            if ($isSpecific) { Write-Info "已生成模板: $($_.Name) -> 请根据项目实际情况修改" }
        }
    }

    # rules README
    $rulesReadme = Join-Path $script:SourceDir ".agents/rules/README.md"
    if (Test-Path $rulesReadme) { Copy-Item $rulesReadme -Destination (Join-Path $rulesDst "README.md") -Force }

    Write-Info "同步 skills (common + profiles/$($script:Profile)) ..."
    $skillsDst = Join-Path $agentsDst "skills"

    # common skills
    if (Test-Path $srcCommonSkills) {
        Get-ChildItem -Path $srcCommonSkills -Directory | ForEach-Object {
            $dst = Join-Path $skillsDst $_.Name
            if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
            Copy-Item $_.FullName -Destination $dst -Recurse
        }
    }

    # profile skills
    if (Test-Path $srcProfileSkills) {
        Get-ChildItem -Path $srcProfileSkills -Directory | ForEach-Object {
            $dst = Join-Path $skillsDst $_.Name
            if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
            Copy-Item $_.FullName -Destination $dst -Recurse
        }
    }

    # skills README
    $skillsReadme = Join-Path $script:SourceDir ".agents/skills/README.md"
    if (Test-Path $skillsReadme) { Copy-Item $skillsReadme -Destination (Join-Path $skillsDst "README.md") -Force }

    Write-Ok ".agents/ 同步完成 (profile: $($script:Profile))"
}

function Copy-ConfigDir {
    param(
        [string]$Src,
        [string]$Dst,
        [bool]$SkipExisting = $false,
        [bool]$SkipHuskyArtifacts = $false
    )
    if (-not (Test-Path $Src)) { return $false }
    [ref]$hasCopied = $false

    Get-ChildItem -Path $Src -Force -ErrorAction SilentlyContinue | ForEach-Object {
        $name = $_.Name
        if ($name -eq "." -or $name -eq "..") { return }
        if ($SkipHuskyArtifacts) {
            if ($name -eq ".husky" -or $name -eq ".lintstagedrc" -or $name -eq "commitlint.config.js") { return }
        }
        $dstPath = Join-Path $Dst $name

        if ($_.PSIsContainer) {
            if ($SkipExisting -and (Test-Path $dstPath)) {
                Write-Info "  跳过已存在: $name/"
                return
            }
            New-Item -ItemType Directory -Path $dstPath -Force | Out-Null
            Get-ChildItem $_.FullName -File | ForEach-Object {
                Copy-Item $_.FullName -Destination (Join-Path $dstPath $_.Name) -Force
            }
            $hasCopied.Value = $true
        } else {
            if ($SkipExisting -and (Test-Path $dstPath)) {
                Write-Info "  跳过已存在: $name"
                return
            }
            Copy-Item $_.FullName -Destination $dstPath -Force
            $hasCopied.Value = $true
        }
    }
    return $hasCopied.Value
}

function Copy-Configs {
    param([string]$Target, [bool]$SkipExisting = $false)
    $srcCommon  = Join-Path $script:SourceDir "configs/common"
    $srcProfile = Join-Path $script:SourceDir "configs/profiles/$($script:Profile)"
    $anyCopied = $false

    $includeHuskyConfigs = ($script:InstallHusky -eq "yes") -or (Test-Path (Join-Path $Target ".husky"))
    $skipHuskyArtifacts = -not $includeHuskyConfigs
    if ($skipHuskyArtifacts) {
        Write-Info "提交校验相关配置（.husky / .lintstagedrc / commitlint）将跳过同步"
    }

    if (Test-Path $srcCommon) {
        Write-Info "同步 lint/format 配置 (common) ..."
        if (Copy-ConfigDir -Src $srcCommon -Dst $Target -SkipExisting $SkipExisting -SkipHuskyArtifacts $skipHuskyArtifacts) { $anyCopied = $true }
    }
    if (Test-Path $srcProfile) {
        Write-Info "同步 lint/format 配置 (profiles/$($script:Profile)) ..."
        if (Copy-ConfigDir -Src $srcProfile -Dst $Target -SkipExisting $SkipExisting -SkipHuskyArtifacts $skipHuskyArtifacts) { $anyCopied = $true }
    }

    if ($anyCopied) { Write-Ok "lint/format 配置部署完成" }
    else { Write-Info "未找到 lint/format 配置模板，跳过" }
}

function Install-CommitHooks {
    param([string]$Target)
    if (-not (Test-Path (Join-Path $Target "package.json"))) {
        Write-Warn "未找到 package.json，跳过提交校验依赖安装"; return
    }
    if (-not $script:PkgManager) {
        Write-Warn "无可用的包管理器，跳过提交校验依赖安装"; return
    }

    Write-Info "正在使用 $($script:PkgManager) 安装提交校验依赖..."
    Write-Info "  husky@8 + lint-staged@15 + @commitlint/cli@19 + @commitlint/config-conventional@19"

    $installCmd = "$($script:PkgManager) install -D husky@8 lint-staged@15 `"@commitlint/cli@19`" `"@commitlint/config-conventional@19`""
    try {
        Push-Location $Target
        Invoke-Expression $installCmd
        if ($LASTEXITCODE -ne 0) { throw "install failed" }
    } catch {
        Write-Warn "$($script:PkgManager) install 失败，请手动执行:"
        Write-Host "  cd $Target && $installCmd"
        Pop-Location; return
    }

    Write-Info "初始化 husky ..."
    try { npx husky install 2>$null } catch { Write-Warn "husky install 失败，请手动执行: npx husky install" }
    Pop-Location

    Write-Ok "提交校验工具链安装完成 (husky@8 + lint-staged + commitlint)"
}

function Install-LintDeps {
    param([string]$Target)
    if (-not (Test-Path (Join-Path $Target "package.json"))) {
        Write-Warn "未找到 package.json，跳过 lint/format 依赖安装"; return
    }
    if (-not $script:PkgManager) {
        Write-Warn "无可用的包管理器，跳过 lint/format 依赖安装"; return
    }

    $deps = "eslint prettier stylelint stylelint-config-standard"
    if ($script:Profile -eq "vue") {
        $deps = "$deps stylelint-config-html stylelint-config-recommended-vue postcss-html"
    }

    Write-Info "正在使用 $($script:PkgManager) 安装 lint/format 依赖..."
    Write-Info "  $deps"

    $installCmd = "$($script:PkgManager) install -D $deps"
    try {
        Push-Location $Target
        Invoke-Expression $installCmd
        if ($LASTEXITCODE -ne 0) { throw "install failed" }
    } catch {
        Write-Warn "$($script:PkgManager) install 失败，请手动执行:"
        Write-Host "  cd $Target && $installCmd"
        Pop-Location; return
    }
    Pop-Location

    Write-Ok "lint/format 依赖安装完成"
}

function New-IdeLinks {
    param([string]$Target)
    $ideList = switch ($script:IdeFilter) {
        "all"     { $IdeDirs }
        "default" { @("cursor", "claude") }
        default   { @($script:IdeFilter) }
    }

    foreach ($ide in $ideList) {
        $ideDir = Join-Path $Target ".$ide"
        New-Item -ItemType Directory -Path $ideDir -Force | Out-Null

        New-Link -Target "../.agents/rules" -LinkPath (Join-Path $ideDir "rules")

        $skillsIdeDir = Join-Path $ideDir "skills"
        New-Item -ItemType Directory -Path $skillsIdeDir -Force | Out-Null
        $agentsSkillsDir = Join-Path $Target ".agents/skills"
        if (Test-Path $agentsSkillsDir) {
            Get-ChildItem -Path $agentsSkillsDir -Directory | Where-Object {
                $_.Name -ne "common" -and $_.Name -ne "profiles"
            } | ForEach-Object {
                $linkTarget = "../../.agents/skills/$($_.Name)"
                $linkPath = Join-Path $skillsIdeDir $_.Name
                New-Link -Target $linkTarget -LinkPath $linkPath
            }
        }

        Write-Ok ".$ide/ 链接就绪"
    }
}

function Copy-CursorExtras {
    param([string]$Target)
    if ($script:IdeFilter -ne "all" -and $script:IdeFilter -ne "default" -and $script:IdeFilter -ne "cursor") { return }

    $cursorDst = Join-Path $Target ".cursor"
    New-Item -ItemType Directory -Path $cursorDst -Force | Out-Null

    $mcpSrc = Join-Path $script:SourceDir ".cursor/mcp.json"
    $mcpDst = Join-Path $cursorDst "mcp.json"
    if ((Test-Path $mcpSrc) -and -not (Test-Path $mcpDst)) {
        Copy-Item $mcpSrc -Destination $mcpDst
        Write-Warn ".cursor/mcp.json 已生成 -> 请替换 project-id 与 access-token"
    }

    $cmdsSrc = Join-Path $script:SourceDir ".cursor/commands"
    if (Test-Path $cmdsSrc) {
        $cmdsDst = Join-Path $cursorDst "commands"
        New-Item -ItemType Directory -Path $cmdsDst -Force | Out-Null
        Copy-Item -Path (Join-Path $cmdsSrc "*.md") -Destination $cmdsDst -Force -ErrorAction SilentlyContinue
        Write-Ok ".cursor/commands/ 已同步"
    }
}

function Install-Uipro {
    param([string]$Target)
    $skillDir = Join-Path $Target ".agents/skills/ui-ux-pro-max"

    if ((Test-Path $skillDir) -and (Test-Path (Join-Path $skillDir "SKILL.md"))) {
        Write-Ok "UI UX Pro Max 已安装，跳过"; return
    }
    if (-not $script:PkgManager) { Write-Warn "无可用的包管理器，跳过 UI UX Pro Max"; return }

    if (-not (Get-Command uipro -ErrorAction SilentlyContinue)) {
        Write-Info "安装 uipro-cli ..."
        try {
            if ($script:PkgManager -eq "pnpm") { pnpm add -g uipro-cli 2>$null | Out-Null }
            else { npm install -g uipro-cli 2>$null | Out-Null }
        } catch { Write-Warn "uipro-cli 安装失败，跳过 UI UX Pro Max"; return }
        if (-not (Get-Command uipro -ErrorAction SilentlyContinue)) {
            Write-Warn "uipro 命令不可用，跳过 UI UX Pro Max"; return
        }
    }

    $tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) "ex-ai-spec -uipro-$(Get-Random)"
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
    Write-Info "下载 UI UX Pro Max 资源 ..."
    try {
        Push-Location $tmpDir
        uipro init --ai cursor 2>$null
        Pop-Location
    } catch { Write-Warn "uipro init 失败，跳过 UI UX Pro Max"; Pop-Location; Remove-Item $tmpDir -Recurse -Force; return }

    $uiproSrc = Join-Path $tmpDir ".shared/ui-ux-pro-max"
    if (-not (Test-Path $uiproSrc)) {
        Write-Warn "未找到预期的资源目录，跳过"; Remove-Item $tmpDir -Recurse -Force; return
    }

    New-Item -ItemType Directory -Path (Join-Path $skillDir "data") -Force | Out-Null
    Copy-Item -Path (Join-Path $uiproSrc "*") -Destination (Join-Path $skillDir "data") -Recurse -Force

    $promptFile = Join-Path $tmpDir ".cursor/commands/ui-ux-pro-max.md"
    if (Test-Path $promptFile) {
        $content = Get-Content $promptFile -Raw
        $content = $content -replace '\.shared/ui-ux-pro-max/', 'data/'
        $header = @"
---
name: ui-ux-pro-max
description: AI 设计智能技能，提供 67 种 UI 风格、161 套配色方案、57 组字体搭配、99 条 UX 准则。
---

"@
        Set-Content -Path (Join-Path $skillDir "SKILL.md") -Value ($header + $content) -Encoding UTF8
    } else {
        $fallback = @"
---
name: ui-ux-pro-max
description: AI 设计智能技能，提供 67 种 UI 风格、161 套配色方案、57 组字体搭配、99 条 UX 准则。
---

# UI UX Pro Max

本技能为 AI 注入专业 UI/UX 设计决策能力。

## 使用时机

- 没有设计稿，需要 AI 自主选择风格、配色、字体
- 需要生成完整的设计系统（Design System）

## 数据目录

设计数据库和搜索脚本位于 ``data/`` 子目录。
"@
        Set-Content -Path (Join-Path $skillDir "SKILL.md") -Value $fallback -Encoding UTF8
    }

    Remove-Item $tmpDir -Recurse -Force
    Write-Ok "UI UX Pro Max 安装完成"
}

function Install-OpenSpec {
    param([string]$Target)
    Write-Info "配置 OpenSpec ..."

    $hasOpenspec = $false
    try { npx openspec --version 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { $hasOpenspec = $true } } catch {}

    if ($hasOpenspec) {
        Write-Ok "openspec CLI 可用"
        $configYaml = Join-Path $Target "openspec/config.yaml"
        $configYml = Join-Path $Target "openspec/config.yml"
        if (-not (Test-Path $configYaml) -and -not (Test-Path $configYml)) {
            Write-Info "运行 openspec init ..."
            $toolsArg = switch ($script:IdeFilter) {
                "all" { "cursor,claude,opencode,trae" }
                "default" { "cursor,claude" }
                default { $script:IdeFilter }
            }
            try {
                Push-Location $Target
                npx openspec init --tools $toolsArg --force --no-interactive 2>$null
                Pop-Location
            } catch { Write-Warn "openspec init 执行失败，请手动运行"; Pop-Location }
        } else {
            Write-Info "openspec/ 已存在，运行 openspec update ..."
            try {
                Push-Location $Target
                npx openspec update --force 2>$null
                Pop-Location
            } catch { Write-Warn "openspec update 执行失败"; Pop-Location }
        }
    } else {
        Write-Warn "openspec CLI 未安装，请手动安装: npm install -g @fission-ai/openspec@latest"
    }

    # 无论 CLI 是否可用，始终确保目录骨架存在
    New-Item -ItemType Directory -Path (Join-Path $Target "openspec/specs") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $Target "openspec/changes/archive") -Force | Out-Null

    $template = Join-Path $script:SourceDir "openspec/config.yaml.template"
    $configFile = Join-Path $Target "openspec/config.yaml"
    if (Test-Path $template) {
        if (Test-Path $configFile) {
            $content = Get-Content $configFile -Raw -ErrorAction SilentlyContinue
            if ($content -and $content -notmatch '(?m)^context:') {
                Write-Info "合并 ex-ai-spec  context/rules 到 config.yaml ..."
                $templateContent = Get-Content $template -Raw
                $linesToAppend = ($templateContent -split "`n" | Select-Object -Skip 1) -join "`n"
                Add-Content -Path $configFile -Value $linesToAppend
                Write-Ok "config.yaml 已增强"
            } else {
                Write-Info "config.yaml 已包含 context 字段，跳过合并"
            }
        } else {
            $configDir = Split-Path $configFile -Parent
            if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir -Force | Out-Null }
            Copy-Item $template -Destination $configFile
            Write-Ok "openspec/config.yaml 已创建"
        }
    }

    Write-Ok "OpenSpec 配置完成"
}

function Test-Tools {
    Write-Info "工具环境："
    try { $v = git --version; Write-Ok "  git $($v -replace 'git version ','')" }
    catch { Write-Err "  git 未安装" }

    try { $v = node --version; Write-Ok "  node $v" }
    catch { Write-Warn "  node 未安装（OpenSpec 需要）" }

    try { npx --version 2>$null | Out-Null; Write-Ok "  npx 可用" }
    catch { Write-Warn "  npx 不可用" }

    if ($script:Uipro -eq "yes" -or (Test-Path (Join-Path $script:TargetDir ".agents/skills/ui-ux-pro-max"))) {
        try {
            $pyVer = (python3 --version 2>&1) -replace 'Python ',''
            Write-Ok "  python3 $pyVer"
        } catch {
            Write-Warn "  python3 未安装（UI UX Pro Max 搜索脚本需要）"
        }
    }

    if ($script:Level -eq "L3") {
        try { npx openspec --version 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { Write-Ok "  openspec 已安装" } else { throw } }
        catch { Write-Warn "  openspec 未安装 -> npm install -g @fission-ai/openspec@latest" }
    }
}

function Write-Report {
    param([string]$Target)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Ok "安装完成！"
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Info "安装配置："
    Write-Host "  Profile:  $($script:Profile)"
    Write-Host "  Level:    $($script:Level)"
    Write-Host "  IDE:      $($script:IdeFilter)"
    Write-Host "  UIPro:    $($script:Uipro)"
    Write-Host ""
    Write-Info "已部署内容："
    Write-Host "  √ .agents/rules + skills (profile: $($script:Profile))" -ForegroundColor Green
    if ($script:InstallLint -eq "yes") {
        Write-Host "  √ lint/format 配置 (.prettierrc, .eslintrc, .stylelintrc)" -ForegroundColor Green
    } else {
        Write-Host "  — lint/format 配置（已跳过）" -ForegroundColor Yellow
    }
    if ($script:InstallHusky -eq "yes") {
        Write-Host "  √ 提交校验 (.husky, .lintstagedrc, commitlint.config.js)" -ForegroundColor Green
    } else {
        Write-Host "  — 提交校验（已跳过）" -ForegroundColor Yellow
    }
    if (Test-Path (Join-Path $Target ".agents/skills/ui-ux-pro-max")) {
        Write-Host "  √ UI UX Pro Max 设计智能技能" -ForegroundColor Green
    }
    if ($script:Level -ne "L1") {
        Write-Host "  √ IDE 适配 (.cursor, .claude)" -ForegroundColor Green
    }
    Write-Host ""
    Write-Info "后续步骤："
    Write-Host "  1. 编辑 .agents/rules/01-项目概述.md  填写项目定位和技术栈"
    Write-Host "  2. 编辑 .agents/rules/03-项目结构.md  填写项目目录结构"
    if ($script:Level -ne "L1") {
        Write-Host "  3. 修改 .cursor/mcp.json            替换 project-id 与 token"
    }
    if ($script:Level -eq "L3") {
        Write-Host "  4. 使用 /opsx-propose              开始第一个变更提案"
    }
    Write-Host "  *  在 AI IDE 中输入 `"初始化项目规范`" 让 AI 自动生成 01/03"
    Write-Host ""
}

# ============================================================================
# 子命令实现
# ============================================================================

function Invoke-Init {
    param([string]$Dir)
    $target = $null
    try { $target = (Resolve-Path $Dir -ErrorAction Stop).Path }
    catch { New-Item -ItemType Directory -Path $Dir -Force | Out-Null; $target = (Resolve-Path $Dir).Path }

    Write-Host ""
    $nodeVer = try { node --version 2>$null } catch { "N/A" }
    Write-Info "ex-ai-spec  v$Version | Windows | Node $nodeVer"
    Write-Info "初始化项目: $target"
    Write-Host ""

    if (Test-Path (Join-Path $target ".agents")) {
        Write-Warn "目标项目已包含 .agents/ 目录"
        Write-Host "  如果只需更新规范，请使用: .\install.ps1 update"
        Write-Host ""
        if (-not $script:Force -and [Environment]::UserInteractive) {
            $ans = Read-Host "继续初始化将覆盖现有规范（01/03 除外），确认？(y/N)"
            if ($ans -notmatch '^[Yy]$') { Write-Info "已取消"; return }
        } elseif (-not $script:Force) {
            Write-Warn "非交互模式，继续覆盖安装"
        }
    }

    Test-NodeEnv
    Get-PkgManager

    if ([Environment]::UserInteractive -and -not $script:ProfileExplicit -and -not $script:LevelExplicit) {
        Select-Profile
        Select-Level
    }
    if ([Environment]::UserInteractive -and $script:Uipro -eq "ask") { Select-Uipro }

    # lint/format 工具选择（交互模式 + ask 时触发）
    if ([Environment]::UserInteractive -and $script:InstallLint -eq "ask") { Select-LintTools }
    # 非交互模式下 ask 保持默认值
    if ($script:InstallLint -eq "ask") { $script:InstallLint = "yes" }
    if ($script:InstallHusky -eq "ask") { $script:InstallHusky = "no" }

    Get-SourceDir

    Copy-Agents -Target $target

    # lint/format 配置（可选）
    if ($script:InstallLint -eq "yes") {
        Copy-Configs -Target $target
        Install-LintDeps -Target $target
    }

    # 提交校验（可选）
    if ($script:InstallHusky -eq "yes") {
        Install-CommitHooks -Target $target
    }

    if ($script:Uipro -eq "yes") { Install-Uipro -Target $target }

    if ($script:Level -eq "L2" -or $script:Level -eq "L3") {
        New-IdeLinks -Target $target
        Copy-CursorExtras -Target $target
    }
    if ($script:Level -eq "L3") { Install-OpenSpec -Target $target }

    Test-Tools
    Write-Report -Target $target
}

function Invoke-Update {
    param([string]$Dir)
    $target = (Resolve-Path $Dir -ErrorAction Stop).Path
    if (-not (Test-Path (Join-Path $target ".agents"))) {
        Write-Err "$target 未找到 .agents/，请先运行 init"; exit 1
    }
    Write-Info "更新规范: $target"

    Get-PkgManager
    Get-SourceDir
    Copy-Agents -Target $target
    Copy-Configs -Target $target -SkipExisting $true

    if ($script:Uipro -eq "yes" -or (Test-Path (Join-Path $target ".agents/skills/ui-ux-pro-max"))) {
        $script:Uipro = "yes"
        $uiproDir = Join-Path $target ".agents/skills/ui-ux-pro-max"
        if (Test-Path $uiproDir) { Remove-Item $uiproDir -Recurse -Force }
        Install-Uipro -Target $target
    }

    if ($script:Level -eq "L2" -or $script:Level -eq "L3") {
        New-IdeLinks -Target $target
        Copy-CursorExtras -Target $target
    }
    if ($script:Level -eq "L3") { Install-OpenSpec -Target $target }

    Write-Ok "更新完成 (profile: $($script:Profile), level: $($script:Level))"
}

function Invoke-Check {
    param([string]$Dir)
    $target = $null
    try { $target = (Resolve-Path $Dir -ErrorAction Stop).Path } catch { $target = $Dir }
    $hasIssue = $false

    Write-Host ""
    Write-Info "=== 安装状态检查: $target ==="
    Write-Host ""

    $agentsDir = Join-Path $target ".agents"
    if (Test-Path $agentsDir) {
        Write-Ok ".agents/ 存在"
        if (Test-Path (Join-Path $agentsDir "rules"))  { Write-Ok "  rules/ 存在" }  else { Write-Err "  rules/ 缺失";  $hasIssue = $true }
        if (Test-Path (Join-Path $agentsDir "skills")) { Write-Ok "  skills/ 存在" } else { Write-Err "  skills/ 缺失"; $hasIssue = $true }

        $ruleCount = (Get-ChildItem (Join-Path $agentsDir "rules") -Filter "*.md" -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -ne "README.md" }).Count
        Write-Ok "  rules: $ruleCount 个规范文件"

        $skillCount = (Get-ChildItem (Join-Path $agentsDir "skills") -Directory -ErrorAction SilentlyContinue).Count
        Write-Ok "  skills: $skillCount 个技能目录"

        if (Test-Path (Join-Path $agentsDir "skills/ui-ux-pro-max/SKILL.md")) {
            Write-Ok "  UI UX Pro Max: 已安装"
        } else {
            Write-Info "  UI UX Pro Max: 未安装（可选）"
        }
    } else { Write-Err ".agents/ 不存在"; $hasIssue = $true }

    foreach ($ide in $IdeDirs) {
        $d = Join-Path $target ".$ide"
        if (Test-Path $d) {
            $rulesPath = Join-Path $d "rules"
            if (Test-Path $rulesPath) { Write-Ok ".$ide/rules 链接有效" }
            else { Write-Err ".$ide/rules 链接无效"; $hasIssue = $true }

            $skillsPath = Join-Path $d "skills"
            if (Test-Path $skillsPath) {
                $linkCount = (Get-ChildItem $skillsPath -Directory -ErrorAction SilentlyContinue).Count
                Write-Ok ".$ide/skills ($linkCount 个链接)"
            } else { Write-Warn ".$ide/skills 不存在" }
        } else { Write-Warn ".$ide/ 不存在" }
    }

    if (Test-Path (Join-Path $target "openspec")) {
        Write-Ok "openspec/ 存在"
        $configPath = Join-Path $target "openspec/config.yaml"
        $configPathYml = Join-Path $target "openspec/config.yml"
        if ((Test-Path $configPath) -or (Test-Path $configPathYml)) { Write-Ok "  config.yaml 存在" }
        else { Write-Warn "  config.yaml 缺失" }
        if (Test-Path (Join-Path $target "openspec/specs")) { Write-Ok "  specs/ 存在" } else { Write-Warn "  specs/ 缺失" }
        if (Test-Path (Join-Path $target "openspec/changes")) { Write-Ok "  changes/ 存在" } else { Write-Warn "  changes/ 缺失" }
    } else {
        Write-Info "openspec/ 不存在（L3 级别才需要）"
    }

    Write-Host ""
    Test-Tools
    Write-Host ""
    if ($hasIssue) { Write-Err "存在问题，建议运行: .\install.ps1 init" }
    else { Write-Ok "全部检查通过" }
}

function Invoke-Uninstall {
    param([string]$Dir)
    $target = (Resolve-Path $Dir -ErrorAction Stop).Path
    Write-Warn "将移除 $target 下的规范库文件"
    Write-Host "  包括: .agents/、IDE 链接、lint/format 配置、husky hooks、相关依赖"
    Write-Host ""
    if (-not $script:Force) {
        $ans = Read-Host "确认？(y/N)"
        if ($ans -notmatch '^[Yy]$') { Write-Info "已取消"; return }
    }

    foreach ($ide in $IdeDirs) {
        $ideDir = Join-Path $target ".$ide"
        if (Test-Path $ideDir) {
            Remove-Item (Join-Path $ideDir "rules") -Recurse -Force -ErrorAction SilentlyContinue
            Remove-Item (Join-Path $ideDir "skills") -Recurse -Force -ErrorAction SilentlyContinue
            $remaining = Get-ChildItem $ideDir -Force -ErrorAction SilentlyContinue
            if (-not $remaining -or $remaining.Count -eq 0) {
                Remove-Item $ideDir -Force -ErrorAction SilentlyContinue
            }
        }
    }

    Remove-Item (Join-Path $target ".agents") -Recurse -Force -ErrorAction SilentlyContinue

    $lintFiles = @(".prettierrc.json", ".prettierignore", ".stylelintrc.json", ".stylelintignore",
                   ".eslintrc.js", ".eslintrc.cjs", ".eslintignore",
                   ".lintstagedrc", "commitlint.config.js", ".editorconfig")
    foreach ($f in $lintFiles) {
        $p = Join-Path $target $f
        if (Test-Path $p) { Remove-Item $p -Force; Write-Info "  已删除 $f" }
    }

    $huskyDir = Join-Path $target ".husky"
    if (Test-Path $huskyDir) {
        Remove-Item $huskyDir -Recurse -Force
        Write-Info "  已删除 .husky/"
    }

    $pkgJson = Join-Path $target "package.json"
    if ((Test-Path $pkgJson) -and (Get-Command node -ErrorAction SilentlyContinue)) {
        $nodeScript = @"
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$($pkgJson -replace '\\','/')', 'utf8'));
if (pkg.scripts && pkg.scripts.prepare && pkg.scripts.prepare.includes('husky')) {
  delete pkg.scripts.prepare;
  if (Object.keys(pkg.scripts).length === 0) delete pkg.scripts;
  fs.writeFileSync('$($pkgJson -replace '\\','/')', JSON.stringify(pkg, null, 2) + '\n');
}
"@
        try { $nodeScript | node - 2>$null; Write-Info "  已移除 package.json 中的 husky prepare 脚本" } catch {}
    }

    if (Test-Path $pkgJson) {
        $pm = ""
        if (Test-Path (Join-Path $target "pnpm-lock.yaml")) { $pm = "pnpm" }
        elseif (Get-Command pnpm -ErrorAction SilentlyContinue) { $pm = "pnpm" }
        elseif (Get-Command npm -ErrorAction SilentlyContinue) { $pm = "npm" }
        if ($pm) {
            Write-Info "  使用 $pm 卸载 husky lint-staged @commitlint/cli @commitlint/config-conventional ..."
            try {
                Push-Location $target
                Invoke-Expression "$pm uninstall husky lint-staged @commitlint/cli @commitlint/config-conventional" 2>$null
                Pop-Location
            } catch { Pop-Location }
            Write-Info "  使用 $pm 卸载 eslint prettier stylelint 及相关插件 ..."
            try {
                Push-Location $target
                Invoke-Expression "$pm uninstall eslint prettier stylelint stylelint-config-standard stylelint-config-html stylelint-config-recommended-vue postcss-html" 2>$null
                Pop-Location
            } catch { Pop-Location }
        }
    }

    Write-Ok "卸载完成"
}

function Show-Usage {
    Write-Host ""
    Write-Host "ex-ai-spec  规范库安装工具 v$Version" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法: .\install.ps1 <命令> [目标目录] [选项]"
    Write-Host ""
    Write-Host "命令:" -ForegroundColor White
    Write-Host "  init [dir]        首次安装到目标项目（默认当前目录）"
    Write-Host "  update [dir]      更新通用规范，保留项目特有规则"
    Write-Host "  check [dir]       检查安装状态与链接有效性"
    Write-Host "  uninstall [dir]   卸载规范库"
    Write-Host ""
    Write-Host "选项:" -ForegroundColor White
    Write-Host "  --profile <name>  技术栈 (react|vue)                              默认 vue"
    Write-Host "  --level <L>       安装层级 (L1|L2|L3)                             默认 L3"
    Write-Host "  --ide <name>      指定 IDE (default|cursor|claude|opencode|trae|all)  默认 default(cursor+claude)"
    Write-Host "  --lint            安装 ESLint + Prettier + Stylelint（默认安装）"
    Write-Host "  --no-lint         跳过 lint/format 工具"
    Write-Host "  --husky           安装 Husky 提交校验（husky + lint-staged + commitlint）"
    Write-Host "  --no-husky        跳过提交校验（默认跳过）"
    Write-Host "  --uipro           安装 UI UX Pro Max 设计智能技能"
    Write-Host "  --no-uipro        跳过 UI UX Pro Max（非交互模式默认跳过）"
    Write-Host "  --repo <url>      自定义规范库地址"
    Write-Host "  --refresh-cache   清除本地缓存并重新克隆规范库"
    Write-Host "  -y, --force       跳过确认提示（用于非交互卸载）"
    Write-Host "  -h, --help        显示帮助"
    Write-Host ""
    Write-Host "安装层级:" -ForegroundColor White
    Write-Host "  L1  最小接入 -- 只接入 .agents（规范 + 技能）"
    Write-Host "  L2  标准接入 -- .agents + 工具适配层 + MCP 模板"
    Write-Host "  L3  完整接入 -- 在 L2 基础上引入 OpenSpec 流程"
    Write-Host ""
    Write-Host "示例:" -ForegroundColor White
    Write-Host "  .\install.ps1 init                                    # 交互式安装"
    Write-Host "  .\install.ps1 init C:\projects\my-app                 # Vue 项目标准安装"
    Write-Host "  .\install.ps1 init . --profile react --level L3       # React + OpenSpec"
    Write-Host "  .\install.ps1 init . --ide all                        # 为所有 IDE 创建适配"
    Write-Host "  .\install.ps1 init . --uipro                          # 安装含 UI UX Pro Max"
    Write-Host "  .\install.ps1 update                                  # 更新规范"
    Write-Host "  .\install.ps1 check                                   # 检查安装状态"
    Write-Host ""
    Write-Host "远程安装:" -ForegroundColor White
    Write-Host '  irm <raw-url>/install.ps1 | iex'
    Write-Host ""
}

# ============================================================================
# 入口
# ============================================================================

if ($AvailableProfiles -notcontains $script:Profile) {
    Write-Err "无效的 Profile: $($script:Profile) （可选: $($AvailableProfiles -join ', ')）"
    exit 1
}

switch ($script:Command) {
    "init"      { Invoke-Init -Dir $script:TargetDir }
    "update"    { Invoke-Update -Dir $script:TargetDir }
    "check"     { Invoke-Check -Dir $script:TargetDir }
    "uninstall" { Invoke-Uninstall -Dir $script:TargetDir }
    "help"      { Show-Usage }
    default     { Show-Usage }
}
