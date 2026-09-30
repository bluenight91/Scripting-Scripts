// frps 单个代理详情：状态卡片、今日 / 累计流量、起停时间、conf（新路径优先，旧路径 fallback）
import {
  HStack,
  List,
  Section,
  Text,
  useEffect,
  useState,
  VStack,
} from "scripting"
import { connOf, type FrpServer } from "../lib/servers"
import { frpsProxyTraffic, type FrpsProxy } from "../lib/frpApi"
import { describeConf, splitBytes } from "../lib/frpCore"
import { BARE_ROW, Card, IconBadge, InfoRow, LIST_STYLE, MetricTile, StatusPill, Tag } from "../components/Kit"
import { DOWN_TONE, UP_TONE } from "../lib/theme"

export function FrpsProxyDetailView({
  server,
  proxy,
}: {
  server: FrpServer
  proxy: FrpsProxy
}) {
  const [traffic, setTraffic] = useState<{ in: number; out: number } | null>(null)
  const [trafficError, setTrafficError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const t = await frpsProxyTraffic(connOf(server), proxy.name)
        setTraffic({ in: t.trafficIn, out: t.trafficOut })
      } catch (e) {
        setTrafficError(String(e))
      }
    })()
  }, [])

  const isOnline = proxy.status === "online"
  const todayIn = splitBytes(proxy.todayTrafficIn)
  const todayOut = splitBytes(proxy.todayTrafficOut)
  const totalIn = traffic ? splitBytes(traffic.in) : { value: trafficError ? "—" : "…" }
  const totalOut = traffic ? splitBytes(traffic.out) : { value: trafficError ? "—" : "…" }
  const conf = describeConf(proxy.conf)

  return (
    <List
      {...LIST_STYLE}
      navigationTitle={proxy.name}
      navigationBarTitleDisplayMode="inline"
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <Section>
        <VStack {...BARE_ROW} spacing={10}>
          <Card>
            <HStack spacing={12}>
              <IconBadge icon="arrow.left.arrow.right" tone={isOnline ? "green" : "gray"} size={44} filled={isOnline} />
              <VStack alignment="leading" spacing={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <Text font={19} fontWeight="bold" fontDesign="rounded" lineLimit={1}>{proxy.name}</Text>
                <HStack spacing={6}>
                  {proxy.user ? <Tag text={proxy.user} tone="accent" /> : null}
                  <Tag text={`${proxy.curConns ?? 0} 连接`} />
                </HStack>
              </VStack>
              <StatusPill kind={isOnline ? "ok" : "error"} label={proxy.status || "未知"} />
            </HStack>
          </Card>
          <HStack spacing={10}>
            <MetricTile icon="arrow.down" tone={DOWN_TONE} title="今日流入" value={todayIn.value} unit={todayIn.unit} />
            <MetricTile icon="arrow.up" tone={UP_TONE} title="今日流出" value={todayOut.value} unit={todayOut.unit} />
          </HStack>
          <HStack spacing={10}>
            <MetricTile icon="tray.and.arrow.down.fill" tone={DOWN_TONE} title="累计流入" value={totalIn.value} unit={totalIn.unit} />
            <MetricTile icon="tray.and.arrow.up.fill" tone={UP_TONE} title="累计流出" value={totalOut.value} unit={totalOut.unit} />
          </HStack>
          {trafficError ? (
            <Text font={12} foregroundStyle="secondaryLabel">{`累计流量不可用：${trafficError}`}</Text>
          ) : null}
        </VStack>
      </Section>

      <Section header={<Text>时间</Text>}>
        <InfoRow label="最后启动" value={proxy.lastStartTime || "—"} />
        <InfoRow label="最后关闭" value={proxy.lastCloseTime || "—"} />
      </Section>

      <Section header={<Text>配置（conf）</Text>}>
        <Text font={12} fontDesign="monospaced" foregroundStyle={conf ? "label" : "secondaryLabel"}>
          {conf || "—"}
        </Text>
      </Section>
    </List>
  )
}
