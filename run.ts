import { writeFileSync } from "fs"
import { join } from "path"
import { spawnSync } from "child_process"
import { listSkills, checkpoints } from "./helpers.ts"

const ROOT = import.meta.dir

const HELP = `tool-use

Read SKILL.md for usage. Read helpers.ts for available functions.

Usage:
  tool-use <<'TS'
  const r = shell("git log --oneline -5")
  console.log(r.stdout)
  TS

Helpers are pre-imported. Edit helpers.ts when a function is missing.

Commands:
  tool-use --skills       list task skills
  tool-use --checkpoints  list saved checkpoints
  tool-use --cache-clear  clear all cached data
`

const args = process.argv.slice(2)

if (args[0] === "--help" || args[0] === "-h") {
  console.log(HELP)
  process.exit(0)
}

if (args[0] === "--skills") {
  const s = listSkills()
  console.log(s.length ? s.join("\n") : "(no task skills yet)")
  process.exit(0)
}

if (args[0] === "--checkpoints") {
  const c = checkpoints()
  console.log(c.length ? c.join("\n") : "(no checkpoints)")
  process.exit(0)
}

if (args[0] === "--cache-clear") {
  const { cacheClear } = await import("./helpers.ts")
  cacheClear()
  console.log("cache cleared")
  process.exit(0)
}

if (process.stdin.isTTY) {
  process.stderr.write(
    "tool-use reads TypeScript from stdin. Use:\n" +
    "  tool-use <<'TS'\n" +
    "  console.log(shell('ls'))\n" +
    "  TS\n"
  )
  process.exit(1)
}

const chunks: Buffer[] = []
for await (const chunk of process.stdin) chunks.push(chunk)
const agentCode = Buffer.concat(chunks).toString()

const helperPath = join(ROOT, "helpers.ts")
const wrapped = `import { shell, httpGet, httpPost, paginate, cache, cacheClear, checkpoint, restore, checkpoints, checkpointClear, skill, listSkills, saveSkill, log, readLog, ROOT, HELPERS_TS } from "${helperPath}"

${agentCode}`

const tmpFile = "/tmp/_tool_use_run.ts"
writeFileSync(tmpFile, wrapped)

const result = spawnSync("bun", ["run", tmpFile], { stdio: "inherit" })
process.exit(result.status ?? 0)
