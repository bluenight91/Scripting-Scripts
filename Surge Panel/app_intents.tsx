// 桌面组件手动刷新：标记快照绕过 TTL，再请求 WidgetKit 重新生成时间线
import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import { markWidgetRefreshRequested } from "./lib/widgetPrefs"

export const RefreshNetworkWidgetIntent = AppIntentManager.register({
  name: "RefreshNetworkWidgetIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    markWidgetRefreshRequested()
    Widget.reloadAll()
  },
})
