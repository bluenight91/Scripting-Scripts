// 纯逻辑：套餐限额、计费周期、GraphQL / Observability 请求构造与解析、错误解析、格式化。
// 不依赖 "scripting" 运行时，可用 node --experimental-strip-types 直接验证。

// ---------- 套餐与限额（developers.cloudflare.com/workers/platform/limits & pricing） ----------

export type Plan = "free" | "paid"

export const PLAN_LIMITS = {
  free: {
    /** 账户级：Workers + Pages Functions 合计，每天 00:00 UTC 重置 */
    requestsPerDay: 100_000,
    cpuPerInvocationMs: 10,
    subrequestsPerInvocation: 50,
  },
  paid: {
    /** 账户级：每个账单周期包含量，超出按量计费 */
    requestsPerMonth: 10_000_000,
    cpuMsPerMonth: 30_000_000,
    cpuPerInvocationMs: 30_000,
    cpuPerInvocationMaxMs: 300_000,
    subrequestsPerInvocation: 10_000,
    baseUSD: 5,
    requestOverageUSDPerMillion: 0.3,
    cpuOverageUSDPerMillionMs: 0.02,
  },
} as const

export function planLabel(plan: Plan): string {
  return plan === "free" ? "Workers Free" : "Workers Paid"
}

/** 周期内的请求包含量 */
export function requestQuota(plan: Plan): number {
  return plan === "free" ? PLAN_LIMITS.free.requestsPerDay : PLAN_LIMITS.paid.requestsPerMonth
}

export function cpuPerInvocationLimitMs(plan: Plan): number {
  return plan === "free" ? PLAN_LIMITS.free.cpuPerInvocationMs : PLAN_LIMITS.paid.cpuPerInvocationMs
}

export type Overage = { requestsUSD: number; cpuUSD: number; totalUSD: number }

/** Workers Paid 超额估算（不含 $5 月费）；cpuMs 为 null 时只算请求 */
export function estimateOverage(requests: number, cpuMs: number | null): Overage {
  const p = PLAN_LIMITS.paid
  const extraReq = Math.max(0, requests - p.requestsPerMonth)
  const extraCpu = cpuMs == null ? 0 : Math.max(0, cpuMs - p.cpuMsPerMonth)
  const requestsUSD = (extraReq / 1_000_000) * p.requestOverageUSDPerMillion
  const cpuUSD = (extraCpu / 1_000_000) * p.cpuOverageUSDPerMillionMs
  return { requestsUSD, cpuUSD, totalUSD: requestsUSD + cpuUSD }
}

export function ratio(used: number, limit: number): number {
  if (!(limit > 0) || !Number.isFinite(used)) return 0
  return Math.max(0, used / limit)
}

// ---------- 周期 ----------

export type TimeRange = { start: Date; end: Date }

const DAY_MS = 86_400_000

export function utcDayRange(now: Date): TimeRange {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return { start, end: new Date(start.getTime() + DAY_MS) }
}

export function clampCycleDay(day: number): number {
  if (!Number.isFinite(day)) return 1
  return Math.min(28, Math.max(1, Math.round(day)))
}

/** 账单周期：每月 cycleDay 日 00:00 UTC 起算（1~28，避免短月份没有该日） */
export function billingRange(now: Date, cycleDay: number): TimeRange {
  const d = clampCycleDay(cycleDay)
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  let start = new Date(Date.UTC(y, m, d))
  if (start.getTime() > now.getTime()) start = new Date(Date.UTC(y, m - 1, d))
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, d))
  return { start, end }
}

/** 限额统计周期：Free 为当天（UTC），Paid 为当前账单周期 */
export function quotaRange(plan: Plan, now: Date, cycleDay: number): TimeRange {
  return plan === "free" ? utcDayRange(now) : billingRange(now, cycleDay)
}

/** 按最大跨度切分时间段（GraphQL 单个节点有时间跨度上限时使用） */
export function splitRange(range: TimeRange, maxMs: number): TimeRange[] {
  const out: TimeRange[] = []
  let t = range.start.getTime()
  const end = range.end.getTime()
  while (t < end) {
    const next = Math.min(end, t + maxMs)
    out.push({ start: new Date(t), end: new Date(next) })
    t = next
  }
  return out.length > 0 ? out : [range]
}

