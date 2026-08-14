// 网络 Tab：活动连接 / 最近请求 / 事件中心 / DNS 缓存
import {
  Button,
  HStack,
  Image,
  List,
  NavigationLink,
  Script,
  Section,
  Spacer,
  Text,
  TextField,
  useEffect,
  useState,
  VStack,
} from "scripting"
import {
  flushDns,
  getActiveRequests,
  getDns,
  getEvents,
  getRecentRequests,
  killRequest,
  testDnsDelay,
  type DnsEntry,
  type SurgeEvent,
  type SurgeRequest,
} from "../lib/surgeApi"
import { formatBytes, formatEventTime, formatSpeed } from "../lib/metrics"
import { useStore } from "../lib/store"
import { HomeTitleWrapper } from "../components/HomeTitleWrapper"
import { RulesView } from "./RulesView"

export function NetworkView() {
  return (
    <HomeTitleWrapper title="网络">
    <List navigationTitle={Script.env === "home_screen" ? undefined : "网络"}>
      <Section
        footer={
          <Text font={13}>
            活动连接支持长按终止；最近请求展示规则命中与失败状态。数据来自 Surge HTTP API（/v1/requests、/v1/events、/v1/dns）。
          </Text>
        }
      >
        <NavigationLink title="活动连接" destination={<ActiveConnectionsView />} />
        <NavigationLink title="最近请求" destination={<RecentRequestsView />} />
        <NavigationLink title="事件中心" destination={<EventsView />} />
        <NavigationLink title="DNS 缓存" destination={<DnsView />} />
        <NavigationLink title="规则浏览器" destination={<RulesView />} />
      </Section>
    </List>
    </HomeTitleWrapper>
  )
}

// ---------- 活动连接 ----------

function ActiveConnectionsView() {
  const state = useStore()
  const [requests, setRequests] = useState<SurgeRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const r = await getActiveRequests(state.config)
      setRequests(r.requests.slice().reverse())
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <List
      navigationTitle="活动连接"
      toolbar={{
        topBarTrailing: <Button title="刷新" systemImage="arrow.clockwise" action={load} />,
      }}
    >
      {error ? (
        <Section>
          <Text foregroundStyle="systemRed">{error}</Text>
        </Section>
      ) : null}
      {requests === null ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">加载中…</Text>
        </Section>
      ) : requests.length === 0 ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">当前没有活动连接</Text>
        </Section>
      ) : (
        <Section footer={<Text font={12}>点按查看详情，详情页可终止连接</Text>}>
          {requests.map((r) => (
            <NavigationLink key={r.id} destination={<RequestDetailView r={r} active onKilled={load} />}>
              <RequestRow r={r} active />
            </NavigationLink>
          ))}
        </Section>
      )}
    </List>
  )
}

// ---------- 最近请求 ----------

function RecentRequestsView() {
  const state = useStore()
  const [requests, setRequests] = useState<SurgeRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const r = await getRecentRequests(state.config)
      setRequests(r.requests.slice().reverse())
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <List
      navigationTitle="最近请求"
      toolbar={{
        topBarTrailing: <Button title="刷新" systemImage="arrow.clockwise" action={load} />,
      }}
    >
      {error ? (
        <Section>
          <Text foregroundStyle="systemRed">{error}</Text>
        </Section>
      ) : null}
      {requests === null ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">加载中…</Text>
        </Section>
      ) : (
        <Section>
          {requests.map((r) => (
            <NavigationLink key={r.id} destination={<RequestDetailView r={r} />}>
              <RequestRow r={r} />
            </NavigationLink>
          ))}
        </Section>
      )}
    </List>
  )
}

// ---------- 请求行 / 详情 ----------

