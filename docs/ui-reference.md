# ITSM UI 参考与调整

用户指定参考：[Ant Design Pro 预览](https://preview.pro.ant.design/)，2026-11-03。

本次同时核对中央工程规范 1.3 第 3.1 节。

## 可核验的依据

参考站登录页可以实际显示；按页面提供的公开演示凭据尝试后未进入后台，因此本次没有完成后台页面的逐页截图比对。继续依据官方公开模板和组件说明完成调整，保留该访问限制。

- [官方默认配置](https://github.com/ant-design/ant-design-pro/blob/master/config/defaultSettings.ts)：浅色导航、mix 布局、Fluid 内容、蓝色主色 #1677ff。
- [官方列表页](https://github.com/ant-design/ant-design-pro/blob/master/src/pages/table-list/index.tsx)：页面容器、带标签的查询字段、列表标题、表格工具栏和状态展示。
- [ProLayout](https://procomponents.ant.design/en-US/components/layout/) 与 [PageContainer](https://procomponents.ant.design/en-US/components/page-container/)：企业后台的导航、面包屑和页面标题结构。

## ITSM 对比与实现

| 部分 | 原版本 | 本次调整 |
| --- | --- | --- |
| 主色与字体 | 自定绿色、营销式英文眉题 | Ant Design 蓝色、系统字体、标准 14px 正文与 20px 页标题 |
| 布局 | 大顶栏、宽松内容、大圆角 | 56px 白色顶栏、浅色侧栏、灰色内容区、6px 基础圆角、16/24px 间距 |
| 导航 | 简单侧栏，手机横排菜单 | 桌面可折叠菜单，手机抽屉菜单，路由对应面包屑 |
| 查询与列表 | 搜索、筛选、操作混在同一区域 | 带字段标签的查询卡片，表格标题和刷新/新建工具栏，较紧凑行高 |
| 概览 | 大数字卡与宣传式说明 | 精简统计卡，保留真实 Mock 计数和全量统计说明 |
| 服务目录 | 深色渐变宣传横幅 | 标准服务卡，直接展示分类、说明和申请入口 |
| 详情、SLA、弹窗 | 自定配色和较大留白 | 共用主题、控件尺寸、状态标签与表单间距 |

实现保留 React、TypeScript、Ant Design、现有 API/Mock 适配层与工单状态机。没有复制参考站品牌、Logo、业务内容或演示数据。没有添加虚假的表格操作、用户权限或生产能力。

后续分诊完善沿用这一模式：标准 Tabs 切换队列，查询区增加人员字段，表格工具栏提供真实可操作的批量分派；勾选提示、目标确认和逐条结果使用 Ant Design Alert、Modal、Table。SLA 列展示待履约状态和截止时间，区分历史超时，采用表格内部横向滚动适应手机，不将工单改成装饰卡片。

## 验证范围

运行 lint、strict typecheck、组件/契约测试、桌面/手机完整流程和离线单文件回归。检查导航折叠/抽屉、工单创建与关闭、搜索及失败重试、SLA 保存与校验、窄屏无整页横向溢出。原本机与私有局域网地址继续提供构建后的 Mock 原型。

浏览器回归使用单个 worker，减少共享本机上并行浏览器与 jsdom 渲染竞争；断言和业务场景不变。组件测试通过粘贴输入模拟实际批量输入，继续验证校验、失败保留与唯一创建结果，不提高超时或跳过断言。
