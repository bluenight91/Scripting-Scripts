// 渐变排行条
import {
  GeometryReader,
  gradient,
  HStack,
  RoundedRectangle,
  Spacer,
  Text,
  VStack,
  ZStack,
  type Color,
} from "scripting"

export function GradientBar({
  label,
  valueText,
  ratio,
  colors,
}: {
  label: string
  valueText: string
  ratio: number // 0 ~ 1
  colors: Color[]
}) {
  const pct = Math.max(0.02, Math.min(1, ratio))
  return (
    <VStack alignment="leading" spacing={5}>
      <HStack>
        <Text font={13} lineLimit={1} minScaleFactor={0.7}>{label}</Text>
        <Spacer />
        <Text font={13} foregroundStyle="secondaryLabel">{valueText}</Text>
      </HStack>
      <GeometryReader>
        {(proxy) => (
          <ZStack alignment="leading" frame={{ width: proxy.size.width, height: 8 }}>
            <RoundedRectangle cornerRadius={4} style="continuous" fill="rgba(128,128,128,0.18)" />
            <RoundedRectangle
              cornerRadius={4}
              style="continuous"
              fill={gradient("linear", { colors, startPoint: "leading", endPoint: "trailing" })}
              frame={{ width: Math.max(8, proxy.size.width * pct), height: 8 }}
            />
          </ZStack>
        )}
      </GeometryReader>
    </VStack>
  )
}