export type DetailRangeId = "1h" | "24h" | "7d" | "period"
export type Bucket = "minute" | "hour"

export const DETAIL_RANGES: { id: DetailRangeId; title: string }[] = [
  { id: "1h", title: "1 小时" },
  { id: "24h", title: "24 小时" },
  { id: "7d", title: "7 天" },
  { id: "period", title: "本周期" },
]

export type DetailWindow = TimeRange & { bucket: Bucket; daily: boolean }

/** 详情页时间窗：end 为 now；跨度超过 2 天时按小时取数后在客户端合并为天 */
export function detailWindow(id: DetailRangeId, plan: Plan, now: Date, cycleDay: number): DetailWindow {
  const end = now
  let start: Date
  if (id === "1h") start = new Date(now.getTime() - 3_600_000)
  else if (id === "24h") start = new Date(now.getTime() - DAY_MS)
  else if (id === "7d") start = new Date(now.getTime() - 7 * DAY_MS)
  else start = quotaRange(plan, now, cycleDay).start
  const span = end.getTime() - start.getTime()
  return { start, end, bucket: id === "1h" ? "minute" : "hour", daily: span > 2 * DAY_MS }
}

// ---------- 项目 ----------

export type ProjectKind = "worker" | "pages"

export type Project = {
  kind: ProjectKind
  /** Worker 脚本名 / Pages 项目名 */
  name: string
  /** GraphQL 里的 scriptName：Worker 同 name；Pages 为 production_script_name */
  scriptName: string
  modifiedOn?: string
  subtitle?: string
}

export function projectKey(p: Pick<Project, "kind" | "name">): string {
  return `${p.kind}:${p.name}`
}

/** GET /accounts/{id}/workers/scripts 的 result */
export function parseWorkerScripts(result: unknown): Project[] {
  if (!Array.isArray(result)) return []
  const out: Project[] = []
  for (const r of result) {
    const id = typeof r?.id === "string" ? r.id : null
    if (!id) continue
    out.push({
      kind: "worker",
      name: id,
      scriptName: id,
      modifiedOn: typeof r.modified_on === "string" ? r.modified_on : undefined,
      subtitle: Array.isArray(r.handlers) && r.handlers.length > 0 ? r.handlers.join(" · ") : undefined,
    })
  }
  return out.sort((a, b) => (b.modifiedOn ?? "").localeCompare(a.modifiedOn ?? ""))
}

/** GET /accounts/{id}/pages/projects 的 result */
export function parsePagesProjects(result: unknown): Project[] {
  if (!Array.isArray(result)) return []
  const out: Project[] = []
  for (const r of result) {
    const name = typeof r?.name === "string" ? r.name : null
    if (!name) continue
    const script = typeof r.production_script_name === "string" && r.production_script_name
      ? r.production_script_name
      : `pages-worker--${r.id ?? name}-production`
    out.push({
      kind: "pages",
      name,
      scriptName: script,
      modifiedOn: typeof r.latest_deployment?.modified_on === "string" ? r.latest_deployment.modified_on : r.created_on,
      subtitle: typeof r.subdomain === "string" ? r.subdomain : undefined,
    })
  }
  return out.sort((a, b) => (b.modifiedOn ?? "").localeCompare(a.modifiedOn ?? ""))
}

// ---------- GraphQL Analytics ----------

export const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql"

export type Dataset = "workersInvocationsAdaptive" | "pagesFunctionsInvocationsAdaptiveGroups"

export function datasetOf(kind: ProjectKind): Dataset {
  return kind === "worker" ? "workersInvocationsAdaptive" : "pagesFunctionsInvocationsAdaptiveGroups"
}

export type GraphqlBody = { query: string; variables: Record<string, string> }

/**
 * rich=true 请求 cpuTimeUs / wallTime / quantiles / status 等扩展字段；
 * 若账户或数据集不支持（GraphQL 报 unknown field），调用方退回 rich=false 的最小查询。
 */
