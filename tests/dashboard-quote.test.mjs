import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const quote = await importTypeScriptModule('components/ui/dashboard/dashboardQuote.ts');

test('accepts a concise attributed quote from the external source', () => {
  assert.deepEqual(
    quote.parseDashboardQuote({
      id: 1,
      quote: '  Float like a butterfly, sting like a bee.  ',
      author: '  Muhammad Ali  ',
    }),
    {
      id: 1,
      text: 'Float like a butterfly, sting like a bee.',
      author: 'Muhammad Ali',
    }
  );
});

test('rejects malformed and oversized external quote responses', () => {
  assert.equal(quote.parseDashboardQuote({ id: 1, quote: 'Hello' }), null);
  assert.equal(
    quote.parseDashboardQuote({ id: 1, quote: 'a'.repeat(361), author: 'Author' }),
    null
  );
});
