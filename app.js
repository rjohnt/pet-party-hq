const STORAGE_KEY = 'pet-party-hq-v1';
const PET_ICONS = {
  sabine: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f436.svg', // dog face
  shen: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f98e.svg',   // lizard
  noah: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f40d.svg'    // snake
};

const defaultState = {
  pets: [
    {
      id: 'sabine', name: 'Sabine', species: 'Cavalier King Charles Spaniel', hp: 92, maxHp: 100, xp: 0, level: 7,
      statusEffects: ['Needs Walk'],
      tasks: [
        { id: 'sabine_breakfast', label: 'Breakfast', cadence: 'Daily' },
        { id: 'sabine_dinner', label: 'Dinner', cadence: 'Daily' },
        { id: 'sabine_walk', label: 'Walk / Exercise', cadence: 'Daily' },
        { id: 'sabine_med', label: 'Simparica Trio', cadence: 'Monthly' },
        { id: 'sabine_vet', label: 'Vet follow-up', cadence: 'As Needed' }
      ]
    },
    {
      id: 'shen', name: 'Shen', species: 'Bearded Dragon', hp: 88, maxHp: 100, xp: 0, level: 8,
      statusEffects: ['Needs Greens'],
      tasks: [
        { id: 'shen_greens', label: 'Greens', cadence: 'Daily' },
        { id: 'shen_bugs', label: 'Bugs', cadence: 'Every 4 Days' },
        { id: 'shen_clean', label: 'Enclosure clean (medium)', cadence: 'Weekly' },
        { id: 'shen_deep_clean', label: 'Enclosure deep clean', cadence: 'Monthly' },
        { id: 'shen_uvb', label: 'UVB bulb replace', cadence: 'Every 183 Days' }
      ]
    },
    {
      id: 'noah', name: 'Noah', species: 'California King Snake', hp: 90, maxHp: 100, xp: 0, level: 8,
      statusEffects: ['Feed Window Pending'],
      tasks: [
        { id: 'noah_feed', label: 'Feed', cadence: 'Weekly' },
        { id: 'noah_bedding', label: 'Change bedding', cadence: 'Monthly' }
      ]
    }
  ],
  log: []
};

const state = loadState();
const partyGrid = document.getElementById('partyGrid');
const eventFeed = document.getElementById('eventFeed');
const quickInput = document.getElementById('quickInput');
const quickAddBtn = document.getElementById('quickAddBtn');
const quickResult = document.getElementById('quickResult');
const wakeTimeInput = document.getElementById('wakeTimeInput');
const recalcBtn = document.getElementById('recalcBtn');
const planOutput = document.getElementById('planOutput');

quickAddBtn.addEventListener('click', handleQuickLog);
quickInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleQuickLog();
});
recalcBtn.addEventListener('click', () => renderCatchupPlan(wakeTimeInput.value || '09:00'));

render();
renderCatchupPlan('09:00');
registerSW();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(defaultState);
  try { return JSON.parse(raw); } catch { return structuredClone(defaultState); }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  partyGrid.innerHTML = '';
  const tpl = document.getElementById('petTemplate');
  state.pets.forEach(pet => {
    const node = tpl.content.cloneNode(true);
    node.querySelector('.pet-name').textContent = pet.name;
    node.querySelector('.pet-species').textContent = pet.species;
    const iconEl = node.querySelector('.pet-icon');
    iconEl.src = PET_ICONS[pet.id] || 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f43e.svg';
    iconEl.alt = `${pet.name} icon`;

    const hpPct = Math.max(0, Math.min(100, (pet.hp / pet.maxHp) * 100));
    const hpFill = node.querySelector('.hp-fill');
    hpFill.style.width = `${hpPct}%`;
    hpFill.style.background = hpPct >= 70 ? 'var(--hp-good)' : hpPct >= 40 ? 'var(--hp-mid)' : 'var(--hp-low)';
    node.querySelector('.hp-text').textContent = `${pet.hp}/${pet.maxHp} HP`;
    node.querySelector('.status-list').textContent = `Status: ${pet.statusEffects.length ? pet.statusEffects.join(', ') : 'Normal'}`;
    node.querySelector('.xp-level').textContent = `Lv ${pet.level} • XP ${pet.xp}`;

    const tasksEl = node.querySelector('.tasks');
    pet.tasks.forEach(task => {
      const btn = document.createElement('button');
      btn.className = 'task-btn';
      btn.innerHTML = `<strong>${task.label}</strong><small>${task.cadence}</small>`;
      btn.addEventListener('click', () => completeTask(pet.id, task));
      tasksEl.appendChild(btn);
    });

    partyGrid.appendChild(node);
  });

  renderFeed();
}

function renderFeed() {
  eventFeed.innerHTML = '';
  state.log.slice(-50).reverse().forEach(item => {
    const div = document.createElement('div');
    div.className = 'feed-item';
    div.innerHTML = `<div>${item.message}</div><div class="tag">${new Date(item.ts).toLocaleString()}</div>`;
    eventFeed.appendChild(div);
  });
}

