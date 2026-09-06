export type BrandingDto = {
  universityName: string;
  primaryColor: string;
  accentColor: string;
  primaryTextColor: '#000000' | '#ffffff';
  accentTextColor: '#000000' | '#ffffff';
  logoUrl: string;
};

export const DEFAULT_BRANDING: BrandingDto = {
  universityName: 'University Of Haripur',
  primaryColor: '#14213d',
  accentColor: '#fca311',
  primaryTextColor: '#ffffff',
  accentTextColor: '#000000',
  logoUrl: '/logo.png',
};

export function getPortalDisplayName(branding: BrandingDto) {
  return branding.universityName === DEFAULT_BRANDING.universityName
    ? 'FYP Portal'
    : branding.universityName;
}

export function getPortalMetadataTitle(branding: BrandingDto) {
  return branding.universityName === DEFAULT_BRANDING.universityName
    ? 'FYP Management System'
    : `${branding.universityName} FYP Portal`;
}

export function getBrandingEmailName(branding: BrandingDto) {
  return branding.universityName === DEFAULT_BRANDING.universityName
    ? 'FYP Portal'
    : `${branding.universityName} FYP Portal`;
}
