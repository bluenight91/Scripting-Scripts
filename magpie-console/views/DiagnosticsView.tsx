// 诊断与自检：四个管理入口的真实状态、请求日志与原始响应
import {
  Button,
  HStack,
  Image,
  ScrollView,
  Spacer,
  Text,
  VStack,
  useEffect,
  useState,
} from "scripting"
import { clearRequestLog, requestLog, selfCheck } from "../lib/api"
import { relativeTime } from "../lib/format"
import { hasAdminKey } from "../lib/store"
import { Card, PAGE_BG, SectionHeader, StatusPill, Tag } from "../components/Kit"
import { CopyChip, LoadingRow } from "../components/Bits"
import { TONES, UI } from "../lib/theme"
import type { Gateway, RequestLogEntry, SelfCheckEntry } from "../lib/types"

export function DiagnosticsView({ gateway }: { gateway: Gateway }) {
  const [entries, setEntries] = useState<SelfCheckEntry[]>([])
  const [log, setLog] = useState<RequestLogEntry[]>(requestLog())
  const [running, setRunning] = useState(false)
  const [openRaw, setOpenRaw] = useState<string | null>(null)
  const [openLog, setOpenLog] = useState<number | null>(null)

  async function run() {
    setRunning(true)
    try {
      setEntries(await selfCheck(gateway))
    } finally {
      setLog(requestLog())
      setRunning(false)
    }
  }

  useEffect(() => {
    void run()
  }, [gateway.id])

  const failed = entries.filter(entry => !entry.ok).length

  return (
    <ScrollView
        navigationTitle="自检与诊断"
        background={PAGE_BG}
        scrollContentBackground="hidden"
        refreshable={run}
        toolbar={{
          topBarTrailing: [
            <Button
              key="run"
              title={running ? "运行中…" : "重新自检"}
              disabled={running}
              action={run}
            />,
          ],
        }}
      >
        <VStack alignment="leading" spacing={UI.pageSpacing} padding={UI.pagePadding}>
          <Card>
            <SectionHeader
              title="本轮自检"
              caption={running ? "正在请求四个入口" : "状态码、耗时与关键字段"}
            />
            <HStack spacing={8}>
              <StatusPill
                kind={running ? "busy" : failed === 0 && entries.length > 0 ? "ok" : "error"}
                label={running ? "运行中" : failed === 0 && entries.length > 0 ? "全部通过" : failed + " 项失败"}
              />
              <Spacer />
              {entries.length > 0 ? <CopyChip text={reportText(gateway, entries)} label="复制报告" /> : null}
            </HStack>
            {running && entries.length === 0 ? <LoadingRow text="正在请求管理 API" /> : null}
            {entries.map(entry => (
              <VStack
                key={entry.path}
                alignment="leading"
                spacing={5}
                frame={{ maxWidth: "infinity", alignment: "leading" }}
              >
                <HStack spacing={8}>
                  <Image
                    systemName={entry.ok ? "checkmark.circle.fill" : "xmark.circle.fill"}
                    font={14}
                    foregroundStyle={entry.ok ? TONES.green.fg : TONES.red.fg}
                  />
                  <Text font={14}>{entry.label}</Text>
                  <Spacer />
                  <Tag text={String(entry.status)} tone={entry.ok ? "green" : "red"} mono />
                  <Text font={11} foregroundStyle="tertiaryLabel">{entry.ms} ms</Text>
                </HStack>
                <Text font={11} fontDesign="monospaced" foregroundStyle="secondaryLabel" lineLimit={1}>
                  {entry.path}
                </Text>
                <Text font={12} foregroundStyle="secondaryLabel" lineLimit={3}>{entry.summary}</Text>
                {!entry.ok && entry.raw ? (
                  <Button
                    title={openRaw === entry.path ? "收起原始响应" : "查看原始响应"}
                    buttonStyle="borderless"
                    controlSize="small"
                    action={() => setOpenRaw(openRaw === entry.path ? null : entry.path)}
                  />
                ) : null}
                {!entry.ok && openRaw === entry.path ? (
                  <Text
                    font={11}
                    fontDesign="monospaced"
                    lineLimit={12}
                    frame={{ maxWidth: "infinity", alignment: "leading" }}
                  >
                    {entry.raw}
                  </Text>
                ) : null}
              </VStack>
            ))}
          </Card>

          <Card>
            <SectionHeader title="连接信息" />
            <HStack spacing={8}>
              <Text font={13} foregroundStyle="secondaryLabel">地址</Text>
              <Spacer />
              <Text font={12} fontDesign="monospaced" lineLimit={1}>{gateway.baseURL}</Text>
              <CopyChip text={gateway.baseURL} label="" />
            </HStack>
            <HStack spacing={8}>
              <Text font={13} foregroundStyle="secondaryLabel">admin 密钥</Text>
              <Spacer />
              <Text font={13}>{hasAdminKey(gateway.id) ? "已保存" : "未设置"}</Text>
            </HStack>
            <Text font={11} foregroundStyle="tertiaryLabel">
              管理 API 要求请求不带 Origin / Sec-Fetch 头；本脚本从不设置它们。
            </Text>
          </Card>

          <Card>
            <SectionHeader title="请求日志" caption="最近 60 次，只在内存中" />
            <HStack spacing={8}>
              <Text font={12} foregroundStyle="secondaryLabel">{log.length} 条记录</Text>
              <Spacer />
              <Button
                title="清空"
                buttonStyle="borderless"
                controlSize="small"
                action={() => {
                  clearRequestLog()
                  setLog([])
                }}
              />
            </HStack>
            {log.length === 0 ? (
              <Text font={12} foregroundStyle="secondaryLabel">还没有请求。</Text>
            ) : (
              log.slice(0, 30).map(entry => (
                <VStack key={entry.id} alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  <HStack spacing={6}>
                    <Text font={10} fontWeight="bold" foregroundStyle={entry.ok ? TONES.green.fg : TONES.red.fg}>
                      {entry.ok ? "OK" : "ERR"}
                    </Text>
                    <Text font={10} foregroundStyle="secondaryLabel">{entry.method}</Text>
                    <Text font={10} fontDesign="monospaced" lineLimit={1} frame={{ maxWidth: "infinity" }}>
                      {entry.path}
                    </Text>
                    <Text font={10} foregroundStyle="tertiaryLabel">{entry.status} · {entry.ms}ms</Text>
                    <Button
                      buttonStyle="plain"
                      action={() => setOpenLog(openLog === entry.id ? null : entry.id)}
                    >
                      <Text font={10} foregroundStyle={TONES.accent.fg}>{openLog === entry.id ? "收起" : "原始"}</Text>
                    </Button>
                  </HStack>
                  <Text font={10} foregroundStyle="tertiaryLabel">
                    {relativeTime(entry.at)}{entry.note ? " · " + entry.note : ""}
                  </Text>
                  {openLog === entry.id && entry.raw ? (
                    <Text font={10} fontDesign="monospaced" lineLimit={12} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                      {entry.raw}
                    </Text>
                  ) : null}
                </VStack>
              ))
            )}
          </Card>

          <Card>
            <SectionHeader title="仍然失败时" />
            {[
              "确认 magpie 正在运行，并且开启了局域网共享。",
              "确认密钥带 admin 级别：magpie gateway-key list 里它的行应写着 Manages magpie。",
              "403 admin_browser_refused 说明请求带了浏览器头，请复制上面的报告反馈。",
              "404 说明 magpie 版本过旧，升级到带管理 API 的版本。",
            ].map(text => (
              <Text key={text} font={13} foregroundStyle="secondaryLabel" frame={{ maxWidth: "infinity", alignment: "leading" }}>
                {text}
              </Text>
            ))}
          </Card>

          <Text font={11} foregroundStyle="tertiaryLabel" padding={{ bottom: 18 }}>
            自检会真实写入请求日志，但不会修改任何配置。
          </Text>
        </VStack>
    </ScrollView>
  )
}

function reportText(gateway: Gateway, entries: SelfCheckEntry[]): string {
  const lines = [
    "magpie 控制台自检",
    `地址: ${gateway.baseURL}`,
    `admin 密钥: ${hasAdminKey(gateway.id) ? "有" : "无"}`,
    "",
  ]
  for (const entry of entries) {
    lines.push(`[${entry.ok ? "PASS" : "FAIL"}] ${entry.label} ${entry.path} → ${entry.status} (${entry.ms} ms)`)
    lines.push(`  ${entry.summary}`)
  }
  return lines.join("\n")
}