# REQ-001 验证记录

日期：2026-11-03。状态：实现与本地验证完成，等待 PR 合并。验收只针对 Mock 原型，不代表真实后端、权限、安全或生产验收。

环境：Node.js 22.22.1、npm 9.2.0；Chromium 156.0.8078.4（Playwright 1.64.1）。依赖固定在 package.json 与 package-lock.json，jsdom 29.0.1 与当前 Node 版本兼容。

| 命令 | 结果 |
| --- | --- |
| npm run lint | 通过，0 错误/警告 |
| npm run typecheck | 通过，strict TypeScript |
| npm test | 2 个测试文件，10 项通过，包含普通 HTTP 环境的 Mock 标识符兼容性 |
| npm run build | 通过，生成本地 dist，未部署 |
| npm run test:e2e | Chromium 桌面 1440×1000、手机 390×664，4 项通过 |
| npm audit --omit=dev --json | 运行依赖 0 项告警 |
| 公开内容检查 | 32 个源码/文档/配置文件，未检出常见密钥格式或本机绝对路径 |

行为场景：目录请求创建、查询和分页；负责人分派与完整状态闭环；追加记录；无效/过期状态失败原子性；SLA 修改与历史快照；失败后输入保留和重试；响应结构/状态码/请求标识；桌面与窄屏浏览器操作。

浏览器断言完整流程没有页面运行错误、没有真实 /api/v1 网络请求，队列和详情没有整页横向溢出（表格内部可横向滚动）。桌面/手机队列和已关闭详情截图保留在本地 artifacts，未纳入源码仓库。组件测试等待异步 UI 更新的窗口为 5 秒，兼顾 Ant Design 动画和 jsdom 性能；没有跳过断言或模拟业务操作成功。

## 已知限制

- 构建入口 JS 约 1133 kB，gzip 约 362 kB，Vite 提示单块超过 500 kB。后续可按页面拆分；本次没有调高警告阈值或掩盖提示。
- 完整 npm 审计报告 11 项 moderate，均由 ESLint/TypeScript ESLint 的 minimatch 10.2.6 传递依赖引出，关联 GHSA-g3hv-75wg-m249。运行依赖审计无告警。未使用 npm audit fix --force 引入破坏性旧版本或强行覆盖传递依赖；需随上游兼容修复更新并复验。这些工具仅处理本仓库受控输入，不构成生产可用承诺。
- 浏览器检查使用 Chromium 的桌面与手机宽度模拟，未覆盖真实 iOS Safari、屏幕阅读器或完整无障碍审查。

真实认证、权限、通知、持久化和生产部署均未实现、未验证。

## 直接打开 HTML 与本机展示修复

根因：源码 index.html 原本直接请求 `/src/app/main.tsx`，file:// 打开时解析为 file:///src/app/main.tsx，触发 CORS 并显示空白。现在源码入口给出打开方式指引；`npm run build:offline` 从同一应用生成约 1115 KiB 的单个 HTML，脚本和样式全部内联。

- `npm run test:offline`：2 项通过。源码指引能打开离线文件；单文件复制到含中文与空格的独立空目录，关闭网络后完成创建、分派、处理、解决、关闭及刷新重置。控制台错误 0，网络资源请求 0。
- `npm run check`：lint、strict typecheck、10 项测试、HTTP 构建全部通过；离线构建另行通过。
- `npm run preview:local`：在回环地址与明确指定的本机 Wi-Fi 私有 IPv4 上启动展示服务。实际 Chromium 分别访问这两个地址，均返回 200 并走完工单闭环，控制台错误 0。私有 HTTP 环境中 randomUUID 不可用的情况已通过实际浏览器验证；Mock ID 回退使用 getRandomValues，不改变认证或权限设置。
- 展示服务拒绝仓库路径（/.git/config 与 /src/app/main.tsx 均 404），只允许 GET/HEAD（POST 为 405），favicon 返回 204。没有通配地址、公网部署、隧道或防火墙修改。
- 局域网地址仅从当前电脑访问验证，其他实际设备和网络隔离策略未实测。模拟数据按页面独立，不在浏览器或设备间同步。
- 本次修复按展示要求留在本机，未上传到远端或合并 PR；原有远端 CI 结果不代表这次本地修复。离线回归已加入 CI 配置，待后续推送时运行。
