import { useMemo, useState } from 'react';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  EditOutlined,
  PlusOutlined,
  RightOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  App as AntdApp,
  Button,
  Card,
  Empty,
  Grid,
  Segmented,
  Space,
  Tag,
} from 'antd';
import { deactivateCompany, updateCompany } from '../../api';
import CompanyFormModal from '../../components/Modals/CompanyFormModal';
import {
  AccentCard,
  HealthRollupBar,
  PageHeader,
  RowActionMenu,
  SearchPill,
  StatMiniCard,
  StatusPill,
} from '../../components/ui';
import type { RowActionMenuItem } from '../../components/ui/RowActionMenu';
import { confirmWithShortcutLock, useUiShell } from '../../context/uiShellContextObject';
import type { Company, EquipmentStatus, EquipmentWithLive } from '../../types/models';
import {
  COMPANY_STATUS_CONFIG,
  extractApiError,
  formatCompactAgePtBR,
  formatTemperature,
} from '../../utils/formatters';

const { useBreakpoint } = Grid;

type CompanyRecord = Company;

type CompanyStatusFilter = 'active' | 'inactive' | 'all';
type CompanyHealthFilter = 'all' | 'critical';

interface CompanyRollup {
  equipments: EquipmentWithLive[];
  operational: number;
  warning: number;
  critical: number;
  offline: number;
  criticalUnits: EquipmentWithLive[];
  warningUnits: EquipmentWithLive[];
  offlineUnits: EquipmentWithLive[];
  latestUpdate: string | null;
}

export interface ScopedAlertsOverride {
  companyId: string | null;
  branchId: string | null;
  equipmentId: string | null;
  title: string;
}

export interface Level0GlobalViewProps {
  companies?: CompanyRecord[];
  equipments?: EquipmentWithLive[];
  onZoomCompany: (companyId: string) => void;
  onDirectJumpEquipment: (
    targetCompanyId?: string | null,
    targetBranchId?: string | null,
    targetEquipmentId?: string | null,
    statusFilter?: EquipmentStatus
  ) => void;
  onOpenScopedAlerts: (override: ScopedAlertsOverride) => void;
  onMutated?: () => void;
}

const EMPTY_ROLLUP: CompanyRollup = {
  equipments: [],
  operational: 0,
  warning: 0,
  critical: 0,
  offline: 0,
  criticalUnits: [],
  warningUnits: [],
  offlineUnits: [],
  latestUpdate: null,
};

function resolveCompanyCardStatus(rollup: CompanyRollup, totalEq: number): EquipmentStatus {
  if (rollup.critical > 0) return 'critical';
  if (rollup.warning > 0) return 'warning';
  if (totalEq > 0 && rollup.offline !== totalEq) return 'operational';
  return 'offline';
}

function resolveCompanyFreshness(rollup: CompanyRollup, totalEq: number): string | null {
  if (totalEq === 0) return null;
  const ageCompact = formatCompactAgePtBR(rollup.latestUpdate);
  if (rollup.offline === 0) return `Ao vivo · ${ageCompact || 'agora'}`;
  if (rollup.offline === totalEq) return ageCompact ? `Offline · ${ageCompact}` : 'Sem sinal';
  return ageCompact ? `Há ${ageCompact} (Parcial)` : 'Parcial';
}

function buildCompanySubtitle(comp: CompanyRecord, totalBranches: number): string {
  const parts: string[] = [
    comp.contact_email || (totalBranches > 1 ? 'Operação Multi-Filial' : 'Unidade Operacional Única'),
  ];
  if (comp.contact_phone) parts.push(comp.contact_phone);
  return parts.join(' · ');
}

interface CompanyOverviewCardProps {
  comp: CompanyRecord;
  rollup: CompanyRollup;
  onZoomCompany: (companyId: string) => void;
  onEditCompany: (company: CompanyRecord) => void;
  onToggleCompanyStatus: (company: CompanyRecord) => void;
  onFastLaneSegment: (
    company: CompanyRecord,
    rollup: CompanyRollup,
    kind: EquipmentStatus
  ) => void;
}

