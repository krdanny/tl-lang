# Recipes

## Read a file, count words

```tl
p"/tmp/tl_recipe_words.txt|fs.write p"the cat the dog|c(fs.read p).split>>counts|print(c.get"the"0)c.len
```
```text
2 3
```

## JSON in and out

```tl
d json.de`{"name":"Ann","tags":["a","b"]}`|print d.name d.tags.len|print(json.en{"ok":true"n":[1 2
```
```text
Ann 2
{"ok":true,"n":[1,2]}
```

## Command-line arguments and environment

```tl
args proc.args|name if args.len>0 args[0]"world|home env.get"HOME""/|print"hello $name"(home.len>0
```
```text
hello world true
```

## Run a process

```tl
r proc.run["echo""hi|print r.code r.out.trim
```
```text
0 hi
```

## Safe file read with a fallback

```tl
t try|fs.read"/no/such/file<catch e|"missing<print t
```
```text
missing
```

## HTTP server

```
st json.store"todos.json"{next:1 todos:[]}|srv http.serve 3000 req=>|match req|GET/todos|st.todos<POST/todos|b req.json|guard b.title is str s and s.trim.len>0|!Invalid"title required"<td{id:st.next title:s.trim done:false|st.next+=1|st.todos.push td|{status:201 body:td}<GET/todos/:id|(st.todos>>find x=>x.id==(int id))??!Missing<_|!Missing<<<print"listening on 3000
```

- `match req|` with route arms `GET/todos/:id|…` binds the path parameters; `_` handles everything else.
- `req` has `method path query headers body`, and `req.json` parses the body (`Invalid"invalid json"` if not JSON).
- Return a string, any value (sent as JSON), or a map `{status:201 body:v}` (optionally `headers`).
- Raise `!Missing`, `!Invalid"why"`, `!Conflict"why"`, `!Unauthorized`, `!Forbidden` for error responses.
- `json.store path defaults` gives a JSON file that loads itself and saves after every change.

## HTTP client

```
async fn get_json url|r await http.get url|r.json()<data await get_json"https://example.com/api"|print data
```

## Group and sum

```tl
sales[("eu",10)("us",5)("eu",7|g sales>>groups .0|for k,v g|print k(v>>map .1>>sum
```
```text
eu 17
us 5
```
