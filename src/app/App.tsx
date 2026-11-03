import {
  App as AntApp,
  Alert,
  Breadcrumb,
  Button,
  ConfigProvider,
  Drawer,
  Grid,
  Layout,
  Menu,
  Modal,
  Space,
  Tag,
} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {
  AppstoreOutlined,
  AuditOutlined,
  ExperimentOutlined,
  InboxOutlined,
  DeploymentUnitOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  HashRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router';
import { useState } from 'react';
import { mock } from '../shared/api/client';
import { Queue } from '../features/tickets/Queue';
import { Catalog } from '../features/catalog/Catalog';
import { Detail } from '../features/tickets/Detail';
import { Policies } from '../features/sla/Policies';
import { Designer } from '../features/workflows/Designer';
import { WorkflowSessionProvider } from '../features/workflows/WorkflowSession';
import './styles.css';

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [revision, setRevision] = useState(0);
  const { message } = AntApp.useApp();
  const [showReset, setShowReset] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;
  const activeKey = location.pathname.startsWith('/tickets')
    ? '/tickets'
    : location.pathname;
  const pageLabel =
    activeKey === '/catalog'
      ? '服务目录'
      : activeKey === '/sla'
        ? 'SLA 策略'
        : activeKey === '/workflows' ? '流程中心' : '工单队列';
  const items = [
    {
      key: '/tickets',
      icon: <InboxOutlined />,
      label: <Link to="/tickets">工单队列</Link>,
    },
    {
      key: '/catalog',
      icon: <AppstoreOutlined />,
      label: <Link to="/catalog">服务目录</Link>,
    },
    {
      key: '/workflows',
      icon: <DeploymentUnitOutlined />,
      label: <Link to="/workflows">流程中心</Link>,
    },
    {
      key: '/sla',
      icon: <AuditOutlined />,
      label: <Link to="/sla">SLA 策略</Link>,
    },
  ];
  return (
    <Layout className={`shell${collapsed ? ' is-collapsed' : ''}`}>
      <header className="topbar">
        <Link className="brand" to="/tickets">
          <DeploymentUnitOutlined className="brand-icon" aria-hidden />
          <span>MamreTek ITSM</span>
        </Link>
        <Button
          type="text"
          className="navigation-toggle"
          aria-label={isMobile || collapsed ? '展开导航' : '收起导航'}
          icon={
            isMobile || collapsed ? (
              <MenuUnfoldOutlined aria-hidden />
            ) : (
              <MenuFoldOutlined aria-hidden />
            )
          }
          onClick={() =>
            isMobile ? setNavigationOpen(true) : setCollapsed((value) => !value)
          }
        />
        <span className="header-section">IT 服务管理</span>
        <Space className="header-context">
          <Tag color="gold" icon={<ExperimentOutlined />}>
            产品原型
          </Tag>
          <span className="topbar-caption">Mock 工作空间</span>
        </Space>
      </header>
      <div className="workspace">
        {!isMobile && (
          <aside className="sidebar">
            <div className="sidebar-label">服务管理</div>
            <Menu
              mode="inline"
              selectedKeys={[activeKey]}
              inlineCollapsed={collapsed}
              items={items}
            />
          </aside>
        )}
        <main className="main">
          <Breadcrumb
            className="page-breadcrumb"
            items={[
              { title: '服务管理' },
              { title: pageLabel },
              ...(location.pathname.startsWith('/tickets/')
                ? [{ title: '工单详情' }]
                : []),
            ]}
          />
          <Alert
            className="prototype-banner"
            type="warning"
            showIcon
            title="产品原型 / 模拟数据"
            description="没有真实后端或权限保护，请勿输入真实敏感信息。刷新浏览器会重置全部模拟数据；仅供流程评审，不可用于生产。"
          />
          <div key={revision}>
            <WorkflowSessionProvider>
              <Routes>
                <Route path="/tickets" element={<Queue />} />
                <Route path="/tickets/:id" element={<Detail />} />
                <Route path="/catalog" element={<Catalog />} />
                <Route path="/sla" element={<Policies />} />
                <Route path="/workflows" element={<Designer />} />
                <Route path="*" element={<Navigate replace to="/tickets" />} />
              </Routes>
            </WorkflowSessionProvider>
          </div>
          <footer className="demo-tools">
            <span>
              <ExperimentOutlined /> 演示工具
            </span>
            <Space wrap role="group" aria-label="模拟数据操作">
              <Button
                size="small"
                onClick={() => {
                  mock.failNext();
                  message.info('已设置下一请求失败，消费一次后恢复正常');
                }}
              >
                模拟下一请求失败
              </Button>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => setShowReset(true)}
              >
                重置模拟数据
              </Button>
            </Space>
            <span className="muted">
              故障开关只消费一次；不会操作真实服务。
            </span>
          </footer>
        </main>
      </div>
      <Drawer
        title="IT 服务管理"
        placement="left"
        size={240}
        open={isMobile && navigationOpen}
        onClose={() => setNavigationOpen(false)}
      >
        <Menu
          mode="inline"
          selectedKeys={[activeKey]}
          items={items}
          onClick={() => setNavigationOpen(false)}
        />
      </Drawer>
      <Modal
        title="重置所有模拟数据？"
        open={showReset}
        onCancel={() => setShowReset(false)}
        onOk={() => {
          mock.reset();
          setRevision((n) => n + 1);
          setShowReset(false);
          navigate('/tickets');
        }}
        okText="确认重置"
        cancelText="保留当前数据"
      >
        <p>
          本次演示创建的工单、处理记录、SLA 修改、流程草稿和模拟实例将被清空，恢复虚构的初始记录。
        </p>
      </Modal>
    </Layout>
  );
}
export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      button={{ autoInsertSpace: false }}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: 14,
          controlHeight: 32,
          colorBgLayout: '#f5f5f5',
          colorBorderSecondary: '#f0f0f0',
        },
        components: {
          Card: { headerFontSize: 16, headerHeight: 56 },
          Table: { cellPaddingBlockMD: 12, cellPaddingInlineMD: 16 },
        },
      }}
    >
      <AntApp>
        <HashRouter>
          <Shell />
        </HashRouter>
      </AntApp>
    </ConfigProvider>
  );
}
