// 桌面 / 锁屏小组件：选定 Worker / Pages 项目的限额使用（Free 每日 / Paid 每周期），每 15 分钟刷新；失败时回退最近一次缓存
import {
  BarChart,
  Chart,
  Gauge,
  HStack,
  Image,
  RoundedRectangle,
  Spacer,
  Text,
  VStack,
  Widget,
  ZStack,
  type Color,
} from "scripting"
import {
  countParts,
  cpuPerInvocationLimitMs,
  fillSeries,
  formatClock,
  formatCount,
  formatCountdown,
  formatMs,
  formatPercent,
  formatUSD,
  isBadStatus,
  planLabel,
  statusLabel,
  usToMs,
  type Project,
  type QuotaSummary,
} from "./lib/cfCore"
import { getToken, isConfigured, loadSettings, resolveProject } from "./lib/settings"
import { fetchWidgetData, loadWidgetCache, snapshotSummary, type WidgetData } from "./lib/usage"
import { TONES, usageTone } from "./lib/theme"

const REFRESH_MS = 15 * 60_000
const ORANGE: Color = "#F6821F"
const BG = { light: "#FFFFFF", dark: "#1C1C1E" } as const
const TRACK: Color = "rgba(142,142,147,0.22)"

type Model = {
  data: WidgetData | null
  project: Project | null
  error: string | null
  configured: boolean
}

function displayWidth(): number {
  const w = Widget.displaySize?.width
  return typeof w === "number" && w > 0 ? w : 170
}

function Bar({ ratio, width, height = 8 }: { ratio: number; width: number; height?: number }) {
  const pct = Math.max(0, Math.min(1, ratio))
  const fg = TONES[usageTone(ratio)].fg
  return (
    <ZStack alignment="leading" frame={{ width, height }}>
      <RoundedRectangle cornerRadius={height / 2} style="continuous" fill={TRACK} />
      {pct > 0 ? (
        <RoundedRectangle
          cornerRadius={height / 2}
          style="continuous"
          fill={fg}
          frame={{ width: Math.max(height, width * pct), height }}
          widgetAccentable
        />
      ) : null}
    </ZStack>
  )
}

function Header({ project, compact }: { project: Project | null; compact?: boolean }) {
  return (
    <HStack spacing={5}>
      <Image systemName={project?.kind === "pages" ? "doc.richtext.fill" : "bolt.fill"} font={compact ? 11 : 12} foregroundStyle={ORANGE} widgetAccentable />
      <Text font={compact ? 12 : 13} fontWeight="semibold" lineLimit={1} minScaleFactor={0.7}>
        {project?.name ?? "账户总用量"}
      </Text>
    </HStack>
  )
}

function Footer({ m, q }: { m: Model; q: QuotaSummary }) {
  const stale = m.error != null
  return (
    <Text font={10} foregroundStyle={stale ? TONES.orange.fg : "secondaryLabel"} lineLimit={1} minScaleFactor={0.7}>
      {stale
        ? `缓存 ${formatClock(m.data?.fetchedAt ?? 0)} · 刷新失败`
        : `${formatCountdown(q.resetAt - Date.now())}后重置 · ${formatClock(m.data?.fetchedAt ?? Date.now())}`}
    </Text>
  )
}

function Message({ icon, title, detail }: { icon: string; title: string; detail?: string }) {
  return (
    <VStack spacing={6} padding={12} widgetBackground={BG} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <Image systemName={icon} font={22} foregroundStyle={ORANGE} />
      <Text font={13} fontWeight="semibold" multilineTextAlignment="center">{title}</Text>
      {detail ? (
        <Text font={10} foregroundStyle="secondaryLabel" multilineTextAlignment="center" lineLimit={4}>{detail}</Text>
      ) : null}
    </VStack>
  )
}

/** 账户限额块：请求量、进度条、百分比 */
function QuotaBlock({ q, width, big }: { q: QuotaSummary; width: number; big?: boolean }) {
  const req = countParts(q.requests)
  return (
    <VStack alignment="leading" spacing={5}>
      <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>
        {q.plan === "free" ? "账户今日请求" : "本周期请求"}
      </Text>
      <HStack alignment="lastTextBaseline" spacing={2}>
        <Text font={big ? 30 : 26} fontWeight="bold" fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.5}>
          {req.value}
        </Text>
        <Text font={12} fontWeight="medium" fontDesign="rounded" foregroundStyle="secondaryLabel">{req.unit}</Text>
        <Spacer />
        <Text font={13} fontWeight="bold" fontDesign="rounded" monospacedDigit foregroundStyle={TONES[usageTone(q.requestRatio)].fg} widgetAccentable>
          {formatPercent(q.requestRatio)}
        </Text>
      </HStack>
      <Bar ratio={q.requestRatio} width={width} />
      <Text font={10} fontDesign="rounded" monospacedDigit foregroundStyle="secondaryLabel" lineLimit={1}>
        {`上限 ${formatCount(q.requestLimit)} · ${planLabel(q.plan)}`}
      </Text>
    </VStack>
  )
}

