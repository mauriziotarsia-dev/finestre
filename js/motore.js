const ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- colori ---------- */
const hex = h => [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const mix = (a,b,k)=>[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k];
const css = (c,a=1)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
const lerp=(a,b,k)=>a+(b-a)*k;

const ORE = {
  alba:    {cielo:'#34406e',orizz:'#f0a46c',lontano:'#8b7690',vicino:'#2f2c3c',astro:'#ffd9a0',nuvola:'#f3b9a0',neve:'#f6dccb',mare:'#5a5674',stelle:.15,luna:0,ax:.28,ay:.56},
  giorno:  {cielo:'#3f84cf',orizz:'#cfe5f4',lontano:'#8ea9ba',vicino:'#34502f',astro:'#fff6d8',nuvola:'#ffffff',neve:'#f7fbff',mare:'#3c6f94',stelle:0,luna:0,ax:.62,ay:.16},
  tramonto:{cielo:'#29265a',orizz:'#ff8646',lontano:'#79566a',vicino:'#2a2030',astro:'#ffb36b',nuvola:'#f19a7a',neve:'#f2c3b0',mare:'#4b3a5c',stelle:.2,luna:0,ax:.72,ay:.52},
  notte:   {cielo:'#060a1a',orizz:'#1b2a4c',lontano:'#1c2639',vicino:'#090d16',astro:'#e8eeff',nuvola:'#3a4766',neve:'#9fb0cc',mare:'#0f1a2e',stelle:1,luna:1,ax:.34,ay:.18}
};
const METEO = {
  sereno:   {coperto:0,nebbia:0,pioggia:0,neve:0,tempesta:0},
  nebbia:   {coperto:.45,nebbia:.85,pioggia:0,neve:0,tempesta:0},
  pioggia:  {coperto:.9,nebbia:.3,pioggia:.8,neve:0,tempesta:0},
  temporale:{coperto:1,nebbia:.2,pioggia:1,neve:0,tempesta:1},
  neve:     {coperto:.8,nebbia:.35,pioggia:0,neve:1,tempesta:0}
};
const NOMI = {valle:'Valle col castello',foresta:'Foresta',costa:'Costa',picchi:'Picchi innevati',
  alba:'Alba',giorno:'Giorno',tramonto:'Tramonto',notte:'Notte',
  sereno:'Sereno',nebbia:'Nebbia',pioggia:'Pioggia',temporale:'Temporale',neve:'Neve'};

/* ---------- stato ---------- */
const stato = {scena:'valle',ora:'notte',meteo:'sereno',luce:100,prospettiva:true};

function paletteDi(nome){const p=ORE[nome],o={};for(const k in p)o[k]=typeof p[k]==='string'?hex(p[k]):p[k];return o}
const cur = paletteDi(stato.ora);
const met = Object.assign({}, METEO[stato.meteo]);
let scenaInVista = stato.scena, buio = 0, cambio = null;

/* ---------- casualità ripetibile ---------- */
function rnd(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}
function cresta(seed,base,amp,freq){
  const r=rnd(seed),onde=freq.map(f=>({f,a:1/f,p:r()}));const tot=onde.reduce((s,o)=>s+o.a,0);
  return u=>base-amp*onde.reduce((s,o)=>s+o.a*Math.sin(2*Math.PI*(o.f*u+o.p)),0)/tot;
}
const gobba=(c,w,h)=>u=>-h*Math.exp(-(((u-c)/w)**2));

/* ---------- scene: strati dal più lontano al più vicino ---------- */
function alberi(seed,n){const r=rnd(seed);return Array.from({length:n},()=>({u:r()*1.1-.05,h:.035+r()*.05}))}
const SCENE = {
  valle:{strati:[
    {p:.05,f:cresta(3,.50,.07,[1.2,2.7,6.1])},
    {p:.3,f:cresta(7,.58,.05,[1.7,3.9,9.3])},
    {p:.6,f:(c=>u=>c(u)+gobba(.56,.09,.09)(u))(cresta(11,.70,.03,[2.1,5.3])),castello:.56},
    {p:1,f:cresta(19,.88,.025,[2.5,7.1]),alberi:alberi(5,26)}]},
  foresta:{strati:[
    {p:.05,f:cresta(23,.52,.05,[1.1,2.9])},
    {p:.35,f:cresta(29,.62,.04,[1.9,4.7]),alberi:alberi(31,60)},
    {p:.65,f:cresta(37,.74,.035,[2.3,5.9]),alberi:alberi(41,42)},
    {p:1,f:cresta(43,.90,.03,[3.1,7.7]),alberi:alberi(47,22)}]},
  costa:{mare:.62,strati:[
    {p:.05,f:(c=>u=>u<.62?c(u):lerp(c(.62),.66,Math.min(1,(u-.62)/.12)))(cresta(53,.53,.06,[1.4,3.3]))},
    {p:1,f:u=>u<.30?.70+.05*Math.sin(u*14):u<.42?lerp(.72,1.05,(u-.30)/.12):1.05,alberi:alberi(59,10).filter(a=>a.u<.3)}]},
  picchi:{strati:[
    {p:.05,f:cresta(61,.44,.17,[2.3,4.1,9.7]),innevato:.47},
    {p:.35,f:cresta(67,.58,.11,[2.9,6.3,13]),innevato:.6},
    {p:.7,f:cresta(71,.76,.04,[2.1,5.7]),alberi:alberi(73,50)},
    {p:1,f:cresta(79,.92,.025,[3.3,8.1]),alberi:alberi(83,18)}]}
};

const STELLE = (()=>{const r=rnd(97);return Array.from({length:120},()=>({u:r(),y:r()*.55,s:.4+r()*1.2,f:r()*6}))})();
const NUVOLE = (()=>{const r=rnd(101);return Array.from({length:7},()=>({u:r(),y:.06+r()*.32,s:.6+r()*.8,v:.004+r()*.006}))})();
const GOCCE = (()=>{const r=rnd(103);return Array.from({length:240},()=>({x:r(),y:r(),l:.03+r()*.04,v:1.4+r()*.8}))})();
const FIOCCHI = (()=>{const r=rnd(107);return Array.from({length:150},()=>({x:r(),y:r(),r:.6+r()*1.8,v:.05+r()*.06,f:r()*6}))})();

/* ---------- lampi ---------- */
let lampo = null, prossimoLampo = 0;
function scocca(){const r=rnd((performance.now()*1000)|0);const pts=[];let u=.3+r()*.4,y=0;pts.push([u,y]);
  while(y<.62){y+=.04+r()*.05;u+=(r()-.5)*.06;pts.push([u,y])}
  lampo={t:performance.now(),pts};}

/* ---------- disegno ---------- */
function disegna(ctx,w,h,lato,t){
  const sc=SCENE[scenaInVista], spost=p=>stato.prospettiva?lato*p*.09:0;
  const X=(u,p)=>((u-.17-spost(p))/.66)*w;  /* il mondo è largo 1, la finestra ne mostra il 66% */
  const cop=met.coperto, grigio=hex('#6b7280');
  const cielo=mix(cur.cielo,mix(grigio,cur.cielo,.35),cop*.8), orizz=mix(cur.orizz,mix(grigio,cur.orizz,.4),cop*.75);
  /* cielo */
  let g=ctx.createLinearGradient(0,0,0,h*.7);g.addColorStop(0,css(cielo));g.addColorStop(1,css(orizz));
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  /* stelle */
  const sa=cur.stelle*(1-cop);
  if(sa>.02){for(const s of STELLE){const a=sa*(.55+.45*Math.sin(t*1.3+s.f));ctx.fillStyle=`rgba(235,240,255,${a})`;
    ctx.fillRect(X(s.u,0),s.y*h,s.s*w/180,s.s*w/180)}}
  /* sole o luna */
  const vis=1-cop*.92;
  if(vis>.05){const ax=X(cur.ax,0),ay=cur.ay*h,R=w*(.06+.02*(1-cur.luna));
    g=ctx.createRadialGradient(ax,ay,0,ax,ay,R*6);g.addColorStop(0,css(cur.astro,.55*vis));g.addColorStop(1,css(cur.astro,0));
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.fillStyle=css(cur.astro,vis);ctx.beginPath();ctx.arc(ax,ay,R,0,7);ctx.fill();
    if(cur.luna>.5){ctx.fillStyle=css(cielo,.5*vis);ctx.beginPath();ctx.arc(ax+R*.35,ay-R*.2,R*.9,0,7);ctx.fill()}}
  /* nuvole */
  const nc=mix(cur.nuvola,grigio,cop*.6), na=.28+cop*.6;
  for(const n of NUVOLE){const u=((n.u+t*n.v*(ridotto?.2:1))%1.3)-.15, cx=X(u,.02), cy=n.y*h, s=n.s*w*.22;
    ctx.fillStyle=css(nc,na*.6);
    for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(cx+(i-2)*s*.45,cy+Math.sin(i*1.7)*s*.08,s*.5,s*.22,0,0,7);ctx.fill()}}
  /* mare */
  if(sc.mare){const my=sc.mare*h;g=ctx.createLinearGradient(0,my,0,h);g.addColorStop(0,css(mix(cur.mare,orizz,.35)));g.addColorStop(1,css(mix(cur.mare,hex('#000000'),.5)));
    ctx.fillStyle=g;ctx.fillRect(0,my,w,h-my);
    if(vis>.1){const ax=X(cur.ax,0);for(let i=0;i<26;i++){const y=my+((i*37+t*8)%(h-my));const lw=w*(.03+.12*(1-(y-my)/(h-my)))*(.6+.4*Math.sin(t*2+i));
      ctx.fillStyle=css(cur.astro,.35*vis);ctx.fillRect(ax-lw/2+Math.sin(t+i)*4,y,lw,1.5)}}}
  /* strati */
  const nebbiaCol=mix(orizz,hex('#9aa3ad'),.4);
  sc.strati.forEach(s=>{
    let col=mix(cur.lontano,cur.vicino,s.p);col=mix(col,grigio,cop*.15*(1-s.p));
    col=mix(col,nebbiaCol,met.nebbia*(1-s.p)*.85);
    ctx.beginPath();ctx.moveTo(0,h);for(let x=0;x<=w+3;x+=3){const u=.17+spost(s.p)+(x/w)*.66;ctx.lineTo(x,s.f(u)*h)}ctx.lineTo(w,h);ctx.closePath();
    ctx.fillStyle=css(col);ctx.fill();
    if(s.innevato){ctx.save();ctx.clip();const sn=mix(cur.neve,nebbiaCol,met.nebbia*.6);
      ctx.fillStyle=css(sn,.92);ctx.beginPath();ctx.moveTo(0,0);
      for(let x=0;x<=w+3;x+=3){const u=.17+spost(s.p)+(x/w)*.66;ctx.lineTo(x,(s.innevato+.012*Math.sin(u*90))*h)}ctx.lineTo(w,0);ctx.fill();ctx.restore()}
    if(s.alberi){ctx.fillStyle=css(mix(col,hex('#000000'),.25));for(const a of s.alberi){const x=X(a.u,s.p),y=s.f(a.u)*h+2,ah=a.h*h,aw=ah*.42;
      ctx.beginPath();ctx.moveTo(x,y-ah);ctx.lineTo(x-aw/2,y);ctx.lineTo(x+aw/2,y);ctx.fill()}}
    if(s.castello!=null){const cx=X(s.castello,s.p),cy=s.f(s.castello)*h+1,u=w*.035;ctx.fillStyle=css(mix(col,hex('#000000'),.3));
      ctx.fillRect(cx-u*2.2,cy-u*2.2,u*4.4,u*2.2);
      [[-2.2,3.6],[-.6,4.6],[1.2,3.2]].forEach(([dx,th])=>{ctx.fillRect(cx+dx*u,cy-th*u,u*1.1,th*u);
        ctx.beginPath();ctx.moveTo(cx+dx*u-u*.15,cy-th*u);ctx.lineTo(cx+dx*u+u*.55,cy-th*u-u*1.2);ctx.lineTo(cx+dx*u+u*1.25,cy-th*u);ctx.fill()});
      if(cur.stelle>.3){ctx.fillStyle=`rgba(255,190,90,${cur.stelle*(.75+.25*Math.sin(t*3))})`;
        [[-1.9,1.2],[-.25,2.6],[-.25,1.4],[1.5,1.6],[.6,1]].forEach(([dx,dy])=>ctx.fillRect(cx+dx*u,cy-dy*u,u*.28,u*.4))}}
  });
  /* nebbia che scorre */
  if(met.nebbia>.02){for(let i=0;i<4;i++){const y=h*(.5+i*.12),off=((t*(6+i*3)*(ridotto?.2:1))%w);
    g=ctx.createLinearGradient(0,y-h*.08,0,y+h*.08);g.addColorStop(0,css(nebbiaCol,0));g.addColorStop(.5,css(nebbiaCol,met.nebbia*.45));g.addColorStop(1,css(nebbiaCol,0));
    ctx.fillStyle=g;ctx.fillRect(-off,y-h*.08,w*2,h*.16)}}
  /* buio del brutto tempo */
  const scuro=cop*.28+met.tempesta*.22;if(scuro>0){ctx.fillStyle=`rgba(5,8,15,${scuro})`;ctx.fillRect(0,0,w,h)}
  /* pioggia */
  const ng=Math.round(GOCCE.length*met.pioggia);
  if(ng){ctx.strokeStyle=css(mix(orizz,hex('#ffffff'),.5),.45);ctx.lineWidth=Math.max(1,w/220);ctx.beginPath();
    for(let i=0;i<ng;i++){const d=GOCCE[i],y=((d.y+t*d.v*(ridotto?.25:1))%1.1)-.05,x=((d.x+y*.08)%1)*w;ctx.moveTo(x,y*h);ctx.lineTo(x-d.l*h*.08,y*h+d.l*h)}ctx.stroke()}
  /* neve */
  const nf=Math.round(FIOCCHI.length*met.neve);
  if(nf){ctx.fillStyle='rgba(245,248,255,.85)';for(let i=0;i<nf;i++){const f=FIOCCHI[i],y=((f.y+t*f.v*(ridotto?.3:1))%1.05),x=((f.x+Math.sin(t*.8+f.f)*.02)%1)*w;
    ctx.beginPath();ctx.arc(x,y*h,f.r*w/200,0,7);ctx.fill()}}
  /* lampo */
  if(lampo){const dt=performance.now()-lampo.t;if(dt<900){
    const k=dt<120?1:dt<200?.25:dt<280?.8:Math.max(0,1-(dt-280)/620);
    ctx.fillStyle=`rgba(225,232,255,${.55*k})`;ctx.fillRect(0,0,w,h);
    if(dt<220){ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=Math.max(1.5,w/110);ctx.beginPath();
      lampo.pts.forEach(([u,y],i)=>{const x=X(u,.05);i?ctx.lineTo(x,y*h):ctx.moveTo(x,y*h)});ctx.stroke()}}}
  /* luce del monitor e cambio scena */
  const spento=(1-stato.luce/100)*.85+buio*(1-(1-stato.luce/100)*.85);
  if(spento>0){ctx.fillStyle=`rgba(0,0,0,${spento})`;ctx.fillRect(0,0,w,h)}
}

