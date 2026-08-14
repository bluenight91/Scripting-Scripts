// 圆角统计卡片
import { HStack, Image, Spacer, Text, VStack, type Color, type VirtualNode } from "scripting"

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
      padding={{ horizontal: 14, vertical: 12 }}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
      background={{ style: "rgba(128,128,128,0.14)", shape: { type: "rect", cornerRadius: 16, style: "continuous" } }}
      contextMenu={contextMenuItems ? { menuItems: contextMenuItems } : undefined}
    >
      <HStack spacing={6}>
        <Image systemName={icon} foregroundStyle={iconColor} font={14} />
        <Text font={14} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.8}>
          {title}
        </Text>
      </HStack>
      <HStack spacing={4}>
        <Text font={22} fontWeight="bold" lineLimit={1} minScaleFactor={0.7}>{value}</Text>
        {unit ? (
          <Text font={13} fontWeight="medium" foregroundStyle="secondaryLabel">{unit}</Text>
        ) : null}
      </HStack>
      {subtitle || badge ? (
        <HStack spacing={6}>
          {subtitle ? (
            <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.8}>
              {subtitle}
            </Text>
          ) : null}
          <Spacer />
          {badge ? (
            <Text font={12} fontWeight="medium" foregroundStyle="systemRed" lineLimit={1}>
              {badge}
            </Text>
          ) : null}
        </HStack>
      ) : null}
    </VStack>
  )
}
