import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowRight, 
  Zap, 
  ShieldCheck, 
  Truck, 
  Globe,
  ChevronRight,
  Star
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Product } from '../types';

const Home: React.FC = () => {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetch('/api/public/products')
      .then(res => res.json())
      .then(data => setFeaturedProducts(data.slice(0, 4)));
  }, []);

  return (
    <div className="space-y-20 pb-20">
      {/* Hero Banner */}
      <section className="relative h-[60vh] md:h-[80vh] bg-slate-900 overflow-hidden flex items-center">
        <img 
          src="https://picsum.photos/seed/china-cargo/1920/1080?blur=2" 
          className="absolute inset-0 w-full h-full object-cover opacity-50"
          alt="Hero"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-china-red/80 to-transparent"></div>
        
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-6 md:space-y-8"
          >
            <div className="inline-flex items-center gap-2 bg-china-gold text-china-red px-4 py-1.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] shadow-xl">
              <Zap size={14} />
              Nuevos Contenedores Arribando
            </div>
            <h1 className="text-4xl md:text-7xl font-black text-white tracking-tighter leading-[0.9]">
              IMPORTACIONES <br/>
              <span className="text-china-gold">PREMIUM CONY</span> <br/>
              SIN FRONTERAS
            </h1>
            <p className="text-lg md:text-xl text-white/80 font-medium max-w-lg">
              Importamos lo mejor de China directamente a tu puerta en Ecuador. Precios de fábrica, garantía local.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/productos" className="bg-white text-china-red px-8 md:px-10 py-4 md:py-5 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm shadow-2xl hover:scale-105 transition-transform flex items-center justify-center gap-3">
                Explorar Catálogo
                <ArrowRight size={20} />
              </Link>
              <button className="border-2 border-white/30 text-white px-8 md:px-10 py-4 md:py-5 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm hover:bg-white/10 transition-colors">
                Nuestra Empresa
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="hidden lg:block relative"
          >
            <div className="absolute -inset-10 bg-china-gold/20 rounded-full blur-3xl animate-pulse"></div>
            <img 
              src="https://picsum.photos/seed/tech-prod/800/800" 
              className="relative z-10 w-full aspect-square object-cover rounded-[60px] shadow-2xl border-8 border-white/10"
              alt="Featured Product"
            />
            <div className="absolute -bottom-10 -left-10 bg-white p-8 rounded-[40px] shadow-2xl z-20 max-w-[240px] space-y-2">
              <div className="flex text-china-gold">
                {[1,2,3,4,5].map(i => <Star key={i} size={16} fill="currentColor" />)}
              </div>
              <p className="font-black text-slate-900 text-lg leading-tight">Calidad Premium Garantizada</p>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">+10k Clientes Felices</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 md:px-8 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
        {[
          { icon: ShieldCheck, title: 'Garantía Total', desc: 'Todos nuestros productos cuentan con respaldo técnico y garantía de cambio inmediato.' },
          { icon: Truck, title: 'Envío Express', desc: 'Logística optimizada para entregas en 24/48 horas a nivel nacional con Urbano.' },
          { icon: Globe, title: 'Precios Directos', desc: 'Eliminamos intermediarios para ofrecerte el mejor precio del mercado ecuatoriano.' },
        ].map((f, i) => (
          <div key={i} className="group p-10 bg-white rounded-[40px] border border-slate-100 shadow-sm hover:shadow-2xl transition-all hover:-translate-y-2">
            <div className="w-16 h-16 bg-china-red/5 text-china-red rounded-2xl flex items-center justify-center mb-8 group-hover:bg-china-red group-hover:text-white transition-colors shadow-lg">
              <f.icon size={32} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tight uppercase">{f.title}</h3>
            <p className="text-slate-500 font-medium leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Categories Grid */}
      <section className="max-w-7xl mx-auto px-6 md:px-8 space-y-8 md:space-y-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase">Categorías Populares</h2>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-2">Selección curada de importaciones</p>
          </div>
          <Link to="/productos" className="text-china-red font-black uppercase tracking-widest text-[10px] flex items-center gap-2 hover:underline">
            Ver Todo <ChevronRight size={16} />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {['Electrónica', 'Hogar', 'Juguetes', 'Moda', 'Herramientas'].map((cat, i) => (
            <div key={i} className="relative group cursor-pointer overflow-hidden rounded-[32px] aspect-[4/5] bg-slate-100">
              <img 
                src={`https://picsum.photos/seed/${cat}/600/800`} 
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-80"
                alt={cat}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-china-red to-transparent opacity-60 group-hover:opacity-90 transition-opacity"></div>
              <div className="absolute bottom-6 left-6 right-6">
                <h3 className="text-xl font-black text-white tracking-tighter uppercase">{cat}</h3>
                <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest mt-1">Explorar Colección</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Products */}
      <section className="bg-slate-50 py-12 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-8 space-y-8 md:space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter uppercase">Lo Más Vendido</h2>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] md:text-sm">Productos estrella con stock limitado</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            {featuredProducts.map((product) => (
              <motion.div
                key={product.id}
                whileHover={{ y: -10 }}
                className="bg-white rounded-[40px] overflow-hidden shadow-sm border border-slate-100 flex flex-col group"
              >
                <div className="relative aspect-square overflow-hidden bg-slate-100">
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[9px] font-black text-china-red uppercase tracking-widest shadow-sm">
                    {product.category_name}
                  </div>
                </div>
                <div className="p-8 flex-1 flex flex-col gap-4">
                  <h3 className="font-black text-lg text-slate-900 leading-tight uppercase tracking-tight group-hover:text-china-red transition-colors">{product.name}</h3>
                  <div className="mt-auto flex justify-between items-center">
                    <span className="text-2xl font-black text-slate-900">${product.price.toFixed(2)}</span>
                    <Link to="/productos" className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center hover:bg-china-red transition-colors shadow-lg">
                      <ArrowRight size={20} />
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
