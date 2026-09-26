import type { SurgeApiErrorKind } from "./surgeApi"

// 全屏与首页共用的间距 / 字号，避免总览卡片与流量卡片再次分叉
export const UI = {
  pagePadding: 16,
  pageSpacing: 16,
  cardRadius: 16,
  cardPadding: 14,
  cardSpacing: 10,
  valueFont: 22,
  unitFont: 13,
  captionFont: 12,
  titleFont: 15,
  cardBg: "rgba(128,128,128,0.14)",
} as const

export function cardBackground() {
  return {
    style: UI.cardBg,
    shape: { type: "rect" as const, cornerRadius: UI.cardRadius, style: "continuous" as const },
  }
}

export const CONNECT_HINT = "请到「设置 → 实例」检查地址与 Key"
export const METRICS_HINT = "内存与封禁需 Surge iOS 5.22+ 或 Mac 6.9+（商店版 / Mac 6.8 尚无 /metrics）"

export function connectionErrorHint(kind: SurgeApiErrorKind | null | undefined): string {
  switch (kind) {
    case "auth":
      return "已暂停自动重试；修改 Key 或手动刷新后再连接"
    case "timeout":
      return "检查 Surge 监听地址、同一网络、防火墙与 Scripting 本地网络权限"
    case "refused":
      return "确认 Surge HTTP API 已开启且端口正确"
    case "tls":
      return "安装并信任 Surge MITM CA，确认访问地址与证书匹配"
    case "protocol":
      return "核对面板协议与 Surge 的 http-api-tls 设置"
    case "unsupported":
      return "更新 Surge，或确认当前平台支持该 HTTP API"
    case "validation":
      return "检查主机、端口与 API Key"
    default:
      return CONNECT_HINT
  }
}

export function connectErrorText(
  error: string,
  prefix = "连接错误",
  kind?: SurgeApiErrorKind | null
): string {
  return `${prefix}：${error}（${connectionErrorHint(kind)}）`
}
