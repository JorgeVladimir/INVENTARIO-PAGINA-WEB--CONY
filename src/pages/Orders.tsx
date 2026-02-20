import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  ClipboardList, 
  Search, 
  Eye, 
  CheckCircle, 
  Truck, 
  Clock,
  Filter
} from 'lucide-react';
import { Order } from '../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    fetch('/api/orders').then(res => res.json()).then(setOrders);
  }, []);

  const handleUpdateStatus = async (id: number, status: string) => {
    const response = await fetch(`/api/orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (response.ok) {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: status as any } : o));
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.order_number.toLowerCase().includes(search.toLowerCase()) || 
                         o.user_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === 'all' || o.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const statusStyles = {
    pendiente: 'bg-amber-50 text-amber-600 border-amber-100',
    pagado: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    despachado: 'bg-blue-50 text-blue-600 border-blue-100'
  };

  return (
    <div className="p-12 space-y-12">
      <header className="flex justify-between items-end">
        <div className="space-y-2">
          <h1 className="text-5xl font-black text-china-red tracking-tighter uppercase">Gestión de Órdenes</h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Seguimiento de transacciones y logística nacional</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-100 text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pendientes</p>
            <p className="text-2xl font-black text-amber-500">{orders.filter(o => o.status === 'pendiente').length}</p>
          </div>
          <div className="bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-100 text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Completadas</p>
            <p className="text-2xl font-black text-emerald-500">{orders.filter(o => o.status === 'despachado').length}</p>
          </div>
        </div>
      </header>

      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 flex flex-wrap gap-6 items-center">
        <div className="flex-1 min-w-[400px] relative group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-china-red transition-colors" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por número de orden, cliente o guía..." 
            className="w-full pl-14 pr-6 py-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-china-red/5 font-medium transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex gap-4">
          <div className="relative">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <select 
              className="bg-slate-50 border-none rounded-2xl pl-12 pr-10 py-4 font-black uppercase text-[10px] tracking-widest text-slate-600 focus:ring-4 focus:ring-china-red/5 appearance-none cursor-pointer"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">Todos los Estados</option>
              <option value="pendiente">Pendientes</option>
              <option value="pagado">Pagados</option>
              <option value="despachado">Despachados</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[40px] shadow-xl border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="p-8 font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">Orden</th>
              <th className="p-8 font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">Fecha</th>
              <th className="p-8 font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">Cliente</th>
              <th className="p-8 font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">Total</th>
              <th className="p-8 font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">Estado</th>
              <th className="p-8 font-black text-slate-400 uppercase text-[10px] tracking-[0.2em] text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredOrders.map((order) => (
              <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="p-8">
                  <span className="font-black text-slate-900 uppercase tracking-tighter text-lg">{order.order_number}</span>
                </td>
                <td className="p-8">
                  <div className="flex items-center gap-3 text-slate-500">
                    <Clock size={16} />
                    <span className="text-xs font-bold uppercase tracking-widest">
                      {format(new Date(order.order_date), "d MMM, HH:mm", { locale: es })}
                    </span>
                  </div>
                </td>
                <td className="p-8">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-black text-slate-400">
                      {order.user_name?.charAt(0)}
                    </div>
                    <span className="font-black text-slate-700 uppercase text-xs tracking-widest">{order.user_name}</span>
                  </div>
                </td>
                <td className="p-8">
                  <span className="text-xl font-black text-china-red tracking-tight">${order.total.toFixed(2)}</span>
                </td>
                <td className="p-8">
                  <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border ${statusStyles[order.status]}`}>
                    {order.status}
                  </span>
                </td>
                <td className="p-8 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {order.status === 'pendiente' && (
                      <button 
                        onClick={() => handleUpdateStatus(order.id, 'pagado')}
                        className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all shadow-sm"
                        title="Confirmar Pago"
                      >
                        <CheckCircle size={18} />
                      </button>
                    )}
                    {order.status === 'pagado' && (
                      <button 
                        onClick={() => handleUpdateStatus(order.id, 'despachado')}
                        className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center hover:bg-blue-500 hover:text-white transition-all shadow-sm"
                        title="Confirmar Despacho"
                      >
                        <Truck size={18} />
                      </button>
                    )}
                    <button className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-china-black hover:text-white transition-all shadow-sm">
                      <Eye size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredOrders.length === 0 && (
          <div className="py-40 text-center space-y-6">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <ClipboardList size={48} className="text-slate-200" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black uppercase tracking-tighter">Sin Órdenes</h3>
              <p className="text-slate-400 font-medium">No se encontraron registros que coincidan con los filtros.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Orders;
