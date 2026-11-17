// 标签顺序与标识：业务层只用 TabId，TabView 序号经 TAB_ORDER 换算
export type TabId = "overview" | "providers" | "models" | "routes" | "keys"

export const TAB_ORDER: TabId[] = ["overview", "providers", "models", "routes", "keys"]

export const TABS: Record<TabId, { title: string; icon: string }> = {
  overview: { title: "概览", icon: "gauge.with.dots.needle.67percent" },
  providers: { title: "供应商", icon: "square.stack.3d.up" },
  models: { title: "模型", icon: "cube" },
  routes: { title: "路由", icon: "point.3.connected.trianglepath.dotted" },
  keys: { title: "密钥", icon: "key.fill" },
}