# dflag 的全局条件说明

## 概述

在多表复合查询系统中，`dflag` 是一个重要的状态标志字段，用于标记记录的状态。系统默认会为所有查询添加 `dflag != 1` 的全局条件，确保只查询有效记录，排除已删除或已禁用的记录。

## dflag 字段的含义

`dflag` 字段通常用于实现**软删除**功能，具体含义如下：

- **dflag = 0**：记录正常，未被删除
- **dflag = 1**：记录已被删除或已禁用

这种设计允许系统保留已删除记录的数据，同时在查询时自动排除这些记录，实现了数据的逻辑删除而非物理删除。

## 全局条件设置

系统在以下两个文件中设置了 `dflag` 的全局查询条件：

### 1. multi-table-query.js

```javascript
// 统一的查询条件配置
// 所有查询接口调用时会自动追加这些条件
const GLOBAL_WHERE_CONDITIONS_MULTI = [
  { field: 'dflag', operator: '!=', value: 1 }
];
```

### 2. api-client.js

```javascript
// 统一的查询条件配置
// 所有查询接口调用时会自动追加这些条件
const GLOBAL_WHERE_CONDITIONS = [
  { field: 'dflag', operator: '!=', value: 1 }
];
```

## 实现方式

系统通过以下方式实现 `dflag` 全局条件的应用：

### 1. 单表查询

在 `api-client.js` 中，通过 `appendGlobalWhereConditions` 函数将全局条件追加到用户定义的查询条件中：

```javascript
function appendGlobalWhereConditions(existingWhere) {
  let globalConditions = GLOBAL_WHERE_CONDITIONS.map(cond => 
    `${cond.field} ${cond.operator} ${cond.value}`
  ).join(' AND ');
  
  if (!existingWhere || existingWhere.trim() === '') {
    return globalConditions;
  }
  
  return `${existingWhere} AND ${globalConditions}`;
}
```

### 2. 多表查询

在 `multi-table-query.js` 中，通过 `appendGlobalWhereConditionsMulti` 函数实现类似的功能：

```javascript
function appendGlobalWhereConditionsMulti(existingWhere) {
  let globalConditions = GLOBAL_WHERE_CONDITIONS_MULTI.map(cond => 
    `${cond.field} ${cond.operator} ${cond.value}`
  ).join(' AND ');
  
  if (!existingWhere || existingWhere.trim() === '') {
    return globalConditions;
  }
  
  return `${existingWhere} AND ${globalConditions}`;
}
```

## 影响范围

`dflag` 字段存在于多个表中，包括但不限于：

- customer（客户）
- product（产品）
- contract（合同）
- goods（商品）
- libout（出库单）
- libitem（库存项目）
- sendgoods（发货单）
- gathering_note（收款单）
- action（行动）
- deli_note（交付单）
- contact（联系人）
- purchase（采购单）
- puritem（采购项目）
- libin（入库单）
- libreturn（库存退货）
- purreturn（采购退货）
- gathering（回款）
- pay_bill（付款单）
- pay_note（付款凭证）
- bill（账单/发票）
- libpack（库存包装）

## 技术原理

1. **软删除机制**：通过设置 `dflag=1` 标记记录为已删除，而不是物理删除记录，保留了数据的完整性和可追溯性。

2. **自动条件追加**：系统在执行所有查询时，自动追加 `dflag != 1` 条件，确保只返回有效记录。

3. **统一管理**：全局条件集中配置，便于统一管理和维护。

## 最佳实践

1. **数据管理**：当需要删除记录时，应设置 `dflag=1` 而不是物理删除记录。

2. **查询优化**：在数据库层面，可以为 `dflag` 字段创建索引，提高查询性能。

3. **数据清理**：定期对 `dflag=1` 的记录进行归档或清理，避免数据量过大影响系统性能。

4. **权限控制**：对于需要查看已删除记录的特殊场景，应提供专门的权限控制和查询接口。

## 总结

`dflag` 的全局条件设置是系统实现软删除功能的核心机制，它确保了查询结果只包含有效记录，同时保留了已删除记录的数据。这种设计既保证了数据的安全性和完整性，又提供了灵活的数据管理能力。