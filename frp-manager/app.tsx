// frp 管理器主界面：概览主卡片 + 服务器卡片 + 在线状态探测；添加 / 编辑在 sheet 中完成
import {
  Button,
  Dialog,
  Group,
  HStack,
  Image,
  List,
  Navigation,
  NavigationLink,
  NavigationStack,
  Section,
  Spacer,
  Text,
  Toolbar,
  ToolbarItem,
  useEffect,
  useState,
  VStack,
} from "scripting"
import {
  loadServers,
  persistServers,
  serverIsReady,
  setPassword,
  type FrpServer,
} from "./lib/servers"
import { probeHealthz } from "./lib/frpApi"
import { ServerEditView } from "./views/ServerEditView"
import { FrpcView } from "./views/FrpcView"
import { FrpsView } from "./views/FrpsView"
import { useMarkdownReleaseNotesSheet } from "./components/ReleaseNotesSheet"
import { BARE_ROW, EmptyState, HeroCard, IconBadge, LIST_STYLE, StatusPill, Tag, ValueText } from "./components/Kit"
import { UI, type Tone } from "./lib/theme"

export type ServerStatus = "checking" | "online" | "offline"

export function serverIcon(kind: FrpServer["kind"]): string {
  return kind === "frpc" ? "arrow.triangle.branch" : "server.rack"
}

export function serverTone(kind: FrpServer["kind"]): Tone {
  return kind === "frpc" ? "blue" : "accent"
}

type Editor = { mode: "add" } | { mode: "edit"; server: FrpServer }

