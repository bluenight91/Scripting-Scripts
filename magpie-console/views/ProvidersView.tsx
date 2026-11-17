// 供应商 Tab：列表、筛选与详情（端点、密钥、账号、模型）；写操作只做测试与删除
import {
  Button,
  Dialog,
  HStack,
  Image,
  List,
  Menu,
  NavigationLink,
  NavigationStack,
  Navigation,
  ScrollView,
  Section,
  Spacer,
  Text,
  VStack,
  useEffect,
  useState,
} from "scripting"
import { deleteProvider, fetchProviders, providerList, testProvider } from "../lib/api"
import { hostOf, relativeTime } from "../lib/format"
import {
  Card,
  EmptyState,
  IconBadge,
  LIST_STYLE,
  SearchField,
  PAGE_BG,
  SectionHeader,
  StatusPill,
  Tag,
} from "../components/Kit"
import { CopyChip, ErrorNotice, FieldRow, LoadingRow } from "../components/Bits"
import { TONES, UI, type Tone } from "../lib/theme"
import type { ApiResult, Gateway, Provider, ProvidersPayload } from "../lib/types"

function providerTone(provider: Provider): Tone {
  return provider.off ? "gray" : provider.listError ? "orange" : "accent"
}

function ProviderRow({ provider }: { provider: Provider }) {
  const models = provider.exposed ?? provider.models?.length ?? 0
  const keys = provider.keyList?.length ?? 0
  return (
    <HStack spacing={12} padding={{ vertical: 4 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <IconBadge icon="square.stack.3d.up.fill" tone={providerTone(provider)} size={38} filled />
      <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <HStack spacing={6}>
          <Text font={16} fontWeight="semibold" lineLimit={1}>{provider.name || provider.id}</Text>
          {provider.off ? <Tag text="关闭" tone="gray" /> : null}
          {provider.unlisted ? <Tag text="仅路由组" tone="purple" /> : null}
        </HStack>
        <Text font={12} fontDesign="monospaced" foregroundStyle="secondaryLabel" lineLimit={1}>
          {hostOf(provider.host) || provider.id}
        </Text>
        <HStack spacing={5}>
          <Tag text={`${models} 模型`} tone="blue" />
          {keys > 0 ? <Tag text={`${keys} 密钥`} tone="green" /> : null}
          {provider.account ? <Tag text={provider.account.plan || "已登录"} tone="orange" /> : null}
        </HStack>
      </VStack>
      <Image systemName="chevron.right" font={12} foregroundStyle="tertiaryLabel" />
    </HStack>
  )
}

export function ProvidersView({ gateway }: { gateway: Gateway }) {
  const [payload, setPayload] = useState<ProvidersPayload | null>(null)
  const [error, setError] = useState<ApiResult<ProvidersPayload> | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [onlyOn, setOnlyOn] = useState(false)

  async function load() {
    const result = await fetchProviders(gateway)
    if (result.ok) {
      setPayload(result.data)
      setError(null)
    } else {
      setError(result)
    }
    setLoading(false)
  }

  const text = query.trim().toLowerCase()
  const items = providerList(payload).filter(provider => {
    if (onlyOn && provider.off) return false
    if (!text) return true
    return (
      (provider.name || "").toLowerCase().includes(text) ||
      provider.id.toLowerCase().includes(text) ||
      (provider.host || "").toLowerCase().includes(text)
    )
  })

  return (
    <NavigationStack>
      <List
        {...LIST_STYLE}
        navigationTitle="供应商"
        navigationBarTitleDisplayMode="inline"
        refreshable={load}
        onAppear={load}
        toolbar={{
          topBarTrailing: [
            <Menu key="filter" label={<Image systemName="line.3.horizontal.decrease" />}>
              <Button title="全部供应商" action={() => setOnlyOn(false)} />
              <Button title="仅已开启" action={() => setOnlyOn(true)} />
            </Menu>,
          ],
        }}
      >
        <Section>
          <SearchField value={query} onChanged={setQuery} prompt="名称、id 或 host" />
        </Section>

        {error ? (
          <Section>
            <ErrorNotice
              message={error.error?.message ?? "读取供应商失败"}
              hint={error.error?.hint}
              raw={error.raw}
            />
          </Section>
        ) : null}

        {loading ? (
          <Section>
            <LoadingRow text="正在读取供应商" />
          </Section>
        ) : null}

        {!loading && items.length > 0 ? (
          <Section
            header={<Text>{`供应商 · ${items.length}`}</Text>}
            footer={
              payload?.version ? <Text font={12}>magpie {payload.version}</Text> : undefined
            }
          >
            {items.map(provider => (
              <NavigationLink
                key={provider.id}
                destination={<ProviderDetail gateway={gateway} providerId={provider.id} />}
              >
                <ProviderRow provider={provider} />
              </NavigationLink>
            ))}
          </Section>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <Section>
            <EmptyState
              icon="tray"
              title="没有匹配的供应商"
              message="清空搜索，或在 magpie 应用里添加供应商。"
            />
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  )
}

export function ProviderDetail({ gateway, providerId }: { gateway: Gateway; providerId: string }) {
  const dismiss = Navigation.useDismiss()
  const [provider, setProvider] = useState<Provider | null>(null)
  const [error, setError] = useState<ApiResult<ProvidersPayload> | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [testText, setTestText] = useState<string | null>(null)
  const [testOK, setTestOK] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  async function load() {
    const result = await fetchProviders(gateway)
    if (result.ok) {
      setProvider(providerList(result.data).find(item => item.id === providerId) ?? null)
      setError(null)
    } else {
      setError(result)
    }
    setUpdatedAt(Date.now())
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [gateway.id, providerId])

  async function runTest() {
    setBusy("test")
    setTestText(null)
    const result = await testProvider(gateway, providerId)
    setBusy(null)
    if (result.ok) {
      setTestOK(true)
      const text = typeof result.data === "object" && result.data
        ? JSON.stringify(result.data)
        : result.raw || "测试完成"
      setTestText(text.slice(0, 900))
    } else {
      setTestOK(false)
      setTestText((result.error?.message ?? "测试失败") + (result.error?.hint ? "\n" + result.error.hint : ""))
    }
  }

  async function remove() {
    const confirmed = await Dialog.confirm({
      title: "删除供应商",
      message: `确定删除「${provider?.name || providerId}」？这会移除它的密钥与模型配置，不可撤销。`,
      cancelLabel: "取消",
      confirmLabel: "删除",
    })
    if (!confirmed) return
    setBusy("delete")
    const result = await deleteProvider(gateway, providerId)
    setBusy(null)
    if (result.ok) {
      dismiss()
      return
    }
    setTestOK(false)
    setTestText(result.error?.message ?? "删除失败")
  }

  const keys = provider?.keyList ?? []
  const models = provider?.models ?? []

  return (
    <ScrollView
        navigationTitle={provider?.name || providerId}
        navigationBarTitleDisplayMode="inline"
        background={PAGE_BG}
        scrollContentBackground="hidden"
        refreshable={load}
        toolbar={{
          topBarTrailing: [
            <Menu key="actions" label={<Image systemName="ellipsis.circle" />}>
              <Button
                title={busy === "test" ? "测试中…" : "测试连接"}
                systemImage="bolt.horizontal"
                disabled={busy !== null}
                action={runTest}
              />
              <Button title="刷新" systemImage="arrow.clockwise" action={load} />
              <Button title="删除供应商" systemImage="trash" role="destructive" action={remove} />
            </Menu>,
          ],
        }}
      >
        <VStack alignment="leading" spacing={UI.pageSpacing} padding={UI.pagePadding}>
          {error ? (
            <ErrorNotice
              message={error.error?.message ?? "读取供应商失败"}
              hint={error.error?.hint}
              raw={error.raw}
            />
          ) : null}

          {loading && !provider ? <LoadingRow text="正在读取供应商" /> : null}

          {provider ? (
            <Card>
              <HStack spacing={12}>
                <IconBadge icon="square.stack.3d.up.fill" tone={providerTone(provider)} size={42} filled />
                <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  <Text font={17} fontWeight="semibold">{provider.name || provider.id}</Text>
                  <Text font={12} fontDesign="monospaced" foregroundStyle="secondaryLabel">{provider.id}</Text>
                </VStack>
                <StatusPill kind={provider.off ? "idle" : "ok"} label={provider.off ? "已关闭" : "已开启"} compact />
              </HStack>
              <HStack spacing={5}>
                <Tag text={provider.preset || "自定义"} tone="gray" />
                <Tag text={`${provider.exposed ?? models.length} 个模型`} tone="blue" />
                {provider.routing ? <Tag text={provider.routing} tone="purple" /> : null}
              </HStack>
              {provider.listError ? (
                <Text font={12} foregroundStyle={TONES.orange.fg}>拉取模型失败：{provider.listError}</Text>
              ) : null}
              <Text font={11} foregroundStyle="tertiaryLabel">
                {updatedAt ? "读取于 " + relativeTime(updatedAt) : ""}
              </Text>
            </Card>
          ) : null}

          {testText ? (
            <Card tone={testOK ? "green" : "red"}>
              <SectionHeader title="测试结果" />
              <HStack spacing={8}>
                <StatusPill kind={testOK ? "ok" : "error"} label={testOK ? "成功" : "失败"} compact />
                <Spacer />
                <CopyChip text={testText} label="复制" />
              </HStack>
              <Text font={11} fontDesign="monospaced" lineLimit={12} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                {testText}
              </Text>
            </Card>
          ) : null}

          {provider ? (
            <Card>
              <SectionHeader title="端点" />
              <FieldRow label="Host" value={provider.host} mono copyable />
              <FieldRow label="Chat" value={provider.chat} mono copyable />
              <FieldRow label="Responses" value={provider.responses} mono copyable />
              <FieldRow label="Anthropic" value={provider.anthropic} mono copyable />
              <FieldRow label="Gemini" value={provider.gemini} mono copyable />
            </Card>
          ) : null}

          {provider ? (
            <Card>
              <SectionHeader
                title="密钥"
                caption={keys.length === 0 ? "通过登录或本机服务提供模型" : `${keys.length} 个`}
              />
              {keys.length === 0 ? (
                <Text font={12} foregroundStyle="secondaryLabel">没有 API 密钥。</Text>
              ) : (
                keys.map(key => (
                  <HStack key={key.id} spacing={10} frame={{ maxWidth: "infinity" }}>
                    <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                      <Text font={14}>{key.name || key.id}</Text>
                      <Text font={11} fontDesign="monospaced" foregroundStyle="secondaryLabel">
                        {key.masked || "已隐藏"}
                      </Text>
                      {key.rest ? (
                        <Text font={11} foregroundStyle={TONES.orange.fg}>
                          暂停中 · {key.rest.reason || "暂时跳过"}
                        </Text>
                      ) : null}
                    </VStack>
                    <StatusPill kind={key.on ? "ok" : "idle"} label={key.on ? "在用" : "备用"} compact />
                  </HStack>
                ))
              )}
            </Card>
          ) : null}

          {provider?.account ? (
            <Card>
              <SectionHeader title="登录账号" caption={provider.account.agentName} />
              <FieldRow label="账号" value={provider.account.name || provider.account.id} />
              <FieldRow label="方案" value={provider.account.plan} />
              <FieldRow label="Agent" value={provider.account.agent} mono />
            </Card>
          ) : null}

          {provider ? (
            <Card>
              <SectionHeader
                title="模型"
                caption={`${models.length} 个，${provider.exposed ?? 0} 个暴露给 agent`}
              />
              {models.length === 0 ? (
                <Text font={12} foregroundStyle="secondaryLabel">
                  还没有模型列表，可在 magpie 里刷新该供应商。
                </Text>
              ) : (
                models.slice(0, 40).map(model => (
                  <HStack key={model.id} spacing={8} frame={{ maxWidth: "infinity" }}>
                    <Text font={13} lineLimit={1} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                      {model.name || model.id}
                    </Text>
                    {model.context ? <Tag text={shortContext(model.context)} tone="gray" /> : null}
                    {model.images ? <Tag text="图像" tone="teal" /> : null}
                    <StatusPill kind={model.on ? "ok" : "idle"} label={model.on ? "启用" : "关闭"} compact />
                  </HStack>
                ))
              )}
              {models.length > 40 ? (
                <Text font={11} foregroundStyle="tertiaryLabel">仅显示前 40 个，完整目录见「模型」页。</Text>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <SectionHeader title="设置" caption="高级设置请在 magpie 应用中修改" />
            <Text font={12} foregroundStyle="secondaryLabel">
              本脚本只对供应商提供测试与删除，避免用不完整的表单覆盖 magpie 的配置。代理、TLS、路由、限额等设置请在 magpie 应用里操作。
            </Text>
          </Card>

          <Text font={11} foregroundStyle="tertiaryLabel" padding={{ bottom: 18 }}>
            读取时间 {updatedAt ? relativeTime(updatedAt) : "—"}
          </Text>
        </VStack>
    </ScrollView>
  )
}

function shortContext(value: number): string {
  if (value >= 1_000_000) return Math.round(value / 1_000_000) + "M ctx"
  if (value >= 1_000) return Math.round(value / 1_000) + "K ctx"
  return String(value)
}