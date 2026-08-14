# Scripting Scripts

我在 iOS [Scripting App](https://scriptingapp.github.io/zh/index) 上编写的脚本合集。

## 脚本列表

### [Surge Panel](./Surge%20Panel)

Surge 监控面板：通过 Surge HTTP API + Prometheus Metrics Endpoint 提供五标签仪表盘（总览/策略/流量/请求/设置），支持 Scripting 首页 Tab 直挂。

- 全节点延迟显示（Surge 基准测试缓存，覆盖内嵌/链式节点）
- 实时速率双折线图（1 秒采样，近 1 分钟）、内存历史趋势
- 策略组搜索/切换/测速、请求工作台（活动/最近/事件/DNS/规则）、网卡与节点流量分层
- 出站快捷切换、引擎开关/模块/脚本管理、当前配置与重载

**安装**（任选其一）：

- **一键导入**（需已安装 [Scripting](https://scriptingapp.github.io/zh/index)）：[在 Scripting 中打开 Surge Panel](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fgithub.com%2Fbluenight91%2FScripting-Scripts%2Ftree%2Fmain%2FSurge%2520Panel%22%5D)
- **打包文件**：下载 [`Surge Panel.scripting`](./Surge%20Panel.scripting)，用 Scripting 打开即可导入。
