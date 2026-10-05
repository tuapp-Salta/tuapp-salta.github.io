/**
 * cliente.js — pantallas del cliente:
 * bienvenida → registro / login → tarjeta (inicio) → QR → ofertas → perfil.
 * Habla con el backend solo a través de api() (api.js).
 */

const App = {
  s: null,             // id_sucursal que vino en el link (?s=SUC-0001)
  marca: null,         // nombre, colores, premio… (público)
  sucursal: null,
  plantilla: null,     // plantilla del rubro (sellos, textos)
  tarjeta: null,       // última respuesta de miTarjeta
  vista: null,
  sondeo: null,        // consulta periódica mientras se muestra el QR
  vistos: {},          // eventos ya registrados en esta apertura
  menu: null,          // último menú descargado
  filtroEtiqueta: ''   // etiqueta elegida en el menú ("sin TACC", "vegano"…)
};

const PESTANAS = ['tarjeta', 'menu', 'ofertas', 'perfil'];

const SONDEO_MS = 4000;
const SONDEO_MAX_MS = 3 * 60 * 1000;

const ICONOS = {
  tarjeta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/></svg>',
  ofertas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  perfil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h11M8 8h6M8 11h4"/></svg>',
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h7v-4"/></svg>'
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function $vista() { return document.getElementById('vista'); }

const formatoPrecio = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

function cargando() {
  $vista().innerHTML = '<div class="cargando"><div class="centro"><div class="ruedita" aria-label="Cargando" style="margin:0 auto"></div>' +
    '<p class="suave" id="cargando-texto" style="margin-top:14px;font-size:.9rem;visibility:hidden">Conectando… la primera vez puede tardar unos segundos.</p></div></div>';
  setTimeout(function () {
    const t = document.getElementById('cargando-texto');
    if (t) t.style.visibility = 'visible';
  }, 4000);
}

/** En lugar de dejar la ruedita girando: muestra el error y un botón para reintentar la pantalla. */
function errorEnPantalla(mensaje, pantalla) {
  $vista().innerHTML = '<div class="bloque centro" style="margin-top:20px"><p>' + esc(mensaje) + '</p>' +
    '<button class="btn" data-ir="' + pantalla + '">Reintentar</button></div>';
}

/** "lun 5 oct · 10:30" a partir de "2026-10-05T10:30:00" */
function fechaCorta(iso) {
  const p = String(iso).split(/[-T:]/).map(Number);
  const f = new Date(p[0], p[1] - 1, p[2]);
  const dia = f.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  return dia + (p[3] != null ? ' · ' + String(p[3]).padStart(2, '0') + ':' + String(p[4]).padStart(2, '0') : '');
}

function fechaDMA(iso) {
  const p = String(iso).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
}

function evento(tipo, detalle) {
  if (!Sesion.token()) return;
  api('registrarEvento', { tipo: tipo, detalle: detalle || '' }).catch(function () { /* no molestar al cliente */ });
}

function logoHTML() {
  if (App.marca.logo_url) return '<img src="' + esc(App.marca.logo_url) + '" alt="">';
  return esc(App.marca.nombre.charAt(0));
}

/* ───────────── Arranque ───────────── */

async function iniciar() {
  window.addEventListener('sesion-vencida', function () { irA('login'); });
  window.addEventListener('instalacion-disponible', function () {
    if (App.vista === 'tarjeta' || App.vista === 'perfil') irA(App.vista);
  });

  const delLink = new URLSearchParams(location.search).get('s');
  App.s = delLink || Sesion.ultimaSucursal();
  if (!App.s) return pantallaSinLocal();

  // Si el celular ya conoce esta cafetería, arranca al instante con lo guardado
  // y actualiza la marca (colores, premio) por detrás.
  const guardado = Sesion.brandingGuardado(App.s);
  const actualizar = api('marcaPublica', { id_sucursal: App.s }).then(async function (r) {
    await prepararMarca(r);
    Sesion.recordarSucursal(App.s, r);
  });

  if (guardado) {
    await prepararMarca(guardado);
    actualizar.catch(function (e) { if (e.codigo) pantallaError(e.message); });   // sin internet: se sigue con lo guardado
  } else {
    cargando();
    try { await actualizar; } catch (e) { return pantallaError(e.message); }
  }

  if (Sesion.token()) {
    evento('abrio_app');
    irA('tarjeta');
  } else {
    irA('bienvenida');
  }
}

async function prepararMarca(r) {
  App.marca = r.marca;
  App.sucursal = r.sucursal;
  Sesion.marca = r.marca.nombre;
  aplicarMarca(r.marca);
  if (!App.plantilla) App.plantilla = await cargarPlantilla(r.marca.rubro);
  document.getElementById('cabecera').innerHTML =
    '<div class="logo">' + logoHTML() + '</div><div><div class="nombre-marca">' + esc(r.marca.nombre) +
    '</div><div class="sucursal">' + esc(r.sucursal.nombre) + '</div></div>';
  const pestanaMenu = document.querySelector('#tabs [data-ir=menu] span');
  if (pestanaMenu) pestanaMenu.textContent = App.plantilla.textos.menu || 'Menú';
  prepararInstalacion(r.marca, App.s, App.plantilla.sello(r.marca.diseno_sello)).catch(function () {});
}

function irA(nombre, datos) {
  clearInterval(App.sondeo);
  App.sondeo = null;
  App.vista = nombre;
  // El menú también se ve sin cuenta: en ese caso, sin la barra de pestañas.
  const conTabs = ['tarjeta', 'qr', 'ofertas', 'perfil'].indexOf(nombre) >= 0 || (nombre === 'menu' && !!Sesion.token());
  const tabs = document.getElementById('tabs');
  tabs.hidden = !conTabs;
  tabs.querySelectorAll('button').forEach(function (b) {
    b.classList.toggle('activo', b.dataset.ir === nombre || (nombre === 'qr' && b.dataset.ir === 'tarjeta'));
  });
  window.scrollTo(0, 0);
  PANTALLAS[nombre](datos || {});
}

/* ───────────── Pantallas ───────────── */

const PANTALLAS = {

  bienvenida() {
    const m = App.marca;
    $vista().innerHTML =
      '<section class="portada">' +
      '<div class="logo-grande">' + (m.logo_url ? logoHTML() : App.plantilla.sello(m.diseno_sello)) + '</div>' +
      '<h1>' + esc(m.nombre) + '</h1>' +
      '<p class="suave">' + esc(App.plantilla.textos.bienvenida) + '</p>' +
      '<div class="bloque"><strong>' + esc(m.premio_texto) + '</strong><br><span class="suave">al juntar ' +
      m.sellos_para_premio + ' sellos</span></div>' +
      '<div class="acciones">' +
      '<button class="btn" data-ir="registro">Registrarme</button>' +
      '<button class="btn secundario" data-ir="login">Ya tengo cuenta</button>' +
      '<button class="btn texto" data-ir="menu">' + ICONOS.menu.replace('<svg ', '<svg width="22" height="22" ') + ' Ver el ' + esc((App.plantilla.textos.menu || 'Menú').toLowerCase()) + '</button>' +
      '</div></section>' + pie();
  },

  registro() {
    const dias = Array.from({ length: 31 }, function (_, i) { return '<option value="' + (i + 1) + '">' + (i + 1) + '</option>'; }).join('');
    const meses = MESES.map(function (m, i) { return '<option value="' + (i + 1) + '">' + m + '</option>'; }).join('');
    $vista().innerHTML =
      '<h1>Creá tu cuenta</h1><p class="suave">Te lleva menos de un minuto.</p>' +
      '<form id="form-registro" class="bloque" novalidate>' +
      '<div class="campo"><label for="r-nombre">Nombre</label><input id="r-nombre" type="text" autocomplete="given-name" maxlength="60" required></div>' +
      '<div class="campo"><label for="r-tel">Teléfono celular</label><input id="r-tel" type="tel" inputmode="numeric" autocomplete="tel" placeholder="3874123456" required>' +
      '<div class="ayuda">Con característica, sin 0 ni 15.</div></div>' +
      '<div class="campo"><label>Tu cumpleaños</label><div class="fila">' +
      '<select id="r-dia" aria-label="Día"><option value="">Día</option>' + dias + '</select>' +
      '<select id="r-mes" aria-label="Mes"><option value="">Mes</option>' + meses + '</select></div>' +
      '<div class="ayuda">Para saludarte en tu día. El año no hace falta.</div></div>' +
      '<div class="campo"><label for="r-pin">Elegí un PIN de 4 números</label><div class="fila">' +
      '<input id="r-pin" class="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" placeholder="••••">' +
      '<input id="r-pin2" class="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" placeholder="••••" aria-label="Repetí el PIN"></div>' +
      '<div class="ayuda">Lo vas a usar para entrar desde otro celular. Repetilo en el segundo casillero.</div></div>' +
      '<label class="check"><input id="r-terminos" type="checkbox"><span>Acepto los <a href="' + linkLegal('terminos') + '" target="_blank">términos y condiciones</a> y la <a href="' + linkLegal('privacidad') + '" target="_blank">política de privacidad</a>.</span></label>' +
      '<label class="check"><input id="r-promos" type="checkbox"><span>Quiero recibir ofertas y novedades de ' + esc(App.marca.nombre) + '.</span></label>' +
      '<button class="btn" type="submit" style="margin-top:10px">Crear mi tarjeta</button>' +
      '</form><button class="btn texto" data-ir="bienvenida">Volver</button>';

    document.getElementById('form-registro').addEventListener('submit', async function (e) {
      e.preventDefault();
      const v = function (id) { return document.getElementById(id).value.trim(); };
      const tel = v('r-tel').replace(/\D/g, '');
      const pin = v('r-pin');
      let error = '';
      if (v('r-nombre').length < 2) error = 'Ingresá tu nombre.';
      else if (tel.length < 8 || tel.length > 13) error = 'Revisá el teléfono: con característica, sin 0 ni 15.';
      else if (!v('r-dia') || !v('r-mes')) error = 'Elegí el día y el mes de tu cumpleaños.';
      else if (!/^\d{4}$/.test(pin)) error = 'El PIN tiene que tener 4 números.';
      else if (pin !== v('r-pin2')) error = 'Los dos PIN no coinciden.';
      else if (!document.getElementById('r-terminos').checked) error = 'Para registrarte tenés que aceptar los términos y la política de privacidad.';
      if (error) return toast(error, 'error');

      const boton = e.submitter || this.querySelector('[type=submit]');
      boton.disabled = true;
      boton.textContent = 'Creando…';
      try {
        const r = await api('registrarCliente', {
          id_sucursal: App.s, nombre: v('r-nombre'), telefono: tel,
          cumple_dia: Number(v('r-dia')), cumple_mes: Number(v('r-mes')), pin: pin,
          acepta_terminos: true, acepta_promos: document.getElementById('r-promos').checked
        });
        Sesion.guardarCuenta(r.token, r.nombre);
        toast('¡Listo, ' + r.nombre + '! Ya tenés tu tarjeta.');
        evento('abrio_app');
        irA('tarjeta');
      } catch (err) {
        boton.disabled = false;
        boton.textContent = 'Crear mi tarjeta';
        if (err.codigo === 'YA_REGISTRADO') {
          toast('Ese teléfono ya tiene cuenta. Ingresá con tu PIN.');
          irA('login', { telefono: tel });
        } else {
          toast(err.message, 'error');
        }
      }
    });
  },

  login(d) {
    $vista().innerHTML =
      '<h1>Ingresá</h1><p class="suave">Con el teléfono y el PIN que elegiste.</p>' +
      '<form id="form-login" class="bloque" novalidate>' +
      '<div class="campo"><label for="l-tel">Teléfono celular</label><input id="l-tel" type="tel" inputmode="numeric" autocomplete="tel" placeholder="3874123456" value="' + esc(d.telefono || '') + '"></div>' +
      '<div class="campo"><label for="l-pin">PIN</label><input id="l-pin" class="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" placeholder="••••"></div>' +
      '<button class="btn" type="submit">Entrar</button></form>' +
      '<p class="centro suave" style="font-size:.85rem">¿Todavía no tenés cuenta?</p>' +
      '<button class="btn secundario" data-ir="registro">Registrarme</button>' +
      '<button class="btn texto" data-ir="bienvenida">Volver</button>';
    document.getElementById(d.telefono ? 'l-pin' : 'l-tel').focus();

    document.getElementById('form-login').addEventListener('submit', async function (e) {
      e.preventDefault();
      const tel = document.getElementById('l-tel').value.replace(/\D/g, '');
      const pin = document.getElementById('l-pin').value.trim();
      if (tel.length < 8 || !/^\d{4}$/.test(pin)) return toast('Completá el teléfono y el PIN de 4 números.', 'error');
      const boton = this.querySelector('[type=submit]');
      boton.disabled = true;
      boton.textContent = 'Entrando…';
      try {
        const r = await api('loginCliente', { id_sucursal: App.s, telefono: tel, pin: pin });
        Sesion.guardarCuenta(r.token, r.nombre);
        evento('abrio_app');
        irA('tarjeta');
      } catch (err) {
        boton.disabled = false;
        boton.textContent = 'Entrar';
        toast(err.message, 'error');
      }
    });
  },

  async tarjeta() {
    if (!App.tarjeta) cargando(); else dibujarTarjeta();
    try {
      App.tarjeta = await api('miTarjeta');
      if (App.vista === 'tarjeta') dibujarTarjeta();
      if (!App.vistos.tarjeta) { App.vistos.tarjeta = true; evento('vio_tarjeta'); }
    } catch (e) {
      if (App.vista === 'tarjeta' && !App.tarjeta) errorEnPantalla(e.message, 'tarjeta');
      else toast(e.message, 'error');
    }
  },

  async qr() {
    if (!App.tarjeta) {
      cargando();
      try { App.tarjeta = await api('miTarjeta'); } catch (e) { if (App.vista === 'qr') errorEnPantalla(e.message, 'qr'); return; }
    }
    const t = App.tarjeta.tarjeta;
    const q = qrcode(0, 'M');
    q.addData(App.tarjeta.cliente.codigo_qr);
    q.make();
    $vista().innerHTML =
      '<section class="qr-pantalla">' +
      '<h2>Mostrale este código al personal de caja</h2>' +
      '<div class="qr-caja">' + q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) + '</div>' +
      '<p><strong>' + esc(App.tarjeta.cliente.nombre) + '</strong><br><span class="suave">' + t.en_tarjeta + ' de ' + t.sellos_para_premio + ' sellos</span></p>' +
      '<p class="suave" id="qr-estado" style="font-size:.85rem">Esperando el sello…</p>' +
      '<button class="btn secundario" data-ir="tarjeta">Volver a mi tarjeta</button></section>';
    esperarSello();
  },

  async menu() {
    const titulo = App.plantilla.textos.menu || 'Menú';
    if (!App.menu) cargando(); else dibujarMenu(titulo);
    try {
      App.menu = await api('menu', { id_sucursal: App.s });
    } catch (e) {
      if (App.vista === 'menu' && !App.menu) errorEnPantalla(e.message, 'menu');
      return;
    }
    if (App.vista !== 'menu') return;
    dibujarMenu(titulo);
    if (!App.vistos.menu) { App.vistos.menu = true; evento('vio_menu'); }
  },

  async ofertas() {
    cargando();
    let lista;
    try { lista = await api('ofertasVigentes'); } catch (e) { if (App.vista === 'ofertas') errorEnPantalla(e.message, 'ofertas'); return; }
    if (App.vista !== 'ofertas') return;
    if (!lista.length) {
      $vista().innerHTML = '<h1>Ofertas</h1><div class="bloque centro"><p>Hoy no hay ofertas vigentes.</p><p class="suave">Volvé a mirar pronto: las ofertas cambian según el día y la hora.</p></div>';
      return;
    }
    $vista().innerHTML = '<h1>Ofertas</h1>' + lista.map(function (o, i) {
      const destacada = i === 0 && o.solo_hoy;
      const meta = [o.sucursal];
      if (o.hora_desde || o.hora_hasta) meta.push((o.hora_desde ? 'de ' + o.hora_desde : '') + (o.hora_hasta ? ' a ' + o.hora_hasta : ''));
      if (o.fecha_fin) meta.push('hasta el ' + fechaDMA(o.fecha_fin));
      return '<article class="bloque oferta' + (destacada ? ' destacada' : '') + '">' +
        (o.imagen_url ? '<img src="' + esc(o.imagen_url) + '" alt="" loading="lazy">' : '') +
        (destacada ? '<span class="etiqueta">Oferta de hoy</span>' : '') +
        '<h3>' + esc(o.titulo) + '</h3>' +
        (o.descripcion ? '<p>' + esc(o.descripcion) + '</p>' : '') +
        '<div class="meta">' + esc(meta.join(' · ')) + '</div></article>';
    }).join('');
    lista.forEach(function (o) {
      if (App.vistos['o_' + o.id_oferta]) return;
      App.vistos['o_' + o.id_oferta] = true;
      evento('vio_oferta', o.id_oferta);
    });
  },

  perfil() {
    const cuenta = Sesion.cuenta() || {};
    $vista().innerHTML =
      '<h1>Hola, ' + esc(cuenta.nombre || '') + '</h1>' +
      '<p class="suave">Cliente de ' + esc(App.marca.nombre) + '</p>' +
      (Instalador.disponible() ? '<div class="bloque"><p><strong>Instalá la app en tu celular</strong><br><span class="suave">Te queda el ícono en la pantalla y entrás directo a tu tarjeta.</span></p><button class="btn" id="btn-instalar">Instalar en mi celular</button></div>' : '') +
      '<div class="bloque">' +
      '<button class="btn secundario" id="btn-salir">Cerrar sesión</button>' +
      '<button class="btn peligro" id="btn-eliminar">Eliminar mi cuenta</button></div>' +
      '<p class="centro" style="font-size:.9rem"><a href="' + linkLegal('terminos') + '" target="_blank">Términos y condiciones</a> · <a href="' + linkLegal('privacidad') + '" target="_blank">Privacidad</a></p>' +
      pie();

    const bi = document.getElementById('btn-instalar');
    if (bi) bi.onclick = async function () { if (await Instalador.instalar()) irA('perfil'); };

    document.getElementById('btn-salir').onclick = async function () {
      await api('logout').catch(function () {});
      Sesion.cerrar();
      App.tarjeta = null;
      irA('bienvenida');
    };

    document.getElementById('btn-eliminar').onclick = async function () {
      const ok = await confirmar('¿Eliminar tu cuenta?',
        'Se borran tu nombre, teléfono y cumpleaños, y perdés los sellos acumulados. No se puede deshacer.',
        'Sí, eliminar mi cuenta', true);
      if (!ok) return;
      try {
        await api('eliminarMiCuenta', { confirmar: true });
        Sesion.cerrar();
        App.tarjeta = null;
        toast('Tu cuenta fue eliminada.');
        irA('bienvenida');
      } catch (e) { toast(e.message, 'error'); }
    };
  }
};

