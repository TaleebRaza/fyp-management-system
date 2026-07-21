import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AcademicSettingsDialog, AcademicSettingsPanel } from '../components/dashboards/student/AcademicSettings';

describe('Academic settings components', () => {
  it('keeps the reset warning and current program visible', () => {
    const html = renderToStaticMarkup(<><AcademicSettingsPanel programName="Computer Science" batch="Fall 2026" onOpen={() => undefined} /><AcademicSettingsDialog open isWarningStep isUpdating={false} form={{ program: 'BSCS', batch: 'Fall 2026' }} programOptions={[]} batchOptions={[]} onClose={() => undefined} onProgramChange={() => undefined} onBatchChange={() => undefined} onContinue={() => undefined} onBack={() => undefined} onConfirm={() => undefined} /></>);

    expect(html).toContain('Computer Science');
    expect(html).toContain('This action will reset the student workspace.');
    expect(html).toContain('Confirm Reset');
  });
});
