/* Foto vere cercate online, per parole chiave.
   · Wikimedia Commons: libere, senza chiave (le parole in inglese trovano di più: le aggiungo io).
   · Pexels: bellissime e verticali, con una chiave gratuita (facoltativa, nelle Impostazioni). */
const TRADUZIONI = {castello:'castle', fortezza:'fortress', torre:'tower', borgo:'village', paese:'village', villaggio:'village', citta:'town',
  valle:'valley', vallata:'valley', collina:'hill', colline:'hills', montagna:'mountain', montagne:'mountains', monte:'mountain', monti:'mountains',
  lago:'lake', fiume:'river', ruscello:'stream', cascata:'waterfall', mare:'sea', costa:'coast', scogliera:'cliff', spiaggia:'beach', porto:'harbour',
  bosco:'forest', foresta:'forest', alberi:'trees', querce:'oak', pini:'pine', cipressi:'cypress', campagna:'countryside', campi:'fields', prato:'meadow',
  vigneto:'vineyard', vigne:'vineyard', ulivi:'olive', neve:'snow', inverno:'winter', autunno:'autumn', primavera:'spring', estate:'summer',
  tramonto:'sunset', alba:'sunrise', notte:'night', nebbia:'fog', pioggia:'rain', temporale:'storm', nuvole:'clouds', cielo:'sky', luna:'moon',
  medievale:'medieval', abbazia:'abbey', chiesa:'church', rovine:'ruins', acquedotto:'aqueduct', toscana:'tuscany', umbria:'umbria', lazio:'lazio',
  alpi:'alps', dolomiti:'dolomites', panorama:'landscape', paesaggio:'landscape', ponte:'bridge', mulino:'mill', faro:'lighthouse'};
function inInglese(testo){
  const p = slug(testo, 200).split('-').filter(Boolean);
  const en = p.map(w => TRADUZIONI[w]).filter(Boolean);
  return [...new Set([...p.filter(w => !TRADUZIONI[w] || TRADUZIONI[w] === w), ...en])].join(' ');
}

async function cercaWikimedia(testo){
  const q = inInglese(testo) + ' filetype:bitmap';
  const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=50' +
    '&gsrsearch=' + encodeURIComponent(q) + '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1600&iiextmetadatafilter=Artist|LicenseShortName|ImageDescription';
  const r = await fetch(u);
  if (!r.ok) throw new Error('Wikimedia non risponde (' + r.status + ').');
  const j = await r.json();
  const pagine = Object.values((j.query && j.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const testoPulito = h => String(h || '').replace(/<[^>]+>/g, '').trim();
  return pagine.map(p => {
    const i = (p.imageinfo || [])[0]; if (!i || !/jpeg|png/.test(i.mime) || i.width < 900) return null;
    const meta = i.extmetadata || {};
    return {fonte:'Wikimedia', id:'wm' + p.pageid, w:i.width, h:i.height, verticale: i.height >= i.width * .95,
      miniatura: i.thumburl, grande: i.thumburl, pagina: i.descriptionurl,
      titolo: p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' '),
      autore: testoPulito(meta.Artist && meta.Artist.value).slice(0, 80), licenza: testoPulito(meta.LicenseShortName && meta.LicenseShortName.value)};
  }).filter(Boolean).sort((a, b) => (b.verticale - a.verticale));
}

async function cercaPexels(testo, chiave){
  const u = 'https://api.pexels.com/v1/search?per_page=40&orientation=portrait&query=' + encodeURIComponent(inInglese(testo));
  const r = await fetch(u, {headers:{Authorization:chiave}});
  if (r.status === 401) throw new Error('La chiave Pexels non è valida.');
  if (!r.ok) throw new Error('Pexels non risponde (' + r.status + ').');
  const j = await r.json();
  return (j.photos || []).map(f => ({fonte:'Pexels', id:'px' + f.id, w:f.width, h:f.height, verticale:true,
    miniatura: f.src.portrait || f.src.medium, grande: f.src.original + '?auto=compress&cs=tinysrgb&h=2400', pagina: f.url,
    titolo: f.alt || 'Foto Pexels', autore: f.photographer, licenza:'Licenza Pexels'}));
}

async function cercaFoto(testo, chiavePexels){
  const lavori = [cercaWikimedia(testo).catch(e => ({errore:e.message}))];
  if (chiavePexels) lavori.unshift(cercaPexels(testo, chiavePexels).catch(e => ({errore:e.message})));
  const esiti = await Promise.all(lavori);
  const foto = esiti.filter(Array.isArray).flat(), errori = esiti.filter(x => x && x.errore).map(x => x.errore);
  if (!foto.length && errori.length) throw new Error(errori.join(' · '));
  return foto;
}
