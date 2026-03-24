#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# ex-ai-spec  规范库安装脚本 (Bash)
# 适用于 macOS / Linux / Git Bash / WSL
# ============================================================================

VERSION="2.0.0"
SPEC_REPO="${BR_AI_SPEC_REPO:-http://git.100credit.cn/zhenwei.li/ex-ai-spec .git}"
CACHE_DIR="${BR_AI_SPEC_CACHE:-$HOME/.ex-ai-spec }"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

IDE_DIRS=(claude cursor opencode trae)
PROJECT_SPECIFIC_RULES=("01-项目概述.md" "03-项目结构.md")
AVAILABLE_PROFILES=("react" "vue")

NODE_MIN_VERSION=18
PKG_MANAGER=""

IDE_FILTER="default"
PROFILE="vue"
LEVEL="L3"
UIPRO="ask"
INSTALL_LINT="ask"
INSTALL_HUSKY="ask"
REFRESH_CACHE=""
FORCE=""
SPEC_BRANCH="${BR_AI_SPEC_BRANCH:-main}"
COMMAND=""
TARGET=""

# init/update 待汇总项（文末红色/黄色二次提醒）
declare -a INIT_PENDING_FAIL=()
declare -a INIT_PENDING_CFG=()
INIT_HAS_INSTALL_FAIL=0

# ---- 输出 ----
info()  { echo -e "${BLUE}ℹ${NC} $*"; }
ok()    { echo -e "${GREEN}✔${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
err()   { echo -e "${RED}✖${NC} $*"; }

# 清空待办（进入 init/update 时调用）
init_pending_reset() {
  INIT_PENDING_FAIL=()
  INIT_PENDING_CFG=()
  INIT_HAS_INSTALL_FAIL=0
}

# 仅清除安装失败类待办（供可选重试后重新收集）
clear_install_fail_pending() {
  INIT_PENDING_FAIL=()
  INIT_HAS_INSTALL_FAIL=0
}

# 安装/关键步骤失败：即时红字 + 文末汇总 + 影响退出码
install_fail() {
  local title="$1"
  local detail="$2"
  echo -e "${RED}✖${NC} ${title}"
  echo -e "  ${detail}"
  INIT_PENDING_FAIL+=("${title}"$'\t'"${detail}")
  INIT_HAS_INSTALL_FAIL=1
}

# 配置类提醒（非安装失败）：仅纳入文末「配置提醒」小节
pending_config_add() {
  local title="$1"
  local detail="$2"
  INIT_PENDING_CFG+=("${title}"$'\t'"${detail}")
}

_openspec_cli_ok() {
  command -v npx >/dev/null 2>&1 && npx openspec --version >/dev/null 2>&1
}

# 文末待处理事项（安装失败红字 + 配置黄字），置于 print_report 之后
print_pending_summary() {
  local n_fail=${#INIT_PENDING_FAIL[@]}
  local n_cfg=${#INIT_PENDING_CFG[@]}
  [ "$((n_fail + n_cfg))" -eq 0 ] && return 0

  echo ""
  if [ "$n_fail" -gt 0 ]; then
    echo -e "${RED}${BOLD}════════════════════════════════════════${NC}"
    echo -e "${RED}${BOLD}  待处理事项（安装或命令失败，请逐项处理）${NC}"
    echo -e "${RED}${BOLD}════════════════════════════════════════${NC}"
    local entry t d
    for entry in "${INIT_PENDING_FAIL[@]}"; do
      t="${entry%%$'\t'*}"
      d="${entry#*$'\t'}"
      echo -e "  ${RED}•${NC} ${BOLD}${t}${NC}"
      # detail 可能含多行
      while IFS= read -r line || [ -n "$line" ]; do
        echo -e "    ${line}"
      done <<< "$d"
    done
    echo -e "${RED}${BOLD}════════════════════════════════════════${NC}"
  fi

  if [ "$n_cfg" -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}${BOLD}════════════════════════════════════════${NC}"
    echo -e "${YELLOW}${BOLD}  配置提醒（非安装失败）${NC}"
    echo -e "${YELLOW}${BOLD}════════════════════════════════════════${NC}"
    local entry t d
    for entry in "${INIT_PENDING_CFG[@]}"; do
      t="${entry%%$'\t'*}"
      d="${entry#*$'\t'}"
      echo -e "  ${YELLOW}•${NC} ${BOLD}${t}${NC}"
      while IFS= read -r line || [ -n "$line" ]; do
        echo -e "    ${line}"
      done <<< "$d"
    done
    echo -e "${YELLOW}${BOLD}════════════════════════════════════════${NC}"
  fi
  echo ""
}

# TTY 下可选：重试全局安装 OpenSpec / uipro-cli
retry_failed_global_installs() {
  local target="$1"
  [ -t 0 ] || return 0
  [ "${INIT_HAS_INSTALL_FAIL:-0}" != 1 ] && return 0
  echo ""
  read -rp "是否再次尝试安装失败的全局依赖（OpenSpec CLI / uipro-cli）？(y/N) " ans
  [[ "$ans" =~ ^[Yy]$ ]] || return 0
  clear_install_fail_pending
  detect_pkg_manager
  [ "$LEVEL" = "L3" ] && setup_openspec "$target"
  [ "$UIPRO" = "yes" ] && setup_uipro "$target"
}

# ---- 平台检测 ----
is_windows() {
  [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* || "${OSTYPE:-}" == mingw* ]]
}

# ---- 创建目录链接（跨平台） ----
make_link() {
  local target="$1" link_path="$2"
  [ -L "$link_path" ] && rm -f "$link_path"
  [ -d "$link_path" ] && rm -rf "$link_path"

  if is_windows; then
    local abs_target
    abs_target="$(cd "$(dirname "$link_path")" && cd "$target" 2>/dev/null && pwd)" || true
    if [ -n "$abs_target" ]; then
      cmd //c "mklink /J \"$(cygpath -w "$link_path")\" \"$(cygpath -w "$abs_target")\"" >/dev/null 2>&1 && return 0
    fi
    ln -s "$target" "$link_path"
  else
    ln -s "$target" "$link_path"
  fi
}

# ---- 检测规范源 ----
detect_source() {
  # npm 包模式：优先使用 BR_AI_SPEC_LOCAL 指向的规范文件
  if [ -n "${BR_AI_SPEC_LOCAL:-}" ] && [ -d "$BR_AI_SPEC_LOCAL/.agents/rules/common" ] && [ -d "$BR_AI_SPEC_LOCAL/.agents/skills/common" ]; then
    SOURCE_DIR="$BR_AI_SPEC_LOCAL"
    info "使用 npm 包内规范库: $SOURCE_DIR"
    return 0
  fi

  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  if [ -d "$script_dir/.agents/rules/common" ] && [ -d "$script_dir/.agents/skills/common" ]; then
    SOURCE_DIR="$script_dir"
    info "使用本地规范库: $SOURCE_DIR"
  else
    if [ -n "$REFRESH_CACHE" ] && [ -d "$CACHE_DIR" ]; then
      info "清除缓存目录..."
      rm -rf "$CACHE_DIR"
    fi
    if [ -d "$CACHE_DIR/.git" ]; then
      info "更新规范库缓存..."
      git -C "$CACHE_DIR" pull --quiet 2>/dev/null || warn "缓存更新失败，将使用本地缓存（可能非最新版本）"
    else
      info "克隆规范库到 $CACHE_DIR ..."
      git clone --quiet -b "$SPEC_BRANCH" "$SPEC_REPO" "$CACHE_DIR" || { err "克隆失败，请检查: $SPEC_REPO"; exit 1; }
    fi
    SOURCE_DIR="$CACHE_DIR"
    ok "规范库缓存就绪"
  fi
}

# ---- 交互式选择 Profile ----
select_profile() {
  echo ""
  info "选择技术栈 Profile："
  echo "  1) vue    — Vue 3 + TypeScript + Pinia + Vue Router"
  echo "  2) react  — React + TypeScript + Antd + Zustand"
  echo ""
  read -rp "请选择 (1/2) [默认 1]: " choice
  case "$choice" in
    2) PROFILE="react" ;;
    *) PROFILE="vue" ;;
  esac
  ok "已选择 Profile: $PROFILE"
}

