export type EndpointScope = "local" | "lan" | "public"

/** Accept either raw IPv6 or an already bracketed host from the editor. */
export function normalizeHost(host: string): string {
  const value = host.trim()
  if (value.startsWith("[") && value.endsWith("]")) return value.slice(1, -1).trim()
  return value
}

export function hostForUrl(host: string): string {
  const value = normalizeHost(host).replace(/%(?!25)/, "%25")
  return value.includes(":") ? `[${value}]` : value
}

export function formatEndpoint(host: string, port: string): string {
  const hostValue = normalizeHost(host)
  const value = hostValue.includes(":") ? `[${hostValue}]` : hostValue
  const p = port.trim()
  return p ? `${value}:${p}` : value
}

function ipv4Parts(host: string): number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null
  const raw = host.split(".")
  if (raw.some((part) => part.length > 1 && part.startsWith("0"))) return null
  const parts = raw.map(Number)
  return parts.every((part) => part >= 0 && part <= 255) ? parts : null
}

function isEncodedNumericHost(host: string): boolean {
  const numericLabel = /^(?:0x[\da-f]+|0[0-7]+|\d+|\d+e\d+)$/i
  const labels = host.split(".")
  return labels.length > 0 && labels.every((label) => numericLabel.test(label))
}

function isValidHostname(host: string): boolean {
  if (host.length > 253) return false
  return host.split(".").every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label)
  )
}

export function isValidIPv6(host: string): boolean {
  const normalized = normalizeHost(host).toLowerCase()
  const zoneParts = normalized.split("%")
  if (zoneParts.length > 2 || (zoneParts.length === 2 && !/^[\w.-]+$/.test(zoneParts[1]))) return false
  let address = zoneParts[0]
  if (!address.includes(":")) return false

  const ipv4Tail = address.slice(address.lastIndexOf(":") + 1)
  if (ipv4Tail.includes(".")) {
    if (!ipv4Parts(ipv4Tail)) return false
    address = `${address.slice(0, address.lastIndexOf(":"))}:0:0`
  }

  if ((address.match(/::/g)?.length ?? 0) > 1) return false
  const compressed = address.includes("::")
  const sides = compressed ? address.split("::") : [address]
  if (sides.length > 2) return false
  const groups = sides.flatMap((side) => (side ? side.split(":") : []))
  if (groups.some((group) => !/^[\da-f]{1,4}$/.test(group))) return false
  return compressed ? groups.length < 8 : groups.length === 8
}

export function endpointScope(host: string): EndpointScope {
  const value = normalizeHost(host).toLowerCase().replace(/%[\w.-]+$/, "")
  if (value === "localhost" || value.endsWith(".localhost") || value === "::1") return "local"

  const v4 = ipv4Parts(value)
  if (v4) {
    if (v4[0] === 127) return "local"
    if (
      v4[0] === 10 ||
      (v4[0] === 172 && v4[1] >= 16 && v4[1] <= 31) ||
      (v4[0] === 192 && v4[1] === 168) ||
      (v4[0] === 169 && v4[1] === 254)
    ) {
      return "lan"
    }
    return "public"
  }

  if (isValidIPv6(value) && /^(?:fc|fd|fe8|fe9|fea|feb)/i.test(value)) return "lan"
  if (value.endsWith(".local") || (!value.includes(".") && !value.includes(":"))) return "lan"
  return "public"
}

export function validateEndpoint(host: string, port: string, key: string): string | null {
  const value = normalizeHost(host)
  if (!value) return "请填写主机地址"
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value) || /[/?#]/.test(value)) {
    return "主机只填写 IP 或域名，不要包含协议、路径或端口"
  }
  if (value.includes("[") || value.includes("]")) return "IPv6 地址的方括号不完整"
  if (/\s/.test(value)) return "主机地址不能包含空格"
  if ((value.match(/:/g)?.length ?? 0) === 1) return "主机不要包含端口；端口请填写在单独字段"
  if (value.includes(":") && !isValidIPv6(value)) return "IPv6 地址格式无效"
  if (/^[\d.]+$/.test(value) && !ipv4Parts(value)) return "IPv4 地址格式无效"
  if (value === "0.0.0.0" || value === "::") return "面板主机不能使用未指定监听地址"
  if (!value.includes(":") && !ipv4Parts(value)) {
    if (isEncodedNumericHost(value)) return "不支持非标准数字地址，请使用规范 IPv4、IPv6 或域名"
    if (!isValidHostname(value)) return "主机名格式无效"
  }

  const portText = port.trim()
  const portNumber = Number(portText)
  if (!/^\d{1,5}$/.test(portText) || portNumber < 1 || portNumber > 65535) {
    return "端口需为 1–65535 的整数"
  }
  if (!key.trim()) return "请填写 HTTP API Key"
  return null
}

export type TransportFailureKind = "auth" | "timeout" | "refused" | "tls" | "protocol" | "network"

const REFUSED_MESSAGE =
  "连不上 Surge HTTP API。请确认引擎正在运行，且面板的协议、端口与配置里的 http-api、http-api-tls 一致"

/**
 * 把 Scripting / URLSession 的传输层报错归类。
 * 「Could not connect to the server.」是 -1004：端口没人听，或明文 HTTP 打到了 TLS 端口被立刻重置。
 */
export function classifyTransportFailure(raw: unknown): { kind: TransportFailureKind; message: string } {
  const s = raw instanceof Error ? raw.message : String(raw)
  if (/wrong version|unexpected.*response|SSL.*record|plain HTTP|protocol error/i.test(s)) {
    return { kind: "protocol", message: "HTTP/HTTPS 协议可能与 Surge 的 http-api-tls 设置不一致" }
  }
  if (/TLS|TlsHandler|证书|certificate|secure connection/i.test(s)) {
    return {
      kind: "tls",
      message: "HTTPS 证书验证失败。请在本机安装并信任 Surge MITM CA，并确认访问地址与证书匹配",
    }
  }
  if (/401|unauthorized/i.test(s)) {
    return { kind: "auth", message: "API Key 无效或没有访问权限" }
  }
  if (/timeout|timed?\s*out|ETIMEDOUT|超时/i.test(s)) {
    return { kind: "timeout", message: "连接超时" }
  }
  if (
    /ECONNREFUSED|ECONNRESET|ENETRESET|connection refused|connection reset|network connection was lost|could not connect|cannot connect|无法连接|拒绝连接|连接被重置|-1004|-1005/i.test(
      s
    )
  ) {
    return { kind: "refused", message: REFUSED_MESSAGE }
  }
  if (/could not find|nodename|not known|ENOTFOUND|找不到主机/i.test(s)) {
    return { kind: "network", message: "找不到主机，请检查实例地址" }
  }
  return { kind: "network", message: s }
}

/** 端口拒绝、协议不符、TLS 握手失败时，换另一种协议还有机会连上。超时和密钥错误不用换。 */
export function shouldTryAlternateProtocol(kind: TransportFailureKind): boolean {
  return kind === "refused" || kind === "protocol" || kind === "tls"
}
