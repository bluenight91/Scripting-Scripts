// Surge HTTP API 封装（端点文档：https://manual.nssurge.com/tools/http-api.html）
import { fetch } from "scripting"
import { classifyTransportFailure, hostForUrl, shouldTryAlternateProtocol } from "./connection"
import {
  buildPolicyLatencyScript,
  chunk,
  parseEngineInfo,
  parseExternalPolicies,
  parsePolicyLatencyResults,
  parsePrometheus,
  normalizePolicyGroups,
  uptimeSecondsFromStartTime,
  type ExternalPolicy,
  type MetricSample,
} from "./metrics"

export type { ExternalPolicy }

export type SurgeConfig = {
  protocol: "http" | "https"
  host: string
  port: string
  key: string
}

export const DEFAULT_CONFIG: SurgeConfig = {
  // Surge 默认 http-api-tls = false；HTTPS 需在控制端安装并信任 Surge MITM CA
  protocol: "http",
  host: "127.0.0.1",
  port: "6166",
  key: "",
}

export type SurgeApiErrorKind =
  | "validation"
  | "auth"
  | "timeout"
  | "refused"
  | "tls"
  | "protocol"
  | "unsupported"
  | "http"
  | "network"

export class SurgeApiError extends Error {
  kind: SurgeApiErrorKind
  status?: number
  /** 非 2xx 响应体前 300 字，便于排查端点不存在 / 参数错误 */
  body?: string

  constructor(kind: SurgeApiErrorKind, message: string, status?: number, body?: string) {
    super(message)
    this.name = "SurgeApiError"
    this.kind = kind
    this.status = status
    this.body = body
  }
}

export function surgeApiErrorKind(error: unknown): SurgeApiErrorKind {
  return error instanceof SurgeApiError ? error.kind : "network"
}

export function surgeApiErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Scripting 的此选项只允许明文 HTTP，不会跳过 HTTPS 证书校验。 */
function allowInsecure(c: SurgeConfig): boolean {
  return c.protocol === "http"
}

function httpStatusError(status: number): SurgeApiError {
  if (status === 401 || status === 403) {
    return new SurgeApiError("auth", "API Key 无效或没有访问权限", status)
  }
  if (status === 404 || status === 405 || status === 501) {
    return new SurgeApiError("unsupported", `当前 Surge 不支持此端点（HTTP ${status}）`, status)
  }
  return new SurgeApiError("http", `Surge 返回 HTTP ${status}`, status)
}

function wrapFetchError(e: unknown): SurgeApiError {
  if (e instanceof SurgeApiError) return e
  const failure = classifyTransportFailure(e)
  return new SurgeApiError(failure.kind, failure.message)
}

/** 400 时 Surge 会在 body 里说明原因（未知资源 key、非法 IP 等） */
function badRequestDetail(text: string): string | null {
  if (!text) return null
  try {
    const body = JSON.parse(text) as { error?: unknown; message?: unknown }
    const msg = body?.error ?? body?.message
    if (typeof msg === "string" && msg) return msg
  } catch {}
  return text.length <= 200 ? text : null
}

export function urlOf(c: SurgeConfig, path: string): string {
  const port = c.port.trim()
  const portPart = port ? `:${port}` : ""
  return `${c.protocol}://${hostForUrl(c.host)}${portPart}${path}`
}

function apiHeaders(c: SurgeConfig, jsonBody: boolean): Record<string, string> {
  return {
    "X-Key": c.key.trim(),
    // 手册示例带 Accept。不要设置 Connection：Fetch 会拒绝这个被禁止的头，请求还没发出去就失败。
    Accept: "*/*",
    ...(jsonBody ? { "Content-Type": "application/json" } : {}),
  }
}

function endpointKey(c: SurgeConfig): string {
  return `${normalizeEndpointHost(c.host)}|${c.port.trim()}|${c.key}`
}

function normalizeEndpointHost(host: string): string {
  return host.trim().toLowerCase()
}

// 同一地址上，明文失败但 TLS 有响应（或反过来）时记住可用协议，避免每次都先撞一次拒绝连接。
const preferredProtocol = new Map<string, "http" | "https">()
const savedProtocolSeen = new Map<string, "http" | "https">()
const alternateBlockedUntil = new Map<string, number>()
const metricsSkipUntil = new Map<string, number>()

