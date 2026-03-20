#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# br-ai-spec 规范库安装脚本 (Bash)
# 适用于 macOS / Linux / Git Bash / WSL
# ============================================================================

VERSION="1.0.0"
SPEC_REPO="${BR_AI_SPEC_REPO:-https://github.com/your-org/br-ai-spec.git}"
CACHE_DIR="${BR_AI_SPEC_CACHE:-$HOME/.br-ai-spec}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

IDE_DIRS=(claude cursor opencode trae)
PROJECT_SPECIFIC_RULES=("01-项目概述.md" "03-项目结构.md")
IDE_FILTER="all"
SKIP_OPENSPEC=false
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

  if [ -d "$script_dir/.agents/rules" ] && [ -d "$script_dir/.agents/skills" ]; then
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

# ---- 复制 .agents/ ----
copy_agents() {
  local target="$1" agents_dst="$1/.agents"
  mkdir -p "$agents_dst/rules" "$agents_dst/skills"

  # skills: 全量同步
  info "同步 skills ..."
  if [ -d "$agents_dst/skills" ]; then
    rm -rf "$agents_dst/skills"
  fi
  cp -R "$SOURCE_DIR/.agents/skills" "$agents_dst/skills"

  # rules: 逐文件复制，保护项目特有规则
  info "同步 rules ..."
  for file in "$SOURCE_DIR/.agents/rules/"*; do
    [ -f "$file" ] || continue
    local name
    name="$(basename "$file")"

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

  ok ".agents/ 同步完成"
}

# ---- 创建 IDE 链接 ----
create_ide_links() {
  local target="$1"

  for ide in "${IDE_DIRS[@]}"; do
    if [ "$IDE_FILTER" != "all" ] && [ "$IDE_FILTER" != "$ide" ]; then
      continue
    fi

    local ide_dir="$target/.$ide"
    mkdir -p "$ide_dir"
    make_link "../.agents/rules" "$ide_dir/rules"
    make_link "../.agents/skills" "$ide_dir/skills"
    ok ".$ide/ 链接就绪"
  done
}

# ---- 复制 Cursor 额外文件 ----
copy_cursor_extras() {
  local target="$1"
  [ "$IDE_FILTER" != "all" ] && [ "$IDE_FILTER" != "cursor" ] && return 0

  local cursor_dst="$target/.cursor"
  mkdir -p "$cursor_dst"

  if [ -d "$SOURCE_DIR/.cursor/commands" ]; then
    mkdir -p "$cursor_dst/commands"
    cp "$SOURCE_DIR/.cursor/commands/"*.md "$cursor_dst/commands/" 2>/dev/null || true
    ok ".cursor/commands/ 已同步"
  fi

  if [ -f "$SOURCE_DIR/.cursor/mcp.json" ] && [ ! -f "$cursor_dst/mcp.json" ]; then
    cp "$SOURCE_DIR/.cursor/mcp.json" "$cursor_dst/mcp.json"
    warn ".cursor/mcp.json 已生成 → 请替换 project-id 与 access-token"
  fi
}

# ---- 检查工具 ----
check_tools() {
  info "工具环境："
  command -v git  >/dev/null 2>&1 && ok "  git $(git --version | awk '{print $3}')" || err "  git 未安装"
  command -v node >/dev/null 2>&1 && ok "  node $(node --version)"               || warn "  node 未安装（OpenSpec 需要）"
  command -v npx  >/dev/null 2>&1 && ok "  npx 可用"                               || warn "  npx 不可用"
  if command -v npx >/dev/null 2>&1; then
    npx openspec --version >/dev/null 2>&1 && ok "  openspec 已安装" || warn "  openspec 未安装（可选，仅 Cursor SDD 流程需要）"
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
  info "后续步骤："
  echo -e "  1. 编辑 ${BOLD}.agents/rules/01-项目概述.md${NC}  填写项目定位和技术栈"
  echo -e "  2. 编辑 ${BOLD}.agents/rules/03-项目结构.md${NC}  填写项目目录结构"
  echo -e "  3. 修改 ${BOLD}.cursor/mcp.json${NC}            替换 project-id 与 token"
  echo -e "  4. 在 AI IDE 中输入 \"初始化项目规范\" 让 AI 自动生成 01/03"
  echo ""
}

# ============================================================================
# 子命令
# ============================================================================

cmd_init() {
  local target
  target="$(cd "${1:-.}" 2>/dev/null && pwd || { mkdir -p "${1:-.}"; cd "${1:-.}" && pwd; })"
  info "初始化项目: $target"
  detect_source
  copy_agents "$target"
  create_ide_links "$target"
  copy_cursor_extras "$target"
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
  create_ide_links "$target"
  copy_cursor_extras "$target"
  ok "更新完成"
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
  else
    err ".agents/ 不存在"; has_issue=true
  fi

  # IDE 链接
  for ide in "${IDE_DIRS[@]}"; do
    local d="$target/.$ide"
    if [ -d "$d" ]; then
      for sub in rules skills; do
        if [ -L "$d/$sub" ] && [ -e "$d/$sub" ]; then
          ok ".$ide/$sub → $(readlink "$d/$sub")"
        elif [ -d "$d/$sub" ]; then
          ok ".$ide/$sub (junction/目录)"
        else
          err ".$ide/$sub 链接无效"; has_issue=true
        fi
      done
    else
      warn ".$ide/ 不存在"
    fi
  done

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
    rm -f "$target/.$ide/rules" "$target/.$ide/skills" 2>/dev/null || true
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
  --ide <name>      指定 IDE (cursor|claude|opencode|trae|all)  默认 all
  --repo <url>      自定义规范库地址
  --skip-openspec   不安装 openspec 相关文件
  -h, --help        显示帮助

${BOLD}示例:${NC}
  bash install.sh init                        # 安装到当前目录
  bash install.sh init ~/projects/my-app      # 安装到指定项目
  bash install.sh update --ide cursor         # 仅更新 Cursor 配置
  bash install.sh check                       # 检查安装状态

${BOLD}远程安装:${NC}
  curl -sSL <raw-url>/install.sh | bash -s -- init .
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    init|update|check|uninstall) COMMAND="$1" ;;
    --ide)            IDE_FILTER="${2:-all}"; shift ;;
    --repo)           SPEC_REPO="${2:-$SPEC_REPO}"; shift ;;
    --skip-openspec)  SKIP_OPENSPEC=true ;;
    -h|--help)        usage; exit 0 ;;
    *)
      [ -n "$COMMAND" ] && TARGET="$1" || { usage; exit 1; }
      ;;
  esac
  shift
done

[ -n "$COMMAND" ] || { usage; exit 1; }

case "$COMMAND" in
  init)      cmd_init "${TARGET:-.}" ;;
  update)    cmd_update "${TARGET:-.}" ;;
  check)     cmd_check "${TARGET:-.}" ;;
  uninstall) cmd_uninstall "${TARGET:-.}" ;;
esac
