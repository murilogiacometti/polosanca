import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { App as AntdApp } from 'antd';
import { deleteAlertRule, getAlertRuleStatistics, updateAlertRule } from '../../api';
import {
  confirmWithShortcutLock,
  useSuspendShortcuts,
  useUiShell,
} from '../../context/uiShellContextObject';
import type { AlertRule, AlertRuleStatistics } from '../../types/models';
import { extractApiError } from '../../utils/formatters';

export function useAlertRuleManagement() {
  const { message, modal } = AntdApp.useApp();
  const { acquireShortcutLock } = useUiShell();
  const qc = useQueryClient();

  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [statsRule, setStatsRule] = useState<AlertRule | null>(null);
  const [ruleStats, setRuleStats] = useState<AlertRuleStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useSuspendShortcuts(ruleModalOpen || Boolean(statsRule));

  const refreshRules = async (): Promise<void> => {
    await qc.invalidateQueries({ queryKey: ['alert-rules'] });
  };

  const openCreateModal = (): void => {
    setEditingRule(null);
    setRuleModalOpen(true);
  };

  const openEditModal = (rule: AlertRule): void => {
    setEditingRule(rule);
    setRuleModalOpen(true);
  };

  const closeRuleModal = (): void => {
    setRuleModalOpen(false);
  };

  const closeStatsModal = (): void => {
    setStatsRule(null);
  };

  const handleRuleSaved = async (): Promise<void> => {
    setRuleModalOpen(false);
    await refreshRules();
  };

  const handleToggleActive = async (rule: AlertRule, checked: boolean): Promise<void> => {
    try {
      await updateAlertRule(rule.id, { is_active: checked });
      message.success(checked ? 'Regra ativada.' : 'Regra desativada.');
      await refreshRules();
    } catch (err) {
      message.error(extractApiError(err, 'Não foi possível alterar o estado da regra.'));
    }
  };

  const handleDelete = async (ruleId: string): Promise<void> => {
    try {
      await deleteAlertRule(ruleId);
      message.success('Regra excluída. Alertas históricos foram preservados.');
      await refreshRules();
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao excluir regra de alerta.'));
    }
  };

  const handleRequestDelete = (record: AlertRule): void => {
    confirmWithShortcutLock(
      modal,
      {
        title: `Excluir "${record.name}"?`,
        content: 'Alertas já gerados por esta regra continuarão preservados no histórico.',
        okText: 'Excluir',
        okButtonProps: { danger: true },
        cancelText: 'Cancelar',
        onOk: () => handleDelete(record.id),
      },
      acquireShortcutLock
    );
  };

  const handleOpenStats = async (rule: AlertRule): Promise<void> => {
    setStatsRule(rule);
    setRuleStats(null);
    setStatsLoading(true);
    try {
      const data = await getAlertRuleStatistics(rule.id);
      setRuleStats(data);
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao carregar estatísticas da regra.'));
    } finally {
      setStatsLoading(false);
    }
  };

  return {
    ruleModalOpen,
    editingRule,
    openCreateModal,
    openEditModal,
    closeRuleModal,
    statsRule,
    ruleStats,
    statsLoading,
    handleOpenStats,
    closeStatsModal,
    refreshRules,
    handleRuleSaved,
    handleToggleActive,
    handleDelete,
    handleRequestDelete,
  };
}
