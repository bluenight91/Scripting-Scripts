# Scripting 脚本

我在 iOS [Scripting App](https://scriptingapp.github.io/zh/index) 上编写的脚本合集。需已安装 Scripting 后使用。

## Surge Panel 3.1

Surge HTTP API + Prometheus 监控面板。四个标签：仪表盘、分流、活动、设置，全新卡片式设计。支持多个实例（本机 / 网关）热切换，可挂到 Scripting 首页 Tab。3.1 起支持外部资源管理与 IP 归属查询（Surge iOS 5.23 / Mac 6.10，含 TestFlight 5.102）。

- 目录：[Surge Panel](./Surge%20Panel/)
- [一键导入](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fgithub.com%2Fbluenight91%2FScripting-Scripts%2Ftree%2Fmain%2FSurge%2520Panel%22%5D)
- [下载](./Surge%20Panel.scripting)
- 更新说明：[changelog.md](./Surge%20Panel/changelog.md)

使用前按官方格式在 Surge 开启 HTTP API，例如 `http-api = YOUR_KEY@127.0.0.1:6166`。导入后先添加实例并填写 Key，不会在未配置时自动连接。局域网连接需让 Surge 监听 `0.0.0.0`，但面板主机应填写设备实际 IP；不要将管理端口暴露到互联网。HTTPS（`http-api-tls = true`）需先安装并信任 Surge MITM CA。API Key 按实例保存在 iOS Keychain。

Surge Panel 使用 HTTP API，不是 External Controller；不支持官方远程管理指南中的 Ponte 或 USB。完整配置、安全说明与故障排查见 [Surge Panel README](./Surge%20Panel/README.md)。`/metrics` 仅 iOS 5.22+ / Mac 6.9+；其它版本仍可使用主要功能，但没有内存图表。

## frp 管理器 2.0

frp（内网穿透）Admin API 管理器，同时管理多个 frpc 客户端与 frps 服务端：代理状态、配置热重载、Store 动态代理、服务端流量概览与客户端列表。与 Surge Panel 共用同一套视觉语言。

- 目录：[frp-manager](./frp-manager/)
- [下载](./frp-manager.scripting)
- 更新说明：[changelog.md](./frp-manager/changelog.md)

frpc 需在配置中开启 `webServer.addr` / `webServer.port`（admin 端口），frps 开启 dashboard 端口；用户名密码对应 `webServer.user` / `webServer.password`，按条目保存在 iOS Keychain。详见 [frp 管理器 README](./frp-manager/README.md)。

## Cloudflare 观测 1.0

Cloudflare Workers / Pages 观测面板：账户级请求额度（Workers Free 每日 10 万次 / Workers Paid 每计费周期 1000 万次请求 + 3000 万 CPU 毫秒，含超额估算）、单项目请求 / 错误 / CPU P50·P99 / 趋势图 / 状态分布，以及 Workers Logs 事件、错误与 Top 分组查询。桌面小组件显示所选 Worker / Pages 项目的额度与运行情况（支持主屏幕与锁屏尺寸）。

- 目录：[cf-observability](./cf-observability/)
- [一键导入](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fgithub.com%2Fbluenight91%2FScripting-Scripts%2Ftree%2Fmain%2Fcf-observability%22%5D)
- [下载](./cf-observability.scripting)
- 更新说明：[changelog.md](./cf-observability/changelog.md)

使用 Cloudflare 用户 API 令牌认证（保存在 iOS Keychain），令牌需包含以下**账户**权限：

- 必需：`Account Analytics: Read`（帐户分析：读取）、`Workers Scripts: Read`（Workers 脚本：读取）、`Cloudflare Pages: Read`（Cloudflare Pages：读取）
- 可选：`Workers Observability: Write`（Workers 可观测性：编辑，查询日志所需，Cloudflare 的查询接口只接受编辑权限）、`Account Settings: Read`（帐户设置：读取，用于自动识别 Account ID）

详见 [Cloudflare 观测 README](./cf-observability/README.md)。

# 感谢

- [yasd](https://github.com/geekdada/yasd) 总览速率采样与流量分层对齐其 Web Dashboard
- [Surge HTTP API](https://manual.nssurge.com/tools/http-api.html)
- [Scripting](https://scriptingapp.github.io/zh/index)
