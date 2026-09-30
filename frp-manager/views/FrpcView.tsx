// frpc 详情：概览指标 + 按类型筛选的代理列表（/api/status），配置 / Store / 停止 入口
import {
  Button,
  Dialog,
  HStack,
  List,
  NavigationLink,
  Section,
  Text,
  useEffect,
  useState,
  VStack,
} from "scripting"
import {
  connOf,
  type FrpServer,
} from "../lib/servers"
import { frpcStatus, frpcStop, type FrpcProxyStatus, type FrpcStatus } from "../lib/frpApi"
import {
  BARE_ROW,
  ChipBar,
  EmptyState,
  IconBadge,
  LIST_STYLE,
  ListRow,
  MetricTile,
  StatusPill,
  Tag,
  type ChipItem,
  type StatusKind,
} from "../components/Kit"
import { TONES } from "../lib/theme"
import { FrpcConfigView } from "./FrpcConfigView"
import { FrpcStoreView } from "./FrpcStoreView"

const TYPE_ORDER = ["tcp", "udp", "http", "https", "stcp", "xtcp", "tcpmux", "sudp"]

function orderedGroups(status: FrpcStatus): [string, FrpcProxyStatus[]][] {
  const keys = Object.keys(status)
  const known = TYPE_ORDER.filter((t) => keys.includes(t))
  const rest = keys.filter((k) => !TYPE_ORDER.includes(k)).sort()
  return [...known, ...rest].map((k) => [k, status[k] ?? []])
}

function proxyState(p: FrpcProxyStatus): { kind: StatusKind; failed: boolean; running: boolean } {
  const failed = !!p.err || /error/i.test(p.status)
  const running = !failed && p.status === "running"
  return { kind: failed ? "error" : running ? "ok" : "warn", failed, running }
}

function ProxyRow({ p }: { p: FrpcProxyStatus }) {
  const st = proxyState(p)
  return (
    <HStack spacing={12} padding={{ vertical: 3 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <IconBadge
        icon={st.failed ? "exclamationmark.triangle.fill" : st.running ? "arrow.left.arrow.right" : "pause.fill"}
        tone={st.failed ? "red" : st.running ? "green" : "orange"}
        size={32}
      />
      <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <HStack spacing={6}>
          <Text font={15} fontWeight="semibold" lineLimit={1}>{p.name}</Text>
          <Tag text={p.type} mono />
        </HStack>
        <Text font={12} fontDesign="monospaced" foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.8}>
          {`${p.local_addr || "—"} → ${p.remote_addr || "—"}`}
        </Text>
        {st.failed && p.err ? (
          <Text font={12} foregroundStyle={TONES.red.fg} lineLimit={2}>{p.err}</Text>
        ) : null}
      </VStack>
      <StatusPill kind={st.kind} label={p.status || "未知"} compact />
    </HStack>
  )
}

export function FrpcView({ server }: { server: FrpServer }) {
  const [status, setStatus] = useState<FrpcStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const [stopMsg, setStopMsg] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>("all")

  async function load() {
    setError(null)
    try {
      setStatus(await frpcStatus(connOf(server)))
    } catch (e) {
      setError(String(e))
      setStatus(null)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function stop() {
    const ok = await Dialog.confirm({
      title: "停止 frpc？",
      message: "将调用 /api/stop 让远端 frpc 优雅退出。退出后需要在外部重新启动它。",
      confirmLabel: "停止",
      cancelLabel: "取消",
    })
    if (!ok) return
    setStopping(true)
    setStopMsg(null)
    try {
      await frpcStop(connOf(server))
      setStopMsg("已发送停止指令，frpc 正在退出。")
    } catch (e) {
      setStopMsg(`停止失败：${e}`)
    } finally {
      setStopping(false)
    }
  }

  const groups = status ? orderedGroups(status) : []
  const all = groups.flatMap(([, list]) => list)
  const runningCount = all.filter((p) => proxyState(p).running).length
  const failedCount = all.filter((p) => proxyState(p).failed).length
  const activeFilter = filter === "all" || groups.some(([t]) => t === filter) ? filter : "all"
  const shown = activeFilter === "all" ? all : groups.find(([t]) => t === activeFilter)?.[1] ?? []
  const chips: ChipItem<string>[] = [
    { id: "all", title: "全部", count: all.length },
    ...groups.map(([t, list]) => ({ id: t, title: t.toUpperCase(), count: list.length })),
  ]

  return (
    <List
      {...LIST_STYLE}
      navigationTitle={server.name}
      refreshable={load}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <Section>
        <VStack {...BARE_ROW} spacing={10}>
          <HStack spacing={10}>
            <MetricTile icon="arrow.triangle.branch" tone="accent" title="代理" value={status ? String(all.length) : "—"} />
            <MetricTile icon="checkmark.circle.fill" tone="green" title="运行中" value={status ? String(runningCount) : "—"} />
            <MetricTile
              icon="exclamationmark.triangle.fill"
              tone={failedCount > 0 ? "red" : "gray"}
              title="异常"
              value={status ? String(failedCount) : "—"}
            />
          </HStack>
          {groups.length > 1 ? <ChipBar items={chips} value={activeFilter} onChange={setFilter} /> : null}
        </VStack>
      </Section>

      {error ? (
        <Section>
          <HStack spacing={10}>
            <IconBadge icon="wifi.exclamationmark" tone="red" />
            <Text font={13} foregroundStyle={TONES.red.fg}>{error}</Text>
          </HStack>
        </Section>
      ) : null}

      <Section header={<Text>{activeFilter === "all" ? "代理" : activeFilter.toUpperCase()}</Text>}>
        {status === null && !error ? (
          <EmptyState icon="hourglass" title="加载中…" />
        ) : status && all.length === 0 ? (
          <EmptyState icon="tray" title="当前没有任何代理" message="在 frpc 配置或 Store 中添加代理" />
        ) : (
          shown.map((p) => <ProxyRow key={`${p.type}:${p.name}`} p={p} />)
        )}
      </Section>

      <Section header={<Text>管理</Text>}>
        <NavigationLink destination={<FrpcConfigView server={server} />}>
          <ListRow icon="doc.text.fill" tone="orange" title="配置文件" subtitle="查看 / 编辑 frpc.toml 并热重载" />
        </NavigationLink>
        <NavigationLink destination={<FrpcStoreView server={server} />}>
          <ListRow icon="shippingbox.fill" tone="teal" title="Store 动态代理" subtitle="无需改配置即可增删代理" />
        </NavigationLink>
      </Section>

      <Section
        footer={
          <Text font={13}>
            {stopMsg ?? "停止后面板将无法再连接该 frpc，需要在外部重新启动。"}
          </Text>
        }
      >
        <Button disabled={stopping} action={() => { void stop() }}>
          <ListRow icon="stop.fill" tone="red" title={stopping ? "停止中…" : "停止 frpc"} titleColor="systemRed" />
        </Button>
      </Section>
    </List>
  )
}
