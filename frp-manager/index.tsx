// frp 管理器入口：全屏运行（Scripting 脚本列表点按）
import { Navigation, Script } from "scripting"
import { FrpManagerApp } from "./app"

async function run() {
  Script.enableMinimize()
  await Navigation.present({
    element: <FrpManagerApp />,
    modalPresentationStyle: "overFullScreen",
  })
  Script.exit()
}

run()
