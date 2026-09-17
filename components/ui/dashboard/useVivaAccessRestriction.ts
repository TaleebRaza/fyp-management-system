'use client';

import { useEffect } from 'react';
import { signOut } from 'next-auth/react';

import type { ShowDialog } from '../../../app/_components/PortalDialog';

export function useVivaAccessRestriction(showDialog?: ShowDialog) {
  useEffect(() => {
    let isCurrent = true;
    let isRestricted = false;

    const enforceRestriction = async () => {
      if (isRestricted) return;

      try {
        const response = await fetch('/api/dashboard/viva-access', { cache: 'no-store' });
        const body: unknown = await response.json().catch(() => null);
        if (!isCurrent || !response.ok || !body || typeof body !== 'object' || !('restricted' in body) || body.restricted !== true) {
          return;
        }

        isRestricted = true;
        await signOut({ redirect: false });
        if (isCurrent) {
          showDialog?.({
            title: 'Viva session in progress',
            message: 'You have been signed out while your assigned Viva session is active.',
          });
        }
      } catch {
        // Server-side authorization remains authoritative if this optional browser check cannot run.
      }
    };

    void enforceRestriction();
    const interval = window.setInterval(() => void enforceRestriction(), 30_000);
    window.addEventListener('focus', enforceRestriction);
    return () => {
      isCurrent = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', enforceRestriction);
    };
  }, [showDialog]);
}
