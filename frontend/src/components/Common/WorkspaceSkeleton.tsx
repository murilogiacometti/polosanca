import { Card, Col, Row, Skeleton, Space } from 'antd';

type WorkspaceSkeletonVariant = 'grid' | 'detail';

export interface WorkspaceSkeletonProps {
  variant?: WorkspaceSkeletonVariant;
}

/**
 * Skeletons preservadores de layout (Zero Layout Shift) para transições de zoom
 * e carregamento inicial sem flashes de spinner centralizado.
 */
export default function WorkspaceSkeleton({ variant = 'grid' }: WorkspaceSkeletonProps) {
  if (variant === 'detail') {
    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Skeleton active paragraph={{ rows: 1, width: ['45%'] }} title={{ width: 220 }} />
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card>
              <Skeleton active paragraph={{ rows: 3 }} />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card>
              <Skeleton active paragraph={{ rows: 3 }} />
            </Card>
          </Col>
        </Row>
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} title={{ width: 320 }} />
        </Card>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Row gutter={[14, 14]}>
        {[0, 1, 2, 3].map((idx) => (
          <Col key={idx} xs={12} sm={12} lg={6}>
            <Card size="small" styles={{ body: { padding: '14px 16px' } }}>
              <Skeleton active paragraph={{ rows: 1, width: ['60%'] }} title={{ width: 110 }} />
            </Card>
          </Col>
        ))}
      </Row>
      <Row gutter={[16, 16]}>
        {[0, 1, 2, 3, 4, 5].map((idx) => (
          <Col key={idx} xs={24} md={12} xl={8}>
            <Card styles={{ body: { padding: 18 } }}>
              <Skeleton active paragraph={{ rows: 4 }} title={{ width: 160 }} />
            </Card>
          </Col>
        ))}
      </Row>
    </Space>
  );
}
