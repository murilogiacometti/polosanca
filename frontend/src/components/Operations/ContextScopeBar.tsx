import { type CSSProperties, type ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';
import { BankOutlined, LockOutlined, RightOutlined } from '@ant-design/icons';
import { Alert, Button, Select, Tag, Tooltip } from 'antd';
import { useSuspendShortcuts, useUiShell } from '../../context/uiShellContextObject';
import type { Branch, Company, Equipment } from '../../types/models';

export interface ContextScopeBarProps {
  isGlobalAdmin?: boolean;
  isRestrictedViewer?: boolean;
  hideBranchTier?: boolean;
  permittedBranchCount?: number | null;
  totalCompanyBranchCount?: number | null;
  companies?: Company[];
  currentCompany?: Company | null;
  branches?: Branch[];
  currentBranch?: Branch | null;
  equipments?: Equipment[];
  currentEquipment?: Equipment | null;
  rightSlotNode?: ReactNode;
  isRefreshing?: boolean;
  isUnstable?: boolean;
  onZoomRoot?: () => void;
  onSelectCompany: (companyId: string) => void;
  onSelectBranch: (branchId: string | null) => void;
  onSelectEquipment: (equipmentId: string | null) => void;
  onManualRefresh?: () => void;
}

const ACTIVE_PILL_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 11px',
  borderRadius: 8,
  border: '1px solid rgba(59, 130, 246, 0.25)',
  background: 'rgba(59, 130, 246, 0.1)',
  color: '#1d4ed8',
  fontWeight: 600,
  fontSize: 12.5,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const ANCESTOR_BTN_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  borderRadius: 7,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--ps-text-secondary)',
  fontWeight: 500,
  fontSize: 12.5,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const CHEVRON_STYLE: CSSProperties = {
  fontSize: 9.5,
  color: 'var(--ps-text-secondary)',
  opacity: 0.65,
  flexShrink: 0,
};

function computeZoomDepth(
  currentCompany: Company | null | undefined,
  currentBranch: Branch | null | undefined,
  currentEquipment: Equipment | null | undefined,
  hideBranchTier: boolean
): number {
  if (currentEquipment) return 3;
  if (currentBranch && !hideBranchTier) return 2;
  if (currentCompany) return 1;
  return 0;
}

interface CompanyCrumbProps {
  currentCompany: Company;
  isGlobalAdmin: boolean;
  zoomDepth: number;
  onSelectCompany: (companyId: string) => void;
}

