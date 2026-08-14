// 首页模式页内标题：分段选择器已标明当前 Tab，用较小标题避免与底栏/分段器抢层级
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
      <Text font={22} fontWeight="bold" padding={{ leading: 20, trailing: 20, top: 4, bottom: 10 }}>
        {title}
      </Text>
      {children}
    </VStack>
  )
}

/** 全屏运行时的页内大标题；首页模式由 HomeTitleWrapper / 分段器承担，不再重复 */
export function FullscreenPageTitle({ title }: { title: string }) {
  if (Script.env === "home_screen") return null
  return <Text font={28} fontWeight="bold">{title}</Text>
}
