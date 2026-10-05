/**
 * ui.js — utilidades de pantalla compartidas: textos seguros, avisos, ventanas,
 * colores de la marca, carga de la plantilla del rubro e instalación en el celular (PWA).
 */

/** Escapa texto que viene de la planilla antes de meterlo en HTML. */
function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

let toastTimer = null;
function toast(mensaje, tipo) {
  const t = document.getElementById('toast');
  t.textContent = mensaje;
  t.className = 'visible' + (tipo === 'error' ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.className = ''; }, 3800);
}

/** Ventana de confirmación. Devuelve una promesa con true/false. */
function confirmar(titulo, texto, textoSi, peligro) {
  return new Promise(function (resolver) {
    const capa = document.createElement('div');
    capa.className = 'capa';
    capa.innerHTML =
      '<div class="ventana" role="dialog" aria-modal="true">' +
      '<h2>' + esc(titulo) + '</h2><p class="suave">' + esc(texto) + '</p>' +
      '<button class="btn ' + (peligro ? 'peligro' : '') + '" data-r="1">' + esc(textoSi) + '</button>' +
      '<button class="btn texto" data-r="0">Cancelar</button></div>';
    capa.addEventListener('click', function (e) {
      const b = e.target.closest('[data-r]');
      if (!b && e.target !== capa) return;
      capa.remove();
      resolver(b ? b.dataset.r === '1' : false);
    });
    document.body.appendChild(capa);
  });
}

/** Ventana informativa simple (HTML ya armado). */
function ventana(html) {
  const capa = document.createElement('div');
  capa.className = 'capa';
  capa.innerHTML = '<div class="ventana" role="dialog" aria-modal="true">' + html +
    '<button class="btn" data-cerrar>Entendido</button></div>';
  capa.addEventListener('click', function (e) {
    if (e.target === capa || e.target.closest('[data-cerrar]')) capa.remove();
  });
  document.body.appendChild(capa);
}

/* ───────────── Colores de la marca ───────────── */

/** Blanco o casi negro, el que mejor se lea sobre el color dado. */
function colorTextoSobre(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lin = function (c) { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
  const L = .2126 * lin(n >> 16) + .7152 * lin((n >> 8) & 255) + .0722 * lin(n & 255);
  return L > .4 ? '#1f1a17' : '#ffffff';
}

function aplicarMarca(marca) {
  const r = document.documentElement.style;
  const c1 = /^#[0-9a-f]{6}$/i.test(marca.color_primario) ? marca.color_primario : '#6B3E26';
  const c2 = /^#[0-9a-f]{6}$/i.test(marca.color_secundario) ? marca.color_secundario : '#F4E9DC';
  r.setProperty('--c1', c1);
  r.setProperty('--c2', c2);
  r.setProperty('--c1-texto', colorTextoSobre(c1));
  document.querySelector('meta[name=theme-color]').setAttribute('content', c1);
  document.title = marca.nombre;
}

/* ───────────── Plantilla por rubro ───────────── */

const PLANTILLA_DEFECTO = 'cafeteria';

function cargarArchivo(tipo, url) {
  return new Promise(function (ok, mal) {
    const el = document.createElement(tipo === 'css' ? 'link' : 'script');
    if (tipo === 'css') { el.rel = 'stylesheet'; el.href = url; } else { el.src = url; }
    el.onload = ok;
    el.onerror = mal;
    document.head.appendChild(el);
  });
}

/** Carga plantillas/<rubro>/. Si el rubro no tiene plantilla todavía, usa la de cafetería. */
async function cargarPlantilla(rubro) {
  const nombre = /^[a-z_]+$/.test(rubro || '') ? rubro : PLANTILLA_DEFECTO;
  try {
    await Promise.all([cargarArchivo('css', 'plantillas/' + nombre + '/plantilla.css'),
      cargarArchivo('js', 'plantillas/' + nombre + '/plantilla.js')]);
  } catch (e) {
    if (nombre === PLANTILLA_DEFECTO) throw e;
    return cargarPlantilla(PLANTILLA_DEFECTO);
  }
  document.body.classList.add('rubro-' + nombre);
  return window.PLANTILLAS[nombre];
}

/* ───────────── Instalación en el celular (PWA) ───────────── */

const Instalador = {
  aviso: null,          // evento de Chrome para mostrar "Instalar"
  esIOS: /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  instalada() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  },
  disponible() {
    return !this.instalada() && (!!this.aviso || this.esIOS);
  },
  async instalar() {
    if (this.aviso) {
      this.aviso.prompt();
      const r = await this.aviso.userChoice;
      this.aviso = null;
      return r.outcome === 'accepted';
    }
    if (this.esIOS) {
      ventana('<h2>Instalar en tu iPhone</h2>' +
        '<p>1. Tocá el botón <strong>Compartir</strong> <span aria-hidden="true">⬆️</span> abajo en Safari.</p>' +
        '<p>2. Elegí <strong>"Agregar a inicio"</strong>.</p>' +
        '<p class="suave">Te queda el ícono en el celular, como cualquier app.</p>');
    }
    return false;
  }
};