function CompanyCrumb({
  currentCompany,
  isGlobalAdmin,
  zoomDepth,
  onSelectCompany,
}: CompanyCrumbProps) {
  return (
    <>
      {isGlobalAdmin && <RightOutlined style={CHEVRON_STYLE} />}
      {zoomDepth === 1 ? (
        <button
          type="button"
          onClick={() => onSelectCompany(currentCompany.id)}
          style={{
            ...ACTIVE_PILL_STYLE,
            maxWidth: 240,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {!isGlobalAdmin && <BankOutlined style={{ fontSize: 13 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentCompany.name}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onSelectCompany(currentCompany.id)}
          style={{
            ...ANCESTOR_BTN_STYLE,
            maxWidth: 210,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: 'var(--ps-text-primary)',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentCompany.name}
          </span>
        </button>
      )}
    </>
  );
}

interface BranchCrumbProps {
  currentBranch: Branch;
  branches: Branch[];
  zoomDepth: number;
  onSelectBranch: (branchId: string | null) => void;
  onOpenChange: (open: boolean) => void;
}

function BranchCrumb({
  currentBranch,
  branches,
  zoomDepth,
  onSelectBranch,
  onOpenChange,
}: BranchCrumbProps) {
  return (
    <>
      <RightOutlined style={CHEVRON_STYLE} />
      {zoomDepth === 2 && branches.length > 1 ? (
        <Select<string>
          size="small"
          aria-label="Selecionar filial"
          className="ps-scope-select"
          showSearch={branches.length > 5}
          optionFilterProp="label"
          popupMatchSelectWidth={false}
          value={currentBranch.id}
          onOpenChange={onOpenChange}
          onChange={(val) => onSelectBranch(val || null)}
          style={{ minWidth: 145, maxWidth: 210 }}
          options={branches.map((b) => ({
            value: b.id,
            label: b.name,
          }))}
        />
      ) : (
        <button
          type="button"
          onClick={() => onSelectBranch(currentBranch.id)}
          style={
            zoomDepth === 2
              ? { ...ACTIVE_PILL_STYLE, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }
              : {
                  ...ANCESTOR_BTN_STYLE,
                  color: 'var(--ps-text-primary)',
                  maxWidth: 180,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }
          }
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentBranch.name}
          </span>
        </button>
      )}
    </>
  );
}

interface EquipmentCrumbProps {
  currentEquipment: Equipment;
  equipments: Equipment[];
  onSelectEquipment: (equipmentId: string | null) => void;
  onOpenChange: (open: boolean) => void;
}

function EquipmentCrumb({
  currentEquipment,
  equipments,
  onSelectEquipment,
  onOpenChange,
}: EquipmentCrumbProps) {
  return (
    <>
      <RightOutlined style={CHEVRON_STYLE} />
      {equipments.length > 1 ? (
        <Select<string>
          size="small"
          aria-label="Selecionar equipamento"
          className="ps-scope-select"
          showSearch={equipments.length > 5}
          optionFilterProp="label"
          popupMatchSelectWidth={false}
          value={currentEquipment.id}
          onOpenChange={onOpenChange}
          onChange={(val) => onSelectEquipment(val || null)}
          style={{ minWidth: 165, maxWidth: 215 }}
          options={equipments.map((eq) => ({
            value: eq.id,
            label: eq.serial,
          }))}
        />
      ) : (
        <span className="ps-mono" style={ACTIVE_PILL_STYLE}>
          {currentEquipment.serial}
        </span>
      )}
    </>
  );
}

interface RestrictedScopeTagProps {
  permittedBranchCount: number;
  totalCompanyBranchCount?: number | null;
}

function RestrictedScopeTag({
  permittedBranchCount,
  totalCompanyBranchCount,
}: RestrictedScopeTagProps) {
  return (
    <Tooltip title="Sua conta visualiza intencionalmente apenas as filiais atribuídas pelo administrador da empresa.">
      <Tag
        icon={<LockOutlined />}
        color="orange"
        style={{ margin: 0, borderRadius: 999, fontSize: 11, flexShrink: 0 }}
      >
        {totalCompanyBranchCount
          ? `Restrito: ${permittedBranchCount}/${totalCompanyBranchCount}`
          : `Restrito (${permittedBranchCount})`}
      </Tag>
    </Tooltip>
  );
}

interface ScopeBreadcrumbTrailProps {
  isGlobalAdmin?: boolean;
  isRestrictedViewer?: boolean;
  hideBranchTier?: boolean;
  permittedBranchCount?: number | null;
  totalCompanyBranchCount?: number | null;
  companies?: Company[];
  currentCompany?: Company | null;
  branches?: Branch[];
  currentBranch?: Branch | null;
  equipments?: Equipment[];
  currentEquipment?: Equipment | null;
  zoomDepth: number;
  onZoomRoot?: () => void;
  onSelectCompany: (companyId: string) => void;
  onSelectBranch: (branchId: string | null) => void;
  onSelectEquipment: (equipmentId: string | null) => void;
  onBranchSelectOpenChange: (open: boolean) => void;
  onEqSelectOpenChange: (open: boolean) => void;
}

function ScopeBreadcrumbTrail({
  isGlobalAdmin,
  isRestrictedViewer,
  hideBranchTier,
  permittedBranchCount,
  totalCompanyBranchCount,
  companies,
  currentCompany,
  branches,
  currentBranch,
  equipments,
  currentEquipment,
  zoomDepth,
  onZoomRoot,
  onSelectCompany,
  onSelectBranch,
  onSelectEquipment,
  onBranchSelectOpenChange,
  onEqSelectOpenChange,
}: ScopeBreadcrumbTrailProps) {
  const companyCount = companies ? companies.length : 0;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {/* Nível 0: Raiz Empresas (Global Admin) */}
      {isGlobalAdmin && (
        <button
          type="button"
          className={zoomDepth > 0 ? 'ps-scope-crumb-ancestor' : undefined}
          onClick={onZoomRoot}
          style={zoomDepth === 0 ? ACTIVE_PILL_STYLE : ANCESTOR_BTN_STYLE}
        >
          <BankOutlined style={{ fontSize: 13 }} />
          <span>Empresas</span>
          {companyCount > 0 && (
            <span className="ps-tabular" style={{ fontSize: 11.5 }}>
              ({companyCount})
            </span>
          )}
        </button>
      )}

      {/* Nível 1: Empresa Atual (exibido apenas quando uma empresa está aberta) */}
      {currentCompany && (
        <span
          className={zoomDepth > 1 ? 'ps-scope-crumb-ancestor' : undefined}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}
        >
          <CompanyCrumb
            currentCompany={currentCompany}
            isGlobalAdmin={Boolean(isGlobalAdmin)}
            zoomDepth={zoomDepth}
            onSelectCompany={onSelectCompany}
          />
        </span>
      )}

      {/* Nível 2: Filial Atual (exibido quando uma filial está aberta em empresa multi-filial) */}
      {!hideBranchTier && currentCompany && currentBranch && (
        <span
          className={zoomDepth > 2 ? 'ps-scope-crumb-ancestor' : undefined}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}
        >
          <BranchCrumb
            currentBranch={currentBranch}
            branches={branches ?? []}
            zoomDepth={zoomDepth}
            onSelectBranch={onSelectBranch}
            onOpenChange={onBranchSelectOpenChange}
          />
        </span>
      )}

      {/* Nível 3: Equipamento Atual (exibido apenas na tela de detalhe do equipamento) */}
      {currentEquipment && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <EquipmentCrumb
            currentEquipment={currentEquipment}
            equipments={equipments ?? []}
            onSelectEquipment={onSelectEquipment}
            onOpenChange={onEqSelectOpenChange}
          />
        </span>
      )}

      {/* Escopo restrito por filial */}
      {isRestrictedViewer && typeof permittedBranchCount === 'number' && (
        <RestrictedScopeTag
          permittedBranchCount={permittedBranchCount}
          totalCompanyBranchCount={totalCompanyBranchCount}
        />
      )}
    </div>
  );
}

