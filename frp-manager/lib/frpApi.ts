// frpc / frps Admin API 封装（v0.71 实测端点；Basic Auth，失败包体 {"Code","Msg"}）
import { fetch } from "scripting"
import {
  prepareRequest,
  errorFromResponse,
  isNotFoundError,
  b64EncodeUtf8,
  type HttpMethod,
} from "./frpCore"

/** 一次连接所需的最小信息（由 lib/servers.ts 的 connOf 组装） */
export type FrpConn = {
  baseUrl: string
  username: string
  password: string
}

const REQUEST_TIMEOUT = 15

function b64(s: string): string {
  return b64EncodeUtf8(s)
}

function wrapFetchError(e: unknown): Error {
  const s = String(e)
  if (/timeout|timed?\s*out|ETIMEDOUT|超时/i.test(s)) {
    return new Error("连接超时。请确认 frp 已运行、地址端口正确，并允许 Scripting 访问本地网络")
  }
  if (/TLS|TlsHandler|证书|certificate/i.test(s)) {
    return new Error(`${s}。frp 的 HTTPS 多为自签证书，面板已跳过系统链校验；若仍失败请改用 http 或在 frp 侧配置受信任证书`)
  }
  if (/401|unauthorized/i.test(s)) {
    return new Error("用户名或密码错误 (401)")
  }
  return e instanceof Error ? e : new Error(s)
}

async function request<T>(
  conn: FrpConn,
  method: HttpMethod,
  path: string,
  opts?: { jsonBody?: unknown; textBody?: string; query?: Record<string, string | undefined> }
): Promise<T> {
  const prep = prepareRequest({
    baseUrl: conn.baseUrl,
    username: conn.username,
    password: conn.password,
    method,
    path,
    jsonBody: opts?.jsonBody,
    textBody: opts?.textBody,
    query: opts?.query,
    b64,
  })
  const res = await fetch(prep.url, {
    method: prep.method,
    headers: prep.headers,
    body: prep.body,
    timeout: REQUEST_TIMEOUT,
    // http 地址必须允许；https 的 frp 证书常为自签，一并跳过系统链校验
    allowInsecureRequest: true,
    debugLabel: `frp-manager ${method} ${path}`,
  }).catch((e) => {
    throw wrapFetchError(e)
  })
  const text = await res.text()
  if (!res.ok) throw errorFromResponse(res.status, text)
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    // 纯文本端点（如 /api/config 的 toml）
    return text as T
  }
}

function get<T>(conn: FrpConn, path: string, query?: Record<string, string | undefined>): Promise<T> {
  return request<T>(conn, "GET", path, { query })
}

// ---------- 通用 ----------

/** 在线探测：/healthz 免认证，200 即在线 */
export async function probeHealthz(conn: FrpConn): Promise<boolean> {
  try {
    const res = await fetch(
      prepareRequest({
        baseUrl: conn.baseUrl,
        username: "",
        password: "",
        method: "GET",
        path: "/healthz",
        b64,
      }).url,
      { timeout: 8, allowInsecureRequest: true, debugLabel: "frp-manager healthz" }
    ).catch(() => null)
    return res !== null && res.ok
  } catch {
    return false
  }
}

// ---------- frpc（admin 端口） ----------

/** 实测 frpc v0.71 返回 snake_case 字段（local_addr/remote_addr） */
export type FrpcProxyStatus = {
  name: string
  type: string
  status: string
  err: string
  local_addr: string
  remote_addr: string
  plugin: string
}

/** /api/status：所有代理状态，按类型分组（tcp/udp/http/https/stcp/xtcp/tcpmux/sudp…） */
export type FrpcStatus = Record<string, FrpcProxyStatus[]>

export const frpcStatus = (c: FrpConn) => get<FrpcStatus>(c, "/api/status")

/** /api/config：完整配置，纯文本 toml */
export const frpcGetConfig = (c: FrpConn) => request<string>(c, "GET", "/api/config")

/** /api/config：覆写配置（不自动生效，需再调 reload） */
export const frpcPutConfig = (c: FrpConn, toml: string) =>
  request<void>(c, "PUT", "/api/config", { textBody: toml })

/** /api/reload：热重载配置 */
export const frpcReload = (c: FrpConn) => request<string>(c, "GET", "/api/reload")

