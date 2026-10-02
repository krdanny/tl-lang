const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const ser = (x) => JSON.parse(JSON.stringify(x === undefined ? '__undef' : x, (k, v) => (v instanceof Error ? 'Error:' + v.message : typeof v === 'function' ? 'fn' : v === undefined ? '__undef' : typeof v === 'string' ? v.split(path.sep + 'original' + path.sep).join('/APP/').split(path.sep + 'tl-build' + path.sep).join('/APP/') : v)));
module.exports = async ({ run, appDir, out, logs }) => {
  const calls = [];
  const state = { files: ['a.pdf'], count: 0, idx: [{ name: 'default', status: 'READY' }], collections: [{ name: 'x' }], sample: { embedding: [1, 2, 3, 4] }, connectFail: false, batch: [{ content: 'rag answer' }, { content: 'llm answer' }] };
  const coll = (name) => ({
    collectionName: name,
    distinct: async (f) => { calls.push([name, 'distinct', f]); return state.files; },
    countDocuments: async (q) => { calls.push([name, 'countDocuments', q]); return state.count; },
    listSearchIndexes: () => ({ toArray: async () => state.idx }),
    findOne: async (q) => { calls.push([name, 'findOne', q]); return state.sample; },
    createSearchIndex: async (d) => { calls.push([name, 'createSearchIndex', d]); },
    updateSearchIndex: async (...a) => { calls.push([name, 'updateSearchIndex', ...a]); },
    createIndex: async (d) => { calls.push([name, 'createIndex', d]); },
  });
  class FakeMongoClient {
    constructor(uri) { calls.push(['new MongoClient', typeof uri]); }
    async connect() { calls.push(['connect']); if (state.connectFail) throw new Error('no mongo'); }
    db() { return { collection: coll, listCollections: (q) => ({ toArray: async () => state.collections }), createCollection: async (n) => { calls.push(['createCollection', n]); return coll(n); } }; }
    async close() { calls.push(['close']); }
  }
  class FakeVS {
    constructor(emb, opts) { calls.push(['new VS', Object.keys(emb), { ...opts, collection: opts.collection.collectionName }]); this.emb = emb; }
    static async fromDocuments(docs, emb, opts) { calls.push(['fromDocuments', docs.map((d) => ({ pageContent: d.pageContent, metadata: d.metadata })), Object.keys(emb), { ...opts, collection: opts.collection.collectionName }]); calls.push(['embedded', await emb.embedDocuments(docs.map((d) => d.pageContent))]); }
    async similaritySearch(q, k) { calls.push(['similaritySearch', q, k, await this.emb.embedQuery(q)]); return [{ pageContent: 'chunk one' }, { pageContent: 'chunk two' }]; }
  }
  class FakeCache { constructor(c, emb, opts) { calls.push(['new SemCache', c.collectionName, Object.keys(emb), opts]); } }
  class FakeGroq { constructor(o) { calls.push(['new ChatGroq', { ...o, cache: o.cache ? o.cache.constructor.name : o.cache }]); } async batch(m) { calls.push(['batch', m.map((x) => x.map((h) => h.content))]); if (state.batch === 'THROW') throw new Error('llm down'); return state.batch; } }
  const mkCache = () => { const m = new Map(); return { get: async (k) => m.get(k), set: async (k, v) => { m.set(k, v); } }; };
  function FakeKeyv() { return mkCache(); }
  function FakeStore() {}
  const realHf = require(path.join(appDir, 'node_modules/@huggingface/inference'));
  class FakeHf { async featureExtraction(a) { return a.inputs.map((t) => [t.length, 7]); } }
  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'mongodb') return { MongoClient: FakeMongoClient };
    if (request === '@langchain/mongodb') return { MongoDBAtlasVectorSearch: FakeVS, MongoDBAtlasSemanticCache: FakeCache };
    if (request === '@langchain/groq') return { ChatGroq: FakeGroq };
    if (request === '@huggingface/inference') return { ...realHf, HfInference: FakeHf };
    if (request === 'keyv') return { default: FakeKeyv };
    if (request === '@keyv/mongo') return { default: FakeStore };
    return origLoad.call(this, request, ...rest);
  };
  delete require.cache[path.join(appDir, 'controllers/ai.js')];
  const ai = require(path.join(appDir, 'controllers/ai.js'));
  Module._load = origLoad;
  const inputDir = path.join(appDir, 'rag_input');
  const ingested = path.join(inputDir, 'ingested');
  const step = async (name, fn, reqInit) => { calls.length = 0; await run(name, ai, fn, reqInit); out.push(JSON.stringify({ name: name + ' calls', calls: ser(calls), dir: fs.existsSync(inputDir) ? fs.readdirSync(inputDir).sort() : null, ing: fs.existsSync(ingested) ? fs.readdirSync(ingested).sort() : null })); };
  state.connectFail = true;
  await step('getRag connect fail', 'getRag');
  state.connectFail = false; state.collections = [];
  await step('getRag creates collections', 'getRag');
  await step('getRag ready', 'getRag');
  await step('ingest no files', 'postRagIngest');
  fs.writeFileSync(path.join(inputDir, 'sample.pdf'), require('./pdf.js')());
  fs.writeFileSync(path.join(inputDir, 'notes.txt'), 'x');
  await step('ingest one pdf', 'postRagIngest');
  fs.writeFileSync(path.join(inputDir, 'dup.pdf'), require('./pdf.js')());
  fs.writeFileSync(path.join(inputDir, 'new.pdf'), require('./pdf.js')());
  let n = 0; const cd = state; const origCount = state.count;
  // first file is a duplicate (hash already present), second is new
  const realCount = coll;
  state.count = 2;
  await step('ingest duplicates', 'postRagIngest');
  state.count = 0;
  fs.writeFileSync(path.join(inputDir, 'broken.pdf'), 'not a pdf');
  await step('ingest broken', 'postRagIngest');
  await step('ask blank', 'postRagAsk', { body: { question: ' ' } });
  await step('ask ok', 'postRagAsk', { body: { question: 'What is TL?' + 'x'.repeat(600) } });
  state.files = [];
  await step('ask no files', 'postRagAsk', { body: { question: 'q' } });
  state.files = ['a.pdf']; state.idx = [{ name: 'default', status: 'BUILDING' }];
  await step('ask index not ready', 'postRagAsk', { body: { question: 'q' } });
  state.idx = [{ name: 'default', status: 'READY' }]; state.batch = [{ content: 'only one' }];
  await step('ask short batch', 'postRagAsk', { body: { question: 'q' } });
  state.batch = 'THROW';
  await step('ask llm throws', 'postRagAsk', { body: { question: 'q' } });
  state.batch = null;
  await step('ask null batch', 'postRagAsk', { body: { question: 'q' } });
  // clean up exactly what this scenario created
  for (const f of ['sample.pdf', 'dup.pdf', 'new.pdf', 'broken.pdf']) { for (const d of [inputDir, ingested]) { const p = path.join(d, f); if (fs.existsSync(p)) fs.unlinkSync(p); } }
  fs.unlinkSync(path.join(inputDir, 'notes.txt'));
  fs.rmdirSync(ingested); fs.rmdirSync(inputDir);
};
