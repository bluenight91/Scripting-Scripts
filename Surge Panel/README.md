# Surge Panel for Scripting

一个运行在 iOS [Scripting](https://github.com/Scripting) App 上的 Surge 监控面板。通过 Surge HTTP API + Prometheus Metrics 提供五标签仪表盘，支持多个实例切换，可挂到 Scripting 首页 Tab。

## 功能

- **多实例**：本机 / 网关等多个 HTTP API；总览点名称切换；设置里添加、编辑、测试连通、删除。一次只连接一个实例。
- **总览**：实例状态、内存 / 时长 / 实时上下行 / 活动连接 / DNS，MitM·捕获·重写·脚本快捷开关，近 1 分钟速率图（1 秒采样，对齐 [YASD](https://github.com/geekdada/yasd)），内存历史，事件摘要
- **策略**：按配置 `[Proxy Group]` 顺序；搜索；点按切换；列表与组内显示测速延迟；自动组测速与「最优」标记；嵌套组可再进入
- **流量**：实时合计、网卡 / 节点明细（实时·累计·峰值排序）、节点累计排行
- **请求**：活动 | 最近 | 事件 | DNS | 规则。活动/最近可搜索排序；活动连接可终止；DNS 含静态 Host 与动态缓存、刷新与延迟测试
- **设置**：实例管理、刷新间隔、出站模式、功能开关、模块（子页 + 搜索）、日志、脚本（含调试执行）、当前配置（按分段进入，可选敏感字段）、重载 / 停引擎

## 使用

1. **导入脚本**（任选其一）：
   - **一键导入**：[在 Scripting 中打开 Surge Panel](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fgithub.com%2Fbluenight91%2FScripting-Scripts%2Ftree%2Fmain%2FSurge%2520Panel%22%5D)
   - 下载仓库根目录的 [`Surge Panel.scripting`](../Surge%20Panel.scripting)，用 Scripting 打开
   - 或将整个 `Surge Panel` 目录放入 Scripting 的脚本目录
2. 按下方示例在 Surge 中开启 HTTP API
3. 首次打开不会自动连接。到总览或「设置 → 实例」选择本机 / 局域网预设，填写地址和 Key，可先测试再保存
4. 可选：Scripting 设置 → Show Home Tab → 选择本脚本

更新记录见 [`changelog.md`](./changelog.md)。导入后若说明有变化会弹出更新说明。

## Surge 配置

HTTP API 的官方格式是 `key@address:port`，不存在单独的 `http-api-key` 配置项。

同一台 iPhone / iPad 上运行 Surge 与 Scripting：

```ini
[General]
http-api = YOUR_KEY@127.0.0.1:6166
http-api-tls = false
```

从 Scripting 连接同一可信局域网中的 Surge Mac 或网关：

```ini
[General]
http-api = YOUR_KEY@0.0.0.0:6166
http-api-tls = false
```

面板的「主机」应填写 Surge 设备的实际局域网 IP 或域名，不能填写监听地址 `0.0.0.0`。`6166` 是本项目沿用的示例端口，可与 Surge 中实际配置保持一致。

如需 HTTPS，先在 Surge 配置 MITM CA，将该 CA 安装到运行 Scripting 的设备并在系统设置中设为信任，然后设置：

```ini
http-api-tls = true
```

Scripting 的 `allowInsecureRequest` 只负责允许明文 HTTP，并不能跳过 HTTPS 证书验证。连接失败时，实例页会区分 Key、超时、拒绝连接、TLS 与协议不匹配，并给出对应检查项。

`/metrics` 仅 iOS 5.22+ / Mac 6.9+；商店版与 Mac 6.8 仍可用流量、策略和请求，只是没有内存与封禁指标。

## 远程访问与安全

- Surge Panel 是 HTTP API 客户端，不是 External Controller。按 Surge 官方[远程管理指南](https://kb.nssurge.com/surge-knowledge-base/zh/guidelines/remote-management)，HTTP API 不具备 External Controller 的 Ponte、USB 与完整管理能力。
- 不要通过端口转发或 DMZ 把 HTTP API 直接暴露到互联网。局域网 HTTP 是明文传输，只应在可信网络中使用；异地场景请优先使用官方支持的远程管理方案。
- API Key 通过 `X-Key` 请求头发送，并按实例保存在 iOS Keychain；从 2.0.x 升级时会自动从旧 Storage 安全迁移。
- HTTPS 只有在正确安装并信任 CA 后才能验证服务器身份。面板不提供“忽略证书”开关。
- 若使用局域网地址，请确认 iOS「设置 → 隐私与安全性 → 本地网络」中已允许 Scripting。

## 技术要点

- 数据层：`lib/surgeApi.ts` 无状态封装 HTTP API；`lib/instances.ts` 多实例与迁移；`lib/store.ts` 当前实例的 metrics / 1Hz traffic
- 实时速率：`/v1/traffic` 1Hz、内存 60 点；折线 `monotone`、Y 轴从 0
- 首页：顶部分段 + 翻页；Scripting 浮层底栏可见，内容铺到屏幕底
- 不做：External Controller / Ponte / USB、Mac 设备管理、Surge 配置档切换、系统代理 / Enhanced Mode、MITM CA 下载

## License

MIT
