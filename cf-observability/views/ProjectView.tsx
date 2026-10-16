// 项目详情：时间范围切换、请求 / 错误 / CPU / Wall time 指标、请求柱状图、调用状态分布、日志入口
import {
  BarChart,
  Button,
  Chart,
  HStack,
  Image,
  List,
  NavigationLink,
  Section,
  Spacer,
  Text,
  useEffect,
  useState,
  VStack,
} from "scripting"
import {
  countParts,
  cpuPerInvocationLimitMs,
  DETAIL_RANGES,
  detailWindow,
  fillSeries,
  formatCount,
  formatMs,
  formatPercent,
  isBadStatus,
  ratio,
  statusLabel,
  usToMs,
  type DetailData,
  type DetailRangeId,
  type Project,
} from "../lib/cfCore"
import type { Settings } from "../lib/settings"
import { fetchDetail } from "../lib/usage"
import { BARE_ROW, Card, ChipBar, EmptyState, HeroCard, IconBadge, LIST_STYLE, ListRow, MetricTile, SectionHeader, ValueText } from "../components/Kit"
import { GradientBar } from "../components/GradientBar"
import { HERO_DIM, HeroChip } from "../components/Quota"
import { CF_YELLOW, TONES, UI } from "../lib/theme"
import { LogsView } from "./LogsView"

const STATUS_OK = ["#34C759", "#30B0C7"]
const STATUS_BAD = ["#FF9500", "#FF3B30"]

