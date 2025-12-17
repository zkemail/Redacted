import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './index.css';
import { router } from './router';
import { initAnalytics, trackPageView } from './utils/analytics';

type AppRouter = {
  state: {
    location: {
      pathname: string;
      search: string;
    };
  };
  subscribe: (fn: () => void) => () => void;
};

export function AnalyticsTracker({ router }: { router: AppRouter }) {
  useEffect(() => {
    initAnalytics();

    // Track initial load
    const initialLocation = router.state.location;
    trackPageView(initialLocation.pathname + initialLocation.search);

    // Subscribe to future navigations
    const unsubscribe = router.subscribe(() => {
      const nextLocation = router.state.location;
      trackPageView(nextLocation.pathname + nextLocation.search);
    });

    return () => {
      unsubscribe();
    };
  }, [router]);

  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <AnalyticsTracker router={router} />
      <RouterProvider router={router} />
    </>
  </StrictMode>,
);
