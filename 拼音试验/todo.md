# AI智能制单 — 开发TODO

## 1. 张总加订单的产品识别
- 甲方通常习惯和实际产品名称的差异处理
- 需要增强模糊匹配的容错能力，覆盖甲方口语化/简称与标准产品名的映射
- 产品图片问题：
  - 产品图片在绿色下显示
  - 重新匹配的选择产品界面显示产品图片



## 2. 增量的开发
- 增量获取数据的完整实现与测试
- 远端增量更新方案落地（含删除同步）

## 3. 写单据
- 订单
- 报价单
- 采购单

---

## ✅ 2026-06-10 升级记录

### 3.1 产品同步增加 price 字段（v1.4）
- [x] `pinyin_sync.js` 增量同步字段加 `price`：`id,pro_name,model,spec,price,modstm`
- [x] `pinyin_sync.js` 全量同步字段加 `price`：`id,pro_name,model,spec,price`
- [x] 增量/全量组装时显式带 `price: item.price || ''`
- [x] 拼音生成跳过判断增加 `existing.price === (p.price || '')`，价格变化会触发重生成
- [x] 拼音缓存 `pp[key]` 写回时带 `price: p.price || ''`
- [x] `pinyin_match.js` 三个匹配命中构造（specMatch / cp / mp）都带 `price`
- [x] `pinyin_match.js` results 数组增加 `matchedPrice` 字段
- [x] `index.html` `selectProductForEdit` / `fillProductStandardData` 透传 `matchedPrice`
- [x] `index.html` 三个 `fuzzyMatch*` 函数（pinyin/keyword/mixed）从 productMap 取 price
- [x] `index.html` "选择产品"弹窗候选列表加"参考价：¥xx.xx"渲染行
- [x] `_build_split.py` 同步 dev/ + prod/

### 3.2 修复 DatabaseClosedError
- [x] `pinyin_match.js` `initDB()` 增加 `db.isOpen()` 检测 + 警告日志
- [x] 13 个 db 访问点（读 / 写 / 事务）入口前显式 `if (!db.isOpen()) await db.open()` 自动重连
- 触发场景：Safari tab 长时间挂起后 IDB 被自动关闭
- 报错原文：`产品匹配异常：DatabaseClosedError Database has been closed`

### 3.3 文档同步
- [x] `智能增量同步方案-自动判断切换全量.md` 升 v1.4
- [x] `读取产品的价格.md` 增加"前端使用：选择产品弹窗的价格显示"章节
- [x] `todo.md` 增加本次升级记录
- [x] `测试todo.md` 增加 price 字段同步 / IDB 重连测试项
