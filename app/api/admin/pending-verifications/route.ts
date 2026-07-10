import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import connectToDatabase from '../../../../lib/mongodb';
import PendingVerification from '../../../../models/PendingVerification';

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token || token.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
    }

    await connectToDatabase();

    const status = req.nextUrl.searchParams.get('status') || 'pending';
    const query: any = {};

    if (status !== 'all') {
      query.status = status;
    }

    const requests = await PendingVerification.find(query)
      .populate('supervisorId', 'name rollNo email')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({ requests }, { status: 200 });
  } catch (error: any) {
    console.error('Pending Verifications Fetch Error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch pending verifications.' }, { status: 500 });
  }
}
