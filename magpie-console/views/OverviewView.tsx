// 概览 Tab：网关状态、关键计数、需要处理的异常、置顶模型
import {
  Button,
  HStack,
  Image,
  NavigationStack,
  ScrollView,
  Spacer,
  Text,
  VStack,
  useEffect,
  useState,
} from "scripting"
import {
  fetchGatewayKeys,
  fetchModels,
  fetchProviders,
  fetchRoutingGroups,
  gatewayKeyList,
  modelList,
  providerList,
  routingGroupList,
} from "../lib/api"
import { relativeTime, resetEpoch, resetLabel, shortNumber } from "../lib/format"
import { loadGateways, pinnedModels, saveGateways, togglePinnedModel } from "../lib/store"
import { Card, EmptyState, HeroCard, MetricTile, PAGE_BG, SectionHeader, StatusPill, Tag, ValueText } from "../components/Kit"
import { CopyChip, Dot, ErrorNotice, FieldRow, LoadingRow } from "../components/Bits"
import { TONES, UI, type Tone } from "../lib/theme"
import type {
  ApiResult,
  Gateway,
  GatewayKey,
  KeysPayload,
  ModelEntry,
  ModelsPayload,
  Provider,
  ProvidersPayload,
  RoutingGroup,
  RoutingPayload,
} from "../lib/types"

function keyStatuses(key: GatewayKey) {
  const list = []
  if (key.used) list.push(key.used)
  if (Array.isArray(key.usedAll)) {
    for (const item of key.usedAll.slice(1)) list.push(item)
  }
  return list
}

function nextReset(keys: GatewayKey[]): { key: GatewayKey; at: number; label: string } | null {
  let best: { key: GatewayKey; at: number; label: string } | null = null
  for (const key of keys) {
    for (const status of keyStatuses(key)) {
      const at = resetEpoch(status)
      if (at === Number.MAX_SAFE_INTEGER || at <= Date.now()) continue
      if (!best || at < best.at) best = { key, at, label: resetLabel(status) }
    }
  }
  return best
}

function alarmRows(
  providers: Provider[],
  keys: GatewayKey[],
  groups: RoutingGroup[],
): { title: string; detail: string; tone: Tone }[] {
  const rows: { title: string; detail: string; tone: Tone }[] = []
  const offProviders = providers.filter(item => item.off)
  if (offProviders.length > 0) {
    rows.push({
      title: `${offProviders.length} 个供应商已关闭`,
      detail: offProviders.slice(0, 3).map(item => item.name || item.id).join("、"),
      tone: "orange",
    })
  }
  const offKeys = keys.filter(item => item.off)
  if (offKeys.length > 0) {
    rows.push({
      title: `${offKeys.length} 把密钥已停用`,
      detail: offKeys.slice(0, 3).map(item => item.name || item.id).join("、"),
      tone: "orange",
    })
  }
  const spent = keys.filter(item => keyStatuses(item).some(status => status.spent))
  if (spent.length > 0) {
    rows.push({
      title: `${spent.length} 把密钥额度已用尽`,
      detail: spent.slice(0, 3).map(item => item.name || item.id).join("、"),
      tone: "red",
    })
  }
  const broken = groups.filter(item => item.classifierFailed || item.ready === false)
  if (broken.length > 0) {
    rows.push({
      title: `${broken.length} 个路由组当前不可用`,
      detail: broken
        .slice(0, 2)
        .map(item => `${item.name || item.id}${item.classifierFailed?.error ? "：" + item.classifierFailed.error : ""}`)
        .join("；"),
      tone: "red",
    })
  }
  const listErrors = providers.filter(item => item.listError)
  if (listErrors.length > 0) {
    rows.push({
      title: `${listErrors.length} 个供应商拉取模型失败`,
      detail: listErrors.slice(0, 2).map(item => `${item.name || item.id}：${item.listError}`).join("；"),
      tone: "orange",
    })
  }
  return rows
}

function HeroChip({ icon, text }: { icon: string; text: string }) {
  return (
    <HStack
      spacing={5}
      padding={{ horizontal: 10, vertical: 5 }}
      background={{ style: "rgba(255,255,255,0.18)", shape: "capsule" }}
    >
      <Image systemName={icon} font={11} foregroundStyle="white" />
      <Text font={12} fontWeight="semibold" fontDesign="rounded" foregroundStyle="white">{text}</Text>
    </HStack>
  )
}

