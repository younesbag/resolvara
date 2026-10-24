/* eslint-disable @typescript-eslint/no-unused-vars */
/* Resolvara P0 spike: plain browser JS, no build step.
 * Privacy rule: results contain only key names, counts, ids, roles, timestamps,
 * tags and resolution-field values. Never ticket bodies, names or emails. */
(function () {
  'use strict';

  var VERSION = '0.1.0';
  var client = null;
  var clientInitError = null;
  try {
    client = ZAFClient.init();
  } catch (e) {
    clientInitError = String((e && e.message) || e);
  }

  var state = {
    resolutionFields: null, // [{id,title,type,options}] after api.ticketFields
    aiTicketIds: null, // number[] after api.aiTickets
    role: null
  };
  var results = {
    app: 'resolvara-zendesk-spike',
    version: VERSION,
    startedAt: new Date().toISOString(),
    checks: {}
  };

  // ---------- generic helpers ----------

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error((label || 'operation') + ' timed out after ' + ms + ' ms')); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function keysOf(o) {
    return o && typeof o === 'object' ? Object.keys(o).sort() : [];
  }

  function unionKeys(list) {
    var set = {};
    (list || []).forEach(function (o) { keysOf(o).forEach(function (k) { set[k] = true; }); });
    return Object.keys(set).sort();
  }

  function countBy(list, fn) {
    var out = {};
    (list || []).forEach(function (x) {
      var k = fn(x);
      k = k === undefined || k === null ? '(none)' : String(k);
      out[k] = (out[k] || 0) + 1;
    });
    return out;
  }

  function topN(obj, n) {
    var pairs = Object.keys(obj).map(function (k) { return [k, obj[k]]; });
    pairs.sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
    var out = {};
    pairs.slice(0, n).forEach(function (p) { out[p[0]] = p[1]; });
    return out;
  }

  function typeName(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  function safeStringify(v) {
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }

  function tryParse(s) {
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  function describeError(e) {
    if (e === undefined || e === null) return { message: 'unknown error' };
    if (typeof e === 'string') return { message: e };
    var out = {};
    if (e.status !== undefined) out.status = e.status;
    if (e.statusText) out.statusText = e.statusText;
    if (e.responseText) out.responseText = String(e.responseText).slice(0, 2000);
    else if (e.responseJSON) out.responseJSON = safeStringify(e.responseJSON).slice(0, 2000);
    if (e.name) out.name = e.name;
    if (e.message) out.message = String(e.message).slice(0, 2000);
    if (!Object.keys(out).length) out.raw = safeStringify(e).slice(0, 2000);
    return out;
  }

  var HEADER_RE = /rate|retry|limit|request-id|x-zendesk/i;

  function pickHeaders(h) {
    var out = {};
    if (!h) return out;
    if (typeof h === 'string') {
      h.split(/\r?\n/).forEach(function (line) {
        var i = line.indexOf(':');
        if (i > 0) {
          var k = line.slice(0, i).trim().toLowerCase();
          if (HEADER_RE.test(k)) out[k] = line.slice(i + 1).trim();
        }
      });
      return out;
    }
    if (typeof h === 'object') {
      Object.keys(h).forEach(function (k) {
        if (HEADER_RE.test(k)) out[k.toLowerCase()] = h[k];
      });
    }
    return out;
  }

  // Zendesk API call through ZAF. Never throws: returns {ok, status, json, headers, error}.
  async function zd(url, opts) {
    if (!client) {
      return { ok: false, error: { message: 'ZAFClient not available: ' + (clientInitError || 'SDK not loaded (open this app inside Zendesk)') }, headers: {} };
    }
    var req = Object.assign(
      { url: url, type: 'GET', dataType: 'json', httpCompleteResponse: true, autoRetry: false },
      opts || {}
    );
    var res;
    try {
      res = await client.request(req);
    } catch (e) {
      var hdrs = {};
      try { if (e && typeof e.getAllResponseHeaders === 'function') hdrs = pickHeaders(e.getAllResponseHeaders()); } catch (x) { /* ignore */ }
      if (e && e.headers) hdrs = Object.assign(hdrs, pickHeaders(e.headers));
      return { ok: false, status: e && e.status, error: describeError(e), headers: hdrs };
    }
    var complete = res && typeof res === 'object' && typeof res.status === 'number' && ('responseJSON' in res || 'responseText' in res);
    if (complete) {
      var json = res.responseJSON !== undefined && res.responseJSON !== null ? res.responseJSON : tryParse(res.responseText);
      return { ok: res.status >= 200 && res.status < 300, status: res.status, json: json, headers: pickHeaders(res.headers) };
    }
    return { ok: true, status: 200, json: res, headers: {}, headersNote: 'httpCompleteResponse not honoured; headers unavailable' };
  }

  function apiFail(label, r) {
    return { status: 'FAIL', summary: label + ' failed' + (r.status ? ' (HTTP ' + r.status + ')' : ''), details: { error: r.error, headers: r.headers } };
  }

  // ---------- worker helper ----------

  function runWorker(source, type, message, timeoutMs) {
    return new Promise(function (resolve) {
      var t0 = performance.now();
      var url = null;
      var worker = null;
      var done = false;
      function finish(r) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { if (worker) worker.terminate(); } catch (e) { /* ignore */ }
        try { if (url) URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        r.ms = Math.round(performance.now() - t0);
        resolve(r);
      }
      var timer = setTimeout(function () { finish({ ok: false, error: 'timeout after ' + timeoutMs + ' ms' }); }, timeoutMs);
      try {
        url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        worker = type === 'module' ? new Worker(url, { type: 'module' }) : new Worker(url);
        worker.onmessage = function (e) { finish({ ok: true, data: e.data }); };
        worker.onerror = function (e) {
          if (e && e.preventDefault) e.preventDefault();
          finish({ ok: false, error: 'worker error event: ' + ((e && e.message) || 'no message') });
        };
        worker.onmessageerror = function () { finish({ ok: false, error: 'messageerror' }); };
        worker.postMessage(message);
      } catch (e) {
        finish({ ok: false, error: (e && e.name ? e.name + ': ' : '') + String((e && e.message) || e) });
      }
    });
  }

  // Synthetic compute. Runs in a worker (via toString) or on the main thread as fallback.
  function syntheticCompute(n) {
    var t0 = performance.now();
    var seed = 12345;
    function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    var customersCount = Math.floor(n / 4);
    var base = 1700000000000;
    var convs = new Array(n);
    for (var i = 0; i < n; i++) {
      convs[i] = {
        id: i + 1,
        customer: 'c' + Math.floor(rnd() * customersCount),
        createdAt: base + Math.floor(rnd() * 90 * 86400000),
        reopens: rnd() < 0.1 ? 1 : 0,
        replies: Math.floor(rnd() * 4),
        tags: ['ai_agent', 't' + (i % 7)]
      };
    }
    var t1 = performance.now();
    var groups = new Map();
    for (var j = 0; j < n; j++) {
      var c = convs[j];
      var g = groups.get(c.customer);
      if (!g) { g = []; groups.set(c.customer, g); }
      g.push(c);
    }
    var t2 = performance.now();
    var arr = Array.from(groups.entries());
    arr.forEach(function (kv) { kv[1].sort(function (a, b) { return a.createdAt - b.createdAt; }); });
    arr.sort(function (a, b) { return b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1); });
    convs.sort(function (a, b) { return a.createdAt - b.createdAt || a.id - b.id; });
    var t3 = performance.now();
    var mem = null;
    try { if (performance.memory) mem = Math.round(performance.memory.usedJSHeapSize / 1048576); } catch (e) { /* ignore */ }
    return {
      conversations: convs.length,
      customers: groups.size,
      largestGroup: arr.length ? arr[0][1].length : 0,
      buildMs: Math.round(t1 - t0),
      groupMs: Math.round(t2 - t1),
      sortMs: Math.round(t3 - t2),
      totalMs: Math.round(t3 - t0),
      usedHeapMB: mem
    };
  }

  // ---------- checks ----------

  var RESOLUTION_RE = /resolution|channel group|ai/i;

  var checks = [];
  function add(id, title, desc, run, opts) {
    checks.push({ id: id, title: title, desc: desc, run: run, inRunAll: !(opts && opts.notInRunAll), danger: !!(opts && opts.danger) });
  }

  add('env', '1. env', 'User agent, isolation flags, memory, iframe sandbox hints.', async function () {
    var d = {
      userAgent: navigator.userAgent,
      crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : '(undefined)',
      deviceMemoryGB: navigator.deviceMemory !== undefined ? navigator.deviceMemory : '(unsupported)',
      hardwareConcurrency: navigator.hardwareConcurrency,
      inIframe: window.self !== window.top,
      origin: window.origin,
      opaqueOrigin: window.origin === 'null',
      protocol: location.protocol,
      hostIsZdUserContent: /zdusercontent|zendesk/i.test(location.hostname),
      hasWorker: typeof Worker !== 'undefined',
      hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      hasIndexedDB: typeof indexedDB !== 'undefined',
      hasClipboardApi: !!(navigator.clipboard && navigator.clipboard.writeText),
      hasBlobUrl: typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
    };
    try {
      d.frameElementAccessible = window.frameElement !== null;
      if (window.frameElement) {
        d.sandboxAttr = window.frameElement.getAttribute('sandbox');
        d.allowAttr = window.frameElement.getAttribute('allow');
      }
    } catch (e) {
      d.frameElementAccessible = false;
      d.frameElementError = (e && e.name) || String(e);
    }
    try { d.ancestorOrigins = location.ancestorOrigins ? Array.prototype.slice.call(location.ancestorOrigins) : '(unsupported)'; } catch (e) { d.ancestorOrigins = '(error)'; }
    try {
      if (performance.memory) d.jsHeapLimitMB = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
    } catch (e) { /* ignore */ }
    try {
      if (navigator.storage && navigator.storage.estimate) {
        var est = await navigator.storage.estimate();
        d.storageQuotaMB = Math.round(est.quota / 1048576);
        d.storageUsageMB = Math.round(est.usage / 1048576);
      }
    } catch (e) { d.storageEstimateError = (e && e.name) || String(e); }
    if (client) {
      try {
        var ctx = await withTimeout(client.context(), 5000, 'client.context');
        d.zafLocation = ctx && ctx.location;
        d.zafProduct = ctx && ctx.product;
      } catch (e) { d.zafContextError = describeError(e); }
      try {
        var meta = await withTimeout(client.metadata(), 5000, 'client.metadata');
        d.zafAppId = meta && meta.appId;
        d.zafIsInstalled = meta && meta.installationId !== undefined;
      } catch (e) { d.zafMetadataError = describeError(e); }
    } else {
      d.zafClient = 'not available: ' + (clientInitError || 'SDK not loaded');
    }
    return { status: client ? 'PASS' : 'WARN', summary: (d.opaqueOrigin ? 'opaque origin (sandbox without allow-same-origin). ' : 'origin ' + d.origin + '. ') + 'deviceMemory=' + d.deviceMemoryGB + ' GB, cores=' + d.hardwareConcurrency, details: d };
  });

  add('worker', '2. worker', 'Web Worker from a Blob URL (classic and module).', async function () {
    var classicSrc = 'self.onmessage=function(e){self.postMessage({echo:e.data,hasFetch:typeof fetch,hasIDB:typeof indexedDB})};';
    var moduleSrc = 'self.onmessage=(e)=>{self.postMessage({echo:e.data,isModule:true,hasFetch:typeof fetch})};';
    var classic = await runWorker(classicSrc, 'classic', { hello: 'classic' }, 5000);
    var mod = await runWorker(moduleSrc, 'module', { hello: 'module' }, 5000);
    var ok = classic.ok;
    return {
      status: ok && mod.ok ? 'PASS' : ok ? 'WARN' : 'FAIL',
      summary: 'classic blob worker: ' + (classic.ok ? 'ok' : 'failed') + '; module blob worker: ' + (mod.ok ? 'ok' : 'failed'),
      details: { classic: classic, module: mod }
    };
  });

  add('compute', '3. memory/compute', '200,000 synthetic conversations: build, group by customer, sort, in a worker.', async function () {
    var N = 200000;
    var src = 'var compute=' + syntheticCompute.toString() + ';self.onmessage=function(e){self.postMessage(compute(e.data.n))};';
    var ticks = 0;
    var ticker = setInterval(function () { ticks++; }, 50);
    var t0 = performance.now();
    var w = await runWorker(src, 'classic', { n: N }, 90000);
    var elapsed = performance.now() - t0;
    clearInterval(ticker);
    var details = {
      requested: N,
      worker: w,
      mainThreadTicks: ticks,
      mainThreadTicksExpected: Math.round(elapsed / 50),
      mainThreadStayedResponsive: ticks >= 0.5 * (elapsed / 50)
    };
    if (w.ok) {
      return { status: 'PASS', summary: w.data.conversations + ' conversations, ' + w.data.customers + ' customers, worker total ' + w.data.totalMs + ' ms', details: details };
    }
    // Fallback: main thread, to learn whether the compute fits at all.
    var t1 = performance.now();
    try {
      details.mainThreadFallback = syntheticCompute(N);
      details.mainThreadFallbackWallMs = Math.round(performance.now() - t1);
      return { status: 'WARN', summary: 'worker failed (' + w.error + '); main-thread fallback completed in ' + details.mainThreadFallbackWallMs + ' ms', details: details };
    } catch (e) {
      details.mainThreadFallbackError = describeError(e);
      return { status: 'FAIL', summary: 'worker failed and main-thread fallback failed', details: details };
    }
  });

  add('download', '4. download', 'Blob CSV + <a download> click. Confirm manually that a file "resolvara-spike-test.csv" appeared.', async function () {
    var rows = ['id,flag,note'];
    for (var i = 1; i <= 5; i++) rows.push(i + ',synthetic,row ' + i);
    var d = { anchorDownloadSupported: 'download' in HTMLAnchorElement.prototype };
    try {
      var blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'resolvara-spike-test.csv';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      d.exception = null;
      d.manualConfirmationNeeded = 'Check your browser downloads for resolvara-spike-test.csv (5 rows).';
      return { status: 'PASS', summary: 'no exception thrown. MANUAL: confirm the file actually downloaded.', details: d };
    } catch (e) {
      d.exception = describeError(e);
      return { status: 'FAIL', summary: 'exception while triggering download', details: d };
    }
  });

  add('storage', '5. storage', 'IndexedDB open/write/read/delete and localStorage set/get/remove.', async function () {
    var out = { indexedDB: {}, localStorage: {} };
    try {
      var t0 = performance.now();
      var r = await withTimeout(new Promise(function (resolve, reject) {
        var name = 'resolvara_spike_db';
        var open = indexedDB.open(name, 1);
        open.onupgradeneeded = function () { open.result.createObjectStore('kv'); };
        open.onerror = function () { reject(open.error); };
        open.onblocked = function () { reject(new Error('open blocked')); };
        open.onsuccess = function () {
          var db = open.result;
          var tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ v: 1, payload: new Array(1001).join('x') }, 'k');
          tx.onerror = function () { reject(tx.error); };
          tx.oncomplete = function () {
            var g = db.transaction('kv', 'readonly').objectStore('kv').get('k');
            g.onerror = function () { reject(g.error); };
            g.onsuccess = function () {
              var val = g.result;
              var tx3 = db.transaction('kv', 'readwrite');
              tx3.objectStore('kv').delete('k');
              tx3.onerror = function () { reject(tx3.error); };
              tx3.oncomplete = function () {
                db.close();
                var del = indexedDB.deleteDatabase(name);
                del.onsuccess = function () { resolve({ readBack: !!(val && val.v === 1) }); };
                del.onerror = function () { resolve({ readBack: !!(val && val.v === 1), deleteDbError: String(del.error) }); };
                del.onblocked = function () { resolve({ readBack: !!(val && val.v === 1), deleteDbBlocked: true }); };
              };
            };
          };
        };
      }), 8000, 'IndexedDB test');
      out.indexedDB = { ok: !!r.readBack, ms: Math.round(performance.now() - t0), info: r };
    } catch (e) {
      out.indexedDB = { ok: false, error: describeError(e) };
    }
    try {
      localStorage.setItem('resolvara_spike', 'ok');
      var v = localStorage.getItem('resolvara_spike');
      localStorage.removeItem('resolvara_spike');
      out.localStorage = { ok: v === 'ok' };
    } catch (e) {
      out.localStorage = { ok: false, error: describeError(e) };
    }
    var both = out.indexedDB.ok && out.localStorage.ok;
    var none = !out.indexedDB.ok && !out.localStorage.ok;
    return { status: both ? 'PASS' : none ? 'FAIL' : 'WARN', summary: 'indexedDB ' + (out.indexedDB.ok ? 'ok' : 'FAILED') + ', localStorage ' + (out.localStorage.ok ? 'ok' : 'FAILED'), details: out };
  });

  add('api.me', '6. api.me', 'GET /api/v2/users/me.json: role (admin needed for incremental export).', async function () {
    var r = await zd('/api/v2/users/me.json');
    if (!r.ok) return apiFail('users/me', r);
    var u = (r.json && r.json.user) || {};
    state.role = u.role || null;
    var d = {
      role: u.role,
      role_type: u.role_type,
      custom_role_id: u.custom_role_id,
      active: u.active,
      suspended: u.suspended,
      user_keys: keysOf(u),
      headers: r.headers
    };
    var admin = u.role === 'admin';
    return { status: admin ? 'PASS' : 'WARN', summary: 'role = ' + u.role + (admin ? '' : ' (incremental export needs admin; expect 403)'), details: d };
  });

  add('api.ticketFields', '7. api.ticketFields', 'GET /api/v2/ticket_fields.json: fields matching /resolution|channel group|ai/i.', async function () {
    var r = await zd('/api/v2/ticket_fields.json');
    if (!r.ok) return apiFail('ticket_fields', r);
    var fields = (r.json && r.json.ticket_fields) || [];
    var matched = fields.filter(function (f) { return RESOLUTION_RE.test(f.title || '') || RESOLUTION_RE.test(f.raw_title || ''); });
    var list = matched.map(function (f) {
      return {
        id: f.id,
        title: f.title,
        type: f.type,
        active: f.active,
        removable: f.removable,
        custom_field_options: (f.custom_field_options || []).map(function (o) { return { name: o.name, value: o.value }; }),
        system_field_options: f.system_field_options ? f.system_field_options.map(function (o) { return o.name; }) : undefined
      };
    });
    // Narrower hint for later checks: fields whose title looks like the AI resolution fields.
    state.resolutionFields = list.filter(function (f) { return /resolution|channel group/i.test(f.title || ''); });
    return {
      status: 'PASS',
      summary: fields.length + ' ticket fields total; ' + list.length + ' match; ' + state.resolutionFields.length + ' look like resolution/channel-group fields',
      details: { totalFields: fields.length, matched: list, headers: r.headers }
    };
  });

  async function fetchIncremental(scope, label) {
    var start = Math.floor(Date.now() / 1000) - 90 * 86400;
    var url = '/api/v2/incremental/tickets/cursor.json?start_time=' + start;
    if (scope) url += '&support_type_scope=' + scope;
    if (scope === 'ai_agent') url += '&include=metric_sets';
    url += '&per_page=100';
    var r = await zd(url);
    r.url = url.replace(/start_time=\d+/, 'start_time=<now-90d>');
    r.label = label;
    return r;
  }

  add('api.aiTickets', '8. api.aiTickets', 'Incremental export, last 90 days, support_type_scope=ai_agent, include=metric_sets, per_page=100. Needs admin; 10 req/min.', async function () {
    if (state.resolutionFields === null) { await runCheckById('api.ticketFields', true); }
    var r = await fetchIncremental('ai_agent', 'ai');
    if (!r.ok) {
      var f = apiFail('incremental AI tickets', r);
      f.details.url = r.url;
      return f;
    }
    var body = r.json || {};
    var tickets = body.tickets || [];
    var metricSets = body.metric_sets || [];
    var resIds = (state.resolutionFields || []).map(function (f) { return f.id; });
    state.aiTicketIds = tickets.map(function (t) { return t.id; });

    function metricFor(t) {
      if (t.metric_set) return t.metric_set;
      for (var i = 0; i < metricSets.length; i++) if (metricSets[i].ticket_id === t.id) return metricSets[i];
      return null;
    }

    var resolutionValueCounts = {};
    tickets.forEach(function (t) {
      (t.custom_fields || []).forEach(function (cf) {
        if (resIds.indexOf(cf.id) !== -1) {
          var k = cf.id + '=' + (cf.value === null ? 'null' : safeStringify(cf.value));
          resolutionValueCounts[k] = (resolutionValueCounts[k] || 0) + 1;
        }
      });
    });
    var tagCounts = {};
    tickets.forEach(function (t) { (t.tags || []).forEach(function (tag) { tagCounts[tag] = (tagCounts[tag] || 0) + 1; }); });

    var first = tickets.slice(0, 3).map(function (t) {
      var ms = metricFor(t);
      var cfs = t.custom_fields || [];
      return {
        id: t.id,
        keys: keysOf(t),
        via: t.via ? { channel: t.via.channel, sourceKeys: keysOf(t.via.source) } : null,
        status: t.status,
        tags: t.tags || [],
        metric_set_keys: ms ? keysOf(ms) : null,
        metric_set_reopens: ms ? ms.reopens : undefined,
        metric_set_replies: ms ? ms.replies : undefined,
        resolution_fields: cfs.filter(function (cf) { return resIds.indexOf(cf.id) !== -1; }).map(function (cf) { return { id: cf.id, value: cf.value }; }),
        other_custom_fields_id_and_value_type: cfs.filter(function (cf) { return resIds.indexOf(cf.id) === -1; }).map(function (cf) { return { id: cf.id, valueType: typeName(cf.value) }; })
      };
    });

    var d = {
      url: r.url,
      httpStatus: r.status,
      count: tickets.length,
      responseTopLevelKeys: keysOf(body),
      end_of_stream: body.end_of_stream,
      hasAfterCursor: !!body.after_cursor,
      hasAfterUrl: !!body.after_url,
      metricSetsSideloaded: metricSets.length,
      ticketKeysUnion: unionKeys(tickets),
      viaChannelCounts: countBy(tickets, function (t) { return t.via && t.via.channel; }),
      statusCounts: countBy(tickets, function (t) { return t.status; }),
      resolutionFieldIdsUsed: resIds,
      resolutionValueCounts: resolutionValueCounts,
      topTags: topN(tagCounts, 15),
      firstThree: first,
      rateLimitHeaders: r.headers,
      headersNote: r.headersNote
    };
    var summary = tickets.length + ' AI-agent tickets in first page' + (body.end_of_stream ? ' (end of stream)' : ' (more pages)');
    return { status: 'PASS', summary: summary, details: d };
  });

  add('api.normalTickets', '9. api.normalTickets', 'Same export without support_type_scope: count and key names only.', async function () {
    var r = await fetchIncremental(null, 'normal');
    if (!r.ok) {
      var f = apiFail('incremental normal tickets', r);
      f.details.url = r.url;
      return f;
    }
    var body = r.json || {};
    var tickets = body.tickets || [];
    var d = {
      url: r.url,
      httpStatus: r.status,
      count: tickets.length,
      end_of_stream: body.end_of_stream,
      hasAfterCursor: !!body.after_cursor,
      responseTopLevelKeys: keysOf(body),
      ticketKeysUnion: unionKeys(tickets),
      viaChannelCounts: countBy(tickets, function (t) { return t.via && t.via.channel; }),
      overlapWithAiTicketIdsOnThisPage: state.aiTicketIds ? tickets.filter(function (t) { return state.aiTicketIds.indexOf(t.id) !== -1; }).length : '(ai check not run)',
      rateLimitHeaders: r.headers,
      headersNote: r.headersNote
    };
    return { status: 'PASS', summary: tickets.length + ' normal tickets in first page' + (body.end_of_stream ? ' (end of stream)' : ' (more pages)'), details: d };
  });

  add('api.ratings', '10. api.ratings', 'GET /api/v2/satisfaction_ratings.json?per_page=10: count and key names.', async function () {
    var r = await zd('/api/v2/satisfaction_ratings.json?per_page=10');
    if (!r.ok) return apiFail('satisfaction_ratings', r);
    var body = r.json || {};
    var ratings = body.satisfaction_ratings || [];
    return {
      status: 'PASS',
      summary: ratings.length + ' ratings returned',
      details: {
        count: ratings.length,
        responseTopLevelKeys: keysOf(body),
        ratingKeysUnion: unionKeys(ratings),
        scoreCounts: countBy(ratings, function (x) { return x.score; }),
        hasMore: !!(body.meta && body.meta.has_more) || !!body.next_page,
        headers: r.headers
      }
    };
  });

  add('api.comments', '11. api.comments', 'Comment author roles in order for the first AI ticket (no bodies).', async function () {
    if (state.aiTicketIds === null) { await runCheckById('api.aiTickets', true); }
    if (!state.aiTicketIds || !state.aiTicketIds.length) {
      return { status: 'SKIP', summary: 'no AI-agent ticket available (check 8 returned none or failed)', details: {} };
    }
    var ticketId = state.aiTicketIds[0];
    var r = await zd('/api/v2/tickets/' + ticketId + '/comments.json');
    if (!r.ok) {
      var f = apiFail('ticket comments', r);
      f.details.ticketId = ticketId;
      return f;
    }
    var comments = (r.json && r.json.comments) || [];
    var uniqueAuthors = [];
    comments.forEach(function (c) { if (uniqueAuthors.indexOf(c.author_id) === -1) uniqueAuthors.push(c.author_id); });
    var roles = {};
    var userKeys = null;
    var lookupErrors = {};
    var lookups = uniqueAuthors.slice(0, 8);
    for (var i = 0; i < lookups.length; i++) {
      var id = lookups[i];
      var ur = await zd('/api/v2/users/' + id + '.json');
      if (ur.ok && ur.json && ur.json.user) {
        roles[id] = ur.json.user.role;
        if (!userKeys) userKeys = keysOf(ur.json.user);
      } else {
        roles[id] = 'lookup_failed';
        lookupErrors[id] = ur.error;
      }
    }
    var ordered = comments.map(function (c, idx) {
      return {
        i: idx,
        author_id: c.author_id,
        role: roles[c.author_id] || (uniqueAuthors.indexOf(c.author_id) >= 8 ? 'not_looked_up' : 'unknown'),
        created_at: c.created_at,
        public: c.public,
        type: c.type,
        via_channel: c.via && c.via.channel
      };
    });
    return {
      status: 'PASS',
      summary: 'ticket ' + ticketId + ': ' + comments.length + ' comments, role sequence ' + ordered.map(function (o) { return o.role; }).join(' > '),
      details: {
        ticketId: ticketId,
        commentCount: comments.length,
        commentKeysUnion: unionKeys(comments),
        uniqueAuthors: uniqueAuthors.length,
        userKeys: userKeys,
        lookupErrors: lookupErrors,
        orderedComments: ordered,
        headers: r.headers
      }
    };
  });

  var seedArmed = false;
  add('seed', '12. seed (manual only, not in "Run all")', 'Creates 5 test tickets (requester test+N@example.com, subject "Resolvara test ticket N", tag resolvara_spike). Click twice to confirm.', async function () {
    var created = [];
    var errors = [];
    for (var n = 1; n <= 5; n++) {
      var payload = {
        ticket: {
          subject: 'Resolvara test ticket ' + n,
          comment: { body: 'Synthetic test ticket ' + n + ' created by the Resolvara P0 spike. Safe to delete.' },
          requester: { name: 'Resolvara Test ' + n, email: 'test+' + n + '@example.com' },
          tags: ['resolvara_spike']
        }
      };
      var r = await zd('/api/v2/tickets.json', { type: 'POST', contentType: 'application/json', data: JSON.stringify(payload) });
      if (r.ok && r.json && r.json.ticket) created.push(r.json.ticket.id);
      else errors.push({ n: n, status: r.status, error: r.error });
    }
    return {
      status: errors.length ? (created.length ? 'WARN' : 'FAIL') : 'PASS',
      summary: 'created ' + created.length + '/5 test tickets: ids ' + (created.join(', ') || '(none)'),
      details: { createdIds: created, errors: errors }
    };
  }, { notInRunAll: true, danger: true });

  // ---------- runner + UI ----------

  var ui = {};
  var running = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function buildUi() {
    ui.checks = document.getElementById('checks');
    ui.json = document.getElementById('json-out');
    ui.note = document.getElementById('toolbar-note');
    ui.runAll = document.getElementById('run-all');
    ui.copy = document.getElementById('copy-json');
    ui.rows = {};

    checks.forEach(function (c) {
      var box = el('div', 'check');
      var head = el('div', 'check-head');
      var title = el('div', 'check-title', c.title);
      title.appendChild(el('small', '', c.desc));
      var badge = el('span', 'badge idle', 'IDLE');
      var btn = el('button', c.danger ? 'danger' : '', c.danger ? 'Create 5 test tickets' : 'Run');
      btn.type = 'button';
      head.appendChild(title);
      head.appendChild(badge);
      head.appendChild(btn);
      var summary = el('p', 'summary', '');
      var det = document.createElement('details');
      det.appendChild(el('summary', '', 'Details (JSON)'));
      var pre = el('pre', '', '');
      det.appendChild(pre);
      det.hidden = true;
      box.appendChild(head);
      box.appendChild(summary);
      box.appendChild(det);
      ui.checks.appendChild(box);
      ui.rows[c.id] = { badge: badge, btn: btn, summary: summary, det: det, pre: pre };

      btn.addEventListener('click', function () {
        if (running) return;
        if (c.danger) {
          if (!seedArmed) {
            seedArmed = true;
            btn.textContent = 'Click again to create 5 tickets';
            setTimeout(function () { seedArmed = false; btn.textContent = 'Create 5 test tickets'; }, 8000);
            return;
          }
          seedArmed = false;
          btn.textContent = 'Create 5 test tickets';
        }
        runOne(c.id);
      });
    });

    ui.runAll.addEventListener('click', runAll);
    ui.copy.addEventListener('click', copyJson);
    refreshJson();
  }

  function setBadge(row, status) {
    var cls = status === 'PASS' ? 'pass' : status === 'FAIL' ? 'fail' : status === 'WARN' ? 'warn' : status === 'SKIP' ? 'skip' : status === 'RUNNING' ? 'run' : 'idle';
    row.badge.className = 'badge ' + cls;
    row.badge.textContent = status;
  }

  function setBusy(busy) {
    running = busy;
    ui.runAll.disabled = busy;
    Object.keys(ui.rows).forEach(function (k) { ui.rows[k].btn.disabled = busy; });
  }

  function refreshJson() {
    ui.json.value = JSON.stringify(results, null, 2);
  }

  function findCheck(id) {
    for (var i = 0; i < checks.length; i++) if (checks[i].id === id) return checks[i];
    return null;
  }

  // Core execution of one check; updates UI and results. quiet = prerequisite run.
  async function runCheckById(id, quiet) {
    var c = findCheck(id);
    var row = ui.rows[id];
    setBadge(row, 'RUNNING');
    row.summary.textContent = quiet ? 'running as prerequisite...' : 'running...';
    var t0 = performance.now();
    var out;
    try {
      out = await c.run();
    } catch (e) {
      out = { status: 'FAIL', summary: 'unexpected exception', details: { error: describeError(e), stack: e && e.stack ? String(e.stack).split('\n').slice(0, 4) : undefined } };
    }
    out.ms = Math.round(performance.now() - t0);
    results.checks[id] = { status: out.status, ms: out.ms, summary: out.summary, details: out.details, finishedAt: new Date().toISOString() };
    setBadge(row, out.status);
    row.summary.textContent = out.summary + ' (' + out.ms + ' ms)';
    row.pre.textContent = JSON.stringify(out.details, null, 2);
    row.det.hidden = false;
    refreshJson();
    return out;
  }

  async function runOne(id) {
    setBusy(true);
    try { await runCheckById(id, false); } finally { setBusy(false); }
  }

  async function runAll() {
    if (running) return;
    setBusy(true);
    ui.note.textContent = 'Running...';
    try {
      for (var i = 0; i < checks.length; i++) {
        if (!checks[i].inRunAll) continue;
        ui.note.textContent = 'Running ' + checks[i].title + '...';
        await runCheckById(checks[i].id, false);
        await sleep(100);
      }
      var counts = countBy(Object.keys(results.checks).map(function (k) { return results.checks[k]; }), function (x) { return x.status; });
      ui.note.textContent = 'Done: ' + safeStringify(counts);
    } finally {
      setBusy(false);
    }
  }

  async function copyJson() {
    var text = JSON.stringify(results, null, 2);
    ui.json.value = text;
    var ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (e) { ok = false; }
    if (!ok) {
      try {
        ui.json.focus();
        ui.json.select();
        ok = document.execCommand('copy');
      } catch (e) { ok = false; }
    }
    ui.note.textContent = ok ? 'Results JSON copied.' : 'Copy blocked here. The JSON is selected in the box below: press Ctrl/Cmd+C.';
    if (!ok) { ui.json.focus(); ui.json.select(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUi);
  else buildUi();
})();
