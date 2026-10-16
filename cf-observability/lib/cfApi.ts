// Cloudflare API 封装：v4 REST（Bearer 用户 API 令牌）、GraphQL Analytics、Workers Observability
import { fetch } from "scripting"
import {
  authHeaders,
  buildEventsBody,
  buildUrl,
  cfErrorMessage,
  GRAPHQL_URL,
  graphqlErrorMessage,
  parsePagesProjects,
  parseWorkerScripts,
  type GraphqlBody,
  type Project,
  type TelemetryBody,
} from "./cfCore"

const REQUEST_TIMEOUT = 20

type Method = "GET" | "POST"

function wrapFetchError(e: unknown): Error {
  const s = String(e)
  if (/timeout|timed?\s*out|ETIMEDOUT|超时/i.test(s)) return new Error("连接 Cloudflare API 超时，请检查网络")
  if (/offline|not connected|network/i.test(s)) return new Error("网络不可用，请检查网络连接")
  return e instanceof Error ? e : new Error(s)
}

async function send(url: string, token: string, method: Method, body?: unknown, label?: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, {
    method,
    headers: authHeaders(token),
    body: body === undefined ? undefined : JSON.stringify(body),
    timeout: REQUEST_TIMEOUT,
    debugLabel: `cf-observability ${label ?? method}`,
  }).catch((e) => {
    throw wrapFetchError(e)
  })
  return { status: res.status, text: await res.text() }
}

/** v4 REST：成功返回 result 与 result_info，失败抛出中文错误 */
async function rest<T>(
  token: string,
  method: Method,
  path: string,
  opts?: { query?: Record<string, string | number | undefined>; body?: unknown }
): Promise<{ result: T; info: any }> {
  const { status, text } = await send(buildUrl(path, opts?.query), token, method, opts?.body, `${method} ${path}`)
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  if (status < 200 || status >= 300 || !json || json.success === false) {
    throw new Error(cfErrorMessage(status, text))
  }
  return { result: json.result as T, info: json.result_info }
}

// ---------- 令牌 / 账户 ----------

export type TokenInfo = { id: string; status: string; expiresOn: string | null; scope: "user" | "account" }

/** 先按用户令牌校验；失败且有 Account ID 时再按账户令牌校验 */
export async function verifyToken(token: string, accountId?: string): Promise<TokenInfo> {
  try {
    const { result } = await rest<any>(token, "GET", "/user/tokens/verify")
    return { id: String(result?.id ?? ""), status: String(result?.status ?? ""), expiresOn: result?.expires_on ?? null, scope: "user" }
  } catch (e) {
    if (!accountId) throw e
    const { result } = await rest<any>(token, "GET", `/accounts/${accountId}/tokens/verify`)
    return { id: String(result?.id ?? ""), status: String(result?.status ?? ""), expiresOn: result?.expires_on ?? null, scope: "account" }
  }
}

export type Account = { id: string; name: string }

export async function listAccounts(token: string): Promise<Account[]> {
  const { result } = await rest<any[]>(token, "GET", "/accounts", { query: { per_page: 50 } })
  return (Array.isArray(result) ? result : [])
    .filter((a) => typeof a?.id === "string")
    .map((a) => ({ id: a.id, name: String(a.name ?? a.id) }))
}

// ---------- 项目 ----------

export async function listWorkers(token: string, accountId: string): Promise<Project[]> {
  const { result } = await rest<unknown>(token, "GET", `/accounts/${accountId}/workers/scripts`)
  return parseWorkerScripts(result)
}

export async function listPages(token: string, accountId: string): Promise<Project[]> {
  const all: unknown[] = []
  for (let page = 1; page <= 20; page++) {
    const { result, info } = await rest<unknown[]>(token, "GET", `/accounts/${accountId}/pages/projects`, {
      query: { page, per_page: 10 },
    })
    const list = Array.isArray(result) ? result : []
    all.push(...list)
    const totalPages = Number(info?.total_pages)
    if (list.length === 0 || !Number.isFinite(totalPages) || page >= totalPages) break
  }
  return parsePagesProjects(all)
}

// ---------- GraphQL Analytics ----------

export async function graphql(token: string, body: GraphqlBody): Promise<any> {
  const { status, text } = await send(GRAPHQL_URL, token, "POST", body, "graphql")
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  if (status < 200 || status >= 300 || !json) throw new Error(cfErrorMessage(status, text))
  const err = graphqlErrorMessage(json.errors)
  if (err) throw new Error(err)
  return json.data
}

// ---------- Workers Observability ----------

export async function telemetryQuery(token: string, accountId: string, body: TelemetryBody): Promise<any> {
  const { result } = await rest<any>(token, "POST", `/accounts/${accountId}/workers/observability/telemetry/query`, { body })
  return result
}

// ---------- 权限检查 ----------

export type PermissionCheck = {
  id: string
  title: string
  permission: string
  required: boolean
  ok: boolean
  detail: string
}

async function probe(fn: () => Promise<string>): Promise<{ ok: boolean; detail: string }> {
  try {
    return { ok: true, detail: await fn() }
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) }
  }
}

/** 逐项调用各接口，确认令牌是否具备脚本需要的权限 */
export async function checkPermissions(token: string, accountId: string): Promise<PermissionCheck[]> {
  const now = Date.now()
  const [verify, accounts, workers, pages, analytics, obs] = await Promise.all([
    probe(async () => {
      const t = await verifyToken(token, accountId)
      return `${t.scope === "user" ? "用户令牌" : "账户令牌"} · ${t.status}${t.expiresOn ? ` · ${t.expiresOn.slice(0, 10)} 过期` : ""}`
    }),
    probe(async () => `可访问 ${(await listAccounts(token)).length} 个账户`),
    probe(async () => `${(await listWorkers(token, accountId)).length} 个 Worker`),
    probe(async () => `${(await listPages(token, accountId)).length} 个 Pages 项目`),
    probe(async () => {
      await graphql(token, {
        query: `query CfProbe($accountTag: string, $s: string, $e: string) { viewer { accounts(filter: { accountTag: $accountTag }) { workersInvocationsAdaptive(limit: 1, filter: { datetime_geq: $s, datetime_leq: $e }) { sum { requests } } } } }`,
        variables: { accountTag: accountId, s: new Date(now - 3_600_000).toISOString(), e: new Date(now).toISOString() },
      })
      return "GraphQL 可用"
    }),
    probe(async () => {
      await telemetryQuery(token, accountId, buildEventsBody({ service: "__cf_observability_probe__", from: now - 300_000, to: now, limit: 1 }))
      return "Observability 可用"
    }),
  ])
  return [
    { id: "verify", title: "令牌有效", permission: "无需额外权限", required: true, ...verify },
    { id: "analytics", title: "用量与指标", permission: "Account Analytics: Read", required: true, ...analytics },
    { id: "workers", title: "Worker 列表", permission: "Workers Scripts: Read", required: true, ...workers },
    { id: "pages", title: "Pages 项目列表", permission: "Cloudflare Pages: Read", required: true, ...pages },
    { id: "obs", title: "日志查询", permission: "Workers Observability: Write", required: false, ...obs },
    { id: "accounts", title: "自动识别账户", permission: "Account Settings: Read", required: false, ...accounts },
  ]
}