/** /api/stop：优雅退出 frpc */
export const frpcStop = (c: FrpConn) => request<void>(c, "POST", "/api/stop")

/** Store 代理定义（动态创建用的 JSON 体，字段按 type 取舍） */
export type StoreProxyDef = {
  name: string
  type: string
  localIP?: string
  localPort?: number
  remotePort?: number
  customDomains?: string[]
  subdomain?: string
  secretKey?: string
  [key: string]: unknown
}

/**
 * /api/store/proxies：列出动态代理。
 * store 未启用时 frpc 返回 404 —— 返回 null 交由 UI 显示提示而不是报错。
 */
export async function frpcStoreList(c: FrpConn): Promise<{ proxies: StoreProxyDef[] } | null> {
  try {
    const r = await get<{ proxies?: StoreProxyDef[] }>(c, "/api/store/proxies")
    return { proxies: Array.isArray(r.proxies) ? r.proxies : [] }
  } catch (e) {
    if (isNotFoundError(e)) return null
    throw e
  }
}

/** POST /api/store/proxies：动态创建代理（需 frpc 配置启用 store.path） */
export const frpcStoreCreate = (c: FrpConn, def: StoreProxyDef) =>
  request<void>(c, "POST", "/api/store/proxies", { jsonBody: def })

export const frpcStoreDelete = (c: FrpConn, name: string) =>
  request<void>(c, "DELETE", `/api/store/proxies/${encodeURIComponent(name)}`)

/** /api/proxy/{name}/config：单个代理解析后的完整配置 JSON */
export const frpcProxyConfig = (c: FrpConn, name: string) =>
  get<Record<string, unknown>>(c, `/api/proxy/${encodeURIComponent(name)}/config`)

// ---------- frps（dashboard 端口） ----------

export type FrpsServerInfo = {
  version: string
  bindPort: number
  curConns: number
  totalTrafficIn: number
  totalTrafficOut: number
  clientCounts: number
  proxyTypeCounts: Record<string, number>
  [key: string]: unknown
}

export const frpsServerInfo = (c: FrpConn) => get<FrpsServerInfo>(c, "/api/serverinfo")

export const FRPS_PROXY_TYPES = ["tcp", "udp", "http", "https", "stcp", "xtcp", "tcpmux"] as const

export type FrpsProxy = {
  name: string
  status: string
  user: string
  conf: Record<string, unknown> | null
  todayTrafficIn: number
  todayTrafficOut: number
  curConns: number
  lastStartTime: string
  lastCloseTime: string
}

export const frpsProxies = (c: FrpConn, type: string) =>
  get<{ proxies: FrpsProxy[] }>(c, `/api/proxy/${type}`)

export const frpsProxyByName = (c: FrpConn, name: string) =>
  get<{ proxies: FrpsProxy[] }>(c, `/api/proxies/${encodeURIComponent(name)}`)

export type FrpsTraffic = { name: string; trafficIn: number; trafficOut: number }

/** 单代理累计流量；新版本是 /api/traffic/{name}，旧版是 /api/proxy/traffic/{name}，404 时 fallback */
export async function frpsProxyTraffic(c: FrpConn, name: string): Promise<FrpsTraffic> {
  const enc = encodeURIComponent(name)
  try {
    return await get<FrpsTraffic>(c, `/api/traffic/${enc}`)
  } catch (e) {
    if (!isNotFoundError(e)) throw e
  }
  return get<FrpsTraffic>(c, `/api/proxy/traffic/${enc}`)
}

export type FrpsClient = {
  version?: string
  hostname?: string
  os?: string
  arch?: string
  user?: string
  runId?: string
  status?: string
  [key: string]: unknown
}

export type FrpsClientStatus = "online" | "offline" | "all"

export const frpsClients = (c: FrpConn, status?: FrpsClientStatus) =>
  get<{ clients: FrpsClient[] }>(c, "/api/clients", status ? { status } : undefined)

/** 清理离线代理统计记录；frp 要求 status 参数必须为 offline */
export const frpsCleanOfflineProxies = (c: FrpConn) =>
  request<void>(c, "DELETE", "/api/proxies", { query: { status: "offline" } })
