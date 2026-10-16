// Cloudflare 观测主界面：账户限额主卡片 + Worker / Pages 项目列表；设置在 sheet 中完成
import {
  Button,
  Group,
  HStack,
  Image,
  List,
  Navigation,
  NavigationLink,
  NavigationStack,
  Section,
  Text,
  Toolbar,
  ToolbarItem,
  useEffect,
  useState,
  VStack,
  Widget,
} from "scripting"
import { listPages, listWorkers } from "./lib/cfApi"
import { formatClock, formatCount, projectKey, totalsFor, type Project } from "./lib/cfCore"
import {
  getToken,
  isConfigured,
  loadCachedProjects,
  loadSettings,
  saveCachedProjects,
  saveSettings,
  sameProject,
  setToken,
  type Settings,
} from "./lib/settings"
import { fetchUsage, snapshotSummary, type UsageSnapshot } from "./lib/usage"
import { useMarkdownReleaseNotesSheet } from "./components/ReleaseNotesSheet"
import { BARE_ROW, EmptyState, IconBadge, LIST_STYLE, Tag } from "./components/Kit"
import { QuotaHero } from "./components/Quota"
import { TONES, type Tone } from "./lib/theme"
import { ProjectView } from "./views/ProjectView"
import { SettingsView } from "./views/SettingsView"

export function projectIcon(kind: Project["kind"]): string {
  return kind === "worker" ? "bolt.fill" : "doc.richtext.fill"
}

export function projectTone(kind: Project["kind"]): Tone {
  return kind === "worker" ? "orange" : "blue"
}

/** 修改小组件项目后通知 WidgetKit 重新取数 */
export function reloadWidgets() {
  try {
    Widget.reloadAll()
  } catch {
    // 非 App 环境（预览）可能不可用
  }
}

