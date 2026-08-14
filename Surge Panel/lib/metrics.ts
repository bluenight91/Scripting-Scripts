// Prometheus 文本格式解析与格式化工具

export type MetricSample = {
  name: string
  labels: Record<string, string>
  value: number
}

function unescapeLabelValue(v: string): string {
  return v.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\")
}

export function parsePrometheus(text: string): MetricSample[] {
  const samples: MetricSample[] = []
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    let name = ""
    let labels: Record<string, string> = {}
    let rest = ""

    const brace = line.indexOf("{")
    if (brace >= 0) {
      name = line.slice(0, brace)
      const close = line.lastIndexOf("}")
      if (close < brace) continue
      const labelStr = line.slice(brace + 1, close)
      rest = line.slice(close + 1).trim()
      const re = /(\w+)="((?:[^"\\]|\\.)*)"/g
      let m: RegExpExecArray | null
      while ((m = re.exec(labelStr)) !== null) {
        labels[m[1]] = unescapeLabelValue(m[2])
      }
    } else {
      const space = line.indexOf(" ")
      if (space < 0) continue
      name = line.slice(0, space)
      rest = line.slice(space + 1).trim()
    }

    const value = parseFloat(rest)
    if (!Number.isNaN(value)) {
      samples.push({ name, labels, value })
    }
  }
  return samples
}

export function gaugeValue(samples: MetricSample[], name: string): number | null {
  const s = samples.find((s) => s.name === name)
  return s ? s.value : null
}

export function seriesByLabel(
  samples: MetricSample[],
  name: string,
  label: string
): { label: string; value: number }[] {
  return samples
    .filter((s) => s.name === name && label in s.labels)
    .map((s) => ({ label: s.labels[label], value: s.value }))
}

export function buildInfo(
  samples: MetricSample[]
): { version: string; build: string; system: string } | null {
  const s = samples.find((s) => s.name === "surge_build_info")
  if (!s) return null
  return {
    version: s.labels.version ?? "",
    build: s.labels.build ?? "",
    system: s.labels.system ?? "",
  }
}

// ---------- 格式化 ----------

export function formatBytes(bytes: number): string {
  const { value, unit } = formatBytesParts(bytes)
  return unit ? `${value} ${unit}` : value
}

export function formatBytesParts(bytes: number): { value: string; unit: string } {
  if (!Number.isFinite(bytes)) return { value: "—", unit: "" }
  const units = ["B", "KB", "MB", "GB", "TB"]
  let v = Math.abs(bytes)
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  const text = v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)
  return { value: `${bytes < 0 ? "-" : ""}${text}`, unit: units[i] }
}

export function formatSpeed(bytesPerSec: number): string {
  const { value, unit } = formatSpeedParts(bytesPerSec)
  return unit ? `${value} ${unit}` : value
}

export function formatSpeedParts(bytesPerSec: number): { value: string; unit: string } {
  const p = formatBytesParts(bytesPerSec)
  if (!p.unit) return p
  return { value: p.value, unit: `${p.unit}/s` }
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d} 天 ${h} 小时`
  if (h > 0) return `${h} 小时 ${m} 分`
  return `${m} 分`
}

export function formatClock(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Surge HTTP API 的 epoch：请求 startDate 等为 Unix 秒；已是毫秒则原样返回 */
export function surgeTimestampToMs(ts: number): number {
  if (!Number.isFinite(ts) || ts <= 0) return NaN
  return ts < 1e12 ? ts * 1000 : ts
}

export function formatRequestDateTime(ts?: number | null): string {
  if (ts == null) return "—"
  const ms = surgeTimestampToMs(ts)
  if (!Number.isFinite(ms)) return "—"
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return "—"
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function formatRequestClock(ts?: number | null): string {
  if (ts == null) return ""
  const ms = surgeTimestampToMs(ts)
  if (!Number.isFinite(ms)) return ""
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const hms = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  return sameDay ? hms : `${d.getMonth() + 1}-${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function formatDelay(ms: number | undefined | null): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return "—"
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`
}

/** 解析 Surge 事件的日期字符串（如 "2026-08-13T14:00:00+0800"） */
export function parseSurgeDate(s: string): Date | null {
  const normalized = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatEventTime(s: string): string {
  const d = parseSurgeDate(s)
  if (!d) return s
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const p = (n: number) => String(n).padStart(2, "0")
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`
  return sameDay ? hm : `${d.getMonth() + 1}-${d.getDate()} ${hm}`
}
