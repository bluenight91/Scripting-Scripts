// 密钥 Tab：网关密钥列表、限额明细与增删改停用轮换
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
  SecureField,
  Spacer,
  Text,
  TextField,
  VStack,
  useEffect,
  useState,
} from "scripting"
import { fetchGatewayKeys, gatewayKeyList, keyAction } from "../lib/api"
import {
  costLabel,
  limitAmountLabel,
  limitLabel,
  percent,
  resetLabel,
  summarizeError,
  tokensLabel,
} from "../lib/format"
import {
  Card,
  EmptyState,
  IconBadge,
  LIST_STYLE,
  PAGE_BG,
  SectionHeader,
  StatusPill,
  Tag,
} from "../components/Kit"
import { CopyChip, ErrorNotice, LoadingRow, SecretBox, UsageBar } from "../components/Bits"
import { TONES, UI, type Tone } from "../lib/theme"
import type {
  ApiResult,
  BudgetStatus,
  Gateway,
  GatewayKey,
  KeyLimit,
  KeysPayload,
} from "../lib/types"

function adminBadge(key: GatewayKey): { text: string; tone: Tone } {
  if (key.admin === "any") return { text: "管理任意机器", tone: "red" }
  if (key.admin === "local") return { text: "管理本机", tone: "accent" }
  if (key.readOnly) return { text: "只读", tone: "gray" }
  if (key.browser) return { text: "浏览器扩展", tone: "gray" }
  return { text: "普通密钥", tone: "gray" }
}

function statusesOf(key: GatewayKey): BudgetStatus[] {
  const list: BudgetStatus[] = []
  if (key.used) list.push(key.used)
  if (Array.isArray(key.usedAll)) {
    for (const item of key.usedAll.slice(1)) list.push(item)
  }
  return list
}

function limitsOf(key: GatewayKey): KeyLimit[] {
  const list: KeyLimit[] = []
  if (key.limit) list.push(key.limit)
  if (Array.isArray(key.moreLimits)) list.push(...key.moreLimits)
  return list
}

function KeyRow({ item }: { item: GatewayKey }) {
  const status = statusesOf(item)[0]
  const admin = adminBadge(item)
  const spent = status?.spent === true
  return (
    <HStack spacing={12} padding={{ vertical: 4 }} frame={{ maxWidth: "infinity", alignment: "leading" }} opacity={item.off ? 0.6 : 1}>
      <IconBadge
        icon={item.off ? "key.slash" : "key.fill"}
        tone={spent ? "red" : item.off ? "gray" : "accent"}
        size={38}
        filled
      />
      <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font={16} fontWeight="semibold" lineLimit={1}>{item.name || item.id}</Text>
        <Text font={11} fontDesign="monospaced" foregroundStyle="secondaryLabel" lineLimit={1}>
          {item.masked || "已隐藏"}
        </Text>
        <HStack spacing={5}>
          <Tag text={admin.text} tone={admin.tone} />
          {item.off ? <Tag text="已停用" tone="gray" /> : null}
          {item.models && item.models.length > 0 ? <Tag text={`${item.models.length} 模型`} tone="blue" /> : null}
        </HStack>
      </VStack>
      <VStack alignment="trailing" spacing={3}>
        <StatusPill
          kind={spent ? "error" : item.off ? "idle" : "ok"}
          label={spent ? "已用尽" : item.off ? "停用" : "启用"}
          compact
        />
        {status ? (
          <Text font={10} foregroundStyle="tertiaryLabel" lineLimit={1}>{resetLabel(status)}</Text>
        ) : null}
      </VStack>
    </HStack>
  )
}

