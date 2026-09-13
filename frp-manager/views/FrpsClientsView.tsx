// frps 客户端列表：可按 online / offline / all 过滤
import {
  HStack,
  List,
  Picker,
  Section,
  Text,
  useEffect,
  useState,
  VStack,
} from "scripting"
import { connOf, type FrpServer } from "../lib/servers"
import { frpsClients, type FrpsClient, type FrpsClientStatus } from "../lib/frpApi"

const FILTERS: { tag: FrpsClientStatus; label: string }[] = [
  { tag: "online", label: "在线" },
  { tag: "offline", label: "离线" },
  { tag: "all", label: "全部" },
]

function clientTitle(c: FrpsClient): string {
  return c.hostname || c.runId || "未知客户端"
}

function clientSubtitle(c: FrpsClient): string {
  const bits = [c.user ? `user: ${c.user}` : null, c.version ? `v${c.version}` : null, c.os, c.arch]
  return bits.filter(Boolean).join(" · ") || "—"
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

  return (
    <List
      navigationTitle="客户端"
      refreshable={async () => { await load(filter) }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <Section footer={<Text font={13}>{error ?? `共 ${clients?.length ?? 0} 个客户端。`}</Text>}>
        <Picker
          label={<Text>过滤</Text>}
          pickerStyle="segmented"
          value={filter}
          onChanged={(v: string) => setFilter(v as FrpsClientStatus)}
        >
          {FILTERS.map((f) => (
            <Text key={f.tag} tag={f.tag}>{f.label}</Text>
          ))}
        </Picker>
      </Section>
      {clients === null && !error ? (
        <Section>
          <Text font={15} foregroundStyle="secondaryLabel">加载中…</Text>
        </Section>
      ) : (
        <Section>
          {(clients ?? []).map((c, i) => (
            <HStack
              key={c.runId ?? `${clientTitle(c)}-${i}`}
              spacing={10}
              frame={{ maxWidth: "infinity", alignment: "leading" }}
            >
              <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <Text font={16}>{clientTitle(c)}</Text>
                <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>
                  {clientSubtitle(c)}
                </Text>
              </VStack>
              {c.status ? (
                <Text
                  font={12}
                  foregroundStyle={c.status === "online" ? "systemGreen" : "systemRed"}
                >
                  {c.status === "online" ? "在线" : "离线"}
                </Text>
              ) : null}
            </HStack>
          ))}
        </Section>
      )}
    </List>
  )
}
