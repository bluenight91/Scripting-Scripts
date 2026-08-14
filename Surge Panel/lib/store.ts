// 全局状态：配置、指标快照、采样历史、轮询循环
import { useEffect, useState } from "scripting"
import {
  DEFAULT_CONFIG,
  fetchMetrics,
  getRecentRequests,
  getTraffic,
  type SurgeConfig,
  type TrafficSnapshot,
} from "./surgeApi"
import { gaugeValue, seriesByLabel, type MetricSample } from "./metrics"

export type HistoryPoint = {
  t: number
  mem: number
  inSpeed: number
  outSpeed: number
}

export type Prefs = {
  autoRefresh: boolean
  intervalSec: 3 | 5 | 10
  maxPoints: 180 | 360 | 720
}

export type StoreState = {
  config: SurgeConfig
  prefs: Prefs
  samples: MetricSample[] | null
  prevSamples: MetricSample[] | null
  updatedAt: number | null
  error: string | null
  running: boolean
  speeds: { inSpeed: number; outSpeed: number }
  failedRecent: number
  history: HistoryPoint[]
  traffic: TrafficSnapshot | null
}

const CONFIG_KEY = "surge_panel_config"
const PREFS_KEY = "surge_panel_prefs"
const HISTORY_KEY = "surge_panel_history"

const DEFAULT_PREFS: Prefs = { autoRefresh: true, intervalSec: 5, maxPoints: 720 }

// ---------- 内部状态 ----------

let state: StoreState = {
  config: DEFAULT_CONFIG,
  prefs: DEFAULT_PREFS,
  samples: null,
  prevSamples: null,
  updatedAt: null,
  error: null,
  running: false,
  speeds: { inSpeed: 0, outSpeed: 0 },
  failedRecent: 0,
  history: [],
  traffic: null,
}

const listeners = new Set<() => void>()
let pollTimer: ReturnType<typeof setTimeout> | null = null
let tickCount = 0
let started = false

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
  patch({
    config: savedConfig ?? DEFAULT_CONFIG,
    prefs: savedPrefs ?? DEFAULT_PREFS,
    history: Array.isArray(savedHistory) ? savedHistory : [],
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
  patch({ history: [] })
}

// ---------- 采样 ----------

function sumInterfaceCounters(samples: MetricSample[]): { inB: number; outB: number } {
  const inB = seriesByLabel(samples, "surge_interface_in_bytes_total", "interface").reduce(
    (a, s) => a + s.value,
    0
  )
  const outB = seriesByLabel(samples, "surge_interface_out_bytes_total", "interface").reduce(
    (a, s) => a + s.value,
    0
  )
  return { inB, outB }
}

function computeSpeed(
  cur: number,
  prev: number | null,
  dtSec: number
): number {
  if (prev === null || dtSec <= 0) return 0
  const delta = cur >= prev ? cur - prev : cur // 计数器归零（引擎重启）视为从 0 重新累计
  return delta / dtSec
}

async function tick() {
  const { config, prefs, samples: prev, updatedAt: prevAt, history } = state
  const now = Date.now()
  try {
    const samples = await fetchMetrics(config)
    // /v1/traffic 提供各策略/接口的实时速度与峰值（Prometheus 只有累计计数）
    let traffic: TrafficSnapshot | null = null
    try {
      traffic = await getTraffic(config)
    } catch {
      traffic = state.traffic
    }
    const { inB, outB } = sumInterfaceCounters(samples)
    const dt = prev && prevAt ? (now - prevAt) / 1000 : 0
    const prevAgg = prev ? sumInterfaceCounters(prev) : null
    const inSpeed = computeSpeed(inB, prevAgg ? prevAgg.inB : null, dt)
    const outSpeed = computeSpeed(outB, prevAgg ? prevAgg.outB : null, dt)
    const mem = gaugeValue(samples, "surge_memory_bytes") ?? 0

    const point: HistoryPoint = { t: now, mem, inSpeed, outSpeed }
    const newHistory = [...history, point]
    while (newHistory.length > prefs.maxPoints) newHistory.shift()
    Storage.set(HISTORY_KEY, newHistory)

    patch({
      samples,
      prevSamples: prev ?? null,
      updatedAt: now,
      error: null,
      running: true,
      speeds: { inSpeed, outSpeed },
      history: newHistory,
      traffic,
    })
  } catch (e) {
    patch({ error: String(e), running: false, updatedAt: now })
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

function restartPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  scheduleNext()
}

export async function startPolling() {
  if (started) return
  started = true
  await tick()
  scheduleNext()
}

export function stopPolling() {
  started = false
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

export async function refreshNow() {
  await tick()
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
