// 全局状态：配置、指标快照、采样历史、轮询循环
import { useEffect, useState } from "scripting"
import {
  DEFAULT_CONFIG,
  fetchMetrics,
  getRecentRequests,
  getTraffic,
  type SurgeConfig,
  type TrafficEntry,
  type TrafficSnapshot,
} from "./surgeApi"
import { gaugeValue, type MetricSample } from "./metrics"

export type HistoryPoint = {
  t: number
  mem: number
  inSpeed: number
  outSpeed: number
}

/** 实时速率点（内存中滑动窗口，不持久化） */
export type SpeedPoint = {
  t: number
  inSpeed: number
  outSpeed: number
}

export type Prefs = {
  autoRefresh: boolean
  intervalSec: 3 | 5 | 10
  maxPoints: 180 | 360 | 720
}

export type RequestsSegment = "active" | "recent" | "events" | "dns" | "rules"

export type StoreState = {
  config: SurgeConfig
  prefs: Prefs
  samples: MetricSample[] | null
  prevSamples: MetricSample[] | null
  updatedAt: number | null
  error: string | null
  running: boolean
  speeds: { inSpeed: number; outSpeed: number }
  peakSpeeds: { inSpeed: number; outSpeed: number }
  failedRecent: number
  history: HistoryPoint[]
  speedHistory: SpeedPoint[]
  traffic: TrafficSnapshot | null
  requestsSegment: RequestsSegment
}

const CONFIG_KEY = "surge_panel_config"
const PREFS_KEY = "surge_panel_prefs"
const HISTORY_KEY = "surge_panel_history"

const DEFAULT_PREFS: Prefs = { autoRefresh: true, intervalSec: 5, maxPoints: 720 }

// 对齐 yasd（Surge Web Dashboard）：/v1/traffic 1Hz + 60 点滑动窗口
export const SPEED_REFRESH_MS = 1000
export const SPEED_HISTORY_SIZE = 60

// ---------- 内部状态 ----------

function emptySpeedHistory(now = Date.now()): SpeedPoint[] {
  const out: SpeedPoint[] = []
  for (let i = SPEED_HISTORY_SIZE; i >= 1; i--) {
    out.push({ t: now - i * SPEED_REFRESH_MS, inSpeed: 0, outSpeed: 0 })
  }
  return out
}

function maxSpeedFromHistory(history: HistoryPoint[]): { inSpeed: number; outSpeed: number } {
  let inSpeed = 0
  let outSpeed = 0
  for (const p of history) {
    if (p.inSpeed > inSpeed) inSpeed = p.inSpeed
    if (p.outSpeed > outSpeed) outSpeed = p.outSpeed
  }
  return { inSpeed, outSpeed }
}

let state: StoreState = {
  config: DEFAULT_CONFIG,
  prefs: DEFAULT_PREFS,
  samples: null,
  prevSamples: null,
  updatedAt: null,
  error: null,
  running: false,
  speeds: { inSpeed: 0, outSpeed: 0 },
  peakSpeeds: { inSpeed: 0, outSpeed: 0 },
  failedRecent: 0,
  history: [],
  speedHistory: emptySpeedHistory(),
  traffic: null,
  requestsSegment: "active",
}

const listeners = new Set<() => void>()
let pollTimer: ReturnType<typeof setTimeout> | null = null
let speedTimer: ReturnType<typeof setTimeout> | null = null
let tickCount = 0
let started = false
let trafficInFlight = false

function emit() {
  listeners.forEach((f) => f())
}

function patch(partial: Partial<StoreState>) {
  state = { ...state, ...partial }
  emit()
}

// ---------- 对外 API ----------

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getState(): StoreState {
  return state
}

/** React hook：订阅 store，返回当前状态 */
export function useStore(): StoreState {
  const [s, setS] = useState<StoreState>(getState())
  useEffect(() => subscribe(() => setS(getState())), [])
  return s
}

