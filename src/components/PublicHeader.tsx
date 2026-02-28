import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../CartContext';
import { useAuth } from '../AuthContext';
import { 
  ShoppingCart, 
  User, 
  Search, 
  Menu,
  X,
  Store
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const PublicHeader: React.FC = () => {
  const { items } = useCart();
  const { isAuthenticated, user } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-[100] bg-white border-b border-slate-100 shadow-sm">
      {/* Top Bar */}
      <div className="bg-china-red text-white py-2 px-4 md:px-8 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] flex justify-between items-center">
        <span className="truncate">Importaciones Directas China a Ecuador</span>
        <div className="hidden sm:flex gap-6">
          <span className="hover:text-china-gold cursor-pointer transition-colors">Soporte</span>
          <span className="hover:text-china-gold cursor-pointer transition-colors">Seguimiento</span>
        </div>
      </div>

      {/* Main Header */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-4 md:gap-8">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 md:gap-3 group shrink-0">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-china-red rounded-xl flex items-center justify-center shadow-lg group-hover:rotate-12 transition-transform">
            <Store className="text-white" size={20} />
          </div>
          <div>
            <h1 className="font-black text-lg md:text-xl tracking-tighter text-slate-900 leading-none">CONY</h1>
            <p className="text-[8px] md:text-[9px] text-china-red font-black uppercase tracking-widest">Importadora</p>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="hidden lg:flex items-center gap-8">
          {['Inicio', 'Productos', 'Ofertas', 'Contacto'].map((item) => (
            <Link 
              key={item} 
              to={item === 'Productos' ? '/productos' : '/'} 
              className="text-sm font-bold text-slate-500 hover:text-china-red transition-colors uppercase tracking-widest"
            >
              {item}
            </Link>
          ))}
        </nav>

        {/* Search Bar */}
        <div className="hidden md:flex flex-1 max-w-md relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-china-red transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Buscar productos..." 
            className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border-none rounded-full text-sm font-medium focus:ring-2 focus:ring-china-red/10 transition-all"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 md:gap-4">
          <Link to="/carrito" className="relative p-2 text-slate-600 hover:text-china-red transition-colors">
            <ShoppingCart size={22} md:size={24} />
            {items.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 md:w-5 md:h-5 bg-china-red text-white text-[9px] md:text-[10px] font-black rounded-full flex items-center justify-center shadow-lg animate-bounce">
                {items.length}
              </span>
            )}
          </Link>

          <div className="hidden sm:block h-6 w-[1px] bg-slate-100 mx-1 md:mx-2"></div>

          {isAuthenticated ? (
            <button 
              onClick={() => navigate('/dashboard')}
              className="hidden sm:flex items-center gap-2 bg-slate-900 text-white px-4 md:px-5 py-2 md:py-2.5 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest hover:bg-china-red transition-all shadow-lg"
            >
              <User size={14} md:size={16} />
              Panel
            </button>
          ) : (
            <Link 
              to="/login" 
              className="hidden sm:flex items-center gap-2 bg-china-red text-white px-4 md:px-6 py-2 md:py-2.5 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg"
            >
              Login
            </Link>
          )}

          <button className="lg:hidden p-2 text-slate-600" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-white border-t border-slate-100 overflow-hidden"
          >
            <div className="p-8 space-y-6">
              {['Inicio', 'Productos', 'Ofertas', 'Contacto'].map((item) => (
                <Link 
                  key={item} 
                  to={item === 'Productos' ? '/productos' : '/'} 
                  className="block text-lg font-black text-slate-900 uppercase tracking-tighter"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default PublicHeader;
