// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://8e4a615a241749db21151e2bb2b6e9f7@o4511290592919552.ingest.us.sentry.io/4511290601308160",

  // Define how likely traces are sampled. 
  // In a free-tier/production app, 1.0 (100%) will quickly exhaust your Sentry quota.
  // We are lowering this to 0.2 (20%) to save quota while still catching major trends.
  tracesSampleRate: 0.2,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // SECURE: Disable sending user PII (Personally Identifiable Information)
  sendDefaultPii: false,

  // SECURE: Actively scrub sensitive headers before the error report leaves your server
  beforeSend(event) {
    if (event.request?.headers) {
      delete event.request.headers['cookie'];
      delete event.request.headers['authorization'];
    }
    return event;
  },
});