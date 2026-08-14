# Surge Panel for Scripting

一个运行在 iOS [Scripting](https://github.com/Scripting) App 上的 Surge 监控面板脚本，通过 Surge HTTP API + Prometheus Metrics Endpoint 提供五标签仪表盘，支持 Scripting 首页 Tab 直挂。

## 功能

- **总览**：内存 / 运行时长 / 实时上下行速率 / 活动连接 / DNS 缓存卡片，近 1 分钟实时速率双折线图（1 秒采样，数据来自 `/v1/traffic` 的 `inCurrentSpeed`/`outCurrentSpeed`，对齐 [yasd](https://github.com/geekdada/yasd)），内存历史面积图，引擎健康摘要
- **策略**：策略组列表与详情；点按切换节点；全节点延迟显示（基于 Surge 基准测试缓存 `/v1/policies/benchmark_results`，覆盖内嵌/链式节点）；自动组（url-test 等）支持组测速与「最优」当选标记
- **流量**：活动中的节点实时速度排行、策略/接口流量明细
- **网络**：活动连接（可终止）、最近请求详情（规则命中/耗时分解）、事件中心、DNS 缓存详情与 DNS 延迟测试、规则浏览器（搜索/筛选）
- **设置**：连接配置、出站模式与全局策略、日志级别、脚本管理（cron 立即执行）、查看当前配置、重载配置等

## 使用

1. **导入脚本**（任选其一）：
   - **一键导入**：[在 Scripting 中打开 Surge Panel](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fgithub.com%2Fbluenight91%2FScripting-Scripts%2Ftree%2Fmain%2FSurge%2520Panel%22%5D)
   - 下载仓库根目录的 [`Surge Panel.scripting`](../Surge%20Panel.scripting)，用 Scripting 打开
   - 或将整个 `Surge Panel` 目录放入 Scripting 的脚本目录
2. 在 Surge 中开启 HTTP API（`http-api = 0.0.0.0:6166` + `http-api-key`）与 Prometheus Metrics Endpoint
3. 首次运行在「设置」页填写 API 地址与 Key
4. 可选：Scripting 设置 → Show Home Tab → 选择本脚本，首页直接使用

## 技术要点

- 数据层：`lib/surgeApi.ts` 封装全部 Surge HTTP 端点；`lib/store.ts` 订阅式全局 store。实时速率独立 1Hz 轮询 `/v1/traffic`（内存中保留 60 点）；内存/引擎指标按设置间隔拉取 Prometheus，历史存 Storage
- 图表：SwiftUI Charts；折线用 `interpolationMethod: "monotone"` 避免 Catmull-Rom 过冲到负值；Y 轴 `chartYScale` 从 0 起；多序列用单 `LineChart` + `foregroundStyleBy`
- 首页适配：`home_screen_default_ui.tsx` 入口，首页模式用顶部分段选择器替代原生 TabView

## License

MIT
