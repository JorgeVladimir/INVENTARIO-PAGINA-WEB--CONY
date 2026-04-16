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
import { resolveGroupName } from '../utils/groupMappings';

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
    toText(readValue(row, ['prdu_cod_prdu', 'codigoproduc', 'codigoproducto', 'codigo', 'itemcode'])) ||
    `SIN-CODIGO-${index + 1}`;

  const codbarras =
    toText(readValue(row, ['prdu_cod_bars', 'codbarras', 'codigo_barras', 'codbarra'])) ||
    '9999999';

  const nombre =
    toText(readValue(row, ['prdu_nom_prdu', 'prdu_des_prdu', 'nombre', 'nombre_corto', 'nombrecorto', 'codigoproduc', 'codigoproducto'])) ||
    itemCode;

  const descripcion = toText(readValue(row, ['prdu_des_prdu', 'descripcion', 'detalle', 'prdu_nom_prdu', 'nombre'])) || nombre;
  const grupo = resolveGroupName(readValue(row, ['prdu_tip_grup', 'grupo', 'categoria', 'categorianombre'])) || 'Sin grupo';
  const precioBulto = toNumber(readValue(row, ['precio_bulto', 'preciobulto', 'bulto']), 0);
  const precioMayorista = toNumber(readValue(row, ['precio_mayorista', 'precio_mayor', 'preciomayor', 'mayorista', 'mayor']), 0);
  const precioUnidad = toNumber(
    readValue(row, [
      'prdu_pre_untr',
      'precio_unidad',
      'preciounidad',
      'unidad',
      'precio',
      'prdu_pre_euni',
      'prdu_pre_myor',
      'prdu_pre_trjc',
      'prdu_pre_blto',
    ]),
    0
  );
  const costo = toNumber(readValue(row, ['costo', 'cost']), 0);
  const stock = toNumber(readValue(row, ['prdu_stock', 'stock', 'cantidadstock', 'totalcantidad', 'total_cantidad']), 0);
  const imageUrl = toText(readValue(row, ['prdu_rul_imag', 'imagen', 'foto', 'image_url', 'imageurl']));
  const id = toNumber(readValue(row, ['prdu_cod_id', 'id']), index + 1);

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

  const selectedGroupLabel = selectedGroup === 'all' ? 'Todos los grupos' : selectedGroup;

  const fetchProducts = async (reset: boolean) => {
    if (isLoading) return;

    setIsLoading(true);
    const pageOffset = reset ? 0 : nextOffset;

    if (reset) {
      setProducts([]);
      setNextOffset(0);
      setHasMore(false);
      setTotalCount(0);
    }

    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(pageOffset));
      const trimmedSearch = search.trim();
      if (trimmedSearch) {
        params.set('q', trimmedSearch);
      }
      if (selectedGroup !== 'all') {
        params.set('group', selectedGroup);
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
          value: resolveGroupName(row?.grupo),
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
    }, 250);

    return () => clearTimeout(timer);
  }, [search, selectedGroup]);

  useEffect(() => {
    fetchGroups();
  }, []);

  const groupsFallback = Array.from(
    products.reduce((acc, product) => {
      const group = toText(product.grupo);
      if (!group) return acc;
      acc.set(group, (acc.get(group) || 0) + 1);
      return acc;
    }, new Map<string, number>())
  )
    .map(([value, total]) => ({ value, total }))
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.value.localeCompare(b.value, 'es', { sensitivity: 'base' });
    });

  const groups = groupsFromDb.length > 0 ? groupsFromDb : groupsFallback;

  const filteredProducts = products.filter(p => {
    const grupo = resolveGroupName(toText(p.grupo) || toText(p.category_name)) || 'General';
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
          <aside className="w-full lg:w-72 space-y-8 md:space-y-10 lg:sticky lg:top-6 self-start">
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
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Grupo</label>
                  <span className="text-[10px] font-black uppercase tracking-widest text-china-red">{groups.length} grupos</span>
                </div>
                <div className="max-h-[55vh] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                  <button 
                    onClick={() => setSelectedGroup('all')}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-bold transition-all ${selectedGroup === 'all' ? 'bg-china-red text-white shadow-lg' : 'text-slate-500 bg-slate-50 hover:bg-slate-100'}`}
                  >
                    <span className="text-left">Todos los grupos</span>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${selectedGroup === 'all' ? 'bg-white/15 text-white' : 'bg-white text-slate-500'}`}>{groups.reduce((sum, group) => sum + group.total, 0)}</span>
                  </button>
                  {groups.map(group => (
                    <button 
                      key={group.value}
                      onClick={() => setSelectedGroup(group.value)}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-bold transition-all ${selectedGroup === group.value ? 'bg-china-red text-white shadow-lg' : 'text-slate-500 bg-slate-50 hover:bg-slate-100'}`}
                    >
                      <span className="text-left leading-tight">{group.value}</span>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${selectedGroup === group.value ? 'bg-white/15 text-white' : 'bg-white text-slate-500'}`}>{group.total}</span>
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
              <div className="ml-2 md:ml-4">
                <p className="text-xs md:text-sm font-bold text-slate-500">Mostrando <span className="text-slate-900">{visibleProducts.length}</span> de {totalCount || filteredProducts.length} productos</p>
                <p className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-400 mt-1">{selectedGroupLabel}</p>
              </div>
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
                  const descripcion = toText(product.nombre) || toText(product.descripcion) || 'Producto sin nombre';
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
                  </div>
                  <div className="p-6 md:p-8 flex-1 flex flex-col gap-4 md:gap-6">
                    <div className="space-y-1 md:space-y-2">
                      <h3 className="font-black text-base md:text-lg text-slate-900 leading-tight uppercase tracking-tight group-hover:text-china-red transition-colors line-clamp-3">{descripcion}</h3>
                    </div>
                    
                    <div className="mt-auto space-y-4">
                      <div className="grid grid-cols-1 gap-3 text-xs">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Precio Unitario</p>
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