# ---- 交互式选择安装层级 ----
select_level() {
  echo ""
  info "选择安装层级："
  echo "  L1) 最小接入 — 只接入 .agents（规范 + 技能）"
  echo "  L2) 标准接入 — .agents + 工具适配层 + MCP 模板"
  echo "  L3) 完整接入 — 在 L2 基础上引入 OpenSpec 流程"
  echo ""
  read -rp "请选择 (L1/L2/L3) [默认 L3]: " choice
  case "$choice" in
    L1|l1|1) LEVEL="L1" ;;
    L2|l2|2) LEVEL="L2" ;;
    *)       LEVEL="L3" ;;
  esac
  ok "已选择层级: $LEVEL"
}

# ---- 交互式选择 UI UX Pro Max ----
select_uipro() {
  echo ""
  info "是否安装 UI UX Pro Max 设计智能技能？"
  echo "  提供 67 种 UI 风格、161 套配色方案、57 组字体搭配、99 条 UX 准则"
  echo "  适用于需要 AI 自主做出设计决策的场景（无设计稿时特别有用）"
  echo ""
  read -rp "安装 UI UX Pro Max? (Y/n) [默认 Y]: " choice
  case "$choice" in
    [Nn]*) UIPRO="no"; info "跳过 UI UX Pro Max" ;;
    *)     UIPRO="yes"; ok "将安装 UI UX Pro Max" ;;
  esac
}

# ---- 交互式选择 lint/format 工具 ----
select_lint_tools() {
  echo ""
  info "是否安装 ESLint + Prettier + Stylelint 配置？"
  echo "  部署配置文件并安装对应依赖包"
  echo ""
  read -rp "安装 lint/format 工具? (Y/n) [默认 Y]: " choice
  case "$choice" in
    [Nn]*) INSTALL_LINT="no"; info "跳过 lint/format 工具" ;;
    *)     INSTALL_LINT="yes"; ok "将安装 lint/format 工具" ;;
  esac

  echo ""
  info "是否安装 Husky 提交校验（husky + lint-staged + commitlint）？"
  echo "  注册 Git hooks，提交前自动 lint，校验 commit message"
  echo ""
  read -rp "安装提交校验? (y/N) [默认 N]: " choice
  case "$choice" in
    [Yy]*) INSTALL_HUSKY="yes"; ok "将安装提交校验" ;;
    *)     INSTALL_HUSKY="no"; info "跳过提交校验" ;;
  esac
}

# ---- Node 环境前置检查 ----
check_node_env() {
  if ! command -v node >/dev/null 2>&1; then
    err "未检测到 Node.js 环境"
    echo ""
    echo -e "  ${BOLD}请先安装 Node.js (>= $NODE_MIN_VERSION):${NC}"
    echo "    方式 1: nvm install $NODE_MIN_VERSION        (推荐，https://github.com/nvm-sh/nvm)"
    echo "    方式 2: volta install node@$NODE_MIN_VERSION  (https://volta.sh)"
    echo "    方式 3: 从官网下载                    (https://nodejs.org)"
    echo ""
    exit 1
  fi

  local node_version
  node_version="$(node --version | sed 's/^v//' | cut -d. -f1)"
  if [ "$node_version" -lt "$NODE_MIN_VERSION" ] 2>/dev/null; then
    err "Node.js 版本过低: v$(node --version | sed 's/^v//') (最低要求: v$NODE_MIN_VERSION)"
    echo ""
    echo -e "  ${BOLD}请升级 Node.js:${NC}"
    echo "    nvm:   nvm install $NODE_MIN_VERSION && nvm use $NODE_MIN_VERSION"
    echo "    volta: volta install node@$NODE_MIN_VERSION"
    echo ""
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1 && ! command -v pnpm >/dev/null 2>&1; then
    err "Node.js 已安装 (v$(node --version | sed 's/^v//')), 但未找到 npm 或 pnpm"
    echo ""
    echo "  请确认 Node.js 安装完整，或手动安装包管理器:"
    echo "    npm install -g pnpm"
    echo ""
    exit 1
  fi

  ok "Node.js v$(node --version | sed 's/^v//') 环境就绪"
}

# ---- 包管理器检测（pnpm 优先） ----
detect_pkg_manager() {
  if command -v pnpm >/dev/null 2>&1; then
    PKG_MANAGER="pnpm"
    ok "使用包管理器: pnpm ($(pnpm --version))"
    return 0
  fi

  if ! command -v npm >/dev/null 2>&1; then
    warn "未找到 npm 或 pnpm，跳过依赖安装"
    PKG_MANAGER=""
    return 1
  fi

  info "未检测到 pnpm，正在通过 npm 安装（超时 120 秒）..."
  local install_ok=false
  if is_windows; then
    timeout 120 npm install -g pnpm >/dev/null 2>&1 && install_ok=true
  else
    if command -v timeout >/dev/null 2>&1; then
      timeout 120 npm install -g pnpm >/dev/null 2>&1 && install_ok=true
    else
      # macOS 没有 timeout 命令，使用 perl 替代
      perl -e 'alarm 120; exec @ARGV' npm install -g pnpm >/dev/null 2>&1 && install_ok=true
    fi
  fi

  if $install_ok && command -v pnpm >/dev/null 2>&1; then
    ok "pnpm 安装成功 ($(pnpm --version))"
    PKG_MANAGER="pnpm"
  else
    warn "pnpm 安装失败或超时，回退使用 npm"
    PKG_MANAGER="npm"
  fi
}

# ---- Monorepo（pnpm / npm workspaces）安装目标解析 ----
# 说明：本组函数仅将「最终安装目录」打印到 stdout；其余提示一律走 stderr，便于 target=$(...) 捕获。

_pkg_json_has_workspaces() {
  local pj="$1/package.json"
  [ -f "$pj" ] || return 1
  if command -v node >/dev/null 2>&1; then
    node -e "try{const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.exit(j.workspaces?0:1)}catch(e){process.exit(1)}" "$pj" 2>/dev/null && return 0
  fi
  grep -qE '"workspaces"[[:space:]]*:' "$pj" 2>/dev/null
}

