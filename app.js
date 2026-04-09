const STORAGE_KEY = 'pawkedex-v3';
const LEGACY_STORAGE_KEYS = ['pet-party-hq-v2'];
const PET_ICONS = {
  sabine: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f436.svg',
  shen: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f98e.svg',
  noah: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f40d.svg'
};

const partyGrid = document.getElementById('partyGrid');
const eventFeed = document.getElementById('eventFeed');
const quickInput = document.getElementById('quickInput');
const quickAddBtn = document.getElementById('quickAddBtn');
const quickResult = document.getElementById('quickResult');

let state = null;

quickAddBtn.addEventListener('click', handleQuickLog);
quickInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleQuickLog();
});

bootstrap();
registerSW();

async function bootstrap() {
  const local = loadLocalState();
  const remote = await loadRemoteState();
  state = chooseNewestState(local, remote) || remote || local || emptyState();
  saveState();
  render();
}

function emptyState() {
  return { version: 1, updated_at: new Date().toISOString(), party: [], log: [] };
}

function parseTs(v) {
  const n = Date.parse(v || '');
  return Number.isFinite(n) ? n : 0;
}

function chooseNewestState(a, b) {
  if (!a) return b;
  if (!b) return a;
  return parseTs(a.updated_at) >= parseTs(b.updated_at) ? a : b;
}

function loadLocalState() {
  const currentRaw = localStorage.getItem(STORAGE_KEY);
  if (currentRaw) {
    try { return JSON.parse(currentRaw); } catch { return null; }
  }

  // One-time migration from older app keys.
  for (const key of LEGACY_STORAGE_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      return parsed;
    } catch {
      // ignore malformed legacy payloads
    }
  }

  return null;
}

async function loadRemoteState() {
  try {
    const res = await fetch(`./state.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function saveState() {
  state.updated_at = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  partyGrid.innerHTML = '';
  const tpl = document.getElementById('petTemplate');

  state.party.forEach(rawPet => {
    const pet = normalizePet(rawPet);
    const node = tpl.content.cloneNode(true);

    node.querySelector('.pet-name').textContent = pet.name;
    node.querySelector('.pet-species').textContent = pet.species;

    const iconEl = node.querySelector('.pet-icon');
    iconEl.src = PET_ICONS[pet.id] || 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f43e.svg';
    iconEl.alt = `${pet.name} icon`;

    const hpPct = Math.max(0, Math.min(100, (pet.hp / pet.max_hp) * 100));
    const hpFill = node.querySelector('.hp-fill');
    hpFill.style.width = `${hpPct}%`;
    hpFill.style.background = hpPct >= 70 ? 'var(--hp-good)' : hpPct >= 40 ? 'var(--hp-mid)' : 'var(--hp-low)';

    node.querySelector('.hp-text').textContent = `${pet.hp}/${pet.max_hp} HP`;
    node.querySelector('.status-list').textContent = `Status: ${(pet.status_effects || []).join(', ') || 'Normal'}`;
    node.querySelector('.xp-level').textContent = `Lv ${pet.level || 1} • XP ${pet.xp || 0}`;

    const tasksEl = node.querySelector('.tasks');
    (pet.tasks || []).forEach(task => {
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

function normalizePet(pet) {
  const id = (pet.id || pet.name || '').toLowerCase();
  return {
    id,
    name: pet.name,
    species: pet.species,
    hp: pet.hp ?? 90,
    max_hp: pet.max_hp ?? 100,
    xp: pet.xp ?? 0,
    level: pet.level ?? 1,
    status_effects: pet.status_effects || ['Normal'],
    tasks: pet.tasks || []
  };
}

function getPetById(id) {
  return state.party.find(p => (p.id || p.name.toLowerCase()) === id);
}

function renderFeed() {
  eventFeed.innerHTML = '';
  (state.log || []).slice(-50).reverse().forEach(item => {
    const div = document.createElement('div');
    div.className = 'feed-item';
    const msg = item.message || `${item.pet || 'Pet'}: ${item.task_id || item.event || 'update'}`;
    div.innerHTML = `<div>${msg}</div><div class="tag">${new Date(item.ts).toLocaleString()}</div>`;
    eventFeed.appendChild(div);
  });
}

function completeTask(petId, task) {
  const pet = getPetById(petId);
  if (!pet) return;

  pet.xp = (pet.xp || 0) + 5;
  pet.hp = Math.min((pet.max_hp || 100), (pet.hp || 0) + 3);

  if (pet.xp >= 100) {
    pet.level = (pet.level || 1) + 1;
    pet.xp -= 100;
    addLog(`${pet.name} leveled up! ⬆️`);
  }

  if (task?.id) {
    const t = (pet.tasks || []).find(x => x.id === task.id);
    if (t) t.last_done = new Date().toISOString();
  }

  clearRelatedStatus(pet, task);
  addLog(`${pet.name} used ${task.label}! +5 XP, +3 HP`);
  saveState();
  render();
}

function clearRelatedStatus(pet, task) {
  const statusByKeyword = {
    walk: 'Needs Walk',
    greens: 'Needs Greens',
    feed: 'Feed Window Pending'
  };
  const key = (task?.label || '').toLowerCase();
  Object.entries(statusByKeyword).forEach(([k, effect]) => {
    if (key.includes(k)) {
      pet.status_effects = (pet.status_effects || []).filter(s => s !== effect);
    }
  });
  if (!pet.status_effects || pet.status_effects.length === 0) {
    pet.status_effects = ['Normal'];
  }
}

function addLog(message, extra = {}) {
  state.log = state.log || [];
  state.log.push({ ts: new Date().toISOString(), message, ...extra });
}

function handleQuickLog() {
  const text = quickInput.value.trim();
  if (!text) return;

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
  const pet = state.party.find(p => t.includes(p.name.toLowerCase()));
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
      const task = (pet.tasks || []).find(x => x.label.toLowerCase().includes(target));
      if (task) return { pet: normalizePet(pet), task };
    }
  }

  return { pet: normalizePet(pet), task: (pet.tasks || [])[0] };
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
