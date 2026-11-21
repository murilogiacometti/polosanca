import { type ReactNode, useMemo, useState } from 'react';
import { LeftOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Row,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { getAuditLogs, getUsers, type GetAuditLogsParams } from '../api';
import WorkspaceSkeleton from '../components/Common/WorkspaceSkeleton';
import { PageHeader, StatusPill } from '../components/ui';
import { queryKeys } from '../query/queryClient';
import type { AuditEntityType, AuditLogItem } from '../types/models';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  AUDIT_ENTITY_OPTIONS,
  formatDateTimePtBR,
} from '../utils/formatters';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface AuditDiffPair {
  old?: unknown;
  new?: unknown;
  before?: unknown;
  after?: unknown;
}

function isAuditDiffPair(val: unknown): val is AuditDiffPair {
  return (
    val !== null &&
    typeof val === 'object' &&
    !Array.isArray(val) &&
    ('old' in val || 'new' in val || 'before' in val || 'after' in val)
  );
}

function formatAuditValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (typeof val === 'object') return JSON.stringify(val);
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'bigint') {
    return String(val);
  }
  return '';
}

function AuditChangesView({ changes }: { changes?: Record<string, unknown> | null }) {
  if (!changes || typeof changes !== 'object' || Object.keys(changes).length === 0) {
    return <Text type="secondary">Sem payload adicional de alterações.</Text>;
  }

  const entries = Object.entries(changes);
  const hasBeforeAfter = entries.some(([, v]) => isAuditDiffPair(v));

  if (hasBeforeAfter) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(140px, 200px) 1fr 1fr',
          gap: '6px 12px',
          padding: '10px 12px',
          borderRadius: 10,
          background: 'var(--ps-chip-bg)',
          border: '1px solid var(--ps-border)',
          fontSize: 12,
        }}
      >
        <Text type="secondary" strong>
          Campo
        </Text>
        <Text type="secondary" strong>
          Antes
        </Text>
        <Text type="secondary" strong>
          Depois
        </Text>
        {entries.map(([field, diff]) => {
          const isPair = isAuditDiffPair(diff);
          const beforeVal = isPair ? (diff.old ?? diff.before) : undefined;
          const afterVal = isPair ? (diff.new ?? diff.after) : diff;
          return (
            <div key={field} style={{ display: 'contents' }}>
              <span className="ps-mono" style={{ fontWeight: 600 }}>
                {field}
              </span>
              <span className="ps-mono" style={{ color: 'var(--ps-text-secondary)' }}>
                {isPair ? formatAuditValue(beforeVal) : '—'}
              </span>
              <span
                className="ps-mono"
                style={{ color: 'var(--ps-text-primary)', fontWeight: 500 }}
              >
                {formatAuditValue(afterVal)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(150px, 220px) 1fr',
        gap: '6px 12px',
        padding: '10px 12px',
        borderRadius: 10,
        background: 'var(--ps-chip-bg)',
        border: '1px solid var(--ps-border)',
        fontSize: 12,
      }}
    >
      {entries.map(([key, val]) => (
        <div key={key} style={{ display: 'contents' }}>
          <span
            className="ps-mono"
            style={{ color: 'var(--ps-text-secondary)', fontWeight: 600 }}
          >
            {key}
          </span>
          <span className="ps-mono" style={{ wordBreak: 'break-word' }}>
            {formatAuditValue(val)}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface AuditLogsPageProps {
  headerNav?: ReactNode;
}

export default function AuditLogsPage({ headerNav = null }: AuditLogsPageProps) {
  const [entityTypeFilter, setEntityTypeFilter] = useState<AuditEntityType | undefined>(undefined);
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);
  const [userFilter, setUserFilter] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [cursorIndex, setCursorIndex] = useState(0);

  const currentToken = cursorStack[cursorIndex] || null;

  const usersQuery = useQuery({
    queryKey: queryKeys.auditLogs.users(),
    queryFn: async () => {
      const res = await getUsers({ limit: 100 });
      return res?.users || [];
    },
    staleTime: 60_000,
  });

  const { usersMap, userOptions } = useMemo(() => {
    const list = usersQuery.data || [];
    const map: Record<string, string> = {};
    list.forEach((u) => {
      map[u.id] = `${u.name} (${u.email})`;
    });
    return {
      usersMap: map,
      userOptions: list.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })),
    };
  }, [usersQuery.data]);

  const queryParams = useMemo<GetAuditLogsParams>(() => {
    const params: GetAuditLogsParams = { limit: 25 };
    if (currentToken) params.page_token = currentToken;
    if (entityTypeFilter) params.entity_type = entityTypeFilter;
    if (actionFilter) params.action = actionFilter;
    if (userFilter) params.user_id = userFilter;
    if (dateRange?.[0]) params.start_date = dateRange[0].toISOString();
    if (dateRange?.[1]) params.end_date = dateRange[1].toISOString();
    return params;
  }, [currentToken, entityTypeFilter, actionFilter, userFilter, dateRange]);

  const logsQuery = useQuery({
    queryKey: queryKeys.auditLogs.list(queryParams),
    queryFn: () => getAuditLogs(queryParams),
    placeholderData: keepPreviousData,
  });

  const logs: AuditLogItem[] = logsQuery.data?.audit_logs || [];
  const nextPageToken = logsQuery.data?.next_page_token || null;
  const loading = logsQuery.isFetching;

  const fetchLogs = () => {
    void logsQuery.refetch();
  };

  const resetCursorAndApply = (updater: () => void) => {
    updater();
    setCursorStack([null]);
    setCursorIndex(0);
  };

  const handleNextCursor = () => {
    if (!nextPageToken) return;
    const nextIdx = cursorIndex + 1;
    const updatedStack = [...cursorStack.slice(0, nextIdx), nextPageToken];
    setCursorStack(updatedStack);
    setCursorIndex(nextIdx);
  };

  const handlePrevCursor = () => {
    if (cursorIndex <= 0) return;
    setCursorIndex(cursorIndex - 1);
  };

  const columns: ColumnsType<AuditLogItem> = [
    {
      title: 'Data / Hora',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 175,
      render: (ts: string) => <span className="ps-tabular">{formatDateTimePtBR(ts)}</span>,
    },
    {
      title: 'Ação Executada',
      dataIndex: 'action',
      key: 'action',
      width: 225,
      render: (act: string) => (
        <StatusPill tone="brand">{AUDIT_ACTION_LABELS[act] || act}</StatusPill>
      ),
    },
    {
      title: 'Entidade',
      key: 'entity',
      width: 205,
      render: (_, r) => (
        <div>
          <StatusPill tone="neutral">
            {AUDIT_ENTITY_LABELS[r.entity_type] || r.entity_type}
          </StatusPill>
          {r.entity_id && (
            <div
              className="ps-mono"
              style={{ fontSize: 11, color: 'var(--ps-text-secondary)', marginTop: 2 }}
            >
              ID: {r.entity_id.slice(0, 8)}…
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Autor',
      dataIndex: 'user_id',
      key: 'user_id',
      render: (uid: string | null | undefined) =>
        uid ? usersMap[uid] || uid : 'Sistema / Automático',
    },
    {
      title: 'Origem (IP)',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 145,
      render: (ip: string | null | undefined) => <span className="ps-mono">{ip || '—'}</span>,
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <PageHeader
        title="Trilha de Auditoria Imutável"
        align="center"
        subtitle="Registro somente-anexação (append-only) de alterações administrativas e operacionais."
        rightSlot={
          <Button icon={<ReloadOutlined spin={loading} />} onClick={fetchLogs}>
            Atualizar
          </Button>
        }
      />

      {headerNav && <div className="ps-toolbar-row">{headerNav}</div>}

      <Row gutter={[10, 10]}>
        <Col xs={24} sm={12} lg={5}>
          <Select<AuditEntityType>
            allowClear
            style={{ width: '100%' }}
            placeholder="Tipo de entidade"
            value={entityTypeFilter}
            onChange={(val) => resetCursorAndApply(() => setEntityTypeFilter(val))}
            options={AUDIT_ENTITY_OPTIONS}
          />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Select<string>
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
            placeholder="Ação auditada"
            value={actionFilter}
            onChange={(val) => resetCursorAndApply(() => setActionFilter(val))}
            options={Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Select<string>
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
            placeholder="Filtrar por usuário"
            value={userFilter}
            onChange={(val) => resetCursorAndApply(() => setUserFilter(val))}
            options={userOptions}
          />
        </Col>

        <Col xs={24} sm={12} lg={7}>
          <RangePicker
            showTime
            style={{ width: '100%' }}
            format="DD/MM/YYYY HH:mm"
            value={dateRange}
            onChange={(vals) => resetCursorAndApply(() => setDateRange(vals))}
          />
        </Col>
      </Row>

      {loading && logs.length === 0 ? (
        <WorkspaceSkeleton variant="grid" />
      ) : (
        <Card styles={{ body: { padding: logs.length === 0 ? 36 : 0 } }}>
          {logs.length === 0 ? (
            <Empty description="Nenhum evento de auditoria encontrado para os filtros informados." />
          ) : (
            <>
              <Table<AuditLogItem>
                rowKey="id"
                columns={columns}
                dataSource={logs}
                pagination={false}
                scroll={{ x: 920 }}
                expandable={{
                  expandedRowRender: (record) => (
                    <div style={{ fontSize: 12 }}>
                      <div style={{ marginBottom: 8 }}>
                        <Text strong>ID Completo:</Text>{' '}
                        <span className="ps-mono">{record.entity_id || '—'}</span> ·{' '}
                        <Text strong>User-Agent:</Text> {record.user_agent || '—'}
                      </div>
                      <AuditChangesView changes={record.changes} />
                    </div>
                  ),
                }}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderTop: '1px solid var(--ps-subtle-divider)',
                }}
              >
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Página <span className="ps-tabular">{cursorIndex + 1}</span> (cursor O(1))
                </Text>
                <Space>
                  <Button
                    size="small"
                    icon={<LeftOutlined />}
                    disabled={cursorIndex === 0}
                    onClick={handlePrevCursor}
                  >
                    Anterior
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    icon={<RightOutlined />}
                    iconPosition="end"
                    disabled={!nextPageToken}
                    onClick={handleNextCursor}
                  >
                    Próxima
                  </Button>
                </Space>
              </div>
            </>
          )}
        </Card>
      )}
    </Space>
  );
}
