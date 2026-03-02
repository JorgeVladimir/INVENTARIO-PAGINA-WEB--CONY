import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  CheckCircle2,
  FileText,
  Truck,
  CreditCard,
  MapPin,
  X,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { Product } from '../types';
import { useCart } from '../CartContext';
import { useAuth } from '../AuthContext';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const NewOrder: React.FC = () => {
  const { user } = useAuth();
  const { items, addToCart, removeFromCart, clearCart, total } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  
  // Flow States
  const [step, setStep] = useState<'cart' | 'shipping' | 'payment' | 'success'>('cart');
  const [loading, setLoading] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Shipping State
  const [shippingData, setShippingData] = useState({
    name: user?.full_name || '',
    address: '',
    phone: '',
    ubigeo: '170150', // Quito default
    city: 'Quito'
  });
  const [shippingQuote, setShippingQuote] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/products').then(res => res.json()).then(setProducts);
  }, []);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.internal_code.toLowerCase().includes(search.toLowerCase())
  );

  const handleGetQuote = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination_ubigeo: shippingData.ubigeo,
          weight: 2.5, // Mock weight
          pieces: items.length
        })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'No fue posible cotizar el envío.');
      }
      const data = await res.json();
      setShippingQuote(data);
      setStep('payment');
    } catch (e) {
      console.error(e);
      setErrorMessage('No fue posible cotizar el envío. Inténtalo nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const shippingCost = shippingQuote.reduce((sum, q) => sum + parseFloat(q.valor_ennvio || 0), 0);
  const finalTotal = total + shippingCost;

  const handleCheckout = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          items: items.map(i => ({ id: i.id, quantity: i.quantity, price: i.price })),
          total: finalTotal
        })
      });
      if (!orderRes.ok) {
        const errorData = await orderRes.json().catch(() => ({}));
        throw new Error(errorData.error || 'No se pudo crear la orden.');
      }
      const orderData = await orderRes.json();

      const checkoutRes = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderData.id,
          shipping_data: {
            ...shippingData,
            weight: 2.5,
            pieces: items.length,
            items: items
          },
          payment_method: 'card'
        })
      });
      if (!checkoutRes.ok) {
        const errorData = await checkoutRes.json().catch(() => ({}));
        throw new Error(errorData.error || 'No se pudo completar el checkout.');
      }
      const checkoutData = await checkoutRes.json();
      
      setOrderResult({
        ...orderData,
        guide: checkoutData.shipping_guide
      });
      setStep('success');
      clearCart();
    } catch (e) {
      console.error(e);
      setErrorMessage(e instanceof Error ? e.message : 'Error al finalizar la orden.');
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = () => {
    const doc = new jsPDF() as any;
    doc.setFillColor(196, 30, 58);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text('SINOSTOCK - COMPROBANTE', 105, 20, { align: 'center' });
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text(`Orden #: ${orderResult.orderNumber}`, 20, 50);
    doc.text(`Guía Urbano: ${orderResult.guide}`, 20, 60);
    doc.text(`Cliente: ${shippingData.name}`, 20, 70);
    doc.text(`Dirección: ${shippingData.address}, ${shippingData.city}`, 20, 80);

    const tableData = items.map(item => [
      item.internal_code,
      item.name,
      item.quantity,
      `$${item.price.toFixed(2)}`,
      `$${(item.price * item.quantity).toFixed(2)}`
    ]);

    doc.autoTable({
      startY: 90,
      head: [['Código', 'Producto', 'Cant.', 'P. Unit', 'Subtotal']],
      body: tableData,
      headStyles: { fillColor: [196, 30, 58] },
      foot: [
        ['', '', '', 'Subtotal', `$${total.toFixed(2)}`],
        ['', '', '', 'Envío (Urbano)', `$${shippingCost.toFixed(2)}`],
        ['', '', '', 'TOTAL PAGADO', `$${finalTotal.toFixed(2)}`]
      ]
    });

    doc.save(`Pedido_${orderResult.orderNumber}.pdf`);
  };

  return (
    <div className="p-8 flex gap-8 h-[calc(100vh-64px)] overflow-hidden">
      {/* Product Selection */}
      <div className="flex-1 flex flex-col gap-8 overflow-hidden">
        <header className="space-y-2">
          <h1 className="text-4xl font-black text-china-red tracking-tighter uppercase">Nueva Orden</h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Gestión de pedidos internos y sucursales</p>
        </header>

        <div className="relative group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-china-red transition-colors" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por nombre, código o categoría..." 
            className="w-full pl-14 pr-6 py-5 bg-white border border-slate-100 rounded-[32px] shadow-sm focus:ring-4 focus:ring-china-red/5 focus:border-china-red/20 font-medium transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto pr-4 space-y-4 custom-scrollbar">
          {filteredProducts.map(product => (
            <div key={product.id} className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex items-center gap-6 hover:border-china-red/30 hover:shadow-xl transition-all group">
              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-50">
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{product.internal_code}</p>
                <h3 className="font-black text-slate-900 uppercase tracking-tight">{product.name}</h3>
                <p className="text-lg font-black text-china-red mt-1">${product.price.toFixed(2)}</p>
              </div>
              <div className="text-right space-y-3">
                <div className="flex flex-col items-end">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock</p>
                  <p className={`font-black ${product.stock < 10 ? 'text-china-red' : 'text-slate-900'}`}>{product.stock}</p>
                </div>
                <button 
                  onClick={() => addToCart(product, 1)}
                  disabled={product.stock <= 0}
                  className="bg-china-red text-white w-12 h-12 rounded-2xl shadow-lg hover:bg-china-black disabled:bg-slate-200 transition-all active:scale-90 flex items-center justify-center"
                >
                  <Plus size={24} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Checkout Sidebar */}
      <div className="w-[400px] bg-white rounded-[40px] shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
        <div className="p-8 bg-china-red text-white space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart size={28} />
              <h2 className="text-2xl font-black uppercase tracking-tighter">Checkout</h2>
            </div>
            <span className="bg-white/20 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">{items.length} Items</span>
          </div>
          <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Resumen de transacción segura</p>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          {step === 'cart' && (
            <div className="space-y-6">
              <h3 className="font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">Productos Seleccionados</h3>
              {items.length === 0 ? (
                <div className="py-20 text-center space-y-4 opacity-20">
                  <ShoppingCart size={48} className="mx-auto" />
                  <p className="font-black uppercase tracking-widest text-xs">Carrito Vacío</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map(item => (
                    <motion.div layout key={item.id} className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl group">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-slate-900 uppercase truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{item.quantity} x ${item.price.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-china-red">${(item.price * item.quantity).toFixed(2)}</span>
                        <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-china-red transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'shipping' && (
            <div className="space-y-8">
              <h3 className="font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">Logística Urbano</h3>
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Destinatario</label>
                  <input 
                    placeholder="Nombre Completo" 
                    className="china-input text-sm"
                    value={shippingData.name}
                    onChange={e => setShippingData({...shippingData, name: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dirección de Entrega</label>
                  <input 
                    placeholder="Calle, Número, Referencia" 
                    className="china-input text-sm"
                    value={shippingData.address}
                    onChange={e => setShippingData({...shippingData, address: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ciudad</label>
                    <select 
                      className="china-input text-sm"
                      value={shippingData.city}
                      onChange={e => setShippingData({...shippingData, city: e.target.value})}
                    >
                      <option value="Quito">Quito</option>
                      <option value="Guayaquil">Guayaquil</option>
                      <option value="Cuenca">Cuenca</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Teléfono</label>
                    <input 
                      placeholder="099..." 
                      className="china-input text-sm"
                      value={shippingData.phone}
                      onChange={e => setShippingData({...shippingData, phone: e.target.value})}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'payment' && (
            <div className="space-y-8">
              <h3 className="font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">Confirmación de Pago</h3>
              <div className="bg-china-black text-white p-8 rounded-[32px] space-y-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-china-red/20 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                <div className="flex justify-between items-start relative z-10">
                  <CreditCard size={40} className="text-china-gold" />
                  <div className="text-right">
                    <p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Total Orden</p>
                    <p className="text-3xl font-black text-china-gold">${finalTotal.toFixed(2)}</p>
                  </div>
                </div>
                <div className="pt-8 relative z-10">
                  <p className="text-lg font-black tracking-[0.3em]">•••• •••• •••• 4242</p>
                  <p className="text-[10px] font-black opacity-40 mt-3 uppercase tracking-[0.2em]">{user?.full_name}</p>
                </div>
              </div>
              <div className="space-y-3 bg-slate-50 p-6 rounded-2xl">
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                  <span className="text-slate-400">Subtotal</span>
                  <span className="text-slate-900">${total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                  <span className="text-slate-400">Envío Urbano</span>
                  <span className="text-emerald-500">${shippingCost.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-8 bg-slate-50 border-t border-slate-100 space-y-6">
          {errorMessage && (
            <p className="text-china-red text-[10px] font-black uppercase tracking-widest">{errorMessage}</p>
          )}
          <div className="flex justify-between items-end">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Total Final</span>
            <span className="text-4xl font-black text-china-red leading-none">${(step === 'payment' ? finalTotal : total).toFixed(2)}</span>
          </div>
          
          <div className="flex gap-4">
            {step !== 'cart' && (
              <button 
                onClick={() => setStep(step === 'shipping' ? 'cart' : 'shipping')}
                className="px-6 py-4 rounded-2xl font-black text-slate-400 hover:bg-slate-200 transition-colors uppercase text-[10px] tracking-widest"
              >
                Atrás
              </button>
            )}
            
            {step === 'cart' && (
              <button 
                onClick={() => setStep('shipping')}
                disabled={items.length === 0}
                className="flex-1 china-btn-primary flex items-center justify-center gap-3"
              >
                Continuar al Envío
                <ChevronRight size={20} />
              </button>
            )}

            {step === 'shipping' && (
              <button 
                onClick={handleGetQuote}
                disabled={!shippingData.address || loading}
                className="flex-1 china-btn-primary flex items-center justify-center gap-3"
              >
                {loading ? <Loader2 className="animate-spin" /> : <Truck size={20} />}
                Cotizar Envío
              </button>
            )}

            {step === 'payment' && (
              <button 
                onClick={handleCheckout}
                disabled={loading}
                className="flex-1 china-btn-gold flex items-center justify-center gap-3"
              >
                {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={20} />}
                Finalizar Orden
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Success Modal */}
      <AnimatePresence>
        {step === 'success' && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-china-black/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="relative bg-white w-full max-w-lg rounded-[60px] p-12 text-center shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-china-red"></div>
              <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                <CheckCircle2 size={56} />
              </div>
              <h2 className="text-4xl font-black uppercase tracking-tighter mb-4">¡Orden Generada!</h2>
              <p className="text-slate-500 font-medium mb-10">La transacción ha sido procesada y la guía de Urbano está lista.</p>
              
              <div className="bg-slate-50 p-8 rounded-[32px] text-left space-y-4 mb-10">
                <div className="flex justify-between text-sm font-bold uppercase tracking-widest">
                  <span className="text-slate-400">Orden #:</span>
                  <span className="text-slate-900">{orderResult?.orderNumber}</span>
                </div>
                <div className="flex justify-between text-sm font-bold uppercase tracking-widest">
                  <span className="text-slate-400">Guía Urbano:</span>
                  <span className="text-china-red">{orderResult?.guide}</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={generatePDF}
                  className="flex items-center justify-center gap-3 bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-china-red transition-all"
                >
                  <FileText size={20} />
                  Factura PDF
                </button>
                <button 
                  onClick={() => { setStep('cart'); setOrderResult(null); }}
                  className="china-btn-primary py-5 text-[10px]"
                >
                  Nueva Orden
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NewOrder;
