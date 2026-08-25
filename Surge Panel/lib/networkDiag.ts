import { Device } from "scripting"
import {
  evaluateScript,
  getPolicyDetail,
  getPolicyGroupSelection,
  getPolicyGroups,
  type PolicyOption,
  type SurgeConfig,
} from "./surgeApi"
import { instanceIsReady, instanceToConfig, type SurgeInstance } from "./instances"
import { maskIp } from "./metrics"
import {
  parseWidgetParameter,
  resolvedWidgetPrefs,
  widgetInstance,
  type WidgetParameter,
  type WidgetPrefs,
} from "./widgetPrefs"

export type ServiceCategory = "media" | "ai"

export type ServiceReachability = {
  id: string
  name: string
  category: ServiceCategory
  reachable: boolean
  status: number
}

export type NetworkEnvironment = {
  ssid: string
  ipv4: string
  ipv6: string
  gateway: string
  dns: string[]
  interfaceName: string
}

export type ExitInfo = {
  ip: string
  country: string
  countryCode: string
  region: string
  city: string
  isp: string
  asn: string
  hosting: boolean
  proxy: boolean
  vpn: boolean
  tor: boolean
  abuser: boolean
  source: string
}

export type RiskSummary = {
  score: number
  level: "低" | "中" | "高"
  heuristic: true
  deepChecked: boolean
}

export type DiagnosticPolicy = {
  requested: string
  label: string
  node: string
  protocol: string
}

export type NetworkSnapshot = {
  schema: 1
  ok: boolean
  instanceId: string
  instanceName: string
  generatedAt: number
  cachedAt: number
  stale: boolean
  fromCache: boolean
  error: string
  hideAddresses: boolean
  refreshMin: number
  policy: DiagnosticPolicy
  network: NetworkEnvironment
  directExit: ExitInfo
  policyExit: ExitInfo
  directLatencyMs: number | null
  policyLatencyMs: number | null
  http3: boolean | null
  risk: RiskSummary
  services: ServiceReachability[]
}

type ProbeTarget = {
  id: string
  url: string
  policy: string
  captureBody?: boolean
  category?: ServiceCategory
  name?: string
}

type ProbeResult = {
  id: string
  ok: boolean
  status: number
  ms: number
  body: string
  category?: ServiceCategory
  name?: string
}

type ProbePayload = {
  network?: unknown
  results?: ProbeResult[]
}

const SNAPSHOT_PREFIX = "surge_panel_widget_snapshot:"
const PANEL_PREFS_KEY = "surge_panel_prefs"
const MAX_STALE_MS = 6 * 60 * 60 * 1000

const MEDIA_TARGETS: Omit<ProbeTarget, "policy">[] = [
  { id: "media-netflix", name: "Netflix", category: "media", url: "https://www.netflix.com/title/81215567" },
  { id: "media-disney", name: "Disney+", category: "media", url: "https://www.disneyplus.com/" },
  { id: "media-spotify", name: "Spotify", category: "media", url: "https://open.spotify.com/" },
  { id: "media-tiktok", name: "TikTok", category: "media", url: "https://www.tiktok.com/" },
  { id: "media-youtube", name: "YouTube", category: "media", url: "https://www.youtube.com/" },
  { id: "media-prime", name: "Prime", category: "media", url: "https://www.primevideo.com/" },
]

const AI_TARGETS: Omit<ProbeTarget, "policy">[] = [
  { id: "ai-chatgpt", name: "ChatGPT", category: "ai", url: "https://chatgpt.com/" },
  { id: "ai-claude", name: "Claude", category: "ai", url: "https://claude.ai/" },
  { id: "ai-gemini", name: "Gemini", category: "ai", url: "https://gemini.google.com/" },
  { id: "ai-deepseek", name: "DeepSeek", category: "ai", url: "https://chat.deepseek.com/" },
  { id: "ai-grok", name: "Grok", category: "ai", url: "https://grok.com/" },
  { id: "ai-perplexity", name: "Perplexity", category: "ai", url: "https://www.perplexity.ai/" },
]

const EMPTY_EXIT: ExitInfo = {
  ip: "",
  country: "",
  countryCode: "",
  region: "",
  city: "",
  isp: "",
  asn: "",
  hosting: false,
  proxy: false,
  vpn: false,
  tor: false,
  abuser: false,
  source: "",
}

