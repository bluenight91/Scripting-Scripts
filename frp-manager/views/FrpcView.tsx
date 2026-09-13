// frpc 详情：代理状态列表（/api/status），配置 / Store / 停止 入口
import {
  Button,
  Dialog,
  HStack,
  Image,
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
import { FrpcConfigView } from "./FrpcConfigView"
import { FrpcStoreView } from "./FrpcStoreView"

const TYPE_ORDER = ["tcp", "udp", "http", "https", "stcp", "xtcp", "tcpmux", "sudp"]

function orderedGroups(status: FrpcStatus): [string, FrpcProxyStatus[]][] {
  const keys = Object.keys(status)
  const known = TYPE_ORDER.filter((t) => keys.includes(t))
  const rest = keys.filter((k) => !TYPE_ORDER.includes(k)).sort()
  return [...known, ...rest].map((k) => [k, status[k] ?? []])
}

function ProxyRow({ p }: { p: FrpcProxyStatus }) {
  const running = p.status === "running"
  const failed = !!p.err || /error/i.test(p.status)
  return (
    <HStack spacing={10} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <HStack spacing={6}>
          <Text font={16}>{p.name}</Text>
          <Text font={11} foregroundStyle="secondaryLabel">{p.type}</Text>
        </HStack>
        <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>
          {p.local_addr || "—"} → {p.remote_addr || "—"}
        </Text>
        {failed && p.err ? (
          <Text font={12} foregroundStyle="systemRed" lineLimit={2}>{p.err}</Text>
        ) : null}
      </VStack>
      <HStack spacing={4}>
        <Image
          systemName="circle.fill"
          font={8}
          foregroundStyle={failed ? "systemRed" : running ? "systemGreen" : "systemOrange"}
        />
        <Text
          font={12}
          foregroundStyle={failed ? "systemRed" : running ? "systemGreen" : "systemOrange"}
        >
          {p.status || "未知"}
        </Text>
      </HStack>
    </HStack>
  )
}

export function FrpcView({ server }: { server: FrpServer }) {
  const [status, setStatus] = useState<FrpcStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const [stopMsg, setStopMsg] = useState<string | null>(null)

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

  return (
    <List
      navigationTitle={server.name}
      refreshable={load}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      {error ? (
        <Section>
          <Text font={14} foregroundStyle="systemRed">{error}</Text>
        </Section>
      ) : null}
      {status && groups.length === 0 ? (
        <Section>
          <Text font={15} foregroundStyle="secondaryLabel">当前没有任何代理。</Text>
        </Section>
      ) : null}
      {groups.map(([type, list]) => (
        <Section key={type} header={<Text font={13}>{type.toUpperCase()}（{list.length}）</Text>}>
          {list.map((p) => (
            <ProxyRow key={`${p.type}:${p.name}`} p={p} />
          ))}
        </Section>
      ))}
      <Section header={<Text font={13}>配置</Text>}>
        <NavigationLink destination={<FrpcConfigView server={server} />}>
          <Text font={16}>查看 / 编辑配置</Text>
        </NavigationLink>
      </Section>
      <Section header={<Text font={13}>Store</Text>}>
        <NavigationLink destination={<FrpcStoreView server={server} />}>
          <Text font={16}>动态代理管理</Text>
        </NavigationLink>
      </Section>
      <Section
        footer={
          <Text font={13}>
            {stopMsg ?? "停止后面板将无法再连接该 frpc，需要在外部重新启动。"}
          </Text>
        }
      >
        <Button
          title={stopping ? "停止中…" : "停止 frpc"}
          role="destructive"
          systemImage="stop.circle"
          disabled={stopping}
          action={() => { void stop() }}
        />
      </Section>
    </List>
  )
}
