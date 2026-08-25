// iOS / iPadOS 主屏幕 Widget：一次性取快照，不启动面板轮询
import { Script, VStack, Widget } from "scripting"
import { RefreshNetworkWidgetIntent } from "./app_intents"
import { NetworkDiagWidget } from "./components/NetworkDiagWidget"
import { loadNetworkSnapshot } from "./lib/networkDiag"

async function run() {
  const snapshot = await loadNetworkSnapshot({ parameter: Widget.parameter })
  const refreshAt = new Date(Date.now() + snapshot.refreshMin * 60 * 1000)
  const openPanel = Script.createRunURLScheme(Script.name)

  Widget.present(
    <VStack
      spacing={0}
      frame={Widget.displaySize}
      widgetURL={openPanel}
      widgetBackground={{ light: "#F2F5FA", dark: "#090F1B" }}
    >
      <NetworkDiagWidget
        snapshot={snapshot}
        family={Widget.family}
        displaySize={Widget.displaySize}
        refreshIntent={RefreshNetworkWidgetIntent(undefined)}
      />
    </VStack>,
    { policy: "after", date: refreshAt }
  )
  Script.exit()
}

void run()
