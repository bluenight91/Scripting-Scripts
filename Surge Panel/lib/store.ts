// 当前实例的指标、流量、轮询；实例列表见 instances.ts
import { useEffect, useState } from "scripting"
import {
  fetchOverviewSamples,
  getRecentRequests,
  getTraffic,
  type SurgeConfig,
  type TrafficEntry,
  type TrafficSnapshot,
} from "./surgeApi"
import { gaugeValue, isRejectPolicy, type MetricSample } from "./metrics"
import {
  findInstance,
  historyKey,
  instanceIsReady,
  instanceToConfig,
  loadInstanceState,
  persistInstanceState,
  EMPTY_INSTANCE,
  type SurgeInstance,
} from "./instances"

export type HistoryPoint = {
  t: number
  mem: number
  inSpeed: number
  outSpeed: number
}

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
  instances: SurgeInstance[]
  activeId: string
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
  rejectedRecent: number
  history: HistoryPoint[]
  speedHistory: SpeedPoint[]
  traffic: TrafficSnapshot | null
  /** null=未知；true=有 /metrics；false=商店版等无该端点，总览走 HTTP API 回退 */
  metricsAvailable: boolean | null
  requestsSegment: RequestsSegment
  visibleTab: number
}

const PREFS_KEY = "surge_panel_prefs"
const DEFAULT_PREFS: Prefs = { autoRefresh: true, intervalSec: 5, maxPoints: 720 }

export const SPEED_REFRESH_MS = 1000
export const SPEED_HISTORY_SIZE = 60

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

function readHistory(id: string): HistoryPoint[] {
  const raw = Storage.get(historyKey(id))
  return Array.isArray(raw) ? (raw as HistoryPoint[]) : []
}

function writeHistory(id: string, history: HistoryPoint[]) {
  Storage.set(historyKey(id), history)
}

const boot = loadInstanceState()
const bootInst = findInstance(boot.instances, boot.activeId) ?? EMPTY_INSTANCE
const bootHistory = boot.activeId ? readHistory(boot.activeId) : []

