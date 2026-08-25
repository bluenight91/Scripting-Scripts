import {
  Button,
  HStack,
  Image,
  Spacer,
  Text,
  VStack,
  type Color,
} from "scripting"
import {
  displaySnapshotIp,
  type NetworkSnapshot,
  type ServiceCategory,
} from "../lib/networkDiag"
import { cardBackground } from "../lib/ui"

type WidgetFamilyName =
  | "systemSmall"
  | "systemMedium"
  | "systemLarge"
  | "accessoryRectangular"
  | "accessoryCircular"
  | string

export type NetworkWidgetLayout = "large" | "medium" | "small" | "rectangular" | "circular"

export function widgetLayoutForFamily(family: WidgetFamilyName): NetworkWidgetLayout {
  if (family === "accessoryCircular") return "circular"
  if (family === "accessoryRectangular") return "rectangular"
  if (family === "systemSmall") return "small"
  if (family === "systemMedium") return "medium"
  return "large"
}

function timeLabel(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function delayLabel(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
}

function delayColor(value: number | null): Color {
  if (value == null) return "secondaryLabel"
  return value < 300 ? "systemGreen" : value < 800 ? "systemOrange" : "systemRed"
}

function countryFlag(code: string): string {
  const normalized = code.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalized)) return "🌐"
  return String.fromCodePoint(...[...normalized].map((char) => 127397 + char.charCodeAt(0)))
}

function Card({
  children,
  spacing = 5,
  padding = 9,
  width,
  height,
}: {
  children: any
  spacing?: number
  padding?: number
  width?: number
  height?: number
}) {
  return (
    <VStack
      alignment="leading"
      spacing={spacing}
      padding={padding}
      frame={
        width != null
          ? { width, height, alignment: "leading" }
          : { maxWidth: "infinity", height, alignment: "leading" }
      }
      background={cardBackground()}
    >
      {children}
    </VStack>
  )
}

function CardTitle({
  icon,
  title,
  color,
  trailing,
}: {
  icon: string
  title: string
  color: Color
  trailing?: string
}) {
  return (
    <HStack spacing={4}>
      <Image systemName={icon} foregroundStyle={color} font={11} />
      <Text font={11} fontWeight="semibold" lineLimit={1}>{title}</Text>
      <Spacer />
      {trailing ? (
        <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1}>{trailing}</Text>
      ) : null}
    </HStack>
  )
}

function Header({
  snapshot,
  compact = false,
  refreshIntent,
}: {
  snapshot: NetworkSnapshot
  compact?: boolean
  refreshIntent?: any
}) {
  const statusColor: Color = snapshot.ok ? (snapshot.stale ? "systemOrange" : "systemGreen") : "systemRed"
  return (
    <HStack spacing={6}>
      <Image systemName="waveform.path.ecg" foregroundStyle="systemBlue" font={compact ? 14 : 17} />
      <VStack alignment="leading" spacing={0}>
        <Text font={compact ? 11 : 14} fontWeight="bold" lineLimit={1}>
          网络诊断
        </Text>
        {compact ? null : (
          <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1}>
            {snapshot.instanceName}
          </Text>
        )}
      </VStack>
      <Spacer />
      <Image systemName="circle.fill" foregroundStyle={statusColor} font={7} />
      <Text font={compact ? 9 : 10} foregroundStyle="secondaryLabel" lineLimit={1}>
        {snapshot.stale ? `缓存 ${timeLabel(snapshot.cachedAt)}` : timeLabel(snapshot.generatedAt)}
      </Text>
      {refreshIntent ? (
        <Button
          title=""
          systemImage="arrow.clockwise"
          buttonStyle="plain"
          intent={refreshIntent}
        />
      ) : null}
    </HStack>
  )
}

function ErrorView({ snapshot, family }: { snapshot: NetworkSnapshot; family: WidgetFamilyName }) {
  const accessory = family.startsWith("accessory")
  return (
    <VStack
      alignment={accessory ? "center" : "leading"}
      spacing={accessory ? 2 : 8}
      padding={accessory ? 2 : 14}
      frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: accessory ? "center" : "leading" }}
    >
      <Image systemName="exclamationmark.triangle.fill" foregroundStyle="systemOrange" font={accessory ? 15 : 22} />
      <Text font={accessory ? 10 : 15} fontWeight="semibold" lineLimit={accessory ? 1 : 2}>
        网络诊断暂不可用
      </Text>
      {accessory ? null : (
        <Text font={11} foregroundStyle="secondaryLabel" lineLimit={3} minScaleFactor={0.8}>
          {snapshot.error || "请打开 Surge Panel 检查桌面组件设置"}
        </Text>
      )}
    </VStack>
  )
}

