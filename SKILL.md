---
name: agent-harness
description: General-purpose self-extending primitive library for AI agents. Use when you need shell, HTTP, cache, checkpoints, or task skills. Extend helpers.ts when a needed function is missing.
---

# agent-harness

Thin, self-extending primitive library for AI agents. The agent writes what's missing. The harness compounds what's learned.

**Pitch:** give a raw LLM (API call, no tools attached) the ability to do anything — and remember what it figured out.

## Fast start

Read `helpers.ts` first — every function is there with its signature.

```bash
agent-harness <<'TS'
const r = shell("git log --oneline -5")
console.log(r.stdout)
TS
```

All helpers are pre-imported. Top-level `await` works.

## Core primitives

### Shell
```typescript
const r = shell("git status")
console.log(r.stdout, r.stderr, r.returncode)

const r2 = shell("npm test", { cwd: "/path/to/project", timeout: 120 })
```

### HTTP
```typescript
const text = await httpGet("https://api.github.com/repos/owner/repo")
const data = JSON.parse(text)

const resp = await httpPost("https://api.example.com/action", {
  json: { key: "value" },
  headers: { Authorization: "Bearer TOKEN" },
})

// paginated APIs (GitHub-style)
const repos = await paginate<Repo>("https://api.github.com/orgs/vercel/repos")
```

### Cache — makes helpers worth writing
```typescript
// won't re-fetch if already cached within ttl
const users = await cache("gh-users", () =>
  httpGet("https://api.github.com/users").then(JSON.parse), 3600)

cacheClear("gh-users")  // one key
cacheClear()            // everything
```

### Checkpoints — pick up where you crashed
```typescript
let records = restore<Record[]>("raw_records")
if (!records) {
  records = await fetchAllRecords()   // slow / rate-limited
  checkpoint("raw_records", records)  // safe from here
}
for (const r of records) process(r)

checkpoints()               // ['raw_records', 'step_2']
checkpointClear("raw_records")
```

### Skills — accumulated knowledge
```typescript
skill("github/pagination")   // print skill into context
listSkills()                 // see what's available
```

### Log
```typescript
log("starting fetch")
log("rate limited", "WARN")
console.log(readLog(20))
```

## Self-extension pattern

When a function is missing, add it to `helpers.ts` using `HELPERS_TS`:

```typescript
const src = require("fs").readFileSync(HELPERS_TS, "utf8")
if (!src.includes("export async function myHelper")) {
  require("fs").writeFileSync(HELPERS_TS, src.trimEnd() + `
export async function myHelper(arg: string): Promise<string> {
  // ...
}
`)
  console.log("[helpers.ts] wrote myHelper()")
}
```

The function is there on the next run too. This is the core loop.

## Skill contribution

When you learn something non-obvious, save it before finishing:

```typescript
saveSkill("github/pagination", `
GitHub public API: 60 req/hr unauthenticated, 5000 req/hr authenticated.
paginate() handles pagination automatically — stops when response.length < perPage.
`)
```

Search before reinventing:
```bash
agent-harness --skills
```

## Architecture

```
agent-harness <<'TS' ... TS
       ↓
   run.ts          prepends helpers import, writes /tmp/_agent_run.ts, bun run
       ↓
   helpers.ts      shell / http / cache / checkpoint / skill / log
       ↓
task-skills/       agent-written .md files — accumulated knowledge
.cache/            file-based cache (JSON)
.checkpoints/      task state (JSON)
```

## Design constraints

- **No daemon.** No persistent process. Bun executes a temp file per run.
- **No framework.** No tool registry, no retry logic, no config system.
- **helpers.ts is yours.** Short typed functions. The agent extends it mid-task.
- **task-skills/ is agent-generated.** Don't hand-author — let the agent write what it actually learned.
