// 实例切换列表（总览 sheet / 设置入口共用）
import {
  Button,
  HStack,
  Image,
  List,
  Section,
  Spacer,
  Text,
  VStack,
} from "scripting"
import { instanceSubtitle, type SurgeInstance } from "../lib/instances"
import { switchInstance, useStore } from "../lib/store"

export function InstanceList({
  onAdd,
  onEdit,
}: {
  onAdd?: () => void
  onEdit?: (inst: SurgeInstance) => void
}) {
  const state = useStore()

  return (
    <List navigationTitle="实例">
      <Section footer={<Text font={13}>一次只连接一个 Surge HTTP API。点按切换，不会重新打开面板。</Text>}>
        {state.instances.map((inst) => {
          const active = inst.id === state.activeId
          return (
            <HStack
              key={inst.id}
              spacing={10}
              onTapGesture={() => {
                void switchInstance(inst.id)
              }}
            >
              <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <Text font={17} fontWeight={active ? "semibold" : "regular"}>{inst.name}</Text>
                <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>
                  {instanceSubtitle(inst)}
                </Text>
              </VStack>
              {onEdit ? (
                <Button
                  title="编辑"
                  buttonStyle="borderless"
                  action={() => onEdit(inst)}
                />
              ) : null}
              {active ? (
                <Image systemName="checkmark.circle.fill" foregroundStyle="systemBlue" font={18} />
              ) : (
                <Image systemName="circle" foregroundStyle="tertiaryLabel" font={18} />
              )}
            </HStack>
          )
        })}
      </Section>
      {onAdd ? (
        <Section>
          <Button title="添加实例" systemImage="plus.circle" action={onAdd} />
        </Section>
      ) : null}
    </List>
  )
}
