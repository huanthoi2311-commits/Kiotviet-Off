import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PurchaseReportBreakdownItemEntity } from '../../domain/entities/purchase-report.entity';
import { IPurchaseReportExportPort } from '../../domain/services/purchase-report-export.interface';

const COLUMNS: {
  header: string;
  key: keyof PurchaseReportBreakdownItemEntity;
  width: number;
}[] = [
  { header: 'Mã', key: 'code', width: 16 },
  { header: 'Tên', key: 'label', width: 32 },
  { header: 'Tổng giá trị nhập', key: 'totalAmount', width: 20 },
  { header: 'Tổng số lượng', key: 'totalQuantity', width: 16 },
  { header: 'Số đơn nhập', key: 'orderCount', width: 14 },
];

@Injectable()
export class PurchaseReportExportAdapter implements IPurchaseReportExportPort {
  async buildExcel(
    title: string,
    items: PurchaseReportBreakdownItemEntity[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(title.slice(0, 31));

    worksheet.columns = COLUMNS.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width,
    }));
    worksheet.getRow(1).font = { bold: true };

    for (const item of items) {
      worksheet.addRow({
        code: item.code ?? '',
        label: item.label,
        totalAmount: item.totalAmount,
        totalQuantity: item.totalQuantity,
        orderCount: item.orderCount,
      });
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  buildCsv(items: PurchaseReportBreakdownItemEntity[]): string {
    const header = COLUMNS.map((column) =>
      this.escapeCsvCell(column.header),
    ).join(',');
    const rows = items.map((item) =>
      [
        this.escapeCsvCell(item.code ?? ''),
        this.escapeCsvCell(item.label),
        this.escapeCsvCell(item.totalAmount),
        this.escapeCsvCell(item.totalQuantity),
        this.escapeCsvCell(String(item.orderCount)),
      ].join(','),
    );
    return [header, ...rows].join('\r\n');
  }

  async buildPdf(
    title: string,
    items: PurchaseReportBreakdownItemEntity[],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 36, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(16).text(title, { align: 'center' });
      doc.moveDown();

      doc.fontSize(10);
      const columnWidths = [90, 180, 100, 80, 70];
      const startX = doc.x;
      let y = doc.y;

      const drawRow = (values: string[], bold: boolean) => {
        let x = startX;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
        values.forEach((value, index) => {
          doc.text(value, x, y, { width: columnWidths[index], ellipsis: true });
          x += columnWidths[index];
        });
        y += 18;
      };

      drawRow(
        COLUMNS.map((column) => column.header),
        true,
      );
      for (const item of items) {
        if (y > doc.page.height - 60) {
          doc.addPage();
          y = doc.y;
        }
        drawRow(
          [
            item.code ?? '',
            item.label,
            item.totalAmount,
            item.totalQuantity,
            String(item.orderCount),
          ],
          false,
        );
      }

      doc.end();
    });
  }

  private escapeCsvCell(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
