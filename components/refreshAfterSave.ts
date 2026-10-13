export async function refreshAfterSave(
  refresh: () => Promise<unknown>,
  notify: (title: string, message: string) => void
) {
  try {
    await refresh();
  } catch (error) {
    console.warn('Saved change could not refresh the local view:', error);
    notify('Change saved; refresh needed', 'Your change was saved. Reload the dashboard to see the latest information before making another change.');
  }
}
