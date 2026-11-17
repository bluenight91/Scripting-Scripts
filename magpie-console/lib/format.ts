import type { BudgetStatus, KeyLimit } from "./types"

export function shortNumber(value?: number | null): string {
  if (value == null || !isFinite(value)) return "—"
  const n = Math.abs(value)
  if (n >= 1_000_000_000) return trim(value / 1_000_000_000) + "B"
  if (n >= 1_000_000) return trim(value / 1_000_000) + "M"
  if (n >= 1_000) return trim(value / 1_000) + "K"
  return String(Math.round(value))
}

function trim(value: number): string {
  if (Math.abs(value) >= 100) return value.toFixed(0)
  if (Math.abs(value) >= 10) return value.toFixed(1).replace(/\.0$/, "")
  return value.toFixed(2).replace(/\.?0+$/, "")
}

export function tokensLabel(value?: number | null): string {
  if (value == null) return "—"
  return shortNumber(value) + " tokens"
}

export function costLabel(value?: number | null): string {
  if (value == null) return "—"
  if (value === 0) return "$0"
  if (value < 0.01) return "$" + value.toFixed(4)
  return "$" + value.toFixed(2)
}

export function percent(used?: number | null, limit?: number | null): number | null {
  if (!limit || limit <= 0) return null
  const ratio = (used ?? 0) / limit
  return Math.max(0, Math.min(1, ratio))
}

export function relativeTime(epoch?: number | null): string {
  if (!epoch) return "尚未刷新"
  const diff = Date.now() - epoch
  if (diff < 60_000) return "刚刚"
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + " 分钟前"
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + " 小时前"
  return Math.floor(diff / 86_400_000) + " 天前"
}

export function resetLabel(status?: BudgetStatus | null): string {
  if (!status) return "无限额"
  if (status.resetUnknown) return "重置时间未知"
  if (!status.reset) return "无重置时间"
  const at = Date.parse(status.reset)
  if (!isFinite(at)) return "无重置时间"
  const diff = at - Date.now()
  if (diff <= 0) return "即将重置"
  if (diff < 3_600_000) return Math.max(1, Math.floor(diff / 60_000)) + " 分钟后重置"
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + " 小时后重置"
  return Math.floor(diff / 86_400_000) + " 天后重置"
}

export function resetEpoch(status?: BudgetStatus | null): number {
  if (!status?.reset) return Number.MAX_SAFE_INTEGER
  const at = Date.parse(status.reset)
  return isFinite(at) ? at : Number.MAX_SAFE_INTEGER
}

export function limitLabel(limit?: KeyLimit | null): string {
  if (!limit) return "无限额"
  const period = limit.period ?? ""
  if (period === "days") return limit.days ? `每 ${limit.days} 天` : "自定义周期"
  if (period === "hours") return limit.hours ? `每 ${limit.hours} 小时` : "自定义周期"
  if (period === "week") return "每周"
  if (period === "month") return "每月"
  if (period === "total") return "总量"
  if (period === "account") return limit.accountWindow ? `跟随账号 ${limit.accountWindow}` : "跟随账号窗口"
  if (/^\d+h$/.test(period)) return `每 ${period.slice(0, -1)} 小时`
  return period || "自定义周期"
}

export function limitAmountLabel(limit?: KeyLimit | null): string {
  if (!limit) return ""
  const parts: string[] = []
  if (limit.tokens) parts.push(tokensLabel(limit.tokens))
  if (limit.cost) parts.push(costLabel(limit.cost))
  return parts.join(" · ")
}

export function hostOf(url?: string): string {
  if (!url) return ""
  const match = url.match(/^[a-z]+:\/\/([^/]+)/i)
  return match ? match[1] : url
}

export function providerInitial(name: string): string {
  const text = name.trim()
  if (!text) return "?"
  const ascii = text.match(/[A-Za-z0-9]/g)
  if (ascii) return ascii.slice(0, 2).join("").toUpperCase()
  return text.slice(0, 1)
}

export function plural(count: number, unit: string): string {
  return `${count} ${unit}`
}

export function summarizeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}