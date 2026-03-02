import React from 'react';
import { Link } from 'react-router-dom';

type BrandLogoProps = {
  to?: string;
  compact?: boolean;
  className?: string;
  textColor?: string;
  subTextColor?: string;
};

const BrandLogo: React.FC<BrandLogoProps> = ({
  to = '/',
  compact = false,
  className = '',
  textColor = 'text-lina-orange',
  subTextColor = 'text-lina-orange',
}) => {
  const content = (
    <div className={`flex items-center gap-3 ${className}`}>
      {!compact && (
        <div className="w-10 h-10 rounded-xl bg-lina-soft flex items-center justify-center border border-lina-orange/20">
          <span className="text-lina-orange font-black text-xl italic leading-none">L</span>
        </div>
      )}
      <div className="leading-none">
        <span className={`inline-block px-3 py-1 rounded-full bg-lina-orange text-white text-[9px] font-black uppercase tracking-[0.22em] mb-1 ${compact ? 'text-[8px]' : ''}`}>
          Importadora
        </span>
        <h1 className={`${compact ? 'text-xl' : 'text-3xl'} font-black italic tracking-tight ${textColor}`}>Lina</h1>
        <p className={`text-[9px] font-black uppercase tracking-[0.24em] ${subTextColor}`}>Ecuador</p>
      </div>
    </div>
  );

  return <Link to={to}>{content}</Link>;
};

export default BrandLogo;
