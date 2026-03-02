import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Instagram, Twitter, Mail, Phone, MapPin } from 'lucide-react';
import BrandLogo from './BrandLogo';

const PublicFooter: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-white pt-12 md:pt-20 pb-10">
      <div className="max-w-7xl mx-auto px-6 md:px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 md:gap-16 mb-12 md:mb-20">
        {/* Brand */}
        <div className="space-y-8">
          <BrandLogo to="/" textColor="text-white" subTextColor="text-china-gold" />
          <p className="text-slate-400 font-medium leading-relaxed">
            Importadora Lina conecta tu negocio con productos de calidad para tecnología, hogar y más, con cobertura en todo Ecuador.
          </p>
          <div className="flex gap-4">
            {[Facebook, Instagram, Twitter].map((Icon, i) => (
              <a key={i} href="#" className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-china-red transition-colors">
                <Icon size={20} />
              </a>
            ))}
          </div>
        </div>

        {/* Links */}
        <div className="space-y-6 md:space-y-8">
          <h4 className="text-base md:text-lg font-black uppercase tracking-widest text-china-gold">Navegación</h4>
          <ul className="space-y-3 md:space-y-4">
            {['Inicio', 'Productos', 'Ofertas', 'Sobre Nosotros', 'Contacto'].map(link => (
              <li key={link}>
                <Link to="/" className="text-slate-400 hover:text-white transition-colors font-bold uppercase text-[10px] md:text-xs tracking-widest">{link}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Categories */}
        <div className="space-y-6 md:space-y-8">
          <h4 className="text-base md:text-lg font-black uppercase tracking-widest text-china-gold">Categorías</h4>
          <ul className="space-y-3 md:space-y-4">
            {['Electrónica', 'Hogar', 'Juguetes', 'Moda', 'Herramientas'].map(cat => (
              <li key={cat}>
                <Link to="/productos" className="text-slate-400 hover:text-white transition-colors font-bold uppercase text-[10px] md:text-xs tracking-widest">{cat}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Contact */}
        <div className="space-y-6 md:space-y-8">
          <h4 className="text-base md:text-lg font-black uppercase tracking-widest text-china-gold">Contacto</h4>
          <ul className="space-y-4 md:space-y-6">
            <li className="flex items-start gap-4">
              <MapPin className="text-china-red shrink-0" size={20} />
              <span className="text-slate-400 text-sm font-medium">Av. 10 de Agosto y Colon, Quito, Ecuador</span>
            </li>
            <li className="flex items-center gap-4">
              <Phone className="text-china-red shrink-0" size={20} />
              <span className="text-slate-400 text-sm font-medium">+593984132326</span>
            </li>
            <li className="flex items-center gap-4">
              <Mail className="text-china-red shrink-0" size={20} />
              <span className="text-slate-400 text-sm font-medium">analista.desarrollo@grupolina.com</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 pt-10 border-t border-white/5 flex flex-col md:row justify-between items-center gap-6">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
          © 2026 IMPORTADORA LINA. TODOS LOS DERECHOS RESERVADOS.
        </p>
        <div className="flex gap-6 md:gap-8 text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">
          <span className="hover:text-white cursor-pointer">Privacidad</span>
          <span className="hover:text-white cursor-pointer">Términos</span>
          <span className="hover:text-white cursor-pointer">Cookies</span>
        </div>
      </div>
    </footer>
  );
};

export default PublicFooter;
