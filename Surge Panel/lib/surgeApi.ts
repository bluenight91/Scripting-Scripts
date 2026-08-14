// Surge HTTP API 封装（端点文档：https://manual.nssurge.com/others/http-api.html）
import { fetch } from "scripting"
import { parsePrometheus, type MetricSample } from "./metrics"

export type SurgeConfig = {
  protocol: "http" | "https"
  host: string
  port: string
  key: string
}

export const DEFAULT_CONFIG: SurgeConfig = {
  protocol: "https",
  host: "127.0.0.1",
  port: "6166",
  // 在脚本「设置」页填写你的 Surge HTTP API Key（Surge 配置中的 http-api-key）
  key: "",
}

function urlOf(c: SurgeConfig, path: string): string {
  const port = c.port.trim()
  const portPart = port ? `:${port}` : ""
  return `${c.protocol}://${c.host.trim()}${portPart}${path}`
}

async function request<T>(
  c: SurgeConfig,
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(urlOf(c, path), {
    method,
    headers: {
      "X-Key": c.key,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    timeout: 30,
    allowInsecureRequest: c.protocol === "http",
    debugLabel: `surge-panel ${method} ${path}`,
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}${res.status === 401 ? "（Key 无效）" : ""}`)
  }
  const text = await res.text()
  if (!text || text === "OK") return undefined as T
  return JSON.parse(text) as T
}

function get<T>(c: SurgeConfig, path: string): Promise<T> {
  return request<T>(c, "GET", path)
}
function post<T>(c: SurgeConfig, path: string, body?: unknown): Promise<T> {
  return request<T>(c, "POST", path, body)
}

// ---------- Metrics ----------

export async function fetchMetrics(c: SurgeConfig): Promise<MetricSample[]> {
  const res = await fetch(urlOf(c, "/v1/metrics"), {
    headers: { "X-Key": c.key },
    timeout: 15,
    allowInsecureRequest: c.protocol === "http",
    debugLabel: "surge-panel metrics",
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return parsePrometheus(await res.text())
}

// ---------- 类型 ----------

export type PolicyOption = {
  isGroup: boolean
  name: string
  typeDescription: string
  lineHash: string
  enabled: boolean
}

export type PolicyTestResult = Record<
  string,
  { tfo?: boolean; tcp?: number; receive?: number; available?: number; "round-one-total"?: number }
>

export type GroupTestResult = Record<
  string,
  (string | { policy: string; score?: number; "available-total"?: number })[]
>

export type TimingRecord = {
  name: string
  durationInMillisecond: number
}

export type SurgeRequest = {
  id: number
  URL: string
  method?: string
  policyName: string
  originalPolicyName?: string
  rule?: string
  inCurrentSpeed?: number
  outCurrentSpeed?: number
  inMaxSpeed?: number
  outMaxSpeed?: number
  inBytes?: number
  outBytes?: number
  startDate?: number
  completedDate?: number
  completed?: boolean
  failed?: boolean
  rejected?: boolean
  status?: string
  deviceName?: string
  remoteHost?: string
  remoteAddress?: string
  localAddress?: string
  sourceAddress?: string
  sourcePort?: number
  interface?: string
  takeoverMode?: string
  notes?: string[]
  source?: string
  timingRecords?: TimingRecord[]
}

export type SurgeEvent = {
  identifier: string
  /** ISO 日期字符串，如 "2026-08-13T14:00:00+0800" */
  date: string
  /** -1 / 0 / 1 等级 */
  type: number
  allowDismiss?: boolean
  content?: string
}

export type DnsEntry = {
  domain: string
  server?: string | null
  interface?: string
  data?: string[] | null
  logs?: string[]
  path?: string
  timeCost?: number
  expiresTime?: number
  comment?: string | null
  source?: string | null
}

// ---------- 请求与事件 ----------

export const getActiveRequests = (c: SurgeConfig) =>
  get<{ requests: SurgeRequest[] }>(c, "/v1/requests/active")

export const getRecentRequests = (c: SurgeConfig) =>
  get<{ requests: SurgeRequest[] }>(c, "/v1/requests/recent")

export const killRequest = (c: SurgeConfig, id: number) =>
  post<void>(c, "/v1/requests/kill", { id })

export const getEvents = (c: SurgeConfig) => get<{ events: SurgeEvent[] }>(c, "/v1/events")

// ---------- 策略 ----------

export const getPolicies = (c: SurgeConfig) => get<{ proxies: string[] }>(c, "/v1/policies")

// Surge 自身的基准测试缓存（iOS ≥4.9.5）：按 lineHash 覆盖所有节点（含组内嵌/链式节点）
export type PolicyBenchmarkResult = {
  lastTestErrorMessage: string | null
  lastTestScoreInMS: number
  testing?: number
  lastTestDate?: number
}

export const getPolicyBenchmarks = (c: SurgeConfig) =>
  get<Record<string, PolicyBenchmarkResult>>(c, "/v1/policies/benchmark_results")

export const getPolicyGroups = (c: SurgeConfig) =>
  get<Record<string, PolicyOption[]>>(c, "/v1/policy_groups")

export const getPolicyGroupSelection = (c: SurgeConfig, groupName: string) =>
  get<{ policy: string }>(c, `/v1/policy_groups/select?group_name=${encodeURIComponent(groupName)}`)

export const selectPolicyGroup = (c: SurgeConfig, groupName: string, policy: string) =>
  post<void>(c, "/v1/policy_groups/select", { group_name: groupName, policy })

export const testPolicyGroup = (c: SurgeConfig, groupName: string, url?: string) =>
  post<{ available?: string[] }>(c, "/v1/policy_groups/test", {
    group_name: groupName,
    url: url ?? "http://www.gstatic.com/generate_204",
  })

export const getGroupTestResults = (c: SurgeConfig) =>
  get<GroupTestResult>(c, "/v1/policy_groups/test_results")

export const testPolicies = (c: SurgeConfig, names: string[], url?: string) =>
  post<PolicyTestResult>(c, "/v1/policies/test", {
    policy_names: names,
    url: url ?? "http://www.gstatic.com/generate_204",
  })

// ---------- 出站模式 ----------

export const getOutboundMode = (c: SurgeConfig) =>
  get<{ mode: "rule" | "proxy" | "direct" }>(c, "/v1/outbound")

export const setOutboundMode = (c: SurgeConfig, mode: string) =>
  post<void>(c, "/v1/outbound", { mode })

export const getOutboundGlobal = (c: SurgeConfig) =>
  get<{ policy: string }>(c, "/v1/outbound/global")

export const setOutboundGlobal = (c: SurgeConfig, policy: string) =>
  post<void>(c, "/v1/outbound/global", { policy })

// ---------- 流量（实时速度） ----------

export type TrafficEntry = {
  in: number
  out: number
  inCurrentSpeed: number
  outCurrentSpeed: number
  inMaxSpeed: number
  outMaxSpeed: number
  lineHash?: string
}

export type TrafficSnapshot = {
  connector: Record<string, TrafficEntry>
  interface: Record<string, TrafficEntry>
  startTime: number
}

export const getTraffic = (c: SurgeConfig) => get<TrafficSnapshot>(c, "/v1/traffic")

// ---------- 规则 ----------

export const getRules = (c: SurgeConfig) =>
  get<{ rules: string[]; "available-policies": string[] }>(c, "/v1/rules")

// ---------- 脚本 ----------

export type SurgeScript = {
  name: string
  path: string
  type: string
  enabled: boolean
  parameters?: Record<string, string>
}

export const getScripts = (c: SurgeConfig) =>
  get<{ scripts: SurgeScript[] }>(c, "/v1/scripting")

export const runCronScript = (c: SurgeConfig, scriptName: string) =>
  post<unknown>(c, "/v1/scripting/cron/evaluate", { script_name: scriptName })

// ---------- 策略详情 ----------

export const getPolicyDetail = (c: SurgeConfig, policyName: string) =>
  get<Record<string, string>>(
    c,
    `/v1/policies/detail?policy_name=${encodeURIComponent(policyName)}`
  )

// ---------- 日志级别 / 配置 ----------

export const setLogLevel = (c: SurgeConfig, level: string) =>
  post<void>(c, "/v1/log/level", { level })

export const getCurrentProfile = (c: SurgeConfig) =>
  get<{ profile?: string } | string>(c, "/v1/profiles/current?sensitive=0")

/** 从配置文本解析 [Proxy Group] 出现顺序，对齐 Surge App 列表 */
export function parseProxyGroupOrder(profile: string): string[] {
  const names: string[] = []
  let inGroup = false
  for (const raw of profile.split(/\r?\n/)) {
    const line = raw.trim()
    if (/^\[.+\]$/.test(line)) {
      inGroup = /^\[Proxy Group\]$/i.test(line)
      continue
    }
    if (!inGroup || !line || line.startsWith("#") || line.startsWith(";") || line.startsWith("//")) continue
    const eq = line.indexOf("=")
    if (eq <= 0) continue
    names.push(line.slice(0, eq).trim())
  }
  return names
}

export function orderPolicyGroupNames(names: string[], profileOrder: string[]): string[] {
  if (profileOrder.length === 0) return names
  const have = new Set(names)
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const n of profileOrder) {
    if (have.has(n) && !seen.has(n)) {
      ordered.push(n)
      seen.add(n)
    }
  }
  for (const n of names) {
    if (!seen.has(n)) ordered.push(n)
  }
  return ordered
}

// ---------- 功能开关 / 模块 ----------

export type FeatureKey = "mitm" | "capture" | "rewrite" | "scripting"

export const getFeature = (c: SurgeConfig, f: FeatureKey) =>
  get<{ enabled: boolean }>(c, `/v1/features/${f}`)

export const setFeature = (c: SurgeConfig, f: FeatureKey, enabled: boolean) =>
  post<void>(c, `/v1/features/${f}`, { enabled })

export const getModules = (c: SurgeConfig) =>
  get<{ available: string[]; enabled: string[] }>(c, "/v1/modules")

export const setModule = (c: SurgeConfig, name: string, enabled: boolean) =>
  post<void>(c, "/v1/modules", { [name]: enabled })

// ---------- DNS ----------

export const getDns = (c: SurgeConfig) =>
  get<{ local: DnsEntry[]; dnsCache: DnsEntry[] }>(c, "/v1/dns")

export const flushDns = (c: SurgeConfig) => post<void>(c, "/v1/dns/flush")

export const testDnsDelay = (c: SurgeConfig, domain: string) =>
  post<{ delay: number }>(c, "/v1/test/dns_delay", { domain })

// ---------- 配置 / 引擎 ----------

export const reloadProfile = (c: SurgeConfig) => post<void>(c, "/v1/profiles/reload")

export const stopEngine = (c: SurgeConfig) => post<void>(c, "/v1/stop")
