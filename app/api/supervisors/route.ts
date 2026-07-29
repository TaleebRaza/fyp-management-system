import { NextRequest, NextResponse } from 'next/server';
import { getPublicSupervisors } from '../../../lib/publicContentCache';
import { publicJson } from '../../../lib/publicResponse';

export async function GET(req: NextRequest) {
  try {
    return publicJson(req, await getPublicSupervisors());
    
  } catch (error) {
    console.error(
      'API Error [supervisor-fetch]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ error: 'Failed to fetch supervisors' }, { status: 500 });
  }
}
