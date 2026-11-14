// Escenario completamente ficticio para evaluar la interfaz. No son datos FIRMS.
const points = [
  { x: 405, y: 310, age: 2, frp: 12.4 }, { x: 429, y: 335, age: 4, frp: 8.1 },
  { x: 390, y: 352, age: 5, frp: 16.2 }, { x: 455, y: 370, age: 7, frp: 5.6 },
  { x: 500, y: 320, age: 10, frp: 10.3 }, { x: 460, y: 415, age: 12, frp: 7.2 },
  { x: 530, y: 390, age: 18, frp: 4.8 }, { x: 370, y: 295, age: 22, frp: 9.5 },
  { x: 340, y: 400, age: 28, frp: 6.1 }, { x: 510, y: 460, age: 35, frp: 3.2 },
  { x: 565, y: 340, age: 40, frp: 11.7 }, { x: 415, y: 450, age: 46, frp: 4.3 },
];
let selectedPoint = 0;
let hours = 24;
const $ = (selector) => document.querySelector(selector);
const dialog = $('#detail-dialog');

function showDialog(title, body) {
  $('#dialog-title').textContent = title;
  $('#dialog-body').textContent = body;
  dialog.showModal();
}
$('#close-dialog').addEventListener('click', () => dialog.close());
$('#dialog-action').addEventListener('click', () => dialog.close());
$('#about').addEventListener('click', () => showDialog('Una primera mirada a Firely', 'Prototipo visual con información ficticia. El mapa es una ilustración sin precisión geográfica. No hay conexión a NASA FIRMS, backend ni inteligencia artificial.\n\nLa navegación y los filtros sirven para probar la experiencia móvil.'));

function renderPoints() {
  $('#hotspots').innerHTML = points.map((point, index) => point.age <= hours ? `<g class="hotspot ${selectedPoint === index ? 'selected' : ''}" data-point="${index}" transform="translate(${point.x} ${point.y})" role="button" tabindex="0" aria-label="Seleccionar detección simulada ${index + 1}" aria-pressed="${selectedPoint === index}" style="--flicker-delay:-${index * 0.23}s">
    <circle r="43" fill="url(#glow)" pointer-events="none"/>
    <circle class="halo" r="22"/>
    <circle class="flame-hit-area" r="24"/>
    <g class="flame-art" aria-hidden="true">
      <path class="flame-outer" d="M1-25C6-14 14-12 12-3c4-1 5-5 5-8 10 12 7 25-3 29C3 23-11 19-15 10c-5-11 2-19 5-27 1 7 5 10 7 10C-5-14 1-17 1-25Z"/>
      <path class="flame-inner" d="M2-7c0 7-7 10-6 16 1 6 8 8 12 4C13 8 8 2 7-1 7 3 4 4 4 4 5 0 3-3 2-7Z"/>
      <path class="flame-core" d="M3 5c-1 4-4 5-3 8 1 3 5 3 6 0 1-3-1-5-3-8Z"/>
    </g>
  </g>` : '').join('');
  $('#detection-count').innerHTML = `${points.filter(point => point.age <= hours).length}<span> puntos</span>`;
  $('#point-name').textContent = `Punto de ejemplo ${String(selectedPoint + 1).padStart(2, '0')}`;
  $('#point-description').textContent = `Hace ${points[selectedPoint].age} h ficticias · Ver ficha de ejemplo`;
}
function selectPoint(element) {
  selectedPoint = Number(element.dataset.point);
  renderPoints();
  // Preserve keyboard focus after replacing the SVG nodes.
  $(`[data-point="${selectedPoint}"]`).focus({ preventScroll: true });
}
$('#hotspots').addEventListener('click', event => {
  const target = event.target.closest('[data-point]');
  if (target) selectPoint(target);
});
$('#hotspots').addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target.closest('[data-point]');
  if (target) { event.preventDefault(); selectPoint(target); }
});
document.querySelectorAll('[data-hours]').forEach(button => button.addEventListener('click', () => {
  hours = Number(button.dataset.hours);
  if (points[selectedPoint].age > hours) selectedPoint = 0;
  document.querySelectorAll('[data-hours]').forEach(item => {
    const active = item === button;
    item.classList.toggle('selected', active);
    item.setAttribute('aria-pressed', String(active));
  });
  renderPoints();
}));
$('#detection-detail').addEventListener('click', () => {
  const point = points[selectedPoint];
  showDialog(`Punto de ejemplo ${String(selectedPoint + 1).padStart(2, '0')}`, `DATOS SIMULADOS\n\nSensor del escenario: VIIRS\nAntigüedad ficticia: ${point.age} horas\nFRP de ejemplo: ${point.frp} MW\n\nEste punto no corresponde a una detección real. La versión conectada mostrará procedencia, hora de adquisición y confianza. Una detección no confirma un incendio.`);
});
$('#layers').addEventListener('click', () => {
  const enabled = $('#layers').getAttribute('aria-pressed') !== 'true';
  $('#layers').setAttribute('aria-pressed', String(enabled));
  $('.area-outline').style.display = enabled ? '' : 'none';
});
let toastTimeout;
function toast(message) {
  clearTimeout(toastTimeout);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 2800);
}
$('#center-map').addEventListener('click', () => {
  selectedPoint = 0;
  renderPoints();
  toast('Vista ilustrativa restablecida · sin usar tu ubicación');
});
function navigate() {
  const requested = location.hash.slice(1);
  const page = ['mapa', 'calendario', 'analisis', 'asistente'].includes(requested) ? requested : 'mapa';
  document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== page; });
  document.querySelectorAll('.bottom-nav a').forEach(link => {
    const active = link.hash === `#${page}`;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', navigate);
$('#calendar-shortcut').addEventListener('click', () => { location.hash = 'calendario'; });
$('#open-search').addEventListener('click', () => { location.hash = 'asistente'; });
$('#sample-question').addEventListener('click', () => { $('#assistant-answer').hidden = false; });

const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const colors = ['#24332b', '#435640', '#6d8053', '#a3a46c', '#e9c877'];
// Deterministic invented values; not a scientific series.
let calendar = '<span></span>' + months.map(month => `<span class="month-label">${month[0]}</span>`).join('');
for (let year = 2020; year <= 2025; year += 1) {
  calendar += `<span class="year-label">${year}</span>`;
  months.forEach((month, index) => {
    const value = ((year * 7 + index * 11) % 39) + 1;
    const level = Math.min(4, Math.floor(value / 8));
    calendar += `<button class="calendar-cell" style="--cell-color:${colors[level]}" data-month="${month}" data-year="${year}" data-value="${value}" aria-label="${month} ${year}: ${value} puntos ficticios" aria-pressed="false"></button>`;
  });
}
$('#calendar-grid').innerHTML = calendar;
$('#calendar-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-month]');
  if (!button) return;
  document.querySelectorAll('.calendar-cell').forEach(cell => cell.setAttribute('aria-pressed', String(cell === button)));
  $('#month-detail').textContent = `${button.dataset.month} ${button.dataset.year} · ${button.dataset.value} puntos ficticios. Selección de prueba; no modifica el mapa ilustrativo.`;
});
renderPoints();
navigate();