# 自 start_dir 向上查找 workspace 根目录；成功则打印物理路径
find_monorepo_workspace_root() {
  local start="$1"
  local d
  d="$(cd "$start" 2>/dev/null && pwd -P)" || return 1
  while true; do
    if [ -f "$d/pnpm-workspace.yaml" ]; then
      echo "$d"
      return 0
    fi
    if _pkg_json_has_workspaces "$d"; then
      echo "$d"
      return 0
    fi
    local parent
    parent="$(dirname "$d")"
    [ "$parent" = "$d" ] && break
    d="$parent"
  done
  return 1
}

# 将安装目标解析为物理绝对路径（始终使用用户指定的目录，不再做 Monorepo 子包重定向）
resolve_install_target() {
  local target="$1"
  (cd "$target" 2>/dev/null && pwd -P) || { err "无法进入目录: $target"; return 1; }
}

# ---- 复制 .agents/（Profile 合并） ----
copy_agents() {
  local target="$1" agents_dst="$1/.agents"
  mkdir -p "$agents_dst/rules" "$agents_dst/skills"

  local src_common_rules="$SOURCE_DIR/.agents/rules/common"
  local src_profile_rules="$SOURCE_DIR/.agents/rules/profiles/$PROFILE"
  local src_common_skills="$SOURCE_DIR/.agents/skills/common"
  local src_profile_skills="$SOURCE_DIR/.agents/skills/profiles/$PROFILE"

  # 验证 Profile 存在
  if [ ! -d "$src_profile_rules" ]; then
    err "Profile '$PROFILE' 的 rules 目录不存在: $src_profile_rules"
    exit 1
  fi

  # rules: 合并 common + profile 到扁平目录
  info "同步 rules (common + profiles/$PROFILE) ..."

  for file in "$src_common_rules/"*.md; do
    [ -f "$file" ] || continue
    local name; name="$(basename "$file")"
    cp "$file" "$agents_dst/rules/$name"
  done

  for file in "$src_profile_rules/"*.md; do
    [ -f "$file" ] || continue
    local name; name="$(basename "$file")"

    local is_specific=false
    for ps in "${PROJECT_SPECIFIC_RULES[@]}"; do
      [ "$name" = "$ps" ] && { is_specific=true; break; }
    done

    if $is_specific && [ -f "$agents_dst/rules/$name" ]; then
      warn "跳过项目特有规则: ${name}（已存在）"
    else
      cp "$file" "$agents_dst/rules/$name"
      $is_specific && info "已生成模板: $name → 请根据项目实际情况修改"
    fi
  done

  # 复制 rules README
  [ -f "$SOURCE_DIR/.agents/rules/README.md" ] && cp "$SOURCE_DIR/.agents/rules/README.md" "$agents_dst/rules/README.md"

  # skills: 合并 common + profile 到扁平目录
  info "同步 skills (common + profiles/$PROFILE) ..."

  if [ -d "$src_common_skills" ]; then
    for skill_dir in "$src_common_skills"/*/; do
      [ -d "$skill_dir" ] || continue
      local skill_name; skill_name="$(basename "$skill_dir")"
      rm -rf "$agents_dst/skills/$skill_name"
      cp -R "$skill_dir" "$agents_dst/skills/$skill_name"
    done
  fi

  if [ -d "$src_profile_skills" ]; then
    for skill_dir in "$src_profile_skills"/*/; do
      [ -d "$skill_dir" ] || continue
      local skill_name; skill_name="$(basename "$skill_dir")"
      rm -rf "$agents_dst/skills/$skill_name"
      cp -R "$skill_dir" "$agents_dst/skills/$skill_name"
    done
  fi

  # 复制 skills README
  [ -f "$SOURCE_DIR/.agents/skills/README.md" ] && cp "$SOURCE_DIR/.agents/skills/README.md" "$agents_dst/skills/README.md"

  ok ".agents/ 同步完成 (profile: $PROFILE)"
}

