// frps 单个代理详情：conf、起停时间、累计流量（新路径优先，旧路径 fallback）
import {
  List,
  Section,
  Text,
  useEffect,
  useState,
  VStack,
} from "scripting"
import { connOf, type FrpServer } from "../lib/servers"
import { frpsProxyTraffic, type FrpsProxy } from "../lib/frpApi"
import { describeConf, formatBytes } from "../lib/frpCore"

function Row({ label, value }: { label: string; value: string }) {
  return (
    <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <Text font={12} foregroundStyle="secondaryLabel">{label}</Text>
      <Text font={14} lineLimit={value.length > 40 ? undefined : 1}>{value || "—"}</Text>
    </VStack>
  )
}

export function FrpsProxyDetailView({
  server,
  proxy,
}: {
  server: FrpServer
  proxy: FrpsProxy
}) {
  const [traffic, setTraffic] = useState<{ in: string; out: string } | null>(null)
  const [trafficError, setTrafficError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const t = await frpsProxyTraffic(connOf(server), proxy.name)
        setTraffic({ in: formatBytes(t.trafficIn), out: formatBytes(t.trafficOut) })
      } catch (e) {
        setTrafficError(String(e))
      }
    })()
  }, [])

  return (
    <List
      navigationTitle={proxy.name}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <Section header={<Text font={13}>状态</Text>}>
        <Row label="状态" value={proxy.status || "未知"} />
        <Row label="所属用户" value={proxy.user || "—"} />
        <Row label="当前连接" value={String(proxy.curConns ?? 0)} />
        <Row label="今日流入" value={formatBytes(proxy.todayTrafficIn)} />
        <Row label="今日流出" value={formatBytes(proxy.todayTrafficOut)} />
        <Row label="累计流入" value={traffic?.in ?? (trafficError ?? "加载中…")} />
        <Row label="累计流出" value={traffic?.out ?? (trafficError ?? "加载中…")} />
        <Row label="最后启动" value={proxy.lastStartTime || "—"} />
        <Row label="最后关闭" value={proxy.lastCloseTime || "—"} />
      </Section>
      <Section header={<Text font={13}>配置（conf）</Text>}>
        <Text font={12} lineLimit={undefined}>{describeConf(proxy.conf) || "—"}</Text>
      </Section>
    </List>
  )
}
