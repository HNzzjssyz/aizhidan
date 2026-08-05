# 制单JSON格式规范 v1.1

> 最后更新：2026-05-13
> 状态：暂定，后期可调整

---

## 完整结构

```json
{
  "doc_type": "销售订单",
  "customer_name": "深圳华创科技有限公司",
  "customer_pinyin": "shen_zhen_hua_chuang_ke_ji_you_xian_gong_si",
  "payment_term": "月结30天",
  "remark": "本周五前发货",
  "products": [
    {
      "name": "A3打印纸",
      "pinyin": "A3_da_yin_zhi",
      "spec": "70g 500张/包",
      "spec_pinyin": "70g_500zhang_bao",
      "qty": 100,
      "unit": "箱",
      "price": 280
    }
  ]
}
```

---

## 字段说明

### 主单据字段

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|:------|:----:|:----:|:-----|:-----|
| `doc_type` | string | ✅ | 单据类型 | `销售订单`、`报价单`、`出库单` |
| `customer_name` | string | ✅ | 客户全称 | `深圳华创科技有限公司` |
| `customer_pinyin` | string | ✅ | 客户拼音 | `shen_zhen_hua_chuang_ke_ji_you_xian_gong_si` |
| `payment_term` | string | ❌ | 付款方式 | `月结30天`、`款到发货`、`预付` |
| `remark` | string | ❌ | 备注信息 | `急单，请优先处理` |
| `products` | array | ✅ | 产品明细（≥1条） | 见下方 |

### 产品明细字段

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|:------|:----:|:----:|:-----|:-----|
| `name` | string | ✅ | 产品名称 | `A3打印纸`、`无线鼠标` |
| `pinyin` | string | ✅ | 产品拼音 | `A3_da_yin_zhi` |
| `spec` | string | ❌ | 规格型号 | `70g 500张/包`、`2.4G 静音` |
| `spec_pinyin` | string | ❌ | 规格拼音 | `70g_500zhang_bao` |
| `qty` | number | ✅ | 数量 | `100`、`50` |
| `unit` | string | ❌ | 单位 | `箱`、`个`、`套`、`本` |
| `price` | number | ❌ | 单价（元） | `280`、`35` |

---

## 拼音格式规范

### 转换规则

1. **全小写**：所有字母转为小写
2. **下划线分隔**：词语之间用下划线 `_` 分隔
3. **数字保留**：保留数字原样（如 `A3`、`70g`）
4. **空格处理**：中文之间的空格转为下划线连接
5. **特殊字符**：去除标点符号

### 示例

| 中文 | 拼音 |
|:-----|:-----|
| 深圳华创科技有限公司 | `shen_zhen_hua_chuang_ke_ji_you_xian_gong_si` |
| A3打印纸 | `A3_da_yin_zhi` |
| 70g 500张/包 | `70g_500zhang_bao` |
| 2.4G 静音 | `2.4g_jing_yin` |
| 惠普墨盒 | `hui_pu_mo_he` |

---

## 提取规则

### 支持的JSON格式

系统通过正则表达式提取JSON，支持以下格式：

1. **Markdown代码块**
   ````json
   ```json
   { "doc_type": "销售订单", ... }
   ```
   ````

2. **普通代码块**
   ```
   ```
   { "doc_type": "销售订单", ... }
   ```
   ```

3. **裸JSON**
   ```json
   { "doc_type": "销售订单", "customer_name": "...", "products": [...] }
   ```

### 验证条件

JSON必须包含以下字段之一才被视为有效：
- ✅ `doc_type`
- ✅ `customer_name`
- ✅ `products`

---

## 扩展字段（预留）

以下字段暂未实现，可根据后期需求添加：

```json
{
  "tax_included": true,        // 是否含税
  "delivery_date": "2026-05-20",  // 交货日期
  "tax_rate": 0.13,           // 税率
  "discount": 0.85,           // 整单折扣
  "shipping_address": "深圳市南山区...",  // 收货地址
  "contact_person": "陈经理",  // 联系人
  "contact_phone": "13800138000"  // 联系电话
}
```

### 产品明细扩展字段

```json
{
  "discount": 0.9,            // 单品折扣
  "note": "急单",             // 行备注
  "warehouse": "A仓",         // 仓库
  "batch_no": "B20260501"     // 批号
}
```

---

## 版本历史

| 版本 | 日期 | 变更说明 |
|:----:|:----:|:--------|
| v1.0 | 2026-05-13 | 初版定义，暂定结构 |
| v1.1 | 2026-05-13 | 新增拼音字段（customer_pinyin、pinyin、spec_pinyin）用于后台数据库查询 |

---

## 关联文件

- `剪贴板制单原型-阶段一_二.html` - 解析端实现
- `Coze智能体配置指南.md` - 智能体Prompt配置
