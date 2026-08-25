import { findInstance, loadInstanceState, type SurgeInstance } from "./instances"

export type WidgetRefreshMin = 15 | 30 | 60

export type WidgetPrefs = {
  instanceId: string
  policy: string
  mediaPolicy: string
  aiPolicy: string
  refreshMin: WidgetRefreshMin
  deepRisk: boolean
}

export type WidgetParameter = Partial<WidgetPrefs>

const WIDGET_PREFS_KEY = "surge_panel_widget_prefs"

export const DEFAULT_WIDGET_PREFS: WidgetPrefs = {
  instanceId: "",
  policy: "",
  mediaPolicy: "",
  aiPolicy: "",
  refreshMin: 15,
  deepRisk: false,
}

function asRefreshMin(value: unknown): WidgetRefreshMin {
  return value === 30 || value === 60 ? value : 15
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeWidgetPrefs(value: unknown): WidgetPrefs {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  return {
    instanceId: stringValue(raw.instanceId),
    policy: stringValue(raw.policy),
    mediaPolicy: stringValue(raw.mediaPolicy),
    aiPolicy: stringValue(raw.aiPolicy),
    refreshMin: asRefreshMin(Number(raw.refreshMin)),
    deepRisk: raw.deepRisk === true,
  }
}

export function readWidgetPrefs(): WidgetPrefs {
  return { ...DEFAULT_WIDGET_PREFS, ...normalizeWidgetPrefs(Storage.get(WIDGET_PREFS_KEY)) }
}

export function saveWidgetPrefs(prefs: WidgetPrefs) {
  Storage.set(WIDGET_PREFS_KEY, normalizeWidgetPrefs(prefs))
}

/** Widget.parameter 允许单个桌面组件覆盖默认实例与策略。非法字段静默忽略。 */
export function parseWidgetParameter(raw: string | null | undefined): WidgetParameter {
  const text = String(raw ?? "").trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const input = parsed as Record<string, unknown>
    const out: WidgetParameter = {}
    if (typeof input.instanceId === "string") out.instanceId = input.instanceId.trim()
    if (typeof input.policy === "string") out.policy = input.policy.trim()
    if (typeof input.mediaPolicy === "string") out.mediaPolicy = input.mediaPolicy.trim()
    if (typeof input.aiPolicy === "string") out.aiPolicy = input.aiPolicy.trim()
    if ([15, 30, 60].includes(Number(input.refreshMin))) {
      out.refreshMin = Number(input.refreshMin) as WidgetRefreshMin
    }
    if (typeof input.deepRisk === "boolean") out.deepRisk = input.deepRisk
    return out
  } catch {
    return {}
  }
}

export function resolvedWidgetPrefs(parameter?: WidgetParameter): WidgetPrefs {
  const base = readWidgetPrefs()
  return normalizeWidgetPrefs({ ...base, ...(parameter ?? {}) })
}

export function widgetInstance(prefs: WidgetPrefs): {
  instance: SurgeInstance | null
  instances: SurgeInstance[]
  activeId: string
} {
  const state = loadInstanceState()
  const instance =
    findInstance(state.instances, prefs.instanceId) ??
    findInstance(state.instances, state.activeId) ??
    state.instances[0] ??
    null
  return { instance, instances: state.instances, activeId: state.activeId }
}

export function widgetPrefsStorageKey(): string {
  return WIDGET_PREFS_KEY
}