export type QueryFlavor = { rich: boolean }

function rangeFilter(i: number, script?: boolean): string {
  return `{ ${script ? "scriptName: $script, " : ""}datetime_geq: $s${i}, datetime_leq: $e${i} }`
}

function rangeVars(ranges: TimeRange[]): { decl: string; vars: Record<string, string> } {
  const decl: string[] = []
  const vars: Record<string, string> = {}
  ranges.forEach((r, i) => {
    decl.push(`$s${i}: string`, `$e${i}: string`)
    vars[`s${i}`] = r.start.toISOString()
    // datetime_leq 含端点：减 1 秒，避免与下一段重复
    vars[`e${i}`] = new Date(r.end.getTime() - 1000).toISOString()
  })
  return { decl: decl.join(", "), vars }
}

/** 账户级用量：按 scriptName 分组，Workers 与 Pages Functions 各一个节点（可按多段时间拆分） */
export function buildUsageQuery(accountId: string, ranges: TimeRange[], flavor: QueryFlavor): GraphqlBody {
  const { decl, vars } = rangeVars(ranges)
  const wSum = flavor.rich ? "requests errors subrequests cpuTimeUs" : "requests errors subrequests"
  const nodes = ranges
    .map((_, i) => `
      w${i}: workersInvocationsAdaptive(limit: 1000, filter: ${rangeFilter(i)}) {
        sum { ${wSum} }
        dimensions { scriptName }
      }
      p${i}: pagesFunctionsInvocationsAdaptiveGroups(limit: 1000, filter: ${rangeFilter(i)}) {
        sum { requests errors subrequests }
        dimensions { scriptName }
      }`)
    .join("")
  return {
    query: `query CfUsage($accountTag: string, ${decl}) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {${nodes}
    }
  }
}`,
    variables: { accountTag: accountId, ...vars },
  }
}

export type Totals = {
  requests: number
  errors: number
  subrequests: number
  /** 仅 Workers 且 rich 查询时有值 */
  cpuTimeUs: number | null
}

export function emptyTotals(): Totals {
  return { requests: 0, errors: 0, subrequests: 0, cpuTimeUs: null }
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  return Number.isFinite(n) ? n : 0
}

function rowsOf(v: unknown): any[] {
  return Array.isArray(v) ? v : []
}

function addTotals(into: Totals, sum: any) {
  into.requests += num(sum?.requests)
  into.errors += num(sum?.errors)
  into.subrequests += num(sum?.subrequests)
  if (sum && sum.cpuTimeUs != null) into.cpuTimeUs = (into.cpuTimeUs ?? 0) + num(sum.cpuTimeUs)
}

export type UsageData = {
  workers: Record<string, Totals>
  pages: Record<string, Totals>
  account: Totals
  workersTotal: Totals
  pagesTotal: Totals
}

function firstAccount(data: any): any {
  const accounts = data?.viewer?.accounts
  return Array.isArray(accounts) ? accounts[0] ?? null : null
}

export function parseUsage(data: unknown, rangeCount: number): UsageData {
  const acc = firstAccount(data)
  const workers: Record<string, Totals> = {}
  const pages: Record<string, Totals> = {}
  const workersTotal = emptyTotals()
  const pagesTotal = emptyTotals()
  for (let i = 0; i < rangeCount; i++) {
    for (const row of rowsOf(acc?.[`w${i}`])) {
      const name = String(row?.dimensions?.scriptName ?? "")
      const t = (workers[name] ??= emptyTotals())
      addTotals(t, row?.sum)
      addTotals(workersTotal, row?.sum)
    }
    for (const row of rowsOf(acc?.[`p${i}`])) {
      const name = String(row?.dimensions?.scriptName ?? "")
      const t = (pages[name] ??= emptyTotals())
      addTotals(t, row?.sum)
      addTotals(pagesTotal, row?.sum)
    }
  }
  const account = emptyTotals()
  addTotals(account, workersTotal)
  account.requests = workersTotal.requests + pagesTotal.requests
  account.errors = workersTotal.errors + pagesTotal.errors
  account.subrequests = workersTotal.subrequests + pagesTotal.subrequests
  return { workers, pages, account, workersTotal, pagesTotal }
}