/* ───────────── Partes de pantalla ───────────── */

function dibujarTarjeta() {
  const r = App.tarjeta;
  const t = r.tarjeta;
  const N = t.sellos_para_premio;
  const columnas = N <= 6 ? N : Math.ceil(N / 2) > 6 ? 6 : Math.ceil(N / 2);
  const sello = App.plantilla.sello(t.diseno_sello, App.marca.logo_url);

  let casilleros = '';
  for (let i = 0; i < N; i++) {
    const lleno = i < t.en_tarjeta;
    const ultimo = i === N - 1;
    casilleros += '<div class="casillero' + (lleno ? ' lleno' : ultimo ? ' premio' : '') + '" style="animation-delay:' + (i * 40) + 'ms">' +
      (lleno ? sello : ultimo ? '🎁' : (i + 1)) + '</div>';
  }

  const extra = t.sellos > N ? ' Y ya tenés ' + (t.sellos - N) + ' para la próxima.' : '';
  const instalarAviso = Instalador.disponible() && !avisoInstalarCerrado()
    ? '<div class="instalar"><span>📲 Instalá la app y entrá directo a tu tarjeta.</span><button class="btn" id="aviso-instalar">Instalar</button><button class="cerrar" id="aviso-cerrar" aria-label="Cerrar">×</button></div>'
    : '';

  $vista().innerHTML = instalarAviso +
    '<h1>Hola, ' + esc(r.cliente.nombre.split(' ')[0]) + '</h1>' +
    (t.premio_disponible
      ? '<div class="aviso-premio"><h2>¡Premio disponible!</h2><div>' + esc(t.premio_texto) + '</div><div style="font-size:.85rem;margin-top:6px;opacity:.9">Mostrá tu QR en caja para canjearlo.' + esc(extra) + '</div></div>'
      : '') +
    '<section class="tarjeta-sellos">' +
    '<div class="titulo">' + esc(App.plantilla.textos.titulo_tarjeta) + '</div>' +
    '<div class="grilla-sellos" style="grid-template-columns:repeat(' + columnas + ',1fr)">' + casilleros + '</div>' +
    (t.premio_disponible
      ? '<div class="faltan">¡Completaste la tarjeta!</div>'
      : '<div class="faltan">Te faltan <strong>' + t.faltan + '</strong> para: <strong>' + esc(t.premio_texto) + '</strong></div>') +
    '</section>' +
    '<button class="btn" data-ir="qr">' + ICONOS.qr.replace('<svg ', '<svg width="24" height="24" ') + ' Mostrar mi QR</button>' +
    '<div class="bloque" style="margin-top:14px"><h3>Últimas visitas</h3>' +
    (t.ultimas_visitas.length
      ? '<ul class="lista">' + t.ultimas_visitas.map(function (v) {
          return '<li><span>' + esc(fechaCorta(v.fecha_hora)) + '</span><span class="suave">' + esc(v.sucursal) + '</span></li>';
        }).join('') + '</ul>'
      : '<p class="suave">Todavía no tenés visitas. ¡Mostrá tu QR en tu próxima compra!</p>') +
    '</div>';

  const ai = document.getElementById('aviso-instalar');
  if (ai) {
    ai.onclick = async function () { if (await Instalador.instalar()) dibujarTarjeta(); };
    document.getElementById('aviso-cerrar').onclick = function () {
      try { localStorage.setItem('tuapp_aviso_instalar', '1'); } catch (e) { }
      dibujarTarjeta();
    };
  }
}

