import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { useAuthStore } from '@/stores/auth.store';
import { applyUserLanguage } from '@/hooks/use-auth';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });

const Login = lazy(() => import('@/pages/Login'));
const SetupPage = lazy(() => import('@/pages/SetupPage'));
const Journal = lazy(() => import('@/pages/Journal'));
const Audit = lazy(() => import('@/pages/Audit'));
const Settings = lazy(() => import('@/pages/Settings'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const Quote = lazy(() => import('@/pages/Quote'));
const History = lazy(() => import('@/pages/History'));
const Purchases = lazy(() => import('@/pages/Purchases'));
const Finances = lazy(() => import('@/pages/Finances'));

export function App() {
  useEffect(() => { applyUserLanguage(useAuthStore.getState().user); }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<Quote />} />
              <Route path="/history" element={<History />} />
              <Route path="/purchases" element={<Purchases />} />
              <Route path="/finances" element={<Finances />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
