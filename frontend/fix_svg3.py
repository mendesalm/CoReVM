# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import re

path = 'src/compartilhado/componentes/LogoAnimadaCore.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace hardcoded mm width/height with 100%
content = re.sub(r'width="[^"]*mm"', 'width="100%"', content)
content = re.sub(r'height="[^"]*mm"', 'height="100%"', content)

# To animate the logo itself like Harmonia, we can add a subtle CSS animation to the SVG wrapper.
# Since it's a static SVG, we can make it float or glow by adding a class to the <svg> wrapper or paths.
# Let's add 'animate-pulse' or similar to the inner div.
content = content.replace(
    "className='relative z-10 drop-shadow-[0_0_20px_rgba(234,179,8,0.4)]'",
    "className='relative z-10 drop-shadow-[0_0_20px_rgba(234,179,8,0.4)] animate-[pulse_3s_ease-in-out_infinite]'"
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