window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  Instalador.aviso = e;
  window.dispatchEvent(new Event('instalacion-disponible'));
});

/** Ícono cuadrado de la marca dibujado en el momento: fondo color_primario + sello. Devuelve PNG (data URL). */
function dibujarIcono(marca, svgSello, tamano) {
  return new Promise(function (ok) {
    const c = document.createElement('canvas');
    c.width = c.height = tamano;
    const g = c.getContext('2d');
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--c1').trim() || '#6B3E26';
    g.fillRect(0, 0, tamano, tamano);
    const colorSello = colorTextoSobre(g.fillStyle);
    const svg = svgSello.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="' + tamano + '" height="' + tamano + '" style="color:' + colorSello + '" ');
    const img = new Image();
    img.onload = function () {
      const m = tamano * .2;                        // margen: zona segura de íconos "maskable"
      g.drawImage(img, m, m, tamano - 2 * m, tamano - 2 * m);
      ok(c.toDataURL('image/png'));
    };
    img.onerror = function () { ok(c.toDataURL('image/png')); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/currentColor/g, colorSello));
  });
}

/**
 * Arma el "manifiesto" de la app con el nombre y el ícono de ESTA cafetería, para que al
 * instalarla quede "Café del Cerro" en el celular y no un nombre genérico.
 * Al abrir el ícono instalado, entra directo por el link de su sucursal.
 */
async function prepararInstalacion(marca, idSucursal, svgSello) {
  const base = location.href.split('?')[0].replace(/[^/]*$/, '');
  const [i192, i512] = await Promise.all([dibujarIcono(marca, svgSello, 192), dibujarIcono(marca, svgSello, 512)]);
  const c1 = getComputedStyle(document.documentElement).getPropertyValue('--c1').trim();
  const c2 = getComputedStyle(document.documentElement).getPropertyValue('--c2').trim();
  const manifiesto = {
    name: marca.nombre,
    short_name: marca.nombre.length > 14 ? marca.nombre.split(' ').slice(0, 2).join(' ') : marca.nombre,
    description: 'Tu tarjeta de sellos de ' + marca.nombre,
    start_url: base + 'index.html?s=' + encodeURIComponent(idSucursal),
    scope: base,
    id: base + '?s=' + encodeURIComponent(idSucursal),
    display: 'standalone',
    background_color: c2,
    theme_color: c1,
    icons: [
      { src: i192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: i512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: i512, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(manifiesto)], { type: 'application/manifest+json' }));
  enlaceHead('manifest').href = url;
  enlaceHead('apple-touch-icon').href = i192;
  enlaceHead('icon').href = i192;
  document.querySelector('meta[name=apple-mobile-web-app-title]').content = manifiesto.short_name;
}

/** Devuelve (o crea) un <link rel=...> del <head>. */
function enlaceHead(rel) {
  let l = document.querySelector('link[rel="' + rel + '"]');
  if (!l) { l = document.createElement('link'); l.rel = rel; document.head.appendChild(l); }
  return l;
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js'); });
}
