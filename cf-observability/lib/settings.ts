// 设置：账户 / 套餐 / 周期日 / 小组件项目存 Storage（脚本私有域），API 令牌存 Keychain（脚本沙盒隔离，小组件进程可读）
import { clampCycleDay, projectKey, type Plan, type Project } from "./cfCore"

export type Settings = {
  accountId: string
  accountName: string
  plan: Plan
  /** Workers Paid 账单周期起始日（1~28，UTC） */
  cycleDay: number
  widgetProject: Project | null
}

const SETTINGS_KEY = "cf_obs_settings"
const PROJECTS_KEY = "cf_obs_projects"
const TOKEN_KEY = "cf_obs_api_token"

export const DEFAULT_SETTINGS: Settings = {
  accountId: "",
  accountName: "",
  plan: "free",
  cycleDay: 1,
  widgetProject: null,
}

function isProject(v: unknown): v is Project {
  const o = v as Project
  return !!o && typeof o === "object" && (o.kind === "worker" || o.kind === "pages") && typeof o.name === "string" && typeof o.scriptName === "string"
}

export function loadSettings(): Settings {
  const raw = Storage.get<Partial<Settings>>(SETTINGS_KEY)
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS }
  return {
    accountId: typeof raw.accountId === "string" ? raw.accountId : "",
    accountName: typeof raw.accountName === "string" ? raw.accountName : "",
    plan: raw.plan === "paid" ? "paid" : "free",
    cycleDay: clampCycleDay(Number(raw.cycleDay ?? 1)),
    widgetProject: isProject(raw.widgetProject) ? raw.widgetProject : null,
  }
}

export function saveSettings(s: Settings) {
  Storage.set(SETTINGS_KEY, s)
}

export function getToken(): string {
  return Keychain.get(TOKEN_KEY) ?? ""
}

/** 空字符串表示清除已存令牌 */
export function setToken(token: string) {
  const t = token.trim()
  if (t === "") Keychain.remove(TOKEN_KEY)
  else Keychain.set(TOKEN_KEY, t)
}

export function isConfigured(s: Settings, token: string = getToken()): boolean {
  return token.length > 0 && s.accountId.trim().length > 0
}

/** 最近一次拉取的项目列表，小组件按名称解析参数时使用 */
export function loadCachedProjects(): Project[] {
  const raw = Storage.get<unknown[]>(PROJECTS_KEY)
  return Array.isArray(raw) ? raw.filter(isProject) : []
}

export function saveCachedProjects(list: Project[]) {
  Storage.set(PROJECTS_KEY, list.map(({ kind, name, scriptName, modifiedOn, subtitle }) => ({ kind, name, scriptName, modifiedOn, subtitle })))
}

/** 小组件参数：项目名（可带 worker: / pages: 前缀）或 account；找不到时按 Worker 名处理 */
export function resolveProject(param: string | null | undefined, fallback: Project | null): Project | null {
  const p = (param ?? "").trim()
  if (!p) return fallback
  if (/^account$/i.test(p)) return null
  const m = /^(worker|pages):(.+)$/i.exec(p)
  const kind = m ? (m[1].toLowerCase() as Project["kind"]) : null
  const name = (m ? m[2] : p).trim()
  const hit = loadCachedProjects().find((x) => x.name === name && (kind === null || x.kind === kind))
  if (hit) return hit
  if (kind === "pages") return null
  return { kind: "worker", name, scriptName: name }
}

export function sameProject(a: Project | null, b: Project | null): boolean {
  return !!a && !!b && projectKey(a) === projectKey(b)
}
