#!/usr/bin/env python3
# 一键构建：从 dev/（带完整注释）读取源文件，去注释生成 prod/（压缩版）
# 用法：
#   python3 _build_split.py            # 直接执行：用 dev/ 生成 prod/
#   python3 _build_split.py --dry-run  # 仅打印将执行的动作，不实际写文件
#   python3 _build_split.py --watch    # 监听模式：dev/ 文件变化时自动重建 prod/（按 Ctrl+C 退出）
#   python3 _build_split.py --init     # 监听模式 + 首次运行就构建一次
import os
import re
import sys
import shutil
import io
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC_FILES = ['index.html', 'get_cus_pro.html', 'pinyin_match.js', 'pinyin_sync.js']
DEV_DIR = os.path.join(ROOT, 'dev')
PROD_DIR = os.path.join(ROOT, 'prod')
SCRIPT_NAME = os.path.basename(__file__)

DRY_RUN = '--dry-run' in sys.argv
WATCH = '--watch' in sys.argv or '-w' in sys.argv
INIT = '--init' in sys.argv


def strip_js_comments(src):
    """
    去除 JS 注释（// 单行 + /* */ 多行），保留字符串和正则字面量里的内容。
    用一个 4 状态的状态机：NORMAL / STRING_SQ / STRING_DQ / TEMPLATE / LINE_COMMENT / BLOCK_COMMENT / REGEX
    """
    out = []
    i = 0
    n = len(src)
    state = 'NORMAL'
    # 关键修复：保留必要的换行，让行号不至于塌缩
    last_was_nl = True  # 起始视为上一字符是换行，避免吃掉行首注释后把两行粘一起
    while i < n:
        c = src[i]
        c2 = src[i + 1] if i + 1 < n else ''
        if state == 'NORMAL':
            if c == '/' and c2 == '/':
                state = 'LINE_COMMENT'
                i += 2
                continue
            if c == '/' and c2 == '*':
                state = 'BLOCK_COMMENT'
                i += 2
                continue
            if c == '/':
                # 判断是正则字面量还是除法：回看前一个非空白字符
                prev_char = ''
                for j in range(len(out) - 1, -1, -1):
                    if out[j] not in ' \t\n\r':
                        prev_char = out[j]
                        break
                # 这些字符之后的 / 视为正则起始：( , = [ ! & | ? : ; { } + - * % < > ~ ^ 或行首
                if prev_char == '' or prev_char in '(,=![&|?:;{}+-*%<>~^':
                    out.append(c)
                    state = 'REGEX'
                    i += 1
                    continue
                # 否则当除法，落回普通字符处理
            if c == "'":
                state = 'STRING_SQ'
                out.append(c); i += 1; continue
            if c == '"':
                state = 'STRING_DQ'
                out.append(c); i += 1; continue
            if c == '`':
                state = 'TEMPLATE'
                out.append(c); i += 1; continue
            if c == '\n':
                last_was_nl = True
            else:
                last_was_nl = False
            out.append(c); i += 1; continue
        if state == 'LINE_COMMENT':
            if c == '\n':
                # 保留换行，状态回到 NORMAL
                out.append(c)
                state = 'NORMAL'
                last_was_nl = True
            i += 1; continue
        if state == 'BLOCK_COMMENT':
            if c == '*' and c2 == '/':
                state = 'NORMAL'
                i += 2
                # 把块注释替换为一个空格（防止 `/*x*/foo` 变成 `foo`）
                if i < n and src[i] not in ' \t\n\r;,)}]':
                    out.append(' ')
                continue
            if c == '\n':
                out.append('\n')  # 保留块注释中的换行，避免破坏代码结构
            i += 1; continue
        if state == 'REGEX':
            out.append(c)
            if c == '\\' and c2:
                out.append(c2); i += 2; continue
            if c == '[':
                state = 'REGEX_CLASS'
            elif c == '/' or c == '\n':
                state = 'NORMAL'
            i += 1; continue
        if state == 'REGEX_CLASS':
            out.append(c)
            if c == '\\' and c2:
                out.append(c2); i += 2; continue
            if c == ']' or c == '\n':
                state = 'REGEX'
            i += 1; continue
        if state == 'STRING_SQ':
            out.append(c)
            if c == '\\' and c2:
                out.append(c2); i += 2; continue
            if c == "'":
                state = 'NORMAL'
            i += 1; continue
        if state == 'STRING_DQ':
            out.append(c)
            if c == '\\' and c2:
                out.append(c2); i += 2; continue
            if c == '"':
                state = 'NORMAL'
            i += 1; continue
        if state == 'TEMPLATE':
            out.append(c)
            if c == '\\' and c2:
                out.append(c2); i += 2; continue
            if c == '`':
                state = 'NORMAL'
            elif c == '$' and c2 == '{':
                out.append(c2); i += 2
                state = 'NORMAL'  # 简化：进入 ${} 后交给后续解析
                continue
            i += 1; continue
    return ''.join(out)


