import type { Gateway } from "./types"

const GATEWAYS_KEY = "magpie.console.gateways"
const ACTIVE_KEY = "magpie.console.active"
const PINNED_KEY = "magpie.console.pinned"
const KEY_PREFIX = "magpie.admin."

function hasStorage(): boolean {
  return typeof Storage !== "undefined"
}

function hasKeychain(): boolean {
  return typeof Keychain !== "undefined"
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function loadGateways(): Gateway[] {
  if (!hasStorage()) return []
  const list = Storage.get<Gateway[]>(GATEWAYS_KEY)
  return Array.isArray(list) ? list : []
}

export function saveGateways(list: Gateway[]): void {
  if (!hasStorage()) return
  Storage.set(GATEWAYS_KEY, list)
}

export function activeGatewayId(): string | null {
  if (!hasStorage()) return null
  return Storage.get<string>(ACTIVE_KEY)
}

export function setActiveGatewayId(id: string): void {
  if (!hasStorage()) return
  Storage.set(ACTIVE_KEY, id)
}

export function adminKey(gatewayId: string): string {
  if (!hasKeychain()) return ""
  return Keychain.get(KEY_PREFIX + gatewayId) ?? ""
}

export function hasAdminKey(gatewayId: string): boolean {
  return adminKey(gatewayId).length > 0
}

export function saveAdminKey(gatewayId: string, value: string): void {
  if (!hasKeychain()) return
  const key = value.trim()
  if (key.length === 0) {
    Keychain.remove(KEY_PREFIX + gatewayId)
    return
  }
  Keychain.set(KEY_PREFIX + gatewayId, key, { synchronizable: false })
}

export function clearAdminKey(gatewayId: string): void {
  if (!hasKeychain()) return
  Keychain.remove(KEY_PREFIX + gatewayId)
}

export function pinnedModels(): string[] {
  if (!hasStorage()) return []
  const list = Storage.get<string[]>(PINNED_KEY)
  return Array.isArray(list) ? list : []
}

export function setPinnedModels(list: string[]): void {
  if (!hasStorage()) return
  Storage.set(PINNED_KEY, list)
}

export function togglePinnedModel(id: string): string[] {
  const current = pinnedModels()
  const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]
  setPinnedModels(next)
  return next
}

export function clearLocalData(): void {
  const gateways = loadGateways()
  for (const gateway of gateways) clearAdminKey(gateway.id)
  if (!hasStorage()) return
  Storage.remove(GATEWAYS_KEY)
  Storage.remove(ACTIVE_KEY)
  Storage.remove(PINNED_KEY)
}