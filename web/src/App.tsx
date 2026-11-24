import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, RouterProvider, createBrowserRouter, useRouteError } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { Discover } from './pages/Discover';
import { EventPage } from './pages/EventPage';
import { Home } from './pages/Home';
import { Planner } from './pages/Planner';
import { ToastProvider } from './ToastProvider';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } }
});

function NotFound() {
  return (
    <section className="panel empty stack">
      <h1>Page not found</h1>
      <Link className="btn btn-primary" to="/">
        Go home
      </Link>
    </section>
  );
}

function CrashScreen() {
  const error = useRouteError();
  return (
    <main className="wrap page">
      <section className="panel empty stack" role="alert">
        <h1>Something went wrong</h1>
        <p className="muted">This page hit an error, often because a new version of Illi-Knows just went live. Reloading usually fixes it.</p>
        <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
          Reload the page
        </button>
        {import.meta.env.DEV && <pre className="small muted">{String(error)}</pre>}
      </section>
    </main>
  );
}

function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <Layout />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <CrashScreen />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/discover', element: <Discover /> },
      { path: '/events/:id', element: <EventPage /> },
      { path: '/planner', element: <Planner /> },
      { path: '*', element: <NotFound /> }
    ]
  }
]);

export function App() {
  return <RouterProvider router={router} />;
}
