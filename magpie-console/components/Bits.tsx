// magpie 控制台专用小组件：复制、加载、错误、限额进度、密钥展示
import {
  Button,
  HStack,
  Image,
  Pasteboard,
  ProgressView,
  Spacer,
  Text,
  VStack,
  useState,
} from "scripting"
import { TONES, roundedShape, UI, type Tone } from "../lib/theme"

export function CopyChip({ text, label = "复制" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    void Pasteboard.setString(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }
  return (
    <Button buttonStyle="plain" action={copy} accessibilityLabel={label}>
      <HStack spacing={4}>
        <Image
          systemName={copied ? "checkmark" : "doc.on.doc"}
          font={12}
          foregroundStyle={copied ? TONES.green.fg : "secondaryLabel"}
        />
        {label ? (
          <Text font={12} foregroundStyle={copied ? TONES.green.fg : "secondaryLabel"}>
            {copied ? "已复制" : label}
          </Text>
        ) : null}
      </HStack>
    </Button>
  )
}

export function LoadingRow({ text = "加载中" }: { text?: string }) {
  return (
    <HStack spacing={10} padding={{ vertical: 14 }} frame={{ maxWidth: "infinity" }}>
      <ProgressView progressViewStyle="circular" />
      <Text font={13} foregroundStyle="secondaryLabel">
        {text}
      </Text>
    </HStack>
  )
}

export function ErrorNotice({
  message,
  hint,
  raw,
}: {
  message: string
  hint?: string
  raw?: string
}) {
  const [showRaw, setShowRaw] = useState(false)
  return (
    <VStack
      alignment="leading"
      spacing={8}
      padding={14}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
      background={{ style: TONES.red.soft, shape: roundedShape(UI.cardRadius) }}
    >
      <HStack spacing={8}>
        <Image systemName="exclamationmark.triangle.fill" font={14} foregroundStyle={TONES.red.fg} />
        <Text font={13} fontWeight="semibold" foregroundStyle={TONES.red.fg}>
          请求失败
        </Text>
        <Spacer />
        {raw ? (
          <Button buttonStyle="plain" action={() => setShowRaw(!showRaw)}>
            <Text font={12} foregroundStyle={TONES.red.fg}>
              {showRaw ? "收起" : "原始响应"}
            </Text>
          </Button>
        ) : null}
      </HStack>
      <Text font={13} lineLimit={showRaw ? undefined : 4}>
        {message}
      </Text>
      {hint ? (
        <Text font={12} foregroundStyle="secondaryLabel">
          {hint}
        </Text>
      ) : null}
      {showRaw && raw ? (
        <Text
          font={11}
          fontDesign="monospaced"
          foregroundStyle="secondaryLabel"
          lineLimit={16}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
        >
          {raw}
        </Text>
      ) : null}
    </VStack>
  )
}

export function FieldRow({
  label,
  value,
  mono,
  copyable = false,
}: {
  label: string
  value?: string
  mono?: boolean
  copyable?: boolean
}) {
  return (
    <HStack spacing={10} alignment="firstTextBaseline" frame={{ maxWidth: "infinity" }}>
      <Text font={13} foregroundStyle="secondaryLabel" frame={{ width: 88, alignment: "leading" }}>
        {label}
      </Text>
      <Text
        font={13}
        fontDesign={mono ? "monospaced" : undefined}
        lineLimit={2}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        {value || "—"}
      </Text>
      {copyable && value ? <CopyChip text={value} label="" /> : null}
    </HStack>
  )
}

export function UsageBar({
  usedText,
  limitText,
  fraction,
  tone = "accent",
}: {
  usedText: string
  limitText: string
  fraction: number | null
  tone?: Tone
}) {
  const t = TONES[tone]
  return (
    <VStack alignment="leading" spacing={5} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
        <Text font={13}>{usedText}</Text>
        <Spacer />
        <Text font={12} foregroundStyle="secondaryLabel">
          {limitText}
        </Text>
      </HStack>
      {fraction == null ? (
        <Text font={11} foregroundStyle="tertiaryLabel">
          未设置上限
        </Text>
      ) : (
        <ProgressView value={fraction} total={1} progressViewStyle="linear" tint={t.fg} />
      )}
    </VStack>
  )
}

export function SecretBox({
  secret,
  title,
  onDone,
}: {
  secret: string
  title: string
  onDone: () => void
}) {
  return (
    <VStack
      alignment="leading"
      spacing={10}
      padding={14}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
      background={{ style: TONES.orange.soft, shape: roundedShape(UI.cardRadius) }}
    >
      <HStack spacing={8}>
        <Image systemName="exclamationmark.triangle.fill" font={14} foregroundStyle={TONES.orange.fg} />
        <Text font={13} fontWeight="semibold" foregroundStyle={TONES.orange.fg}>
          {title}
        </Text>
      </HStack>
      <Text font={12} fontDesign="monospaced" lineLimit={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        {secret}
      </Text>
      <HStack spacing={12}>
        <CopyChip text={secret} label="复制密钥" />
        <Button title="我已保存" buttonStyle="bordered" controlSize="small" action={onDone} />
      </HStack>
      <Text font={11} foregroundStyle="secondaryLabel">
        离开此页面后无法再次查看；需要时只能轮换出新密钥。
      </Text>
    </VStack>
  )
}

export function Dot({ color }: { color: any }) {
  return <Text frame={{ width: 7, height: 7 }} background={color} cornerRadius={4} />
}