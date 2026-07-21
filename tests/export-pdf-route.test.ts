import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addRow: vi.fn(),
  addWorksheet: vi.fn(),
  connectToDatabase: vi.fn(),
  find: vi.fn(),
  getRow: vi.fn(),
  getToken: vi.fn(),
  workbookConstructor: vi.fn(),
  writeBuffer: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/User', () => ({ default: { find: mocks.find } }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('exceljs', () => ({ default: { Workbook: mocks.workbookConstructor } }));

import { GET as exportPdfCompatibilityReport } from '../app/api/export-pdf/route';
import { GET as exportXlsxReport } from '../app/api/export-xlsx/route';

function exportReport(supervisorId = 'supervisor-1', legacy = false) {
  const GET = legacy ? exportPdfCompatibilityReport : exportXlsxReport;
  const route = legacy ? 'export-pdf' : 'export-xlsx';
  return GET(new NextRequest(`http://localhost/api/${route}?id=${supervisorId}`));
}

describe('GET /api/export-xlsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'supervisor-1', role: 'supervisor' });
    mocks.find.mockReturnValue({ lean: () => Promise.resolve([]) });
    mocks.getRow.mockReturnValue({ font: {} });
    mocks.addWorksheet.mockReturnValue({
      addRow: mocks.addRow,
      columns: [],
      getRow: mocks.getRow,
    });
    mocks.writeBuffer.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mocks.workbookConstructor.mockImplementation(function () {
      return {
      addWorksheet: mocks.addWorksheet,
      xlsx: { writeBuffer: mocks.writeBuffer },
      };
    });
  });

  it('rejects anonymous requests before database access', async () => {
    mocks.getToken.mockResolvedValue(null);

    expect((await exportReport()).status).toBe(401);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it('rejects non-supervisor, non-admin requests before database access', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });

    expect((await exportReport()).status).toBe(403);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it('rejects a supervisor exporting another supervisor’s students', async () => {
    expect((await exportReport('supervisor-2')).status).toBe(403);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it('keeps own-supervisor and admin exports available', async () => {
    expect((await exportReport()).status).toBe(200);

    mocks.getToken.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    expect((await exportReport('supervisor-2')).status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({
      $or: [{ supervisorId: 'supervisor-2' }, { supervisorId: 'supervisor-2' }],
    }));
  });

  it('keeps the legacy PDF-named path compatible', async () => {
    expect((await exportReport('supervisor-1', true)).status).toBe(200);
  });
});
