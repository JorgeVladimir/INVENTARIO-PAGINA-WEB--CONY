import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  ArrowRight, 
  CheckCircle2,
  FileText,
  Truck,
  CreditCard,
  Loader2,
  ChevronLeft,
  ShieldCheck,
  X,
  UserPlus,
  LockKeyhole
} from 'lucide-react';
import { useCart } from '../CartContext';
import { Link, useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const CartPage: React.FC = () => {
  const { items, addToCart, removeFromCart, clearCart, total } = useCart();
  const [step, setStep] = useState<'cart' | 'checkout' | 'success'>('cart');
  const [loading, setLoading] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const navigate = useNavigate();

  const [shippingData, setShippingData] = useState({
    name: '',
    address: '',
    phone: '',
    city: 'Quito',
    email: ''
  });

  const [userData, setUserData] = useState({
    full_name: '',
    email: '',
    password: ''
  });

  const [cardData, setCardData] = useState({
    cardNumber: '',
    cardName: '',
    expiry: '',
    cvv: ''
  });

  const mapUbigeoByCity: Record<string, string> = {
    Quito: '170150',
    Guayaquil: '090150',
    Cuenca: '010150',
    Manta: '130150'
  };

  const formatCardNumber = (value: string) => value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  const formatExpiry = (value: string) => {
    const clean = value.replace(/\D/g, '').slice(0, 4);
    if (clean.length <= 2) return clean;
    return `${clean.slice(0, 2)}/${clean.slice(2)}`;
  };

  const handleConfirmPayment = async () => {
    if (!shippingData.address || !shippingData.name || !shippingData.phone || !shippingData.email) {
      setPaymentError('Completa los datos de entrega antes de confirmar.');
      return;
    }
    if (!userData.full_name || !userData.email || !userData.password) {
      setPaymentError('Completa el registro de usuario para continuar.');
      return;
    }
    if (cardData.cardNumber.replace(/\s/g, '').length !== 16 || !cardData.cardName || cardData.expiry.length !== 5 || cardData.cvv.length < 3) {
      setPaymentError('Completa correctamente los datos de la tarjeta.');
      return;
    }

    setLoading(true);
    setPaymentError('');
    setErrorMessage('');

    try {
      const registerResponse = await fetch('/api/public/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });

      if (!registerResponse.ok) {
        const data = await registerResponse.json().catch(() => ({}));
        setPaymentError(data.error || 'No se pudo registrar el usuario.');
        return;
      }

      const registeredUser = await registerResponse.json();

      const orderResponse = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: registeredUser.id,
          items: items.map(i => ({ id: i.id, quantity: i.quantity, price: i.price })),
          total: total + 5.00
        })
      });

      if (!orderResponse.ok) {
        const data = await orderResponse.json().catch(() => ({}));
        setPaymentError(data.error || 'No se pudo generar el pedido.');
        return;
      }

      const orderData = await orderResponse.json();

      const checkoutResponse = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderData.id,
          shipping_data: {
            ...shippingData,
            ubigeo: mapUbigeoByCity[shippingData.city] || '170150',
            weight: 2.5,
            pieces: items.length,
            items
          },
          payment_method: 'card'
        })
      });

      if (!checkoutResponse.ok) {
        const data = await checkoutResponse.json().catch(() => ({}));
        setPaymentError(data.error || 'No se pudo procesar el pago.');
        return;
      }

      const checkoutData = await checkoutResponse.json();
      setOrderResult({
        ...orderData,
        guide: checkoutData.shipping_guide,
        orderedItems: [...items],
        subtotal: total,
        shippingCost: 5.00,
        finalTotal: total + 5.00,
      });
      setIsPaymentModalOpen(false);
      setStep('success');
      clearCart();
    } catch (e) {
      console.error(e);
      setPaymentError('Error de conexión con el servidor. Verifica que el backend esté activo.');
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
    doc.text('SINOSTOCK - ORDEN DE COMPRA', 105, 20, { align: 'center' });
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text(`Orden #: ${orderResult.orderNumber}`, 20, 50);
    doc.text(`Cliente: ${shippingData.name}`, 20, 60);
    doc.text(`Dirección: ${shippingData.address}, ${shippingData.city}`, 20, 70);

    const tableData = (orderResult?.orderedItems || []).map((item: any) => [
      item.internal_code,
      item.name,
      item.quantity,
      `$${item.price.toFixed(2)}`,
      `$${(item.price * item.quantity).toFixed(2)}`
    ]);

    doc.autoTable({
      startY: 80,
      head: [['Código', 'Producto', 'Cant.', 'P. Unit', 'Subtotal']],
      body: tableData,
      headStyles: { fillColor: [196, 30, 58] },
      foot: [
        ['', '', '', 'Subtotal', `$${(orderResult?.subtotal || 0).toFixed(2)}`],
        ['', '', '', 'Envío', `$${(orderResult?.shippingCost || 0).toFixed(2)}`],
        ['', '', '', 'TOTAL', `$${(orderResult?.finalTotal || 0).toFixed(2)}`]
      ]
    });

    doc.save(`Orden_${orderResult.orderNumber}.pdf`);
  };

  if (items.length === 0 && step !== 'success') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-8">
        <div className="w-32 h-32 bg-slate-50 rounded-full flex items-center justify-center shadow-inner">
          <ShoppingCart size={64} className="text-slate-200" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black uppercase tracking-tighter">Tu carrito está vacío</h2>
          <p className="text-slate-400 font-medium">Parece que aún no has agregado productos a tu compra.</p>
        </div>
        <Link to="/productos" className="bg-china-red text-white px-10 py-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-2xl hover:scale-105 transition-transform flex items-center gap-3">
          Ir a la Tienda
          <ArrowRight size={20} />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-8 py-20">
      <div className="flex flex-col lg:flex-row gap-16">
        {/* Main Content */}
        <div className="flex-1 space-y-12">
          <header className="space-y-2">
            <h1 className="text-5xl font-black tracking-tighter uppercase">Tu Carrito</h1>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Revisa tus productos antes de finalizar</p>
          </header>

          {step === 'cart' ? (
            <div className="space-y-6">
              {items.map(item => (
                <motion.div 
                  layout
                  key={item.id} 
                  className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-8 group hover:shadow-xl transition-all"
                >
                  <img src={item.image_url} className="w-32 h-32 rounded-3xl object-cover shadow-lg" alt={item.name} />
                  <div className="flex-1 space-y-2 text-center md:text-left">
                    <p className="text-[10px] font-black text-china-red uppercase tracking-widest">{item.internal_code}</p>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{item.name}</h3>
                    <p className="text-sm text-slate-400 font-medium">Precio Unitario: ${item.price.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-6 bg-slate-50 p-2 rounded-2xl">
                    <button onClick={() => addToCart(item, -1)} className="w-10 h-10 flex items-center justify-center hover:bg-white rounded-xl transition-colors"><Minus size={18} /></button>
                    <span className="text-lg font-black w-8 text-center">{item.quantity}</span>
                    <button onClick={() => addToCart(item, 1)} className="w-10 h-10 flex items-center justify-center hover:bg-white rounded-xl transition-colors"><Plus size={18} /></button>
                  </div>
                  <div className="text-right min-w-[120px]">
                    <p className="text-2xl font-black text-slate-900">${(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                  <button onClick={() => removeFromCart(item.id)} className="p-4 text-slate-300 hover:text-china-red transition-colors">
                    <Trash2 size={24} />
                  </button>
                </motion.div>
              ))}
            </div>
          ) : step === 'checkout' ? (
            <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-xl space-y-10">
              <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
                <div className="w-12 h-12 bg-china-red text-white rounded-2xl flex items-center justify-center shadow-lg">
                  <Truck size={24} />
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tight">Datos de Entrega</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre Completo</label>
                  <input 
                    className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-medium focus:ring-2 focus:ring-china-red/10 transition-all"
                    placeholder="Ej: Juan Pérez"
                    value={shippingData.name}
                    onChange={e => setShippingData({...shippingData, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Correo Electrónico</label>
                  <input 
                    className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-medium focus:ring-2 focus:ring-china-red/10 transition-all"
                    placeholder="juan@ejemplo.com"
                    value={shippingData.email}
                    onChange={e => setShippingData({...shippingData, email: e.target.value})}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dirección de Envío</label>
                  <input 
                    className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-medium focus:ring-2 focus:ring-china-red/10 transition-all"
                    placeholder="Calle, Número, Referencia..."
                    value={shippingData.address}
                    onChange={e => setShippingData({...shippingData, address: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ciudad</label>
                  <select 
                    className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-medium focus:ring-2 focus:ring-china-red/10 transition-all"
                    value={shippingData.city}
                    onChange={e => setShippingData({...shippingData, city: e.target.value})}
                  >
                    <option>Quito</option>
                    <option>Guayaquil</option>
                    <option>Cuenca</option>
                    <option>Manta</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Teléfono de Contacto</label>
                  <input 
                    className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-medium focus:ring-2 focus:ring-china-red/10 transition-all"
                    placeholder="099 XXX XXXX"
                    value={shippingData.phone}
                    onChange={e => setShippingData({...shippingData, phone: e.target.value})}
                  />
                </div>
              </div>

              {errorMessage && (
                <div className="text-china-red text-xs font-black uppercase tracking-widest border-t border-china-red/20 pt-4">
                  {errorMessage}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Order Summary */}
        <aside className="w-full lg:w-96">
          <div className="bg-slate-900 text-white p-10 rounded-[40px] shadow-2xl space-y-10 sticky top-32">
            <h2 className="text-2xl font-black uppercase tracking-tight border-b border-white/10 pb-6">Resumen</h2>
            
            <div className="space-y-4">
              <div className="flex justify-between text-sm font-bold text-white/60 uppercase tracking-widest">
                <span>Subtotal</span>
                <span className="text-white">${total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white/60 uppercase tracking-widest">
                <span>Envío</span>
                <span className="text-emerald-400">$5.00</span>
              </div>
              <div className="pt-6 border-t border-white/10 flex justify-between items-end">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-china-gold">Total a Pagar</span>
                <span className="text-4xl font-black">${(total + 5).toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-4">
              {step === 'cart' ? (
                <button 
                  onClick={() => {
                    setErrorMessage('');
                    setStep('checkout');
                  }}
                  className="w-full bg-china-red text-white py-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl hover:bg-white hover:text-china-red transition-all flex items-center justify-center gap-3"
                >
                  Continuar al Pago
                  <ArrowRight size={20} />
                </button>
              ) : step === 'checkout' ? (
                <div className="space-y-4">
                  <button 
                    onClick={() => {
                      setPaymentError('');
                      setUserData((prev) => ({
                        ...prev,
                        full_name: shippingData.name || prev.full_name,
                        email: shippingData.email || prev.email,
                      }));
                      setIsPaymentModalOpen(true);
                    }}
                    disabled={loading || !shippingData.address || !shippingData.name || !shippingData.email || !shippingData.phone}
                    className="w-full bg-emerald-500 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl hover:bg-white hover:text-emerald-500 transition-all flex items-center justify-center gap-3 disabled:bg-slate-700 disabled:text-white/30"
                  >
                    <CreditCard size={20} />
                    Ventana de Pago
                  </button>
                  <button 
                    onClick={() => setStep('cart')}
                    className="w-full text-white/40 font-black uppercase tracking-widest text-[10px] hover:text-white transition-colors flex items-center justify-center gap-2"
                  >
                    <ChevronLeft size={14} />
                    Volver al Carrito
                  </button>
                </div>
              ) : null}
            </div>

            <div className="pt-6 text-center">
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center justify-center gap-2">
                <ShieldCheck size={14} />
                Pago 100% Seguro y Encriptado
              </p>
            </div>
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {isPaymentModalOpen && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-china-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, y: 30, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }} className="relative w-full max-w-3xl bg-white rounded-[36px] shadow-2xl p-8 md:p-10 space-y-8">
              <div className="flex items-start justify-between border-b border-slate-100 pb-5">
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-china-red">Pago Seguro</p>
                  <h3 className="text-2xl font-black uppercase tracking-tight">Registro de Usuario y Tarjeta</h3>
                </div>
                <button onClick={() => setIsPaymentModalOpen(false)} className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-500" title="Cerrar ventana de pago" aria-label="Cerrar ventana de pago">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-900">
                    <UserPlus size={18} className="text-china-red" />
                    <p className="text-sm font-black uppercase tracking-widest">Registro de Usuario</p>
                  </div>
                  <input className="china-input text-sm" placeholder="Nombre completo" value={userData.full_name} onChange={(e) => setUserData({ ...userData, full_name: e.target.value })} />
                  <input className="china-input text-sm" placeholder="Correo" type="email" value={userData.email} onChange={(e) => setUserData({ ...userData, email: e.target.value })} />
                  <input className="china-input text-sm" placeholder="Contraseña" type="password" value={userData.password} onChange={(e) => setUserData({ ...userData, password: e.target.value })} />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-900">
                    <LockKeyhole size={18} className="text-china-red" />
                    <p className="text-sm font-black uppercase tracking-widest">Datos de Tarjeta</p>
                  </div>
                  <input className="china-input text-sm" placeholder="Número de tarjeta" value={cardData.cardNumber} onChange={(e) => setCardData({ ...cardData, cardNumber: formatCardNumber(e.target.value) })} />
                  <input className="china-input text-sm" placeholder="Nombre en tarjeta" value={cardData.cardName} onChange={(e) => setCardData({ ...cardData, cardName: e.target.value })} />
                  <div className="grid grid-cols-2 gap-4">
                    <input className="china-input text-sm" placeholder="MM/AA" value={cardData.expiry} onChange={(e) => setCardData({ ...cardData, expiry: formatExpiry(e.target.value) })} />
                    <input className="china-input text-sm" placeholder="CVV" value={cardData.cvv} onChange={(e) => setCardData({ ...cardData, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-5 flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-widest text-slate-500">Total a pagar</span>
                <span className="text-3xl font-black text-china-red">${(total + 5).toFixed(2)}</span>
              </div>

              {(paymentError || errorMessage) && (
                <p className="text-china-red text-[11px] font-black uppercase tracking-widest border-t border-china-red/20 pt-4">
                  {paymentError || errorMessage}
                </p>
              )}

              <button onClick={handleConfirmPayment} disabled={loading} className="w-full china-btn-primary !py-5 flex items-center justify-center gap-3 disabled:opacity-70">
                {loading ? <Loader2 className="animate-spin" /> : <CreditCard size={18} />}
                Confirmar Pago
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {step === 'success' && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-slate-900/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="relative bg-white w-full max-w-2xl rounded-[60px] p-16 text-center shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-china-red"></div>
              <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                <CheckCircle2 size={56} />
              </div>
              <h2 className="text-5xl font-black uppercase tracking-tighter mb-4">¡Pedido Recibido!</h2>
              <p className="text-slate-500 text-lg font-medium mb-12">Gracias por confiar en SinoStock. Tu orden ha sido procesada con éxito.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                <div className="bg-slate-50 p-8 rounded-[32px] text-left space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detalles de Orden</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-slate-400">Número:</span>
                      <span>{orderResult?.orderNumber}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-slate-400">Guía Urbano:</span>
                      <span className="text-china-red">{orderResult?.guide}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 p-8 rounded-[32px] text-left space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entrega Estimada</p>
                  <div className="flex items-center gap-4">
                    <Truck size={32} className="text-china-red" />
                    <div>
                      <p className="text-sm font-black uppercase tracking-tight">24 - 48 Horas</p>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{shippingData.city}, Ecuador</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col md:flex-row gap-4">
                <button 
                  onClick={generatePDF}
                  className="flex-1 flex items-center justify-center gap-3 bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:bg-china-red transition-all"
                >
                  <FileText size={20} />
                  Descargar Factura
                </button>
                <button 
                  onClick={() => navigate('/')}
                  className="flex-1 bg-china-red text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:bg-slate-900 transition-all"
                >
                  Volver al Inicio
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CartPage;
