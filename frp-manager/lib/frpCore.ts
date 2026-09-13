// frp 请求构造与响应解析的纯逻辑（不依赖 scripting 运行时，可用 node 直接验证）

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE"

/** 去掉 base 末尾斜杠后拼接 path，保证只出现一个斜杠 */
export function joinUrl(base: string, path: string): string {
  const b = base.trim().replace(/\/+$/, "")
  const p = path.startsWith("/") ? path : `/${path}`
  return b + p
}

export function withQuery(url: string, query?: Record<string, string | undefined>): string {
  if (!query) return url
  const parts: string[] = []
  for (const key of Object.keys(query)) {
    const value = query[key]
    if (value === undefined || value === "") continue
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  }
  if (parts.length === 0) return url
  return `${url}${url.includes("?") ? "&" : "?"}${parts.join("&")}`
}

/** Basic Auth 头值；b64 由调用方注入（App 内用 Data，测试用 Buffer） */
export function basicAuthValue(user: string, pass: string, b64: (s: string) => string): string {
  return `Basic ${b64(`${user}:${pass}`)}`
}

export type PreparedRequest = {
  url: string
  method: HttpMethod
  headers: Record<string, string>
  body?: string
}

export type PrepareOptions = {
  baseUrl: string
  username: string
  password: string
  method: HttpMethod
  path: string
  /** JSON 请求体（与 textBody 二选一） */
  jsonBody?: unknown
  /** 纯文本请求体（如 frpc 的 toml 配置） */
  textBody?: string
  query?: Record<string, string | undefined>
  /** base64 编码实现，注入以便脱离 App 验证 */
  b64: (s: string) => string
}

/**
 * 组装一次 frp Admin API 请求。frp 仅在配置了 webServer.user/password 时校验
 * Basic Auth（两者皆空则不校验），因此凭据为空时不发送 Authorization 头。
 */
export function prepareRequest(opts: PrepareOptions): PreparedRequest {
  const { baseUrl, username, password, method, path, jsonBody, textBody, query, b64 } = opts
  const headers: Record<string, string> = {}
  if (username !== "" || password !== "") {
    headers["Authorization"] = basicAuthValue(username, password, b64)
  }
  let body: string | undefined
  if (jsonBody !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(jsonBody)
  } else if (textBody !== undefined) {
    headers["Content-Type"] = "text/plain; charset=utf-8"
    body = textBody
  }
  return {
    url: withQuery(joinUrl(baseUrl, path), query),
    method,
    headers,
    body,
  }
}

/** frp v1 API 的错误包体形如 {"Code":400,"Msg":"..."} */
export function parseFrpErrorBody(text: string): { code: number; msg: string } | null {
  try {
    const o: unknown = JSON.parse(text)
    if (o && typeof o === "object" && typeof (o as { Code?: unknown }).Code === "number") {
      return {
        code: (o as { Code: number }).Code,
        msg: typeof (o as { Msg?: unknown }).Msg === "string" ? ((o as { Msg: string }).Msg) : "",
      }
    }
  } catch {
    // 非 JSON 包体
  }
  return null
}

export function describeStatus(status: number): string {
  switch (status) {
    case 400:
      return "参数非法 (400)"
    case 401:
      return "用户名或密码错误 (401)"
    case 404:
      return "不存在或未启用 (404)"
    case 409:
      return "名称冲突 (409)"
    default:
      return `HTTP ${status}`
  }
}

/** 优先读 frp 错误包体 {"Code","Msg"}，读不到时按状态码给通用描述 */
export function errorFromResponse(status: number, text: string): Error {
  const parsed = parseFrpErrorBody(text)
  if (parsed) {
    const detail = parsed.msg ? `：${parsed.msg}` : ""
    return new Error(`${describeStatus(parsed.code)}${detail}`)
  }
  return new Error(describeStatus(status))
}

/** 判断异常是否为 404（用于 store 未启用、traffic 旧路径 fallback 等分支） */
export function isNotFoundError(e: unknown): boolean {
  return e instanceof Error && /\b404\b/.test(e.message)
}

// ---------- 展示格式化 ----------

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"]

/** 字节数格式化为人类可读（1.2 MB / 3.4 GB …）；空值显示 "—" */
export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—"
  const neg = n < 0
  let v = Math.abs(n)
  let unit = BYTE_UNITS[0]
  for (const u of BYTE_UNITS) {
    unit = u
    if (v < 1024 || u === BYTE_UNITS[BYTE_UNITS.length - 1]) break
    v /= 1024
  }
  const text = v < 100 && unit !== "B" ? v.toFixed(1) : String(Math.round(v))
  return `${neg ? "-" : ""}${text} ${unit}`
}

/** 把 frp 的 conf/附加信息对象压成可读多行 JSON；非对象原样返回 */
export function describeConf(conf: unknown): string {
  if (conf === null || conf === undefined) return ""
  if (typeof conf === "string") return conf
  try {
    return JSON.stringify(conf, null, 2)
  } catch {
    return String(conf)
  }
}
