// Surge Panel 主界面（index.tsx 全屏运行与 home_screen_default_ui.tsx 首页 Tab 共用）
import {
  Button,
  Image,
  Navigation,
  NavigationStack,
  Picker,
  Script,
  Tab,
  TabView,
  Text,
  Toolbar,
  ToolbarItem,
  useEffect,
  useObservable,
  VStack,
} from "scripting"
import { startPolling, stopPolling, registerTabJump } from "./lib/store"
import { OverviewView } from "./views/OverviewView"
import { PoliciesView } from "./views/PoliciesView"
import { TrafficView } from "./views/TrafficView"
import { NetworkView } from "./views/NetworkView"
import { SettingsView } from "./views/SettingsView"

const TAB_TITLES = ["总览", "策略", "流量", "请求", "设置"]

function TabContent({ index }: { index: number }) {
  return index === 0 ? (
    <OverviewView />
  ) : index === 1 ? (
    <PoliciesView />
  ) : index === 2 ? (
    <TrafficView />
  ) : index === 3 ? (
    <NetworkView />
  ) : (
    <SettingsView />
  )
}

export function SurgePanelApp() {
  const dismiss = Navigation.useDismiss()
  const selection = useObservable<number>(0)
  // 首页 Tab 环境（Scripting App 首页承载）：改用顶部分段选择器，避免与 App 底栏叠出双层标签栏
  const isHome = Script.env === "home_screen"

  useEffect(() => {
    startPolling()
    return () => stopPolling()
  }, [])

  useEffect(() => registerTabJump((i) => selection.setValue(i)), [])

  // ---------- 首页 Tab：顶部分段选择器 ----------
  if (isHome) {
    const current = selection.value
    return (
      <NavigationStack>
        <VStack spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
          <Picker
            label={<Text>页面切换</Text>}
            pickerStyle="segmented"
            value={String(current)}
            onChanged={(v: string) => selection.setValue(Number(v))}
            padding={{ horizontal: 16, top: 8, bottom: 4 }}
          >
            {TAB_TITLES.map((t, i) => (
              <Text key={t} tag={String(i)}>{t}</Text>
            ))}
          </Picker>
          <TabContent index={current} />
        </VStack>
      </NavigationStack>
    )
  }

  // ---------- 全屏运行：原生底部 TabView ----------
  const toolbar = (
    <Toolbar>
      {/* 关闭 */}
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

      {/* 最小化（支持时） */}
      {Script.supportsMinimization() ? (
        <ToolbarItem placement="topBarTrailing" sharedBackgroundVisibility="visible">
          <Button
            action={() => {
              if (!Script.isMinimized()) Script.minimize().catch(() => {})
            }}
            buttonStyle="plain"
            frame={{ width: 44, height: 44 }}
            contentShape="rect"
            accessibilityLabel="最小化"
          >
            <Image
              systemName="arrow.down.right.and.arrow.up.left"
              font="headline"
              foregroundStyle="label"
            />
          </Button>
        </ToolbarItem>
      ) : undefined}
    </Toolbar>
  )

  return (
    <NavigationStack>
      <TabView
        selection={selection}
        tint="systemBlue"
        toolbar={toolbar}
        tabBarMinimizeBehavior="onScrollDown"
        scrollEdgeEffectHidden="bottom"
        ignoresSafeArea={{ regions: "container", edges: "bottom" }}
      >
        <Tab title="总览" systemImage="speedometer" value={0}>
          <OverviewView />
        </Tab>
        <Tab title="策略" systemImage="point.3.connected.trianglepath.dotted" value={1}>
          <PoliciesView />
        </Tab>
        <Tab title="流量" systemImage="arrow.up.arrow.down" value={2}>
          <TrafficView />
        </Tab>
        <Tab title="请求" systemImage="list.bullet.rectangle" value={3}>
          <NetworkView />
        </Tab>
        <Tab title="设置" systemImage="gearshape" value={4}>
          <SettingsView />
        </Tab>
      </TabView>
    </NavigationStack>
  )
}
