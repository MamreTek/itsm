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
        title="服务目录"
        description="选择服务并提交申请，申请将进入工单队列。"
      />
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
              <div className="service-heading">
                <span className="service-icon">{icons[i % icons.length]}</span>
                <h2>{item.name}</h2>
              </div>
              <Tag>{item.category}</Tag>
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
