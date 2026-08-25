// Surge Panel 入口：全屏运行（Scripting 脚本列表点按）
import { Navigation, Script, Widget } from "scripting"
import { initStore, refreshNow } from "./lib/store"
import { markWidgetRefreshRequested } from "./lib/widgetPrefs"
import { SurgePanelApp } from "./app"

async function run() {
  Script.enableMinimize()
  initStore()
  await refreshNow().catch(() => {})
  // 用户从组件或脚本列表打开面板时，立即请求桌面组件重取网络快照
  markWidgetRefreshRequested()
  Widget.reloadAll()
  await Navigation.present({
    element: <SurgePanelApp />,
    modalPresentationStyle: "overFullScreen",
  })
  Script.exit()
}

run()
