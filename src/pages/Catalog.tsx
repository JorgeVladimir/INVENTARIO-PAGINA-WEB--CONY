import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Filter, 
  ShoppingCart, 
  Check,
  ChevronDown,
  LayoutGrid,
  List,
  X,
  Plus
} from 'lucide-react';
import { Product } from '../types';
import { useCart } from '../CartContext';
import { resolveProductImage } from '../utils/productImages';

const toText = (value: any) => (value === null || value === undefined ? '' : String(value).trim());
const toNumber = (value: any, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readValue = (row: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const foundKey = Object.keys(row).find((current) => current.toLowerCase() === key.toLowerCase());
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) return row[foundKey];
  }
  return null;
};

const normalizeCatalogProduct = (row: Record<string, any>, index: number): Product => {
  const itemCode =
    toText(readValue(row, ['codigoproduc', 'codigoproducto', 'codigo'])) ||
    `SIN-CODIGO-${index + 1}`;

  const codbarras =
    toText(readValue(row, ['codbarras', 'codigo_barras', 'codbarra'])) ||
    '9999999';

  const nombre =
    toText(readValue(row, ['nombre', 'nombre_corto', 'nombrecorto', 'codigoproduc', 'codigoproducto'])) ||
    itemCode;

  const descripcion = toText(readValue(row, ['descripcion', 'detalle', 'nombre'])) || nombre;
  const grupo = toText(readValue(row, ['grupo', 'categoria', 'categorianombre'])) || 'Sin grupo';
  const precioBulto = toNumber(readValue(row, ['precio_bulto', 'preciobulto', 'bulto']), 0);
  const precioMayorista = toNumber(readValue(row, ['precio_mayorista', 'precio_mayor', 'preciomayor', 'mayorista', 'mayor']), 0);
  const precioUnidad = toNumber(readValue(row, ['precio_unidad', 'preciounidad', 'unidad', 'precio']), 0);
  const costo = toNumber(readValue(row, ['costo', 'cost']), 0);
  const stock = toNumber(readValue(row, ['stock', 'cantidadstock', 'totalcantidad', 'total_cantidad']), 0);
  const imageUrl = toText(readValue(row, ['imagen', 'foto', 'image_url', 'imageurl']));
  const id = toNumber(readValue(row, ['id']), index + 1);

  return {
    id,
    internal_code: itemCode,
    name: nombre,
    codbarras,
    nombre,
    descripcion,
    grupo,
    category_id: 1,
    category_name: grupo,
    price: precioUnidad,
    precio_bulto: precioBulto,
    precio_mayorista: precioMayorista,
    precio_unidad: precioUnidad,
    cost: costo,
    stock,
    container_id: 1,
    warehouse_id: 1,
    image_url: imageUrl,
  };
};

