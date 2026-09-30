import { Device, gradient, UIGlass, type Color, type DynamicShapeStyle } from "scripting"

// 设计令牌（与 Surge Panel 同一套视觉语言）：4pt 网格、连续圆角、圆体等宽数字
export const UI = {
  pagePadding: 16,
  pageSpacing: 18,
  cardRadius: 22,
  tileRadius: 18,
  cardPadding: 16,
  cardSpacing: 12,
  heroFont: 38,
  valueFont: 24,
  unitFont: 13,
  captionFont: 12,
  bodyFont: 15,
  titleFont: 17,
  cardBg: "secondarySystemGroupedBackground" as Color,
} as const

export type Tone =
  | "accent"
  | "blue"
  | "teal"
  | "green"
  | "orange"
  | "red"
  | "purple"
  | "pink"
  | "yellow"
  | "gray"

// fg 用系统语义色随深浅色自适应；soft 为同色 16% 透明底，深浅色下都成立
export const TONES: Record<Tone, { fg: Color; soft: Color }> = {
  accent: { fg: "systemIndigo", soft: "rgba(94,92,230,0.16)" },
  blue: { fg: "systemBlue", soft: "rgba(10,132,255,0.16)" },
  teal: { fg: "systemTeal", soft: "rgba(48,176,199,0.18)" },
  green: { fg: "systemGreen", soft: "rgba(52,199,89,0.16)" },
  orange: { fg: "systemOrange", soft: "rgba(255,149,0,0.16)" },
  red: { fg: "systemRed", soft: "rgba(255,59,48,0.15)" },
  purple: { fg: "systemPurple", soft: "rgba(175,82,222,0.16)" },
  pink: { fg: "systemPink", soft: "rgba(255,45,85,0.15)" },
  yellow: { fg: "systemYellow", soft: "rgba(255,204,0,0.20)" },
  gray: { fg: "secondaryLabel", soft: "rgba(142,142,147,0.16)" },
}

export const DOWN_TONE: Tone = "blue"
export const UP_TONE: Tone = "teal"

export const IS_GLASS = Number.parseInt(Device.systemVersion, 10) >= 26

export function roundedShape(radius: number = UI.cardRadius) {
  return { type: "rect" as const, cornerRadius: radius, style: "continuous" as const }
}

export function cardBackground(radius: number = UI.cardRadius, style: Color = UI.cardBg) {
  return { style, shape: roundedShape(radius) }
}

/**
 * 浮在内容之上的控件（分段芯片、状态胶囊、工具按钮）用 Liquid Glass；
 * iOS 26 以下退回系统材质。卡片等内容层不用玻璃，保持可读性。
 */
export function controlSurface(shape: "capsule" | ReturnType<typeof roundedShape> = "capsule") {
  if (IS_GLASS) return { glassEffect: { glass: UIGlass.regular(), shape } }
  return { background: { style: "thinMaterial" as const, shape } }
}

// 页面背景：顶部一层很淡的靛蓝，向下过渡到分组背景色
export const PAGE_BACKDROP: DynamicShapeStyle = {
  light: gradient("linear", {
    colors: ["#E6E5FA", "#F2F2F7", "#F2F2F7"],
    startPoint: "top",
    endPoint: "bottom",
  }),
  dark: gradient("linear", {
    colors: ["#17162E", "#000000", "#000000"],
    startPoint: "top",
    endPoint: "bottom",
  }),
}

// 首屏主卡片渐变（白字），深浅色一致
export const HERO_GRADIENT = gradient("linear", {
  colors: ["#4B47D6", "#2F6BEA", "#1597C9"],
  startPoint: "topLeading",
  endPoint: "bottomTrailing",
})