function RequestRow({ r, active }: { r: SurgeRequest; active?: boolean }) {
  return (
    <VStack alignment="leading" spacing={4}>
      <HStack spacing={6}>
        {r.failed ? (
          <Image systemName="xmark.octagon.fill" foregroundStyle="systemRed" font={12} />
        ) : r.rejected ? (
          <Image systemName="hand.raised.fill" foregroundStyle="systemOrange" font={12} />
        ) : null}
        <Text font={16} lineLimit={1} minScaleFactor={0.6}>
          {r.remoteHost ?? r.URL}
        </Text>
      </HStack>
      <HStack spacing={8}>
        <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>
          {active ? r.policyName : `${r.method ?? ""} ${r.policyName}`}
        </Text>
        <Spacer />
        {active ? (
          <>
            <Text font={12} foregroundStyle="systemBlue">{`↓${formatSpeed(r.inCurrentSpeed ?? 0)}`}</Text>
            <Text font={12} foregroundStyle="systemGreen">{`↑${formatSpeed(r.outCurrentSpeed ?? 0)}`}</Text>
          </>
        ) : (
          <Text font={12} foregroundStyle="secondaryLabel">
            {formatBytes((r.inBytes ?? 0) + (r.outBytes ?? 0))}
          </Text>
        )}
      </HStack>
      {r.rule ? (
        <Text font={12} foregroundStyle="tertiaryLabel" lineLimit={1}>{r.rule}</Text>
      ) : null}
    </VStack>
  )
}

