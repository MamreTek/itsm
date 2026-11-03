# 流程设计与 Mock 编排 REST v1 契约

状态：原型契约，无真实后台。基础路径 `/api/v1`；成功与错误 envelope、请求标识、UTC 时间和 Mock 故障语义沿用 [通用 API 契约](api-contract.md)。权威类型为 `src/shared/api/workflows.ts`，实现为 `src/mocks/workflows.ts`；所有页面使用既有统一 API 客户端。

## 端点

| 方法与路径 | 请求 | data |
| --- | --- | --- |
| GET /workflows | 无 | Workflow[]，按创建顺序，当前原型不分页 |
| POST /workflows | WorkflowDraft | Workflow，201 |
| GET /workflows/{id} | 无 | Workflow |
| PUT /workflows/{id} | WorkflowDraft + version | Workflow，version+1 |
| POST /workflows/validate | WorkflowDraft | FlowValidation，不写入 |
| POST /workflow-runs | workflowId、workflowVersion、inputs | WorkflowRun，201 |
| GET /workflow-runs/{id} | 无 | WorkflowRun |
| POST /workflow-runs/{id}/actions | version、action、note | WorkflowRun，version+1 |

`id` 为不透明字符串。未知资源或方法为 404。客户端不自动重放写请求。列表与所有记录均为浏览器页内存数据，刷新/重置即恢复初始示例；不是跨浏览器或跨设备共享的后端服务。

请求只保留契约列出的草稿、节点、连线和输入字段；额外字段忽略，不作为脚本、任务或其他可执行配置。

## 流程草稿

`WorkflowDraft = { name, description, graph: { nodes, edges } }`。name 为字符串，最多 80 字；description 最多 1000 字，保存时去首尾空白。保存的 Workflow 另含 id、version、updatedAt、validation。

```json
{
  "name": "简单模拟流程",
  "description": "不调用真实业务",
  "graph": {
    "nodes": [
      { "id": "begin", "kind": "start", "label": "开始", "x": 360, "y": 80 },
      { "id": "finish", "kind": "end", "label": "结束", "x": 360, "y": 360 }
    ],
    "edges": [{ "id": "route", "source": "begin", "target": "finish", "port": "next" }]
  }
}
```

Node：id 非空且 ≤80 字；kind 为 start/condition/approval/task/end；label ≤60 字；坐标为有限数字，x=0–900，y=0–700，单位为画布 CSS 像素。approval/task 的 assigneeId 引用虚构目录。condition 使用 `{field:"priority"|"type",value:string}`，比较语义固定为等于，不支持代码或任意表达式。priority 为 P1–P4，type 为 incident/service_request。

Edge：id、source、target 均为非空 ≤80 字字符串；port 只允许下列枚举。图上限为 30 节点、80 条边，超过上限为 422 GRAPH_LIMIT；非法对象、字段类型、坐标、节点类型或出口枚举为 422 VALIDATION_ERROR，整个请求不写入。

| 节点 | 所需出口 | 附加约束 |
| --- | --- | --- |
| start | next | 必须且只能有一个开始，无入边 |
| condition | yes、no | 合法条件字段与枚举值 |
| approval | approved、rejected | 有效虚构处理人 |
| task | next | 有效虚构处理人 |
| end | 无 | 至少一个结束，无出边 |

name 至少 2 字、节点名称非空、ID 唯一、每个所需出口恰好一条连线、端点存在、无自连/环、所有节点从开始可达且可到达结束，均为语义校验。语义未完成的草稿**允许保存**，响应 `validation.valid=false`；不允许启动模拟。校验响应为 `{valid,issues:[{code,message,nodeId?,edgeId?}]}`。常见 code：NAME_REQUIRED、START_COUNT、END_REQUIRED、LABEL_REQUIRED、ASSIGNEE_REQUIRED、CONDITION_REQUIRED、DUPLICATE_NODE、DUPLICATE_EDGE、PORT_COUNT、INVALID_PORT、DANGLING_EDGE、SELF_EDGE、START_INCOMING、UNREACHABLE、NO_END_PATH、CYCLE。

前端编辑任何属性或位置后，清空旧的校验展示并标记未保存。切换/读取/新建流程会确认放弃未保存改动；浏览器关闭/刷新由 beforeunload 提示。内部模块导航和浏览器返回会保留当前页面内的未保存草稿、选中节点、校验与提交状态，返回流程中心可以继续编辑；这不调用保存 API，也不改变已保存版本。状态只保存在页面内存，不写 localStorage，刷新仍重置。确认重置全部模拟数据会同时清空编辑状态与最近实例。保存失败保留草稿；409 VERSION_CONFLICT 要求读取最新已保存版本，明确确认后再编辑，不静默覆盖。

## 模拟实例

```json
{
  "workflowId": "workflow-demo",
  "workflowVersion": 1,
  "inputs": { "priority": "P1", "type": "service_request" }
}
```

启动时比较已保存流程版本，过期为 409；无效图为 422 INVALID_GRAPH，非法输入为 422 VALIDATION_ERROR。成功冻结完整 Workflow（snapshot）与 inputs，创建 version=1 实例；自动经过开始和条件节点，到审批/处理节点变为 waiting，若直接到结束则 completed。自动步数最多 31 次，作为无环校验之外的防护。

WorkflowRun：id、version、snapshot、inputs、status（waiting/completed）、outcome（pending/approved/rejected/done）、currentNodeId（结束后 null）、visitedEdgeIds、trace、createdAt、updatedAt。trace 按发生顺序记录 id、nodeId、label、kind、at、outcome、message；outcome 为 entered/yes/no/waiting/approved/rejected/done/completed。日期为 ISO UTC；UI 展示 UTC。

当前页面会保留最近一次模拟实例的引用；关闭面板、切换模块或浏览器返回后，可用「查看上次模拟」继续等待中的实例。流程草稿的未保存改动不进入实例快照。刷新或确认重置会清空实例；这不是后端持久化或跨设备会话。

```json
{ "version": 1, "action": "approve", "note": "仅模拟：材料符合要求" }
```

- 审批节点允许 approve 或 reject，分别走 approved/rejected；处理节点只允许 complete，走 next。
- note 为去空白后非空且原始长度 ≤1000 的字符串。空说明为 422；动作与节点不匹配、实例已结束为 409 INVALID_STATE；过期版本为 409 VERSION_CONFLICT。
- 动作在实例副本上完成校验、追加记录与自动推进后才提交；失败不更改原实例。成功后运行版本 +1，只修改实例，不修改流程定义或业务工单。
- 到结束时 outcome：任意审批拒绝过则 rejected；有通过且无拒绝则 approved；没有审批结果则 done。该字段是模拟路径结果，不代表真实业务审批通过。
- 流程后续版本、重命名、节点或负责人修改不改变现有实例快照。运行版本校验与流程版本独立。
- 请求级 503 在任何写入前发生，保留 UI 输入供手动重试。真正网络中断的未知写入结果、幂等键、持久化事务和身份授权仍需真实后端设计。

本期不实现并行网关、会签、动态表单、脚本、通知或真实任务执行；没有工作流产品生产就绪或 BPMN 兼容性承诺。