function noteSavedProtocol(c: SurgeConfig) {
  const key = endpointKey(c)
  const seen = savedProtocolSeen.get(key)
  // 用户在实例里改了协议后，丢掉自动探测结果，按新选择再试。
  if (seen && seen !== c.protocol) {
    preferredProtocol.delete(key)
    alternateBlockedUntil.delete(key)
    metricsSkipUntil.delete(key)
  }
  savedProtocolSeen.set(key, c.protocol)
}

export function protocolOverrideFor(c: SurgeConfig): "http" | "https" | null {
  noteSavedProtocol(c)
  const preferred = preferredProtocol.get(endpointKey(c))
  if (!preferred || preferred === c.protocol) return null
  return preferred
}

function effectiveConfig(c: SurgeConfig): SurgeConfig {
  noteSavedProtocol(c)
  const preferred = preferredProtocol.get(endpointKey(c))
  return preferred && preferred !== c.protocol ? { ...c, protocol: preferred } : c
}

function otherProtocol(protocol: "http" | "https"): "http" | "https" {
  return protocol === "http" ? "https" : "http"
}

function connectFailureKind(kind: string): boolean {
  return kind === "refused" || kind === "protocol" || kind === "tls" || kind === "network"
}

// Surge iOS 6 / Mac 6.11 的 HTTP API 同时只稳定接受少量连接，并行打过去会被直接拒绝。
let requestChain: Promise<unknown> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = requestChain.then(task, task)
  requestChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

async function fetchOnce(
  c: SurgeConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: string; timeoutSec: number; label: string }
): Promise<Awaited<ReturnType<typeof fetch>>> {
  return fetch(urlOf(c, path), {
    method: init.method,
    headers: apiHeaders(c, init.body !== undefined),
    body: init.body,
    timeout: init.timeoutSec,
    allowInsecureRequest: allowInsecure(c),
    debugLabel: init.label,
  })
}

async function fetchWithRetry(
  c: SurgeConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: string; timeoutSec: number; label: string }
): Promise<Awaited<ReturnType<typeof fetch>>> {
  try {
    return await fetchOnce(c, path, init)
  } catch (error) {
    const failure = classifyTransportFailure(error)
    if (failure.kind !== "refused") throw wrapFetchError(error)
    try {
      return await fetchOnce(c, path, init)
    } catch (retryError) {
      throw wrapFetchError(retryError)
    }
  }
}

/**
 * 先按实例里保存的协议请求。若端口直接拒绝或握手失败，再用另一种协议试一次：
 * Surge 打开 http-api-tls 后，明文请求会被重置，URLSession 只报 Could not connect to the server。
 */
async function surgeFetch(
  c: SurgeConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: string; timeoutSec: number; label: string }
): Promise<Awaited<ReturnType<typeof fetch>>> {
  return enqueue(() => surgeFetchQueued(c, path, init))
}

async function surgeFetchQueued(
  c: SurgeConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: string; timeoutSec: number; label: string }
): Promise<Awaited<ReturnType<typeof fetch>>> {
  const primary = effectiveConfig(c)
  try {
    return await fetchWithRetry(primary, path, init)
  } catch (error) {
    const failure = error instanceof SurgeApiError ? error : wrapFetchError(error)
    const key = endpointKey(c)
    const blocked = (alternateBlockedUntil.get(key) ?? 0) > Date.now()
    if (!shouldTryAlternateProtocol(failure.kind) || blocked) throw failure
    const alt: SurgeConfig = { ...primary, protocol: otherProtocol(primary.protocol) }
    try {
      const res = await fetchWithRetry(alt, path, init)
      preferredProtocol.set(key, alt.protocol)
      alternateBlockedUntil.delete(key)
      return res
    } catch (altError) {
      const altFailure = altError instanceof SurgeApiError ? altError : wrapFetchError(altError)
      alternateBlockedUntil.set(key, Date.now() + 30_000)
      if (altFailure.kind === "tls" || altFailure.kind === "auth") {
        preferredProtocol.set(key, alt.protocol)
        throw altFailure
      }
      throw failure
    }
  }
}

