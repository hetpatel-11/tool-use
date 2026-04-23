import { describe, it, expect, afterEach } from "bun:test"
import {
  shell,
  cache, cacheClear,
  checkpoint, restore, checkpoints, checkpointClear,
  saveSkill, listSkills, skill,
  log, readLog,
  ROOT,
} from "../helpers.ts"
import { join } from "path"

// --- shell ---

describe("shell", () => {
  it("returns stdout and returncode 0 on success", () => {
    const r = shell("echo hello")
    expect(r.stdout.trim()).toBe("hello")
    expect(r.returncode).toBe(0)
    expect(r.stderr).toBe("")
  })

  it("returns nonzero returncode on failure", () => {
    const r = shell("exit 42", { timeout: 5 })
    expect(r.returncode).toBe(42)
  })

  it("captures stderr", () => {
    // execSync pipes stderr on failure; use a failing command to surface it
    const r = shell("echo err >&2; exit 1")
    expect(r.stderr.trim()).toBe("err")
  })

  it("respects cwd option", () => {
    const r = shell("pwd", { cwd: "/tmp" })
    expect(r.stdout.trim()).toMatch(/\/tmp$/)
  })

  it("handles command with arguments", () => {
    const r = shell("echo one two three")
    expect(r.stdout.trim()).toBe("one two three")
  })
})


// --- cache ---

describe("cache", () => {
  const key = () => `test-cache-${Date.now()}-${Math.random()}`

  it("calls fn on cache miss and returns value", async () => {
    const k = key()
    let calls = 0
    const v = await cache(k, () => { calls++; return "hit" })
    expect(v).toBe("hit")
    expect(calls).toBe(1)
    cacheClear(k)
  })

  it("returns cached value without calling fn again", async () => {
    const k = key()
    let calls = 0
    await cache(k, () => { calls++; return "first" })
    const v = await cache(k, () => { calls++; return "second" })
    expect(v).toBe("first")
    expect(calls).toBe(1)
    cacheClear(k)
  })

  it("respects ttl=0 (always expired)", async () => {
    const k = key()
    let calls = 0
    await cache(k, () => { calls++; return "v1" }, 0)
    await cache(k, () => { calls++; return "v2" }, 0)
    expect(calls).toBe(2)
    cacheClear(k)
  })

  it("works with async fn", async () => {
    const k = key()
    const v = await cache(k, async () => {
      await new Promise(r => setTimeout(r, 1))
      return "async-value"
    })
    expect(v).toBe("async-value")
    cacheClear(k)
  })

  it("works with objects and arrays", async () => {
    const k = key()
    const v = await cache(k, () => ({ a: 1, b: [2, 3] }))
    expect(v).toEqual({ a: 1, b: [2, 3] })
    cacheClear(k)
  })

  it("cacheClear with no key clears everything", async () => {
    const k1 = key(); const k2 = key()
    await cache(k1, () => "v1")
    await cache(k2, () => "v2")
    cacheClear()
    let calls = 0
    await cache(k1, () => { calls++; return "refetch" })
    expect(calls).toBe(1)
  })
})


// --- checkpoint ---

describe("checkpoint / restore", () => {
  const name = () => `test-ckpt-${Date.now()}-${Math.random()}`

  afterEach(() => checkpointClear())

  it("saves and restores a value", () => {
    const n = name()
    checkpoint(n, { x: 42, items: ["a", "b"] })
    const v = restore<{ x: number; items: string[] }>(n)
    expect(v).toEqual({ x: 42, items: ["a", "b"] })
  })

  it("returns fallback when checkpoint does not exist", () => {
    const v = restore("nonexistent-ckpt-xyz", "fallback")
    expect(v).toBe("fallback")
  })

  it("lists saved checkpoint names", () => {
    const n1 = `ckpt-a-${Date.now()}`
    const n2 = `ckpt-b-${Date.now()}`
    checkpoint(n1, 1)
    checkpoint(n2, 2)
    const all = checkpoints()
    expect(all).toContain(n1)
    expect(all).toContain(n2)
  })

  it("checkpointClear removes a named checkpoint", () => {
    const n = name()
    checkpoint(n, "data")
    checkpointClear(n)
    expect(restore(n)).toBeUndefined()
  })

  it("overwrites an existing checkpoint", () => {
    const n = name()
    checkpoint(n, "first")
    checkpoint(n, "second")
    expect(restore(n)).toBe("second")
  })
})


// --- skills ---

describe("skills", () => {
  afterEach(() => {
    shell(`rm -rf "${join(ROOT, "task-skills/test-skill")}"`)
  })

  it("saveSkill creates a skill file", () => {
    saveSkill("test-skill/demo", "This is test content.")
    expect(listSkills()).toContain("test-skill/demo")
  })

  it("listSkills returns sorted names", () => {
    saveSkill("test-skill/b", "b")
    saveSkill("test-skill/a", "a")
    const skills = listSkills().filter(s => s.startsWith("test-skill/"))
    expect(skills).toEqual(["test-skill/a", "test-skill/b"])
  })

  it("skill() prints content to stdout", () => {
    saveSkill("test-skill/hello", "hello skill content")
    // skill() uses console.log — just verify no throw
    expect(() => skill("test-skill/hello")).not.toThrow()
  })

  it("skill() handles missing skill gracefully", () => {
    expect(() => skill("test-skill/does-not-exist")).not.toThrow()
  })
})


// --- log ---

describe("log / readLog", () => {
  it("log appends to log file and readLog returns it", () => {
    log("unit-test-entry-" + Date.now())
    const lines = readLog(100)
    expect(lines).toContain("unit-test-entry-")
  })

  it("readLog respects n limit", () => {
    for (let i = 0; i < 5; i++) log(`line-${i}`)
    const lines = readLog(2).split("\n")
    expect(lines.length).toBe(2)
  })

  it("log includes level in output", () => {
    const msg = `warn-test-${Date.now()}`
    log(msg, "WARN")
    expect(readLog(10)).toContain("[WARN]")
    expect(readLog(10)).toContain(msg)
  })
})