def strip_html_comments(src):
    """去除 HTML 注释 <!-- ... -->，保留字符串字面量里的 <!-- 文本 -->
    极简实现：只处理最常见的 HTML 注释场景（不在 script/style 标签内、不在引号内）。
    对本项目足够（HTML 注释只用于标注开发备注，无内嵌 JS 字符串的 <!-- 引用）。
    """
    out = []
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        c3 = src[i:i + 4]
        if c3 == '<!--':
            # 查找结束 -->
            j = src.find('-->', i + 4)
            if j == -1:
                # 没找到结束，整个剩余当作注释
                break
            # 保留换行
            for k in range(i + 4, j):
                if src[k] == '\n':
                    out.append('\n')
            i = j + 3
            continue
        out.append(c)
        i += 1
    return ''.join(out)


def strip_blank_lines(src):
    """去除空行（仅含空白字符的行）"""
    lines = src.split('\n')
    out = []
    prev_blank = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if prev_blank:
                continue
            prev_blank = True
            out.append('')
        else:
            prev_blank = False
            out.append(line.rstrip())
    return '\n'.join(out)


def process_js(content):
    """处理 .js 文件：去注释 + 去连续空行 + 末尾单换行"""
    out = strip_js_comments(content)
    out = strip_blank_lines(out)
    if not out.endswith('\n'):
        out += '\n'
    return out


def process_html(content):
    """处理 .html 文件：
    1) 用 <script>...</script> 切出 JS 段，对每段做去注释
    2) HTML 注释去除
    3) 保留 <style>、CSS 内容原样不动
    """
    # 先去除 HTML 注释
    content = strip_html_comments(content)
    # 切 script 段
    pattern = re.compile(r'(<script[^>]*>)(.*?)(</script>)', re.DOTALL | re.IGNORECASE)
    def repl(m):
        open_tag, body, close_tag = m.group(1), m.group(2), m.group(3)
        stripped = strip_js_comments(body)
        stripped = strip_blank_lines(stripped)
        return open_tag + '\n' + stripped + '\n' + close_tag
    content = pattern.sub(repl, content)
    # 全局收尾：去连续空行
    content = strip_blank_lines(content)
    if not content.endswith('\n'):
        content += '\n'
    return content


