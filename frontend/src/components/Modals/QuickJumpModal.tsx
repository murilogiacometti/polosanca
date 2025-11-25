import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertOutlined,
  ApartmentOutlined,
  AuditOutlined,
  BankOutlined,
  ControlOutlined,
  EnterOutlined,
  EnvironmentOutlined,
  HddOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Empty, Input, type InputRef, Modal, Spin, Tag, Typography } from 'antd';
import {
  getBranches,
  getCompanies,
  getEquipments,
  getRealtimeTelemetry,
} from '../../api';
import { useAuth } from '../../context/authContextObject';
import { useSuspendShortcuts } from '../../context/uiShellContextObject';
import type {
  Branch,
  Company,
  Equipment,
  EquipmentStatus,
  RealtimeSnapshot,
} from '../../types/models';
import {
  EQUIPMENT_STATUS_CONFIG,
  EQUIPMENT_TYPE_LABELS,
  formatTemperature,
} from '../../utils/formatters';

const { Text } = Typography;

type JumpItemKind = 'company' | 'branch' | 'equipment' | 'page';

interface JumpCompany extends Company {
  equipment_count?: number;
}

interface JumpEquipment extends Equipment {
  manufacturer?: string | null;
}

interface JumpResultItem {
  id: string;
  kind: JumpItemKind;
  title: string;
  subtitle: string;
  path: string;
  icon: ReactNode;
  status?: EquipmentStatus;
  temperature?: number | null;
}

// Disciplina cromática: pílulas de escopo neutras; cores vivas apenas no status da câmara
const KIND_BADGE: Record<JumpItemKind, { label: string }> = {
  company: { label: 'Empresa' },
  branch: { label: 'Filial' },
  equipment: { label: 'Câmara' },
  page: { label: 'Tela' },
};

export interface QuickJumpModalProps {
  open: boolean;
  onClose: () => void;
  isGlobalAdmin?: boolean;
}

/**
 * Paleta de Busca Rápida Hierárquica (⌘K / Ctrl+K ou tecla "/"):
 * Permite saltar em 1 tecla diretamente para qualquer nível do Zoom Semântico:
 * Empresa (Nível 1) -> Filial (Nível 2) -> Equipamento (Nível 3), populando toda a trilha acima.
 */
