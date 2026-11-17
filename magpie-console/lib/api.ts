import { fetch } from "scripting"
import { adminKey } from "./store"
import { summarizeError } from "./format"
import type {
  AdminError,
  ApiResult,
  Gateway,
  GatewayKey,
  KeyModelOption,
  KeysPayload,
  ModelEntry,
  ModelsPayload,
  Provider,
  ProvidersPayload,
  RequestLogEntry,
  RoutingGroup,
  RoutingPayload,
  SelfCheckEntry,
} from "./types"

export const paths = {
  models: "/v1/models",
  providers: "/v1/magpie/admin/providers",
  keys: "/v1/magpie/admin/gateway-keys",
  keyModels: "/v1/magpie/admin/gateway-keys/models",
  keyWindows: "/v1/magpie/admin/gateway-keys/account-windows",
  routes: "/v1/magpie/admin/routing-groups",
  accountGroups: "/v1/magpie/admin/account-groups",
  providerTest: "/v1/magpie/admin/provider/test",
  providerDelete: "/v1/magpie/admin/provider/delete",
}

const logEntries: RequestLogEntry[] = []
let logSeq = 0

export function requestLog(): RequestLogEntry[] {
  return logEntries.slice().reverse()
}

export function clearRequestLog(): void {
  logEntries.length = 0
}

function pushLog(method: string, path: string, result: ApiResult<unknown>, note?: string): void {
  logSeq += 1
  logEntries.push({
    id: logSeq,
    method,
    path,
    status: result.status,
    ms: result.ms,
    ok: result.ok,
    at: Date.now(),
    note,
    raw: result.raw,
  })
  if (logEntries.length > 60) logEntries.splice(0, logEntries.length - 60)
}

export function normalizeBaseURL(input: string): string {
  let value = input.trim()
  if (!value) return ""
  if (!/^https?:\/\//i.test(value)) value = "http://" + value
  value = value.replace(/\/+$/, "")
  return value
}

export function gatewayRoot(baseURL: string): string {
  return normalizeBaseURL(baseURL).replace(/\/v1$/i, "")
}

export function joinURL(baseURL: string, path: string): string {
  return normalizeBaseURL(baseURL) + path
}

function hintFor(status: number, code?: string): string | undefined {
  if (code === "admin_key_required") {
    return "需要一把网关密钥:在 magpie 运行命令 `magpie gateway-key add <名称>`,再用 `magpie gateway-key admin <id> local`(其他机器用 any)。"
  }
  if (code === "gateway_key_not_admin") {
    return "这把密钥没有管理权限。请在 magpie 运行 `magpie gateway-key admin <id> local`(跨机器用 any),或在应用里打开该密钥的 Advanced。"
  }
  if (code === "admin_browser_refused") {
    return "magpie 拒绝了带浏览器头的请求。Scripting 的请求默认不带这些头,若出现此错误请把诊断页信息反馈给作者。"
  }
  if (code === "admin_host_refused") {
    return "请用 localhost 或 127.0.0.1 访问本机管理 API,不要用其他主机名。"
  }
  if (code === "admin_unavailable") {
    return "这个 magpie 进程没有加载管理 API,请启动桌面版或 `magpie web`。"
  }
  if (status === 401) return "缺少或无效的 admin 网关密钥。"
  if (status === 403) return "密钥权限不足,或 magpie 拒绝了该来源。"
  if (status === 404) return "magpie 版本可能没有这个管理路由,请升级 magpie。"
  if (status === 409) return "同名对象已存在,请换一个 id 或名称。"
  if (status >= 500) return "magpie 内部错误,请查看 magpie 日志。"
  return undefined
}

function parseError(status: number, raw: string, data: any): AdminError {
  const payload = data && typeof data === "object" ? (data as any).error : null
  let message = ""
  let code: string | undefined
  if (typeof payload === "string") {
    message = payload
  } else if (payload && typeof payload === "object") {
    message = payload.message ?? payload.error ?? ""
    code = payload.code
  }
  if (!message) message = raw ? raw.slice(0, 280) : "HTTP " + status
  return { message, code, hint: hintFor(status, code) }
}

type CallOptions = {
  method?: "GET" | "POST"
  body?: any
  auth?: boolean
  timeout?: number
  note?: string
}

async function call<T>(gateway: Gateway, path: string, options?: CallOptions): Promise<ApiResult<T>> {
  const started = Date.now()
  const url = joinURL(gateway.baseURL, path)
  const method = options?.method ?? "GET"
  const headers: Record<string, string> = { Accept: "application/json" }
  if (options?.auth !== false) {
    const key = gateway.adminKey ?? adminKey(gateway.id)
    if (key) headers["Authorization"] = "Bearer " + key
  }
  if (options?.body !== undefined) headers["Content-Type"] = "application/json"

  let status = 0
  let raw = ""
  let data: any = null

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: options?.body === undefined ? undefined : JSON.stringify(options.body),
      allowInsecureRequest: true,
      timeout: options?.timeout ?? 15,
      debugLabel: "magpie " + path,
    })
    status = response.status
    raw = await response.text()
    if (raw) {
      try {
        data = JSON.parse(raw)
      } catch {
        data = null
      }
    }
  } catch (error) {
    const result: ApiResult<T> = {
      ok: false,
      status: 0,
      data: null,
      raw: "",
      ms: Date.now() - started,
      error: {
        message: summarizeError(error),
        hint: "检查地址、端口与网络。手机不能用 127.0.0.1,请填 Mac 的局域网地址或 Tailscale 地址。",
      },
    }
    pushLog(method, path, result, options?.note)
    return result
  }

  const message = data && typeof data === "object" ? (data as any).error?.message : ""
  const ok = status >= 200 && status < 300 && !message
  const result: ApiResult<T> = {
    ok,
    status,
    data: ok ? (data as T) : null,
    raw,
    ms: Date.now() - started,
    error: ok ? undefined : parseError(status, raw, data),
  }
  pushLog(method, path, result, options?.note)
  return result
}

