'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermission } from '@/hooks/use-permission';
import {
  PurchaseReportControllerExportFormat,
  PurchaseReportControllerGetBreakdownGroupBy,
} from '@/generated/pOSERPEnterpriseAPI.schemas';
import { buildPurchaseReportDateParams, parseDateInputValue } from '@/lib/date-range';
import { usePurchaseReportExport } from '../use-purchase-report-export';
import { PurchaseReportBreakdown } from './purchase-report-breakdown';
import { PurchaseReportDashboard } from './purchase-report-dashboard';

const GROUP_BY_OPTIONS: { value: PurchaseReportControllerGetBreakdownGroupBy; label: string }[] = [
  { value: PurchaseReportControllerGetBreakdownGroupBy.SUPPLIER, label: 'Nhà cung cấp' },
  { value: PurchaseReportControllerGetBreakdownGroupBy.PRODUCT, label: 'Sản phẩm' },
  { value: PurchaseReportControllerGetBreakdownGroupBy.WAREHOUSE, label: 'Kho' },
  { value: PurchaseReportControllerGetBreakdownGroupBy.MONTH, label: 'Tháng' },
  { value: PurchaseReportControllerGetBreakdownGroupBy.USER, label: 'Người tạo' },
  { value: PurchaseReportControllerGetBreakdownGroupBy.CATEGORY, label: 'Danh mục' },
];

const FORMAT_OPTIONS: { value: PurchaseReportControllerExportFormat; label: string }[] = [
  { value: PurchaseReportControllerExportFormat.EXCEL, label: 'Excel' },
  { value: PurchaseReportControllerExportFormat.CSV, label: 'CSV' },
  { value: PurchaseReportControllerExportFormat.PDF, label: 'PDF' },
];

/**
 * T050 — Purchase Report (AD-1: Purchase-only, nested under "Mua hàng"). The date range is
 * optional (AD-3 — omitting both means unbounded all-time history, never an invented default) and,
 * when a boundary is picked, converted from the browser-local calendar day the user selected
 * (AD-4) — never the raw `YYYY-MM-DD` input value passed straight through, and never a hardcoded
 * timezone. No timezone selector is shown (AD-4 §8) — reports are always browser-local for this
 * single-computer v1.0 deployment model.
 */
export function PurchaseReportView() {
  const [dateFromInput, setDateFromInput] = useState('');
  const [dateToInput, setDateToInput] = useState('');
  const [groupBy, setGroupBy] = useState<PurchaseReportControllerGetBreakdownGroupBy>(
    PurchaseReportControllerGetBreakdownGroupBy.SUPPLIER,
  );
  const [format, setFormat] = useState<PurchaseReportControllerExportFormat>(
    PurchaseReportControllerExportFormat.EXCEL,
  );

  const canExport = usePermission('report:export');
  const exportMutation = usePurchaseReportExport();

  const dateParams = buildPurchaseReportDateParams({
    dateFrom: parseDateInputValue(dateFromInput),
    dateTo: parseDateInputValue(dateToInput),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="purchase-report-date-from" className="sr-only">
            Từ ngày
          </Label>
          <Input
            id="purchase-report-date-from"
            type="date"
            className="w-40"
            value={dateFromInput}
            onChange={(e) => setDateFromInput(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="purchase-report-date-to" className="sr-only">
            Đến ngày
          </Label>
          <Input
            id="purchase-report-date-to"
            type="date"
            className="w-40"
            value={dateToInput}
            onChange={(e) => setDateToInput(e.target.value)}
          />
        </div>
        <Select
          value={groupBy}
          onValueChange={(value) =>
            setGroupBy(value as PurchaseReportControllerGetBreakdownGroupBy)
          }
        >
          <SelectTrigger className="w-44" aria-label="Phân tích theo">
            <SelectValue placeholder="Phân tích theo" />
          </SelectTrigger>
          <SelectContent>
            {GROUP_BY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canExport ? (
          <>
            <Select
              value={format}
              onValueChange={(value) => setFormat(value as PurchaseReportControllerExportFormat)}
            >
              <SelectTrigger className="w-32" aria-label="Định dạng xuất">
                <SelectValue placeholder="Định dạng" />
              </SelectTrigger>
              <SelectContent>
                {FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={exportMutation.isPending}
              aria-disabled={exportMutation.isPending}
              onClick={() => {
                if (exportMutation.isPending) return;
                exportMutation.mutate({ ...dateParams, groupBy, format });
              }}
            >
              {exportMutation.isPending ? 'Đang xuất...' : 'Xuất báo cáo'}
            </Button>
          </>
        ) : null}
      </div>

      <PurchaseReportDashboard dateFrom={dateParams.dateFrom} dateTo={dateParams.dateTo} />
      <PurchaseReportBreakdown
        dateFrom={dateParams.dateFrom}
        dateTo={dateParams.dateTo}
        groupBy={groupBy}
      />
    </div>
  );
}
