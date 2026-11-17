# magpie 控制台 for Scripting

一个运行在 iOS [Scripting](https://github.com/ScriptingApp) App 上的 [magpie](https://usemagpie.ai) 网关控制台。直接调用 magpie 的 `/v1/magpie/admin/` 管理 API，在 iPhone / iPad 上管理供应商、模型、路由组与网关密钥。

## 功能

- **多网关书签**：名称、地址（局域网 / Tailscale / 反代）、admin 网关密钥；密钥按条目存系统 Keychain，主页显示当前网关与上次连通时间。
- **概览**：供应商 / 模型 / 路由组 / 密钥计数，异常清单（关闭的供应商与密钥、用尽的额度、不可用的路由组、模型拉取失败）、下一次额度重置、置顶模型、magpie 报告的局域网地址。
- **供应商**：搜索与筛选，详情展示端点（Host / Chat / Responses / Anthropic / Gemini）、掩码密钥与暂停原因、登录账号与方案、模型列表；支持测试连接与删除。
- **模型**：`/v1/models` 目录（含路由组 `auto/`、`group/`），搜索、置顶、一键复制模型 ID，显示上下文窗口、思考、图像标记。
- **路由**：组列表显示 `ref`、成员数与就绪状态、分类器失败原因；详情可改备注、重命名、复制 ref 与成员。成员与策略编辑保留在 magpie 应用里。
- **密钥**：新增、启停、重命名、轮换（新密钥只显示一次）、删除、重置限额用量；限额明细带进度条与重置倒计时，标注可管理本机 / 任意机器 / 只读 / 浏览器扩展。
- **接入与诊断**：按当前网关生成 OpenAI / Anthropic / Gemini / Codex / curl 片段；四项管理入口的真实自检、请求日志、原始响应与可复制报告。

## 使用

1. **导入脚本**：在 Scripting 中用「GitHub 文件夹链接导入」，粘贴本目录（`magpie-console/`）的 GitHub 树链接即可。
2. **开启局域网共享**：magpie 设置 → 网络与共享 → 在局域网共享（或设置 `MAGPIE_ADDR`）；手机与 Mac 在同一网络或都接入 Tailscale。
3. **创建 admin 网关密钥**（在 Mac 上）：

   ```bash
   magpie gateway-key add "iPhone"
   magpie gateway-key admin <id> any
   ```

   只用本机访问时用 `local`；手机通过局域网访问需要 `any`。
4. **填写地址**：打开脚本，地址填 `http://<Mac 的局域网或 Tailscale 地址>:3425`，粘贴刚创建的密钥，先「测试连接」再保存。

手机不能用 `127.0.0.1`。管理 API 拒绝带 `Origin` / `Sec-Fetch-*` 的请求；Scripting 的请求默认不带这些头。若诊断页出现 `403 admin_browser_refused`，请复制报告反馈。

## 技术要点

- 数据层：`lib/api.ts` 统一封装管理 API、模型目录、错误码（401 / 403 / 404 / 409 / 503）与中文修复提示，并记录最近 60 次请求供诊断页查看。
- 存储：网关书签与置顶模型存 `Storage`；admin 密钥按网关 id 存 `Keychain`（脚本沙盒隔离）。
- 写操作范围：网关密钥全量操作、路由组备注 / 重命名、供应商测试 / 删除。供应商保存、成员编辑、模型偏好、限额规则编辑需要整份表单，保留给 magpie 应用，避免覆盖配置。
- 纯逻辑（格式化、限额周期、重置时间）放在 `lib/format.ts`，不依赖 `scripting` 运行时，可用 node 直接验证。
- 视觉与其它脚本共用同一套 `components/Kit.tsx` 设计系统。

## License

MIT