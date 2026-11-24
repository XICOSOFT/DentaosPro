/**
 * DentaOS Pro - Frontend Controller Completo (app.js)
 * Odontograma Anatómico + Confirmación de Voz + Agenda Calendario + Tarifario + Cobro con Folio + SuperAdmin
 * Desarrollado por Xicosoft
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbxWtJRZLdqe19FY9juUoTp1i6p7FKQ-rnUwpp9dIeQ6_epXc_HkBMz20vWmvnkN36uFSQ/exec';

const STATE = {
  session: null,
  consultorio: {},
  doctores: [],
  tarifario: [],
  pacientes: [],
  citas: [],
  odontogramas: [],
  notas: [],
  finanzas: [],
  laboratorio: [],
  archivos: [],
  odontogramData: {},
  agendaView: 'grid',
  recognition: null,
  isListening: false
};

const CONDITION_COLORS = {
  sano: '#1e293b',
  caries: '#ef4444',
  resina: '#3b82f6',
  corona: '#eab308',
  endodoncia: '#a855f7',
  implante: '#10b981',
  ausente: '#020617'
};

const FACE_LABELS = { V: 'Vestibular', L: 'Lingual', M: 'Mesial', D: 'Distal', O: 'Oclusal' };
const BASE_PRICES_MXN = { caries: 850, resina: 900, corona: 4500, endodoncia: 3200, implante: 14000, ausente: 1200 };
const ADULT_ROWS = [
  ['18','17','16','15','14','13','12','11', '21','22','23','24','25','26','27','28'],
  ['48','47','46','45','44','43','42','41', '31','32','33','34','35','36','37','38']
];
const CHILD_ROWS = [
  ['55','54','53','52','51', '61','62','63','64','65'],
  ['85','84','83','82','81', '71','72','73','74','75']
];

async function runServer(action, ...args) {
  showLoader(true, 'Sincronizando...');
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, args: args })
    });
    const res = await response.json();
    showLoader(false);
    if (res && res.status === 'error') {
      showToast(res.message || 'Error en la operación', 'error');
      throw new Error(res.message);
    }
    return res;
  } catch (err) {
    showLoader(false);
    showToast(err.message || 'Error de conexión con el servidor', 'error');
    throw err;
  }
}

function showLoader(visible, text) {
  const el = document.getElementById('globalLoader');
  document.getElementById('loaderText').textContent = text || 'Sincronizando...';
  el.classList.toggle('hidden', !visible);
}

function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  const div = document.createElement('div');
  const color = type === 'error' ? 'bg-red-500/90 border-red-400' : 'bg-emerald-500/90 border-emerald-400';
  div.className = `${color} border text-slate-950 font-semibold text-xs px-4 py-3 rounded-xl shadow-xl transition`;
  div.textContent = msg;
  container.appendChild(div);
  setTimeout(() => div.remove(), 3800);
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function switchTab(tabName) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('tab-' + tabName).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => {
    const active = b.dataset.tab === tabName;
    b.classList.toggle('bg-cyan-500/15', active);
    b.classList.toggle('text-cyan-300', active);
    b.classList.toggle('text-slate-400', !active);
  });
  lucide.createIcons();
}

function copyBookingLink() {
  const cid = STATE.consultorio.Consultorio_ID || 'CLINIC-001';
  const base = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
  const url = `${base}booking.html?clinic=${encodeURIComponent(cid)}`;
  navigator.clipboard.writeText(url).then(() => showToast('Liga pública de citas copiada al portapapeles.'));
}

// AUTH (CON RUTEO OCULTO A SUPERADMIN)
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pin = document.getElementById('loginPin').value;
  const res = await runServer('apiLogin', pin);
  STATE.session = res.data.session;
  document.getElementById('loginView').classList.add('hidden');
  showToast(res.message);

  if (STATE.session.Rol === 'SUPERADMIN') {
    document.getElementById('superAdminView').classList.remove('hidden');
    await loadSuperAdminPanel();
  } else {
    document.getElementById('appShell').classList.remove('hidden');
    document.getElementById('userBadge').textContent = `${STATE.session.Nombre} · ${STATE.session.Rol}`;
    await hydrateApp();
  }
});

function logout() {
  STATE.session = null;
  document.getElementById('loginPin').value = '';
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('superAdminView').classList.add('hidden');
  document.getElementById('loginView').classList.remove('hidden');
}

// HYDRATION
async function hydrateApp() {
  const res = await runServer('apiHydrateDashboard', STATE.session);
  Object.assign(STATE, res.data);
  document.getElementById('clinicNameHeader').textContent = STATE.consultorio.Nombre || 'DentaOS Pro';
  document.getElementById('tcDisplay').textContent = `$${Number(STATE.consultorio.Tipo_Cambio_USD || 19.5).toFixed(2)} MXN/USD`;

  populateSelects();
  renderDashboard();
  renderAgenda();
  renderFinanzas();
  renderLaboratorio();
  fillConfigForm();
  onSelectClinicalPatient();
  lucide.createIcons();
}

function populateSelects() {
  const pacOptions = STATE.pacientes.map(p => `<option value="${p.Paciente_ID}">${p.Nombre} (${p.Idioma})</option>`).join('');
  ['clinicalPatientSelect', 'citaPaciente', 'finPaciente', 'labPaciente'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = pacOptions || '<option value="">Sin pacientes</option>';
  });

  const docOptions = STATE.doctores.map(d => `<option value="${d.Usuario_ID}">${d.Nombre}</option>`).join('');
  ['citaDoctor', 'finDoctor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = docOptions;
  });

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('citaFecha').value = today;
  const agendaDate = document.getElementById('agendaDateFilter');
  if (agendaDate && !agendaDate.value) agendaDate.value = today;
}

// DASHBOARD
function renderDashboard() {
  const ingresosMxn = STATE.finanzas.reduce((s, f) => s + Number(f.Abonado_MXN || 0), 0);
  const porCobrarMxn = STATE.finanzas.reduce((s, f) => s + (Number(f.Total_MXN || 0) - Number(f.Abonado_MXN || 0)), 0);
  const citasActivas = STATE.citas.filter(c => c.Estatus === 'AGENDADA' || c.Estatus === 'CONFIRMADA' || c.Estatus === 'AGENDADA_WEB').length;
  const labPendientes = STATE.laboratorio.filter(l => l.Estatus !== 'ENTREGADO').length;

  document.getElementById('kpiGrid').innerHTML = `
    <div class="glass-card p-5 rounded-2xl"><p class="text-xs text-slate-400">Cobrado Total (MXN)</p><p class="text-2xl font-bold text-emerald-400 mt-1">$${ingresosMxn.toLocaleString('es-MX')}</p></div>
    <div class="glass-card p-5 rounded-2xl"><p class="text-xs text-slate-400">Saldo por Cobrar (MXN)</p><p class="text-2xl font-bold text-amber-400 mt-1">$${porCobrarMxn.toLocaleString('es-MX')}</p></div>
    <div class="glass-card p-5 rounded-2xl"><p class="text-xs text-slate-400">Citas Próximas</p><p class="text-2xl font-bold text-cyan-400 mt-1">${citasActivas}</p></div>
    <div class="glass-card p-5 rounded-2xl"><p class="text-xs text-slate-400">Órdenes Lab Activas</p><p class="text-2xl font-bold text-purple-400 mt-1">${labPendientes}</p></div>
  `;

  document.getElementById('cofeprisList').innerHTML = STATE.pacientes.map(p => {
    const c = p.Cofepris || { porcentaje: 0, nivel: 'ROJO', faltantes: [] };
    const badge = c.nivel === 'VERDE' ? 'bg-emerald-500/20 text-emerald-300' : (c.nivel === 'AMBAR' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300');
    return `
      <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-white">${p.Nombre}</p>
          <p class="text-xs text-slate-400">${c.faltantes.length ? 'Falta: ' + c.faltantes.join(', ') : 'Expediente 100% listo ante COFEPRIS'}</p>
        </div>
        <span class="px-2.5 py-1 rounded-full text-xs font-bold ${badge}">${c.porcentaje}%</span>
      </div>`;
  }).join('') || '<p class="text-xs text-slate-500">Sin pacientes registrados.</p>';

  const recalls = STATE.pacientes.filter(p => p.Necesita_Recall);
  document.getElementById('recallList').innerHTML = recalls.map(p => {
    const msg = p.Idioma === 'EN'
      ? `Hello ${p.Nombre}, it has been over 6 months since your last dental checkup at ${STATE.consultorio.Nombre}. Would you like to book your cleaning?`
      : `Hola ${p.Nombre}, han pasado más de 6 meses desde tu última revisión en ${STATE.consultorio.Nombre}. ¿Te agendamos tu limpieza semestral?`;
    const waUrl = `https://wa.me/${String(p.Telefono).replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`;
    return `
      <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
        <div>
          <p class="text-sm font-semibold text-white">${p.Nombre} <span class="text-xs text-cyan-400">(${p.Idioma})</span></p>
          <p class="text-xs text-slate-400">Última visita: ${p.Ultima_Visita}</p>
        </div>
        <a href="${waUrl}" target="_blank" class="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-bold">WhatsApp</a>
      </div>`;
  }).join('') || '<p class="text-xs text-slate-500">Todos los pacientes están al día en sus revisiones.</p>';
}

// AGENDA EN COLUMNAS POR HORA / DOCTOR + VISTA LISTA
function setAgendaView(mode) {
  STATE.agendaView = mode;
  document.getElementById('btnAgendaGrid').className = mode === 'grid' ? 'px-3 py-1 rounded-lg bg-cyan-500 text-slate-950' : 'px-3 py-1 rounded-lg text-slate-400';
  document.getElementById('btnAgendaList').className = mode === 'list' ? 'px-3 py-1 rounded-lg bg-cyan-500 text-slate-950' : 'px-3 py-1 rounded-lg text-slate-400';
  document.getElementById('agendaGridView').classList.toggle('hidden', mode !== 'grid');
  document.getElementById('agendaList').classList.toggle('hidden', mode !== 'list');
  renderAgenda();
}

function quickScheduleSlot(doctorId, hora) {
  const fecha = document.getElementById('agendaDateFilter').value;
  document.getElementById('citaDoctor').value = doctorId;
  document.getElementById('citaFecha').value = fecha;
  document.getElementById('citaHora').value = hora;
  openModal('modalCita');
}

function renderAgenda() {
  const selectedDate = document.getElementById('agendaDateFilter').value || new Date().toISOString().split('T')[0];

  const docs = STATE.doctores.filter(d => d.Rol !== 'RECEPCION');
  const hours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
  const dayCitas = STATE.citas.filter(c => String(c.Fecha) === selectedDate);

  const headerCells = docs.map(d => `<th class="p-3 text-left border-l border-slate-800 min-w-[200px]"><p class="text-xs font-bold text-white">${d.Nombre}</p><p class="text-[10px] text-cyan-400">${d.Rol}</p></th>`).join('');
  const bodyRows = hours.map(hr => {
    const hrPrefix = hr.slice(0, 2);
    const cols = docs.map(d => {
      const slotCitas = dayCitas.filter(c => c.Doctor_ID === d.Usuario_ID && String(c.Hora_Inicio).slice(0, 2) === hrPrefix);
      if (!slotCitas.length) {
        return `<td onclick="quickScheduleSlot('${d.Usuario_ID}','${hr}')" class="p-2 border-l border-t border-slate-800/70 hover:bg-cyan-500/10 cursor-pointer text-[10px] text-slate-600 text-center transition">+ Agendar</td>`;
      }
      return `<td class="p-1.5 border-l border-t border-slate-800/70 space-y-1">
        ${slotCitas.map(c => `
          <div class="bg-cyan-500/15 border border-cyan-500/40 rounded-lg p-2 text-xs">
            <div class="flex justify-between items-center">
              <span class="font-mono text-[10px] text-cyan-300">${c.Hora_Inicio} · ${c.Unidad}</span>
              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-900 text-emerald-300">${c.Estatus}</span>
            </div>
            <p class="font-bold text-white truncate mt-0.5">${c.Paciente_Nombre}</p>
            <p class="text-[10px] text-slate-300 truncate">${c.Motivo}</p>
          </div>
        `).join('')}
      </td>`;
    }).join('');
    return `<tr><td class="p-3 text-xs font-mono text-slate-400 border-t border-slate-800/70 bg-slate-900/50 w-20">${hr}</td>${cols}</tr>`;
  }).join('');

  document.getElementById('agendaGridView').innerHTML = `
    <table class="w-full border-collapse">
      <thead class="bg-slate-900/90">
        <tr><th class="p-3 text-xs text-slate-400 text-left">Hora</th>${headerCells}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;

  document.getElementById('agendaList').innerHTML = STATE.citas.slice().reverse().map(c => {
    const pac = STATE.pacientes.find(p => p.Paciente_ID === c.Paciente_ID) || { Telefono: '', Idioma: 'ES' };
    const msg = pac.Idioma === 'EN'
      ? `Hi ${c.Paciente_Nombre}, reminder of your dental appointment at ${STATE.consultorio.Nombre} on ${c.Fecha} at ${c.Hora_Inicio} with ${c.Doctor_Nombre}. Please reply YES to confirm.`
      : `Hola ${c.Paciente_Nombre}, te recordamos tu cita dental en ${STATE.consultorio.Nombre} el ${c.Fecha} a las ${c.Hora_Inicio} con ${c.Doctor_Nombre}. Responde SÍ para confirmar.`;
    const waUrl = `https://wa.me/${String(pac.Telefono).replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`;

    return `
      <div class="glass-card rounded-2xl p-4 space-y-3">
        <div class="flex justify-between items-start">
          <div>
            <span class="text-xs font-mono text-cyan-400">${c.Fecha} · ${c.Hora_Inicio} (${c.Unidad})</span>
            <h4 class="font-bold text-white mt-0.5">${c.Paciente_Nombre}</h4>
            <p class="text-xs text-slate-400">${c.Motivo} · ${c.Doctor_Nombre}</p>
          </div>
          <span class="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-800 text-cyan-300">${c.Estatus}</span>
        </div>
        <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
          <a href="${waUrl}" target="_blank" class="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-bold">WhatsApp (${pac.Idioma})</a>
          <button onclick="changeCitaStatus('${c.Cita_ID}','CONFIRMADA')" class="bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg text-xs">Confirmar</button>
          <button onclick="changeCitaStatus('${c.Cita_ID}','COMPLETADA')" class="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 px-2.5 py-1.5 rounded-lg text-xs">Completar</button>
          <button onclick="changeCitaStatus('${c.Cita_ID}','NO_SHOW')" class="bg-red-500/20 hover:bg-red-500/30 text-red-300 px-2.5 py-1.5 rounded-lg text-xs">No-Show</button>
        </div>
      </div>`;
  }).join('') || '<p class="text-sm text-slate-500">No hay citas agendadas.</p>';
}

async function changeCitaStatus(citaId, status) {
  await runServer('apiUpdateCitaStatus', STATE.session, citaId, status);
  showToast(`Cita marcada como ${status}`);
  await hydrateApp();
}

// ODONTOGRAMA ANATÓMICO SVG + MODAL DE CONFIRMACIÓN DE VOZ + TARIFARIO
function onSelectClinicalPatient() {
  const pacId = document.getElementById('clinicalPatientSelect').value;
  const pac = STATE.pacientes.find(p => p.Paciente_ID === pacId);
  if (!pac) return;

  const c = pac.Cofepris || { porcentaje: 0, nivel: 'ROJO' };
  const badgeEl = document.getElementById('patientCofeprisBadge');
  badgeEl.textContent = `COFEPRIS NOM-004: ${c.porcentaje}% | Alergias: ${pac.Alergias || 'Ninguna'}`;
  badgeEl.className = `text-xs font-bold px-3 py-1.5 rounded-full ${c.nivel === 'VERDE' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`;

  const pacOdos = STATE.odontogramas.filter(o => o.Paciente_ID === pacId).reverse();
  const histSel = document.getElementById('historyCompareSelect');
  histSel.innerHTML = '<option value="CURRENT">Versión Actual</option>' +
    pacOdos.map(o => `<option value="${o.Registro_ID}">${o.Fecha} (${o.Doctor_Nombre})</option>`).join('');

  STATE.odontogramData = {};
  if (pacOdos.length > 0) {
    try { STATE.odontogramData = JSON.parse(pacOdos[0].JSON_Estado || '{}'); } catch (e) {}
  }
  renderOdontogram();
  renderPatientNotasAndFiles(pacId);
}

function loadHistoricalOdontogram() {
  const regId = document.getElementById('historyCompareSelect').value;
  if (regId === 'CURRENT') return;
  const found = STATE.odontogramas.find(o => o.Registro_ID === regId);
  if (found) {
    try {
      STATE.odontogramData = JSON.parse(found.JSON_Estado || '{}');
      renderOdontogram();
      showToast(`Cargado comparativo del ${found.Fecha}`);
    } catch (e) {}
  }
}

function getToothCategory(num) {
  const unit = Number(String(num).slice(-1));
  if (unit === 1 || unit === 2) return 'incisor';
  if (unit === 3) return 'canine';
  if (unit === 4 || unit === 5) return 'premolar';
  return 'molar';
}

function buildAnatomicalSilhouetteSvg(num, toothState, isLower) {
  const cat = getToothCategory(num);
  const faces = [toothState.V, toothState.L, toothState.M, toothState.D, toothState.O];
  const isAusente = toothState.whole === 'ausente';
  const hasCorona = faces.every(f => f === 'corona');
  const hasImplante = faces.every(f => f === 'implante');
  const hasEndo = faces.includes('endodoncia');

  const crownFill = hasCorona ? 'rgba(234, 179, 8, 0.35)' : '#1e293b';
  const crownStroke = hasCorona ? '#eab308' : '#64748b';
  const rootStroke = '#475569';
  const opacity = isAusente ? '0.25' : '1';
  const flipTransform = isLower ? 'transform="translate(0, 64) scale(1, -1)"' : '';

  let rootPath = '';
  let crownPath = '';
  let endoPath = '';

  if (cat === 'incisor') {
    rootPath = `<path d="M22,34 Q25,8 30,6 Q35,8 38,34 Z" fill="#0f172a" stroke="${rootStroke}" stroke-width="1.6"/>`;
    crownPath = `<path d="M18,34 Q18,58 30,58 Q42,58 42,34 Z" fill="${crownFill}" stroke="${crownStroke}" stroke-width="1.8"/>`;
    endoPath = `<line x1="30" y1="10" x2="30" y2="44" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round"/>`;
  } else if (cat === 'canine') {
    rootPath = `<path d="M21,34 Q24,4 30,2 Q36,4 39,34 Z" fill="#0f172a" stroke="${rootStroke}" stroke-width="1.6"/>`;
    crownPath = `<path d="M17,34 Q17,52 30,60 Q43,52 43,34 Z" fill="${crownFill}" stroke="${crownStroke}" stroke-width="1.8"/>`;
    endoPath = `<line x1="30" y1="6" x2="30" y2="46" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round"/>`;
  } else if (cat === 'premolar') {
    rootPath = `<path d="M19,34 Q21,10 25,8 Q28,12 30,24 Q32,12 35,8 Q39,10 41,34 Z" fill="#0f172a" stroke="${rootStroke}" stroke-width="1.6"/>`;
    crownPath = `<path d="M15,34 Q15,56 24,58 Q30,54 36,58 Q45,56 45,34 Z" fill="${crownFill}" stroke="${crownStroke}" stroke-width="1.8"/>`;
    endoPath = `<path d="M25,12 L27,42 M35,12 L33,42" stroke="#a855f7" stroke-width="2.2" stroke-linecap="round"/>`;
  } else {
    rootPath = `<path d="M13,34 Q13,10 19,8 Q24,10 26,24 Q28,10 30,8 Q32,10 34,24 Q36,10 41,8 Q47,10 47,34 Z" fill="#0f172a" stroke="${rootStroke}" stroke-width="1.6"/>`;
    crownPath = `<path d="M10,34 Q10,56 22,58 Q30,53 38,58 Q50,56 50,34 Z" fill="${crownFill}" stroke="${crownStroke}" stroke-width="1.8"/>`;
    endoPath = `<path d="M19,12 L22,42 M30,12 L30,42 M41,12 L38,42" stroke="#a855f7" stroke-width="2.2" stroke-linecap="round"/>`;
  }

  if (hasImplante) {
    rootPath = `
      <rect x="24" y="8" width="12" height="26" rx="3" fill="#064e3b" stroke="#10b981" stroke-width="1.8"/>
      <line x1="23" y1="14" x2="37" y2="14" stroke="#34d399" stroke-width="1.6"/>
      <line x1="23" y1="20" x2="37" y2="20" stroke="#34d399" stroke-width="1.6"/>
      <line x1="23" y1="26" x2="37" y2="26" stroke="#34d399" stroke-width="1.6"/>
    `;
  }

  return `
    <svg viewBox="0 0 60 64" class="w-11 h-12 select-none" onclick="paintTooth('${num}','O')" title="Pieza ${num} (${cat})">
      <g ${flipTransform} opacity="${opacity}">
        ${rootPath}
        ${crownPath}
        ${hasEndo && !hasImplante ? endoPath : ''}
      </g>
      ${isAusente ? '<line x1="12" y1="12" x2="48" y2="52" stroke="#ef4444" stroke-width="4.5" stroke-linecap="round"/><line x1="48" y1="12" x2="12" y2="52" stroke="#ef4444" stroke-width="4.5" stroke-linecap="round"/>' : ''}
    </svg>
  `;
}

function renderOdontogram() {
  const tipo = document.getElementById('denticionSelect').value;
  const rows = tipo === 'INFANTIL' ? CHILD_ROWS : ADULT_ROWS;
  const midIdx = tipo === 'INFANTIL' ? 5 : 8;
  const container = document.getElementById('odontogramGrid');

  container.innerHTML = rows.map((row, rIdx) => {
    const isLower = rIdx === 1;
    const leftQuad = row.slice(0, midIdx);
    const rightQuad = row.slice(midIdx);
    const label = isLower ? 'Arcada Inferior (Q4 Derecha | Q3 Izquierda)' : 'Arcada Superior (Q1 Derecha | Q2 Izquierda)';

    return `
      <div>
        <p class="text-[11px] uppercase tracking-wider text-slate-500 mb-2 font-semibold">${label}</p>
        <div class="flex items-stretch gap-1.5 min-w-max">
          ${leftQuad.map(num => buildToothSvgCard(num, isLower)).join('')}
          <div class="quadrant-divider"></div>
          ${rightQuad.map(num => buildToothSvgCard(num, isLower)).join('')}
        </div>
      </div>
    `;
  }).join('');

  updateFindingsSummary();
}

function buildToothSvgCard(num, isLower) {
  const t = STATE.odontogramData[num] || { V: 'sano', L: 'sano', M: 'sano', D: 'sano', O: 'sano', whole: '' };
  const isAusente = t.whole === 'ausente';
  const fill = (face) => isAusente ? CONDITION_COLORS.ausente : (CONDITION_COLORS[t[face]] || CONDITION_COLORS.sano);

  const silhouette = buildAnatomicalSilhouetteSvg(num, t, isLower);
  const diagram5Faces = `
    <svg viewBox="0 0 100 100" class="w-10 h-10">
      <polygon points="0,0 100,0 75,25 25,25" fill="${fill('V')}" class="tooth-surface" onclick="paintTooth('${num}','V')" title="Vestibular"></polygon>
      <polygon points="100,0 100,100 75,75 75,25" fill="${fill('D')}" class="tooth-surface" onclick="paintTooth('${num}','D')" title="Distal"></polygon>
      <polygon points="0,100 100,100 75,75 25,75" fill="${fill('L')}" class="tooth-surface" onclick="paintTooth('${num}','L')" title="Lingual/Palatina"></polygon>
      <polygon points="0,0 25,25 25,75 0,100" fill="${fill('M')}" class="tooth-surface" onclick="paintTooth('${num}','M')" title="Mesial"></polygon>
      <rect x="25" y="25" width="50" height="50" fill="${fill('O')}" class="tooth-surface" onclick="paintTooth('${num}','O')" title="Oclusal/Incisal"></rect>
      ${isAusente ? '<line x1="12" y1="12" x2="88" y2="88" stroke="#ef4444" stroke-width="8"/><line x1="88" y1="12" x2="12" y2="88" stroke="#ef4444" stroke-width="8"/>' : ''}
    </svg>
  `;

  return `
    <div id="tooth-${num}" class="tooth-card bg-slate-900/90 border border-slate-800 rounded-xl p-1.5 flex flex-col items-center gap-1 w-[58px]">
      <span class="text-[11px] font-mono font-bold text-cyan-300">${num}</span>
      ${isLower ? diagram5Faces + silhouette : silhouette + diagram5Faces}
    </div>`;
}

function paintTooth(num, face, forcedCondition) {
  const cond = forcedCondition || document.getElementById('conditionBrush').value;
  if (!STATE.odontogramData[num]) {
    STATE.odontogramData[num] = { V: 'sano', L: 'sano', M: 'sano', D: 'sano', O: 'sano', whole: '' };
  }
  if (cond === 'ausente' || cond === 'corona' || cond === 'implante') {
    if (cond === 'ausente') {
      STATE.odontogramData[num].whole = 'ausente';
    } else {
      STATE.odontogramData[num].whole = '';
      ['V','L','M','D','O'].forEach(f => STATE.odontogramData[num][f] = cond);
    }
  } else if (cond === 'sano') {
    STATE.odontogramData[num] = { V: 'sano', L: 'sano', M: 'sano', D: 'sano', O: 'sano', whole: '' };
  } else {
    STATE.odontogramData[num].whole = '';
    STATE.odontogramData[num][face] = cond;
  }
  renderOdontogram();
  const card = document.getElementById('tooth-' + num);
  if (card) card.classList.add('selected');
}

function getPriceByKey(clave) {
  const found = (STATE.tarifario || []).find(t => String(t.Clave).toLowerCase() === String(clave).toLowerCase());
  return found ? Number(found.Precio_MXN || 0) : (BASE_PRICES_MXN[clave] || 0);
}

function getStructuredFindings() {
  const items = [];
  let estimatedTotalMxn = 0;

  Object.keys(STATE.odontogramData).sort().forEach(num => {
    const t = STATE.odontogramData[num];
    if (!t) return;
    if (t.whole === 'ausente') {
      items.push(`P${num}: Ausente`);
      estimatedTotalMxn += getPriceByKey('ausente');
      return;
    }
    const faces = ['V','L','M','D','O'];
    const allSame = faces.every(f => t[f] === t.O && t.O !== 'sano');
    if (allSame) {
      const label = t.O.charAt(0).toUpperCase() + t.O.slice(1);
      items.push(`P${num}: ${label}`);
      estimatedTotalMxn += getPriceByKey(t.O);
    } else {
      const byCond = {};
      faces.forEach(f => {
        if (t[f] && t[f] !== 'sano') {
          if (!byCond[t[f]]) byCond[t[f]] = [];
          byCond[t[f]].push(FACE_LABELS[f]);
        }
      });
      Object.keys(byCond).forEach(cond => {
        const label = cond.charAt(0).toUpperCase() + cond.slice(1);
        items.push(`P${num}: ${label} (${byCond[cond].join(', ')})`);
        estimatedTotalMxn += getPriceByKey(cond);
      });
    }
  });

  return { text: items.join(' · '), count: items.length, estimatedTotalMxn };
}

function updateFindingsSummary() {
  const el = document.getElementById('findingsSummaryText');
  if (!el) return;
  const f = getStructuredFindings();
  el.textContent = f.count > 0 ? f.text : 'Sin hallazgos registrados en el odontograma actual.';
}

function copyFindingsToNote() {
  const f = getStructuredFindings();
  if (!f.count) return showToast('Marca al menos una pieza en el odontograma.', 'error');
  document.getElementById('notaProc').value = 'Exploración clínica / Odontograma';
  document.getElementById('notaObs').value = `Hallazgos: ${f.text}`;
  showToast('Hallazgos copiados a la Nota de Evolución.');
}

function quoteFindingsToFinance() {
  const f = getStructuredFindings();
  if (!f.count) return showToast('Marca al menos un tratamiento en el odontograma.', 'error');
  const pacId = document.getElementById('clinicalPatientSelect').value;
  if (pacId) document.getElementById('finPaciente').value = pacId;
  document.getElementById('finConcepto').value = f.text;
  document.getElementById('finMoneda').value = 'MXN';
  document.getElementById('finTotal').value = f.estimatedTotalMxn > 0 ? f.estimatedTotalMxn : '';
  document.getElementById('finAbonado').value = 0;
  openModal('modalFinanzas');
}

// MOTOR DE VOZ CON MODAL DE CONFIRMACIÓN
function toggleVoiceExploration() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return showToast('Tu navegador no soporta dictado por voz. Usa Chrome o Edge.', 'error');
  if (STATE.isListening && STATE.recognition) {
    STATE.recognition.stop();
    return;
  }

  const rec = new SpeechRec();
  rec.lang = 'es-MX';
  rec.continuous = true;
  rec.interimResults = false;

  rec.onstart = () => {
    STATE.isListening = true;
    document.getElementById('btnVoiceToggle').classList.add('bg-red-500', 'mic-listening');
    document.getElementById('voiceTranscriptBar').classList.remove('hidden');
    document.getElementById('voiceTranscriptText').textContent = 'Escuchando comandos dentales...';
  };

  rec.onresult = (event) => {
    const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
    document.getElementById('voiceTranscriptText').textContent = `Dictado: "${transcript}"`;
    parseDentalVoiceCommand(transcript);
  };

  rec.onend = () => {
    STATE.isListening = false;
    document.getElementById('btnVoiceToggle').classList.remove('bg-red-500', 'mic-listening');
  };

  STATE.recognition = rec;
  rec.start();
}

function parseDentalVoiceCommand(text) {
  const numMatch = text.match(/\b([1-8][1-8])\b/);
  if (!numMatch) return;
  const pieza = numMatch[1];

  let face = 'O';
  if (text.includes('mesial')) face = 'M';
  else if (text.includes('distal')) face = 'D';
  else if (text.includes('vestibular') || text.includes('bucal')) face = 'V';
  else if (text.includes('lingual') || text.includes('palatina')) face = 'L';

  let cond = 'caries';
  if (text.includes('resina') || text.includes('obturación')) cond = 'resina';
  else if (text.includes('corona')) cond = 'corona';
  else if (text.includes('endodoncia')) cond = 'endodoncia';
  else if (text.includes('implante')) cond = 'implante';
  else if (text.includes('ausente') || text.includes('extracción')) cond = 'ausente';
  else if (text.includes('sano') || text.includes('limpiar')) cond = 'sano';

  document.getElementById('vcRawText').textContent = `Escuché: "${text}"`;
  document.getElementById('vcPieza').value = pieza;
  document.getElementById('vcCara').value = face;
  document.getElementById('vcCondicion').value = cond;
  openModal('modalVoiceConfirm');
}

function confirmVoiceFinding() {
  const pieza = document.getElementById('vcPieza').value.trim();
  const face = document.getElementById('vcCara').value;
  const cond = document.getElementById('vcCondicion').value;
  if (!pieza) return;

  paintTooth(pieza, face, cond);
  closeModal('modalVoiceConfirm');
  const confirmMsg = `Pieza ${pieza}, ${cond} confirmado.`;
  showToast(confirmMsg);

  if ('speechSynthesis' in window) {
    const utter = new SpeechSynthesisUtterance(confirmMsg);
    utter.lang = 'es-MX';
    window.speechSynthesis.speak(utter);
  }
}

async function saveCurrentOdontogram() {
  const pacId = document.getElementById('clinicalPatientSelect').value;
  if (!pacId) return showToast('Selecciona un paciente', 'error');
  await runServer('apiSaveOdontograma', STATE.session, {
    Paciente_ID: pacId,
    Tipo_Denticion: document.getElementById('denticionSelect').value,
    JSON_Estado: STATE.odontogramData,
    Notas_Generales: getStructuredFindings().text || 'Guardado desde módulo clínico'
  });
  showToast('Versión del odontograma guardada.');
  await hydrateApp();
}

function renderPatientNotasAndFiles(pacId) {
  const pNotas = STATE.notas.filter(n => n.Paciente_ID === pacId).reverse();
  document.getElementById('notasList').innerHTML = pNotas.map(n => `
    <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs">
      <div class="flex justify-between text-cyan-400 font-semibold"><span>${n.Procedimiento}</span><span>${n.Fecha}</span></div>
      <p class="text-slate-300 mt-1">${n.Observaciones}</p>
      <p class="text-slate-500 mt-1">${n.Doctor_Nombre} · ${n.Signos_Vitales}</p>
    </div>`).join('') || '<p class="text-xs text-slate-500">Sin notas de evolución.</p>';

  const pFiles = STATE.archivos.filter(a => a.Paciente_ID === pacId).reverse();
  document.getElementById('archivosList').innerHTML = pFiles.map(a => `
    <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs">
      <div><p class="font-semibold text-white">${a.Categoria}</p><p class="text-slate-400">${a.Fecha_Subida}</p></div>
      <a href="${a.URL_Drive}" target="_blank" class="bg-cyan-500/20 text-cyan-300 px-3 py-1.5 rounded-lg font-bold">Ver en Drive</a>
    </div>`).join('') || '<p class="text-xs text-slate-500">Sin radiografías o fotos cargadas.</p>';
}

async function saveNotaEvolucion() {
  const pacId = document.getElementById('clinicalPatientSelect').value;
  const proc = document.getElementById('notaProc').value;
  if (!pacId || !proc) return showToast('Completa paciente y procedimiento', 'error');
  await runServer('apiSaveNotaEvolucion', STATE.session, {
    Paciente_ID: pacId,
    Procedimiento: proc,
    Signos_Vitales: document.getElementById('notaSignos').value,
    Observaciones: document.getElementById('notaObs').value,
    Marcar_Consentimiento: document.getElementById('notaConsentCheck').checked
  });
  document.getElementById('notaProc').value = '';
  document.getElementById('notaObs').value = '';
  showToast('Nota de evolución guardada.');
  await hydrateApp();
}

function uploadCompressedPhoto() {
  const fileInput = document.getElementById('fotoInput');
  const pacId = document.getElementById('clinicalPatientSelect').value;
  if (!fileInput.files.length || !pacId) return showToast('Selecciona paciente e imagen', 'error');

  const pac = STATE.pacientes.find(p => p.Paciente_ID === pacId);
  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = (e) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const maxW = 1024;
      const scale = img.width > maxW ? maxW / img.width : 1;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.72);

      await runServer('apiUploadEvidencia', STATE.session, {
        Paciente_ID: pacId,
        Paciente_Nombre: pac.Nombre,
        Categoria: document.getElementById('fotoCategoria').value,
        File_Name: `${Date.now()}_${file.name.replace(/\.[^/.]+$/, '')}.jpg`,
        Base64_Data: compressedBase64
      });
      fileInput.value = '';
      showToast('Imagen comprimida y guardada en Drive.');
      await hydrateApp();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function generatePdf(docType, extraData = {}) {
  const pacId = extraData.Paciente_ID || document.getElementById('clinicalPatientSelect').value;
  if (!pacId) return showToast('Selecciona un paciente', 'error');
  if (docType === 'RECETA') {
    extraData.indicaciones = document.getElementById('notaObs').value || prompt('Indicaciones médicas para la receta:');
    if (!extraData.indicaciones) return;
  }
  const res = await runServer('apiGenerateDocumentPdf', STATE.session, {
    Paciente_ID: pacId,
    Doc_Type: docType,
    Data: extraData
  });
  showToast('PDF generado. Abriendo documento...');
  window.open(res.data.url, '_blank');
}

function renderFinanzas() {
  document.getElementById('finanzasTableBody').innerHTML = STATE.finanzas.slice().reverse().map(f => `
    <tr class="hover:bg-slate-900/50">
      <td class="p-3.5 text-xs">
        <span class="font-mono font-bold text-cyan-400 block">${f.Folio_Recibo || '#0000'}</span>
        <span class="text-slate-400">${f.Fecha}</span>
      </td>
      <td class="p-3.5 font-medium text-white">${f.Paciente_Nombre}</td>
      <td class="p-3.5 text-slate-300 text-xs max-w-xs">${f.Concepto}</td>
      <td class="p-3.5 text-xs">
        <span class="px-2 py-0.5 rounded font-bold ${f.Moneda === 'USD' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-300'}">${f.Moneda}</span>
        <span class="text-slate-400 block mt-0.5">${f.Metodo_Pago || 'Efectivo'}</span>
      </td>
      <td class="p-3.5 text-right font-mono">$${Number(f.Total_Original).toFixed(2)}</td>
      <td class="p-3.5 text-right font-mono text-emerald-400">$${Number(f.Abonado_Original).toFixed(2)}</td>
      <td class="p-3.5 text-right font-mono text-cyan-400">$${Number(f.Honorario_Doctor_MXN).toFixed(2)}</td>
      <td class="p-3.5">
        <button onclick='generatePdf("PRESUPUESTO", {Paciente_ID:"${f.Paciente_ID}", concepto:"${f.Concepto}", moneda:"${f.Moneda}", tipoCambio:"${f.Tipo_Cambio_Aplicado}", total:${f.Total_Original}, abonado:${f.Abonado_Original}})' class="text-xs bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg text-cyan-300 font-semibold">PDF</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="8" class="p-5 text-center text-slate-500">Sin movimientos financieros.</td></tr>';
}

function renderLaboratorio() {
  document.getElementById('labList').innerHTML = STATE.laboratorio.slice().reverse().map(l => `
    <div class="glass-card rounded-2xl p-4 space-y-2.5">
      <div class="flex justify-between">
        <span class="text-xs font-bold text-purple-300">${l.Laboratorio}</span>
        <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300">${l.Estatus}</span>
      </div>
      <h4 class="font-bold text-white">${l.Trabajo}</h4>
      <p class="text-xs text-slate-400">Paciente: ${l.Paciente_Nombre} · Color/Pieza: ${l.Color_Pieza}</p>
      <p class="text-xs text-slate-500">Entrega est: ${l.Fecha_Entrega_Est || 'Pendiente'} · Costo: $${l.Costo_MXN} MXN</p>
      <div class="flex gap-2 pt-2 border-t border-slate-800">
        <button onclick="updateLabStatus('${l.Orden_ID}','EN_PRUEBA')" class="bg-slate-800 px-2.5 py-1 rounded-lg text-xs">En Prueba</button>
        <button onclick="updateLabStatus('${l.Orden_ID}','RECIBIDO')" class="bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-lg text-xs">Recibido</button>
        <button onclick="updateLabStatus('${l.Orden_ID}','ENTREGADO')" class="bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg text-xs">Entregado</button>
      </div>
    </div>`).join('') || '<p class="text-sm text-slate-500">Sin órdenes de laboratorio.</p>';
}

async function updateLabStatus(id, status) {
  await runServer('apiUpdateOrdenLabStatus', STATE.session, id, status);
  showToast(`Orden actualizada a ${status}`);
  await hydrateApp();
}

function fillConfigForm() {
  document.getElementById('cfgNombre').value = STATE.consultorio.Nombre || '';
  document.getElementById('cfgDireccion').value = STATE.consultorio.Direccion || '';
  document.getElementById('cfgTelefono').value = STATE.consultorio.Telefono || '';
  document.getElementById('cfgTC').value = STATE.consultorio.Tipo_Cambio_USD || 19.5;
  document.getElementById('cfgWebhook').value = STATE.consultorio.Webhook_URL || '';
}

function openTarifarioModal() {
  if (STATE.session.Rol !== 'TITULAR') {
    return showToast('Solo el Titular puede editar el tarifario de precios.', 'error');
  }
  const listEl = document.getElementById('tarifarioInputsList');
  listEl.innerHTML = (STATE.tarifario || []).map((t, idx) => `
    <div class="grid grid-cols-12 gap-2 items-center bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl">
      <input type="hidden" id="tarKey_${idx}" value="${t.Clave}">
      <div class="col-span-7">
        <span class="text-[10px] uppercase font-mono text-cyan-400">${t.Clave}</span>
        <input id="tarConcepto_${idx}" value="${t.Concepto}" required class="w-full bg-transparent text-xs text-white focus:outline-none border-b border-slate-700 pb-0.5">
      </div>
      <div class="col-span-5">
        <label class="text-[10px] text-slate-400 block">Precio (MXN)</label>
        <input id="tarPrecio_${idx}" type="number" step="0.01" min="0" value="${t.Precio_MXN}" required class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm font-mono text-emerald-400">
      </div>
    </div>
  `).join('');
  openModal('modalTarifario');
}

document.getElementById('formTarifario').addEventListener('submit', async (e) => {
  e.preventDefault();
  const updated = (STATE.tarifario || []).map((t, idx) => ({
    Clave: document.getElementById(`tarKey_${idx}`).value,
    Concepto: document.getElementById(`tarConcepto_${idx}`).value,
    Precio_MXN: Number(document.getElementById(`tarPrecio_${idx}`).value) || 0
  }));
  await runServer('apiSaveTarifario', STATE.session, updated);
  closeModal('modalTarifario');
  showToast('Tarifario actualizado.');
  await hydrateApp();
});

document.getElementById('formPaciente').addEventListener('submit', async (e) => {
  e.preventDefault();
  await runServer('apiSavePaciente', STATE.session, {
    Nombre: document.getElementById('pacNombre').value,
    Telefono: document.getElementById('pacTel').value,
    Idioma: document.getElementById('pacIdioma').value,
    Email: document.getElementById('pacEmail').value,
    Fecha_Nacimiento: document.getElementById('pacNac').value,
    Alergias: document.getElementById('pacAlergias').value,
    Antecedentes: document.getElementById('pacAntecedentes').value
  });
  e.target.reset();
  closeModal('modalPaciente');
  showToast('Paciente registrado.');
  await hydrateApp();
});

document.getElementById('formCita').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pacSel = document.getElementById('citaPaciente');
  const docSel = document.getElementById('citaDoctor');
  await runServer('apiSaveCita', STATE.session, {
    Paciente_ID: pacSel.value,
    Paciente_Nombre: pacSel.options[pacSel.selectedIndex].text.split(' (')[0],
    Doctor_ID: docSel.value,
    Doctor_Nombre: docSel.options[docSel.selectedIndex].text,
    Unidad: document.getElementById('citaUnidad').value,
    Fecha: document.getElementById('citaFecha').value,
    Hora_Inicio: document.getElementById('citaHora').value,
    Duracion_Min: document.getElementById('citaDuracion').value,
    Motivo: document.getElementById('citaMotivo').value,
    Sync_Calendar: document.getElementById('citaSyncCal').checked
  });
  e.target.reset();
  closeModal('modalCita');
  showToast('Cita agendada.');
  await hydrateApp();
});

document.getElementById('formFinanzas').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pacSel = document.getElementById('finPaciente');
  const docSel = document.getElementById('finDoctor');
  const res = await runServer('apiSavePresupuestoPago', STATE.session, {
    Paciente_ID: pacSel.value,
    Paciente_Nombre: pacSel.options[pacSel.selectedIndex].text.split(' (')[0],
    Doctor_ID: docSel.value,
    Concepto: document.getElementById('finConcepto').value,
    Moneda: document.getElementById('finMoneda').value,
    Metodo_Pago: document.getElementById('finMetodoPago').value,
    Total_Original: document.getElementById('finTotal').value,
    Abonado_Original: document.getElementById('finAbonado').value
  });
  e.target.reset();
  closeModal('modalFinanzas');
  showToast(res.message || 'Cobro registrado.');
  await hydrateApp();
});

document.getElementById('formLab').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pacSel = document.getElementById('labPaciente');
  await runServer('apiSaveOrdenLab', STATE.session, {
    Paciente_ID: pacSel.value,
    Paciente_Nombre: pacSel.options[pacSel.selectedIndex].text.split(' (')[0],
    Laboratorio: document.getElementById('labNombre').value,
    Trabajo: document.getElementById('labTrabajo').value,
    Color_Pieza: document.getElementById('labColor').value,
    Fecha_Entrega_Est: document.getElementById('labEntrega').value,
    Costo_MXN: document.getElementById('labCosto').value
  });
  e.target.reset();
  closeModal('modalLab');
  showToast('Orden de laboratorio creada.');
  await hydrateApp();
});

document.getElementById('configForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await runServer('apiUpdateConsultorioConfig', STATE.session, {
    Nombre: document.getElementById('cfgNombre').value,
    Direccion: document.getElementById('cfgDireccion').value,
    Telefono: document.getElementById('cfgTelefono').value,
    Tipo_Cambio_USD: document.getElementById('cfgTC').value,
    Webhook_URL: document.getElementById('cfgWebhook').value
  });
  showToast('Configuración guardada.');
  await hydrateApp();
});

// CONSOLA SUPERADMIN XICOSOFT
async function loadSuperAdminPanel() {
  const res = await runServer('apiSuperAdminListClinics', STATE.session);
  const clinics = res.data.clinics || [];
  const base = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);

  document.getElementById('saClinicsList').innerHTML = clinics.slice().reverse().map(c => {
    const isActive = String(c.Estatus).toUpperCase() === 'ACTIVO';
    const nextStatus = isActive ? 'SUSPENDIDO' : 'ACTIVO';
    const bookingUrl = `${base}booking.html?clinic=${encodeURIComponent(c.Consultorio_ID)}`;
    return `
      <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span class="text-xs font-mono font-bold text-cyan-400">${c.Consultorio_ID}</span>
            <h3 class="font-bold text-white">${c.Nombre}</h3>
          </div>
          <span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}">${c.Estatus}</span>
        </div>
        <p class="text-xs text-slate-400">PIN Titular: <span class="font-mono text-amber-300 font-bold">${c.PIN_Titular}</span> · Alta: ${c.Fecha_Alta}</p>
        <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
          <a href="${c.Spreadsheet_URL}" target="_blank" class="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold">Abrir Sheet</a>
          <button onclick="navigator.clipboard.writeText('${bookingUrl}').then(()=>showToast('Liga de citas copiada'))" class="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 px-3 py-1.5 rounded-lg text-xs font-semibold">Copiar Liga Citas</button>
          <button onclick="toggleClinicStatus('${c.Consultorio_ID}','${nextStatus}')" class="${isActive ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'} px-3 py-1.5 rounded-lg text-xs font-semibold">
            ${isActive ? 'Suspender' : 'Reactivar'}
          </button>
        </div>
      </div>`;
  }).join('') || '<p class="text-xs text-slate-500">Sin clínicas registradas.</p>';
  lucide.createIcons();
}

async function toggleClinicStatus(cid, newStatus) {
  await runServer('apiSuperAdminToggleClinic', STATE.session, cid, newStatus);
  showToast(`Clínica ${cid} marcada como ${newStatus}`);
  await loadSuperAdminPanel();
}

document.getElementById('formCreateClinic').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await runServer('apiSuperAdminCreateClinic', STATE.session, {
    Nombre: document.getElementById('saClinicNombre').value,
    Direccion: document.getElementById('saClinicDir').value,
    Telefono: document.getElementById('saClinicTel').value,
    Titular_Nombre: document.getElementById('saDocNombre').value,
    Cedula: document.getElementById('saDocCedula').value,
    Titular_PIN: document.getElementById('saDocPin').value
  });
  e.target.reset();
  showToast(res.message);
  await loadSuperAdminPanel();
});

lucide.createIcons();