function fmtDateTime(ms?: number): string {
  if (!ms) return "—"
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function InfoRow({ label, value, selectable }: { label: string; value?: string | null; selectable?: boolean }) {
  if (value == null || value === "") return null
  return (
    <HStack spacing={8}>
      <Text font={13} foregroundStyle="secondaryLabel">{label}</Text>
      <Spacer />
      <Text font={13} lineLimit={selectable ? undefined : 2} minScaleFactor={0.7} multilineTextAlignment="trailing">
        {value}
      </Text>
    </HStack>
  )
}

function RequestDetailView({
  r,
  active,
  onKilled,
}: {
  r: SurgeRequest
  active?: boolean
  onKilled?: () => void
}) {
  const state = useStore()
  const [showKill, setShowKill] = useState(false)
  const [killMsg, setKillMsg] = useState<string | null>(null)

  async function doKill() {
    try {
      await killRequest(state.config, r.id)
      setKillMsg("已终止该连接")
      onKilled?.()
    } catch (e) {
      setKillMsg(`终止失败：${String(e)}`)
    }
  }

  return (
    <List
      navigationTitle="请求详情"
      confirmationDialog={{
        isPresented: showKill,
        onChanged: setShowKill,
        title: "确认终止该连接？",
        actions: <Button title="终止" role="destructive" action={doKill} />,
      }}
    >
      {/* 概览 */}
      <Section header={<Text>概览</Text>}>
        <VStack alignment="leading" spacing={3}>
          <Text font={12} foregroundStyle="secondaryLabel">完整地址</Text>
          <Text font={13}>{r.URL}</Text>
        </VStack>
        <InfoRow label="方法" value={r.method} />
        <InfoRow label="状态" value={r.status ?? (r.completed ? "已完成" : active ? "进行中" : undefined)} />
        <InfoRow label="策略" value={r.policyName} />
        <InfoRow label="原始策略" value={r.originalPolicyName !== r.policyName ? r.originalPolicyName : undefined} />
        <InfoRow label="匹配规则" value={r.rule} />
        <InfoRow label="设备" value={r.deviceName} />
        <InfoRow label="来源" value={r.source} />
        <InfoRow label="远端" value={r.remoteAddress ? `${r.remoteAddress}${r.remoteHost && r.remoteHost !== r.remoteAddress ? `（${r.remoteHost}）` : ""}` : r.remoteHost} />
        <InfoRow label="本机" value={r.localAddress} />
        <InfoRow label="接口" value={r.interface} />
        <InfoRow label="开始时间" value={fmtDateTime(r.startDate)} />
        {r.completedDate ? <InfoRow label="完成时间" value={fmtDateTime(r.completedDate)} /> : null}
      </Section>

      {/* 流量 */}
      <Section header={<Text>流量</Text>}>
        <InfoRow label="下载总量" value={formatBytes(r.inBytes ?? 0)} />
        <InfoRow label="上传总量" value={formatBytes(r.outBytes ?? 0)} />
        {active ? (
          <>
            <InfoRow label="实时下载" value={formatSpeed(r.inCurrentSpeed ?? 0)} />
            <InfoRow label="实时上传" value={formatSpeed(r.outCurrentSpeed ?? 0)} />
          </>
        ) : null}
        {r.inMaxSpeed ? <InfoRow label="峰值下载" value={formatSpeed(r.inMaxSpeed)} /> : null}
        {r.outMaxSpeed ? <InfoRow label="峰值上传" value={formatSpeed(r.outMaxSpeed)} /> : null}
      </Section>

      {/* 决策过程 */}
      {r.notes && r.notes.length > 0 ? (
        <Section header={<Text>决策过程</Text>}>
          {r.notes.map((n, i) => (
            <Text key={i} font={12} lineLimit={3}>{n}</Text>
          ))}
        </Section>
      ) : null}

      {/* 耗时分解 */}
      {r.timingRecords && r.timingRecords.length > 0 ? (
        <Section header={<Text>耗时分解</Text>}>
          {r.timingRecords.map((t, i) => (
            <HStack key={i}>
              <Text font={13}>{t.name}</Text>
              <Spacer />
              <Text font={13} foregroundStyle="secondaryLabel">
                {t.durationInMillisecond < 1 ? "<1 ms" : `${Math.round(t.durationInMillisecond)} ms`}
              </Text>
            </HStack>
          ))}
        </Section>
      ) : null}

      {/* 终止连接 */}
      {active && !r.completed ? (
        <Section footer={killMsg ? <Text font={12}>{killMsg}</Text> : undefined}>
          <Button title="终止连接" role="destructive" systemImage="xmark.circle" action={() => setShowKill(true)} />
        </Section>
      ) : null}
    </List>
  )
}

// ---------- 事件中心 ----------

function EventsView() {
  const state = useStore()
  const [events, setEvents] = useState<SurgeEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const r = await getEvents(state.config)
      setEvents(r.events.slice().reverse())
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <List
      navigationTitle="事件中心"
      toolbar={{
        topBarTrailing: <Button title="刷新" systemImage="arrow.clockwise" action={load} />,
      }}
    >
      {error ? (
        <Section>
          <Text foregroundStyle="systemRed">{error}</Text>
        </Section>
      ) : null}
      {events === null ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">加载中…</Text>
        </Section>
      ) : events.length === 0 ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">暂无事件</Text>
        </Section>
      ) : (
        <Section>
          {events.map((e) => (
            <VStack key={e.identifier} alignment="leading" spacing={2}>
              <Text font={14} fontWeight="medium" lineLimit={4}>
                {e.content ?? e.identifier}
              </Text>
              <Text font={11} foregroundStyle="tertiaryLabel">
                {formatEventTime(e.date)}
              </Text>
            </VStack>
          ))}
        </Section>
      )}
    </List>
  )
}

// ---------- DNS 缓存 ----------