function StatLine({ icon, label, value, tone }: { icon: string; label: string; value: string; tone?: Color }) {
  return (
    <HStack spacing={5}>
      <Image systemName={icon} font={10} foregroundStyle={tone ?? "secondaryLabel"} frame={{ width: 14 }} />
      <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>{label}</Text>
      <Spacer />
      <Text font={12} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={tone} lineLimit={1} minScaleFactor={0.6}>
        {value}
      </Text>
    </HStack>
  )
}

function ProjectStats({ m, q }: { m: Model; q: QuotaSummary }) {
  const d = m.data?.last24h
  const plan = q.plan
  const cpuP99 = usToMs(d?.cpuP99Us)
  const limit = cpuPerInvocationLimitMs(plan)
  const exceeded = d?.statuses?.find((s) => s.status === "exceededCpu")?.requests ?? 0
  const errs = d?.totals.errors ?? q.project?.errors ?? 0
  return (
    <VStack alignment="leading" spacing={6}>
      <StatLine icon="chart.pie.fill" label="项目占比" value={q.project ? formatPercent(q.project.share) : "—"} tone={ORANGE} />
      <StatLine icon="arrow.up.arrow.down" label={plan === "free" ? "今日请求" : "周期请求"} value={formatCount(q.project?.requests ?? null)} />
      <StatLine icon="xmark.octagon.fill" label="24h 错误" value={formatCount(errs)} tone={errs > 0 ? TONES.red.fg : undefined} />
      {plan === "free" ? (
        <StatLine
          icon="cpu"
          label="CPU P99"
          value={cpuP99 == null ? "—" : `${formatMs(cpuP99)} / ${formatMs(limit)}`}
          tone={cpuP99 != null && cpuP99 > limit * 0.8 ? TONES.red.fg : undefined}
        />
      ) : (
        <StatLine
          icon="cpu"
          label="CPU 周期"
          value={q.cpuMs == null ? "—" : `${formatPercent(q.cpuRatio)}`}
          tone={q.cpuRatio != null ? TONES[usageTone(q.cpuRatio)].fg : undefined}
        />
      )}
      {exceeded > 0 ? <StatLine icon="exclamationmark.triangle.fill" label="超 CPU" value={formatCount(exceeded)} tone={TONES.red.fg} /> : null}
      {plan === "paid" && q.overage && q.overage.totalUSD > 0 ? (
        <StatLine icon="dollarsign.circle.fill" label="超额估算" value={formatUSD(q.overage.totalUSD)} tone={TONES.orange.fg} />
      ) : null}
    </VStack>
  )
}

function SmallView({ m, q }: { m: Model; q: QuotaSummary }) {
  const w = displayWidth() - 28
  return (
    <VStack alignment="leading" spacing={6} padding={14} widgetBackground={BG} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
      <Header project={m.project} compact />
      <Spacer />
      <QuotaBlock q={q} width={w} />
      {q.project ? (
        <Text font={10} fontDesign="rounded" monospacedDigit foregroundStyle={ORANGE} lineLimit={1}>
          {`本项目 ${formatCount(q.project.requests)} · ${formatPercent(q.project.share)}`}
        </Text>
      ) : null}
      <Footer m={m} q={q} />
    </VStack>
  )
}

function MediumView({ m, q }: { m: Model; q: QuotaSummary }) {
  const col = (displayWidth() - 28 - 16) / 2
  return (
    <VStack alignment="leading" spacing={8} padding={14} widgetBackground={BG} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
      <HStack>
        <Header project={m.project} />
        <Spacer />
        <Text font={10} fontWeight="semibold" foregroundStyle={ORANGE}>Cloudflare</Text>
      </HStack>
      <HStack alignment="top" spacing={16}>
        <VStack alignment="leading" frame={{ width: col }}>
          <QuotaBlock q={q} width={col} />
        </VStack>
        <VStack alignment="leading" frame={{ width: col }}>
          <ProjectStats m={m} q={q} />
        </VStack>
      </HStack>
      <Spacer />
      <Footer m={m} q={q} />
    </VStack>
  )
}