export function totalsFor(usage: UsageData, p: Pick<Project, "kind" | "scriptName">): Totals {
  const map = p.kind === "worker" ? usage.workers : usage.pages
  return map[p.scriptName] ?? emptyTotals()
}

export type QuotaSummary = {
  plan: Plan
  requests: number
  requestLimit: number
  requestRatio: number
  /** 账户 Workers CPU 毫秒（Pages Functions 不提供）；Free 不计量 */
  cpuMs: number | null
  cpuLimitMs: number | null
  cpuRatio: number | null
  resetAt: number
  overage: Overage | null
  project: { requests: number; errors: number; cpuMs: number | null; share: number } | null
}

export function summarizeQuota(
  plan: Plan,
  usage: UsageData,
  period: TimeRange,
  project?: Pick<Project, "kind" | "scriptName"> | null
): QuotaSummary {
  const requests = usage.account.requests
  const requestLimit = requestQuota(plan)
  const cpuMs = usage.workersTotal.cpuTimeUs == null ? null : usage.workersTotal.cpuTimeUs / 1000
  const paid = plan === "paid"
  const cpuLimitMs = paid ? PLAN_LIMITS.paid.cpuMsPerMonth : null
  let proj: QuotaSummary["project"] = null
  if (project) {
    const t = totalsFor(usage, project)
    proj = {
      requests: t.requests,
      errors: t.errors,
      cpuMs: t.cpuTimeUs == null ? null : t.cpuTimeUs / 1000,
      share: ratio(t.requests, requests),
    }
  }
  return {
    plan,
    requests,
    requestLimit,
    requestRatio: ratio(requests, requestLimit),
    cpuMs,
    cpuLimitMs,
    cpuRatio: paid && cpuMs != null && cpuLimitMs ? ratio(cpuMs, cpuLimitMs) : null,
    resetAt: period.end.getTime(),
    overage: paid ? estimateOverage(requests, cpuMs) : null,
    project: proj,
  }
}

/** 单个项目详情：合计、状态分布、时间序列 */
export function buildDetailQuery(
  accountId: string,
  kind: ProjectKind,
  scriptName: string,
  win: TimeRange & { bucket: Bucket },
  flavor: QueryFlavor
): GraphqlBody {
  const ds = datasetOf(kind)
  const dim = win.bucket === "minute" ? "datetimeMinute" : "datetimeHour"
  const f = rangeFilter(0, true)
  const sumFields = flavor.rich
    ? kind === "worker"
      ? "requests errors subrequests cpuTimeUs wallTime"
      : "requests errors subrequests"
    : "requests errors subrequests"
  const rich = flavor.rich
    ? `
      quantiles { cpuTimeP50 cpuTimeP99 wallTimeP50 wallTimeP99 }`
    : ""
  const statuses = flavor.rich
    ? `
      statuses: ${ds}(limit: 50, filter: ${f}) {
        sum { requests errors }
        dimensions { status }
      }`
    : ""
  const { decl, vars } = rangeVars([win])
  return {
    query: `query CfDetail($accountTag: string, $script: string, ${decl}) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      totals: ${ds}(limit: 100, filter: ${f}) {
        sum { ${sumFields} }${rich}
      }${statuses}
      series: ${ds}(limit: 5000, filter: ${f}, orderBy: [${dim}_ASC]) {
        sum { requests errors }
        dimensions { ts: ${dim} }
      }
    }
  }
}`,
    variables: { accountTag: accountId, script: scriptName, ...vars },
  }
}

export type SeriesPoint = { t: number; requests: number; errors: number }
export type StatusRow = { status: string; requests: number; errors: number }

export type DetailData = {
  totals: Totals & { wallTimeUs: number | null }
  /** 微秒；没有 quantiles 时为 null */
  cpuP50Us: number | null
  cpuP99Us: number | null
  wallP50Us: number | null
  wallP99Us: number | null
  statuses: StatusRow[] | null
  series: SeriesPoint[]
}

