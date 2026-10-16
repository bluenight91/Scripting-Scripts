// 账户限额主卡片：请求（Free 每日 / Paid 每周期）、Paid 的 CPU 毫秒与超额估算
import { HStack, Image, Spacer, Text, VStack } from "scripting"
import {
  countParts,
  formatCount,
  formatCountdown,
  formatPercent,
  formatUSD,
  planLabel,
  type QuotaSummary,
} from "../lib/cfCore"
import { GradientBar } from "./GradientBar"
import { HeroCard, ValueText } from "./Kit"
import { UI } from "../lib/theme"

export const HERO_DIM = "rgba(255,255,255,0.9)"
const BAR_COLORS = ["rgba(255,255,255,0.95)", "white"]
const BAR_TRACK = "rgba(255,255,255,0.32)"
const BAR_WARN = ["#C2410C", "#9A3412"]
const BAR_FULL = ["#B91C1C", "#7F1D1D"]

function barColors(r: number) {
  return r >= 1 ? BAR_FULL : r >= 0.8 ? BAR_WARN : BAR_COLORS
}

export function HeroChip({ icon, text }: { icon?: string; text: string }) {
  return (
    <HStack
      spacing={5}
      padding={{ horizontal: 10, vertical: 5 }}
      background={{ style: "rgba(255,255,255,0.24)", shape: "capsule" }}
    >
      {icon ? <Image systemName={icon} font={11} foregroundStyle="white" /> : null}
      <Text font={12} fontWeight="semibold" fontDesign="rounded" foregroundStyle="white" lineLimit={1}>{text}</Text>
    </HStack>
  )
}

export function QuotaHero({
  q,
  workersRequests,
  pagesRequests,
  updatedText,
  onTap,
}: {
  q: QuotaSummary
  workersRequests: number
  pagesRequests: number
  updatedText: string
  onTap?: () => void
}) {
  const free = q.plan === "free"
  const req = countParts(q.requests)
  return (
    <HeroCard onTap={onTap}>
      <HStack spacing={8}>
        <Image systemName="cloud.fill" font={15} foregroundStyle={HERO_DIM} />
        <Text font={14} fontWeight="semibold" foregroundStyle={HERO_DIM}>{planLabel(q.plan)}</Text>
        <Spacer />
        <Text font={12} foregroundStyle={HERO_DIM}>{`${formatCountdown(q.resetAt - Date.now())}后重置`}</Text>
      </HStack>
      <VStack alignment="leading" spacing={8}>
        <HStack alignment="lastTextBaseline">
          <ValueText
            value={req.value}
            unit={`${req.unit} / ${formatCount(q.requestLimit)} 次${free ? "（今日）" : "（本周期）"}`}
            size={UI.heroFont}
            color="white"
            unitColor={HERO_DIM}
          />
          <Spacer />
          <Text font={20} fontWeight="bold" fontDesign="rounded" monospacedDigit foregroundStyle="white">
            {formatPercent(q.requestRatio)}
          </Text>
        </HStack>
        <GradientBar ratio={q.requestRatio} colors={barColors(q.requestRatio)} track={BAR_TRACK} height={10} />
      </VStack>
      {!free ? (
        <VStack alignment="leading" spacing={6}>
          <HStack>
            <Text font={13} fontWeight="medium" foregroundStyle={HERO_DIM}>CPU 时间</Text>
            <Spacer />
            <Text font={13} fontDesign="rounded" monospacedDigit foregroundStyle="white">
              {q.cpuMs == null ? "不可用" : `${formatCount(q.cpuMs)} / ${formatCount(q.cpuLimitMs)} ms`}
            </Text>
          </HStack>
          <GradientBar ratio={q.cpuRatio ?? 0} colors={barColors(q.cpuRatio ?? 0)} track={BAR_TRACK} height={6} />
        </VStack>
      ) : null}
      <HStack spacing={8}>
        <HeroChip icon="bolt.fill" text={`Workers ${formatCount(workersRequests)}`} />
        <HeroChip icon="doc.richtext.fill" text={`Pages ${formatCount(pagesRequests)}`} />
        {q.overage && q.overage.totalUSD > 0 ? <HeroChip icon="dollarsign.circle.fill" text={`超额 ${formatUSD(q.overage.totalUSD)}`} /> : null}
      </HStack>
      <Text font={11} foregroundStyle={HERO_DIM}>{updatedText}</Text>
    </HeroCard>
  )
}
