import { ClipboardCheck } from 'lucide-react';

import type { VivaPublishedResult } from './studentDashboardTypes';
import { EmptyState } from '../ui';
import StudentVivaResults from './StudentVivaResults';

export default function StudentVivaWorkspace({
  results,
}: {
  results: VivaPublishedResult[];
}) {
  return (
    <div className="space-y-6">
      {results.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck size={24} />}
          title="No Viva result published yet"
          description="Your team’s Viva result will appear here after the panel completes the assessment and administration publishes it."
        />
      ) : (
        <StudentVivaResults results={results} />
      )}
    </div>
  );
}
