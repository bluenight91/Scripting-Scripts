// frps 详情：服务端信息卡片、按类型代理统计、客户端列表、清理离线代理
import {
  Button,
  Dialog,
  HStack,
  List,
  NavigationLink,
  Picker,
  Section,
  Text,
  useEffect,
  useState,
  VStack,
} from "scripting"
import { connOf, type FrpServer } from "../lib/servers"
import {
  FRPS_PROXY_TYPES,
  frpsCleanOfflineProxies,
  frpsProxies,
  frpsServerInfo,
  type FrpsProxy,
  type FrpsServerInfo,
} from "../lib/frpApi"
import { formatBytes } from "../lib/frpCore"
import { FrpsProxyDetailView } from "./FrpsProxyDetailView"
import { FrpsClientsView } from "./FrpsClientsView"

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack spacing={10} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <Text font={14} foregroundStyle="secondaryLabel" frame={{ width: 110, alignment: "leading" }}>
        {label}
      </Text>
      <Text font={14} frame={{ maxWidth: "infinity", alignment: "trailing" }}>{value}</Text>
    </HStack>
  )
}

export function FrpsView({ server }: { server: FrpServer }) {
  const [info, setInfo] = useState<FrpsServerInfo | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [proxyType, setProxyType] = useState<string>("tcp")
  const [proxies, setProxies] = useState<FrpsProxy[] | null>(null)
  const [proxyError, setProxyError] = useState<string | null>(null)
  const [cleanMsg, setCleanMsg] = useState<string | null>(null)

  async function load() {
    setInfoError(null)
    setProxyError(null)
    try {
      setInfo(await frpsServerInfo(connOf(server)))
    } catch (e) {
      setInfoError(String(e))
      setInfo(null)
    }
    try {
      const r = await frpsProxies(connOf(server), proxyType)
      setProxies(Array.isArray(r.proxies) ? r.proxies : [])
    } catch (e) {
      setProxyError(String(e))
      setProxies(null)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line
  }, [])

  useEffect(() => {
    void (async () => {
      setProxyError(null)
      try {
        const r = await frpsProxies(connOf(server), proxyType)
        setProxies(Array.isArray(r.proxies) ? r.proxies : [])
      } catch (e) {
        setProxyError(String(e))
        setProxies(null)
      }
    })()
  }, [proxyType])

  async function cleanOffline() {
    const ok = await Dialog.confirm({
      title: "清理离线代理？",
      message: "将删除所有 offline 状态的代理统计记录，不影响在线代理。",
      confirmLabel: "清理",
      cancelLabel: "取消",
    })
    if (!ok) return
    try {
      await frpsCleanOfflineProxies(connOf(server))
      setCleanMsg("已清理离线代理记录。")
      await load()
    } catch (e) {
      setCleanMsg(`清理失败：${e}`)
    }
  }

  const typeCounts = info?.proxyTypeCounts ?? {}
  const online = proxies?.filter((p) => p.status === "online").length ?? 0

  return (
    <List
      navigationTitle={server.name}
      refreshable={load}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <Section header={<Text font={13}>服务端信息</Text>}>
        {infoError ? (
          <Text font={14} foregroundStyle="systemRed">{infoError}</Text>
        ) : info === null ? (
          <Text font={15} foregroundStyle="secondaryLabel">加载中…</Text>
        ) : (
          <VStack spacing={6} alignment="leading" frame={{ maxWidth: "infinity", alignment: "leading" }}>
            <InfoRow label="版本" value={info.version ?? "—"} />
            <InfoRow label="bindPort" value={String(info.bindPort ?? "—")} />
            <InfoRow label="当前连接" value={String(info.curConns ?? 0)} />
            <InfoRow label="总流入" value={formatBytes(info.totalTrafficIn)} />
            <InfoRow label="总流出" value={formatBytes(info.totalTrafficOut)} />
            <InfoRow label="客户端数" value={String(info.clientCounts ?? 0)} />
            <InfoRow
              label="代理数"
              value={Object.entries(typeCounts).map(([t, c]) => `${t}:${c}`).join("  ") || "—"}
            />
          </VStack>
        )}
      </Section>

      <Section
        header={<Text font={13}>代理统计</Text>}
        footer={<Text font={13}>{proxyError ?? `共 ${proxies?.length ?? 0} 个，在线 ${online} 个。点按查看详情与累计流量。`}</Text>}
      >
        <Picker
          label={<Text>类型</Text>}
          pickerStyle="segmented"
          value={proxyType}
          onChanged={(v: string) => setProxyType(v)}
        >
          {FRPS_PROXY_TYPES.map((t) => (
            <Text key={t} tag={t}>{t}</Text>
          ))}
        </Picker>
        {proxies === null && !proxyError ? (
          <Text font={15} foregroundStyle="secondaryLabel">加载中…</Text>
        ) : (
          (proxies ?? []).map((p) => (
            <NavigationLink
              key={p.name}
              destination={<FrpsProxyDetailView server={server} proxy={p} />}
            >
              <HStack spacing={10} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  <Text font={16}>{p.name}</Text>
                  <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>
                    今日 {formatBytes(p.todayTrafficIn)} ↓ / {formatBytes(p.todayTrafficOut)} ↑ · {p.curConns} 连接
                  </Text>
                </VStack>
                <Text
                  font={12}
                  foregroundStyle={p.status === "online" ? "systemGreen" : "systemRed"}
                >
                  {p.status || "未知"}
                </Text>
              </HStack>
            </NavigationLink>
          ))
        )}
      </Section>

      <Section>
        <NavigationLink destination={<FrpsClientsView server={server} />}>
          <Text font={16}>客户端列表</Text>
        </NavigationLink>
      </Section>

      <Section footer={<Text font={13}>{cleanMsg ?? "仅删除 offline 状态的代理统计记录。"}</Text>}>
        <Button
          title="清理离线代理记录"
          role="destructive"
          systemImage="trash"
          action={() => { void cleanOffline() }}
        />
      </Section>
    </List>
  )
}
