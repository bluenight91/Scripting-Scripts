// 设置（sheet）：用户 API 令牌、Account ID（可自动识别）、套餐与账单周期日、令牌权限检查、所需权限说明
import {
  Button,
  HStack,
  Image,
  List,
  NavigationStack,
  Picker,
  ProgressView,
  SecureField,
  Section,
  Spacer,
  Text,
  TextField,
  useState,
  VStack,
  Widget,
} from "scripting"
import { checkPermissions, listAccounts, type Account, type PermissionCheck } from "../lib/cfApi"
import { planLabel, type Plan } from "../lib/cfCore"
import { getToken, type Settings } from "../lib/settings"
import { IconBadge, LIST_STYLE, ListRow, Tag } from "../components/Kit"
import { TONES } from "../lib/theme"

const TOKEN_PAGE = "https://dash.cloudflare.com/profile/api-tokens"
const TOKEN_DOC = "https://developers.cloudflare.com/fundamentals/api/get-started/create-token/"

export const REQUIRED_PERMISSIONS: { permission: string; usage: string; required: boolean }[] = [
  { permission: "Account · Account Analytics · Read", usage: "GraphQL 用量与指标：限额、请求、CPU、错误、状态分布", required: true },
  { permission: "Account · Workers Scripts · Read", usage: "列出 Worker 项目", required: true },
  { permission: "Account · Cloudflare Pages · Read", usage: "列出 Pages 项目并取得 production_script_name", required: true },
  { permission: "Account · Workers Observability · Write", usage: "日志与事件查询（官方查询接口只接受 Write；脚本只发查询，不做修改）", required: false },
  { permission: "Account · Account Settings · Read", usage: "自动识别 Account ID（否则手动粘贴）", required: false },
]

const CYCLE_DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

