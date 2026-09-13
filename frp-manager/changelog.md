# 更新说明

## 1.0.0

首个版本。

- 多服务器条目管理（frpc / frps），密码按条目存 Keychain，主页 /healthz 在线探测 + 下拉刷新
- frpc：代理状态列表、查看 / 编辑配置（PUT + reload 两步）、停止 frpc、Store 动态代理管理
- frps：服务端信息卡片、按类型代理统计与详情（含累计流量旧路径 fallback）、客户端列表、清理离线代理