# ---- 复制 lint/format 配置文件 ----
# 参数: $1=源目录 $2=目标目录 $3=skip_existing（非空则跳过已存在的文件）
#       $4=skip_husky_artifacts（非空则跳过 .husky / .lintstagedrc / commitlint.config.js）
_copy_config_dir() {
  local src="$1" target="$2" skip_existing="${3:-}" skip_husky="${4:-}"
  [ -d "$src" ] || return 1
  local copied=false

  # 复制点开头的文件（.prettierrc.json, .lintstagedrc 等）
  for f in "$src"/.*; do
    local name; name="$(basename "$f")"
    [[ "$name" == "." || "$name" == ".." ]] && continue
    if [ -n "$skip_husky" ]; then
      [[ "$name" == ".husky" || "$name" == ".lintstagedrc" ]] && continue
    fi
    if [ -f "$f" ]; then
      if [ -n "$skip_existing" ] && [ -f "$target/$name" ]; then
        info "  跳过已存在: $name"
        continue
      fi
      cp "$f" "$target/$name"
      copied=true
    elif [ -d "$f" ]; then
      if [ -n "$skip_existing" ] && [ -d "$target/$name" ]; then
        info "  跳过已存在: $name/"
        continue
      fi
      mkdir -p "$target/$name"
      cp -R "$f"/* "$target/$name/" 2>/dev/null || true
      copied=true
    fi
  done

  # 复制非点开头的文件（commitlint.config.js 等）
  for f in "$src"/*; do
    [ -f "$f" ] || continue
    local name; name="$(basename "$f")"
    if [ -n "$skip_husky" ] && [ "$name" = "commitlint.config.js" ]; then
      continue
    fi
    if [ -n "$skip_existing" ] && [ -f "$target/$name" ]; then
      info "  跳过已存在: $name"
      continue
    fi
    cp "$f" "$target/$name"
    copied=true
  done

  $copied
}

# 参数: $1=目标目录 $2=skip_existing（非空则跳过已存在的文件）
copy_configs() {
  local target="$1" skip_existing="${2:-}"
  local src_common="$SOURCE_DIR/configs/common"
  local src_profile="$SOURCE_DIR/configs/profiles/$PROFILE"
  local copied=false
  local skip_husky=""

  # 未选提交校验且目标尚无 .husky 时，不复制 husky/lint-staged/commitlint 模板（避免「跳过 Husky」仍出现 .husky）
  if [ "$INSTALL_HUSKY" != "yes" ] && [ ! -d "$target/.husky" ]; then
    skip_husky=1
    info "提交校验相关配置（.husky / .lintstagedrc / commitlint）将跳过同步"
  fi

  if [ -d "$src_common" ]; then
    info "同步 lint/format 配置 (common) ..."
    _copy_config_dir "$src_common" "$target" "$skip_existing" "$skip_husky" && copied=true
  fi

  if [ -d "$src_profile" ]; then
    info "同步 lint/format 配置 (profiles/$PROFILE) ..."
    _copy_config_dir "$src_profile" "$target" "$skip_existing" "$skip_husky" && copied=true
  fi

  $copied && ok "lint/format 配置部署完成" || info "未找到 lint/format 配置模板，跳过"
}

# pnpm 在 workspace 根向根 package.json 添加依赖需 -w，否则 ERR_PNPM_ADDING_TO_ROOT
_is_pnpm_workspace_package_root() {
  local target="$1"
  local t_canon ws_root
  t_canon="$(cd "$target" 2>/dev/null && pwd -P)" || return 1
  ws_root="$(find_monorepo_workspace_root "$t_canon" 2>/dev/null)" || return 1
  [ "$t_canon" = "$ws_root" ]
}

# 向安装目标的 package.json 添加 devDependencies（npm: install -D；pnpm: add [-w] -D）
install_dev_dependencies_at() {
  local target="$1"
  shift
  [ "$#" -ge 1 ] || return 1
  if [ "$PKG_MANAGER" = "pnpm" ]; then
    if _is_pnpm_workspace_package_root "$target"; then
      (cd "$target" && pnpm add -w -D "$@")
    else
      (cd "$target" && pnpm add -D "$@")
    fi
  else
    (cd "$target" && npm install -D "$@")
  fi
}

# ---- 安装提交校验依赖（husky + lint-staged + commitlint） ----
install_commit_hooks() {
  local target="$1"
  local manual_hint
  [ -f "$target/package.json" ] || { install_fail "提交校验：未找到 package.json" "已跳过依赖安装。请在含 package.json 的目录执行 init，或先创建 package.json。"; return 0; }
  [ -n "$PKG_MANAGER" ] || { install_fail "提交校验：无可用的包管理器" "无法安装 husky 等依赖。请安装 npm/pnpm 后重试。"; return 0; }

  if [ "$PKG_MANAGER" = "pnpm" ] && _is_pnpm_workspace_package_root "$target"; then
    manual_hint="cd $target && pnpm add -w -D husky@8 lint-staged@15 @commitlint/cli@19 @commitlint/config-conventional@19"
  elif [ "$PKG_MANAGER" = "pnpm" ]; then
    manual_hint="cd $target && pnpm add -D husky@8 lint-staged@15 @commitlint/cli@19 @commitlint/config-conventional@19"
  else
    manual_hint="cd $target && npm install -D husky@8 lint-staged@15 @commitlint/cli@19 @commitlint/config-conventional@19"
  fi

  info "正在使用 $PKG_MANAGER 安装提交校验依赖，请稍候 ..."
  info "  husky@8 + lint-staged@15 + @commitlint/cli@19 + @commitlint/config-conventional@19"
  if ! install_dev_dependencies_at "$target" husky@8 lint-staged@15 @commitlint/cli@19 @commitlint/config-conventional@19; then
    install_fail "提交校验依赖安装失败" "请手动执行: $manual_hint"
    return 0
  fi

  info "初始化 husky ..."
  if ! (cd "$target" && npx husky install); then
    install_fail "husky install 失败" "请手动执行: cd $target && npx husky install"
    return 0
  fi

  ok "提交校验工具链安装完成 (husky@8 + lint-staged + commitlint)"
}

# ---- 安装 lint/format 依赖（eslint + prettier + stylelint） ----
install_lint_deps() {
  local target="$1"
  local deps manual_hint
  [ -f "$target/package.json" ] || { install_fail "lint/format：未找到 package.json" "已跳过依赖安装。请在含 package.json 的目录执行 init。"; return 0; }
  [ -n "$PKG_MANAGER" ] || { install_fail "lint/format：无可用的包管理器" "无法安装 ESLint 等依赖。请安装 npm/pnpm 后重试。"; return 0; }

  deps="eslint prettier stylelint stylelint-config-standard"
  if [ "$PROFILE" = "vue" ]; then
    deps="$deps stylelint-config-html stylelint-config-recommended-vue postcss-html"
  fi

  if [ "$PKG_MANAGER" = "pnpm" ] && _is_pnpm_workspace_package_root "$target"; then
    manual_hint="cd $target && pnpm add -w -D $deps"
  elif [ "$PKG_MANAGER" = "pnpm" ]; then
    manual_hint="cd $target && pnpm add -D $deps"
  else
    manual_hint="cd $target && npm install -D $deps"
  fi

  info "正在使用 $PKG_MANAGER 安装 lint/format 依赖，请稍候 ..."
  info "  $deps"
  # shellcheck disable=SC2086
  if ! install_dev_dependencies_at "$target" $deps; then
    install_fail "lint/format 依赖安装失败" "请手动执行: $manual_hint"
    return 0
  fi

  ok "lint/format 依赖安装完成"
}

# ---- 创建 IDE 链接（逐个 skill 目录链接，给 OpenSpec 留空间） ----
create_ide_links() {
  local target="$1"

  # 解析 IDE 过滤列表
  local -a ide_list
  case "$IDE_FILTER" in
    all)     ide_list=("${IDE_DIRS[@]}") ;;
    default) ide_list=(cursor claude) ;;
    *)       ide_list=("$IDE_FILTER") ;;
  esac

  for ide in "${ide_list[@]}"; do
    local ide_dir="$target/.$ide"
    mkdir -p "$ide_dir"

    # rules: 整体软链接
    make_link "../.agents/rules" "$ide_dir/rules"

    # skills: 逐个 skill 目录链接（不做整体链接，给 OpenSpec 留空间）
    mkdir -p "$ide_dir/skills"
    for skill_dir in "$target/.agents/skills"/*/; do
      [ -d "$skill_dir" ] || continue
      local skill_name; skill_name="$(basename "$skill_dir")"
      [ "$skill_name" = "common" ] || [ "$skill_name" = "profiles" ] && continue
      local link_target="../../.agents/skills/$skill_name"
      local link_path="$ide_dir/skills/$skill_name"
      if [ -L "$link_path" ]; then
        local current_target; current_target="$(readlink "$link_path")" || true
        [ "$current_target" = "$link_target" ] && continue
      fi
      make_link "$link_target" "$link_path"
    done

    ok ".$ide/ 链接就绪"
  done
}