const EMPTY_NETWORK: NetworkEnvironment = {
  ssid: "",
  ipv4: "",
  ipv6: "",
  gateway: "",
  dns: [],
  interfaceName: "",
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function boolValue(...values: unknown[]): boolean {
  return values.some((value) => value === true || value === 1 || value === "yes")
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function nested(source: unknown, ...path: string[]): unknown {
  let current: unknown = source
  for (const key of path) current = objectValue(current)[key]
  return current
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** 兼容 /v1/scripting/evaluate 在不同 Surge 版本中的返回包装。 */
export function unwrapEvaluateResult(raw: unknown): unknown {
  let value = raw
  for (let depth = 0; depth < 6; depth++) {
    if (typeof value === "string") {
      const parsed = parseJson(value)
      if (parsed == null) return value
      value = parsed
      continue
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return value
    const record = value as Record<string, unknown>
    if (Array.isArray(record.results) || record.network) return record
    const key = ["result", "output", "value", "data", "response", "scriptResult"].find(
      (name) => record[name] !== undefined
    )
    if (!key) return value
    value = record[key]
  }
  return value
}

function policyOption(policy: string): string {
  return policy ? `,policy:${JSON.stringify(policy)}` : ""
}

/**
 * 生成在 Surge 内执行的批量探测脚本。策略名只作为 JSON 字面量写入，
 * 不拼入可执行语句，避免引号或换行破坏脚本。
 */
export function buildNetworkProbeScript(targets: ProbeTarget[], concurrency = 6): string {
  const safeTargets = targets.map((target) => ({
    ...target,
    policy: stringValue(target.policy),
  }))
  return [
    `const targets=${JSON.stringify(safeTargets)};`,
    `const limit=${Math.max(1, Math.min(8, Math.floor(concurrency)))};`,
    "let cursor=0;const results=[];",
    "function probe(t){return new Promise(function(resolve){",
    "const started=Date.now();",
    "const options={url:t.url,timeout:5,\"auto-redirect\":true,\"auto-cookie\":false,headers:{\"User-Agent\":\"Mozilla/5.0 (iPhone; Surge Panel Widget)\",Accept:\"application/json,text/plain,text/html,*/*\",\"Cache-Control\":\"no-cache\"}};",
    "if(t.policy)options.policy=t.policy;",
    "$httpClient.get(options,function(error,response,data){",
    "const status=response&&Number(response.status||response.statusCode)||0;",
    "const body=t.captureBody&&data!=null?String(data).slice(0,8000):\"\";",
    "resolve({id:t.id,ok:!error&&status>=200&&status<500,status:status,ms:Math.max(1,Date.now()-started),body:body,category:t.category,name:t.name});",
    "});});}",
    "function worker(){if(cursor>=targets.length)return Promise.resolve();const t=targets[cursor++];return probe(t).then(function(r){results.push(r);return worker();});}",
    "const workers=[];for(let i=0;i<Math.min(limit,targets.length);i++)workers.push(worker());",
    "Promise.all(workers).then(function(){$done({network:$network,results:results});}).catch(function(e){$done({network:$network,results:results,error:String(e)});});",
  ].join("")
}

export function buildRiskProbeScript(ip: string, policy: string): string {
  const target = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=1&asn=1&risk=1`
  return [
    "const started=Date.now();",
    `const options={url:${JSON.stringify(target)},timeout:5,"auto-redirect":true,"auto-cookie":false,headers:{Accept:"application/json","Cache-Control":"no-cache"}${policyOption(policy)}};`,
    "$httpClient.get(options,function(error,response,data){",
    "const status=response&&Number(response.status||response.statusCode)||0;",
    "$done({results:[{id:\"risk\",ok:!error&&status>=200&&status<400,status:status,ms:Math.max(1,Date.now()-started),body:data==null?\"\":String(data).slice(0,8000)}]});",
    "});",
  ].join("")
}

function localInterfaces(): Partial<NetworkEnvironment> {
  try {
    const interfaces = Device.networkInterfaces()
    const preferred = Object.keys(interfaces).sort((a, b) => {
      const rank = (name: string) =>
        /^en\d+$/i.test(name) ? 0 : /^pdp_ip/i.test(name) ? 1 : /^utun/i.test(name) ? 3 : 2
      return rank(a) - rank(b)
    })
    for (const name of preferred) {
      const entries = interfaces[name] ?? []
      const ipv4 = entries.find((entry) => entry.family === "IPv4" && !entry.isInternal)?.address
      const ipv6 = entries.find((entry) => entry.family === "IPv6" && !entry.isInternal)?.address
      if (ipv4 || ipv6) return { ipv4: ipv4 ?? "", ipv6: ipv6 ?? "", interfaceName: name }
    }
  } catch {
    // 旧版 Scripting 没有 Device.networkInterfaces，交给 Surge $network
  }
  return {}
}

export function parseNetworkEnvironment(raw: unknown): NetworkEnvironment {
  const source = objectValue(unwrapEvaluateResult(raw))
  const network = objectValue(source.network ?? source)
  const wifi = objectValue(network.wifi)
  const v4 = objectValue(network.v4)
  const v6 = objectValue(network.v6)
  const dnsRaw = network.dns
  const fallback = localInterfaces()
  return {
    ssid: stringValue(wifi.ssid),
    ipv4: stringValue(v4.primaryAddress) || fallback.ipv4 || "",
    ipv6: stringValue(v6.primaryAddress) || fallback.ipv6 || "",
    gateway: stringValue(v4.primaryRouter),
    dns: Array.isArray(dnsRaw) ? dnsRaw.map(stringValue).filter(Boolean) : [],
    interfaceName:
      stringValue(v4.primaryInterface) ||
      stringValue(v6.primaryInterface) ||
      fallback.interfaceName ||
      "",
  }
}

export function parseExitInfo(data: unknown, source = ""): ExitInfo {
  const root = objectValue(data)
  const location = objectValue(root.location)
  const company = objectValue(root.company)
  const connection = objectValue(root.connection)
  const asnObject = objectValue(root.asn)
  const security = objectValue(root.security)
  const countryRaw =
    stringValue(root.country) ||
    stringValue(root.country_name) ||
    stringValue(location.country) ||
    stringValue(location.country_name)
  const asnRaw =
    root.asn && typeof root.asn !== "object"
      ? root.asn
      : asnObject.asn ?? connection.asn ?? root.as
  return {
    ip:
      stringValue(root.ip) ||
      stringValue(root.query) ||
      stringValue(root.ip_address),
    country: countryRaw,
    countryCode:
      stringValue(root.country_code) ||
      stringValue(root.countryCode) ||
      stringValue(location.country_code),
    region:
      stringValue(root.region) ||
      stringValue(root.regionName) ||
      stringValue(location.state) ||
      stringValue(location.region),
    city: stringValue(root.city) || stringValue(location.city),
    isp:
      stringValue(root.isp) ||
      stringValue(connection.isp) ||
      stringValue(company.name) ||
      stringValue(root.org),
    asn: asnRaw == null ? "" : String(asnRaw).replace(/^AS/i, "AS"),
    hosting: boolValue(root.is_datacenter, root.datacenter, root.hosting, security.hosting),
    proxy: boolValue(root.is_proxy, root.proxy, security.proxy),
    vpn: boolValue(root.is_vpn, root.vpn, security.vpn),
    tor: boolValue(root.is_tor, root.tor, security.tor),
    abuser: boolValue(root.is_abuser, root.abuser),
    source,
  }
}

function mergeExit(primary: ExitInfo, fallback: ExitInfo): ExitInfo {
  const text = (a: string, b: string) => a || b
  return {
    ip: text(primary.ip, fallback.ip),
    country: text(primary.country, fallback.country),
    countryCode: text(primary.countryCode, fallback.countryCode),
    region: text(primary.region, fallback.region),
    city: text(primary.city, fallback.city),
    isp: text(primary.isp, fallback.isp),
    asn: text(primary.asn, fallback.asn),
    hosting: primary.hosting || fallback.hosting,
    proxy: primary.proxy || fallback.proxy,
    vpn: primary.vpn || fallback.vpn,
    tor: primary.tor || fallback.tor,
    abuser: primary.abuser || fallback.abuser,
    source: text(primary.source, fallback.source),
  }
}

function parseExitResult(results: ProbeResult[], prefix: string): ExitInfo {
  const primaryResult = results.find((item) => item.id === `${prefix}-primary` && item.ok)
  const fallbackResult = results.find((item) => item.id === `${prefix}-fallback` && item.ok)
  const primary = primaryResult
    ? parseExitInfo(parseJson(primaryResult.body), "ipapi.is")
    : EMPTY_EXIT
  const fallback = fallbackResult
    ? parseExitInfo(parseJson(fallbackResult.body), "ipwho.is")
    : EMPTY_EXIT
  return mergeExit(primary, fallback)
}

function parseProxyCheck(data: unknown, ip: string): Partial<ExitInfo> & { risk?: number } {
  const root = objectValue(data)
  const record = objectValue(root[ip])
  return {
    proxy: stringValue(record.proxy).toLowerCase() === "yes",
    vpn: stringValue(record.type).toLowerCase() === "vpn",
    tor: stringValue(record.type).toLowerCase() === "tor",
    hosting: /hosting|business/i.test(stringValue(record.type)),
    risk: Number(record.risk),
    asn: stringValue(record.asn),
    isp: stringValue(record.provider),
  }
}

export function riskSummary(
  exit: ExitInfo,
  deep?: Partial<ExitInfo> & { risk?: number }
): RiskSummary {
  let score = exit.hosting ? 76 : 92
  if (exit.proxy || deep?.proxy) score -= 24
  if (exit.vpn || deep?.vpn) score -= 18
  if (exit.tor || deep?.tor) score -= 55
  if (exit.abuser || deep?.abuser) score -= 32
  const reportedRisk = Number(deep?.risk)
  if (Number.isFinite(reportedRisk)) score -= Math.round(Math.max(0, reportedRisk - 20) * 0.25)
  score = Math.max(0, Math.min(100, Math.round(score)))
  return {
    score,
    level: score >= 75 ? "低" : score >= 45 ? "中" : "高",
    heuristic: true,
    deepChecked: Boolean(deep),
  }
}

function minLatency(results: ProbeResult[], prefix: string): number | null {
  const values = results
    .filter((result) => result.id.startsWith(prefix) && result.ok && result.ms > 0)
    .map((result) => result.ms)
  return values.length ? Math.min(...values) : null
}

function parseHttp3(results: ProbeResult[]): boolean | null {
  const result = results.find((item) => item.id === "http3")
  if (!result?.ok) return null
  const match = result.body.match(/(?:^|\n)http=([^\n\r]+)/i)
  if (!match) return false
  return /^(h3|http3|http\/3)$/i.test(match[1].trim())
}

function parseServices(results: ProbeResult[]): ServiceReachability[] {
  return results
    .filter((item) => item.category === "media" || item.category === "ai")
    .map((item) => ({
      id: item.id,
      name: item.name || item.id,
      category: item.category as ServiceCategory,
      reachable: item.ok,
      status: item.status,
    }))
}

function protocolFromText(value: string): string {
  const text = value.toLowerCase()
  const candidates: [RegExp, string][] = [
    [/(^|[,\s])snell([,\s]|$)/, "Snell"],
    [/(^|[,\s])trojan([,\s]|$)/, "Trojan"],
    [/(^|[,\s])vmess([,\s]|$)/, "VMess"],
    [/(^|[,\s])ss([,\s]|$)|shadowsocks/, "Shadowsocks"],
    [/socks5/, "SOCKS5"],
    [/https/, "HTTPS"],
    [/(^|[,\s])http([,\s]|$)/, "HTTP"],
    [/wireguard/, "WireGuard"],
    [/direct/, "DIRECT"],
  ]
  return candidates.find(([pattern]) => pattern.test(text))?.[1] ?? ""
}

async function resolvePolicy(
  config: SurgeConfig,
  requested: string,
  groups?: Record<string, PolicyOption[]>
): Promise<DiagnosticPolicy> {
  const policy = stringValue(requested)
  if (!policy) return { requested: "", label: "默认规则", node: "", protocol: "规则路由" }
  if (policy.toUpperCase() === "DIRECT") {
    return { requested: "DIRECT", label: "DIRECT", node: "DIRECT", protocol: "DIRECT" }
  }
  let node = policy
  const seen = new Set<string>()
  const allGroups = groups ?? (await getPolicyGroups(config).catch(() => ({})))
  while (allGroups[node] && !seen.has(node) && seen.size < 4) {
    seen.add(node)
    const selected = await getPolicyGroupSelection(config, node).catch(() => null)
    if (!selected?.policy) break
    node = selected.policy
  }
  const detail = await getPolicyDetail(config, node).catch(() => ({}))
  const line = detail[node] ?? Object.values(detail)[0] ?? ""
  return {
    requested: policy,
    label: policy,
    node: node === policy ? "" : node,
    protocol: protocolFromText(line) || (node === policy ? "策略" : "节点"),
  }
}

function buildTargets(prefs: WidgetPrefs): ProbeTarget[] {
  const main = prefs.policy
  const media = prefs.mediaPolicy || main
  const ai = prefs.aiPolicy || main
  const cacheBust = `?_=${Date.now()}`
  return [
    {
      id: "policy-exit-primary",
      url: `https://api.ipapi.is/${cacheBust}`,
      policy: main,
      captureBody: true,
    },
    {
      id: "policy-exit-fallback",
      url: `https://ipwho.is/${cacheBust}`,
      policy: main,
      captureBody: true,
    },
    {
      id: "direct-exit-primary",
      url: `https://api.ipapi.is/${cacheBust}`,
      policy: "DIRECT",
      captureBody: true,
    },
    {
      id: "direct-exit-fallback",
      url: `https://ipwho.is/${cacheBust}`,
      policy: "DIRECT",
      captureBody: true,
    },
    {
      id: "policy-latency-cf",
      url: `https://cp.cloudflare.com/generate_204${cacheBust}`,
      policy: main,
    },
    {
      id: "policy-latency-google",
      url: `https://www.gstatic.com/generate_204${cacheBust}`,
      policy: main,
    },
    {
      id: "direct-latency-miui",
      url: `http://connect.rom.miui.com/generate_204${cacheBust}`,
      policy: "DIRECT",
    },
    {
      id: "direct-latency-vivo",
      url: `http://wifi.vivo.com.cn/generate_204${cacheBust}`,
      policy: "DIRECT",
    },
    {
      id: "http3",
      url: `https://cloudflare.com/cdn-cgi/trace${cacheBust}`,
      policy: main,
      captureBody: true,
    },
    ...MEDIA_TARGETS.map((target) => ({ ...target, policy: media })),
    ...AI_TARGETS.map((target) => ({ ...target, policy: ai })),
  ]
}

function simpleHash(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function networkSnapshotCacheKey(instanceId: string, prefs: WidgetPrefs): string {
  return `${SNAPSHOT_PREFIX}${instanceId}:${simpleHash(
    JSON.stringify([prefs.policy, prefs.mediaPolicy, prefs.aiPolicy, prefs.deepRisk])
  )}`
}

function readCachedSnapshot(key: string): NetworkSnapshot | null {
  const raw = Storage.get(key)
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const snapshot = raw as NetworkSnapshot
  return snapshot.schema === 1 && typeof snapshot.generatedAt === "number" ? snapshot : null
}

function hideAddresses(): boolean {
  const prefs = objectValue(Storage.get(PANEL_PREFS_KEY))
  return prefs.hideAddresses === true
}

function resultList(raw: unknown): ProbeResult[] {
  const payload = objectValue(unwrapEvaluateResult(raw)) as ProbePayload
  return Array.isArray(payload.results) ? payload.results : []
}

function errorSnapshot(
  instance: SurgeInstance | null,
  prefs: WidgetPrefs,
  message: string
): NetworkSnapshot {
  const now = Date.now()
  return {
    schema: 1,
    ok: false,
    instanceId: instance?.id ?? "",
    instanceName: instance?.name ?? "未配置",
    generatedAt: now,
    cachedAt: now,
    stale: false,
    fromCache: false,
    error: message,
    hideAddresses: hideAddresses(),
    refreshMin: prefs.refreshMin,
    policy: { requested: prefs.policy, label: prefs.policy || "默认规则", node: "", protocol: "" },
    network: EMPTY_NETWORK,
    directExit: EMPTY_EXIT,
    policyExit: EMPTY_EXIT,
    directLatencyMs: null,
    policyLatencyMs: null,
    http3: null,
    risk: riskSummary(EMPTY_EXIT),
    services: [],
  }
}

async function deepRisk(
  config: SurgeConfig,
  ip: string,
  policy: string
): Promise<(Partial<ExitInfo> & { risk?: number }) | undefined> {
  if (!ip) return undefined
  const raw = await evaluateScript(config, buildRiskProbeScript(ip, policy), "generic", 8)
  const result = resultList(raw).find((item) => item.id === "risk" && item.ok)
  return result ? parseProxyCheck(parseJson(result.body), ip) : undefined
}

export async function loadNetworkSnapshot(options?: {
  parameter?: string | WidgetParameter
  force?: boolean
}): Promise<NetworkSnapshot> {
  const parameter =
    typeof options?.parameter === "string"
      ? parseWidgetParameter(options.parameter)
      : options?.parameter
  const prefs = resolvedWidgetPrefs(parameter)
  const { instance } = widgetInstance(prefs)
  if (!instance || !instanceIsReady(instance)) {
    return errorSnapshot(instance, prefs, "请先在 Surge Panel 设置中添加可用实例")
  }

  const cacheKey = networkSnapshotCacheKey(instance.id, prefs)
  const cached = readCachedSnapshot(cacheKey)
  const now = Date.now()
  const ttl = prefs.refreshMin * 60 * 1000
  if (!options?.force && cached && now - cached.generatedAt < ttl) {
    return { ...cached, fromCache: true, stale: false, cachedAt: cached.generatedAt }
  }

  const config = instanceToConfig(instance)
  try {
    const groupsPromise = getPolicyGroups(config).catch(() => ({}))
    const probePromise = evaluateScript(
      config,
      buildNetworkProbeScript(buildTargets(prefs)),
      "generic",
      15
    )
    const [groups, raw] = await Promise.all([groupsPromise, probePromise])
    const payload = objectValue(unwrapEvaluateResult(raw)) as ProbePayload
    const results = Array.isArray(payload.results) ? payload.results : []
    if (results.length === 0) throw new Error("Surge 未返回诊断结果，请确认脚本功能已开启")

    let policyExit = parseExitResult(results, "policy-exit")
    const directExit = parseExitResult(results, "direct-exit")
    const riskExtra = prefs.deepRisk
      ? await deepRisk(config, policyExit.ip, prefs.policy).catch(() => undefined)
      : undefined
    if (riskExtra) {
      policyExit = {
        ...policyExit,
        isp: policyExit.isp || riskExtra.isp || "",
        asn: policyExit.asn || riskExtra.asn || "",
        hosting: policyExit.hosting || Boolean(riskExtra.hosting),
        proxy: policyExit.proxy || Boolean(riskExtra.proxy),
        vpn: policyExit.vpn || Boolean(riskExtra.vpn),
        tor: policyExit.tor || Boolean(riskExtra.tor),
      }
    }
    const snapshot: NetworkSnapshot = {
      schema: 1,
      ok: true,
      instanceId: instance.id,
      instanceName: instance.name,
      generatedAt: now,
      cachedAt: now,
      stale: false,
      fromCache: false,
      error: "",
      hideAddresses: hideAddresses(),
      refreshMin: prefs.refreshMin,
      policy: await resolvePolicy(config, prefs.policy, groups),
      network: parseNetworkEnvironment(payload),
      directExit,
      policyExit,
      directLatencyMs: minLatency(results, "direct-latency-"),
      policyLatencyMs: minLatency(results, "policy-latency-"),
      http3: parseHttp3(results),
      risk: riskSummary(policyExit, riskExtra),
      services: parseServices(results),
    }
    Storage.set(cacheKey, snapshot)
    return snapshot
  } catch (error) {
    if (cached && now - cached.generatedAt <= MAX_STALE_MS) {
      return {
        ...cached,
        fromCache: true,
        stale: true,
        cachedAt: cached.generatedAt,
        error: String(error),
      }
    }
    return errorSnapshot(instance, prefs, String(error))
  }
}

export function displaySnapshotIp(value: string, hidden: boolean): string {
  if (!value) return "—"
  return hidden ? maskIp(value) : value
}
