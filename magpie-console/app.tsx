// magpie 控制台主界面：网关引导 + 五个 Tab；设置 / 接入 / 诊断在设置页内导航
import {
  Button,
  Image,
  Navigation,
  NavigationStack,
  Tab,
  TabView,
  Toolbar,
  ToolbarItem,
  useEffect,
  useObservable,
  useState,
} from "scripting"
import { activeGatewayId, loadGateways } from "./lib/store"
import { TABS, TAB_ORDER, type TabId } from "./lib/tabs"
import { TONES } from "./lib/theme"
import type { Gateway } from "./lib/types"
import { useMarkdownReleaseNotesSheet } from "./components/ReleaseNotesSheet"
import { GatewayEditView } from "./views/GatewayEditView"
import { OverviewView } from "./views/OverviewView"
import { ProvidersView } from "./views/ProvidersView"
import { ModelsView } from "./views/ModelsView"
import { RoutesView } from "./views/RoutesView"
import { KeysView } from "./views/KeysView"
import { SettingsView } from "./views/SettingsView"

function tabContent(id: TabId, gateway: Gateway) {
  switch (id) {
    case "overview":
      return <OverviewView gateway={gateway} />
    case "providers":
      return <ProvidersView gateway={gateway} />
    case "models":
      return <ModelsView gateway={gateway} />
    case "routes":
      return <RoutesView gateway={gateway} />
    case "keys":
      return <KeysView gateway={gateway} />
  }
}

export function MagpieConsoleApp() {
  const dismiss = Navigation.useDismiss()
  const selection = useObservable<number>(0)
  const releaseNotes = useMarkdownReleaseNotesSheet({
    markdownFile: "changelog.md",
    storageKey: "magpie-console:release-notes:last-seen-hash",
    title: "更新说明",
  })

  const [gateways, setGateways] = useState<Gateway[]>(loadGateways())
  const [currentId, setCurrentId] = useState<string | null>(activeGatewayId())
  const [showSettings, setShowSettings] = useState(false)

  const active = gateways.find(item => item.id === currentId) ?? gateways[0] ?? null

  function refresh() {
    setGateways(loadGateways())
    setCurrentId(activeGatewayId())
  }

  useEffect(() => {
    refresh()
  }, [])

  if (!active) {
    return (
      <NavigationStack>
        <GatewayEditView
          onSaved={() => refresh()}
          onCancel={() => dismiss()}
        />
      </NavigationStack>
    )
  }

  const toolbar = (
    <Toolbar>
      <ToolbarItem placement="topBarLeading" sharedBackgroundVisibility="visible">
        <Button
          action={() => dismiss()}
          buttonStyle="plain"
          frame={{ width: 44, height: 44 }}
          contentShape="rect"
          accessibilityLabel="关闭"
        >
          <Image systemName="xmark" font="headline" foregroundStyle="label" />
        </Button>
      </ToolbarItem>
      <ToolbarItem placement="topBarTrailing" sharedBackgroundVisibility="visible">
        <Button
          action={() => setShowSettings(true)}
          buttonStyle="plain"
          frame={{ width: 44, height: 44 }}
          contentShape="rect"
          accessibilityLabel="设置"
        >
          <Image systemName="gearshape" font="headline" foregroundStyle="label" />
        </Button>
      </ToolbarItem>
    </Toolbar>
  )

  return (
    <NavigationStack
      sheet={{
        isPresented: showSettings,
        onChanged: (presented: boolean) => setShowSettings(presented),
        content: (
          <SettingsView
            onGatewaysChanged={() => refresh()}
            onClose={() => setShowSettings(false)}
          />
        ),
      }}
    >
      <TabView
        selection={selection}
        tint={TONES.accent.fg}
        toolbar={toolbar}
        tabBarMinimizeBehavior="onScrollDown"
        scrollEdgeEffectHidden="bottom"
        ignoresSafeArea={{ regions: "container", edges: "bottom" }}
        sheet={releaseNotes}
      >
        {TAB_ORDER.map((id, index) => (
          <Tab key={id} title={TABS[id].title} systemImage={TABS[id].icon} value={index}>
            {tabContent(id, active)}
          </Tab>
        ))}
      </TabView>
    </NavigationStack>
  )
}