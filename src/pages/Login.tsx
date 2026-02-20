import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Store, LogIn, AlertCircle } from 'lucide-react';
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
    <div className="min-h-screen bg-swany-black flex">
      {/* Left Side - Image */}
      <div className="hidden lg:block w-1/2 relative overflow-hidden">
        <img 
          src="https://picsum.photos/seed/swany-login/1080/1920?grayscale" 
          className="absolute inset-0 w-full h-full object-cover opacity-60"
          alt="Login Background"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-swany-black to-transparent"></div>
        <div className="absolute bottom-20 left-20 space-y-4">
          <h2 className="text-5xl font-black text-white tracking-tighter uppercase leading-none">Global<br/>Excellence</h2>
          <p className="text-swany-red font-bold uppercase tracking-[0.4em] text-xs">SinoStock Management</p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-12">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-black tracking-[0.3em] text-swany-black">SWANY</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em]">Portal Access</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {error && (
              <div className="text-swany-red text-[10px] font-black uppercase tracking-widest text-center border-b border-swany-red pb-2">
                {error}
              </div>
            )}

            <div className="space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Username</label>
                <input 
                  type="text" 
                  required
                  className="premium-input text-sm"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password</label>
                </div>
                <input 
                  type="password" 
                  required
                  className="premium-input text-sm"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full swany-btn-primary py-5 text-sm"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          <div className="pt-12 border-t border-swany-border flex justify-between items-center text-[9px] font-black text-slate-300 uppercase tracking-widest">
            <span>© Swany America 2024</span>
            <div className="flex gap-4">
              <span className="hover:text-swany-black cursor-pointer">Privacy</span>
              <span className="hover:text-swany-black cursor-pointer">Support</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
