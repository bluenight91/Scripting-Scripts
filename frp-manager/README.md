# frp 管理器 for Scripting

一个运行在 iOS [Scripting](https://github.com/ScriptingApp) App 上的 frp（内网穿透）管理器。通过 frp Admin API（HTTP Basic Auth）同时管理多个 frpc（客户端）与 frps（服务端）实例。

## 功能

- **多服务器条目**：添加 / 编辑 / 删除多个条目，每条包含名称、类型（frpc/frps）、地址、用户名；密码按条目存系统 Keychain。主页显示所有条目并用 `/healthz` 探测在线状态，下拉刷新。
- **frpc 详情**：
  - 代理状态列表（`/api/status`）：按类型分组，显示 name / type / 状态徽标 / local→remote 地址 / 错误信息
  - 查看完整配置（`/api/config`，等宽文本），编辑后保存 = `PUT /api/config` + `GET /api/reload` 两步串联；写入成功但 reload 失败时会明确提示"配置已写入但 reload 失败"
  - 停止 frpc（`/api/stop`，二次确认）
  - Store 动态代理管理（`/api/store/proxies`）：列出 / 按类型表单创建（tcp/udp/http/https/stcp/xtcp）/ 删除；store 未启用时显示配置提示而不是报错
- **frps 详情**：
  - 服务端信息卡片（`/api/serverinfo`）：版本、bindPort、当前连接、总流量、客户端数、各类型代理数
  - 按类型查看代理统计（`/api/proxy/{type}`），每行显示状态 / 今日流量 / 连接数；点按进入详情查看 conf、起停时间与累计流量（`/api/traffic/{name}`，自动 fallback 旧路径 `/api/proxy/traffic/{name}`）
  - 客户端列表（`/api/clients`，在线 / 离线 / 全部过滤）
  - 清理离线代理统计记录（`DELETE /api/proxies?status=offline`，二次确认）

## 使用

1. **导入脚本**：在 Scripting 中用「GitHub 文件夹链接导入」，粘贴本目录（`frp-manager/`）的 GitHub 树链接即可；或把整个 `frp-manager` 目录放入 Scripting 的脚本目录。
2. **开启 frp Admin API**：
   - frpc：配置文件中加入 `webServer.addr` / `webServer.port`（如 `127.0.0.1:6080`），可选 `webServer.user` / `webServer.password`；动态代理还需要 `store.path`。
   - frps：加入 `webServer.addr` / `webServer.port`（dashboard 端口，如 `7500`），可选 `webServer.user` / `webServer.password`。
3. **添加条目**：打开脚本，点右上角 +，类型选 frpc 或 frps，地址填 `http://主机:端口`（如 `http://frps.example.com:7500`），用户名密码对应 `webServer.user` / `webServer.password`（两者都留空表示 frp 不校验）。

## 截图

> 占位：此处后续补充服务器列表、frpc 代理状态、frps 服务端信息等截图。

## 技术要点

- 数据层：`lib/frpApi.ts` 统一封装 Basic Auth、超时与错误解析（失败优先读 frp 的 `{"Code","Msg"}` 包体）；http/https 地址自动跳过证书校验。
- 存储：条目元数据存 `Storage`，密码按条目 id 存 `Keychain`（脚本沙盒隔离）。
- 纯逻辑（请求构造、错误解析、流量格式化）放在 `lib/frpCore.ts`，不依赖 `scripting` 运行时，可用 node 直接验证。

## License

MIT
