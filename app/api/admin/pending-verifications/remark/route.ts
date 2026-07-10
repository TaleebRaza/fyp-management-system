import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import mongoose from 'mongoose';
import connectToDatabase from '../../../../../lib/mongodb';
import PendingVerification from '../../../../../models/PendingVerification';

const DEFAULT_REMARK = 'Mail not received. Please send the same Outlook email again using the details shown on your registration screen.';

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token || token.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
    }

    const { requestId, remark } = await req.json();
    const safeRemark = String(remark || DEFAULT_REMARK).trim().slice(0, 500);

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return NextResponse.json({ error: 'Invalid verification request.' }, { status: 400 });
    }

    await connectToDatabase();

    const pendingRequest = await PendingVerification.findOneAndUpdate(
      { _id: requestId, status: { $in: ['pending', 'action_required'] } },
      {
        $set: {
          status: 'action_required',
          adminRemark: safeRemark || DEFAULT_REMARK,
          remarkedBy: token.id,
          remarkedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!pendingRequest) {
      return NextResponse.json({ error: 'Open verification request was not found.' }, { status: 404 });
    }

    return NextResponse.json(
      { message: `Remark updated for ${pendingRequest.name}. The student will see it on the registration screen.` },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Manual Verification Remark Error:', error.message);
    return NextResponse.json({ error: 'Failed to update verification remark.' }, { status: 500 });
  }
}
