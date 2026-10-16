// Cloudflare 观测入口：全屏运行（Scripting 脚本列表点按 / 小组件点按）
import { Navigation, Script } from "scripting"
import { CfObservabilityApp } from "./app"

async function run() {
  Script.enableMinimize()
  await Navigation.present({
    element: <CfObservabilityApp />,
    modalPresentationStyle: "overFullScreen",
  })
  Script.exit()
}

run()
