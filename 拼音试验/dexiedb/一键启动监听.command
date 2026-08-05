#!/bin/bash
# 一键启动"监听模式" — Finder 双击即可
# 启动后：长驻监听，dexiedb/ 源文件变化时自动重建 dev/ + prod/
# 退出：Ctrl+C 或直接关闭窗口

# 切到脚本所在目录（双击时 Finder 给的 $0 是绝对路径）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || { echo "[错误] 无法进入 $SCRIPT_DIR"; read -r _; exit 1; }

clear
cat <<'BANNER'
════════════════════════════════════════════
 一键价格·监听模式
 启动中...
════════════════════════════════════════════
 监控:  dexiedb/ 下的 4 个源文件
 触发:  mtime 变化（保存即生效，1 秒内）
 输出:  dev/  (带注释) + prod/ (去注释压缩)
 退出:  Ctrl+C  或 直接关闭此窗口
════════════════════════════════════════════
BANNER
echo ""

# exec 让 python 替代 bash 进程，Ctrl+C 能正确传到 python
exec python3 -u _build_split.py --watch --init

# 兜底：如果 exec 失败，提示用户
echo ""
echo "[监听进程已退出] 按回车关闭窗口..."
read -r _
