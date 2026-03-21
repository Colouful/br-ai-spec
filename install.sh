#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# br-ai-spec 规范库安装脚本 (Bash)
# 适用于 macOS / Linux / Git Bash / WSL
# ============================================================================

VERSION="2.0.0"
SPEC_REPO="${BR_AI_SPEC_REPO:-http://git.100credit.cn/zhenwei.li/br-ai-standards.git}"
CACHE_DIR="${BR_AI_SPEC_CACHE:-$HOME/.br-ai-spec}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

IDE_DIRS=(claude cursor opencode trae)
PROJECT_SPECIFIC_RULES=("01-项目概述.md" "03-项目结构.md")
AVAILABLE_PROFILES=("react" "vue")

NODE_MIN_VERSION=18
PKG_MANAGER=""

IDE_FILTER="default"
PROFILE="vue"
LEVEL="L2"
COMMAND=""
TARGET=""

# ---- 输出 ----
info()  { echo -e "${BLUE}ℹ${NC} $*"; }
ok()    { echo -e "${GREEN}✔${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
err()   { echo -e "${RED}✖${NC} $*"; }

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
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  if [ -d "$script_dir/.agents/rules/common" ] && [ -d "$script_dir/.agents/skills/common" ]; then
    SOURCE_DIR="$script_dir"
    info "使用本地规范库: $SOURCE_DIR"
  else
    if [ -d "$CACHE_DIR/.git" ]; then
      info "更新规范库缓存..."
      git -C "$CACHE_DIR" pull --quiet 2>/dev/null || warn "缓存更新失败，使用现有版本"
    else
      info "克隆规范库到 $CACHE_DIR ..."
      git clone --quiet "$SPEC_REPO" "$CACHE_DIR" || { err "克隆失败，请检查: $SPEC_REPO"; exit 1; }
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
  echo "  L1) 最小接入 — 只安装 .agents（规范 + 技能）"
  echo "  L2) 标准接入 — .agents + IDE 适配层 + MCP 模板"
  echo "  L3) 完整接入 — 全量安装含 OpenSpec 流程"
  echo ""
  read -rp "请选择 (L1/L2/L3) [默认 L2]: " choice
  case "$choice" in
    L1|l1|1) LEVEL="L1" ;;
    L3|l3|3) LEVEL="L3" ;;
    *)       LEVEL="L2" ;;
  esac
  ok "已选择层级: $LEVEL"
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
      warn "跳过项目特有规则: $name（已存在）"
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
_copy_config_dir() {
  local src="$1" target="$2"
  [ -d "$src" ] || return 1
  local copied=false

  # 复制点开头的文件（.prettierrc.json, .lintstagedrc 等）
  for f in "$src"/.*; do
    local name; name="$(basename "$f")"
    [[ "$name" == "." || "$name" == ".." ]] && continue
    if [ -f "$f" ]; then
      cp "$f" "$target/$name"
      copied=true
    elif [ -d "$f" ]; then
      # 复制点开头的目录（如 .husky/）
      mkdir -p "$target/$name"
      cp -R "$f"/* "$target/$name/" 2>/dev/null || true
      copied=true
    fi
  done

  # 复制非点开头的文件（commitlint.config.js 等）
  for f in "$src"/*; do
    [ -f "$f" ] || continue
    local name; name="$(basename "$f")"
    cp "$f" "$target/$name"
    copied=true
  done

  $copied
}

copy_configs() {
  local target="$1"
  local src_common="$SOURCE_DIR/configs/common"
  local src_profile="$SOURCE_DIR/configs/profiles/$PROFILE"
  local copied=false

  if [ -d "$src_common" ]; then
    info "同步 lint/format 配置 (common) ..."
    _copy_config_dir "$src_common" "$target" && copied=true
  fi

  if [ -d "$src_profile" ]; then
    info "同步 lint/format 配置 (profiles/$PROFILE) ..."
    _copy_config_dir "$src_profile" "$target" && copied=true
  fi

  $copied && ok "lint/format 配置部署完成" || info "未找到 lint/format 配置模板，跳过"
}

# ---- 安装提交校验依赖（husky + lint-staged + commitlint） ----
install_commit_hooks() {
  local target="$1"
  [ -f "$target/package.json" ] || { warn "未找到 package.json，跳过提交校验依赖安装"; return 0; }
  [ -n "$PKG_MANAGER" ] || { warn "无可用的包管理器，跳过提交校验依赖安装"; return 0; }

  info "正在使用 $PKG_MANAGER 安装提交校验依赖，请稍候 ..."
  info "  husky@8 + lint-staged + @commitlint/cli + @commitlint/config-conventional"
  if ! (cd "$target" && $PKG_MANAGER install -D husky@8 lint-staged @commitlint/cli @commitlint/config-conventional); then
    warn "$PKG_MANAGER install 失败，请手动执行:"
    echo "  cd $target && $PKG_MANAGER install -D husky@8 lint-staged @commitlint/cli @commitlint/config-conventional"
    return 0
  fi

  info "初始化 husky ..."
  if ! (cd "$target" && npx husky install); then
    warn "husky install 失败，请手动执行: cd $target && npx husky install"
    return 0
  fi

  ok "提交校验工具链安装完成 (husky@8 + lint-staged + commitlint)"
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
    warn ".cursor/mcp.json 已生成 → 请替换 project-id 与 access-token"
  fi
}

# ---- 安装 OpenSpec（L3） ----
setup_openspec() {
  local target="$1"

  info "配置 OpenSpec ..."

  # 检测 openspec CLI
  if command -v npx >/dev/null 2>&1 && npx openspec --version >/dev/null 2>&1; then
    ok "openspec CLI 可用"

    # 运行 openspec init（如果 openspec/ 目录已存在则跳过 init）
    if [ ! -f "$target/openspec/config.yaml" ] && [ ! -f "$target/openspec/config.yml" ]; then
      info "运行 openspec init ..."
      local tools_arg="cursor"
      case "$IDE_FILTER" in
        all)     tools_arg="cursor,claude,opencode,trae" ;;
        default) tools_arg="cursor,claude" ;;
        *)       tools_arg="$IDE_FILTER" ;;
      esac
      (cd "$target" && npx openspec init --tools "$tools_arg" --force --no-interactive 2>/dev/null) || warn "openspec init 执行失败，请手动运行"
    else
      info "openspec/ 已存在，运行 openspec update ..."
      (cd "$target" && npx openspec update --force 2>/dev/null) || warn "openspec update 执行失败"
    fi
  else
    warn "openspec CLI 未安装，请手动安装: npm install -g @fission-ai/openspec@latest"
    # 创建基础骨架
    mkdir -p "$target/openspec/specs" "$target/openspec/changes/archive"
  fi

  # 合并增强版 config.yaml 模板
  local template="$SOURCE_DIR/openspec/config.yaml.template"
  local config_file="$target/openspec/config.yaml"
  if [ -f "$template" ]; then
    if [ -f "$config_file" ]; then
      # config.yaml 已存在：只在没有 context 字段时追加
      if ! grep -q "^context:" "$config_file" 2>/dev/null; then
        info "合并 br-ai-spec context/rules 到 config.yaml ..."
        # 追加 context 和 rules（跳过第一行 schema:）
        tail -n +2 "$template" >> "$config_file"
        ok "config.yaml 已增强"
      else
        info "config.yaml 已包含 context 字段，跳过合并"
      fi
    else
      # 直接复制模板
      cp "$template" "$config_file"
      ok "openspec/config.yaml 已创建"
    fi
  fi

  ok "OpenSpec 配置完成"
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
}

# ---- 安装报告 ----
print_report() {
  local target="$1"
  echo ""
  echo -e "${BOLD}════════════════════════════════════════${NC}"
  ok "安装完成！"
  echo -e "${BOLD}════════════════════════════════════════${NC}"
  echo ""
  info "安装配置："
  echo -e "  Profile:  ${BOLD}$PROFILE${NC}"
  echo -e "  Level:    ${BOLD}$LEVEL${NC}"
  echo -e "  IDE:      ${BOLD}$IDE_FILTER${NC}"
  echo ""
  info "已部署内容："
  echo -e "  ${GREEN}✔${NC} .agents/rules + skills (profile: $PROFILE)"
  echo -e "  ${GREEN}✔${NC} lint/format 配置 (.prettierrc, .eslintrc, .stylelintrc)"
  echo -e "  ${GREEN}✔${NC} 提交校验 (.husky, .lintstagedrc, commitlint.config.js)"
  if [ "$LEVEL" != "L1" ]; then
    echo -e "  ${GREEN}✔${NC} IDE 适配 (.cursor, .claude)"
  fi
  echo ""
  info "后续步骤："
  echo -e "  1. 编辑 ${BOLD}.agents/rules/01-项目概述.md${NC}  填写项目定位和技术栈"
  echo -e "  2. 编辑 ${BOLD}.agents/rules/03-项目结构.md${NC}  填写项目目录结构"
  if [ "$LEVEL" != "L1" ]; then
    echo -e "  3. 修改 ${BOLD}.cursor/mcp.json${NC}            替换 project-id 与 token"
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

  echo ""
  info "br-ai-spec v${VERSION} | $(uname -s) $(uname -m) | Node $(node --version 2>/dev/null || echo 'N/A')"
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
  if [ -t 0 ] && [ "$PROFILE" = "vue" ] && [ "$LEVEL" = "L2" ]; then
    select_profile
    select_level
  fi

  detect_source

  # L1: 只安装 .agents
  copy_agents "$target"
  copy_configs "$target"
  install_commit_hooks "$target"

  # L2: + IDE 适配层 + MCP
  if [ "$LEVEL" = "L2" ] || [ "$LEVEL" = "L3" ]; then
    create_ide_links "$target"
    copy_cursor_extras "$target"
  fi

  # L3: + OpenSpec
  if [ "$LEVEL" = "L3" ]; then
    setup_openspec "$target"
  fi

  check_tools
  print_report "$target"
}

cmd_update() {
  local target
  target="$(cd "${1:-.}" && pwd)"
  [ -d "$target/.agents" ] || { err "$target 未找到 .agents/，请先运行 init"; exit 1; }
  info "更新规范: $target"
  detect_source
  copy_agents "$target"
  copy_configs "$target"

  if [ "$LEVEL" = "L2" ] || [ "$LEVEL" = "L3" ]; then
    create_ide_links "$target"
    copy_cursor_extras "$target"
  fi

  if [ "$LEVEL" = "L3" ]; then
    setup_openspec "$target"
  fi

  ok "更新完成 (profile: $PROFILE, level: $LEVEL)"
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
  echo "  包括: .agents/、IDE 链接、lint/format 配置、husky hooks"
  echo ""
  read -rp "确认？(y/N) " ans
  [[ "$ans" =~ ^[Yy]$ ]] || { info "已取消"; exit 0; }

  # IDE 链接
  for ide in "${IDE_DIRS[@]}"; do
    if [ -d "$target/.$ide/skills" ]; then
      find "$target/.$ide/skills" -maxdepth 1 -type l -delete 2>/dev/null || true
      rmdir "$target/.$ide/skills" 2>/dev/null || true
    fi
    rm -f "$target/.$ide/rules" 2>/dev/null || true
    rmdir "$target/.$ide" 2>/dev/null || true
  done

  # 核心目录
  rm -rf "$target/.agents"

  # lint/format 配置（仅删除规范库部署的文件）
  local lint_files=(".prettierrc.json" ".prettierignore" ".stylelintrc.json" ".stylelintignore"
                    ".eslintrc.js" ".eslintrc.cjs" ".eslintignore"
                    ".lintstagedrc" "commitlint.config.js")
  for f in "${lint_files[@]}"; do
    [ -f "$target/$f" ] && rm -f "$target/$f" && info "  已删除 $f"
  done

  # husky hooks（保留 .husky/_/ 内部目录，只删除 hook 脚本）
  for hook in pre-commit commit-msg; do
    [ -f "$target/.husky/$hook" ] && rm -f "$target/.husky/$hook" && info "  已删除 .husky/$hook"
  done

  ok "卸载完成"
}

# ============================================================================
# 参数解析
# ============================================================================

usage() {
  cat <<EOF
${BOLD}br-ai-spec${NC} 规范库安装工具 v${VERSION}

${BOLD}用法:${NC} install.sh <命令> [目标目录] [选项]

${BOLD}命令:${NC}
  init [dir]        首次安装到目标项目（默认当前目录）
  update [dir]      更新通用规范，保留项目特有规则
  check [dir]       检查安装状态与链接有效性
  uninstall [dir]   卸载规范库

${BOLD}选项:${NC}
  --profile <name>  技术栈 (react|vue)                              默认 vue
  --level <L>       安装层级 (L1|L2|L3)                             默认 L2
  --ide <name>      指定 IDE (default|cursor|claude|opencode|trae|all)  默认 default(cursor+claude)
  --repo <url>      自定义规范库地址
  -h, --help        显示帮助

${BOLD}安装层级:${NC}
  L1  最小接入 — 只安装 .agents（规范 + 技能）
  L2  标准接入 — .agents + IDE 适配层 + MCP 模板
  L3  完整接入 — 全量安装含 OpenSpec 流程

${BOLD}示例:${NC}
  bash install.sh init                                    # 交互式安装（默认 vue + default IDE）
  bash install.sh init ~/projects/my-app                  # Vue 项目标准安装
  bash install.sh init . --profile react --level L3       # React + OpenSpec
  bash install.sh init . --ide all                        # 为所有 IDE 创建适配
  bash install.sh update                                  # 更新规范
  bash install.sh check                                   # 检查安装状态

${BOLD}远程安装:${NC}
  curl -sSL <raw-url>/install.sh | bash -s -- init . --profile vue --level L2
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
