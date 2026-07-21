import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import mongoose from 'mongoose';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import {
  assignStudentSupervisor,
  changeStudentSupervisor,
  submitStudentProject,
  updateStudentProgramBatch,
} from '../../../../lib/studentDashboardActions';
import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../../../../config/projectDomains';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const token = await getToken({
      req: req as any,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token || token.role !== 'student' || !(token as any).id) {
      return NextResponse.json({ error: 'Unauthorized student request.' }, { status: 401 });
    }

    const studentId = String((token as any).id);

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return NextResponse.json({ error: 'Invalid student account.' }, { status: 400 });
    }

    await connectToDatabase();

    // Use the authenticated student's ID and return only dashboard-safe fields.
    const student = await User.findOne({ _id: studentId, role: 'student' })
      .select(
        '_id name email rollNo role program batch semester supervisorId status remarks projectTitle pdfUrl projectDesc domain domains tools notificationsEnabled isActive projectId lateRegistrationDays lateRegistrationFine'
      )
      .lean();

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Fetch the supervisor and project in parallel without adding another fine-related query.
    const [supervisor, project] = await Promise.all([
      student.supervisorId
        ? User.findById(student.supervisorId)
            .select('_id name email broadcastType broadcastContent broadcastSize broadcastCreatedAt')
            .lean()
        : null,
      student.projectId
        ? Project.findById(student.projectId)
            .populate('members', 'name rollNo email')
            .lean()
        : null,
    ]);

    const supervisorBroadcast = supervisor?.broadcastType && supervisor?.broadcastContent
      ? {
          type: supervisor.broadcastType,
          content: supervisor.broadcastContent,
          size: supervisor.broadcastSize || 0,
          createdAt: supervisor.broadcastCreatedAt || null,
          supervisorName: supervisor.name || 'Supervisor',
        }
      : null;

    const projectRecord = project as any;
    const studentRecord = student as any;
    const storedDomainIds =
      Array.isArray(projectRecord?.domains) && projectRecord.domains.length > 0
        ? projectRecord.domains
        : studentRecord.domains;
    const normalizedDomains = normalizeProjectDomainIds(
      storedDomainIds,
      projectRecord?.domain || studentRecord.domain
    );
    const normalizedDomainText = formatProjectDomainLabels(
      normalizedDomains,
      projectRecord?.domain || studentRecord.domain
    );

    const studentResponse = {
      ...studentRecord,
      domains: normalizedDomains,
      domain: normalizedDomainText,
    };

    const projectResponse = projectRecord
      ? {
          ...projectRecord,
          domains: normalizedDomains,
          domain: normalizedDomainText,
        }
      : projectRecord;

    return NextResponse.json(
      {
        student: studentResponse,
        supervisor,
        project: projectResponse,
        supervisorBroadcast,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Student Dashboard GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();

        // ==========================================
    // ACTION: STUDENT PROGRAM/BATCH SELF UPDATE
    // ==========================================
    if (body.action === 'updateProgramBatch') {
      return updateStudentProgramBatch(req, body);
    }

    // ==========================================
    // ACTION: CHANGE SUPERVISOR (student starts fresh)
    // ==========================================
    if (body.action === 'changeSupervisor') {
      return changeStudentSupervisor(req, body);
    }

    // ==========================================
    // ACTION: ASSIGN SUPERVISOR (Transaction Lock)
    // ==========================================
    if (body.action === 'assignSupervisor') {
      return assignStudentSupervisor(req, body);
    }

    return submitStudentProject(req, body);
  } catch (error) {
    console.error('Student Dashboard API Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
