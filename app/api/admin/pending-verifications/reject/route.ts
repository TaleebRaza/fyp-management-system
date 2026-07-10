import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import mongoose from 'mongoose';
import connectToDatabase from '../../../../../lib/mongodb';
import PendingVerification from '../../../../../models/PendingVerification';

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token || token.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
    }

    const { requestId, reason } = await req.json();

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return NextResponse.json({ error: 'Invalid verification request.' }, { status: 400 });
    }

    await connectToDatabase();

    const pendingRequest = await PendingVerification.findOneAndUpdate(
      { _id: requestId, status: 'pending' },
      {
        $set: {
          status: 'rejected',
          rejectedBy: token.id,
          rejectedAt: new Date(),
          rejectionReason: String(reason || 'Rejected by admin.').trim(),
        },
      },
      { new: true }
    );

    if (!pendingRequest) {
      return NextResponse.json({ error: 'Pending verification request was not found.' }, { status: 404 });
    }

    return NextResponse.json(
      { message: `${pendingRequest.name}'s manual verification request has been rejected.` },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Reject Pending Verification Error:', error.message);
    return NextResponse.json({ error: 'Failed to reject verification request.' }, { status: 500 });
  }
}
