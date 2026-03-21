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
  info "初始化项目: $target"

  # 交互式引导（无 --profile/--level 参数时）
  if [ -t 0 ] && [ "$PROFILE" = "vue" ] && [ "$LEVEL" = "L2" ]; then
    local need_interactive=true
    # 检查是否通过命令行指定了参数
    for arg in "$@"; do
      case "$arg" in --profile*|--level*) need_interactive=false; break ;; esac
    done
    if $need_interactive; then
      select_profile
      select_level
    fi
  fi

  detect_source

  # L1: 只安装 .agents
  copy_agents "$target"

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
    [ -f "$target/openspec/config.yaml" ] || [ -f "$target/openspec/config.yml" ] && ok "  config.yaml 存在" || warn "  config.yaml 缺失"
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
  warn "将移除 $target 下的规范库文件（.agents/ 及 IDE 链接）"
  read -rp "确认？(y/N) " ans
  [[ "$ans" =~ ^[Yy]$ ]] || { info "已取消"; exit 0; }

  for ide in "${IDE_DIRS[@]}"; do
    # 移除 skills 目录中的链接
    if [ -d "$target/.$ide/skills" ]; then
      find "$target/.$ide/skills" -maxdepth 1 -type l -delete 2>/dev/null || true
      rmdir "$target/.$ide/skills" 2>/dev/null || true
    fi
    rm -f "$target/.$ide/rules" 2>/dev/null || true
    rmdir "$target/.$ide" 2>/dev/null || true
  done
  rm -rf "$target/.agents"
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

while [ $# -gt 0 ]; do
  case "$1" in
    init|update|check|uninstall) COMMAND="$1" ;;
    --profile)    PROFILE="${2:-react}"; shift ;;
    --level)      LEVEL="${2:-L2}"; shift ;;
    --ide)        IDE_FILTER="${2:-all}"; shift ;;
    --repo)       SPEC_REPO="${2:-$SPEC_REPO}"; shift ;;
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
