import React, { useState } from 'react';
import { 
  FileUp, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Image as ImageIcon,
  ArrowRight,
  Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';

const ImportInventory: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSizeMb = 300;
    if (file.size > maxSizeMb * 1024 * 1024) {
      setSelectedFile(null);
      setError(`El archivo excede ${maxSizeMb}MB`);
      return;
    }

    setSelectedFile(file);
    setError('');
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
    XLSX.writeFile(wb, "Plantilla_Inventario_Cony.xlsx");
  };

  const handleImport = async () => {
    if (!selectedFile) {
      setError('Selecciona un archivo primero');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/ecommerce/import-excel', {
        method: 'POST',
        body: formData
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
    <div className="p-6 md:p-12 space-y-8 md:space-y-12 max-w-7xl mx-auto">
      <header className="flex flex-col sm:row justify-between items-start sm:items-end gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl md:text-5xl font-black text-china-red tracking-tighter uppercase">Importación Masiva</h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Carga masiva de inventario desde archivos inteligentes</p>
        </div>
        <button 
          onClick={downloadTemplate}
          className="w-full sm:w-auto flex items-center justify-center gap-3 text-china-red font-black uppercase tracking-widest text-[9px] bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-100 hover:bg-china-red hover:text-white transition-all"
        >
          <Download size={18} />
          Descargar Plantilla
        </button>
      </header>

      {!selectedFile ? (
        <div className="bg-white border-4 border-dashed border-slate-100 rounded-[32px] md:rounded-[60px] p-12 md:p-32 text-center space-y-8 shadow-inner">
          <div className="w-24 h-24 md:w-32 md:h-32 bg-china-red/5 text-china-red rounded-full flex items-center justify-center mx-auto shadow-xl">
            <FileUp size={48} className="md:size-[64px]" />
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tighter">Sube tu archivo Excel</h2>
            <p className="text-sm md:text-slate-400 max-w-lg mx-auto font-medium leading-relaxed">
              El archivo se sube directo al backend para evitar consumo excesivo de memoria en el navegador.
            </p>
          </div>
          <label className="inline-block china-btn-primary px-10 md:px-12 py-4 md:py-5 cursor-pointer active:scale-95">
            Seleccionar Archivo
            <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} />
          </label>
        </div>
      ) : (
        <div className="space-y-6 md:space-y-8">
          <div className="bg-white rounded-[24px] md:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-6 md:p-10 bg-slate-50 border-b border-slate-100 flex flex-col sm:row justify-between items-start sm:items-center gap-4">
              <h3 className="text-lg md:text-xl font-black uppercase tracking-tighter">
                Archivo listo para importar
              </h3>
              <button 
                onClick={() => {
                  setSelectedFile(null);
                }}
                className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-china-red transition-colors"
              >
                Cancelar Carga
              </button>
            </div>
            <div className="p-6 md:p-10 space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre</p>
              <p className="text-lg font-black text-slate-900 break-all">{selectedFile.name}</p>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Tamaño: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-8 rounded-[32px] flex items-center gap-4 font-black uppercase tracking-widest text-xs border border-red-100 shadow-lg">
              <AlertCircle size={24} />
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-end gap-4 md:gap-6">
            <button 
              onClick={() => {
                setSelectedFile(null);
              }}
              className="px-10 py-4 md:py-5 rounded-2xl font-black uppercase tracking-widest text-[9px] text-slate-400 hover:bg-slate-100 transition-all"
            >
              Descartar Todo
            </button>
            <button 
              onClick={handleImport}
              disabled={loading}
              className="china-btn-primary px-12 md:px-16 py-4 md:py-5 flex items-center justify-center gap-3 disabled:bg-slate-200"
            >
              {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={24} />}
              Confirmar Importación
            </button>
          </div>
        </div>
      )}

      {/* Success Overlay */}
      {success && (
          <div className="fixed inset-0 z-[200] bg-china-black/95 backdrop-blur-2xl flex flex-col items-center justify-center text-white p-12 text-center">
            <div className="w-40 h-40 bg-china-red text-white rounded-[40px] flex items-center justify-center mb-10 shadow-2xl">
              <CheckCircle2 size={80} />
            </div>
            <h2 className="text-6xl font-black uppercase tracking-tighter mb-6">¡Importación Exitosa!</h2>
            <p className="text-xl text-white/60 font-medium uppercase tracking-widest mb-12">El inventario ha sido actualizado globalmente.</p>
            <div className="flex items-center gap-3 font-black uppercase tracking-[0.3em] text-china-gold animate-pulse text-sm">
              Sincronizando catálogo <ArrowRight />
            </div>
          </div>
      )}

      {/* Guide Section */}
      <section className="bg-china-gold/5 rounded-[32px] md:rounded-[60px] p-8 md:p-16 border border-china-gold/10 space-y-8 md:space-y-12">
        <h2 className="text-2xl md:text-3xl font-black text-china-red uppercase tracking-tighter flex items-center gap-4">
          <ImageIcon className="text-china-gold" size={28} />
          Guía de Carga Inteligente
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
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
