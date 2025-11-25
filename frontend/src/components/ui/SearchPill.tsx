import { SearchOutlined } from '@ant-design/icons';
import { Input } from 'antd';

export interface SearchPillProps {
  value: string;
  onChange?: (next: string) => void;
  placeholder?: string;
  width?: number | string;
  size?: 'small' | 'middle' | 'large';
}

/**
 * Campo de busca em formato pílula (999px) padronizado em todo o sistema.
 */
export default function SearchPill({
  value,
  onChange,
  placeholder = 'Filtrar...',
  width = 240,
  size = 'middle',
}: SearchPillProps) {
  return (
    <Input
      allowClear
      size={size}
      prefix={<SearchOutlined style={{ color: 'var(--ps-text-secondary)' }} />}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      style={{ width, borderRadius: 999 }}
    />
  );
}