export function initStore() {
  const savedConfig = Storage.get(CONFIG_KEY) as SurgeConfig | null
  const savedPrefs = Storage.get(PREFS_KEY) as Prefs | null
  const savedHistory = Storage.get(HISTORY_KEY) as HistoryPoint[] | null
  const history = Array.isArray(savedHistory) ? savedHistory : []
  patch({
    config: savedConfig ?? DEFAULT_CONFIG,
    prefs: savedPrefs ?? DEFAULT_PREFS,
    history,
    speedHistory: emptySpeedHistory(),
    peakSpeeds: maxSpeedFromHistory(history),
  })
}

export function saveConfig(config: SurgeConfig) {
  Storage.set(CONFIG_KEY, config)
  patch({ config })
  refreshNow()
}

export function savePrefs(prefs: Prefs) {
  Storage.set(PREFS_KEY, prefs)
  patch({ prefs })
  if (started) restartPolling()
}

export function clearHistory() {
  Storage.remove(HISTORY_KEY)
  patch({
    history: [],
    speedHistory: emptySpeedHistory(),
    peakSpeeds: { inSpeed: 0, outSpeed: 0 },
  })
}

// ---------- Tab 跳转（总览事件条 → 请求工作台） ----------

let tabJump: ((index: number) => void) | null = null

export function registerTabJump(fn: (index: number) => void) {
  tabJump = fn
  return () => {
    if (tabJump === fn) tabJump = null
  }
}

export function setRequestsSegment(segment: RequestsSegment) {
  if (state.requestsSegment === segment) return
  patch({ requestsSegment: segment })
}

export function openRequestsSegment(segment: RequestsSegment) {
  patch({ requestsSegment: segment })
  tabJump?.(3)
}

// ---------- 实时速率（/v1/traffic，1Hz） ----------

function aggregateCurrentSpeeds(entries: Record<string, TrafficEntry>): {
  inSpeed: number
  outSpeed: number
} {
  let inSpeed = 0
  let outSpeed = 0
  for (const name in entries) {
    const e = entries[name]
    inSpeed += e.inCurrentSpeed
    outSpeed += e.outCurrentSpeed
  }
  return { inSpeed, outSpeed }
}

async function tickTraffic() {
  if (trafficInFlight) return
  trafficInFlight = true
  const t0 = Date.now()
  try {
    const traffic = await getTraffic(state.config)
    const source =
      traffic.interface && Object.keys(traffic.interface).length > 0
        ? traffic.interface
        : traffic.connector
    const { inSpeed, outSpeed } = aggregateCurrentSpeeds(source ?? {})
    const now = Date.now()
    const nextHistory = state.speedHistory.slice()
    nextHistory.push({ t: now, inSpeed, outSpeed })
    while (nextHistory.length > SPEED_HISTORY_SIZE) nextHistory.shift()
    patch({
      traffic,
      speeds: { inSpeed, outSpeed },
      speedHistory: nextHistory,
      peakSpeeds: {
        inSpeed: Math.max(state.peakSpeeds.inSpeed, inSpeed),
        outSpeed: Math.max(state.peakSpeeds.outSpeed, outSpeed),
      },
      running: true,
      updatedAt: now,
    })
  } catch (e) {
    if (!state.samples) {
      patch({ error: String(e), running: false, updatedAt: Date.now() })
    }
  } finally {
    trafficInFlight = false
  }
  return Date.now() - t0
}

function armTraffic(delay: number) {
  if (!started || !state.prefs.autoRefresh) return
  speedTimer = setTimeout(async () => {
    if (!started || !state.prefs.autoRefresh) return
    const elapsed = (await tickTraffic()) ?? 0
    armTraffic(Math.max(0, SPEED_REFRESH_MS - elapsed))
  }, delay)
}

// ---------- 指标采样（内存 / Prometheus，用户间隔） ----------

