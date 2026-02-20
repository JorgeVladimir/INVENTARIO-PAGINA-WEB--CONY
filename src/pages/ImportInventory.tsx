import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileUp, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Table as TableIcon,
  Image as ImageIcon,
  ArrowRight,
  Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';

const ImportInventory: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const json = XLSX.utils.sheet_to_json(ws);
      
      const mappedData = json.map((row: any) => ({
        internal_code: row['Código'] || row['code'],
        name: row['Nombre'] || row['name'],
        price: parseFloat(row['Precio'] || row['price'] || 0),
        cost: parseFloat(row['Costo'] || row['cost'] || 0),
        stock: parseInt(row['Stock'] || row['stock'] || 0),
        category_id: parseInt(row['ID Categoria'] || 1),
        container_id: parseInt(row['ID Contenedor'] || 1),
        warehouse_id: parseInt(row['ID Bodega'] || 1),
        image_url: row['URL Imagen'] || row['image_url'] || `https://picsum.photos/seed/${Math.random()}/400/400`
      }));

      setData(mappedData);
    };
    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    const template = [
      {
        'Código': 'PROD-00X',
        'Nombre': 'Producto Ejemplo',
        'Precio': 10.50,
        'Costo': 5.00,
        'Stock': 100,
        'ID Categoria': 1,
        'ID Contenedor': 1,
        'ID Bodega': 1,
        'URL Imagen': 'https://link-a-la-imagen.com/foto.jpg'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, "Plantilla_Inventario_SinoStock.xlsx");
  };

  const handleImport = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => navigate('/dashboard/inventario'), 2000);
      } else {
        const err = await res.json();
        setError(err.error || 'Error al importar datos');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-12 space-y-12 max-w-7xl mx-auto">
      <header className="flex justify-between items-end">
        <div className="space-y-2">
          <h1 className="text-5xl font-black text-china-red tracking-tighter uppercase">Importación Masiva</h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Carga masiva de inventario desde archivos inteligentes</p>
        </div>
        <button 
          onClick={downloadTemplate}
          className="flex items-center gap-3 text-china-red font-black uppercase tracking-widest text-[10px] bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-100 hover:bg-china-red hover:text-white transition-all"
        >
          <Download size={20} />
          Descargar Plantilla
        </button>
      </header>

      {!data.length ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border-4 border-dashed border-slate-100 rounded-[60px] p-32 text-center space-y-8 shadow-inner"
        >
          <div className="w-32 h-32 bg-china-red/5 text-china-red rounded-full flex items-center justify-center mx-auto shadow-xl">
            <FileUp size={64} />
          </div>
          <div className="space-y-4">
            <h2 className="text-4xl font-black uppercase tracking-tighter">Sube tu archivo Excel</h2>
            <p className="text-slate-400 max-w-lg mx-auto font-medium leading-relaxed">
              Asegúrate de usar nuestra plantilla oficial para garantizar la integridad de los datos logísticos y de stock.
            </p>
          </div>
          <label className="inline-block china-btn-primary px-12 py-5 cursor-pointer active:scale-95">
            Seleccionar Archivo
            <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} />
          </label>
        </motion.div>
      ) : (
        <div className="space-y-8">
          <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-10 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
                <TableIcon size={24} className="text-china-red" />
                Vista Previa de Carga ({data.length} productos)
              </h3>
              <button 
                onClick={() => setData([])}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-china-red transition-colors"
              >
                Cancelar Carga
              </button>
            </div>
            <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white shadow-sm z-10">
                  <tr>
                    <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">Imagen</th>
                    <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">Código</th>
                    <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">Nombre</th>
                    <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">Precio</th>
                    <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-6">
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 shadow-sm">
                          <img src={row.image_url} className="w-full h-full object-cover" />
                        </div>
                      </td>
                      <td className="p-6 font-black text-slate-900 uppercase tracking-tighter">{row.internal_code}</td>
                      <td className="p-6 font-bold text-slate-600 uppercase text-xs tracking-widest">{row.name}</td>
                      <td className="p-6 font-black text-china-red text-lg tracking-tight">${row.price.toFixed(2)}</td>
                      <td className="p-6 font-black text-slate-900">{row.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-8 rounded-[32px] flex items-center gap-4 font-black uppercase tracking-widest text-xs border border-red-100 shadow-lg">
              <AlertCircle size={24} />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-6">
            <button 
              onClick={() => setData([])}
              className="px-10 py-5 rounded-2xl font-black uppercase tracking-widest text-[10px] text-slate-400 hover:bg-slate-100 transition-all"
            >
              Descartar Todo
            </button>
            <button 
              onClick={handleImport}
              disabled={loading}
              className="china-btn-primary px-16 py-5 flex items-center gap-3 disabled:bg-slate-200"
            >
              {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={24} />}
              Confirmar Importación
            </button>
          </div>
        </div>
      )}

      {/* Success Overlay */}
      <AnimatePresence>
        {success && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[200] bg-china-black/95 backdrop-blur-2xl flex flex-col items-center justify-center text-white p-12 text-center"
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -20, y: 50 }}
              animate={{ scale: 1, rotate: 0, y: 0 }}
              className="w-40 h-40 bg-china-red text-white rounded-[40px] flex items-center justify-center mb-10 shadow-2xl"
            >
              <CheckCircle2 size={80} />
            </motion.div>
            <h2 className="text-6xl font-black uppercase tracking-tighter mb-6">¡Importación Exitosa!</h2>
            <p className="text-xl text-white/60 font-medium uppercase tracking-widest mb-12">El inventario ha sido actualizado globalmente.</p>
            <div className="flex items-center gap-3 font-black uppercase tracking-[0.3em] text-china-gold animate-pulse text-sm">
              Sincronizando catálogo <ArrowRight />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Guide Section */}
      <section className="bg-china-gold/5 rounded-[60px] p-16 border border-china-gold/10 space-y-12">
        <h2 className="text-3xl font-black text-china-red uppercase tracking-tighter flex items-center gap-4">
          <ImageIcon className="text-china-gold" size={32} />
          Guía de Carga Inteligente
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="space-y-4">
            <div className="w-12 h-12 bg-china-gold text-china-red rounded-2xl flex items-center justify-center font-black text-xl shadow-lg">1</div>
            <h3 className="text-lg font-black uppercase tracking-tight">URLs de Imagen</h3>
            <p className="text-xs font-bold text-slate-500 leading-relaxed uppercase tracking-widest">
              Sube tus fotos a Google Drive o Imgur y pega el link directo. El sistema renderizará la miniatura automáticamente.
            </p>
          </div>
          <div className="space-y-4">
            <div className="w-12 h-12 bg-china-gold text-china-red rounded-2xl flex items-center justify-center font-black text-xl shadow-lg">2</div>
            <h3 className="text-lg font-black uppercase tracking-tight">Códigos SKU</h3>
            <p className="text-xs font-bold text-slate-500 leading-relaxed uppercase tracking-widest">
              Asegúrate de que los códigos internos sean únicos. Esto evita duplicidad en el stock de los contenedores.
            </p>
          </div>
          <div className="space-y-4">
            <div className="w-12 h-12 bg-china-gold text-china-red rounded-2xl flex items-center justify-center font-black text-xl shadow-lg">3</div>
            <h3 className="text-lg font-black uppercase tracking-tight">Categorización</h3>
            <p className="text-xs font-bold text-slate-500 leading-relaxed uppercase tracking-widest">
              Usa los IDs de categoría correctos para que los productos aparezcan en las colecciones públicas correspondientes.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ImportInventory;
