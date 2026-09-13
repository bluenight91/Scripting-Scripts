// frpc Store 动态代理：列出 / 创建 / 删除（需 frpc 配置启用 store.path）
import {
  Button,
  Dialog,
  HStack,
  List,
  Picker,
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

const STORE_TYPES = ["tcp", "udp", "http", "https", "stcp", "xtcp"]

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

  if (adding) {
    return (
      <StoreProxyForm
        server={server}
        onDone={() => { setAdding(false); void load() }}
      />
    )
  }

  return (
    <List
      navigationTitle="Store 代理"
      refreshable={load}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      {error ? (
        <Section>
          <Text font={14} foregroundStyle="systemRed">{error}</Text>
        </Section>
      ) : null}
      {list === null ? (
        <Section>
          <Text font={15}>
            此 frpc 未启用 Store：在 frpc 配置中加入 {"store.path = \"/path/to/store\""} 并 reload 后可用。
          </Text>
        </Section>
      ) : list === undefined ? (
        <Section>
          <Text font={15} foregroundStyle="secondaryLabel">加载中…</Text>
        </Section>
      ) : list.length === 0 ? (
        <Section>
          <Text font={15} foregroundStyle="secondaryLabel">Store 中还没有动态代理。</Text>
        </Section>
      ) : (
        <Section footer={<Text font={13}>左右滑动删除。动态代理立即生效，不写 frpc 配置文件。</Text>}>
          {list.map((def) => (
            <HStack
              key={def.name}
              spacing={10}
              frame={{ maxWidth: "infinity", alignment: "leading" }}
              trailingSwipeActions={{
                allowsFullSwipe: false,
                actions: [
                  <Button title="删除" role="destructive" action={() => { void remove(def) }} />,
                ],
              }}
            >
              <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <HStack spacing={6}>
                  <Text font={16}>{def.name}</Text>
                  <Text font={11} foregroundStyle="secondaryLabel">{def.type}</Text>
                </HStack>
                <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>
                  {proxySubtitle(def)}
                </Text>
              </VStack>
            </HStack>
          ))}
        </Section>
      )}
      <Section>
        <Button title="新建代理" systemImage="plus.circle" action={() => setAdding(true)} />
      </Section>
    </List>
  )
}

function StoreProxyForm({
  server,
  onDone,
}: {
  server: FrpServer
  onDone: () => void
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
      onDone()
    } catch (e) {
      setMsg(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <List navigationTitle="新建代理" frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <Section>
        <TextField label={<Text>名称</Text>} value={name} onChanged={setName} prompt="my-proxy" />
        <Picker
          title="类型"
          pickerStyle="segmented"
          value={type}
          onChanged={(v: string) => setType(v)}
        >
          {STORE_TYPES.map((t) => (
            <Text key={t} tag={t}>{t}</Text>
          ))}
        </Picker>
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
      <Section footer={<Text font={13}>{msg ?? "提交后立即在 frpc 上创建并生效。"}</Text>}>
        <Button
          title={busy ? "创建中…" : "创建"}
          systemImage="checkmark.circle"
          disabled={busy}
          action={() => { void submit() }}
        />
        <Button title="返回" action={onDone} />
      </Section>
    </List>
  )
}
