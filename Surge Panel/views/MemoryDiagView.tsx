// 内存诊断 sheet
import {
  AreaChart,
  Chart,
  gradient,
  HStack,
  Image,
  LineChart,
  Text,
  useEffect,
  useState,
  VStack,
  ScrollView,
  NavigationStack,
} from "scripting"
import { getEvents, type SurgeEvent } from "../lib/surgeApi"
import { analyzeMemoryTrend, useStore } from "../lib/store"
import { formatBytes, formatEventTime, gaugeValue } from "../lib/metrics"
import { downsample } from "./OverviewView"

export function MemoryDiagView() {
  const state = useStore()
  const [events, setEvents] = useState<SurgeEvent[] | null>(null)
  const [eventsError, setEventsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getEvents(state.config)
      .then((r) => {
        if (!cancelled) setEvents(r.events.slice().reverse())
      })
      .catch((e) => {
        if (!cancelled) setEventsError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const trend = analyzeMemoryTrend(state.history)
  const mem = state.samples ? gaugeValue(state.samples, "surge_memory_bytes") : null
  const active = state.samples ? gaugeValue(state.samples, "surge_active_requests") : null
  const dns = state.samples ? gaugeValue(state.samples, "surge_dns_cache_entries") : null
  const bans = state.samples ? gaugeValue(state.samples, "surge_active_bans") : null

  const pts = downsample(state.history, 80)
  const marks = pts.map((p) => ({
    label: new Date(p.t),
    value: Math.round((p.mem / (1024 * 1024)) * 10) / 10,
    interpolationMethod: "catmullRom" as const,
  }))

  return (
    <NavigationStack>
      <ScrollView axes="vertical" navigationTitle="内存诊断">
        <VStack alignment="leading" spacing={14} padding={16}>
          {/* 大图 */}
          <VStack
            alignment="leading"
            spacing={8}
            padding={14}
            background={{ style: "rgba(128,128,128,0.14)", shape: { type: "rect", cornerRadius: 16, style: "continuous" } }}
          >
            <HStack>
              <Text font={15} fontWeight="semibold">内存占用历史</Text>
            </HStack>
            {marks.length >= 2 ? (
              <Chart frame={{ height: 180 }}>
                <LineChart marks={marks.map((m) => ({ ...m, foregroundStyle: "systemPurple" as const }))} />
                <AreaChart
                  marks={marks.map((m) => ({
                    ...m,
                    foregroundStyle: gradient("linear", {
                      colors: ["rgba(88,86,214,0.30)", "rgba(88,86,214,0.02)"],
                      startPoint: "top" as const,
                      endPoint: "bottom" as const,
                    }),
                  }))}
                />
              </Chart>
            ) : (
              <Text font={13} foregroundStyle="secondaryLabel">采样数据不足…</Text>
            )}
          </VStack>

          {/* 关联指标 */}
          <VStack
            alignment="leading"
            spacing={10}
            padding={14}
            background={{ style: "rgba(128,128,128,0.14)", shape: { type: "rect", cornerRadius: 16, style: "continuous" } }}
          >
            <Text font={15} fontWeight="semibold">关联指标</Text>
            <HStack spacing={0}>
              <DiagItem label="当前内存" value={mem !== null ? formatBytes(mem) : "—"} />
              <DiagItem label="内存峰值" value={trend.peakMB > 0 ? `${trend.peakMB.toFixed(0)} MB` : "—"} />
              <DiagItem label="活动请求" value={active !== null ? String(active) : "—"} />
            </HStack>
            <HStack spacing={0}>
              <DiagItem label="DNS 缓存" value={dns !== null ? String(dns) : "—"} />
              <DiagItem label="活动封禁" value={bans !== null ? String(bans) : "—"} />
              <DiagItem label="采样点" value={String(state.history.length)} />
            </HStack>
          </VStack>

          {/* 判断建议 */}
          <VStack
            alignment="leading"
            spacing={8}
            padding={14}
            background={{ style: "rgba(128,128,128,0.14)", shape: { type: "rect", cornerRadius: 16, style: "continuous" } }}
          >
            <HStack spacing={6}>
              <Image
                systemName={trend.level === "warning" ? "exclamationmark.triangle.fill" : "checkmark.seal.fill"}
                foregroundStyle={trend.level === "warning" ? "systemOrange" : "systemGreen"}
              />
              <Text font={15} fontWeight="semibold">
                {trend.level === "warning" ? "检测到异常趋势" : trend.level === "ok" ? "运行正常" : "数据不足"}
              </Text>
            </HStack>
            <Text font={13} foregroundStyle="secondaryLabel">{trend.message}</Text>
          </VStack>

          {/* 事件中心 */}
          <VStack
            alignment="leading"
            spacing={8}
            padding={14}
            background={{ style: "rgba(128,128,128,0.14)", shape: { type: "rect", cornerRadius: 16, style: "continuous" } }}
          >
            <Text font={15} fontWeight="semibold">事件中心</Text>
            {eventsError ? (
              <Text font={13} foregroundStyle="systemRed">{eventsError}</Text>
            ) : events === null ? (
              <Text font={13} foregroundStyle="secondaryLabel">加载中…</Text>
            ) : events.length === 0 ? (
              <Text font={13} foregroundStyle="secondaryLabel">暂无事件</Text>
            ) : (
              events.slice(0, 20).map((e) => (
                <VStack key={e.identifier} alignment="leading" spacing={2}>
                  <Text font={13} lineLimit={3}>{e.content ?? e.identifier}</Text>
                  <Text font={11} foregroundStyle="tertiaryLabel">
                    {formatEventTime(e.date)}
                  </Text>
                </VStack>
              ))
            )}
          </VStack>
        </VStack>
      </ScrollView>
    </NavigationStack>
  )
}

function DiagItem({ label, value }: { label: string; value: string }) {
  return (
    <VStack spacing={4} frame={{ maxWidth: "infinity" }}>
      <Text font={17} fontWeight="semibold">{value}</Text>
      <Text font={11} foregroundStyle="secondaryLabel">{label}</Text>
    </VStack>
  )
}
