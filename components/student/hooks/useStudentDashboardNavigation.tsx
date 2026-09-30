'use client';

import { useMemo, useState } from 'react';
import {
  CircleDollarSign,
  Download,
  FileText,
  ClipboardList,
  LayoutDashboard,
  Users,
} from 'lucide-react';
import type { DashboardNavItem } from '../../ui/dashboard/DashboardShell';

export type StudentTab = 'overview' | 'project' | 'fine' | 'team' | 'resources';

export function useStudentDashboardNavigation(hasFineRestriction: boolean, onOpenViva: () => void) {
  const [requestedTab, setRequestedTab] = useState<StudentTab>('overview');
  const activeTab: StudentTab = requestedTab === 'fine' && !hasFineRestriction ? 'project' : requestedTab;

  const navItems = useMemo<DashboardNavItem[]>(
    () => [
      {
        id: 'overview',
        label: 'Overview',
        section: 'Workspace',
        icon: <LayoutDashboard size={16} />,
        active: activeTab === 'overview',
        onClick: () => setRequestedTab('overview'),
      },
      {
        id: 'project',
        label: 'My Project',
        section: 'Workspace',
        icon: <FileText size={16} />,
        active: activeTab === 'project',
        onClick: () => setRequestedTab('project'),
      },
      {
        id: 'team',
        label: 'Team & Supervisor',
        section: 'Workspace',
        icon: <Users size={16} />,
        active: activeTab === 'team',
        onClick: () => setRequestedTab('team'),
      },
      {
        id: 'resources',
        label: 'Resources',
        section: 'Support',
        icon: <Download size={16} />,
        active: activeTab === 'resources',
        onClick: () => setRequestedTab('resources'),
      },
      ...(hasFineRestriction
        ? [{
            id: 'fine',
            label: 'Fine Payment',
            section: 'Support',
            icon: <CircleDollarSign size={16} />,
            active: activeTab === 'fine',
            badge: 'Due',
            className: 'border border-red-500/25 !bg-red-100/55 !text-red-950 dark:!bg-red-500/10 dark:!text-red-50',
            onClick: () => setRequestedTab('fine'),
          }]
        : []),
      {
        id: 'viva',
        label: 'Viva',
        section: 'Assessment',
        icon: <ClipboardList size={16} />,
        onClick: onOpenViva,
      },
    ],
    [activeTab, hasFineRestriction, onOpenViva]
  );

  return { activeTab, setActiveTab: setRequestedTab, navItems };
}
