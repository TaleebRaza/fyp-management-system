import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { AcademicResetError, resetStudentAcademicInfo } from '../../../../lib/academicReset';

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token || token.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
    }

    const { targetUserId, newBatch } = await req.json();

    const result = await resetStudentAcademicInfo({
      targetUserId,
      newBatch,
      actor: 'admin',
      enforceStudentCooldown: false,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('Update Batch Error:', error);

    if (error instanceof AcademicResetError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ error: 'Failed to update batch.' }, { status: 500 });
  }
}