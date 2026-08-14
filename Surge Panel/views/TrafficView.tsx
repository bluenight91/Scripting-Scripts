// 流量 Tab
import {
  HStack,
  Image,
  ScrollView,
  Spacer,
  Text,
  VStack,
  type Color,
} from "scripting"
import { GradientBar } from "../components/GradientBar"
import { HomeTitleWrapper, FullscreenPageTitle } from "../components/HomeTitleWrapper"
import { StatCard } from "../components/StatCard"
import { useStore } from "../lib/store"
import { formatBytes, formatSpeed, formatSpeedParts, seriesByLabel } from "../lib/metrics"

const BAR_COLORS: [Color, Color][] = [
  ["#5E5CE6", "#64D2FF"],
  ["#0A84FF", "#64D2FF"],
  ["#30D158", "#64D2FF"],
  ["#FF9F0A", "#FFD60A"],
  ["#BF5AF2", "#FF375F"],
]

export function TrafficView() {
  const state = useStore()

  const inSeries = state.samples
    ? seriesByLabel(state.samples, "surge_policy_in_bytes_total", "policy")
    : []
  const outSeries = state.samples
    ? seriesByLabel(state.samples, "surge_policy_out_bytes_total", "policy")
    : []
  const prevIn = state.prevSamples
    ? new Map(seriesByLabel(state.prevSamples, "surge_policy_in_bytes_total", "policy").map((s) => [s.label, s.value]))
    : new Map<string, number>()
  const prevOut = state.prevSamples
    ? new Map(seriesByLabel(state.prevSamples, "surge_policy_out_bytes_total", "policy").map((s) => [s.label, s.value]))
    : new Map<string, number>()

  const dt =
    state.samples && state.prevSamples && state.updatedAt
      ? Math.max(1, state.history.length >= 2
          ? (state.history[state.history.length - 1].t - state.history[state.history.length - 2].t) / 1000
          : 5)
      : 0

  // 汇总每个策略
  const names = new Set<string>([...inSeries.map((s) => s.label), ...outSeries.map((s) => s.label)])
  const rows = [...names].map((name) => {
    const inB = inSeries.find((s) => s.label === name)?.value ?? 0
    const outB = outSeries.find((s) => s.label === name)?.value ?? 0
    const pin = prevIn.get(name)
    const pout = prevOut.get(name)
    const inSpeed = dt > 0 && pin !== undefined ? Math.max(0, (inB >= pin ? inB - pin : inB) / dt) : 0
    const outSpeed = dt > 0 && pout !== undefined ? Math.max(0, (outB >= pout ? outB - pout : outB) / dt) : 0
    return { name, inB, outB, total: inB + outB, inSpeed, outSpeed }
  })
  rows.sort((a, b) => b.total - a.total)

  const top = rows.filter((r) => r.total > 0).slice(0, 10)
  const maxTotal = top.length > 0 ? top[0].total : 1

  // 活动中的节点（/v1/traffic 直出实时速度与峰值）
  const activeNodes = state.traffic
    ? Object.entries(state.traffic.connector)
        .filter(([, v]) => v.inCurrentSpeed + v.outCurrentSpeed > 0)
        .sort(
          (a, b) =>
            b[1].inCurrentSpeed + b[1].outCurrentSpeed -
            (a[1].inCurrentSpeed + a[1].outCurrentSpeed)
        )
    : []

  const downParts = state.running ? formatSpeedParts(state.speeds.inSpeed) : null
  const upParts = state.running ? formatSpeedParts(state.speeds.outSpeed) : null

  return (
    <HomeTitleWrapper title="流量">
    <ScrollView axes="vertical">
      <VStack alignment="leading" spacing={16} padding={16}>
        <FullscreenPageTitle title="流量" />

        {/* 实时速率 */}
        <HStack spacing={12}>
          <StatCard
            icon="arrow.down.circle.fill"
            iconColor="systemBlue"
            title="实时下载"
            value={downParts ? downParts.value : "—"}
            unit={downParts?.unit}
            subtitle="全部网络接口"
          />
          <StatCard
            icon="arrow.up.circle.fill"
            iconColor="systemGreen"
            title="实时上传"
            value={upParts ? upParts.value : "—"}
            unit={upParts?.unit}
            subtitle="全部网络接口"
          />
        </HStack>

        {/* 活动中的节点 */}
        <VStack
          alignment="leading"
          spacing={12}
          padding={16}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
          background={{ style: "rgba(128,128,128,0.14)", shape: { type: "rect", cornerRadius: 16, style: "continuous" } }}
        >
          <HStack>
            <Text font={15} fontWeight="semibold">活动中的节点</Text>
            <Spacer />
            <Text font={12} foregroundStyle="secondaryLabel">
              {state.traffic ? `${activeNodes.length} 个正在传输` : "未连接"}
            </Text>
          </HStack>
          {activeNodes.length === 0 ? (
            <Text font={13} foregroundStyle="secondaryLabel">当前没有节点在传输</Text>
          ) : (
            activeNodes.map(([name, v]) => (
              <HStack key={name} spacing={10} padding={{ vertical: 2 }}>
                <Text font={15} lineLimit={1} minScaleFactor={0.7} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  {name}
                </Text>
                <HStack spacing={4}>
                  <Image systemName="arrow.down" font={10} foregroundStyle="systemBlue" />
                  <Text font={13}>{formatSpeed(v.inCurrentSpeed)}</Text>
                </HStack>
                <HStack spacing={4}>
                  <Image systemName="arrow.up" font={10} foregroundStyle="systemGreen" />
                  <Text font={13} foregroundStyle="secondaryLabel">{formatSpeed(v.outCurrentSpeed)}</Text>
                </HStack>
              </HStack>
            ))
          )}
        </VStack>

        {/* 节点流量排行 */}
        <VStack
          alignment="leading"
          spacing={12}
          padding={16}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
          background={{ style: "rgba(128,128,128,0.14)", shape: { type: "rect", cornerRadius: 16, style: "continuous" } }}
        >
          <HStack>
            <Text font={15} fontWeight="semibold">节点流量排行</Text>
            <Spacer />
            <Text font={12} foregroundStyle="secondaryLabel">本次引擎运行累计</Text>
          </HStack>
          {top.length === 0 ? (
            <Text font={13} foregroundStyle="secondaryLabel">暂无流量数据</Text>
          ) : (
            top.map((r, i) => (
              <GradientBar
                key={r.name}
                label={r.name}
                valueText={formatBytes(r.total)}
                ratio={r.total / maxTotal}
                colors={BAR_COLORS[i % BAR_COLORS.length]}
              />
            ))
          )}
        </VStack>

        {/* 节点明细 */}
        <VStack
          alignment="leading"
          spacing={0}
          padding={16}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
          background={{ style: "rgba(128,128,128,0.14)", shape: { type: "rect", cornerRadius: 16, style: "continuous" } }}
        >
          <Text font={15} fontWeight="semibold" padding={{ bottom: 10 }}>节点明细</Text>
          {rows.length === 0 ? (
            <Text font={13} foregroundStyle="secondaryLabel">暂无数据</Text>
          ) : (
            rows.map((r, i) => {
              const tc = state.traffic?.connector[r.name]
              const inSpeed = tc ? tc.inCurrentSpeed : r.inSpeed
              const outSpeed = tc ? tc.outCurrentSpeed : r.outSpeed
              const peak = tc ? Math.max(tc.inMaxSpeed, tc.outMaxSpeed) : 0
              return (
              <VStack key={r.name} spacing={0}>
                {i > 0 ? <Spacer frame={{ height: 1 }} /> : null}
                <HStack spacing={10} padding={{ top: 10, bottom: 10 }}>
                  <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                    <Text font={15} lineLimit={1} minScaleFactor={0.7}>{r.name}</Text>
                    <Text font={12} foregroundStyle="secondaryLabel">
                      {`累计 ↓${formatBytes(r.inB)}  ↑${formatBytes(r.outB)}${peak > 0 ? ` · 峰值 ${formatSpeed(peak)}` : ""}`}
                    </Text>
                  </VStack>
                  <VStack alignment="trailing" spacing={3}>
                    <HStack spacing={4}>
                      <Image systemName="arrow.down" font={10} foregroundStyle="systemBlue" />
                      <Text font={13}>{formatSpeed(inSpeed)}</Text>
                    </HStack>
                    <HStack spacing={4}>
                      <Image systemName="arrow.up" font={10} foregroundStyle="systemGreen" />
                      <Text font={13} foregroundStyle="secondaryLabel">{formatSpeed(outSpeed)}</Text>
                    </HStack>
                  </VStack>
                </HStack>
              </VStack>
              )
            })
          )}
        </VStack>
      </VStack>
    </ScrollView>
    </HomeTitleWrapper>
  )
}
