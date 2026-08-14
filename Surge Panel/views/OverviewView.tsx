// 总览 Tab
import {
  AreaChart,
  Button,
  Chart,
  gradient,
  HStack,
  Image,
  LineChart,
  Navigation,
  ScrollView,
  Spacer,
  Text,
  useState,
  VStack,
} from "scripting"
import { StatCard } from "../components/StatCard"
import { useStore, type HistoryPoint } from "../lib/store"
import {
  buildInfo,
  formatBytes,
  formatClock,
  formatSpeed,
  formatUptime,
  gaugeValue,
} from "../lib/metrics"
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

export function OverviewView() {
  const state = useStore()
  const [showDiag, setShowDiag] = useState(false)

  const mem = state.samples ? gaugeValue(state.samples, "surge_memory_bytes") : null
  const uptime = state.samples ? gaugeValue(state.samples, "surge_uptime_seconds") : null
  const active = state.samples ? gaugeValue(state.samples, "surge_active_requests") : null
  const dns = state.samples ? gaugeValue(state.samples, "surge_dns_cache_entries") : null
  const bans = state.samples ? gaugeValue(state.samples, "surge_active_bans") : null
  const info = state.samples ? buildInfo(state.samples) : null
  // 历史峰值速度
  const peakIn = state.history.reduce((m, p) => Math.max(m, p.inSpeed), 0)
  const peakOut = state.history.reduce((m, p) => Math.max(m, p.outSpeed), 0)

  const chartPts = downsample(state.history, 60)
  const marks = chartPts.map((p) => ({
    label: new Date(p.t),
    value: Math.round((p.mem / (1024 * 1024)) * 10) / 10,
    interpolationMethod: "catmullRom" as const,
    foregroundStyle: gradient("linear", {
      colors: ["rgba(88,86,214,0.35)", "rgba(88,86,214,0.02)"],
      startPoint: "top" as const,
      endPoint: "bottom" as const,
    }),
  }))

  // 实时速率双线（KB/s）：foregroundStyleBy 是官方的多序列写法；
  // 两个 LineChart 子组件会被串成一条折线（实测出现连接线伪影），必须用单 LineChart + 序列编码
  const latestT = state.history.length ? state.history[state.history.length - 1].t : 0
  const speedWindow = state.history.filter((p) => p.t >= latestT - 15 * 60 * 1000)
  const speedPts = downsample(speedWindow, 60)
  const speedMarks = speedPts.flatMap((p) => [
    {
      label: new Date(p.t),
      value: Math.round((p.inSpeed ?? 0) / 102.4) / 10,
      interpolationMethod: "catmullRom" as const,
      foregroundStyleBy: { value: "下载", label: "下载" },
    },
    {
      label: new Date(p.t),
      value: Math.round((p.outSpeed ?? 0) / 102.4) / 10,
      interpolationMethod: "catmullRom" as const,
      foregroundStyleBy: { value: "上传", label: "上传" },
    },
  ])

  return (
    <ScrollView
      axes="vertical"
      sheet={{
        isPresented: showDiag,
        onChanged: setShowDiag,
        content: <MemoryDiagView />,
      }}
    >
      <VStack alignment="leading" spacing={14} padding={16}>
        {/* 头部 */}
        <HStack>
          <VStack alignment="leading" spacing={2}>
            <HStack spacing={8}>
              <Text font={28} fontWeight="bold">Surge</Text>
              {state.error ? (
                <HStack spacing={4}>
                  <Image systemName="circle.fill" foregroundStyle="systemRed" font={8} />
                  <Text font={12} foregroundStyle="systemRed">连接失败</Text>
                </HStack>
              ) : state.running ? (
                <HStack spacing={4}>
                  <Image systemName="circle.fill" foregroundStyle="systemGreen" font={8} />
                  <Text font={12} foregroundStyle="systemGreen">运行中</Text>
                </HStack>
              ) : (
                <HStack spacing={4}>
                  <Image systemName="circle.fill" foregroundStyle="secondaryLabel" font={8} />
                  <Text font={12} foregroundStyle="secondaryLabel">连接中</Text>
                </HStack>
              )}
            </HStack>
            <Text font={12} foregroundStyle="secondaryLabel">
              {state.updatedAt ? `更新于 ${formatClock(state.updatedAt)}` : "正在连接…"}
            </Text>
          </VStack>
          <Spacer />
          {info ? (
            <VStack alignment="trailing" spacing={2}>
              <Text font={13} foregroundStyle="secondaryLabel">{`v${info.version}`}</Text>
              <Text font={11} foregroundStyle="tertiaryLabel">{`Build ${info.build}`}</Text>
            </VStack>
          ) : null}
        </HStack>

        {state.error ? (
          <Text font={12} foregroundStyle="systemRed">
            {`连接错误：${state.error}（请到「设置」检查地址与 Key）`}
          </Text>
        ) : null}

        {/* 2×2 卡片 */}
        <VStack spacing={10}>
          <HStack spacing={10}>
            <StatCard
              icon="memorychip.fill"
              iconColor="systemPurple"
              title="内存"
              value={mem !== null ? formatBytes(mem) : "—"}
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
          <HStack spacing={10}>
            <StatCard
              icon="arrow.down.circle.fill"
              iconColor="systemBlue"
              title="实时下载"
              value={state.running ? formatSpeed(state.speeds.inSpeed) : "—"}
              subtitle={peakIn > 0 ? `峰值 ${formatSpeed(peakIn)}` : "全部网络接口"}
            />
            <StatCard
              icon="arrow.up.circle.fill"
              iconColor="systemGreen"
              title="实时上传"
              value={state.running ? formatSpeed(state.speeds.outSpeed) : "—"}
              subtitle={peakOut > 0 ? `峰值 ${formatSpeed(peakOut)}` : "全部网络接口"}
            />
          </HStack>
          <HStack spacing={10}>
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
              subtitle="缓存条目"
            />
          </HStack>
        </VStack>

        {/* 实时速率曲线（上传/下载） */}
        <VStack
          alignment="leading"
          spacing={10}
          padding={14}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
          background={{ style: "rgba(128,128,128,0.14)", shape: { type: "rect", cornerRadius: 16, style: "continuous" } }}
        >
          <HStack>
            <Text font={15} fontWeight="semibold">实时速率</Text>
            <Spacer />
            <Text font={11} foregroundStyle="secondaryLabel">KB/s · 近 15 分钟</Text>
          </HStack>
          {speedMarks.length >= 4 ? (
            <Chart frame={{ height: 150 }}>
              <LineChart marks={speedMarks} />
            </Chart>
          ) : (
            <Text font={13} foregroundStyle="secondaryLabel">采样中，稍后展示速率曲线…</Text>
          )}
        </VStack>

        {/* 内存趋势图 */}
        <VStack
          alignment="leading"
          spacing={10}
          padding={14}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
          background={{ style: "rgba(128,128,128,0.14)", shape: { type: "rect", cornerRadius: 16, style: "continuous" } }}
        >
          <HStack>
            <Text font={15} fontWeight="semibold">内存历史</Text>
            <Spacer />
            <Text font={11} foregroundStyle="secondaryLabel">{`${state.history.length} 个采样点`}</Text>
          </HStack>
          {marks.length >= 2 ? (
            <Chart frame={{ height: 150 }}>
              <AreaChart marks={marks} />
            </Chart>
          ) : (
            <Text font={13} foregroundStyle="secondaryLabel">采样中，稍后展示趋势…</Text>
          )}
        </VStack>

        {/* 引擎健康 */}
        <VStack
          alignment="leading"
          spacing={10}
          padding={14}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
          background={{ style: "rgba(128,128,128,0.14)", shape: { type: "rect", cornerRadius: 16, style: "continuous" } }}
        >
          <Text font={15} fontWeight="semibold">引擎健康</Text>
          <HStack spacing={0}>
            <HealthItem label="DNS 缓存" value={dns !== null ? String(dns) : "—"} />
            <HealthItem label="活动请求" value={active !== null ? String(active) : "—"} />
            <HealthItem label="活动封禁" value={bans !== null ? String(bans) : "—"} />
            <HealthItem label="采样点" value={String(state.history.length)} />
          </HStack>
        </VStack>
      </VStack>
    </ScrollView>
  )
}

function HealthItem({ label, value }: { label: string; value: string }) {
  return (
    <VStack spacing={4} frame={{ maxWidth: "infinity" }}>
      <Text font={18} fontWeight="semibold">{value}</Text>
      <Text font={11} foregroundStyle="secondaryLabel">{label}</Text>
    </VStack>
  )
}