function DnsView() {
  const state = useStore()
  const [cache, setCache] = useState<DnsEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showFlush, setShowFlush] = useState(false)
  const [flushed, setFlushed] = useState(false)
  const [testDomain, setTestDomain] = useState("www.apple.com")
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  async function runDnsTest() {
    const domain = testDomain.trim()
    if (!domain || testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const r = await testDnsDelay(state.config, domain)
      setTestResult(`${domain} 解析延迟 ${Math.round((r?.delay ?? 0) * 1000)} ms`)
    } catch (e) {
      setTestResult(`测试失败：${String(e)}`)
    } finally {
      setTesting(false)
    }
  }

  async function load() {
    try {
      const r = await getDns(state.config)
      setCache(r.dnsCache)
      setError(null)
      setFlushed(false)
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function doFlush() {
    try {
      await flushDns(state.config)
      setFlushed(true)
      await load()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <List
      navigationTitle="DNS 缓存"
      confirmationDialog={{
        isPresented: showFlush,
        onChanged: setShowFlush,
        title: "清除全部 DNS 缓存？",
        actions: <Button title="清除" role="destructive" action={doFlush} />,
      }}
    >
      <Section
        header={<Text>DNS 延迟测试</Text>}
        footer={testResult ? <Text font={12}>{testResult}</Text> : undefined}
      >
        <TextField title="域名" value={testDomain} onChanged={setTestDomain} prompt="www.apple.com" />
        <Button
          title={testing ? "测试中…" : "测试解析延迟"}
          systemImage="timer"
          disabled={testing}
          action={runDnsTest}
        />
      </Section>
      <Section>
        <Button title="清除 DNS 缓存" systemImage="trash" role="destructive" action={() => setShowFlush(true)} />
        {flushed ? <Text font={12} foregroundStyle="systemGreen">已清除并重新加载</Text> : null}
      </Section>
      {error ? (
        <Section>
          <Text foregroundStyle="systemRed">{error}</Text>
        </Section>
      ) : null}
      {cache === null ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">加载中…</Text>
        </Section>
      ) : (
        <Section
          header={<Text>{`${cache.length} 条缓存`}</Text>}
          footer={<Text font={12}>点按条目查看解析结果、CNAME 链路与查询日志；条数为 Surge 当前缓存量（上限约 200，满了会逐出最旧条目）</Text>}
        >
          {cache.map((e, i) => (
            <NavigationLink key={`${e.domain}-${i}`} destination={<DnsDetailView e={e} />}>
              <VStack alignment="leading" spacing={2}>
                <Text font={14} lineLimit={1} minScaleFactor={0.7}>{e.domain}</Text>
                <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>
                  {`${e.data?.join("、") ?? "—"} · ${e.server ?? ""}`}
                </Text>
              </VStack>
            </NavigationLink>
          ))}
        </Section>
      )}
    </List>
  )
}

// ---------- DNS 缓存详情 ----------

function DnsDetailView({ e }: { e: DnsEntry }) {
  const expireText = (() => {
    if (!e.expiresTime) return null
    const ms = e.expiresTime * 1000
    const remainMin = Math.max(0, Math.round((ms - Date.now()) / 60000))
    return fmtDateTime(ms) + `（剩余约 ${remainMin} 分钟）`
  })()

  return (
    <List navigationTitle={e.domain}>
      {/* 解析结果 */}
      <Section header={<Text>解析结果</Text>}>
        {e.data && e.data.length > 0 ? (
          e.data.map((ip, i) => (
            <HStack key={i}>
              <Text font={14}>{ip}</Text>
              <Spacer />
            </HStack>
          ))
        ) : (
          <Text font={13} foregroundStyle="secondaryLabel">无解析记录</Text>
        )}
      </Section>

      {/* 查询信息 */}
      <Section header={<Text>查询信息</Text>}>
        <InfoRow label="DNS 服务器" value={e.server ?? "系统默认"} />
        <InfoRow label="网络接口" value={e.interface || undefined} />
        <InfoRow
          label="查询耗时"
          value={e.timeCost != null ? `${Math.round(e.timeCost * 1000)} ms` : undefined}
        />
        <InfoRow label="过期时间" value={expireText} />
      </Section>

      {/* CNAME 链路 */}
      {e.path ? (
        <Section header={<Text>CNAME 解析链路</Text>}>
          <Text font={12}>{e.path}</Text>
        </Section>
      ) : null}

      {/* 查询日志 */}
      {e.logs && e.logs.length > 0 ? (
        <Section header={<Text>查询日志</Text>}>
          {e.logs.map((log, i) => (
            <Text key={i} font={12} lineLimit={4}>{log}</Text>
          ))}
        </Section>
      ) : null}
    </List>
  )
}
