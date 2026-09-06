'use client';

import { useEffect, useState } from 'react';

import { isRecord } from '../../lib/security/input';
import { DEFAULT_BRANDING, type BrandingDto } from '../../types/branding';

const BRANDING_UPDATED_EVENT = 'portal-branding-updated';

function isBrandingDto(value: unknown): value is BrandingDto {
  if (!isRecord(value)) return false;
  const branding = value;
  return typeof branding.universityName === 'string'
    && typeof branding.primaryColor === 'string'
    && typeof branding.accentColor === 'string'
    && (branding.primaryTextColor === '#000000' || branding.primaryTextColor === '#ffffff')
    && (branding.accentTextColor === '#000000' || branding.accentTextColor === '#ffffff')
    && typeof branding.logoUrl === 'string';
}

export function applyPortalBranding(branding: BrandingDto) {
  const root = document.documentElement;
  root.dataset.brandingUniversityName = branding.universityName;
  root.dataset.brandingLogoUrl = branding.logoUrl;
  root.style.setProperty('--branding-primary', branding.primaryColor);
  root.style.setProperty('--branding-accent', branding.accentColor);
  root.style.setProperty('--color-on-primary', branding.primaryTextColor);
  root.style.setProperty('--color-on-accent', branding.accentTextColor);
  window.dispatchEvent(new CustomEvent<BrandingDto>(BRANDING_UPDATED_EVENT, { detail: branding }));
}

export function usePortalBranding() {
  const [branding, setBranding] = useState<BrandingDto>(DEFAULT_BRANDING);

  useEffect(() => {
    const root = document.documentElement;
    const syncFromDocument = () => {
      const universityName = root.dataset.brandingUniversityName?.trim();
      const logoUrl = root.dataset.brandingLogoUrl;
      if (!universityName || !logoUrl?.startsWith('/')) return;

      setBranding((current) => ({
        ...current,
        universityName,
        logoUrl,
      }));
    };
    const handleBrandingUpdate = (event: Event) => {
      if (event instanceof CustomEvent && isBrandingDto(event.detail)) {
        setBranding(event.detail);
      }
    };

    syncFromDocument();
    window.addEventListener(BRANDING_UPDATED_EVENT, handleBrandingUpdate);
    return () => window.removeEventListener(BRANDING_UPDATED_EVENT, handleBrandingUpdate);
  }, []);

  return branding;
}
