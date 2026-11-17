export type Gateway = {
  id: string
  name: string
  baseURL: string
  note?: string
  lastOKAt?: number
  adminKey?: string
}

export type AdminError = {
  message: string
  code?: string
  hint?: string
}

export type ApiResult<T> = {
  ok: boolean
  status: number
  data: T | null
  raw: string
  ms: number
  error?: AdminError
}

export type KeyRest = {
  until?: string
  reason?: string
  [key: string]: any
}

export type KeySpend = {
  cap?: number
  spent?: number
  renews?: string
  held?: boolean
  [key: string]: any
}

export type ProviderKeyInfo = {
  id: string
  name?: string
  masked?: string
  active?: boolean
  on?: boolean
  protocol?: string
  weight?: number
  plan?: string
  rest?: KeyRest
  spend?: KeySpend
}

export type ProviderModel = {
  id: string
  name?: string
  on?: boolean
  images?: boolean
  context?: number
  output?: number
  efforts?: string[]
  kept?: string[]
  free?: boolean
  zero?: boolean
}

export type ProviderAccount = {
  id?: string
  name?: string
  plan?: string
  agent?: string
  agentName?: string
  signedIn?: boolean
  [key: string]: any
}

export type Provider = {
  id: string
  name?: string
  host?: string
  icon?: string
  preset?: string
  off?: boolean
  unlisted?: boolean
  noModels?: boolean
  chat?: string
  responses?: string
  anthropic?: string
  gemini?: string
  catalog?: string
  routing?: string
  affinity?: string
  exposed?: number
  listError?: string
  keyList?: ProviderKeyInfo[]
  account?: ProviderAccount
  models?: ProviderModel[]
  [key: string]: any
}

export type GatewayHealth = {
  url?: string
  running?: boolean
  mine?: boolean
  paused?: boolean
  lan?: boolean
  lanURLs?: string[]
  lanPublic?: string[]
  onNetwork?: boolean
  publicURL?: string
  [key: string]: any
}

export type ProvidersPayload = {
  version?: string
  providers?: Provider[]
  gateway?: GatewayHealth
  presets?: any[]
  [key: string]: any
}

export type KeyLimit = {
  period?: string
  days?: number
  hours?: number
  tokens?: number
  cost?: number
  cacheReads?: boolean
  since?: string
  models?: string[]
  account?: string
  accountWindow?: string
  [key: string]: any
}

export type BudgetStatus = {
  period?: string
  days?: number
  hours?: number
  start?: string
  reset?: string
  calls?: number
  tokens?: number
  cost?: number
  inFlight?: number
  tokenLimit?: number
  costLimit?: number
  tokensLeft?: number
  costLeft?: number
  spent?: boolean
  resetUnknown?: boolean
  models?: string[]
  account?: string
  accountWindow?: string
  [key: string]: any
}

export type GatewayKey = {
  id: string
  name?: string
  off?: boolean
  masked?: string
  readOnly?: boolean
  browser?: boolean
  admin?: string
  lan?: boolean
  quotas?: boolean
  models?: string[]
  accounts?: string[]
  aliases?: Record<string, string>
  limit?: KeyLimit
  moreLimits?: KeyLimit[]
  used?: BudgetStatus
  usedAll?: BudgetStatus[]
  [key: string]: any
}

export type KeysPayload = {
  keys?: GatewayKey[]
  accountNames?: string[]
  accountGroups?: { id: string; name?: string }[]
  secret?: string
  [key: string]: any
}

export type KeyModelOption = {
  id: string
  name?: string
  provider?: string
  providerName?: string
  group?: boolean
  account?: boolean
  key?: boolean
  plan?: string
}

export type RoutingMember = {
  id: string
  ready?: boolean
  provider?: string
  [key: string]: any
}

export type RoutingGroup = {
  id: string
  name?: string
  note?: string
  members?: string[]
  ref?: string
  ready?: boolean
  memberInfo?: RoutingMember[]
  holds?: string[]
  offers?: string[]
  picked?: string
  patterns?: any[]
  routing?: string
  classifierFailed?: { error?: string; at?: string }
  [key: string]: any
}

export type RoutingPayload = {
  groups?: RoutingGroup[]
  [key: string]: any
}

export type ModelEntry = {
  id: string
  name?: string
  display_name?: string
  magpie_label?: string
  provider?: string
  group?: boolean
  context_window?: number
  context_length?: number
  max_output_tokens?: number
  reasoning?: boolean
  reasoning_levels?: string[]
  modalities?: { input?: string[]; output?: string[] }
  tool_call?: boolean
  vision?: boolean
  tools?: boolean
  type?: string
  owned_by?: string
  [key: string]: any
}

export type ModelsPayload = {
  data?: ModelEntry[]
  models?: ModelEntry[]
  [key: string]: any
}

export type RequestLogEntry = {
  id: number
  method: string
  path: string
  status: number
  ms: number
  ok: boolean
  at: number
  note?: string
  raw?: string
}

export type SelfCheckEntry = {
  label: string
  path: string
  ok: boolean
  status: number
  ms: number
  summary: string
  raw: string
}