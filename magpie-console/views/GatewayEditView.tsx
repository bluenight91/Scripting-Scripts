// 网关连接：地址与管理密钥；新增、编辑、首次引导共用
import {
  Button,
  HStack,
  List,
  Navigation,
  Section,
  SecureField,
  Text,
  TextField,
  VStack,
  useState,
} from "scripting"
import { normalizeBaseURL, probeGateway } from "../lib/api"
import { hostOf, summarizeError } from "../lib/format"
import { loadGateways, newId, saveAdminKey, saveGateways, setActiveGatewayId } from "../lib/store"
import { BARE_ROW, Card, IconBadge, LIST_STYLE, StatusPill } from "../components/Kit"
import { CopyChip, ErrorNotice } from "../components/Bits"
import { TONES } from "../lib/theme"
import type { Gateway } from "../lib/types"

type TestState =
  | { kind: "ok"; title: string; detail: string }
  | { kind: "partial"; title: string; detail: string; hint?: string }
  | { kind: "fail"; title: string; detail: string; hint?: string; raw?: string }

const ADD_CMD = 'magpie gateway-key add "iPhone"'
const ADMIN_CMD = "magpie gateway-key admin <id> any"

export function GatewayEditView({
  initial,
  onSaved,
  onCancel,
  popOnSave = false,
}: {
  initial?: Gateway | null
  onSaved: (gateway: Gateway) => void
  onCancel?: () => void
  popOnSave?: boolean
}) {
  const dismiss = Navigation.useDismiss()
  const [name, setName] = useState(initial?.name ?? "")
  const [baseURL, setBaseURL] = useState(initial?.baseURL ?? "")
  const [key, setKey] = useState(initial?.adminKey ?? "")
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<TestState | null>(null)

  function draftGateway(): Gateway {
    return {
      id: initial?.id ?? newId(),
      name: name.trim() || hostOf(baseURL) || "magpie",
      baseURL: normalizeBaseURL(baseURL),
      adminKey: key.trim(),
      lastOKAt: initial?.lastOKAt,
    }
  }

  function save() {
    if (!baseURL.trim()) {
      setTest({ kind: "fail", title: "缺少地址", detail: "请填写 magpie 网关地址，例如 http://192.168.1.20:3425。" })
      return
    }
    const draft = draftGateway()
    saveAdminKey(draft.id, key)
    const persisted: Gateway = {
      id: draft.id,
      name: draft.name,
      baseURL: draft.baseURL,
      note: draft.note,
      lastOKAt: draft.lastOKAt,
    }
    saveGateways([...loadGateways().filter(item => item.id !== draft.id), persisted])
    setActiveGatewayId(draft.id)
    onSaved(persisted)
    if (popOnSave) dismiss()
  }

  async function runTest() {
    if (!baseURL.trim()) {
      setTest({ kind: "fail", title: "缺少地址", detail: "请先填写网关地址。" })
      return
    }
    setTesting(true)
    setTest(null)
    try {
      const { models, admin } = await probeGateway(draftGateway())
      if (admin.ok) {
        const providers = Array.isArray(admin.data?.providers) ? admin.data!.providers!.length : 0
        const count = Array.isArray(models.data?.data ?? models.data?.models)
          ? (models.data?.data ?? models.data?.models)!.length
          : 0
        setTest({
          kind: "ok",
          title: "管理 API 可用",
          detail: `${providers} 个供应商 · ${count} 个模型 · ${admin.ms} ms`,
        })
      } else if (models.ok) {
        setTest({
          kind: "partial",
          title: "网关可用，但密钥不能管理",
          detail: admin.error?.message ?? "管理 API 被拒绝",
          hint: admin.error?.hint,
        })
      } else {
        setTest({
          kind: "fail",
          title: "连不上网关",
          detail: admin.error?.message ?? "请求失败",
          hint: admin.error?.hint,
          raw: admin.raw,
        })
      }
    } catch (error) {
      setTest({ kind: "fail", title: "测试失败", detail: summarizeError(error) })
    } finally {
      setTesting(false)
    }
  }

  const toolbar = {
    cancellationAction: onCancel ? <Button title="取消" action={onCancel} /> : undefined,
    topBarTrailing: [
      <Button
        key="save"
        title="保存"
        fontWeight="semibold"
        disabled={!baseURL.trim() || testing}
        action={save}
      />,
    ],
  }

  return (
    <List
        {...LIST_STYLE}
        navigationTitle={initial ? "编辑网关" : "连接 magpie"}
        navigationBarTitleDisplayMode="inline"
        toolbar={toolbar}
      >
        <Section>
          <VStack {...BARE_ROW}>
            <Card>
              <HStack spacing={12}>
                <IconBadge icon="bird.fill" tone="accent" size={42} filled />
                <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  <Text font={17} fontWeight="semibold">在新设备上管理 magpie</Text>
                  <Text font={13} foregroundStyle="secondaryLabel">
                    供应商、模型、路由组与网关密钥
                  </Text>
                </VStack>
              </HStack>
              <Text font={12} foregroundStyle="secondaryLabel">
                手机不能使用 127.0.0.1；需要 Mac 与手机在同一局域网或 Tailscale，并在 magpie 打开「在局域网共享」。
              </Text>
            </Card>
          </VStack>
        </Section>

        <Section header={<Text>地址</Text>}>
          <TextField title="名称" value={name} onChanged={setName} prompt="例如 书房的 Mac" />
          <TextField
            title="网关地址"
            value={baseURL}
            onChanged={setBaseURL}
            prompt="http://192.168.1.20:3425"
          />
        </Section>

        <Section
          header={<Text>管理密钥</Text>}
          footer={
            <Text font={12}>
              必须是一把带 admin 级别的网关密钥。密钥保存在系统钥匙串，不写入普通存储，也不会在列表里显示。
            </Text>
          }
        >
          <SecureField
            title="网关密钥"
            value={key}
            onChanged={setKey}
            prompt="粘贴 sk-magpie-… 或自定义密钥"
          />
          <VStack spacing={8} padding={{ vertical: 4 }} frame={{ maxWidth: "infinity" }}>
            <Text font={12} foregroundStyle="secondaryLabel">在 Mac 上运行：</Text>
            <HStack spacing={10}>
              <Text font={12} fontDesign="monospaced" lineLimit={1} frame={{ maxWidth: "infinity" }}>
                {ADD_CMD}
              </Text>
              <CopyChip text={ADD_CMD} label="" />
            </HStack>
            <HStack spacing={10}>
              <Text font={12} fontDesign="monospaced" lineLimit={1} frame={{ maxWidth: "infinity" }}>
                {ADMIN_CMD}
              </Text>
              <CopyChip text={ADMIN_CMD} label="" />
            </HStack>
            <Text font={11} foregroundStyle="tertiaryLabel">
              只在同一台机器上用 local；从网络访问需要 any。
            </Text>
          </VStack>
        </Section>

        <Section>
          <Button
            title={testing ? "测试中…" : "测试连接"}
            systemImage="bolt.horizontal"
            buttonStyle="bordered"
            disabled={testing}
            action={runTest}
          />
        </Section>

        {test ? (
          <Section>
            <VStack {...BARE_ROW}>
              {test.kind === "fail" ? (
                <ErrorNotice
                  message={test.title + " · " + test.detail}
                  hint={test.hint}
                  raw={test.raw}
                />
              ) : (
                <Card tone={test.kind === "ok" ? "green" : "orange"}>
                  <HStack spacing={8}>
                    <StatusPill
                      kind={test.kind === "ok" ? "ok" : "warn"}
                      label={test.kind === "ok" ? "可用" : "部分可用"}
                    />
                    <Text font={15} fontWeight="semibold">{test.title}</Text>
                  </HStack>
                  <Text font={13} foregroundStyle="secondaryLabel">{test.detail}</Text>
                  {"hint" in test && test.hint ? (
                    <Text font={12} foregroundStyle={TONES.orange.fg}>{test.hint}</Text>
                  ) : null}
                </Card>
              )}
            </VStack>
          </Section>
        ) : null}

        <Section footer={<Text font={12}>保存后会立即切到这把网关。</Text>}>
          <Button
            title={initial ? "保存修改" : "保存并进入"}
            systemImage="checkmark"
            buttonStyle="borderedProminent"
            disabled={!baseURL.trim() || testing}
            action={save}
          />
        </Section>
    </List>
  )
}