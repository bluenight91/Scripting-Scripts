// 接入方式：当前网关的协议端点、可复制片段与检查清单
import {
  HStack,
  Image,
  ScrollView,
  Spacer,
  Text,
  VStack,
  useEffect,
  useState,
} from "scripting"
import { fetchProviders, gatewayRoot } from "../lib/api"
import { hostOf } from "../lib/format"
import { Card, IconBadge, PAGE_BG, SectionHeader, Tag } from "../components/Kit"
import { CopyChip, FieldRow } from "../components/Bits"
import { TONES, UI } from "../lib/theme"
import type { Gateway, ProvidersPayload } from "../lib/types"

function snippets(base: string) {
  const root = gatewayRoot(base)
  const openai = root + "/v1"
  return [
    {
      title: "OpenAI 兼容客户端",
      body: [`export OPENAI_BASE_URL=${openai}`, "export OPENAI_API_KEY=<你的网关密钥>"].join("\n"),
    },
    {
      title: "Claude Code / Anthropic",
      body: [`export ANTHROPIC_BASE_URL=${root}`, "export ANTHROPIC_AUTH_TOKEN=<你的网关密钥>"].join("\n"),
    },
    {
      title: "Gemini",
      body: `GEMINI_BASE_URL=${root}/v1beta`,
    },
    {
      title: "Codex",
      body: [
        "# ~/.codex/config.toml",
        'model_provider = "magpie"',
        "[model_providers.magpie]",
        `base_url = "${openai}"`,
        'api_key = "<你的网关密钥>"',
      ].join("\n"),
    },
    {
      title: "curl 自测",
      body: [`curl ${openai}/models \\`, '  -H "Authorization: Bearer <你的网关密钥>"'].join("\n"),
    },
  ]
}

export function ConnectView({ gateway }: { gateway: Gateway }) {
  const [health, setHealth] = useState<ProvidersPayload["gateway"] | null>(null)

  useEffect(() => {
    fetchProviders(gateway).then(result => {
      if (result.ok) setHealth(result.data?.gateway ?? null)
    })
  }, [gateway.id])

  const root = gatewayRoot(gateway.baseURL)
  const lanURLs = health?.lanURLs ?? []

  return (
    <ScrollView
        navigationTitle="接入方式"
        background={PAGE_BG}
        scrollContentBackground="hidden"
      >
        <VStack alignment="leading" spacing={UI.pageSpacing} padding={UI.pagePadding}>
          <Card>
            <HStack spacing={12}>
              <IconBadge icon="link" tone="accent" size={40} filled />
              <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <Text font={17} fontWeight="semibold">一个网关地址给所有 agent</Text>
                <Text font={12} fontDesign="monospaced" foregroundStyle="secondaryLabel">
                  {hostOf(gateway.baseURL)}
                </Text>
              </VStack>
            </HStack>
            <Text font={13} foregroundStyle="secondaryLabel">
              magpie 在同一端口上讲 OpenAI Chat / Responses、Anthropic Messages 与 Gemini；下面按协议给出基地址。
            </Text>
            <HStack spacing={6}>
              {health?.lan ? <Tag text="局域网共享" tone="green" /> : null}
              {health?.onNetwork ? <Tag text="对外监听" tone="orange" /> : null}
              {health?.paused ? <Tag text="已暂停" tone="red" /> : null}
            </HStack>
          </Card>

          <Card>
            <SectionHeader title="端点" caption="从网络访问时每个请求都要带网关密钥" />
            <FieldRow label="OpenAI" value={root + "/v1"} mono copyable />
            <FieldRow label="Responses" value={root + "/v1"} mono copyable />
            <FieldRow label="Anthropic" value={root} mono copyable />
            <FieldRow label="Gemini" value={root + "/v1beta"} mono copyable />
            <FieldRow label="Ollama" value={root} mono copyable />
            <FieldRow label="模型列表" value={root + "/v1/models"} mono copyable />
          </Card>

          {lanURLs.length > 0 ? (
            <Card>
              <SectionHeader title="局域网地址" caption="magpie 报告的其它设备可达地址" />
              {lanURLs.map(url => (
                <FieldRow key={url} label="LAN" value={url} mono copyable />
              ))}
            </Card>
          ) : null}

          {snippets(gateway.baseURL).map(item => (
            <Card key={item.title}>
              <SectionHeader title={item.title} />
              <Text
                font={11}
                fontDesign="monospaced"
                lineLimit={8}
                frame={{ maxWidth: "infinity", alignment: "leading" }}
                padding={10}
                background={{ style: TONES.gray.soft, shape: { type: "rect", cornerRadius: 10, style: "continuous" } }}
              >
                {item.body}
              </Text>
              <HStack spacing={8}>
                <CopyChip text={item.body} label="复制片段" />
                <Spacer />
              </HStack>
            </Card>
          ))}

          <Card>
            <SectionHeader title="检查清单" />
            {[
              "magpie 设置 → 网络与共享 → 在局域网共享（或设置 MAGPIE_ADDR）",
              "至少一把启用的网关密钥，客户端用 Authorization: Bearer",
              "管理类操作还需要该密钥的 admin 级别：local 或 any",
              "手机与 Mac 在同一网络，或都接入 Tailscale",
              "反向代理要转发 /v1，并保留 Authorization 头",
            ].map(text => (
              <HStack key={text} spacing={8} frame={{ maxWidth: "infinity" }}>
                <Image systemName="circle" font={5} foregroundStyle="tertiaryLabel" />
                <Text font={13} frame={{ maxWidth: "infinity", alignment: "leading" }}>{text}</Text>
              </HStack>
            ))}
          </Card>

          <Card tone="orange">
            <HStack spacing={8}>
              <Image systemName="lock.shield" font={14} foregroundStyle={TONES.orange.fg} />
              <Text font={13} foregroundStyle="secondaryLabel" frame={{ maxWidth: "infinity", alignment: "leading" }}>
                把 admin 密钥只留在这台手机的钥匙串里；给其他设备的密钥应限制模型、账号和额度，不要授予 admin。
              </Text>
            </HStack>
            <HStack spacing={8}>
              <Image systemName="checkmark.seal.fill" font={14} foregroundStyle={TONES.green.fg} />
              <Text font={13} foregroundStyle="secondaryLabel" frame={{ maxWidth: "infinity", alignment: "leading" }}>
                本脚本从不读取供应商的明文密钥，也不导出登录态。
              </Text>
            </HStack>
          </Card>

          <Text font={11} foregroundStyle="tertiaryLabel" padding={{ bottom: 18 }}>
            端口默认 3425；若用反向代理或 MAGPIE_PUBLIC_URL，以那个地址为准。
          </Text>
        </VStack>
    </ScrollView>
  )
}