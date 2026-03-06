import React, { useState, useEffect } from 'react';
import { Search, Filter, Package, Box } from 'lucide-react';

type DashboardProduct = {
  id: string;
  codbarras: string;
  nombre: string;
  descripcion: string;
  grupo: string;
  imagen: string;
  precioBulto: number;
  precioMayor: number;
  precioUnidad: number;
  stock: number;
};

const readValue = (row: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const foundKey = Object.keys(row).find((current) => current.toLowerCase() === key.toLowerCase());
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) return row[foundKey];
  }
  return null;
};

const toText = (value: any) => (value === null || value === undefined ? '' : String(value).trim());
const toNumber = (value: any, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeProduct = (row: Record<string, any>, index: number): DashboardProduct => {
  const codbarras =
    toText(readValue(row, ['codbarras', 'codigo_barras', 'codbarra'])) ||
    toText(readValue(row, ['codigoproduc', 'codigoproducto', 'codigo'])) ||
    `SIN-CODIGO-${index + 1}`;

  return {
    id: toText(readValue(row, ['id'])) || `${codbarras}-${index}`,
    codbarras,
    nombre: toText(readValue(row, ['nombre', 'nombre_corto', 'nombrecorto', 'codigoproduc', 'codigoproducto'])) || codbarras,
    descripcion: toText(readValue(row, ['descripcion', 'detalle', 'nombre'])) || codbarras,
    grupo: toText(readValue(row, ['grupo'])) || 'Sin grupo',
    imagen: toText(readValue(row, ['imagen', 'foto', 'image_url'])),
    precioBulto: toNumber(readValue(row, ['precio_bulto', 'preciobulto', 'bulto']), 0),
    precioMayor: toNumber(readValue(row, ['precio_mayorista', 'precio_mayor', 'preciomayor', 'mayorista', 'mayor']), 0),
    precioUnidad: toNumber(readValue(row, ['precio_unidad', 'preciounidad', 'unidad', 'precio']), 0),
    stock: toNumber(readValue(row, ['stock', 'cantidadstock', 'totalcantidad']), 0),
  };
};

const Inventory: React.FC = () => {
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');

  const fallbackImage = `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="#f1f5f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="Arial" font-size="22">Sin imagen</text></svg>'
  )}`;

  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      setLoadError('');
      try {
        const response = await fetch('/api/ecommerce/productos');
        const data = response.ok ? await response.json() : [];
        const normalized = Array.isArray(data)
          ? data.map((row, index) => normalizeProduct(row, index))
          : [];

        setProducts(normalized);

        if (!response.ok) {
          setLoadError('No se pudo cargar el inventario. Reintenta en unos segundos.');
        }
      } catch {
        setProducts([]);
        setLoadError('Error al cargar inventario. Verifica conexión con el backend.');
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, []);

  const groups = Array.from(
    new Set(products.map((product) => product.grupo).filter((group) => group.length > 0))
  ).sort((a, b) => a.localeCompare(b));

  const filteredProducts = products.filter((product) => {
    const matchesCode = product.codbarras.toLowerCase().includes(search.toLowerCase());
    const matchesGroup = selectedGroup === 'all' || product.grupo === selectedGroup;
    return matchesCode && matchesGroup;
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
            <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Código</label>
            <div className="relative group">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-china-red transition-colors" size={20} />
              <input 
                type="text" 
                placeholder="Buscar por código de barras..." 
                className="w-full pl-14 pr-6 py-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-china-red/5 font-medium transition-all text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-1 gap-4 md:gap-6 min-w-[260px]">
            <div className="space-y-3">
              <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Grupo</label>
              <div className="relative">
                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select 
                  aria-label="Filtrar por grupo"
                  title="Filtrar por grupo"
                  className="w-full bg-slate-50 border-none rounded-2xl pl-12 pr-10 py-4 font-black uppercase text-[9px] md:text-[10px] tracking-widest text-slate-600 focus:ring-4 focus:ring-china-red/5 appearance-none cursor-pointer"
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                >
                  <option value="all">Todos los grupos</option>
                  {groups.map((group) => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Product Grid */}
        {loadError && (
          <div className="mt-10 rounded-2xl border border-red-100 bg-red-50 px-6 py-4 text-sm font-semibold text-red-700">
            {loadError}
          </div>
        )}

        {loadingData ? (
          <div className="py-24 text-center text-slate-500 font-semibold">Cargando inventario...</div>
        ) : (
        <div className="py-12 md:py-24 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 md:gap-x-10 gap-y-12 md:gap-y-20">
          {filteredProducts.map((product) => {
            const productImage = product.imagen.trim();
            const safeStock = Number.isFinite(product.stock) ? product.stock : 0;

            return (
            <div
              key={product.id}
              className="group cursor-pointer space-y-8"
            >
              <div className="relative aspect-[4/5] overflow-hidden rounded-[48px] bg-slate-50 shadow-sm group-hover:shadow-2xl transition-all duration-500">
                {productImage ? (
                  <img
                    src={productImage}
                    alt={product.descripcion}
                    loading="lazy"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (target.src !== fallbackImage) {
                        target.src = fallbackImage;
                      }
                    }}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                ) : (
                  <img
                    src={fallbackImage}
                    alt={product.descripcion}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute top-6 left-6">
                  <span className="bg-white/90 backdrop-blur text-china-red text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
                    {product.codbarras}
                  </span>
                </div>
                {safeStock < 20 && (
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
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">{product.grupo}</p>
                <h3 className="text-xl font-black text-china-black uppercase tracking-tight group-hover:text-china-red transition-colors leading-tight">{product.nombre}</h3>
                <p className="text-xs font-semibold text-slate-500 line-clamp-2">{product.descripcion}</p>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Precio Bulto</p>
                    <span className="text-base font-black text-china-black">${product.precioBulto.toFixed(2)}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Precio Mayor</p>
                    <span className="text-base font-black text-china-black">${product.precioMayor.toFixed(2)}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Precio Unidad</p>
                    <span className="text-base font-black text-china-black">${product.precioUnidad.toFixed(2)}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Stock</p>
                    <span className="text-base font-black text-slate-600">{safeStock} Unid.</span>
                  </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>
        )}

        {filteredProducts.length === 0 && (
          <div className="py-48 text-center space-y-8 bg-slate-50 rounded-[80px]">
            <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mx-auto shadow-xl">
              <Package size={64} className="text-slate-200" />
            </div>
            <div className="space-y-2">
              <h2 className="text-4xl font-black uppercase tracking-tighter">Sin Existencias</h2>
              <p className="text-slate-400 font-medium">No encontramos productos con el código o grupo seleccionado.</p>
            </div>
            <button 
              onClick={() => { setSearch(''); setSelectedGroup('all'); }}
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
