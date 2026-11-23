/**
 * DentaOS Pro - Frontend Controller (app.js)
 * Desarrollado por Xicosoft
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbxWtJRZLdqe19FY9juUoTp1i6p7FKQ-rnUwpp9dIeQ6_epXc_HkBMz20vWmvnkN36uFSQ/exec';

const STATE = {
  session: null,
  consultorio: {},
  doctores: [],
  pacientes: [],
  citas: [],
  odontogramas: [],
  notas: [],
  finanzas: [],
  laboratorio: [],
  archivos: [],
  odontogramData: {},
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

const ADULT_ROWS = [
  ['18','17','16','15','14','13','12','11', '21','22','23','24','25','26','27','28'],
  ['48','47','46','45','44','43','42','41', '31','32','33','34','35','36','37','38']
];

const CHILD_ROWS = [
  ['55','54','53','52','51', '61','62','63','64','65'],
  ['85','84','83','82','81', '71','72','73','74','75']
];

// Cliente API REST hacia Google Apps Script (sin preflight CORS)
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
  navigator.clipboard.writeText(url).then(() => {
    showToast('Liga pública de citas copiada al portapapeles.');
  });
}

// AUTH
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pin = document.getElementById('loginPin').value;
  const res = await runServer('apiLogin', pin);
  STATE.session = res.data.session;
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('userBadge').textContent = `${STATE.session.Nombre} · ${STATE.session.Rol}`;
  showToast(res.message);
  await hydrateApp();
});

function logout() {
  STATE.session = null;
  document.getElementById('loginPin').value = '';
  document.getElementById('appShell').classList.add('hidden');
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

// AGENDA
function renderAgenda() {
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

// ODONTOGRAMA FDI + VOZ
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

function renderOdontogram() {
  const tipo = document.getElementById('denticionSelect').value;
  const rows = tipo === 'INFANTIL' ? CHILD_ROWS : ADULT_ROWS;
  const container = document.getElementById('odontogramGrid');

  container.innerHTML = rows.map((row, rIdx) => `
    <div>
      <p class="text-[11px] uppercase tracking-wider text-slate-500 mb-2">${rIdx === 0 ? 'Arcada Superior' : 'Arcada Inferior'}</p>
      <div class="flex gap-1.5 min-w-max">
        ${row.map(num => buildToothSvgCard(num)).join('')}
      </div>
    </div>
  `).join('');
}

function buildToothSvgCard(num) {
  const t = STATE.odontogramData[num] || { V: 'sano', L: 'sano', M: 'sano', D: 'sano', O: 'sano', whole: '' };
  const isAusente = t.whole === 'ausente';
  const fill = (face) => isAusente ? CONDITION_COLORS.ausente : (CONDITION_COLORS[t[face]] || CONDITION_COLORS.sano);

  return `
    <div id="tooth-${num}" class="tooth-card bg-slate-900 border border-slate-800 rounded-xl p-1.5 flex flex-col items-center w-[54px]">
      <span class="text-[11px] font-mono font-bold text-slate-300 mb-1">${num}</span>
      <svg viewBox="0 0 100 100" class="w-10 h-10">
        <polygon points="0,0 100,0 75,25 25,25" fill="${fill('V')}" class="tooth-surface" onclick="paintTooth('${num}','V')" title="Vestibular"></polygon>
        <polygon points="100,0 100,100 75,75 75,25" fill="${fill('D')}" class="tooth-surface" onclick="paintTooth('${num}','D')" title="Distal"></polygon>
        <polygon points="0,100 100,100 75,75 25,75" fill="${fill('L')}" class="tooth-surface" onclick="paintTooth('${num}','L')" title="Lingual/Palatina"></polygon>
        <polygon points="0,0 25,25 25,75 0,100" fill="${fill('M')}" class="tooth-surface" onclick="paintTooth('${num}','M')" title="Mesial"></polygon>
        <rect x="25" y="25" width="50" height="50" fill="${fill('O')}" class="tooth-surface" onclick="paintTooth('${num}','O')" title="Oclusal/Incisal"></rect>
        ${isAusente ? '<line x1="10" y1="10" x2="90" y2="90" stroke="#ef4444" stroke-width="8"/><line x1="90" y1="10" x2="10" y2="90" stroke="#ef4444" stroke-width="8"/>' : ''}
      </svg>
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

// MOTOR DE VOZ (WEB SPEECH API es-MX)
function toggleVoiceExploration() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    showToast('Tu navegador no soporta dictado por voz. Usa Chrome o Edge.', 'error');
    return;
  }
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

  paintTooth(pieza, face, cond);
  const confirmMsg = `Pieza ${pieza}, ${cond} registrado.`;
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
    Notas_Generales: 'Guardado desde módulo clínico'
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
      <td class="p-3.5 text-xs text-slate-400">${f.Fecha}</td>
      <td class="p-3.5 font-medium text-white">${f.Paciente_Nombre}</td>
      <td class="p-3.5 text-slate-300">${f.Concepto}</td>
      <td class="p-3.5"><span class="px-2 py-0.5 rounded text-xs font-bold ${f.Moneda === 'USD' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-300'}">${f.Moneda}</span></td>
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
  await runServer('apiSavePresupuestoPago', STATE.session, {
    Paciente_ID: pacSel.value,
    Paciente_Nombre: pacSel.options[pacSel.selectedIndex].text.split(' (')[0],
    Doctor_ID: docSel.value,
    Concepto: document.getElementById('finConcepto').value,
    Moneda: document.getElementById('finMoneda').value,
    Total_Original: document.getElementById('finTotal').value,
    Abonado_Original: document.getElementById('finAbonado').value
  });
  e.target.reset();
  closeModal('modalFinanzas');
  showToast('Movimiento registrado.');
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

lucide.createIcons();
