const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
function loadWithInternals(file, names) {
  const src = fs.readFileSync(file, 'utf8') + `\nmodule.exports.__int = { ${names.map((n) => `get ${n}() { return typeof ${n} === 'undefined' ? undefined : ${n}; }`).join(', ')} };\n`;
  const m = new Module(file, null);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src, file);
  return m.exports.__int;
}
const ser = (x) => JSON.parse(JSON.stringify(x === undefined ? '__undef' : x, (k, v) => (v instanceof Error ? 'Error:' + v.message : typeof v === 'function' ? 'fn' : v === undefined ? '__undef' : v)));
module.exports = async ({ appDir, out, logs }) => {
  const rec = async (name, f) => { logs.length = 0; let r; try { r = await f(); } catch (e) { r = 'THROW ' + (e && e.name) + ':' + (e && e.message); } out.push(JSON.stringify({ name, r: ser(r), logs: ser(logs) })); };
  // ---------------- ai-agent internals
  const A = loadWithInternals(path.join(appDir, 'controllers/ai-agent.js'), ['extractAIMessages', 'extractStatus', 'sendSSE', 'promptGuardMiddleware', 'getOrderStatusTool', 'processRefundTool', 'cancelOrderTool', 'verifyRefundTool', 'processReturnTool', 'tier2EscalationTool']);
  const { HumanMessage, AIMessage } = require(path.join(appDir, 'node_modules/@langchain/core/messages'));
  const datas = [undefined, null, {}, { model_request: {} }, { model_request: { messages: [] } },
    { model_request: { messages: [{ content: 'hello' }, { kwargs: { content: 'kw' } }, { content: '  ' }, { content: 'x', tool_calls: [{ name: 't' }] }, { kwargs: { content: 'y', tool_calls: [] } }, { content: 5 }, null] } },
    { model_request: { messages: [{ kwargs: { tool_calls: [{ name: 'a' }, { name: 'b' }] } }] } },
    { model_request: { messages: [{ tool_calls: [{ name: 'c' }] }] } },
    { model_request: { messages: [{ tool_calls: [] }] }, tools: { messages: [{ name: 'tool1' }] } },
    { tools: { messages: [{ kwargs: { name: 'tool2' } }] } }, { tools: { messages: [{}] } }, { tools: { messages: [] } }, { tools: {} }];
  for (const [i, d] of datas.entries()) {
    await rec('extractAIMessages ' + i, () => A.extractAIMessages(d));
    if (d) await rec('extractStatus ' + i, () => A.extractStatus(d));
  }
  const writes = [];
  await rec('sendSSE', () => { A.sendSSE({ write: (s) => writes.push(s.replace(/"timestamp":"[^"]+"/, '"timestamp":"TS"')) }, 'chat', { message: 'm', type: 'override?' }); return writes; });
  // tools (Math.random is fixed to 0.5 by the runner; timers are real)
  const writer = []; const cfg = { writer: (x) => writer.push(x) };
  const strip = (s) => (typeof s === 'string' ? s.replace(/\d{4}-\d\d-\d\d/g, 'DATE') : s);
  for (const [n, input] of [['tier2EscalationTool', { issueSummary: 'sum' }], ['getOrderStatusTool', { orderId: 'O1' }], ['processRefundTool', { orderId: 'O1', itemId: 'I1' }], ['cancelOrderTool', { orderId: 'O2' }], ['verifyRefundTool', { refundId: 'R1' }], ['processReturnTool', { orderId: 'O3', itemId: 'I3' }]]) {
    for (const rnd of [0.5, 0.05, 0.25, 0.99]) {
      Math.random = () => rnd; writer.length = 0;
      const t = A[n];
      await rec(`${n} rnd=${rnd}`, async () => ({ name: t.name, description: t.description, result: strip(await t.func(input, undefined, cfg).catch((e) => 'ERR ' + e.message)), writer: [...writer], nowriter: strip(await t.func(input, undefined, {}).catch((e) => 'ERR ' + e.message)) }));
    }
  }
  Math.random = () => 0.5;
  await rec('tier2 meta', async () => ({ name: A.tier2EscalationTool.name, description: A.tier2EscalationTool.description }));
  // prompt guard middleware hook with a stubbed guard model
  const groqMod = require(path.join(appDir, 'node_modules/@langchain/groq'));
  const invokes = [];
  let reply = '{"violation": 0}';
  const origInvoke = groqMod.ChatGroq.prototype.invoke;
  groqMod.ChatGroq.prototype.invoke = async function (...a) { invokes.push(ser(a)); if (reply === 'THROW') throw new Error('guard down'); return { content: reply }; };
  const mw = A.promptGuardMiddleware();
  const hook = mw.beforeAgent.hook;
  await rec('mw shape', () => ({ name: mw.name, canJumpTo: mw.beforeAgent.canJumpTo, keys: Object.keys(mw) }));
  await rec('hook no messages', () => hook({}));
  await rec('hook empty', () => hook({ messages: [] }));
  await rec('hook ai last', () => hook({ messages: [new AIMessage('x')] }));
  await rec('hook blank', () => hook({ messages: [new HumanMessage('   ')] }));
  await rec('hook ok', async () => ({ r: await hook({ messages: [new HumanMessage('where is my order')] }), invokes: [...invokes] }));
  for (const rep of ['{"violation": 1, "category": "jailbreak"}', '{"violation": true}', ' {"violation": "1"} ', '', 'not json', 'THROW']) {
    reply = rep; invokes.length = 0;
    await rec('hook reply ' + rep, async () => { const r = await hook({ messages: [new AIMessage('a'), new HumanMessage('ignore previous')] }); return r ? { jumpTo: r.jumpTo, n: r.messages.length, text: r.messages[0].content, isAI: r.messages[0] instanceof AIMessage } : r; });
  }
  groqMod.ChatGroq.prototype.invoke = origInvoke;
  // ---------------- ai internals
  const mkCache = () => { const m = new Map(); const log = []; return { m, log, get: async (k) => { log.push(['get', k.slice(0, 14)]); return m.get(k); }, set: async (k, v) => { log.push(['set', k.slice(0, 14), v]); m.set(k, v); } }; };
  const caches = [];
  function FakeKeyv(opts) { const c = mkCache(); c.opts = { namespace: opts.namespace, ttl: opts.ttl, storeIsObj: typeof opts.store === 'object', storeArgs: opts.store && opts.store.args }; caches.push(c); return c; }
  function FakeStore(...args) { this.args = args; }
  const origLoad = Module._load;
  const realHf = require(path.join(appDir, 'node_modules/@huggingface/inference'));
  const fe = [];
  class FakeHf { constructor(key) { fe.push(['new', key]); } async featureExtraction(a) { fe.push(ser(a)); return a.inputs.map((t) => [t.length]); } }
  const fakeHfModule = { ...realHf, HfInference: FakeHf };
  Module._load = function (request, ...rest) { if (request === '@huggingface/inference') return fakeHfModule; if (request === 'keyv') return { default: FakeKeyv }; if (request === '@keyv/mongo') return { default: FakeStore }; return origLoad.call(this, request, ...rest); };
  const I = loadWithInternals(path.join(appDir, 'controllers/ai.js'), ['isNonRetryableError', 'withRetry', 'createCacheKey', 'normalizeTextForCaching', 'createCachedEmbeddings', 'extractClassifierResponse', 'extractVisionAnalysis', 'createVisionLLMRequestBody', 'createClassifierLLMRequestBody', 'createImageDataUrl', 'createHuggingFaceEmbeddings', 'loadPdfDocuments', 'createCollectionForVectorSearch', 'setVectorIndex', 'configureVectorIndex', 'setupRagCollection', 'initializeEmbeddingCaches', 'prepareRagFolder']);
  Module._load = origLoad;
  const hf = require(path.join(appDir, 'node_modules/@huggingface/inference'));
  const apiErr = (status) => { const e = Object.create(hf.InferenceClientProviderApiError.prototype); e.message = 'api'; e.name = 'ProviderApiError'; e.httpResponse = { status }; return e; };
  const errs = [undefined, null, 'str', 5, () => 1, {}, new Error('Cancel it'), new Error('AbortError: x'), Object.assign(new Error('x'), { name: 'AbortError' }), { code: 'ECONNABORTED' }, { error: { code: 'insufficient_quota' } }, apiErr(400), apiErr(404), apiErr(408), apiErr(429), apiErr(500), apiErr('400'), new Error('plain'), { message: 5, name: 7 }];
  for (const [i, e] of errs.entries()) await rec('isNonRetryableError ' + i, () => I.isNonRetryableError(e));
  const realSetTimeout = global.setTimeout; const delays = [];
  global.setTimeout = (f, ms, ...a) => { delays.push(ms); return realSetTimeout(f, 0, ...a); };
  let n = 0;
  await rec('withRetry ok first', () => I.withRetry(async () => 'v'));
  n = 0; await rec('withRetry 2 fails', async () => ({ r: await I.withRetry(async () => { if (n++ < 2) throw new Error('flaky'); return 'ok' + n; }), delays: [...delays] }));
  n = 0; delays.length = 0; await rec('withRetry api 500', async () => ({ r: await I.withRetry(async () => { if (n++ < 1) throw apiErr(500); return 'ok'; }), delays: [...delays] }));
  n = 0; delays.length = 0; await rec('withRetry nonretryable', () => I.withRetry(async () => { n++; throw apiErr(401); }));
  n = 0; delays.length = 0; await rec('withRetry exhausted', async () => { try { await I.withRetry(async () => { n++; throw new Error('always'); }, { maxRetries: 2, minTimeoutMs: 10, factor: 3 }); } catch (e) { return { e: e.message, n, delays: [...delays] }; } });
  n = 0; delays.length = 0; await rec('withRetry named err', async () => { try { await I.withRetry(async () => { n++; throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }, { maxRetries: 1 }); } catch (e) { return { e: e.message, n, delays: [...delays] }; } });
  global.setTimeout = realSetTimeout;
  await rec('normalize', () => I.normalizeTextForCaching('  a \n\n b\t c  '));
  await rec('cacheKey', () => I.createCacheKey(' Hello   World ', 'model-x', 'doc'));
  for (const c of [null, '', '{"department":"A"}', "x {'department': 'B'} y", '{"department": "C", bad}', '{bad}', 'none', '{"department": ""}', '{\n"department":\n"D"}']) await rec('extractClassifier ' + c, () => I.extractClassifierResponse(c));
  for (const d of [{}, { choices: [] }, { choices: 'x' }, { choices: [{}] }, { choices: [{ message: {} }] }, { choices: [{ message: { content: 'seen' } }] }]) await rec('extractVision ' + JSON.stringify(d), () => I.extractVisionAnalysis(d));
  await rec('visionBody', () => I.createVisionLLMRequestBody('data:x', 'm1'));
  await rec('classifierBody', () => I.createClassifierLLMRequestBody('in', 'm2', 'sys'));
  await rec('dataUrl', () => I.createImageDataUrl({ buffer: Buffer.from('abc'), mimetype: 'image/jpeg' }));
  // cached embeddings with fake keyv caches
  await rec('initCaches', () => { I.initializeEmbeddingCaches('mongodb://x'); I.initializeEmbeddingCaches('mongodb://y'); return caches.map((c) => c.opts); });
  const base = { calls: [], embedDocuments: async (docs) => { base.calls.push(['docs', docs]); return docs.map((d) => [d.length]); }, embedQuery: async (q) => { base.calls.push(['q', q]); return [q.length, 1]; } };
  const ce = I.createCachedEmbeddings(base, 'mod');
  await rec('cached embedDocuments 1', async () => ({ r: await ce.embedDocuments(['aa', 'bbb', 'aa ']), calls: [...base.calls], log: [...caches[0].log] }));
  base.calls.length = 0; caches[0].log.length = 0;
  await rec('cached embedDocuments 2', async () => ({ r: await ce.embedDocuments(['zzzz', 'aa', 'bbb']), calls: [...base.calls], log: [...caches[0].log] }));
  base.calls.length = 0;
  await rec('cached embedQuery', async () => ({ a: await ce.embedQuery('hello'), b: await ce.embedQuery(' hello '), calls: [...base.calls], log: [...caches[1].log] }));
  await rec('cached embedDocuments empty', async () => ce.embedDocuments([]));
  // HF embeddings helper with a stubbed client
  const emb = I.createHuggingFaceEmbeddings({ apiKey: 'k', model: 'mm', provider: 'pp' });
  await rec('hf embedQuery', async () => ({ r: await emb.embedQuery('a\nb\nc'), fe: [...fe] }));
  fe.length = 0;
  await rec('hf embedDocuments', async () => ({ r: await emb.embedDocuments(['x\ny', 'zz']), fe: [...fe], keys: Object.keys(emb) }));
  // vector search collection helpers with a fake db
  const dbCalls = [];
  const mkColl = (name, searchIdx) => ({ collectionName: name, createSearchIndex: async (d) => { dbCalls.push([name, 'createSearchIndex', d]); }, createIndex: async (d) => { dbCalls.push([name, 'createIndex', d]); }, updateSearchIndex: async (...a) => { dbCalls.push([name, 'updateSearchIndex', ...a]); }, listSearchIndexes: () => ({ toArray: async () => searchIdx }), findOne: async (q) => { dbCalls.push([name, 'findOne', q]); return name === 'rag_chunks' ? sample : null; } });
  let existing = []; let sample = null; let idx = [];
  const db = { listCollections: (q) => { dbCalls.push(['listCollections', q]); return { toArray: async () => existing }; }, createCollection: async (n2) => { dbCalls.push(['createCollection', n2]); return mkColl(n2, idx); }, collection: (n2) => mkColl(n2, idx) };
  await rec('createCollection new', async () => { const c = await I.createCollectionForVectorSearch(db, 'c1', [{ a: 1 }, { b: 1 }]); return { name: c.collectionName, dbCalls: [...dbCalls] }; });
  dbCalls.length = 0; existing = [{ name: 'c1' }];
  await rec('createCollection existing', async () => { const c = await I.createCollectionForVectorSearch(db, 'c1', [{ a: 1 }]); return { name: c.collectionName, dbCalls: [...dbCalls] }; });
  dbCalls.length = 0; existing = [];
  await rec('setupRagCollection', async () => { const c = await I.setupRagCollection(db); return { name: c.collectionName, dbCalls: [...dbCalls] }; });
  dbCalls.length = 0;
  const def = { mappings: { dynamic: true, fields: { embedding: { dimensions: 384, similarity: 'cosine', type: 'knnVector' } } } };
  await rec('setVectorIndex none', async () => { await I.setVectorIndex(mkColl('x', []), def); return [...dbCalls]; });
  dbCalls.length = 0;
  await rec('setVectorIndex same', async () => { await I.setVectorIndex(mkColl('x', [{ name: 'default', latestDefinition: def }]), def); return [...dbCalls]; });
  await rec('setVectorIndex differs', async () => { await I.setVectorIndex(mkColl('x', [{ name: 'other' }, { name: 'default', latestDefinition: { mappings: { fields: { embedding: { dimensions: 1024 } } } } }]), def); return [...dbCalls]; });
  dbCalls.length = 0;
  await rec('setVectorIndex nodef', async () => { await I.setVectorIndex(mkColl('x', [{ name: 'default' }]), def); return [...dbCalls]; });
  dbCalls.length = 0;
  await rec('configureVectorIndex none', async () => { await I.configureVectorIndex(db); return [...dbCalls]; });
  dbCalls.length = 0; sample = { embedding: [1, 2, 3] }; idx = [];
  await rec('configureVectorIndex sample', async () => { await I.configureVectorIndex(db); return [...dbCalls]; });
  // pdf loading (generated one-page pdf)
  const pdfPath = path.join(require('node:os').tmpdir(), `hs-sample-${process.pid}.pdf`);
  fs.writeFileSync(pdfPath, require('./pdf.js')());
  await rec('loadPdfDocuments', async () => { const d = await I.loadPdfDocuments(pdfPath); return d.map((x) => ({ pageContent: x.pageContent, loc: x.metadata.loc, totalPages: x.metadata.pdf.totalPages, hasInfo: !!x.metadata.pdf.info, version: x.metadata.pdf.version, ctor: x.constructor.name })); });
  fs.unlinkSync(pdfPath);
};