def _build_once(reason='EXECUTE'):
    """执行一次完整构建。reason 标注触发原因（EXECUTE / WATCH / INIT）。"""
    if WATCH:
        print('\n[' + time.strftime('%H:%M:%S') + '] 检测到源文件变化 → 开始重建 (' + reason + ')')
    else:
        print('========================================')
        print(' 一键构建脚本')
        print(' 源目录: %s (dev/)' % DEV_DIR)
        print(' 发布版: %s' % PROD_DIR)
        print(' 模式: %s' % ('DRY-RUN' if DRY_RUN else 'EXECUTE'))
        print('========================================')

    for fname in SRC_FILES:
        # 源文件位于 dev/ 目录
        src_path = os.path.join(DEV_DIR, fname)
        if not os.path.isfile(src_path):
            print('[SKIP] 源文件不存在: dev/%s' % fname)
            continue
        with open(src_path, 'r', encoding='utf-8') as f:
            src_content = f.read()
        # prod/：去注释
        if fname.endswith('.js'):
            prod_content = process_js(src_content)
        elif fname.endswith('.html'):
            prod_content = process_html(src_content)
        else:
            prod_content = src_content  # 兜底
        prod_path = os.path.join(PROD_DIR, fname)

        src_size = len(src_content.encode('utf-8'))
        prod_size = len(prod_content.encode('utf-8'))
        ratio = (1 - prod_size / src_size) * 100 if src_size else 0
        if WATCH:
            print('  [%s] %d → %d bytes  (-%.1f%%)' % (fname, src_size, prod_size, ratio))
        else:
            print('\n[%s] %s' % (fname, 'DRY' if DRY_RUN else 'OK'))
            print('  源大小:    %8d bytes' % src_size)
            print('  发布版:    %8d bytes  (压缩 %.1f%%)' % (prod_size, ratio))

        if DRY_RUN:
            continue
        # 写 prod 目录（去注释版）
        with open(prod_path, 'w', encoding='utf-8') as f:
            f.write(prod_content)

    if DRY_RUN:
        print('\n(DRY-RUN) 仅打印，未实际写文件')
    elif WATCH:
        print('  ✓ 已更新 prod/')
    else:
        print('\n========================================')
        print(' 完成')
        print('  源目录:     %s  (带完整注释)' % DEV_DIR)
        print('  发布版目录: %s  (去除注释)' % PROD_DIR)
        print('========================================')


def _snapshot_mtimes():
    """记录源文件（dev/）+ prod/ 输出 + 本脚本自身的 mtime。返回 dict{path: mtime}。"""
    snap = {}
    # 源文件（位于 dev/）
    for fname in SRC_FILES:
        p = os.path.join(DEV_DIR, fname)
        if os.path.isfile(p):
            snap[p] = os.path.getmtime(p)
    # 输出文件（prod/ 的变化也算变化，但通常跟着源走）
    for out_dir in (PROD_DIR,):
        if not os.path.isdir(out_dir):
            continue
        for fname in SRC_FILES:
            p = os.path.join(out_dir, fname)
            if os.path.isfile(p):
                snap[p] = os.path.getmtime(p)
    return snap


def _watch_loop():
    """监听模式：每秒检查 mtime，源文件变化时自动重建。"""
    print('========================================')
    print(' 监听模式已启动')
    print('  监控文件 (dev/):')
    for f in SRC_FILES:
        print('    - dev/%s' % f)
    print('  触发: dev/ 任一源文件 mtime 变化 → 重建 prod/')
    print('  防抖: 200ms（编辑器多次保存只构建一次）')
    print('  退出: Ctrl+C')
    print('========================================')

    if INIT:
        print('[INIT] 首次构建...')
        _build_once('INIT')
    last_snap = _snapshot_mtimes()
    pending = None  # 待触发的 debounce 计时
    DEBOUNCE = 0.2
    POLL = 1.0
    try:
        while True:
            time.sleep(POLL)
            cur_snap = _snapshot_mtimes()
            changed = []
            for path, mt in cur_snap.items():
                if path not in last_snap or last_snap[path] != mt:
                    # 跳过本脚本自身（避免改 _build_split.py 触发）
                    if path.endswith(SCRIPT_NAME):
                        continue
                    # 跳过 prod/ 输出（它变是因为我们刚写的）；dev/ 是源，变化必须响应
                    rel = os.path.relpath(path, ROOT)
                    if rel.startswith('prod' + os.sep):
                        continue
                    changed.append(rel)
            if not changed:
                continue
            # 防抖：200ms 内合并多次保存
            if pending is None:
                pending = time.time() + DEBOUNCE
                continue
            if time.time() < pending:
                continue
            pending = None
            print('\n变化: %s' % ', '.join(changed))
            _build_once('WATCH')
            last_snap = _snapshot_mtimes()
    except KeyboardInterrupt:
        print('\n\n已退出监听模式。')


def main():
    if WATCH:
        _watch_loop()
        return
    _build_once('EXECUTE')


if __name__ == '__main__':
    main()