function completeTask(petId, task) {
  const pet = state.pets.find(p => p.id === petId);
  if (!pet) return;
  pet.xp += 5;
  pet.hp = Math.min(pet.maxHp, pet.hp + 3);
  if (pet.xp >= 100) {
    pet.level += 1;
    pet.xp -= 100;
    log(`${pet.name} leveled up! ⬆️`);
  }
  clearRelatedStatus(pet, task);
  log(`${pet.name} used ${task.label}! +5 XP, +3 HP`);
  saveState();
  render();
}

function clearRelatedStatus(pet, task) {
  const map = {
    walk: 'Needs Walk', greens: 'Needs Greens', feed: 'Feed Window Pending'
  };
  const key = task.label.toLowerCase();
  Object.entries(map).forEach(([k, effect]) => {
    if (key.includes(k)) pet.statusEffects = pet.statusEffects.filter(s => s !== effect);
  });
}

function handleQuickLog() {
  const text = quickInput.value.trim();
  if (!text) return;

  // Productivity catch-up intent
  if (/woke\s+up\s+late/i.test(text)) {
    const m = text.match(/(\d{1,2}:\d{2})/);
    const wake = m ? normalizeTime(m[1]) : nowTimeHHMM();
    wakeTimeInput.value = wake;
    renderCatchupPlan(wake);
    quickInput.value = '';
    quickResult.textContent = `Late start logged. Day plan recalculated from ${wake}.`;
    return;
  }

  const parsed = parseQuickText(text);
  if (!parsed) {
    quickResult.textContent = 'Could not parse. Try: "Walked Sabine" or click task buttons.';
    return;
  }
  completeTask(parsed.pet.id, parsed.task);
  quickInput.value = '';
  quickResult.textContent = `Logged: ${parsed.pet.name} • ${parsed.task.label}`;
}

function parseQuickText(text) {
  const t = text.toLowerCase();
  const pet = state.pets.find(p => t.includes(p.name.toLowerCase()));
  if (!pet) return null;

  const keywordMap = [
    ['walk', ['walk']],
    ['greens', ['greens']],
    ['bugs', ['bugs']],
    ['feed', ['feed', 'fed']],
    ['breakfast', ['breakfast']],
    ['dinner', ['dinner']],
    ['bedding', ['bedding']],
    ['deep clean', ['deep clean']],
    ['clean', ['clean']],
    ['vet', ['vet']],
    ['simparica', ['simparica']]
  ];

  for (const [target, terms] of keywordMap) {
    if (terms.some(term => t.includes(term))) {
      const task = pet.tasks.find(x => x.label.toLowerCase().includes(target));
      if (task) return { pet, task };
    }
  }
  return { pet, task: pet.tasks[0] };
}

function log(message) {
  state.log.push({ ts: Date.now(), message });
}

function normalizeTime(raw) {
  const [h, m] = raw.split(':').map(Number);
  const hh = Math.max(0, Math.min(23, h || 0));
  const mm = Math.max(0, Math.min(59, m || 0));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function nowTimeHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return (h * 60) + m;
}

function minsToLabel(total) {
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function renderCatchupPlan(wakeHHMM) {
  const wake = toMins(normalizeTime(wakeHHMM));
  const dayEnd = 21 * 60; // 9:00 PM

  const goals = [
    { name: 'Must-Win Focus Block', mins: 90 },
    { name: 'Admin Sweep', mins: 20 },
    { name: 'House Reset Sprint', mins: 20 },
    { name: 'Sabine Walk Quest', mins: 20 },
    { name: 'Meal Prep / Inventory', mins: 20 }
  ];

  const totalGoalMins = goals.reduce((a, g) => a + g.mins, 0);
  const available = Math.max(0, dayEnd - wake - 30); // keep 30-min buffer
  const scale = available < totalGoalMins ? (available / totalGoalMins) : 1;

  let cursor = wake + 10; // startup buffer
  const lines = [];
  lines.push(`<div class="feed-item"><strong>Wake:</strong> ${minsToLabel(wake)} • <strong>Day End:</strong> ${minsToLabel(dayEnd)}</div>`);

  goals.forEach(g => {
    const dur = Math.max(10, Math.round(g.mins * scale / 5) * 5);
    const start = cursor;
    const end = Math.min(dayEnd, start + dur);
    lines.push(`<div class="feed-item"><strong>${g.name}</strong><br>${minsToLabel(start)} → ${minsToLabel(end)} (${dur}m)</div>`);
    cursor = end + 10;
  });

  if (scale < 1) {
    lines.push('<div class="feed-item"><span class="tag">Compressed mode active: shorter blocks, same priorities. Never miss twice.</span></div>');
  } else {
    lines.push('<div class="feed-item"><span class="tag">Normal mode: full blocks scheduled.</span></div>');
  }

  planOutput.innerHTML = lines.join('');
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
