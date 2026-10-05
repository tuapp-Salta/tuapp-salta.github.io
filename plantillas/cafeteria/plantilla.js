/**
 * Plantilla "cafeteria".
 * Cada rubro tiene su carpeta en /plantillas con plantilla.js + plantilla.css.
 * La app elige la carpeta según la columna `rubro` de la hoja Marcas.
 * Los colores NO van acá: vienen de la planilla (color_primario / color_secundario).
 */
window.PLANTILLAS = window.PLANTILLAS || {};

window.PLANTILLAS.cafeteria = {
  // Íconos de sello (usan currentColor, así toman el color de la marca)
  sellos: {
    taza:
      '<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M18 7c-2 2.5 2 4 0 6.5M24 7c-2 2.5 2 4 0 6.5M30 7c-2 2.5 2 4 0 6.5"/>' +
      '<path d="M9 18h26v9a11 11 0 0 1-11 11h-4A11 11 0 0 1 9 27z" fill="currentColor" fill-opacity=".18"/>' +
      '<path d="M35 21h2.5a4.5 4.5 0 0 1 0 9H34"/><path d="M6 42h32"/></g></svg>',
    grano:
      '<svg viewBox="0 0 48 48" aria-hidden="true"><g transform="rotate(-35 24 24)" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">' +
      '<ellipse cx="24" cy="24" rx="12" ry="17" fill="currentColor" fill-opacity=".18"/>' +
      '<path d="M24 8c-6 6 6 10 0 16s6 10 0 16"/></g></svg>'
  },
  // Texto que acompaña a la tarjeta en este rubro
  textos: {
    titulo_tarjeta: 'Tu tarjeta de cafés',
    sello_singular: 'sello',
    bienvenida: 'Juntá sellos con cada café y ganá premios.',
    menu: 'Menú'
  },
  /** Devuelve el HTML del sello según `diseno_sello` (taza / grano / logo). */
  sello(diseno, logoUrl) {
    if (diseno === 'logo' && logoUrl) return '<img src="' + String(logoUrl).replace(/["<>]/g, '') + '" alt="" class="sello-logo">';
    return this.sellos[diseno] || this.sellos.taza;
  }
};
