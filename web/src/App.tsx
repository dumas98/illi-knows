import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { Discover } from './pages/Discover';
import { EventPage } from './pages/EventPage';
import { Home } from './pages/Home';
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
    children: [
      { path: '/', element: <Home /> },
      { path: '/discover', element: <Discover /> },
      { path: '/events/:id', element: <EventPage /> },
      { path: '*', element: <NotFound /> }
    ]
  }
]);

export function App() {
  return <RouterProvider router={router} />;
}
