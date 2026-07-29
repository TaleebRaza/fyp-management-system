import { NextRequest, NextResponse } from 'next/server';
import Headline from '../../../models/Headline';
import { requireCurrentUser } from '../../../lib/security/auth';
import { normalizeText } from '../../../lib/security/input';
import {
  getPublicHeadline,
  invalidatePublicContent,
  PUBLIC_HEADLINE_TAG,
} from '../../../lib/publicContentCache';
import { publicJson } from '../../../lib/publicResponse';

export const dynamic = 'force-dynamic';

// GET remains public/open so the frontend can easily read the headline on page load
export async function GET(req: NextRequest) {
  try {
    return publicJson(req, { headline: await getPublicHeadline() });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch headline' }, { status: 500 });
  }
}

// POST is now heavily fortified against unauthorized actors
export async function POST(req: NextRequest) {
  try {
    // 1. Strict Security Check: Extract the cryptographic JWT token
    const currentUser = await requireCurrentUser(req, ['admin']);
    
    // 2. Enforce Admin-Only Privileges
    if (!currentUser) {
      console.warn('Unauthorized headline broadcast attempt blocked.');
      return NextResponse.json(
        { error: 'Forbidden: Only administrators can broadcast headlines.' }, 
        { status: 403 }
      );
    }

    const { text } = await req.json();
    const normalizedText = normalizeText(text, 500);
    
    // 3. Hard-delete all previous headlines to permanently reclaim database storage space
    await Headline.deleteMany({});
    
    // 4. Create the new headline
    if (normalizedText) {
      await Headline.create({ text: normalizedText, isActive: true });
    }
    invalidatePublicContent(PUBLIC_HEADLINE_TAG);
    
    return NextResponse.json({ message: 'Headline updated successfully!' }, { status: 200 });
  } catch {
    console.error('headline_update_failed');
    return NextResponse.json({ error: 'Failed to update headline' }, { status: 500 });
  }
}
