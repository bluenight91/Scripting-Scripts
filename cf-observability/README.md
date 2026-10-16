# Cloudflare 观测 for Scripting

一个运行在 iOS [Scripting](https://scriptingapp.github.io/zh/index) App 上的 Cloudflare Workers / Pages 观测脚本。用 Cloudflare **用户 API 令牌**读取 GraphQL Analytics 与 Workers Observability，在手机上查看账户限额、项目运行指标与日志；桌面 / 锁屏小组件显示选定项目的限额使用。与 Surge Panel、frp 管理器共用同一套视觉语言。

## 功能

- **账户限额**（概览主卡片）
  - Workers Free：账户内所有 Worker 与 Pages Functions 每天共享 **100,000** 次请求，00:00 UTC 重置；显示今日用量、百分比与重置倒计时
  - Workers Paid：每个账单周期含 **1,000 万** 次请求与 **3,000 万** CPU 毫秒；显示周期用量、CPU 用量与超额费用估算（请求 $0.30 / 百万、CPU $0.02 / 百万毫秒，不含 $5 月费）
  - Workers / Pages 分项请求数；Worker 与 Pages 项目列表显示本周期请求与错误
- **项目详情**：1 小时 / 24 小时 / 7 天 / 本周期切换；请求、错误率、子请求、CPU P50 / P99（对比单次调用上限，Free 为 10 ms）、Wall time P99、CPU 合计；请求柱状图；调用状态分布（成功 / 客户端断开 / 超出 CPU 限制 / 脚本异常…）
- **日志与事件**（Workers Observability，仅 Worker）：最近事件、只看错误、全文搜索；按路径 / 状态码 / 结果 / 国家 / 数据中心分组的 Top 列表；点按查看事件详情与原始 JSON（可复制）
- **小组件**
  - 小：项目名、账户请求用量、进度条、本项目占比、重置倒计时
  - 中：左侧账户限额，右侧项目占比 / 请求 / 24h 错误 / CPU P99（Free）或 CPU 周期用量（Paid）/ 超 CPU 次数
  - 大：在中尺寸基础上加近 24 小时请求柱状图与调用状态占比
  - 锁屏圆形 / 矩形 / 行内：请求用量百分比
  - 每 15 分钟刷新；网络失败时显示最近一次缓存并标注时间

## 令牌权限（用户 API 令牌）

在 Cloudflare 控制台 **我的个人资料 → API 令牌 → 创建令牌 → 创建自定义令牌**（[dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)）：

| 权限 | 是否必需 | 用途 |
| --- | --- | --- |
| Account · Account Analytics · Read | 必需 | GraphQL Analytics：限额用量、请求、CPU、错误、状态分布 |
| Account · Workers Scripts · Read | 必需 | 列出 Worker 项目 |
| Account · Cloudflare Pages · Read | 必需 | 列出 Pages 项目并取得 `production_script_name` |
| Account · Workers Observability · Write | 可选 | 日志与事件查询。官方查询接口 `POST /accounts/{id}/workers/observability/telemetry/query` 只接受 Write 权限；脚本只发送查询，不做任何修改 |
| Account · Account Settings · Read | 可选 | 自动识别 Account ID（`GET /accounts`），否则手动粘贴 |

- **账户资源**：包括 → 包含该项目的账户。不需要任何区域（Zone）权限。
- 令牌有效性用 `GET /user/tokens/verify` 校验（无需额外权限）；也兼容账户 API 令牌（`/accounts/{id}/tokens/verify`）。
- 设置页的「检查令牌权限」会逐项调用各接口，标出缺失的权限。

## 使用

1. **导入脚本**：下载仓库根目录的 [`cf-observability.scripting`](../cf-observability.scripting) 用 Scripting 打开；或在 Scripting 中用「GitHub 文件夹链接导入」粘贴本目录的 GitHub 树链接。
2. **配置**：打开脚本，首次会弹出设置：粘贴 API 令牌，点「自动识别账户」或手动填写 Account ID（控制台 Workers & Pages 概览页右侧），选择套餐（Paid 另选账单周期起始日，按订阅续费日填写），保存。
3. **选择小组件项目**：在列表中左滑 / 长按项目，或在项目详情中点「设为小组件项目」（例如 `cf-workers-tgproxy`）。
4. **添加小组件**：桌面添加 Scripting 小组件 → 编辑小组件 → 选择本脚本。Parameter 留空显示选定项目；填项目名（可加 `worker:` / `pages:` 前缀）可覆盖，方便同时放多个小组件。

### 开启 Workers Logs

日志页依赖 [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)。在 Wrangler 配置中开启后重新部署（或在控制台 Worker → 设置 → 可观测性中启用）：

```toml
[observability]
enabled = true

  [observability.logs]
  invocation_logs = true
  head_sampling_rate = 1
```

Workers Logs 保留 7 天；Pages Functions 不写入 Workers Logs，日志页仅支持 Worker。

## 关于 cf-workers-tgproxy 这类 WebSocket 代理

- 每条 WebSocket 连接只在建立（Upgrade）时计 1 次请求，之后的消息不计请求，所以请求数通常远低于流量。
- 长连接的 Wall time 很长是正常的；需要关注的是 **CPU P99** 与「超出 CPU 限制」次数：Free 单次调用 CPU 上限 10 ms，超出时返回 Error 1102。
- 「客户端断开」（clientDisconnected）是 WebSocket 关闭的常见状态，不算错误。

## 技术要点

- 数据：GraphQL Analytics `workersInvocationsAdaptive`（Worker）与 `pagesFunctionsInvocationsAdaptiveGroups`（Pages Functions，按 `production_script_name` 过滤）；日志：Workers Observability telemetry query（`events` / `calculations` 视图）。
- 兼容：若数据集不支持扩展字段（`cpuTimeUs` / `quantiles` / `status`），自动退回只含请求 / 错误 / 子请求的最小查询；若 GraphQL 报时间跨度过大，按天拆段并在同一请求中用别名合并。
- GraphQL 数据为自适应采样的近似值，可能与控制台略有差异；账单周期按 UTC 计算。
- 存储：设置与项目列表存 `Storage`，令牌存 `Keychain`（脚本沙盒隔离，小组件进程可读）；小组件结果缓存在 `Storage` 供离线回退。
- 纯逻辑（限额、周期、查询构造与解析、格式化）在 `lib/cfCore.ts`，不依赖 `scripting` 运行时，可用 `node --experimental-strip-types` 直接验证。

## License

MIT
