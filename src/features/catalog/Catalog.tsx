import { Button, Card, Tag } from 'antd';
import {
  ArrowRightOutlined,
  CloudServerOutlined,
  SafetyCertificateOutlined,
  CustomerServiceOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../shared/api/client';
import type { Service } from '../../shared/api/contracts';
import { LoadState, PageTitle, useResource } from '../../shared/ui';
import { CreateTicket } from '../tickets/CreateTicket';

export function Catalog() {
  const resource = useResource(api.catalog);
  const [service, setService] = useState<Service>();
  const navigate = useNavigate();
  const icons = [
    <CloudServerOutlined />,
    <SafetyCertificateOutlined />,
    <CustomerServiceOutlined />,
  ];
  return (
    <>
      <PageTitle
        eyebrow="SERVICE CATALOG"
        title="需要什么帮助？"
        description="从常用服务开始，把需求交给合适的人。"
      />
      <div className="catalog-hero">
        <Tag color="cyan">轻量服务台</Tag>
        <h2>
          一次清晰的申请，
          <br />
          是高效协作的开始。
        </h2>
        <p>选择服务、说明用途、跟进结果。先把流程跑通。</p>
      </div>
      <LoadState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
        empty={!resource.data?.length}
      />
      {!resource.loading && !resource.error && (
        <div className="catalog-grid">
          {resource.data?.map((item, i) => (
            <Card key={item.id} className="service-card">
              <div className="service-icon">{icons[i % icons.length]}</div>
              <Tag>{item.category}</Tag>
              <h2>{item.name}</h2>
              <p className="muted">{item.description}</p>
              <Button type="link" onClick={() => setService(item)}>
                申请服务 <ArrowRightOutlined />
              </Button>
            </Card>
          ))}
        </div>
      )}
      {service && (
        <CreateTicket
          service={service}
          onClose={() => setService(undefined)}
          onCreated={(ticket) => {
            setService(undefined);
            navigate(`/tickets/${ticket.id}`);
          }}
        />
      )}
    </>
  );
}
