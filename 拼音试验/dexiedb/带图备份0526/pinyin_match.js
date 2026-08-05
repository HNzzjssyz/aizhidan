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
  var _productMapCache = null;
  var _customerMapCache = null;
  var _nameIndexCache = null;
  var _pinyinCache = {};
  var _tokenInvertedIndex = null;
  var _customerTokenInvertedIndex = null;
  var _keywordInvertedIndex = null;
  var _productKeywordCache = null;

  async function getProductsCached() {
    if (_productsCache) return _productsCache;
    var t0 = performance.now();
    _productsCache = await getProductsAsync();
    console.log('[Cache] getProductsCached: loaded ' + _productsCache.length + ' products in ' + (performance.now() - t0).toFixed(1) + 'ms');
    return _productsCache;
  }

  async function getCustomersCached() {
    if (_customersCache) return _customersCache;
    var t0 = performance.now();
    _customersCache = await getCustomersAsync();
    console.log('[Cache] getCustomersCached: loaded ' + _customersCache.length + ' customers in ' + (performance.now() - t0).toFixed(1) + 'ms');
    return _customersCache;
  }

  async function getProductIndexDbCached() {
    if (_indexDbCache) return _indexDbCache;
    var products = await getProductsCached();
    var t0 = performance.now();
    _indexDbCache = products.map(function(p) {
      return { id: p.id, name: p.name, model: p.model || '', spec: p.spec || '', pinyin: p.pinyin || '', pinyin_abbr: p.pinyin_abbr || '' };
    });
    console.log('[Cache] getProductIndexDbCached: built ' + _indexDbCache.length + ' entries in ' + (performance.now() - t0).toFixed(1) + 'ms');
    return _indexDbCache;
  }

  async function getCustomerIndexDbCached() {
    if (_customerIndexDbCache) return _customerIndexDbCache;
    var customers = await getCustomersCached();
    var t0 = performance.now();
    _customerIndexDbCache = customers.map(function(c) {
      return { id: c.id, name: c.name, pinyin: c.pinyin || '', pinyin_abbr: c.pinyin_abbr || '' };
    });
    console.log('[Cache] getCustomerIndexDbCached: built ' + _customerIndexDbCache.length + ' entries in ' + (performance.now() - t0).toFixed(1) + 'ms');
    return _customerIndexDbCache;
  }

  async function getProductMapCached() {
    if (_productMapCache) return _productMapCache;
    var products = await getProductsCached();
    _productMapCache = {};
    products.forEach(function(p) {
      _productMapCache[String(p.id)] = p;
    });
    return _productMapCache;
  }

  async function getProductNameIndexCached() {
    if (_nameIndexCache) return _nameIndexCache;
    var products = await getProductsCached();
    _nameIndexCache = {};
    products.forEach(function(p) {
      if (p.name) {
        var key = p.name.toLowerCase();
        if (!_nameIndexCache[key]) _nameIndexCache[key] = [];
        _nameIndexCache[key].push(p);
      }
    });
    return _nameIndexCache;
  }

  async function getCustomerMapCached() {
    if (_customerMapCache) return _customerMapCache;
    var customers = await getCustomersCached();
    _customerMapCache = {};
    customers.forEach(function(c) {
      _customerMapCache[String(c.id)] = c;
    });
    return _customerMapCache;
  }

  function tokenizePinyin(pinyinStr) {
    if (!pinyinStr) return [];
    return pinyinStr.toLowerCase().split('_').filter(function(w) { return w.length > 0; });
  }

  var _stopChars = /[、，,；;：:（）()\[\]【】\s\/\\|·\-—–]+/g;
  var _unitWords = ['个','只','件','双','副','把','条','根','块','片','套','组','对','瓶','盒','包','箱','桶','袋','卷','米','厘米','毫米','升','克','千克','吨'];
  var _commonSuffixes2 = ['手套','雨衣','工作服','安全帽','护目镜','口罩','面罩','耳塞','安全鞋','安全带','救生衣','反光衣','防护服','绝缘鞋','劳保鞋','防尘帽','防护帽','防护镜','防护罩','安全绳','安全网','灭火器','消防栓','报警器','指示灯','防护栏','防护网','防滑鞋','防砸鞋','防刺鞋','防寒服','防化服','防毒面','呼吸器','氧气瓶','急救箱','担架','消防服','消防靴','消防帽','消防带','面料','过滤棉'];
  var _commonPrefixes2 = ['防冲','防喷','防粉','防紫','防化','防静','防滑','防砸','防刺','防寒','防尘','防毒','防油','防水','防风','防火','防电','防弧','防噪','耐高','耐酸','耐碱','耐油','耐磨','耐温','绝缘','抗静','抗紫','抗冲'];
  var _commonWords3 = ['防冲击','防喷溅','防粉尘','防紫外线','防化','防静电','防滑','防砸','防刺穿','防寒','防尘','防毒','防油','防水','防风','防火','防电','防弧光','防噪音','耐高温','耐酸碱','耐油','耐磨','耐温','绝缘','抗静电','抗紫外','抗冲击','反光条','连体','长袖','短袖','分指','五指','牛筋底','聚碳酸酯','碳纤维','不锈钢','铝合金','棉纱','涤纶','尼龙','牛津','帆布','针织','斜纹','平纹','反光','荧光','透气','吸汗','速干','保暖','加厚','加长','大框','小框','透明','银灰色','原白色','浅灰','深灰','黑色','白色','墨绿','藏青','橙色','红色','蓝色','黄色','绿色','外线','长款','连体雨衣','银灰','原白','聚碳酸','防渗透','牛津面料','长款连体','防喷溅','防紫外'];

  var _allDictWords = [].concat(_commonSuffixes2, _commonPrefixes2, _commonWords3);
  var _dictSorted = _allDictWords.slice().sort(function(a, b) { return b.length - a.length; });
  var _dictUnique = [];
  var _dictSeen = {};
  for (var di = 0; di < _dictSorted.length; di++) {
    if (!_dictSeen[_dictSorted[di]]) { _dictSeen[_dictSorted[di]] = true; _dictUnique.push(_dictSorted[di]); }
  }

  function splitLongChinese(part) {
    if (part.length <= 4) return [part];
    var bestMatch = null;
    var bestPos = -1;
    var bestLen = 0;
    for (var d = 0; d < _dictUnique.length; d++) {
      var word = _dictUnique[d];
      if (word.length >= part.length) continue;
      var pos = part.indexOf(word);
      if (pos >= 0 && word.length > bestLen) {
        bestMatch = word;
        bestPos = pos;
        bestLen = word.length;
      }
    }
    if (bestMatch) {
      var before = part.substring(0, bestPos);
      var after = part.substring(bestPos + bestMatch.length);
      var result = [];
      if (before.length >= 2) result = result.concat(splitLongChinese(before));
      else if (before.length === 1) { if (result.length > 0) result[0] = before + result[0]; else result.push(before); }
      result.push(bestMatch);
      if (after.length >= 2) result = result.concat(splitLongChinese(after));
      else if (after.length === 1) { if (result.length > 0) result[result.length - 1] += after; else result.push(after); }
      return result;
    }
    if (part.length > 4) {
      var result = [];
      for (var i = 0; i < part.length; i += 2) {
        var end = Math.min(i + 2, part.length);
        var chunk = part.substring(i, end);
        if (chunk.length >= 2) result.push(chunk);
      }
      return result;
    }
    return [part];
  }

  function tokenizeChinese(text) {
    if (!text || typeof text !== 'string') return [];
    var cleaned = text.replace(_stopChars, ' ').trim();
    if (!cleaned) return [];
    var parts = cleaned.split(/\s+/);
    var tokens = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part) continue;
      var subParts = part.split('/');
      for (var j = 0; j < subParts.length; j++) {
        var sp = subParts[j].trim();
        if (!sp) continue;
        if (_unitWords.indexOf(sp) !== -1) continue;
        if (/^\d+(\.\d+)?$/.test(sp)) continue;
        sp = sp.toLowerCase();
        if (/^[\u4e00-\u9fff]+$/.test(sp) && sp.length > 4) {
          var subTokens = splitLongChinese(sp);
          for (var k = 0; k < subTokens.length; k++) {
            if (subTokens[k].length >= 2) tokens.push(subTokens[k]);
          }
        } else {
          tokens.push(sp);
        }
      }
    }
    return tokens;
  }

  function tokenizeProductForIndex(product) {
    var nameTokens = tokenizeChinese(product.name || '');
    var modelTokens = tokenizeChinese(product.model || '');
    var specTokens = tokenizeChinese(product.spec || '');
    var all = nameTokens.concat(modelTokens).concat(specTokens);
    var seen = {};
    var unique = [];
    for (var i = 0; i < all.length; i++) {
      if (!seen[all[i]]) {
        seen[all[i]] = true;
        unique.push(all[i]);
      }
    }
    return unique;
  }

  async function getProductKeywordCache() {
    if (_productKeywordCache) return _productKeywordCache;
    var products = await getProductsCached();
    var t0 = performance.now();
    _productKeywordCache = products.map(function(p) {
      return { id: p.id, name: p.name, model: p.model || '', spec: p.spec || '', keywords: tokenizeProductForIndex(p) };
    });
    console.log('[Index] getProductKeywordCache: built ' + _productKeywordCache.length + ' keyword entries in ' + (performance.now() - t0).toFixed(1) + 'ms');
    return _productKeywordCache;
  }

  async function getKeywordInvertedIndexCached() {
    if (_keywordInvertedIndex) return _keywordInvertedIndex;
    var kwCache = await getProductKeywordCache();
    var t0 = performance.now();
    _keywordInvertedIndex = {};
    for (var i = 0; i < kwCache.length; i++) {
      var record = kwCache[i];
      for (var j = 0; j < record.keywords.length; j++) {
        var kw = record.keywords[j];
        if (!_keywordInvertedIndex[kw]) _keywordInvertedIndex[kw] = [];
        _keywordInvertedIndex[kw].push(i);
      }
    }
    console.log('[Index] getKeywordInvertedIndexCached: built ' + Object.keys(_keywordInvertedIndex).length + ' keyword entries for ' + kwCache.length + ' products in ' + (performance.now() - t0).toFixed(1) + 'ms');
    return _keywordInvertedIndex;
  }

  var _negPrefixes = { '\u65e0': 1, '\u975e': 1, '\u4e0d': 1, '\u672a': 1 };

  function charOverlapRatio(a, b) {
    if (!a || !b) return 0;
    var aNeg = a.length > 1 && _negPrefixes[a[0]] ? true : false;
    var bNeg = b.length > 1 && _negPrefixes[b[0]] ? true : false;
    if (aNeg !== bNeg) return 0;
    var aChars = {}, bChars = {};
    for (var i = 0; i < a.length; i++) aChars[a[i]] = true;
    for (var i = 0; i < b.length; i++) bChars[b[i]] = true;
    var shared = 0;
    for (var ch in aChars) { if (bChars[ch]) shared++; }
    var minLen = Math.min(Object.keys(aChars).length, Object.keys(bChars).length);
    return minLen > 0 ? shared / minLen : 0;
  }

  function isPureChinese(s) {
    return /^[\u4e00-\u9fff]+$/.test(s);
  }

  function keywordMatchScore(queryTokens, recordKeywords) {
    if (queryTokens.length === 0) return 0;
    var totalWeight = 0;
    var totalScore = 0;
    for (var i = 0; i < queryTokens.length; i++) {
      var qt = queryTokens[i];
      var qtIsChinese = isPureChinese(qt);
      var weight = qtIsChinese ? (qt.length >= 3 ? 1.5 : 1.0) : 0.5;
      totalWeight += weight;
      var bestQuality = 0;
      for (var j = 0; j < recordKeywords.length; j++) {
        var rk = recordKeywords[j];
        if (qt === rk) {
          bestQuality = 1.0;
          break;
        }
        if (rk.indexOf(qt) !== -1) {
          var q = Math.min(1, qt.length / rk.length);
          if (q > bestQuality) bestQuality = q;
        }
        if (qt.indexOf(rk) !== -1) {
          var q = rk.length / qt.length;
          if (q > bestQuality) bestQuality = q;
        }
        if (qtIsChinese && isPureChinese(rk)) {
          var co = charOverlapRatio(qt, rk);
          if (co >= 0.6) {
            var q = co * Math.min(qt.length, rk.length) / Math.max(qt.length, rk.length);
            if (q > bestQuality) bestQuality = q;
          }
        }
      }
      totalScore += bestQuality * weight;
    }
    return totalWeight > 0 ? Math.min(1, totalScore / totalWeight) : 0;
  }

  function getKeywordCandidates(queryTokens, invertedIndex, minOverlap) {
    var hitCounts = {};
    for (var i = 0; i < queryTokens.length; i++) {
      var tok = queryTokens[i];
      var indices = invertedIndex[tok];
      if (indices) {
        for (var j = 0; j < indices.length; j++) {
          hitCounts[indices[j]] = (hitCounts[indices[j]] || 0) + 1;
        }
      }
      for (var key in invertedIndex) {
        if (key !== tok && (key.indexOf(tok) !== -1 || tok.indexOf(key) !== -1)) {
          var subIndices = invertedIndex[key];
          for (var k = 0; k < subIndices.length; k++) {
            hitCounts[subIndices[k]] = (hitCounts[subIndices[k]] || 0) + 0.5;
          }
        }
      }
    }
    var result = [];
    for (var idx in hitCounts) {
      if (hitCounts[idx] >= minOverlap) {
        result.push(parseInt(idx, 10));
      }
    }
    return result;
  }

  async function getTokenInvertedIndexCached() {
    if (_tokenInvertedIndex) return _tokenInvertedIndex;
    var indexDb = await getProductIndexDbCached();
    var t0 = performance.now();
    _tokenInvertedIndex = {};
    for (var i = 0; i < indexDb.length; i++) {
      var record = indexDb[i];
      var tokens = tokenizePinyin(record.pinyin);
      var seen = {};
      for (var j = 0; j < tokens.length; j++) {
        var tok = tokens[j];
        if (!seen[tok]) {
          seen[tok] = true;
          if (!_tokenInvertedIndex[tok]) _tokenInvertedIndex[tok] = [];
          _tokenInvertedIndex[tok].push(i);
        }
      }
    }
    console.log('[Index] getTokenInvertedIndexCached: built ' + Object.keys(_tokenInvertedIndex).length + ' tokens for ' + indexDb.length + ' products in ' + (performance.now() - t0).toFixed(1) + 'ms');
    return _tokenInvertedIndex;
  }

  async function getCustomerTokenInvertedIndexCached() {
    if (_customerTokenInvertedIndex) return _customerTokenInvertedIndex;
    var indexDb = await getCustomerIndexDbCached();
    var t0 = performance.now();
    _customerTokenInvertedIndex = {};
    for (var i = 0; i < indexDb.length; i++) {
      var record = indexDb[i];
      var tokens = tokenizePinyin(record.pinyin);
      var seen = {};
      for (var j = 0; j < tokens.length; j++) {
        var tok = tokens[j];
        if (!seen[tok]) {
          seen[tok] = true;
          if (!_customerTokenInvertedIndex[tok]) _customerTokenInvertedIndex[tok] = [];
          _customerTokenInvertedIndex[tok].push(i);
        }
      }
    }
    console.log('[Index] getCustomerTokenInvertedIndexCached: built ' + Object.keys(_customerTokenInvertedIndex).length + ' tokens for ' + indexDb.length + ' customers in ' + (performance.now() - t0).toFixed(1) + 'ms');
    return _customerTokenInvertedIndex;
  }

  function getCandidatesByTokenOverlap(queryTokens, invertedIndex, minOverlap) {
    var hitCounts = {};
    for (var i = 0; i < queryTokens.length; i++) {
      var tok = queryTokens[i];
      var indices = invertedIndex[tok];
      if (indices) {
        for (var j = 0; j < indices.length; j++) {
          hitCounts[indices[j]] = (hitCounts[indices[j]] || 0) + 1;
        }
      }
    }
    var result = [];
    for (var idx in hitCounts) {
      if (hitCounts[idx] >= minOverlap) {
        result.push(parseInt(idx, 10));
      }
    }
    return result;
  }

  function getMinOverlap(tokenCount) {
    if (tokenCount <= 2) return 1;
    if (tokenCount <= 4) return 2;
    if (tokenCount <= 7) return 3;
    return Math.ceil(tokenCount * 0.4);
  }

  function invalidateCache() {
    _productsCache = null;
    _customersCache = null;
    _indexDbCache = null;
    _customerIndexDbCache = null;
    _productMapCache = null;
    _customerMapCache = null;
    _nameIndexCache = null;
    _pinyinCache = {};
    _tokenInvertedIndex = null;
    _customerTokenInvertedIndex = null;
    _keywordInvertedIndex = null;
    _productKeywordCache = null;
    console.log('[Cache] invalidateCache: all caches cleared');
  }

  function invalidateProductCache() {
    _productsCache = null;
    _indexDbCache = null;
    _productMapCache = null;
    _nameIndexCache = null;
    _pinyinCache = {};
    _tokenInvertedIndex = null;
    _keywordInvertedIndex = null;
    _productKeywordCache = null;
    console.log('[Cache] invalidateProductCache: product caches cleared');
  }

  function invalidateCustomerCache() {
    _customersCache = null;
    _customerIndexDbCache = null;
    _customerMapCache = null;
    _customerTokenInvertedIndex = null;
    console.log('[Cache] invalidateCustomerCache: customer caches cleared');
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

  function init() {
    return new Promise(function(resolve) {
      initDB();
      resolve(db);
    });
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
    await db.customer.clear();
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
    await db.product.clear();
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
    invalidateCustomerCache();
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
    invalidateProductCache();
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
    if (db) {
      try {
        await db.delete();
      } catch (e) {
        console.warn('[DB] db.delete() failed, fallback to clear tables:', e);
        try {
          await db.customer.clear();
          await db.product.clear();
          await db.sync_status.clear();
        } catch (e2) {
          console.warn('[DB] table clear also failed:', e2);
        }
      }
      db = null;
    }
    invalidateCache();
  }

  function levenshteinDistance(a, b) {
    var m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    if (m < n) { var tmp = a; a = b; b = tmp; tmp = m; m = n; n = tmp; }
    var prev = [];
    var curr = [];
    for (var j = 0; j <= n; j++) prev[j] = j;
    for (var i = 1; i <= m; i++) {
      curr[0] = i;
      for (var j = 1; j <= n; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        var del = prev[j] + 1;
        var ins = curr[j - 1] + 1;
        var sub = prev[j - 1] + cost;
        curr[j] = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub);
      }
      var swap = prev; prev = curr; curr = swap;
    }
    return prev[n];
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
    return 1 - levDist / maxLen;
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

  function pinyinMatchWithCandidates(asrText, indexDb, candidateIndices, options) {
    var threshold = (options && options.threshold) || 0.7;
    var asrPy = generatePinyinForText(asrText);
    var asrFull = asrPy.full.toLowerCase();
    var asrAbbr = asrPy.abbr.toLowerCase();
    var kw = asrText.toLowerCase();
    var candidates = [];

    var indices = candidateIndices;
    if (!indices) {
      indices = [];
      for (var k = 0; k < indexDb.length; k++) indices.push(k);
    }

    for (var ii = 0; ii < indices.length; ii++) {
      var i = indices[ii];
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

  function pinyinMatch(asrText, indexDb, options) {
    return pinyinMatchWithCandidates(asrText, indexDb, null, options);
  }

  async function findProductFuzzyMatchFromLS(name, hasSpec, specValue, modelValue) {
    var t0 = performance.now();
    var products = await getProductsCached();
    var indexDb = await getProductIndexDbCached();
    var invertedIndex = await getTokenInvertedIndexCached();
    var kwCache = await getProductKeywordCache();
    var kwInvertedIndex = await getKeywordInvertedIndexCached();

    if (products.length === 0) {
      return { matchId: null, status: 'error', matchType: 'none' };
    }

    var asrPy = generatePinyinForText(name);
    var queryTokens = tokenizePinyin(asrPy.full);
    var minOverlap = getMinOverlap(queryTokens.length);
    var candidateIndices = getCandidatesByTokenOverlap(queryTokens, invertedIndex, minOverlap);

    var queryKwTokens = tokenizeChinese(name);
    var kwMinOverlap = queryKwTokens.length <= 2 ? 1 : Math.ceil(queryKwTokens.length * 0.3);
    var kwCandidateIndices = getKeywordCandidates(queryKwTokens, kwInvertedIndex, kwMinOverlap);

    var allCandidateSet = {};
    for (var ci = 0; ci < candidateIndices.length; ci++) {
      allCandidateSet[candidateIndices[ci]] = true;
    }
    for (var ki = 0; ki < kwCandidateIndices.length; ki++) {
      allCandidateSet[kwCandidateIndices[ki]] = true;
    }
    var mergedCandidateIndices = [];
    for (var idx in allCandidateSet) {
      mergedCandidateIndices.push(parseInt(idx, 10));
    }

    console.log('[Index] findProductFuzzyMatchFromLS: query="' + name + '", pinyinCandidates=' + candidateIndices.length + ', kwCandidates=' + kwCandidateIndices.length + ', merged=' + mergedCandidateIndices.length + '/' + indexDb.length + ' in ' + (performance.now() - t0).toFixed(1) + 'ms');

    var matches = pinyinMatchWithCandidates(name, indexDb, mergedCandidateIndices, { threshold: 0.45 });

    if (matches.length === 0 && minOverlap > 1) {
      var fallbackIndices = getCandidatesByTokenOverlap(queryTokens, invertedIndex, 1);
      console.log('[Index] findProductFuzzyMatchFromLS: fallback to minOverlap=1, candidates=' + fallbackIndices.length);
      matches = pinyinMatchWithCandidates(name, indexDb, fallbackIndices, { threshold: 0.45 });
    }

    var kwMatches = [];
    for (var kmi = 0; kmi < mergedCandidateIndices.length; kmi++) {
      var kwIdx = mergedCandidateIndices[kmi];
      var kwRec = kwCache[kwIdx];
      if (!kwRec) continue;
      var kwScore = keywordMatchScore(queryKwTokens, kwRec.keywords);
      if (kwScore >= 0.3) {
        var idxRec = indexDb[kwIdx];
        kwMatches.push({
          id: idxRec ? idxRec.id : kwRec.id,
          name: idxRec ? idxRec.name : kwRec.name,
          model: idxRec ? (idxRec.model || '') : (kwRec.model || ''),
          spec: idxRec ? (idxRec.spec || '') : (kwRec.spec || ''),
          score: kwScore,
          matchSource: 'keyword'
        });
      }
    }
    kwMatches.sort(function(a, b) { return b.score - a.score; });

    var fusedMap = {};
    for (var mi = 0; mi < matches.length; mi++) {
      var m = matches[mi];
      fusedMap[m.id] = { id: m.id, name: m.name, model: m.model, spec: m.spec, pinyinScore: m.score, kwScore: 0, details: m.details };
    }
    for (var kj = 0; kj < kwMatches.length; kj++) {
      var km = kwMatches[kj];
      if (fusedMap[km.id]) {
        fusedMap[km.id].kwScore = km.score;
      } else {
        fusedMap[km.id] = { id: km.id, name: km.name, model: km.model, spec: km.spec, pinyinScore: 0, kwScore: km.score, details: {} };
      }
    }

    var fusedResults = [];
    for (var fid in fusedMap) {
      var fr = fusedMap[fid];
      var pinyinWeight = 0.55;
      var kwWeight = 0.45;
      fr.fusedScore = fr.pinyinScore * pinyinWeight + fr.kwScore * kwWeight;
      fusedResults.push(fr);
    }
    fusedResults.sort(function(a, b) { return b.fusedScore - a.fusedScore; });

    if (fusedResults.length === 0) {
      return { matchId: null, status: 'error', matchType: 'none' };
    }

    var best = fusedResults[0];

    if (best.fusedScore >= 0.9) {
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
          var specMatch = sameNameProducts.find(function(p) {
            return p.spec && p.spec.toLowerCase().indexOf(specValue.toLowerCase()) !== -1;
          });
          if (specMatch) {
            return { matchId: specMatch.id, status: 'confirmed', matchType: 'sku' };
          }
        }
        return { matchId: best.id, status: 'pending', matchType: 'name' };
      }
      return { matchId: best.id, status: 'confirmed', matchType: best.fusedScore >= 0.95 ? 'exact' : 'name' };
    }

    if (fusedResults.length === 1 && best.fusedScore >= 0.8) {
      return { matchId: best.id, status: 'confirmed', matchType: 'name' };
    }
    if (best.fusedScore >= 0.7) {
      return { matchId: best.id, status: 'pending', matchType: 'name' };
    }
    if (fusedResults.length === 1 && best.fusedScore >= 0.4) {
      return { matchId: best.id, status: 'pending', matchType: 'name' };
    }
    if (fusedResults.length > 1 && best.fusedScore >= 0.4) {
      return { matchId: best.id, status: 'pending', matchType: 'name' };
    }
    return { matchId: null, status: 'error', matchType: 'none' };
  }

  function cleanInvalidEscapes(str) {
    return str.replace(/\\(?!["\\\/bfnrtu])/g, ' ');
  }

  function tryParseJSON(str) {
    try { return { obj: JSON.parse(str), cleaned: str }; } catch (e) {}
    var cleaned = cleanInvalidEscapes(str);
    try { return { obj: JSON.parse(cleaned), cleaned: cleaned }; } catch (e) {}
    return null;
  }

  function extractOrderJSON(text) {
    if (!text) return null;
    var r2 = tryParseJSON(text);
    if (r2 && r2.obj && (r2.obj.products || r2.obj['产品'] || r2.obj.items)) {
      return r2.cleaned;
    }
    var keyPatterns = [
      /"customer_name"\s*:/,
      /"customerName"\s*:/,
      /"customer"\s*:/,
      /"客户"\s*:/,
      /"doc_type"\s*:/
    ];
    for (var k = 0; k < keyPatterns.length; k++) {
      var keyMatch = text.match(keyPatterns[k]);
      if (!keyMatch) continue;
      var startIdx = text.lastIndexOf('{', keyMatch.index);
      if (startIdx === -1) continue;
      var depth = 0, inStr = false, esc = false;
      for (var i = startIdx; i < text.length; i++) {
        var ch = text[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) {
          var candidate = text.substring(startIdx, i + 1);
          var r = tryParseJSON(candidate);
          if (r && r.obj && (r.obj.products || r.obj['产品'] || r.obj.items)) {
            return r.cleaned;
          }
          break;
        }}
      }
    }
    var codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      var r3 = tryParseJSON(codeBlockMatch[1]);
      if (r3 && r3.obj && (r3.obj.products || r3.obj['产品'] || r3.obj.items)) {
        return r3.cleaned;
      }
    }
    return null;
  }

  function normalizeOrderJSON(jsonStr) {
    var obj = JSON.parse(jsonStr);
    if (obj.customerName !== undefined && obj.items) {
      return {
        customer: { originalName: obj.customerName || '', recv: obj.recv || '', addr: obj.addr || '' },
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
    if (obj.customer_name !== undefined && obj.products) {
      return {
        customer: { originalName: obj.customer_name || '', recv: obj.recv || '', addr: obj.addr || '' },
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
    if (obj['客户'] !== undefined && obj['产品']) {
      return {
        customer: { originalName: obj['客户'] || '', recv: obj.recv || obj['收件人'] || '', addr: obj.addr || obj['收货地址'] || '' },
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
    if (obj.customer !== undefined && obj.products) {
      return {
        customer: { originalName: obj.customer || '', recv: obj.recv || '', addr: obj.addr || '' },
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
    if (obj.products) {
      return {
        customer: { originalName: obj.customer || obj.customer_name || obj.customerName || obj['客户'] || '', recv: obj.recv || '', addr: obj.addr || '' },
        products: obj.products.map(function(item) {
          return {
            originalName: item.name || item.productName || item.product_name || item['品名'] || item['名称'] || '',
            model: item.model || item.sku || item['型号'] || '',
            qty: item.quantity || item.qty || item['数量'] || '',
            unit: item.unit || item['单位'] || '',
            price: item.unit_price || item.price || item['单价'] || '',
            spec: item.specification || item.spec || item['规格'] || '',
            amount: item.amount || item['金额'] || '',
            note: item.note || item.remark || item['备注'] || ''
          };
        })
      };
    }
    if (obj.items) {
      return {
        customer: { originalName: obj.customer || obj.customer_name || obj.customerName || obj['客户'] || '', recv: obj.recv || '', addr: obj.addr || '' },
        products: obj.items.map(function(item) {
          return {
            originalName: item.name || item.productName || item.product_name || item['品名'] || item['名称'] || '',
            model: item.model || item.sku || item['型号'] || '',
            qty: item.quantity || item.qty || item['数量'] || '',
            unit: item.unit || item['单位'] || '',
            price: item.unit_price || item.price || item['单价'] || '',
            spec: item.specification || item.spec || item['规格'] || '',
            amount: item.amount || item['金额'] || '',
            note: item.note || item.remark || item['备注'] || ''
          };
        })
      };
    }
    return obj;
  }

  async function matchProductsFromRawList(rawProducts) {
    var t0 = performance.now();
    var nameIndex = await getProductNameIndexCached();
    var productMap = await getProductMapCached();
    var products = await getProductsCached();
    var indexDb = await getProductIndexDbCached();
    var invertedIndex = await getTokenInvertedIndexCached();
    var kwCache = await getProductKeywordCache();
    var kwInvertedIndex = await getKeywordInvertedIndexCached();

    var precomputedPinyins = {};
    var precomputedKwTokens = {};
    rawProducts.forEach(function(p) {
      var pName = p.originalName || p.name || '';
      var pModel = p.model || '';
      var combinedParts = [pName];
      if (pModel && !isPlaceholder(pModel) && pName.toLowerCase().indexOf(pModel.toLowerCase()) === -1) {
        combinedParts.push(pModel);
      }
      var combinedName = combinedParts.join(' ');
      if (!precomputedPinyins[combinedName]) {
        precomputedPinyins[combinedName] = generatePinyinForText(combinedName);
      }
      if (!precomputedKwTokens[combinedName]) {
        precomputedKwTokens[combinedName] = tokenizeChinese(combinedName);
      }
    });
    var preTime = (performance.now() - t0).toFixed(1);
    console.log('[Index] matchProductsFromRawList: precomputed ' + Object.keys(precomputedPinyins).length + ' pinyins & keywords in ' + preTime + 'ms');

    var results = [];
    var exactCount = 0, fuzzyCount = 0;
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
      var matchedProduct = null;
      var matchType = 'none';
      var status = 'error';
      var matchId = null;
      var exactKey = combinedName.toLowerCase();
      if (nameIndex[exactKey] && nameIndex[exactKey].length > 0) {
        var candidates = nameIndex[exactKey];
        if (candidates.length === 1) {
          var cp = candidates[0];
          matchedProduct = { id: cp.id, name: cp.name, code: 'PRD-' + cp.id, sku: cp.model || '-', spec: cp.spec || '' };
          matchId = cp.id;
          matchType = 'exact';
          status = 'confirmed';
          exactCount++;
        } else {
          var modelMatches = candidates;
          if (pModel && !isPlaceholder(pModel)) {
            var modelExact = candidates.find(function(cp) {
              return cp.model && cp.model.toLowerCase() === pModel.toLowerCase();
            });
            if (modelExact) {
              modelMatches = candidates.filter(function(cp) {
                return cp.model && cp.model.toLowerCase() === pModel.toLowerCase();
              });
            }
          }
          if (modelMatches.length === 1) {
            var cp = modelMatches[0];
            matchedProduct = { id: cp.id, name: cp.name, code: 'PRD-' + cp.id, sku: cp.model || '-', spec: cp.spec || '' };
            matchId = cp.id;
            matchType = 'sku';
            status = 'confirmed';
            exactCount++;
          } else if (modelMatches.length > 1) {
            var specMatch = null;
            if (pSpec && !isPlaceholder(pSpec)) {
              specMatch = modelMatches.find(function(cp) {
                return cp.spec && cp.spec.toLowerCase().indexOf(pSpec.toLowerCase()) !== -1;
              });
            }
            if (specMatch) {
              matchedProduct = { id: specMatch.id, name: specMatch.name, code: 'PRD-' + specMatch.id, sku: specMatch.model || '-', spec: specMatch.spec || '' };
              matchId = specMatch.id;
              matchType = 'sku';
              status = 'confirmed';
              exactCount++;
            } else {
              var cp = modelMatches[0];
              matchedProduct = { id: cp.id, name: cp.name, code: 'PRD-' + cp.id, sku: cp.model || '-', spec: cp.spec || '' };
              matchId = cp.id;
              matchType = 'name';
              status = 'pending';
              exactCount++;
            }
          }
        }
      }
      if (!matchId) {
        var pinyinData = precomputedPinyins[combinedName];
        var asrFull = (pinyinData.full || '').toLowerCase();
        var asrAbbr = (pinyinData.abbr || '').toLowerCase();
        var asrFullTrunc = asrFull.substring(0, 120);
        var asrAbbrTrunc = asrAbbr.substring(0, 60);
        var queryTokens = tokenizePinyin(asrFull);
        var minOverlap = getMinOverlap(queryTokens.length);
        var candidateIndices = getCandidatesByTokenOverlap(queryTokens, invertedIndex, minOverlap);

        var queryKwTokens = precomputedKwTokens[combinedName] || tokenizeChinese(combinedName);
        var kwMinOverlap = queryKwTokens.length <= 2 ? 1 : Math.ceil(queryKwTokens.length * 0.3);
        var kwCandidateIndices = getKeywordCandidates(queryKwTokens, kwInvertedIndex, kwMinOverlap);

        var allCandSet = {};
        for (var aci = 0; aci < candidateIndices.length; aci++) {
          allCandSet[candidateIndices[aci]] = true;
        }
        for (var aki = 0; aki < kwCandidateIndices.length; aki++) {
          allCandSet[kwCandidateIndices[aki]] = true;
        }
        var mergedIndices = [];
        for (var aidx in allCandSet) {
          mergedIndices.push(parseInt(aidx, 10));
        }

        var kw = combinedName.toLowerCase();
        var matchCandidates = [];

        for (var jj = 0; jj < mergedIndices.length; jj++) {
          var record = indexDb[mergedIndices[jj]];
          var scores = {};
          if (record.name && record.name.toLowerCase() === kw) {
            scores.pinyin = 1; scores.abbr = 1; scores.wordBag = 1; scores.length = 1;
          } else if (record.name && record.name.toLowerCase().indexOf(kw) !== -1) {
            scores.pinyin = 0.95; scores.abbr = 0.9; scores.wordBag = 1; scores.length = 0.9;
          } else {
            var recordFull = (record.pinyin || '').toLowerCase().substring(0, 120);
            var recordAbbr = (record.pinyin_abbr || '').toLowerCase().substring(0, 60);
            scores.pinyin = calcStringSimilarity(asrFullTrunc, recordFull);
            scores.abbr = calcStringSimilarity(asrAbbrTrunc, recordAbbr);
            scores.wordBag = pinyinWordBagSimilarity(asrFullTrunc, recordFull);
            var maxLen = Math.max(asrFullTrunc.length, recordFull.length);
            var lenDiff = Math.abs(asrFullTrunc.length - recordFull.length);
            scores.length = maxLen > 0 ? Math.max(0, 1 - lenDiff / maxLen) : 1;
          }
          var pinyinScore = scores.pinyin * 0.35 + scores.abbr * 0.25 + scores.wordBag * 0.30 + scores.length * 0.10;

          var kwRec = kwCache[mergedIndices[jj]];
          var kwScore = kwRec ? keywordMatchScore(queryKwTokens, kwRec.keywords) : 0;

          var fusedScore = pinyinScore * 0.55 + kwScore * 0.45;

          if (fusedScore >= 0.45) {
            matchCandidates.push({ id: record.id, name: record.name, model: record.model || '', spec: record.spec || '', score: fusedScore, pinyinScore: pinyinScore, kwScore: kwScore });
          }
        }

        if (matchCandidates.length === 0 && minOverlap > 1) {
          var fallbackIndices = getCandidatesByTokenOverlap(queryTokens, invertedIndex, 1);
          for (var fj = 0; fj < fallbackIndices.length; fj++) {
            var frec = indexDb[fallbackIndices[fj]];
            var fscores = {};
            if (frec.name && frec.name.toLowerCase() === kw) {
              fscores.pinyin = 1; fscores.abbr = 1; fscores.wordBag = 1; fscores.length = 1;
            } else if (frec.name && frec.name.toLowerCase().indexOf(kw) !== -1) {
              fscores.pinyin = 0.95; fscores.abbr = 0.9; fscores.wordBag = 1; fscores.length = 0.9;
            } else {
              var frecordFull = (frec.pinyin || '').toLowerCase().substring(0, 120);
              var frecordAbbr = (frec.pinyin_abbr || '').toLowerCase().substring(0, 60);
              fscores.pinyin = calcStringSimilarity(asrFullTrunc, frecordFull);
              fscores.abbr = calcStringSimilarity(asrAbbrTrunc, frecordAbbr);
              fscores.wordBag = pinyinWordBagSimilarity(asrFullTrunc, frecordFull);
              var fmaxLen = Math.max(asrFullTrunc.length, frecordFull.length);
              var flenDiff = Math.abs(asrFullTrunc.length - frecordFull.length);
              fscores.length = fmaxLen > 0 ? Math.max(0, 1 - flenDiff / fmaxLen) : 1;
            }
            var fpinyinScore = fscores.pinyin * 0.35 + fscores.abbr * 0.25 + fscores.wordBag * 0.30 + fscores.length * 0.10;
            var fkwRec = kwCache[fallbackIndices[fj]];
            var fkwScore = fkwRec ? keywordMatchScore(queryKwTokens, fkwRec.keywords) : 0;
            var ffusedScore = fpinyinScore * 0.55 + fkwScore * 0.45;
            if (ffusedScore >= 0.45) {
              matchCandidates.push({ id: frec.id, name: frec.name, model: frec.model || '', spec: frec.spec || '', score: ffusedScore, pinyinScore: fpinyinScore, kwScore: fkwScore });
            }
          }
        }

        matchCandidates.sort(function(a, b) { return b.score - a.score; });
        if (matchCandidates.length > 0) {
          var best = matchCandidates[0];
          if (best.score >= 0.9) {
            var sameNameProducts = products.filter(function(prod) { return prod.name === best.name; });
            if (sameNameProducts.length > 1) {
              var modelMatches = sameNameProducts;
              if (pModel && !isPlaceholder(pModel)) {
                var modelExact = sameNameProducts.find(function(prod) {
                  return prod.model && prod.model.toLowerCase() === pModel.toLowerCase();
                });
                if (modelExact) {
                  modelMatches = sameNameProducts.filter(function(prod) {
                    return prod.model && prod.model.toLowerCase() === pModel.toLowerCase();
                  });
                }
              }
              if (modelMatches.length === 1) {
                matchId = modelMatches[0].id;
                matchType = 'sku';
                status = 'confirmed';
              } else if (!isPlaceholder(pSpec) && modelMatches.length > 1) {
                var specMatch = modelMatches.find(function(prod) {
                  return prod.spec && prod.spec.toLowerCase().indexOf(pSpec.toLowerCase()) !== -1;
                });
                if (specMatch) {
                  matchId = specMatch.id;
                  matchType = 'sku';
                  status = 'confirmed';
                } else {
                  matchId = best.id;
                  matchType = 'name';
                  status = 'pending';
                }
              } else {
                matchId = best.id;
                matchType = 'name';
                status = 'pending';
              }
            } else {
              matchId = best.id;
              matchType = best.score >= 0.95 ? 'exact' : 'name';
              status = 'confirmed';
            }
          } else if (matchCandidates.length === 1 && best.score >= 0.8) {
            matchId = best.id;
            matchType = 'name';
            status = 'confirmed';
          } else if (best.score >= 0.7 || (matchCandidates.length === 1 && best.score >= 0.4) || (matchCandidates.length > 1 && best.score >= 0.4)) {
            matchId = best.id;
            matchType = 'name';
            status = 'pending';
          }
          if (matchId) {
            var mp = productMap[String(matchId)];
            if (mp) {
              matchedProduct = { id: mp.id, name: mp.name, code: 'PRD-' + mp.id, sku: mp.model || '-', spec: mp.spec || '' };
            }
            fuzzyCount++;
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
        matchedId: matchId,
        matchedName: matchedProduct ? matchedProduct.name : '',
        matchedCode: matchedProduct ? matchedProduct.code : '',
        matchedSku: matchedProduct ? matchedProduct.sku : '',
        matchedSpec: matchedProduct ? matchedProduct.spec : '',
        matchType: matchType,
        status: status,
        qty: p.qty ? (String(p.qty) + (p.unit || '')) : '',
        price: p.price ? ('¥' + p.price) : '',
        spec: pSpec,
        note: p.note || ''
      });
    }
    var totalTime = performance.now() - t0;
    console.log('[Index] matchProductsFromRawList: ' + rawProducts.length + ' products in ' + totalTime.toFixed(1) + 'ms (exact=' + exactCount + ', fuzzy=' + fuzzyCount + ')');
    return results;
  }

  return {
    isPlaceholder: isPlaceholder,
    escapeHtml: escapeHtml,
    debounce: debounce,
    initDB: initDB,
    init: init,
    getStoreAsync: getStoreAsync,
    getCustomersAsync: getCustomersAsync,
    getProductsAsync: getProductsAsync,
    getCustomerPinyinAsync: getCustomerPinyinAsync,
    getProductPinyinAsync: getProductPinyinAsync,
    getProductsCached: getProductsCached,
    getCustomersCached: getCustomersCached,
    getProductIndexDbCached: getProductIndexDbCached,
    getCustomerIndexDbCached: getCustomerIndexDbCached,
    getProductMapCached: getProductMapCached,
    getProductNameIndexCached: getProductNameIndexCached,
    getCustomerMapCached: getCustomerMapCached,
    getTokenInvertedIndexCached: getTokenInvertedIndexCached,
    getCustomerTokenInvertedIndexCached: getCustomerTokenInvertedIndexCached,
    getProductKeywordCache: getProductKeywordCache,
    getKeywordInvertedIndexCached: getKeywordInvertedIndexCached,
    tokenizeChinese: tokenizeChinese,
    tokenizeProductForIndex: tokenizeProductForIndex,
    keywordMatchScore: keywordMatchScore,
    charOverlapRatio: charOverlapRatio,
    getKeywordCandidates: getKeywordCandidates,
    invalidateCache: invalidateCache,
    invalidateProductCache: invalidateProductCache,
    invalidateCustomerCache: invalidateCustomerCache,
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
    tokenizePinyin: tokenizePinyin,
    getMinOverlap: getMinOverlap,
    getCandidatesByTokenOverlap: getCandidatesByTokenOverlap,
    pinyinMatch: pinyinMatch,
    pinyinMatchWithCandidates: pinyinMatchWithCandidates,
    findProductFuzzyMatchFromLS: findProductFuzzyMatchFromLS,
    extractOrderJSON: extractOrderJSON,
    normalizeOrderJSON: normalizeOrderJSON,
    matchProductsFromRawList: matchProductsFromRawList
  };

})();
