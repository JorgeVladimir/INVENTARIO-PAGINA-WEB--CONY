import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Package, 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  TrendingUp,
  ArrowRight,
  Search,
  Loader2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import { Link } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => setStats(data));
  }, []);

  if (!stats) return <div className="p-8 flex items-center justify-center min-h-screen"><Loader2 className="animate-spin text-china-red" size={48} /></div>;

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section - China Premium Style */}
      <div className="relative h-[50vh] bg-china-black overflow-hidden flex items-center">
        <img 
          src="https://picsum.photos/seed/shanghai/1920/1080?blur=4" 
          className="absolute inset-0 w-full h-full object-cover opacity-30"
          alt="Hero Background"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-china-red/40 to-transparent"></div>
        <div className="relative z-10 max-w-7xl mx-auto px-12 w-full">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-2xl space-y-6"
          >
            <div className="inline-flex items-center gap-2 bg-china-gold text-china-red px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.3em] shadow-xl">
              <TrendingUp size={14} />
              Crecimiento del 24% este mes
            </div>
            <h1 className="text-7xl font-black text-white tracking-tighter leading-none uppercase">Panel de<br/><span className="text-china-gold">Control Global</span></h1>
            <p className="text-lg text-white/70 font-medium tracking-widest uppercase">SinoStock Ecuador: Gestión Inteligente de Importaciones</p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-12 py-20 space-y-24">
        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {[
            { title: 'Inventario Total', value: stats.totalStock, icon: Package, color: 'text-china-red' },
            { title: 'Stock Crítico', value: stats.lowStock, icon: AlertTriangle, color: 'text-amber-500' },
            { title: 'Órdenes Activas', value: stats.pendingOrders, icon: Clock, color: 'text-blue-500' },
            { title: 'Completadas', value: stats.paidOrders, icon: CheckCircle, color: 'text-emerald-500' },
          ].map((card, idx) => (
            <div key={idx} className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm hover:shadow-2xl transition-all group">
              <div className="flex justify-between items-start mb-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-slate-50 ${card.color} group-hover:bg-china-red group-hover:text-white transition-colors shadow-lg`}>
                  <card.icon size={28} />
                </div>
                <TrendingUp size={20} className="text-emerald-500 opacity-20" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">{card.title}</p>
              <p className="text-4xl font-black text-china-black tracking-tighter">{card.value}</p>
            </div>
          ))}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
          <div className="lg:col-span-2 space-y-10">
            <div className="flex justify-between items-end border-b border-slate-100 pb-6">
              <h2 className="text-3xl font-black tracking-tighter uppercase">Análisis Operativo</h2>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Últimos 7 Días</span>
            </div>
            <div className="h-[450px] w-full bg-slate-50/50 rounded-[48px] p-8">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[
                  { name: 'Lun', v: 400 }, { name: 'Mar', v: 300 }, { name: 'Mie', v: 600 },
                  { name: 'Jue', v: 800 }, { name: 'Vie', v: 500 }, { name: 'Sab', v: 900 }, { name: 'Dom', v: 200 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: '900' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: '900' }} dx={-10} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', padding: '16px' }}
                  />
                  <Line type="monotone" dataKey="v" stroke="#C41E3A" strokeWidth={5} dot={{ r: 8, fill: '#C41E3A', strokeWidth: 3, stroke: '#fff' }} activeDot={{ r: 10, fill: '#D4AF37' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-10">
            <div className="flex justify-between items-end border-b border-slate-100 pb-6">
              <h2 className="text-3xl font-black tracking-tighter uppercase">Novedades</h2>
              <Link to="/dashboard/inventario" className="text-[10px] font-black text-china-red uppercase tracking-widest hover:underline">Ver Todo</Link>
            </div>
            <div className="space-y-8">
              {stats.recentProducts.map((prod: any) => (
                <div key={prod.id} className="flex gap-6 group cursor-pointer items-center">
                  <div className="w-24 h-24 rounded-[32px] overflow-hidden bg-slate-50 shadow-sm">
                    <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-[9px] font-black text-china-red uppercase tracking-widest">{prod.internal_code}</p>
                    <h3 className="font-black text-sm text-china-black leading-tight uppercase tracking-tight group-hover:text-china-red transition-colors">{prod.name}</h3>
                    <p className="text-xl font-black text-china-black">${prod.price.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="bg-china-gold/10 p-10 rounded-[48px] border border-china-gold/20 space-y-6">
              <h4 className="text-xl font-black text-china-red uppercase tracking-tighter">Reporte Mensual</h4>
              <p className="text-xs font-bold text-china-red/60 leading-relaxed uppercase tracking-widest">Descarga el resumen detallado de operaciones y stock por contenedor.</p>
              <button className="w-full china-btn-gold !py-4">Descargar PDF</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
