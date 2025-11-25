import { useState } from 'react';
import {
  App as AntdApp,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd';
import { createAlertRule, updateAlertRule } from '../../api';
import { StatusPill } from '../ui';
import type {
  AlertRule,
  AlertScope,
  AlertSeverity,
  AlertType,
  Company,
  ComparisonOperator,
  CreateAlertRulePayload,
  Equipment,
  UpdateAlertRulePayload,
} from '../../types/models';
import {
  ALERT_TYPE_LABELS,
  ALERT_TYPE_OPTIONS,
  COMPARISON_OPERATOR_OPTIONS,
  extractApiError,
  formatDurationSeconds,
} from '../../utils/formatters';

const { Text } = Typography;
const { TextArea } = Input;

const NON_NUMERIC_TYPES = new Set<AlertType>(['door_open', 'equipment_offline']);

const DURATION_PRESETS: Array<{ label: string; value: number }> = [
  { label: 'Imediato (0s)', value: 0 },
  { label: '5 min', value: 300 },
  { label: '15 min', value: 900 },
  { label: '30 min', value: 1800 },
  { label: '1 hora', value: 3600 },
];

const TEMPLATE_TOKENS = ['{serial}', '{rule_type}', '{value}', '{threshold}'];

export interface AlertRuleRecord extends AlertRule {
  scope_id?: string | null;
  message_template?: string | null;
}

interface AlertRuleCreateRequest extends CreateAlertRulePayload {
  scope_id?: string | null;
  message_template?: string;
}

interface AlertRuleUpdateRequest extends UpdateAlertRulePayload {
  message_template?: string;
}

interface AlertRuleFormValues {
  name: string;
  description?: string;
  rule_type: AlertType;
  scope: AlertScope;
  scope_id?: string;
  comparison_operator?: ComparisonOperator;
  threshold_value?: number | null;
  duration_seconds: number;
  severity: AlertSeverity;
  message_template?: string;
  is_active: boolean;
}

export interface AlertRuleModalFormProps {
  rule?: AlertRuleRecord | null;
  companies?: Company[];
  equipments?: Equipment[];
  defaultScope?: AlertScope;
  defaultScopeId?: string;
  lockScope?: boolean;
  allowedScopes?: AlertScope[];
  fixedCompanyId?: string;
  companyName?: string;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}

function buildSamplePreview(params: {
  watchedTemplate?: string;
  activeRuleType?: AlertType;
  isNonNumeric: boolean;
  watchedDuration?: number;
  watchedThreshold?: number | null;
}): string {
  const { watchedTemplate, activeRuleType, isNonNumeric, watchedDuration, watchedThreshold } =
    params;
  const ruleTypeLabel = activeRuleType
    ? ALERT_TYPE_LABELS[activeRuleType] || activeRuleType
    : 'temperatura';
  const formattedValue = isNonNumeric
    ? formatDurationSeconds(watchedDuration ?? 300)
    : `${watchedThreshold ?? 8} ${activeRuleType?.startsWith('pressure') ? 'kPa' : '°C'}`;

  return (watchedTemplate || '{serial}: violação de {rule_type} ({value})')
    .replace(/\{serial\}/g, 'CAM-CENTRO-001')
    .replace(/\{rule_type\}/g, ruleTypeLabel)
    .replace(/\{value\}/g, formattedValue)
    .replace(/\{threshold\}/g, String(watchedThreshold ?? '—'));
}

function buildInitialFormValues(
  rule: AlertRuleRecord | null,
  defaultScope: AlertScope,
  defaultScopeId?: string,
  fixedCompanyId?: string
): AlertRuleFormValues {
  if (!rule) {
    return {
      name: '',
      description: '',
      rule_type: 'temperature_high',
      scope: defaultScope,
      scope_id: defaultScope === 'company' && fixedCompanyId ? fixedCompanyId : defaultScopeId,
      comparison_operator: '>',
      threshold_value: 8,
      duration_seconds: 300,
      severity: 'critical',
      message_template: '{serial}: violação de {rule_type} ({value})',
      is_active: true,
    };
  }
  return {
    name: rule.name || '',
    description: rule.description || '',
    rule_type: rule.rule_type || 'temperature_high',
    scope: rule.scope || defaultScope,
    scope_id: rule.scope_id || rule.equipment_id || defaultScopeId,
    comparison_operator: rule.comparison_operator || '>',
    threshold_value: rule.threshold_value ?? 8,
    duration_seconds: rule.duration_seconds ?? 300,
    severity: rule.severity || 'critical',
    message_template: rule.message_template || '{serial}: violação de {rule_type} ({value})',
    is_active: rule.is_active ?? true,
  };
}

function buildUpdatePayload(
  values: AlertRuleFormValues,
  isNonNumeric: boolean
): AlertRuleUpdateRequest {
  const patchPayload: AlertRuleUpdateRequest = {
    name: values.name.trim(),
    description: values.description?.trim() || null,
    duration_seconds: Number(values.duration_seconds),
    severity: values.severity,
    message_template: values.message_template?.trim() || '{serial} acionou {rule_type}',
    is_active: Boolean(values.is_active),
  };
  if (!isNonNumeric) {
    patchPayload.threshold_value = Number(values.threshold_value);
    patchPayload.comparison_operator = values.comparison_operator ?? null;
  }
  return patchPayload;
}

function resolveCreateScopeId(params: {
  effectiveScope: AlertScope;
  lockScope: boolean;
  defaultScopeId?: string;
  fixedCompanyId?: string;
  formScopeId?: string;
}): string | null {
  const { effectiveScope, lockScope, defaultScopeId, fixedCompanyId, formScopeId } = params;
  if (effectiveScope === 'global') return null;
  if (lockScope) return defaultScopeId ?? null;
  if (effectiveScope === 'company' && fixedCompanyId) return fixedCompanyId;
  return formScopeId ?? null;
}

function buildCreatePayload(params: {
  values: AlertRuleFormValues;
  isNonNumeric: boolean;
  lockScope: boolean;
  defaultScope: AlertScope;
  defaultScopeId?: string;
  fixedCompanyId?: string;
}): AlertRuleCreateRequest {
  const { values, isNonNumeric, lockScope, defaultScope, defaultScopeId, fixedCompanyId } = params;
  const effectiveScope: AlertScope = lockScope ? defaultScope : values.scope;
  const effectiveScopeId = resolveCreateScopeId({
    effectiveScope,
    lockScope,
    defaultScopeId,
    fixedCompanyId,
    formScopeId: values.scope_id,
  });

  return {
    name: values.name.trim(),
    description: values.description?.trim() || null,
    rule_type: values.rule_type,
    scope: effectiveScope,
    scope_id: effectiveScopeId,
    duration_seconds: Number(values.duration_seconds),
    severity: values.severity,
    message_template: values.message_template?.trim() || '{serial} acionou {rule_type}',
    is_active: Boolean(values.is_active),
    threshold_value: isNonNumeric ? null : Number(values.threshold_value),
    comparison_operator: isNonNumeric ? null : (values.comparison_operator ?? null),
  };
}

function ScopeFieldsSection({
  isEdit,
  watchedScope,
  companies,
  equipments,
  allowedScopes,
  fixedCompanyId,
  companyName,
  onScopeChange,
}: {
  isEdit: boolean;
  watchedScope?: AlertScope;
  companies: Company[];
  equipments: Equipment[];
  allowedScopes?: AlertScope[];
  fixedCompanyId?: string;
  companyName?: string;
  onScopeChange: () => void;
}) {
  const allScopeOptions: Array<{ value: AlertScope; label: string }> = [
    { value: 'global', label: 'Global (Padrão da Plataforma)' },
    {
      value: 'company',
      label: fixedCompanyId
        ? `Empresa: ${companyName || 'Empresa Atual'} (Prioridade 2)`
        : 'Empresa Específica',
    },
    {
      value: 'equipment',
      label: fixedCompanyId
        ? 'Equipamento Específico (Prioridade 1)'
        : 'Equipamento Específico',
    },
  ];
  const scopeOptions =
    !isEdit && allowedScopes && allowedScopes.length > 0
      ? allScopeOptions.filter((opt) => allowedScopes.includes(opt.value))
      : allScopeOptions;

  const showCompanySelect = watchedScope === 'company' && !fixedCompanyId;
  const showEquipmentSelect = watchedScope === 'equipment';
  const showTargetSelect = showCompanySelect || showEquipmentSelect;

  return (
    <Row gutter={12}>
      <Col xs={24} sm={showTargetSelect ? 10 : 24}>
        <Form.Item name="scope" label="Escopo de Aplicação" rules={[{ required: true }]}>
          <Select disabled={isEdit} onChange={onScopeChange} options={scopeOptions} />
        </Form.Item>
      </Col>

      {showCompanySelect && (
        <Col xs={24} sm={14}>
          <Form.Item
            name="scope_id"
            label="Empresa Alvo"
            rules={[{ required: true, message: 'Selecione a empresa.' }]}
          >
            <Select
              disabled={isEdit}
              showSearch
              optionFilterProp="label"
              placeholder="Selecione a empresa"
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
        </Col>
      )}

      {showEquipmentSelect && (
        <Col xs={24} sm={14}>
          <Form.Item
            name="scope_id"
            label={fixedCompanyId ? 'Equipamento desta Empresa' : 'Equipamento Alvo'}
            rules={[{ required: true, message: 'Selecione o equipamento.' }]}
          >
            <Select
              disabled={isEdit}
              showSearch
              optionFilterProp="label"
              placeholder="Selecione a câmara/equipamento"
              options={equipments.map((eq) => ({
                value: eq.id,
                label: `${eq.serial} (${eq.branch_name || 'Filial'})`,
              }))}
            />
          </Form.Item>
        </Col>
      )}
    </Row>
  );
}

function ThresholdFieldsSection({ activeRuleType }: { activeRuleType?: AlertType }) {
  return (
    <Row gutter={12}>
      <Col xs={24} sm={12}>
        <Form.Item
          name="comparison_operator"
          label="Operador"
          rules={[{ required: true, message: 'Selecione o operador.' }]}
        >
          <Select
            options={COMPARISON_OPERATOR_OPTIONS.map(({ value, label }) => ({
              value,
              label: `${value} (${label})`,
            }))}
          />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item
          name="threshold_value"
          label={
            activeRuleType?.startsWith('temperature') ? 'Valor Limite (°C)' : 'Valor Limite (kPa)'
          }
          rules={[{ required: true, message: 'Informe o valor limite.' }]}
        >
          <InputNumber step={0.5} style={{ width: '100%' }} />
        </Form.Item>
      </Col>
    </Row>
  );
}

function TemplatePreviewSection({
  samplePreview,
  onAppendToken,
}: {
  samplePreview: string;
  onAppendToken: (token: string) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Space size={[6, 6]} wrap style={{ marginBottom: 6 }}>
        <Text type="secondary" style={{ fontSize: 11.5 }}>
          Inserir variável:
        </Text>
        {TEMPLATE_TOKENS.map((tok) => (
          <StatusPill key={tok} tone="neutral" onClick={() => onAppendToken(tok)}>
            <span className="ps-mono">+ {tok}</span>
          </StatusPill>
        ))}
      </Space>
      <div
        style={{
          fontSize: 12,
          padding: '6px 10px',
          borderRadius: 8,
          background: 'var(--ps-chip-bg)',
          border: '1px solid var(--ps-border)',
          color: 'var(--ps-text-secondary)',
        }}
      >
        Prévia: <strong style={{ color: 'var(--ps-text-primary)' }}>{samplePreview}</strong>
      </div>
    </div>
  );
}

export default function AlertRuleModalForm({
  rule = null,
  companies = [],
  equipments = [],
  defaultScope = 'global',
  defaultScopeId = undefined,
  lockScope = false,
  allowedScopes = undefined,
  fixedCompanyId = undefined,
  companyName = undefined,
  onCancel,
  onSaved,
}: AlertRuleModalFormProps) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<AlertRuleFormValues>();
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(rule);
  const watchedRuleType = Form.useWatch('rule_type', form);
  const watchedScope = Form.useWatch('scope', form);
  const watchedDuration = Form.useWatch('duration_seconds', form);
  const watchedThreshold = Form.useWatch('threshold_value', form);
  const watchedTemplate = Form.useWatch('message_template', form);

  const activeRuleType: AlertType | undefined = isEdit && rule ? rule.rule_type : watchedRuleType;
  const isNonNumeric = Boolean(activeRuleType && NON_NUMERIC_TYPES.has(activeRuleType));

  const samplePreview = buildSamplePreview({
    watchedTemplate,
    activeRuleType,
    isNonNumeric,
    watchedDuration,
    watchedThreshold,
  });

  const handleAppendToken = (token: string) => {
    const rawCurr: unknown = form.getFieldValue('message_template');
    const curr = typeof rawCurr === 'string' ? rawCurr : '';
    form.setFieldsValue({
      message_template: curr ? `${curr} ${token}` : token,
    });
  };

  const handleFinish = async (values: AlertRuleFormValues) => {
    setSaving(true);
    try {
      if (isEdit && rule) {
        await updateAlertRule(rule.id, buildUpdatePayload(values, isNonNumeric));
        message.success('Regra de alerta atualizada com sucesso.');
      } else {
        await createAlertRule(
          buildCreatePayload({
            values,
            isNonNumeric,
            lockScope,
            defaultScope,
            defaultScopeId,
            fixedCompanyId,
          })
        );
        message.success('Regra de alerta criada com sucesso.');
      }
      await onSaved();
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao salvar regra de alerta.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form<AlertRuleFormValues>
      form={form}
      layout="vertical"
      initialValues={buildInitialFormValues(rule, defaultScope, defaultScopeId, fixedCompanyId)}
      onFinish={(values) => {
        void handleFinish(values);
      }}
    >
      <Form.Item
        name="name"
        label="Nome da Regra"
        rules={[{ required: true, whitespace: true, message: 'Informe o nome da regra.' }]}
      >
        <Input placeholder="Ex.: Limite Crítico Câmara Congelados" maxLength={255} />
      </Form.Item>

      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item
            name="rule_type"
            label="Tipo de Monitoramento"
            rules={[{ required: true }]}
          >
            <Select disabled={isEdit} options={ALERT_TYPE_OPTIONS} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="severity" label="Severidade" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'critical', label: 'Crítico' },
                { value: 'warning', label: 'Atenção' },
              ]}
            />
          </Form.Item>
        </Col>
      </Row>

      {!lockScope && (
        <ScopeFieldsSection
          isEdit={isEdit}
          watchedScope={watchedScope}
          companies={companies}
          equipments={equipments}
          allowedScopes={allowedScopes}
          fixedCompanyId={fixedCompanyId}
          companyName={companyName}
          onScopeChange={() => form.setFieldValue('scope_id', undefined)}
        />
      )}

      {!isNonNumeric && <ThresholdFieldsSection activeRuleType={activeRuleType} />}

      <Row gutter={12} align="middle">
        <Col xs={24} sm={15}>
          <Form.Item
            name="duration_seconds"
            label="Persistência Mínima (Segundos)"
            rules={[{ required: true, message: 'Informe a persistência.' }]}
            style={{ marginBottom: 8 }}
          >
            <InputNumber min={0} step={30} style={{ width: '100%' }} />
          </Form.Item>
          <Space size={[4, 4]} wrap style={{ marginBottom: 14 }}>
            {DURATION_PRESETS.map((preset) => (
              <StatusPill
                key={preset.value}
                tone={watchedDuration === preset.value ? 'brand' : 'neutral'}
                bordered={watchedDuration === preset.value}
                onClick={() => form.setFieldsValue({ duration_seconds: preset.value })}
              >
                {preset.label}
              </StatusPill>
            ))}
          </Space>
        </Col>
        <Col xs={24} sm={9}>
          <Form.Item name="is_active" label="Regra Ativa" valuePropName="checked">
            <Switch checkedChildren="Ativa" unCheckedChildren="Inativa" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="description" label="Descrição Operacional (Opcional)">
        <Input placeholder="Orientação interna sobre o objetivo desta regra" />
      </Form.Item>

      <Form.Item name="message_template" label="Modelo de Mensagem" style={{ marginBottom: 8 }}>
        <TextArea
          rows={2}
          placeholder="Variáveis suportadas: {serial}, {rule_type}, {value}, {threshold}"
        />
      </Form.Item>

      <TemplatePreviewSection samplePreview={samplePreview} onAppendToken={handleAppendToken} />

      <Space style={{ width: '100%', justifyContent: 'flex-end', marginTop: 8 }}>
        <Button onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="primary" htmlType="submit" loading={saving}>
          {isEdit ? 'Salvar Regra' : 'Criar Regra'}
        </Button>
      </Space>
    </Form>
  );
}