function maxOrNull(rows: any[], key: string): number | null {
  let best: number | null = null
  for (const r of rows) {
    const v = r?.quantiles?.[key]
    if (v == null) continue
    const n = num(v)
    best = best == null ? n : Math.max(best, n)
  }
  return best
}

export function parseDetail(data: unknown, daily: boolean): DetailData {
  const acc = firstAccount(data)
  const totalRows = rowsOf(acc?.totals)
  const totals = { ...emptyTotals(), wallTimeUs: null as number | null }
  for (const r of totalRows) {
    addTotals(totals, r?.sum)
    if (r?.sum?.wallTime != null) totals.wallTimeUs = (totals.wallTimeUs ?? 0) + num(r.sum.wallTime)
  }
  let statuses: StatusRow[] | null = null
  if (acc && "statuses" in acc) {
    const map = new Map<string, StatusRow>()
    for (const r of rowsOf(acc.statuses)) {
      const s = String(r?.dimensions?.status ?? "unknown")
      const row = map.get(s) ?? { status: s, requests: 0, errors: 0 }
      row.requests += num(r?.sum?.requests)
      row.errors += num(r?.sum?.errors)
      map.set(s, row)
    }
    statuses = [...map.values()].sort((a, b) => b.requests - a.requests)
  }
  const raw: SeriesPoint[] = []
  for (const r of rowsOf(acc?.series)) {
    const t = Date.parse(String(r?.dimensions?.ts ?? ""))
    if (!Number.isFinite(t)) continue
    raw.push({ t, requests: num(r?.sum?.requests), errors: num(r?.sum?.errors) })
  }
  return {
    totals,
    cpuP50Us: maxOrNull(totalRows, "cpuTimeP50"),
    cpuP99Us: maxOrNull(totalRows, "cpuTimeP99"),
    wallP50Us: maxOrNull(totalRows, "wallTimeP50"),
    wallP99Us: maxOrNull(totalRows, "wallTimeP99"),
    statuses,
    series: daily ? mergeDaily(raw) : mergeSame(raw),
  }
}

function mergeSame(points: SeriesPoint[]): SeriesPoint[] {
  const map = new Map<number, SeriesPoint>()
  for (const p of points) {
    const cur = map.get(p.t)
    if (cur) {
      cur.requests += p.requests
      cur.errors += p.errors
    } else map.set(p.t, { ...p })
  }
  return [...map.values()].sort((a, b) => a.t - b.t)
}

