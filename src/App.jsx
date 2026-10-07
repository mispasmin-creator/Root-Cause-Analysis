import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { DataProvider } from './context/DataContext.jsx'
import Layout from './components/Layout.jsx'
import { Empty } from './components/ui.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Orders from './pages/Orders.jsx'
import OrderDetail from './pages/OrderDetail.jsx'
import Compare from './pages/Compare.jsx'
import Materials from './pages/Materials.jsx'
import RouteEffects from './components/RouteEffects.jsx'

function RequireAuth({ children }) {
  const { user } = useAuth()
  const location = useLocation()
  // remember where the user was going so login can send them back there
  return user ? children : <Navigate to="/login" replace state={{ from: location }} />
}

function NotFound() {
  return (
    <Empty title="Page not found">
      This link does not exist.{' '}
      <Link to="/" style={{ color: 'var(--brand)', fontWeight: 600 }}>
        Go to Dashboard
      </Link>
    </Empty>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <BrowserRouter>
          <RouteEffects />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/:key" element={<OrderDetail />} />
              <Route path="compare" element={<Compare />} />
              <Route path="materials" element={<Materials />} />
              {/* old Settings page was removed — send old bookmarks to the dashboard */}
              <Route path="settings" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </DataProvider>
    </AuthProvider>
  )
}
