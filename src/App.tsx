/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { AuthProvider, useAuth } from './AuthContext';
import { CartProvider } from './CartContext';
import Sidebar from './components/Sidebar';
import PublicHeader from './components/PublicHeader';
import PublicFooter from './components/PublicFooter';
import RouteMetadata from './components/RouteMetadata';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Orders from './pages/Orders';
import NewOrder from './pages/NewOrder';
import ImportInventory from './pages/ImportInventory';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import CartPage from './pages/Cart';

const PublicLayout = () => (
  <div className="min-h-screen flex flex-col bg-white">
    <PublicHeader />
    <main className="flex-1">
      <Outlet />
    </main>
    <PublicFooter />
  </div>
);

const AdminLayout = () => {
  const { isAuthenticated } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  if (!isAuthenticated) return <Navigate to="/login" />;

  return (
    <div className="flex bg-lina-soft min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-64 min-h-screen">
        <Outlet />
      </main>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <Router>
          <RouteMetadata />
          <Routes>
            {/* Public Routes */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/productos" element={<Catalog />} />
              <Route path="/carrito" element={<CartPage />} />
            </Route>

            {/* Auth */}
            <Route path="/login" element={<Login />} />

            {/* Admin Routes */}
            <Route path="/dashboard" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="inventario" element={<Inventory />} />
              <Route path="ordenes" element={<Orders />} />
              <Route path="nueva-orden" element={<NewOrder />} />
              <Route path="importar" element={<ImportInventory />} />
              <Route path="admin" element={<div className="p-8">Panel de Administración</div>} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Router>
      </CartProvider>
    </AuthProvider>
  );
}