async function request<T>(
  c: SurgeConfig,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  timeoutSec = 30
): Promise<T> {
  const res = await surgeFetch(c, path, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    timeoutSec,
    label: `surge-panel ${method} ${path}`,
  })
  if (!res.ok) {
    const text = await res.text().then((t: string) => t.trim().slice(0, 300)).catch(() => "")
    if (res.status === 400) {
      const detail = badRequestDetail(text)
      if (detail) {
        const transport = classifyTransportFailure(detail)
        if (transport.kind === "refused" || transport.kind === "tls" || transport.kind === "protocol") {
          throw new SurgeApiError(transport.kind, transport.message, 400, text)
        }
        throw new SurgeApiError("http", detail, 400, text)
      }
    }
    const err = httpStatusError(res.status)
    err.body = text || undefined
    throw err
  }
  const text = await res.text()
  if (!text || text === "OK") return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new SurgeApiError("protocol", "响应不是 Surge HTTP API 的 JSON，请检查协议、主机与端口")
  }
}

function get<T>(c: SurgeConfig, path: string): Promise<T> {
  return request<T>(c, "GET", path)
}
function post<T>(c: SurgeConfig, path: string, body?: unknown, timeoutSec?: number): Promise<T> {
  return request<T>(c, "POST", path, body, timeoutSec)
}

// ---------- Metrics ----------

/** iOS 5.22+ / Mac 6.9+；商店版与 Mac 6.8 返回 404。没有端点时返回 null，不视为连接失败。 */
export async function fetchMetrics(c: SurgeConfig): Promise<MetricSample[] | null> {
  const res = await surgeFetch(c, "/v1/metrics", {
    method: "GET",
    timeoutSec: 15,
    label: "surge-panel metrics",
  })
  if (res.status === 404 || res.status === 405 || res.status === 501) return null
  if (!res.ok) throw httpStatusError(res.status)
  const text = (await res.text()).trim()
  if (!text || text.startsWith("{") || text.startsWith("[")) return null
  const samples = parsePrometheus(text)
  return samples.length > 0 ? samples : null
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
  data?: string | string[] | null
  logs?: string[]
  path?: string
  timeCost?: number
  expiresTime?: number
  comment?: string | null
  source?: string | null
}

// ---------- 请求与事件 ----------

function asRecordList<T>(raw: unknown, key: string): T[] {
  if (Array.isArray(raw)) return raw as T[]
  if (raw && typeof raw === "object") {
    const list = (raw as Record<string, unknown>)[key]
    if (Array.isArray(list)) return list as T[]
  }
  return []
}

export async function getActiveRequests(c: SurgeConfig): Promise<{ requests: SurgeRequest[] }> {
  return { requests: asRecordList<SurgeRequest>(await get<unknown>(c, "/v1/requests/active"), "requests") }
}

export async function getRecentRequests(c: SurgeConfig): Promise<{ requests: SurgeRequest[] }> {
  return { requests: asRecordList<SurgeRequest>(await get<unknown>(c, "/v1/requests/recent"), "requests") }
}

export const killRequest = (c: SurgeConfig, id: number) =>
  post<void>(c, "/v1/requests/kill", { id })

export async function getEvents(c: SurgeConfig): Promise<{ events: SurgeEvent[] }> {
  return { events: asRecordList<SurgeEvent>(await get<unknown>(c, "/v1/events"), "events") }
}

// ---------- 策略 ----------

export const getPolicies = (c: SurgeConfig) => get<{ proxies: string[] }>(c, "/v1/policies")

/**
 * include_external=true（Surge TestFlight 新增）：额外返回 policy-path 外部策略组里的节点。
 * 旧版本忽略该参数，external 为 null，调用方按「不支持」处理即可。
 */
export async function getPoliciesWithExternal(
  c: SurgeConfig
): Promise<{ proxies: string[]; external: ExternalPolicy[] | null }> {
  const r = await get<Record<string, unknown>>(c, "/v1/policies?include_external=true")
  const proxies = Array.isArray(r?.proxies) ? (r.proxies as unknown[]).map(String) : []
  return { proxies, external: parseExternalPolicies(r) }
}

const LATENCY_URL = "http://www.gstatic.com/generate_204"
const LATENCY_BATCH = 8
const LATENCY_TIMEOUT_SEC = 5

/**
 * 外部策略无法按名称交给 /v1/policies/test，只能在脚本里用 $httpClient 的 policy: identifier 发请求计时。
 * 数值是完整 HTTP 往返耗时，与 Surge 基准测试口径不同；需要 Surge 开启脚本功能。
 */