function LocalCard({
  snapshot,
  width,
  height,
}: {
  snapshot: NetworkSnapshot
  width?: number
  height?: number
}) {
  const network = snapshot.network
  const localIp = displaySnapshotIp(network.ipv4 || network.ipv6, snapshot.hideAddresses)
  const gateway = displaySnapshotIp(network.gateway, snapshot.hideAddresses)
  return (
    <Card width={width} height={height}>
      <CardTitle
        icon={network.ssid ? "wifi" : "antenna.radiowaves.left.and.right"}
        title="本地网络"
        color="systemBlue"
        trailing={network.interfaceName || undefined}
      />
      <Text font={14} fontWeight="semibold" lineLimit={1} minScaleFactor={0.7}>
        {network.ssid || (network.interfaceName.startsWith("pdp") ? "蜂窝网络" : "当前网络")}
      </Text>
      <Text font={10} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.65}>
        {localIp}
      </Text>
      <HStack spacing={8}>
        <Metric label="网关" value={gateway} />
        <Metric label="IPv4/IPv6" value={`${network.ipv4 ? "✓" : "×"} / ${network.ipv6 ? "✓" : "×"}`} />
        <Metric label="DNS" value={network.dns[0] ? displaySnapshotIp(network.dns[0], snapshot.hideAddresses) : "—"} />
      </HStack>
    </Card>
  )
}

function PolicyCard({
  snapshot,
  width,
  height,
}: {
  snapshot: NetworkSnapshot
  width?: number
  height?: number
}) {
  const exit = snapshot.policyExit
  const location = exit.city || exit.region || exit.country || "未知地区"
  return (
    <Card width={width} height={height}>
      <CardTitle
        icon="point.3.connected.trianglepath.dotted"
        title="诊断策略"
        color="systemPurple"
        trailing={snapshot.policy.protocol || undefined}
      />
      <HStack spacing={6}>
        <Text font={21}>{countryFlag(exit.countryCode)}</Text>
        <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity", alignment: "leading" }}>
          <Text font={13} fontWeight="semibold" lineLimit={1} minScaleFactor={0.65}>
            {snapshot.policy.label}
          </Text>
          <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.65}>
            {snapshot.policy.node ? `${snapshot.policy.node} · ${location}` : location}
          </Text>
        </VStack>
      </HStack>
      <Text font={10} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.55}>
        {`${displaySnapshotIp(exit.ip, snapshot.hideAddresses)} · ${exit.isp || exit.asn || "出口信息不足"}`}
      </Text>
    </Card>
  )
}

function Metric({ label, value, color = "label" }: { label: string; value: string; color?: Color }) {
  return (
    <VStack spacing={1} frame={{ maxWidth: "infinity" }}>
      <Text font={10} fontWeight="semibold" foregroundStyle={color} lineLimit={1} minScaleFactor={0.55}>
        {value}
      </Text>
      <Text font={8} foregroundStyle="secondaryLabel" lineLimit={1}>{label}</Text>
    </VStack>
  )
}

function HealthRow({
  snapshot,
  height,
}: {
  snapshot: NetworkSnapshot
  height?: number
}) {
  return (
    <Card spacing={4} padding={8} height={height}>
      <HStack spacing={0}>
        <Metric
          label="直连 HTTP"
          value={delayLabel(snapshot.directLatencyMs)}
          color={delayColor(snapshot.directLatencyMs)}
        />
        <Metric
          label="策略 HTTP"
          value={delayLabel(snapshot.policyLatencyMs)}
          color={delayColor(snapshot.policyLatencyMs)}
        />
        <Metric
          label="HTTP/3"
          value={snapshot.http3 == null ? "—" : snapshot.http3 ? "可用" : "未协商"}
          color={snapshot.http3 ? "systemGreen" : snapshot.http3 === false ? "systemOrange" : "secondaryLabel"}
        />
        <Metric
          label="IP 风险"
          value={snapshot.risk.level === "未知" ? "—" : `${snapshot.risk.level} · ${snapshot.risk.score}`}
          color={
            snapshot.risk.level === "低"
              ? "systemGreen"
              : snapshot.risk.level === "中"
                ? "systemOrange"
                : snapshot.risk.level === "高"
                  ? "systemRed"
                  : "secondaryLabel"
          }
        />
      </HStack>
    </Card>
  )
}

