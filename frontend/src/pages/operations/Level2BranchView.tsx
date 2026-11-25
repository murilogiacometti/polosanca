import { useMemo, useState } from 'react';
import {
  AppstoreOutlined,
  ArrowRightOutlined,
  ClockCircleOutlined,
  LeftOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  ToolOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Button, Card, Empty, Grid, Segmented, Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ApiKeyModal, { type ApiKeyModalData } from '../../components/Modals/ApiKeyModal';
import EquipmentFormModal from '../../components/Modals/EquipmentFormModal';
import {
  AccentCard,
  FilterChipBar,
  PageHeader,
  SearchPill,
  SparklineMini,
  StatusPill,
  SubsystemStack,
} from '../../components/ui';
import type { FilterChipOption } from '../../components/ui/FilterChipBar';
import type { Branch, Company, EquipmentStatus, EquipmentWithLive } from '../../types/models';
import {
  EQUIPMENT_STATUS_CONFIG,
  EQUIPMENT_TYPE_LABELS,
  formatCompactAgePtBR,
  formatDateTimePtBR,
  formatOfflineBadgeLabel,
  formatPressure,
  formatRelativeTimePtBR,
  formatSafeRangeLabel,
  formatTemperature,
  getMaintenanceCountdownInfo,
} from '../../utils/formatters';

const DENSITY_STORAGE_KEY = 'ps_branch_density';
const { useBreakpoint } = Grid;

type BranchViewMode = 'cards' | 'list';

type BranchRecord = Branch & {
  manager_contact?: string | null;
};

type EquipmentLiveRecord = EquipmentWithLive & {
  manufacturer?: string | null;
};

export interface Level2BranchViewProps {
  company: Company | null;
  branch: BranchRecord | null;
  branches?: BranchRecord[];
  companies?: Company[];
  equipments?: EquipmentLiveRecord[];
  initialStatusFilter?: EquipmentStatus;
  isSingleBranchCompany?: boolean;
  isGlobalAdmin?: boolean;
  canWriteOperations?: boolean;
  backLabel?: string | null;
  onBack?: (() => void) | null;
  onZoomEquipment: (equipmentId: string) => void;
  onOpenCompanyConfig?: () => void;
  onMutated?: () => void;
}

function resolveBranchHeaderTitle(
  isSingleBranchCompany: boolean,
  company: Company | null,
  branch: BranchRecord | null
): string {
  if (isSingleBranchCompany) {
    return company?.name || branch?.name || 'Monitoramento';
  }
  return branch?.name || 'Filial';
}

function resolveEquipmentBadgeLabel(
  status: EquipmentStatus,
  lastUpdate: string | null | undefined
): string {
  if (status === 'offline') return formatOfflineBadgeLabel(lastUpdate);
  const age = formatCompactAgePtBR(lastUpdate) || 'agora';
  if (status === 'critical') return `Crítico · ${age}`;
  if (status === 'warning') return `Atenção · ${age}`;
  return `Ao vivo · ${age}`;
}

function resolveHeroTempColor(status: EquipmentStatus): string {
  if (status === 'critical') return '#dc2626';
  if (status === 'warning') return '#d97706';
  if (status === 'offline') return 'var(--ps-text-muted)';
  return 'var(--ps-text-primary)';
}

interface BranchInfoPopoverProps {
  company: Company | null;
  branch: BranchRecord | null;
  equipmentCount: number;
}

function BranchInfoPopover({ company, branch, equipmentCount }: BranchInfoPopoverProps) {
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 280 }}>
      {company?.name && (
        <div>
          <span style={{ color: 'var(--ps-text-secondary)' }}>Empresa: </span>
          <strong>{company.name}</strong>
        </div>
      )}
      {branch?.address && (
        <div>
          <span style={{ color: 'var(--ps-text-secondary)' }}>Endereço: </span>
          <span>{branch.address}</span>
        </div>
      )}
      {branch?.manager_contact && (
        <div>
          <span style={{ color: 'var(--ps-text-secondary)' }}>Responsável: </span>
          <span>{branch.manager_contact}</span>
        </div>
      )}
      {!branch?.address && !branch?.manager_contact && (
        <div style={{ color: 'var(--ps-text-secondary)' }}>
          Unidade operacional ativa ({equipmentCount}{' '}
          {equipmentCount === 1 ? 'equipamento' : 'equipamentos'})
        </div>
      )}
    </div>
  );
}

