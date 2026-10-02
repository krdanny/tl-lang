import http from 'node:http';
import fs from 'node:fs';

const [port, dataFile] = process.argv.slice(2);
let state = { next: 1, todos: [] };
if (fs.existsSync(dataFile)) state = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

function save() {
  fs.writeFileSync(dataFile, JSON.stringify(state));
}

function send(res, status, body) {
  if (body === undefined) return res.writeHead(status).end();
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

function validTitle(title) {
  return typeof title === 'string' && title.trim() !== '';
}

function findTodo(idText) {
  if (!/^[1-9]\d*$/.test(idText)) return undefined;
  return state.todos.find((t) => t.id === Number(idText));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  let body;
  if (req.method === 'POST' || req.method === 'PUT') {
    try { body = await readJson(req); } catch { return send(res, 400, { error: 'invalid json' }); }
  }

  if (parts[0] === 'todos' && parts.length === 1) {
    if (req.method === 'GET') {
      const done = url.searchParams.get('done');
      const list = done === null ? state.todos : state.todos.filter((t) => t.done === (done === 'true'));
      return send(res, 200, list);
    }
    if (req.method === 'POST') {
      if (!validTitle(body.title)) return send(res, 400, { error: 'title required' });
      const todo = { id: state.next++, title: body.title.trim(), done: body.done === true };
      state.todos.push(todo);
      save();
      return send(res, 201, todo);
    }
  }

  if (parts[0] === 'todos' && parts.length === 2) {
    const todo = findTodo(parts[1]);
    if (!todo) return send(res, 404, { error: 'not found' });
    if (req.method === 'GET') return send(res, 200, todo);
    if (req.method === 'PUT') {
      if (body.title !== undefined) {
        if (!validTitle(body.title)) return send(res, 400, { error: 'title required' });
        todo.title = body.title.trim();
      }
      if (body.done !== undefined) todo.done = body.done === true;
      save();
      return send(res, 200, todo);
    }
    if (req.method === 'DELETE') {
      state.todos = state.todos.filter((t) => t !== todo);
      save();
      return send(res, 204);
    }
  }

  if (parts[0] === 'stats' && parts.length === 1 && req.method === 'GET') {
    const done = state.todos.filter((t) => t.done).length;
    return send(res, 200, { total: state.todos.length, done, open: state.todos.length - done });
  }

  send(res, 404, { error: 'not found' });
});

server.listen(Number(port), () => console.log(`listening on ${port}`));
