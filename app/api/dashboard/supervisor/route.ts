import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import { DEFAULT_PROJECT_STAGE } from '../../../../config/appSettings';
import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../../../../config/projectDomains';
import {
  isSupervisorStudentAction,
  runSupervisorDashboardAction,
  type SupervisorDashboardActionBody,
} from '../../../../lib/supervisorDashboardActions';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (token.role !== 'supervisor' && token.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Supervisor ID required' }, { status: 400 });
    }

    if (token.role === 'supervisor' && String(token.id) !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectToDatabase();
    
    const students = await User.find({ role: 'student', supervisorId: id }).lean();

    // Fetch associated projects to get the timeline stage.
    const projectIds = students.map(s => s.projectId).filter(Boolean);
    const projects = await Project.find({ _id: { $in: projectIds } }).lean();
    const projectMetadata = projects.reduce<Record<string, { stage?: string; domains?: string[]; domain?: string }>>((acc, p) => {
      const domainIds = normalizeProjectDomainIds(p.domains, p.domain);

      acc[p._id.toString()] = {
        stage: p.stage,
        domains: domainIds,
        domain: formatProjectDomainLabels(domainIds, p.domain),
      };
      return acc;
    }, {});
    // --------------------------------------------------------------

    const projectMap = new Map();

    students.forEach(student => {
      const pId = student.projectId ? student.projectId.toString() : `legacy-${student._id.toString()}`;
      
      if (!projectMap.has(pId)) {
        const metadata = projectMetadata[pId];
        const domainIds = normalizeProjectDomainIds(
          metadata?.domains?.length ? metadata.domains : student.domains,
          metadata?.domain || student.domain
        );
        const domainText = formatProjectDomainLabels(
          domainIds,
          metadata?.domain || student.domain
        );

        projectMap.set(pId, {
          _id: pId, 
          triggerStudentId: student._id.toString(),
          projectTitle: student.projectTitle,
          projectDesc: student.projectDesc,
          domain: domainText,
          domains: domainIds,
          tools: student.tools,
          pdfUrl: student.pdfUrl,
          status: student.status,
          remarks: student.remarks,
          stage: projectMetadata[pId]?.stage || DEFAULT_PROJECT_STAGE,
          program: student.program || 'N/A',
          batch: student.batch || 'N/A',
          semester: student.semester || '7th Semester',
          members: []
        });
      }
      
      projectMap.get(pId).members.push({
        _id: student._id,
        name: student.name,
        rollNo: student.rollNo,
        email: student.email,
        program: student.program || 'N/A'
      });
    });

    return NextResponse.json({ projects: Array.from(projectMap.values()) }, { status: 200 });
  } catch (error) {
    console.error('Supervisor Dashboard GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: SupervisorDashboardActionBody = await req.json();

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (token.role !== 'supervisor' && token.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectToDatabase();

    if (!isSupervisorStudentAction(body.action)) {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }

    const targetStudent = await User.findById(body.studentId);

    if (!targetStudent) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (
      token.role === 'supervisor' &&
      targetStudent &&
      String(targetStudent.supervisorId || '') !== String(token.id)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return runSupervisorDashboardAction({
      actor: { id: String(token.id), role: token.role },
      body,
      targetStudent,
    });
  } catch (error) {
    console.error('Supervisor Action Error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
