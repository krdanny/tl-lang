# Project 1 — Todo REST API

A small HTTP JSON API with file persistence. Implement it in JavaScript, TypeScript and TL from this spec
only (do not translate one implementation into another). All three must pass `tests/run.js`.

## Running

`<program> <port> <data-file>` — listen on `port`; load todos from `data-file` if it exists and write the file
after every change. Print `listening on <port>` once the server is ready.

## Data

A todo is `{ "id": int, "title": string, "done": bool }`. Ids start at 1 and increase; ids of deleted todos are
never reused (next id = max id ever seen + 1, persisted with the data as `{ "next": n, "todos": [...] }`).

## Endpoints

| Method and path | Request | Response |
|---|---|---|
| `GET /todos` | optional `?done=true` or `?done=false` | `200` list of todos, filtered when the query is present |
| `POST /todos` | `{ "title": string, "done"?: bool }` | `201` created todo. `400 {"error":"title required"}` if `title` is missing, not a string, or empty after trimming |
| `GET /todos/:id` | | `200` todo or `404 {"error":"not found"}` |
| `PUT /todos/:id` | `{ "title"?: string, "done"?: bool }` | `200` updated todo; `404` if missing; `400 {"error":"title required"}` if `title` is present but invalid |
| `DELETE /todos/:id` | | `204` empty body, or `404` |
| `GET /stats` | | `200 {"total":n,"done":n,"open":n}` |
| anything else | | `404 {"error":"not found"}` |

- A request body that is not valid JSON → `400 {"error":"invalid json"}`.
- `:id` that is not a positive integer → `404`.
- All responses with a body use `content-type: application/json`.
- Titles are stored trimmed.
