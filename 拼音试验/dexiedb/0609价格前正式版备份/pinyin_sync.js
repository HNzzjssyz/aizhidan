/**
 * pinyin_sync.js — 拼音库同步共享模块（v1.2 + 自动同步）
 *
 * 封装：
 * 1. 智能增量同步（首次全量 / 后续差异检测 + 增量 / 异常降级）
 * 2. 跨标签页 BroadcastChannel 通知
 * 3. UI 解耦（通过 hooks 参数）
 *
 * 依赖：全局 PinyinMatch（来自 pinyin_match.js）、全局 fetch
 * 用法：
 *   <script src="pinyin_sync.js"></script>
 *   await PinyinSync.autoSyncIfNeeded({ thresholdHours: 1 });
 *   PinyinSync.onSyncComplete(function(info) { /* 刷新缓存 *\/ });
 */
(function (global) {
  'use strict';

  // ===== 常量（方案 v1.2）=====
  var DIFF_RATE_THRESHOLD = 0.2;       // 差异率 > 20% 切全量
  var ID_FETCH_PAGE_SIZE = 5000;       // 远端 ID 拉取分页
  var MIN_IDS_FOR_DIFF_CHECK = 1000;   // 远端过小强制全量
  var BROADCAST_CHANNEL_NAME = 'pinyin_sync_channel';

  // ===== 状态 =====
  var _syncing = false;
  var _listeners = [];   // onSyncComplete 注册的回调
  var _channel = null;
  var _channelSupported = false;

  // ===== 工具：BroadcastChannel 初始化 =====
  function initChannel() {
    if (_channel !== null) return;
    if (typeof BroadcastChannel === 'undefined') {
      _channel = false; // 不支持
      _channelSupported = false;
      return;
    }
    try {
      _channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      _channelSupported = true;
      _channel.onmessage = function (e) {
        if (!e || !e.data || !e.data.type) return;
        if (e.data.type === 'sync_complete' || e.data.type === 'sync_started' ||
            e.data.type === 'sync_error' || e.data.type === 'sync_finished') {
          _listeners.forEach(function (l) {
            try { l(e.data); } catch (err) { console.error('onSyncComplete listener error:', err); }
          });
        }
      };
    } catch (e) {
      _channel = false;
      _channelSupported = false;
      console.warn('BroadcastChannel init failed:', e);
    }
  }

  /**
   * 本地触发同步事件（用于同标签自身调用时也能回调注册者）
   * BroadcastChannel.onmessage 不会在发送方触发，所以同标签必须显式调用本方法
   */
  function emitLocal(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'sync_complete' || msg.type === 'sync_started' || msg.type === 'sync_error' || msg.type === 'sync_finished') {
      _listeners.forEach(function (l) {
        try { l(msg); } catch (err) { console.error('onSyncComplete listener error:', err); }
      });
    }
  }

  function broadcast(msg) {
    if (_channel && _channelSupported) {
      try { _channel.postMessage(msg); } catch (e) { /* 静默 */ }
    }
  }

  function onSyncComplete(listener) {
    if (typeof listener === 'function') {
      _listeners.push(listener);
    }
  }

  // ===== 工具：默认 hooks =====
  function defaultHooks(overrides) {
    var h = overrides || {};
    return {
      onLog: h.onLog || function (msg, type) {
        if (type === 'err') console.error(msg);
        else console.log(msg);
      },
      onProgress: h.onProgress || function () {},
      onShowCancel: h.onShowCancel || function () {},
      onToast: h.onToast || function (msg, type) {
        // 默认用浏览器 console；调用方可覆盖
        if (type === 'err' || type === 'error') console.warn('[PinyinSync]', msg);
      }
    };
  }

  // ===== 工具：HTTP 请求（与现有 sendLoadData 行为一致）=====
  function sendLoadData(params) {
    return fetch('/system/api.xt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function parseLoadDataResponse(data) {
    if (data && data.ok === 1 && data.data) return data.data;
    if (Array.isArray(data)) return data;
    if (data && data.data && Array.isArray(data.data)) return data.data;
    return [];
  }

  // ===== 核心：拉取远端 ID =====
  async function fetchServerIds(dtname, whereClause) {
    var allIds = [];
    var page = 1;
    while (true) {
      var params = {
        cmd: 'load_data', dtname: dtname, field: 'id', flag: 1,
        page: page, pageSize: ID_FETCH_PAGE_SIZE
      };
      if (whereClause) params.where = whereClause;
      var data = await sendLoadData(params);
      var list = parseLoadDataResponse(data);
      if (!list || list.length === 0) break;
      list.forEach(function (item) { allIds.push(parseInt(item.id, 10)); });
      if (list.length < ID_FETCH_PAGE_SIZE) break;
      page++;
    }
    allIds.sort(function (a, b) { return a - b; });
    return allIds;
  }

  // ===== 核心：二分法定位缺失 ID =====
  function findMissingIds(serverIds, localIds, lo, hi) {
    if (lo === undefined) lo = 0;
    if (hi === undefined) hi = serverIds.length - 1;
    var missing = [];

    if (lo > hi || hi - lo < 10) {
      for (var i = lo; i <= hi; i++) {
        var id = serverIds[i];
        if (id !== undefined && !localIds.has(String(id))) {
          missing.push(id);
        }
      }
      return missing;
    }

    var mid = Math.floor((lo + hi) / 2);
    var midId = serverIds[mid];
    var midExists = localIds.has(String(midId));

    if (midExists) {
      missing = missing.concat(findMissingIds(serverIds, localIds, mid + 1, hi));
      if (lo < mid) {
        missing = missing.concat(findMissingIds(serverIds, localIds, lo, mid - 1));
      }
    } else {
      missing.push(midId);
      missing = missing.concat(findMissingIds(serverIds, localIds, lo, mid - 1));
      missing = missing.concat(findMissingIds(serverIds, localIds, mid + 1, hi));
    }
    return missing;
  }

  // ===== 核心：差异检测 =====
  async function detectSyncStrategy(hooks) {
    hooks = hooks || defaultHooks();
    hooks.onLog('开始差异检测：拉取远端 ID 列表...', 'info');
    var customerServerIds = await fetchServerIds('customer', 'dflag=0');
    var productServerIds = await fetchServerIds('product', 'dflag=0 AND status=0');

    if (customerServerIds.length < MIN_IDS_FOR_DIFF_CHECK &&
        productServerIds.length < MIN_IDS_FOR_DIFF_CHECK) {
      hooks.onLog('远端数据量过小，强制全量', 'info');
      return {
        strategy: 'full', diffRate: 1,
        customerServerIds: customerServerIds, productServerIds: productServerIds,
        missingOnLocal: [], extraOnLocal: [], extraOnLocalProducts: []
      };
    }

    var localCustomers = await PinyinMatch.getCustomersAsync();
    var localProducts = await PinyinMatch.getProductsAsync();
    var customerLocalIds = new Set();
    localCustomers.forEach(function (c) { customerLocalIds.add(String(c.id)); });
    var productLocalIds = new Set();
    localProducts.forEach(function (p) { productLocalIds.add(String(p.id)); });

    var customerServerCount = customerServerIds.length;
    var productServerCount = productServerIds.length;
    var useCustomer = customerServerCount >= productServerCount;
    var serverIds = useCustomer ? customerServerIds : productServerIds;
    var localIds = useCustomer ? customerLocalIds : productLocalIds;

    var serverIdSet = new Set(serverIds.map(function (id) { return String(id); }));
    var missingOnLocal = serverIds.filter(function (id) { return !localIds.has(String(id)); });
    var extraOnLocal = Array.from(localIds).filter(function (id) { return !serverIdSet.has(id); });

    var customerServerIdSet = new Set(customerServerIds.map(function (id) { return String(id); }));
    var productServerIdSet = new Set(productServerIds.map(function (id) { return String(id); }));
    var missingOnLocalCustomers = customerServerIds.filter(function (id) {
      return !customerLocalIds.has(String(id));
    });
    var extraOnLocalCustomers = Array.from(customerLocalIds).filter(function (id) {
      return !customerServerIdSet.has(id);
    });
    var missingOnLocalProducts = productServerIds.filter(function (id) {
      return !productLocalIds.has(String(id));
    });
    var extraOnLocalProducts = Array.from(productLocalIds).filter(function (id) {
      return !productServerIdSet.has(id);
    });

    var diffTotal = missingOnLocal.length + extraOnLocal.length;
    var diffRate = serverIds.length > 0 ? diffTotal / serverIds.length : 0;

    hooks.onLog('差异检测完成：远端 ' + serverIds.length + ' 条，差异 ' + diffTotal +
                ' 条，差异率 ' + (diffRate * 100).toFixed(2) + '%', 'info');
    hooks.onLog('客户：远端 ' + customerServerCount + ' / 本地 ' + customerLocalIds.size +
                '；产品：远端 ' + productServerCount + ' / 本地 ' + productLocalIds.size, 'info');

    if (diffRate > DIFF_RATE_THRESHOLD) {
      return { strategy: 'full', diffRate: diffRate,
               customerServerIds: customerServerIds, productServerIds: productServerIds,
               missingOnLocal: missingOnLocalCustomers, extraOnLocal: extraOnLocalCustomers,
               extraOnLocalProducts: extraOnLocalProducts };
    }
    return { strategy: 'incremental', diffRate: diffRate,
             customerServerIds: customerServerIds, productServerIds: productServerIds,
             missingOnLocal: missingOnLocalCustomers, extraOnLocal: extraOnLocalCustomers,
             extraOnLocalProducts: extraOnLocalProducts };
  }

  // ===== 核心：拉取时间戳范围内的修改/新增数据 =====
  async function fetchModifiedByTime(dtname, field, where) {
    var data = await sendLoadData({
      cmd: 'load_data', dtname: dtname, field: field, where: where, flag: 1
    });
    return parseLoadDataResponse(data);
  }

  // ===== 核心：全量分片拉取 =====
  async function fetchFullPaged(dtname, field, batchSize, hooks) {
    var total = await getTotalCount(dtname);
    var fetchTotal = Math.min(total, batchSize * 10); // 上限保护
    var list = [];
    for (var start = 0; start < fetchTotal; start += batchSize) {
      var params = {
        cmd: 'load_data', dtname: dtname, field: field, flag: 1,
        limit: batchSize, start: start
      };
      var data = await sendLoadData(params);
      var chunk = parseLoadDataResponse(data);
      list = list.concat(chunk);
      hooks.onProgress('读取' + (dtname === 'customer' ? '客户' : '产品') + '数据...',
                       start + chunk.length, fetchTotal,
                       '第 ' + (Math.floor(start / batchSize) + 1) + ' 批');
      if (chunk.length < batchSize) break;
    }
    return list;
  }

  async function getTotalCount(dtname) {
    var data = await sendLoadData({ cmd: 'load_data', dtname: dtname, field: 'count(1) cnt', flag: 1 });
    if (data.ok === 1 && data.data && data.data[0]) {
      return parseInt(data.data[0].cnt, 10);
    }
    return 0;
  }

  // ===== 核心：客户合并（物理删除）=====
  async function mergeCustomers(existingCustomers, modifiedList, deletedIds, hooks) {
    var customerMap = {};
    existingCustomers.forEach(function (c) { customerMap[String(c.id)] = c; });
    modifiedList.forEach(function (c) { customerMap[String(c.id)] = c; });
    var deletedCount = 0;
    if (deletedIds && deletedIds.length > 0) {
      deletedIds.forEach(function (id) {
        var key = String(id);
        if (customerMap[key] !== undefined) { delete customerMap[key]; deletedCount++; }
      });
      hooks.onLog('客户删除清理：' + deletedCount + ' 条（远端物理删除）', 'info');
    }
    return { merged: Object.values(customerMap), deletedCount: deletedCount };
  }

  // ===== 核心：产品合并（软删除）=====
  async function mergeProducts(existingProducts, modifiedList, deletedIds, hooks) {
    var productMap = {};
    existingProducts.forEach(function (p) { productMap[String(p.id)] = p; });
    modifiedList.forEach(function (p) { productMap[String(p.id)] = p; });
    var deletedCount = 0;
    if (deletedIds && deletedIds.length > 0) {
      deletedIds.forEach(function (id) {
        var key = String(id);
        if (productMap[key] !== undefined) { delete productMap[key]; deletedCount++; }
      });
      hooks.onLog('产品删除清理：' + deletedCount + ' 条（远端 dflag=1）', 'info');
    }
    return { merged: Object.values(productMap), deletedCount: deletedCount };
  }

  // ===== 核心：默认拼音生成（调用方未提供 hooks.generatePinyin 时使用）=====
  /**
   * 增量生成拼音（内置实现）：
   * - 对 modified 中的每条客户/产品生成拼音
   * - 删除 deleted 列表中的拼音
   * - 跳过 name/model/spec 未变化的项（减少 pinyin-pro 调用）
   * - 完成后写回 PinyinMatch
   */
  async function defaultGeneratePinyin(info) {
    var cp = await PinyinMatch.getCustomerPinyinAsync();
    var pp = await PinyinMatch.getProductPinyinAsync();
    var newCount = 0, updateCount = 0, skippedCount = 0;
    var deletedCCount = 0, deletedPCount = 0;

    // 清理已删除的拼音
    (info.deletedCustomerIds || []).forEach(function (id) {
      var key = String(id);
      if (cp[key] !== undefined) { delete cp[key]; deletedCCount++; }
    });
    (info.deletedProductIds || []).forEach(function (id) {
      var key = String(id);
      if (pp[key] !== undefined) { delete pp[key]; deletedPCount++; }
    });
    if (deletedCCount > 0 || deletedPCount > 0) {
      console.log('[PinyinSync] 拼音清理：客户 ' + deletedCCount + ' 条，产品 ' + deletedPCount + ' 条');
    }

    // 客户拼音
    (info.customerModified || []).forEach(function (c) {
      if (!c || c.id === undefined) return;
      var key = String(c.id);
      var existing = cp[key];
      // 跳过 name 未变
      if (existing && existing.name === (c.name || '')) { skippedCount++; return; }
      var py = PinyinMatch.generatePinyinForText(c.name || '');
      if (!existing) newCount++; else updateCount++;
      cp[key] = { id: c.id, name: c.name || '', pinyin: py.full, pinyin_abbr: py.abbr };
    });

    // 产品拼音（name + model + spec 拼接）
    (info.productModified || []).forEach(function (p) {
      if (!p || p.id === undefined) return;
      var key = String(p.id);
      var existing = pp[key];
      if (existing && existing.name === (p.name || '') &&
          existing.model === (p.model || '') && existing.spec === (p.spec || '')) {
        skippedCount++; return;
      }
      var parts = [];
      if (p.name) parts.push(p.name);
      if (p.model && !PinyinMatch.isPlaceholder(p.model)) parts.push(p.model);
      if (p.spec && !PinyinMatch.isPlaceholder(p.spec)) parts.push(p.spec);
      var combined = parts.join(' ');
      var py = PinyinMatch.generatePinyinForText(combined);
      if (!existing) newCount++; else updateCount++;
      pp[key] = {
        id: p.id, name: p.name || '', model: p.model || '', spec: p.spec || '',
        pinyin: py.full, pinyin_abbr: py.abbr
      };
    });

    // 写回（只有变化时才写）
    if (newCount + updateCount + deletedCCount + deletedPCount > 0) {
      await PinyinMatch.setCustomerPinyinAsync(cp);
      await PinyinMatch.setProductPinyinAsync(pp);
    }

    var totalChanged = (info.customerModified || []).length + (info.productModified || []).length;
    if (totalChanged > 0) {
      console.log('[PinyinSync] 拼音生成：新增 ' + newCount + ' 条，更新 ' + updateCount +
                  ' 条，跳过 ' + skippedCount + ' 条（未变）');
    } else if (deletedCCount + deletedPCount > 0) {
      console.log('[PinyinSync] 拼音生成：清理 ' + (deletedCCount + deletedPCount) + ' 条');
    }
  }

  // ===== 核心：增量同步主流程 =====
  async function incrementalSync(decision, hooks) {
    hooks = hooks || defaultHooks();
    var lastTime = await PinyinMatch.getSyncStatusAsync('incremental_time');

    var customerModified = [];
    var productModified = [];

    if (lastTime) {
      hooks.onLog('增量同步：拉取客户变化数据...', 'info');
      var cList = await fetchModifiedByTime('customer', 'id,cu_name,amstamp',
        "amstamp > '" + lastTime + "' AND dflag=0");
      cList.forEach(function (item) {
        customerModified.push({
          id: item.id, name: item.cu_name || item.name || '', amstamp: item.amstamp
        });
      });
      hooks.onLog('客户按时间戳拉取：' + customerModified.length + ' 条', 'info');

      hooks.onLog('增量同步：拉取产品变化数据...', 'info');
      var pList = await fetchModifiedByTime('product', 'id,pro_name,model,spec,modstm',
        "modstm > '" + lastTime + "' AND dflag=0 AND status=0");
      pList.forEach(function (item) {
        productModified.push({
          id: item.id, name: item.pro_name || item.name || '',
          model: item.model || '', spec: item.spec || '', modstm: item.modstm
        });
      });
      hooks.onLog('产品按时间戳拉取：' + productModified.length + ' 条（dflag 全局条件已过滤）', 'info');
    }

    hooks.onProgress('增量同步中...', 1, 3, '客户合并...');
    var existingCustomers = await PinyinMatch.getCustomersAsync();
    var customerResult = await mergeCustomers(existingCustomers, customerModified,
                                               decision.extraOnLocal, hooks);
    if (customerResult.merged.length > 50000) {
      customerResult.merged = customerResult.merged.slice(0, 50000);
    }
    await PinyinMatch.setCustomersAsync(customerResult.merged);
    hooks.onLog('客户合并：新增/更新 ' + customerModified.length + ' 条，删除 ' +
                customerResult.deletedCount + ' 条，合计 ' + customerResult.merged.length + ' 条', 'ok');

    hooks.onProgress('增量同步中...', 2, 3, '产品合并...');
    var existingProducts = await PinyinMatch.getProductsAsync();
    var productResult = await mergeProducts(existingProducts, productModified,
                                            decision.extraOnLocalProducts, hooks);
    if (productResult.merged.length > 50000) {
      productResult.merged = productResult.merged.slice(0, 50000);
    }
    await PinyinMatch.setProductsAsync(productResult.merged);
    hooks.onLog('产品合并：新增/更新 ' + productModified.length + ' 条，删除 ' +
                productResult.deletedCount + ' 条，合计 ' + productResult.merged.length + ' 条', 'ok');

    hooks.onProgress('增量同步中...', 3, 3, '拼音生成...');
    // 拼音生成（仅对变化项）— 优先用调用方提供的，否则用默认实现
    var generatePinyin = typeof hooks.generatePinyin === 'function'
      ? hooks.generatePinyin
      : defaultGeneratePinyin;
    await generatePinyin({
      customerModified: customerModified,
      productModified: productModified,
      deletedCustomerIds: (decision.extraOnLocal || []).map(String),
      deletedProductIds: (decision.extraOnLocalProducts || []).map(String)
    });

    var now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    await PinyinMatch.setSyncStatusAsync('sync_time', now);
    await PinyinMatch.setSyncStatusAsync('incremental_time', now);

    return {
      strategy: 'incremental',
      customers: customerResult.merged.length,
      products: productResult.merged.length,
      customerDeleted: customerResult.deletedCount,
      productDeleted: productResult.deletedCount
    };
  }

  // ===== 核心：全量同步主流程（封装 fetchFullData 行为）=====
  async function fetchFullData(hooks) {
    hooks = hooks || defaultHooks();
    var CUSTOMER_BATCH_SIZE = 10000;
    var PRODUCT_BATCH_SIZE = 20000;
    var PINYIN_BATCH_SIZE = 200;

    hooks.onLog('全量获取开始...', 'info');
    var customerTotal = await getTotalCount('customer', 'dflag=0');
    var productTotal = await getTotalCount('product', 'dflag=0 AND status=0');
    hooks.onLog('记录统计：客户 ' + customerTotal + ' 条，产品 ' + productTotal + ' 条', 'info');

    // 客户
    var allCustomers = [];
    for (var ci = 0; ci * CUSTOMER_BATCH_SIZE < customerTotal; ci++) {
      var startC = ci * CUSTOMER_BATCH_SIZE;
      var params = {
        cmd: 'load_data', dtname: 'customer',
        field: 'id,cu_name,amstamp', flag: 1,
        where: 'dflag=0',
        limit: CUSTOMER_BATCH_SIZE, start: startC
      };
      var data = await sendLoadData(params);
      var list = parseLoadDataResponse(data);
      list.forEach(function (item) {
        allCustomers.push({ id: item.id, name: item.cu_name || item.name || '' });
      });
      hooks.onProgress('读取客户数据...', allCustomers.length, Math.min(customerTotal, 50000),
                       '第 ' + (ci + 1) + ' 批');
      if (list.length < CUSTOMER_BATCH_SIZE) break;
    }
    if (allCustomers.length > 50000) allCustomers = allCustomers.slice(0, 50000);
    await PinyinMatch.setCustomersAsync(allCustomers);
    hooks.onLog('客户全量获取成功：' + allCustomers.length + ' 条', 'ok');

    // 产品
    var allProducts = [];
    for (var pi = 0; pi * PRODUCT_BATCH_SIZE < productTotal; pi++) {
      var startP = pi * PRODUCT_BATCH_SIZE;
      var params2 = {
        cmd: 'load_data', dtname: 'product',
        field: 'id,pro_name,model,spec,modstm', flag: 1,
        where: 'dflag=0 AND status=0',
        limit: PRODUCT_BATCH_SIZE, start: startP
      };
      var data2 = await sendLoadData(params2);
      var list2 = parseLoadDataResponse(data2);
      list2.forEach(function (item) {
        allProducts.push({
          id: item.id, name: item.pro_name || item.name || '',
          model: item.model || '', spec: item.spec || ''
        });
      });
      hooks.onProgress('读取产品数据...', allProducts.length, Math.min(productTotal, 50000),
                       '第 ' + (pi + 1) + ' 批');
      if (list2.length < PRODUCT_BATCH_SIZE) break;
    }
    if (allProducts.length > 50000) allProducts = allProducts.slice(0, 50000);
    await PinyinMatch.setProductsAsync(allProducts);
    hooks.onLog('产品全量获取成功：' + allProducts.length + ' 条', 'ok');

    // 拼音生成（合并客户+产品单次调用，优先用调用方实现，否则用默认）
    var fullGeneratePinyin = typeof hooks.generatePinyin === 'function'
      ? hooks.generatePinyin
      : defaultGeneratePinyin;
    await fullGeneratePinyin({
      customerModified: allCustomers,
      productModified: allProducts,
      deletedCustomerIds: [],
      deletedProductIds: []
    });

    var now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    await PinyinMatch.setSyncStatusAsync('sync_time', now);
    await PinyinMatch.setSyncStatusAsync('incremental_time', now);

    return {
      strategy: 'full',
      customers: allCustomers.length,
      products: allProducts.length
    };
  }

  // ===== 主入口：智能同步 =====
  /**
   * @param {Object} options
   * @param {boolean} [options.silent=false] 静默模式（不显示进度覆盖层）
   * @param {Object} [options.hooks] UI 回调
   * @returns {Promise<{ok:boolean, strategy?:string, ...}>}
   */
  async function syncData(options) {
    options = options || {};
    var hooks = defaultHooks(options.hooks);
    var silent = !!options.silent;

    if (_syncing) {
      hooks.onLog('同步进行中，跳过本次', 'info');
      return { ok: false, reason: 'already_syncing' };
    }
    _syncing = true;
    emitLocal({ type: 'sync_started' });
    broadcast({ type: 'sync_started' });

    try {
      await PinyinMatch.init();
      var lastTime = await PinyinMatch.getSyncStatusAsync('incremental_time');
      if (!lastTime) {
        hooks.onLog('首次同步：执行全量获取', 'info');
        if (!silent) hooks.onShowCancel(true);
        var fullResult = await fetchFullData(hooks);
        if (!silent) hooks.onShowCancel(false);
        var doneMsg = { type: 'sync_complete', strategy: 'full', customers: fullResult.customers, products: fullResult.products };
        emitLocal(doneMsg);
        broadcast(doneMsg);
        return { ok: true, strategy: 'full', customers: fullResult.customers, products: fullResult.products };
      }

      hooks.onLog('智能增量同步中...', 'info');
      if (!silent) hooks.onShowCancel(true);
      var decision;
      try {
        decision = await detectSyncStrategy(hooks);
      } catch (e) {
        hooks.onLog('差异检测失败，降级为全量：' + e.message, 'err');
        var fb = await fetchFullData(hooks);
        if (!silent) hooks.onShowCancel(false);
        var fbMsg = { type: 'sync_complete', strategy: 'full_fallback', reason: 'detect_failed' };
        emitLocal(fbMsg);
        broadcast(fbMsg);
        return { ok: true, strategy: 'full', reason: 'detect_failed', customers: fb.customers, products: fb.products };
      }

      if (decision.strategy === 'full') {
        hooks.onLog('差异率 ' + (decision.diffRate * 100).toFixed(2) + '%，自动切全量', 'info');
        var fr = await fetchFullData(hooks);
        if (!silent) hooks.onShowCancel(false);
        var fullMsg = { type: 'sync_complete', strategy: 'full', diffRate: decision.diffRate, customers: fr.customers, products: fr.products };
        emitLocal(fullMsg);
        broadcast(fullMsg);
        return { ok: true, strategy: 'full', diffRate: decision.diffRate, customers: fr.customers, products: fr.products };
      }

      hooks.onLog('差异率 ' + (decision.diffRate * 100).toFixed(2) + '%，执行增量同步', 'info');
      try {
        var ir = await incrementalSync(decision, hooks);
        if (!silent) hooks.onShowCancel(false);
        var incMsg = { type: 'sync_complete', strategy: 'incremental', diffRate: decision.diffRate, customers: ir.customers, products: ir.products };
        emitLocal(incMsg);
        broadcast(incMsg);
        return { ok: true, strategy: 'incremental', diffRate: decision.diffRate, customers: ir.customers, products: ir.products };
      } catch (e) {
        hooks.onLog('增量失败，降级为全量：' + e.message, 'err');
        var fr2 = await fetchFullData(hooks);
        if (!silent) hooks.onShowCancel(false);
        var decMsg = { type: 'sync_complete', strategy: 'full_fallback', reason: 'incremental_failed' };
        emitLocal(decMsg);
        broadcast(decMsg);
        return { ok: true, strategy: 'full', reason: 'incremental_failed', customers: fr2.customers, products: fr2.products };
      }
    } catch (e) {
      hooks.onLog('同步异常：' + e.message, 'err');
      var errMsg = { type: 'sync_error', error: e.message };
      emitLocal(errMsg);
      broadcast(errMsg);
      return { ok: false, error: e.message };
    } finally {
      _syncing = false;
      emitLocal({ type: 'sync_finished' });
      broadcast({ type: 'sync_finished' });
    }
  }

  // ===== 自动同步（按时间阈值触发）=====
  /**
   * @param {Object} [options]
   * @param {number} [options.thresholdHours=1] 数据陈旧阈值（小时）
   * @param {Object} [options.hooks] UI 回调
   * @returns {Promise<{skipped:boolean, reason?:string, result?:Object}>}
   */
  async function autoSyncIfNeeded(options) {
    options = options || {};
    var thresholdHours = options.thresholdHours != null ? options.thresholdHours : 1;
    var hooks = defaultHooks(options.hooks);
    await PinyinMatch.init();
    var lastTime = await PinyinMatch.getSyncStatusAsync('sync_time');

    if (!lastTime) {
      hooks.onLog('自动同步：未找到同步记录，执行首次同步', 'info');
      var r1 = await syncData(Object.assign({}, options, { silent: true }));
      return { skipped: false, reason: 'first_time', result: r1 };
    }

    var lastDate = new Date(lastTime.replace(' ', 'T'));
    var ageHours = (Date.now() - lastDate.getTime()) / 1000 / 3600;
    if (ageHours < thresholdHours) {
      hooks.onLog('自动同步：数据新鲜（' + ageHours.toFixed(2) + ' 小时 < ' + thresholdHours + '），跳过', 'info');
      return { skipped: true, reason: 'fresh', ageHours: ageHours };
    }

    hooks.onLog('自动同步：数据陈旧（' + ageHours.toFixed(2) + ' 小时），开始同步', 'info');
    var r2 = await syncData(Object.assign({}, options, { silent: true }));
    return { skipped: false, reason: 'stale', ageHours: ageHours, result: r2 };
  }

  // ===== 暴露 API =====
  global.PinyinSync = {
    init: initChannel,
    sync: syncData,
    autoSyncIfNeeded: autoSyncIfNeeded,
    onSyncComplete: onSyncComplete,
    // 内部函数（用于调试/单测）
    _fetchServerIds: fetchServerIds,
    _findMissingIds: findMissingIds,
    _detectSyncStrategy: detectSyncStrategy,
    _incrementalSync: incrementalSync,
    _fetchFullData: fetchFullData
  };
})(window);
