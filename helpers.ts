/** Agent primitives. Read, edit, extend — this file is yours. */
import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
  readdirSync, unlinkSync, appendFileSync,
} from "fs"
import { createHash } from "crypto"
import { join, dirname } from "path"
import { execSync } from "child_process"

export const ROOT = import.meta.dir
export const HELPERS_TS = join(ROOT, "helpers.ts")

const CACHE_DIR  = join(ROOT, ".cache")
const CKPT_DIR   = join(ROOT, ".checkpoints")
const LOG_FILE   = join(ROOT, ".agent.log")
const SKILLS_DIR = join(ROOT, "task-skills")


// --- shell ---

export function shell(cmd: string, opts: { timeout?: number; cwd?: string } = {}) {
  try {
    const stdout = execSync(cmd, {
      timeout: (opts.timeout ?? 60) * 1000,
      cwd: opts.cwd,
      encoding: "utf8",
    })
    return { stdout, stderr: "", returncode: 0 }
  } catch (e: any) {
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? e.message ?? "", returncode: e.status ?? 1 }
  }
}


// --- http ---

export async function httpGet(url: string, headers?: Record<string, string>): Promise<string> {
  const r = await fetch(url, { headers })
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`)
  return r.text()
}

export async function httpPost(
  url: string,
  opts: { json?: unknown; data?: string; headers?: Record<string, string> } = {}
): Promise<string> {
  const h: Record<string, string> = { ...(opts.headers ?? {}) }
  let body: string | undefined
  if (opts.json !== undefined) {
    h["Content-Type"] = "application/json"
    body = JSON.stringify(opts.json)
  } else {
    body = opts.data
  }
  const r = await fetch(url, { method: "POST", headers: h, body })
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`)
  return r.text()
}

export async function paginate<T = unknown>(
  url: string,
  opts: { headers?: Record<string, string>; perPage?: number } = {}
): Promise<T[]> {
  const results: T[] = []
  let page = 1
  const perPage = opts.perPage ?? 100
  while (true) {
    const sep = url.includes("?") ? "&" : "?"
    const data: T[] = JSON.parse(
      await httpGet(`${url}${sep}per_page=${perPage}&page=${page}`, opts.headers)
    )
    if (!data.length) break
    results.push(...data)
    if (data.length < perPage) break
    page++
  }
  return results
}


// --- cache ---

export async function cache<T>(key: string, fn: () => T | Promise<T>, ttl?: number): Promise<T> {
  mkdirSync(CACHE_DIR, { recursive: true })
  const h = createHash("md5").update(key).digest("hex")
  const p = join(CACHE_DIR, `${h}.json`)
  if (existsSync(p)) {
    const entry = JSON.parse(readFileSync(p, "utf8"))
    if (ttl === undefined || Date.now() / 1000 - entry.t < ttl) return entry.v as T
  }
  const v = await fn()
  writeFileSync(p, JSON.stringify({ v, t: Date.now() / 1000, key }))
  return v
}

export function cacheClear(key?: string) {
  if (!key) {
    if (existsSync(CACHE_DIR)) readdirSync(CACHE_DIR).forEach(f => unlinkSync(join(CACHE_DIR, f)))
    return
  }
  const h = createHash("md5").update(key).digest("hex")
  const p = join(CACHE_DIR, `${h}.json`)
  if (existsSync(p)) unlinkSync(p)
}


// --- checkpoints ---

export function checkpoint(name: string, data: unknown) {
  mkdirSync(CKPT_DIR, { recursive: true })
  writeFileSync(join(CKPT_DIR, `${name}.json`), JSON.stringify(data, null, 2))
}

export function restore<T = unknown>(name: string, fallback?: T): T | undefined {
  const p = join(CKPT_DIR, `${name}.json`)
  if (!existsSync(p)) return fallback
  return JSON.parse(readFileSync(p, "utf8")) as T
}

export function checkpoints(): string[] {
  if (!existsSync(CKPT_DIR)) return []
  return readdirSync(CKPT_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => f.slice(0, -5))
    .sort()
}

export function checkpointClear(name?: string) {
  if (!name) {
    if (existsSync(CKPT_DIR)) readdirSync(CKPT_DIR).forEach(f => unlinkSync(join(CKPT_DIR, f)))
    return
  }
  const p = join(CKPT_DIR, `${name}.json`)
  if (existsSync(p)) unlinkSync(p)
}


// --- skills ---

export function skill(name: string) {
  const p = join(SKILLS_DIR, `${name}.md`)
  if (!existsSync(p)) {
    console.log(`[skill] '${name}' not found. available: ${listSkills().join(", ") || "(none)"}`)
    return
  }
  console.log(readFileSync(p, "utf8"))
}

export function listSkills(): string[] {
  if (!existsSync(SKILLS_DIR)) return []
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory()
        ? walk(join(dir, e.name))
        : e.name.endsWith(".md") ? [join(dir, e.name)] : []
    )
  return walk(SKILLS_DIR)
    .map(p => p.slice(SKILLS_DIR.length + 1).replace(/\.md$/, ""))
    .sort()
}

export function saveSkill(name: string, content: string) {
  const p = join(SKILLS_DIR, `${name}.md`)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, content.trim() + "\n")
  console.log(`[skill] saved: task-skills/${name}.md`)
}


// --- log ---

export function log(msg: string, level = "INFO") {
  const entry = `[${new Date().toISOString().slice(0, 19)}] [${level}] ${msg}`
  appendFileSync(LOG_FILE, entry + "\n")
  console.log(entry)
}

export function readLog(n = 50): string {
  if (!existsSync(LOG_FILE)) return ""
  const lines = readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean)
  return lines.slice(-n).join("\n")
}

