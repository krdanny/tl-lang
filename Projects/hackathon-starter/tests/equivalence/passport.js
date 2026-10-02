const path = require('node:path');
module.exports = async ({ appDir, out, logs, setRoutes }) => {
  process.env.STEAM_KEY = process.env.STEAM_KEY || 'steamkey';
  const pm = require(path.join(appDir, 'config/passport'));
  const User = require(path.join(appDir, 'models/User'));
  const passport = require(path.join(appDir, 'node_modules/passport'));
  const refresh = require(path.join(appDir, 'node_modules/passport-oauth2-refresh'));
  const clean = (x) => JSON.parse(JSON.stringify(x === undefined ? '__undef' : x, (k, v) => (v instanceof Error ? 'Error:' + v.message : typeof v === 'function' ? 'fn' : v === undefined ? '__undef' : v instanceof Map ? { $map: [...v] } : k === '_id' || k === 'createdAt' || k === 'updatedAt' ? 'X' : typeof v === 'string' ? v.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'TS') : v)));
  const view = (u) => (u && typeof u.toObject === 'function' ? clean(u.toObject()) : clean(u));
  const state = {};
  const calls = [];
  User.findOne = async (q) => { calls.push(['findOne', clean(q)]); return state.findOne ? state.findOne(q) : null; };
  User.findById = async (id) => { calls.push(['findById', typeof id]); return state.findById; };
  User.prototype.save = async function () { calls.push(['save', view(this)]); if (state.saveFail) throw new Error('save failed'); return this; };
  const mkUser = (extra = {}) => { const u = new User({ email: 'me@example.com' }); Object.assign(u, extra); return u; };
  const names = Object.keys(passport._strategies).sort();
  out.push(JSON.stringify({ name: 'strategies', names, refresh: Object.keys(refresh._strategies || {}).sort() }));
  const realDateNow = Date.now; Date.now = () => 1700000000000;
  const run = async (name, strat, args, { loggedIn, findOne, routes, saveFail, existing } = {}) => {
    calls.length = 0; logs.length = 0; setRoutes(routes || {});
    state.findOne = findOne; state.saveFail = saveFail;
    const flashes = [];
    const req = { query: { realmId: 'REALM' }, session: { returnTo: '/x' }, flash: (...a) => flashes.push(clean(a)) };
    if (loggedIn) { req.user = existing || mkUser({ tokens: [{ kind: 'other', accessToken: 'o' }] }); state.findById = req.user; } else state.findById = null;
    let done; const p = new Promise((r) => { done = (...a) => r(a); });
    let thrown = null;
    const verify = passport._strategies[strat]._verify;
    try { const r = verify(req, ...args, done); if (r && r.catch) r.catch((e) => { thrown = 'REJECT ' + e.message; done('rejected'); }); } catch (e) { thrown = 'THROW ' + e.message; done('threw'); }
    const res = await Promise.race([p, new Promise((r) => setTimeout(() => r(['TIMEOUT']), 2000))]);
    out.push(JSON.stringify({ name, done: res.map((x) => (x && typeof x.toObject === 'function' ? view(x) : clean(x))), thrown, flashes, calls: clean(calls), logs: clean(logs), session: clean(req.session), reqUser: req.user ? view(req.user) : null }));
  };
  const other = () => ({ id: 'someone-else', email: 'o@x.com' });
  const variants = (label, strat, args, routes) => [
    [label + ' new user', strat, args, { routes }],
    [label + ' returning', strat, args, { routes, findOne: (q) => (q.email ? null : { id: 'ret', returning: true }) }],
    [label + ' email collision', strat, args, { routes, findOne: (q) => (q.email ? { id: 'dup' } : null) }],
    [label + ' link', strat, args, { routes, loggedIn: true }],
    [label + ' link collision', strat, args, { routes, loggedIn: true, findOne: (q) => (q.email ? null : other()) }],
    [label + ' save fails', strat, args, { routes, saveFail: true }],
  ];
  const params = { expires_in: 3600, refresh_token_expires_in: 7200, x_refresh_token_expires_in: 100 };
  const all = [
    ...variants('facebook', 'facebook', ['AT', 'RT', params, { id: 'fb1', name: { givenName: 'Ann', familyName: 'Lee' }, _json: { gender: 'f', location: { name: 'Paris' }, email: 'Ann.Lee@Gmail.com' } }]),
    ['facebook no location/email', 'facebook', ['AT', 'RT', params, { id: 'fb1', name: {}, _json: {} }], {}],
    ...variants('github', 'github', ['AT', null, {}, { id: 'gh1', displayName: 'Ann', emails: [{ value: 'b@x.com', primary: false, verified: true }, { value: 'a@x.com', primary: true, verified: false }, { value: 'c@x.com', primary: true, verified: true }], _json: { avatar_url: 'http://av', location: 'L', blog: 'http://blog' } }]),
    ['github no emails', 'github', ['AT', null, {}, { id: 'gh1', displayName: 'Ann', _json: {} }], {}],
    ...variants('twitter', names.find((n) => /twitter|^x$/i.test(n)), ['AT', 'SECRET', { id: 'x1', displayName: 'Ann', username: 'ann', _json: { location: 'L', profile_image_url_https: 'http://p' } }]),
    ...variants('google', 'google', ['AT', 'RT', params, { id: 'g1', displayName: 'Ann', emails: [{ value: 'ann@x.com' }], _json: { gender: 'f', picture: 'http://pic' } }]),
    ['google no emails', 'google', ['AT', 'RT', params, { id: 'g1', displayName: 'Ann', _json: {} }], {}],
    ['google empty emails', 'google', ['AT', 'RT', params, { id: 'g1', displayName: 'Ann', emails: [], _json: {} }], {}],
    ...variants('linkedin', 'linkedin', ['AT', 'RT', params, {}], { 'linkedin.com/v2/userinfo': { body: { sub: 'li1', name: 'Ann', picture: '', email: 'ann@x.com' } } }),
    ['linkedin fetch fail', 'linkedin', ['AT', 'RT', params, {}], { routes: { 'linkedin.com/v2/userinfo': { status: 401, body: {} } } }],
    ['linkedin invalid profile', 'linkedin', ['AT', 'RT', params, {}], { routes: { 'linkedin.com/v2/userinfo': { body: { sub: 'x' } } } }],
    ['linkedin invalid profile logged in', 'linkedin', ['AT', 'RT', params, {}], { loggedIn: true, routes: { 'linkedin.com/v2/userinfo': { body: {} } } }],
    ['linkedin network', 'linkedin', ['AT', 'RT', params, {}], { routes: { 'linkedin.com/v2/userinfo': new Error('net') } }],
    ...variants('microsoft', 'microsoft', ['AT', 'RT', params, {}], { 'graph.microsoft.com': { body: { id: 'ms1', displayName: 'Ann', userPrincipalName: 'ann@corp.com' } } }),
    ['microsoft mail', 'microsoft', ['AT', undefined, {}, {}], { routes: { 'graph.microsoft.com': { body: { id: 'ms1', displayName: 'Ann', mail: 'ann@mail.com', userPrincipalName: 'upn@corp.com' } } } }],
    ['microsoft fetch fail', 'microsoft', ['AT', 'RT', params, {}], { routes: { 'graph.microsoft.com': { status: 500, body: {} } } }],
    ['microsoft invalid', 'microsoft', ['AT', 'RT', params, {}], { routes: { 'graph.microsoft.com': { body: { id: 'ms1' } } } }],
    ['microsoft invalid logged in', 'microsoft', ['AT', 'RT', params, {}], { loggedIn: true, routes: { 'graph.microsoft.com': { body: null } } }],
    ...variants('twitch', 'twitch', ['AT', 'RT', params, { id: 't1', display_name: 'Ann', profile_image_url: 'http://tp', _json: { data: [{ email: 'tw@x.com' }] } }]),
    ['twitch email fallback', 'twitch', ['AT', 'RT', params, { id: 't1', display_name: 'Ann', email: 'fallback@x.com' }], {}],
    ['twitch no email', 'twitch', ['AT', 'RT', params, { id: 't1', display_name: 'Ann', _json: { data: [] } }], {}],
    ...variants('tumblr', 'tumblr', ['TOK', 'SEC', {}], { 'api.tumblr.com/v2/user/info': { body: { response: { user: { name: 'annblog', blogs: [{ uuid: 'u0', url: 'http://b0' }, { primary: true, uuid: 'u1', url: 'http://b1', avatar: [{ url: 'http://av1' }] }] } } } } }),
    ['tumblr no primary', 'tumblr', ['TOK', 'SEC', {}], { loggedIn: true, routes: { 'api.tumblr.com/v2/user/info': { body: { response: { user: { name: 'annblog', blogs: [{ url: 'http://b0' }] } } } } } }],
    ['tumblr missing token', 'tumblr', [null, 'SEC', {}], { loggedIn: true }],
    ['tumblr http fail', 'tumblr', ['TOK', 'SEC', {}], { loggedIn: true, routes: { 'api.tumblr.com/v2/user/info': { status: 401, body: {} } } }],
    ...variants('steam', 'steam-openid', ['https://steamcommunity.com/openid/id/76561198000000001', {}], { 'GetPlayerSummaries': { body: { response: { players: [{ personaname: 'Ann', avatarmedium: 'http://sav' }] } } } }),
    ['steam no players', 'steam-openid', ['https://steamcommunity.com/openid/id/765', {}], { routes: { 'GetPlayerSummaries': { body: { response: { players: [] } } } } }],
    ['steam no players logged in', 'steam-openid', ['https://steamcommunity.com/openid/id/765', {}], { loggedIn: true, routes: { 'GetPlayerSummaries': { body: {} } } }],
    ['steam http fail', 'steam-openid', ['https://steamcommunity.com/openid/id/765', {}], { routes: { 'GetPlayerSummaries': { status: 500, body: {} } } }],
    ['quickbooks link', 'quickbooks', ['AT', 'RT', params, {}], { loggedIn: true }],
    ['quickbooks no db user', 'quickbooks', ['AT', 'RT', params, {}], { loggedIn: true, existing: mkUser({ tokens: [{ kind: 'quickbooks', accessToken: 'old', refreshToken: 'oldr', accessTokenExpires: 'a', refreshTokenExpires: 'b' }] }) }],
    ['quickbooks save fails', 'quickbooks', ['AT', 'RT', params, {}], { loggedIn: true, saveFail: true }],
    ...variants('discord', 'discord', ['AT', 'RT', params, {}], { 'discord.com/api/users/@me': { body: { id: 'd1', username: 'ann', email: 'ann@x.com', avatar: 'hash' } } }),
    ['discord no avatar', 'discord', ['AT', 'RT', params, {}], { routes: { 'discord.com/api/users/@me': { body: { id: 'd1', username: 'ann', email: 'ann@x.com' } } } }],
    ['discord fetch fail', 'discord', ['AT', 'RT', params, {}], { routes: { 'discord.com/api/users/@me': { status: 403, body: {} } } }],
    ['discord invalid', 'discord', ['AT', 'RT', params, {}], { routes: { 'discord.com/api/users/@me': { body: { id: 'd1' } } } }],
    // linking when the current user is a legacy / gravatar account
    ['github link legacy pictures', 'github', ['AT', null, {}, { id: 'gh1', displayName: 'Ann', emails: [], _json: { avatar_url: 'http://av' } }], { loggedIn: true, existing: mkUser({ tokens: [], profile: { name: 'Old', picture: 'http://old', pictureSource: 'gravatar', pictures: new Map([['gravatar', 'http://old']]) } }) }],
    ['twitter link with secret', names.find((n) => /twitter|^x$/i.test(n)), ['AT', 'SECRET', { id: 'x1', displayName: 'Ann', username: 'ann', _json: {} }], { loggedIn: true, existing: mkUser({ tokens: [], profile: {} }) }],
  ];
  for (const [name, strat, args, opts] of all) await run(name, strat, JSON.parse(JSON.stringify(args)), opts);
  // local strategy + serialize/deserialize
  const local = passport._strategies.local._verify;
  for (const [name, found, pw, match] of [['local not found', null], ['local no password', { email: 'a@b.c' }], ['local ok', { email: 'a@b.c', password: 'h', comparePassword: (p, cb) => cb(null, true) }], ['local bad', { email: 'a@b.c', password: 'h', comparePassword: (p, cb) => cb(null, false) }], ['local cmp err', { email: 'a@b.c', password: 'h', comparePassword: (p, cb) => cb(new Error('bcrypt')) }]]) {
    calls.length = 0; state.findOne = () => found;
    const r = await new Promise((resolve) => local('A@B.c', 'pw', (...a) => resolve(a)));
    out.push(JSON.stringify({ name, r: clean(r), calls: clean(calls) }));
  }
  state.findOne = () => { throw new Error('db down'); };
  out.push(JSON.stringify({ name: 'local db error', r: clean(await new Promise((resolve) => local('a@b.c', 'pw', (...a) => resolve(a)))) }));
  out.push(JSON.stringify({ name: 'revocation config', c: clean(pm.providerRevocationConfig), exports: Object.keys(pm).filter((k) => ['providerRevocationConfig', 'isAuthenticated', 'isAuthorized', '_saveOAuth2UserTokens', '_handleAuthLogin'].includes(k)).sort(), fbParams: clean(passport._strategies.facebook.authorizationParams()) }));
  Date.now = realDateNow;
};
