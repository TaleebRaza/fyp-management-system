import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { ShowDialog } from '../../../app/_components/PortalDialog';
import { MAX_EXTRA_SUPERVISOR_SLOTS } from '../../../lib/supervisorSlots';
import type { AdminSupervisor } from '../adminDashboardTypes';
import {
  createAdminSupervisor,
  deleteAdminSupervisor,
  getAdminSupervisors,
  setSupervisorNotifications,
  updateSupervisorExtraSlots,
} from '../api/adminDashboardApi';
import {
  clampSupervisorExtraSlots,
  createSupervisorMigrationCode,
  filterAdminSupervisors,
} from '../selectors/adminDashboardSelectors';

type NewSupervisorField = 'name' | 'rollNo' | 'email' | 'password';

type NewSupervisor = Record<NewSupervisorField, string>;

const EMPTY_SUPERVISOR: NewSupervisor = {
  name: '',
  rollNo: '',
  email: '',
  password: '',
};

export function useAdminSupervisors(
  showDialog: ShowDialog,
  refreshStudents: () => Promise<void>
) {
  const [newSupervisor, setNewSupervisor] =
    useState<NewSupervisor>(EMPTY_SUPERVISOR);
  const [supervisors, setSupervisors] = useState<AdminSupervisor[]>([]);
  const [search, setSearch] = useState('');
  const [slotEditorSupervisor, setSlotEditorSupervisor] =
    useState<AdminSupervisor | null>(null);
  const [slotEditorValue, setSlotEditorValue] = useState('0');
  const [isSlotEditorSaving, setIsSlotEditorSaving] = useState(false);

  const filteredSupervisors = useMemo(
    () => filterAdminSupervisors(supervisors, search),
    [search, supervisors]
  );

  const refreshSupervisors = useCallback(async () => {
    try {
      setSupervisors(await getAdminSupervisors());
    } catch (error) {
      console.error('Supervisor fetch error:', error);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    getAdminSupervisors()
      .then((loadedSupervisors) => {
        if (!ignore) setSupervisors(loadedSupervisors);
      })
      .catch((error) => {
        if (!ignore) console.error('Supervisor fetch error:', error);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleNewSupervisorChange = useCallback(
    (field: NewSupervisorField, value: string) => {
      setNewSupervisor((current) => ({ ...current, [field]: value }));
    },
    []
  );

  const handleAddSupervisor = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const name = newSupervisor.name.trim();
      const email = newSupervisor.email.trim();
      const rollNo = newSupervisor.rollNo.trim();

      if (!name || !email || !rollNo || !newSupervisor.password) {
        showDialog({
          title: 'Missing supervisor details',
          message:
            'Enter name, email, username ID, and password before creating the account.',
        });
        return;
      }

      try {
        const result = await createAdminSupervisor({
          name,
          email,
          rollNo,
          password: newSupervisor.password,
          migrationCode: createSupervisorMigrationCode(),
        });

        if (result.ok) {
          showDialog({
            title: 'Supervisor created',
            message:
              String(result.data.message || '') ||
              `Supervisor ${name} has been added successfully.`,
          });
          setNewSupervisor(EMPTY_SUPERVISOR);
          await refreshSupervisors();
          return;
        }

        showDialog({
          title: 'Supervisor creation failed',
          message:
            String(result.data.error || '') || 'Failed to add the supervisor.',
        });
      } catch {
        showDialog({
          title: 'Connection error',
          message: 'Unable to create supervisor right now.',
        });
      }
    },
    [newSupervisor, refreshSupervisors, showDialog]
  );

  const handleDeleteSupervisor = useCallback(
    (id: string, name: string) => {
      showDialog({
        type: 'confirm',
        title: 'Delete supervisor?',
        message: `This will permanently delete ${name}. Their assigned students will be marked as unassigned.`,
        onConfirm: async () => {
          try {
            const result = await deleteAdminSupervisor(id);
            if (result.ok) {
              await Promise.all([refreshSupervisors(), refreshStudents()]);
              return;
            }

            showDialog({
              title: 'Delete failed',
              message: 'Failed to delete the supervisor.',
            });
          } catch {
            showDialog({
              title: 'Connection error',
              message: 'Unable to delete supervisor right now.',
            });
          }
        },
      });
    },
    [refreshStudents, refreshSupervisors, showDialog]
  );

  const handleToggleNotifications = useCallback(
    async (id: string, currentStatus: boolean) => {
      try {
        const result = await setSupervisorNotifications(id, !currentStatus);
        if (result.ok) {
          await refreshSupervisors();
          return;
        }

        showDialog({
          title: 'Update failed',
          message: 'Failed to update supervisor notification settings.',
        });
      } catch {
        showDialog({
          title: 'Connection error',
          message: 'Unable to update notification settings right now.',
        });
      }
    },
    [refreshSupervisors, showDialog]
  );

  const openSlotEditor = useCallback((supervisor: AdminSupervisor) => {
    setSlotEditorSupervisor(supervisor);
    setSlotEditorValue(
      String(
        clampSupervisorExtraSlots(
          supervisor.extraSlots,
          MAX_EXTRA_SUPERVISOR_SLOTS
        )
      )
    );
  }, []);

  const closeSlotEditor = useCallback(() => {
    if (isSlotEditorSaving) return;
    setSlotEditorSupervisor(null);
    setSlotEditorValue('0');
  }, [isSlotEditorSaving]);

  const saveSupervisorExtraSlots = useCallback(async () => {
    if (!slotEditorSupervisor) return;

    const requestedExtraSlots = Number(slotEditorValue);
    if (
      !Number.isInteger(requestedExtraSlots) ||
      requestedExtraSlots < 0 ||
      requestedExtraSlots > MAX_EXTRA_SUPERVISOR_SLOTS
    ) {
      showDialog({
        title: 'Invalid extra slots',
        message: `Enter a whole number from 0 to ${MAX_EXTRA_SUPERVISOR_SLOTS}.`,
      });
      return;
    }

    setIsSlotEditorSaving(true);
    try {
      const result = await updateSupervisorExtraSlots(
        slotEditorSupervisor._id,
        requestedExtraSlots
      );

      if (result.ok) {
        setSlotEditorSupervisor(null);
        setSlotEditorValue('0');
        showDialog({
          title: 'Extra slots updated',
          message:
            String(result.data.message || '') ||
            'Supervisor slot allowance has been updated.',
        });
        await refreshSupervisors();
        return;
      }

      showDialog({
        title: 'Update failed',
        message:
          String(result.data.error || '') ||
          'Failed to update supervisor extra slots.',
      });
    } catch {
      showDialog({
        title: 'Connection error',
        message: 'Unable to update supervisor slots right now.',
      });
    } finally {
      setIsSlotEditorSaving(false);
    }
  }, [refreshSupervisors, showDialog, slotEditorSupervisor, slotEditorValue]);

  const updateSupervisorEmailLocally = useCallback(
    (userId: string, email: string) => {
      setSupervisors((currentSupervisors) =>
        currentSupervisors.map((supervisor) =>
          supervisor._id === userId ? { ...supervisor, email } : supervisor
        )
      );
    },
    []
  );

  return {
    newSupervisor,
    handleNewSupervisorChange,
    supervisors,
    filteredSupervisors,
    search,
    setSearch,
    refreshSupervisors,
    handleAddSupervisor,
    handleDeleteSupervisor,
    handleToggleNotifications,
    slotEditorSupervisor,
    slotEditorValue,
    setSlotEditorValue,
    isSlotEditorSaving,
    openSlotEditor,
    closeSlotEditor,
    saveSupervisorExtraSlots,
    updateSupervisorEmailLocally,
  };
}