function LargeView({ m, q }: { m: Model; q: QuotaSummary }) {
  const w = displayWidth() - 32
  const col = (w - 16) / 2
  const d = m.data?.last24h
  const now = Date.now()
  const series = d ? fillSeries(d.series, new Date(now - 86_400_000), new Date(now), 3_600_000) : []
  const statuses = (d?.statuses ?? []).slice(0, 3)
  const statusTotal = statuses.reduce((a, s) => a + s.requests, 0)
  return (
    <VStack alignment="leading" spacing={10} padding={16} widgetBackground={BG} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
      <HStack>
        <Header project={m.project} />
        <Spacer />
        <Text font={10} fontWeight="semibold" foregroundStyle={ORANGE}>Cloudflare</Text>
      </HStack>
      <HStack alignment="top" spacing={16}>
        <VStack alignment="leading" frame={{ width: col }}>
          <QuotaBlock q={q} width={col} big />
        </VStack>
        <VStack alignment="leading" frame={{ width: col }}>
          <ProjectStats m={m} q={q} />
        </VStack>
      </HStack>
      {series.length >= 2 ? (
        <VStack alignment="leading" spacing={4}>
          <Text font={11} foregroundStyle="secondaryLabel">近 24 小时请求</Text>
          <Chart frame={{ height: 90 }} chartLegend="hidden" chartYAxis="hidden">
            <BarChart
              marks={series.map((p) => ({
                label: new Date(p.t),
                value: p.requests,
                unit: "hour" as const,
                foregroundStyle: ORANGE,
                cornerRadius: 2,
              }))}
            />
          </Chart>
        </VStack>
      ) : null}
      {statuses.length > 0 ? (
        <HStack spacing={10}>
          {statuses.map((s) => (
            <VStack key={s.status} alignment="leading" spacing={1} frame={{ maxWidth: "infinity", alignment: "leading" }}>
              <Text font={10} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.7}>{statusLabel(s.status)}</Text>
              <Text font={13} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={isBadStatus(s.status) ? TONES.red.fg : undefined}>
                {formatPercent(statusTotal > 0 ? s.requests / statusTotal : 0)}
              </Text>
            </VStack>
          ))}
        </HStack>
      ) : null}
      <Spacer />
      <Footer m={m} q={q} />
    </VStack>
  )
}

function CircularView({ q }: { q: QuotaSummary }) {
  return (
    <Gauge
      value={Math.min(1, q.requestRatio)}
      min={0}
      max={1}
      label={<Image systemName="cloud.fill" />}
      currentValueLabel={<Text font={12} fontWeight="bold" fontDesign="rounded" monospacedDigit>{formatPercent(q.requestRatio).replace("%", "")}</Text>}
      gaugeStyle="accessoryCircularCapacity"
    />
  )
}

function RectangularView({ m, q }: { m: Model; q: QuotaSummary }) {
  return (
    <VStack alignment="leading" spacing={2}>
      <HStack spacing={4}>
        <Image systemName="cloud.fill" font={11} />
        <Text font={12} fontWeight="semibold" lineLimit={1}>{m.project?.name ?? "Cloudflare"}</Text>
      </HStack>
      <Text font={12} fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.7}>
        {`${formatPercent(q.requestRatio)} · ${formatCount(q.requests)} / ${formatCount(q.requestLimit)}`}
      </Text>
      <Gauge value={Math.min(1, q.requestRatio)} min={0} max={1} label={<Text>请求</Text>} gaugeStyle="accessoryLinearCapacity" />
    </VStack>
  )
}

function WidgetView({ m }: { m: Model }) {
  const family = Widget.family as string
  const accessory = family === "accessoryCircular" || family === "accessoryRectangular" || family === "accessoryInline"
  if (!m.configured) {
    return accessory ? <Text font={12}>未配置</Text> : <Message icon="key.fill" title="未配置 API 令牌" detail="打开「Cloudflare 观测」脚本，在设置中填写令牌与 Account ID" />
  }
  if (!m.data) {
    return accessory ? <Text font={12}>加载失败</Text> : <Message icon="exclamationmark.triangle.fill" title="加载失败" detail={m.error ?? undefined} />
  }
  const q = snapshotSummary(m.data.snapshot, m.project)
  if (family === "accessoryCircular") return <CircularView q={q} />
  if (family === "accessoryRectangular") return <RectangularView m={m} q={q} />
  if (family === "accessoryInline") return <Text>{`CF ${formatPercent(q.requestRatio)} · ${formatCount(q.requests)}`}</Text>
  if (family === "systemMedium") return <MediumView m={m} q={q} />
  if (family === "systemLarge" || family === "systemExtraLarge") return <LargeView m={m} q={q} />
  return <SmallView m={m} q={q} />
}

async function run() {
  const settings = loadSettings()
  const token = getToken()
  const project = resolveProject(Widget.parameter, settings.widgetProject)
  const m: Model = { data: null, project, error: null, configured: isConfigured(settings, token) }
  if (m.configured) {
    try {
      m.data = await fetchWidgetData(token, settings, project)
    } catch (e) {
      m.error = e instanceof Error ? e.message : String(e)
      m.data = loadWidgetCache(project)
    }
  }
  Widget.present(<WidgetView m={m} />, { policy: "after", date: new Date(Date.now() + REFRESH_MS) })
}

run()
