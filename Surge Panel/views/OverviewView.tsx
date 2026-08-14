// 总览 Tab
import {
  AreaChart,
  Button,
  Chart,
  gradient,
  HStack,
  Image,
  LineChart,
  Picker,
  Script,
  ScrollView,
  Spacer,
  Text,
  useEffect,
  useState,
  VStack,
} from "scripting"
import { PanelCard } from "../components/PanelCard"
import { StatCard } from "../components/StatCard"
import { openRequestsSegment, useStore, type HistoryPoint } from "../lib/store"
import {
  getEvents,
  getOutboundMode,
  setOutboundMode,
  type SurgeEvent,
} from "../lib/surgeApi"
import {
  buildInfo,
  formatBytesParts,
  formatClock,
  formatEventTime,
  formatSpeedParts,
  formatUptime,
  gaugeValue,
} from "../lib/metrics"
import { connectErrorText, UI, cardBackground } from "../lib/ui"
import { MemoryDiagView } from "./MemoryDiagView"

/** 图表降采样到最多 n 个点 */
export function downsample(pts: HistoryPoint[], n: number): HistoryPoint[] {
  if (pts.length <= n) return pts
  const step = pts.length / n
  const out: HistoryPoint[] = []
  for (let i = 0; i < n; i++) out.push(pts[Math.floor(i * step)])
  out.push(pts[pts.length - 1])
  return out
}

/** bytes/s → KB/s，一位小数 */
function toKbps(bytesPerSec: number): number {
  return Math.round((bytesPerSec ?? 0) / 102.4) / 10
}

/** Y 轴上界：1/2/5×10^n，并留约 15% 余量。速率不能为负，下界固定 0。 */
function niceUpper(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 10
  const padded = n * 1.15
  const mag = 10 ** Math.floor(Math.log10(padded))
  const norm = padded / mag
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return nice * mag
}

const LINE_STYLE = { lineWidth: 2.5, lineCap: "round" as const, lineJoin: "round" as const }

