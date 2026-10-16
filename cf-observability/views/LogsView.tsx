// Workers Observability：最近事件 / 只看错误 / 全文搜索 / 按字段分组 Top；点按事件查看详情
import {
  Button,
  HStack,
  Image,
  List,
  NavigationLink,
  Section,
  Spacer,
  Text,
  TextField,
  useEffect,
  useState,
  VStack,
} from "scripting"
import { telemetryQuery } from "../lib/cfApi"
import {
  buildEventsBody,
  buildTopBody,
  formatClock,
  formatCount,
  formatMs,
  formatPercent,
  GROUP_KEYS,
  levelTone,
  parseEvents,
  parseTop,
  prettyJson,
  ratio,
  type LogEvent,
  type Project,
  type TopRow,
} from "../lib/cfCore"
import type { Settings } from "../lib/settings"
import { BARE_ROW, ChipBar, EmptyState, IconBadge, InfoRow, LIST_STYLE, Tag } from "../components/Kit"
import { GradientBar } from "../components/GradientBar"
import { TONES } from "../lib/theme"

type Mode = "events" | "errors" | "top"
type Span = "15m" | "1h" | "24h" | "7d"

const SPANS: { id: Span; title: string; ms: number }[] = [
  { id: "15m", title: "15 分钟", ms: 15 * 60_000 },
  { id: "1h", title: "1 小时", ms: 3_600_000 },
  { id: "24h", title: "24 小时", ms: 86_400_000 },
  // Workers Logs 保留 7 天
  { id: "7d", title: "7 天", ms: 7 * 86_400_000 },
]

const MODES: { id: Mode; title: string; icon: string }[] = [
  { id: "events", title: "事件", icon: "list.bullet" },
  { id: "errors", title: "错误", icon: "exclamationmark.triangle" },
  { id: "top", title: "Top", icon: "chart.bar" },
]

const TOP_COLORS = ["#F6821F", "#E5571F"]

function hintFor(error: string): string | null {
  if (/10000|10001|403|权限|unauthorized|not authorized/i.test(error)) {
    return "令牌需要 Account / Workers Observability / Write 权限（该接口只接受 Write，脚本仅执行查询）。"
  }
  return null
}

export function LogsView({ project, settings, token }: { project: Project; settings: Settings; token: string }) {
  const [mode, setMode] = useState<Mode>("events")
  const [span, setSpan] = useState<Span>("1h")
  const [group, setGroup] = useState<string>("path")
  const [search, setSearch] = useState("")
  const [submitted, setSubmitted] = useState("")
  const [events, setEvents] = useState<LogEvent[] | null>(null)
  const [eventCount, setEventCount] = useState(0)
  const [top, setTop] = useState<TopRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    const to = Date.now()
    const from = to - (SPANS.find((s) => s.id === span)?.ms ?? 3_600_000)
    try {
      if (mode === "top") {
        const g = GROUP_KEYS.find((k) => k.id === group) ?? GROUP_KEYS[0]
        setTop(parseTop(await telemetryQuery(token, settings.accountId, buildTopBody({ service: project.scriptName, from, to, group: g }))))
      } else {
        const r = parseEvents(
          await telemetryQuery(
            token,
            settings.accountId,
            buildEventsBody({ service: project.scriptName, from, to, errorsOnly: mode === "errors", search: submitted, limit: 100 })
          )
        )
        setEvents(r.events)
        setEventCount(r.count)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line
  }, [mode, span, group, submitted])

  const topTotal = (top ?? []).reduce((a, r) => a + r.count, 0)
  const hint = error ? hintFor(error) : null

  return (
    <List
      {...LIST_STYLE}
      navigationTitle="日志与事件"
      refreshable={load}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <Section>
        <VStack {...BARE_ROW} spacing={10}>
          <ChipBar items={MODES} value={mode} onChange={setMode} />
          <ChipBar items={SPANS} value={span} onChange={setSpan} />
          {mode === "top" ? (
            <ChipBar items={GROUP_KEYS.map((k) => ({ id: k.id, title: k.title }))} value={group} onChange={setGroup} />
          ) : null}
        </VStack>
      </Section>

      {mode !== "top" ? (
        <Section>
          <HStack spacing={8}>
            <Image systemName="magnifyingglass" font={14} foregroundStyle="tertiaryLabel" />
            <TextField
              title="搜索"
              value={search}
              onChanged={setSearch}
              onSubmit={() => setSubmitted(search.trim())}
              prompt="全文搜索（回车执行）"
            />
            {submitted ? (
              <Image
                systemName="xmark.circle.fill"
                font={15}
                foregroundStyle="tertiaryLabel"
                onTapGesture={() => {
                  setSearch("")
                  setSubmitted("")
                }}
              />
            ) : null}
          </HStack>
        </Section>
      ) : null}

      {error ? (
        <Section footer={hint ? <Text font={13}>{hint}</Text> : undefined}>
          <HStack spacing={10}>
            <IconBadge icon="exclamationmark.triangle.fill" tone="red" />
            <Text font={13} foregroundStyle={TONES.red.fg}>{error}</Text>
          </HStack>
        </Section>
      ) : mode === "top" ? (
        <Section
          header={<Text>{`按${GROUP_KEYS.find((k) => k.id === group)?.title ?? ""}分组`}</Text>}
          footer={<Text font={13}>统计 Workers Logs 中的调用事件；采样率低于 100% 时为近似值。</Text>}
        >
          {top === null ? (
            <EmptyState icon="hourglass" title="加载中…" />
          ) : top.length === 0 ? (
            <EmptyState icon="tray" title="没有数据" message="该时段没有日志，或 Worker 未开启 observability" />
          ) : (
            top.map((r, i) => (
              <GradientBar
                key={`${r.label}-${i}`}
                rank={i + 1}
                label={r.label}
                valueText={`${formatCount(r.count)} · ${formatPercent(ratio(r.count, topTotal))}`}
                ratio={ratio(r.count, top[0].count)}
                colors={TOP_COLORS}
              />
            ))
          )}
        </Section>
      ) : (
        <Section
          header={<Text>{events ? `${formatCount(eventCount)} 条${mode === "errors" ? "错误" : "事件"}${loading ? " · 刷新中…" : ""}` : "事件"}</Text>}
          footer={
            <Text font={13}>
              没有日志时，请在 Wrangler 配置中开启 observability.enabled = true（或在控制台 Worker 设置中启用 Workers Logs）后重新部署。日志保留 7 天。
            </Text>
          }
        >
          {events === null ? (
            <EmptyState icon="hourglass" title="加载中…" />
          ) : events.length === 0 ? (
            <EmptyState icon="tray" title={mode === "errors" ? "没有错误" : "没有事件"} />
          ) : (
            events.map((e) => (
              <NavigationLink key={e.id} destination={<EventDetailView event={e} />}>
                <EventRow event={e} />
              </NavigationLink>
            ))
          )}
        </Section>
      )}
    </List>
  )
}

