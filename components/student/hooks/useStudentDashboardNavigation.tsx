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

export function useStudentDashboardNavigation(hasFineRestriction: boolean) {
  const [requestedTab, setRequestedTab] = useState<StudentTab>('overview');
  const activeTab: StudentTab =
    requestedTab === 'fine' && !hasFineRestriction ? 'project' : requestedTab;

  const navItems = useMemo<DashboardNavItem[]>(
    () => [
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
      ...(hasFineRestriction
        ? [
            {
              id: 'fine',
              label: 'Fine Payment',
              icon: <CircleDollarSign size={18} />,
              active: activeTab === 'fine',
              badge: 'Due',
              className:
                'border border-red-500/35 !bg-red-200/50 !text-red-950 hover:!bg-red-200/60 dark:!text-red-50',
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
    [activeTab, hasFineRestriction]
  );

  return {
    activeTab,
    setActiveTab: setRequestedTab,
    navItems,
  };
}