export function OverviewView() {
  const state = useStore()
  const [showDiag, setShowDiag] = useState(false)
  const [outbound, setOutbound] = useState<string | null>(null)
  const [outboundError, setOutboundError] = useState<string | null>(null)
  const [events, setEvents] = useState<SurgeEvent[] | null>(null)

  const mem = state.samples ? gaugeValue(state.samples, "surge_memory_bytes") : null
  const uptime = state.samples ? gaugeValue(state.samples, "surge_uptime_seconds") : null
  const active = state.samples ? gaugeValue(state.samples, "surge_active_requests") : null
  const dns = state.samples ? gaugeValue(state.samples, "surge_dns_cache_entries") : null
  const bans = state.samples ? gaugeValue(state.samples, "surge_active_bans") : null
  const info = state.samples ? buildInfo(state.samples) : null
  const peakIn = state.peakSpeeds.inSpeed
  const peakOut = state.peakSpeeds.outSpeed
  const memParts = mem !== null ? formatBytesParts(mem) : null
  const downParts = state.running ? formatSpeedParts(state.speeds.inSpeed) : null
  const upParts = state.running ? formatSpeedParts(state.speeds.outSpeed) : null
  const peakInParts = peakIn > 0 ? formatSpeedParts(peakIn) : null
  const peakOutParts = peakOut > 0 ? formatSpeedParts(peakOut) : null
  const isHome = Script.env === "home_screen"

  useEffect(() => {
    let cancelled = false
    getOutboundMode(state.config)
      .then((r) => {
        if (cancelled) return
        setOutbound(r.mode)
        setOutboundError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setOutbound(null)
        setOutboundError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [state.config])

  useEffect(() => {
    let cancelled = false
    getEvents(state.config)
      .then((r) => {
        if (!cancelled) setEvents(r.events.slice().reverse())
      })
      .catch(() => {
        if (!cancelled) setEvents(null)
      })
    return () => {
      cancelled = true
    }
  }, [state.config, state.samples])

  async function changeOutbound(mode: string) {
    const prev = outbound
    setOutbound(mode)
    try {
      await setOutboundMode(state.config, mode)
      setOutboundError(null)
    } catch (e) {
      setOutbound(prev)
      setOutboundError(String(e))
    }
  }

  const chartPts = downsample(state.history, 60)
  const memValues = chartPts.map((p) => Math.round((p.mem / (1024 * 1024)) * 10) / 10)
  const memYMax = niceUpper(Math.max(0, ...memValues))
  const marks = chartPts.map((p, i) => ({
    label: new Date(p.t),
    value: memValues[i],
    // monotone 保单调、不过冲；catmullRom 会在尖峰前插出负值
    interpolationMethod: "monotone" as const,
    foregroundStyle: gradient("linear", {
      colors: ["rgba(88,86,214,0.35)", "rgba(88,86,214,0.02)"],
      startPoint: "top" as const,
      endPoint: "bottom" as const,
    }),
  }))

  // 实时速率双线（KB/s）：foregroundStyleBy 是官方的多序列写法；
  // 两个 LineChart 子组件会被串成一条折线（实测出现连接线伪影），必须用单 LineChart + 序列编码
  const speedMarks = state.speedHistory.flatMap((p) => [
    {
      label: new Date(p.t),
      value: toKbps(p.inSpeed),
      interpolationMethod: "monotone" as const,
      lineStyle: LINE_STYLE,
      foregroundStyleBy: { value: "下载", label: "下载" },
    },
    {
      label: new Date(p.t),
      value: toKbps(p.outSpeed),
      interpolationMethod: "monotone" as const,
      lineStyle: LINE_STYLE,
      foregroundStyleBy: { value: "上传", label: "上传" },
    },
  ])
  const speedYMax = niceUpper(
    Math.max(0, ...state.speedHistory.flatMap((p) => [toKbps(p.inSpeed), toKbps(p.outSpeed)]))
  )

  const latestEvent = events && events.length > 0 ? events[0] : null

  return (
    <ScrollView
      axes="vertical"
      sheet={{
        isPresented: showDiag,
        onChanged: setShowDiag,
        content: <MemoryDiagView />,
      }}
    >
      <VStack alignment="leading" spacing={UI.pageSpacing} padding={UI.pagePadding}>
        {/* 品牌头（不是页名） */}
        <HStack>
          <VStack alignment="leading" spacing={3}>
            <HStack spacing={8}>
              <Text font={isHome ? 22 : 28} fontWeight="bold">Surge</Text>
              {state.error ? (
                <HStack spacing={4}>
                  <Image systemName="circle.fill" foregroundStyle="systemRed" font={8} />
                  <Text font={13} foregroundStyle="systemRed">连接失败</Text>
                </HStack>
              ) : state.running ? (
                <HStack spacing={4}>
                  <Image systemName="circle.fill" foregroundStyle="systemGreen" font={8} />
                  <Text font={13} foregroundStyle="systemGreen">运行中</Text>
                </HStack>
              ) : (
                <HStack spacing={4}>
                  <Image systemName="circle.fill" foregroundStyle="secondaryLabel" font={8} />
                  <Text font={13} foregroundStyle="secondaryLabel">连接中</Text>
                </HStack>
              )}
            </HStack>
            <Text font={13} foregroundStyle="secondaryLabel">
              {state.updatedAt ? `更新于 ${formatClock(state.updatedAt)}` : "正在连接…"}
            </Text>
          </VStack>
          <Spacer />
          {info ? (
            <VStack alignment="trailing" spacing={2}>
              <Text font={13} foregroundStyle="secondaryLabel">{`v${info.version}`}</Text>
              <Text font={UI.captionFont} foregroundStyle="tertiaryLabel">{`Build ${info.build}`}</Text>
            </VStack>
          ) : null}
        </HStack>

        {state.error ? (
          <Text font={13} foregroundStyle="systemRed">
            {connectErrorText(state.error)}
          </Text>
        ) : null}

        {/* 出站快捷切换 */}
        <PanelCard>
          <HStack>
            <Text font={UI.titleFont} fontWeight="semibold">出站模式</Text>
            <Spacer />
            {outboundError ? (
              <Text font={UI.captionFont} foregroundStyle="systemRed">切换失败</Text>
            ) : null}
          </HStack>
          {outbound === null ? (
            <Text font={13} foregroundStyle="secondaryLabel">
              {outboundError ? connectErrorText(outboundError, "加载失败") : "加载中…"}
            </Text>
          ) : (
            <Picker pickerStyle="segmented" value={outbound} onChanged={changeOutbound}>
              <Text tag="rule">规则</Text>
              <Text tag="proxy">代理</Text>
              <Text tag="direct">直连</Text>
            </Picker>
          )}
        </PanelCard>

        {/* 未处理事件条 */}
        <HStack
          spacing={10}
          padding={UI.cardPadding}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
          background={cardBackground()}
          onTapGesture={() => openRequestsSegment("events")}
        >
          <Image
            systemName={latestEvent ? "bell.fill" : "bell"}
            foregroundStyle={latestEvent ? "systemOrange" : "secondaryLabel"}
            font={16}
          />
          <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            <Text font={UI.titleFont} fontWeight="semibold">
              {events === null ? "事件" : events.length === 0 ? "暂无事件" : `${events.length} 条事件`}
            </Text>
            <Text font={UI.captionFont} foregroundStyle="secondaryLabel" lineLimit={2}>
              {latestEvent
                ? `${formatEventTime(latestEvent.date)} · ${latestEvent.content ?? latestEvent.identifier}`
                : "点按查看事件中心"}
            </Text>
          </VStack>
          <Image systemName="chevron.right" foregroundStyle="tertiaryLabel" font={12} />
        </HStack>

        <VStack spacing={12}>
          <HStack spacing={12}>
            <StatCard
              icon="memorychip.fill"
              iconColor="systemPurple"
              title="内存"
              value={memParts ? memParts.value : "—"}
              unit={memParts?.unit}
              subtitle="长按查看诊断"
              contextMenuItems={
                <Button title="内存诊断" systemImage="stethoscope" action={() => setShowDiag(true)} />
              }
            />
            <StatCard
              icon="clock.fill"
              iconColor="systemGreen"
              title="运行时长"
              value={uptime !== null ? formatUptime(uptime) : "—"}
              subtitle={info ? `Surge ${info.version}` : undefined}
            />
          </HStack>
          <HStack spacing={12}>
            <StatCard
              icon="arrow.down.circle.fill"
              iconColor="systemBlue"
              title="实时下载"
              value={downParts ? downParts.value : "—"}
              unit={downParts?.unit}
              subtitle={peakInParts ? `峰值 ${peakInParts.value} ${peakInParts.unit}` : "全部网络接口"}
            />
            <StatCard
              icon="arrow.up.circle.fill"
              iconColor="systemGreen"
              title="实时上传"
              value={upParts ? upParts.value : "—"}
              unit={upParts?.unit}
              subtitle={peakOutParts ? `峰值 ${peakOutParts.value} ${peakOutParts.unit}` : "全部网络接口"}
            />
          </HStack>
          <HStack spacing={12}>
            <StatCard
              icon="link.circle.fill"
              iconColor="systemOrange"
              title="活动连接"
              value={active !== null ? String(active) : "—"}
              badge={state.failedRecent > 0 ? `近期失败 ${state.failedRecent}` : undefined}
              subtitle="HTTP 请求"
            />
            <StatCard
              icon="server.rack"
              iconColor="systemTeal"
              title="DNS 缓存"
              value={dns !== null ? String(dns) : "—"}
              subtitle={bans !== null ? `活动封禁 ${bans}` : "缓存条目"}
            />
          </HStack>
        </VStack>

        {/* 实时速率曲线（上传/下载） */}
        <PanelCard>
          <HStack>
            <Text font={UI.titleFont} fontWeight="semibold">实时速率</Text>
            <Spacer />
            <Text font={UI.captionFont} foregroundStyle="secondaryLabel">KB/s · 1 秒采样 · 近 1 分钟</Text>
          </HStack>
          {state.traffic && speedMarks.length >= 4 ? (
            <Chart
              frame={{ height: 168 }}
              chartYScale={{ domain: { from: 0, to: speedYMax }, type: "linear" }}
              chartXAxis={{ valueLabel: { format: "time" } }}
              chartLegend={{ position: "bottom", spacing: 6 }}
              chartForegroundStyleScale={{
                "下载": "systemBlue",
                "上传": "systemGreen",
              }}
            >
              <LineChart marks={speedMarks} />
            </Chart>
          ) : (
            <Text font={13} foregroundStyle="secondaryLabel">采样中，稍后展示速率曲线…</Text>
          )}
        </PanelCard>

        {/* 内存趋势图 */}
        <PanelCard>
          <HStack>
            <Text font={UI.titleFont} fontWeight="semibold">内存历史</Text>
            <Spacer />
            <Text font={UI.captionFont} foregroundStyle="secondaryLabel">{`${state.history.length} 个采样点`}</Text>
          </HStack>
          {marks.length >= 2 ? (
            <Chart
              frame={{ height: 150 }}
              chartYScale={{ domain: { from: 0, to: memYMax }, type: "linear" }}
            >
              <AreaChart marks={marks} />
            </Chart>
          ) : (
            <Text font={13} foregroundStyle="secondaryLabel">采样中，稍后展示趋势…</Text>
          )}
        </PanelCard>
      </VStack>
    </ScrollView>
  )
}
