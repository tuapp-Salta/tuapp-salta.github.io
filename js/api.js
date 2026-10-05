/**
 * api.js — ÚNICO archivo de la app que habla con el backend (Apps Script).
 * Ninguna pantalla hace fetch por su cuenta: todas llaman a api(accion, datos).
 *
 * Se manda como texto plano (sin cabecera Content-Type) para que el navegador no haga
 * la consulta previa de CORS, que Apps Script no responde.
 */

/**
 * Lo que la app guarda en el celular. Un mismo celular puede ser cliente de varias cafeterías:
 * se guarda una cuenta por marca, y se usa la de la marca que se abrió por el link.
 *   { ultimo_s: 'SUC-0001', marcas: { 'SUC-0001': {...branding} }, cuentas: { 'Café del Cerro': { token, nombre } } }
 */
const Sesion = {
  CLAVE: 'tuapp',
  marca: null,          // nombre de la marca abierta (lo fija la app al cargar el link)

  _leer() {
    try { return JSON.parse(localStorage.getItem(this.CLAVE)) || {}; } catch (e) { return {}; }
  },
  _escribir(d) {
    try { localStorage.setItem(this.CLAVE, JSON.stringify(d)); } catch (e) { /* modo privado: no se recuerda */ }
  },
  cuenta() {
    return (this._leer().cuentas || {})[this.marca] || null;
  },
  token() {
    const c = this.cuenta();
    return c ? c.token : null;
  },
  guardarCuenta(token, nombre) {
    const d = this._leer();
    d.cuentas = d.cuentas || {};
    d.cuentas[this.marca] = { token: token, nombre: nombre };
    this._escribir(d);
  },
  cerrar() {
    const d = this._leer();
    if (d.cuentas) delete d.cuentas[this.marca];
    this._escribir(d);
  },
  ultimaSucursal() {
    return this._leer().ultimo_s || null;
  },
  recordarSucursal(s, branding) {
    const d = this._leer();
    d.ultimo_s = s;
    d.marcas = d.marcas || {};
    d.marcas[s] = branding;
    this._escribir(d);
  },
  brandingGuardado(s) {
    return (this._leer().marcas || {})[s] || null;
  }
};

class ErrorApi extends Error {}

async function api(accion, datos) {
  let respuesta;
  try {
    const r = await fetch(CONFIG.API_URL, {
      method: 'POST',
      body: JSON.stringify({ accion: accion, token: Sesion.token(), datos: datos || {} })
    });
    respuesta = await r.json();
  } catch (e) {
    throw new ErrorApi('No hay conexión. Revisá internet y probá de nuevo.');
  }
  if (!respuesta.ok) {
    if (respuesta.error === 'SESION_INVALIDA') {
      Sesion.cerrar();
      window.dispatchEvent(new Event('sesion-vencida'));
      throw new ErrorApi('Tu sesión venció. Volvé a ingresar.');
    }
    const e = new ErrorApi(respuesta.error);
    e.codigo = respuesta.error;
    throw e;
  }
  return respuesta.data;
}
