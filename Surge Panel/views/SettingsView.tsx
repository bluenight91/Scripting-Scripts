// 设置 Tab：连接、面板、引擎、脚本、配置
import {
  Button,
  List,
  Navigation,
  NavigationLink,
  Picker,
  Script,
  ScrollView,
  Section,
  SecureField,
  Text,
  TextField,
  Toggle,
  useEffect,
  useState,
  VStack,
} from "scripting"
import {
  getCurrentProfile,
  getFeature,
  getModules,
  getOutboundGlobal,
  getOutboundMode,
  getRules,
  reloadProfile,
  setFeature,
  setLogLevel as setSurgeLogLevel,
  setModule,
  setOutboundGlobal,
  setOutboundMode,
  stopEngine,
  type FeatureKey,
} from "../lib/surgeApi"
import { HomeTitleWrapper } from "../components/HomeTitleWrapper"
import { ChangelogView } from "../components/ReleaseNotesSheet"
import { clearHistory, saveConfig, savePrefs, useStore } from "../lib/store"
import { ScriptsView } from "./ScriptsView"

const FEATURE_LABELS: Record<FeatureKey, string> = {
  mitm: "MitM",
  capture: "捕获 HTTP 请求",
  rewrite: "重写",
  scripting: "脚本",
}

export function SettingsView() {
  const state = useStore()
  const dismiss = Navigation.useDismiss()

  // 连接表单
  const [protocol, setProtocol] = useState<"http" | "https">(state.config.protocol)
  const [host, setHost] = useState(state.config.host)
  const [port, setPort] = useState(state.config.port)
  const [key, setKey] = useState(state.config.key)
  const [saved, setSaved] = useState(false)

  // 引擎状态
  const [outbound, setOutbound] = useState<string | null>(null)
  const [globalPolicy, setGlobalPolicy] = useState<string | null>(null)
  const [policyChoices, setPolicyChoices] = useState<string[]>([])
  const [features, setFeatures] = useState<Record<FeatureKey, boolean> | null>(null)
  const [modules, setModules] = useState<{ available: string[]; enabled: string[] } | null>(null)
  const [engineError, setEngineError] = useState<string | null>(null)

  // 确认弹窗
  const [confirm, setConfirm] = useState<null | "reload" | "stop" | "clearHistory">(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  // 日志级别（API 无读取端点，仅展示默认；修改立即生效）
  const [logLevel, setLogLevel] = useState("notify")

  async function loadEngineState() {
    try {
      const [ob, m, f] = await Promise.all([
        getOutboundMode(state.config),
        getModules(state.config),
        Promise.all(
          (Object.keys(FEATURE_LABELS) as FeatureKey[]).map(async (k) => {
            const r = await getFeature(state.config, k)
            return [k, r.enabled] as const
          })
        ),
      ])
      setOutbound(ob.mode)
      setModules(m)
      setFeatures(Object.fromEntries(f) as Record<FeatureKey, boolean>)
      setEngineError(null)
      // 全局模式下的默认策略与可选策略列表
      if (ob.mode === "proxy") {
        getOutboundGlobal(state.config)
          .then((r) => setGlobalPolicy(r.policy))
          .catch(() => {})
        getRules(state.config)
          .then((r) => setPolicyChoices(r["available-policies"] ?? []))
          .catch(() => {})
      }
    } catch (e) {
      setEngineError(String(e))
    }
  }

  useEffect(() => {
    loadEngineState()
  }, [state.config])

  function applyConnection() {
    saveConfig({ protocol, host, port, key })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function changeOutbound(mode: string) {
    setOutbound(mode)
    try {
      await setOutboundMode(state.config, mode)
      if (mode === "proxy") {
        getOutboundGlobal(state.config).then((r) => setGlobalPolicy(r.policy)).catch(() => {})
        getRules(state.config).then((r) => setPolicyChoices(r["available-policies"] ?? [])).catch(() => {})
      }
    } catch (e) {
      setEngineError(String(e))
    }
  }

  async function changeGlobalPolicy(policy: string) {
    setGlobalPolicy(policy)
    try {
      await setOutboundGlobal(state.config, policy)
    } catch (e) {
      setEngineError(String(e))
    }
  }

  async function changeLogLevel(level: string) {
    try {
      await setSurgeLogLevel(state.config, level)
      setActionMsg(`日志级别已切换为 ${level}（仅当前会话有效）`)
    } catch (e) {
      setEngineError(String(e))
    }
  }

  async function toggleFeature(k: FeatureKey, v: boolean) {
    setFeatures((f) => (f ? { ...f, [k]: v } : f))
    try {
      await setFeature(state.config, k, v)
    } catch (e) {
      setEngineError(String(e))
      loadEngineState()
    }
  }

  async function toggleModule(name: string, v: boolean) {
    setModules((m) =>
      m
        ? {
            available: m.available,
            enabled: v ? [...m.enabled, name] : m.enabled.filter((x) => x !== name),
          }
        : m
    )
    try {
      await setModule(state.config, name, v)
    } catch (e) {
      setEngineError(String(e))
      loadEngineState()
    }
  }

  async function runConfirmed() {
    const what = confirm
    setConfirm(null)
    try {
      if (what === "reload") {
        await reloadProfile(state.config)
        setActionMsg("配置已重新加载")
      } else if (what === "stop") {
        await stopEngine(state.config)
        setActionMsg("引擎已停止，请在 Surge 中重新启动")
      } else if (what === "clearHistory") {
        clearHistory()
        setActionMsg("采样历史已清空")
      }
    } catch (e) {
      setActionMsg(`操作失败：${e}`)
    }
  }

  return (
    <HomeTitleWrapper title="设置">
    <List
      navigationTitle={Script.env === "home_screen" ? undefined : "设置"}
      confirmationDialog={{
        isPresented: confirm !== null,
        onChanged: (v: boolean) => {
          if (!v) setConfirm(null)
        },
        title:
          confirm === "reload"
            ? "重新加载配置？"
            : confirm === "stop"
              ? "停止 Surge 引擎？"
              : "清空采样历史？",
        message:
          confirm === "stop" ? (
            <Text>停止后需在 Surge 应用中手动重新启动引擎</Text>
          ) : undefined,
        actions: (
          <Button
            title={confirm === "stop" ? "停止引擎" : "确认"}
            role="destructive"
            action={runConfirmed}
          />
        ),
      }}
    >
      {/* 连接 */}
      <Section header={<Text>连接</Text>} footer={saved ? <Text font={13} foregroundStyle="systemGreen">已保存并重新连接</Text> : <Text font={13}>填写 Surge HTTP API 地址与 Key 后保存。默认端口 6166。</Text>}>
        <Picker title="协议" pickerStyle="segmented" value={protocol} onChanged={(v: string) => setProtocol(v as "http" | "https")}>
          <Text tag="https">https</Text>
          <Text tag="http">http</Text>
        </Picker>
        <TextField label={<Text font={17}>主机</Text>} value={host} onChanged={setHost} prompt="127.0.0.1" />
        <TextField label={<Text font={17}>端口</Text>} value={port} onChanged={setPort} prompt="6166" />
        <SecureField label={<Text font={17}>API Key</Text>} value={key} onChanged={setKey} prompt="X-Key" />
        <Button title="保存并连接" systemImage="checkmark.circle" action={applyConnection} />
      </Section>

      {/* 面板 */}
      <Section
        header={<Text>面板</Text>}
        footer={<Text font={13}>刷新间隔用于内存趋势与引擎指标。实时速率图固定 1 秒采样（/v1/traffic），与 Surge Web Dashboard 一致。</Text>}
      >
        <NavigationLink title="更新说明" destination={<ChangelogView />} />
        <Toggle
          title="自动刷新"
          value={state.prefs.autoRefresh}
          onChanged={(v: boolean) => savePrefs({ ...state.prefs, autoRefresh: v })}
        />
        <Picker
          title="刷新间隔"
          value={String(state.prefs.intervalSec)}
          onChanged={(v: string) => savePrefs({ ...state.prefs, intervalSec: Number(v) as 3 | 5 | 10 })}
        >
          <Text tag="3">3 秒</Text>
          <Text tag="5">5 秒</Text>
          <Text tag="10">10 秒</Text>
        </Picker>
        <Picker
          title="历史长度"
          value={String(state.prefs.maxPoints)}
          onChanged={(v: string) => savePrefs({ ...state.prefs, maxPoints: Number(v) as 180 | 360 | 720 })}
        >
          <Text tag="180">180 点（约 15 分钟）</Text>
          <Text tag="360">360 点（约 30 分钟）</Text>
          <Text tag="720">720 点（约 1 小时）</Text>
        </Picker>
        <Button title="清空采样历史" role="destructive" systemImage="trash" action={() => setConfirm("clearHistory")} />
      </Section>

      {/* 引擎：出站、功能开关、模块、日志 */}
      <Section header={<Text>引擎</Text>} footer={engineError ? <Text font={13} foregroundStyle="systemRed">{engineError}</Text> : undefined}>
        {outbound === null ? (
          <Text foregroundStyle="secondaryLabel">{engineError ? "出站模式不可用" : "加载出站模式…"}</Text>
        ) : (
          <Picker title="出站模式" pickerStyle="segmented" value={outbound} onChanged={changeOutbound}>
            <Text tag="rule">规则</Text>
            <Text tag="proxy">代理</Text>
            <Text tag="direct">直连</Text>
          </Picker>
        )}
        {outbound === "proxy" && globalPolicy !== null ? (
          <Picker title="全局策略" value={globalPolicy} onChanged={changeGlobalPolicy}>
            {policyChoices.map((p) => (
              <Text key={p} tag={p}>{p}</Text>
            ))}
          </Picker>
        ) : null}
        <Picker title="日志级别" value={logLevel} onChanged={changeLogLevel}>
          <Text tag="verbose">verbose（最详细）</Text>
          <Text tag="info">info</Text>
          <Text tag="notify">notify</Text>
          <Text tag="warning">warning</Text>
          <Text tag="error">error（最少）</Text>
        </Picker>
        {features === null ? (
          <Text foregroundStyle="secondaryLabel">{engineError ? "功能开关不可用" : "加载功能开关…"}</Text>
        ) : (
          (Object.keys(FEATURE_LABELS) as FeatureKey[]).map((k) => (
            <Toggle key={k} title={FEATURE_LABELS[k]} value={features[k]} onChanged={(v: boolean) => toggleFeature(k, v)} />
          ))
        )}
        {modules === null ? (
          <Text foregroundStyle="secondaryLabel">{engineError ? "模块不可用" : "加载模块…"}</Text>
        ) : modules.available.length === 0 ? (
          <Text foregroundStyle="secondaryLabel">无可用模块</Text>
        ) : (
          modules.available.map((name) => (
            <Toggle
              key={name}
              title={name}
              value={modules.enabled.includes(name)}
              onChanged={(v: boolean) => toggleModule(name, v)}
            />
          ))
        )}
      </Section>

      {/* 脚本 */}
      <Section header={<Text>脚本</Text>}>
        <NavigationLink title="脚本管理" destination={<ScriptsView />} />
      </Section>

      {/* 配置 */}
      <Section header={<Text>配置</Text>} footer={actionMsg ? <Text font={13}>{actionMsg}</Text> : undefined}>
        <NavigationLink title="查看当前配置" destination={<ProfileView />} />
        <Button title="重新加载配置" systemImage="arrow.triangle.2.circlepath" action={() => setConfirm("reload")} />
        <Button title="停止引擎" role="destructive" systemImage="stop.circle" action={() => setConfirm("stop")} />
      </Section>

      {/* 退出（首页 Tab 环境无页面可退，隐藏） */}
      {Script.env === "home_screen" ? null : (
        <Section>
          <Button title="退出脚本" systemImage="xmark.rectangle" action={() => dismiss()} />
        </Section>
      )}
    </List>
    </HomeTitleWrapper>
  )
}

// ---------- 查看当前配置 ----------

function ProfileView() {
  const state = useStore()
  const [profile, setProfile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getCurrentProfile(state.config)
      .then((r) => setProfile(typeof r === "string" ? r : r.profile ?? ""))
      .catch((e) => setError(String(e)))
  }, [state.config])

  return (
    <ScrollView axes="vertical" navigationTitle="当前配置">
      <VStack alignment="leading" padding={14}>
        {error ? (
          <Text foregroundStyle="systemRed">{error}</Text>
        ) : profile === null ? (
          <Text foregroundStyle="secondaryLabel">加载中…</Text>
        ) : (
          <Text font={12} monospaced>{profile}</Text>
        )}
      </VStack>
    </ScrollView>
  )
}
