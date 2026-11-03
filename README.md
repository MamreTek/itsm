# MamreTek ITSM

轻量服务台产品雏形。独立可用，从服务申请到处理结果形成一条清晰的工单闭环。

> **产品原型 / 模拟数据**：没有真实后端、身份认证或权限保护。全部业务数据为人工构造，浏览器刷新即重置。不要输入敏感信息、连接生产数据或部署到生产环境。模拟活动记录不构成安全审计。

## 本地体验

**双击 HTML 预览**：打开构建好的 `offline/index.html`，不需要启动服务或联网。JavaScript、React、Ant Design 和样式已包含在同一个文件里，可以单独复制到其他目录。此文件只包含虚构的 Mock 数据；刷新后恢复初始状态。

首次从源码生成离线文件：

```sh
npm ci
npm run build:offline
```

**开发模式**：项目根目录的 `index.html` 是 Vite 开发入口；`dist/index.html` 是普通静态服务入口。这两个入口不作为离线单文件使用。修改代码后重新执行 `npm run build:offline` 即可更新离线预览，生成目录不提交到 Git。

使用 `.nvmrc` 的 Node.js 22.22.1 和 npm 9.2.0：

```sh
npm ci
npm run dev
```

打开终端给出的 `http://127.0.0.1:5173`。默认仅监听本机；不需要数据库、容器或凭据。

## 展示用预览服务

从项目目录执行：

```sh
npm run build:offline
npm run preview:local
```

默认访问 `http://127.0.0.1:5193/`。需要同一局域网设备查看时，先确认本机网卡的私有 IPv4，再执行 `npm run preview:local -- --lan-host <本机局域网IPv4>`；终端会列出本机与局域网地址。服务只绑定回环和明确指定的本机私有地址，不接受通配或公网绑定，不修改防火墙。端口占用时直接报错，不替换已有服务。

此服务只提供内存中已构建的单个 HTML，不提供仓库文件或真实 API。保持运行的终端打开，按 Ctrl+C 停止；也可对终端输出的 PID 执行 `kill <PID>`。更新代码后停止服务，重新构建并启动。每个浏览器页面的模拟数据互相独立，刷新即重置，不在设备间同步。

1. 打开「服务目录」，选择一项服务，填写请求人和需求并提交。
2. 在详情中分派处理人，开始处理并追加记录。
3. 解决工单时填写结论；已解决工单可关闭或重新打开。
4. 在「SLA 策略」修改目标，再创建工单；旧单保留原 SLA 快照。
5. 页尾演示工具可使下一请求失败，验证错误与重试；重置数据需要确认。

「工单队列」支持全部、活跃、待分派、SLA 超时、已解决与关闭视图；点击概览也可切换。可按编号/标题搜索、状态/优先级/类型/处理人/请求人筛选，并按创建时间排序和分页。选择本页活跃工单后可批量分派，提交前列出目标与替换影响，逐条显示结果；筛选、分页、刷新清空选择。版本冲突不会覆盖其他更改。

概览统计始终来自全部模拟工单。时间展示为 UTC，SLA 按连续自然时间计算，没有工作日历或暂停规则。队列 SLA 显示此次评估时间，刷新队列重新评估；已完成目标的历史超时不计入活跃超时视图。

## 工程与契约

- React + TypeScript strict + Ant Design；Vite 构建，React Router 路由。
- `src/app`：布局、路由与主题。
- `src/features`：工单、目录和 SLA 页面。
- `src/shared/api/contracts.ts`：后端可适配的类型；`client.ts`：统一客户端。
- `src/mocks`：独立 Fetch-compatible Mock transport、虚构数据、HTTP 语义校验。
- [API 契约](docs/api-contract.md)：方法、路径、类型、校验、分页、状态转换和错误。
- [UI 参考与调整](docs/ui-reference.md)：Ant Design Pro 风格依据、对比与访问限制。
- [架构与后端交接](docs/architecture.md)、[验证记录](docs/verification.md)、[工程规范 1.2 快照](docs/development-conventions.md)。

当前仅注入 Mock transport，不会发出 API 网络请求，也没有隐含的真实服务地址开关。后端确定后在适配层替换 transport，并补充真实认证、权限和安全验收；页面继续使用统一客户端和 v1 契约。服务申请不会真正创建云资源、签发证书或授予权限。

```sh
npm run lint
npm run typecheck
npm test
npm run build
# 或执行上述全部检查
npm run check
# 可选完整浏览器流程（首次需安装 Chromium）
npx playwright install chromium
npm run test:e2e
# file:// 离线回归：复制单文件、断网、完成服务申请与工单闭环
npm run test:offline
```

本期对应 [REQ-001 / Issue #1](https://github.com/MamreTek/itsm/issues/1)。没有真实通知、附件、审批、流程设计器、数据库或新增权限系统；不宣称生产就绪。
