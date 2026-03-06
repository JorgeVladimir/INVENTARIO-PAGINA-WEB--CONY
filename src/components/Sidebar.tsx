import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import BrandLogo from './BrandLogo';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  ClipboardList, 
  Settings, 
  LogOut,
  FileUp
} from 'lucide-react';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onClose = () => {} }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'tienda', 'bodega'] },
    { name: 'Inventario', path: '/dashboard/inventario', icon: Package, roles: ['admin', 'tienda', 'bodega'] },
    { name: 'Importación', path: '/dashboard/importar', icon: FileUp, roles: ['admin'] },
    { name: 'Nueva Orden', path: '/dashboard/nueva-orden', icon: ShoppingCart, roles: ['admin', 'tienda'] },
    { name: 'Historial', path: '/dashboard/ordenes', icon: ClipboardList, roles: ['admin', 'tienda', 'bodega'] },
    { name: 'Ajustes', path: '/dashboard/admin', icon: Settings, roles: ['admin'] },
  ];

  const filteredItems = menuItems.filter(item => item.roles.includes(user?.role || ''));

  return (
    <div className="w-64 h-screen bg-china-black text-white flex flex-col fixed left-0 top-0 z-50 shadow-2xl">
      <div className="p-10 flex flex-col items-center gap-2 border-b border-white/5">
        <BrandLogo to="/" className="flex-col text-center" textColor="text-white" subTextColor="text-china-gold" />
      </div>

      <div className="flex-1 py-10 px-6 space-y-2 overflow-y-auto custom-scrollbar">
        {filteredItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={onClose}
            className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group ${
              location.pathname === item.path
                ? 'bg-china-red text-white shadow-lg shadow-china-red/20'
                : 'text-white/40 hover:text-white hover:bg-white/5'
            }`}
          >
            <item.icon size={20} className={location.pathname === item.path ? 'text-white' : 'group-hover:text-china-red transition-colors'} />
            <span className="text-[11px] font-black uppercase tracking-widest">{item.name}</span>
          </Link>
        ))}
      </div>

      <div className="p-8 border-t border-white/5 space-y-8">
        <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl">
          <div className="w-10 h-10 bg-china-gold text-china-red rounded-full flex items-center justify-center font-black text-sm shadow-inner">
            {user?.username[0].toUpperCase()}
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-black truncate uppercase tracking-tight">{user?.full_name}</p>
            <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold">{user?.role}</p>
          </div>
        </div>
        
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="w-full flex items-center justify-center gap-3 text-white/30 hover:text-china-red transition-all text-[10px] font-black uppercase tracking-[0.2em] py-2"
        >
          <LogOut size={16} />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
