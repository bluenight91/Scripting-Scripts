// 用量快照：App 概览与小组件共用；GraphQL 字段 / 时间跨度不被支持时自动降级重试，最近一次结果写入 Storage 供离线回退
import { graphql } from "./cfApi"
import {
  buildDetailQuery,
  buildUsageQuery,
  detailWindow,
  isRangeError,
  isSchemaError,
  parseDetail,
  parseUsage,
  projectKey,
  quotaRange,
  splitRange,
  summarizeQuota,
  type DetailData,
  type DetailWindow,
  type Plan,
  type Project,
  type QuotaSummary,
  type TimeRange,
  type UsageData,
} from "./cfCore"
import type { Settings } from "./settings"

export type UsageSnapshot = {
  fetchedAt: number
  plan: Plan
  periodStart: number
  periodEnd: number
  usage: UsageData
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

async function queryUsage(token: string, accountId: string, ranges: TimeRange[]): Promise<UsageData> {
  try {
    return parseUsage(await graphql(token, buildUsageQuery(accountId, ranges, { rich: true })), ranges.length)
  } catch (e) {
    if (!isSchemaError(errText(e))) throw e
    return parseUsage(await graphql(token, buildUsageQuery(accountId, ranges, { rich: false })), ranges.length)
  }
}

export async function fetchUsage(token: string, s: Settings, now: Date = new Date()): Promise<UsageSnapshot> {
  const period = quotaRange(s.plan, now, s.cycleDay)
  const range = { start: period.start, end: new Date(Math.min(now.getTime() + 60_000, period.end.getTime())) }
  let usage: UsageData
  try {
    usage = await queryUsage(token, s.accountId, [range])
  } catch (e) {
    if (!isRangeError(errText(e))) throw e
    usage = await queryUsage(token, s.accountId, splitRange(range, 86_400_000))
  }
  return { fetchedAt: Date.now(), plan: s.plan, periodStart: period.start.getTime(), periodEnd: period.end.getTime(), usage }
}

export function snapshotSummary(snap: UsageSnapshot, project?: Project | null): QuotaSummary {
  return summarizeQuota(snap.plan, snap.usage, { start: new Date(snap.periodStart), end: new Date(snap.periodEnd) }, project)
}

export async function fetchDetail(token: string, accountId: string, project: Project, win: DetailWindow): Promise<DetailData> {
  try {
    return parseDetail(await graphql(token, buildDetailQuery(accountId, project.kind, project.scriptName, win, { rich: true })), win.daily)
  } catch (e) {
    if (!isSchemaError(errText(e))) throw e
    return parseDetail(await graphql(token, buildDetailQuery(accountId, project.kind, project.scriptName, win, { rich: false })), win.daily)
  }
}

// ---------- 小组件数据 ----------

export type WidgetData = {
  fetchedAt: number
  snapshot: UsageSnapshot
  project: Project | null
  /** 项目近 24 小时（失败时为 null，不影响限额显示） */
  last24h: DetailData | null
}

const WIDGET_CACHE_KEY = "cf_obs_widget_cache"

function cacheKey(project: Project | null): string {
  return project ? projectKey(project) : "_account"
}

export function loadWidgetCache(project: Project | null): WidgetData | null {
  const all = Storage.get<Record<string, WidgetData>>(WIDGET_CACHE_KEY)
  return all && typeof all === "object" ? all[cacheKey(project)] ?? null : null
}

function saveWidgetCache(data: WidgetData) {
  const all = Storage.get<Record<string, WidgetData>>(WIDGET_CACHE_KEY) ?? {}
  all[cacheKey(data.project)] = data
  Storage.set(WIDGET_CACHE_KEY, all)
}

export async function fetchWidgetData(token: string, s: Settings, project: Project | null): Promise<WidgetData> {
  const now = new Date()
  const snapshot = await fetchUsage(token, s, now)
  let last24h: DetailData | null = null
  if (project) {
    try {
      last24h = await fetchDetail(token, s.accountId, project, detailWindow("24h", s.plan, now, s.cycleDay))
      last24h.statuses = last24h.statuses?.slice(0, 4) ?? null
    } catch {
      last24h = null
    }
  }
  const data: WidgetData = { fetchedAt: Date.now(), snapshot, project, last24h }
  saveWidgetCache(data)
  return data
}
