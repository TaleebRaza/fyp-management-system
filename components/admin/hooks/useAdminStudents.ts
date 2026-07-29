import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ShowDialog } from '../../../app/_components/PortalDialog';
import { PROGRAM_MAP } from '../../../config/appSettings';
import type {
  AdminStudent,
  StudentPagination,
} from '../adminDashboardTypes';
import {
  getAdminStudents,
  promoteStudentBatch,
  toggleAdminStudent,
  updateStudentBatch,
  updateStudentProgram,
} from '../api/adminDashboardApi';
import { createAdminBatchOptions } from '../selectors/adminDashboardSelectors';

const DEFAULT_PAGINATION: StudentPagination = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

export function useAdminStudents(showDialog: ShowDialog) {
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [batches, setBatches] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [studentFilter, setStudentFilter] = useState('All');
  const [batchFilter, setBatchFilter] = useState('All');

  const programCodes = useMemo(() => Object.keys(PROGRAM_MAP), []);
  const filterOptions = useMemo(
    () => ['All', ...programCodes, 'Approved', 'Pending', 'Unassigned'],
    [programCodes]
  );

  const refreshStudents = useCallback(
    async (pageToFetch = page) => {
      try {
        setIsLoading(true);
        const data = await getAdminStudents({
          page: pageToFetch,
          limit: pagination.limit || 20,
          studentFilter,
          batchFilter,
          search: debouncedSearch,
          programCodes,
        });

        setStudents(Array.isArray(data.students) ? data.students : []);
        if (data.pagination) setPagination(data.pagination);
        if (Array.isArray(data.filterMeta?.batches)) {
          setBatches(data.filterMeta.batches);
        }
      } catch (error) {
        console.error('Student fetch error:', error);
        showDialog({
          title: 'Students could not load',
          message:
            'The student list could not be loaded. Please refresh or try again later.',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [
      batchFilter,
      debouncedSearch,
      page,
      pagination.limit,
      programCodes,
      showDialog,
      studentFilter,
    ]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setPage(1);
      setDebouncedSearch(search.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let ignore = false;

    getAdminStudents({
      page,
      limit: pagination.limit || 20,
      studentFilter,
      batchFilter,
      search: debouncedSearch,
      programCodes,
    })
      .then((data) => {
        if (ignore) return;

        setStudents(Array.isArray(data.students) ? data.students : []);
        if (data.pagination) setPagination(data.pagination);
        if (Array.isArray(data.filterMeta?.batches)) {
          setBatches(data.filterMeta.batches);
        }
      })
      .catch((error) => {
        if (ignore) return;

        console.error('Student fetch error:', error);
        showDialog({
          title: 'Students could not load',
          message:
            'The student list could not be loaded. Please refresh or try again later.',
        });
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [
    batchFilter,
    debouncedSearch,
    page,
    pagination.limit,
    programCodes,
    showDialog,
    studentFilter,
  ]);

  const handleStudentFilterChange = useCallback((value: string) => {
    setIsLoading(true);
    setStudentFilter(value);
    setPage(1);
  }, []);

  const handleBatchFilterChange = useCallback((value: string) => {
    setIsLoading(true);
    setBatchFilter(value);
    setPage(1);
  }, []);

  const handlePageChange = useCallback(
    (nextPage: number) => {
      if (
        nextPage < 1 ||
        nextPage > pagination.totalPages ||
        nextPage === page
      ) {
        return;
      }
      setIsLoading(true);
      setPage(nextPage);
    },
    [page, pagination.totalPages]
  );

  const handleUpdateProgram = useCallback(
    (userId: string, currentProgram: string, name: string) => {
      showDialog({
        type: 'prompt',
        inputType: 'select',
        inputOptions: programCodes,
        title: 'Update program',
        message: `Select a new program for ${name}. This will reset this student and remove them from their current team.`,
        defaultValue: currentProgram || 'BSCS',
        onConfirm: async (newProgram = '') => {
          if (!newProgram || newProgram === currentProgram) return;

          showDialog({
            type: 'confirm',
            title: 'Confirm student reset',
            message: `Changing ${name}'s program to ${newProgram} will remove them from their current team, unassign their supervisor, reset their dashboard to Proposal, and create a fresh project. Proceed?`,
            onConfirm: async () => {
              try {
                const result = await updateStudentProgram(userId, newProgram);
                if (result.ok) {
                  showDialog({
                    title: 'Program updated',
                    message:
                      String(result.data.message || '') ||
                      'Program updated and student reset.',
                  });
                  await refreshStudents();
                  return;
                }

                showDialog({
                  title: 'Update failed',
                  message:
                    String(result.data.error || '') ||
                    'Failed to update program.',
                });
              } catch {
                showDialog({
                  title: 'Connection error',
                  message: 'Unable to update the student program right now.',
                });
              }
            },
          });
        },
      });
    },
    [programCodes, refreshStudents, showDialog]
  );

  const handleUpdateBatch = useCallback(
    (userId: string, currentBatch: string, name: string) => {
      const batchOptions = createAdminBatchOptions(new Date().getFullYear());

      showDialog({
        type: 'prompt',
        inputType: 'select',
        inputOptions: batchOptions,
        title: 'Update batch',
        message: `Select a new batch for ${name}. This will reset this student and remove them from their current team.`,
        defaultValue: currentBatch || '',
        onConfirm: async (newBatch = '') => {
          if (!newBatch || newBatch === currentBatch) return;

          showDialog({
            type: 'confirm',
            title: 'Confirm student reset',
            message: `Changing ${name}'s batch to ${newBatch} will remove them from their current team, unassign their supervisor, reset their dashboard to Proposal, and create a fresh project. Proceed?`,
            onConfirm: async () => {
              try {
                const result = await updateStudentBatch(userId, newBatch);
                if (result.ok) {
                  showDialog({
                    title: 'Batch updated',
                    message:
                      String(result.data.message || '') ||
                      'Batch updated and student reset.',
                  });
                  await refreshStudents();
                  return;
                }

                showDialog({
                  title: 'Update failed',
                  message:
                    String(result.data.error || '') ||
                    'Failed to update batch.',
                });
              } catch {
                showDialog({
                  title: 'Connection error',
                  message: 'Unable to update the student batch right now.',
                });
              }
            },
          });
        },
      });
    },
    [refreshStudents, showDialog]
  );

  const handlePromoteBatch = useCallback(() => {
    if (batchFilter === 'All') {
      showDialog({
        title: 'Select a batch',
        message:
          'Choose a specific batch before promoting students to 8th Semester.',
      });
      return;
    }

    showDialog({
      type: 'confirm',
      title: `Promote ${batchFilter}?`,
      message: `This will promote all students in ${batchFilter} to 8th Semester.`,
      onConfirm: async () => {
        try {
          const result = await promoteStudentBatch(batchFilter);
          if (result.ok) {
            showDialog({
              title: 'Batch promoted',
              message:
                String(result.data.message || '') ||
                'Batch promoted successfully.',
            });
            await refreshStudents();
            return;
          }

          showDialog({
            title: 'Promotion failed',
            message:
              String(result.data.error || '') || 'Failed to promote batch.',
          });
        } catch {
          showDialog({
            title: 'Connection error',
            message: 'Unable to promote the selected batch right now.',
          });
        }
      },
    });
  }, [batchFilter, refreshStudents, showDialog]);

  const handleToggleStatus = useCallback(
    async (studentId: string, currentStatus: boolean) => {
      try {
        const result = await toggleAdminStudent(studentId, !currentStatus);
        if (result.ok) {
          await refreshStudents();
          return;
        }

        showDialog({
          title: 'Status update failed',
          message: 'Failed to update student account status.',
        });
      } catch {
        showDialog({
          title: 'Connection error',
          message: 'Unable to update student status right now.',
        });
      }
    },
    [refreshStudents, showDialog]
  );

  const updateStudentEmailLocally = useCallback(
    (userId: string, email: string) => {
      setStudents((currentStudents) =>
        currentStudents.map((student) =>
          student._id === userId ? { ...student, email } : student
        )
      );
    },
    []
  );

  return {
    students,
    search,
    setSearch,
    page,
    pagination,
    batches,
    isLoading,
    studentFilter,
    batchFilter,
    filterOptions,
    refreshStudents,
    handleStudentFilterChange,
    handleBatchFilterChange,
    handlePageChange,
    handleUpdateProgram,
    handleUpdateBatch,
    handlePromoteBatch,
    handleToggleStatus,
    updateStudentEmailLocally,
  };
}
