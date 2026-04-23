<img src="resources/image.png" alt="tool-use" width="100%" />

# tool-use

The simplest, thinnest library that lets an LLM **build its own tools on the fly.**

The agent writes what's missing, mid-task. No tool registry, no framework, no predefined schema. One file to read, one file to extend.

```
  ● agent: needs to paginate a GitHub API
  │
  ● helpers.ts → paginate() missing
  │
  ● agent edits the harness and writes it    helpers.ts   120 → 135 lines
  │                                                       + paginate()
  ✓ all pages fetched. paginate() is there next run too.
```

**The agent never hits the same wall twice.**

## Setup prompt

Paste into Claude Code or Codex:

```text
Set up https://github.com/hetpatel-11/tool-use for me.

Read `install.md` first. Then read `SKILL.md` for usage. Always read `helpers.ts`
before starting — that is where the functions are. When a function you need is missing,
write it into helpers.ts and use it immediately. Save anything non-obvious you learned
to task-skills/ before finishing.
```

## How simple is it? (~300 lines of TypeScript)

- `helpers.ts` (~200 lines) — starting primitives; the agent edits these
- `run.ts` (~50 lines) — prepends helpers import, runs agent code via Bun
- `SKILL.md` — day-to-day usage
- `install.md` — first-time setup
- `task-skills/` — agent-written knowledge that accumulates across runs

## What's in helpers.ts

```typescript
shell(cmd)                          // run any shell command
httpGet(url) / httpPost(url, opts)  // fetch anything
paginate(url)                       // paginated APIs (GitHub-style)
cache(key, fn, ttl?)                // file-based cache — survives retries
checkpoint(name, data)              // save task state mid-run
restore(name)                       // pick up where you crashed
saveSkill(name, content)            // contribute knowledge back
log(msg) / readLog()                // structured logging
cdpConnect()                        // raw CDP — control a real browser
ROOT / HELPERS_TS                   // stable paths for self-extension
```

## The self-extension pattern

```typescript
// agent notices httpGet() exists but githubRepo() doesn't
// agent writes it into helpers.ts:

const src = readFileSync(HELPERS_TS, "utf8")
if (!src.includes("export async function githubRepo")) {
  writeFileSync(HELPERS_TS, src.trimEnd() + `
export async function githubRepo(owner: string, repo: string) {
  return JSON.parse(await httpGet(\`https://api.github.com/repos/\${owner}/\${repo}\`))
}
`)
}

// now uses it — and it's there on every future run
const repo = await githubRepo("vercel", "next.js")
```

## Acknowledgements

Inspired by [browser-harness](https://github.com/browser-use/browser-harness) by [Gregor Žunič](https://github.com/gregpr07) — which proved that the self-extending helpers pattern works. browser-harness applies it to browser automation via CDP. tool-use generalises it to any capability an agent might need.

## Contributing

PRs welcome. The best contribution: **a new task skill** under `task-skills/` for a workflow you use often (GitHub triage, scraping, data processing, etc.).

- **Skills are written by the agent, not by you.** Run your task — when the agent figures something non-obvious out, it saves the skill itself. Don't hand-author skill files.
- Open a PR with the generated `task-skills/<domain>/` folder.
- Helper improvements and bug fixes equally welcome.
