# 更新说明

## 1.0.2

- 修复主页没有退出按钮：toolbar 从 NavigationStack 移到内容视图（List）上，左上角 × 关闭、右上角 + 添加现在正常显示。

## 1.0.1

- 修复进入服务器详情页报错 `undefined is not an object (evaluating 'Data.fromRawString')`：Basic Auth 的 base64 编码改为纯 JS 实现，不再依赖 Scripting 未导出的 `Data` 类。

## 1.0.0

首个版本。

- 多服务器条目管理（frpc / frps），密码按条目存 Keychain，主页 /healthz 在线探测 + 下拉刷新
- frpc：代理状态列表、查看 / 编辑配置（PUT + reload 两步）、停止 frpc、Store 动态代理管理
- frps：服务端信息卡片、按类型代理统计与详情（含累计流量旧路径 fallback）、客户端列表、清理离线代理
