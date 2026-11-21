import { DownloadOutlined } from '@ant-design/icons';
import { Button, Checkbox, DatePicker, Segmented, Select, Space, Tooltip } from 'antd';
import type { Dayjs } from 'dayjs';
import type { TelemetryInterval, TelemetryWindowKey } from '../../../types/models';
import { TELEMETRY_WINDOW_OPTIONS } from '../../../utils/formatters';

const { RangePicker } = DatePicker;

const CHIP_LABEL_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 8,
  background: 'var(--ps-chip-bg)',
  border: '1px solid var(--ps-subtle-divider)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
} as const;

interface TelemetryChartHeaderControlsProps {
  compare24h: boolean;
  onCompare24hChange?: (checked: boolean) => void;
  showPressureChart: boolean;
  onShowPressureChartChange: (checked: boolean) => void;
  interval: TelemetryInterval;
  onIntervalChange?: (next: TelemetryInterval) => void;
  timeWindow: TelemetryWindowKey;
  onTimeWindowChange?: (next: TelemetryWindowKey) => void;
  customRange?: [Dayjs, Dayjs];
  onCustomRangeChange?: (next: [Dayjs, Dayjs]) => void;
  onResetZoom: () => void;
  isRawRangeOver90Days: boolean;
  exportingCsv: boolean;
  onExportCsv?: () => void | Promise<void>;
}

export default function TelemetryChartHeaderControls({
  compare24h,
  onCompare24hChange,
  showPressureChart,
  onShowPressureChartChange,
  interval,
  onIntervalChange,
  timeWindow,
  onTimeWindowChange,
  customRange,
  onCustomRangeChange,
  onResetZoom,
  isRawRangeOver90Days,
  exportingCsv,
  onExportCsv,
}: TelemetryChartHeaderControlsProps) {
  return (
    <Space wrap size={8}>
      <div style={CHIP_LABEL_STYLE}>
        <Checkbox
          checked={compare24h}
          onChange={(e) => onCompare24hChange?.(e.target.checked)}
        >
          vs. Ontem (-24h)
        </Checkbox>
      </div>

      <div style={CHIP_LABEL_STYLE}>
        <Checkbox
          checked={showPressureChart}
          onChange={(e) => onShowPressureChartChange(e.target.checked)}
        >
          Curva de Pressão
        </Checkbox>
      </div>

      <Segmented<TelemetryInterval>
        className="ps-pill-switcher"
        value={interval}
        onChange={(val) => {
          onResetZoom();
          onIntervalChange?.(val);
        }}
        options={[
          { value: 'raw', label: 'Bruto' },
          { value: '5min', label: '5 min' },
          { value: '1hour', label: '1h' },
          { value: '1day', label: '1d' },
        ]}
      />

      <Select<TelemetryWindowKey>
        aria-label="Janela de tempo da telemetria"
        value={timeWindow}
        onChange={(val) => {
          onResetZoom();
          onTimeWindowChange?.(val);
        }}
        style={{ width: 168 }}
        options={TELEMETRY_WINDOW_OPTIONS.map(({ value, label }) => ({ value, label }))}
      />

      {timeWindow === 'custom' && (
        <RangePicker
          showTime
          value={customRange}
          onChange={(vals) => {
            if (vals?.[0] && vals?.[1]) {
              onResetZoom();
              onCustomRangeChange?.([vals[0], vals[1]]);
            }
          }}
          format="DD/MM/YYYY HH:mm"
        />
      )}

      <Tooltip
        title={
          isRawRangeOver90Days
            ? 'Período > 90 dias em Bruto: altere para 5 min, 1h ou 1d'
            : 'Exportar CSV do período selecionado'
        }
      >
        <Button
          icon={<DownloadOutlined />}
          loading={exportingCsv}
          disabled={isRawRangeOver90Days}
          onClick={() => {
            void onExportCsv?.();
          }}
        >
          CSV
        </Button>
      </Tooltip>
    </Space>
  );
}