function dibujarMenu(titulo) {
  const cats = App.menu.categorias;
  const logueado = !!Sesion.token();
  if (!cats.length) {
    $vista().innerHTML = '<h1>' + esc(titulo) + '</h1><div class="bloque centro"><p>Todavía no hay productos cargados.</p></div>' +
      (logueado ? '' : '<button class="btn texto" data-ir="bienvenida">Volver</button>');
    return;
  }

  const etiquetas = [];
  cats.forEach(function (c) { c.items.forEach(function (i) { i.etiquetas.forEach(function (e) {
    if (etiquetas.indexOf(e) < 0) etiquetas.push(e);
  }); }); });
  const filtro = App.filtroEtiqueta;
  const pasa = function (i) { return !filtro || i.etiquetas.indexOf(filtro) >= 0; };

  const secciones = cats.map(function (c, n) {
    const items = c.items.filter(pasa);
    if (!items.length) return '';
    return '<h2 class="categoria-menu" id="cat-' + n + '">' + esc(c.nombre) + '</h2><div class="bloque" style="padding-top:4px;padding-bottom:4px">' +
      items.map(function (i) {
        return '<article class="item-menu' + (i.disponible ? '' : ' agotado') + '">' +
          (i.imagen_url ? '<img src="' + esc(i.imagen_url) + '" alt="" loading="lazy">' : '') +
          '<div class="cuerpo"><h3>' + esc(i.nombre) + '</h3>' +
          (i.descripcion ? '<p>' + esc(i.descripcion) + '</p>' : '') +
          (i.etiquetas.length ? '<div class="tags">' + i.etiquetas.map(function (e) { return '<span class="tag">' + esc(e) + '</span>'; }).join('') + '</div>' : '') +
          '</div><div class="precio">' + (i.disponible ? (i.precio != null ? formatoPrecio.format(i.precio) : '') : 'Agotado') + '</div></article>';
      }).join('') + '</div>';
  }).join('');

  $vista().innerHTML =
    (logueado ? '' : '<button class="btn texto" data-ir="bienvenida" style="width:auto;padding-left:0">← Volver</button>') +
    '<h1>' + esc(titulo) + '</h1>' +
    '<div class="menu-nav"><div class="chips">' + cats.map(function (c, n) {
      return c.items.some(pasa) ? '<button class="chip" data-cat="' + n + '">' + esc(c.nombre) + '</button>' : '';
    }).join('') + '</div>' +
    (etiquetas.length ? '<div class="chips">' + etiquetas.map(function (e) {
      return '<button class="chip etiqueta-filtro' + (e === filtro ? ' activo' : '') + '" data-etiqueta="' + esc(e) + '">' + esc(e) + '</button>';
    }).join('') + '</div>' : '') + '</div>' +
    (secciones || '<div class="bloque centro"><p>No hay productos con esa etiqueta.</p></div>') +
    (logueado ? '' : '<div class="menu-cta bloque"><p><strong>¿Venís seguido?</strong><br><span class="suave">Registrate y sumá un sello con cada compra: ' +
      esc(App.marca.premio_texto) + ' al juntar ' + App.marca.sellos_para_premio + '.</span></p><button class="btn" data-ir="registro">Registrarme</button></div>') +
    pie();

  $vista().querySelectorAll('[data-cat]').forEach(function (b) {
    b.onclick = function () { document.getElementById('cat-' + b.dataset.cat).scrollIntoView({ behavior: 'smooth' }); };
  });
  $vista().querySelectorAll('[data-etiqueta]').forEach(function (b) {
    b.onclick = function () {
      App.filtroEtiqueta = App.filtroEtiqueta === b.dataset.etiqueta ? '' : b.dataset.etiqueta;
      dibujarMenu(titulo);
    };
  });
}

