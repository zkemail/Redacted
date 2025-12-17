import { createBrowserRouter } from 'react-router-dom';
import MainApp from './App.tsx';
import Home from './pages/Home.tsx';
import VerifyPage from './pages/VerifyPage.tsx';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/home',
    element: <Home />,
  },
  {
    path: '/generate-proof',
    element: <MainApp />,
  },
  {
    path: '/verify',
    element: <VerifyPage />,
  },
]);


