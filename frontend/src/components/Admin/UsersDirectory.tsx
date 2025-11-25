import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  EditOutlined,
  LockOutlined,
  MailOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  deactivateUser,
  getBranches,
  getCompanies,
  getUsers,
  inviteUser,
  resendInvitation,
  updateUser,
  type GetBranchesParams,
  type GetUsersParams,
} from '../../api';
import { useAuth } from '../../context/authContextObject';
import {
  confirmWithShortcutLock,
  useSuspendShortcuts,
  useUiShell,
} from '../../context/uiShellContextObject';
import { SEMANTIC_HEX } from '../../theme/tokens';
import type {
  Branch,
  BranchAccessType,
  Company,
  InviteUserPayload,
  PaginationMeta,
  StatusTone,
  UpdateUserPayload,
  User,
  UserBranchAccessPayload,
  UserRole,
  UserStatus,
} from '../../types/models';
import {
  extractApiError,
  formatDateTimePtBR,
  ROLE_LABELS,
  USER_STATUS_CONFIG,
} from '../../utils/formatters';
import WorkspaceSkeleton from '../Common/WorkspaceSkeleton';
import { PageHeader, RowActionMenu, SearchPill, StatusPill } from '../ui';

interface UserRecord extends User {
  branch_access?: UserBranchAccessPayload | null;
}

interface ExtendedUpdateUserPayload extends UpdateUserPayload {
  email?: string;
}

interface InviteUserFormValues {
  name: string;
  email: string;
  role: UserRole;
  company_id?: string;
  access_type?: BranchAccessType;
  branch_ids?: string[];
}

interface EditUserFormValues {
  name: string;
  email: string;
  role: UserRole;
  status?: UserStatus;
  access_type?: BranchAccessType;
  branch_ids?: string[];
}

function resolveUserStatusTone(status?: UserStatus): StatusTone {
  if (status === 'active') return 'operational';
  if (status === 'pending') return 'warning';
  return 'offline';
}

function resolveRoleTone(role: UserRole): StatusTone {
  if (role === 'global_admin' || role === 'company_admin') return 'brand';
  return 'neutral';
}

interface InviteUserModalFormProps {
  companies?: Company[];
  isGlobalAdmin?: boolean;
  scopedCompanyId?: string | null;
  defaultCompanyId?: string | null;
  preloadedBranches?: Branch[] | null;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}