interface EquipmentStatusCardProps {
  eq: EquipmentLiveRecord;
  onZoomEquipment: (equipmentId: string) => void;
}

function EquipmentStatusCard({ eq, onZoomEquipment }: EquipmentStatusCardProps) {
  const st: EquipmentStatus = eq.effectiveStatus || 'offline';
  const isOffline = st === 'offline';
  const badgeLabel = resolveEquipmentBadgeLabel(st, eq.liveLastUpdate);
  const maintInfo = getMaintenanceCountdownInfo(eq.next_maintenance_date);
  const urgentMaint =
    maintInfo && (maintInfo.tone === 'red' || maintInfo.tone === 'amber') ? maintInfo : null;

  const typeAndModel = [
    EQUIPMENT_TYPE_LABELS[eq.type] || eq.type,
    [eq.manufacturer, eq.model].filter(Boolean).join(' ') || null,
  ]
    .filter(Boolean)
    .join(' · ');

  const pressureMeta = (
    <span style={{ fontSize: 11, color: 'var(--ps-text-secondary)' }}>
      Pressão:{' '}
      <strong
        className="ps-tabular"
        style={{
          color: isOffline ? 'var(--ps-text-secondary)' : 'var(--ps-text-primary)',
          fontWeight: 700,
        }}
      >
        {formatPressure(eq.livePressure)}
      </strong>
    </span>
  );

  return (
    <AccentCard
      status={st}
      padding="18px 20px 16px"
      gap={14}
      ariaLabel={`Abrir equipamento ${eq.serial}`}
      onClick={() => onZoomEquipment(eq.id)}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <button
            type="button"
            className="ps-mono"
            onClick={() => onZoomEquipment(eq.id)}
            style={{
              border: 'none',
              background: 'transparent',
              padding: 0,
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--ps-text-primary)',
              lineHeight: 1.25,
            }}
          >
            {eq.serial}
          </button>
          <div
            style={{
              marginTop: 2,
              fontSize: 11.5,
              color: 'var(--ps-text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {typeAndModel}
          </div>
        </div>

        <StatusPill
          tone={st}
          dot
          pulse={st === 'operational'}
          tooltip={`Último sinal: ${formatDateTimePtBR(eq.liveLastUpdate)}`}
        >
          {badgeLabel}
        </StatusPill>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              className="ps-tabular"
              style={{
                fontSize: 30,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                color: resolveHeroTempColor(st),
              }}
            >
              {formatTemperature(eq.liveTemperature)}
            </span>

            {isOffline && (
              <StatusPill
                tone="offline"
                icon={<ClockCircleOutlined style={{ fontSize: 10 }} />}
                tooltip={`Valor congelado desde ${formatDateTimePtBR(eq.liveLastUpdate)}`}
              >
                Congelada
              </StatusPill>
            )}
          </div>

          <div
            className="ps-tabular"
            style={{
              marginTop: 5,
              fontSize: 11.5,
              color: 'var(--ps-text-secondary)',
            }}
          >
            {formatSafeRangeLabel(eq.threshold, eq.thresholdLabel)}
          </div>
        </div>

        <SubsystemStack
          door={eq.liveDoor}
          compressor={eq.liveCompressor}
          fan={eq.liveFan}
          heater={eq.liveHeater}
          isOffline={isOffline}
          layout="vertical"
        />
      </div>

      <div style={{ marginTop: 'auto' }}>
        <SparklineMini
          points={eq.sparkline24h}
          status={st}
          threshold={eq.threshold}
          withTopBorder
          rightMeta={pressureMeta}
          height={34}
        />
      </div>

      {urgentMaint && (
        <div style={{ paddingTop: 2 }}>
          <Tag
            icon={<ToolOutlined />}
            color={urgentMaint.tagColor}
            style={{ margin: 0, borderRadius: 999, fontSize: 11 }}
          >
            {urgentMaint.label}
          </Tag>
        </div>
      )}
    </AccentCard>
  );
}

function resolveMobileCardSummary(eq: EquipmentLiveRecord): string {
  const st: EquipmentStatus = eq.effectiveStatus || 'offline';
  if (st === 'offline') {
    return `Sem sinal ${formatCompactAgePtBR(eq.liveLastUpdate)}`;
  }
  const parts: string[] = [];
  if (eq.liveDoor === 'open') {
    parts.push('Porta Aberta');
  } else {
    parts.push(st === 'critical' ? 'Crítico' : st === 'warning' ? 'Atenção' : 'Normal');
  }
  if (eq.liveCompressor === 'on') {
    parts.push('Comp ON');
  }
  return parts.join(' · ');
}

interface MobileBranchFloorProps {
  headerTitle: string;
  backLabel: string | null;
  onBack: (() => void) | null;
  canWriteOperations: boolean;
  filterOptions: Array<FilterChipOption<EquipmentStatus | undefined>>;
  statusFilter: EquipmentStatus | undefined;
  onStatusFilterChange: (next: EquipmentStatus | undefined) => void;
  searchText: string;
  onSearchTextChange: (next: string) => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
  equipments: EquipmentLiveRecord[];
  onZoomEquipment: (equipmentId: string) => void;
  onOpenCreateModal: () => void;
}

function MobileBranchFloor({
  headerTitle,
  backLabel,
  onBack,
  canWriteOperations,
  filterOptions,
  statusFilter,
  onStatusFilterChange,
  searchText,
  onSearchTextChange,
  searchOpen,
  onToggleSearch,
  equipments,
  onZoomEquipment,
  onOpenCreateModal,
}: MobileBranchFloorProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {onBack && (
            <Button
              type="text"
              icon={<LeftOutlined />}
              aria-label={backLabel ? `Voltar para ${backLabel}` : 'Voltar'}
              onClick={onBack}
              style={{ flexShrink: 0, marginLeft: -8 }}
            />
          )}
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: 'var(--ps-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {headerTitle}
          </h1>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Button
            icon={<SearchOutlined />}
            aria-label="Buscar equipamento"
            type={searchOpen || Boolean(searchText) ? 'primary' : 'default'}
            ghost={searchOpen || Boolean(searchText)}
            onClick={onToggleSearch}
            style={{ borderRadius: 10 }}
          />
          {canWriteOperations && (
            <Button
              icon={<PlusOutlined />}
              aria-label="Novo Equipamento"
              onClick={onOpenCreateModal}
              style={{ borderRadius: 10 }}
            />
          )}
        </div>
      </div>

      {(searchOpen || Boolean(searchText)) && (
        <SearchPill
          value={searchText}
          onChange={onSearchTextChange}
          placeholder="Buscar câmara ou serial..."
          width="100%"
        />
      )}

      <FilterChipBar<EquipmentStatus | undefined>
        options={filterOptions}
        value={statusFilter}
        onChange={onStatusFilterChange}
        hideZero
        resetValue={undefined}
      />

      {equipments.length === 0 ? (
        <Card style={{ borderRadius: 16 }}>
          <Empty description="Nenhum equipamento corresponde aos filtros nesta unidade." />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {equipments.map((eq) => {
            const st: EquipmentStatus = eq.effectiveStatus || 'offline';
            const tempColor =
              st === 'critical'
                ? '#b91c1c'
                : st === 'warning'
                  ? '#b45309'
                  : st === 'offline'
                    ? 'var(--ps-text-muted)'
                    : 'var(--ps-text-primary)';
            return (
              <AccentCard
                key={eq.id}
                status={st}
                padding="20px"
                gap={14}
                ariaLabel={`Abrir equipamento ${eq.serial}`}
                onClick={() => onZoomEquipment(eq.id)}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <button
                    type="button"
                    className="ps-mono"
                    onClick={() => onZoomEquipment(eq.id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 16,
                      fontWeight: 700,
                      color: 'var(--ps-text-primary)',
                    }}
                  >
                    {eq.serial}
                  </button>
                  <span
                    className="ps-tabular"
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      letterSpacing: '-0.02em',
                      color: tempColor,
                      flexShrink: 0,
                    }}
                  >
                    {formatTemperature(eq.liveTemperature)}
                  </span>
                </div>

                <SparklineMini
                  points={eq.sparkline24h}
                  status={st}
                  threshold={eq.threshold}
                  showHeader={false}
                  withTopBorder={false}
                  height={44}
                />

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 13,
                    color: 'var(--ps-text-secondary)',
                  }}
                >
                  <span>{resolveMobileCardSummary(eq)}</span>
                  <span className="ps-tabular">{formatRelativeTimePtBR(eq.liveLastUpdate)}</span>
                </div>
              </AccentCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface BranchEquipmentDisplayProps {
  equipments: EquipmentLiveRecord[];
  viewMode: BranchViewMode;
  listColumns: ColumnsType<EquipmentLiveRecord>;
  onZoomEquipment: (equipmentId: string) => void;
}

function BranchEquipmentDisplay({
  equipments,
  viewMode,
  listColumns,
  onZoomEquipment,
}: BranchEquipmentDisplayProps) {
  if (equipments.length === 0) {
    return (
      <Card style={{ borderRadius: 14 }}>
        <Empty description="Nenhum equipamento corresponde aos filtros nesta unidade." />
      </Card>
    );
  }
  if (viewMode === 'list') {
    return (
      <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 14, overflow: 'hidden' }}>
        <Table<EquipmentLiveRecord>
          rowKey="id"
          size="small"
          columns={listColumns}
          dataSource={equipments}
          pagination={equipments.length > 25 ? { pageSize: 25 } : false}
          scroll={{ x: 820 }}
          onRow={(record) => ({
            onClick: () => onZoomEquipment(record.id),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    );
  }
  return (
    <div className="ps-equipment-grid">
      {equipments.map((eq) => (
        <EquipmentStatusCard key={eq.id} eq={eq} onZoomEquipment={onZoomEquipment} />
      ))}
    </div>
  );
}

interface BranchHeaderRightSlotProps {
  showViewSwitcher: boolean;
  effectiveViewMode: BranchViewMode;
  onViewModeChange: (nextMode: BranchViewMode) => void;
  showCompanyConfig: boolean;
  onOpenCompanyConfig?: () => void;
  canWriteOperations: boolean;
  onOpenCreateModal: () => void;
}

function BranchHeaderRightSlot({
  showViewSwitcher,
  effectiveViewMode,
  onViewModeChange,
  showCompanyConfig,
  onOpenCompanyConfig,
  canWriteOperations,
  onOpenCreateModal,
}: BranchHeaderRightSlotProps) {
  return (
    <>
      {showViewSwitcher && (
        <Segmented<BranchViewMode>
          className="ps-pill-switcher"
          value={effectiveViewMode}
          onChange={onViewModeChange}
          options={[
            { value: 'cards', icon: <AppstoreOutlined />, label: 'Cartões' },
            { value: 'list', icon: <UnorderedListOutlined />, label: 'Lista' },
          ]}
        />
      )}

      {showCompanyConfig && onOpenCompanyConfig && (
        <Button
          icon={<SettingOutlined />}
          style={{ borderRadius: 10 }}
          onClick={onOpenCompanyConfig}
        >
          Configurar
        </Button>
      )}

      {canWriteOperations && (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          style={{ borderRadius: 10 }}
          onClick={onOpenCreateModal}
        >
          Novo Equipamento
        </Button>
      )}
    </>
  );
}

/**
 * Nível 2 (Piso da Filial / Unidade):
 * Visão estritamente de leitura rápida e triagem, composta sobre `PageHeader`, `FilterChipBar`,
 * `SearchPill`, `AccentCard`, `StatusPill`, `SubsystemStack` e `SparklineMini`.
 */
export default function Level2BranchView({
  company,
  branch,
  branches = [],
  companies = [],
  equipments = [],
  initialStatusFilter = undefined,
  isSingleBranchCompany = false,
  isGlobalAdmin = false,
  canWriteOperations = false,
  backLabel = null,
  onBack = null,
  onZoomEquipment,
  onOpenCompanyConfig,
  onMutated,
}: Level2BranchViewProps) {
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | undefined>(initialStatusFilter);
  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState<BranchViewMode>(() => {
    try {
      return localStorage.getItem(DENSITY_STORAGE_KEY) === 'list' ? 'list' : 'cards';
    } catch {
      return 'cards';
    }
  });

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [apiKeyModalData, setApiKeyModalData] = useState<ApiKeyModalData | null>(null);

  const handleViewModeChange = (nextMode: BranchViewMode) => {
    setViewMode(nextMode);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, nextMode);
    } catch {
      // Ignora indisponibilidade de storage
    }
  };

  const showViewSwitcher = equipments.length > 3;
  const effectiveViewMode: BranchViewMode = showViewSwitcher ? viewMode : 'cards';

  const counts = useMemo(() => {
    const acc: {
      total: number;
      operational: number;
      warning: number;
      critical: number;
      offline: number;
    } = {
      total: equipments.length,
      operational: 0,
      warning: 0,
      critical: 0,
      offline: 0,
    };
    equipments.forEach((eq) => {
      const st: EquipmentStatus = eq.effectiveStatus || 'offline';
      acc[st] += 1;
    });
    return acc;
  }, [equipments]);

  const filteredEquipments = useMemo<EquipmentLiveRecord[]>(() => {
    const q = searchText.trim().toLowerCase();
    const rank: Record<EquipmentStatus, number> = {
      critical: 4,
      warning: 3,
      offline: 2,
      operational: 1,
    };
    return equipments
      .filter((eq) => {
        if (statusFilter && eq.effectiveStatus !== statusFilter) return false;
        if (q) {
          const hay = `${eq.serial} ${eq.manufacturer || ''} ${eq.model || ''} ${
            EQUIPMENT_TYPE_LABELS[eq.type] || eq.type
          }`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const diff = (rank[b.effectiveStatus] || 0) - (rank[a.effectiveStatus] || 0);
        if (diff !== 0) return diff;
        return a.serial.localeCompare(b.serial, 'pt-BR');
      });
  }, [equipments, statusFilter, searchText]);

  const filterOptions = useMemo<Array<FilterChipOption<EquipmentStatus | undefined>>>(
    () => [
      { key: undefined, label: 'Todos', count: counts.total },
      {
        key: 'critical',
        label: counts.critical === 1 ? 'Crítico' : 'Críticos',
        count: counts.critical,
      },
      { key: 'warning', label: 'Atenção', count: counts.warning },
      { key: 'offline', label: 'Offline', count: counts.offline },
      { key: 'operational', label: 'Operando', count: counts.operational },
    ],
    [counts]
  );

  const listColumns = useMemo<ColumnsType<EquipmentLiveRecord>>(
    () => [
      {
        title: 'Equipamento',
        key: 'serial',
        width: 230,
        render: (_, eq) => (
          <div>
            <span className="ps-mono" style={{ fontWeight: 700, fontSize: 13.5 }}>
              {eq.serial}
            </span>
            <div style={{ fontSize: 11.5, color: 'var(--ps-text-secondary)' }}>
              {EQUIPMENT_TYPE_LABELS[eq.type] || eq.type}
              {eq.manufacturer || eq.model
                ? ` · ${[eq.manufacturer, eq.model].filter(Boolean).join(' ')}`
                : ''}
            </div>
          </div>
        ),
      },
      {
        title: 'Status',
        key: 'status',
        width: 155,
        render: (_, eq) => {
          const st: EquipmentStatus = eq.effectiveStatus || 'offline';
          const stCfg = EQUIPMENT_STATUS_CONFIG[st] || EQUIPMENT_STATUS_CONFIG.offline;
          const isOffline = st === 'offline';
          return (
            <StatusPill tone={st} dot pulse={st === 'operational'}>
              {isOffline ? formatOfflineBadgeLabel(eq.liveLastUpdate) : stCfg.label}
            </StatusPill>
          );
        },
      },
      {
        title: 'Temperatura',
        key: 'temperature',
        width: 210,
        render: (_, eq) => {
          const st: EquipmentStatus = eq.effectiveStatus || 'offline';
          const isOffline = st === 'offline';
          return (
            <div className="ps-tabular">
              <span
                style={{
                  fontWeight: isOffline ? 600 : 700,
                  fontSize: 14.5,
                  color:
                    st === 'critical'
                      ? '#dc2626'
                      : st === 'warning'
                        ? '#d97706'
                        : isOffline
                          ? 'var(--ps-text-muted)'
                          : 'var(--ps-text-primary)',
                }}
              >
                {isOffline && <ClockCircleOutlined style={{ fontSize: 11.5, marginRight: 5 }} />}
                {formatTemperature(eq.liveTemperature)}
              </span>
              <div style={{ fontSize: 11, color: 'var(--ps-text-secondary)' }}>
                {formatSafeRangeLabel(eq.threshold, eq.thresholdLabel)}
              </div>
            </div>
          );
        },
      },
      {
        title: 'Pressão',
        key: 'pressure',
        width: 115,
        render: (_, eq) => {
          const isOffline = (eq.effectiveStatus || 'offline') === 'offline';
          return (
            <span
              className="ps-tabular"
              style={{
                fontWeight: 600,
                color: isOffline ? 'var(--ps-text-secondary)' : 'var(--ps-text-primary)',
              }}
            >
              {formatPressure(eq.livePressure)}
            </span>
          );
        },
      },
      {
        title: 'Tendência 24h',
        key: 'trend_24h',
        width: 150,
        render: (_, eq) => (
          <div style={{ width: 128 }}>
            <SparklineMini
              points={eq.sparkline24h}
              status={eq.effectiveStatus || 'offline'}
              threshold={eq.threshold}
              showHeader={false}
              withTopBorder={false}
              height={26}
            />
          </div>
        ),
      },
      {
        title: 'Último Sinal',
        key: 'last_seen',
        width: 135,
        render: (_, eq) => (
          <Tooltip title={formatDateTimePtBR(eq.liveLastUpdate)}>
            <span className="ps-tabular" style={{ fontSize: 12, color: 'var(--ps-text-secondary)' }}>
              {formatRelativeTimePtBR(eq.liveLastUpdate)}
            </span>
          </Tooltip>
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 100,
        align: 'right',
        render: (_, eq) => (
          <Button
            size="small"
            type="text"
            icon={<ArrowRightOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              onZoomEquipment(eq.id);
            }}
          >
            Abrir
          </Button>
        ),
      },
    ],
    [onZoomEquipment]
  );

  const screens = useBreakpoint();
  const isMobilePhone = !screens.md;
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const headerTitle = resolveBranchHeaderTitle(isSingleBranchCompany, company, branch);

  return (
    <>
      {isMobilePhone ? (
        <MobileBranchFloor
          headerTitle={headerTitle}
          backLabel={backLabel}
          onBack={onBack}
          canWriteOperations={canWriteOperations}
          filterOptions={filterOptions}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          searchText={searchText}
          onSearchTextChange={setSearchText}
          searchOpen={mobileSearchOpen}
          onToggleSearch={() => setMobileSearchOpen((prev) => !prev)}
          equipments={filteredEquipments}
          onZoomEquipment={onZoomEquipment}
          onOpenCreateModal={() => setCreateModalOpen(true)}
        />
      ) : (
        <Space direction="vertical" size={18} style={{ width: '100%' }}>
          <PageHeader
            backLabel={backLabel}
            onBack={onBack}
            title={headerTitle}
            infoTitle="Informações da Unidade"
            infoContent={
              <BranchInfoPopover
                company={company}
                branch={branch}
                equipmentCount={equipments.length}
              />
            }
            rightSlot={
              <BranchHeaderRightSlot
                showViewSwitcher={showViewSwitcher}
                effectiveViewMode={effectiveViewMode}
                onViewModeChange={handleViewModeChange}
                showCompanyConfig={isSingleBranchCompany && canWriteOperations}
                onOpenCompanyConfig={onOpenCompanyConfig}
                canWriteOperations={canWriteOperations}
                onOpenCreateModal={() => setCreateModalOpen(true)}
              />
            }
          />

          <div className="ps-toolbar-row">
            <FilterChipBar<EquipmentStatus | undefined>
              options={filterOptions}
              value={statusFilter}
              onChange={setStatusFilter}
              hideZero
              resetValue={undefined}
            />

            <SearchPill
              value={searchText}
              onChange={setSearchText}
              placeholder="Filtrar tag, tipo ou modelo..."
              width={240}
            />
          </div>

          <BranchEquipmentDisplay
            equipments={filteredEquipments}
            viewMode={effectiveViewMode}
            listColumns={listColumns}
            onZoomEquipment={onZoomEquipment}
          />
        </Space>
      )}

      <EquipmentFormModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        branches={branches}
        companies={companies}
        isGlobalAdmin={isGlobalAdmin}
        defaultCompanyId={company?.id}
        defaultBranchId={branch?.id}
        onSuccess={(createdEq, plaintextKey) => {
          setCreateModalOpen(false);
          onMutated?.();
          if (plaintextKey) {
            setApiKeyModalData({
              serial: createdEq.serial,
              apiKey: plaintextKey,
              isRotation: false,
            });
          }
        }}
      />

      <ApiKeyModal
        open={Boolean(apiKeyModalData)}
        onClose={() => setApiKeyModalData(null)}
        apiKeyData={apiKeyModalData}
      />
    </>
  );
}