function ServicesCard({
  snapshot,
  category,
  title,
  icon,
  color,
  width,
  height,
}: {
  snapshot: NetworkSnapshot
  category: ServiceCategory
  title: string
  icon: string
  color: Color
  width?: number
  height?: number
}) {
  const services = snapshot.services.filter((service) => service.category === category)
  return (
    <Card spacing={4} padding={8} width={width} height={height}>
      <CardTitle
        icon={icon}
        title={title}
        color={color}
        trailing={`${services.filter((service) => service.reachable).length}/${services.length || 6}`}
      />
      {services.length === 0 ? (
        <Text font={10} foregroundStyle="secondaryLabel">暂无检测结果</Text>
      ) : (
        <HStack spacing={6}>
          <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            {services.slice(0, 3).map((service) => (
              <ServiceRow key={service.id} name={service.name} ok={service.reachable} />
            ))}
          </VStack>
          <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            {services.slice(3, 6).map((service) => (
              <ServiceRow key={service.id} name={service.name} ok={service.reachable} />
            ))}
          </VStack>
        </HStack>
      )}
    </Card>
  )
}

function ServiceRow({ name, ok }: { name: string; ok: boolean }) {
  return (
    <HStack spacing={3}>
      <Image
        systemName={ok ? "checkmark.circle.fill" : "xmark.circle.fill"}
        foregroundStyle={ok ? "systemGreen" : "systemRed"}
        font={9}
      />
      <Text font={9} lineLimit={1} minScaleFactor={0.65}>{name}</Text>
    </HStack>
  )
}

function SummaryCard({
  title,
  icon,
  color,
  primary,
  secondary,
  width,
  height,
}: {
  title: string
  icon: string
  color: Color
  primary: string
  secondary: string
  width: number
  height: number
}) {
  return (
    <Card spacing={2} padding={7} width={width} height={height}>
      <CardTitle icon={icon} title={title} color={color} />
      <Text font={12} fontWeight="semibold" lineLimit={1} minScaleFactor={0.65}>
        {primary}
      </Text>
      <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.6}>
        {secondary}
      </Text>
    </Card>
  )
}

function LargeWidget({
  snapshot,
  width,
  refreshIntent,
}: {
  snapshot: NetworkSnapshot
  width: number
  refreshIntent?: any
}) {
  const cardWidth = Math.max(120, (width - 24 - 7) / 2)
  return (
    <VStack alignment="leading" spacing={7} padding={12} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <Header snapshot={snapshot} refreshIntent={refreshIntent} />
      <HStack spacing={7}>
        <LocalCard snapshot={snapshot} width={cardWidth} height={100} />
        <PolicyCard snapshot={snapshot} width={cardWidth} height={100} />
      </HStack>
      <HealthRow snapshot={snapshot} height={56} />
      <HStack spacing={7}>
        <ServicesCard
          snapshot={snapshot}
          category="media"
          title="流媒体可达性"
          icon="play.rectangle.fill"
          color="systemBlue"
          width={cardWidth}
          height={104}
        />
        <ServicesCard
          snapshot={snapshot}
          category="ai"
          title="AI 可达性"
          icon="sparkles"
          color="systemPurple"
          width={cardWidth}
          height={104}
        />
      </HStack>
      <Text font={8} foregroundStyle="tertiaryLabel" lineLimit={1}>
        HTTP 应用层探测 · 风险分数为启发式摘要
      </Text>
    </VStack>
  )
}