export function CfObservabilityApp() {
  const dismiss = Navigation.useDismiss()
  const releaseNotes = useMarkdownReleaseNotesSheet({
    markdownFile: "changelog.md",
    storageKey: "cf-observability:release-notes:last-seen-hash",
    title: "更新说明",
  })
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [token, setTokenState] = useState<string>(getToken)
  const [projects, setProjects] = useState<Project[]>(loadCachedProjects)
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const configured = isConfigured(settings, token)

  async function load(s: Settings = settings, t: string = token) {
    if (!isConfigured(s, t)) return
    setLoading(true)
    const errs: string[] = []
    const [workers, pages, usage] = await Promise.all([
      listWorkers(t, s.accountId).catch((e) => {
        errs.push(`Worker 列表：${e instanceof Error ? e.message : e}`)
        return null
      }),
      listPages(t, s.accountId).catch((e) => {
        errs.push(`Pages 列表：${e instanceof Error ? e.message : e}`)
        return null
      }),
      fetchUsage(t, s).catch((e) => {
        errs.push(`用量：${e instanceof Error ? e.message : e}`)
        return null
      }),
    ])
    if (workers || pages) {
      const list = [...(workers ?? projects.filter((p) => p.kind === "worker")), ...(pages ?? projects.filter((p) => p.kind === "pages"))]
      setProjects(list)
      saveCachedProjects(list)
    }
    if (usage) setSnapshot(usage)
    setErrors(errs)
    setLoading(false)
  }

  useEffect(() => {
    if (configured) void load()
    else setShowSettings(true)
    // 仅在挂载时加载一次；下拉刷新与保存设置时手动触发
    // eslint-disable-next-line
  }, [])

  function updateSettings(next: Settings) {
    saveSettings(next)
    setSettings(next)
  }

  function setWidgetProject(p: Project | null) {
    updateSettings({ ...settings, widgetProject: p })
    reloadWidgets()
  }

  const summary = snapshot ? snapshotSummary(snapshot) : null
  const workers = projects.filter((p) => p.kind === "worker")
  const pages = projects.filter((p) => p.kind === "pages")

  const toolbar = (
    <Toolbar>
      <ToolbarItem placement="topBarLeading" sharedBackgroundVisibility="visible">
        <Button action={() => dismiss()} buttonStyle="plain" frame={{ width: 44, height: 44 }} contentShape="rect" accessibilityLabel="关闭">
          <Image systemName="xmark" font="headline" foregroundStyle="label" />
        </Button>
      </ToolbarItem>
      <ToolbarItem placement="topBarTrailing" sharedBackgroundVisibility="visible">
        <Button action={() => setShowSettings(true)} buttonStyle="plain" frame={{ width: 44, height: 44 }} contentShape="rect" accessibilityLabel="设置">
          <Image systemName="gearshape" font="headline" foregroundStyle="label" />
        </Button>
      </ToolbarItem>
    </Toolbar>
  )

  function projectRow(p: Project) {
    const t = snapshot ? totalsFor(snapshot.usage, p) : null
    const isWidget = sameProject(settings.widgetProject, p)
    return (
      <NavigationLink
        key={projectKey(p)}
        destination={
          <ProjectView
            project={p}
            settings={settings}
            token={token}
            isWidget={isWidget}
            onSetWidget={() => setWidgetProject(p)}
          />
        }
      >
        <HStack
          spacing={12}
          padding={{ vertical: 4 }}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
          trailingSwipeActions={{
            allowsFullSwipe: true,
            actions: [<Button title={isWidget ? "已在小组件" : "设为小组件"} tint="systemOrange" action={() => setWidgetProject(p)} />],
          }}
          contextMenu={{
            menuItems: (
              <Group>
                <Button title="设为小组件项目" systemImage="square.grid.2x2" action={() => setWidgetProject(p)} />
              </Group>
            ),
          }}
        >
          <IconBadge icon={projectIcon(p.kind)} tone={projectTone(p.kind)} size={38} filled />
          <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            <HStack spacing={6}>
              <Text font={16} fontWeight="semibold" lineLimit={1}>{p.name}</Text>
              {isWidget ? <Tag text="小组件" tone="orange" /> : null}
            </HStack>
            <Text font={12} fontDesign="rounded" monospacedDigit foregroundStyle="secondaryLabel" lineLimit={1}>
              {t
                ? `${settings.plan === "free" ? "今日" : "本周期"} ${formatCount(t.requests)} 次${t.errors > 0 ? ` · 错误 ${formatCount(t.errors)}` : ""}`
                : p.subtitle ?? "—"}
            </Text>
          </VStack>
          {t && t.errors > 0 ? <Image systemName="exclamationmark.triangle.fill" font={13} foregroundStyle={TONES.orange.fg} /> : null}
        </HStack>
      </NavigationLink>
    )
  }

  return (
    <NavigationStack
      sheet={{
        isPresented: showSettings,
        onChanged: (v: boolean) => setShowSettings(v),
        content: (
          <SettingsView
            initial={settings}
            hasToken={token.length > 0}
            onDone={(next, newToken) => {
              setShowSettings(false)
              if (!next) return
              let t = token
              if (newToken !== null) {
                setToken(newToken)
                t = newToken.trim()
                setTokenState(t)
              }
              updateSettings(next)
              reloadWidgets()
              void load(next, t)
            }}
          />
        ),
      }}
    >
      <List
        {...LIST_STYLE}
        navigationTitle="Cloudflare 观测"
        toolbar={toolbar}
        sheet={releaseNotes}
        refreshable={async () => { await load() }}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      >
        {!configured ? (
          <Section>
            <VStack spacing={12} padding={{ vertical: 6 }}>
              <EmptyState
                icon="key.fill"
                title="还没有配置 API 令牌"
                message="在设置中填写 Cloudflare 用户 API 令牌与 Account ID，即可查看 Workers / Pages 用量与日志"
              />
              <Button title="打开设置" systemImage="gearshape" buttonStyle="borderedProminent" action={() => setShowSettings(true)} />
            </VStack>
          </Section>
        ) : (
          <Section
            footer={
              errors.length > 0 ? (
                <Text font={13} foregroundStyle={TONES.red.fg}>{errors.join("\n")}</Text>
              ) : (
                <Text font={13}>
                  {settings.plan === "free"
                    ? "Workers Free：账户内所有 Worker 与 Pages Functions 每天共享 10 万次请求，00:00 UTC 重置。数据来自 GraphQL Analytics，为采样近似值。"
                    : `Workers Paid：每个账单周期含 1,000 万次请求与 3,000 万 CPU 毫秒（周期从每月 ${settings.cycleDay} 日 00:00 UTC 起算）。超额估算不含 $5 月费。`}
                </Text>
              )
            }
          >
            <VStack {...BARE_ROW}>
              {summary && snapshot ? (
                <QuotaHero
                  q={summary}
                  workersRequests={snapshot.usage.workersTotal.requests}
                  pagesRequests={snapshot.usage.pagesTotal.requests}
                  updatedText={`${settings.accountName || settings.accountId} · 更新于 ${formatClock(snapshot.fetchedAt)}${loading ? " · 刷新中…" : ""}`}
                  onTap={() => { void load() }}
                />
              ) : (
                <EmptyState icon={loading ? "hourglass" : "chart.bar.xaxis"} title={loading ? "加载中…" : "暂无用量数据"} message="下拉刷新" />
              )}
            </VStack>
          </Section>
        )}

        {configured ? (
          <Section
            header={<Text>{`Workers · ${workers.length}`}</Text>}
            footer={<Text font={13}>点按查看详情与日志；左滑或长按可设为小组件项目。</Text>}
          >
            {workers.length === 0 ? (
              <EmptyState icon="bolt.slash" title={loading ? "加载中…" : "没有 Worker"} />
            ) : (
              workers.map(projectRow)
            )}
          </Section>
        ) : null}

        {configured && pages.length > 0 ? (
          <Section header={<Text>{`Pages · ${pages.length}`}</Text>}>{pages.map(projectRow)}</Section>
        ) : null}
      </List>
    </NavigationStack>
  )
}