export function fetchProviders(gateway: Gateway): Promise<ApiResult<ProvidersPayload>> {
  return call<ProvidersPayload>(gateway, paths.providers, { note: "供应商列表" })
}

export function fetchModels(gateway: Gateway): Promise<ApiResult<ModelsPayload>> {
  return call<ModelsPayload>(gateway, paths.models, { note: "模型目录" })
}

export function fetchGatewayKeys(gateway: Gateway): Promise<ApiResult<KeysPayload>> {
  return call<KeysPayload>(gateway, paths.keys, { note: "网关密钥" })
}

export function fetchKeyModels(gateway: Gateway): Promise<ApiResult<{ models?: KeyModelOption[] }>> {
  return call<{ models?: KeyModelOption[] }>(gateway, paths.keyModels, { note: "密钥可用模型" })
}

export function fetchRoutingGroups(gateway: Gateway): Promise<ApiResult<RoutingPayload>> {
  return call<RoutingPayload>(gateway, paths.routes, { note: "路由组" })
}

export function fetchAccountGroups(gateway: Gateway): Promise<ApiResult<{ groups?: any[] }>> {
  return call<{ groups?: any[] }>(gateway, paths.accountGroups, { note: "账号组" })
}

export function keyAction(
  gateway: Gateway,
  action: string,
  body: Record<string, any>,
): Promise<ApiResult<KeysPayload>> {
  return call<KeysPayload>(gateway, `${paths.keys}/${action}`, {
    method: "POST",
    body,
    timeout: 25,
    note: "密钥操作 " + action,
  })
}

export function updateRoutingGroup(
  gateway: Gateway,
  body: Record<string, any>,
): Promise<ApiResult<any>> {
  return call<any>(gateway, `${paths.routes}/update`, {
    method: "POST",
    body,
    timeout: 25,
    note: "更新路由组",
  })
}

export function testProvider(gateway: Gateway, id: string): Promise<ApiResult<any>> {
  return call<any>(gateway, paths.providerTest, {
    method: "POST",
    body: { id },
    timeout: 60,
    note: "测试供应商 " + id,
  })
}

export function deleteProvider(gateway: Gateway, id: string): Promise<ApiResult<any>> {
  return call<any>(gateway, paths.providerDelete, {
    method: "POST",
    body: { id },
    timeout: 30,
    note: "删除供应商 " + id,
  })
}

export function providerList(payload?: ProvidersPayload | null): Provider[] {
  const list = payload?.providers
  if (!Array.isArray(list)) return []
  return list.filter(item => item && typeof item.id === "string")
}

export function gatewayKeyList(payload?: KeysPayload | null): GatewayKey[] {
  const list = payload?.keys
  if (!Array.isArray(list)) return []
  return list.filter(item => item && typeof item.id === "string")
}

export function routingGroupList(payload?: RoutingPayload | null): RoutingGroup[] {
  const list = payload?.groups
  if (!Array.isArray(list)) return []
  return list.filter(item => item && typeof item.id === "string")
}

export function modelList(payload?: ModelsPayload | null): ModelEntry[] {
  const list = payload?.data ?? payload?.models
  if (!Array.isArray(list)) return []
  return list
    .filter(item => item && typeof item.id === "string")
    .map(item => {
      const group =
        item.group === true ||
        item.id.startsWith("auto/") ||
        item.id.startsWith("group/") ||
        (item.magpie_label ?? "").includes("routing group")
      return {
        ...item,
        name: item.name || item.display_name || item.magpie_label,
        group,
        context_window: item.context_window ?? item.context_length,
        vision: item.vision ?? (item.modalities?.input?.includes("image") ?? false),
        tools: item.tools ?? item.tool_call ?? false,
      }
    })
}

export function providerIdOfModel(model: ModelEntry): string {
  if (model.group) return "路由组"
  if (model.provider) return String(model.provider)
  const slash = model.id.indexOf("/")
  if (slash > 0) return model.id.slice(0, slash)
  return model.owned_by || "其他"
}

export async function probeGateway(gateway: Gateway): Promise<{
  models: ApiResult<ModelsPayload>
  admin: ApiResult<ProvidersPayload>
}> {
  const [models, admin] = await Promise.all([
    fetchModels(gateway),
    fetchProviders(gateway),
  ])
  return { models, admin }
}

export async function selfCheck(gateway: Gateway): Promise<SelfCheckEntry[]> {
  const checks: { label: string; path: string; summarize: (payload: any) => string }[] = [
    {
      label: "模型目录",
      path: paths.models,
      summarize: payload => modelList(payload).length + " 个模型",
    },
    {
      label: "管理 API · 供应商",
      path: paths.providers,
      summarize: payload => providerList(payload).length + " 个供应商",
    },
    {
      label: "管理 API · 网关密钥",
      path: paths.keys,
      summarize: payload => gatewayKeyList(payload).length + " 把密钥",
    },
    {
      label: "管理 API · 路由组",
      path: paths.routes,
      summarize: payload => routingGroupList(payload).length + " 个路由组",
    },
  ]

  const entries: SelfCheckEntry[] = []
  for (const check of checks) {
    const result = await call<any>(gateway, check.path, { note: "自检 " + check.label, timeout: 20 })
    entries.push({
      label: check.label,
      path: check.path,
      ok: result.ok,
      status: result.status,
      ms: result.ms,
      summary: result.ok ? check.summarize(result.data) : result.error?.message ?? "失败",
      raw: result.raw,
    })
  }
  return entries
}