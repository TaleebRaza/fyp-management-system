import { NextRequest } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import ExcelJS from 'exceljs';

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const url = new URL(req.url);
    const supervisorId = url.searchParams.get('id');
    const supervisorName = url.searchParams.get('name') || 'Supervisor';
    const batchFilter = url.searchParams.get('batch') || 'All';

    if (!supervisorId) {
      return new Response(JSON.stringify({ error: 'Supervisor ID is required' }), { status: 400 });
    }

    // 1. Build the dynamic query based on the batch filter
    const query: any = {
      role: 'student',
      $or: [
        { supervisorId: supervisorId },
        { supervisorId: supervisorId.toString() }
      ]
    };

    // If the user didn't select "All", restrict the query to the specific batch
    if (batchFilter !== 'All') {
      query.batch = batchFilter;
    }

    const students = await User.find(query).lean();

    // 2. Create a new Excel Workbook and Worksheet
    const workbook = new ExcelJS.Workbook();
    // Name the sheet dynamically based on the batch
    const sheetName = batchFilter === 'All' ? 'All Assigned Students' : `${batchFilter} Students`;
    const worksheet = workbook.addWorksheet(sheetName.substring(0, 31)); // Excel limits sheet names to 31 chars

    // 3. Define the exact columns, now including Batch and Semester
    worksheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Roll No', key: 'rollNo', width: 18 },
      { header: 'Program', key: 'program', width: 15 },
      { header: 'Batch', key: 'batch', width: 15 },
      { header: 'Semester', key: 'semester', width: 15 },
      { header: 'Project Title', key: 'title', width: 40 },
      { header: 'Technologies', key: 'tools', width: 30 },
      { header: 'Description', key: 'desc', width: 70 }
    ];

    // Make the header row bold
    worksheet.getRow(1).font = { bold: true };

    // 4. Add each student as a single row
    if (students && students.length > 0) {
      students.forEach((student: any) => {
        worksheet.addRow({
          name: student.name,
          rollNo: student.rollNo,
          program: student.program || 'N/A',
          batch: student.batch || 'N/A',
          semester: student.semester || '7th Semester',
          title: student.projectTitle || 'N/A',
          tools: student.tools || 'N/A',
          desc: student.projectDesc || 'N/A'
        });
      });
    }

    // 5. Generate the binary buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // 6. Return the file with proper Excel headers
    const safeFilenameName = supervisorName.replace(/\s+/g, '-');
    const safeBatchName = batchFilter.replace(/\s+/g, '-');
    const finalFilename = `fyp-report-${safeFilenameName}-${safeBatchName}.xlsx`;

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
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}