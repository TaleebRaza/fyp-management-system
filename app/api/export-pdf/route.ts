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

    if (!supervisorId) {
      return new Response(JSON.stringify({ error: 'Supervisor ID is required' }), { status: 400 });
    }

    const students = await User.find({
      role: 'student',
      $or: [
        { supervisorId: supervisorId },
        { supervisorId: supervisorId.toString() }
      ]
    }).lean();

    // 1. Create a new Excel Workbook and Worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Assigned Students');

    // 2. Define the exact columns you asked for, with nice widths
    worksheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Roll No', key: 'rollNo', width: 18 },
      { header: 'Project Title', key: 'title', width: 40 },
      { header: 'Technologies', key: 'tools', width: 30 },
      { header: 'Description', key: 'desc', width: 70 }
    ];

    // Make the header row bold
    worksheet.getRow(1).font = { bold: true };

    // 3. Add each student as a single row
    if (students && students.length > 0) {
      students.forEach((student: any) => {
        worksheet.addRow({
          name: student.name,
          rollNo: student.rollNo,
          title: student.projectTitle || 'N/A',
          tools: student.tools || 'N/A',
          desc: student.projectDesc || 'N/A'
        });
      });
    }

    // 4. Generate the binary buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // 5. Return the file with proper Excel headers
    return new Response(buffer as BlobPart, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="fyp-report-${supervisorName.replace(/\s+/g, '-')}.xlsx"`,
        'Content-Length': buffer.byteLength.toString(), // Still preventing that 0 byte issue!
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