var PinyinMatch = (function() {

  function isPlaceholder(val) {
    if (!val) return true;
    var t = val.trim();
    return !t || t === '-' || t === '[未填写]' || /^\[.*\]$/.test(t);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(fn, delay) {
    var timer = null;
    return function() {
      var context = this;
      var args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function() {
        fn.apply(context, args);
      }, delay || 250);
    };
  }

  var db = null;

  var _productsCache = null;
  var _customersCache = null;
  var _indexDbCache = null;
  var _customerIndexDbCache = null;

  async function getProductsCached() {
    if (_productsCache) return _productsCache;
    _productsCache = await getProductsAsync();
    return _productsCache;
  }

  async function getCustomersCached() {
    if (_customersCache) return _customersCache;
    _customersCache = await getCustomersAsync();
    return _customersCache;
  }

  async function getProductIndexDbCached() {
    if (_indexDbCache) return _indexDbCache;
    var products = await getProductsCached();
    _indexDbCache = products.filter(function(p) {
      return p.pinyin || p.pinyin_abbr;
    }).map(function(p) {
      return { id: p.id, name: p.name, model: p.model || '', spec: p.spec || '', pinyin: p.pinyin || '', pinyin_abbr: p.pinyin_abbr || '' };
    });
    return _indexDbCache;
  }

  async function getCustomerIndexDbCached() {
    if (_customerIndexDbCache) return _customerIndexDbCache;
    var customers = await getCustomersCached();
    _customerIndexDbCache = customers.filter(function(c) {
      return c.pinyin || c.pinyin_abbr;
    }).map(function(c) {
      return { id: c.id, name: c.name, pinyin: c.pinyin || '', pinyin_abbr: c.pinyin_abbr || '' };
    });
    return _customerIndexDbCache;
  }

  function invalidateCache() {
    _productsCache = null;
    _customersCache = null;
    _indexDbCache = null;
    _customerIndexDbCache = null;
  }

  function invalidateProductCache() {
    _productsCache = null;
    _indexDbCache = null;
  }

  function invalidateCustomerCache() {
    _customersCache = null;
    _customerIndexDbCache = null;
  }

  function initDB() {
    if (db) return db;
    db = new Dexie('PinyinToolDB');
    db.version(1).stores({
      customer: 'id, name, pinyin, pinyin_abbr, update_time',
      product: 'id, name, model, sku, pinyin, pinyin_abbr, update_time',
      sync_status: 'key'
    });
    return db;
  }

  async function getStoreAsync(key, fallback) {
    initDB();
    var record = await db.sync_status.get(key);
    return record ? record.value : fallback;
  }

  async function getCustomersAsync() {
    initDB();
    return await db.customer.toArray();
  }

  async function getProductsAsync() {
    initDB();
    return await db.product.toArray();
  }

  async function getCustomerPinyinAsync() {
    initDB();
    var customers = await db.customer.toArray();
    var result = {};
    customers.forEach(function(c) {
      if (c.pinyin || c.pinyin_abbr) {
        result[c.id] = { pinyin: c.pinyin, pinyin_abbr: c.pinyin_abbr };
      }
    });
    return result;
  }

  async function getProductPinyinAsync() {
    initDB();
    var products = await db.product.toArray();
    var result = {};
    products.forEach(function(p) {
      if (p.pinyin || p.pinyin_abbr) {
        result[p.id] = { pinyin: p.pinyin, pinyin_abbr: p.pinyin_abbr };
      }
    });
    return result;
  }

  async function setCustomersAsync(customers) {
    initDB();
    var normalized = customers.map(function(c) {
      var obj = Object.assign({}, c);
      obj.id = String(obj.id);
      return obj;
    });
    await db.customer.bulkPut(normalized);
    invalidateCustomerCache();
  }

  async function setProductsAsync(products) {
    initDB();
    var normalized = products.map(function(p) {
      var obj = Object.assign({}, p);
      obj.id = String(obj.id);
      return obj;
    });
    await db.product.bulkPut(normalized);
    invalidateProductCache();
  }

  async function setCustomerPinyinAsync(pinyinMap) {
    initDB();
    await db.transaction('rw', db.customer, async function() {
      for (var id in pinyinMap) {
        var existing = await db.customer.get(id);
        if (existing) {
          existing.pinyin = pinyinMap[id].pinyin;
          existing.pinyin_abbr = pinyinMap[id].pinyin_abbr;
          await db.customer.put(existing);
        }
      }
    });
  }

  async function setProductPinyinAsync(pinyinMap) {
    initDB();
    await db.transaction('rw', db.product, async function() {
      for (var id in pinyinMap) {
        var existing = await db.product.get(id);
        if (existing) {
          existing.pinyin = pinyinMap[id].pinyin;
          existing.pinyin_abbr = pinyinMap[id].pinyin_abbr;
          await db.product.put(existing);
        }
      }
    });
  }

  async function getSyncStatusAsync(key) {
    initDB();
    var record = await db.sync_status.get(key);
    return record ? record.value : null;
  }

  async function setSyncStatusAsync(key, value) {
    initDB();
    await db.sync_status.put({ key: key, value: value });
  }

  async function hasPinyinDataAsync() {
    initDB();
    var count = await db.customer.count();
    if (count > 0) return true;
    count = await db.product.count();
    return count > 0;
  }

  async function getPinyinDataStatsAsync() {
    initDB();
    var c = await db.customer.count();
    var p = await db.product.count();
    var allCustomers = await db.customer.toArray();
    var cpCount = allCustomers.filter(function(x) { return x.pinyin && x.pinyin.length > 0; }).length;
    var allProducts = await db.product.toArray();
    var ppCount = allProducts.filter(function(x) { return x.pinyin && x.pinyin.length > 0; }).length;
    return { customers: c, products: p, customerPinyin: cpCount, productPinyin: ppCount };
  }

  async function clearAllDataAsync() {
    initDB();
    await db.customer.clear();
    await db.product.clear();
    await db.sync_status.clear();
  }

  function levenshteinDistance(a, b) {
    var m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    var dp = [];
    for (var i = 0; i <= m; i++) { dp[i] = [i]; }
    for (var j = 0; j <= n; j++) { dp[0][j] = j; }
    for (var i = 1; i <= m; i++) {
      for (var j = 1; j <= n; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  function longestCommonSubsequence(a, b) {
    var m = a.length, n = b.length;
    if (m === 0 || n === 0) return 0;
    var dp = [];
    for (var i = 0; i <= m; i++) {
      dp[i] = [];
      for (var j = 0; j <= n; j++) { dp[i][j] = 0; }
    }
    for (var i = 1; i <= m; i++) {
      for (var j = 1; j <= n; j++) {
        if (a.charAt(i - 1) === b.charAt(j - 1)) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    return dp[m][n];
  }

  function calcStringSimilarity(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    var maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    var levDist = levenshteinDistance(a, b);
    var levScore = 1 - levDist / maxLen;
    var lcsLen = longestCommonSubsequence(a, b);
    var lcsScore = (2 * lcsLen) / (a.length + b.length);
    return (levScore + lcsScore) / 2;
  }

  function pinyinWordBagSimilarity(asrFull, recordFull) {
    var asrWords = asrFull.split('_').filter(function(w) { return w.length > 0; });
    var recWords = recordFull.split('_').filter(function(w) { return w.length > 0; });
    if (asrWords.length === 0 && recWords.length === 0) return 1;
    if (asrWords.length === 0 || recWords.length === 0) return 0;
    var asrCount = {};
    asrWords.forEach(function(w) { asrCount[w] = (asrCount[w] || 0) + 1; });
    var recCount = {};
    recWords.forEach(function(w) { recCount[w] = (recCount[w] || 0) + 1; });
    var allWords = new Set(Object.keys(asrCount).concat(Object.keys(recCount)));
    var dotProduct = 0, asrNorm = 0, recNorm = 0;
    allWords.forEach(function(w) {
      var a = asrCount[w] || 0;
      var r = recCount[w] || 0;
      dotProduct += a * r;
      asrNorm += a * a;
      recNorm += r * r;
    });
    var denominator = Math.sqrt(asrNorm) * Math.sqrt(recNorm);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  function generatePinyinForText(text) {
    if (!text || typeof text !== 'string') return { full: '', abbr: '' };
    try {
      var segments = [];
      var current = '';
      var currentIsChinese = null;
      for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        var isChinese = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch);
        if (currentIsChinese === null) {
          currentIsChinese = isChinese;
          current = ch;
        } else if (isChinese === currentIsChinese) {
          current += ch;
        } else {
          segments.push({ text: current, isChinese: currentIsChinese });
          current = ch;
          currentIsChinese = isChinese;
        }
      }
      if (current) {
        segments.push({ text: current, isChinese: currentIsChinese });
      }

      var fullParts = [];
      var abbrParts = [];

      for (var j = 0; j < segments.length; j++) {
        var seg = segments[j];
        if (seg.isChinese) {
          var py = pinyinPro.pinyin(seg.text, { toneType: 'none', type: 'array' });
          for (var k1 = 0; k1 < py.length; k1++) {
            fullParts.push(py[k1].toLowerCase());
          }
          var abbrPy = pinyinPro.pinyin(seg.text, { pattern: 'first', toneType: 'none', type: 'array' });
          for (var k2 = 0; k2 < abbrPy.length; k2++) {
            abbrParts.push(abbrPy[k2].toLowerCase());
          }
        } else {
          var trimmed = seg.text.trim();
          if (!trimmed) continue;
          fullParts.push(trimmed.toLowerCase().replace(/\s+/g, '_'));
          var lowered = trimmed.toLowerCase();
          if (/^[a-z0-9]+([_.\s]+[a-z0-9]+)*$/.test(lowered)) {
            var pyParts = lowered.split(/[_\s.]+/);
            var abbr = '';
            for (var n = 0; n < pyParts.length; n++) {
              if (pyParts[n].length > 0) abbr += pyParts[n].charAt(0);
            }
            abbrParts.push(abbr);
          } else {
            abbrParts.push(lowered.replace(/\s+/g, ''));
          }
        }
      }

      return { full: fullParts.join('_'), abbr: abbrParts.join('') };
    } catch (e) {
      return { full: '', abbr: '' };
    }
  }

  function pinyinMatch(asrText, indexDb, options) {
    var threshold = (options && options.threshold) || 0.7;
    var asrPy = generatePinyinForText(asrText);
    var asrFull = asrPy.full.toLowerCase();
    var asrAbbr = asrPy.abbr.toLowerCase();
    var kw = asrText.toLowerCase();
    var candidates = [];

    for (var i = 0; i < indexDb.length; i++) {
      var record = indexDb[i];
      var scores = {};

      if (record.name && record.name.toLowerCase() === kw) {
        scores.pinyin = 1; scores.abbr = 1; scores.wordBag = 1; scores.length = 1;
      } else if (record.name && record.name.toLowerCase().indexOf(kw) !== -1) {
        scores.pinyin = 0.95; scores.abbr = 0.9; scores.wordBag = 1; scores.length = 0.9;
      } else {
        var recordFull = (record.pinyin || '').toLowerCase();
        var recordAbbr = (record.pinyin_abbr || '').toLowerCase();
        scores.pinyin = calcStringSimilarity(asrFull, recordFull);
        scores.abbr = calcStringSimilarity(asrAbbr, recordAbbr);
        scores.wordBag = pinyinWordBagSimilarity(asrFull, recordFull);
        var maxLen = Math.max(asrFull.length, recordFull.length);
        var lenDiff = Math.abs(asrFull.length - recordFull.length);
        scores.length = maxLen > 0 ? Math.max(0, 1 - lenDiff / maxLen) : 1;
      }

      var finalScore = scores.pinyin * 0.35 + scores.abbr * 0.25 + scores.wordBag * 0.30 + scores.length * 0.10;

      if (finalScore >= threshold) {
        candidates.push({
          id: record.id,
          name: record.name,
          model: record.model || '',
          spec: record.spec || '',
          score: finalScore,
          details: scores
        });
      }
    }

    candidates.sort(function(a, b) { return b.score - a.score; });
    return candidates;
  }

  async function findProductFuzzyMatchFromLS(name, hasSpec, specValue, modelValue) {
    var products = await getProductsAsync();
    var pp = await getProductPinyinAsync();
    console.log('[Dexie] findProductFuzzyMatchFromLS: products=' + products.length + ', pinyinKeys=' + Object.keys(pp).length);
    if (products.length === 0) {
      return { matchId: null, status: 'error', matchType: 'none' };
    }
    var withPinyin = 0;
    var indexDb = products.map(function(p) {
      var py = pp[p.id] || {};
      if (py.pinyin) withPinyin++;
      return { id: p.id, name: p.name, model: p.model || '', spec: p.spec || '', pinyin: py.pinyin || '', pinyin_abbr: py.pinyin_abbr || '' };
    });
    console.log('[Dexie] indexDb size=' + indexDb.length + ', withPinyin=' + withPinyin);

    var matches = pinyinMatch(name, indexDb, { threshold: 0.45 });
    if (matches.length === 0) {
      return { matchId: null, status: 'error', matchType: 'none' };
    }

    var best = matches[0];

    if (best.score >= 0.9) {
      var sameNameProducts = products.filter(function(p) { return p.name === best.name; });
      if (sameNameProducts.length > 1) {
        var modelMatches = sameNameProducts;
        if (modelValue) {
          var modelExact = sameNameProducts.find(function(p) {
            return p.model && p.model.toLowerCase() === modelValue.toLowerCase();
          });
          if (modelExact) {
            modelMatches = sameNameProducts.filter(function(p) {
              return p.model && p.model.toLowerCase() === modelValue.toLowerCase();
            });
          } else {
            var modelPartial = sameNameProducts.find(function(p) {
              return p.model && (p.model.toLowerCase().indexOf(modelValue.toLowerCase()) !== -1 || modelValue.toLowerCase().indexOf(p.model.toLowerCase()) !== -1);
            });
            if (modelPartial) {
              modelMatches = sameNameProducts.filter(function(p) {
                return p.model && (p.model.toLowerCase().indexOf(modelValue.toLowerCase()) !== -1 || modelValue.toLowerCase().indexOf(p.model.toLowerCase()) !== -1);
              });
            }
          }
        }
        if (modelMatches.length === 1) {
          return { matchId: modelMatches[0].id, status: 'confirmed', matchType: 'sku' };
        }
        if (!isPlaceholder(specValue) && modelMatches.length > 1) {
          var specMatch = modelMatches.find(function(p) {
            return p.spec && p.spec.toLowerCase().indexOf(specValue.toLowerCase()) !== -1;
          });
          if (specMatch) {
            return { matchId: specMatch.id, status: 'confirmed', matchType: 'sku' };
          }
        }
        return { matchId: best.id, status: 'pending', matchType: 'name' };
      }
      return { matchId: best.id, status: 'confirmed', matchType: best.score >= 0.95 ? 'exact' : 'name' };
    }

    if (matches.length === 1 && best.score >= 0.8) {
      return { matchId: best.id, status: 'confirmed', matchType: 'name' };
    }
    if (best.score >= 0.7) {
      return { matchId: best.id, status: 'pending', matchType: 'name' };
    }
    if (matches.length === 1 && best.score >= 0.4) {
      return { matchId: best.id, status: 'pending', matchType: 'name' };
    }
    if (matches.length > 1 && best.score >= 0.4) {
      return { matchId: best.id, status: 'pending', matchType: 'name' };
    }
    return { matchId: null, status: 'error', matchType: 'none' };
  }

  function extractOrderJSON(text) {
    if (!text) return null;
    var jsonPatterns = [
      /\{[\s\S]*?"customer"[\s\S]*?"products"[\s\S]*?\}/,
      /\{[\s\S]*?"客户"[\s\S]*?"产品"[\s\S]*?\}/,
      /\{[\s\S]*?"customerName"[\s\S]*?"items"[\s\S]*?\}/,
      /\{[\s\S]*?"customer_name"[\s\S]*?"products"[\s\S]*?\}/,
      /```json\s*([\s\S]*?)\s*```/,
      /```\s*([\s\S]*?)\s*```/,
      /(\{[\s\S]*?"doc_type"[\s\S]*?\})/,
      /(\{[\s\S]*?"customer_name"[\s\S]*?"products"[\s\S]*?\})/
    ];
    for (var i = 0; i < jsonPatterns.length; i++) {
      var match = text.match(jsonPatterns[i]);
      if (match) {
        var candidate = match[1] || match[0];
        try {
          var obj = JSON.parse(candidate);
          if (obj && (obj.customer || obj['客户'] || obj.customerName || obj.customer_name || obj.doc_type)
              && (obj.products || obj['产品'] || obj.items)) {
            return candidate;
          }
        } catch (e) {}
      }
    }
    try {
      var obj2 = JSON.parse(text);
      if (obj2 && (obj2.customer || obj2['客户'] || obj2.customerName || obj2.customer_name || obj2.doc_type)
          && (obj2.products || obj2['产品'] || obj2.items)) {
        return text;
      }
    } catch (e) {}
    return null;
  }

  function normalizeOrderJSON(jsonStr) {
    var obj = JSON.parse(jsonStr);
    if (obj.customerName && obj.items) {
      return {
        customer: { originalName: obj.customerName, recv: obj.recv || '', addr: obj.addr || '' },
        products: obj.items.map(function(item) {
          return {
            originalName: item.name || item.productName || '',
            model: item.model || item.sku || '',
            qty: item.quantity || item.qty || '',
            unit: item.unit || '',
            price: item.unit_price || item.price || '',
            spec: item.specification || item.spec || '',
            amount: item.amount || '',
            note: item.note || item.remark || ''
          };
        })
      };
    }
    if (obj.customer_name && obj.products) {
      return {
        customer: { originalName: obj.customer_name, recv: obj.recv || '', addr: obj.addr || '' },
        products: obj.products.map(function(item) {
          return {
            originalName: item.name || item.productName || item.product_name || '',
            model: item.model || item.sku || '',
            qty: item.quantity || item.qty || '',
            unit: item.unit || '',
            price: item.unit_price || item.price || '',
            spec: item.specification || item.spec || '',
            amount: item.amount || '',
            note: item.note || item.remark || ''
          };
        })
      };
    }
    if (obj['客户'] && obj['产品']) {
      return {
        customer: { originalName: obj['客户'], recv: obj.recv || obj['收件人'] || '', addr: obj.addr || obj['收货地址'] || '' },
        products: obj['产品'].map(function(item) {
          return {
            originalName: item['品名'] || item['名称'] || item.name || '',
            model: item['型号'] || item.model || item.sku || '',
            qty: item['数量'] || item.quantity || item.qty || '',
            unit: item['单位'] || item.unit || '',
            price: item['单价'] || item.unit_price || item.price || '',
            spec: item['规格'] || item.specification || item.spec || '',
            amount: item['金额'] || item.amount || '',
            note: item['备注'] || item.note || ''
          };
        })
      };
    }
    if (obj.customer && obj.products) {
      return {
        customer: { originalName: obj.customer, recv: obj.recv || '', addr: obj.addr || '' },
        products: obj.products.map(function(item) {
          return {
            originalName: item.name || item.productName || '',
            model: item.model || item.sku || '',
            qty: item.quantity || item.qty || '',
            unit: item.unit || '',
            price: item.unit_price || item.price || '',
            spec: item.specification || item.spec || '',
            amount: item.amount || '',
            note: item.note || item.remark || ''
          };
        })
      };
    }
    return obj;
  }

  async function matchProductsFromRawList(rawProducts) {
    var results = [];
    for (var i = 0; i < rawProducts.length; i++) {
      var p = rawProducts[i];
      var pName = p.originalName || p.name || '';
      var pModel = p.model || '';
      var pSpec = p.spec || '';
      var combinedParts = [pName];
      if (pModel && !isPlaceholder(pModel) && pName.toLowerCase().indexOf(pModel.toLowerCase()) === -1) {
        combinedParts.push(pModel);
      }
      var combinedName = combinedParts.join(' ');
      var hasSpec = !isPlaceholder(pSpec);
      var match = await findProductFuzzyMatchFromLS(combinedName, hasSpec, String(pSpec), isPlaceholder(pModel) ? '' : pModel);
      var matchedProduct = null;
      if (match.matchId) {
        var lsProducts = await getProductsAsync();
        for (var j = 0; j < lsProducts.length; j++) {
          if (String(lsProducts[j].id) === String(match.matchId)) {
            matchedProduct = {
              id: lsProducts[j].id,
              name: lsProducts[j].name,
              code: 'PRD-' + lsProducts[j].id,
              sku: lsProducts[j].model || '-',
              spec: lsProducts[j].spec || ''
            };
            break;
          }
        }
      }
      results.push({
        originalName: pName,
        model: pModel,
        searchName: combinedName,
        originalQty: p.qty ? (String(p.qty) + (p.unit || '')) : '',
        originalPrice: p.price ? ('¥' + p.price) : '',
        originalSpec: String(pSpec),
        matchedId: match.matchId,
        matchedName: matchedProduct ? matchedProduct.name : '',
        matchedCode: matchedProduct ? matchedProduct.code : '',
        matchedSku: matchedProduct ? matchedProduct.sku : '',
        matchedSpec: matchedProduct ? matchedProduct.spec : '',
        matchType: match.matchType,
        status: match.status,
        qty: p.qty ? (String(p.qty) + (p.unit || '')) : '',
        price: p.price ? ('¥' + p.price) : '',
        spec: pSpec,
        note: p.note || ''
      });
    }
    return results;
  }

  return {
    isPlaceholder: isPlaceholder,
    escapeHtml: escapeHtml,
    debounce: debounce,
    initDB: initDB,
    getStoreAsync: getStoreAsync,
    getCustomersAsync: getCustomersAsync,
    getProductsAsync: getProductsAsync,
    getCustomerPinyinAsync: getCustomerPinyinAsync,
    getProductPinyinAsync: getProductPinyinAsync,
    setCustomersAsync: setCustomersAsync,
    setProductsAsync: setProductsAsync,
    setCustomerPinyinAsync: setCustomerPinyinAsync,
    setProductPinyinAsync: setProductPinyinAsync,
    getSyncStatusAsync: getSyncStatusAsync,
    setSyncStatusAsync: setSyncStatusAsync,
    hasPinyinDataAsync: hasPinyinDataAsync,
    getPinyinDataStatsAsync: getPinyinDataStatsAsync,
    clearAllDataAsync: clearAllDataAsync,
    levenshteinDistance: levenshteinDistance,
    longestCommonSubsequence: longestCommonSubsequence,
    calcStringSimilarity: calcStringSimilarity,
    pinyinWordBagSimilarity: pinyinWordBagSimilarity,
    generatePinyinForText: generatePinyinForText,
    pinyinMatch: pinyinMatch,
    findProductFuzzyMatchFromLS: findProductFuzzyMatchFromLS,
    extractOrderJSON: extractOrderJSON,
    normalizeOrderJSON: normalizeOrderJSON,
    matchProductsFromRawList: matchProductsFromRawList
  };

})();
