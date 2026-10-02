# Project 2 — Log analyzer CLI

A command-line tool that summarizes a web server access log. Implement it in JavaScript, TypeScript and TL from
this spec only. All versions must produce byte-identical output for the shared fixtures.

## Running

`<program> <logfile> [--top N] [--since ISO-DATETIME]`

- `--top N` (default 5): how many paths to list.
- `--since 2023-10-10T14:00:00Z`: ignore requests before that instant.
- Lines that do not match the log format are counted as malformed and otherwise ignored.

## Log format (one request per line)

```
203.0.113.7 - - [10/Oct/2023:13:55:36 +0000] "GET /api/users HTTP/1.1" 200 2326 0.123
```
Fields: client IP, two dashes, `[day/Mon/year:HH:MM:SS +0000]` (always UTC), quoted request line
`"METHOD PATH PROTOCOL"`, status code, response bytes, response time in seconds.

## Output (exactly)

```
requests: <matched lines>
malformed: <count>
status:
  <code>: <count>          (ascending code; only codes that occur)
top paths:
  <path> <count>           (count descending, then path ascending; --top entries)
requests per hour:
  <YYYY-MM-DD HH>:00 <count>   (chronological; only hours that occur)
p95 response ms: <int>
```
`p95` is the value at index `ceil(0.95 × n) − 1` of the ascending response times, in milliseconds, rounded to
the nearest integer (round half up). If there are no requests it is `0`.
