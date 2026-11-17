// 设置（sheet）：多网关书签、当前网关状态、接入 / 诊断入口、本机数据
import {
  Button,
  Dialog,
  Group,
  HStack,
  List,
  NavigationLink,
  NavigationStack,
  Section,
  Spacer,
  Text,
  VStack,
  useState,
} from "scripting"
import {
  activeGatewayId,
  adminKey,
  clearAdminKey,
  clearLocalData,
  hasAdminKey,
  loadGateways,
  saveGateways,
  setActiveGatewayId,
  setPinnedModels,
} from "../lib/store"
import { relativeTime } from "../lib/format"
import { BARE_ROW, Card, IconBadge, LIST_STYLE, SectionHeader, StatusPill, Tag } from "../components/Kit"
import { TONES } from "../lib/theme"
import type { Gateway } from "../lib/types"
import { GatewayEditView } from "./GatewayEditView"
import { ConnectView } from "./ConnectView"
import { DiagnosticsView } from "./DiagnosticsView"

export function SettingsView({
  onGatewaysChanged,
  onClose,
}: {
  onGatewaysChanged: () => void
  onClose: () => void
}) {
  const [gateways, setGateways] = useState<Gateway[]>(loadGateways())
  const [currentId, setCurrentId] = useState<string | null>(activeGatewayId())

  const current = gateways.find(item => item.id === currentId) ?? gateways[0] ?? null

  function refresh() {
    setGateways(loadGateways())
    setCurrentId(activeGatewayId())
    onGatewaysChanged()
  }

  function switchTo(item: Gateway) {
    setActiveGatewayId(item.id)
    refresh()
  }

  async function removeGateway(item: Gateway) {
    const confirmed = await Dialog.confirm({
      title: "移除网关",
      message: `从这台设备移除「${item.name}」？它的 admin 密钥也会从钥匙串删除。`,
      cancelLabel: "取消",
      confirmLabel: "移除",
    })
    if (!confirmed) return
    const rest = loadGateways().filter(entry => entry.id !== item.id)
    saveGateways(rest)
    clearAdminKey(item.id)
    if (activeGatewayId() === item.id) setActiveGatewayId(rest[0]?.id ?? "")
    refresh()
  }

  async function clearPinned() {
    const confirmed = await Dialog.confirm({
      title: "清空置顶",
      message: "只会清空本机的置顶模型，不影响 magpie。",
      cancelLabel: "取消",
      confirmLabel: "清空",
    })
    if (!confirmed) return
    setPinnedModels([])
  }

  async function wipe() {
    const confirmed = await Dialog.confirm({
      title: "清除本地数据",
      message: "会删除所有网关书签、置顶模型和本脚本保存的 admin 密钥。magpie 本身不受影响。",
      cancelLabel: "取消",
      confirmLabel: "全部清除",
    })
    if (!confirmed) return
    clearLocalData()
    refresh()
    onClose()
  }

  return (
    <NavigationStack>
      <List
        {...LIST_STYLE}
        navigationTitle="设置"
        navigationBarTitleDisplayMode="inline"
        toolbar={{ cancellationAction: <Button title="完成" action={onClose} /> }}
      >
        <Section
          header={<Text>网关</Text>}
          footer={<Text font={12}>书签只保存名称与地址；密钥保存在系统钥匙串。</Text>}
        >
          {gateways.map(item => (
            <NavigationLink
              key={item.id}
              destination={
                <GatewayEditView
                  initial={{ ...item, adminKey: adminKey(item.id) }}
                  popOnSave
                  onSaved={() => refresh()}
                />
              }
            >
              <HStack
                spacing={12}
                padding={{ vertical: 2 }}
                frame={{ maxWidth: "infinity", alignment: "leading" }}
                trailingSwipeActions={{
                  allowsFullSwipe: true,
                  actions: [
                    <Button
                      title="设为当前"
                      tint={TONES.accent.fg}
                      action={() => switchTo(item)}
                    />,
                  ],
                }}
                contextMenu={{
                  menuItems: (
                    <Group>
                      <Button
                        title="设为当前"
                        systemImage="checkmark.circle"
                        action={() => switchTo(item)}
                      />
                      <Button
                        title="移除"
                        systemImage="trash"
                        role="destructive"
                        action={() => { void removeGateway(item) }}
                      />
                    </Group>
                  ),
                }}
              >
                <IconBadge
                  icon={item.id === currentId ? "bird.fill" : "bird"}
                  tone={item.id === currentId ? "accent" : "gray"}
                  size={36}
                  filled={item.id === currentId}
                />
                <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  <HStack spacing={6}>
                    <Text font={16} fontWeight="semibold" lineLimit={1}>{item.name}</Text>
                    {item.id === currentId ? <Tag text="当前" tone="accent" /> : null}
                  </HStack>
                  <Text font={12} fontDesign="monospaced" foregroundStyle="secondaryLabel" lineLimit={1}>
                    {item.baseURL}
                  </Text>
                  <HStack spacing={6}>
                    <Tag text={hasAdminKey(item.id) ? "密钥已保存" : "无密钥"} tone={hasAdminKey(item.id) ? "green" : "orange"} />
                    {item.lastOKAt ? <Tag text={"连通 " + relativeTime(item.lastOKAt)} tone="gray" /> : null}
                  </HStack>
                </VStack>
              </HStack>
            </NavigationLink>
          ))}
          <NavigationLink destination={<GatewayEditView popOnSave onSaved={() => refresh()} />}>
            <HStack spacing={10} padding={{ vertical: 2 }}>
              <IconBadge icon="plus" tone="green" size={28} filled />
              <Text font={15}>添加网关</Text>
            </HStack>
          </NavigationLink>
        </Section>

        <Section header={<Text>当前网关</Text>}>
          <VStack {...BARE_ROW}>
            <Card tone={current && (hasAdminKey(current.id) || current.adminKey) ? "green" : "orange"}>
              <SectionHeader
                title={current?.name ?? "未选择"}
                caption={current?.baseURL ?? ""}
              />
              <HStack spacing={8}>
                <StatusPill
                  kind={current && hasAdminKey(current.id) ? "ok" : "warn"}
                  label={current && hasAdminKey(current.id) ? "管理密钥已配置" : "缺少管理密钥"}
                />
                <Spacer />
                <Text font={11} foregroundStyle="secondaryLabel">
                  {current?.lastOKAt ? "上次连通 " + relativeTime(current.lastOKAt) : "尚未连通"}
                </Text>
              </HStack>
            </Card>
          </VStack>
          {current ? (
            <NavigationLink destination={<ConnectView gateway={current} />}>
              <HStack spacing={10} padding={{ vertical: 2 }}>
                <IconBadge icon="link" tone="blue" size={28} filled />
                <Text font={15}>接入方式与可复制片段</Text>
                <Spacer />
              </HStack>
            </NavigationLink>
          ) : null}
          {current ? (
            <NavigationLink destination={<DiagnosticsView gateway={current} />}>
              <HStack spacing={10} padding={{ vertical: 2 }}>
                <IconBadge icon="stethoscope" tone="purple" size={28} filled />
                <Text font={15}>自检与诊断</Text>
                <Spacer />
              </HStack>
            </NavigationLink>
          ) : null}
        </Section>

        <Section header={<Text>本机数据</Text>}>
          <Button title="清空置顶模型" systemImage="pin.slash" role="destructive" buttonStyle="borderless" action={clearPinned} />
          <Button title="清除全部本地数据" systemImage="trash" role="destructive" buttonStyle="borderless" action={wipe} />
        </Section>

        <Section header={<Text>关于</Text>}>
          <VStack {...BARE_ROW}>
            <Card>
              <HStack spacing={12}>
                <IconBadge icon="bird.fill" tone="accent" size={38} filled />
                <VStack alignment="leading" spacing={2}>
                  <Text font={15} fontWeight="semibold">magpie 控制台</Text>
                  <Text font={12} foregroundStyle="secondaryLabel">版本 1.0.0 · Scripting</Text>
                </VStack>
              </HStack>
              <Text font={12} foregroundStyle="secondaryLabel">
                直接调用 magpie 的管理 API（/v1/magpie/admin/），字段与 magpie 网页端一致。只做控制台，不做对话。
              </Text>
              <HStack spacing={6}>
                <Tag text="只读优先" tone="gray" />
                <Tag text="密钥存钥匙串" tone="green" />
                <Tag text="无第三方请求" tone="blue" />
              </HStack>
              <Text font={11} foregroundStyle="tertiaryLabel">
                管理 API 不会返回供应商的明文密钥，也不允许修改密钥的 admin 级别；这是 magpie 的安全边界。
              </Text>
            </Card>
          </VStack>
        </Section>
      </List>
    </NavigationStack>
  )
}