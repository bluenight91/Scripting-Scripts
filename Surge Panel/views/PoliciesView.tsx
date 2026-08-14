// 策略 Tab：策略组列表 + 节点钻取
import {
  Button,
  HStack,
  Image,
  List,
  NavigationLink,
  ProgressView,
  Script,
  Section,
  Text,
  TextField,
  useEffect,
  useState,
  VStack,
} from "scripting"
import {
  getPolicies,
  getPolicyBenchmarks,
  getPolicyDetail,
  getPolicyGroupSelection,
  getPolicyGroups,
  getGroupTestResults,
  getCurrentProfile,
  orderPolicyGroupNames,
  parseProxyGroupOrder,
  selectPolicyGroup,
  testPolicies,
  testPolicyGroup,
  type PolicyBenchmarkResult,
  type PolicyOption,
} from "../lib/surgeApi"
import { HomeTitleWrapper } from "../components/HomeTitleWrapper"
import { formatDelay } from "../lib/metrics"
import { useStore } from "../lib/store"
import { connectErrorText } from "../lib/ui"

export function PoliciesView() {
  const state = useStore()
  const [groups, setGroups] = useState<Record<string, PolicyOption[]> | null>(null)
  const [groupOrder, setGroupOrder] = useState<string[]>([])
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const g = await getPolicyGroups(state.config)
      setGroups(g)
      const apiNames = Object.keys(g)
      try {
        const raw = await getCurrentProfile(state.config)
        const profile = typeof raw === "string" ? raw : raw.profile ?? ""
        setGroupOrder(orderPolicyGroupNames(apiNames, parseProxyGroupOrder(profile)))
      } catch {
        setGroupOrder(apiNames)
      }
      // 逐组查询当前选中项（url-test 等组可能不支持，忽略失败）
      const results = await Promise.all(
        apiNames.map(async (n) => {
          try {
            const r = await getPolicyGroupSelection(state.config, n)
            return [n, r.policy] as const
          } catch {
            return null
          }
        })
      )
      const sel: Record<string, string> = {}
      for (const r of results) if (r) sel[r[0]] = r[1]
      setSelections(sel)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [state.config])

  const names = groups ? (groupOrder.length ? groupOrder : Object.keys(groups)) : []
  const q = query.trim().toLowerCase()
  const filtered = q ? names.filter((n) => n.toLowerCase().includes(q)) : names

  return (
    <HomeTitleWrapper title="策略">
    <List
      navigationTitle={Script.env === "home_screen" ? undefined : "策略"}
      refreshable={async () => { await load() }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <Section>
        <TextField title="搜索" value={query} onChanged={setQuery} prompt="策略组名称" />
      </Section>
      {error ? (
        <Section>
          <Text foregroundStyle="systemRed">{connectErrorText(error, "加载失败")}</Text>
          <Button title="重试" action={load} />
        </Section>
      ) : null}
      {loading && !groups ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">加载中…</Text>
        </Section>
      ) : null}
      {groups ? (
        <Section footer={<Text font={13}>{q ? `${filtered.length} / ${names.length} 个策略组` : `${names.length} 个策略组`}</Text>}>
          {filtered.length === 0 ? (
            <Text foregroundStyle="secondaryLabel">{q ? "无匹配策略组" : "暂无策略组"}</Text>
          ) : (
            filtered.map((name) => {
            const options = groups[name]
            const selected = selections[name]
            return (
              <NavigationLink
                key={name}
                destination={
                  <GroupDetailView
                    groupName={name}
                    options={options}
                    initialSelection={selected ?? null}
                    onChanged={() => {
                      getPolicyGroupSelection(state.config, name)
                        .then((r) => setSelections((s) => ({ ...s, [name]: r.policy })))
                        .catch(() => {})
                    }}
                  />
                }
              >
                <VStack alignment="leading" spacing={3}>
                  <Text font={17} lineLimit={1} minScaleFactor={0.8}>{name}</Text>
                  <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.8}>
                    {selected ?? `${options.length} 个选项`}
                  </Text>
                </VStack>
              </NavigationLink>
            )
          })
          )}
        </Section>
      ) : null}
    </List>
    </HomeTitleWrapper>
  )
}

