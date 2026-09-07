import React, { useEffect, useRef } from 'react';
import coreLogo from '../../../../public/core-icon.svg';

interface LogoAnimadaCoreProps {
  width?: number | string;
  height?: number | string;
  animated?: boolean;
}

export const LogoAnimadaCore: React.FC<LogoAnimadaCoreProps> = ({ 
  width = 200, 
  height = 200, 
  animated = true 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animated) return;
    
    // Animação CSS simples para dar o "fôlego" (pulso) e um brilho (glow) dourado.
    // Usaremos classes Tailwind para manter simples, ou injetar style no DOM
  }, [animated]);

  return (
    <div 
      ref={containerRef} 
      className="relative flex items-center justify-center"
      style={{ width, height }}
    >
      {animated && (
        <>
          <div className="absolute inset-0 bg-yellow-500/20 blur-2xl rounded-full animate-pulse z-0 scale-150"></div>
          <div className="absolute inset-0 bg-macaonico-dourado/10 blur-3xl rounded-full animate-ping z-0 scale-150" style={{ animationDuration: '3s' }}></div>
        </>
      )}
      <img 
        src="/core-icon.svg" 
        alt="CoReVM Logo Animado" 
        style={{ width: '100%', height: '100%' }}
        className="relative z-10 drop-shadow-[0_0_20px_rgba(234,179,8,0.4)]"
      />
    </div>
  );
};

export default LogoAnimadaCore;