export default function QuickJumpModal({
  open,
  onClose,
  isGlobalAdmin = false,
}: QuickJumpModalProps) {
  useSuspendShortcuts(Boolean(open));

  const navigate = useNavigate();
  const { canWriteOperations } = useAuth();
  const inputRef = useRef<InputRef>(null);

  const [query, setQuery] = useState('');
  const [companies, setCompanies] = useState<JumpCompany[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [equipments, setEquipments] = useState<JumpEquipment[]>([]);
  const [realtimeMap, setRealtimeMap] = useState<Record<string, RealtimeSnapshot>>({});
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const loadJumpDirectory = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [eqRes, brRes, rtRes, compRes] = await Promise.all([
        getEquipments({ limit: 100 }),
        getBranches({ limit: 100 }),
        getRealtimeTelemetry(),
        isGlobalAdmin ? getCompanies({ limit: 100 }) : Promise.resolve(null),
      ]);
      setEquipments(eqRes?.equipment || []);
      setBranches(brRes?.branches || []);
      if (compRes) {
        setCompanies(compRes?.companies || []);
      }
      const map: Record<string, RealtimeSnapshot> = {};
      (rtRes?.equipment || []).forEach((snap) => {
        map[snap.equipment_id] = snap;
      });
      setRealtimeMap(map);
    } catch {
      // Mantém diretórios carregados anteriormente se houver oscilação momentânea
    } finally {
      setLoading(false);
    }
  }, [isGlobalAdmin]);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    void (async () => {
      if (active) {
        await loadJumpDirectory();
      }
    })();
    const focusTimer = setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => {
      active = false;
      clearTimeout(focusTimer);
    };
  }, [open, loadJumpDirectory]);

  const companyNameMap = useMemo<Record<string, string>>(
    () => Object.fromEntries(companies.map((c) => [c.id, c.name])),
    [companies]
  );

  const branchNameMap = useMemo<Record<string, string>>(
    () => Object.fromEntries(branches.map((b) => [b.id, b.name])),
    [branches]
  );

  const branchCountByCompany = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    companies.forEach((c) => {
      if (typeof c.branches_count === 'number') {
        counts[c.id] = c.branches_count;
      }
    });
    const countedFromBranches: Record<string, number> = {};
    branches.forEach((b) => {
      if (b.company_id) {
        countedFromBranches[b.company_id] = (countedFromBranches[b.company_id] || 0) + 1;
      }
    });
    Object.entries(countedFromBranches).forEach(([cid, cnt]) => {
      counts[cid] = Math.max(counts[cid] || 0, cnt);
    });
    return counts;
  }, [companies, branches]);

  const navItems = useMemo<JumpResultItem[]>(() => {
    const pages: JumpResultItem[] = [
      {
        id: 'nav-operacao',
        kind: 'page',
        title: 'Monitoramento',
        subtitle: 'Visão operacional ao vivo de câmaras frias e telemetria',
        path: '/operacao',
        icon: <ApartmentOutlined />,
      },
      {
        id: 'nav-alerts',
        kind: 'page',
        title: 'Alertas — Ocorrências',
        subtitle: 'Reconhecimento rápido e triagem de incidentes ativos',
        path: '/alerts',
        icon: <AlertOutlined />,
      },
    ];
    if (canWriteOperations) {
      pages.push(
        {
          id: 'nav-rules',
          kind: 'page',
          title: 'Alertas — Regras e Limites',
          subtitle: 'Configuração de faixas de temperatura, pressão e degelo',
          path: '/alerts?tab=rules',
          icon: <ControlOutlined />,
        },
        {
          id: 'nav-users',
          kind: 'page',
          title: 'Administração — Usuários',
          subtitle: 'Convites, perfis de acesso e permissões da equipe',
          path: '/admin?tab=users',
          icon: <TeamOutlined />,
        }
      );
    }
    if (isGlobalAdmin) {
      pages.push({
        id: 'nav-audit',
        kind: 'page',
        title: 'Administração — Trilha de Auditoria',
        subtitle: 'Histórico imutável de ações administrativas',
        path: '/admin?tab=audit',
        icon: <AuditOutlined />,
      });
    }
    return pages;
  }, [canWriteOperations, isGlobalAdmin]);

  const combinedResults = useMemo<JumpResultItem[]>(() => {
    const q = query.trim().toLowerCase();

    const companyResults: JumpResultItem[] = isGlobalAdmin
      ? companies
          .filter((c) => {
            if (!q) return true;
            return `${c.name} ${c.contact_email || ''}`.toLowerCase().includes(q);
          })
          .slice(0, q ? 6 : 3)
          .map((c) => ({
            id: `comp-${c.id}`,
            kind: 'company',
            title: c.name,
            subtitle: `${
              c.branches_count === 1 ? 'Unidade única' : `${c.branches_count ?? 0} filiais`
            } • ${c.equipment_count ?? c.equipments_count ?? 0} equipamentos`,
            path: `/operacao/empresas/${c.id}`,
            icon: <BankOutlined />,
          }))
      : [];

    const branchResults: JumpResultItem[] = branches
      .filter((b) => {
        const companyBranchCount = branchCountByCompany[b.company_id] ?? branches.length;
        if (companyBranchCount <= 1) return false;
        if (!q) return true;
        const compName = companyNameMap[b.company_id] || '';
        return `${b.name} ${b.address || ''} ${compName}`.toLowerCase().includes(q);
      })
      .slice(0, q ? 8 : 4)
      .map((b) => ({
        id: `br-${b.id}`,
        kind: 'branch',
        title: b.name,
        subtitle:
          [companyNameMap[b.company_id], b.address].filter(Boolean).join(' • ') ||
          'Filial operacional',
        path: `/operacao/empresas/${b.company_id}/filiais/${b.id}`,
        icon: <EnvironmentOutlined />,
      }));

    const eqResults: JumpResultItem[] = equipments
      .filter((eq) => {
        if (!q) return true;
        const compName = companyNameMap[eq.company_id] || '';
        const bName = eq.branch_name || branchNameMap[eq.branch_id] || '';
        const hay = `${eq.serial} ${eq.id} ${bName} ${compName} ${
          EQUIPMENT_TYPE_LABELS[eq.type] || eq.type
        } ${eq.manufacturer || ''} ${eq.model || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12)
      .map((eq) => {
        const snap = realtimeMap[eq.id];
        const status: EquipmentStatus = snap?.status || eq.status || 'offline';
        const temp = snap !== undefined ? snap.temperature : eq.current_data?.temperature;
        const companyBranchCount = branchCountByCompany[eq.company_id] ?? branches.length;
        const rawBranchName = eq.branch_name || branchNameMap[eq.branch_id];
        const bName =
          companyBranchCount <= 1 && (!rawBranchName || rawBranchName === 'Unidade Principal')
            ? null
            : rawBranchName || 'Filial';
        const cName = companyNameMap[eq.company_id];
        return {
          id: `eq-${eq.id}`,
          kind: 'equipment',
          title: eq.serial,
          subtitle: [
            EQUIPMENT_TYPE_LABELS[eq.type] || eq.type,
            cName,
            bName,
          ]
            .filter(Boolean)
            .join(' • '),
          status,
          temperature: temp,
          path: `/operacao/empresas/${eq.company_id}/filiais/${eq.branch_id}/equipamentos/${eq.id}`,
          icon: <HddOutlined />,
        };
      });

    const filteredPages = navItems.filter((p) => {
      if (!q) return true;
      return `${p.title} ${p.subtitle}`.toLowerCase().includes(q);
    });

    return [...companyResults, ...branchResults, ...eqResults, ...filteredPages];
  }, [
    query,
    isGlobalAdmin,
    companies,
    branches,
    equipments,
    realtimeMap,
    companyNameMap,
    branchNameMap,
    branchCountByCompany,
    navItems,
  ]);

  const safeIndex =
    combinedResults.length === 0
      ? 0
      : Math.min(activeIndex, combinedResults.length - 1);

  const handleSelect = (item: JumpResultItem | undefined): void => {
    if (!item) return;
    setQuery('');
    setActiveIndex(0);
    onClose();
    void navigate(item.path);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (combinedResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % combinedResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(
        (prev) => (prev - 1 + combinedResults.length) % combinedResults.length
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(combinedResults[safeIndex]);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => {
        setQuery('');
        setActiveIndex(0);
        onClose();
      }}
      footer={null}
      closable={false}
      width={620}
      styles={{ body: { padding: 0 } }}
      destroyOnHidden
    >
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--ps-border)' }}>
        <Input
          ref={inputRef}
          size="large"
          variant="borderless"
          prefix={<SearchOutlined style={{ color: 'var(--ps-text-secondary)', fontSize: 18 }} />}
          suffix={
            <span
              style={{
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid var(--ps-border)',
                background: 'var(--ps-kbd-bg)',
                color: 'var(--ps-text-secondary)',
              }}
            >
              ESC
            </span>
          }
          placeholder="Ir para empresa, filial, câmara fria (ex.: CAM-CENTRO-002) ou tela..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          style={{ padding: '2px 4px', fontSize: 15 }}
        />
      </div>

      <div style={{ maxHeight: 410, overflowY: 'auto', padding: 8 }}>
        {loading && equipments.length === 0 && branches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 28 }}>
            <Spin />
          </div>
        ) : combinedResults.length === 0 ? (
          <div style={{ padding: 24 }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Nenhuma empresa, filial, equipamento ou tela corresponde à busca."
            />
          </div>
        ) : (
          combinedResults.map((item, idx) => {
            const isSelected = idx === safeIndex;
            const stCfg = item.status
              ? EQUIPMENT_STATUS_CONFIG[item.status] || EQUIPMENT_STATUS_CONFIG.offline
              : null;
            const kindCfg = KIND_BADGE[item.kind] || KIND_BADGE.page;

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={-1}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => handleSelect(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '9px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: isSelected ? 'var(--ps-hover-row)' : 'transparent',
                  border: isSelected
                    ? '1px solid var(--ps-border)'
                    : '1px solid transparent',
                  transition: 'background 0.12s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--ps-chip-bg)',
                      border: '1px solid var(--ps-chip-border)',
                      color: 'var(--ps-text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span
                        className={item.kind === 'equipment' ? 'ps-mono' : undefined}
                        style={{ fontWeight: 600, fontSize: 13.5 }}
                      >
                        {item.title}
                      </span>
                      <span className="ps-neutral-pill">{kindCfg.label}</span>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.subtitle}
                    </Text>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {item.kind === 'equipment' && (
                    <>
                      <span
                        className="ps-tabular"
                        style={{ fontWeight: 700, fontSize: 13 }}
                      >
                        {formatTemperature(item.temperature)}
                      </span>
                      {stCfg && (
                        <Tag color={stCfg.color} style={{ margin: 0 }}>
                          {stCfg.label}
                        </Tag>
                      )}
                    </>
                  )}
                  {isSelected && (
                    <EnterOutlined style={{ color: 'var(--ps-text-secondary)', fontSize: 12 }} />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div
        style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--ps-border)',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11.5,
          color: 'var(--ps-text-secondary)',
        }}
      >
        <span>↑↓ navegar • Enter para saltar direto ao nível</span>
        <span>Atalhos: ⌘K, /, Esc (subir), J/K (irmãos)</span>
      </div>
    </Modal>
  );
}
