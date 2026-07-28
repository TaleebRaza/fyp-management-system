import { useCallback, useState } from 'react';
import {
  expandSupervisorTeam,
  migrateSupervisorStudent,
  removeSupervisorTeam,
  updateSupervisorProjectStatus,
} from '../api/supervisorDashboardApi';
import { getMemberNames } from '../SupervisorProjectCard';
import type { SupervisorProject } from '../supervisorDashboardTypes';
import { getSupervisorErrorMessage } from '../utils/supervisorErrors';
import type {
  SupervisorConfirmationRequest,
  SupervisorNotify,
  SupervisorRemarksRequest,
} from './useSupervisorFeedback';

export function useSupervisorProjectActions({
  notify,
  requestConfirmation,
  requestRemarks,
  refreshProjects,
}: {
  notify: SupervisorNotify;
  requestConfirmation: SupervisorConfirmationRequest;
  requestRemarks: SupervisorRemarksRequest;
  refreshProjects: () => Promise<void>;
}) {
  const [selectedProject, setSelectedProject] =
    useState<SupervisorProject | null>(null);
  const [migrationInput, setMigrationInput] = useState<Record<string, string>>(
    {}
  );
  const [migrationStudentId, setMigrationStudentId] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const openProject = useCallback((project: SupervisorProject) => {
    setSelectedProject(project);
    setMigrationStudentId(
      project.members?.[0]?._id || project.triggerStudentId
    );
  }, []);

  const closeProject = useCallback(() => {
    setSelectedProject(null);
  }, []);

  const setSelectedMigrationCode = useCallback(
    (value: string) => {
      if (!selectedProject) return;
      setMigrationInput((previous) => ({
        ...previous,
        [selectedProject._id]: value,
      }));
    },
    [selectedProject]
  );

  const handleAction = useCallback(
    (triggerStudentId: string, newStatus: string) => {
      requestRemarks(
        `${newStatus} Project`,
        `Add optional remarks for marking this team's project as ${newStatus}:`,
        async (remarksValue) => {
          setIsProcessingAction(true);
          try {
            await updateSupervisorProjectStatus({
              studentId: triggerStudentId,
              status: newStatus,
              remarks:
                String(remarksValue || '').trim() || 'No remarks provided.',
            });
            closeProject();
            await refreshProjects();
            notify(
              'Project updated',
              `The project has been marked as ${newStatus}.`
            );
          } catch (error) {
            notify(
              'Action failed',
              getSupervisorErrorMessage(
                error,
                'Failed to update project status. Please check your connection and try again.'
              )
            );
          } finally {
            setIsProcessingAction(false);
          }
        }
      );
    },
    [closeProject, notify, refreshProjects, requestRemarks]
  );

  const handleMigrate = useCallback(async () => {
    if (!selectedProject) return;

    const migrationCode = String(
      migrationInput[selectedProject._id] || ''
    )
      .trim()
      .toUpperCase();

    if (!migrationCode) {
      notify(
        'Input required',
        'Enter the target supervisor migration code before migrating a student.'
      );
      return;
    }

    if (!migrationStudentId) {
      notify('Select a student', 'Choose a student from the team to migrate.');
      return;
    }

    setIsProcessingAction(true);
    try {
      const json = await migrateSupervisorStudent({
        studentId: migrationStudentId,
        migrationCode,
      });
      setMigrationInput((previous) => ({
        ...previous,
        [selectedProject._id]: '',
      }));
      closeProject();
      await refreshProjects();
      notify(
        'Student migrated',
        typeof json.message === 'string'
          ? json.message
          : 'The student was migrated successfully.'
      );
    } catch (error) {
      notify(
        'Migration failed',
        getSupervisorErrorMessage(
          error,
          'Unable to migrate this student right now.'
        )
      );
    } finally {
      setIsProcessingAction(false);
    }
  }, [
    closeProject,
    migrationInput,
    migrationStudentId,
    notify,
    refreshProjects,
    selectedProject,
  ]);

  const handleExpandTeam = useCallback(() => {
    if (!selectedProject) return;

    requestConfirmation(
      'Allow a third team member?',
      'This team will be allowed to share its invite code with one additional student.',
      async () => {
        setIsProcessingAction(true);
        try {
          const json = await expandSupervisorTeam(selectedProject._id);
          closeProject();
          await refreshProjects();
          notify(
            'Three-member team approved',
            typeof json.message === 'string'
              ? json.message
              : 'The team can now add a third member.'
          );
        } catch (error) {
          notify(
            'Capacity update failed',
            getSupervisorErrorMessage(
              error,
              'Unable to update this team right now.'
            )
          );
        } finally {
          setIsProcessingAction(false);
        }
      }
    );
  }, [
    closeProject,
    notify,
    refreshProjects,
    requestConfirmation,
    selectedProject,
  ]);

  const handleRemoveTeam = useCallback(() => {
    if (!selectedProject) return;

    requestConfirmation(
      'Remove team?',
      `Remove ${getMemberNames(selectedProject)} from your supervision list? They will need to select a supervisor again.`,
      async () => {
        setIsProcessingAction(true);
        try {
          const json = await removeSupervisorTeam(
            selectedProject.triggerStudentId
          );
          closeProject();
          await refreshProjects();
          notify(
            'Team removed',
            typeof json.message === 'string'
              ? json.message
              : 'The team was removed from your supervision list.'
          );
        } catch (error) {
          notify(
            'Remove failed',
            getSupervisorErrorMessage(
              error,
              'Unable to remove this team right now.'
            )
          );
        } finally {
          setIsProcessingAction(false);
        }
      }
    );
  }, [
    closeProject,
    notify,
    refreshProjects,
    requestConfirmation,
    selectedProject,
  ]);

  return {
    selectedProject,
    openProject,
    closeProject,
    migrationStudentId,
    setMigrationStudentId,
    migrationCode: selectedProject
      ? migrationInput[selectedProject._id] || ''
      : '',
    setSelectedMigrationCode,
    isProcessingAction,
    handleAction,
    handleMigrate,
    handleExpandTeam,
    handleRemoveTeam,
  };
}
