import {
  List,
  Picker,
  Section,
  Text,
  Toggle,
  Widget,
  useEffect,
  useState,
} from "scripting"
import { instanceToConfig } from "../lib/instances"
import { getPolicyGroups, getRules } from "../lib/surgeApi"
import {
  readWidgetPrefs,
  markWidgetRefreshRequested,
  saveWidgetPrefs,
  widgetInstance,
  type WidgetPrefs,
  type WidgetRefreshMin,
} from "../lib/widgetPrefs"

const FOLLOW = "__follow__"

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function WidgetSettingsView() {
  const [prefs, setPrefs] = useState<WidgetPrefs>(readWidgetPrefs())
  const [policies, setPolicies] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const { instances, instance } = widgetInstance(prefs)

  function persist(next: WidgetPrefs) {
    setPrefs(next)
    saveWidgetPrefs(next)
    markWidgetRefreshRequested()
    Widget.reloadAll()
  }

  useEffect(() => {
    if (!instance) {
      setPolicies([])
      return
    }
    let cancelled = false
    const config = instanceToConfig(instance)
    Promise.all([
      getPolicyGroups(config).catch(() => ({})),
      getRules(config).catch(() => ({ rules: [], "available-policies": [] })),
    ])
      .then(([groups, rules]) => {
        if (cancelled) return
        setPolicies(unique([...Object.keys(groups), ...(rules["available-policies"] ?? [])]))
        setError(null)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [instance?.id])

  const options = unique([
    prefs.policy,
    prefs.mediaPolicy,
    prefs.aiPolicy,
    ...policies,
  ])

  return (
    <List navigationTitle="桌面组件">
      <Section
        header={<Text>数据实例</Text>}
        footer={
          <Text font={13}>
            桌面组件在后台只读取此实例，不会启动面板的秒级轮询。组件参数中的 instanceId 可单独覆盖。
          </Text>
        }
      >
        {instances.length === 0 ? (
          <Text foregroundStyle="secondaryLabel">请先添加 Surge HTTP API 实例</Text>
        ) : (
          <Picker
            title="实例"
            value={instance?.id ?? ""}
            onChanged={(id: string) => persist({ ...prefs, instanceId: id })}
          >
            {instances.map((item) => (
              <Text key={item.id} tag={item.id}>{item.name}</Text>
            ))}
          </Picker>
        )}
      </Section>

      <Section
        header={<Text>诊断策略</Text>}
        footer={
          <Text font={13}>
            规则模式没有唯一当前节点。选择一个策略或策略组后，出口、延迟和 HTTP/3 都通过该策略检测；“默认规则”则按 Surge 规则路由。
          </Text>
        }
      >
        <Picker
          title="主要策略"
          value={prefs.policy || FOLLOW}
          onChanged={(value: string) =>
            persist({ ...prefs, policy: value === FOLLOW ? "" : value })
          }
        >
          <Text tag={FOLLOW}>默认规则</Text>
          <Text tag="DIRECT">DIRECT</Text>
          {options.filter((name) => name !== "DIRECT").map((name) => (
            <Text key={name} tag={name}>{name}</Text>
          ))}
        </Picker>
        <Picker
          title="流媒体策略"
          value={prefs.mediaPolicy || FOLLOW}
          onChanged={(value: string) =>
            persist({ ...prefs, mediaPolicy: value === FOLLOW ? "" : value })
          }
        >
          <Text tag={FOLLOW}>跟随主要策略</Text>
          <Text tag="DIRECT">DIRECT</Text>
          {options.filter((name) => name !== "DIRECT").map((name) => (
            <Text key={`media-${name}`} tag={name}>{name}</Text>
          ))}
        </Picker>
        <Picker
          title="AI 策略"
          value={prefs.aiPolicy || FOLLOW}
          onChanged={(value: string) =>
            persist({ ...prefs, aiPolicy: value === FOLLOW ? "" : value })
          }
        >
          <Text tag={FOLLOW}>跟随主要策略</Text>
          <Text tag="DIRECT">DIRECT</Text>
          {options.filter((name) => name !== "DIRECT").map((name) => (
            <Text key={`ai-${name}`} tag={name}>{name}</Text>
          ))}
        </Picker>
      </Section>

      <Section
        header={<Text>刷新与隐私</Text>}
        footer={
          <Text font={13}>
            WidgetKit 只把刷新时间当作建议，系统可能延后执行。出口查询会连接 ipapi.is / ipwho.is；深度风险检测还会连接 proxycheck.io。地址是否打码复用“隐藏总览地址”设置。
          </Text>
        }
      >
        <Picker
          title="刷新周期"
          value={String(prefs.refreshMin)}
          onChanged={(value: string) =>
            persist({ ...prefs, refreshMin: Number(value) as WidgetRefreshMin })
          }
        >
          <Text tag="15">15 分钟</Text>
          <Text tag="30">30 分钟</Text>
          <Text tag="60">1 小时</Text>
        </Picker>
        <Toggle
          title="深度 IP 风险检测"
          value={prefs.deepRisk}
          onChanged={(value: boolean) => persist({ ...prefs, deepRisk: value })}
        />
      </Section>

      {error ? (
        <Section>
          <Text foregroundStyle="systemRed">{`策略列表加载失败：${error}`}</Text>
        </Section>
      ) : null}

      <Section
        header={<Text>指标说明</Text>}
        footer={
          <Text font={13}>
            延迟是完整 HTTP 请求耗时，不是 ICMP Ping；服务状态只表示网页可达，不代表地区解锁；风险分数是第三方信息的启发式摘要，不是权威信誉评分。
          </Text>
        }
      >
        <Text>HTTP/3 仅表示 Cloudflare trace 协商到 h3</Text>
        <Text>不根据本地与出口 IP 猜测 NAT 类型</Text>
      </Section>
    </List>
  )
}
