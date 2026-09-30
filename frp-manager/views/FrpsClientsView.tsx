// frps 客户端列表：按 online / offline / all 过滤
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
import { frpsClients, type FrpsClient, type FrpsClientStatus } from "../lib/frpApi"
import { BARE_ROW, ChipBar, EmptyState, IconBadge, LIST_STYLE, StatusPill, Tag, type ChipItem } from "../components/Kit"
import { TONES } from "../lib/theme"

const FILTERS: ChipItem<FrpsClientStatus>[] = [
  { id: "online", title: "在线", icon: "circle.fill" },
  { id: "offline", title: "离线", icon: "circle" },
  { id: "all", title: "全部", icon: "square.grid.2x2" },
]

function clientTitle(c: FrpsClient): string {
  return c.hostname || c.runId || "未知客户端"
}

function osIcon(os?: string): string {
  const o = (os ?? "").toLowerCase()
  if (o.includes("darwin") || o.includes("mac")) return "laptopcomputer"
  if (o.includes("windows")) return "pc"
  if (o.includes("android") || o.includes("ios")) return "iphone"
  return "desktopcomputer"
}

export function FrpsClientsView({ server }: { server: FrpServer }) {
  const [filter, setFilter] = useState<FrpsClientStatus>("online")
  const [clients, setClients] = useState<FrpsClient[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load(status: FrpsClientStatus) {
    setError(null)
    try {
      const r = await frpsClients(connOf(server), status)
      setClients(Array.isArray(r.clients) ? r.clients : [])
    } catch (e) {
      setError(String(e))
      setClients(null)
    }
  }

  useEffect(() => {
    void load(filter)
  }, [filter])

  const list = clients ?? []

  return (
    <List
      {...LIST_STYLE}
      navigationTitle="客户端"
      refreshable={async () => { await load(filter) }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <Section>
        <VStack {...BARE_ROW}>
          <ChipBar items={FILTERS} value={filter} onChange={setFilter} />
        </VStack>
      </Section>
      <Section
        header={clients ? <Text>{`${list.length} 个客户端`}</Text> : undefined}
        footer={error ? <Text font={13} foregroundStyle={TONES.red.fg}>{error}</Text> : undefined}
      >
        {clients === null && !error ? (
          <EmptyState icon="hourglass" title="加载中…" />
        ) : list.length === 0 && !error ? (
          <EmptyState icon="desktopcomputer" title="没有客户端" />
        ) : (
          list.map((c, i) => {
            const isOnline = c.status === "online"
            return (
              <HStack
                key={c.runId ?? `${clientTitle(c)}-${i}`}
                spacing={12}
                padding={{ vertical: 3 }}
                frame={{ maxWidth: "infinity", alignment: "leading" }}
              >
                <IconBadge icon={osIcon(c.os)} tone={isOnline ? "blue" : "gray"} size={34} />
                <VStack alignment="leading" spacing={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  <Text font={15} fontWeight="semibold" lineLimit={1}>{clientTitle(c)}</Text>
                  <HStack spacing={5}>
                    {c.version ? <Tag text={`v${c.version}`} mono /> : null}
                    {c.os ? <Tag text={c.arch ? `${c.os}/${c.arch}` : c.os} mono /> : null}
                    {c.user ? <Tag text={c.user} tone="accent" /> : null}
                  </HStack>
                </VStack>
                {c.status ? (
                  <StatusPill kind={isOnline ? "ok" : "idle"} label={isOnline ? "在线" : "离线"} compact />
                ) : null}
              </HStack>
            )
          })
        )}
      </Section>
    </List>
  )
}
