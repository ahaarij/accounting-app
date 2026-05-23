import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { GroupAParser, SummaryRow, AccountSheetData } from './group-a.parser';

@Injectable()
export class GroupBParser extends GroupAParser {
  parse(filePath: string): { summary: SummaryRow[]; accounts: AccountSheetData[] } {
    const wb = XLSX.readFile(filePath, { cellFormula: false, sheetStubs: false });
    const allSummary: SummaryRow[] = [];
    for (const sheetName of wb.SheetNames) {
      if (sheetName.trim().toLowerCase().startsWith('summary')) {
        const ws = wb.Sheets[sheetName];
        if (ws) allSummary.push(...this.parseSummaryWs(ws));
      }
    }
    const accounts = this.parseAccountSheets(wb);
    return { summary: allSummary, accounts };
  }
}