function InviteUserModalForm({
  companies = [],
  isGlobalAdmin = false,
  scopedCompanyId = null,
  defaultCompanyId = undefined,
  preloadedBranches = null,
  onCancel,
  onSaved,
}: InviteUserModalFormProps) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<InviteUserFormValues>();
  const [saving, setSaving] = useState(false);
  const [fetchedBranches, setFetchedBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  const selectedRole = Form.useWatch('role', form);
  const selectedCompanyId = Form.useWatch('company_id', form);
  const accessType = Form.useWatch('access_type', form);

  const isCompanyLocked = Boolean(scopedCompanyId);
  const effectiveCompanyId = isCompanyLocked
    ? scopedCompanyId
    : isGlobalAdmin
      ? selectedCompanyId
      : defaultCompanyId;

  const hasPreloadedBranches = Array.isArray(preloadedBranches) && isCompanyLocked;
  const availableBranches = hasPreloadedBranches ? preloadedBranches : fetchedBranches;

  useEffect(() => {
    if (hasPreloadedBranches) return undefined;
    let active = true;
    if (!effectiveCompanyId || selectedRole === 'global_admin') {
      return undefined;
    }

    void (async () => {
      setBranchesLoading(true);
      try {
        const res = await getBranches({
          company_id: isGlobalAdmin ? effectiveCompanyId : undefined,
          limit: 100,
        });
        if (active) {
          setFetchedBranches(res?.branches || []);
        }
      } catch {
        if (active) {
          setFetchedBranches([]);
        }
      } finally {
        if (active) {
          setBranchesLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [effectiveCompanyId, hasPreloadedBranches, isGlobalAdmin, selectedRole]);

  const handleFinish = async (values: InviteUserFormValues): Promise<void> => {
    setSaving(true);
    try {
      const payload: InviteUserPayload = {
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        role: values.role,
      };

      if (values.role !== 'global_admin') {
        if (isGlobalAdmin) {
          payload.company_id = isCompanyLocked ? scopedCompanyId : values.company_id;
        }
        if (values.role === 'company_viewer' && values.access_type === 'restricted') {
          payload.branch_access = {
            type: 'restricted',
            branches: values.branch_ids || [],
          };
        } else {
          payload.branch_access = { type: 'full' };
        }
      }

      await inviteUser(payload);
      message.success('Convite enviado com sucesso! O link de ativação é válido por 7 dias.');
      await onSaved();
    } catch (err) {
      message.error(extractApiError(err, 'Não foi possível enviar o convite.'));
    } finally {
      setSaving(false);
    }
  };

  const roleOptions: Array<{ value: UserRole; label: string }> =
    isGlobalAdmin && !isCompanyLocked
      ? [
          { value: 'global_admin', label: 'Administrador Global' },
          { value: 'company_admin', label: 'Administrador da Empresa' },
          { value: 'company_viewer', label: 'Visualizador' },
        ]
      : [
          { value: 'company_admin', label: 'Administrador da Empresa' },
          { value: 'company_viewer', label: 'Visualizador' },
        ];

  return (
    <Form<InviteUserFormValues>
      form={form}
      layout="vertical"
      initialValues={{
        role: 'company_viewer',
        company_id: scopedCompanyId || defaultCompanyId || undefined,
        access_type: 'full',
        branch_ids: [],
      }}
      onFinish={(values) => {
        void handleFinish(values);
      }}
    >
      <Form.Item
        name="name"
        label="Nome Completo"
        rules={[{ required: true, whitespace: true, message: 'Informe o nome completo.' }]}
      >
        <Input placeholder="Ex.: Ana Paula Souza" maxLength={255} />
      </Form.Item>

      <Form.Item
        name="email"
        label="E-mail Corporativo"
        rules={[
          { required: true, message: 'Informe o e-mail.' },
          { type: 'email', message: 'Informe um e-mail válido.' },
        ]}
      >
        <Input placeholder="ana.souza@empresa.com.br" maxLength={255} />
      </Form.Item>

      <Form.Item
        name="role"
        label="Perfil de Permissão"
        rules={[{ required: true, message: 'Selecione o perfil.' }]}
      >
        <Select
          options={roleOptions}
          onChange={() => form.setFieldValue('branch_ids', [])}
        />
      </Form.Item>

      {isGlobalAdmin && !isCompanyLocked && selectedRole !== 'global_admin' && (
        <Form.Item
          name="company_id"
          label="Empresa Vinculada"
          rules={[{ required: true, message: 'Selecione a empresa.' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Selecione uma empresa"
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            onChange={() => form.setFieldValue('branch_ids', [])}
          />
        </Form.Item>
      )}

      {selectedRole === 'company_viewer' && availableBranches.length > 1 && (
        <>
          <Form.Item name="access_type" label="Escopo de Visibilidade de Filiais">
            <Radio.Group>
              <Radio value="full">Acesso Total (Todas as Filiais da Empresa)</Radio>
              <Radio value="restricted">Acesso Restrito (Filiais Específicas)</Radio>
            </Radio.Group>
          </Form.Item>

          {accessType === 'restricted' && (
            <Form.Item
              name="branch_ids"
              label="Filiais Autorizadas"
              rules={[
                {
                  required: true,
                  type: 'array',
                  min: 1,
                  message: 'Selecione ao menos uma filial para acesso restrito.',
                },
              ]}
            >
              <Select
                mode="multiple"
                loading={branchesLoading}
                placeholder="Selecione as filiais permitidas"
                options={availableBranches.map((b) => ({ value: b.id, label: b.name }))}
              />
            </Form.Item>
          )}
        </>
      )}

      <Space style={{ width: '100%', justifyContent: 'flex-end', marginTop: 8 }}>
        <Button onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="primary" htmlType="submit" loading={saving}>
          Enviar Convite
        </Button>
      </Space>
    </Form>
  );
}

interface EditUserModalFormProps {
  targetUser: UserRecord;
  isGlobalAdmin?: boolean;
  isCompanyLocked?: boolean;
  preloadedBranches?: Branch[] | null;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}

function EditUserModalForm({
  targetUser,
  isGlobalAdmin = false,
  isCompanyLocked = false,
  preloadedBranches = null,
  onCancel,
  onSaved,
}: EditUserModalFormProps) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<EditUserFormValues>();
  const [saving, setSaving] = useState(false);
  const [fetchedBranches, setFetchedBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  const selectedRole = Form.useWatch('role', form);
  const accessType = Form.useWatch('access_type', form);

  const hasPreloadedBranches = Array.isArray(preloadedBranches) && isCompanyLocked;
  const availableBranches = hasPreloadedBranches ? preloadedBranches : fetchedBranches;

  useEffect(() => {
    if (hasPreloadedBranches) return undefined;
    let active = true;
    const targetCompanyId = targetUser?.company_id;
    if (!targetCompanyId) return undefined;

    void (async () => {
      setBranchesLoading(true);
      try {
        const res = await getBranches({
          company_id: isGlobalAdmin ? targetCompanyId : undefined,
          limit: 100,
        });
        if (active) {
          setFetchedBranches(res?.branches || []);
        }
      } catch {
        if (active) {
          setFetchedBranches([]);
        }
      } finally {
        if (active) {
          setBranchesLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [targetUser?.company_id, hasPreloadedBranches, isGlobalAdmin]);

  const handleFinish = async (values: EditUserFormValues): Promise<void> => {
    setSaving(true);
    try {
      const payload: ExtendedUpdateUserPayload = {
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        role: values.role,
        status: values.status,
      };

      if (values.role === 'company_viewer') {
        payload.branch_access =
          values.access_type === 'restricted'
            ? { type: 'restricted', branches: values.branch_ids || [] }
            : { type: 'full' };
      } else if (values.role === 'company_admin') {
        payload.branch_access = { type: 'full' };
      }

      await updateUser(targetUser.id, payload);
      message.success('Usuário atualizado com sucesso.');
      await onSaved();
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao atualizar usuário.'));
    } finally {
      setSaving(false);
    }
  };

  const roleOptions: Array<{ value: UserRole; label: string }> =
    isGlobalAdmin && (!isCompanyLocked || targetUser.role === 'global_admin')
      ? [
          { value: 'global_admin', label: 'Administrador Global' },
          { value: 'company_admin', label: 'Administrador da Empresa' },
          { value: 'company_viewer', label: 'Visualizador' },
        ]
      : [
          { value: 'company_admin', label: 'Administrador da Empresa' },
          { value: 'company_viewer', label: 'Visualizador' },
        ];

  return (
    <Form<EditUserFormValues>
      form={form}
      layout="vertical"
      initialValues={{
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        status: targetUser.status,
        access_type: targetUser.branch_access?.type || targetUser.branch_access_type || 'full',
        branch_ids: targetUser.branch_access?.branches || [],
      }}
      onFinish={(values) => {
        void handleFinish(values);
      }}
    >
      <Form.Item
        name="name"
        label="Nome Completo"
        rules={[{ required: true, whitespace: true, message: 'Informe o nome.' }]}
      >
        <Input maxLength={255} />
      </Form.Item>

      <Form.Item
        name="email"
        label="E-mail"
        rules={[
          { required: true, message: 'Informe o e-mail.' },
          { type: 'email', message: 'Informe um e-mail válido.' },
        ]}
      >
        <Input maxLength={255} />
      </Form.Item>

      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item name="role" label="Perfil de Acesso" rules={[{ required: true }]}>
            <Select options={roleOptions} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="status" label="Status da Conta" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'active', label: 'Ativo' },
                { value: 'pending', label: 'Convite Pendente' },
                { value: 'inactive', label: 'Desativado' },
              ]}
            />
          </Form.Item>
        </Col>
      </Row>

      {selectedRole === 'company_viewer' &&
        (availableBranches.length > 1 || accessType === 'restricted') && (
          <>
            <Form.Item name="access_type" label="Escopo de Visibilidade de Filiais">
              <Radio.Group>
                <Radio value="full">Acesso Total</Radio>
                <Radio value="restricted">Acesso Restrito por Filial</Radio>
              </Radio.Group>
            </Form.Item>

            {accessType === 'restricted' && (
              <Form.Item
                name="branch_ids"
                label="Filiais Autorizadas"
                rules={[
                  {
                    required: true,
                    type: 'array',
                    min: 1,
                    message: 'Selecione ao menos uma filial.',
                  },
                ]}
              >
                <Select
                  mode="multiple"
                  loading={branchesLoading}
                  placeholder="Selecione as filiais permitidas"
                  options={availableBranches.map((b) => ({ value: b.id, label: b.name }))}
                />
              </Form.Item>
            )}
          </>
        )}

      <Space style={{ width: '100%', justifyContent: 'flex-end', marginTop: 8 }}>
        <Button onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="primary" htmlType="submit" loading={saving}>
          Salvar Alterações
        </Button>
      </Space>
    </Form>
  );
}

export interface UsersDirectoryProps {
  variant?: 'page' | 'card';
  headerNav?: ReactNode;
  scopedCompanyId?: string | null;
  scopedBranches?: Branch[] | null;
}

interface BuildUsersColumnsOptions {
  isGlobalAdmin: boolean;
  isScoped: boolean;
  showBranchScopeColumn: boolean;
  currentUserId?: string;
  companyNameMap: Record<string, string>;
  branchesMap: Record<string, string>;
  onEdit: (user: UserRecord) => void;
  onResendInvite: (userId: string) => Promise<void>;
  onConfirmDeactivate: (user: UserRecord) => void;
}

function buildUsersColumns({
  isGlobalAdmin,
  isScoped,
  showBranchScopeColumn,
  currentUserId,
  companyNameMap,
  branchesMap,
  onEdit,
  onResendInvite,
  onConfirmDeactivate,
}: BuildUsersColumnsOptions): ColumnsType<UserRecord> {
  return [
    {
      title: 'Usuário',
      key: 'user',
      width: 270,
      ellipsis: true,
      render: (_, r) => {
        const initials = (r.name || 'U')
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase())
          .join('');
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Avatar
              size={30}
              style={{
                backgroundColor: r.role === 'global_admin' ? '#1e293b' : SEMANTIC_HEX.brand,
                fontSize: 12,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {initials}
            </Avatar>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.name}
              </div>
              <Tooltip title={r.email}>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--ps-text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.email}
                </div>
              </Tooltip>
            </div>
          </div>
        );
      },
    },
    ...(isGlobalAdmin && !isScoped
      ? [
          {
            title: 'Empresa',
            dataIndex: 'company_id',
            key: 'company_id',
            render: (cid: string | null | undefined) =>
              cid ? (
                companyNameMap[cid] || cid
              ) : (
                <StatusPill tone="neutral">Plataforma Global</StatusPill>
              ),
          },
        ]
      : []),
    {
      title: 'Perfil',
      dataIndex: 'role',
      key: 'role',
      width: 195,
      render: (role: UserRole) => (
        <StatusPill tone={resolveRoleTone(role)} bordered={role !== 'company_viewer'}>
          {ROLE_LABELS[role] || role}
        </StatusPill>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 145,
      render: (st: UserStatus | undefined) => {
        const cfg = (st ? USER_STATUS_CONFIG[st] : undefined) || { label: st || '—' };
        return (
          <StatusPill tone={resolveUserStatusTone(st)} dot>
            {cfg.label}
          </StatusPill>
        );
      },
    },
    ...(showBranchScopeColumn
      ? [
          {
            title: 'Acesso a Filiais',
            key: 'branch_access',
            render: (_: unknown, r: UserRecord) => {
              if (r.role === 'global_admin') {
                return <StatusPill tone="neutral">Irrestrito (Global)</StatusPill>;
              }
              const accessType = r.branch_access?.type || r.branch_access_type || 'full';
              if (accessType === 'restricted') {
                const branchIds = r.branch_access?.branches || [];
                return (
                  <Space size={[4, 4]} wrap>
                    <StatusPill
                      tone="warning"
                      icon={<LockOutlined style={{ fontSize: 10.5 }} />}
                    >
                      Restrito ({branchIds.length})
                    </StatusPill>
                    {branchIds.map((bid) => (
                      <StatusPill key={bid} tone="neutral">
                        {branchesMap[bid] || bid.slice(0, 8)}
                      </StatusPill>
                    ))}
                  </Space>
                );
              }
              return (
                <StatusPill
                  tone="operational"
                  icon={<UnlockOutlined style={{ fontSize: 10.5 }} />}
                >
                  Todas as Filiais
                </StatusPill>
              );
            },
          },
        ]
      : []),
    {
      title: 'Último Acesso',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      width: 170,
      render: (ts: string | null | undefined) => (
        <span className="ps-tabular">{formatDateTimePtBR(ts)}</span>
      ),
    },
    {
      title: 'Ações',
      key: 'actions',
      width: 64,
      align: 'right',
      render: (_, record) => {
        const isSelf = record.id === currentUserId;
        const menuItems: Parameters<typeof RowActionMenu>[0]['items'] = [
          {
            key: 'edit',
            icon: <EditOutlined />,
            label: 'Editar Usuário',
            onClick: () => onEdit(record),
          },
        ];

        if (record.status === 'pending') {
          menuItems.push({
            key: 'resend',
            icon: <MailOutlined />,
            label: 'Reenviar Convite',
            onClick: () => {
              void onResendInvite(record.id);
            },
          });
        }

        if (record.status !== 'inactive' && !isSelf) {
          menuItems.push(
            { type: 'divider' },
            {
              key: 'deactivate',
              icon: <StopOutlined />,
              danger: true,
              label: 'Desativar Usuário',
              onClick: () => onConfirmDeactivate(record),
            }
          );
        }

        return (
          <RowActionMenu
            ariaLabel={`Ações para ${record.name}`}
            items={menuItems}
          />
        );
      },
    },
  ];
}

interface UsersFiltersBarProps {
  showCompanyFilter: boolean;
  searchQuery: string;
  companyFilter?: string;
  roleFilter?: UserRole;
  statusFilter?: UserStatus;
  companies: Company[];
  onSearchChange: (value: string) => void;
  onCompanyChange: (value: string | undefined) => void;
  onRoleChange: (value: UserRole | undefined) => void;
  onStatusChange: (value: UserStatus | undefined) => void;
}

function UsersFiltersBar({
  showCompanyFilter,
  searchQuery,
  companyFilter,
  roleFilter,
  statusFilter,
  companies,
  onSearchChange,
  onCompanyChange,
  onRoleChange,
  onStatusChange,
}: UsersFiltersBarProps) {
  const filterRoleOptions: Array<{ value: UserRole; label: string }> = showCompanyFilter
    ? [
        { value: 'global_admin', label: 'Administrador Global' },
        { value: 'company_admin', label: 'Administrador da Empresa' },
        { value: 'company_viewer', label: 'Visualizador' },
      ]
    : [
        { value: 'company_admin', label: 'Administrador da Empresa' },
        { value: 'company_viewer', label: 'Visualizador' },
      ];

  const colSpan = showCompanyFilter ? 6 : 8;

  return (
    <Row gutter={[10, 10]} align="middle">
      <Col xs={24} sm={12} lg={colSpan}>
        <SearchPill
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Buscar por nome ou e-mail..."
          width="100%"
        />
      </Col>

      {showCompanyFilter && (
        <Col xs={24} sm={12} lg={6}>
          <Select<string>
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
            placeholder="Filtrar por empresa"
            value={companyFilter}
            onChange={onCompanyChange}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Col>
      )}

      <Col xs={24} sm={12} lg={colSpan}>
        <Select<UserRole>
          allowClear
          style={{ width: '100%' }}
          placeholder="Filtrar por perfil"
          value={roleFilter}
          onChange={onRoleChange}
          options={filterRoleOptions}
        />
      </Col>

      <Col xs={24} sm={12} lg={colSpan}>
        <Select<UserStatus>
          allowClear
          style={{ width: '100%' }}
          placeholder="Filtrar por status"
          value={statusFilter}
          onChange={onStatusChange}
          options={[
            { value: 'active', label: 'Ativo' },
            { value: 'pending', label: 'Convite Pendente' },
            { value: 'inactive', label: 'Desativado' },
          ]}
        />
      </Col>
    </Row>
  );
}

interface UsersDirectoryModalsProps {
  inviteOpen: boolean;
  editingUser: UserRecord | null;
  isScoped: boolean;
  isGlobalAdmin: boolean;
  scopedCompanyId: string | null;
  defaultCompanyId?: string | null;
  companies: Company[];
  branches: Branch[];
  onCloseInvite: () => void;
  onCloseEdit: () => void;
  onSaved: () => Promise<void>;
}

function UsersDirectoryModals({
  inviteOpen,
  editingUser,
  isScoped,
  isGlobalAdmin,
  scopedCompanyId,
  defaultCompanyId,
  companies,
  branches,
  onCloseInvite,
  onCloseEdit,
  onSaved,
}: UsersDirectoryModalsProps) {
  const preloadedBranches = isScoped ? branches : null;

  return (
    <>
      <Modal
        open={inviteOpen}
        onCancel={onCloseInvite}
        footer={null}
        destroyOnHidden
        title={isScoped ? 'Convidar Operador para esta Empresa' : 'Convidar Novo Usuário'}
        width={560}
      >
        {inviteOpen && (
          <InviteUserModalForm
            companies={companies}
            isGlobalAdmin={isGlobalAdmin}
            scopedCompanyId={scopedCompanyId}
            defaultCompanyId={defaultCompanyId}
            preloadedBranches={preloadedBranches}
            onCancel={onCloseInvite}
            onSaved={async () => {
              onCloseInvite();
              await onSaved();
            }}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(editingUser)}
        onCancel={onCloseEdit}
        footer={null}
        destroyOnHidden
        title={branches.length > 1 ? 'Editar Usuário e Acesso a Filiais' : 'Editar Usuário'}
        width={560}
      >
        {editingUser && (
          <EditUserModalForm
            targetUser={editingUser}
            isGlobalAdmin={isGlobalAdmin}
            isCompanyLocked={isScoped}
            preloadedBranches={preloadedBranches}
            onCancel={onCloseEdit}
            onSaved={async () => {
              onCloseEdit();
              await onSaved();
            }}
          />
        )}
      </Modal>
    </>
  );
}

interface UsersDirectoryViewProps {
  variant: 'page' | 'card';
  headerNav: ReactNode;
  branchCount: number;
  loading: boolean;
  hasUsers: boolean;
  visibleUsers: UserRecord[];
  columns: ColumnsType<UserRecord>;
  pagination: PaginationMeta;
  filtersRow: ReactNode;
  modalsNode: ReactNode;
  onRefresh: () => void;
  onOpenInvite: () => void;
  onPageChange: (page: number) => void;
}

function UsersDirectoryView({
  variant,
  headerNav,
  branchCount,
  loading,
  hasUsers,
  visibleUsers,
  columns,
  pagination,
  filtersRow,
  modalsNode,
  onRefresh,
  onOpenInvite,
  onPageChange,
}: UsersDirectoryViewProps) {
  const isInitialLoading = loading && !hasUsers;

  if (variant === 'card') {
    return (
      <Card
        title={
          branchCount > 1
            ? 'Equipe Operacional e Permissões por Filial'
            : 'Equipe Operacional da Empresa'
        }
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined spin={loading} />} onClick={onRefresh}>
              Atualizar
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={onOpenInvite}>
              Convidar Usuário
            </Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 16 }}>{filtersRow}</div>

        {isInitialLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : visibleUsers.length === 0 ? (
          <Empty description="Nenhum usuário encontrado nesta empresa." />
        ) : (
          <Table<UserRecord>
            rowKey="id"
            columns={columns}
            dataSource={visibleUsers}
            scroll={{ x: 940 }}
            pagination={{
              current: pagination.page,
              pageSize: pagination.limit,
              total: pagination.total,
              showSizeChanger: false,
              onChange: onPageChange,
            }}
          />
        )}

        {modalsNode}
      </Card>
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <PageHeader
        title="Usuários e Permissões"
        align="center"
        subtitle="Convite de operadores, controle de perfis de acesso e restrição granular de filiais."
        rightSlot={
          <>
            <Button icon={<ReloadOutlined spin={loading} />} onClick={onRefresh}>
              Atualizar
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={onOpenInvite}>
              Convidar Usuário
            </Button>
          </>
        }
      />

      {headerNav && <div className="ps-toolbar-row">{headerNav}</div>}

      {filtersRow}

      {isInitialLoading ? (
        <WorkspaceSkeleton variant="grid" />
      ) : (
        <Card styles={{ body: { padding: visibleUsers.length === 0 ? 36 : 0 } }}>
          {visibleUsers.length === 0 ? (
            <Empty description="Nenhum usuário encontrado para os filtros aplicados." />
          ) : (
            <Table<UserRecord>
              rowKey="id"
              columns={columns}
              dataSource={visibleUsers}
              scroll={{ x: 1020 }}
              pagination={{
                current: pagination.page,
                pageSize: pagination.limit,
                total: pagination.total,
                showSizeChanger: false,
                style: { padding: '0 16px' },
                onChange: onPageChange,
              }}
            />
          )}
        </Card>
      )}

      {modalsNode}
    </Space>
  );
}

/**
 * Diretório unificado de Usuários e Permissões:
 * - Modo página (`variant="page"`): usado em `/admin` (UsersPage / AdminHubPage)
 * - Modo gaveta (`variant="card"` + `scopedCompanyId`): usado na Gaveta de Configuração da Empresa
 */
export default function UsersDirectory({
  variant = 'page',
  headerNav = null,
  scopedCompanyId = null,
  scopedBranches = null,
}: UsersDirectoryProps) {
  const { message, modal } = AntdApp.useApp();
  const { user: currentUser, isGlobalAdmin } = useAuth();
  const { acquireShortcutLock } = useUiShell();
  const qc = useQueryClient();

  const isScoped = Boolean(scopedCompanyId);

  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string | undefined>(undefined);
  const [roleFilter, setRoleFilter] = useState<UserRole | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<UserStatus | undefined>(undefined);
  const [page, setPage] = useState(1);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);

  useSuspendShortcuts(inviteOpen || Boolean(editingUser));

  const auxiliaryQuery = useQuery<{ branches: Branch[]; companies: Company[] }>({
    queryKey: ['users', 'auxiliary', isGlobalAdmin, isScoped, scopedCompanyId ?? null],
    queryFn: async () => {
      const branchParams: GetBranchesParams = { limit: 100 };
      if (isScoped && isGlobalAdmin && scopedCompanyId) {
        branchParams.company_id = scopedCompanyId;
      }
      const [branchesRes, companiesRes] = await Promise.all([
        getBranches(branchParams),
        isGlobalAdmin && !isScoped ? getCompanies({ limit: 100 }) : Promise.resolve(null),
      ]);
      return {
        branches: branchesRes?.branches || [],
        companies: companiesRes?.companies || [],
      };
    },
    staleTime: 60_000,
  });

  const userParams = useMemo<GetUsersParams>(() => {
    const params: GetUsersParams = { page, limit: 20 };
    if (isGlobalAdmin) {
      if (isScoped && scopedCompanyId) {
        params.company_id = scopedCompanyId;
      } else if (companyFilter) {
        params.company_id = companyFilter;
      }
    }
    if (roleFilter) params.role = roleFilter;
    if (statusFilter) params.status = statusFilter;
    return params;
  }, [page, isGlobalAdmin, isScoped, scopedCompanyId, companyFilter, roleFilter, statusFilter]);

  const usersQuery = useQuery<{ users: UserRecord[]; pagination: PaginationMeta }>({
    queryKey: ['users', 'list', userParams],
    enabled: !isScoped || Boolean(scopedCompanyId),
    queryFn: async () => {
      const res = await getUsers(userParams);
      return {
        users: res?.users || [],
        pagination: res?.pagination || { page: 1, limit: 20, total: 0 },
      };
    },
    placeholderData: keepPreviousData,
  });

  const branches = useMemo(
    () => auxiliaryQuery.data?.branches ?? scopedBranches ?? [],
    [auxiliaryQuery.data, scopedBranches]
  );
  const companies = useMemo(() => auxiliaryQuery.data?.companies ?? [], [auxiliaryQuery.data]);
  const users = useMemo(() => usersQuery.data?.users ?? [], [usersQuery.data]);
  const pagination = usersQuery.data?.pagination ?? { page: 1, limit: 20, total: 0 };
  const loading = usersQuery.isFetching;

  const fetchUsers = async (): Promise<void> => {
    await qc.invalidateQueries({ queryKey: ['users'] });
  };

  const handleResendInvite = async (userId: string): Promise<void> => {
    try {
      await resendInvitation(userId);
      message.success('Convite reenviado por e-mail com sucesso.');
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao reenviar convite.'));
    }
  };

  const handleDeactivateUser = async (userId: string): Promise<void> => {
    try {
      await deactivateUser(userId);
      message.success('Usuário desativado com sucesso.');
      await fetchUsers();
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao desativar usuário.'));
    }
  };

  const handleConfirmDeactivate = (record: UserRecord): void => {
    confirmWithShortcutLock(
      modal,
      {
        title: `Desativar ${record.name}?`,
        content: 'Revoga o acesso imediatamente mantendo o histórico de auditoria.',
        okText: 'Desativar',
        okButtonProps: { danger: true },
        cancelText: 'Cancelar',
        onOk: () => handleDeactivateUser(record.id),
      },
      acquireShortcutLock
    );
  };

  const branchesMap = useMemo<Record<string, string>>(
    () => Object.fromEntries(branches.map((b) => [b.id, b.name])),
    [branches]
  );

  const companyNameMap = useMemo<Record<string, string>>(
    () => Object.fromEntries(companies.map((c) => [c.id, c.name])),
    [companies]
  );

  const visibleUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  const showBranchScopeColumn =
    (!isScoped && isGlobalAdmin) ||
    branches.length > 1 ||
    users.some((u) => (u.branch_access?.type || u.branch_access_type) === 'restricted');

  const columns = buildUsersColumns({
    isGlobalAdmin,
    isScoped,
    showBranchScopeColumn,
    currentUserId: currentUser?.id,
    companyNameMap,
    branchesMap,
    onEdit: setEditingUser,
    onResendInvite: handleResendInvite,
    onConfirmDeactivate: handleConfirmDeactivate,
  });

  const filtersRow = (
    <UsersFiltersBar
      showCompanyFilter={isGlobalAdmin && !isScoped}
      searchQuery={searchQuery}
      companyFilter={companyFilter}
      roleFilter={roleFilter}
      statusFilter={statusFilter}
      companies={companies}
      onSearchChange={setSearchQuery}
      onCompanyChange={(val) => {
        setCompanyFilter(val);
        setPage(1);
      }}
      onRoleChange={(val) => {
        setRoleFilter(val);
        setPage(1);
      }}
      onStatusChange={(val) => {
        setStatusFilter(val);
        setPage(1);
      }}
    />
  );

  const modalsNode = (
    <UsersDirectoryModals
      inviteOpen={inviteOpen}
      editingUser={editingUser}
      isScoped={isScoped}
      isGlobalAdmin={isGlobalAdmin}
      scopedCompanyId={scopedCompanyId}
      defaultCompanyId={companyFilter || currentUser?.company_id}
      companies={companies}
      branches={branches}
      onCloseInvite={() => setInviteOpen(false)}
      onCloseEdit={() => setEditingUser(null)}
      onSaved={fetchUsers}
    />
  );

  return (
    <UsersDirectoryView
      variant={variant}
      headerNav={headerNav}
      branchCount={branches.length}
      loading={loading}
      hasUsers={users.length > 0}
      visibleUsers={visibleUsers}
      columns={columns}
      pagination={pagination}
      filtersRow={filtersRow}
      modalsNode={modalsNode}
      onRefresh={() => {
        void fetchUsers();
      }}
      onOpenInvite={() => setInviteOpen(true)}
      onPageChange={setPage}
    />
  );
}
