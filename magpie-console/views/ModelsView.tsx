// 模型 Tab：/v1/models 目录、搜索、置顶与复制
import {
  Button,
  HStack,
  Image,
  List,
  Menu,
  NavigationStack,
  Section,
  Spacer,
  Text,
  VStack,
  useState,
} from "scripting"
import { fetchModels, modelList, providerIdOfModel } from "../lib/api"
import { shortNumber } from "../lib/format"
import { pinnedModels, togglePinnedModel } from "../lib/store"
import { Card, EmptyState, LIST_STYLE, SearchField, Tag } from "../components/Kit"
import { CopyChip, ErrorNotice, LoadingRow } from "../components/Bits"
import { TONES } from "../lib/theme"
import type { ApiResult, Gateway, ModelEntry, ModelsPayload } from "../lib/types"

function ModelRow({
  model,
  pinned,
  onTogglePin,
}: {
  model: ModelEntry
  pinned: boolean
  onTogglePin: () => void
}) {
  return (
    <HStack spacing={10} padding={{ vertical: 4 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <HStack spacing={6}>
          <Text font={15} fontWeight="semibold" lineLimit={1}>{model.name || model.id}</Text>
          {pinned ? <Image systemName="pin.fill" font={11} foregroundStyle={TONES.accent.fg} /> : null}
          {model.group ? <Tag text="路由组" tone="purple" /> : null}
        </HStack>
        <Text font={11} fontDesign="monospaced" foregroundStyle="secondaryLabel" lineLimit={1}>{model.id}</Text>
        <HStack spacing={5}>
          <Tag text={providerIdOfModel(model)} tone="blue" />
          {model.context_window ? <Tag text={shortNumber(model.context_window) + " ctx"} tone="gray" /> : null}
          {model.reasoning ? <Tag text="思考" tone="orange" /> : null}
          {model.vision ? <Tag text="图像" tone="teal" /> : null}
        </HStack>
      </VStack>
      <CopyChip text={model.id} label="" />
      <Menu label={<Image systemName="ellipsis.circle" foregroundStyle="secondaryLabel" />}>
        <Button
          title={pinned ? "取消置顶" : "置顶"}
          systemImage={pinned ? "pin.slash" : "pin"}
          action={onTogglePin}
        />
      </Menu>
    </HStack>
  )
}

export function ModelsView({ gateway }: { gateway: Gateway }) {
  const [payload, setPayload] = useState<ModelsPayload | null>(null)
  const [error, setError] = useState<ApiResult<ModelsPayload> | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [pinned, setPinned] = useState<string[]>(pinnedModels())

  async function load() {
    const result = await fetchModels(gateway)
    if (result.ok) {
      setPayload(result.data)
      setError(null)
    } else {
      setError(result)
    }
    setLoading(false)
  }

  function appear() {
    setPinned(pinnedModels())
    void load()
  }

  const items = modelList(payload)
  const text = query.trim().toLowerCase()
  const filtered = text
    ? items.filter(model =>
        model.id.toLowerCase().includes(text) ||
        (model.name || "").toLowerCase().includes(text) ||
        providerIdOfModel(model).toLowerCase().includes(text),
      )
    : items
  const pinnedItems = filtered.filter(model => pinned.includes(model.id))
  const rest = filtered.filter(model => !pinned.includes(model.id))
  const providerCount = new Set(items.map(providerIdOfModel)).size

  function togglePin(id: string) {
    setPinned(togglePinnedModel(id))
  }

  return (
    <NavigationStack>
      <List
        {...LIST_STYLE}
        navigationTitle="模型"
        navigationBarTitleDisplayMode="inline"
        refreshable={load}
        onAppear={appear}
      >
        <Section>
          <SearchField value={query} onChanged={setQuery} prompt="模型名、ID 或供应商" />
        </Section>

        {error ? (
          <Section>
            <ErrorNotice
              message={error.error?.message ?? "读取模型目录失败"}
              hint={error.error?.hint}
              raw={error.raw}
            />
          </Section>
        ) : null}

        {loading ? (
          <Section>
            <LoadingRow text="正在同步模型目录" />
          </Section>
        ) : null}

        {!loading && !error ? (
          <Section
            header={
              <HStack>
                <Text>{`模型 · ${filtered.length}`}</Text>
                <Spacer />
                <Tag text={`${providerCount} 个供应商`} tone="gray" />
              </HStack>
            }
            footer={
              <Text font={12}>
                目录来自 /v1/models，不需要管理权限。置顶保存在本机，不会修改 magpie。
              </Text>
            }
          />
        ) : null}

        {pinnedItems.length > 0 ? (
          <Section header={<Text>置顶</Text>}>
            {pinnedItems.map(model => (
              <ModelRow
                key={model.id}
                model={model}
                pinned
                onTogglePin={() => togglePin(model.id)}
              />
            ))}
          </Section>
        ) : null}

        {rest.length > 0 ? (
          <Section header={<Text>{pinnedItems.length > 0 ? "全部模型" : "模型目录"}</Text>}>
            {rest.map(model => (
              <ModelRow
                key={model.id}
                model={model}
                pinned={false}
                onTogglePin={() => togglePin(model.id)}
              />
            ))}
          </Section>
        ) : null}

        {!loading && !error && filtered.length === 0 ? (
          <Section>
            <EmptyState
              icon="square.stack.3d.up"
              title="没有匹配的模型"
              message="清空搜索词，或在 magpie 里添加供应商。"
            />
          </Section>
        ) : null}

        {!loading && filtered.length > 0 ? (
          <Section>
            <Card>
              <Text font={12} foregroundStyle="secondaryLabel">
                提示：路由组的模型以 auto/ 或 group/ 开头；把它们选进 agent 时，magpie 会按组内顺序挑选供应商。
              </Text>
            </Card>
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  )
}