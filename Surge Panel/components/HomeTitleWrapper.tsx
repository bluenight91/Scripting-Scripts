// 首页模式统一页内大标题：位于分段选择器正下方，与流量/总览的页内标题位置一致
import { Script, Text, VStack } from "scripting"

export function HomeTitleWrapper({
  title,
  children,
}: {
  title: string
  children: any
}) {
  if (Script.env !== "home_screen") return children
  return (
    <VStack
      alignment="leading"
      spacing={0}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <Text font={28} fontWeight="bold" padding={{ leading: 16, bottom: 6 }}>
        {title}
      </Text>
      {children}
    </VStack>
  )
}
