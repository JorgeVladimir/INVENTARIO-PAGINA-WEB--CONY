import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  ChevronDown,
  ChevronRight,
  FileImage,
  Filter,
  Grid3X3,
  Image as ImageIcon,
  List,
  Package,
  Search,
} from 'lucide-react';
import { resolveGroupName } from '../utils/groupMappings';
import { resolveProductImage } from '../utils/productImages';
import { Product } from '../types';

type DashboardProduct = {
  id: string;
  codigoProducto: string;
  codbarras: string;
  nombre: string;
  descripcion: string;
  grupo: string;
  empresa: string;
  imagenOriginal: string;
  imagenVista: string;
  imagenEstado: 'cargada' | 'pendiente';
  precioBulto: number;
  precioMayor: number;
  precioUnidad: number;
  precioTarjeta: number;
  costo: number;
  stock: number;
};

type ViewMode = 'cards' | 'report';
type ImageFilter = 'all' | 'loaded' | 'pending';

const REPORT_PAGE_SIZE = 100;

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

const isPlaceholderImage = (value: string) => {
  const normalized = toText(value).toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes('picsum.photos') ||
    normalized.includes('source.unsplash.com') ||
    normalized.startsWith('data:image/svg+xml')
  );
};

const normalizeInventoryProduct = (row: Record<string, any>, index: number): DashboardProduct => {
  const codigoProducto =
    toText(readValue(row, ['prdu_cod_prdu', 'codigoproduc', 'codigoproducto', 'codigo'])) ||
    `SIN-CODIGO-${index + 1}`;

  const codbarras =
    toText(readValue(row, ['prdu_cod_bars', 'codbarras', 'codigo_barras', 'codbarra'])) ||
    codigoProducto;

  const nombre =
    toText(readValue(row, ['prdu_nom_prdu', 'nombre', 'nombre_corto', 'nombrecorto', 'prdu_des_prdu'])) ||
    codigoProducto;

  const descripcion =
    toText(readValue(row, ['prdu_des_prdu', 'descripcion', 'detalle', 'prdu_nom_prdu'])) ||
    nombre;

  const grupo =
    resolveGroupName(readValue(row, ['prdu_tip_grup', 'grupo', 'categoria', 'categorianombre'])) ||
    'Sin grupo';

  const empresa = toText(readValue(row, ['prdu_nom_empr', 'empresa', 'warehouse_name'])) || 'Sin empresa';
  const imagenOriginal = toText(readValue(row, ['prdu_rul_imag', 'imagen', 'foto', 'image_url', 'imageurl']));

  const productForImage: Product = {
    id: toNumber(readValue(row, ['prdu_cod_id', 'id']), index + 1),
    internal_code: codigoProducto,
    name: nombre,
    codbarras,
    nombre,
    descripcion,
    grupo,
    category_id: 1,
    category_name: grupo,
    price: toNumber(readValue(row, ['prdu_pre_untr', 'precio_unidad', 'preciounidad', 'unidad', 'precio']), 0),
    precio_bulto: toNumber(readValue(row, ['prdu_pre_blto', 'precio_bulto', 'preciobulto', 'bulto']), 0),
    precio_mayorista: toNumber(readValue(row, ['prdu_pre_myor', 'precio_mayorista', 'precio_mayor', 'mayorista', 'mayor']), 0),
    precio_unidad: toNumber(readValue(row, ['prdu_pre_untr', 'precio_unidad', 'preciounidad', 'unidad', 'precio']), 0),
    cost: toNumber(readValue(row, ['prdu_costo', 'costo', 'cost']), 0),
    stock: toNumber(readValue(row, ['prdu_stock', 'stock', 'cantidadstock', 'totalcantidad']), 0),
    container_id: 1,
    warehouse_id: 1,
    warehouse_name: empresa,
    image_url: imagenOriginal,
  };

  const imagenVista = imagenOriginal && !isPlaceholderImage(imagenOriginal)
    ? imagenOriginal
    : resolveProductImage(productForImage);

  return {
    id: `${toText(readValue(row, ['prdu_cod_id', 'id'])) || codigoProducto}-${index}`,
    codigoProducto,
    codbarras,
    nombre,
    descripcion,
    grupo,
    empresa,
    imagenOriginal,
    imagenVista,
    imagenEstado: imagenOriginal && !isPlaceholderImage(imagenOriginal) ? 'cargada' : 'pendiente',
    precioBulto: toNumber(readValue(row, ['prdu_pre_blto', 'precio_bulto', 'preciobulto', 'bulto']), 0),
    precioMayor: toNumber(readValue(row, ['prdu_pre_myor', 'precio_mayorista', 'precio_mayor', 'mayorista', 'mayor']), 0),
    precioUnidad: toNumber(readValue(row, ['prdu_pre_untr', 'precio_unidad', 'preciounidad', 'unidad', 'precio']), 0),
    precioTarjeta: toNumber(readValue(row, ['prdu_pre_trjc', 'precio_tarjeta']), 0),
    costo: toNumber(readValue(row, ['prdu_costo', 'costo', 'cost']), 0),
    stock: toNumber(readValue(row, ['prdu_stock', 'stock', 'cantidadstock', 'totalcantidad']), 0),
  };
};

