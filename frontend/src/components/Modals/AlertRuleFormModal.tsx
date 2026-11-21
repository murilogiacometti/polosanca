import { Modal } from 'antd';
import AlertRuleModalForm, { type AlertRuleModalFormProps } from './AlertRuleModalForm';

export interface AlertRuleFormModalProps extends AlertRuleModalFormProps {
  open: boolean;
}

export default function AlertRuleFormModal({ open, ...formProps }: AlertRuleFormModalProps) {
  return (
    <Modal
      open={open}
      onCancel={formProps.onCancel}
      footer={null}
      destroyOnHidden
      title={formProps.rule ? 'Editar Regra de Alerta' : 'Nova Regra de Alerta'}
      width={620}
    >
      {open && <AlertRuleModalForm {...formProps} />}
    </Modal>
  );
}
