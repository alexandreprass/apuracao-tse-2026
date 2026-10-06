// Pure colour maths used by build + verify (no deps).
export const hex2rgb = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255);
export const lin = v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4;
export const unlin = v => v <= .0031308 ? v*12.92 : 1.055*v**(1/2.4) - .055;
export const rgb2hex = rgb => '#' + rgb.map(v => Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0')).join('');
export const lum = h => { const [r,g,b] = hex2rgb(h).map(lin); return .2126*r + .7152*g + .0722*b; };
export const contrast = (a,b) => { const x = lum(a), y = lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
// OKLab — identical constants to src/lib/color.js so mix() matches marginColor exactly.
export function toOk(h){ const [r,g,b]=hex2rgb(h).map(lin);
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b), m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b), s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.793617785*m-.0040720468*s, 1.9779984951*l-2.428592205*m+.4505937099*s, .0259040371*l+.7827717662*m-.808675766*s]; }
export function fromOk([L,a,b]){ const l=(L+.3963377774*a+.2158037573*b)**3, m=(L-.1055613458*a-.0638541728*b)**3, s=(L-.0894841775*a-1.291485548*b)**3;
  return rgb2hex([4.0767416621*l-3.3077115913*m+.2309699292*s, -1.2684380046*l+2.6097574011*m-.3413193965*s, -.0041960863*l-.7034186147*m+1.707614701*s].map(v=>unlin(Math.max(0,Math.min(1,v))))); }
export const mix = (from,to,t) => { const a=toOk(from), b=toOk(to); return fromOk(a.map((v,i)=>v+(b[i]-v)*t)); };
// CIELAB (D65) + CIEDE2000 (Sharma 2005)
export function toLab(h){ const [r,g,b]=hex2rgb(h).map(lin);
  const X=(.4124564*r+.3575761*g+.1804375*b)/.95047, Y=(.2126729*r+.7151522*g+.072175*b), Z=(.0193339*r+.119192*g+.9503041*b)/1.08883;
  const f=t=>t>216/24389?Math.cbrt(t):(24389/27*t+16)/116; const fx=f(X),fy=f(Y),fz=f(Z); return [116*fy-16,500*(fx-fy),200*(fy-fz)]; }
export const de2000 = (h1,h2) => de2000Lab(toLab(h1),toLab(h2));
export function de2000Lab([L1,a1,b1],[L2,a2,b2]){ const rad=Math.PI/180;
  const C1=Math.hypot(a1,b1),C2=Math.hypot(a2,b2),Cm=(C1+C2)/2,G=.5*(1-Math.sqrt(Cm**7/(Cm**7+25**7)));
  const a1p=(1+G)*a1,a2p=(1+G)*a2,C1p=Math.hypot(a1p,b1),C2p=Math.hypot(a2p,b2);
  const hp=(a,b)=>{ if(a===0&&b===0) return 0; let h=Math.atan2(b,a)/rad; return h<0?h+360:h; };
  const h1p=hp(a1p,b1),h2p=hp(a2p,b2); const dL=L2-L1,dC=C2p-C1p; let dh=0;
  if(C1p*C2p!==0){ dh=h2p-h1p; if(dh>180) dh-=360; else if(dh<-180) dh+=360; }
  const dH=2*Math.sqrt(C1p*C2p)*Math.sin(dh/2*rad); const Lm=(L1+L2)/2,Cmp=(C1p+C2p)/2; let hm=h1p+h2p;
  if(C1p*C2p!==0){ if(Math.abs(h1p-h2p)>180) hm = (h1p+h2p<360)? (h1p+h2p+360)/2 : (h1p+h2p-360)/2; else hm=(h1p+h2p)/2; }
  const T=1-.17*Math.cos((hm-30)*rad)+.24*Math.cos(2*hm*rad)+.32*Math.cos((3*hm+6)*rad)-.2*Math.cos((4*hm-63)*rad);
  const dTh=30*Math.exp(-(((hm-275)/25)**2)),Rc=2*Math.sqrt(Cmp**7/(Cmp**7+25**7)),Sl=1+(.015*(Lm-50)**2)/Math.sqrt(20+(Lm-50)**2),Sc=1+.045*Cmp,Sh=1+.015*Cmp*T,Rt=-Math.sin(2*dTh*rad)*Rc;
  return Math.sqrt((dL/Sl)**2+(dC/Sc)**2+(dH/Sh)**2+Rt*(dC/Sc)*(dH/Sh)); }
// Machado, Oliveira & Fernandes 2009, severity 1.0, applied in linear RGB.
export const MACHADO = {
  protan: [[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
  deutan: [[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
};
export function cvd(h,type){ const v=hex2rgb(h).map(lin), M=MACHADO[type]; return rgb2hex(M.map(r=>unlin(Math.max(0,Math.min(1,r[0]*v[0]+r[1]*v[1]+r[2]*v[2]))))); }
export const toOklch = h => { const [L,a,b]=toOk(h); return [L, Math.hypot(a,b), (Math.atan2(b,a)*180/Math.PI+360)%360]; };
export const fromOklch = ([L,C,H]) => fromOk([L, C*Math.cos(H*Math.PI/180), C*Math.sin(H*Math.PI/180)]);
