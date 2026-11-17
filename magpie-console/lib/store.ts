import { Keychain, Storage } from "scripting"
import type { Gateway } from "./types"

const GATEWAYS_KEY = "magpie.console.gateways"
const ACTIVE_KEY = "magpie.console.active"
const PINNED_KEY = "magpie.console.pinned"
const KEY_PREFIX = "magpie.admin."

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function loadGateways(): Gateway[] {
  const list = Storage.get<Gateway[]>(GATEWAYS_KEY)
  return Array.isArray(list) ? list : []
}

export function saveGateways(list: Gateway[]): void {
  Storage.set(GATEWAYS_KEY, list)
}

export function activeGatewayId(): string | null {
  return Storage.get<string>(ACTIVE_KEY)
}

export function setActiveGatewayId(id: string): void {
  Storage.set(ACTIVE_KEY, id)
}

export function adminKey(gatewayId: string): string {
  return Keychain.get(KEY_PREFIX + gatewayId) ?? ""
}

export function hasAdminKey(gatewayId: string): boolean {
  return adminKey(gatewayId).length > 0
}

export function saveAdminKey(gatewayId: string, value: string): void {
  const key = value.trim()
  if (key.length === 0) {
    Keychain.remove(KEY_PREFIX + gatewayId)
    return
  }
  Keychain.set(KEY_PREFIX + gatewayId, key, { synchronizable: false })
}

export function clearAdminKey(gatewayId: string): void {
  Keychain.remove(KEY_PREFIX + gatewayId)
}

export function pinnedModels(): string[] {
  const list = Storage.get<string[]>(PINNED_KEY)
  return Array.isArray(list) ? list : []
}

export function setPinnedModels(list: string[]): void {
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
  Storage.remove(GATEWAYS_KEY)
  Storage.remove(ACTIVE_KEY)
  Storage.remove(PINNED_KEY)
}