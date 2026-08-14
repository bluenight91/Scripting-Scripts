// 圆角统计卡片
import { HStack, Image, Spacer, Text, VStack, type Color, type VirtualNode } from "scripting"
import { UI, cardBackground } from "../lib/ui"

export function StatCard({
  icon,
  iconColor,
  title,
  value,
  unit,
  subtitle,
  badge,
  contextMenuItems,
}: {
  icon: string
  iconColor: Color
  title: string
  value: string
  unit?: string
  subtitle?: string
  badge?: string
  contextMenuItems?: VirtualNode
}) {
  return (
    <VStack
      alignment="leading"
      spacing={8}
      padding={{ horizontal: UI.cardPadding, vertical: 12 }}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
      background={cardBackground()}
      contextMenu={contextMenuItems ? { menuItems: contextMenuItems } : undefined}
    >
      <HStack spacing={6}>
        <Image systemName={icon} foregroundStyle={iconColor} font={14} />
        <Text font={14} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.8}>
          {title}
        </Text>
      </HStack>
      <HStack spacing={4}>
        <Text font={UI.valueFont} fontWeight="bold" lineLimit={1} minScaleFactor={0.7}>{value}</Text>
        {unit ? (
          <Text font={UI.unitFont} fontWeight="medium" foregroundStyle="secondaryLabel">{unit}</Text>
        ) : null}
      </HStack>
      {subtitle || badge ? (
        <HStack spacing={6}>
          {subtitle ? (
            <Text font={UI.captionFont} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.8}>
              {subtitle}
            </Text>
          ) : null}
          <Spacer />
          {badge ? (
            <Text font={UI.captionFont} fontWeight="medium" foregroundStyle="systemRed" lineLimit={1}>
              {badge}
            </Text>
          ) : null}
        </HStack>
      ) : null}
    </VStack>
  )
}