export function FrpManagerApp() {
  const dismiss = Navigation.useDismiss()
  const releaseNotes = useMarkdownReleaseNotesSheet({
    markdownFile: "changelog.md",
    storageKey: "frp-manager:release-notes:last-seen-hash",
    title: "更新说明",
  })
  const [servers, setServers] = useState<FrpServer[]>(loadServers)
  const [statuses, setStatuses] = useState<Record<string, ServerStatus>>({})
  const [editor, setEditor] = useState<Editor | null>(null)

  async function probeAll(list: FrpServer[]) {
    const next: Record<string, ServerStatus> = {}
    for (const s of list) next[s.id] = "checking"
    setStatuses(next)
    await Promise.all(
      list.map(async (s) => {
        const online = serverIsReady(s)
          ? await probeHealthz({ baseUrl: s.url.trim(), username: "", password: "" })
          : false
        setStatuses((prev) => ({ ...prev, [s.id]: online ? "online" : "offline" }))
      })
    )
  }

  useEffect(() => {
    void probeAll(servers)
    // 仅在挂载时探测一次；下拉刷新与增删改时手动触发
    // eslint-disable-next-line
  }, [])

  function upsertServer(next: FrpServer, password: string) {
    const exists = servers.some((s) => s.id === next.id)
    const list = exists ? servers.map((s) => (s.id === next.id ? next : s)) : [...servers, next]
    persistServers(list)
    setServers(list)
    if (password !== "") setPassword(next.id, password)
    void probeAll(list)
  }

  async function removeServer(target: FrpServer) {
    const ok = await Dialog.confirm({
      title: "删除服务器？",
      message: `将从列表移除「${target.name}」，不会停止远端 frp。已存密码一并删除。`,
      confirmLabel: "删除",
      cancelLabel: "取消",
    })
    if (!ok) return
    const list = servers.filter((s) => s.id !== target.id)
    persistServers(list)
    setPassword(target.id, "")
    setServers(list)
    void probeAll(list)
  }

  const onlineCount = servers.filter((s) => statuses[s.id] === "online").length
  const checking = servers.some((s) => (statuses[s.id] ?? "checking") === "checking")
  const frpcCount = servers.filter((s) => s.kind === "frpc").length
  const frpsCount = servers.length - frpcCount

  const toolbar = (
    <Toolbar>
      <ToolbarItem placement="topBarLeading" sharedBackgroundVisibility="visible">
        <Button
          action={() => dismiss()}
          buttonStyle="plain"
          frame={{ width: 44, height: 44 }}
          contentShape="rect"
          accessibilityLabel="关闭"
        >
          <Image systemName="xmark" font="headline" foregroundStyle="label" />
        </Button>
      </ToolbarItem>
      <ToolbarItem placement="topBarTrailing" sharedBackgroundVisibility="visible">
        <Button
          action={() => setEditor({ mode: "add" })}
          buttonStyle="plain"
          frame={{ width: 44, height: 44 }}
          contentShape="rect"
          accessibilityLabel="添加服务器"
        >
          <Image systemName="plus" font="headline" foregroundStyle="label" />
        </Button>
      </ToolbarItem>
    </Toolbar>
  )

  return (
    <NavigationStack
      sheet={{
        isPresented: editor !== null,
        onChanged: (v: boolean) => {
          if (!v) setEditor(null)
        },
        content: (
          <ServerEditView
            key={editor?.mode === "edit" ? editor.server.id : "new"}
            initial={editor?.mode === "edit" ? editor.server : null}
            onDone={(s, pwd) => {
              if (s) upsertServer(s, pwd)
              setEditor(null)
            }}
          />
        ),
      }}
    >
      <List
        {...LIST_STYLE}
        navigationTitle="frp 管理器"
        toolbar={toolbar}
        sheet={releaseNotes}
        refreshable={async () => { await probeAll(servers) }}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      >
        <Section>
          <VStack {...BARE_ROW}>
            <HeroCard onTap={() => { void probeAll(servers) }}>
              <HStack spacing={8}>
                <Image systemName="point.3.connected.trianglepath.dotted" font={15} foregroundStyle="rgba(255,255,255,0.85)" />
                <Text font={14} fontWeight="semibold" foregroundStyle="rgba(255,255,255,0.85)">内网穿透</Text>
                <Spacer />
                <Text font={12} foregroundStyle="rgba(255,255,255,0.75)">{checking ? "检测中…" : "轻点重新检测"}</Text>
              </HStack>
              <ValueText
                value={String(onlineCount)}
                unit={`/ ${servers.length} 在线`}
                size={UI.heroFont}
                color="white"
                unitColor="rgba(255,255,255,0.75)"
              />
              <HStack spacing={8}>
                <HeroChip icon={serverIcon("frpc")} text={`frpc ${frpcCount}`} />
                <HeroChip icon={serverIcon("frps")} text={`frps ${frpsCount}`} />
              </HStack>
            </HeroCard>
          </VStack>
        </Section>

        <Section
          header={<Text>服务器</Text>}
          footer={
            <Text font={13}>
              左滑条目可编辑 / 删除。frpc 填 admin 端口，frps 填 dashboard 端口；状态为 /healthz 探测结果。
            </Text>
          }
        >
          {servers.length === 0 ? (
            <VStack spacing={12} padding={{ vertical: 6 }}>
              <EmptyState icon="server.rack" title="还没有服务器" message="添加 frpc 客户端或 frps 服务端条目后即可管理代理" />
              <Button
                title="添加服务器"
                systemImage="plus"
                buttonStyle="borderedProminent"
                action={() => setEditor({ mode: "add" })}
              />
            </VStack>
          ) : (
            servers.map((s) => (
              <NavigationLink
                key={s.id}
                destination={
                  s.kind === "frpc" ? <FrpcView server={s} /> : <FrpsView server={s} />
                }
              >
                <HStack
                  spacing={12}
                  padding={{ vertical: 4 }}
                  frame={{ maxWidth: "infinity", alignment: "leading" }}
                  trailingSwipeActions={{
                    allowsFullSwipe: false,
                    actions: [
                      <Button title="删除" role="destructive" action={() => { void removeServer(s) }} />,
                      <Button title="编辑" action={() => setEditor({ mode: "edit", server: s })} />,
                    ],
                  }}
                  contextMenu={{
                    menuItems: (
                      <Group>
                        <Button title="编辑" systemImage="pencil" action={() => setEditor({ mode: "edit", server: s })} />
                        <Button title="删除" systemImage="trash" role="destructive" action={() => { void removeServer(s) }} />
                      </Group>
                    ),
                  }}
                >
                  <IconBadge icon={serverIcon(s.kind)} tone={serverTone(s.kind)} size={40} filled />
                  <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                    <HStack spacing={6}>
                      <Text font={16} fontWeight="semibold" lineLimit={1}>{s.name}</Text>
                      <Tag text={s.kind} tone={serverTone(s.kind)} mono />
                    </HStack>
                    <Text font={12} fontDesign="monospaced" foregroundStyle="secondaryLabel" lineLimit={1}>
                      {s.url || "未填写地址"}
                    </Text>
                  </VStack>
                  <ServerStatusPill status={statuses[s.id] ?? "checking"} />
                </HStack>
              </NavigationLink>
            ))
          )}
        </Section>
      </List>
    </NavigationStack>
  )
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

export function ServerStatusPill({ status }: { status: ServerStatus }) {
  if (status === "checking") return <StatusPill kind="busy" label="检测中" compact />
  return status === "online"
    ? <StatusPill kind="ok" label="在线" compact />
    : <StatusPill kind="error" label="离线" compact />
}
