import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProjectDomainSelector } from '../components/dashboards/student/ProjectDomainSelector';

describe('ProjectDomainSelector', () => {
  it('renders the selected domain and accessible removal control', () => {
    const html = renderToStaticMarkup(<ProjectDomainSelector selectedDomains={['artificial-intelligence']} onChange={() => undefined} />);

    expect(html).toContain('1 selected');
    expect(html).toContain('Artificial Intelligence');
    expect(html).toContain('aria-label="Remove Artificial Intelligence"');
  });
});
