// 路由 Tab：路由组列表与详情；可改备注、重命名，成员编辑留在 magpie
import {
  Button,
  Dialog,
  HStack,
  Image,
  List,
  NavigationLink,
  NavigationStack,
  Navigation,
  ScrollView,
  Section,
  Text,
  TextField,
  VStack,
  useEffect,
  useState,
} from "scripting"
import { fetchRoutingGroups, routingGroupList, updateRoutingGroup } from "../lib/api"
import { summarizeError } from "../lib/format"
import { Card, EmptyState, IconBadge, LIST_STYLE, PAGE_BG, SearchField, SectionHeader, StatusPill, Tag } from "../components/Kit"
import { CopyChip, ErrorNotice, LoadingRow } from "../components/Bits"
import { TONES, UI } from "../lib/theme"
import type { ApiResult, Gateway, RoutingGroup, RoutingPayload } from "../lib/types"

function groupReady(group: RoutingGroup): boolean {
  return group.ready !== false && !group.classifierFailed
}

function GroupRow({ group }: { group: RoutingGroup }) {
  const ready = groupReady(group)
  return (
    <HStack spacing={12} padding={{ vertical: 4 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <IconBadge
        icon={ready ? "point.3.connected.trianglepath.dotted" : "exclamationmark.triangle.fill"}
        tone={ready ? "accent" : "red"}
        size={38}
        filled
      />
      <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <HStack spacing={6}>
          <Text font={16} fontWeight="semibold" lineLimit={1}>{group.name || group.id}</Text>
          {group.picked ? <Tag text="手动" tone="orange" /> : null}
          {group.holds && group.holds.length > 0 ? <Tag text="含子组" tone="purple" /> : null}
        </HStack>
        <Text font={11} fontDesign="monospaced" foregroundStyle="secondaryLabel" lineLimit={1}>
          {group.ref || "group/" + group.id}
        </Text>
        <HStack spacing={5}>
          <Tag text={`${group.members?.length ?? 0} 成员`} tone="blue" />
          {group.routing ? <Tag text={group.routing} tone="gray" /> : null}
        </HStack>
      </VStack>
      <StatusPill kind={ready ? "ok" : "error"} label={ready ? "可用" : "异常"} compact />
    </HStack>
  )
}

export function RoutesView({ gateway }: { gateway: Gateway }) {
  const [payload, setPayload] = useState<RoutingPayload | null>(null)
  const [error, setError] = useState<ApiResult<RoutingPayload> | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")

  async function load() {
    const result = await fetchRoutingGroups(gateway)
    if (result.ok) {
      setPayload(result.data)
      setError(null)
    } else {
      setError(result)
    }
    setLoading(false)
  }

  const groups = routingGroupList(payload)
  const text = query.trim().toLowerCase()
  const items = text
    ? groups.filter(group =>
        group.id.toLowerCase().includes(text) ||
        (group.name || "").toLowerCase().includes(text) ||
        (group.ref || "").toLowerCase().includes(text) ||
        (group.note || "").toLowerCase().includes(text),
      )
    : groups

  return (
    <NavigationStack>
      <List
        {...LIST_STYLE}
        navigationTitle="路由"
        navigationBarTitleDisplayMode="inline"
        refreshable={load}
        onAppear={load}
      >
        <Section>
          <SearchField value={query} onChanged={setQuery} prompt="名称、id 或 ref" />
        </Section>

        {error ? (
          <Section>
            <ErrorNotice
              message={error.error?.message ?? "读取路由组失败"}
              hint={error.error?.hint}
              raw={error.raw}
            />
          </Section>
        ) : null}

        {loading ? (
          <Section>
            <LoadingRow text="正在读取路由组" />
          </Section>
        ) : null}

        {!loading && items.length > 0 ? (
          <Section
            header={<Text>{`路由组 · ${items.length}`}</Text>}
            footer={
              <Text font={12}>
                本页支持修改备注与重命名；成员、顺序、路由策略请在 magpie 应用的 Routing 页编辑。
              </Text>
            }
          >
            {items.map(group => (
              <NavigationLink
                key={group.id}
                destination={<RouteDetail gateway={gateway} groupId={group.id} />}
              >
                <GroupRow group={group} />
              </NavigationLink>
            ))}
          </Section>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <Section>
            <EmptyState
              icon="point.3.connected.trianglepath.dotted"
              title="还没有路由组"
              message="magpie 会自动为同名模型创建组；也可以在 magpie 应用的 Routing 页新建。"
            />
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  )
}

export function RouteDetail({ gateway, groupId }: { gateway: Gateway; groupId: string }) {
  const dismiss = Navigation.useDismiss()
  const [group, setGroup] = useState<RoutingGroup | null>(null)
  const [error, setError] = useState<ApiResult<RoutingPayload> | null>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  async function load() {
    const result = await fetchRoutingGroups(gateway)
    if (result.ok) {
      const found = routingGroupList(result.data).find(item => item.id === groupId) ?? null
      setGroup(found)
      setNote(found?.note ?? "")
      setError(null)
    } else {
      setError(result)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [gateway.id, groupId])

  async function saveNote() {
    if (!group) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await updateRoutingGroup(gateway, { from: group.id, note })
      if (result.ok) {
        setMessage({ text: "备注已保存", ok: true })
        await load()
      } else {
        setMessage({ text: result.error?.message ?? "保存失败", ok: false })
      }
    } catch (error) {
      setMessage({ text: summarizeError(error), ok: false })
    } finally {
      setBusy(false)
    }
  }

  async function rename() {
    if (!group) return
    const value = await Dialog.prompt({
      title: "重命名路由组",
      message: "新的 id 只能包含小写字母、数字、-、_ 和 .；agent 里引用的 group/<旧 id> 会跟随。",
      defaultValue: group.id,
      placeholder: "例如 fast",
      confirmLabel: "重命名",
      cancelLabel: "取消",
    })
    if (value == null) return
    const next = value.trim().toLowerCase()
    if (!next || next === group.id) return
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(next)) {
      setMessage({ text: "id 格式不合法", ok: false })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const result = await updateRoutingGroup(gateway, { from: group.id, id: next })
      if (result.ok) {
        dismiss()
      } else {
        setMessage({ text: result.error?.message ?? "重命名失败", ok: false })
      }
    } catch (error) {
      setMessage({ text: summarizeError(error), ok: false })
    } finally {
      setBusy(false)
    }
  }

  const members = group?.members ?? []
  const memberInfo = group?.memberInfo ?? []

  return (
    <ScrollView
        navigationTitle={group?.name || groupId}
        navigationBarTitleDisplayMode="inline"
        background={PAGE_BG}
        scrollContentBackground="hidden"
        refreshable={load}
        toolbar={{
          topBarTrailing: [
            <Button
              key="rename"
              title="重命名"
              disabled={busy || !group}
              action={rename}
            />,
          ],
        }}
      >
        <VStack alignment="leading" spacing={UI.pageSpacing} padding={UI.pagePadding}>
          {error ? (
            <ErrorNotice
              message={error.error?.message ?? "读取路由组失败"}
              hint={error.error?.hint}
              raw={error.raw}
            />
          ) : null}

          {message ? (
            <Card tone={message.ok ? "green" : "red"}>
              <HStack spacing={8}>
                <Image
                  systemName={message.ok ? "checkmark.circle.fill" : "xmark.circle.fill"}
                  font={14}
                  foregroundStyle={message.ok ? TONES.green.fg : TONES.red.fg}
                />
                <Text font={13}>{message.text}</Text>
              </HStack>
            </Card>
          ) : null}

          {loading && !group ? <LoadingRow text="正在读取路由组" /> : null}

          {group ? (
            <Card>
              <HStack spacing={10}>
                <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  <Text font={17} fontWeight="semibold">{group.name || group.id}</Text>
                  <Text font={11} fontDesign="monospaced" foregroundStyle="secondaryLabel">
                    {group.ref || "group/" + group.id}
                  </Text>
                </VStack>
                <StatusPill kind={groupReady(group) ? "ok" : "error"} label={groupReady(group) ? "可用" : "异常"} compact />
              </HStack>
              <HStack spacing={10}>
                <CopyChip text={group.ref || "group/" + group.id} label="复制 ref" />
                <CopyChip text={members.join("\n")} label="复制成员" />
              </HStack>
              <HStack spacing={5}>
                <Tag text={`${members.length} 成员`} tone="blue" />
                {group.routing ? <Tag text={group.routing} tone="gray" /> : null}
                {group.affinity ? <Tag text={group.affinity} tone="purple" /> : null}
              </HStack>
            </Card>
          ) : null}

          {group?.classifierFailed ? (
            <Card tone="orange">
              <SectionHeader title="分类器失败" caption="路由组当前无法按意图挑选模型" />
              <Text font={13} foregroundStyle={TONES.orange.fg}>
                {group.classifierFailed.error || "未知错误"}
              </Text>
              <Text font={11} foregroundStyle="secondaryLabel">{group.classifierFailed.at || ""}</Text>
            </Card>
          ) : null}

          {group ? (
            <Card>
              <SectionHeader title="备注" caption="只存在于本机路由页，不会发送给模型" />
              <TextField title="Note" value={note} onChanged={setNote} prompt="这一组是做什么的" />
              <Button
                title={busy ? "保存中…" : "保存备注"}
                systemImage="checkmark"
                buttonStyle="bordered"
                disabled={busy || note === (group.note ?? "")}
                action={saveNote}
              />
            </Card>
          ) : null}

          {group ? (
            <Card>
              <SectionHeader title="成员" caption="按顺序尝试；就绪状态来自 catalog" />
              {members.length === 0 ? (
                <Text font={12} foregroundStyle="secondaryLabel">这个组没有成员，可能只靠 match 模式自动匹配。</Text>
              ) : (
                members.map((member, index) => {
                  const info = memberInfo.find(item => item.id === member)
                  return (
                    <HStack key={member} spacing={9} frame={{ maxWidth: "infinity" }}>
                      <Text font={11} foregroundStyle="tertiaryLabel" frame={{ width: 22 }}>{index + 1}</Text>
                      <Text font={13} fontDesign="monospaced" lineLimit={1} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                        {member}
                      </Text>
                      <StatusPill
                        kind={info ? (info.ready ? "ok" : "warn") : "idle"}
                        label={info ? (info.ready ? "就绪" : "不可用") : "未知"}
                        compact
                      />
                    </HStack>
                  )
                })
              )}
            </Card>
          ) : null}

          {group?.patterns && group.patterns.length > 0 ? (
            <Card>
              <SectionHeader title="匹配模式" caption="自动被发现并加入组的模型" />
              {group.patterns.map((pattern: any, index: number) => (
                <HStack key={index} spacing={10} frame={{ maxWidth: "infinity" }}>
                  <Text font={12} fontDesign="monospaced" frame={{ maxWidth: "infinity", alignment: "leading" }}>
                    {pattern.pattern || pattern.id || String(pattern)}
                  </Text>
                  {typeof pattern.matches === "number" ? <Tag text={`${pattern.matches} 个`} tone="gray" /> : null}
                </HStack>
              ))}
            </Card>
          ) : null}

          <Card>
            <SectionHeader title="成员编辑" caption="请在 magpie 应用中完成" />
            <Text font={12} foregroundStyle="secondaryLabel">
              新增成员、调整顺序、设置路由策略与亲和性需要整份组表单；脚本只发送备注与 id，不会覆盖这些字段。
            </Text>
          </Card>

          {!loading && !group && !error ? (
            <EmptyState icon="questionmark.folder" title="路由组不存在" message="它可能刚被删除，下拉刷新。" />
          ) : null}
        </VStack>
    </ScrollView>
  )
}