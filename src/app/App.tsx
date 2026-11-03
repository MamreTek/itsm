import {
  App as AntApp,
  Alert,
  Button,
  ConfigProvider,
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
import './styles.css';

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [revision, setRevision] = useState(0);
  const { message } = AntApp.useApp();
  const [showReset, setShowReset] = useState(false);
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
      key: '/sla',
      icon: <AuditOutlined />,
      label: <Link to="/sla">SLA 策略</Link>,
    },
  ];
  return (
    <Layout className="shell">
      <header className="topbar">
        <Link className="brand" to="/tickets">
          <span className="brand-mark">m.</span>
          <span>
            MamreTek <strong>ITSM</strong>
          </span>
        </Link>
        <Space>
          <Tag color="gold" icon={<ExperimentOutlined />}>
            产品原型
          </Tag>
          <span className="topbar-caption">让服务流动起来</span>
        </Space>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-label">服务管理</div>
          <Menu
            mode="inline"
            selectedKeys={[
              location.pathname.startsWith('/tickets')
                ? '/tickets'
                : location.pathname,
            ]}
            items={items}
          />
          <div className="sidebar-footer">
            <span className="status-dot" /> Mock 工作空间
            <br />
            <span className="muted">独立可用 · 组合更强</span>
          </div>
        </aside>
        <main className="main">
          <Alert
            className="prototype-banner"
            type="warning"
            showIcon
            title="产品原型 / 模拟数据"
            description="没有真实后端或权限保护，请勿输入真实敏感信息。刷新浏览器会重置工单；仅供流程评审，不可用于生产。"
          />
          <div key={revision}>
            <Routes>
              <Route path="/tickets" element={<Queue />} />
              <Route path="/tickets/:id" element={<Detail />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/sla" element={<Policies />} />
              <Route path="*" element={<Navigate replace to="/tickets" />} />
            </Routes>
          </div>
          <footer className="demo-tools">
            <span>
              <ExperimentOutlined /> 演示工具
            </span>
            <Space wrap>
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
          本次演示创建的工单、处理记录和 SLA 修改将被清空，恢复虚构的初始记录。
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
          colorPrimary: '#247462',
          borderRadius: 10,
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
          colorBgLayout: '#f4f6f5',
          colorBorderSecondary: '#e8edeb',
        },
        components: {
          Button: { controlHeight: 36 },
          Card: { headerFontSize: 15 },
          Menu: { itemSelectedBg: '#e5f0eb', itemSelectedColor: '#185e4e' },
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
