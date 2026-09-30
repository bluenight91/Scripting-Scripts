// frps 详情：服务端主卡片、按类型筛选的代理统计、客户端列表、清理离线代理
import {
  Button,
  Dialog,
  HStack,
  Image,
  List,
  NavigationLink,
  Section,
  Spacer,
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
import { formatBytes, splitBytes } from "../lib/frpCore"
import {
  BARE_ROW,
  ChipBar,
  EmptyState,
  HeroCard,
  IconBadge,
  LIST_STYLE,
  ListRow,
  StatusPill,
  Tag,
  ValueText,
  type ChipItem,
} from "../components/Kit"
import { TONES } from "../lib/theme"
import { FrpsProxyDetailView } from "./FrpsProxyDetailView"
import { FrpsClientsView } from "./FrpsClientsView"

const HERO_DIM = "rgba(255,255,255,0.75)"

function HeroStat({ icon, label, bytes }: { icon: string; label: string; bytes: number | undefined }) {
  const v = splitBytes(bytes)
  return (
    <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack spacing={4}>
        <Image systemName={icon} font={11} foregroundStyle={HERO_DIM} />
        <Text font={12} fontWeight="medium" foregroundStyle={HERO_DIM}>{label}</Text>
      </HStack>
      <ValueText value={v.value} unit={v.unit} size={30} color="white" unitColor={HERO_DIM} />
    </VStack>
  )
}

function HeroChip({ text }: { text: string }) {
  return (
    <Text
      font={12}
      fontWeight="semibold"
      fontDesign="rounded"
      foregroundStyle="white"
      padding={{ horizontal: 10, vertical: 5 }}
      background={{ style: "rgba(255,255,255,0.18)", shape: "capsule" }}
    >
      {text}
    </Text>
  )
}

export function FrpsView({ server }: { server: FrpServer }) {
  const [info, setInfo] = useState<FrpsServerInfo | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [proxyType, setProxyType] = useState<string>("tcp")
  const [proxies, setProxies] = useState<FrpsProxy[] | null>(null)
  const [proxyError, setProxyError] = useState<string | null>(null)
  const [cleanMsg, setCleanMsg] = useState<string | null>(null)

  async function loadProxies(type: string) {
    setProxyError(null)
    try {
      const r = await frpsProxies(connOf(server), type)
      setProxies(Array.isArray(r.proxies) ? r.proxies : [])
    } catch (e) {
      setProxyError(String(e))
      setProxies(null)
    }
  }

  async function load() {
    setInfoError(null)
    try {
      setInfo(await frpsServerInfo(connOf(server)))
    } catch (e) {
      setInfoError(String(e))
      setInfo(null)
    }
    await loadProxies(proxyType)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line
  }, [])

  useEffect(() => {
    void loadProxies(proxyType)
    // eslint-disable-next-line
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
  const totalProxies = Object.values(typeCounts).reduce((a, b) => a + (Number(b) || 0), 0)
  const chips: ChipItem<string>[] = FRPS_PROXY_TYPES.map((t) => ({
    id: t,
    title: t.toUpperCase(),
    count: typeCounts[t] ?? undefined,
  }))

  return (
    <List
      {...LIST_STYLE}
      navigationTitle={server.name}
      refreshable={load}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <Section>
        <VStack {...BARE_ROW} spacing={12}>
          {infoError ? (
            <HStack spacing={10} padding={14} frame={{ maxWidth: "infinity", alignment: "leading" }}>
              <IconBadge icon="wifi.exclamationmark" tone="red" />
              <Text font={13} foregroundStyle={TONES.red.fg}>{infoError}</Text>
            </HStack>
          ) : (
            <HeroCard>
              <HStack spacing={8}>
                <Image systemName="server.rack" font={14} foregroundStyle={HERO_DIM} />
                <Text font={14} fontWeight="semibold" foregroundStyle={HERO_DIM}>
                  {info ? `frps ${info.version ?? ""}` : "加载中…"}
                </Text>
                <Spacer />
                {info ? <HeroChip text={`bindPort ${info.bindPort ?? "—"}`} /> : null}
              </HStack>
              <HStack spacing={14}>
                <HeroStat icon="arrow.down" label="总流入" bytes={info?.totalTrafficIn} />
                <HeroStat icon="arrow.up" label="总流出" bytes={info?.totalTrafficOut} />
              </HStack>
              <HStack spacing={8}>
                <HeroChip text={`${info?.clientCounts ?? 0} 客户端`} />
                <HeroChip text={`${info?.curConns ?? 0} 连接`} />
                <HeroChip text={`${totalProxies} 代理`} />
              </HStack>
            </HeroCard>
          )}
          <ChipBar items={chips} value={proxyType} onChange={setProxyType} />
        </VStack>
      </Section>

      <Section
        header={<Text>{`${proxyType.toUpperCase()} 代理`}</Text>}
        footer={
          proxyError ? (
            <Text font={13} foregroundStyle={TONES.red.fg}>{proxyError}</Text>
          ) : (
            <Text font={13}>{`共 ${proxies?.length ?? 0} 个，在线 ${online} 个。点按查看详情与累计流量。`}</Text>
          )
        }
      >
        {proxies === null && !proxyError ? (
          <EmptyState icon="hourglass" title="加载中…" />
        ) : (proxies ?? []).length === 0 && !proxyError ? (
          <EmptyState icon="tray" title={`没有 ${proxyType.toUpperCase()} 代理`} />
        ) : (
          (proxies ?? []).map((p) => {
            const isOnline = p.status === "online"
            return (
              <NavigationLink
                key={p.name}
                destination={<FrpsProxyDetailView server={server} proxy={p} />}
              >
                <HStack spacing={12} padding={{ vertical: 3 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  <IconBadge icon="arrow.left.arrow.right" tone={isOnline ? "green" : "gray"} size={32} />
                  <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                    <HStack spacing={6}>
                      <Text font={15} fontWeight="semibold" lineLimit={1}>{p.name}</Text>
                      {p.curConns > 0 ? <Tag text={`${p.curConns} 连接`} tone="accent" /> : null}
                    </HStack>
                    <Text font={12} fontDesign="rounded" monospacedDigit foregroundStyle="secondaryLabel" lineLimit={1}>
                      {`今日 ↓ ${formatBytes(p.todayTrafficIn)}  ↑ ${formatBytes(p.todayTrafficOut)}`}
                    </Text>
                  </VStack>
                  <StatusPill kind={isOnline ? "ok" : "error"} label={p.status || "未知"} compact />
                </HStack>
              </NavigationLink>
            )
          })
        )}
      </Section>

      <Section header={<Text>管理</Text>}>
        <NavigationLink destination={<FrpsClientsView server={server} />}>
          <ListRow
            icon="desktopcomputer"
            tone="blue"
            title="客户端"
            value={info ? String(info.clientCounts ?? 0) : undefined}
          />
        </NavigationLink>
      </Section>

      <Section footer={<Text font={13}>{cleanMsg ?? "仅删除 offline 状态的代理统计记录。"}</Text>}>
        <Button action={() => { void cleanOffline() }}>
          <ListRow icon="trash.fill" tone="red" title="清理离线代理记录" titleColor="systemRed" />
        </Button>
      </Section>
    </List>
  )
}
