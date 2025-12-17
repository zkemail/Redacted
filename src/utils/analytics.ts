import posthog from 'posthog-js';

// Note: Vite only exposes env vars prefixed with VITE_
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

let isInitialized = false;

export function initAnalytics() {
  if (isInitialized) return;
  if (!POSTHOG_KEY) {
    if (import.meta.env.DEV) {
      console.warn('[analytics] PostHog key missing, analytics disabled');
    }
    return;
  }

  const config = {
    api_host: POSTHOG_HOST,
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true,
    // Avoid capturing any PII – only anonymous usage
    person_profiles: 'always' as const,
  };

  posthog.init(POSTHOG_KEY, config);
  if (import.meta.env.DEV) {
    console.log('[analytics] PostHog initialized');
  }
  isInitialized = true;
}

export function trackPageView(path: string) {
  if (!isInitialized) return;
  if (import.meta.env.DEV) {
    console.log('[analytics] trackPageView', path);
  }
  posthog.capture('$pageview', {
    $current_url: window.location.origin + path,
    path,
  });
}

export function trackEvent(name: string, properties?: Record<string, unknown>) {
  if (!isInitialized) return;
  if (import.meta.env.DEV) {
    console.log('[analytics] event', name, properties);
  }
  posthog.capture(name, properties);
}

