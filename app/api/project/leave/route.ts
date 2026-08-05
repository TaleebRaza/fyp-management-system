import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { createProjectWithUniqueInviteCode } from '../../../../lib/projectCreation';
import { recordPortalActivity } from '../../../../lib/portalActivityLog';

const ONLY_MEMBER_CODE = 'ONLY_MEMBER_CANNOT_LEAVE';
const TEAM_CHANGED_CODE = 'TEAM_CHANGED';

export async function POST(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['student']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized student request.' }, { status: 401 });
  }

  if (!mongoose.Types.ObjectId.isValid(currentUser.id)) {
    return NextResponse.json({ error: 'Invalid student account.' }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const session = await mongoose.startSession();

    try {
      const response = await session.withTransaction(async () => {
        const student = await User.findOne({
          _id: currentUser.id,
          role: 'student',
        }).session(session);

        if (!student) {
          return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
        }

        if (!student.projectId) {
          return NextResponse.json(
            {
              code: ONLY_MEMBER_CODE,
              error: 'You are not currently part of a team that you can leave.',
            },
            { status: 409 }
          );
        }

        const currentProject = await Project.findById(student.projectId).session(session);
        if (!currentProject) {
          return NextResponse.json(
            { error: 'Your current project record could not be found.' },
            { status: 404 }
          );
        }

        const studentId = String(student._id);
        const memberIds = Array.from(
          new Set((currentProject.members || []).map((memberId: unknown) => String(memberId)))
        );

        if (!memberIds.includes(studentId)) {
          return NextResponse.json(
            { error: 'Your account is not listed as a member of this project.' },
            { status: 403 }
          );
        }

        if (memberIds.length <= 1) {
          return NextResponse.json(
            {
              code: ONLY_MEMBER_CODE,
              error: 'You cannot leave because you are the only member of this team.',
            },
            { status: 409 }
          );
        }

        // The members.1 guard prevents two simultaneous leave requests from
        // accidentally leaving the old project with no members.
        const remainingProject = await Project.findOneAndUpdate(
          {
            _id: currentProject._id,
            members: student._id,
            'members.1': { $exists: true },
          },
          { $pull: { members: student._id } },
          { new: true, session }
        );

        if (!remainingProject) {
          return NextResponse.json(
            {
              code: TEAM_CHANGED_CODE,
              error: 'The team changed while your request was being processed. Refresh and try again.',
            },
            { status: 409 }
          );
        }

        const freshProject = await createProjectWithUniqueInviteCode({
          supervisorId: null,
          members: [student._id],
          title: '',
          titleFingerprint: '',
          domain: '',
          domains: [],
          pdfUrl: '',
          pdfSize: 0,
          status: 'Pending',
          stage: 'PROPOSAL',
        }, session);

        // Remove every piece of project state inherited from the previous team.
        student.projectId = freshProject._id;
        student.supervisorId = null;
        student.status = 'Unassigned';
        student.remarks = 'You left your previous team and started a new project. Choose a supervisor or share your new invite code.';
        student.projectTitle = '';
        student.projectDesc = '';
        student.domain = '';
        student.domains = [];
        student.tools = '';
        student.pdfUrl = '';
        student.migrationCode = undefined;
        await student.save({ session });

        return NextResponse.json(
          {
            message: 'You left the team successfully. A new project and invite code have been created for you.',
            project: {
              id: String(freshProject._id),
              inviteCode: freshProject.inviteCode,
            },
          },
          { status: 200 }
        );
      });

      if (response.status === 200) {
        await recordPortalActivity({
          action: 'student-team-left',
          actorId: currentUser.id,
          actorRole: currentUser.role,
        });
      }

      return response;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Leave Team Error:', error);
    return NextResponse.json({ error: 'Failed to leave the team.' }, { status: 500 });
  }
}