function avisoInstalarCerrado() {
  try { return localStorage.getItem('tuapp_aviso_instalar') === '1'; } catch (e) { return false; }
}

/** Mientras el QR está en pantalla, consulta cada pocos segundos si le sumaron un sello o canjeó. */
function esperarSello() {
  const inicio = Date.now();
  const antes = App.tarjeta.tarjeta.sellos;
  let ocupado = false;
  App.sondeo = setInterval(async function () {
    if (document.hidden || ocupado) return;
    if (Date.now() - inicio > SONDEO_MAX_MS) {
      clearInterval(App.sondeo);
      const est = document.getElementById('qr-estado');
      if (est) est.innerHTML = '<button class="btn texto" id="qr-seguir">¿Ya te sellaron? Tocá para actualizar</button>';
      const b = document.getElementById('qr-seguir');
      if (b) b.onclick = function () { irA('qr'); };
      return;
    }
    ocupado = true;
    try {
      const r = await api('miTarjeta');
      if (App.vista !== 'qr') return;
      const ahora = r.tarjeta.sellos;
      App.tarjeta = r;
      if (ahora > antes) {
        festejo('¡Sello sumado!', r.tarjeta.premio_disponible
          ? '¡Completaste la tarjeta! ' + r.tarjeta.premio_texto
          : 'Llevás ' + r.tarjeta.en_tarjeta + ' de ' + r.tarjeta.sellos_para_premio + '. Te faltan ' + r.tarjeta.faltan + '.');
      } else if (ahora < antes) {
        festejo('¡Premio canjeado!', '¡Que lo disfrutes! Tu tarjeta nueva ya está en marcha.');
      }
    } catch (e) { /* se reintenta en la próxima vuelta */ } finally { ocupado = false; }
  }, SONDEO_MS);
}