/**
 * Barra de Escopo Semântico Enxuta:
 * Exibe apenas os nós ativos da trilha atual (sem seletores vazios prematuros)
 * e projeta a pílula de conectividade (Ao vivo / Parcialmente Offline / Sem Conexão)
 * no slot direito da barra superior.
 */
export default function ContextScopeBar(props: ContextScopeBarProps) {
  const { topBarLeftNode, topBarRightNode } = useUiShell();
  const [branchSelectOpen, setBranchSelectOpen] = useState(false);
  const [eqSelectOpen, setEqSelectOpen] = useState(false);

  const hideBranchTier = Boolean(props.hideBranchTier);
  const branchCount = props.branches ? props.branches.length : 0;
  const equipmentCount = props.equipments ? props.equipments.length : 0;
  const zoomDepth = computeZoomDepth(
    props.currentCompany,
    props.currentBranch,
    props.currentEquipment,
    hideBranchTier
  );

  const hasBranchSelect =
    !hideBranchTier && Boolean(props.currentCompany && props.currentBranch) && zoomDepth === 2 && branchCount > 1;
  const hasEqSelect = Boolean(props.currentEquipment) && equipmentCount > 1;

  useSuspendShortcuts((hasBranchSelect && branchSelectOpen) || (hasEqSelect && eqSelectOpen));

  const breadcrumbTrail = (
    <ScopeBreadcrumbTrail
      isGlobalAdmin={props.isGlobalAdmin}
      isRestrictedViewer={props.isRestrictedViewer}
      hideBranchTier={props.hideBranchTier}
      permittedBranchCount={props.permittedBranchCount}
      totalCompanyBranchCount={props.totalCompanyBranchCount}
      companies={props.companies}
      currentCompany={props.currentCompany}
      branches={props.branches}
      currentBranch={props.currentBranch}
      equipments={props.equipments}
      currentEquipment={props.currentEquipment}
      zoomDepth={zoomDepth}
      onZoomRoot={props.onZoomRoot}
      onSelectCompany={props.onSelectCompany}
      onSelectBranch={props.onSelectBranch}
      onSelectEquipment={props.onSelectEquipment}
      onBranchSelectOpenChange={setBranchSelectOpen}
      onEqSelectOpenChange={setEqSelectOpen}
    />
  );

  const rightSlotNode = props.rightSlotNode ?? null;

  return (
    <>
      {topBarLeftNode ? createPortal(breadcrumbTrail, topBarLeftNode) : null}
      {topBarRightNode && rightSlotNode ? createPortal(rightSlotNode, topBarRightNode) : null}

      {!topBarLeftNode && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'nowrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            paddingBottom: 6,
          }}
        >
          {breadcrumbTrail}
          {rightSlotNode}
        </div>
      )}

      {props.isUnstable && (
        <Alert
          type="warning"
          showIcon
          banner
          style={{ borderRadius: 10 }}
          message="Conexão com servidor instável"
          description="Duas ou mais sincronizações consecutivas falharam (ou o navegador está offline). Os valores exibidos refletem a última leitura confirmada."
          action={
            <Button size="small" onClick={props.onManualRefresh} loading={Boolean(props.isRefreshing)}>
              Tentar agora
            </Button>
          }
        />
      )}
    </>
  );
}
