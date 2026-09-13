// 添加 / 编辑服务器条目：名称、类型、地址、用户名；密码按条目 id 存 Keychain
import {
  Button,
  List,
  Picker,
  Section,
  SecureField,
  Text,
  TextField,
  useState,
} from "scripting"
import {
  defaultServer,
  serverIsReady,
  type FrpServer,
  type FrpServerKind,
} from "../lib/servers"
import { probeHealthz } from "../lib/frpApi"

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
  const [msg, setMsg] = useState<string | null>(null)

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
      setMsg("请先填写地址")
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const online = await probeHealthz({ baseUrl: d.url, username: "", password: "" })
      setMsg(online ? "连通正常（/healthz）" : "无法连接：请确认 frp 已运行、地址端口正确")
    } catch (e) {
      setMsg(`失败：${e}`)
    } finally {
      setBusy(false)
    }
  }

  function save() {
    // 密码由调用方（app.tsx）在 onDone 里按条目 id 写入 Keychain；这里只回传草稿
    onDone(draft(), password)
  }

  return (
    <List
      navigationTitle={isNew ? "添加服务器" : "编辑服务器"}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <Section>
        <TextField
          label={<Text>名称</Text>}
          value={name}
          onChanged={setName}
          prompt="本机 frpc / 云端 frps"
        />
        <Picker
          title="类型"
          pickerStyle="segmented"
          value={kind}
          onChanged={(v: string) => setKind(v as FrpServerKind)}
        >
          <Text tag="frpc">frpc 客户端</Text>
          <Text tag="frps">frps 服务端</Text>
        </Picker>
        <TextField
          label={<Text>地址</Text>}
          value={url}
          onChanged={setUrl}
          prompt={kind === "frpc" ? "http://127.0.0.1:6080" : "http://frps.example.com:7500"}
        />
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
          prompt={
            isNew
              ? "Basic Auth 密码（可留空）"
              : "留空则保持已存密码不变"
          }
        />
      </Section>
      <Section
        footer={
          <Text font={13}>
            {msg
              ? msg
              : kind === "frpc"
                ? "frpc 填 admin 端口（webServer.addr/port）；用户名密码对应 webServer.user/password，都留空表示 frp 不校验。"
                : "frps 填 dashboard 端口；用户名密码对应 webServer.user/password，都留空表示 frp 不校验。"}
          </Text>
        }
      >
        <Button
          title={busy ? "测试中…" : "测试连通"}
          systemImage="antenna.radiowaves.left.and.right"
          disabled={busy}
          action={() => { void test() }}
        />
        <Button title="保存" systemImage="checkmark.circle" action={save} />
      </Section>
      {isNew ? null : (
        <Section>
          <Button title="返回列表" action={() => onDone(null, "")} />
        </Section>
      )}
    </List>
  )
}
