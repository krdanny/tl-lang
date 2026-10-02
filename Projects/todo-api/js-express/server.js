import express from 'express';
import { JSONFileSyncPreset } from 'lowdb/node';

const [port, dataFile] = process.argv.slice(2);
const db = JSONFileSyncPreset(dataFile, { next: 1, todos: [] });
const app = express();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function titleOf(body) {
  if (typeof body.title !== 'string' || body.title.trim() === '') throw new HttpError(400, 'title required');
  return body.title.trim();
}

function todo(id) {
  const t = /^[1-9]\d*$/.test(id) && db.data.todos.find((t) => t.id === Number(id));
  if (!t) throw new HttpError(404, 'not found');
  return t;
}

app.use(express.json());

app.get('/todos', (req, res) => {
  const { done } = req.query;
  res.json(done === undefined ? db.data.todos : db.data.todos.filter((t) => t.done === (done === 'true')));
});

app.post('/todos', (req, res) => {
  const title = titleOf(req.body);
  const t = { id: db.data.next++, title, done: req.body.done === true };
  db.data.todos.push(t);
  db.write();
  res.status(201).json(t);
});

app.get('/todos/:id', (req, res) => res.json(todo(req.params.id)));

app.put('/todos/:id', (req, res) => {
  const t = todo(req.params.id);
  if (req.body.title !== undefined) t.title = titleOf(req.body);
  if (req.body.done !== undefined) t.done = req.body.done === true;
  db.write();
  res.json(t);
});

app.delete('/todos/:id', (req, res) => {
  const t = todo(req.params.id);
  db.data.todos = db.data.todos.filter((x) => x !== t);
  db.write();
  res.status(204).end();
});

app.get('/stats', (req, res) => {
  const done = db.data.todos.filter((t) => t.done).length;
  res.json({ total: db.data.todos.length, done, open: db.data.todos.length - done });
});

app.use((req, res) => res.status(404).json({ error: 'not found' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid json' });
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(Number(port), () => console.log(`listening on ${port}`));
