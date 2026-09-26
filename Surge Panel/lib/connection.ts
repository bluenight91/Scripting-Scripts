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
  const parts = host.split(".").map(Number)
  return parts.every((part) => part >= 0 && part <= 255) ? parts : null
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

  if (/^(?:fc|fd|fe8|fe9|fea|feb)/i.test(value)) return "lan"
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
  if (/^[\d.]+$/.test(value) && !ipv4Parts(value)) return "IPv4 地址格式无效"

  const portNumber = Number(port.trim())
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    return "端口需为 1–65535 的整数"
  }
  if (!key.trim()) return "请填写 HTTP API Key"
  return null
}