export async function testPoliciesByIdentifier(
  c: SurgeConfig,
  identifiers: string[],
  onBatch?: (partial: Record<string, number | null>) => void
): Promise<Record<string, number | null>> {
  const all: Record<string, number | null> = {}
  for (const batch of chunk(identifiers, LATENCY_BATCH)) {
    const raw = await evaluateScript(
      c,
      buildPolicyLatencyScript(batch, LATENCY_URL, LATENCY_TIMEOUT_SEC),
      "generic",
      LATENCY_TIMEOUT_SEC + 3
    )
    const parsed = parsePolicyLatencyResults(raw)
    if (!parsed) throw new SurgeApiError("protocol", "脚本未返回测速结果，请确认 Surge 已开启脚本功能")
    for (const id of batch) all[id] = parsed[id] ?? null
    onBatch?.({ ...all })
  }
  return all
}

// Surge 自身的基准测试缓存（iOS ≥4.9.5）：按 lineHash 覆盖所有节点（含组内嵌/链式节点）
export type PolicyBenchmarkResult = {
  lastTestErrorMessage: string | null
  lastTestScoreInMS: number
  testing?: number
  lastTestDate?: number
}

export const getPolicyBenchmarks = (c: SurgeConfig) =>
  get<Record<string, PolicyBenchmarkResult>>(c, "/v1/policies/benchmark_results")

export async function getPolicyGroups(c: SurgeConfig): Promise<Record<string, PolicyOption[]>> {
  return normalizePolicyGroups(await get<unknown>(c, "/v1/policy_groups"))
}

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

export type OutboundMode = "rule" | "proxy" | "direct"

export const getOutboundMode = (c: SurgeConfig) =>
  get<{ mode: OutboundMode }>(c, "/v1/outbound")

export type ProbeResult = {
  mode?: OutboundMode
  deviceName?: string
  version?: string
  build?: string
  latencyMs: number
}

function headerGet(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined
  const h = headers as { get?: (k: string) => string | null; [k: string]: unknown }
  if (typeof h.get === "function") {
    const v = h.get(name) ?? h.get(name.toLowerCase())
    return v ?? undefined
  }
  const v = h[name] ?? h[name.toLowerCase()]
  return typeof v === "string" ? v : undefined
}

/** 连通性探针：读 /v1/outbound，尽量带上版本头 */
export async function probeOutbound(c: SurgeConfig): Promise<ProbeResult> {
  const t0 = Date.now()
  const res = await surgeFetch(c, "/v1/outbound", {
    method: "GET",
    timeoutSec: 10,
    label: "surge-panel probe",
  })
  const latencyMs = Date.now() - t0
  if (!res.ok) {
    if (res.status === 404 || res.status === 405 || res.status === 501) {
      throw new SurgeApiError(
        "protocol",
        `目标不是可用的 Surge HTTP API（HTTP ${res.status}），请检查协议、主机与端口`,
        res.status
      )
    }
    throw httpStatusError(res.status)
  }
  let mode: OutboundMode | undefined
  try {
    const body = (await res.json()) as { mode?: OutboundMode }
    mode = body?.mode
  } catch {
    throw new SurgeApiError("protocol", "响应不是 Surge HTTP API 的 JSON，请检查协议、主机与端口")
  }
  return {
    mode,
    version: headerGet(res.headers, "x-surge-version"),
    build: headerGet(res.headers, "x-surge-build"),
    latencyMs,
  }
}

export const getEnvironment = (c: SurgeConfig) =>
  get<{ deviceName?: string }>(c, "/v1/environment")

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

export async function getRules(
  c: SurgeConfig
): Promise<{ rules: string[]; "available-policies": string[] }> {
  const r = await get<{ rules?: unknown; "available-policies"?: unknown } | undefined>(c, "/v1/rules")
  const rules = Array.isArray(r?.rules) ? r.rules.map(String) : []
  const policies = Array.isArray(r?.["available-policies"]) ? r["available-policies"].map(String) : []
  return { rules, "available-policies": policies }
}

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

export const evaluateScript = (
  c: SurgeConfig,
  scriptText: string,
  mockType = "cron",
  timeout = 5
) =>
  post<unknown>(c, "/v1/scripting/evaluate", {
    script_text: scriptText,
    mock_type: mockType,
    timeout,
  })

// ---------- 策略详情 ----------

export const getPolicyDetail = (c: SurgeConfig, policyName: string) =>
  get<Record<string, string>>(
    c,
    `/v1/policies/detail?policy_name=${encodeURIComponent(policyName)}`
  )

// ---------- 日志级别 / 配置 ----------

export const setLogLevel = (c: SurgeConfig, level: string) =>
  post<void>(c, "/v1/log/level", { level })