# ---- 复制 Cursor 额外文件 ----
copy_cursor_extras() {
  local target="$1"
  [[ "$IDE_FILTER" != "all" && "$IDE_FILTER" != "default" && "$IDE_FILTER" != "cursor" ]] && return 0

  local cursor_dst="$target/.cursor"
  mkdir -p "$cursor_dst"

  # mcp.json（仅在不存在时复制）
  if [ -f "$SOURCE_DIR/.cursor/mcp.json" ] && [ ! -f "$cursor_dst/mcp.json" ]; then
    cp "$SOURCE_DIR/.cursor/mcp.json" "$cursor_dst/mcp.json"
    info ".cursor/mcp.json 已生成（请在 Cursor「设置 → MCP」中按需启用并完成凭证配置）"
    pending_config_add ".cursor/mcp.json" "在 Cursor「设置 → MCP」中按需启用服务后，将各条目中的 project-id、access-token 等占位符替换为真实值。"
  fi

  # commands/（复制 *.md）
  local cmds_src="$SOURCE_DIR/.cursor/commands"
  if [ -d "$cmds_src" ]; then
    local cmds_dst="$cursor_dst/commands"
    mkdir -p "$cmds_dst"
    cp "$cmds_src"/*.md "$cmds_dst/" 2>/dev/null && ok ".cursor/commands/ 已同步" || true
  fi
}

# ---- 安装 OpenSpec（L3） ----
setup_openspec() {
  local target="$1"
  local tools_arg logf tail_err

  info "配置 OpenSpec ..."

  if ! _openspec_cli_ok; then
    if ! command -v npx >/dev/null 2>&1; then
      install_fail "OpenSpec：npx 不可用" "无法安装或运行 openspec。请安装 Node.js 完整发行版后重试。"
    elif [ -z "$PKG_MANAGER" ]; then
      install_fail "OpenSpec CLI 不可用" "未检测到包管理器，无法自动全局安装。请执行: npm install -g @fission-ai/openspec@latest"
    else
      info "正在全局安装 @fission-ai/openspec ..."
      logf="$(mktemp)"
      if [ "$PKG_MANAGER" = "pnpm" ]; then
        pnpm add -g @fission-ai/openspec@latest >"$logf" 2>&1 || true
      else
        npm install -g @fission-ai/openspec@latest >"$logf" 2>&1 || true
      fi
      if _openspec_cli_ok; then
        ok "openspec CLI 已安装并可用"
        rm -f "$logf"
      else
        tail_err="$(tail -n 25 "$logf" 2>/dev/null || true)"
        install_fail "OpenSpec CLI 自动全局安装失败" "日志文件: $logf"$'\n'"日志尾部:"$'\n'"${tail_err}"$'\n'"请手动执行: npm install -g @fission-ai/openspec@latest 或 pnpm add -g @fission-ai/openspec@latest"
      fi
    fi
  else
    ok "openspec CLI 可用"
  fi

  if _openspec_cli_ok; then
    tools_arg="cursor"
    case "$IDE_FILTER" in
      all)     tools_arg="cursor,claude,opencode,trae" ;;
      default) tools_arg="cursor,claude" ;;
      *)       tools_arg="$IDE_FILTER" ;;
    esac
    if [ ! -f "$target/openspec/config.yaml" ] && [ ! -f "$target/openspec/config.yml" ]; then
      info "运行 openspec init ..."
      logf="$(mktemp)"
      if ! (cd "$target" && npx openspec init --tools "$tools_arg" --force --no-interactive >"$logf" 2>&1); then
        tail_err="$(tail -n 40 "$logf" 2>/dev/null || true)"
        install_fail "openspec init 失败" "日志文件: $logf"$'\n'"日志尾部:"$'\n'"${tail_err}"$'\n'"请在目录 $target 下手动排查后执行: npx openspec init --tools \"$tools_arg\""
      else
        rm -f "$logf"
      fi
    else
      info "openspec/ 已存在，运行 openspec update ..."
      logf="$(mktemp)"
      if ! (cd "$target" && npx openspec update --force >"$logf" 2>&1); then
        tail_err="$(tail -n 40 "$logf" 2>/dev/null || true)"
        install_fail "openspec update 失败" "日志文件: $logf"$'\n'"日志尾部:"$'\n'"${tail_err}"$'\n'"请在目录 $target 下手动执行: npx openspec update --force"
      else
        rm -f "$logf"
      fi
    fi
  fi

  # 无论 CLI 是否可用，始终确保目录骨架存在
  mkdir -p "$target/openspec/specs" "$target/openspec/changes/archive"

  # 合并增强版 config.yaml 模板
  local template="$SOURCE_DIR/openspec/config.yaml.template"
  local config_file="$target/openspec/config.yaml"
  if [ -f "$template" ]; then
    if [ -f "$config_file" ]; then
      if ! grep -q "^context:" "$config_file" 2>/dev/null; then
        info "合并 ex-ai-spec  context/rules 到 config.yaml ..."
        tail -n +2 "$template" >> "$config_file"
        ok "config.yaml 已增强"
      else
        info "config.yaml 已包含 context 字段，跳过合并"
      fi
    else
      mkdir -p "$(dirname "$config_file")"
      cp "$template" "$config_file"
      ok "openspec/config.yaml 已创建"
    fi
  fi

  ok "OpenSpec 配置完成"
}

# ---- 安装 UI UX Pro Max 设计智能技能 ----
setup_uipro() {
  local target="$1"
  local skill_dir="$target/.agents/skills/ui-ux-pro-max"
  local logf tail_err

  if [ -d "$skill_dir" ] && [ -f "$skill_dir/SKILL.md" ]; then
    ok "UI UX Pro Max 已安装，跳过"
    return 0
  fi

  [ -n "$PKG_MANAGER" ] || { install_fail "UI UX Pro Max：无可用的包管理器" "无法全局安装 uipro-cli。请安装 npm/pnpm 后重试。"; return 0; }

  if ! command -v uipro >/dev/null 2>&1; then
    info "安装 uipro-cli ..."
    logf="$(mktemp)"
    if [ "$PKG_MANAGER" = "pnpm" ]; then
      pnpm add -g uipro-cli >"$logf" 2>&1 || true
    else
      npm install -g uipro-cli >"$logf" 2>&1 || true
    fi
    if ! command -v uipro >/dev/null 2>&1; then
      tail_err="$(tail -n 25 "$logf" 2>/dev/null || true)"
      install_fail "uipro-cli 全局安装失败" "日志文件: $logf"$'\n'"日志尾部:"$'\n'"${tail_err}"$'\n'"请检查权限/网络/registry，或手动执行: npm install -g uipro-cli"
      return 0
    fi
    rm -f "$logf"
    ok "uipro-cli 安装成功"
  fi

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  info "下载 UI UX Pro Max 资源 ..."
  logf="$(mktemp)"
  if ! (cd "$tmp_dir" && uipro init --ai cursor >"$logf" 2>&1); then
    tail_err="$(tail -n 40 "$logf" 2>/dev/null || true)"
    install_fail "uipro init 失败" "日志文件: $logf"$'\n'"日志尾部:"$'\n'"${tail_err}"$'\n'"请检查网络后重试，或手动执行: uipro init --ai cursor"
    rm -rf "$tmp_dir"
    return 0
  fi
  rm -f "$logf"

  if [ ! -d "$tmp_dir/.shared/ui-ux-pro-max" ]; then
    install_fail "UI UX Pro Max 资源目录缺失" "未找到 .shared/ui-ux-pro-max，可能是 uipro-cli 版本或网络问题。请升级 uipro-cli 后重试。"
    rm -rf "$tmp_dir"
    return 0
  fi

  mkdir -p "$skill_dir/data"
  cp -R "$tmp_dir/.shared/ui-ux-pro-max/"* "$skill_dir/data/"

  if [ -f "$tmp_dir/.cursor/commands/ui-ux-pro-max.md" ]; then
    local src_prompt="$tmp_dir/.cursor/commands/ui-ux-pro-max.md"
    {
      echo "---"
      echo "name: ui-ux-pro-max"
      echo "description: AI 设计智能技能，提供 67 种 UI 风格、161 套配色方案、57 组字体搭配、99 条 UX 准则。当需要 AI 自主做出 UI/UX 设计决策时使用本技能。"
      echo "---"
      echo ""
      sed 's|\.shared/ui-ux-pro-max/|data/|g' "$src_prompt"
    } > "$skill_dir/SKILL.md"
  else
    cat > "$skill_dir/SKILL.md" <<'SKILL_EOF'
---
name: ui-ux-pro-max
description: AI 设计智能技能，提供 67 种 UI 风格、161 套配色方案、57 组字体搭配、99 条 UX 准则。当需要 AI 自主做出 UI/UX 设计决策时使用本技能。
---

# UI UX Pro Max

本技能为 AI 注入专业 UI/UX 设计决策能力。

## 使用时机

- 没有设计稿，需要 AI 自主选择风格、配色、字体
- 需要生成完整的设计系统（Design System）
- 需要行业特定的 UI/UX 建议

## 数据目录

设计数据库和搜索脚本位于 `data/` 子目录，使用 Python 3 运行搜索。

## 与其它技能的关系

- **design-analysis**：有设计稿时用 design-analysis 分析；无设计稿时用本技能生成设计决策
- **ui-verification**：实现后用 ui-verification 验收
- **web-design-guidelines**：本技能提供设计决策，web-design-guidelines 审查实现合规性
SKILL_EOF
  fi

  rm -rf "$tmp_dir"
  ok "UI UX Pro Max 安装完成"
}

# ---- 检查工具 ----
check_tools() {
  info "工具环境："
  command -v git  >/dev/null 2>&1 && ok "  git $(git --version | awk '{print $3}')" || err "  git 未安装"
  command -v node >/dev/null 2>&1 && ok "  node $(node --version)"               || warn "  node 未安装（OpenSpec 需要）"
  command -v npx  >/dev/null 2>&1 && ok "  npx 可用"                               || warn "  npx 不可用"
  if [ "$LEVEL" = "L3" ]; then
    if command -v npx >/dev/null 2>&1; then
      npx openspec --version >/dev/null 2>&1 && ok "  openspec 已安装" || warn "  openspec 未安装 → npm install -g @fission-ai/openspec@latest"
    fi
  fi
  if [ "$UIPRO" = "yes" ] || [ -d "${TARGET:-.}/.agents/skills/ui-ux-pro-max" ]; then
    command -v python3 >/dev/null 2>&1 && ok "  python3 $(python3 --version 2>&1 | awk '{print $2}')" || warn "  python3 未安装（UI UX Pro Max 搜索脚本需要）"
  fi
}

# ---- 安装报告 ----
print_report() {
  local target="$1"
  local has_pending=$(( ${#INIT_PENDING_FAIL[@]} + ${#INIT_PENDING_CFG[@]} ))
  echo ""
  echo -e "${BOLD}════════════════════════════════════════${NC}"
  if [ "$has_pending" -gt 0 ]; then
    info "规范与配置文件已同步到项目。"
    echo -e "${YELLOW}⚠${NC} 存在 ${has_pending} 项待处理（见文末「待处理事项 / 配置提醒」汇总）。"
    echo -e "${BOLD}════════════════════════════════════════${NC}"
  else
    ok "安装完成！"
    echo -e "${BOLD}════════════════════════════════════════${NC}"
  fi
  echo ""
  info "安装配置："
  echo -e "  Profile:  ${BOLD}$PROFILE${NC}"
  echo -e "  Level:    ${BOLD}$LEVEL${NC}"
  echo -e "  IDE:      ${BOLD}$IDE_FILTER${NC}"
  echo -e "  UIPro:    ${BOLD}$UIPRO${NC}"
  echo ""
  info "已部署内容："
  echo -e "  ${GREEN}✔${NC} .agents/rules + skills (profile: $PROFILE)"
  if [ "$INSTALL_LINT" = "yes" ]; then
    echo -e "  ${GREEN}✔${NC} lint/format 配置 (.prettierrc, .eslintrc, .stylelintrc)"
  else
    echo -e "  ${YELLOW}—${NC} lint/format 配置（已跳过）"
  fi
  if [ "$INSTALL_HUSKY" = "yes" ]; then
    echo -e "  ${GREEN}✔${NC} 提交校验 (.husky, .lintstagedrc, commitlint.config.js)"
  else
    echo -e "  ${YELLOW}—${NC} 提交校验（已跳过）"
  fi
  if [ -d "$target/.agents/skills/ui-ux-pro-max" ] && [ -f "$target/.agents/skills/ui-ux-pro-max/SKILL.md" ]; then
    echo -e "  ${GREEN}✔${NC} UI UX Pro Max 设计智能技能 (67 styles, 161 palettes)"
  elif [ "$UIPRO" = "yes" ]; then
    echo -e "  ${RED}✖${NC} UI UX Pro Max（已选择安装但未就绪，见文末待处理事项）"
  fi
  if [ "$LEVEL" != "L1" ]; then
    echo -e "  ${GREEN}✔${NC} IDE 适配 (.cursor, .claude)"
  fi
  echo ""
  info "后续步骤："
  echo -e "  1. 编辑 ${BOLD}.agents/rules/01-项目概述.md${NC}  填写项目定位和技术栈"
  echo -e "  2. 编辑 ${BOLD}.agents/rules/03-项目结构.md${NC}  填写项目目录结构"
  if [ "$LEVEL" != "L1" ]; then
    echo -e "  3. 配置 ${BOLD}.cursor/mcp.json${NC}（按需启用 MCP）"
    echo -e "     ${YELLOW}→${NC} Cursor 里各 MCP 默认关闭/未启用是预期行为，并非安装失败"
    echo -e "     ${YELLOW}→${NC} 先在 ${BOLD}设置 → MCP${NC} 中按需打开目标服务，再编辑 JSON"
    echo -e "     ${YELLOW}→${NC} 将 ApiFox 等条目的 ${BOLD}project-id${NC}、${BOLD}access-token${NC} 等占位符换成真实值"
    echo -e "     ${YELLOW}→${NC} 不需要的服务保持关闭即可；若条目含 ${BOLD}disabled${NC}，启用前请先完成凭证配置"
  fi
  if [ "$LEVEL" = "L3" ]; then
    echo -e "  4. 使用 ${BOLD}/opsx-propose${NC}              开始第一个变更提案"
  fi
  echo -e "  *  在 AI IDE 中输入 \"初始化项目规范\" 让 AI 自动生成 01/03"
  echo ""
}

# ============================================================================
# 子命令
# ============================================================================

cmd_init() {
  local target
  target="$(cd "${1:-.}" 2>/dev/null && pwd || { mkdir -p "${1:-.}"; cd "${1:-.}" && pwd; })"

  local _resolved
  if ! _resolved="$(resolve_install_target "$target")"; then
    exit 1
  fi
  target="$_resolved"
  init_pending_reset

  echo ""
  info "ex-ai-spec  v${VERSION} | $(uname -s) $(uname -m) | Node $(node --version 2>/dev/null || echo 'N/A')"
  info "初始化项目: $target"
  echo ""

  # 已初始化检测
  if [ -d "$target/.agents" ]; then
    warn "目标项目已包含 .agents/ 目录"
    echo -e "  如果只需更新规范，请使用: ${BOLD}install.sh update${NC}"
    echo ""
    if [ -t 0 ]; then
      read -rp "继续初始化将覆盖现有规范（01/03 除外），确认？(y/N) " ans
      [[ "$ans" =~ ^[Yy]$ ]] || { info "已取消"; exit 0; }
    else
      warn "非交互模式，继续覆盖安装"
    fi
  fi

  # 前置环境检查
  check_node_env
  detect_pkg_manager

  # 交互式引导（仅在使用默认值且终端可交互时触发）
  if [ -t 0 ] && [ "$PROFILE" = "vue" ] && [ "$LEVEL" = "L3" ]; then
    select_profile
    select_level
  fi

  # UI UX Pro Max 选择（交互模式 + UIPRO=ask 时触发）
  if [ -t 0 ] && [ "$UIPRO" = "ask" ]; then
    select_uipro
  fi

  # lint/format 工具选择（交互模式 + ask 时触发）
  if [ -t 0 ] && [ "$INSTALL_LINT" = "ask" ]; then
    select_lint_tools
  fi
  # 非交互模式下 ask 保持默认值
  [ "$INSTALL_LINT" = "ask" ] && INSTALL_LINT="yes"
  [ "$INSTALL_HUSKY" = "ask" ] && INSTALL_HUSKY="no"

  detect_source

  # L1: 只安装 .agents
  copy_agents "$target"

  # lint/format 配置（可选）
  if [ "$INSTALL_LINT" = "yes" ]; then
    copy_configs "$target"
    install_lint_deps "$target"
  fi

  # 提交校验（可选）
  if [ "$INSTALL_HUSKY" = "yes" ]; then
    install_commit_hooks "$target"
  fi

  # UI UX Pro Max（可选）
  if [ "$UIPRO" = "yes" ]; then
    setup_uipro "$target"
  fi

  # L2: + IDE 适配层 + MCP
  if [ "$LEVEL" = "L2" ] || [ "$LEVEL" = "L3" ]; then
    create_ide_links "$target"
    copy_cursor_extras "$target"
  fi

  # L3: + OpenSpec
  if [ "$LEVEL" = "L3" ]; then
    setup_openspec "$target"
  fi

  TARGET="$target"
  check_tools
  retry_failed_global_installs "$target"
  print_report "$target"
  print_pending_summary
  [ "${INIT_HAS_INSTALL_FAIL:-0}" = 1 ] && exit 1
}

cmd_update() {
  local target
  target="$(cd "${1:-.}" && pwd)"
  [ -d "$target/.agents" ] || { err "$target 未找到 .agents/，请先运行 init"; exit 1; }
  init_pending_reset
  info "更新规范: $target"
  detect_pkg_manager
  detect_source
  copy_agents "$target"
  copy_configs "$target" "skip_existing"

  # UI UX Pro Max：已安装则更新，或用户显式指定 --uipro
  if [ "$UIPRO" = "yes" ] || [ -d "$target/.agents/skills/ui-ux-pro-max" ]; then
    UIPRO="yes"
    rm -rf "$target/.agents/skills/ui-ux-pro-max"
    setup_uipro "$target"
  fi

  if [ "$LEVEL" = "L2" ] || [ "$LEVEL" = "L3" ]; then
    create_ide_links "$target"
    copy_cursor_extras "$target"
  fi

  if [ "$LEVEL" = "L3" ]; then
    setup_openspec "$target"
  fi

  TARGET="$target"
  retry_failed_global_installs "$target"
  ok "更新完成 (profile: $PROFILE, level: $LEVEL)"
  print_pending_summary
  [ "${INIT_HAS_INSTALL_FAIL:-0}" = 1 ] && exit 1
}

cmd_check() {
  local target has_issue=false
  target="$(cd "${1:-.}" 2>/dev/null && pwd || echo "${1:-.}")"

  echo ""
  info "═══ 安装状态检查: $target ═══"
  echo ""

  # .agents/
  if [ -d "$target/.agents" ]; then
    ok ".agents/ 存在"
    [ -d "$target/.agents/rules" ]  && ok "  rules/ 存在"  || { err "  rules/ 缺失";  has_issue=true; }
    [ -d "$target/.agents/skills" ] && ok "  skills/ 存在" || { err "  skills/ 缺失"; has_issue=true; }

    # 检查规则文件数量
    local rule_count; rule_count=$(find "$target/.agents/rules" -maxdepth 1 -name "*.md" -not -name "README.md" | wc -l | tr -d ' ')
    ok "  rules: $rule_count 个规范文件"

    local skill_count; skill_count=$(find "$target/.agents/skills" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')
    ok "  skills: $skill_count 个技能目录"

    # UI UX Pro Max 检查
    if [ -d "$target/.agents/skills/ui-ux-pro-max" ] && [ -f "$target/.agents/skills/ui-ux-pro-max/SKILL.md" ]; then
      ok "  UI UX Pro Max: 已安装"
    else
      info "  UI UX Pro Max: 未安装（可选，使用 --uipro 安装）"
    fi
  else
    err ".agents/ 不存在"; has_issue=true
  fi

  # IDE 链接
  for ide in "${IDE_DIRS[@]}"; do
    local d="$target/.$ide"
    if [ -d "$d" ]; then
      if [ -L "$d/rules" ] && [ -e "$d/rules" ]; then
        ok ".$ide/rules → $(readlink "$d/rules")"
      elif [ -d "$d/rules" ]; then
        ok ".$ide/rules (junction/目录)"
      else
        err ".$ide/rules 链接无效"; has_issue=true
      fi

      if [ -d "$d/skills" ]; then
        local skill_link_count; skill_link_count=$(find "$d/skills" -maxdepth 1 -mindepth 1 -type l | wc -l | tr -d ' ')
        ok ".$ide/skills ($skill_link_count 个链接)"
      else
        warn ".$ide/skills 不存在"
      fi
    else
      warn ".$ide/ 不存在"
    fi
  done

  # OpenSpec
  if [ -d "$target/openspec" ]; then
    ok "openspec/ 存在"
    if [ -f "$target/openspec/config.yaml" ] || [ -f "$target/openspec/config.yml" ]; then
      ok "  config.yaml 存在"
    else
      warn "  config.yaml 缺失"
    fi
    [ -d "$target/openspec/specs" ]   && ok "  specs/ 存在"   || warn "  specs/ 缺失"
    [ -d "$target/openspec/changes" ] && ok "  changes/ 存在" || warn "  changes/ 缺失"
  else
    info "openspec/ 不存在（L3 级别才需要）"
  fi

  echo ""
  check_tools
  echo ""
  $has_issue && err "存在问题，建议运行: install.sh init" || ok "全部检查通过"
}

cmd_uninstall() {
  local target
  target="$(cd "${1:-.}" && pwd)"
  warn "将移除 $target 下的规范库文件"
  echo "  包括: .agents/、IDE 链接、lint/format 配置、husky hooks、相关依赖"
  echo ""
  if [ -z "$FORCE" ]; then
    read -rp "确认？(y/N) " ans
    [[ "$ans" =~ ^[Yy]$ ]] || { info "已取消"; exit 0; }
  fi

  # IDE 链接
  for ide in "${IDE_DIRS[@]}"; do
    if [ -d "$target/.$ide/skills" ]; then
      find "$target/.$ide/skills" -maxdepth 1 -type l -delete 2>/dev/null || true
      rmdir "$target/.$ide/skills" 2>/dev/null || true
    fi
    rm -f "$target/.$ide/rules" 2>/dev/null || true
    rmdir "$target/.$ide" 2>/dev/null || true
  done

  # 核心目录（含 UI UX Pro Max）
  rm -rf "$target/.agents"

  # lint/format 配置（仅删除规范库部署的文件）
  local lint_files=(".prettierrc.json" ".prettierignore" ".stylelintrc.json" ".stylelintignore"
                    ".eslintrc.js" ".eslintrc.cjs" ".eslintignore"
                    ".lintstagedrc" "commitlint.config.js" ".editorconfig")
  for f in "${lint_files[@]}"; do
    [ -f "$target/$f" ] && rm -f "$target/$f" && info "  已删除 $f"
  done

  # husky hooks 和 .husky 目录
  if [ -d "$target/.husky" ]; then
    rm -rf "$target/.husky"
    info "  已删除 .husky/"
  fi

  # 移除 package.json 中的 prepare 脚本
  if [ -f "$target/package.json" ] && command -v node &>/dev/null; then
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('$target/package.json', 'utf8'));
      if (pkg.scripts && pkg.scripts.prepare && pkg.scripts.prepare.includes('husky')) {
        delete pkg.scripts.prepare;
        if (Object.keys(pkg.scripts).length === 0) delete pkg.scripts;
        fs.writeFileSync('$target/package.json', JSON.stringify(pkg, null, 2) + '\n');
      }
    " 2>/dev/null && info "  已移除 package.json 中的 husky prepare 脚本" || true
  fi

  # 卸载规范库安装的依赖
  if [ -f "$target/package.json" ]; then
    local pm=""
    if [ -f "$target/pnpm-lock.yaml" ]; then pm="pnpm"
    elif command -v pnpm &>/dev/null; then pm="pnpm"
    elif command -v npm &>/dev/null; then pm="npm"
    fi
    if [ -n "$pm" ]; then
      info "  使用 $pm 卸载 husky lint-staged @commitlint/cli @commitlint/config-conventional ..."
      (cd "$target" && $pm uninstall husky lint-staged @commitlint/cli @commitlint/config-conventional 2>/dev/null) || true
      info "  使用 $pm 卸载 eslint prettier stylelint 及相关插件 ..."
      (cd "$target" && $pm uninstall eslint prettier stylelint stylelint-config-standard stylelint-config-html stylelint-config-recommended-vue postcss-html 2>/dev/null) || true
    fi
  fi

  ok "卸载完成"
}

# ============================================================================
# 参数解析
# ============================================================================

usage() {
  cat <<EOF
${BOLD}ex-ai-spec ${NC} 规范库安装工具 v${VERSION}

${BOLD}用法:${NC} install.sh <命令> [目标目录] [选项]

${BOLD}命令:${NC}
  init [dir]        首次安装到目标项目（默认当前目录）
  update [dir]      更新通用规范，保留项目特有规则
  check [dir]       检查安装状态与链接有效性
  uninstall [dir]   卸载规范库

${BOLD}选项:${NC}
  --profile <name>  技术栈 (react|vue)                              默认 vue
  --level <L>       安装层级 (L1|L2|L3)                             默认 L3
  --ide <name>      指定 IDE (default|cursor|claude|opencode|trae|all)  默认 default(cursor+claude)
  --lint            安装 ESLint + Prettier + Stylelint（默认安装）
  --no-lint         跳过 lint/format 工具
  --husky           安装 Husky 提交校验（husky + lint-staged + commitlint）
  --no-husky        跳过提交校验（默认跳过）
  --uipro           安装 UI UX Pro Max 设计智能技能
  --no-uipro        跳过 UI UX Pro Max（非交互模式默认跳过）
  --repo <url>      自定义规范库地址
  --refresh-cache   清除本地缓存并重新克隆规范库
  -y, --force       跳过确认提示（用于非交互卸载）
  -h, --help        显示帮助

${BOLD}安装层级:${NC}
  L1  最小接入 — 只接入 .agents（规范 + 技能）
  L2  标准接入 — .agents + 工具适配层 + MCP 模板
  L3  完整接入 — 在 L2 基础上引入 OpenSpec 流程

${BOLD}示例:${NC}
  bash install.sh init                                    # 交互式安装（默认 vue + default IDE）
  bash install.sh init ~/projects/my-app                  # Vue 项目标准安装
  bash install.sh init . --profile react --level L3       # React + OpenSpec
  bash install.sh init . --ide all                        # 为所有 IDE 创建适配
  bash install.sh init . --uipro                          # 安装含 UI UX Pro Max
  bash install.sh init . --no-uipro                       # 跳过 UI UX Pro Max
  bash install.sh update                                  # 更新规范
  bash install.sh check                                   # 检查安装状态

${BOLD}远程安装:${NC}
  curl -sSL <raw-url>/install.sh | bash -s -- init . --profile vue --level L3
EOF
}

require_arg() {
  if [ -z "${2:-}" ] || [[ "${2:-}" == --* ]]; then
    err "选项 $1 需要一个参数值"
    echo "  示例: install.sh init --profile vue"
    exit 1
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    init|update|check|uninstall) COMMAND="$1" ;;
    --profile)    require_arg "$1" "${2:-}"; PROFILE="$2"; shift ;;
    --level)      require_arg "$1" "${2:-}"; LEVEL="$2"; shift ;;
    --ide)        require_arg "$1" "${2:-}"; IDE_FILTER="$2"; shift ;;
    --repo)       require_arg "$1" "${2:-}"; SPEC_REPO="$2"; shift ;;
    --lint)       INSTALL_LINT="yes" ;;
    --no-lint)    INSTALL_LINT="no" ;;
    --husky)      INSTALL_HUSKY="yes" ;;
    --no-husky)   INSTALL_HUSKY="no" ;;
    --uipro)      UIPRO="yes" ;;
    --no-uipro)   UIPRO="no" ;;
    --refresh-cache) REFRESH_CACHE="true" ;;
    -y|--force)   FORCE="true" ;;
    -h|--help)    usage; exit 0 ;;
    *)
      [ -n "$COMMAND" ] && TARGET="$1" || { usage; exit 1; }
      ;;
  esac
  shift
done

[ -n "$COMMAND" ] || { usage; exit 1; }

# 验证 Profile
if [[ ! " ${AVAILABLE_PROFILES[*]} " =~ " $PROFILE " ]]; then
  err "无效的 Profile: $PROFILE （可选: ${AVAILABLE_PROFILES[*]}）"
  exit 1
fi

case "$COMMAND" in
  init)      cmd_init "${TARGET:-.}" ;;
  update)    cmd_update "${TARGET:-.}" ;;
  check)     cmd_check "${TARGET:-.}" ;;
  uninstall) cmd_uninstall "${TARGET:-.}" ;;
esac
