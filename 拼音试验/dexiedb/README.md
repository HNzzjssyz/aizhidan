# dexiedb 目录说明

## 目录结构

```
dexiedb/
├── dev/                  # 开发版（带完整注释）
│   ├── index.html
│   ├── get_cus_pro.html
│   ├── pinyin_match.js
│   └── pinyin_sync.js
├── prod/                 # 生产版（去注释压缩）
│   ├── index.html
│   ├── get_cus_pro.html
│   ├── pinyin_match.js
│   └── pinyin_sync.js
├── _build_split.py       # 构建脚本：dev → prod
└── README.md             # 本文件
```

## 核心规则

1. **dev/ 和 prod/ 是两个有效目录，代码逻辑必须一致**
   - `dev/`：保留完整注释，用于阅读和开发
   - `prod/`：去除注释和多余空行，用于部署
2. **根目录 `dexiedb/` 下的同名文件是历史遗留，不再维护**
3. **修改代码时，dev/ 和 prod/ 必须同步修改**

## 构建脚本

`_build_split.py` 可自动从 dev/ 生成 prod/（去注释压缩）：

```bash
cd dexiedb/

# 直接构建：用 dev/ 覆盖 prod/
python3 _build_split.py

# 仅预览，不实际写文件
python3 _build_split.py --dry-run

# 监听模式：dev/ 文件变化时自动重建 prod/
python3 _build_split.py --watch

# 监听模式 + 首次构建
python3 _build_split.py --init
```

## 验证 dev/ 与 prod/ 一致性

```bash
# 代码逻辑对比（忽略注释和空行差异）
for f in index.html get_cus_pro.html pinyin_match.js pinyin_sync.js; do
  echo "=== $f ==="
  diff <(sed 's/[[:space:]]*$//' dev/$f) <(sed 's/[[:space:]]*$//' prod/$f) | head -20
done
```

> 正常情况下，diff 输出应仅包含注释行（`//`、`/* */`、`<!-- -->`）和空行差异，**不应有逻辑代码差异**。

## 各文件职责

| 文件 | 职责 |
|------|------|
| `index.html` | 主界面：智能制单全流程（客户识别、产品匹配、一键价格、订单/报价单生成） |
| `get_cus_pro.html` | 独立工具页：客户/产品数据获取与同步 |
| `pinyin_match.js` | 拼音匹配引擎 + Dexie（IndexedDB）数据库管理 |
| `pinyin_sync.js` | 数据同步模块（增量/全量同步、跨标签页通知） |
