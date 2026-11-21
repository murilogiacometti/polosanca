import { useMemo, useState } from 'react';
import {
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { App as AntdApp, Button, Card, Empty, Space } from 'antd';
import { deleteBranch } from '../../api';
import BranchFormModal from '../../components/Modals/BranchFormModal';
import {
  AccentCard,
  HealthRollupBar,
  PageHeader,
  RowActionMenu,
  SparklineMini,
} from '../../components/ui';
import type { RowActionMenuItem } from '../../components/ui/RowActionMenu';
import { confirmWithShortcutLock, useUiShell } from '../../context/uiShellContextObject';
import type { Branch, Company, EquipmentStatus, EquipmentWithLive } from '../../types/models';
import { extractApiError, formatTemperature } from '../../utils/formatters';

type BranchRecord = Branch & {
  manager_contact?: string | null;
};

interface BranchRollup {
  equipments: EquipmentWithLive[];
  operational: number;
  warning: number;
  critical: number;
  offline: number;
  criticalUnits: EquipmentWithLive[];
  warningUnits: EquipmentWithLive[];
  offlineUnits: EquipmentWithLive[];
  representativeUnit: EquipmentWithLive | null;
}

export interface Level1CompanyViewProps {
  company: Company | null;
  branches?: BranchRecord[];
  equipments?: EquipmentWithLive[];
  isGlobalAdmin?: boolean;
  canWriteOperations?: boolean;
  onZoomRoot?: () => void;
  onOpenCompanyConfig?: () => void;
  onZoomBranch: (branchId: string, statusQuery?: EquipmentStatus) => void;
  onDirectJumpEquipment: (
    targetCompanyId?: string | null,
    targetBranchId?: string | null,
    targetEquipmentId?: string | null,
    statusFilter?: EquipmentStatus
  ) => void;
  onMutated?: () => void;
}

/**
 * Nível 1 (Visão da Empresa — Filiais):
 * Construído com `PageHeader`, `AccentCard`, `HealthRollupBar`, `SparklineMini` e `RowActionMenu`.
 */
export default function Level1CompanyView({
  company,
  branches = [],
  equipments = [],
  isGlobalAdmin = false,
  canWriteOperations = false,
  onZoomRoot,
  onOpenCompanyConfig,
  onZoomBranch,
  onDirectJumpEquipment,
  onMutated,
}: Level1CompanyViewProps) {
  const { message, modal } = AntdApp.useApp();
  const { acquireShortcutLock } = useUiShell();

  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchRecord | null>(null);

  const branchRollups = useMemo<Record<string, BranchRollup>>(() => {
    const map: Record<string, BranchRollup> = {};
    branches.forEach((b) => {
      map[b.id] = {
        equipments: [],
        operational: 0,
        warning: 0,
        critical: 0,
        offline: 0,
        criticalUnits: [],
        warningUnits: [],
        offlineUnits: [],
        representativeUnit: null,
      };
    });

    const score = (u: EquipmentWithLive | null): number => {
      if (!u) return -1;
      if (u.effectiveStatus === 'critical') return 5;
      if (u.effectiveStatus === 'warning') return 4;
      if (u.effectiveStatus === 'operational' && u.sparkline24h?.length > 0) return 3;
      if (u.sparkline24h?.length > 0) return 2;
      return 1;
    };

    equipments.forEach((eq) => {
      let bucket = map[eq.branch_id];
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
          representativeUnit: null,
        };
        map[eq.branch_id] = bucket;
      }
      bucket.equipments.push(eq);

      const st: EquipmentStatus = eq.effectiveStatus || 'offline';
      bucket[st] += 1;
      if (st === 'critical') bucket.criticalUnits.push(eq);
      if (st === 'warning') bucket.warningUnits.push(eq);
      if (st === 'offline') bucket.offlineUnits.push(eq);

      const prevRep = bucket.representativeUnit;
      if (score(eq) > score(prevRep)) {
        bucket.representativeUnit = eq;
      }
    });

    return map;
  }, [branches, equipments]);

  const sortedBranches = useMemo<BranchRecord[]>(() => {
    return [...branches].sort((a, b) => {
      const ra = branchRollups[a.id] || { critical: 0, warning: 0, offline: 0 };
      const rb = branchRollups[b.id] || { critical: 0, warning: 0, offline: 0 };
      if (rb.critical !== ra.critical) return rb.critical - ra.critical;
      if (rb.warning !== ra.warning) return rb.warning - ra.warning;
      if (rb.offline !== ra.offline) return rb.offline - ra.offline;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [branches, branchRollups]);

  const handleDeleteBranch = (branch: BranchRecord) => {
    confirmWithShortcutLock(
      modal,
      {
        title: `Excluir filial "${branch.name}"?`,
        content:
          'Filiais que ainda possuem equipamentos cadastrados não podem ser excluídas até que os equipamentos sejam transferidos ou desativados.',
        okText: 'Excluir Filial',
        okButtonProps: { danger: true },
        cancelText: 'Cancelar',
        onOk: async () => {
          try {
            await deleteBranch(branch.id);
            message.success('Filial excluída com sucesso.');
            onMutated?.();
          } catch (err) {
            message.error(
              extractApiError(
                err,
                'Não foi possível excluir a filial (verifique se há equipamentos vinculados).'
              )
            );
          }
        },
      },
      acquireShortcutLock
    );
  };

  const handleBranchFastLane = (
    branch: BranchRecord,
    rollup: BranchRollup,
    statusKey: EquipmentStatus
  ) => {
    const units =
      statusKey === 'critical'
        ? rollup.criticalUnits
        : statusKey === 'warning'
          ? rollup.warningUnits
          : rollup.offlineUnits;
    if (!units || units.length === 0) return;
    const soleUnit = units.length === 1 ? units[0] : undefined;
    if (soleUnit) {
      onDirectJumpEquipment(company?.id || branch.company_id, branch.id, soleUnit.id);
    } else {
      onZoomBranch(branch.id, statusKey);
    }
  };

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <PageHeader
        backLabel={isGlobalAdmin ? 'Voltar para Empresas' : null}
        onBack={isGlobalAdmin ? onZoomRoot : null}
        title={company?.name || 'Visão da Empresa'}
        subtitle={`${branches.length} ${
          branches.length === 1
            ? 'unidade operacional monitorada'
            : 'unidades operacionais monitoradas'
        }`}
        rightSlot={
          canWriteOperations ? (
            <>
              {onOpenCompanyConfig && (
                <Button
                  icon={<SettingOutlined />}
                  style={{ borderRadius: 10 }}
                  onClick={onOpenCompanyConfig}
                >
                  Configurar
                </Button>
              )}
              <Button
                type="primary"
                icon={<PlusOutlined />}
                style={{ borderRadius: 10 }}
                onClick={() => {
                  setEditingBranch(null);
                  setBranchModalOpen(true);
                }}
              >
                Nova Filial
              </Button>
            </>
          ) : null
        }
      />

      {sortedBranches.length === 0 ? (
        <Card style={{ borderRadius: 14 }}>
          <Empty description="Nenhuma filial disponível no seu escopo para esta empresa." />
        </Card>
      ) : (
        <div className="ps-two-col-grid">
          {sortedBranches.map((branch) => {
            const r: BranchRollup = branchRollups[branch.id] || {
              equipments: [],
              operational: 0,
              warning: 0,
              critical: 0,
              offline: 0,
              criticalUnits: [],
              warningUnits: [],
              offlineUnits: [],
              representativeUnit: null,
            };

            const totalEq = r.equipments.length;
            const hasCritical = r.critical > 0;
            const hasWarning = r.warning > 0;
            const allOffline = totalEq > 0 && r.offline === totalEq;
            const rep = r.representativeUnit;

            const cardStatus: EquipmentStatus = hasCritical
              ? 'critical'
              : hasWarning
                ? 'warning'
                : totalEq > 0 && !allOffline
                  ? 'operational'
                  : 'offline';

            const eqCountLabel = `${totalEq} ${totalEq === 1 ? 'equipamento' : 'equipamentos'}`;
            const metaSubtitle = branch.manager_contact
              ? `Resp.: ${branch.manager_contact} · ${eqCountLabel}`
              : branch.address
                ? `${branch.address} · ${eqCountLabel}`
                : eqCountLabel;

            const branchMenuItems: RowActionMenuItem[] = canWriteOperations
              ? [
                  {
                    key: 'edit',
                    icon: <EditOutlined />,
                    label: 'Editar Filial',
                    onClick: () => {
                      setEditingBranch(branch);
                      setBranchModalOpen(true);
                    },
                  },
                  {
                    key: 'delete',
                    icon: <DeleteOutlined />,
                    danger: true,
                    label: 'Excluir Filial',
                    onClick: () => handleDeleteBranch(branch),
                  },
                ]
              : [];

            const repSt: EquipmentStatus = rep?.effectiveStatus || 'offline';
            const repTempColor =
              repSt === 'critical'
                ? '#dc2626'
                : repSt === 'warning'
                  ? '#d97706'
                  : repSt === 'offline'
                    ? 'var(--ps-text-secondary)'
                    : 'var(--ps-text-primary)';

            return (
              <AccentCard
                key={branch.id}
                status={cardStatus}
                gap={16}
                onClick={() => onZoomBranch(branch.id)}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <EnvironmentOutlined style={{ color: '#2563eb', fontSize: 15 }} />
                      <button
                        type="button"
                        onClick={() => onZoomBranch(branch.id)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          padding: 0,
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: 16.5,
                          fontWeight: 700,
                          color: 'var(--ps-text-primary)',
                          lineHeight: 1.25,
                        }}
                      >
                        {branch.name}
                      </button>
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: 'var(--ps-text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {metaSubtitle}
                    </div>
                  </div>

                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--ps-border)',
                        background: 'var(--ps-subtle-surface)',
                        color: 'var(--ps-text-primary)',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      Abrir <span style={{ fontSize: 11, opacity: 0.75 }}>↗</span>
                    </span>

                    <RowActionMenu
                      items={branchMenuItems}
                      ariaLabel={`Opções da filial ${branch.name}`}
                    />
                  </div>
                </div>

                <HealthRollupBar
                  operational={r.operational}
                  warning={r.warning}
                  critical={r.critical}
                  offline={r.offline}
                  onSegmentClick={(kind) => handleBranchFastLane(branch, r, kind)}
                />

                {rep && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDirectJumpEquipment(company?.id || branch.company_id, branch.id, rep.id);
                    }}
                    style={{
                      marginTop: 'auto',
                      width: '100%',
                      textAlign: 'left',
                      padding: '11px 14px 10px',
                      borderRadius: 10,
                      background: 'var(--ps-subtle-surface)',
                      border: '1px solid var(--ps-subtle-divider)',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: 11.5, color: 'var(--ps-text-secondary)' }}>
                        Destaque:{' '}
                        <strong
                          className="ps-mono"
                          style={{ color: 'var(--ps-text-primary)', fontWeight: 700 }}
                        >
                          {rep.serial}
                        </strong>
                      </span>

                      <span
                        className="ps-tabular"
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: repTempColor,
                        }}
                      >
                        {formatTemperature(rep.liveTemperature)}
                      </span>
                    </div>

                    <SparklineMini
                      points={rep.sparkline24h}
                      status={repSt}
                      threshold={rep.threshold}
                      showHeader={false}
                      withTopBorder={false}
                      height={32}
                    />
                  </button>
                )}
              </AccentCard>
            );
          })}
        </div>
      )}

      <BranchFormModal
        open={branchModalOpen}
        branch={editingBranch}
        isGlobalAdmin={isGlobalAdmin}
        defaultCompanyId={company?.id}
        lockCompany
        onClose={() => {
          setBranchModalOpen(false);
          setEditingBranch(null);
        }}
        onSuccess={() => {
          setBranchModalOpen(false);
          setEditingBranch(null);
          onMutated?.();
        }}
      />
    </Space>
  );
}
