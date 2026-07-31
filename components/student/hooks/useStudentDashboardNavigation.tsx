'use client';

import { useMemo, useState } from 'react';
import {
  CircleDollarSign,
  Download,
  FileText,
  LayoutDashboard,
  Users,
} from 'lucide-react';
import type { DashboardNavItem } from '../../ui/dashboard/DashboardShell';

export type StudentTab = 'overview' | 'project' | 'fine' | 'team' | 'resources';

export function useStudentDashboardNavigation(
  hasFineActivity: boolean,
  paymentOnly = false,
  hasOutstandingFine = hasFineActivity
) {
  const [requestedTab, setRequestedTab] = useState<StudentTab>('overview');
  const activeTab: StudentTab = paymentOnly
    ? 'fine'
    : requestedTab === 'fine' && !hasFineActivity
      ? 'project'
      : requestedTab;

  const navItems = useMemo<DashboardNavItem[]>(
    () => paymentOnly
      ? [
          {
            id: 'fine',
            label: 'Fine Payment',
            icon: <CircleDollarSign size={18} />,
            active: true,
            badge: 'Due',
            onClick: () => setRequestedTab('fine'),
          },
        ]
      : [
      {
        id: 'overview',
        label: 'Overview',
        icon: <LayoutDashboard size={18} />,
        active: activeTab === 'overview',
        onClick: () => setRequestedTab('overview'),
      },
      {
        id: 'project',
        label: 'My Project',
        icon: <FileText size={18} />,
        active: activeTab === 'project',
        onClick: () => setRequestedTab('project'),
      },
      ...(hasFineActivity
        ? [
            {
              id: 'fine',
              label: 'Fine Payment',
              icon: <CircleDollarSign size={18} />,
              active: activeTab === 'fine',
              badge: hasOutstandingFine ? 'Due' : undefined,
              className: hasOutstandingFine
                ? 'border border-red-500/35 !bg-red-200/50 !text-red-950 hover:!bg-red-200/60 dark:!text-red-50'
                : undefined,
              onClick: () => setRequestedTab('fine'),
            },
          ]
        : []),
      {
        id: 'team',
        label: 'Team & Supervisor',
        icon: <Users size={18} />,
        active: activeTab === 'team',
        onClick: () => setRequestedTab('team'),
      },
      {
        id: 'resources',
        label: 'Resources',
        icon: <Download size={18} />,
        active: activeTab === 'resources',
        onClick: () => setRequestedTab('resources'),
      },
    ],
    [activeTab, hasFineActivity, hasOutstandingFine, paymentOnly]
  );

  return {
    activeTab,
    setActiveTab: setRequestedTab,
    navItems,
  };
}