function MediumWidget({
  snapshot,
  width,
  refreshIntent,
}: {
  snapshot: NetworkSnapshot
  width: number
  refreshIntent?: any
}) {
  const cardWidth = Math.max(100, (width - 20 - 6) / 2)
  const localIp = displaySnapshotIp(
    snapshot.network.ipv4 || snapshot.network.ipv6,
    snapshot.hideAddresses
  )
  return (
    <VStack alignment="leading" spacing={5} padding={10} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <Header snapshot={snapshot} compact refreshIntent={refreshIntent} />
      <HStack spacing={6}>
        <SummaryCard
          title="本地网络"
          icon={snapshot.network.ssid ? "wifi" : "antenna.radiowaves.left.and.right"}
          color="systemBlue"
          primary={snapshot.network.ssid || snapshot.network.interfaceName || "当前网络"}
          secondary={localIp}
          width={cardWidth}
          height={57}
        />
        <SummaryCard
          title="诊断策略"
          icon="point.3.connected.trianglepath.dotted"
          color="systemPurple"
          primary={`${countryFlag(snapshot.policyExit.countryCode)} ${snapshot.policy.label}`}
          secondary={
            snapshot.policyExit.city ||
            snapshot.policyExit.country ||
            snapshot.policy.node ||
            "出口信息不足"
          }
          width={cardWidth}
          height={57}
        />
      </HStack>
      <HealthRow snapshot={snapshot} height={47} />
    </VStack>
  )
}

function SmallWidget({
  snapshot,
  refreshIntent,
}: {
  snapshot: NetworkSnapshot
  refreshIntent?: any
}) {
  const exit = snapshot.policyExit
  return (
    <VStack alignment="leading" spacing={5} padding={10} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <Header snapshot={snapshot} compact refreshIntent={refreshIntent} />
      <Card spacing={2} padding={7} height={58}>
        <HStack spacing={6}>
          <Text font={24}>{countryFlag(exit.countryCode)}</Text>
          <VStack alignment="leading" spacing={0}>
            <Text font={13} fontWeight="bold" lineLimit={1} minScaleFactor={0.65}>
              {exit.city || exit.country || "未知出口"}
            </Text>
            <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.6}>
              {snapshot.policy.node || snapshot.policy.label}
            </Text>
          </VStack>
        </HStack>
        <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.5}>
          {`${displaySnapshotIp(exit.ip, snapshot.hideAddresses)} · ${snapshot.network.ssid || snapshot.network.interfaceName || "当前网络"}`}
        </Text>
      </Card>
      <HealthRow snapshot={snapshot} height={45} />
    </VStack>
  )
}

function AccessoryWidget({
  snapshot,
  circular,
}: {
  snapshot: NetworkSnapshot
  circular: boolean
}) {
  if (circular) {
    return (
      <VStack spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        <Text font={17}>{countryFlag(snapshot.policyExit.countryCode)}</Text>
        <Text font={11} fontWeight="bold" lineLimit={1}>{delayLabel(snapshot.policyLatencyMs)}</Text>
      </VStack>
    )
  }
  return (
    <HStack spacing={6} padding={3} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <Image systemName="waveform.path.ecg" font={15} />
      <VStack alignment="leading" spacing={0}>
        <Text font={11} fontWeight="semibold" lineLimit={1}>
          {`${countryFlag(snapshot.policyExit.countryCode)} ${snapshot.policy.label}`}
        </Text>
        <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1}>
          {`策略 ${delayLabel(snapshot.policyLatencyMs)} · H3 ${snapshot.http3 ? "可用" : "—"}`}
        </Text>
      </VStack>
    </HStack>
  )
}

export function NetworkDiagWidget({
  snapshot,
  family,
  displaySize,
  refreshIntent,
}: {
  snapshot: NetworkSnapshot
  family: WidgetFamilyName
  displaySize: { width: number; height: number }
  refreshIntent?: any
}) {
  if (!snapshot.ok) return <ErrorView snapshot={snapshot} family={family} />
  const layout = widgetLayoutForFamily(family)
  if (layout === "circular") return <AccessoryWidget snapshot={snapshot} circular />
  if (layout === "rectangular") return <AccessoryWidget snapshot={snapshot} circular={false} />
  if (layout === "small") return <SmallWidget snapshot={snapshot} refreshIntent={refreshIntent} />
  if (layout === "medium") {
    return <MediumWidget snapshot={snapshot} width={displaySize.width} refreshIntent={refreshIntent} />
  }
  return <LargeWidget snapshot={snapshot} width={displaySize.width} refreshIntent={refreshIntent} />
}
