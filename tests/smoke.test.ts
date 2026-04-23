import { describe, it, expect } from "bun:test"
import { spawnSync } from "child_process"
import { join } from "path"
import { readFileSync, writeFileSync } from "fs"

const ROOT = join(import.meta.dir, "..")
const RUN = join(ROOT, "run.ts")

function run(code: string): { stdout: string; stderr: string; status: number } {
  const result = spawnSync("bun", ["run", RUN], {
    input: code,
    encoding: "utf8",
    env: { ...process.env },
    timeout: 15_000,
  })
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 0,
  }
}


// --- basic execution ---

describe("smoke: execution", () => {
  it("runs simple TypeScript", () => {
    const r = run(`console.log("tool-use works")`)
    expect(r.stdout.trim()).toBe("tool-use works")
    expect(r.status).toBe(0)
  })

  it("top-level await works", () => {
    const r = run(`await Promise.resolve(); console.log("await ok")`)
    expect(r.stdout.trim()).toBe("await ok")
    expect(r.status).toBe(0)
  })

  it("exits with correct code on error", () => {
    const r = run(`throw new Error("boom")`)
    expect(r.status).not.toBe(0)
  })

  it("console.error goes to stderr", () => {
    const r = run(`console.error("to-stderr")`)
    expect(r.stderr).toContain("to-stderr")
  })
})


// --- pre-imported helpers ---

describe("smoke: pre-imported helpers", () => {
  it("shell is available", () => {
    const r = run(`const r = shell("echo from-shell"); console.log(r.stdout.trim())`)
    expect(r.stdout.trim()).toBe("from-shell")
  })

  it("cache is available", () => {
    const key = `smoke-cache-${Date.now()}`
    const r = run(`const v = await cache("${key}", () => "cached-smoke"); console.log(v)`)
    expect(r.stdout.trim()).toBe("cached-smoke")
  })

  it("checkpoint and restore are available", () => {
    const name = `smoke-ckpt-${Date.now()}`
    const r = run(`
      checkpoint("${name}", { ok: true })
      const v = restore("${name}")
      console.log(v?.ok)
      checkpointClear("${name}")
    `)
    expect(r.stdout.trim()).toBe("true")
  })

  it("ROOT is a string pointing to repo root", () => {
    const r = run(`console.log(typeof ROOT)`)
    expect(r.stdout.trim()).toBe("string")
  })

  it("HELPERS_TS points to real file", () => {
    const r = run(`
      import { existsSync } from "fs"
      console.log(existsSync(HELPERS_TS))
    `)
    expect(r.stdout.trim()).toBe("true")
  })

  it("listSkills is available", () => {
    const r = run(`console.log(Array.isArray(listSkills()))`)
    expect(r.stdout.trim()).toBe("true")
  })

  it("saveSkill and listSkills round-trip", () => {
    const name = `smoke-skill-${Date.now()}`
    const r = run(`
      saveSkill("${name}", "smoke test skill content")
      console.log(listSkills().includes("${name}"))
    `)
    expect(r.stdout.trim()).toContain("true")
  })
})


// --- self-extension ---

describe("smoke: self-extension", () => {
  it("agent can read HELPERS_TS and write a new function", () => {
    const marker = `smokeTestFn_${Date.now()}`
    const helpersPath = join(ROOT, "helpers.ts")
    const originalSrc = readFileSync(helpersPath, "utf8")

    // write a new fn via the harness
    const r = run(`
      import { readFileSync, writeFileSync } from "fs"
      const src = readFileSync(HELPERS_TS, "utf8")
      if (!src.includes("${marker}")) {
        writeFileSync(HELPERS_TS, src.trimEnd() + \`\\nexport function ${marker}() { return "extended" }\\n\`)
      }
      console.log("written")
    `)
    expect(r.stdout.trim()).toBe("written")
    expect(readFileSync(helpersPath, "utf8")).toContain(marker)

    // restore original
    writeFileSync(helpersPath, originalSrc)
    expect(readFileSync(helpersPath, "utf8")).not.toContain(marker)
  })
})


// --- CLI flags ---

describe("smoke: CLI flags", () => {
  it("--skills returns list or empty message", () => {
    const r = spawnSync("bun", ["run", RUN, "--skills"], { encoding: "utf8" })
    expect(r.status).toBe(0)
    expect(r.stdout.length).toBeGreaterThan(0)
  })

  it("--checkpoints returns list or empty message", () => {
    const r = spawnSync("bun", ["run", RUN, "--checkpoints"], { encoding: "utf8" })
    expect(r.status).toBe(0)
  })

  it("--help prints usage", () => {
    const r = spawnSync("bun", ["run", RUN, "--help"], { encoding: "utf8" })
    expect(r.stdout).toContain("tool-use")
    expect(r.status).toBe(0)
  })
})