export const getCurrentProfile = (c: SurgeConfig, sensitive = false) =>
  get<{ profile?: string } | string>(c, `/v1/profiles/current?sensitive=${sensitive ? 1 : 0}`)

export type ProfileLine =
  | { kind: "kv"; key: string; value: string }
  | { kind: "text"; text: string }

export type ProfileSection = {
  name: string
  lines: ProfileLine[]
}

/** 把 Surge 配置按 [Section] 切开，便于列表展示 */
export function parseProfileSections(profile: string): ProfileSection[] {
  const sections: ProfileSection[] = []
  let current: ProfileSection = { name: "", lines: [] }

  const pushCurrent = () => {
    if (current.name !== "" || current.lines.length > 0) sections.push(current)
  }

  for (const raw of profile.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (/^\[.+\]$/.test(line)) {
      pushCurrent()
      current = { name: line.slice(1, -1).trim(), lines: [] }
      continue
    }
    const eq = line.indexOf("=")
    if (eq > 0 && !line.startsWith("#") && !line.startsWith(";") && !line.startsWith("//")) {
      current.lines.push({
        kind: "kv",
        key: line.slice(0, eq).trim(),
        value: line.slice(eq + 1).trim(),
      })
      continue
    }
    current.lines.push({ kind: "text", text: line })
  }
  pushCurrent()
  return sections
}

/** 逗号分隔的长值拆成多行，避免挤成一块 */
export function formatProfileValue(value: string): string {
  if (!value.includes(",")) return value
  const parts = value.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
  if (parts.length < 3 && value.length < 60) return value
  return parts.join(",\n")
}

// [Proxy Group] 顺序要拉整份配置才能解析，代价高且只在配置重载时才会变。
// 缓存到内存：面板内重载配置会失效；Surge 侧改配置后可下拉刷新强制重取。
let proxyGroupOrderCache: { key: string; order: string[] } | null = null

function configCacheKey(c: SurgeConfig): string {
  return `${c.protocol}://${c.host.trim()}:${c.port.trim()}`
}

export function invalidateProfileCache() {
  proxyGroupOrderCache = null
}

export async function getProxyGroupOrder(c: SurgeConfig, force = false): Promise<string[]> {
  const key = configCacheKey(c)
  if (!force && proxyGroupOrderCache?.key === key) return proxyGroupOrderCache.order
  const raw = await getCurrentProfile(c)
  const profile = typeof raw === "string" ? raw : (raw.profile ?? "")
  const order = parseProxyGroupOrder(profile)
  proxyGroupOrderCache = { key, order }
  return order
}

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

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  mitm: "MitM",
  capture: "捕获",
  rewrite: "重写",
  scripting: "脚本",
}

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

/** 官方文档标注的版本；TestFlight 的 5.102.x 构建即 5.23 RC，面板只看端点是否响应，不比较版本号 */
export const API_523_MIN_VERSION = "Surge iOS 5.23 / Mac 6.10（含 TestFlight 5.102）"

export type EngineInfo = { version?: string; build?: string; system?: string }

/** 正在响应 HTTP API 的 Surge 引擎版本：优先响应头，其次 $environment（需脚本功能开启） */
export async function getEngineInfo(c: SurgeConfig): Promise<EngineInfo> {
  const probe = await probeOutbound(c).catch(() => null)
  if (probe?.version || probe?.build) return { version: probe.version, build: probe.build }
  const raw = await evaluateScript(c, "$done($environment)", "generic", 3).catch(() => null)
  return parseEngineInfo(raw)
}

// ---------- 外部资源 ----------

export type ExternalResourceType = "ruleset" | "domainset" | "script" | "policy-group" | "data"

export type ExternalResource = {
  path: string
  type: ExternalResourceType | string
  key: string
  local: boolean
  ready: boolean
  /** Unix 秒；0 表示从未下载成功；本地资源没有此字段 */
  updatedAt?: number
  updating?: boolean
  fromModule?: string | null
  error?: string
}

export const getExternalResources = (c: SurgeConfig) =>
  get<{ defines?: ExternalResource[] }>(c, "/v1/external_resources")

/** key 为 "all" 时更新全部远程资源；返回 key → "success" 或错误信息。Surge 下载完才响应，全部更新给足时间 */
export const updateExternalResource = (c: SurgeConfig, key: string) =>
  post<Record<string, string> | undefined>(
    c,
    "/v1/external_resources/update",
    { key },
    key === "all" ? 180 : 60
  )

