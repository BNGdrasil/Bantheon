import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { ROUTES } from './utils/constants';

// 레이아웃 컴포넌트
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';

// 페이지 컴포넌트들 (Lazy Loading)
const HomePage = React.lazy(() => import('./pages/HomePage'));
const PortfolioPage = React.lazy(() => import('./pages/PortfolioPage'));
const AdminPage = React.lazy(() => import('./pages/AdminPage'));
const VMManagementPage = React.lazy(() => import('./pages/VMManagementPage'));
const MonitoringPage = React.lazy(() => import('./pages/MonitoringPage'));
const UserManagementPage = React.lazy(() => import('./pages/UserManagementPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage'));
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'));

// Protected Route 컴포넌트
const ProtectedRoute: React.FC<{ children: React.ReactNode; adminOnly?: boolean }> = ({ 
  children, 
  adminOnly = false 
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  if (adminOnly && !user?.is_superuser) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return <>{children}</>;
};

// Public Route 컴포넌트 (로그인한 사용자는 리다이렉트)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (isAuthenticated) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 text-selection">
      <React.Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* Public Routes */}
          <Route 
            path={ROUTES.LOGIN} 
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            } 
          />
          <Route 
            path={ROUTES.REGISTER} 
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            } 
          />

          {/* Protected Routes with Layout */}
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path={ROUTES.PORTFOLIO} element={<PortfolioPage />} />
            
            {/* Admin Only Routes */}
            <Route 
              path={ROUTES.ADMIN} 
              element={
                <ProtectedRoute adminOnly>
                  <AdminPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path={ROUTES.VM_MANAGEMENT} 
              element={
                <ProtectedRoute adminOnly>
                  <VMManagementPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path={ROUTES.MONITORING} 
              element={
                <ProtectedRoute adminOnly>
                  <MonitoringPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path={ROUTES.USER_MANAGEMENT} 
              element={
                <ProtectedRoute adminOnly>
                  <UserManagementPage />
                </ProtectedRoute>
              } 
            />
          </Route>

          {/* 404 Page */}
          <Route path={ROUTES.NOT_FOUND} element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to={ROUTES.NOT_FOUND} replace />} />
        </Routes>
      </React.Suspense>
    </div>
  );
};

export default App;
