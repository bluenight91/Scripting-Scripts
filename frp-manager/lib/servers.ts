// 服务器条目管理：元数据存 Storage（对齐 Surge Panel 的 instances.ts），密码按条目 id 存 Keychain
import type { FrpConn } from "./frpApi"

export type FrpServerKind = "frpc" | "frps"

/** 一个 frpc（客户端，admin 端口）或 frps（服务端，dashboard 端口）管理条目 */
export type FrpServer = {
  id: string
  name: string
  kind: FrpServerKind
  /** 形如 http://host:port 或 https://host:port，frpc 填 admin 端口，frps 填 dashboard 端口 */
  url: string
  /** Basic Auth 用户名；与密码均为空时 frp 不校验 */
  username: string
}

export const SERVERS_KEY = "frp_manager_servers"

function passwordKey(id: string): string {
  return `frp_manager_password:${id}`
}

export function newServerId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function getPassword(id: string): string {
  return Keychain.get(passwordKey(id)) ?? ""
}

/** 保存密码；空字符串表示清除已存密码 */
export function setPassword(id: string, password: string) {
  if (password === "") Keychain.remove(passwordKey(id))
  else Keychain.set(passwordKey(id), password)
}

function isServer(v: unknown): v is FrpServer {
  if (!v || typeof v !== "object") return false
  const o = v as FrpServer
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    (o.kind === "frpc" || o.kind === "frps") &&
    typeof o.url === "string"
  )
}

export function loadServers(): FrpServer[] {
  const raw = Storage.get(SERVERS_KEY)
  if (Array.isArray(raw) && raw.every(isServer)) return raw
  return []
}

export function persistServers(servers: FrpServer[]) {
  Storage.set(SERVERS_KEY, servers)
}

export function serverIsReady(s: FrpServer | undefined): boolean {
  return !!s && s.url.trim().length > 0
}

export function defaultServer(kind: FrpServerKind): FrpServer {
  return {
    id: newServerId(),
    name: kind === "frpc" ? "本机 frpc" : "远端 frps",
    kind,
    url: kind === "frpc" ? "http://127.0.0.1:6080" : "http://frps.example.com:7500",
    username: "admin",
  }
}

/** 组 frpApi 需要的连接信息（含 Keychain 里的密码） */
export function connOf(s: FrpServer): FrpConn {
  return {
    baseUrl: s.url.trim(),
    username: s.username.trim(),
    password: getPassword(s.id),
  }
}
