import posthog from 'posthog-js';

// Note: Vite only exposes env vars prefixed with VITE_
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

let isInitialized = false;

export function initAnalytics() {
  if (isInitialized) return;
  
  // Debug: Log environment variable status
  if (import.meta.env.DEV) {
    console.log('[analytics] Checking PostHog configuration...');
    console.log('[analytics] POSTHOG_KEY present:', !!POSTHOG_KEY);
    console.log('[analytics] POSTHOG_KEY value:', POSTHOG_KEY ? `${POSTHOG_KEY.substring(0, 10)}...` : 'undefined');
    console.log('[analytics] POSTHOG_HOST:', POSTHOG_HOST);
  }
  
  if (!POSTHOG_KEY) {
    if (import.meta.env.DEV) {
      console.warn('[analytics] PostHog key missing, analytics disabled');
    }
    return;
  }

  try {
    const config = {
      api_host: POSTHOG_HOST,
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      // Avoid capturing any PII – only anonymous usage
      person_profiles: 'always' as const,
      // Disable bot detection for local development (remove in production if needed)
      opt_out_useragent_filter: import.meta.env.DEV,
      // Enable debug mode in development
      loaded: (posthog: any) => {
        if (import.meta.env.DEV) {
          console.log('[analytics] PostHog loaded successfully', posthog);
        }
      },
    };

    posthog.init(POSTHOG_KEY, config);
    
    // Verify initialization
    if (posthog.__loaded) {
      if (import.meta.env.DEV) {
        console.log('[analytics] PostHog initialized successfully');
      }
      isInitialized = true;
    } else {
      // PostHog might initialize asynchronously, set flag anyway but log warning
      if (import.meta.env.DEV) {
        console.warn('[analytics] PostHog init called, but __loaded is false. Events may not be sent.');
      }
      isInitialized = true; // Set anyway to allow tracking attempts
    }
  } catch (error) {
    console.error('[analytics] Failed to initialize PostHog:', error);
    isInitialized = false;
  }
}

export function trackPageView(path: string) {
  if (!isInitialized) {
    if (import.meta.env.DEV) {
      console.warn('[analytics] trackPageView called but PostHog not initialized');
    }
    return;
  }
  
  try {
    if (import.meta.env.DEV) {
      console.log('[analytics] trackPageView', path);
    }
    posthog.capture('$pageview', {
      $current_url: window.location.origin + path,
      path,
    });
  } catch (error) {
    console.error('[analytics] Error tracking page view:', error);
  }
}

export function trackEvent(name: string, properties?: Record<string, unknown>) {
  if (!isInitialized) {
    if (import.meta.env.DEV) {
      console.warn('[analytics] trackEvent called but PostHog not initialized', name);
    }
    return;
  }
  
  try {
    if (import.meta.env.DEV) {
      console.log('[analytics] event', name, properties);
    }
    posthog.capture(name, properties);
  } catch (error) {
    console.error('[analytics] Error tracking event:', error, name);
  }
}

