# Scripting Scripts

我在 iOS [Scripting App](https://scriptingapp.github.io/zh/index) 上编写的脚本合集。

## 脚本列表

### [Surge Panel](./Surge%20Panel)

Surge 监控面板：通过 Surge HTTP API + Prometheus Metrics Endpoint 提供五标签仪表盘（总览/策略/流量/网络/设置），支持 Scripting 首页 Tab 直挂。

- 全节点延迟显示（Surge 基准测试缓存，覆盖内嵌/链式节点）
- 实时速率双折线图（1 秒采样，近 1 分钟）、内存历史趋势
- 策略组切换/测速、活动连接管理、请求详情、DNS 缓存/测速、规则浏览器
- 出站模式/全局策略/日志级别/脚本管理/查看当前配置

**安装**：下载打包好的 [`Surge Panel.scripting`](./Surge%20Panel.scripting)，用 Scripting 打开即可导入。