/** 小时点合并为本地自然日 */
export function mergeDaily(points: SeriesPoint[]): SeriesPoint[] {
  return mergeSame(
    points.map((p) => {
      const d = new Date(p.t)
      return { ...p, t: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
    })
  )
}

/** 补齐时间序列中缺失的桶（请求为 0 的时段 GraphQL 不返回行） */
export function fillSeries(points: SeriesPoint[], start: Date, end: Date, stepMs: number): SeriesPoint[] {
  const map = new Map(points.map((p) => [p.t, p]))
  const out: SeriesPoint[] = []
  const first = Math.floor(start.getTime() / stepMs) * stepMs
  for (let t = first; t < end.getTime(); t += stepMs) {
    out.push(map.get(t) ?? { t, requests: 0, errors: 0 })
  }
  return out
}

/** GraphQL 报字段不存在 → 退回最小查询 */
export function isSchemaError(message: string): boolean {
  return /unknown field|cannot query field|undefined field|no such field|not (a )?valid field|unknown (argument|enum)|quantiles|cpuTimeUs|wallTime/i.test(message)
}

/** GraphQL 报时间跨度过大 → 拆段重试 */
export function isRangeError(message: string): boolean {
  return /time range|duration|too (large|long|wide)|exceed|cannot request data older|max(imum)? (allowed )?(range|period)/i.test(message)
}

// ---------- 调用状态 ----------

const STATUS_LABELS: Record<string, string> = {
  success: "成功",
  clientDisconnected: "客户端断开",
  scriptThrewException: "脚本异常",
  exceededCpu: "超出 CPU 限制",
  exceededMemory: "超出内存限制",
  exceededResources: "超出资源限制",
  internalError: "内部错误",
  loadShed: "负载丢弃",
  responseStreamDisconnected: "响应流断开",
  unknown: "未知",
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

export function isBadStatus(status: string): boolean {
  return status !== "success" && status !== "clientDisconnected" && status !== "responseStreamDisconnected"
}

// ---------- Workers Observability（/workers/observability/telemetry/query） ----------

export type ObsFilter =
  | { key: string; operation: string; type: "string" | "number" | "boolean"; value?: string | number | boolean }
  | { kind: "group"; filterCombination: "and" | "or"; filters: ObsFilter[] }

export type TelemetryBody = {
  queryId: string
  timeframe: { from: number; to: number }
  view: "events" | "calculations" | "invocations"
  limit?: number
  dry?: boolean
  parameters: {
    filters?: ObsFilter[]
    filterCombination?: "and" | "or"
    calculations?: { operator: string; alias?: string; key?: string; keyType?: string }[]
    groupBys?: { type: "string" | "number" | "boolean"; value: string }[]
    orderBy?: { value: string; order: "asc" | "desc" }
    limit?: number
    needle?: { value: string; isRegex: boolean; matchCase: boolean }
  }
}

function serviceFilter(service: string): ObsFilter {
  return { key: "$metadata.service", operation: "eq", type: "string", value: service }
}

export const ERROR_GROUP: ObsFilter = {
  kind: "group",
  filterCombination: "or",
  filters: [
    { key: "$metadata.level", operation: "eq", type: "string", value: "error" },
    { key: "$metadata.error", operation: "exists", type: "string" },
    { key: "$workers.outcome", operation: "in", type: "string", value: "exception,exceededCpu,exceededMemory,exceededResources" },
  ],
}

export function buildEventsBody(opts: {
  service: string
  from: number
  to: number
  errorsOnly?: boolean
  search?: string
  limit?: number
}): TelemetryBody {
  const filters: ObsFilter[] = [serviceFilter(opts.service)]
  if (opts.errorsOnly) filters.push(ERROR_GROUP)
  const search = opts.search?.trim()
  return {
    queryId: "cf-observability-events",
    timeframe: { from: opts.from, to: opts.to },
    view: "events",
    limit: opts.limit ?? 50,
    parameters: {
      filterCombination: "and",
      filters,
      ...(search ? { needle: { value: search, isRegex: false, matchCase: false } } : {}),
    },
  }
}

export type GroupKey = { id: string; title: string; key: string; type: "string" | "number" }

export const GROUP_KEYS: GroupKey[] = [
  { id: "path", title: "路径", key: "$workers.event.request.path", type: "string" },
  { id: "status", title: "状态码", key: "$workers.event.response.status", type: "number" },
  { id: "outcome", title: "结果", key: "$workers.outcome", type: "string" },
  { id: "country", title: "国家", key: "$workers.event.request.cf.country", type: "string" },
  { id: "colo", title: "数据中心", key: "$workers.event.request.cf.colo", type: "string" },
]

export function buildTopBody(opts: { service: string; from: number; to: number; group: GroupKey; limit?: number }): TelemetryBody {
  return {
    queryId: "cf-observability-top",
    timeframe: { from: opts.from, to: opts.to },
    view: "calculations",
    parameters: {
      filterCombination: "and",
      filters: [serviceFilter(opts.service), { key: opts.group.key, operation: "exists", type: opts.group.type }],
      calculations: [{ operator: "count", alias: "count" }],
      groupBys: [{ type: opts.group.type, value: opts.group.key }],
      orderBy: { value: "count", order: "desc" },
      limit: opts.limit ?? 10,
    },
  }
}

export type LogEvent = {
  id: string
  time: number
  level: string
  message: string
  error: string | null
  requestId: string | null
  method: string | null
  url: string | null
  path: string | null
  statusCode: number | null
  outcome: string | null
  cpuMs: number | null
  wallMs: number | null
  trigger: string | null
  country: string | null
  raw: unknown
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : typeof v === "number" ? String(v) : null
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function pathOf(url: string | null): string | null {
  if (!url) return null
  const m = /^[a-z]+:\/\/[^/]+(\/[^?#]*)?/i.exec(url)
  return m ? m[1] || "/" : null
}

export function parseEvent(e: any, index = 0): LogEvent {
  const md = e?.$metadata ?? {}
  const w = e?.$workers ?? {}
  const req = w?.event?.request ?? {}
  const res = w?.event?.response ?? {}
  const url = str(md.url) ?? str(req.url)
  const message = str(md.message) ?? str(md.error) ?? (url ? `${str(req.method) ?? ""} ${url}`.trim() : "")
  return {
    id: str(md.id) ?? `${e?.timestamp ?? 0}-${index}`,
    time: num(e?.timestamp),
    level: str(md.level) ?? "info",
    message,
    error: str(md.error),
    requestId: str(md.requestId) ?? str(w.requestId),
    method: str(req.method),
    url,
    path: str(req.path) ?? pathOf(url),
    statusCode: numOrNull(md.statusCode) ?? numOrNull(res.status),
    outcome: str(w.outcome),
    cpuMs: numOrNull(w.cpuTimeMs),
    wallMs: numOrNull(w.wallTimeMs),
    trigger: str(md.trigger),
    country: str(req.cf?.country),
    raw: e,
  }
}

export function parseEvents(result: any): { events: LogEvent[]; count: number } {
  const list = rowsOf(result?.events?.events)
  return {
    events: list.map((e, i) => parseEvent(e, i)).sort((a, b) => b.time - a.time),
    count: num(result?.events?.count) || list.length,
  }
}

export type TopRow = { label: string; count: number }

export function parseTop(result: any): TopRow[] {
  const calc = rowsOf(result?.calculations)[0]
  const out: TopRow[] = []
  for (const a of rowsOf(calc?.aggregates)) {
    const g = rowsOf(a?.groups)[0]
    const label = g?.value == null || g.value === "" ? "（空）" : String(g.value)
    out.push({ label, count: num(a?.value ?? a?.count) })
  }
  return out.sort((a, b) => b.count - a.count)
}

export function levelTone(level: string, outcome: string | null): "red" | "orange" | "blue" | "gray" | "green" {
  if (level === "error" || (outcome != null && outcome !== "ok" && outcome !== "canceled")) return "red"
  if (level === "warn" || level === "warning") return "orange"
  if (level === "debug") return "gray"
  return level === "log" || level === "info" ? "blue" : "green"
}

// ---------- REST 请求 / 错误 ----------

export const API_BASE = "https://api.cloudflare.com/client/v4"

export function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token.trim()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  }
}

export function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const q = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : ""
  return `${API_BASE}${path}${q ? `?${q}` : ""}`
}

const CODE_HINTS: Record<number, string> = {
  10000: "认证失败：令牌无效，或缺少该接口所需的权限",
  10001: "令牌缺少该接口所需的权限",
  9103: "未知的 X-Auth-Key 或邮箱",
  9106: "缺少 Authorization 请求头",
  9109: "令牌无效或已过期",
  6003: "请求头无效：请检查令牌是否完整粘贴",
  6111: "Authorization 格式无效：请粘贴 API 令牌本身",
  7003: "路径无效：请检查 Account ID",
  7000: "路径无效：请检查 Account ID",
}

/** 把 Cloudflare v4 失败包体 {success:false, errors:[{code,message}]} 转为中文错误 */
export function cfErrorMessage(status: number, text: string): string {
  let parsed: any = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  const errs: any[] = rowsOf(parsed?.errors)
  if (errs.length > 0) {
    const e = errs[0]
    const code = num(e?.code)
    const hint = CODE_HINTS[code]
    const msg = String(e?.message ?? "")
    return hint ? `${hint}（${code}${msg ? `: ${msg}` : ""}）` : `${msg || "请求失败"}${code ? `（${code}）` : ""}`
  }
  if (status === 401) return "认证失败 (401)：令牌无效或已过期"
  if (status === 403) return "无权限 (403)：令牌缺少该接口所需的权限"
  if (status === 404) return "未找到 (404)：请检查 Account ID 或项目名"
  if (status === 429) return "请求过于频繁 (429)，请稍后再试"
  const snippet = text.trim().slice(0, 160)
  return `HTTP ${status}${snippet ? `：${snippet}` : ""}`
}

/** GraphQL 错误：{ data, errors: [{ message, path, extensions }] } */
export function graphqlErrorMessage(errors: unknown): string | null {
  const list = rowsOf(errors)
  if (list.length === 0) return null
  const msg = list.map((e) => String(e?.message ?? "")).filter(Boolean).join("；")
  if (/not authorized|unauthorized|authz|permission/i.test(msg)) {
    return `GraphQL 无权限：令牌需要 Account Analytics: Read（${msg}）`
  }
  return msg || "GraphQL 查询失败"
}

// ---------- 格式化 ----------

function trimZero(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s
}

export function groupDigits(n: number): string {
  const s = String(Math.round(Math.abs(n)))
  const g = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return n < 0 ? `-${g}` : g
}

/** 数字拆成 { value, unit }：<1 万原样分组，万 / 亿 */
export function countParts(n: number | null | undefined): { value: string; unit: string } {
  if (n == null || !Number.isFinite(n)) return { value: "—", unit: "" }
  const a = Math.abs(n)
  if (a < 10_000) return { value: groupDigits(n), unit: "" }
  if (a < 100_000_000) {
    const v = n / 10_000
    return { value: trimZero(v.toFixed(Math.abs(v) < 100 ? 2 : 1)), unit: "万" }
  }
  const v = n / 100_000_000
  return { value: trimZero(v.toFixed(2)), unit: "亿" }
}

export function formatCount(n: number | null | undefined): string {
  const p = countParts(n)
  return p.unit ? `${p.value} ${p.unit}` : p.value
}

/** 毫秒 → 可读时长 */
export function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—"
  if (ms < 1) return `${trimZero(ms.toFixed(2))} ms`
  if (ms < 10) return `${trimZero(ms.toFixed(1))} ms`
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${trimZero((ms / 1000).toFixed(1))} s`
  if (ms < 3_600_000) return `${trimZero((ms / 60_000).toFixed(1))} min`
  return `${trimZero((ms / 3_600_000).toFixed(1))} h`
}

export function usToMs(us: number | null | undefined): number | null {
  return us == null || !Number.isFinite(us) ? null : us / 1000
}

export function formatPercent(r: number | null | undefined): string {
  if (r == null || !Number.isFinite(r)) return "—"
  const p = r * 100
  if (p > 0 && p < 0.1) return "<0.1%"
  return `${trimZero(p.toFixed(p < 10 ? 1 : 0))}%`
}

export function formatUSD(v: number): string {
  if (v > 0 && v < 0.01) return "<$0.01"
  return `$${v.toFixed(2)}`
}

/** 剩余时间：x 天 y 小时 / x 小时 y 分 / y 分钟 */
export function formatCountdown(ms: number): string {
  if (!(ms > 0)) return "即将"
  const min = Math.floor(ms / 60_000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return h > 0 ? `${d} 天 ${h} 小时` : `${d} 天`
  if (h > 0) return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`
  return `${Math.max(1, m)} 分钟`
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 本地时间：同日显示 HH:mm:ss，否则 M/d HH:mm */
export function formatClock(ms: number, now: number = Date.now()): string {
  const d = new Date(ms)
  const n = new Date(now)
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  return sameDay ? `${hm}:${pad2(d.getSeconds())}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

export function formatDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 相对时间：刚刚 / x 分钟前 / x 小时前 / M/d HH:mm */
export function formatAgo(ms: number, now: number = Date.now()): string {
  const diff = now - ms
  if (diff < 60_000) return "刚刚"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return formatClock(ms, now)
}

export function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}
