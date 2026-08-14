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

export const CONNECT_HINT = "请到「设置」检查地址与 Key"

export function connectErrorText(error: string, prefix = "连接错误"): string {
  return `${prefix}：${error}（${CONNECT_HINT}）`
}
