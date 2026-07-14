import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { SupplierEntity } from '../../domain/entities/supplier.entity';
import { ISupplierExcelPort } from '../../domain/services/supplier-excel.interface';
import { SUPPLIER_EXCEL_COLUMNS } from './supplier-excel-columns';

const NUMERIC_KEYS = new Set(['paymentTerm', 'creditLimit']);

@Injectable()
export class ExceljsSupplierExcelAdapter implements ISupplierExcelPort {
  async buildWorkbookBuffer(suppliers: SupplierEntity[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Suppliers');

    worksheet.columns = SUPPLIER_EXCEL_COLUMNS.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width,
    }));
    worksheet.getRow(1).font = { bold: true };

    for (const supplier of suppliers) {
      worksheet.addRow({
        code: supplier.code,
        taxCode: supplier.taxCode ?? '',
        companyName: supplier.companyName,
        contactName: supplier.contactName ?? '',
        phone: supplier.phone ?? '',
        email: supplier.email ?? '',
        website: supplier.website ?? '',
        address: supplier.address ?? '',
        province: supplier.province ?? '',
        district: supplier.district ?? '',
        ward: supplier.ward ?? '',
        bankName: supplier.bankName ?? '',
        bankAccount: supplier.bankAccount ?? '',
        paymentTerm: supplier.paymentTerm ?? '',
        creditLimit: supplier.creditLimit ?? '',
        status: supplier.status,
        note: supplier.note ?? '',
      });
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  async parseRows(buffer: Buffer): Promise<Record<string, unknown>[]> {
    const workbook = new ExcelJS.Workbook();
    // Dùng read(stream) thay vì load(buffer): exceljs/index.d.ts tự khai báo
    // `declare interface Buffer extends ArrayBuffer {}` (global augmentation lỗi
    // trong chính exceljs), xung đột cấu trúc với Buffer thật của Node — overload
    // read(stream) không đụng tới kiểu Buffer bị lỗi này nên không cần ép kiểu.
    await workbook.xlsx.read(Readable.from(buffer));
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];

    const headerRow = worksheet.getRow(1);
    const columnIndexByKey = new Map<string, number>();
    headerRow.eachCell((cell, colNumber) => {
      const header = this.cellToString(cell.value).trim();
      const column = SUPPLIER_EXCEL_COLUMNS.find((c) => c.header === header);
      if (column) columnIndexByKey.set(column.key, colNumber);
    });

    const rows: Record<string, unknown>[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (this.isRowEmpty(row)) return;

      const rowData: Record<string, unknown> = { __rowNumber: rowNumber };
      for (const column of SUPPLIER_EXCEL_COLUMNS) {
        const colIndex = columnIndexByKey.get(column.key);
        if (!colIndex) continue;
        const raw = row.getCell(colIndex).value;
        rowData[column.key] = this.normalizeCellValue(column.key, raw);
      }
      rows.push(rowData);
    });

    return rows;
  }

  private isRowEmpty(row: ExcelJS.Row): boolean {
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (
        cell.value !== null &&
        cell.value !== undefined &&
        cell.value !== ''
      ) {
        hasValue = true;
      }
    });
    return !hasValue;
  }

  private cellToString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      if (
        'result' in value &&
        value.result !== null &&
        value.result !== undefined
      ) {
        return this.cellToString(value.result);
      }
      if (
        'text' in value &&
        typeof (value as { text: unknown }).text === 'string'
      ) {
        return (value as { text: string }).text;
      }
      if (
        'richText' in value &&
        Array.isArray((value as { richText: unknown }).richText)
      ) {
        return value.richText.map((r) => r.text).join('');
      }
    }
    return '';
  }

  private normalizeCellValue(key: string, value: ExcelJS.CellValue): unknown {
    const stringValue = this.cellToString(value).trim();
    if (stringValue === '') return undefined;

    if (NUMERIC_KEYS.has(key)) {
      const numeric = Number(stringValue);
      return Number.isNaN(numeric) ? stringValue : numeric;
    }
    return stringValue;
  }
}
