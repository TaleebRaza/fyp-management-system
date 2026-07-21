import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LoginView, RegisterView } from '../components/auth/AuthViews';

describe('auth views', () => {
  it('keeps sign-in, account recovery, and registration controls', () => {
    const login = renderToStaticMarkup(<LoginView setIsRegistering={() => undefined} showDialog={() => undefined} />);
    const registration = renderToStaticMarkup(<RegisterView setIsRegistering={() => undefined} showDialog={() => undefined} supervisorsList={[{ _id: 'supervisor-1', name: 'Dr Ada', isFull: true, filledSlots: 30, maxSlots: 30 }]} />);

    expect(login).toContain('Forgot password?');
    expect(login).toContain('Create an account');
    expect(registration).toContain('Create student account');
    expect(registration).toContain('Register now');
  });
});
