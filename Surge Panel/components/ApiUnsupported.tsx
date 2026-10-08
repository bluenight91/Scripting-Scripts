// 端点返回 404 / 405 / 501 时的说明：如实展示 HTTP 状态、响应与正在运行的引擎版本，不按版本号下结论
import { Button, HStack, Image, Text, useEffect, useState, VStack } from "scripting"
import { getEngineInfo, SurgeApiError, type EngineInfo } from "../lib/surgeApi"
import { useStoreSelector } from "../lib/store"
import { TONES } from "../lib/ui"
import { InfoRow } from "./Kit"

function engineText(e: EngineInfo | null): string {
  if (e === null) return "读取中…"
  if (!e.version && !e.build) return "未知（响应头无版本，且脚本功能未开启）"
  return [e.system, e.version, e.build ? `(${e.build})` : ""].filter((x) => x).join(" ")
}

export function UnsupportedApiNotice({
  feature,
  endpoint,
  error,
  onRetry,
}: {
  feature: string
  endpoint: string
  error: unknown
  onRetry?: () => void
}) {
  const config = useStoreSelector((s) => s.config)
  const [engine, setEngine] = useState<EngineInfo | null>(null)

  useEffect(() => {
    setEngine(null)
    getEngineInfo(config)
      .then(setEngine)
      .catch(() => setEngine({}))
  }, [config, error])

  const status = error instanceof SurgeApiError ? error.status : undefined
  const body = error instanceof SurgeApiError ? error.body : undefined

  return (
    <>
      <VStack alignment="leading" spacing={6} padding={{ vertical: 6 }}>
        <HStack spacing={8}>
          <Image systemName="questionmark.app.dashed" font={18} foregroundStyle={TONES.orange.fg} />
          <Text font={16} fontWeight="semibold">{`Surge 没有响应${feature}接口`}</Text>
        </HStack>
        <Text font={13} foregroundStyle="secondaryLabel">
          {"面板不比较版本号，只看 Surge 是否提供该接口。若 Surge 已更新到 TestFlight 5.102（即 5.23 RC），请在 Surge 中断开再重新连接以重启引擎，然后重试；也请确认当前实例连的就是这台已更新的设备。"}
        </Text>
      </VStack>
      <InfoRow label="请求" value={endpoint} mono />
      <InfoRow label="返回" value={status ? `HTTP ${status}` : "端点不可用"} mono />
      <InfoRow label="响应内容" value={body} mono />
      <InfoRow label="运行中的引擎" value={engineText(engine)} />
      {onRetry ? <Button title="重试" systemImage="arrow.clockwise" action={onRetry} /> : null}
    </>
  )
}
