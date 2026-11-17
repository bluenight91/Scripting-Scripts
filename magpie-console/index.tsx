// magpie 控制台入口：全屏运行（Scripting 脚本列表点按）
import { Navigation, Script } from "scripting"
import { MagpieConsoleApp } from "./app"

async function run() {
  Script.enableMinimize()
  await Navigation.present({
    element: <MagpieConsoleApp />,
    modalPresentationStyle: "overFullScreen",
  })
  Script.exit()
}

run()