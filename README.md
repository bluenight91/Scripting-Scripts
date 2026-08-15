# Scripting 脚本

我在 iOS [Scripting App](https://scriptingapp.github.io/zh/index) 上编写的脚本合集。需已安装 Scripting 后使用。

## Surge Panel 2.0

Surge HTTP API + Prometheus 监控面板。五个 Tab：总览、策略、流量、请求、设置。支持多个实例（本机 / 网关）热切换，可挂到 Scripting 首页 Tab。

- 目录：[Surge Panel](./Surge%20Panel/)
- [一键导入](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fgithub.com%2Fbluenight91%2FScripting-Scripts%2Ftree%2Fmain%2FSurge%2520Panel%22%5D)
- [下载](./Surge%20Panel.scripting)
- 更新说明：[changelog.md](./Surge%20Panel/changelog.md)

使用前在 Surge 开启 HTTP API（`http-api` + `http-api-key`）与 Prometheus Metrics。导入后到「设置 → 实例」填写 Key；监控其它设备再添加实例。

# 感谢

- [yasd](https://github.com/geekdada/yasd) 总览速率采样与流量分层对齐其 Web Dashboard
- [Surge HTTP API](https://manual.nssurge.com/tools/http-api.html)
- [Scripting](https://scriptingapp.github.io/zh/index)