export function ProjectView({
  project,
  settings,
  token,
  isWidget,
  onSetWidget,
}: {
  project: Project
  settings: Settings
  token: string
  isWidget: boolean
  onSetWidget: (on: boolean) => void
}) {
  const [range, setRange] = useState<DetailRangeId>("24h")
  const [data, setData] = useState<DetailData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pinned, setPinned] = useState(isWidget)

  async function load(id: DetailRangeId = range) {
    setLoading(true)
    setError(null)
    try {
      const win = detailWindow(id, settings.plan, new Date(), settings.cycleDay)
      const d = await fetchDetail(token, settings.accountId, project, win)
      if (!win.daily) {
        d.series = fillSeries(d.series, win.start, win.end, win.bucket === "minute" ? 60_000 : 3_600_000)
      }
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(range)
    // eslint-disable-next-line
  }, [range])

  const win = detailWindow(range, settings.plan, new Date(), settings.cycleDay)
  const t = data?.totals
  const req = countParts(t?.requests ?? null)
  const errRate = t ? ratio(t.errors, t.requests) : null
  const cpuP50 = usToMs(data?.cpuP50Us)
  const cpuP99 = usToMs(data?.cpuP99Us)
  const wallP99 = usToMs(data?.wallP99Us)
  const cpuLimit = cpuPerInvocationLimitMs(settings.plan)
  const cpuTotalMs = usToMs(t?.cpuTimeUs)
  const exceeded = data?.statuses?.find((s) => s.status === "exceededCpu")?.requests ?? 0
  const statusTotal = data?.statuses?.reduce((a, s) => a + s.requests, 0) ?? 0
  const unit = win.daily ? "day" : win.bucket === "minute" ? "minute" : "hour"
  const marks = (data?.series ?? []).map((p) => ({
    label: new Date(p.t),
    value: p.requests,
    unit: unit as "day" | "minute" | "hour",
    foregroundStyle: CF_YELLOW,
    cornerRadius: 2,
  }))
  const chips = DETAIL_RANGES.map((r) => ({ id: r.id, title: r.id === "period" ? (settings.plan === "free" ? "今日" : "本周期") : r.title }))

  return (
    <List
      {...LIST_STYLE}
      navigationTitle={project.name}
      refreshable={async () => { await load() }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <Section>
        <VStack {...BARE_ROW} spacing={12}>
          <ChipBar items={chips} value={range} onChange={setRange} />
          {error ? (
            <Card tone="red">
              <HStack spacing={10}>
                <IconBadge icon="exclamationmark.triangle.fill" tone="red" />
                <Text font={13} foregroundStyle={TONES.red.fg}>{error}</Text>
              </HStack>
            </Card>
          ) : (
            <HeroCard onTap={() => { void load() }}>
              <HStack spacing={8}>
                <Image systemName={project.kind === "worker" ? "bolt.fill" : "doc.richtext.fill"} font={14} foregroundStyle={HERO_DIM} />
                <Text font={14} fontWeight="semibold" foregroundStyle={HERO_DIM}>
                  {project.kind === "worker" ? "Worker" : "Pages Functions"}
                </Text>
                <Spacer />
                <Text font={12} foregroundStyle={HERO_DIM}>{loading ? "加载中…" : "轻点刷新"}</Text>
              </HStack>
              <ValueText value={req.value} unit={`${req.unit} 次请求`} size={UI.heroFont} color="white" unitColor={HERO_DIM} />
              <HStack spacing={8}>
                <HeroChip icon="xmark.octagon.fill" text={`错误 ${formatCount(t?.errors ?? null)}`} />
                <HeroChip icon="percent" text={`错误率 ${formatPercent(errRate)}`} />
                {exceeded > 0 ? <HeroChip icon="cpu" text={`超 CPU ${formatCount(exceeded)}`} /> : null}
              </HStack>
            </HeroCard>
          )}
        </VStack>
      </Section>

      <Section>
        <VStack {...BARE_ROW} spacing={10}>
          <HStack spacing={10}>
            <MetricTile
              icon="cpu"
              tone="purple"
              title="CPU P50"
              value={formatMs(cpuP50)}
              subtitle={`单次上限 ${formatMs(cpuLimit)}`}
            />
            <MetricTile
              icon="cpu.fill"
              tone={cpuP99 != null && cpuP99 > cpuLimit * 0.8 ? "red" : "pink"}
              title="CPU P99"
              value={formatMs(cpuP99)}
              subtitle={cpuP99 == null ? "暂无数据" : `占上限 ${formatPercent(cpuP99 / cpuLimit)}`}
              badge={cpuP99 != null && cpuP99 > cpuLimit ? "已超出单次上限" : undefined}
            />
          </HStack>
          <HStack spacing={10}>
            <MetricTile icon="timer" tone="teal" title="Wall P99" value={formatMs(wallP99)} subtitle="含网络等待" />
            <MetricTile
              icon="arrow.triangle.branch"
              tone="blue"
              title="子请求"
              value={formatCount(t?.subrequests ?? null)}
              subtitle={cpuTotalMs != null ? `CPU 合计 ${formatCount(Math.round(cpuTotalMs))} ms` : "CPU 合计 —"}
            />
          </HStack>
        </VStack>
      </Section>

      <Section>
        <VStack {...BARE_ROW}>
          <Card>
            <SectionHeader title="请求趋势" caption={win.daily ? "按天" : win.bucket === "minute" ? "按分钟" : "按小时"} />
            {marks.length >= 2 ? (
              <Chart frame={{ height: 150 }} chartLegend="hidden">
                <BarChart marks={marks} />
              </Chart>
            ) : (
              <Text font={13} foregroundStyle="secondaryLabel">{loading ? "加载中…" : "该时段没有请求"}</Text>
            )}
          </Card>
        </VStack>
      </Section>

      <Section>
        <VStack {...BARE_ROW}>
          <Card>
            <SectionHeader title="调用状态" caption={statusTotal > 0 ? `${formatCount(statusTotal)} 次` : undefined} />
            {data?.statuses == null ? (
              <Text font={13} foregroundStyle="secondaryLabel">{loading ? "加载中…" : "该数据集不提供状态分布"}</Text>
            ) : data.statuses.length === 0 ? (
              <EmptyState icon="checkmark.circle" title="没有调用" />
            ) : (
              data.statuses.map((s, i) => (
                <GradientBar
                  key={s.status}
                  rank={i + 1}
                  label={statusLabel(s.status)}
                  valueText={`${formatCount(s.requests)} · ${formatPercent(ratio(s.requests, statusTotal))}`}
                  ratio={ratio(s.requests, statusTotal)}
                  colors={isBadStatus(s.status) ? STATUS_BAD : STATUS_OK}
                />
              ))
            )}
            {settings.plan === "free" && exceeded > 0 ? (
              <Text font={12} foregroundStyle={TONES.red.fg}>
                Workers Free 单次调用 CPU 上限 10 ms，超出的请求返回 1102 错误。可考虑升级 Workers Paid。
              </Text>
            ) : null}
          </Card>
        </VStack>
      </Section>

      <Section
        header={<Text>工具</Text>}
        footer={
          <Text font={13}>
            {project.kind === "worker"
              ? "日志来自 Workers Observability（Workers Logs），需要 Worker 开启 observability.enabled，并在令牌中授予 Workers Observability 权限。"
              : "Pages Functions 不写入 Workers Logs，日志查询仅支持 Worker。"}
          </Text>
        }
      >
        {project.kind === "worker" ? (
          <NavigationLink destination={<LogsView project={project} settings={settings} token={token} />}>
            <ListRow icon="text.alignleft" tone="purple" title="日志与事件" subtitle="最近事件、错误、Top 路径 / 状态码 / 国家" />
          </NavigationLink>
        ) : null}
        <Button
          action={() => {
            onSetWidget(!pinned)
            setPinned(!pinned)
          }}
        >
          <ListRow
            icon={pinned ? "xmark.square.fill" : "square.grid.2x2.fill"}
            tone={pinned ? "gray" : "orange"}
            title={pinned ? "取消小组件项目" : "设为小组件项目"}
            subtitle={pinned ? "当前小组件显示该项目；取消后显示账户总用量" : "桌面 / 锁屏小组件显示该项目的限额使用"}
            titleColor="label"
          />
        </Button>
        <Button action={() => { void Safari.present(dashUrl(settings.accountId, project), false) }}>
          <ListRow icon="safari.fill" tone="blue" title="在 Cloudflare 控制台打开" titleColor="label" />
        </Button>
      </Section>
    </List>
  )
}

function dashUrl(accountId: string, p: Project): string {
  return p.kind === "worker"
    ? `https://dash.cloudflare.com/${accountId}/workers/services/view/${encodeURIComponent(p.name)}/production/observability`
    : `https://dash.cloudflare.com/${accountId}/pages/view/${encodeURIComponent(p.name)}`
}
