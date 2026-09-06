import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const branding = await importTypeScriptModule('lib/branding.ts');
const brandingTypes = await importTypeScriptModule('types/branding.ts');

function createPngHeader(width = 16, height = 16) {
  const bytes = Buffer.alloc(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

test('branding defaults preserve the existing navy, amber, and portal appearance', () => {
  assert.deepEqual(
    branding.parseBrandingSettings({ universityName: 'University Of Haripur' }),
    {
      universityName: 'University Of Haripur',
      primaryColor: '#14213d',
      accentColor: '#fca311',
    }
  );
  assert.deepEqual(branding.serializeBranding(null), brandingTypes.DEFAULT_BRANDING);
});

test('branding settings require a university name and six-digit hexadecimal colors', () => {
  assert.throws(
    () => branding.parseBrandingSettings({ universityName: '', primaryColor: '#14213d' }),
    /University name/
  );
  assert.throws(
    () => branding.parseBrandingSettings({ universityName: 'Example University', accentColor: 'amber' }),
    /six-digit hexadecimal/
  );
});

test('branding serialization selects readable text and falls back from malformed stored settings', () => {
  const savedAt = new Date('2026-09-06T12:00:00.000Z');
  assert.deepEqual(
    branding.serializeBranding({
      universityName: 'Example University',
      primaryColor: '#ffffff',
      accentColor: '#000000',
      brandingLogo: Buffer.from([1]),
      brandingLogoUpdatedAt: savedAt,
    }),
    {
      universityName: 'Example University',
      primaryColor: '#ffffff',
      accentColor: '#000000',
      primaryTextColor: '#000000',
      accentTextColor: '#ffffff',
      logoUrl: `/api/branding/logo?v=${savedAt.getTime()}`,
    }
  );
  assert.deepEqual(
    branding.serializeBranding({ universityName: 'Example University', primaryColor: 'invalid', accentColor: '#fca311' }),
    {
      ...brandingTypes.DEFAULT_BRANDING,
      universityName: 'Example University',
    }
  );
});

test('branding logo validation accepts bounded PNG headers and rejects invalid files', () => {
  assert.doesNotThrow(() => branding.validateBrandingLogo(createPngHeader()));
  assert.throws(() => branding.validateBrandingLogo(Buffer.from('not a PNG')), /valid PNG/);
  assert.throws(() => branding.validateBrandingLogo(createPngHeader(2049, 16)), /dimensions/);
});