function CompanyOverviewCard({
  comp,
  rollup,
  onZoomCompany,
  onEditCompany,
  onToggleCompanyStatus,
  onFastLaneSegment,
}: CompanyOverviewCardProps) {
  const totalEq = rollup.equipments.length || comp.equipment_count || 0;
  const totalBranches = comp.branches_count ?? 1;
  const hasCritical = rollup.critical > 0;
  const cardStatus = resolveCompanyCardStatus(rollup, totalEq);
  const freshnessText = resolveCompanyFreshness(rollup, totalEq);
  const subtitle = buildCompanySubtitle(comp, totalBranches);
  const compStCfg = (comp.status && COMPANY_STATUS_CONFIG[comp.status]) || {
    label: comp.status || 'Inativa',
    color: 'default',
  };
  const isActive = comp.status === 'active';

  const menuItems: RowActionMenuItem[] = [
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: 'Editar Dados da Empresa',
      onClick: () => onEditCompany(comp),
    },
    {
      key: 'toggle',
      icon: isActive ? <StopOutlined /> : <CheckCircleOutlined />,
      danger: isActive,
      label: isActive ? 'Desativar Empresa' : 'Reativar Empresa',
      onClick: () => onToggleCompanyStatus(comp),
    },
  ];

  return (
    <AccentCard
      status={cardStatus}
      dimmed={comp.status === 'inactive'}
      gap={20}
      ariaLabel={`Abrir empresa ${comp.name}`}
      onClick={() => onZoomCompany(comp.id)}
      style={{ justifyContent: 'space-between' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onZoomCompany(comp.id)}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 16.5,
                fontWeight: 700,
                color: hasCritical ? '#1d4ed8' : 'var(--ps-text-primary)',
                lineHeight: 1.3,
              }}
            >
              {comp.name}
            </button>
            {!isActive && (
              <Tag color={compStCfg.color} style={{ margin: 0, borderRadius: 999 }}>
                {compStCfg.label}
              </Tag>
            )}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 12,
              color: 'var(--ps-text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </div>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <StatusPill tone={totalBranches > 1 ? 'brand' : 'neutral'}>
            {totalBranches === 1 ? '1 Filial' : `${totalBranches} Filiais`}{' '}
            <RightOutlined style={{ fontSize: 9 }} />
          </StatusPill>

          <RowActionMenu items={menuItems} ariaLabel={`Ações para ${comp.name}`} />
        </div>
      </div>

      <HealthRollupBar
        operational={rollup.operational}
        warning={rollup.warning}
        critical={rollup.critical}
        offline={rollup.offline}
        topLeftLabel={`Saúde da Operação (${totalEq} ${totalEq === 1 ? 'unidade' : 'unidades'})`}
        topRightLabel={freshnessText}
        onSegmentClick={(kind) => onFastLaneSegment(comp, rollup, kind)}
      />
    </AccentCard>
  );
}

interface MobileOperationsHomeProps {
  companies: CompanyRecord[];
  rollupsByCompany: Record<string, CompanyRollup>;
  urgentUnit: { eq: EquipmentWithLive; companyName: string } | null;
  offlineCount: number;
  onZoomCompany: (companyId: string) => void;
  onDirectJumpEquipment: (
    companyId: string,
    branchId: string,
    equipmentId: string | null,
    statusFilter?: EquipmentStatus
  ) => void;
  onOpenNewCompany: () => void;
}

