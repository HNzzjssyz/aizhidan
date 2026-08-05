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

  function getStore(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
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

  function findProductFuzzyMatchFromLS(name, hasSpec, specValue, modelValue) {
    var products = getStore('pinyin_tool_products', []);
    var pp = getStore('pinyin_tool_product_pinyin', {});
    if (products.length === 0) {
      return { matchId: null, status: 'error', matchType: 'none' };
    }
    var indexDb = products.filter(function(p) { return pp[p.id]; }).map(function(p) {
      var py = pp[p.id];
      return { id: p.id, name: p.name, model: p.model || '', spec: p.spec || '', pinyin: py.pinyin, pinyin_abbr: py.pinyin_abbr };
    });

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
        customer: { originalName: obj.customerName },
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
        customer: { originalName: obj.customer_name },
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
        customer: { originalName: obj['客户'] },
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
        customer: { originalName: obj.customer },
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

  function matchProductsFromRawList(rawProducts) {
    return rawProducts.map(function(p) {
      var pName = p.originalName || p.name || '';
      var pModel = p.model || '';
      var pSpec = p.spec || '';
      var combinedParts = [pName];
      if (pModel && !isPlaceholder(pModel) && pName.toLowerCase().indexOf(pModel.toLowerCase()) === -1) {
        combinedParts.push(pModel);
      }
      var combinedName = combinedParts.join(' ');
      var hasSpec = !isPlaceholder(pSpec);
      var match = findProductFuzzyMatchFromLS(combinedName, hasSpec, String(pSpec), isPlaceholder(pModel) ? '' : pModel);
      var matchedProduct = null;
      if (match.matchId) {
        var lsProducts = getStore('pinyin_tool_products', []);
        for (var i = 0; i < lsProducts.length; i++) {
          if (String(lsProducts[i].id) === String(match.matchId)) {
            matchedProduct = {
              id: lsProducts[i].id,
              name: lsProducts[i].name,
              code: 'PRD-' + lsProducts[i].id,
              sku: lsProducts[i].model || '-',
              spec: lsProducts[i].spec || ''
            };
            break;
          }
        }
      }
      return {
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
      };
    });
  }

  return {
    isPlaceholder: isPlaceholder,
    escapeHtml: escapeHtml,
    debounce: debounce,
    getStore: getStore,
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
