// 添加 / 编辑服务器条目（sheet）：名称、类型、地址、用户名；密码按条目 id 存 Keychain
import {
  Button,
  HStack,
  List,
  NavigationStack,
  Section,
  SecureField,
  Spacer,
  Text,
  TextField,
  useState,
  VStack,
} from "scripting"
import {
  defaultServer,
  serverIsReady,
  type FrpServer,
  type FrpServerKind,
} from "../lib/servers"
import { probeHealthz } from "../lib/frpApi"
import { BARE_ROW, IconBadge, LIST_STYLE } from "../components/Kit"
import { cardBackground, roundedShape, TONES, UI, type Tone } from "../lib/theme"

const KINDS: { kind: FrpServerKind; title: string; subtitle: string; icon: string; tone: Tone }[] = [
  { kind: "frpc", title: "frpc 客户端", subtitle: "admin 端口", icon: "arrow.triangle.branch", tone: "blue" },
  { kind: "frps", title: "frps 服务端", subtitle: "dashboard 端口", icon: "server.rack", tone: "accent" },
]

export function ServerEditView({
  initial,
  onDone,
}: {
  /** null 表示新增 */
  initial: FrpServer | null
  onDone: (server: FrpServer | null, password: string) => void
}) {
  const isNew = initial === null
  const [name, setName] = useState(initial?.name ?? "")
  const [kind, setKind] = useState<FrpServerKind>(initial?.kind ?? "frpc")
  const [url, setUrl] = useState(initial?.url ?? "")
  const [username, setUsername] = useState(initial?.username ?? "")
  const [password, setPasswordDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  function draft(): FrpServer {
    return {
      id: initial?.id ?? defaultServer(kind).id,
      name: name.trim() || url.trim() || "未命名",
      kind,
      url: url.trim(),
      username: username.trim(),
    }
  }

  async function test() {
    const d = draft()
    if (!serverIsReady(d)) {
      setMsg({ text: "请先填写地址", ok: false })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const online = await probeHealthz({ baseUrl: d.url, username: "", password: "" })
      setMsg(online
        ? { text: "连通正常（/healthz）", ok: true }
        : { text: "无法连接：请确认 frp 已运行、地址端口正确", ok: false })
    } catch (e) {
      setMsg({ text: `失败：${e}`, ok: false })
    } finally {
      setBusy(false)
    }
  }

  function save() {
    // 密码由调用方（app.tsx）在 onDone 里按条目 id 写入 Keychain；这里只回传草稿
    onDone(draft(), password)
  }

  return (
    <NavigationStack>
      <List
        {...LIST_STYLE}
        navigationTitle={isNew ? "添加服务器" : "编辑服务器"}
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="取消" action={() => onDone(null, "")} />,
          confirmationAction: <Button title="保存" fontWeight="semibold" disabled={!url.trim()} action={save} />,
        }}
      >
        <Section>
          <HStack {...BARE_ROW} spacing={10}>
            {KINDS.map((k) => (
              <KindTile
                key={k.kind}
                {...k}
                selected={kind === k.kind}
                onTap={() => {
                  setKind(k.kind)
                  setMsg(null)
                }}
              />
            ))}
          </HStack>
        </Section>
        <Section header={<Text>连接</Text>}>
          <TextField
            label={<Text>名称</Text>}
            value={name}
            onChanged={setName}
            prompt="本机 frpc / 云端 frps"
          />
          <TextField
            label={<Text>地址</Text>}
            value={url}
            onChanged={(v: string) => {
              setUrl(v)
              setMsg(null)
            }}
            prompt={kind === "frpc" ? "http://127.0.0.1:6080" : "http://frps.example.com:7500"}
          />
        </Section>
        <Section
          header={<Text>认证</Text>}
          footer={
            <Text font={13}>
              {kind === "frpc"
                ? "对应 frpc 的 webServer.user / password，都留空表示 frp 不校验。"
                : "对应 frps 的 webServer.user / password，都留空表示 frp 不校验。"}
            </Text>
          }
        >
          <TextField
            label={<Text>用户名</Text>}
            value={username}
            onChanged={setUsername}
            prompt="Basic Auth 用户名（可留空）"
          />
          <SecureField
            label={<Text>密码</Text>}
            value={password}
            onChanged={setPasswordDraft}
            prompt={isNew ? "Basic Auth 密码（可留空）" : "留空则保持已存密码不变"}
          />
        </Section>
        <Section>
          <HStack spacing={12}>
            <IconBadge
              icon={msg ? (msg.ok ? "checkmark.seal.fill" : "xmark.octagon.fill") : "antenna.radiowaves.left.and.right"}
              tone={msg ? (msg.ok ? "green" : "red") : "gray"}
              size={32}
            />
            <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
              <Text font={15} fontWeight="semibold">{busy ? "测试中…" : "测试连通"}</Text>
              <Text font={12} foregroundStyle={msg && !msg.ok ? TONES.red.fg : "secondaryLabel"}>
                {msg?.text ?? "探测 /healthz，不需要认证"}
              </Text>
            </VStack>
            <Button title="测试" buttonStyle="bordered" disabled={busy} action={() => { void test() }} />
          </HStack>
        </Section>
      </List>
    </NavigationStack>
  )
}

function KindTile({
  title,
  subtitle,
  icon,
  tone,
  selected,
  onTap,
}: {
  title: string
  subtitle: string
  icon: string
  tone: Tone
  selected: boolean
  onTap: () => void
}) {
  return (
    <VStack
      alignment="leading"
      spacing={8}
      padding={14}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
      background={cardBackground(UI.tileRadius, selected ? TONES[tone].soft : UI.cardBg)}
      contentShape={roundedShape(UI.tileRadius)}
      onTapGesture={onTap}
    >
      <HStack>
        <IconBadge icon={icon} tone={tone} size={30} filled={selected} />
        <Spacer />
        {selected ? <IconBadge icon="checkmark" tone={tone} size={20} /> : null}
      </HStack>
      <VStack alignment="leading" spacing={1}>
        <Text font={15} fontWeight="semibold">{title}</Text>
        <Text font={11} foregroundStyle="secondaryLabel">{subtitle}</Text>
      </VStack>
    </VStack>
  )
}
