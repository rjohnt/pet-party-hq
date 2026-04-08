const STORAGE_KEY = 'pet-party-hq-v1';

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
    const hpPct = Math.max(0, Math.min(100, (pet.hp / pet.maxHp) * 100));
    const hpFill = node.querySelector('.hp-fill');
    hpFill.style.width = `${hpPct}%`;
    hpFill.style.background = hpPct >= 70 ? 'var(--good)' : hpPct >= 40 ? 'var(--warn)' : 'var(--bad)';
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

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
