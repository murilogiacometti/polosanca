import { type ReactNode, useState } from 'react';
import { MoreOutlined } from '@ant-design/icons';
import { Button, Dropdown, type MenuProps } from 'antd';
import { useSuspendShortcuts } from '../../context/uiShellContextObject';

interface RowActionMenuDivider {
  type: 'divider';
  key?: string;
}

interface RowActionMenuEntry {
  type?: undefined;
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export type RowActionMenuItem = RowActionMenuDivider | RowActionMenuEntry;

export interface RowActionMenuProps {
  items?: Array<RowActionMenuItem | null | false | undefined>;
  ariaLabel?: string;
}

/**
 * Gatilho padronizado de ações de linha/cartão ("⋮") que interrompe propagação de clique automaticamente.
 */
export default function RowActionMenu({
  items = [],
  ariaLabel = 'Mais ações',
}: RowActionMenuProps) {
  const [open, setOpen] = useState(false);
  useSuspendShortcuts(open);

  const validItems = items.filter((it): it is RowActionMenuItem => Boolean(it));
  if (validItems.length === 0) return null;

  const menuItems: NonNullable<MenuProps['items']> = validItems.map((item, idx) => {
    if (item.type === 'divider') {
      return { type: 'divider' as const, key: item.key ?? `div-${idx}` };
    }
    return {
      key: item.key,
      label: item.label,
      icon: item.icon,
      danger: item.danger,
      disabled: item.disabled,
      onClick: (info) => {
        info.domEvent.stopPropagation();
        setOpen(false);
        item.onClick?.();
      },
    };
  });

  return (
    <Dropdown
      menu={{ items: menuItems }}
      trigger={['click']}
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
    >
      <Button
        type="text"
        size="small"
        icon={<MoreOutlined style={{ fontSize: 17, color: 'var(--ps-text-secondary)' }} />}
        onClick={(e) => e.stopPropagation()}
        aria-label={ariaLabel}
      />
    </Dropdown>
  );
}
