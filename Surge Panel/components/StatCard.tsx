// 圆角统计卡片
import { HStack, Image, Spacer, Text, VStack, type Color, type VirtualNode } from "scripting"

export function StatCard({
  icon,
  iconColor,
  title,
  value,
  subtitle,
  badge,
  contextMenuItems,
}: {
  icon: string
  iconColor: Color
  title: string
  value: string
  subtitle?: string
  badge?: string
  contextMenuItems?: VirtualNode
}) {
  return (
    <VStack
      alignment="leading"
      spacing={10}
      padding={14}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
      background={{ style: "rgba(128,128,128,0.14)", shape: { type: "rect", cornerRadius: 16, style: "continuous" } }}
      contextMenu={contextMenuItems ? { menuItems: contextMenuItems } : undefined}
    >
      <HStack spacing={6}>
        <Image systemName={icon} foregroundStyle={iconColor} font={13} />
        <Text font={13} foregroundStyle="secondaryLabel">{title}</Text>
        <Spacer />
        {badge ? (
          <Text font={11} foregroundStyle="systemRed">{badge}</Text>
        ) : null}
      </HStack>
      <VStack alignment="leading" spacing={2}>
        <Text font={24} fontWeight="bold">{value}</Text>
        {subtitle ? (
          <Text font={11} foregroundStyle="secondaryLabel">{subtitle}</Text>
        ) : null}
      </VStack>
    </VStack>
  )
}
