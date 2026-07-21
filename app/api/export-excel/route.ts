import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import ExcelJS from 'exceljs';
import { requireRole } from '../../../lib/routeAuth';

type ExportStudent = {
  batch?: string;
  name?: string;
  program?: string;
  projectDesc?: string;
  projectTitle?: string;
  rollNo?: string;
  semester?: string;
  tools?: string;
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole(req, ['supervisor', 'admin']);
    if (auth.kind === 'denied') return auth.response;

    const url = new URL(req.url);
    const supervisorId = url.searchParams.get('id');
    const supervisorName = url.searchParams.get('name') || 'Supervisor';
    const batchFilter = url.searchParams.get('batch') || 'All';
    const programFilter = url.searchParams.get('program') || 'All';

    if (!supervisorId) {
      return new Response(JSON.stringify({ error: 'Supervisor ID is required' }), { status: 400 });
    }

    if (auth.token.role === 'supervisor' && String(auth.token.id) !== supervisorId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectToDatabase();

    const query: {
      role: string;
      $or: Array<{ supervisorId: string }>;
      batch?: string;
      program?: string;
    } = {
      role: 'student',
      $or: [{ supervisorId }, { supervisorId: supervisorId.toString() }],
    };

    if (batchFilter !== 'All') query.batch = batchFilter;
    if (programFilter !== 'All') query.program = programFilter;

    const students = await User.find(query).lean();
    const workbook = new ExcelJS.Workbook();
    const selectedFilters = [programFilter, batchFilter].filter((value) => value !== 'All');
    const sheetName = selectedFilters.length === 0 ? 'All Assigned Students' : `${selectedFilters.join(' ')} Students`;
    const worksheet = workbook.addWorksheet(sheetName.substring(0, 31));

    worksheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Roll No', key: 'rollNo', width: 18 },
      { header: 'Program', key: 'program', width: 15 },
      { header: 'Batch', key: 'batch', width: 15 },
      { header: 'Semester', key: 'semester', width: 15 },
      { header: 'Project Title', key: 'title', width: 40 },
      { header: 'Technologies', key: 'tools', width: 30 },
      { header: 'Description', key: 'desc', width: 70 },
    ];
    worksheet.getRow(1).font = { bold: true };

    students?.forEach((student: ExportStudent) => {
      worksheet.addRow({
        name: student.name,
        rollNo: student.rollNo,
        program: student.program || 'N/A',
        batch: student.batch || 'N/A',
        semester: student.semester || '7th Semester',
        title: student.projectTitle || 'N/A',
        tools: student.tools || 'N/A',
        desc: student.projectDesc || 'N/A',
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const safeFilenameName = supervisorName.replace(/\s+/g, '-');
    const safeBatchName = batchFilter.replace(/\s+/g, '-');
    const safeProgramName = programFilter.replace(/\s+/g, '-');
    const finalFilename = `fyp-report-${safeFilenameName}-${safeProgramName}-${safeBatchName}.xlsx`;

    return new Response(buffer as BlobPart, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${finalFilename}"`,
        'Content-Length': buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('Excel export error:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate Excel report' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
