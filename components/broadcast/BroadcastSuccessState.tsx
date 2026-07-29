'use client';

import { CheckCircle2 } from 'lucide-react';

export function BroadcastSuccessState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-emerald-500">
      <CheckCircle2 size={56} className="mb-4" />
      <h3 className="text-2xl font-extrabold tracking-tight">Broadcast Live!</h3>
      <p className="opacity-70 mt-2 font-medium">
        Your students can now see this update.
      </p>
    </div>
  );
}