function EventRow({ event: e }: { event: LogEvent }) {
  const tone = levelTone(e.level, e.outcome)
  const title = e.method && e.path ? `${e.method} ${e.path}` : e.message || e.trigger || "事件"
  const detail = e.error ?? (e.method && e.path ? (e.message !== `${e.method} ${e.url}` ? e.message : "") : "")
  return (
    <VStack alignment="leading" spacing={4} padding={{ vertical: 3 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack spacing={6}>
        <Tag text={e.level.toUpperCase()} tone={tone} mono />
        {e.statusCode != null ? <Tag text={String(e.statusCode)} tone={e.statusCode >= 500 ? "red" : e.statusCode >= 400 ? "orange" : "green"} mono /> : null}
        {e.outcome && e.outcome !== "ok" ? <Tag text={e.outcome} tone="red" mono /> : null}
        <Spacer />
        <Text font={11} fontDesign="rounded" monospacedDigit foregroundStyle="secondaryLabel">{formatClock(e.time)}</Text>
      </HStack>
      <Text font={14} fontWeight="medium" fontDesign="monospaced" lineLimit={1}>{title}</Text>
      {detail ? (
        <Text font={12} foregroundStyle={tone === "red" ? TONES.red.fg : "secondaryLabel"} lineLimit={2}>{detail}</Text>
      ) : null}
      {e.cpuMs != null || e.wallMs != null ? (
        <Text font={11} fontDesign="rounded" monospacedDigit foregroundStyle="tertiaryLabel">
          {[e.cpuMs != null ? `CPU ${formatMs(e.cpuMs)}` : "", e.wallMs != null ? `Wall ${formatMs(e.wallMs)}` : "", e.country ?? ""]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      ) : null}
    </VStack>
  )
}

function EventDetailView({ event: e }: { event: LogEvent }) {
  const json = prettyJson(e.raw)
  const [copied, setCopied] = useState(false)
  return (
    <List {...LIST_STYLE} navigationTitle="事件详情" navigationBarTitleDisplayMode="inline">
      <Section>
        <InfoRow label="时间" value={new Date(e.time).toLocaleString()} />
        <InfoRow label="级别" value={e.level} />
        <InfoRow label="结果" value={e.outcome} />
        <InfoRow label="状态码" value={e.statusCode != null ? String(e.statusCode) : null} />
        <InfoRow label="方法" value={e.method} />
        <InfoRow label="URL" value={e.url} selectable mono />
        <InfoRow label="CPU" value={e.cpuMs != null ? formatMs(e.cpuMs) : null} />
        <InfoRow label="Wall" value={e.wallMs != null ? formatMs(e.wallMs) : null} />
        <InfoRow label="国家" value={e.country} />
        <InfoRow label="触发" value={e.trigger} />
        <InfoRow label="Request ID" value={e.requestId} selectable mono />
      </Section>
      {e.message || e.error ? (
        <Section header={<Text>消息</Text>}>
          {e.message ? <Text font={13} fontDesign="monospaced">{e.message}</Text> : null}
          {e.error ? <Text font={13} fontDesign="monospaced" foregroundStyle={TONES.red.fg}>{e.error}</Text> : null}
        </Section>
      ) : null}
      <Section
        header={<Text>原始事件</Text>}
        footer={<Text font={13}>{copied ? "已复制到剪贴板。" : "Workers Observability 返回的完整 JSON。"}</Text>}
      >
        <Text font={11} fontDesign="monospaced">{json}</Text>
        <Button
          title="复制 JSON"
          systemImage="doc.on.doc"
          action={() => {
            void Pasteboard.setString(json).then(() => setCopied(true))
          }}
        />
      </Section>
    </List>
  )
}
