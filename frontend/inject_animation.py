# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import re

path = 'src/compartilhado/componentes/LogoAnimadaCore.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add imports if missing
if 'useEffect' not in content:
    content = content.replace("import React from 'react';", "import React, { useEffect, useRef } from 'react';")

# Add the neonColors constant before the component definition
neonColors_block = """
const neonColors = ['#4A90E2', '#D4AF37', '#00FF9D', '#FF0055', '#B026FF', '#FFFFFF', '#38bdf8'];
"""
if "neonColors =" not in content:
    content = content.replace("export const LogoAnimadaCore", neonColors_block + "\nexport const LogoAnimadaCore")

# Find the start of the component body
body_start = content.find("=> {") + 4

use_effect_block = """
  const track0Ref = useRef<SVGPathElement>(null);
  const track1Ref = useRef<SVGPathElement>(null);
  const track2Ref = useRef<SVGPathElement>(null);
  const glow1Ref = useRef<SVGEllipseElement>(null);
  const glow2Ref = useRef<SVGEllipseElement>(null);

  useEffect(() => {
    if (!animated) return;
    
    let isMounted = true;
    const tracks = [track0Ref.current, track1Ref.current, track2Ref.current].filter(Boolean) as SVGPathElement[];
    if (tracks.length === 0) return;

    function launchGlow(glowElement: SVGEllipseElement | null) {
      if (!isMounted || !glowElement) return;

      const trackIdx = Math.floor(Math.random() * tracks.length);
      const track = tracks[trackIdx];
      const totalLen = track.getTotalLength();
      
      const reverse = Math.random() > 0.5;
      const color = neonColors[Math.floor(Math.random() * neonColors.length)];
      glowElement.setAttribute('fill', color);
      
      const duration = 1500 + Math.random() * 1000; 
      
      const animation = glowElement.animate([
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: 0.1 },
        { opacity: 1, offset: 0.9 },
        { opacity: 0, offset: 1 }
      ], {
        duration: duration,
        easing: 'ease-in-out',
        fill: 'forwards'
      });

      let start: number | null = null;
      let frameId: number;

      function step(timestamp: number) {
        if (!isMounted) return;
        if (!start) start = timestamp;
        const progress = (timestamp - start) / duration;
        
        if (progress < 1) {
          const p = reverse ? (1 - progress) : progress;
          const point = track.getPointAtLength(p * totalLen);
          
          const delta = 10;
          const nextP = Math.min(Math.max(p * totalLen + (reverse ? -delta : delta), 0), totalLen);
          const pointNext = track.getPointAtLength(nextP);
          
          let dx = pointNext.x - point.x;
          let dy = pointNext.y - point.y;
          
          if (dx === 0 && dy === 0) {
            const prevP = Math.min(Math.max(p * totalLen + (reverse ? delta : -delta), 0), totalLen);
            const pointPrev = track.getPointAtLength(prevP);
            dx = point.x - pointPrev.x;
            dy = point.y - pointPrev.y;
          }
          
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          
          glowElement.setAttribute('transform', `translate(${point.x}, ${point.y}) rotate(${angle})`);
          frameId = requestAnimationFrame(step);
        } else {
          setTimeout(() => launchGlow(glowElement), Math.random() * 2000 + 500);
        }
      }
      frameId = requestAnimationFrame(step);
    }

    const t1 = setTimeout(() => launchGlow(glow1Ref.current), 800);
    const t2 = setTimeout(() => launchGlow(glow2Ref.current), 1800);

    return () => {
      isMounted = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [animated]);
"""

if "const track0Ref" not in content:
    content = content[:body_start] + use_effect_block + content[body_start:]


# Attach refs to the first 3 paths
paths = re.findall(r'<path[^>]*>', content)
if len(paths) >= 3 and "ref={track0Ref}" not in content:
    content = content.replace(paths[0], paths[0].replace("<path", "<path ref={track0Ref}", 1), 1)
    content = content.replace(paths[1], paths[1].replace("<path", "<path ref={track1Ref}", 1), 1)
    content = content.replace(paths[2], paths[2].replace("<path", "<path ref={track2Ref}", 1), 1)

# Add glow layer and defs for blur if they don't exist
glow_layer = """
              {animated && (
                <g id="animation-layer">
                  <ellipse ref={glow1Ref} cx="0" cy="0" rx="300" ry="40" fill="yellow" filter="url(#dataGlow)" style={{ opacity: 0, mixBlendMode: 'screen' }} />
                  <ellipse ref={glow2Ref} cx="0" cy="0" rx="300" ry="40" fill="yellow" filter="url(#dataGlow)" style={{ opacity: 0, mixBlendMode: 'screen' }} />
                </g>
              )}
</svg>
"""

if "id=\"animation-layer\"" not in content:
    content = content.replace("</svg>", glow_layer)

if "id=\"dataGlow\"" not in content:
    defs_block = """
  <filter id="dataGlow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="30" result="blur" />
    <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
"""
    content = content.replace("<defs>", "<defs>" + defs_block)


with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