function festejo(titulo, texto) {
  clearInterval(App.sondeo);
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
  const f = document.createElement('div');
  f.className = 'festejo';
  f.innerHTML = '<div class="icono">' + App.plantilla.sello(App.marca.diseno_sello, App.marca.logo_url) + '</div>' +
    '<h1>' + esc(titulo) + '</h1><p>' + esc(texto) + '</p><p style="opacity:.8;font-size:.85rem;margin-top:20px">Tocá para continuar</p>';
  const cerrar = function () { f.remove(); irA('tarjeta'); };
  f.addEventListener('click', cerrar);
  setTimeout(function () { if (f.isConnected) cerrar(); }, 5000);
  document.body.appendChild(f);
}

function linkLegal(seccion) {
  return 'legales.html?m=' + encodeURIComponent(App.marca ? App.marca.nombre : '') + '#' + seccion;
}

function pie() {
  return '<div class="pie">' + esc(CONFIG.PRODUCTO) + ' · un servicio de ' + esc(CONFIG.PRESTADOR) + '</div>';
}

function pantallaSinLocal() {
  document.getElementById('cabecera').innerHTML = '<div class="nombre-marca">' + esc(CONFIG.PRODUCTO) + '</div>';
  $vista().innerHTML = '<section class="portada"><h1>¡Hola!</h1><p class="suave">Para empezar, escaneá el código QR que está en el mostrador de tu cafetería.</p></section>' + pie();
}

function pantallaError(mensaje) {
  $vista().innerHTML = '<section class="portada"><h1>Ups</h1><p class="suave">' + esc(mensaje) + '</p><button class="btn" onclick="location.reload()">Reintentar</button></section>' + pie();
}

/* Navegación: cualquier elemento con data-ir="pantalla" lleva a esa pantalla. */
document.addEventListener('click', function (e) {
  const b = e.target.closest('[data-ir]');
  if (b) { e.preventDefault(); irA(b.dataset.ir); }
});

document.addEventListener('DOMContentLoaded', function () {
  const tabs = document.getElementById('tabs');
  const nombres = { tarjeta: 'Tarjeta', menu: 'Menú', ofertas: 'Ofertas', perfil: 'Perfil' };
  tabs.querySelector('.interno').innerHTML = PESTANAS.map(function (t) {
    return '<button data-ir="' + t + '">' + ICONOS[t] + '<span>' + nombres[t] + '</span></button>';
  }).join('');
  iniciar();
});
