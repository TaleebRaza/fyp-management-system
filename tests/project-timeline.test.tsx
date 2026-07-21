import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProjectTimeline } from '../components/ui/ProjectTimeline';

describe('ProjectTimeline', () => {
  it('renders all stages and marks the active stage progress', () => {
    const html = renderToStaticMarkup(<ProjectTimeline currentStage="THESIS_DRAFT" descriptionSuffix="current project stage" />);

    expect(html).toContain('67% complete based on the current project stage.');
    expect(html).toContain('Proposal');
    expect(html).toContain('Final Deliverables');
  });
});