export function SettingsView({
  initial,
  hasToken,
  onDone,
}: {
  initial: Settings
  hasToken: boolean
  /** settings 为 null 表示取消；token 为 null 表示保持已存令牌不变 */
  onDone: (settings: Settings | null, token: string | null) => void
}) {
  const [tokenDraft, setTokenDraft] = useState("")
  const [accountId, setAccountId] = useState(initial.accountId)
  const [accountName, setAccountName] = useState(initial.accountName)
  const [plan, setPlan] = useState<Plan>(initial.plan)
  const [cycleDay, setCycleDay] = useState(initial.cycleDay)
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [accountMsg, setAccountMsg] = useState<string | null>(null)
  const [checks, setChecks] = useState<PermissionCheck[] | null>(null)
  const [busy, setBusy] = useState<"accounts" | "check" | null>(null)
  const [widgetMsg, setWidgetMsg] = useState<string | null>(null)
  const [widgetProject, setWidgetProject] = useState(initial.widgetProject)

  function effectiveToken(): string {
    return tokenDraft.trim() || getToken()
  }

  async function detectAccounts() {
    const t = effectiveToken()
    if (!t) {
      setAccountMsg("请先填写 API 令牌")
      return
    }
    setBusy("accounts")
    setAccountMsg(null)
    try {
      const list = await listAccounts(t)
      setAccounts(list)
      if (list.length === 1) {
        setAccountId(list[0].id)
        setAccountName(list[0].name)
      }
      setAccountMsg(list.length === 0 ? "令牌没有可访问的账户" : list.length === 1 ? `已选择「${list[0].name}」` : "请选择账户")
    } catch (e) {
      setAccountMsg(`${e instanceof Error ? e.message : e}。可在控制台 Workers & Pages 页右侧复制 Account ID 手动填写。`)
    } finally {
      setBusy(null)
    }
  }

  async function runChecks() {
    const t = effectiveToken()
    if (!t || !accountId.trim()) {
      setChecks(null)
      setAccountMsg("请先填写 API 令牌与 Account ID")
      return
    }
    setBusy("check")
    try {
      setChecks(await checkPermissions(t, accountId.trim()))
    } finally {
      setBusy(null)
    }
  }

  function save() {
    onDone(
      {
        ...initial,
        accountId: accountId.trim(),
        accountName: accountName.trim(),
        plan,
        cycleDay,
        widgetProject,
      },
      tokenDraft.trim() ? tokenDraft.trim() : null
    )
  }

  const canSave = (hasToken || tokenDraft.trim().length > 0) && accountId.trim().length > 0

  return (
    <NavigationStack>
      <List
        {...LIST_STYLE}
        navigationTitle="设置"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="取消" action={() => onDone(null, null)} />,
          confirmationAction: <Button title="保存" fontWeight="semibold" disabled={!canSave} action={save} />,
        }}
      >
        <Section
          header={<Text>API 令牌</Text>}
          footer={<Text font={13}>在「我的个人资料 → API 令牌」创建自定义令牌（用户 API 令牌），权限见下方清单。令牌保存在本脚本的 iOS Keychain 中。</Text>}
        >
          <SecureField
            label={<Text>令牌</Text>}
            value={tokenDraft}
            onChanged={setTokenDraft}
            prompt={hasToken ? "已保存；留空则保持不变" : "粘贴 Cloudflare API 令牌"}
          />
          <Button action={() => { void Safari.present(TOKEN_PAGE, false) }}>
            <ListRow icon="key.fill" tone="orange" title="打开 Cloudflare API 令牌页面" titleColor="label" />
          </Button>
        </Section>

        <Section
          header={<Text>账户</Text>}
          footer={<Text font={13} foregroundStyle={accountMsg && /失败|无|错误|请/.test(accountMsg) ? TONES.red.fg : undefined}>{accountMsg ?? "Account ID 可在控制台 Workers & Pages 概览页右侧找到。"}</Text>}
        >
          <TextField label={<Text>Account ID</Text>} value={accountId} onChanged={setAccountId} prompt="32 位十六进制 ID" />
          <TextField label={<Text>名称</Text>} value={accountName} onChanged={setAccountName} prompt="仅用于显示（可留空）" />
          <Button action={() => { void detectAccounts() }} disabled={busy !== null}>
            <HStack spacing={12}>
              <IconBadge icon="person.crop.circle.badge.checkmark" tone="blue" size={30} filled />
              <Text font={16} foregroundStyle="label" frame={{ maxWidth: "infinity", alignment: "leading" }}>自动识别账户</Text>
              {busy === "accounts" ? <ProgressView /> : null}
            </HStack>
          </Button>
          {(accounts ?? []).length > 1
            ? (accounts ?? []).map((a) => (
                <Button
                  key={a.id}
                  action={() => {
                    setAccountId(a.id)
                    setAccountName(a.name)
                    setAccountMsg(`已选择「${a.name}」`)
                  }}
                >
                  <HStack spacing={10}>
                    <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                      <Text font={15} foregroundStyle="label">{a.name}</Text>
                      <Text font={11} fontDesign="monospaced" foregroundStyle="secondaryLabel">{a.id}</Text>
                    </VStack>
                    {a.id === accountId ? <Image systemName="checkmark" font={14} foregroundStyle={TONES.orange.fg} /> : null}
                  </HStack>
                </Button>
              ))
            : null}
        </Section>

        <Section
          header={<Text>套餐</Text>}
          footer={
            <Text font={13}>
              {plan === "free"
                ? "Workers Free：账户级每天 10 万次请求（Workers 与 Pages Functions 共用），00:00 UTC 重置；单次调用 CPU 上限 10 ms。"
                : "Workers Paid：每个账单周期含 1,000 万次请求（超出 $0.30 / 百万）与 3,000 万 CPU 毫秒（超出 $0.02 / 百万毫秒）。周期日按订阅续费日填写，按 UTC 计算。"}
            </Text>
          }
        >
          <Picker title="套餐" pickerStyle="segmented" value={plan} onChanged={(v: string) => setPlan(v === "paid" ? "paid" : "free")}>
            <Text tag="free">{planLabel("free")}</Text>
            <Text tag="paid">{planLabel("paid")}</Text>
          </Picker>
          {plan === "paid" ? (
            <Picker title="账单周期起始日" value={String(cycleDay)} onChanged={(v: string) => setCycleDay(Number(v) || 1)}>
              {CYCLE_DAYS.map((d) => (
                <Text key={d} tag={String(d)}>{`每月 ${d} 日`}</Text>
              ))}
            </Picker>
          ) : null}
        </Section>

        <Section header={<Text>权限检查</Text>} footer={<Text font={13}>逐项调用各接口，确认令牌权限是否足够。可选权限缺失时对应功能不可用，其余功能照常。</Text>}>
          <Button action={() => { void runChecks() }} disabled={busy !== null}>
            <HStack spacing={12}>
              <IconBadge icon="checklist" tone="green" size={30} filled />
              <Text font={16} foregroundStyle="label" frame={{ maxWidth: "infinity", alignment: "leading" }}>检查令牌权限</Text>
              {busy === "check" ? <ProgressView /> : null}
            </HStack>
          </Button>
          {(checks ?? []).map((c) => (
            <HStack key={c.id} spacing={12} alignment="top">
              <IconBadge
                icon={c.ok ? "checkmark.circle.fill" : c.required ? "xmark.octagon.fill" : "exclamationmark.circle.fill"}
                tone={c.ok ? "green" : c.required ? "red" : "orange"}
                size={28}
              />
              <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <HStack spacing={6}>
                  <Text font={15} fontWeight="semibold">{c.title}</Text>
                  {!c.required ? <Tag text="可选" /> : null}
                </HStack>
                <Text font={11} fontDesign="monospaced" foregroundStyle="secondaryLabel">{c.permission}</Text>
                <Text font={12} foregroundStyle={c.ok ? "secondaryLabel" : TONES.red.fg} lineLimit={3}>{c.detail}</Text>
              </VStack>
            </HStack>
          ))}
        </Section>

        <Section
          header={<Text>令牌所需权限</Text>}
          footer={<Text font={13}>账户资源选择「包括 → 包含该项目的账户」。不需要任何区域（Zone）权限。</Text>}
        >
          {REQUIRED_PERMISSIONS.map((p) => (
            <VStack key={p.permission} alignment="leading" spacing={3}>
              <HStack spacing={6}>
                <Text font={14} fontWeight="semibold" fontDesign="monospaced" lineLimit={1} minScaleFactor={0.7}>{p.permission}</Text>
                <Spacer />
                <Tag text={p.required ? "必需" : "可选"} tone={p.required ? "orange" : "gray"} />
              </HStack>
              <Text font={12} foregroundStyle="secondaryLabel">{p.usage}</Text>
            </VStack>
          ))}
          <Button action={() => { void Safari.present(TOKEN_DOC, false) }}>
            <ListRow icon="book.fill" tone="blue" title="Cloudflare：创建 API 令牌" titleColor="label" />
          </Button>
        </Section>

        <Section
          header={<Text>小组件</Text>}
          footer={
            <Text font={13}>
              未选定项目时小组件显示账户总用量（Workers / Pages 分布与用量最高的项目）。编辑小组件时把 Parameter 填为项目名（可加 worker: / pages: 前缀）或 account 可单独覆盖，方便同时放多个小组件。
            </Text>
          }
        >
          <ListRow
            icon="square.grid.2x2.fill"
            tone="orange"
            title="当前小组件项目"
            value={widgetProject ? widgetProject.name : "账户总用量"}
          />
          {widgetProject ? (
            <Button action={() => setWidgetProject(null)}>
              <ListRow icon="xmark.square.fill" tone="gray" title="取消小组件项目" subtitle="保存后小组件改为显示账户总用量" titleColor="label" />
            </Button>
          ) : null}
          <Button
            action={() => {
              Widget.reloadAll()
              setWidgetMsg("已请求系统刷新小组件")
            }}
          >
            <ListRow icon="arrow.clockwise" tone="green" title="立即刷新小组件" subtitle={widgetMsg ?? undefined} titleColor="label" />
          </Button>
        </Section>
      </List>
    </NavigationStack>
  )
}
