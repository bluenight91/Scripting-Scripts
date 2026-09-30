// frpc Store 动态代理：列出 / 创建（sheet）/ 删除（需 frpc 配置启用 store.path）
import {
  Button,
  Dialog,
  HStack,
  List,
  NavigationStack,
  Section,
  Text,
  TextField,
  useEffect,
  useState,
  VStack,
} from "scripting"
import { connOf, type FrpServer } from "../lib/servers"
import {
  frpcStoreCreate,
  frpcStoreDelete,
  frpcStoreList,
  type StoreProxyDef,
} from "../lib/frpApi"
import { BARE_ROW, ChipBar, EmptyState, IconBadge, LIST_STYLE, Tag, type ChipItem } from "../components/Kit"
import { cardBackground, TONES, type Tone } from "../lib/theme"

const STORE_TYPES = ["tcp", "udp", "http", "https", "stcp", "xtcp"]

const TYPE_TONES: Record<string, Tone> = {
  tcp: "blue",
  udp: "teal",
  http: "green",
  https: "green",
  stcp: "purple",
  xtcp: "pink",
}

function needsRemotePort(type: string): boolean {
  return type === "tcp" || type === "udp"
}

function needsDomains(type: string): boolean {
  return type === "http" || type === "https"
}

function needsSecret(type: string): boolean {
  return type === "stcp" || type === "xtcp"
}

function proxySubtitle(def: StoreProxyDef): string {
  const local = `${def.localIP ?? "127.0.0.1"}:${def.localPort ?? "?"}`
  if (needsRemotePort(def.type)) return `${local} → :${def.remotePort ?? "?"}`
  if (needsDomains(def.type)) {
    const domains = Array.isArray(def.customDomains) ? def.customDomains.join(", ") : ""
    return `${local} → ${domains || def.subdomain || "?"}`
  }
  return local
}