function MobileOperationsHome({
  companies,
  rollupsByCompany,
  urgentUnit,
  offlineCount,
  onZoomCompany,
  onDirectJumpEquipment,
  onOpenNewCompany,
}: MobileOperationsHomeProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: 'var(--ps-text-primary)',
              lineHeight: 1.15,
            }}
          >
            Empresas Monitoradas
          </h1>
          {offlineCount > 0 && (
            <div style={{ marginTop: 8 }}>
              <StatusPill tone="offline" dot>
                {offlineCount} {offlineCount === 1 ? 'unidade offline' : 'unidades offline'}
              </StatusPill>
            </div>
          )}
        </div>
        <Button
          icon={<PlusOutlined />}
          aria-label="Nova Empresa"
          onClick={onOpenNewCompany}
          style={{ borderRadius: 10, flexShrink: 0 }}
        />
      </div>

      {urgentUnit && (
        <AccentCard
          status={urgentUnit.eq.effectiveStatus === 'critical' ? 'critical' : 'warning'}
          padding="20px"
          gap={12}
          ariaLabel={`Abrir câmara ${urgentUnit.eq.serial}`}
          onClick={() =>
            onDirectJumpEquipment(
              urgentUnit.eq.company_id,
              urgentUnit.eq.branch_id,
              urgentUnit.eq.id
            )
          }
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: urgentUnit.eq.effectiveStatus === 'critical' ? '#b91c1c' : '#b45309',
            }}
          >
            Atenção Imediata
          </span>
          <div>
            <div
              className="ps-mono"
              style={{ fontSize: 18, fontWeight: 700, color: 'var(--ps-text-primary)' }}
            >
              {urgentUnit.eq.serial}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ps-text-secondary)', marginTop: 2 }}>
              {urgentUnit.companyName}
              {urgentUnit.eq.liveDoor === 'open' ? ' · Porta Aberta' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span
              className="ps-tabular"
              style={{
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                color: urgentUnit.eq.effectiveStatus === 'critical' ? '#b91c1c' : '#b45309',
              }}
            >
              {formatTemperature(urgentUnit.eq.liveTemperature)}
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              onDirectJumpEquipment(
                urgentUnit.eq.company_id,
                urgentUnit.eq.branch_id,
                urgentUnit.eq.id
              )
            }
            style={{
              border: 'none',
              background: 'transparent',
              padding: '4px 0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: '#1d4ed8',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              alignSelf: 'flex-start',
            }}
          >
            <span>Abrir câmara</span>
            <ArrowRightOutlined style={{ fontSize: 12 }} />
          </button>
        </AccentCard>
      )}

      <section aria-label="Lista de empresas">
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--ps-text-primary)',
            marginBottom: 10,
          }}
        >
          Empresas ({companies.length})
        </div>
        {companies.length === 0 ? (
          <Card style={{ borderRadius: 16 }}>
            <Empty description="Nenhuma empresa encontrada." />
          </Card>
        ) : (
          <div className="ps-grouped-list">
            {companies.map((comp) => {
              const r = rollupsByCompany[comp.id] || EMPTY_ROLLUP;
              const branchesCount = comp.branches_count ?? 0;
              const totalUnits = r.equipments.length;
              const badgeTone =
                r.critical > 0
                  ? 'critical'
                  : r.warning > 0
                    ? 'warning'
                    : r.offline > 0 && r.operational === 0
                      ? 'offline'
                      : 'operational';
              const badgeLabel =
                r.critical > 0
                  ? `${r.critical} Crítico`
                  : r.warning > 0
                    ? `${r.warning} Atenção`
                    : r.offline > 0 && r.operational === 0
                      ? 'Offline'
                      : 'Normal';
              return (
                <button
                  key={comp.id}
                  type="button"
                  className="ps-grouped-list-row"
                  onClick={() => onZoomCompany(comp.id)}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: 'var(--ps-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {comp.name}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ps-text-secondary)', marginTop: 2 }}>
                      {branchesCount} {branchesCount === 1 ? 'filial' : 'filiais'} · {totalUnits}{' '}
                      {totalUnits === 1 ? 'câmara' : 'câmaras'}
                    </div>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <StatusPill tone={badgeTone}>{badgeLabel}</StatusPill>
                    <RightOutlined style={{ fontSize: 11, color: 'var(--ps-text-muted)' }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Nível 0 (Visão Global — Empresas Monitoradas):
 * Construído inteiramente sobre as primitivas canônicas de UI (`PageHeader`, `StatMiniCard`,
 * `AccentCard`, `HealthRollupBar`, `StatusPill`, `SearchPill`, `RowActionMenu`).
 */
export default function Level0GlobalView({
  companies = [],
  equipments = [],
  onZoomCompany,
  onDirectJumpEquipment,
  onOpenScopedAlerts,
  onMutated,
}: Level0GlobalViewProps) {
  const { message, modal } = AntdApp.useApp();
  const { acquireShortcutLock } = useUiShell();
  const screens = useBreakpoint();
  const isMobilePhone = !screens.md;

  const [statusFilter, setStatusFilter] = useState<CompanyStatusFilter>('active');
  const [healthFilter, setHealthFilter] = useState<CompanyHealthFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyRecord | null>(null);

  const rollupsByCompany = useMemo<Record<string, CompanyRollup>>(() => {
    const map: Record<string, CompanyRollup> = {};
    companies.forEach((c) => {
      map[c.id] = {
        equipments: [],
        operational: 0,
        warning: 0,
        critical: 0,
        offline: 0,
        criticalUnits: [],
        warningUnits: [],
        offlineUnits: [],
        latestUpdate: null,
      };
    });

    equipments.forEach((eq) => {
      let bucket = map[eq.company_id];
      if (!bucket) {
        bucket = {
          equipments: [],
          operational: 0,
          warning: 0,
          critical: 0,
          offline: 0,
          criticalUnits: [],
          warningUnits: [],
          offlineUnits: [],
          latestUpdate: null,
        };
        map[eq.company_id] = bucket;
      }
      bucket.equipments.push(eq);

      const st: EquipmentStatus = eq.effectiveStatus || 'offline';
      bucket[st] += 1;
      if (st === 'critical') bucket.criticalUnits.push(eq);
      if (st === 'warning') bucket.warningUnits.push(eq);
      if (st === 'offline') bucket.offlineUnits.push(eq);

      if (eq.liveLastUpdate) {
        if (!bucket.latestUpdate || new Date(eq.liveLastUpdate) > new Date(bucket.latestUpdate)) {
          bucket.latestUpdate = eq.liveLastUpdate;
        }
      }
    });

    return map;
  }, [companies, equipments]);

  const fleetTotals = useMemo(() => {
    let criticalUnits = 0;
    let inactiveCompanies = 0;
    companies.forEach((c) => {
      if (c.status !== 'active') inactiveCompanies += 1;
    });
    equipments.forEach((eq) => {
      if (eq.effectiveStatus === 'critical') criticalUnits += 1;
    });
    return {
      totalUnits: equipments.length,
      criticalUnits,
      inactiveCompanies,
    };
  }, [companies, equipments]);

  const filteredCompanies = useMemo<CompanyRecord[]>(() => {
    const q = searchText.trim().toLowerCase();
    return companies
      .filter((c) => {
        if (statusFilter !== 'all' && c.status !== statusFilter) return false;
        const r = rollupsByCompany[c.id];
        if (healthFilter === 'critical' && (!r || r.critical === 0)) return false;
        if (q) {
          const hay = `${c.name} ${c.contact_email || ''} ${c.contact_phone || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ra = rollupsByCompany[a.id] || { critical: 0, warning: 0, offline: 0 };
        const rb = rollupsByCompany[b.id] || { critical: 0, warning: 0, offline: 0 };
        if (rb.critical !== ra.critical) return rb.critical - ra.critical;
        if (rb.warning !== ra.warning) return rb.warning - ra.warning;
        if (rb.offline !== ra.offline) return rb.offline - ra.offline;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [companies, rollupsByCompany, statusFilter, healthFilter, searchText]);

  const handleToggleCompanyStatus = (company: CompanyRecord) => {
    const isDeactivating = company.status === 'active';
    confirmWithShortcutLock(
      modal,
      {
        title: isDeactivating ? `Desativar ${company.name}?` : `Reativar ${company.name}?`,
        content: isDeactivating
          ? 'Os operadores vinculados terão o login suspenso imediatamente, preservando 100% do histórico de telemetria e alertas.'
          : 'Restaura o acesso operacional dos usuários ativos vinculados a esta empresa.',
        okText: isDeactivating ? 'Desativar' : 'Reativar',
        okButtonProps: { danger: isDeactivating },
        cancelText: 'Cancelar',
        onOk: async () => {
          try {
            if (isDeactivating) {
              await deactivateCompany(company.id);
              message.success('Empresa desativada com sucesso.');
            } else {
              await updateCompany(company.id, { status: 'active' });
              message.success('Empresa reativada com sucesso.');
            }
            onMutated?.();
          } catch (err) {
            message.error(extractApiError(err, 'Não foi possível alterar o status da empresa.'));
          }
        },
      },
      acquireShortcutLock
    );
  };

  const handleFastLaneSegment = (
    company: CompanyRecord,
    rollup: CompanyRollup,
    kind: EquipmentStatus
  ) => {
    const units =
      kind === 'critical'
        ? rollup.criticalUnits
        : kind === 'warning'
          ? rollup.warningUnits
          : rollup.offlineUnits;
    if (!units || units.length === 0) return;

    const target = units.length === 1 ? units[0] : undefined;
    if (target) {
      onDirectJumpEquipment(company.id, target.branch_id, target.id);
      return;
    }

    if (kind === 'critical' || kind === 'warning') {
      onOpenScopedAlerts({
        companyId: company.id,
        branchId: null,
        equipmentId: null,
        title: `Empresa: ${company.name}`,
      });
      return;
    }

    const uniqueBranchIds = Array.from(new Set(units.map((u) => u.branch_id)));
    if (uniqueBranchIds.length === 1) {
      onDirectJumpEquipment(company.id, uniqueBranchIds[0], null, 'offline');
    } else {
      onZoomCompany(company.id);
    }
  };

  const showFilterToolbar =
    companies.length > 4 || fleetTotals.inactiveCompanies > 0 || Boolean(searchText);

  const urgentUnit = useMemo(() => {
    const companyNameById = new Map(companies.map((c) => [c.id, c.name]));
    const firstCrit = equipments.find((e) => e.effectiveStatus === 'critical');
    const target = firstCrit ?? equipments.find((e) => e.effectiveStatus === 'warning');
    if (!target) return null;
    return { eq: target, companyName: companyNameById.get(target.company_id) || 'Empresa' };
  }, [companies, equipments]);

  const offlineCount = useMemo(
    () => equipments.filter((e) => e.effectiveStatus === 'offline').length,
    [equipments]
  );

  if (isMobilePhone) {
    return (
      <>
        <MobileOperationsHome
          companies={filteredCompanies}
          rollupsByCompany={rollupsByCompany}
          urgentUnit={urgentUnit}
          offlineCount={offlineCount}
          onZoomCompany={onZoomCompany}
          onDirectJumpEquipment={onDirectJumpEquipment}
          onOpenNewCompany={() => {
            setEditingCompany(null);
            setCompanyModalOpen(true);
          }}
        />
        <CompanyFormModal
          open={companyModalOpen}
          company={editingCompany}
          onClose={() => {
            setCompanyModalOpen(false);
            setEditingCompany(null);
          }}
          onSuccess={() => {
            setCompanyModalOpen(false);
            setEditingCompany(null);
            onMutated?.();
          }}
        />
      </>
    );
  }

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <PageHeader
        title="Empresas Monitoradas"
        subtitle="Selecione uma rede ou planta industrial para navegar até suas filiais e câmaras."
        align="center"
        rightSlot={
          <>
            <StatMiniCard
              label="Total Equipamentos"
              value={fleetTotals.totalUnits}
              onClick={() => setHealthFilter('all')}
            />
            <StatMiniCard
              label="Críticos"
              value={fleetTotals.criticalUnits}
              tone="critical"
              selected={healthFilter === 'critical'}
              onClick={() =>
                setHealthFilter((prev) => (prev === 'critical' ? 'all' : 'critical'))
              }
            />
            <Button
              type="default"
              icon={<PlusOutlined />}
              style={{ borderRadius: 10, height: 38 }}
              onClick={() => {
                setEditingCompany(null);
                setCompanyModalOpen(true);
              }}
            >
              Nova Empresa
            </Button>
          </>
        }
      />

      {showFilterToolbar && (
        <div className="ps-toolbar-row">
          <Space wrap size={10}>
            <SearchPill
              value={searchText}
              onChange={setSearchText}
              placeholder="Filtrar empresa..."
              width={250}
            />
            {fleetTotals.inactiveCompanies > 0 && (
              <Segmented<CompanyStatusFilter>
                className="ps-pill-switcher"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'active', label: 'Ativas' },
                  { value: 'inactive', label: 'Inativas' },
                  { value: 'all', label: 'Todas' },
                ]}
              />
            )}
          </Space>
        </div>
      )}

      {healthFilter === 'critical' && (
        <div>
          <Tag
            closable
            color="error"
            onClose={() => setHealthFilter('all')}
            style={{ margin: 0, borderRadius: 999 }}
          >
            Filtrando apenas empresas com unidades críticas
          </Tag>
        </div>
      )}

      {filteredCompanies.length === 0 ? (
        <Card style={{ borderRadius: 14 }}>
          <Empty
            description={
              healthFilter === 'critical'
                ? 'Nenhuma empresa possui unidades críticas no momento.'
                : 'Nenhuma empresa corresponde aos filtros selecionados.'
            }
          >
            {healthFilter !== 'all' && (
              <Button size="small" onClick={() => setHealthFilter('all')}>
                Mostrar todas as empresas
              </Button>
            )}
          </Empty>
        </Card>
      ) : (
        <div className="ps-two-col-grid">
          {filteredCompanies.map((comp) => (
            <CompanyOverviewCard
              key={comp.id}
              comp={comp}
              rollup={rollupsByCompany[comp.id] || EMPTY_ROLLUP}
              onZoomCompany={onZoomCompany}
              onEditCompany={(company) => {
                setEditingCompany(company);
                setCompanyModalOpen(true);
              }}
              onToggleCompanyStatus={handleToggleCompanyStatus}
              onFastLaneSegment={handleFastLaneSegment}
            />
          ))}
        </div>
      )}

      <CompanyFormModal
        open={companyModalOpen}
        company={editingCompany}
        onClose={() => {
          setCompanyModalOpen(false);
          setEditingCompany(null);
        }}
        onSuccess={() => {
          setCompanyModalOpen(false);
          setEditingCompany(null);
          onMutated?.();
        }}
      />
    </Space>
  );
}