// ---------- GeoIP ----------

export type GeoIpResult = {
  address: string
  country: string | null
  asn: number | null
  organization: string | null
  "geoip-db-date": number | null
  "asn-db-date": number | null
}

export const lookupGeoIp = (c: SurgeConfig, ip: string) =>
  get<GeoIpResult>(c, `/v1/geoip?ip=${encodeURIComponent(ip)}`)

// 连接详情会反复打开同一远端，查询结果按实例缓存；「不支持」只记 1 分钟，重启 / 升级引擎后能自动恢复
const geoIpCache = new Map<string, GeoIpResult>()
const geoIpUnsupportedAt = new Map<string, number>()
const UNSUPPORTED_TTL_MS = 60_000

export function isGeoIpUnsupported(c: SurgeConfig): boolean {
  const at = geoIpUnsupportedAt.get(configCacheKey(c))
  return at !== undefined && Date.now() - at < UNSUPPORTED_TTL_MS
}

export function resetGeoIpSupport(c: SurgeConfig) {
  geoIpUnsupportedAt.delete(configCacheKey(c))
}

export async function lookupGeoIpCached(c: SurgeConfig, ip: string): Promise<GeoIpResult | null> {
  const scope = configCacheKey(c)
  if (isGeoIpUnsupported(c)) return null
  const key = `${scope}|${ip}`
  const hit = geoIpCache.get(key)
  if (hit) return hit
  try {
    const r = await lookupGeoIp(c, ip)
    if (geoIpCache.size >= 500) geoIpCache.clear()
    geoIpCache.set(key, r)
    return r
  } catch (e) {
    if (surgeApiErrorKind(e) === "unsupported") {
      geoIpUnsupportedAt.set(scope, Date.now())
      return null
    }
    throw e
  }
}

/** 商店版没有 /metrics 时，用 traffic / requests / dns 拼出仪表盘可用的 gauge */
async function fallbackOverviewSamples(
  c: SurgeConfig,
  traffic?: TrafficSnapshot | null
): Promise<MetricSample[]> {
  const samples: MetricSample[] = []
  const snap = traffic ?? (await getTraffic(c))
  if (snap) {
    const uptime = uptimeSecondsFromStartTime(snap.startTime)
    if (uptime !== null) {
      samples.push({ name: "surge_uptime_seconds", labels: {}, value: uptime })
    }
  }
  const [active, dns] = await Promise.all([
    getActiveRequests(c)
      .then((r) => r.requests?.length ?? 0)
      .catch((error) => {
        if (surgeApiErrorKind(error) === "auth") throw error
        return null as number | null
      }),
    getDns(c)
      .then((r) => r.dnsCache?.length ?? 0)
      .catch((error) => {
        if (surgeApiErrorKind(error) === "auth") throw error
        return null as number | null
      }),
  ])
  if (active !== null) samples.push({ name: "surge_active_requests", labels: {}, value: active })
  if (dns !== null) samples.push({ name: "surge_dns_cache_entries", labels: {}, value: dns })
  return samples
}

export async function fetchOverviewSamples(
  c: SurgeConfig,
  opts?: { skipMetrics?: boolean; traffic?: TrafficSnapshot | null }
): Promise<{ samples: MetricSample[]; fromMetrics: boolean }> {
  const skipMetrics = opts?.skipMetrics || (metricsSkipUntil.get(endpointKey(c)) ?? 0) > Date.now()
  if (!skipMetrics) {
    try {
      const metrics = await fetchMetrics(c)
      if (metrics) return { samples: metrics, fromMetrics: true }
    } catch (error) {
      if (surgeApiErrorKind(error) === "auth") throw error
      // /v1/metrics 在部分新构建上会直接重置连接。这次改走 HTTP API，并暂停再打 metrics，
      // 否则每一次轮询都先把监听打断，出站模式和流量会一起显示成连不上。
      if (connectFailureKind(surgeApiErrorKind(error))) {
        metricsSkipUntil.set(endpointKey(c), Date.now() + 60_000)
      } else {
        throw error
      }
    }
  }
  return { samples: await fallbackOverviewSamples(c, opts?.traffic), fromMetrics: false }
}

// ---------- 配置 / 引擎 ----------

export async function reloadProfile(c: SurgeConfig): Promise<void> {
  await post<void>(c, "/v1/profiles/reload")
  invalidateProfileCache()
}

export const stopEngine = (c: SurgeConfig) => post<void>(c, "/v1/stop")
