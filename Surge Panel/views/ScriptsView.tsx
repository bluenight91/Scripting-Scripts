// 脚本管理：列出 Surge 配置的脚本，cron 脚本可手动触发
import {
  Button,
  HStack,
  List,
  Section,
  Spacer,
  Text,
  useEffect,
  useState,
  VStack,
} from "scripting"
import { getScripts, runCronScript, type SurgeScript } from "../lib/surgeApi"
import { useStore } from "../lib/store"

const TYPE_LABELS: Record<string, string> = {
  cron: "定时",
  generic: "通用",
  "http-request": "HTTP 请求",
  "http-response": "HTTP 响应",
  rule: "规则",
  dns: "DNS",
  event: "事件",
  tile: "卡片",
}

function shortPath(p: string): string {
  if (p.length <= 50) return p
  try {
    const u = new URL(p)
    const segs = u.pathname.split("/").filter(Boolean)
    return `${u.host}/…/${segs[segs.length - 1] ?? ""}`
  } catch {
    return `…${p.slice(-45)}`
  }
}

export function ScriptsView() {
  const state = useStore()
  const [scripts, setScripts] = useState<SurgeScript[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})

  useEffect(() => {
    getScripts(state.config)
      .then((r) => setScripts(r.scripts))
      .catch((e) => setError(String(e)))
  }, [state.config])

  async function runCron(name: string) {
    if (running) return
    setRunning(name)
    try {
      await runCronScript(state.config, name)
      setResults((m) => ({ ...m, [name]: "✓ 已触发执行" }))
    } catch (e) {
      setResults((m) => ({ ...m, [name]: `✗ ${String(e)}` }))
    } finally {
      setRunning(null)
    }
  }

  return (
    <List navigationTitle="脚本">
      {error ? (
        <Section>
          <Text foregroundStyle="systemRed">{error}</Text>
        </Section>
      ) : null}
      {scripts === null ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">加载中…</Text>
        </Section>
      ) : scripts.length === 0 ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">未配置任何脚本</Text>
        </Section>
      ) : (
        <Section
          header={<Text>{`${scripts.length} 个脚本`}</Text>}
          footer={<Text font={12}>定时脚本可手动触发执行；脚本开关需在 Surge 配置中修改</Text>}
        >
          {scripts.map((s) => (
            <VStack key={s.name} alignment="leading" spacing={3}>
              <HStack spacing={8}>
                <Text font={15}>{s.name}</Text>
                <Text font={10} foregroundStyle={s.enabled ? "systemGreen" : "secondaryLabel"}>
                  {s.enabled ? "已启用" : "已停用"}
                </Text>
                <Spacer />
                <Text font={11} foregroundStyle="secondaryLabel">
                  {TYPE_LABELS[s.type] ?? s.type}
                </Text>
              </HStack>
              <Text font={11} foregroundStyle="tertiaryLabel" lineLimit={1} minScaleFactor={0.7}>
                {shortPath(s.path)}
              </Text>
              {s.type === "cron" && s.enabled ? (
                <HStack spacing={8}>
                  <Button
                    title={running === s.name ? "执行中…" : "立即执行"}
                    systemImage="play.circle"
                    disabled={running !== null}
                    action={() => runCron(s.name)}
                  />
                  {results[s.name] ? (
                    <Text
                      font={11}
                      foregroundStyle={results[s.name].startsWith("✓") ? "systemGreen" : "systemRed"}
                      lineLimit={1}
                    >
                      {results[s.name]}
                    </Text>
                  ) : null}
                </HStack>
              ) : null}
            </VStack>
          ))}
        </Section>
      )}
    </List>
  )
}