export function FrpcStoreView({ server }: { server: FrpServer }) {
  const [list, setList] = useState<StoreProxyDef[] | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function load() {
    setError(null)
    try {
      const r = await frpcStoreList(connOf(server))
      setList(r ? r.proxies : null)
    } catch (e) {
      setError(String(e))
      setList(undefined)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function remove(def: StoreProxyDef) {
    const ok = await Dialog.confirm({
      title: "删除代理？",
      message: `将删除 Store 代理「${def.name}」。`,
      confirmLabel: "删除",
      cancelLabel: "取消",
    })
    if (!ok) return
    try {
      await frpcStoreDelete(connOf(server), def.name)
      await load()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <List
      {...LIST_STYLE}
      navigationTitle="Store 代理"
      refreshable={load}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      toolbar={
        list === null
          ? undefined
          : { topBarTrailing: <Button title="新建" systemImage="plus" action={() => setAdding(true)} /> }
      }
      sheet={{
        isPresented: adding,
        onChanged: setAdding,
        content: (
          <StoreProxyForm
            server={server}
            onDone={(created) => {
              setAdding(false)
              if (created) void load()
            }}
          />
        ),
      }}
    >
      {error ? (
        <Section>
          <HStack spacing={10}>
            <IconBadge icon="wifi.exclamationmark" tone="red" />
            <Text font={13} foregroundStyle={TONES.red.fg}>{error}</Text>
          </HStack>
        </Section>
      ) : null}
      {list === null ? (
        <Section>
          <VStack {...BARE_ROW} alignment="leading" spacing={10}>
            <HStack spacing={10}>
              <IconBadge icon="shippingbox" tone="orange" />
              <Text font={16} fontWeight="semibold">此 frpc 未启用 Store</Text>
            </HStack>
            <Text font={13} foregroundStyle="secondaryLabel">在 frpc 配置中加入以下一行并 reload 后可用：</Text>
            <Text
              font={12}
              fontDesign="monospaced"
              padding={10}
              frame={{ maxWidth: "infinity", alignment: "leading" }}
              background={cardBackground(10)}
            >
              {'store.path = "/path/to/store"'}
            </Text>
          </VStack>
        </Section>
      ) : list === undefined ? (
        error ? null : (
          <Section>
            <EmptyState icon="hourglass" title="加载中…" />
          </Section>
        )
      ) : list.length === 0 ? (
        <Section>
          <VStack spacing={12} padding={{ vertical: 6 }}>
            <EmptyState icon="shippingbox" title="还没有动态代理" message="动态代理立即生效，不写 frpc 配置文件" />
            <Button title="新建代理" systemImage="plus" buttonStyle="borderedProminent" action={() => setAdding(true)} />
          </VStack>
        </Section>
      ) : (
        <Section
          header={<Text>{`${list.length} 个代理`}</Text>}
          footer={<Text font={13}>左滑删除。动态代理立即生效，不写 frpc 配置文件。</Text>}
        >
          {list.map((def) => (
            <HStack
              key={def.name}
              spacing={12}
              padding={{ vertical: 3 }}
              frame={{ maxWidth: "infinity", alignment: "leading" }}
              trailingSwipeActions={{
                allowsFullSwipe: false,
                actions: [
                  <Button title="删除" role="destructive" action={() => { void remove(def) }} />,
                ],
              }}
            >
              <IconBadge icon="shippingbox.fill" tone={TYPE_TONES[def.type] ?? "gray"} size={32} />
              <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <HStack spacing={6}>
                  <Text font={15} fontWeight="semibold" lineLimit={1}>{def.name}</Text>
                  <Tag text={def.type} tone={TYPE_TONES[def.type] ?? "gray"} mono />
                </HStack>
                <Text font={12} fontDesign="monospaced" foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.8}>
                  {proxySubtitle(def)}
                </Text>
              </VStack>
            </HStack>
          ))}
        </Section>
      )}
    </List>
  )
}

function StoreProxyForm({
  server,
  onDone,
}: {
  server: FrpServer
  onDone: (created: boolean) => void
}) {
  const [name, setName] = useState("")
  const [type, setType] = useState("tcp")
  const [localIP, setLocalIP] = useState("127.0.0.1")
  const [localPort, setLocalPort] = useState("")
  const [remotePort, setRemotePort] = useState("")
  const [domains, setDomains] = useState("")
  const [secret, setSecret] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) {
      setMsg("请填写名称")
      return
    }
    const def: StoreProxyDef = {
      name: name.trim(),
      type,
      localIP: localIP.trim() || "127.0.0.1",
    }
    const lp = Number(localPort)
    if (!Number.isInteger(lp) || lp <= 0 || lp > 65535) {
      setMsg("localPort 必须是 1-65535 的整数")
      return
    }
    def.localPort = lp
    if (needsRemotePort(type)) {
      const rp = Number(remotePort)
      if (!Number.isInteger(rp) || rp <= 0 || rp > 65535) {
        setMsg("remotePort 必须是 1-65535 的整数")
        return
      }
      def.remotePort = rp
    }
    if (needsDomains(type)) {
      const list = domains.split(",").map((s) => s.trim()).filter(Boolean)
      if (list.length === 0) {
        setMsg("至少填写一个 customDomains（逗号分隔）")
        return
      }
      def.customDomains = list
    }
    if (needsSecret(type)) {
      if (!secret.trim()) {
        setMsg("stcp / xtcp 需要 secretKey")
        return
      }
      def.secretKey = secret.trim()
    }
    setBusy(true)
    setMsg(null)
    try {
      await frpcStoreCreate(connOf(server), def)
      onDone(true)
    } catch (e) {
      setMsg(String(e))
    } finally {
      setBusy(false)
    }
  }

  const typeChips: ChipItem<string>[] = STORE_TYPES.map((t) => ({ id: t, title: t.toUpperCase() }))

  return (
    <NavigationStack>
      <List
        {...LIST_STYLE}
        navigationTitle="新建代理"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="取消" action={() => onDone(false)} />,
          confirmationAction: (
            <Button title={busy ? "创建中…" : "创建"} fontWeight="semibold" disabled={busy} action={() => { void submit() }} />
          ),
        }}
      >
        <Section header={<Text>类型</Text>}>
          <VStack {...BARE_ROW}>
            <ChipBar items={typeChips} value={type} onChange={setType} />
          </VStack>
        </Section>
        <Section header={<Text>代理</Text>}>
          <TextField label={<Text>名称</Text>} value={name} onChanged={setName} prompt="my-proxy" />
          <TextField label={<Text>localIP</Text>} value={localIP} onChanged={setLocalIP} prompt="127.0.0.1" />
          <TextField label={<Text>localPort</Text>} value={localPort} onChanged={setLocalPort} prompt="22" />
          {needsRemotePort(type) ? (
            <TextField label={<Text>remotePort</Text>} value={remotePort} onChanged={setRemotePort} prompt="6000" />
          ) : null}
          {needsDomains(type) ? (
            <TextField label={<Text>customDomains</Text>} value={domains} onChanged={setDomains} prompt="www.example.com, api.example.com" />
          ) : null}
          {needsSecret(type) ? (
            <TextField label={<Text>secretKey</Text>} value={secret} onChanged={setSecret} prompt="stcp/xtcp 共享密钥" />
          ) : null}
        </Section>
        <Section>
          <HStack spacing={10}>
            <IconBadge
              icon={msg ? "exclamationmark.triangle.fill" : "bolt.fill"}
              tone={msg ? "red" : "accent"}
              size={28}
            />
            <Text font={13} foregroundStyle={msg ? TONES.red.fg : "secondaryLabel"}>
              {msg ?? "提交后立即在 frpc 上创建并生效。"}
            </Text>
          </HStack>
        </Section>
      </List>
    </NavigationStack>
  )
}
