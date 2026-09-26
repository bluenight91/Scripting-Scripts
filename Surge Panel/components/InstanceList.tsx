// 实例切换列表（总览 sheet / 设置入口共用）
import {
  Button,
  HStack,
  Image,
  List,
  Section,
  Text,
  VStack,
} from "scripting"
import { endpointScope } from "../lib/connection"
import { getCredentialWarning, instanceSubtitle, type SurgeInstance } from "../lib/instances"
import { switchInstance, useStoreSelector } from "../lib/store"

function instanceHealth(inst: SurgeInstance): { text: string; failed: boolean } {
  const scope = endpointScope(inst.host)
  const parts = [
    inst.protocol.toUpperCase(),
    scope === "local" ? "本机" : scope === "lan" ? "局域网" : "外部地址",
  ]
  const failed = Boolean(inst.lastError && (inst.lastErrorAt ?? 0) >= (inst.lastSeenAt ?? 0))
  if (failed) parts.push(`失败：${inst.lastError}`)
  else if (inst.lastSeenAt) {
    if (inst.lastLatencyMs !== undefined) parts.push(`${inst.lastLatencyMs} ms`)
    parts.push(`最近 ${new Date(inst.lastSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`)
  } else parts.push("尚未测试")
  return { text: parts.join(" · "), failed }
}

export function InstanceList({
  onAdd,
  onEdit,
}: {
  onAdd?: () => void
  onEdit?: (inst: SurgeInstance) => void
}) {
  const credentialWarning = getCredentialWarning()
  const { instances, activeId } = useStoreSelector((s) => ({
    instances: s.instances,
    activeId: s.activeId,
  }))

  return (
    <List navigationTitle="实例">
      <Section footer={<Text font={13}>一次只连接一个 Surge HTTP API。点按切换，不会重新打开面板。</Text>}>
        {instances.length === 0 ? (
          <Text font={15} foregroundStyle="secondaryLabel">
            还没有实例。添加本机或网关的 HTTP API 后才会连接。
          </Text>
        ) : (
          instances.map((inst) => {
          const active = inst.id === activeId
          const health = instanceHealth(inst)
          return (
            <HStack
              key={inst.id}
              spacing={10}
              onTapGesture={() => {
                void switchInstance(inst.id)
              }}
            >
              <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <Text font={17} fontWeight={active ? "semibold" : "regular"}>{inst.name}</Text>
                <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>
                  {instanceSubtitle(inst)}
                </Text>
                <Text
                  font={12}
                  foregroundStyle={health.failed ? "systemRed" : "tertiaryLabel"}
                  lineLimit={1}
                >
                  {health.text}
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
        })
        )}
      </Section>
      {onAdd ? (
        <Section>
          <Button title="添加实例" systemImage="plus.circle" action={onAdd} />
        </Section>
      ) : null}
      {credentialWarning ? (
        <Section>
          <Text font={13} foregroundStyle="systemRed">{credentialWarning}</Text>
        </Section>
      ) : null}
    </List>
  )
}