export function GroupDetailView({
  groupName,
  options,
  initialSelection,
  onChanged,
}: {
  groupName: string
  options: PolicyOption[]
  initialSelection: string | null
  onChanged: () => void
}) {
  const state = useStore()
  const [selection, setSelection] = useState<string | null>(initialSelection)
  const [standalone, setStandalone] = useState<Set<string> | null>(null)
  const [details, setDetails] = useState<Record<string, string>>({})
  const [delays, setDelays] = useState<Record<string, number | null>>({})
  const [elected, setElected] = useState<string[] | null>(null)
  // 是否为 url-test/fallback/load-balance 自动组（只有这类组的组测速是真基准测试）
  const [autoGroup, setAutoGroup] = useState<boolean | null>(null)
  // 自动组当前已当选节点（来自既有 test_results，未测速也可展示）
  const [autoElected, setAutoElected] = useState<string[] | null>(null)
  const [testing, setTesting] = useState(false)
  const [testProgress, setTestProgress] = useState("")
  const [selecting, setSelecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Surge 基准测试缓存（按 lineHash），覆盖所有节点含内嵌/链式
  const [benchmarks, setBenchmarks] = useState<Record<
    string,
    PolicyBenchmarkResult
  > | null>(null)

  function refreshBenchmarks() {
    return getPolicyBenchmarks(state.config)
      .then((r) => setBenchmarks(r ?? {}))
      .catch(() => setBenchmarks({}))
  }

  useEffect(() => {
    refreshBenchmarks()
  }, [state.config])

  // 独立策略（/v1/policies）才能单独测延迟；组内嵌节点 HTTP API 不支持延迟测试
  useEffect(() => {
    let cancelled = false
    getPolicies(state.config)
      .then((r) => {
        if (!cancelled) setStandalone(new Set(r.proxies))
      })
      .catch(() => {
        if (!cancelled) setStandalone(new Set())
      })
    return () => {
      cancelled = true
    }
  }, [state.config])

  const isStandalone = (name: string) => standalone?.has(name) ?? false

  // test_results 只包含 url-test/fallback/load-balance 组——据此判断组类型
  useEffect(() => {
    let cancelled = false
    getGroupTestResults(state.config)
      .then((r) => {
        if (cancelled) return
        const keys = Object.keys(r ?? {})
        setAutoGroup(keys.includes(groupName))
        const cur = r?.[groupName]
        if (Array.isArray(cur)) {
          setAutoElected(
            cur.map((v) => (typeof v === "string" ? v : v.policy))
          )
        }
      })
      .catch(() => {
        if (!cancelled) setAutoGroup(false)
      })
    return () => {
      cancelled = true
    }
  }, [state.config, groupName])

  // 独立策略拉取原始配置行展示
  useEffect(() => {
    if (!standalone) return
    let cancelled = false
    options
      .filter((o) => !o.isGroup && standalone.has(o.name))
      .forEach((o) => {
        getPolicyDetail(state.config, o.name)
          .then((r) => {
            const v = r?.[o.name]
            if (v && !cancelled) setDetails((d) => ({ ...d, [o.name]: v }))
          })
          .catch(() => {})
      })
    return () => {
      cancelled = true
    }
  }, [standalone, state.config])

  async function select(policy: string) {
    if (policy === selection || selecting) return
    setSelecting(policy)
    setError(null)
    try {
      await selectPolicyGroup(state.config, groupName, policy)
      setSelection(policy)
      onChanged()
    } catch (e) {
      setError(String(e))
    } finally {
      setSelecting(null)
    }
  }

  async function testAll() {
    if (testing) return
    setTesting(true)
    setError(null)
    setDelays({})
    setElected(null)

    // 1) 组测速：仅自动组（url-test 等）是真基准测试；select 手动组只会回显当前选中，跳过
    const groupTest = (async () => {
      if (autoGroup !== true) return
      try {
        setTestProgress("组测速中…")
        const r = await testPolicyGroup(state.config, groupName)
        setElected(r?.available ?? [])
      } catch {
        // 部分组类型不支持，忽略
      }
    })()

    // 2) 独立策略逐个测延迟（任一节点失败会导致整批响应为空，故逐个调用）
    const latencyTest = (async () => {
      const names = options
        .filter((o) => !o.isGroup && o.enabled && isStandalone(o.name))
        .map((o) => o.name)
      const result: Record<string, number | null> = {}
      let done = 0
      for (const n of names) {
        try {
          const r = await testPolicies(state.config, [n])
          const v = r ? r[n]?.["round-one-total"] : undefined
          result[n] = typeof v === "number" ? v : null
        } catch {
          result[n] = null
        }
        done++
        setTestProgress(`延迟测试 ${done}/${names.length}…`)
        setDelays({ ...result })
      }
    })()

    await Promise.all([groupTest, latencyTest])
    // 组测速完成后 Surge 会更新基准测试缓存，重新拉取以刷新所有节点的延迟显示
    await refreshBenchmarks()
    setTestProgress("")
    setTesting(false)
  }

  return (
    <List navigationTitle={groupName}>
      {error ? (
        <Section>
          <Text foregroundStyle="systemRed">{error}</Text>
        </Section>
      ) : null}
      <Section
        footer={
          <Text font={13}>
            {testing
              ? testProgress || "测速中…"
              : autoGroup === false
              ? "点按节点即可切换。延迟来自 Surge 基准测试缓存（含内嵌/链式节点，由 Surge 后台定期自动更新）；手动选择组不支持面板内组测速"
              : "点按节点即可切换。延迟来自 Surge 基准测试缓存；「全部测速」触发 Surge 对本组重新基准测试，绿色「最优」为当选节点"}
          </Text>
        }
      >
        <Button
          title={testing ? "测速中…" : "全部测速"}
          systemImage="speedometer"
          disabled={testing}
          action={testAll}
        />
      </Section>
      <Section>
        {options.map((o) => {
          const isSelected = o.name === selection
          const delay = delays[o.name]
          const electedList = elected ?? autoElected
          const isElected =
            autoGroup === true && (electedList?.includes(o.name) ?? false)
          const bm = o.isGroup ? undefined : benchmarks?.[o.lineHash]
          const bmScore = bm?.lastTestScoreInMS
          const bmFailed =
            bm != null && bmScore === 0 && bm.lastTestErrorMessage != null
          return (
            <HStack
              key={o.lineHash}
              spacing={10}
              onTapGesture={() => select(o.name)}
            >
              <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <Text font={17} lineLimit={1} minScaleFactor={0.7}>{o.name}</Text>
                <Text font={13} foregroundStyle="secondaryLabel">{o.typeDescription}</Text>
                {details[o.name] ? (
                  <Text font={12} foregroundStyle="tertiaryLabel" lineLimit={1} minScaleFactor={0.7}>
                    {details[o.name]}
                  </Text>
                ) : null}
              </VStack>
              {selecting === o.name ? (
                <ProgressView />
              ) : isElected ? (
                <Text font={13} foregroundStyle="systemGreen">最优</Text>
              ) : delay !== undefined ? (
                <Text
                  font={13}
                  foregroundStyle={
                    delay === null ? "systemRed" : delay < 300 ? "systemGreen" : delay < 800 ? "systemOrange" : "systemRed"
                  }
                >
                  {delay === null ? "失败" : formatDelay(delay)}
                </Text>
              ) : bm?.testing ? (
                <ProgressView />
              ) : bmScore !== undefined && bmScore > 0 ? (
                <Text
                  font={13}
                  foregroundStyle={
                    bmScore < 300 ? "systemGreen" : bmScore < 800 ? "systemOrange" : "systemRed"
                  }
                >
                  {formatDelay(bmScore)}
                </Text>
              ) : bmFailed ? (
                <Text font={13} foregroundStyle="systemRed">失败</Text>
              ) : null}
              {isSelected ? (
                <Image systemName="checkmark.circle.fill" foregroundStyle="systemBlue" font={18} />
              ) : null}
            </HStack>
          )
        })}
      </Section>
    </List>
  )
}
