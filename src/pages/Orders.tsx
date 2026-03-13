import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  ClipboardList, 
  Search, 
  Eye, 
  CheckCircle, 
  Truck, 
  Clock,
  Filter,
  AlertTriangle,
  X,
  MapPin
} from 'lucide-react';
import { Order } from '../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type LogisticsDetail = {
  shipment?: any;
  payment_transaction?: any;
  events?: any[];
  tracking_view?: any;
};

const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterShipment, setFilterShipment] = useState('all');
  const [incidentOnly, setIncidentOnly] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [logisticsDetail, setLogisticsDetail] = useState<LogisticsDetail | null>(null);
  const [loadingLogistics, setLoadingLogistics] = useState(false);

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

  const isIncidentOrder = (order: Order) => {
    if (order.status === 'pagado' && (!order.shipping_guide || (order.shipment_status || 'sin_guia') === 'sin_guia')) {
      return true;
    }
    if (order.status === 'despachado' && (!order.shipping_guide || (order.shipment_status || 'sin_guia') === 'sin_guia')) {
      return true;
    }
    return false;
  };

  const openLogisticsDetail = async (orderId: number) => {
    setSelectedOrderId(orderId);
    setLoadingLogistics(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/logistics`);
      if (!res.ok) {
        throw new Error('No se pudo consultar detalle logístico');
      }
      const data = await res.json();
      setLogisticsDetail(data);
    } catch {
      setLogisticsDetail(null);
    } finally {
      setLoadingLogistics(false);
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.order_number.toLowerCase().includes(search.toLowerCase()) || 
                         o.user_name?.toLowerCase().includes(search.toLowerCase()) ||
                         o.shipping_guide?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === 'all' || o.status === filterStatus;
    const currentShipmentStatus = o.shipment_status || 'sin_guia';
    const matchesShipment = filterShipment === 'all' || currentShipmentStatus === filterShipment;
    const matchesIncident = !incidentOnly || isIncidentOrder(o);
    return matchesSearch && matchesStatus && matchesShipment && matchesIncident;
  });

  const incidentCount = orders.filter(isIncidentOrder).length;

  const shipmentStyles: Record<string, string> = {
    guia_generada: 'bg-violet-50 text-violet-600 border-violet-100',
    en_transito: 'bg-sky-50 text-sky-600 border-sky-100',
    entregado: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    sin_guia: 'bg-slate-100 text-slate-500 border-slate-200'
  };

  const statusStyles: Record<string, string> = {
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
          <div className="bg-white px-6 py-4 rounded-2xl shadow-sm border border-red-100 text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Incidencias</p>
            <p className="text-2xl font-black text-red-500">{incidentCount}</p>
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

          <div className="relative">
            <Truck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <select
              className="bg-slate-50 border-none rounded-2xl pl-12 pr-10 py-4 font-black uppercase text-[10px] tracking-widest text-slate-600 focus:ring-4 focus:ring-china-red/5 appearance-none cursor-pointer"
              value={filterShipment}
              onChange={(e) => setFilterShipment(e.target.value)}
            >
              <option value="all">Toda Logística</option>
              <option value="sin_guia">Sin Guía</option>
              <option value="guia_generada">Guía Generada</option>
              <option value="en_transito">En Tránsito</option>
              <option value="entregado">Entregado</option>
            </select>
          </div>

          <button
            className={`rounded-2xl px-5 py-4 font-black uppercase text-[10px] tracking-widest border transition-all ${incidentOnly ? 'bg-red-600 text-white border-red-600' : 'bg-slate-50 text-slate-600 border-slate-100'}`}
            onClick={() => setIncidentOnly((prev) => !prev)}
          >
            Solo Incidencias
          </button>
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
              <th className="p-8 font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">Guía</th>
              <th className="p-8 font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">Logística</th>
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
                <td className="p-8">
                  <span className="font-black text-xs tracking-wider uppercase text-slate-700">
                    {order.shipping_guide || 'Sin guía'}
                  </span>
                </td>
                <td className="p-8">
                  <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border ${shipmentStyles[order.shipment_status || 'sin_guia'] || shipmentStyles.sin_guia}`}>
                    {order.shipment_status || 'sin_guia'}
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
                    <button
                      onClick={() => openLogisticsDetail(order.id)}
                      className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-china-black hover:text-white transition-all shadow-sm"
                      title="Ver tracking"
                    >
                      <Eye size={18} />
                    </button>
                    {isIncidentOrder(order) && (
                      <span className="w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center shadow-sm" title="Incidencia logística">
                        <AlertTriangle size={18} />
                      </span>
                    )}
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

      {selectedOrderId && (
        <div className="fixed inset-0 z-[180] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tracking Operativo</p>
                <h3 className="text-xl font-black uppercase tracking-tight">Orden #{selectedOrderId}</h3>
              </div>
              <button
                onClick={() => {
                  setSelectedOrderId(null);
                  setLogisticsDetail(null);
                }}
                className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              {loadingLogistics && <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Consultando logística...</p>}

              {!loadingLogistics && logisticsDetail && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-slate-100 p-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Guía</p>
                      <p className="mt-1 text-sm font-black text-slate-800 uppercase">{logisticsDetail.shipment?.tracking_code || 'Sin guía'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 p-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado Envío</p>
                      <p className="mt-1 text-sm font-black text-slate-800 uppercase">{logisticsDetail.shipment?.status || logisticsDetail.tracking_view?.shipment_status || 'sin_guia'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 p-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pago</p>
                      <p className="mt-1 text-sm font-black text-slate-800 uppercase">{logisticsDetail.payment_transaction?.status || logisticsDetail.tracking_view?.payment_status || 'sin_pago'}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 p-5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Destino</p>
                    <p className="text-sm font-black uppercase text-slate-700 flex items-center gap-2">
                      <MapPin size={16} className="text-china-red" />
                      {logisticsDetail.shipment?.destination_address || '-'}
                    </p>
                    <p className="text-xs font-bold uppercase text-slate-500 tracking-wider mt-1">UBIGEO: {logisticsDetail.shipment?.destination_ubigeo || '-'}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-100 p-5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Eventos</p>
                    <div className="space-y-3">
                      {(logisticsDetail.events || []).length === 0 && (
                        <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">Sin eventos registrados.</p>
                      )}
                      {(logisticsDetail.events || []).map((event: any) => (
                        <div key={event.id} className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{event.status}</p>
                          <p className="text-sm font-bold text-slate-700 mt-1">{event.description}</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">
                            {event.event_time ? format(new Date(event.event_time), 'd MMM yyyy, HH:mm', { locale: es }) : '-'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
