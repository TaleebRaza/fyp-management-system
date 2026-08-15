import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';

import { EXPANDED_TEAM_SIZE } from '../../../config/appSettings';
import { getSupervisorMaxSlots } from '../../../lib/supervisorSlots';
import { requireCurrentUser } from '../../../lib/security/auth';
import User from '../../../models/User';
import Project from '../../../models/Project';

function filenameSegment(value: string, fallback: string) {
  const normalized = value
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || fallback;
}

export async function GET(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req, ['supervisor', 'admin']);
    if (!currentUser) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

    const url = new URL(req.url);
    const supervisorId = currentUser.role === 'admin' ? url.searchParams.get('id') : currentUser.id;
    const batchFilter = url.searchParams.get('batch')?.trim() || 'All';
    const programFilter = url.searchParams.get('program')?.trim() || 'All';

    if (!supervisorId) {
      return new Response(JSON.stringify({ error: 'Supervisor ID is required' }), { status: 400 });
    }

    const supervisor = await User.findOne({ _id: supervisorId, role: 'supervisor' })
      .select('name extraSlots')
      .lean();
    if (!supervisor) {
      return new Response(JSON.stringify({ error: 'Supervisor not found' }), { status: 404 });
    }

    const exportLimit = getSupervisorMaxSlots(supervisor) * EXPANDED_TEAM_SIZE;

    type ExportProjectRow = {
      members?: unknown[];
      title?: string;
      tools?: string;
      description?: string;
    };
    type ExportStudentRow = {
      _id: unknown;
      name?: string;
      rollNo?: string;
      program?: string;
      batch?: string;
      semester?: string;
    };

    const projectRows = await Project.find({ supervisorId })
      .select('members title tools description')
      .lean() as unknown as ExportProjectRow[];

    const projectByMember = new Map<string, ExportProjectRow>();
    const memberIds = Array.from(new Set(
      projectRows.flatMap((project) =>
        (project.members || []).map((memberId) => {
          projectByMember.set(String(memberId), project);
          return memberId;
        })
      )
    ));

    const query: Record<string, unknown> = {
      _id: { $in: memberIds },
      role: 'student',
    };
    if (batchFilter !== 'All') query.batch = batchFilter;
    if (programFilter !== 'All') query.program = programFilter;

    const studentRows = await User.find(query)
      .select('_id name rollNo program batch semester')
      .sort({ rollNo: 1, _id: 1 })
      .limit(exportLimit + 1)
      .lean() as unknown as ExportStudentRow[];

    const isTruncated = studentRows.length > exportLimit;
    const students = studentRows.slice(0, exportLimit);

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

    for (const student of students) {
      const project = projectByMember.get(String(student._id));
      worksheet.addRow({
        name: student.name,
        rollNo: student.rollNo,
        program: student.program || 'N/A',
        batch: student.batch || 'N/A',
        semester: student.semester || '7th Semester',
        title: project?.title || 'N/A',
        tools: project?.tools || 'N/A',
        desc: project?.description || 'N/A',
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const finalFilename = [
      'fyp-report',
      filenameSegment(supervisor.name || 'supervisor', 'supervisor'),
      filenameSegment(programFilter, 'all'),
      filenameSegment(batchFilter, 'all'),
    ].join('-') + '.xlsx';

    return new Response(buffer as BlobPart, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${finalFilename}"`,
        'Content-Length': buffer.byteLength.toString(),
        'X-Export-Limit': String(exportLimit),
        'X-Export-Truncated': String(isTruncated),
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
