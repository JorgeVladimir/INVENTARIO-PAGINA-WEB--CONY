import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Search, Filter, Plus, Package, Box, MapPin } from 'lucide-react';
import { Product, Category, Container, Warehouse } from '../types';

const Inventory: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedContainer, setSelectedContainer] = useState('all');

  useEffect(() => {
    Promise.all([
      fetch('/api/products').then(res => res.json()),
      fetch('/api/categories').then(res => res.json()),
      fetch('/api/containers').then(res => res.json()),
      fetch('/api/warehouses').then(res => res.json()),
    ]).then(([p, c, cont, w]) => {
      setProducts(p);
      setCategories(c);
      setContainers(cont);
      setWarehouses(w);
    });
  }, []);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                         p.internal_code.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category_id === parseInt(selectedCategory);
    const matchesContainer = selectedContainer === 'all' || p.container_id === parseInt(selectedContainer);
    return matchesSearch && matchesCategory && matchesContainer;
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Header Section */}
      <div className="bg-china-red text-white py-16 md:py-24 px-6 md:px-12">
        <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
          <div className="inline-flex items-center gap-2 bg-china-gold text-china-red px-4 py-1.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] shadow-xl">
            <Box size={14} />
            Gestión de Inventario Global
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none">Catálogo de<br/>Importaciones</h1>
          <p className="text-white/60 font-medium tracking-widest uppercase text-xs md:text-sm max-w-xl">Control total de stock, contenedores y logística de arribo para Cony Importadora.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 -mt-12 md:-mt-16">
        {/* Filters Bar */}
        <div className="bg-white rounded-[32px] md:rounded-[40px] p-6 md:p-10 flex flex-col lg:flex-row gap-6 md:gap-10 items-stretch lg:items-end shadow-2xl border border-slate-100">
          <div className="flex-1 space-y-3">
            <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Búsqueda Inteligente</label>
            <div className="relative group">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-china-red transition-colors" size={20} />
              <input 
                type="text" 
                placeholder="Nombre, Código SKU..." 
                className="w-full pl-14 pr-6 py-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-china-red/5 font-medium transition-all text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            <div className="space-y-3">
              <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Categoría</label>
              <div className="relative">
                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select 
                  className="w-full bg-slate-50 border-none rounded-2xl pl-12 pr-10 py-4 font-black uppercase text-[9px] md:text-[10px] tracking-widest text-slate-600 focus:ring-4 focus:ring-china-red/5 appearance-none cursor-pointer"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="all">Todas las Colecciones</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Logística</label>
              <div className="relative">
                <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select 
                  className="w-full bg-slate-50 border-none rounded-2xl pl-12 pr-10 py-4 font-black uppercase text-[9px] md:text-[10px] tracking-widest text-slate-600 focus:ring-4 focus:ring-china-red/5 appearance-none cursor-pointer"
                  value={selectedContainer}
                  onChange={(e) => setSelectedContainer(e.target.value)}
                >
                  <option value="all">Todos los Contenedores</option>
                  {containers.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
              </div>
            </div>
          </div>

          <button className="china-btn-primary h-[58px] flex items-center justify-center gap-3">
            <Plus size={20} />
            Nuevo
          </button>
        </div>

        {/* Product Grid */}
        <div className="py-12 md:py-24 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 md:gap-x-10 gap-y-12 md:gap-y-20">
          {filteredProducts.map((product, idx) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="group cursor-pointer space-y-8"
            >
              <div className="relative aspect-[4/5] overflow-hidden rounded-[48px] bg-slate-50 shadow-sm group-hover:shadow-2xl transition-all duration-500">
                <img 
                  src={product.image_url} 
                  alt={product.name} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                />
                <div className="absolute top-6 left-6">
                  <span className="bg-white/90 backdrop-blur text-china-red text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
                    {product.category_name}
                  </span>
                </div>
                {product.stock < 20 && (
                  <div className="absolute bottom-6 right-6">
                    <span className="bg-china-red text-white text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg animate-pulse">
                      Stock Crítico
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-china-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <button className="china-btn-gold !py-3 !px-6">Editar Detalles</button>
                </div>
              </div>
              
              <div className="space-y-3 px-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">{product.internal_code}</p>
                <h3 className="text-xl font-black text-china-black uppercase tracking-tight group-hover:text-china-red transition-colors leading-tight">{product.name}</h3>
                <div className="flex items-center gap-6 pt-2">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Precio Venta</p>
                    <span className="text-2xl font-black text-china-black">${product.price.toFixed(2)}</span>
                  </div>
                  <div className="h-8 w-[1px] bg-slate-100"></div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Disponible</p>
                    <span className="text-lg font-black text-slate-600">{product.stock} Unid.</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="py-48 text-center space-y-8 bg-slate-50 rounded-[80px]">
            <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mx-auto shadow-xl">
              <Package size={64} className="text-slate-200" />
            </div>
            <div className="space-y-2">
              <h2 className="text-4xl font-black uppercase tracking-tighter">Sin Existencias</h2>
              <p className="text-slate-400 font-medium">No encontramos productos con los criterios seleccionados.</p>
            </div>
            <button 
              onClick={() => { setSearch(''); setSelectedCategory('all'); setSelectedContainer('all'); }}
              className="china-btn-primary"
            >
              Restablecer Filtros
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inventory;