let state: StoreState = {
  instances: boot.instances,
  activeId: boot.activeId,
  config: instanceToConfig(bootInst),
  prefs: DEFAULT_PREFS,
  samples: null,
  prevSamples: null,
  updatedAt: null,
  error: null,
  running: false,
  speeds: { inSpeed: 0, outSpeed: 0 },
  peakSpeeds: maxSpeedFromHistory(bootHistory),
  failedRecent: 0,
  rejectedRecent: 0,
  history: bootHistory,
  speedHistory: emptySpeedHistory(),
  traffic: null,
  metricsAvailable: null,
  requestsSegment: "active",
  visibleTab: 0,
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

function applyActive(instances: SurgeInstance[], activeId: string, extra?: Partial<StoreState>) {
  if (instances.length === 0) {
    persistInstanceState([], "")
    patch({
      instances: [],
      activeId: "",
      config: instanceToConfig(EMPTY_INSTANCE),
      history: [],
      speedHistory: emptySpeedHistory(),
      peakSpeeds: { inSpeed: 0, outSpeed: 0 },
      samples: null,
      prevSamples: null,
      traffic: null,
      speeds: { inSpeed: 0, outSpeed: 0 },
      failedRecent: 0,
      rejectedRecent: 0,
      error: null,
      running: false,
      updatedAt: null,
      metricsAvailable: null,
      ...extra,
    })
    return
  }
  const inst = findInstance(instances, activeId) ?? instances[0]
  persistInstanceState(instances, inst.id)
  const history = readHistory(inst.id)
  patch({
    instances,
    activeId: inst.id,
    config: instanceToConfig(inst),
    history,
    speedHistory: emptySpeedHistory(),
    peakSpeeds: maxSpeedFromHistory(history),
    samples: null,
    prevSamples: null,
    traffic: null,
    speeds: { inSpeed: 0, outSpeed: 0 },
    failedRecent: 0,
    rejectedRecent: 0,
    error: null,
    running: false,
    updatedAt: null,
    metricsAvailable: null,
    ...extra,
  })
}

export function needsSetup(): boolean {
  const inst = findInstance(state.instances, state.activeId) ?? state.instances[0]
  return !instanceIsReady(inst)
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getState(): StoreState {
  return state
}

export function useStore(): StoreState {
  const [s, setS] = useState<StoreState>(getState())
  useEffect(() => subscribe(() => setS(getState())), [])
  return s
}

export function activeInstance(): SurgeInstance {
  return findInstance(state.instances, state.activeId) ?? state.instances[0] ?? EMPTY_INSTANCE
}

export function initStore() {
  const savedPrefs = Storage.get(PREFS_KEY) as Prefs | null
  const loaded = loadInstanceState()
  applyActive(loaded.instances, loaded.activeId, {
    prefs: savedPrefs ?? DEFAULT_PREFS,
  })
}

export function savePrefs(prefs: Prefs) {
  Storage.set(PREFS_KEY, prefs)
  patch({ prefs })
  if (started) restartPolling()
}

export function clearHistory() {
  Storage.remove(historyKey(state.activeId))
  patch({
    history: [],
    speedHistory: emptySpeedHistory(),
    peakSpeeds: { inSpeed: 0, outSpeed: 0 },
  })
}

export function setVisibleTab(index: number) {
  if (state.visibleTab === index) return
  patch({ visibleTab: index })
}

/** 更新当前实例的连接字段（兼容旧 saveConfig 调用） */
export function saveConfig(config: SurgeConfig) {
  updateInstance(state.activeId, config)
}

export function updateInstance(id: string, patchInst: Partial<SurgeInstance>) {
  const instances = state.instances.map((i) => (i.id === id ? { ...i, ...patchInst } : i))
  persistInstanceState(instances, state.activeId)
  if (id === state.activeId) {
    const inst = findInstance(instances, id)!
    patch({ instances, config: instanceToConfig(inst) })
    void connectActive()
  } else {
    patch({ instances })
  }
}

export function addInstance(inst: SurgeInstance) {
  const instances = [...state.instances, inst]
  persistInstanceState(instances, state.activeId)
  patch({ instances })
}

export async function connectActive() {
  if (!instanceIsReady(activeInstance())) return
  if (started) await refreshNow()
  else await startPolling()
}

export async function switchInstance(id: string) {
  if (id === state.activeId) return
  stopPolling()
  applyActive(state.instances, id)
  await connectActive()
}

export async function deleteInstance(id: string) {
  const instances = state.instances.filter((i) => i.id !== id)
  Storage.remove(historyKey(id))
  if (id === state.activeId || instances.length === 0) {
    stopPolling()
    applyActive(instances, instances[0]?.id ?? "")
    await connectActive()
  } else {
    persistInstanceState(instances, state.activeId)
    patch({ instances })
  }
}

// ---------- Tab 跳转 ----------

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

// ---------- 实时速率 ----------

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
  if (needsSetup() || trafficInFlight) return
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

async function tick() {
  if (needsSetup()) return
  const { config, prefs, samples: prev, history, speeds, activeId, metricsAvailable, traffic } = state
  const now = Date.now()
  try {
    const { samples, fromMetrics } = await fetchOverviewSamples(config, {
      skipMetrics: metricsAvailable === false,
      traffic,
    })
    const mem = fromMetrics ? gaugeValue(samples, "surge_memory_bytes") : null
    let newHistory = history
    if (mem !== null) {
      const point: HistoryPoint = { t: now, mem, inSpeed: speeds.inSpeed, outSpeed: speeds.outSpeed }
      newHistory = [...history, point]
      while (newHistory.length > prefs.maxPoints) newHistory.shift()
      writeHistory(activeId, newHistory)
    }
    patch({
      samples,
      prevSamples: prev ?? null,
      updatedAt: now,
      error: null,
      running: true,
      history: newHistory,
      metricsAvailable: fromMetrics,
    })
  } catch (e) {
    patch({
      error: String(e),
      running: state.traffic !== null,
      updatedAt: now,
    })
  }

  tickCount++
  if (tickCount % 3 === 1) {
    try {
      const { requests } = await getRecentRequests(state.config)
      patch({
        failedRecent: requests.filter((r) => r.failed).length,
        rejectedRecent: requests.filter((r) => r.rejected || isRejectPolicy(r.policyName)).length,
      })
    } catch {
      // 忽略
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
  if (needsSetup()) return
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
  if (needsSetup()) return
  if (state.metricsAvailable === false) patch({ metricsAvailable: null })
  await Promise.all([tick(), tickTraffic()])
}

export function analyzeMemoryTrend(history: HistoryPoint[]): {
  level: "ok" | "warning" | "insufficient"
  message: string
  peakMB: number
  minMB: number
  currentMB: number
  slopeMBPerMin: number
  windowMin: number
  samples: number
} {
  const empty = {
    peakMB: 0,
    minMB: 0,
    currentMB: 0,
    slopeMBPerMin: 0,
    windowMin: 0,
    samples: 0,
  }
  const pts = history.filter((p) => p.mem > 0)
  if (pts.length < 12) {
    return {
      level: "insufficient",
      message: "采样数据不足，持续运行约 1 分钟后再查看趋势判断。",
      ...empty,
      samples: pts.length,
      currentMB: pts.length ? pts[pts.length - 1].mem / (1024 * 1024) : 0,
    }
  }
  const windowPts = pts.slice(-Math.min(pts.length, 120))
  const mems = windowPts.map((p) => p.mem)
  const peakMB = Math.max(...mems) / (1024 * 1024)
  const minMB = Math.min(...mems) / (1024 * 1024)
  const currentMB = mems[mems.length - 1] / (1024 * 1024)
  const first = windowPts[0]
  const last = windowPts[windowPts.length - 1]
  const dtMin = (last.t - first.t) / 60000
  const slopeMBPerMin = dtMin > 0 ? (last.mem - first.mem) / (1024 * 1024) / dtMin : 0
  let rising = 0
  const tail = windowPts.slice(-Math.min(windowPts.length, 30))
  for (let i = 1; i < tail.length; i++) {
    if (tail[i].mem >= tail[i - 1].mem) rising++
  }
  const risingRatio = tail.length > 1 ? rising / (tail.length - 1) : 0
  const stats = {
    peakMB,
    minMB,
    currentMB,
    slopeMBPerMin,
    windowMin: dtMin,
    samples: windowPts.length,
  }
  if (slopeMBPerMin > 3 && risingRatio > 0.85) {
    return {
      level: "warning",
      message: `近 ${Math.round(dtMin)} 分钟内存持续上涨且不回落（约 +${slopeMBPerMin.toFixed(1)} MB/分钟），可能存在泄漏。可尝试重新加载配置，或到「请求 → 事件」查看脚本报错。`,
      ...stats,
    }
  }
  return {
    level: "ok",
    message: `近 ${Math.round(dtMin)} 分钟内存变化平缓（${slopeMBPerMin >= 0 ? "+" : ""}${slopeMBPerMin.toFixed(1)} MB/分钟），波动属正常范围。`,
    ...stats,
  }
}
