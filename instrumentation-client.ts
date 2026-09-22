// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from './lib/sentryPrivacy';

Sentry.init({
  dsn: "https://8e4a615a241749db21151e2bb2b6e9f7@o4511290592919552.ingest.us.sentry.io/4511290601308160",

  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0.2),
  
  // Enable logs to be sent to Sentry
  enableLogs: true,

  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