export function KeysView({ gateway }: { gateway: Gateway }) {
  const [payload, setPayload] = useState<KeysPayload | null>(null)
  const [error, setError] = useState<ApiResult<KeysPayload> | null>(null)
  const [loading, setLoading] = useState(true)
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  async function load() {
    const result = await fetchGatewayKeys(gateway)
    if (result.ok) {
      setPayload(result.data)
      setError(null)
    } else {
      setError(result)
    }
    setLoading(false)
  }

  const items = gatewayKeyList(payload)
  const adminKeys = items.filter(item => item.admin === "local" || item.admin === "any")
  const offKeys = items.filter(item => item.off)
  const spentKeys = items.filter(item => statusesOf(item).some(status => status.spent))

  return (
    <NavigationStack>
      <List
        {...LIST_STYLE}
        navigationTitle="网关密钥"
        navigationBarTitleDisplayMode="inline"
        refreshable={load}
        onAppear={load}
        toolbar={{
          topBarTrailing: [
            <Button
              key="add"
              systemImage="plus"
              buttonStyle="plain"
              frame={{ width: 44, height: 44 }}
              contentShape="rect"
              accessibilityLabel="新建密钥"
              action={() => setShowAdd(true)}
            />,
          ],
        }}
        sheet={{
          isPresented: showAdd,
          onChanged: (presented: boolean) => setShowAdd(presented),
          content: (
            <AddKeyView
              gateway={gateway}
              onCreated={secret => {
                if (secret) setCreatedSecret(secret)
                void load()
              }}
            />
          ),
        }}
      >
        {createdSecret ? (
          <Section>
            <SecretBox
              secret={createdSecret}
              title="新密钥只显示这一次"
              onDone={() => setCreatedSecret(null)}
            />
          </Section>
        ) : null}

        {error ? (
          <Section>
            <ErrorNotice
              message={error.error?.message ?? "读取网关密钥失败"}
              hint={error.error?.hint}
              raw={error.raw}
            />
          </Section>
        ) : null}

        {loading ? (
          <Section>
            <LoadingRow text="正在读取网关密钥" />
          </Section>
        ) : null}

        {!loading && !error ? (
          <Section
            header={
              <HStack>
                <Text>{`密钥 · ${items.length}`}</Text>
                <Spacer />
                {adminKeys.length > 0 ? <Tag text={`${adminKeys.length} 把可管理`} tone="purple" /> : null}
                {offKeys.length > 0 ? <Tag text={`${offKeys.length} 把停用`} tone="gray" /> : null}
                {spentKeys.length > 0 ? <Tag text={`${spentKeys.length} 把用尽`} tone="red" /> : null}
              </HStack>
            }
            footer={
              <Text font={12}>
                明文只在创建或轮换时返回一次。admin 级别只能在 Mac 上用 magpie 命令或应用设置，脚本不会提升任何密钥的权限。
              </Text>
            }
          >
            {items.map(item => (
              <NavigationLink
                key={item.id}
                destination={<KeyDetail gateway={gateway} keyId={item.id} />}
              >
                <KeyRow item={item} />
              </NavigationLink>
            ))}
          </Section>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <Section>
            <EmptyState
              icon="key"
              title="还没有网关密钥"
              message="点右上角的 + 新建一把；管理 API 至少需要一把带 admin 权限的密钥。"
            />
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  )
}

function AddKeyView({
  gateway,
  onCreated,
}: {
  gateway: Gateway
  onCreated: (secret: string | null) => void
}) {
  const dismiss = Navigation.useDismiss()
  const [name, setName] = useState("iPhone")
  const [secret, setSecret] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    if (!name.trim()) {
      setError("请填写密钥名称")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, any> = { name: name.trim() }
      if (secret.trim()) body.secret = secret.trim()
      const result = await keyAction(gateway, "add-key", body)
      if (!result.ok) {
        setError((result.error?.message ?? "创建失败") + (result.error?.hint ? "\n" + result.error.hint : ""))
        return
      }
      onCreated(result.data?.secret ?? null)
      dismiss()
    } catch (error) {
      setError(summarizeError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <NavigationStack>
      <List
        {...LIST_STYLE}
        navigationTitle="新建网关密钥"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="取消" action={dismiss} />,
          topBarTrailing: [
            <Button key="save" title="创建" disabled={busy || !name.trim()} action={create} />,
          ],
        }}
      >
        <Section
          footer={
            <Text font={12}>
              不填自定义密钥时由 magpie 生成。创建后只会显示一次，请立即保存。
            </Text>
          }
        >
          <TextField title="名称" value={name} onChanged={setName} prompt="例如 iPhone" />
          <SecureField
            title="自定义密钥"
            value={secret}
            onChanged={setSecret}
            prompt="可选，留空由 magpie 生成"
          />
        </Section>

        {error ? (
          <Section>
            <ErrorNotice message={error} />
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  )
}

export function KeyDetail({ gateway, keyId }: { gateway: Gateway; keyId: string }) {
  const dismiss = Navigation.useDismiss()
  const [payload, setPayload] = useState<KeysPayload | null>(null)
  const [error, setError] = useState<ApiResult<KeysPayload> | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  async function load() {
    const result = await fetchGatewayKeys(gateway)
    if (result.ok) {
      setPayload(result.data)
      setError(null)
    } else {
      setError(result)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [gateway.id, keyId])

  const item = gatewayKeyList(payload).find(key => key.id === keyId) ?? null
  const limits = item ? limitsOf(item) : []
  const statuses = item ? statusesOf(item) : []

  async function runAction(
    action: string,
    body: Record<string, any>,
    successText: string,
    after?: (result: ApiResult<KeysPayload>) => void,
  ) {
    setBusy(action)
    setMessage(null)
    try {
      const result = await keyAction(gateway, action, body)
      if (!result.ok) {
        setMessage({
          text: (result.error?.message ?? "操作失败") + (result.error?.hint ? "\n" + result.error.hint : ""),
          ok: false,
        })
        return
      }
      setMessage({ text: successText, ok: true })
      if (after) after(result)
      await load()
    } catch (error) {
      setMessage({ text: summarizeError(error), ok: false })
    } finally {
      setBusy(null)
    }
  }

  async function toggle() {
    if (!item) return
    await runAction(item.off ? "on-key" : "off-key", { key: item.id }, item.off ? "已启用" : "已停用")
  }

  async function rename() {
    if (!item) return
    const value = await Dialog.prompt({
      title: "重命名密钥",
      defaultValue: item.name || "",
      placeholder: "密钥名称",
      confirmLabel: "保存",
      cancelLabel: "取消",
    })
    if (value == null || !value.trim() || value.trim() === item.name) return
    await runAction("rename-key", { key: item.id, name: value.trim() }, "名称已更新")
  }

  async function rotate() {
    if (!item) return
    const confirmed = await Dialog.confirm({
      title: "轮换密钥",
      message: `「${item.name || item.id}」的旧密钥会立即失效，新密钥只显示一次。如果这就是本脚本正在使用的密钥，轮换后需要到设置里更新，否则面板会失去管理权限。`,
      cancelLabel: "取消",
      confirmLabel: "轮换",
    })
    if (!confirmed) return
    await runAction("rotate-key", { key: item.id }, "密钥已轮换", result => {
      setRevealed(result.data?.secret ?? null)
    })
  }

  async function resetLimits() {
    if (!item) return
    const confirmed = await Dialog.confirm({
      title: "重置限额用量",
      message: "只会把该密钥的限额计数从 0 重新开始，不改变额度大小。",
      cancelLabel: "取消",
      confirmLabel: "重置",
    })
    if (!confirmed) return
    await runAction("reset-limit-key", { key: item.id }, "用量已重置")
  }

  async function remove() {
    if (!item) return
    const confirmed = await Dialog.confirm({
      title: "删除密钥",
      message: `确定删除「${item.name || item.id}」？使用它的客户端会立即失去访问权限。`,
      cancelLabel: "取消",
      confirmLabel: "删除",
    })
    if (!confirmed) return
    const result = await keyAction(gateway, "remove-key", { key: item.id })
    if (result.ok) {
      dismiss()
      return
    }
    setMessage({ text: result.error?.message ?? "删除失败", ok: false })
  }

  const admin = item ? adminBadge(item) : null

  return (
    <ScrollView
        navigationTitle={item?.name || keyId}
        navigationBarTitleDisplayMode="inline"
        background={PAGE_BG}
        scrollContentBackground="hidden"
        refreshable={load}
        toolbar={{
          topBarTrailing: [
            <Menu key="actions" label={<Image systemName="ellipsis.circle" />}>
              <Button
                title={item?.off ? "启用" : "停用"}
                systemImage={item?.off ? "key.fill" : "key.slash"}
                disabled={busy !== null}
                action={toggle}
              />
              <Button title="重命名" systemImage="pencil" disabled={busy !== null} action={rename} />
              <Button
                title="轮换密钥"
                systemImage="arrow.triangle.2.circlepath"
                disabled={busy !== null}
                action={rotate}
              />
              <Button title="重置限额用量" systemImage="gobackward" disabled={busy !== null} action={resetLimits} />
              <Button title="删除" systemImage="trash" role="destructive" disabled={busy !== null} action={remove} />
            </Menu>,
          ],
        }}
      >
        <VStack alignment="leading" spacing={UI.pageSpacing} padding={UI.pagePadding}>
          {error ? (
            <ErrorNotice
              message={error.error?.message ?? "读取密钥失败"}
              hint={error.error?.hint}
              raw={error.raw}
            />
          ) : null}

          {message ? (
            <Card tone={message.ok ? "green" : "red"}>
              <HStack spacing={8}>
                <Image
                  systemName={message.ok ? "checkmark.circle.fill" : "xmark.circle.fill"}
                  font={14}
                  foregroundStyle={message.ok ? TONES.green.fg : TONES.red.fg}
                />
                <Text font={13} lineLimit={4}>{message.text}</Text>
              </HStack>
            </Card>
          ) : null}

          {revealed ? (
            <SecretBox secret={revealed} title="新密钥只显示这一次" onDone={() => setRevealed(null)} />
          ) : null}

          {loading && !item ? <LoadingRow text="正在读取密钥" /> : null}

          {item ? (
            <Card>
              <HStack spacing={10}>
                <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  <Text font={17} fontWeight="semibold">{item.name || item.id}</Text>
                  <Text font={12} fontDesign="monospaced" foregroundStyle="secondaryLabel" lineLimit={1}>
                    {item.masked || "已隐藏"}
                  </Text>
                </VStack>
                <VStack alignment="trailing" spacing={4}>
                  <StatusPill kind={item.off ? "idle" : "ok"} label={item.off ? "已停用" : "已启用"} compact />
                  {admin ? <Tag text={admin.text} tone={admin.tone} /> : null}
                </VStack>
              </HStack>
              <HStack spacing={5}>
                {item.lan ? <Tag text="默认共享密钥" tone="gray" /> : null}
                {item.quotas ? <Tag text="返回配额" tone="blue" /> : null}
                <Tag text={item.models && item.models.length > 0 ? `${item.models.length} 个模型` : "全部模型"} tone="gray" />
                <Tag text={item.accounts && item.accounts.length > 0 ? `${item.accounts.length} 个账号` : "全部账号"} tone="gray" />
              </HStack>
              <HStack spacing={10}>
                <Text font={11} fontDesign="monospaced" foregroundStyle="secondaryLabel" lineLimit={1} frame={{ maxWidth: "infinity" }}>
                  id: {item.id}
                </Text>
                <CopyChip text={item.id} label="" />
              </HStack>
            </Card>
          ) : null}

          {item ? (
            <Card>
              <SectionHeader
                title="限额"
                caption={limits.length === 0 ? "没有限额" : `${limits.length} 条，全部满足才放行`}
              />
              {limits.length === 0 ? (
                <Text font={12} foregroundStyle="secondaryLabel">
                  可在 Mac 上用 magpie gateway-key limit 设置 tokens 或花费上限。
                </Text>
              ) : (
                limits.map((limit, index) => {
                  const status = statuses[index]
                  const tokenLimit = status?.tokenLimit ?? limit.tokens
                  const costLimit = status?.costLimit ?? limit.cost
                  return (
                    <VStack key={index} alignment="leading" spacing={7} padding={{ vertical: 4 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                      <HStack spacing={8}>
                        <Text font={14}>{limitLabel(limit)}</Text>
                        <Spacer />
                        <Text font={11} foregroundStyle="secondaryLabel">{status ? resetLabel(status) : "—"}</Text>
                      </HStack>
                      <Text font={11} foregroundStyle="secondaryLabel">
                        {limitAmountLabel(limit) || "无额度上限"}
                        {limit.models && limit.models.length > 0 ? " · 仅 " + limit.models.join(", ") : ""}
                        {limit.account ? " · 账号 " + limit.account : ""}
                      </Text>
                      <UsageBar
                        usedText={`${tokensLabel(status?.tokens)} · ${costLabel(status?.cost)}`}
                        limitText={
                          tokenLimit || costLimit
                            ? [tokenLimit ? tokensLabel(tokenLimit) : "", costLimit ? costLabel(costLimit) : ""]
                                .filter(Boolean)
                                .join(" · ")
                            : "无上限"
                        }
                        fraction={status ? percent(status.tokens, tokenLimit) ?? percent(status.cost, costLimit) : null}
                        tone={status?.spent ? "red" : "accent"}
                      />
                      {status?.spent ? (
                        <Text font={11} foregroundStyle={TONES.red.fg}>
                          已用尽，到重置前该密钥会被拒绝。
                        </Text>
                      ) : null}
                    </VStack>
                  )
                })
              )}
            </Card>
          ) : null}

          {item ? (
            <Card>
              <SectionHeader title="范围" caption="密钥被限制在哪些模型和账号上" />
              <Text font={12} lineLimit={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                模型：{item.models && item.models.length > 0 ? item.models.join(", ") : "全部模型"}
              </Text>
              <Text font={12} lineLimit={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                账号：{item.accounts && item.accounts.length > 0 ? item.accounts.join(", ") : "全部账号"}
              </Text>
              {item.aliases && Object.keys(item.aliases).length > 0 ? (
                <Text font={12} lineLimit={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  别名：{Object.entries(item.aliases).map(([name, target]) => `${name} → ${target}`).join(", ")}
                </Text>
              ) : null}
            </Card>
          ) : null}

          {item ? (
            <Card>
              <SectionHeader title="操作" />
              <Button
                title={item.off ? "启用这把密钥" : "停用这把密钥"}
                systemImage={item.off ? "key.fill" : "key.slash"}
                buttonStyle="bordered"
                disabled={busy !== null}
                action={toggle}
              />
              <Button
                title="轮换密钥"
                systemImage="arrow.triangle.2.circlepath"
                buttonStyle="bordered"
                disabled={busy !== null}
                action={rotate}
              />
              <Button
                title="重置限额用量"
                systemImage="gobackward"
                buttonStyle="bordered"
                disabled={busy !== null || limits.length === 0}
                action={resetLimits}
              />
              <Button
                title="删除密钥"
                systemImage="trash"
                role="destructive"
                buttonStyle="bordered"
                disabled={busy !== null}
                action={remove}
              />
              <Text font={11} foregroundStyle="secondaryLabel">
                admin 级别、模型范围与限额规则请在 magpie 应用或 CLI 修改；本脚本不修改这些规则。
              </Text>
            </Card>
          ) : null}

          {!loading && !item && !error ? (
            <EmptyState icon="key.slash" title="密钥不存在" message="它可能刚被删除，下拉刷新。" />
          ) : null}
        </VStack>
    </ScrollView>
  )
}