async function tick() {
  const { config, prefs, samples: prev, history, speeds } = state
  const now = Date.now()
  try {
    const samples = await fetchMetrics(config)
    const mem = gaugeValue(samples, "surge_memory_bytes") ?? 0

    const point: HistoryPoint = {
      t: now,
      mem,
      inSpeed: speeds.inSpeed,
      outSpeed: speeds.outSpeed,
    }
    const newHistory = [...history, point]
    while (newHistory.length > prefs.maxPoints) newHistory.shift()
    Storage.set(HISTORY_KEY, newHistory)

    patch({
      samples,
      prevSamples: prev ?? null,
      updatedAt: now,
      error: null,
      running: true,
      history: newHistory,
    })
  } catch (e) {
    patch({
      error: String(e),
      running: state.traffic !== null,
      updatedAt: now,
    })
  }

  // 每 3 个采样周期统计一次近期失败请求数
  tickCount++
  if (tickCount % 3 === 1) {
    try {
      const { requests } = await getRecentRequests(state.config)
      patch({ failedRecent: requests.filter((r) => r.failed).length })
    } catch {
      // 忽略：失败数不是关键指标
    }
  }
}

function scheduleNext() {
  if (!state.prefs.autoRefresh) return
  pollTimer = setTimeout(async () => {
    await tick()
    scheduleNext()
  }, state.prefs.intervalSec * 1000)
}

function clearTimers() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  if (speedTimer) {
    clearTimeout(speedTimer)
    speedTimer = null
  }
}

function restartPolling() {
  clearTimers()
  scheduleNext()
  armTraffic(SPEED_REFRESH_MS)
}

export async function startPolling() {
  if (started) return
  started = true
  await Promise.all([tick(), tickTraffic()])
  scheduleNext()
  armTraffic(SPEED_REFRESH_MS)
}

export function stopPolling() {
  started = false
  clearTimers()
}

export async function refreshNow() {
  await Promise.all([tick(), tickTraffic()])
}

// ---------- 内存趋势诊断 ----------

export function analyzeMemoryTrend(history: HistoryPoint[]): {
  level: "ok" | "warning" | "insufficient"
  message: string
  peakMB: number
  slopeMBPerMin: number
} {
  const pts = history.filter((p) => p.mem > 0)
  if (pts.length < 12) {
    return {
      level: "insufficient",
      message: "采样数据不足，持续运行约 1 分钟后再查看趋势判断。",
      peakMB: 0,
      slopeMBPerMin: 0,
    }
  }
  const windowPts = pts.slice(-Math.min(pts.length, 120))
  const peakMB = Math.max(...windowPts.map((p) => p.mem)) / (1024 * 1024)
  const first = windowPts[0]
  const last = windowPts[windowPts.length - 1]
  const dtMin = (last.t - first.t) / 60000
  const slopeMBPerMin = dtMin > 0 ? (last.mem - first.mem) / (1024 * 1024) / dtMin : 0

  // 统计持续上涨段：末段连续上升占比
  let rising = 0
  const tail = windowPts.slice(-Math.min(windowPts.length, 30))
  for (let i = 1; i < tail.length; i++) {
    if (tail[i].mem >= tail[i - 1].mem) rising++
  }
  const risingRatio = tail.length > 1 ? rising / (tail.length - 1) : 0

  if (slopeMBPerMin > 3 && risingRatio > 0.85) {
    return {
      level: "warning",
      message: `内存持续上涨且不回落（约 +${slopeMBPerMin.toFixed(1)} MB/分钟），可能存在内存异常。建议尝试重新加载配置或重启 Surge 引擎，并检查事件中心是否有脚本报错。`,
      peakMB,
      slopeMBPerMin,
    }
  }
  return {
    level: "ok",
    message: `近 ${Math.round(dtMin)} 分钟内存变化平缓（${slopeMBPerMin >= 0 ? "+" : ""}${slopeMBPerMin.toFixed(1)} MB/分钟），波动属正常范围。`,
    peakMB,
    slopeMBPerMin,
  }
}
