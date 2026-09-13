// frp 管理器主界面：服务器条目列表 + 在线状态探测
import {
  Button,
  Dialog,
  HStack,
  Image,
  List,
  Navigation,
  NavigationLink,
  NavigationStack,
  Section,
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

export type ServerStatus = "checking" | "online" | "offline"

export function serverIcon(kind: FrpServer["kind"]): string {
  return kind === "frpc" ? "arrow.triangle.branch" : "server.rack"
}

export function FrpManagerApp() {
  const dismiss = Navigation.useDismiss()
  const [servers, setServers] = useState<FrpServer[]>(loadServers)
  const [statuses, setStatuses] = useState<Record<string, ServerStatus>>({})
  const [editing, setEditing] = useState<FrpServer | null>(null)
  const [adding, setAdding] = useState(false)

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

  if (adding) {
    return (
      <ServerEditView initial={null} onDone={(s, pwd) => { if (s) upsertServer(s, pwd); setAdding(false) }} />
    )
  }
  if (editing) {
    return (
      <ServerEditView
        initial={editing}
        onDone={(s, pwd) => { if (s) upsertServer(s, pwd); setEditing(null) }}
      />
    )
  }

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
          action={() => setAdding(true)}
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
    <NavigationStack toolbar={toolbar}>
      <List
        navigationTitle="frp 管理器"
        refreshable={async () => { await probeAll(servers) }}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      >
        <Section
          footer={
            <Text font={13}>
              左右滑动条目可编辑 / 删除。frpc 填 admin 端口，frps 填 dashboard 端口；状态为 /healthz 探测结果。
            </Text>
          }
        >
          {servers.length === 0 ? (
            <Text font={15} foregroundStyle="secondaryLabel">
              还没有服务器。点右上角 + 添加 frpc / frps 条目。
            </Text>
          ) : (
            servers.map((s) => (
              <NavigationLink
                key={s.id}
                destination={
                  s.kind === "frpc" ? <FrpcView server={s} /> : <FrpsView server={s} />
                }
              >
                <HStack
                  spacing={10}
                  frame={{ maxWidth: "infinity", alignment: "leading" }}
                  trailingSwipeActions={{
                    allowsFullSwipe: false,
                    actions: [
                      <Button title="删除" role="destructive" action={() => { void removeServer(s) }} />,
                      <Button title="编辑" action={() => setEditing(s)} />,
                    ],
                  }}
                >
                  <Image
                    systemName={serverIcon(s.kind)}
                    font={20}
                    foregroundStyle={s.kind === "frpc" ? "systemBlue" : "systemIndigo"}
                    frame={{ width: 28, height: 28 }}
                  />
                  <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                    <HStack spacing={6}>
                      <Text font={17}>{s.name}</Text>
                      <Text font={11} foregroundStyle="secondaryLabel">{s.kind}</Text>
                    </HStack>
                    <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>
                      {s.url}
                    </Text>
                  </VStack>
                  <StatusDot status={statuses[s.id] ?? "checking"} />
                </HStack>
              </NavigationLink>
            ))
          )}
        </Section>
        <Section>
          <Button title="添加服务器" systemImage="plus.circle" action={() => setAdding(true)} />
        </Section>
      </List>
    </NavigationStack>
  )
}

function StatusDot({ status }: { status: ServerStatus }) {
  if (status === "checking") {
    return <Text font={12} foregroundStyle="tertiaryLabel">检测中…</Text>
  }
  const online = status === "online"
  return (
    <HStack spacing={4}>
      <Image
        systemName="circle.fill"
        font={9}
        foregroundStyle={online ? "systemGreen" : "systemRed"}
      />
      <Text font={12} foregroundStyle={online ? "systemGreen" : "systemRed"}>
        {online ? "在线" : "离线"}
      </Text>
    </HStack>
  )
}
