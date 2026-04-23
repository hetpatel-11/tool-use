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

export async function githubRepo(owner: string, repo: string, token?: string) {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined
  return JSON.parse(await httpGet(`https://api.github.com/repos/${owner}/${repo}`, headers))
}


// --- browser (raw CDP, no dependencies) ---

const CDP_PROFILES = [
  `${process.env.HOME}/Library/Application Support/Google/Chrome`,
  `${process.env.HOME}/Library/Application Support/Microsoft Edge`,
  `${process.env.HOME}/.config/google-chrome`,
  `${process.env.HOME}/.config/chromium`,
]

class CDPClient {
  private ws: WebSocket
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private _id = 1

  constructor(ws: WebSocket) {
    this.ws = ws
    ws.addEventListener("message", (e: MessageEvent) => {
      const msg = JSON.parse(e.data as string)
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error.message))
      else p.resolve(msg.result ?? {})
    })
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this._id++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  close() { this.ws.close() }
}

export async function cdpConnect(): Promise<CDPClient> {
  let wsUrl: string | undefined

  if (process.env.BU_CDP_WS) {
    wsUrl = process.env.BU_CDP_WS
  } else {
    for (const profile of CDP_PROFILES) {
      const portFile = join(profile, "DevToolsActivePort")
      if (!existsSync(portFile)) continue
      const [port, path] = readFileSync(portFile, "utf8").trim().split("\n")
      wsUrl = `ws://127.0.0.1:${port.trim()}${path.trim()}`
      break
    }
  }

  if (!wsUrl) throw new Error(
    "Chrome remote debugging not enabled.\n" +
    "Open chrome://inspect/#remote-debugging and tick 'Discover network targets', " +
    "or set BU_CDP_WS=ws://127.0.0.1:<port>/..."
  )

  const ws = new WebSocket(wsUrl)
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve())
    ws.addEventListener("error", () => reject(new Error(`CDP connect failed: ${wsUrl}`)))
    setTimeout(() => reject(new Error("CDP connect timeout after 5s")), 5000)
  })

  const cdp = new CDPClient(ws)
  // attach to first real page
  const { targetInfos } = await cdp.send("Target.getTargets")
  const page = targetInfos.find((t: any) => t.type === "page" && !t.url.startsWith("chrome://"))
  if (page) {
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: page.targetId, flatten: true })
    ;(cdp as any)._session = sessionId
  }
  return cdp
}

export async function cdp(client: CDPClient, method: string, params: Record<string, unknown> = {}) {
  const sessionId = (client as any)._session
  return client.send(method, { ...params, ...(sessionId ? { sessionId } : {}) })
}

export async function browserScreenshot(client: CDPClient, path = "/tmp/shot.png"): Promise<string> {
  const r = await cdp(client, "Page.captureScreenshot", { format: "png" })
  writeFileSync(path, Buffer.from(r.data, "base64"))
  return path
}

export async function browserGoto(client: CDPClient, url: string) {
  return cdp(client, "Page.navigate", { url })
}

export async function browserClick(client: CDPClient, x: number, y: number) {
  await cdp(client, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 })
  await cdp(client, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 })
}

export async function browserType(client: CDPClient, text: string) {
  await cdp(client, "Input.insertText", { text })
}

export async function browserJs(client: CDPClient, expression: string) {
  const r = await cdp(client, "Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  return r.result?.value
}

export async function browserPageInfo(client: CDPClient) {
  const val = await browserJs(client,
    "JSON.stringify({url:location.href,title:document.title,w:innerWidth,h:innerHeight,scrollY})"
  )
  return JSON.parse(val)
}
export function smokeTestFn_1776918467034() { return "extended" }