export function OverviewView({ gateway }: { gateway: Gateway }) {
  const [providers, setProviders] = useState<ProvidersPayload | null>(null)
  const [keys, setKeys] = useState<KeysPayload | null>(null)
  const [routes, setRoutes] = useState<RoutingPayload | null>(null)
  const [models, setModels] = useState<ModelsPayload | null>(null)
  const [adminError, setAdminError] = useState<ApiResult<ProvidersPayload> | null>(null)
  const [modelsOK, setModelsOK] = useState(false)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [pinned, setPinned] = useState<string[]>(pinnedModels())

  async function load() {
    const [providerResult, keyResult, routeResult, modelResult] = await Promise.all([
      fetchProviders(gateway),
      fetchGatewayKeys(gateway),
      fetchRoutingGroups(gateway),
      fetchModels(gateway),
    ])
    setProviders(providerResult.data)
    setKeys(keyResult.data)
    setRoutes(routeResult.data)
    setModels(modelResult.data)
    setModelsOK(modelResult.ok)
    setAdminError(providerResult.ok ? null : providerResult)
    if (providerResult.ok) {
      const list = loadGateways()
      const index = list.findIndex(item => item.id === gateway.id)
      if (index >= 0) {
        list[index] = { ...list[index], lastOKAt: Date.now() }
        saveGateways(list)
      }
    }
    setUpdatedAt(Date.now())
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true)
    setPinned(pinnedModels())
    void load()
  }, [gateway.id])

  const providerItems = providerList(providers)
  const keyItems = gatewayKeyList(keys)
  const groupItems = routingGroupList(routes)
  const modelItems = modelList(models)
  const health = providers?.gateway
  const enabledProviders = providerItems.filter(item => !item.off)
  const enabledKeys = keyItems.filter(item => !item.off)
  const alarms = alarmRows(providerItems, keyItems, groupItems)
  const next = nextReset(keyItems)
  const modelById: Record<string, ModelEntry> = {}
  for (const model of modelItems) modelById[model.id] = model

  const adminOK = adminError === null

  return (
    <NavigationStack>
      <ScrollView
        navigationTitle="概览"
        navigationBarTitleDisplayMode="inline"
        background={PAGE_BG}
        scrollContentBackground="hidden"
        refreshable={load}
      >
        <VStack alignment="leading" spacing={UI.pageSpacing} padding={UI.pagePadding}>
          <HeroCard onTap={() => { setLoading(true); void load() }}>
            <HStack spacing={8}>
              <Image systemName="bird.fill" font={15} foregroundStyle="rgba(255,255,255,0.9)" />
              <Text font={14} fontWeight="semibold" foregroundStyle="rgba(255,255,255,0.85)">当前网关</Text>
              <Spacer />
              <StatusPill
                kind={adminOK ? "ok" : modelsOK ? "warn" : "error"}
                label={adminOK ? "已连接" : modelsOK ? "仅模型目录" : "未连通"}
                compact
              />
            </HStack>
            <Text font={17} fontWeight="semibold" foregroundStyle="white" lineLimit={1}>{gateway.name}</Text>
            <Text font={12} fontDesign="monospaced" foregroundStyle="rgba(255,255,255,0.8)" lineLimit={1}>
              {gateway.baseURL}
            </Text>
            <ValueText
              value={String(providerItems.length)}
              unit={`个供应商 · ${enabledProviders.length} 个已开启`}
              size={UI.heroFont}
              color="white"
              unitColor="rgba(255,255,255,0.75)"
            />
            <HStack spacing={8}>
              <HeroChip icon="cube" text={`模型 ${shortNumber(modelItems.length)}`} />
              <HeroChip icon="point.3.connected.trianglepath.dotted" text={`路由 ${groupItems.length}`} />
              <HeroChip icon="key.fill" text={`密钥 ${enabledKeys.length}/${keyItems.length}`} />
            </HStack>
            <HStack spacing={6}>
              {health?.running === false ? <Tag text="网关未运行" tone="red" /> : null}
              {health?.paused ? <Tag text="已暂停" tone="red" /> : null}
              {health?.lan ? <Tag text="局域网共享" tone="green" /> : null}
              {health?.onNetwork ? <Tag text="对外监听" tone="orange" /> : null}
              <Spacer />
              <Text font={11} foregroundStyle="rgba(255,255,255,0.7)">{relativeTime(updatedAt)}</Text>
            </HStack>
          </HeroCard>

          {adminError ? (
            <ErrorNotice
              message={adminError.error?.message ?? "管理 API 请求失败"}
              hint={adminError.error?.hint}
              raw={adminError.raw}
            />
          ) : null}

          <HStack spacing={12}>
            <MetricTile
              icon="square.stack.3d.up"
              tone="blue"
              title="供应商"
              value={loading ? "…" : String(providerItems.length)}
              unit={`/ ${enabledProviders.length}`}
              subtitle={loading ? "读取中" : "已开启 / 总数"}
            />
            <MetricTile
              icon="cube"
              tone="teal"
              title="模型"
              value={loading ? "…" : shortNumber(modelItems.length)}
              subtitle={modelsOK ? "目录已同步" : "目录不可用"}
              badge={modelsOK ? undefined : "不可用"}
            />
          </HStack>
          <HStack spacing={12}>
            <MetricTile
              icon="point.3.connected.trianglepath.dotted"
              tone="accent"
              title="路由组"
              value={loading ? "…" : String(groupItems.length)}
              subtitle={`${groupItems.filter(item => item.ready !== false).length} 个可用`}
            />
            <MetricTile
              icon="key.fill"
              tone="orange"
              title="网关密钥"
              value={loading ? "…" : String(keyItems.length)}
              subtitle={`${enabledKeys.length} 个已启用`}
            />
          </HStack>

          {next ? (
            <Card>
              <SectionHeader title="下一次额度重置" caption={next.key.name || next.key.id} />
              <HStack spacing={8}>
                <Image systemName="clock.arrow.circlepath" font={14} foregroundStyle={TONES.accent.fg} />
                <Text font={13} foregroundStyle="secondaryLabel" frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  {next.label}；最早重置的密钥会重新获得额度。
                </Text>
              </HStack>
            </Card>
          ) : null}

          <Card>
            <SectionHeader title="需要处理" caption="只显示当前真实存在的异常" />
            {alarms.length === 0 ? (
              <HStack spacing={8}>
                <Image systemName="checkmark.seal.fill" font={14} foregroundStyle={TONES.green.fg} />
                <Text font={13} foregroundStyle="secondaryLabel">一切正常，没有需要处理的项。</Text>
              </HStack>
            ) : (
              alarms.map((row, index) => (
                <HStack key={index} spacing={9} frame={{ maxWidth: "infinity" }}>
                  <Dot color={TONES[row.tone].fg} />
                  <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                    <Text font={14}>{row.title}</Text>
                    <Text font={12} foregroundStyle="secondaryLabel" lineLimit={2}>{row.detail}</Text>
                  </VStack>
                </HStack>
              ))
            )}
          </Card>

          <Card>
            <SectionHeader title="置顶模型" caption="在「模型」页通过菜单置顶" />
            {pinned.length === 0 ? (
              <Text font={12} foregroundStyle="secondaryLabel">还没有置顶模型。</Text>
            ) : (
              pinned.map(id => (
                <HStack key={id} spacing={10} frame={{ maxWidth: "infinity" }}>
                  <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                    <Text font={14}>{modelById[id]?.name || id}</Text>
                    <Text font={11} fontDesign="monospaced" foregroundStyle="secondaryLabel" lineLimit={1}>{id}</Text>
                  </VStack>
                  <Button
                    systemImage="pin.slash"
                    buttonStyle="borderless"
                    action={() => setPinned(togglePinnedModel(id))}
                  />
                  <CopyChip text={id} label="" />
                </HStack>
              ))
            )}
          </Card>

          <Card>
            <SectionHeader title="网关地址" caption="在「设置 → 接入方式」复制到其他应用" />
            <FieldRow label="本机" value={health?.url || gateway.baseURL} mono />
            {(health?.lanURLs ?? []).map(url => (
              <FieldRow key={url} label="网络" value={url} mono copyable />
            ))}
            {health?.publicURL ? <FieldRow label="公开" value={health.publicURL} mono copyable /> : null}
          </Card>

          {loading ? <LoadingRow text="正在读取网关状态" /> : null}

          {!loading && providerItems.length === 0 && !adminError ? (
            <EmptyState
              icon="tray"
              title="这个网关还没有供应商"
              message="在 magpie 应用里添加供应商后，下拉刷新即可看到。"
            />
          ) : null}

          <Text font={11} foregroundStyle="tertiaryLabel" padding={{ bottom: 18 }}>
            数据来自 magpie 的管理 API；写操作集中在「密钥」与「路由」页。
          </Text>
        </VStack>
      </ScrollView>
    </NavigationStack>
  )
}