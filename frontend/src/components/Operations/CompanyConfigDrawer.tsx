import { useState } from 'react';
import {
  ControlOutlined,
  EditOutlined,
  EnvironmentOutlined,
  PlusOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Drawer, Segmented, Space, Typography } from 'antd';
import { useSuspendShortcuts } from '../../context/uiShellContextObject';
import type { Branch, Company } from '../../types/models';
import BranchFormModal from '../Modals/BranchFormModal';
import CompanyRulesPanel from './CompanyRulesPanel';
import CompanySettingsPanel from './CompanySettingsPanel';
import CompanyUsersPanel from './CompanyUsersPanel';

const { Text } = Typography;

export type CompanyConfigSection = 'settings' | 'users' | 'rules';

interface BranchRecord extends Branch {
  manager_contact?: string | null;
}

export interface CompanyConfigDrawerProps {
  open: boolean;
  onClose: () => void;
  company?: Company | null;
  branches?: Branch[];
  isGlobalAdmin?: boolean;
  activeSection?: string;
  onSectionChange?: (section: CompanyConfigSection) => void;
  onMutated?: () => void;
}

interface BranchExpansionCardProps {
  branches: Branch[];
  isSingleSite: boolean;
  singleBranch: BranchRecord | null;
  onAddBranch: () => void;
  onEditBranch: (branch: Branch) => void;
}

function BranchExpansionCard({
  branches,
  isSingleSite,
  singleBranch,
  onAddBranch,
  onEditBranch,
}: BranchExpansionCardProps) {
  return (
    <Card
      size="small"
      title={
        <Space size={6}>
          <EnvironmentOutlined style={{ color: '#2563eb' }} />
          <span>
            {isSingleSite
              ? 'Estrutura Operacional (Unidade Única)'
              : `Filiais Cadastradas (${branches.length})`}
          </span>
        </Space>
      }
      extra={
        <Button
          size="small"
          type={isSingleSite ? 'default' : 'primary'}
          icon={<PlusOutlined />}
          onClick={onAddBranch}
        >
          {isSingleSite ? 'Adicionar 2ª Filial' : 'Nova Filial'}
        </Button>
      }
    >
      {isSingleSite && singleBranch ? (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="Modo Simplificado (Unidade Única Ativo)"
            description="Como esta empresa possui apenas 1 unidade operacional, os seletores intermediários de filial ficam ocultos automaticamente para simplificar o uso diário. Caso a empresa inaugure uma nova loja ou CD, clique em 'Adicionar 2ª Filial' acima — todos os equipamentos atuais permanecerão vinculados à unidade principal."
          />
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              borderRadius: 8,
              background: 'var(--ps-chip-bg)',
              border: '1px solid var(--ps-border)',
            }}
          >
            <div>
              <Text strong style={{ fontSize: 13 }}>
                {singleBranch.name}
              </Text>
              <div style={{ fontSize: 12, color: 'var(--ps-text-secondary)' }}>
                {singleBranch.address || 'Endereço não informado'}
                {singleBranch.manager_contact ? ` • Resp.: ${singleBranch.manager_contact}` : ''}
              </div>
            </div>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEditBranch(singleBranch)}
            >
              Editar Endereço / Responsável
            </Button>
          </div>
        </Space>
      ) : (
        <Text type="secondary" style={{ fontSize: 12.5 }}>
          Esta empresa opera com <strong className="ps-tabular">{branches.length}</strong>{' '}
          unidades. Use o botão acima para cadastrar uma nova filial ou gerencie cada loja diretamente nos cartões da visão da empresa.
        </Text>
      )}
    </Card>
  );
}

interface CompanyConfigSectionBodyProps {
  section: CompanyConfigSection;
  company?: Company | null;
  branches: Branch[];
  isSingleSite: boolean;
  singleBranch: BranchRecord | null;
  onAddBranch: () => void;
  onEditBranch: (branch: Branch) => void;
  onMutated?: () => void;
}

function CompanyConfigSectionBody({
  section,
  company,
  branches,
  isSingleSite,
  singleBranch,
  onAddBranch,
  onEditBranch,
  onMutated,
}: CompanyConfigSectionBodyProps) {
  if (section === 'users') {
    return <CompanyUsersPanel companyId={company?.id} branches={branches} />;
  }
  if (section === 'rules') {
    return <CompanyRulesPanel companyId={company?.id} companyName={company?.name} />;
  }
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {/* Bloco de Expansão Progressiva de Filiais */}
      <BranchExpansionCard
        branches={branches}
        isSingleSite={isSingleSite}
        singleBranch={singleBranch}
        onAddBranch={onAddBranch}
        onEditBranch={onEditBranch}
      />

      <CompanySettingsPanel company={company} onCompanyUpdated={() => onMutated?.()} />
    </Space>
  );
}

/**
 * Gaveta Unificada de Configuração da Empresa:
 * Funciona de forma idêntica para empresas de unidade única (aberta direto do grid de câmaras)
 * e redes multi-filial (aberta no Nível 1), permitindo adicionar novas filiais sob demanda.
 */
export default function CompanyConfigDrawer({
  open,
  onClose,
  company,
  branches = [],
  isGlobalAdmin = false,
  activeSection = 'settings',
  onSectionChange,
  onMutated,
}: CompanyConfigDrawerProps) {
  useSuspendShortcuts(Boolean(open));

  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const isSingleSite = branches.length === 1;
  const singleBranch: BranchRecord | null = isSingleSite ? (branches[0] ?? null) : null;
  const safeSection: CompanyConfigSection =
    activeSection === 'users' || activeSection === 'rules' ? activeSection : 'settings';

  const handleAddBranch = (): void => {
    setEditingBranch(null);
    setBranchModalOpen(true);
  };

  const handleEditBranch = (branch: Branch): void => {
    setEditingBranch(branch);
    setBranchModalOpen(true);
  };

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={820}
        destroyOnHidden
        title={
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              Configurar Empresa — {company?.name || 'Empresa'}
            </div>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
              {isSingleSite
                ? 'Operação em unidade única • Expanda para múltiplas filiais a qualquer momento'
                : 'Dados cadastrais, equipe vinculada e limites operacionais desta empresa'}
            </Text>
          </div>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Segmented<CompanyConfigSection>
            className="ps-pill-switcher"
            value={safeSection}
            onChange={(next) => onSectionChange?.(next)}
            options={[
              {
                value: 'settings',
                icon: <SettingOutlined />,
                label: 'Dados & Unidades',
              },
              {
                value: 'users',
                icon: <TeamOutlined />,
                label: 'Equipe da Empresa',
              },
              {
                value: 'rules',
                icon: <ControlOutlined />,
                label: 'Limites da Empresa',
              },
            ]}
          />

          <div key={safeSection} className="ps-view-enter">
            <CompanyConfigSectionBody
              section={safeSection}
              company={company}
              branches={branches}
              isSingleSite={isSingleSite}
              singleBranch={singleBranch}
              onAddBranch={handleAddBranch}
              onEditBranch={handleEditBranch}
              onMutated={onMutated}
            />
          </div>
        </Space>
      </Drawer>

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
    </>
  );
}
