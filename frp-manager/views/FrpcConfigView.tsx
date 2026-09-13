// frpc 配置：查看（等宽纯文本）与编辑（PUT /api/config + GET /api/reload 两步）
import {
  Button,
  Dialog,
  List,
  Section,
  Text,
  TextField,
  useEffect,
  useState,
  VStack,
} from "scripting"
import { connOf, type FrpServer } from "../lib/servers"
import { frpcGetConfig, frpcPutConfig, frpcReload } from "../lib/frpApi"

export function FrpcConfigView({ server }: { server: FrpServer }) {
  const [text, setText] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setMsg(null)
    try {
      const cfg = await frpcGetConfig(connOf(server))
      setText(cfg)
      setDraft(cfg)
    } catch (e) {
      setMsg(String(e))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function save() {
    if (draft === null) return
    const ok = await Dialog.confirm({
      title: "保存并重载配置？",
      message: "先把新配置 PUT 到 /api/config，再调用 /api/reload 热重载。错误的配置可能导致代理失效。",
      confirmLabel: "保存并重载",
      cancelLabel: "取消",
    })
    if (!ok) return
    setBusy(true)
    setMsg(null)
    try {
      await frpcPutConfig(connOf(server), draft)
    } catch (e) {
      setMsg(`保存失败（配置未写入）：${e}`)
      setBusy(false)
      return
    }
    try {
      await frpcReload(connOf(server))
      setText(draft)
      setMsg("已保存并重载。")
    } catch (e) {
      // 配置已经写进去了，但 reload 没成功 —— 必须把这个状态讲清楚
      setMsg(`配置已写入，但 reload 失败：${e}。当前运行中的仍是旧配置；修复后可重新进入本页重试 reload（重新保存同一配置即可）。`)
    } finally {
      setBusy(false)
    }
  }

  const dirty = draft !== null && text !== null && draft !== text

  return (
    <List
      navigationTitle="配置文件"
      refreshable={load}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <Section
        header={<Text font={13}>frpc.toml</Text>}
        footer={
          <Text font={13}>
            {busy
              ? "处理中…"
              : msg ?? (dirty ? "有未保存的修改。" : "修改后点下方按钮保存；保存 = 写入配置 + 热重载两步。")}
          </Text>
        }
      >
        {draft === null ? (
          <Text font={15} foregroundStyle="secondaryLabel">{msg ?? "加载中…"}</Text>
        ) : (
          <VStack alignment="leading" spacing={6} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            <TextField
              label={<Text>配置</Text>}
              value={draft}
              onChanged={setDraft}
              axis="vertical"
              lineLimit={{ min: 18, max: 30 }}
            />
            <Text font={11} foregroundStyle="tertiaryLabel">
              {dirty ? "● 已修改" : "与远端一致"}
            </Text>
          </VStack>
        )}
      </Section>
      <Section>
        <Button
          title={busy ? "保存中…" : "保存并重载"}
          systemImage="checkmark.circle"
          disabled={busy || draft === null || !dirty}
          action={() => { void save() }}
        />
        <Button
          title="放弃修改并重新载入"
          systemImage="arrow.clockwise"
          disabled={busy || !dirty}
          action={() => { setDraft(text); setMsg(null) }}
        />
      </Section>
    </List>
  )
}
