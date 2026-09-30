// frpc 配置：等宽编辑器卡片（PUT /api/config + GET /api/reload 两步）
import {
  Button,
  Dialog,
  HStack,
  List,
  Section,
  Spacer,
  Text,
  TextField,
  useEffect,
  useState,
  VStack,
} from "scripting"
import { connOf, type FrpServer } from "../lib/servers"
import { frpcGetConfig, frpcPutConfig, frpcReload } from "../lib/frpApi"
import { BARE_ROW, EmptyState, IconBadge, LIST_STYLE, Tag } from "../components/Kit"
import { IS_GLASS, TONES } from "../lib/theme"

export function FrpcConfigView({ server }: { server: FrpServer }) {
  const [text, setText] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setMsg(null)
    try {
      const cfg = await frpcGetConfig(connOf(server))
      setText(cfg)
      setDraft(cfg)
    } catch (e) {
      setMsg({ text: String(e), ok: false })
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
      setMsg({ text: `保存失败（配置未写入）：${e}`, ok: false })
      setBusy(false)
      return
    }
    try {
      await frpcReload(connOf(server))
      setText(draft)
      setMsg({ text: "已保存并重载。", ok: true })
    } catch (e) {
      // 配置已经写进去了，但 reload 没成功 —— 必须把这个状态讲清楚
      setMsg({
        text: `配置已写入，但 reload 失败：${e}。当前运行中的仍是旧配置；修复后可重新进入本页重试 reload（重新保存同一配置即可）。`,
        ok: false,
      })
    } finally {
      setBusy(false)
    }
  }

  const dirty = draft !== null && text !== null && draft !== text
  const lines = draft ? draft.split("\n").length : 0

  return (
    <List
      {...LIST_STYLE}
      navigationTitle="配置文件"
      navigationBarTitleDisplayMode="inline"
      refreshable={load}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <Section
        header={
          <HStack spacing={6}>
            <Text>frpc.toml</Text>
            <Spacer />
            {draft !== null ? <Tag text={`${lines} 行`} mono /> : null}
            {draft !== null ? <Tag text={dirty ? "已修改" : "已同步"} tone={dirty ? "orange" : "green"} /> : null}
          </HStack>
        }
      >
        {draft === null ? (
          msg && !msg.ok ? (
            <EmptyState icon="doc.badge.ellipsis" title="无法读取配置" message={msg.text} />
          ) : (
            <EmptyState icon="hourglass" title="加载中…" />
          )
        ) : (
          <TextField
            label={<Text>配置</Text>}
            value={draft}
            onChanged={setDraft}
            axis="vertical"
            lineLimit={{ min: 18, max: 30 }}
            font={13}
            fontDesign="monospaced"
          />
        )}
      </Section>

      {draft !== null ? (
        <Section>
          <VStack {...BARE_ROW} alignment="leading" spacing={10}>
            {msg ? (
              <HStack spacing={10}>
                <IconBadge
                  icon={msg.ok ? "checkmark.seal.fill" : "exclamationmark.triangle.fill"}
                  tone={msg.ok ? "green" : "red"}
                  size={28}
                />
                <Text font={13} foregroundStyle={msg.ok ? "secondaryLabel" : TONES.red.fg}>{msg.text}</Text>
              </HStack>
            ) : (
              <Text font={12} foregroundStyle="secondaryLabel">
                {busy ? "处理中…" : "保存 = 写入配置 + 热重载两步。"}
              </Text>
            )}
            <HStack spacing={10}>
              <Button
                title="放弃修改"
                systemImage="arrow.uturn.backward"
                buttonStyle="bordered"
                frame={{ maxWidth: "infinity" }}
                disabled={busy || !dirty}
                action={() => { setDraft(text); setMsg(null) }}
              />
              <Button
                title={busy ? "保存中…" : "保存并重载"}
                systemImage="checkmark"
                buttonStyle={IS_GLASS ? "glassProminent" : "borderedProminent"}
                frame={{ maxWidth: "infinity" }}
                disabled={busy || !dirty}
                action={() => { void save() }}
              />
            </HStack>
          </VStack>
        </Section>
      ) : null}
    </List>
  )
}
