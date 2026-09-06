import { NextRequest, NextResponse } from 'next/server';

import {
  BrandingValidationError,
  parseBrandingSettings,
  saveBranding,
  validateBrandingLogo,
} from '../../../../lib/branding';
import { invalidatePublicContent, PUBLIC_BRANDING_TAG } from '../../../../lib/publicContentCache';
import { requireCurrentUser } from '../../../../lib/security/auth';

function isLogoFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

export async function PUT(req: NextRequest) {
  try {
    if (!await requireCurrentUser(req, ['admin'])) {
      return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
    }

    const formData = await req.formData();
    const settings = parseBrandingSettings({
      universityName: formData.get('universityName'),
      primaryColor: formData.get('primaryColor'),
      accentColor: formData.get('accentColor'),
    });
    const logoEntry = formData.get('logo');
    if (logoEntry !== null && !isLogoFile(logoEntry)) {
      return NextResponse.json({ error: 'Logo must be uploaded as a PNG file.' }, { status: 400 });
    }

    let logo: Buffer | undefined;
    if (isLogoFile(logoEntry)) {
      if (logoEntry.type !== 'image/png') {
        return NextResponse.json({ error: 'Logo must use the image/png content type.' }, { status: 400 });
      }
      logo = Buffer.from(await logoEntry.arrayBuffer());
      validateBrandingLogo(logo);
    }

    const branding = await saveBranding(settings, logo);
    invalidatePublicContent(PUBLIC_BRANDING_TAG);
    return NextResponse.json(branding);
  } catch (error) {
    if (error instanceof BrandingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('branding_update_failed');
    return NextResponse.json({ error: 'Unable to update portal branding.' }, { status: 500 });
  }
}
