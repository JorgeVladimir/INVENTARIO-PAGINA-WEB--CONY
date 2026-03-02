import React, { useState } from 'react';
import { motion } from 'motion/react';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        const user = await res.json();
        if (user) {
          login(user);
          navigate('/dashboard');
        }
      } else {
        setError('Invalid credentials. Please try again.');
      }
    } catch (err) {
      setError('Connection error. Please check your internet.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-lina-soft flex">
      {/* Left Side - Image */}
      <div className="hidden lg:block w-1/2 relative overflow-hidden">
        <img 
          src="https://picsum.photos/seed/china-login/1080/1920?grayscale" 
          className="absolute inset-0 w-full h-full object-cover opacity-60"
          alt="Login Background"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-china-black to-transparent"></div>
        <div className="absolute bottom-20 left-20 space-y-4">
          <h2 className="text-5xl font-black text-white tracking-tighter uppercase leading-none">Importación<br/>Confiable</h2>
          <p className="text-china-red font-bold uppercase tracking-[0.4em] text-xs">Importadora Lina</p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 md:p-8 bg-white">
        <div className="w-full max-w-md space-y-8 md:space-y-12">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <BrandLogo compact textColor="text-china-black" subTextColor="text-china-red" />
            </div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em]">Portal de Acceso</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
            {error && (
              <div className="text-china-red text-[10px] font-black uppercase tracking-widest text-center border-b border-china-red pb-2">
                {error}
              </div>
            )}

            <div className="space-y-4 md:space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuario</label>
                <input 
                  type="text" 
                  required
                  className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-china-red/10 transition-all"
                  placeholder="Ingrese su usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contraseña</label>
                </div>
                <input 
                  type="password" 
                  required
                  className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-china-red/10 transition-all"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full china-btn-primary py-5 text-sm"
            >
              {loading ? 'Autenticando...' : 'Iniciar Sesión'}
            </button>
          </form>

          <div className="pt-12 border-t border-slate-200 flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-widest">
            <span>© Importadora Lina 2026</span>
            <div className="flex gap-4">
              <span className="hover:text-china-black cursor-pointer">Privacy</span>
              <span className="hover:text-china-black cursor-pointer">Support</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
