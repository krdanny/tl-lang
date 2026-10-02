const path = require('node:path');
module.exports = async ({ run, appDir, out, logs, setRoutes }) => {
  const ai = require(path.join(appDir, 'controllers/ai'));
  const agent = require(path.join(appDir, 'controllers/ai-agent'));
  const mongoose = require(path.join(appDir, 'node_modules/mongoose'));
  await run('getAi', ai, 'getAi');
  await run('getLLMCamera', ai, 'getLLMCamera');
  await run('postLLMCamera no file', ai, 'postLLMCamera', {});
  const file = { buffer: Buffer.from('img'), mimetype: 'image/png' };
  const groq = (content) => ({ 'api.groq.com': { body: { choices: [{ message: { content } }] } } });
  await run('postLLMCamera ok', ai, 'postLLMCamera', { file }, groq('a cat'));
  await run('postLLMCamera no choices', ai, 'postLLMCamera', { file }, { 'api.groq.com': { body: { choices: [] } } });
  await run('postLLMCamera no content', ai, 'postLLMCamera', { file }, { 'api.groq.com': { body: {} } });
  await run('postLLMCamera api error msg', ai, 'postLLMCamera', { file }, { 'api.groq.com': { status: 400, body: { error: { message: 'bad image' } } } });
  await run('postLLMCamera api error nomsg', ai, 'postLLMCamera', { file }, { 'api.groq.com': { status: 502, body: 'not json', headers: { 'content-type': 'text/plain' } } });
  const key = process.env.GROQ_API_KEY; delete process.env.GROQ_API_KEY;
  await run('postLLMCamera no key', ai, 'postLLMCamera', { file });
  await run('classifier no key', ai, 'postLLMClassifier', { body: { inputText: 'hi' } });
  process.env.GROQ_API_KEY = key;
  const model = process.env.GROQ_MODEL; delete process.env.GROQ_MODEL;
  await run('classifier no model', ai, 'postLLMClassifier', { body: { inputText: 'hi' } });
  process.env.GROQ_MODEL = model;
  await run('getLLMClassifier', ai, 'getLLMClassifier');
  await run('classifier empty', ai, 'postLLMClassifier', { body: { inputText: '   ' } });
  await run('classifier no body text', ai, 'postLLMClassifier', { body: {} });
  await run('classifier json', ai, 'postLLMClassifier', { body: { inputText: 'where is my order' } }, groq('Sure: {"department": "Order Tracking and Status"} done'));
  await run('classifier single quotes', ai, 'postLLMClassifier', { body: { inputText: 'x'.repeat(400) } }, groq("{'department': 'Returns and Refunds'}"));
  await run('classifier malformed', ai, 'postLLMClassifier', { body: { inputText: 'refund' } }, groq('{"department": "Payments and Billing Issues", oops}'));
  await run('classifier malformed no dept', ai, 'postLLMClassifier', { body: { inputText: 'refund' } }, groq('{nothing here}'));
  await run('classifier no json', ai, 'postLLMClassifier', { body: { inputText: 'refund' } }, groq('I think Technical Support'));
  await run('classifier json no dept', ai, 'postLLMClassifier', { body: { inputText: 'refund' } }, groq('{"other": 1}'));
  await run('classifier empty choices', ai, 'postLLMClassifier', { body: { inputText: 'refund' } }, { 'api.groq.com': { body: { choices: [] } } });
  await run('classifier no choices', ai, 'postLLMClassifier', { body: { inputText: 'refund' } }, { 'api.groq.com': { body: {} } });
  await run('classifier api fail', ai, 'postLLMClassifier', { body: { inputText: 'refund' } }, { 'api.groq.com': { status: 500, body: { error: { message: 'down' } } } });
  await run('postRagAsk empty', ai, 'postRagAsk', { body: { question: '  ' } });
  await run('postRagAsk none', ai, 'postRagAsk', { body: {} });
  // ai-agent
  await run('agent chat no message', agent, 'postAIAgentChat', { body: {}, sessionID: 's1' });
  await run('agent chat blank', agent, 'postAIAgentChat', { body: { message: '   ' }, user: { _id: { toString: () => 'U1' } } });
  await run('agent chat too long', agent, 'postAIAgentChat', { body: { message: 'x'.repeat(401) }, sessionID: 's1' });
  const calls = [];
  const coll = (name) => ({
    distinct: async (...a) => { calls.push([name, 'distinct', ...a]); return ['temp_a', 'temp_b', 'temp_c', 'temp_temp_d']; },
    find: (...a) => { calls.push([name, 'find', ...a]); return { toArray: async () => [{ _id: 'b' }] }; },
    deleteMany: async (...a) => { calls.push([name, 'deleteMany', ...a]); return {}; },
  });
  mongoose.connection.getClient = () => ({ db: () => ({ collection: coll }), appendMetadata() {} });
  logs.length = 0;
  let r; try { r = await agent.cleanupOrphanedTempSessions(); } catch (e) { r = 'THROW ' + e.message; }
  out.push(JSON.stringify({ name: 'cleanup', r, calls, logs }));
  calls.length = 0; logs.length = 0;
  try { r = await agent.deleteUserAIAgentData('u1'); } catch (e) { r = 'THROW ' + e.message; }
  out.push(JSON.stringify({ name: 'deleteUserAIAgentData', r, calls, logs }));
  calls.length = 0;
  await run('agent reset anon', agent, 'postAIAgentReset', { sessionID: 's9' });
  await run('agent reset user', agent, 'postAIAgentReset', { user: { _id: { toString: () => 'U1' } } });
  out.push(JSON.stringify({ name: 'reset calls', calls }));
  calls.length = 0;
  const tuple = { find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) }) };
  await run('agent get anon', agent, 'getAIAgent', { sessionID: 's9' });
  await run('agent chat stream error', agent, 'postAIAgentChat', { body: { message: ' hello ' }, sessionID: 's1' }, {});
};