const money = (value: number) => `$${value.toFixed(2)}`;

const Inventory: React.FC = () => {
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [imageFilter, setImageFilter] = useState<ImageFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('report');
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [reportPage, setReportPage] = useState(1);
  const [pendingImageFiles, setPendingImageFiles] = useState<Record<string, File | null>>({});
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);
  const [uploadMessageById, setUploadMessageById] = useState<Record<string, string>>({});

  const fallbackImage = `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="#f1f5f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="Arial" font-size="22">Sin imagen</text></svg>'
  )}`;

  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      setLoadError('');

      try {
        const response = await fetch('/api/ecommerce/productos');
        const payload = response.ok ? await response.json() : [];
        const rows = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.items)
            ? payload.items
            : [];

        const normalized = rows.map((row, index) => normalizeInventoryProduct(row, index));
        setProducts(normalized);

        if (!response.ok) {
          setLoadError('No se pudo cargar el reporte de inventario. Reintenta en unos segundos.');
        }
      } catch {
        setProducts([]);
        setLoadError('Error al cargar el reporte de ECPRDU. Verifica conexión con el backend.');
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, []);

  const groupOptions = useMemo(() => {
    const groupMap = new Map<string, number>();

    for (const product of products) {
      if (!product.grupo) continue;
      groupMap.set(product.grupo, (groupMap.get(product.grupo) || 0) + 1);
    }

    return Array.from(groupMap.entries())
      .map(([value, total]) => ({ value, total }))
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        return a.value.localeCompare(b.value, 'es', { sensitivity: 'base' });
      });
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch = !normalizedSearch || [
        product.codbarras,
        product.codigoProducto,
        product.nombre,
        product.descripcion,
        product.grupo,
        product.empresa,
      ].some((value) => value.toLowerCase().includes(normalizedSearch));

      const matchesGroup = selectedGroup === 'all' || product.grupo === selectedGroup;
      const matchesImage =
        imageFilter === 'all' ||
        (imageFilter === 'loaded' && product.imagenEstado === 'cargada') ||
        (imageFilter === 'pending' && product.imagenEstado === 'pendiente');

      return matchesSearch && matchesGroup && matchesImage;
    });
  }, [products, search, selectedGroup, imageFilter]);

  const reportTotalPages = Math.max(1, Math.ceil(filteredProducts.length / REPORT_PAGE_SIZE));
  const reportStart = (reportPage - 1) * REPORT_PAGE_SIZE;
  const reportRows = filteredProducts.slice(reportStart, reportStart + REPORT_PAGE_SIZE);

  useEffect(() => {
    setReportPage(1);
    setExpandedProductId(null);
  }, [search, selectedGroup, imageFilter]);

  const summary = useMemo(() => {
    const totalStock = filteredProducts.reduce((sum, product) => sum + product.stock, 0);
    const loadedImages = filteredProducts.filter((product) => product.imagenEstado === 'cargada').length;
    const pendingImages = filteredProducts.length - loadedImages;

    return {
      totalRows: filteredProducts.length,
      totalGroups: new Set(filteredProducts.map((product) => product.grupo)).size,
      totalStock,
      loadedImages,
      pendingImages,
    };
  }, [filteredProducts]);

  const handleImageFileChange = (productId: string, file: File | null) => {
    setPendingImageFiles((prev) => ({ ...prev, [productId]: file }));
    setUploadMessageById((prev) => ({ ...prev, [productId]: '' }));
  };

  const uploadImageForProduct = async (product: DashboardProduct) => {
    const selectedFile = pendingImageFiles[product.id];
    if (!selectedFile) {
      setUploadMessageById((prev) => ({ ...prev, [product.id]: 'Selecciona una imagen antes de guardar.' }));
      return;
    }

    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('codigoProducto', product.codigoProducto);
    formData.append('codbarras', product.codbarras);

    setUploadingImageId(product.id);
    setUploadMessageById((prev) => ({ ...prev, [product.id]: '' }));

    try {
      const response = await fetch('/api/ecommerce/productos/upload-image', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = toText(payload?.error) || 'No se pudo guardar la imagen.';
        setUploadMessageById((prev) => ({ ...prev, [product.id]: msg }));
        return;
      }

      const newImageUrl = toText(payload?.imageUrl);
      if (newImageUrl) {
        setProducts((prev) =>
          prev.map((current) =>
            current.id === product.id
              ? {
                  ...current,
                  imagenOriginal: newImageUrl,
                  imagenVista: newImageUrl,
                  imagenEstado: 'cargada',
                }
              : current
          )
        );
      }

      setPendingImageFiles((prev) => ({ ...prev, [product.id]: null }));
      setUploadMessageById((prev) => ({ ...prev, [product.id]: 'Imagen guardada correctamente.' }));
    } catch {
      setUploadMessageById((prev) => ({ ...prev, [product.id]: 'Error de red al cargar la imagen.' }));
    } finally {
      setUploadingImageId(null);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-china-red text-white py-16 md:py-24 px-6 md:px-12">
        <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
          <div className="inline-flex items-center gap-2 bg-china-gold text-china-red px-4 py-1.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] shadow-xl">
            <Box size={14} />
            Reporte maestro ECPRDU
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none">Reporte de<br />Inventario</h1>
          <p className="text-white/60 font-medium tracking-widest uppercase text-xs md:text-sm max-w-3xl">
            Vista completa de la tabla ECPRDU con filtros, detalle desplegable y control del estado de imágenes.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 -mt-12 md:-mt-16 pb-12 md:pb-20 space-y-8 md:space-y-10">
        <div className="bg-white rounded-[32px] md:rounded-[40px] p-6 md:p-10 shadow-2xl border border-slate-100 space-y-6 md:space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.9fr_0.9fr_auto] gap-4 md:gap-6 items-end">
            <div className="space-y-3">
              <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Buscar en ECPRDU</label>
              <div className="relative group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-china-red transition-colors" size={18} />
                <input
                  type="text"
                  placeholder="Código, nombre, grupo, empresa..."
                  className="w-full pl-12 pr-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-china-red/5 font-medium transition-all text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Grupo</label>
              <div className="relative">
                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select
                  aria-label="Filtrar por grupo"
                  className="w-full bg-slate-50 border-none rounded-2xl pl-12 pr-10 py-4 font-black uppercase text-[10px] tracking-widest text-slate-600 focus:ring-4 focus:ring-china-red/5 appearance-none cursor-pointer"
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                >
                  <option value="all">Todos los grupos</option>
                  {groupOptions.map((group) => (
                    <option key={group.value} value={group.value}>
                      {group.value} ({group.total})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Estado imagen</label>
              <div className="relative">
                <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select
                  aria-label="Filtrar por imagen"
                  className="w-full bg-slate-50 border-none rounded-2xl pl-12 pr-10 py-4 font-black uppercase text-[10px] tracking-widest text-slate-600 focus:ring-4 focus:ring-china-red/5 appearance-none cursor-pointer"
                  value={imageFilter}
                  onChange={(e) => setImageFilter(e.target.value as ImageFilter)}
                >
                  <option value="all">Todas</option>
                  <option value="loaded">Cargadas</option>
                  <option value="pending">Pendientes</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setViewMode('report')}
                className={`p-3 rounded-2xl border transition-all ${viewMode === 'report' ? 'bg-china-red text-white border-china-red shadow-lg' : 'bg-slate-50 text-slate-500 border-transparent'}`}
                title="Vista reporte"
              >
                <List size={18} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`p-3 rounded-2xl border transition-all ${viewMode === 'cards' ? 'bg-china-red text-white border-china-red shadow-lg' : 'bg-slate-50 text-slate-500 border-transparent'}`}
                title="Vista tarjetas"
              >
                <Grid3X3 size={18} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-slate-50 rounded-3xl p-5 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Registros</p>
              <p className="text-2xl font-black text-slate-900">{summary.totalRows.toLocaleString('es-EC')}</p>
            </div>
            <div className="bg-slate-50 rounded-3xl p-5 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Grupos</p>
              <p className="text-2xl font-black text-slate-900">{summary.totalGroups.toLocaleString('es-EC')}</p>
            </div>
            <div className="bg-slate-50 rounded-3xl p-5 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stock total</p>
              <p className="text-2xl font-black text-slate-900">{summary.totalStock.toLocaleString('es-EC')}</p>
            </div>
            <div className="bg-emerald-50 rounded-3xl p-5 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Imágenes cargadas</p>
              <p className="text-2xl font-black text-emerald-700">{summary.loadedImages.toLocaleString('es-EC')}</p>
            </div>
            <div className="bg-amber-50 rounded-3xl p-5 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Imágenes pendientes</p>
              <p className="text-2xl font-black text-amber-700">{summary.pendingImages.toLocaleString('es-EC')}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.9fr] gap-8">
          <section className="bg-white border border-slate-100 rounded-[32px] shadow-xl overflow-hidden">
            <div className="px-6 md:px-8 py-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reporte desplegable</p>
                <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">Tabla de productos</h2>
              </div>
              <div className="text-sm font-semibold text-slate-500">
                Página {reportPage} de {reportTotalPages}
              </div>
            </div>

            {loadError && (
              <div className="mx-6 md:mx-8 mt-6 rounded-2xl border border-red-100 bg-red-50 px-6 py-4 text-sm font-semibold text-red-700">
                {loadError}
              </div>
            )}

            {loadingData ? (
              <div className="py-24 text-center text-slate-500 font-semibold">Cargando reporte ECPRDU...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-24 text-center text-slate-500 font-semibold">No hay registros que coincidan con los filtros actuales.</div>
            ) : viewMode === 'report' ? (
              <>
                <div className="overflow-x-auto">
                  <div className="min-w-[980px]">
                    <div className="grid grid-cols-[44px_140px_1.4fr_180px_120px_120px_120px] gap-4 px-6 md:px-8 py-4 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                      <div></div>
                      <div>Código</div>
                      <div>Producto</div>
                      <div>Grupo</div>
                      <div>Costo</div>
                      <div>P. unidad</div>
                      <div>Stock</div>
                    </div>

                    {reportRows.map((product) => {
                      const expanded = expandedProductId === product.id;

                      return (
                        <div key={product.id} className="border-b border-slate-100 last:border-b-0">
                          <button
                            type="button"
                            onClick={() => setExpandedProductId(expanded ? null : product.id)}
                            className="w-full grid grid-cols-[44px_140px_1.4fr_180px_120px_120px_120px] gap-4 px-6 md:px-8 py-4 text-left hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-center justify-center text-slate-400">
                              {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            </div>
                            <div className="font-black text-slate-900 text-sm">{product.codigoProducto}</div>
                            <div>
                              <p className="font-black text-slate-900 text-sm leading-tight uppercase">{product.nombre}</p>
                              <p className="text-xs font-semibold text-slate-500 truncate">{product.descripcion}</p>
                            </div>
                            <div className="text-sm font-bold text-slate-600">{product.grupo}</div>
                            <div className="text-sm font-black text-slate-900">{money(product.costo)}</div>
                            <div className="text-sm font-black text-china-red">{money(product.precioUnidad)}</div>
                            <div className="text-sm font-black text-slate-900">{product.stock.toLocaleString('es-EC')}</div>
                          </button>

                          {expanded && (
                            <div className="px-6 md:px-8 pb-6">
                              <div className="bg-slate-50 rounded-3xl p-5 grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6">
                                <div className="rounded-[28px] overflow-hidden bg-white aspect-[4/5] shadow-sm border border-slate-100">
                                  <img
                                    src={product.imagenVista || fallbackImage}
                                    alt={product.nombre}
                                    loading="lazy"
                                    onError={(e) => {
                                      const target = e.currentTarget;
                                      if (target.src !== fallbackImage) {
                                        target.src = fallbackImage;
                                      }
                                    }}
                                    className="w-full h-full object-cover"
                                  />
                                </div>

                                <div className="space-y-5">
                                  <div className="flex flex-wrap gap-2">
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${product.imagenEstado === 'cargada' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                      Imagen {product.imagenEstado}
                                    </span>
                                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-white text-slate-500 border border-slate-200">
                                      {product.empresa}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 text-sm">
                                    <div className="bg-white rounded-2xl p-4 border border-slate-100">
                                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Código barras</p>
                                      <p className="font-black text-slate-900 mt-2">{product.codbarras}</p>
                                    </div>
                                    <div className="bg-white rounded-2xl p-4 border border-slate-100">
                                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Precio mayor</p>
                                      <p className="font-black text-slate-900 mt-2">{money(product.precioMayor)}</p>
                                    </div>
                                    <div className="bg-white rounded-2xl p-4 border border-slate-100">
                                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Precio bulto</p>
                                      <p className="font-black text-slate-900 mt-2">{money(product.precioBulto)}</p>
                                    </div>
                                    <div className="bg-white rounded-2xl p-4 border border-slate-100">
                                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Precio tarjeta</p>
                                      <p className="font-black text-slate-900 mt-2">{money(product.precioTarjeta)}</p>
                                    </div>
                                    <div className="bg-white rounded-2xl p-4 border border-slate-100 md:col-span-2">
                                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">URL imagen original</p>
                                      <p className="font-semibold text-slate-600 mt-2 break-all">{product.imagenOriginal || 'Sin URL cargada en ECPRDU'}</p>
                                    </div>
                                  </div>

                                  <div className="bg-white rounded-2xl p-4 border border-slate-100 space-y-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Carga manual de imagen</p>
                                    <div className="flex flex-col md:flex-row gap-3 md:items-center">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="block w-full text-sm font-semibold text-slate-600 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:bg-slate-100 file:text-slate-700 file:font-black file:uppercase file:text-[10px] file:tracking-widest"
                                        onChange={(e) => handleImageFileChange(product.id, e.target.files?.[0] || null)}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => uploadImageForProduct(product)}
                                        disabled={uploadingImageId === product.id}
                                        className="shrink-0 px-5 py-3 rounded-2xl bg-china-red text-white font-black uppercase tracking-widest text-[10px] disabled:opacity-60"
                                      >
                                        {uploadingImageId === product.id ? 'Guardando...' : 'Guardar imagen'}
                                      </button>
                                    </div>
                                    {uploadMessageById[product.id] && (
                                      <p className={`text-xs font-bold ${uploadMessageById[product.id].toLowerCase().includes('correctamente') ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {uploadMessageById[product.id]}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="px-6 md:px-8 py-5 border-t border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <p className="text-sm font-semibold text-slate-500">
                    Mostrando {reportRows.length} de {filteredProducts.length.toLocaleString('es-EC')} registros filtrados.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setReportPage((current) => Math.max(1, current - 1))}
                      disabled={reportPage === 1}
                      className="px-5 py-3 rounded-2xl bg-slate-100 text-slate-700 font-black uppercase tracking-widest text-[10px] disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportPage((current) => Math.min(reportTotalPages, current + 1))}
                      disabled={reportPage === reportTotalPages}
                      className="px-5 py-3 rounded-2xl bg-china-red text-white font-black uppercase tracking-widest text-[10px] disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-6 md:p-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredProducts.slice(0, 120).map((product) => (
                  <div key={product.id} className="group bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-100 flex flex-col">
                    <div className="relative aspect-[4/5] overflow-hidden bg-slate-100">
                      <img
                        src={product.imagenVista || fallbackImage}
                        alt={product.nombre}
                        loading="lazy"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (target.src !== fallbackImage) {
                            target.src = fallbackImage;
                          }
                        }}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute top-4 left-4">
                        <span className="bg-white/90 text-china-red text-[9px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
                          {product.codigoProducto}
                        </span>
                      </div>
                    </div>
                    <div className="p-6 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{product.grupo}</p>
                      <h3 className="text-lg font-black text-slate-900 uppercase leading-tight">{product.nombre}</h3>
                      <p className="text-sm font-semibold text-slate-500 line-clamp-2">{product.descripcion}</p>
                      <div className="grid grid-cols-2 gap-3 pt-2 text-sm">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Costo</p>
                          <p className="font-black text-slate-900">{money(product.costo)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">P. unidad</p>
                          <p className="font-black text-china-red">{money(product.precioUnidad)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredProducts.length > 120 && (
                  <div className="sm:col-span-2 xl:col-span-3 bg-slate-50 rounded-3xl p-6 text-center text-sm font-semibold text-slate-500">
                    En vista tarjetas se muestran los primeros 120 registros. Usa la vista reporte para navegar toda la tabla ECPRDU.
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="space-y-8">
            <section className="bg-white border border-slate-100 rounded-[32px] shadow-xl p-6 md:p-8 space-y-6 sticky top-6">
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Flujo de imágenes</p>
                <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">Cómo cargarlas</h2>
                <p className="text-sm font-semibold text-slate-500">
                  La recomendación es subir URLs reales por lote y dejar esta vista para control de cobertura.
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl bg-slate-50 p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-china-red">Paso 1</p>
                  <p className="mt-2 font-black text-slate-900 uppercase">Preparar archivo base</p>
                  <p className="mt-2 text-sm font-semibold text-slate-500">
                    Usa como llave principal prdu_cod_prdu o prdu_cod_bars y agrega una columna imagen o prdu_rul_imag con la URL final de cada foto.
                  </p>
                </div>

                <div className="rounded-3xl bg-slate-50 p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-china-red">Paso 2</p>
                  <p className="mt-2 font-black text-slate-900 uppercase">Subir actualización</p>
                  <p className="mt-2 text-sm font-semibold text-slate-500">
                    Sube el Excel desde el módulo de importación para hacer update sobre la columna de imagen sin tocar costos, stock ni precios.
                  </p>
                </div>

                <div className="rounded-3xl bg-slate-50 p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-china-red">Paso 3</p>
                  <p className="mt-2 font-black text-slate-900 uppercase">Validar cobertura</p>
                  <p className="mt-2 text-sm font-semibold text-slate-500">
                    Usa el filtro Imágenes pendientes en este reporte para detectar qué productos siguen con imagen genérica o sin URL real.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-3xl bg-emerald-50 p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Listas</p>
                  <p className="mt-2 text-2xl font-black text-emerald-700">{summary.loadedImages.toLocaleString('es-EC')}</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-700/70">Con URL real</p>
                </div>
                <div className="rounded-3xl bg-amber-50 p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Pendientes</p>
                  <p className="mt-2 text-2xl font-black text-amber-700">{summary.pendingImages.toLocaleString('es-EC')}</p>
                  <p className="mt-1 text-sm font-semibold text-amber-700/70">Por completar</p>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-100 bg-white p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-china-red/10 text-china-red flex items-center justify-center">
                    <FileImage size={22} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Acción recomendada</p>
                    <p className="font-black text-slate-900 uppercase">Carga masiva de imágenes</p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-slate-500">
                  Si quieres automatizarlo, el siguiente paso técnico es crear una plantilla de actualización solo para imagen y un endpoint de carga exclusiva de URLs.
                </p>
                <Link
                  to="/dashboard/importar"
                  className="inline-flex items-center justify-center w-full bg-china-red text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-slate-900 transition-all"
                >
                  Ir a Importación
                </Link>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Inventory;
