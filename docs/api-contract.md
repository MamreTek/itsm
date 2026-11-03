# ITSM REST v1 契约草案

状态：**原型契约，真实服务未实现**。权威字段类型见 `src/shared/api/contracts.ts`；Mock 在 `src/mocks/transport.ts`。前端统一通过 `src/shared/api/client.ts`。无真实身份认证，所有人员/服务/工单均虚构。

用户后续追加的流程定义、校验与模拟实例契约见 [流程设计与编排 API](workflow-api.md)，沿用本页通用响应与错误语义。

## 通用结构

基础路径 `/api/v1`；请求/响应 `application/json`。成功使用 200，创建工单使用 201。响应头 `X-Request-ID` 与 JSON 中 `requestId` 一致，Mock 前缀 `mock-`。ID 为不透明字符串，不能从编号推断；`number` 为可读工单号，仅用于展示与搜索。所有时间为 ISO 8601 UTC。

```json
{
  "data": { "id": "opaque-id", "number": "SR-1006" },
  "requestId": "mock-example"
}
```

上述 data 是工单响应摘录，完整字段见 Ticket 类型。统一错误：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请检查填写内容",
    "fields": { "title": "请输入 4–120 个字符" }
  },
  "requestId": "mock-example"
}
```

| HTTP | code                                 | 含义与客户端恢复                                      |
| ---- | ------------------------------------ | ----------------------------------------------------- |
| 400  | INVALID_JSON / INVALID_QUERY         | JSON 不是对象或查询格式无效；修正输入                 |
| 404  | NOT_FOUND                            | 资源或路由不存在；返回队列或核对路径                  |
| 409  | VERSION_CONFLICT                     | 版本缺失或过期；刷新详情/策略再提交，不自动重放写操作 |
| 409  | INVALID_STATE                        | 状态不允许操作；刷新并依据最新状态操作                |
| 422  | VALIDATION_ERROR / ASSIGNEE_REQUIRED | 字段或引用无效；修正字段/先分派处理人                 |
| 503  | MOCK_UNAVAILABLE                     | 演示故障，仅消费一次；原输入保留，可重试              |

当前模拟请求级写失败不改变数据；批量分派的 200 响应可以包含逐条成功与失败，详见下节。客户端不自动重试写操作，提交中锁定按钮；真正网络中断的未知写入结果、幂等键及安全控制需在真实后端接入前完善。

## 端点

| 方法与路径                     | 请求                                            | data 类型        |
| ------------------------------ | ----------------------------------------------- | ---------------- |
| GET /tickets                   | view、q、status、priority、type、assigneeId、requesterId、sort、page、pageSize | TicketList       |
| POST /tickets                  | CreateTicket                                    | Ticket（201）    |
| GET /tickets/{id}              | 无                                              | Ticket           |
| PUT /tickets/{id}/assignment   | assigneeId、version                             | 更新后 Ticket    |
| POST /tickets/bulk-assignment  | assigneeId、items[{id,version}]                  | BulkAssignmentResult |
| POST /tickets/{id}/transitions | action、note、version                           | 更新后 Ticket    |
| POST /tickets/{id}/comments    | message、version                                | 更新后 Ticket    |
| GET /catalog                   | 无                                              | Service[]        |
| GET /directory                 | 无                                              | Person[]         |
| GET /sla-policies              | 无                                              | SlaPolicy[]      |
| PUT /sla-policies/{priority}   | responseMinutes、resolutionMinutes、version     | 更新后 SlaPolicy |

不支持的方法/路径返回 404。额外请求字段忽略。Mock 重置/失败开关是本地演示控制，不属于后端 API。

## 字段与约束

- `CreateTicket`：title 去首尾空白后 4–120 字；description 去首尾空白后 10–2000 字；type 为 incident / service_request；priority 为 P1 / P2 / P3 / P4；requesterId 必须存在于目录；serviceId 可省略或 null，有值时必须存在且 type = service_request。文本不接受 HTML 执行，UI 按纯文本渲染。
- `Person`：id、name、team。目录中的任一虚构人员都可成为演示请求人或处理人，不代表授权。
- `Service`：id、name、category、description、template、priority。仅预填申请，不能据此创建真实资源。
- `Ticket`：id、number、title、description、type、priority、status、requesterId、assigneeId（未分派为 null）、serviceId（可 null）、createdAt、updatedAt、firstRespondedAt、resolvedAt、closedAt（未发生为 null）、sla、version、activities。
- `Activity`：id、kind（created / assigned / status / comment）、actor（固定模拟角色）、message、at。记录按发生顺序排列，不具备生产持久性/不可篡改保证。
- `SlaPolicy`：priority、responseMinutes（正整数）、resolutionMinutes（不小于响应且 ≤43200）、version（正整数）。初始 P1=15/240、P2=60/480、P3=240/1440、P4=480/2880，单位分钟。工单 sla 保存这些字段以及 responseDueAt、resolutionDueAt。
- 修改工单/策略须提交当前 version；成功后 +1。comment 的 message、transition 的 note 去首尾空白后 1–2000 字。assignment 的 assigneeId 必须为目录已有人员；只允许修改待处理、处理中工单。评论允许待处理、处理中、已解决工单；关闭后只读。

## 查询、分页与统计

GET `/tickets?q=SR-1006&type=service_request&priority=P3&status=open&sort=createdAt:desc&page=1&pageSize=10`

- q 对编号与标题做不区分大小写的子串匹配，去首尾空白，≤120 字；默认空；其余筛选按精确枚举值匹配，多条件为 AND。
- sort 为 createdAt:desc（默认）/ createdAt:asc；时间相同时按 number 升序保持稳定。
- page 为 1–100000 的整数，默认 1；pageSize 为 1–100 的整数，默认 10；越界页返回 items=[] 和原始 total。错误参数返回 400。
- view 为 all（默认）/ active（open、in_progress）/ unassigned（活跃且无处理人）/ sla_breached（活跃且尚未履约目标超时）/ resolved（resolved、closed）；与其他筛选按 AND 组合。assigneeId、requesterId 必须存在于目录，否则 400；省略代表不限制。未知 view 返回 400。
- TicketList：items 为该页 Ticket[]，total 为筛选后的总数，page、pageSize 为归一化查询值，evaluatedAt 是本次列表评估的 ISO UTC 时间，summary 来自**未筛选的全部记录**。列表、视图、统计在同一个 evaluatedAt 计算，UI 使用该值展示 SLA 状态，刷新列表后重新评估。
- summary.active：open/in_progress；unassigned：活跃且无处理人；breached：活跃中尚未响应且响应目标已过，或尚未解决且解决目标已过；resolved：resolved/closed。不是历史 SLA 达标率。超时判定为 evaluatedAt 严格晚于 deadline；等于截止时间不算超时。已完成的响应可显示历史超时，但不单独导致活跃超时计数。
- UI 切换视图保留搜索、类型、优先级，清空状态与人员条件并回到第 1 页；统计点击同样切换视图。全量统计数不随这些筛选改变。筛选、视图、分页或刷新清空本页勾选；已解决/关闭工单不可勾选分派。

## 批量分派

```json
{
  "assigneeId": "person-demo-2",
  "items": [{ "id": "opaque-id", "version": 1 }]
}
```

- 一次 1–50 个不重复的 id（长度 1–200），每项 version 必须是正整数，目标处理人必须来自目录。请求整体先校验，任何结构/人员/重复/数量错误返回 422，整个请求不写入；模拟 503 也在写入前发生。
- 校验通过后，按 items 顺序逐条比较当前版本、检查 open/in_progress，再写入处理人（可替换已有处理人）、updatedAt、version+1，并追加 assigned 活动。不会发送真实通知。
- 200 `data = { succeeded: Ticket[], failed: {id,status,code,message,currentVersion?}[] }`。每个输入 id 恰好进入一组，组内保留输入相对顺序。失败项包括 NOT_FOUND/404、VERSION_CONFLICT/409、INVALID_STATE/409；已存在记录返回 currentVersion，缺失记录不返回。失败项不被本次请求修改；成功项保留，不回滚。
- UI 提交前列出目标、数量和替换影响，提交中禁止关闭与重复触发；请求级失败保留选择和目标人员供手动重试。收到逐条结果后刷新队列、清空勾选并展示成功/失败原因。失败项须检查最新状态后重新选择，不自动重放过期版本。
- 未来后端需保证每项版本比较与写入的原子性，并处理请求中断后的幂等/结果查询；当前 Mock 是同步内存实现，不能替代数据库并发事务。

## 工单状态机与时间

| action  | 原状态 → 新状态        | 要求                 |
| ------- | ---------------------- | -------------------- |
| start   | open → in_progress     | 已分派、note 非空    |
| resolve | in_progress → resolved | 已分派、结论非空     |
| close   | resolved → closed      | 说明非空             |
| reopen  | resolved → in_progress | 说明非空，沿用原期限 |

成功时更新 updatedAt、version 并追加活动；开始处理首次设置 firstRespondedAt，解决设置 resolvedAt，关闭设置 closedAt。重新打开清空 resolvedAt，保留首次响应与创建时 SLA 快照。已关闭为终态。SLA 修改不会重算已有工单；所有计时为连续自然时间，没有暂停、工作日历或自动升级。

## 请求示例

```json
{
  "title": "开发环境申请",
  "description": "申请一个用于演示流程的联调环境，所有数据均为虚构。",
  "type": "service_request",
  "priority": "P3",
  "requesterId": "person-demo-1",
  "serviceId": "svc-workspace"
}
```

```json
{ "assigneeId": "person-demo-2", "version": 1 }
```

```json
{ "action": "start", "note": "开始检查演示申请", "version": 2 }
```

```json
{ "responseMinutes": 30, "resolutionMinutes": 240, "version": 1 }
```

`src/test/contract.test.ts` 通过同一客户端验证状态、分页、错误、SLA 快照与 JSON envelope。真实后端需运行等价契约场景，并加入认证/授权、租户隔离、审计、持久化、并发事务与幂等验证后再接入受控环境。
