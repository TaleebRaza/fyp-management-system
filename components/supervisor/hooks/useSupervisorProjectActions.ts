import { useCallback, useState } from 'react';
import {
  expandSupervisorTeam,
  migrateSupervisorStudent,
  progressSupervisorProjectStage,
  removeSupervisorTeam,
  updateSupervisorProjectRating,
  updateSupervisorProjectStatus,
} from '../api/supervisorDashboardApi';
import { getMemberNames } from '../SupervisorProjectCard';
import type { SupervisorProject } from '../supervisorDashboardTypes';
import type { ProjectRatingValues } from '../../../config/projectRatings';
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
  const [progressionRequestId, setProgressionRequestId] = useState(0);

  const openProject = useCallback((project: SupervisorProject) => {
    setProgressionRequestId(0);
    setSelectedProject(project);
    setMigrationStudentId(
      project.members?.[0]?._id || project.triggerStudentId
    );
  }, []);

  const closeProject = useCallback(() => {
    setProgressionRequestId(0);
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
    (
      project: SupervisorProject,
      newStatus: string,
      approval?: {
        ratings: ProjectRatingValues;
        remarks: string;
        reviewRatingRound?: 'proposal' | 'thesis';
        isReviewEdit?: boolean;
      }
    ) => {
      const submitReview = async (remarks: string, ratings?: ProjectRatingValues) => {
        setIsProcessingAction(true);
        try {
          if (approval?.isReviewEdit && approval.reviewRatingRound) {
            await updateSupervisorProjectRating({
              studentId: project.triggerStudentId,
              ratingRound: approval.reviewRatingRound,
              remarks: String(remarks || '').trim() || 'No remarks provided.',
              ratings: ratings || approval.ratings,
            });
            closeProject();
            void refreshProjects();
            notify('Rating updated', 'The saved rating was revised successfully.');
            return;
          }

          await updateSupervisorProjectStatus({
            studentId: project.triggerStudentId,
            status: newStatus,
            remarks: String(remarks || '').trim() || 'No remarks provided.',
            expectedStage: project.stage || 'PROPOSAL',
            expectedVersion: Number(project.version || 0),
          });
          if (newStatus === 'Document Approved') {
            const approvedProject = {
              ...project,
              status: 'Document Approved',
              reviewRemarks: String(remarks || '').trim() || 'No remarks provided.',
              version: Number(project.version || 0) + 1,
            };
            setSelectedProject(approvedProject);
            void refreshProjects();
            requestConfirmation(
              'Document approved',
              project.stage === 'FINAL_DELIVERABLES'
                ? 'Complete this project now?'
                : 'Progress the student team to the next stage now?',
              () => {
                setSelectedProject(approvedProject);
                setProgressionRequestId((current) => current + 1);
              },
              {
                confirmLabel: project.stage === 'FINAL_DELIVERABLES' ? 'Complete project' : 'Progress stage',
                cancelLabel: 'Stay in this stage',
              }
            );
            return;
          }
          closeProject();
          void refreshProjects();
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
      };

      if (approval) {
        void submitReview(approval.remarks, approval.ratings);
        return;
      }

      requestRemarks(
        `${newStatus} Project`,
        `Add optional remarks for marking this team's project as ${newStatus}:`,
        (remarksValue) => submitReview(remarksValue)
      );
    },
    [closeProject, notify, refreshProjects, requestConfirmation, requestRemarks]
  );

  const handleProgress = useCallback(async (
    project: SupervisorProject,
    progression?: { ratings?: ProjectRatingValues; remarks: string }
  ) => {
    setIsProcessingAction(true);
    try {
      const response = await progressSupervisorProjectStage({
        studentId: project.triggerStudentId,
        remarks: String(progression?.remarks || '').trim() || 'Stage progression approved.',
        expectedStage: project.stage || 'PROPOSAL',
        expectedVersion: Number(project.version || 0),
        ...(progression?.ratings ? { ratings: progression.ratings } : {}),
      });
      closeProject();
      void refreshProjects();
      notify(
        response.completed ? 'Project completed' : 'Stage progressed',
        typeof response.message === 'string' ? response.message : 'The project workflow was updated.'
      );
    } catch (error) {
      notify('Progression failed', getSupervisorErrorMessage(error, 'Unable to progress this project right now.'));
    } finally {
      setIsProcessingAction(false);
    }
  }, [closeProject, notify, refreshProjects]);

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
      void refreshProjects();
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
          void refreshProjects();
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
          void refreshProjects();
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
    progressionRequestId,
    handleAction,
    handleProgress,
    handleMigrate,
    handleExpandTeam,
    handleRemoveTeam,
  };
}
