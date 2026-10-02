import express, { type Request, type Response, type NextFunction } from 'express';
import { JSONFileSyncPreset } from 'lowdb/node';

interface Todo { id: number; title: string; done: boolean; }
interface Data { next: number; todos: Todo[]; }
interface TodoInput { title?: unknown; done?: unknown; }

const [port, dataFile] = process.argv.slice(2);
const db = JSONFileSyncPreset<Data>(dataFile, { next: 1, todos: [] });
const app = express();

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function titleOf(body: TodoInput): string {
  if (typeof body.title !== 'string' || body.title.trim() === '') throw new HttpError(400, 'title required');
  return body.title.trim();
}

function todo(id: string): Todo {
  const t = /^[1-9]\d*$/.test(id) ? db.data.todos.find((t) => t.id === Number(id)) : undefined;
  if (!t) throw new HttpError(404, 'not found');
  return t;
}

app.use(express.json());

app.get('/todos', (req: Request, res: Response) => {
  const done = req.query.done as string | undefined;
  res.json(done === undefined ? db.data.todos : db.data.todos.filter((t) => t.done === (done === 'true')));
});

app.post('/todos', (req: Request<unknown, unknown, TodoInput>, res: Response) => {
  const title = titleOf(req.body);
  const t: Todo = { id: db.data.next++, title, done: req.body.done === true };
  db.data.todos.push(t);
  db.write();
  res.status(201).json(t);
});

app.get('/todos/:id', (req: Request<{ id: string }>, res: Response) => res.json(todo(req.params.id)));

app.put('/todos/:id', (req: Request<{ id: string }, unknown, TodoInput>, res: Response) => {
  const t = todo(req.params.id);
  if (req.body.title !== undefined) t.title = titleOf(req.body);
  if (req.body.done !== undefined) t.done = req.body.done === true;
  db.write();
  res.json(t);
});

app.delete('/todos/:id', (req: Request<{ id: string }>, res: Response) => {
  const t = todo(req.params.id);
  db.data.todos = db.data.todos.filter((x) => x !== t);
  db.write();
  res.status(204).end();
});

app.get('/stats', (req: Request, res: Response) => {
  const done = db.data.todos.filter((t) => t.done).length;
  res.json({ total: db.data.todos.length, done, open: db.data.todos.length - done });
});

app.use((req: Request, res: Response) => res.status(404).json({ error: 'not found' }));
app.use((err: HttpError & { type?: string }, req: Request, res: Response, next: NextFunction) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid json' });
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(Number(port), () => console.log(`listening on ${port}`));
