const FIRST_BATCH_YEAR = 2021;

export function buildAcademicBatchOptions(currentYear = new Date().getFullYear()): string[] {
  const finalYear = Math.max(currentYear + 1, FIRST_BATCH_YEAR);

  return Array.from({ length: (finalYear - FIRST_BATCH_YEAR + 1) * 2 }, (_, index) => {
    const semester = index % 2 === 0 ? 'Spring' : 'Fall';
    const year = FIRST_BATCH_YEAR + Math.floor(index / 2);
    return `${semester} ${year}`;
  });
}
