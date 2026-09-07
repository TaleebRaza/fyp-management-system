import { NextResponse } from 'next/server';

import connectToDatabase from '../../../../lib/mongodb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const database = await connectToDatabase();
    const mongoDatabase = database.connection.db;

    if (!mongoDatabase) throw new Error('MongoDB connection is unavailable.');
    await mongoDatabase.admin().command({ ping: 1 });

    return NextResponse.json(
      { status: 'ready' },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch {
    console.error('database_readiness_failed');
    return NextResponse.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
