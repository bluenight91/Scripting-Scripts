## 本次更新（1.0.1）

- 修复启动报错 `undefined is not an object (evaluating 'scripting_1.Storage.get')`：`Storage`、`Keychain`、`Pasteboard` 是 Scripting 的全局对象，不再从 `scripting` 模块导入
- 请求改为直接 `fetch(url, init)`，不再依赖 `Request` 构造器
- 缺少全局存储的预览 / 组件构建环境下，书签与密钥读写安全降级

## 本次更新（1.0.0）

首个版本。

- 多网关书签：名称 / 地址 / admin 密钥，密钥存 Keychain，支持切换与移除
- 概览：供应商、模型、路由组、密钥计数，异常清单，下一次额度重置，置顶模型，局域网地址
- 供应商：搜索筛选、端点与掩码密钥、账号方案、模型列表、测试连接、删除
- 模型：`/v1/models` 目录、搜索、置顶、复制 ID，上下文窗口 / 思考 / 图像与路由组标记
- 路由：组列表与详情，备注编辑与重命名，复制 ref / 成员，分类器失败提示
- 密钥：新增、启停、重命名、轮换、删除、重置限额用量，限额进度与重置倒计时
- 接入：OpenAI / Anthropic / Gemini / Codex / curl 片段与检查清单
- 诊断：四项管理入口自检、请求日志、原始响应与可复制报告