const Catalog: React.FC = () => {
  type GroupOption = { value: string; total: number };
  const PAGE_SIZE = 500;
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [groupsFromDb, setGroupsFromDb] = useState<GroupOption[]>([]);
  const [visibleCount, setVisibleCount] = useState(60);
  const [nextOffset, setNextOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { addToCart } = useCart();
  const [addedId, setAddedId] = useState<number | null>(null);

  const fetchProducts = async (reset: boolean) => {
    if (isLoading) return;

    setIsLoading(true);
    const pageOffset = reset ? 0 : nextOffset;

    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(pageOffset));
      const trimmedSearch = search.trim();
      if (trimmedSearch) {
        params.set('q', trimmedSearch);
      }

      const response = await fetch(`/api/ecommerce/productos?${params.toString()}`);
      const payload = response.ok ? await response.json() : { items: [] };
      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
          ? payload.items
          : [];

      const normalized = rows.map((row, index) => normalizeCatalogProduct(row, pageOffset + index));
      const normalizedWithImage = normalized.map((product) => ({
        ...product,
        image_url: resolveProductImage(product),
      }));

      setProducts((prev) => (reset ? normalizedWithImage : [...prev, ...normalizedWithImage]));

      const serverTotal = Number(payload?.total || 0);
      const mergedCount = pageOffset + normalizedWithImage.length;
      setTotalCount(serverTotal > 0 ? serverTotal : mergedCount);
      setNextOffset(mergedCount);
      setHasMore(serverTotal > 0 ? mergedCount < serverTotal : normalizedWithImage.length === PAGE_SIZE);
    } catch {
      if (reset) {
        setProducts([]);
        setTotalCount(0);
        setNextOffset(0);
        setHasMore(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const response = await fetch('/api/ecommerce/grupos');
      if (!response.ok) return;

      const payload = await response.json();
      const rows = Array.isArray(payload?.items) ? payload.items : [];
      const normalized = rows
        .map((row: any) => ({
          value: toText(row?.grupo),
          total: toNumber(row?.total, 0),
        }))
        .filter((row: GroupOption) => row.value.length > 0);

      setGroupsFromDb(normalized);
    } catch {
      // Si falla, se mantiene fallback en frontend con grupos detectados de productos.
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisibleCount(60);
      fetchProducts(true);
      fetchGroups();
    }, 250);

    return () => clearTimeout(timer);
  }, [search]);

  const groupsFallback = Array.from(
    new Set<string>(products.map((p) => toText(p.grupo)).filter((group) => group.length > 0))
  ).sort((a, b) => String(a).localeCompare(String(b)));

  const groups = groupsFromDb.length > 0
    ? groupsFromDb.map((group) => group.value)
    : groupsFallback;

  const filteredProducts = products.filter(p => {
    const grupo = toText(p.grupo) || toText(p.category_name) || 'General';
    const matchesGroup = selectedGroup === 'all' || grupo === selectedGroup;
    return matchesGroup;
  });

  useEffect(() => {
    // Reset visual window when filters/search change to keep render responsive.
    setVisibleCount(60);
  }, [search, selectedGroup]);

  const visibleProducts = filteredProducts.slice(0, visibleCount);

  const handleAddToCart = (product: Product) => {
    addToCart(product, 1);
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-china-red text-white py-12 md:py-20 px-6 md:px-8">
        <div className="max-w-7xl mx-auto space-y-4">
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase">Catálogo Global</h1>
          <p className="text-white/60 font-medium tracking-widest uppercase text-[10px] md:text-sm">Explora miles de productos importados con garantía local</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-8 -mt-8 md:-mt-12 pb-12 md:pb-20">
        <div className="flex flex-col lg:flex-row gap-8 md:gap-12">
          {/* Sidebar Filters */}
          <aside className="w-full lg:w-72 space-y-8 md:space-y-10">
            <div className="bg-white border border-slate-100 p-6 md:p-8 rounded-[32px] md:rounded-[40px] shadow-xl space-y-8 md:space-y-10">
              {/* Search */}
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Búsqueda</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="¿Qué buscas?" 
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-china-red/10 transition-all"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Groups */}
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Grupo</label>
                <div className="flex flex-wrap lg:flex-col gap-2">
                  <button 
                    onClick={() => setSelectedGroup('all')}
                    className={`px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all ${selectedGroup === 'all' ? 'bg-china-red text-white shadow-lg' : 'text-slate-500 bg-slate-50 hover:bg-slate-100 lg:bg-transparent'}`}
                  >
                    Todos los grupos
                  </button>
                  {groups.map(group => (
                    <button 
                      key={group}
                      onClick={() => setSelectedGroup(group)}
                      className={`px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all ${selectedGroup === group ? 'bg-china-red text-white shadow-lg' : 'text-slate-500 bg-slate-50 hover:bg-slate-100 lg:bg-transparent'}`}
                    >
                      {group}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* Promo Card */}
            <div className="bg-china-gold rounded-[32px] md:rounded-[40px] p-6 md:p-8 text-china-red space-y-4">
              <h4 className="font-black text-lg md:text-xl leading-tight uppercase">Envío Gratis</h4>
              <p className="text-xs md:text-sm font-bold opacity-80">En compras mayores a $150. Solo este mes.</p>
              <button className="w-full bg-china-red text-white py-3 rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest shadow-lg">Saber Más</button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 space-y-6 md:space-y-8">
            <div className="flex justify-between items-center bg-slate-50 p-3 md:p-4 rounded-2xl md:rounded-3xl">
              <p className="text-xs md:text-sm font-bold text-slate-500 ml-2 md:ml-4">Mostrando <span className="text-slate-900">{visibleProducts.length}</span> de {totalCount || filteredProducts.length} productos</p>
              <div className="flex gap-2">
                <button className="p-2 bg-white rounded-xl shadow-sm text-china-red"><LayoutGrid size={18} md:size={20} /></button>
                <button className="p-2 text-slate-400 hover:text-slate-600"><List size={18} md:size={20} /></button>
              </div>
            </div>

            {isLoading && products.length === 0 && (
              <div className="bg-slate-50 rounded-[32px] p-10 text-center text-slate-500 font-semibold">
                Cargando productos...
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8">
              {visibleProducts.map((product, idx) => (
                (() => {
                  const codigoBarras = toText(product.codbarras) || '9999999';
                  const numeroArticulo = toText(product.internal_code) || codigoBarras;
                  const descripcion = toText(product.descripcion) || toText(product.nombre) || numeroArticulo;
                  const precioUnidad = toNumber(product.precio_unidad, product.price);

                  return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-white rounded-[40px] overflow-hidden shadow-sm border border-slate-100 flex flex-col group"
                >
                  <div className="relative aspect-square overflow-hidden bg-slate-100">
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[9px] font-black text-china-red uppercase tracking-widest shadow-sm">
                      {codigoBarras}
                    </div>
                  </div>
                  <div className="p-6 md:p-8 flex-1 flex flex-col gap-4 md:gap-6">
                    <div className="space-y-1 md:space-y-2">
                      <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Nro Artículo: {numeroArticulo}</p>
                      <h3 className="font-black text-base md:text-lg text-slate-900 leading-tight uppercase tracking-tight group-hover:text-china-red transition-colors line-clamp-3">{descripcion}</h3>
                      <p className="text-xs text-slate-500 font-semibold">Código de barras: {codigoBarras}</p>
                    </div>
                    
                    <div className="mt-auto space-y-4">
                      <div className="grid grid-cols-1 gap-3 text-xs">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ECUASOL P. UNITARIO</p>
                          <p className="font-black text-slate-900">${precioUnidad.toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button 
                          onClick={() => handleAddToCart(product)}
                          disabled={addedId === product.id}
                          className={`w-12 h-12 md:w-14 md:h-14 rounded-[16px] md:rounded-[20px] flex items-center justify-center transition-all shadow-xl active:scale-90 ${
                            addedId === product.id ? 'bg-emerald-500 text-white' : 'bg-china-red text-white hover:bg-slate-900'
                          }`}
                        >
                          {addedId === product.id ? <Check size={20} md:size={24} /> : <Plus size={20} md:size={24} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
                  );
                })()
              ))}
            </div>

            {visibleProducts.length < filteredProducts.length && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleCount((current) => current + 60)}
                  className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs shadow-lg hover:bg-china-red transition-all"
                >
                  Cargar más
                </button>
              </div>
            )}

            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => fetchProducts(false)}
                  disabled={isLoading}
                  className="bg-china-red text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs shadow-lg hover:bg-slate-900 transition-all disabled:opacity-60"
                >
                  {isLoading ? 'Cargando...' : 'Traer más desde SAP'}
                </button>
              </div>
            )}

            {filteredProducts.length === 0 && (
              <div className="py-20 md:py-40 text-center space-y-6 bg-slate-50 rounded-[32px] md:rounded-[60px] px-6">
                <div className="w-20 h-20 md:w-24 md:h-24 bg-white rounded-full flex items-center justify-center mx-auto shadow-xl">
                  <Search size={40} md:size={48} className="text-slate-200" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter">Sin resultados</h2>
                  <p className="text-sm md:text-base text-slate-400 font-medium">No encontramos productos que coincidan con tu búsqueda.</p>
                </div>
                <button 
                  onClick={() => { setSearch(''); setSelectedGroup('all'); }}
                  className="bg-china-red text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs shadow-lg hover:bg-slate-900 transition-all"
                >
                  Limpiar Filtros
                </button>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Catalog;
