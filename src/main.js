const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("hud");
const resourcesList = document.getElementById("resources");
const colonistsList = document.getElementById("colonists");
const eventsList = document.getElementById("events");
const togglePauseButton = document.getElementById("toggle-pause");
const speedButton = document.getElementById("speed");
const zoomOutButton = document.getElementById("zoom-out");
const zoomInButton = document.getElementById("zoom-in");
const zoomLevelLabel = document.getElementById("zoom-level");
const tutorialModal = document.getElementById("tutorial");
const startNewButton = document.getElementById("start-new");
const continueButton = document.getElementById("continue");
const setupModal = document.getElementById("setup");
const colonistGrid = document.getElementById("colonist-grid");
const startCampaignButton = document.getElementById("start-campaign");
const freePlayButton = document.getElementById("free-play");
const biomeList = document.getElementById("biome-list");
const biomeRisk = document.getElementById("biome-risk");
const teamSizeLabel = document.getElementById("team-size");
const foodPackLabel = document.getElementById("food-pack");
const waterPackLabel = document.getElementById("water-pack");
const toolsPackLabel = document.getElementById("tools-pack");
const sendExpeditionButton = document.getElementById("send-expedition");
const expeditionLog = document.getElementById("expedition-log");
const choiceModal = document.getElementById("choice-modal");
const choiceTitle = document.getElementById("choice-title");
const choiceBody = document.getElementById("choice-body");
const choiceAButton = document.getElementById("choice-a");
const choiceBButton = document.getElementById("choice-b");
const toggleDismantleButton = document.getElementById("toggle-dismantle");
const dismantleModal = document.getElementById("dismantle-modal");
const dismantleBody = document.getElementById("dismantle-body");
const dismantleConfirm = document.getElementById("dismantle-confirm");
const dismantleCancel = document.getElementById("dismantle-cancel");
const infoPanel = document.getElementById("info-panel");

const TILE_SIZE = 32;
const MAP_SIZE = 28;
const TICK_RATE = 60;
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 1.6;

const terrainPalette = {
  grass: "#3f7f4a",
  water: "#2d4e73",
  rock: "#5d5f64"
};

const resourcePalette = {
  tree: { trunk: "#3f6d4a", crown: "#63b76d" },
  berries: { bush: "#6f3c6d", berry: "#c060c8" },
  rock: { base: "#7b7e84", highlight: "#9aa0a8" }
};

const resourceValues = {
  tree: { wood: 4 },
  berries: { food: 3 },
  rock: { stone: 4 }
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shadeColor(hex, amount) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = clamp(((num >> 16) & 0xff) + amount, 0, 255);
  const g = clamp(((num >> 8) & 0xff) + amount, 0, 255);
  const b = clamp((num & 0xff) + amount, 0, 255);
  return `rgb(${r}, ${g}, ${b})`;
}

const RESOURCE_DEFS = {
  tree: { name: "Дерево", description: "Источник древесины для строительства.", yields: "дерево" },
  berries: { name: "Ягодник", description: "Быстрый источник еды, но истощается.", yields: "еда" },
  rock: { name: "Камень", description: "Узлы камня для мастерства и стен.", yields: "камень" }
};

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    this.beginPath();
    this.moveTo(x + r, y);
    this.lineTo(x + width - r, y);
    this.quadraticCurveTo(x + width, y, x + width, y + r);
    this.lineTo(x + width, y + height - r);
    this.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    this.lineTo(x + r, y + height);
    this.quadraticCurveTo(x, y + height, x, y + height - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    this.closePath();
    return this;
  };
}

const gameState = {
  day: 1,
  time: 0,
  speed: 1,
  paused: false,
  resources: {
    food: 16,
    wood: 20,
    stone: 6,
    tools: 0,
    water: 8
  },
  events: [],
  map: [],
  nodes: [],
  animals: [],
  buildOrders: [],
  structures: [],
  colonists: [],
  selectedTab: "overview",
  selectedBuild: "camp",
  selectedColonistId: null,
  commandMode: "move",
  zoom: 1,
  storyMode: true,
  story: {
    chapter: 1,
    beaconBuilt: false,
    daysAfterBeacon: 0
  },
  storyFlags: {
    path: null,
    archiveExposed: false,
    caravanRobbed: false,
    toxinUsed: false,
    survivorsAccepted: false,
    swampHint: false,
    wastelandHint: false,
    mountainHint: false
  },
  selectedColonists: [],
  started: false,
  lastRescueDay: 0,
  dismantleCount: 0,
  dismantleDay: 0,
  pan: { x: 0, y: 0 },
  exploration: {
    team: 2,
    packs: { food: 4, water: 3, tools: 1 },
    selectedBiome: "forest",
    log: []
  },
  choice: null,
  buildMode: "build",
  pendingDismantle: null,
  selectedObject: null,
  animalSpawnTimer: 0
};

const camera = {
  offsetX: 0,
  offsetY: 0,
  viewWidth: 0,
  viewHeight: 0
};

const BIOMES = [
  {
    id: "forest",
    name: "Лес",
    risk: 0.25,
    resources: { wood: [4, 10], food: [2, 5], herbs: [0, 2] },
    threats: ["Хищники", "Клещи"],
    hidden: ["Следы охотников"],
    rare: ["Семена древних деревьев"]
  },
  {
    id: "swamp",
    name: "Болото",
    risk: 0.45,
    resources: { reagents: [1, 3], water: [2, 4] },
    threats: ["Болезни", "Токсичные испарения"],
    hidden: ["Контейнер с данными"],
    rare: ["Стабилизатор воды"],
    unlockFlag: "swampHint"
  },
  {
    id: "wasteland",
    name: "Пустошь",
    risk: 0.5,
    resources: { scrap: [2, 6], battery: [0, 2] },
    threats: ["Радиация", "Мародёры"],
    hidden: ["Следы каравана"],
    rare: ["Силовой модуль"],
    unlockFlag: "wastelandHint"
  },
  {
    id: "ruins",
    name: "Руины",
    risk: 0.4,
    resources: { tech: [1, 4], stone: [1, 3] },
    threats: ["Дроны", "Обрушения"],
    hidden: ["Архив катастрофы"],
    rare: ["Чертёж маяка v2"]
  },
  {
    id: "mountains",
    name: "Горы",
    risk: 0.55,
    resources: { stone: [3, 8], crystal: [0, 1] },
    threats: ["Лавины", "Холод"],
    hidden: ["Пещера выживших"],
    rare: ["Кристалл связи"],
    unlockFlag: "mountainHint"
  }
];

const ANIMALS = [
  {
    id: "hare",
    name: "Заяц",
    description: "Мелкая добыча. Часто уходит при приближении.",
    food: 4,
    danger: 0.1,
    fleeChance: 0.5,
    aggressive: false,
    behavior: "flee",
    huntTime: 2
  },
  {
    id: "deer",
    name: "Олень",
    description: "Осторожное животное. Может сбежать.",
    food: 8,
    danger: 0.2,
    fleeChance: 0.35,
    aggressive: false,
    behavior: "cautious",
    huntTime: 3
  },
  {
    id: "boar",
    name: "Кабан",
    description: "Агрессивная добыча. Риск ранения и смерти.",
    food: 10,
    danger: 0.6,
    fleeChance: 0.2,
    aggressive: true,
    behavior: "aggressive",
    huntTime: 4
  }
];

function gridToScreen(x, y) {
  return {
    x: x * TILE_SIZE,
    y: y * TILE_SIZE
  };
}

function screenToGrid(x, y) {
  const worldX = (x - camera.offsetX) / gameState.zoom;
  const worldY = (y - camera.offsetY) / gameState.zoom;
  const gridX = Math.floor(worldX / TILE_SIZE);
  const gridY = Math.floor(worldY / TILE_SIZE);
  return { x: gridX, y: gridY };
}

function getWorldSize() {
  return MAP_SIZE * TILE_SIZE;
}

function updateCamera() {
  const worldSize = getWorldSize();
  const zoom = gameState.zoom;
  camera.offsetX = (camera.viewWidth / zoom - worldSize) / 2 + gameState.pan.x;
  camera.offsetY = (camera.viewHeight / zoom - worldSize) / 2 + gameState.pan.y;
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.viewWidth = rect.width;
  camera.viewHeight = rect.height;
  updateCamera();
}

function createMap() {
  const map = [];
  for (let x = 0; x < MAP_SIZE; x += 1) {
    const column = [];
    for (let y = 0; y < MAP_SIZE; y += 1) {
      const edge = x === 0 || y === 0 || x === MAP_SIZE - 1 || y === MAP_SIZE - 1;
      const rand = Math.random();
      let terrain = "grass";
      if (edge && rand < 0.4) {
        terrain = "water";
      } else if (rand > 0.9) {
        terrain = "rock";
      }
      column.push({ terrain, detail: Math.random() });
    }
    map.push(column);
  }
  return map;
}

function createResources() {
  const nodes = [];
  const addNode = (type, count) => {
    let added = 0;
    while (added < count) {
      const x = Math.floor(Math.random() * MAP_SIZE);
      const y = Math.floor(Math.random() * MAP_SIZE);
      if (gameState.map[x][y].terrain !== "grass") continue;
      nodes.push({ id: `${type}-${x}-${y}-${added}`, type, x, y, amount: 1, regrow: 0 });
      added += 1;
    }
  };
  addNode("tree", 40);
  addNode("berries", 18);
  addNode("rock", 16);
  return nodes;
}

function createAnimals() {
  const animals = [];
  for (let i = 0; i < 5; i += 1) {
    spawnAnimal(animals);
  }
  return animals;
}

function spawnAnimal(list = gameState.animals) {
  const type = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const maxAttempts = 12;
  let x = 0;
  let y = 0;
  let attempts = 0;
  do {
    x = Math.floor(Math.random() * MAP_SIZE);
    y = Math.floor(Math.random() * MAP_SIZE);
    attempts += 1;
  } while (attempts < maxAttempts && (!canWalk(x, y) || !canBuild(x, y)));
  if (!canWalk(x, y) || !canBuild(x, y)) return;
  list.push({
    id: crypto.randomUUID(),
    type: type.id,
    name: type.name,
    x,
    y,
    ttl: 60 + Math.floor(Math.random() * 40)
  });
}

const colonistRoster = [
  {
    id: "aira",
    name: "Айра",
    role: "Инженер",
    traits: ["Трудолюбивая", "Спокойная"],
    modifiers: { workRate: 1.15, hungerRate: 1, restRate: 1 }
  },
  {
    id: "dan",
    name: "Дан",
    role: "Разведчик",
    traits: ["Выносливый", "Упрямый"],
    modifiers: { workRate: 1, hungerRate: 0.9, restRate: 1.1 }
  },
  {
    id: "nika",
    name: "Ника",
    role: "Собиратель",
    traits: ["Быстрая", "Нервная"],
    modifiers: { workRate: 1.05, hungerRate: 1.1, restRate: 0.95 }
  },
  {
    id: "sava",
    name: "Сава",
    role: "Мастер",
    traits: ["Мастер", "Неаккуратный"],
    modifiers: { workRate: 1.2, hungerRate: 1.05, restRate: 0.9 }
  },
  {
    id: "lira",
    name: "Лира",
    role: "Повар",
    traits: ["Кулинар", "Домосед"],
    modifiers: { workRate: 0.95, hungerRate: 0.85, restRate: 1.05 }
  }
];

function createColonists() {
  const base = [
    { x: 9, y: 9 },
    { x: 10, y: 12 },
    { x: 13, y: 10 }
  ];
  const selection = gameState.selectedColonists.length > 0 ? gameState.selectedColonists : colonistRoster.slice(0, 3);
  return selection.map((data, index) => createColonist(data, base[index].x, base[index].y));
}

function createColonist(data, x, y) {
  return {
    id: crypto.randomUUID(),
    name: data.name,
    role: data.role,
    traits: data.traits,
    modifiers: data.modifiers,
    x,
    y,
    goal: null,
    task: "idle",
    carry: null,
    hunger: 100,
    rest: 100,
    mood: 80
  };
}

function findClosestNode(type, fromX, fromY) {
  let best = null;
  let bestDistance = Infinity;
  for (const node of gameState.nodes) {
    if (node.type !== type || node.amount <= 0) continue;
    const distance = Math.abs(node.x - fromX) + Math.abs(node.y - fromY);
    if (distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

function findClosestOrder(fromX, fromY) {
  let best = null;
  let bestDistance = Infinity;
  for (const order of gameState.buildOrders) {
    if (order.progress >= order.cost) continue;
    if (order.mode && order.mode !== "build") continue;
    const distance = Math.abs(order.x - fromX) + Math.abs(order.y - fromY);
    if (distance < bestDistance) {
      best = order;
      bestDistance = distance;
    }
  }
  return best;
}

function findClosestDismantle(fromX, fromY) {
  let best = null;
  let bestDistance = Infinity;
  for (const order of gameState.buildOrders) {
    if (order.mode !== "dismantle" || order.progress >= order.cost) continue;
    const distance = Math.abs(order.x - fromX) + Math.abs(order.y - fromY);
    if (distance < bestDistance) {
      best = order;
      bestDistance = distance;
    }
  }
  return best;
}

function canWalk(x, y) {
  if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return false;
  return gameState.map[x][y].terrain !== "water";
}

function canBuild(x, y) {
  if (!canWalk(x, y)) return false;
  const occupiedByStructure = gameState.structures.some((structure) => structure.x === x && structure.y === y);
  const occupiedByNode = gameState.nodes.some((node) => node.x === x && node.y === y && node.amount > 0);
  const occupiedByOrder = gameState.buildOrders.some((order) => order.x === x && order.y === y);
  return !occupiedByStructure && !occupiedByNode && !occupiedByOrder;
}

function moveTowards(colonist, targetX, targetY) {
  if (colonist.x === targetX && colonist.y === targetY) return true;
  const dx = Math.sign(targetX - colonist.x);
  const dy = Math.sign(targetY - colonist.y);
  const nextX = canWalk(colonist.x + dx, colonist.y) ? colonist.x + dx : colonist.x;
  const nextY = canWalk(colonist.x, colonist.y + dy) ? colonist.y + dy : colonist.y;
  if (canWalk(nextX, nextY)) {
    colonist.x = nextX;
    colonist.y = nextY;
  }
  return colonist.x === targetX && colonist.y === targetY;
}

function updateNeeds(colonist, delta) {
  colonist.hunger = Math.max(0, colonist.hunger - 0.7 * delta * colonist.modifiers.hungerRate);
  colonist.rest = Math.max(0, colonist.rest - 0.5 * delta / colonist.modifiers.restRate);
  if (colonist.hunger < 20 || colonist.rest < 20) {
    colonist.mood = Math.max(10, colonist.mood - 0.4 * delta);
  } else {
    colonist.mood = Math.min(100, colonist.mood + 0.1 * delta);
  }
}

function getDropoffTarget(colonist) {
  const storage = gameState.structures.filter((structure) => structure.type === "stockpile");
  if (storage.length > 0) {
    return storage.reduce((closest, current) => {
      const distance = Math.abs(current.x - colonist.x) + Math.abs(current.y - colonist.y);
      return distance < closest.distance ? { ...current, distance } : closest;
    }, { ...storage[0], distance: Infinity });
  }
  const camp = gameState.structures.find((structure) => structure.type === "camp");
  return camp ?? { x: 14, y: 14 };
}

function assignTask(colonist) {
  if (colonist.hunger < 35 && gameState.resources.food > 0) {
    colonist.task = "eat";
    colonist.goal = { x: 14, y: 14 };
    return;
  }
  if (colonist.rest < 30) {
    const camp = gameState.structures.find((structure) => structure.type === "camp");
    colonist.task = "rest";
    colonist.goal = camp ? { x: camp.x, y: camp.y } : { x: 14, y: 14 };
    return;
  }
  if (colonist.carry) {
    colonist.task = "haul";
    const dropoff = getDropoffTarget(colonist);
    colonist.goal = { x: dropoff.x, y: dropoff.y };
    return;
  }
  const dismantle = findClosestDismantle(colonist.x, colonist.y);
  if (dismantle) {
    colonist.task = "dismantle";
    colonist.goal = { x: dismantle.x, y: dismantle.y };
    return;
  }
  if (gameState.structures.some((structure) => structure.type === "workshop")) {
    if (gameState.resources.wood >= 5 && gameState.resources.stone >= 3 && gameState.resources.tools < 5) {
      colonist.task = "craft";
      const workshop = gameState.structures.find((structure) => structure.type === "workshop");
      colonist.goal = { x: workshop.x, y: workshop.y };
      return;
    }
  }
  const order = findClosestOrder(colonist.x, colonist.y);
  if (order) {
    colonist.task = "deliver";
    colonist.goal = { x: order.x, y: order.y };
    colonist.carry = { type: "materials", amount: 2 };
    return;
  }
  const targetType = gameState.resources.food < 20 ? "berries" : "tree";
  const node = findClosestNode(targetType, colonist.x, colonist.y);
  if (node) {
    colonist.task = "gather";
    colonist.goal = { x: node.x, y: node.y, nodeId: node.id, type: node.type };
  } else {
    colonist.task = "idle";
    colonist.goal = null;
  }
}

function handleTask(colonist, delta) {
  if (!colonist.goal) return;
  const arrived = moveTowards(colonist, colonist.goal.x, colonist.goal.y);
  if (!arrived) return;

  switch (colonist.task) {
    case "move": {
      colonist.task = "idle";
      colonist.goal = null;
      break;
    }
    case "eat": {
      if (gameState.resources.food > 0) {
        gameState.resources.food -= 1;
        colonist.hunger = Math.min(100, colonist.hunger + 45);
        colonist.mood = Math.min(100, colonist.mood + 5);
      }
      colonist.task = "idle";
      colonist.goal = null;
      break;
    }
    case "rest": {
      colonist.rest = Math.min(100, colonist.rest + 30 * delta);
      if (colonist.rest > 90) {
        colonist.task = "idle";
        colonist.goal = null;
      }
      break;
    }
    case "haul": {
      if (colonist.carry) {
        gameState.resources[colonist.carry.type] += colonist.carry.amount;
        colonist.carry = null;
      }
      colonist.task = "idle";
      colonist.goal = null;
      break;
    }
    case "craft": {
      if (gameState.resources.wood >= 5 && gameState.resources.stone >= 3) {
        gameState.resources.wood -= 5;
        gameState.resources.stone -= 3;
        gameState.resources.tools += 1;
        pushEvent("Созданы инструменты (+1).");
      }
      colonist.task = "idle";
      colonist.goal = null;
      break;
    }
    case "gather": {
      const node = gameState.nodes.find((item) => item.id === colonist.goal.nodeId);
      if (!node || node.amount <= 0) {
        colonist.task = "idle";
        colonist.goal = null;
        break;
      }
      node.amount -= 1;
      const gains = resourceValues[node.type];
      const [type, baseAmount] = Object.entries(gains)[0];
      const amount = Math.max(1, Math.round(baseAmount * colonist.modifiers.workRate));
      colonist.carry = { type, amount };
      colonist.task = "haul";
      const dropoff = getDropoffTarget(colonist);
      colonist.goal = { x: dropoff.x, y: dropoff.y };
      break;
    }
    case "deliver": {
      const order = gameState.buildOrders.find((item) => item.x === colonist.goal.x && item.y === colonist.goal.y);
      if (order && colonist.carry) {
        order.progress += colonist.carry.amount;
        colonist.carry = null;
        if (order.progress >= order.cost) {
          gameState.structures.push({ type: order.type ?? "camp", x: order.x, y: order.y });
          gameState.buildOrders = gameState.buildOrders.filter((item) => item !== order);
          pushEvent("Постройка завершена.");
        }
      }
      colonist.task = "idle";
      colonist.goal = null;
      break;
    }
    case "dismantle": {
      const order = gameState.buildOrders.find((item) => item.x === colonist.goal.x && item.y === colonist.goal.y);
      if (order) {
        order.progress += Math.max(1, Math.round(1 * colonist.modifiers.workRate));
        if (order.progress >= order.cost) {
          const structure = gameState.structures.find(
            (item) => item.x === order.x && item.y === order.y && item.type === order.type
          );
          if (structure) {
            gameState.structures = gameState.structures.filter((item) => item !== structure);
          }
          applyDismantleReturns(order, colonist);
          gameState.buildOrders = gameState.buildOrders.filter((item) => item !== order);
        }
      }
      colonist.task = "idle";
      colonist.goal = null;
      break;
    }
    case "hunt": {
      const animal = gameState.animals.find((item) => item.id === colonist.goal.animalId);
      if (!animal) {
        colonist.task = "idle";
        colonist.goal = null;
        break;
      }
      resolveHunt(colonist, animal);
      colonist.task = "idle";
      colonist.goal = null;
      break;
    }
    default:
      break;
  }
}

function pushEvent(message) {
  gameState.events.unshift({ id: crypto.randomUUID(), message, time: gameState.day });
  if (gameState.events.length > 6) {
    gameState.events.pop();
  }
}

function tickEvents() {
  if (Math.random() < 0.002) {
    const roll = Math.random();
    if (roll < 0.35) {
      gameState.resources.food += 6;
      pushEvent("Торговцы принесли провизию (+6 еды).");
    } else if (roll < 0.7) {
      gameState.colonists.forEach((colonist) => {
        colonist.mood = Math.max(10, colonist.mood - 8);
      });
      pushEvent("Гроза: настроение колонистов упало.");
    } else {
      const stolen = Math.min(6, gameState.resources.wood);
      gameState.resources.wood -= stolen;
      pushEvent(`Налёт: украдено ${stolen} дерева.`);
    }
  }
}

function updateStory() {
  if (!gameState.storyMode) return;
  if (!gameState.story.beaconBuilt) {
    const beacon = gameState.structures.find((structure) => structure.type === "beacon");
    if (beacon) {
      gameState.story.beaconBuilt = true;
      gameState.story.chapter = 3;
      pushEvent("Маяк включён. Сигнал принят. Держитесь ещё 3 дня.");
    }
  }
  if (gameState.story.beaconBuilt) {
    gameState.story.daysAfterBeacon += 1;
    if (gameState.story.daysAfterBeacon >= 3) {
      const path = gameState.storyFlags.path ?? "neutral";
      const ending =
        path === "humanity"
          ? "Спасение гуманистов: союзники откликнулись и колония спасена."
          : path === "military"
            ? "Военный финал: сигнал привлёк конфликт, но колония устояла."
            : "Технократическая изоляция: вы выжили, но без внешнего контакта.";
      pushEvent(ending);
      gameState.paused = true;
    }
  }
}

function updateStructures(delta) {
  for (const structure of gameState.structures) {
    if (structure.disabled) continue;
    if (structure.type === "farm") {
      structure.timer = (structure.timer ?? 0) + delta;
      if (structure.timer >= 20) {
        structure.timer = 0;
        gameState.resources.food += 2;
        pushEvent("Ферма дала урожай (+2 еды).");
      }
    }
    if (structure.type === "well") {
      structure.timer = (structure.timer ?? 0) + delta;
      if (structure.timer >= 18) {
        structure.timer = 0;
        gameState.resources.water += 2;
        pushEvent("Колодец дал воду (+2).");
      }
    }
    if (structure.type === "lumberyard") {
      structure.timer = (structure.timer ?? 0) + delta;
      if (structure.timer >= 22) {
        structure.timer = 0;
        gameState.resources.wood += 3;
        pushEvent("Лесопилка произвела дерево (+3).");
      }
    }
    if (structure.type === "quarry") {
      structure.timer = (structure.timer ?? 0) + delta;
      if (structure.timer >= 26) {
        structure.timer = 0;
        gameState.resources.stone += 3;
        pushEvent("Карьер дал камень (+3).");
      }
    }
  }
}

function updateResources(delta) {
  for (const node of gameState.nodes) {
    if (node.amount > 0) continue;
    const regrowTime = node.type === "berries" ? 20 : 35;
    node.regrow += delta;
    if (node.regrow >= regrowTime) {
      node.amount = 1;
      node.regrow = 0;
    }
  }
}

function updateAnimals(delta) {
  gameState.animalSpawnTimer += delta;
  if (gameState.animalSpawnTimer >= 30) {
    gameState.animalSpawnTimer = 0;
    const foodPressure = gameState.resources.food < 12 ? 0.08 : 0;
    const moodPenalty = getAverageMood() < 45 ? -0.08 : 0;
    const dayBonus = Math.min(0.12, (gameState.day - 1) * 0.02);
    const spawnChance = Math.max(0.15, Math.min(0.75, 0.45 + foodPressure + moodPenalty + dayBonus));
    if (gameState.animals.length < 8 && Math.random() < spawnChance) {
      spawnAnimal();
    }
  }
  gameState.animals = gameState.animals.filter((animal) => {
    animal.ttl -= delta;
    return animal.ttl > 0;
  });
}

function checkRescueEvent() {
  const lowFood = gameState.resources.food <= 4;
  const lowWood = gameState.resources.wood <= 4;
  const lowWater = gameState.resources.water <= 2;
  if ((lowFood || lowWood || lowWater) && gameState.day >= gameState.lastRescueDay + 3) {
    gameState.lastRescueDay = gameState.day;
    gameState.resources.food += 6;
    gameState.resources.wood += 4;
    gameState.resources.water += 3;
    pushEvent("Спасатели оставили припасы. Это ваш шанс восстановиться.");
  }
}

const BUILDING_DEFS = {
  camp: {
    label: "лагерь",
    description: "Базовая точка отдыха и сбора.",
    cost: { wood: 10 },
    work: 6,
    salvage: { wood: 6 }
  },
  stockpile: {
    label: "склад",
    description: "Хранение ресурсов и удобный дроп-офф.",
    cost: { wood: 12 },
    work: 7,
    salvage: { wood: 7 }
  },
  workshop: {
    label: "мастерская",
    description: "Производство инструментов.",
    cost: { wood: 8, stone: 6 },
    work: 8,
    salvage: { wood: 4, stone: 3 }
  },
  farm: {
    label: "ферма",
    description: "Пассивная еда с таймером.",
    cost: { wood: 6, food: 4 },
    work: 6,
    salvage: { wood: 3 }
  },
  well: {
    label: "колодец",
    description: "Пассивная вода.",
    cost: { wood: 8, stone: 4 },
    work: 6,
    salvage: { wood: 3, stone: 2 }
  },
  lumberyard: {
    label: "лесопилка",
    description: "Пассивная древесина.",
    cost: { wood: 10, stone: 4 },
    work: 7,
    salvage: { wood: 5, stone: 2 }
  },
  quarry: {
    label: "карьер",
    description: "Пассивный камень.",
    cost: { wood: 8, stone: 10 },
    work: 8,
    salvage: { wood: 4, stone: 5 }
  },
  beacon: {
    label: "маяк",
    description: "Сюжетное здание для сигнала.",
    cost: { wood: 10, stone: 10, tools: 2 },
    work: 12,
    salvage: { wood: 5, stone: 5 }
  }
};

function getAverageMood() {
  if (gameState.colonists.length === 0) return 50;
  const total = gameState.colonists.reduce((sum, col) => sum + col.mood, 0);
  return total / gameState.colonists.length;
}

function computeDismantleReturn(structure, colonist) {
  const base = BUILDING_DEFS[structure.type]?.salvage ?? {};
  const moodFactor = 0.3 + (getAverageMood() / 100) * 0.4;
  const skillFactor = colonist ? Math.min(1.2, colonist.modifiers.workRate) : 1;
  const toolFactor = 1 + Math.min(0.15, gameState.resources.tools * 0.02);
  const penalty = gameState.dismantleCount >= 2 ? 0.85 : 1;
  const returnRate = Math.min(0.7, Math.max(0.3, moodFactor * skillFactor * toolFactor * penalty));
  const result = {};
  Object.entries(base).forEach(([resource, amount]) => {
    result[resource] = Math.max(0, Math.floor(amount * returnRate));
  });
  return result;
}

function getHuntSupport(animal) {
  return gameState.colonists.filter(
    (col) => Math.abs(col.x - animal.x) + Math.abs(col.y - animal.y) <= 2
  ).length;
}

function applyDismantleReturns(order, colonist) {
  const returns = computeDismantleReturn(order, colonist);
  Object.entries(returns).forEach(([resource, amount]) => {
    gameState.resources[resource] = (gameState.resources[resource] ?? 0) + amount;
  });
  const summary = Object.entries(returns)
    .map(([resource, amount]) => `${resource}+${amount}`)
    .join(", ");
  pushEvent(`Разбор завершён: ${order.label}. Возврат: ${summary || "ничего"}.`);
  gameState.dismantleCount += 1;
  gameState.colonists.forEach((col) => (col.mood = Math.max(10, col.mood - 2)));
  if (Math.random() < 0.15) {
    colonist.rest = Math.max(0, colonist.rest - 10);
    pushEvent("Во время разбора случилась травма. Отдых снизился.");
  }
}

function resolveHunt(colonist, animal) {
  const type = ANIMALS.find((item) => item.id === animal.type);
  if (!type) return;
  const skill = colonist.modifiers.workRate;
  const support = getHuntSupport(animal);
  const toolBonus = Math.min(0.15, gameState.resources.tools * 0.03);
  const supportBonus = Math.min(0.15, (support - 1) * 0.08);
  const preparationPenalty = type.aggressive && support < 2 && gameState.resources.tools < 1 ? 0.12 : 0;
  const successChance = Math.min(
    0.9,
    Math.max(0.2, 0.6 + (skill - 1) * 0.3 - type.danger * 0.2 + toolBonus + supportBonus - preparationPenalty)
  );
  const roll = Math.random();
  if (roll < type.fleeChance) {
    pushEvent(`${animal.name} убежал(а) от ${colonist.name}.`);
    gameState.animals = gameState.animals.filter((item) => item.id !== animal.id);
    return;
  }
  if (roll < successChance) {
    gameState.resources.food += type.food;
    pushEvent(`${colonist.name} добыл(а) ${type.food} еды (${animal.name}).`);
    gameState.animals = gameState.animals.filter((item) => item.id !== animal.id);
    return;
  }
  const counterChance = type.aggressive ? Math.max(0.2, 0.55 - supportBonus - toolBonus) : 0;
  if (type.aggressive && Math.random() < counterChance) {
    colonist.rest = Math.max(0, colonist.rest - 20);
    colonist.mood = Math.max(10, colonist.mood - 8);
    pushEvent(`${animal.name} ранил(а) ${colonist.name}.`);
    if (Math.random() < 0.15) {
      gameState.colonists = gameState.colonists.filter((item) => item.id !== colonist.id);
      pushEvent(`${colonist.name} погиб(ла) на охоте.`);
    }
  } else {
    pushEvent(`${colonist.name} не смог(ла) добыть ${animal.name}.`);
  }
}

function update(delta) {
  if (gameState.paused) return;
  const workBoost = 1 + Math.min(0.25, gameState.resources.tools * 0.02);
  gameState.time += delta * gameState.speed;
  if (gameState.time >= 24) {
    gameState.day += 1;
    gameState.time = 0;
    pushEvent(`Начался день ${gameState.day}.`);
    updateStory();
  }
  tickEvents();
  updateResources(delta);
  updateStructures(delta * workBoost);
  updateAnimals(delta);
  checkRescueEvent();

  for (const colonist of gameState.colonists) {
    updateNeeds(colonist, delta);
    if (colonist.task === "idle") {
      assignTask(colonist);
    }
    handleTask(colonist, delta * workBoost);
  }
}

function drawTile(x, y, color, terrain) {
  const { x: screenX, y: screenY } = gridToScreen(x, y);
  const detail = gameState.map[x][y].detail;
  const shade = Math.floor(16 * detail);
  const tint = `rgba(0, 0, 0, ${0.05 + detail * 0.08})`;
  const variant = Math.floor(detail * 3);
  const base = shadeColor(color, variant === 0 ? 6 : variant === 1 ? -6 : 0);
  ctx.fillStyle = base;
  ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = tint;
  ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = "rgba(12, 18, 28, 0.18)";
  ctx.strokeRect(screenX + 0.5, screenY + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

  if (terrain === "grass") {
    ctx.strokeStyle = "rgba(120, 185, 120, 0.3)";
    ctx.beginPath();
    ctx.moveTo(screenX + 5, screenY + 10);
    ctx.lineTo(screenX + 11, screenY + 6);
    ctx.moveTo(screenX + 18, screenY + 20);
    ctx.lineTo(screenX + 25, screenY + 14);
    ctx.moveTo(screenX + 8, screenY + 22);
    ctx.lineTo(screenX + 12, screenY + 18);
    ctx.stroke();
  }

  if (terrain === "water") {
    const wave = 0.5 + 0.5 * Math.sin((x + y + gameState.time) * 0.6);
    ctx.strokeStyle = `rgba(110, 180, 230, ${0.35 + wave * 0.2})`;
    ctx.beginPath();
    ctx.arc(screenX + 10, screenY + 12, 6, 0, Math.PI * 2);
    ctx.arc(screenX + 22, screenY + 20, 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (terrain === "rock") {
    ctx.fillStyle = `rgba(140, 140, 140, ${0.1 + detail * 0.12})`;
    ctx.fillRect(screenX + 6, screenY + 6, 6 + shade, 4 + shade);
    ctx.strokeStyle = "rgba(220, 230, 240, 0.15)";
    ctx.beginPath();
    ctx.moveTo(screenX + 8, screenY + 18);
    ctx.lineTo(screenX + 18, screenY + 12);
    ctx.stroke();
  }
}

function drawResource(node) {
  const { x: screenX, y: screenY } = gridToScreen(node.x, node.y);
  if (node.type === "tree") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.beginPath();
    ctx.ellipse(screenX + 16, screenY + 24, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = resourcePalette.tree.trunk;
    ctx.fillRect(screenX + 14, screenY + 12, 4, 12);
    ctx.fillStyle = shadeColor(resourcePalette.tree.crown, node.amount > 0 ? 8 : -10);
    ctx.beginPath();
    ctx.arc(screenX + 16, screenY + 10, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.beginPath();
    ctx.arc(screenX + 12, screenY + 6, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (node.type === "berries") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.beginPath();
    ctx.ellipse(screenX + 16, screenY + 24, 9, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = resourcePalette.berries.bush;
    ctx.beginPath();
    ctx.arc(screenX + 16, screenY + 18, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = resourcePalette.berries.berry;
    ctx.beginPath();
    ctx.arc(screenX + 12, screenY + 14, 2, 0, Math.PI * 2);
    ctx.arc(screenX + 20, screenY + 20, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (node.type === "rock") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.ellipse(screenX + 16, screenY + 23, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = resourcePalette.rock.base;
    ctx.beginPath();
    ctx.moveTo(screenX + 8, screenY + 22);
    ctx.lineTo(screenX + 20, screenY + 22);
    ctx.lineTo(screenX + 26, screenY + 14);
    ctx.lineTo(screenX + 14, screenY + 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = resourcePalette.rock.highlight;
    ctx.fillRect(screenX + 16, screenY + 14, 6, 4);
  }
}

function drawAnimal(animal) {
  const { x: screenX, y: screenY } = gridToScreen(animal.x, animal.y);
  const wobble = Math.sin((animal.x + animal.y + gameState.time) * 0.8) * 0.6;
  const isAggressive = animal.type === "boar";
  const color = isAggressive ? "#b5563a" : animal.type === "deer" ? "#c7a172" : "#cbd7ea";
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(screenX + 16, screenY + 23, isAggressive ? 8 : 7, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  if (isAggressive) {
    ctx.moveTo(screenX + 10, screenY + 10 + wobble);
    ctx.lineTo(screenX + 22, screenY + 8 + wobble);
    ctx.lineTo(screenX + 26, screenY + 18 + wobble);
    ctx.lineTo(screenX + 12, screenY + 20 + wobble);
    ctx.closePath();
  } else {
    ctx.arc(screenX + 16, screenY + 15 + wobble, 6, 0, Math.PI * 2);
  }
  ctx.fill();
  if (isAggressive) {
    ctx.strokeStyle = "rgba(255, 220, 200, 0.8)";
    ctx.beginPath();
    ctx.moveTo(screenX + 12, screenY + 14 + wobble);
    ctx.lineTo(screenX + 8, screenY + 18 + wobble);
    ctx.moveTo(screenX + 20, screenY + 14 + wobble);
    ctx.lineTo(screenX + 24, screenY + 18 + wobble);
    ctx.stroke();
  }
}

function drawStructure(structure) {
  const { x: screenX, y: screenY } = gridToScreen(structure.x, structure.y);
  const palette = {
    camp: "#d1a94b",
    stockpile: "#88b2b8",
    workshop: "#c96f5a",
    farm: "#6fbf73",
    well: "#5fa7c9",
    lumberyard: "#8b6b4a",
    quarry: "#707070",
    watch: "#8a7bd1",
    beacon: "#f0b35d"
  };
  const base = palette[structure.type] ?? "#d1a94b";
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(screenX + 16, screenY + 24, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = base;
  ctx.fillRect(screenX + 5, screenY + 8, TILE_SIZE - 10, TILE_SIZE - 12);

  ctx.fillStyle = "rgba(10, 14, 20, 0.22)";
  ctx.fillRect(screenX + 7, screenY + 20, TILE_SIZE - 14, 4);
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(screenX + 6, screenY + 10, TILE_SIZE - 12, 3);

  if (structure.type === "camp") {
    ctx.fillStyle = "#f2f1e6";
    ctx.beginPath();
    ctx.moveTo(screenX + 16, screenY + 6);
    ctx.lineTo(screenX + 26, screenY + 16);
    ctx.lineTo(screenX + 6, screenY + 16);
    ctx.closePath();
    ctx.fill();
  }
  if (structure.type === "farm") {
    ctx.strokeStyle = "rgba(90, 140, 90, 0.8)";
    ctx.beginPath();
    ctx.moveTo(screenX + 8, screenY + 12);
    ctx.lineTo(screenX + 24, screenY + 12);
    ctx.moveTo(screenX + 8, screenY + 18);
    ctx.lineTo(screenX + 24, screenY + 18);
    ctx.stroke();
    ctx.fillStyle = "rgba(110, 180, 120, 0.4)";
    ctx.fillRect(screenX + 8, screenY + 13, 16, 2);
  }
  if (structure.type === "well") {
    ctx.strokeStyle = "rgba(210, 230, 245, 0.8)";
    ctx.beginPath();
    ctx.arc(screenX + 16, screenY + 16, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(80, 160, 200, 0.4)";
    ctx.beginPath();
    ctx.arc(screenX + 16, screenY + 16, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (structure.type === "beacon") {
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(screenX + 14, screenY + 6, 4, 14);
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(screenX + 16, screenY + 6, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (structure.type === "lumberyard") {
    ctx.strokeStyle = "rgba(130, 90, 60, 0.8)";
    ctx.beginPath();
    ctx.moveTo(screenX + 8, screenY + 22);
    ctx.lineTo(screenX + 24, screenY + 22);
    ctx.stroke();
  }
  if (structure.type === "quarry") {
    ctx.strokeStyle = "rgba(170, 170, 170, 0.8)";
    ctx.beginPath();
    ctx.moveTo(screenX + 10, screenY + 12);
    ctx.lineTo(screenX + 22, screenY + 20);
    ctx.stroke();
  }
}

function drawColonist(colonist) {
  const { x: screenX, y: screenY } = gridToScreen(colonist.x, colonist.y);
  const isInjured = colonist.rest < 20 || colonist.hunger < 15;
  const isResting = colonist.task === "rest";
  const isWorking = ["gather", "deliver", "build", "craft", "hunt", "dismantle"].includes(colonist.task);
  const stateColor = isInjured ? "#f87171" : isResting ? "#60a5fa" : isWorking ? "#34d399" : "#fbbf24";
  const bob = Math.sin((gameState.time * 2 + colonist.x + colonist.y) * 0.8) * 1.2;
  const yOffset = isResting ? 2 : bob;
  if (colonist.id === gameState.selectedColonistId) {
    ctx.strokeStyle = "#f2c14e";
    ctx.lineWidth = 2;
    ctx.strokeRect(screenX + 1, screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.ellipse(screenX + 16, screenY + 25, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#24324b";
  ctx.beginPath();
  ctx.roundRect(screenX + 9, screenY + 15 + yOffset, 14, 12, 3);
  ctx.fill();

  ctx.fillStyle = "#f6d3b3";
  ctx.beginPath();
  ctx.arc(screenX + 16, screenY + 11 + yOffset, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = stateColor;
  ctx.beginPath();
  ctx.moveTo(screenX + 9, screenY + 19 + yOffset);
  ctx.lineTo(screenX + 23, screenY + 19 + yOffset);
  ctx.lineTo(screenX + 24, screenY + 27 + yOffset);
  ctx.lineTo(screenX + 8, screenY + 27 + yOffset);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#1c1f2a";
  ctx.font = "10px Segoe UI";
  ctx.fillText(colonist.name, screenX - 2, screenY - 2);
}

function drawOrders() {
  for (const order of gameState.buildOrders) {
    const { x: screenX, y: screenY } = gridToScreen(order.x, order.y);
    const pulse = 0.5 + 0.5 * Math.sin((gameState.time + order.x + order.y) * 0.8);
    ctx.strokeStyle = `rgba(95, 225, 255, ${0.4 + pulse * 0.4})`;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(screenX + 3, screenY + 3, TILE_SIZE - 6, TILE_SIZE - 6);
    ctx.setLineDash([]);
  }
}

function render() {
  ctx.clearRect(0, 0, camera.viewWidth, camera.viewHeight);
  if (!gameState.started) {
    ctx.fillStyle = "#0b1018";
    ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);
    return;
  }
  ctx.save();
  ctx.translate(camera.offsetX, camera.offsetY);
  ctx.scale(gameState.zoom, gameState.zoom);
  for (let x = 0; x < MAP_SIZE; x += 1) {
    for (let y = 0; y < MAP_SIZE; y += 1) {
      const tile = gameState.map[x][y];
      drawTile(x, y, terrainPalette[tile.terrain], tile.terrain);
    }
  }

  for (const node of gameState.nodes) {
    if (node.amount > 0) drawResource(node);
  }
  for (const animal of gameState.animals) {
    drawAnimal(animal);
  }
  for (const structure of gameState.structures) {
    drawStructure(structure);
  }
  drawOrders();
  for (const colonist of gameState.colonists) {
    drawColonist(colonist);
  }
  ctx.restore();
}

function updateHud() {
  hud.innerHTML = `День ${gameState.day} · ${gameState.time.toFixed(1)}ч · Поселение: ${gameState.colonists.length}`;
  resourcesList.innerHTML = Object.entries(gameState.resources)
    .map(([key, value]) => `<li>${key}: ${value}</li>`)
    .join("");
  colonistsList.innerHTML = gameState.colonists
    .map(
      (colonist) =>
        `<li>${colonist.name} (${colonist.role}) — ${colonist.task} · голод ${colonist.hunger.toFixed(0)} · отдых ${colonist.rest.toFixed(0)} · настроение ${colonist.mood.toFixed(0)}</li>`
    )
    .join("");
  eventsList.innerHTML = gameState.events.map((event) => `<li>${event.message}</li>`).join("");
}

function init() {
  gameState.map = createMap();
  gameState.nodes = createResources();
  gameState.animals = createAnimals();
  gameState.colonists = createColonists();
  gameState.structures = [{ type: "camp", x: 14, y: 14 }];
  gameState.buildOrders = [];
  gameState.events = [];
  gameState.resources = { food: 16, wood: 20, stone: 6, tools: 0, water: 8 };
  gameState.time = 0;
  gameState.day = 1;
  gameState.selectedColonistId = null;
  gameState.story = { chapter: 1, beaconBuilt: false, daysAfterBeacon: 0 };
  gameState.storyFlags = {
    path: null,
    archiveExposed: false,
    caravanRobbed: false,
    toxinUsed: false,
    survivorsAccepted: false,
    swampHint: false,
    wastelandHint: false,
    mountainHint: false
  };
  gameState.started = true;
  pushEvent("Колония высадилась. Удачи!");
  updateTasks();
}

function getMousePosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function selectColonistAt(tile) {
  const colonist = gameState.colonists.find((unit) => unit.x === tile.x && unit.y === tile.y);
  if (colonist) {
    gameState.selectedColonistId = colonist.id;
    gameState.selectedObject = { type: "colonist", data: colonist };
    return true;
  }
  return false;
}

function selectAnimalAt(tile) {
  const animal = gameState.animals.find((item) => item.x === tile.x && item.y === tile.y);
  if (animal) {
    gameState.selectedObject = { type: "animal", data: animal };
    return true;
  }
  return false;
}

function selectResourceAt(tile) {
  const node = gameState.nodes.find((item) => item.x === tile.x && item.y === tile.y && item.amount > 0);
  if (node) {
    gameState.selectedObject = { type: "resource", data: node };
    return true;
  }
  return false;
}

function selectStructureAt(tile) {
  const structure = gameState.structures.find((item) => item.x === tile.x && item.y === tile.y);
  if (structure) {
    gameState.selectedObject = { type: "structure", data: structure };
    return true;
  }
  return false;
}

function handleBuildClick(tile) {
  if (gameState.buildMode === "dismantle") {
    const structure = gameState.structures.find((item) => item.x === tile.x && item.y === tile.y);
    if (!structure) {
      pushEvent("Здесь нечего разбирать.");
      return;
    }
    if (structure.type === "camp") {
      const camps = gameState.structures.filter((item) => item.type === "camp").length;
      if (camps <= 1) {
        pushEvent("Нельзя разобрать последний лагерь.");
        return;
      }
    }
    const order = gameState.buildOrders.find((item) => item.x === structure.x && item.y === structure.y);
    if (order) {
      pushEvent("Эта постройка уже в работе.");
      return;
    }
    const predicted = computeDismantleReturn(structure, null);
    const summary = Object.entries(predicted)
      .map(([resource, amount]) => `${resource}+${amount}`)
      .join(", ");
    dismantleBody.textContent = `Разобрать "${BUILDING_DEFS[structure.type]?.label ?? structure.type}"? Возврат: ${
      summary || "ничего"
    }.`;
    gameState.pendingDismantle = structure;
    dismantleModal.classList.add("show");
    return;
  }
  if (!canBuild(tile.x, tile.y)) {
    if (gameState.buildMode === "dismantle") {
      const structure = gameState.structures.find((item) => item.x === tile.x && item.y === tile.y);
      if (!structure) {
        pushEvent("Здесь нечего разбирать.");
        return;
      }
    }
    pushEvent("Тут нельзя строить.");
    return;
  }
  if (gameState.buildMode === "dismantle") {
    pushEvent("Выберите постройку для разбора.");
    return;
  }
  const definition = BUILDING_DEFS[gameState.selectedBuild];
  if (!definition) return;
  for (const [resource, amount] of Object.entries(definition.cost)) {
    if (gameState.resources[resource] < amount) {
      pushEvent(`Недостаточно ${resource} для постройки.`);
      return;
    }
  }
  for (const [resource, amount] of Object.entries(definition.cost)) {
    gameState.resources[resource] -= amount;
  }
  gameState.buildOrders.push({
    x: tile.x,
    y: tile.y,
    cost: definition.work,
    progress: 0,
    type: gameState.selectedBuild
  });
  pushEvent(`Создан заказ на ${definition.label}.`);
}

function handleCommandClick(tile) {
  const colonist = gameState.colonists.find((unit) => unit.id === gameState.selectedColonistId);
  if (!colonist) {
    pushEvent("Сначала выбери колониста.");
    return;
  }
  if (gameState.commandMode === "idle") {
    colonist.task = "idle";
    colonist.goal = null;
    return;
  }
  if (gameState.commandMode === "move") {
    colonist.task = "move";
    colonist.goal = { x: tile.x, y: tile.y };
    return;
  }
  if (gameState.commandMode === "gather") {
    const node = gameState.nodes.find((item) => item.x === tile.x && item.y === tile.y && item.amount > 0);
    if (!node) {
      pushEvent("Здесь нет ресурса.");
      return;
    }
    colonist.task = "gather";
    colonist.goal = { x: node.x, y: node.y, nodeId: node.id, type: node.type };
    return;
  }
  if (gameState.commandMode === "build") {
    const order = gameState.buildOrders.find((item) => item.x === tile.x && item.y === tile.y);
    if (order) {
      colonist.task = "deliver";
      colonist.goal = { x: order.x, y: order.y };
      colonist.carry = { type: "materials", amount: 2 };
      return;
    }
    pushEvent("Нет активной стройки здесь.");
  }
  if (gameState.commandMode === "hunt") {
    const animal = gameState.animals.find((item) => item.x === tile.x && item.y === tile.y);
    if (!animal) {
      pushEvent("Здесь нет животного.");
      return;
    }
    colonist.task = "hunt";
    colonist.goal = { x: animal.x, y: animal.y, animalId: animal.id };
  }
}

canvas.addEventListener("click", (event) => {
  if (panMoved) return;
  const position = getMousePosition(event);
  const tile = screenToGrid(position.x, position.y);
  if (tile.x < 0 || tile.y < 0 || tile.x >= MAP_SIZE || tile.y >= MAP_SIZE) return;
  if (selectColonistAt(tile)) return;
  if (gameState.selectedTab === "units" && gameState.selectedColonistId && gameState.commandMode !== "idle") {
    handleCommandClick(tile);
    return;
  }
  if (gameState.selectedTab === "build") {
    handleBuildClick(tile);
    return;
  }
  if (selectAnimalAt(tile)) {
    return;
  }
  if (selectResourceAt(tile)) {
    return;
  }
  if (selectStructureAt(tile)) {
    return;
  }
  if (gameState.selectedTab === "units") {
    handleCommandClick(tile);
    return;
  }
  if (gameState.selectedColonistId) {
    gameState.commandMode = "move";
    handleCommandClick(tile);
    return;
  }
  pushEvent("Выбери вкладку «Постройки» или «Колонисты» для действий.");
});

speedButton.addEventListener("click", () => {
  const next = gameState.speed === 1 ? 2 : gameState.speed === 2 ? 4 : 1;
  gameState.speed = next;
  speedButton.textContent = `Скорость: x${next}`;
});

togglePauseButton.addEventListener("click", () => {
  gameState.paused = !gameState.paused;
  togglePauseButton.textContent = gameState.paused ? "Продолжить" : "Пауза";
});

zoomOutButton.addEventListener("click", () => {
  gameState.zoom = Math.max(MIN_ZOOM, gameState.zoom - 0.1);
  updateCamera();
  updateZoomLabel();
});

zoomInButton.addEventListener("click", () => {
  gameState.zoom = Math.min(MAX_ZOOM, gameState.zoom + 0.1);
  updateCamera();
  updateZoomLabel();
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const delta = event.deltaY > 0 ? -0.1 : 0.1;
  gameState.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, gameState.zoom + delta));
  updateCamera();
  updateZoomLabel();
});

const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel-section[data-panel]");
const buildOptions = document.querySelectorAll(".build-option");
const tasksList = document.getElementById("tasks");
const ordersList = document.getElementById("orders");
const commandOptions = document.querySelectorAll(".command-option");
const selectedUnitLabel = document.getElementById("selected-unit");

function setTab(nextTab) {
  gameState.selectedTab = nextTab;
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === nextTab);
    tab.setAttribute("aria-selected", tab.dataset.tab === nextTab ? "true" : "false");
  });
  panels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.panel !== nextTab);
  });
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setTab(tab.dataset.tab));
});

buildOptions.forEach((option) => {
  option.addEventListener("click", () => {
    buildOptions.forEach((btn) => btn.classList.remove("active"));
    option.classList.add("active");
    gameState.selectedBuild = option.dataset.build;
  });
});

commandOptions.forEach((option) => {
  option.addEventListener("click", () => {
    commandOptions.forEach((btn) => btn.classList.remove("active"));
    option.classList.add("active");
    gameState.commandMode = option.dataset.command;
  });
});

function updateTasks() {
  const tasks = [
    {
      title: "Закрепиться",
      items: [
        "Поставь лагерь через вкладку «Постройки».",
        "Собери 20 дерева и 20 еды."
      ]
    },
    {
      title: "Стабилизировать быт",
      items: [
        "Следи, чтобы голод и отдых не падали ниже 30.",
        "Построй склад и ферму для стабильности.",
        "Построй лесопилку или карьер для пассивной добычи.",
        "Открой новые биомы через экспедиции."
      ]
    },
    {
      title: "Инструменты и ремесло",
      items: [
        "Построй мастерскую.",
        "Создай хотя бы 2 инструмента."
      ]
    },
    {
      title: "Сюжетная цель",
      items: gameState.storyMode
        ? [
            "Построй маяк для сигнала.",
            "Продержись 3 дня после сигнала."
          ]
        : ["Свободная игра: развивай колонию как хочешь."]
    }
  ];
  tasksList.innerHTML = tasks
    .map(
      (task) =>
        `<li><strong>${task.title}</strong><ul>${task.items.map((item) => `<li>${item}</li>`).join("")}</ul></li>`
    )
    .join("");
}

function getBiomeById(id) {
  return BIOMES.find((biome) => biome.id === id);
}

function isBiomeUnlocked(biome) {
  if (!biome.unlockFlag) return true;
  return gameState.storyFlags[biome.unlockFlag];
}

function renderBiomes() {
  biomeList.innerHTML = BIOMES.map((biome) => {
    const unlocked = isBiomeUnlocked(biome);
    const active = gameState.exploration.selectedBiome === biome.id;
    const classes = ["biome-item"];
    if (!unlocked) classes.push("locked");
    if (active) classes.push("active");
    return `<div class="${classes.join(" ")}" data-biome="${biome.id}">
      <span>${biome.name}</span>
      <small>${unlocked ? "доступен" : "закрыт"}</small>
    </div>`;
  }).join("");

  biomeList.querySelectorAll(".biome-item").forEach((item) => {
    item.addEventListener("click", () => {
      const biome = getBiomeById(item.dataset.biome);
      if (!biome || !isBiomeUnlocked(biome)) return;
      gameState.exploration.selectedBiome = biome.id;
      renderBiomes();
      updateBiomeRisk();
    });
  });
}

function updateBiomeRisk() {
  const biome = getBiomeById(gameState.exploration.selectedBiome);
  if (!biome) {
    biomeRisk.textContent = "Риск: —";
    return;
  }
  const prep = gameState.exploration.packs;
  const prepScore = (prep.food + prep.water + prep.tools * 2) / 10;
  const risk = Math.max(0.1, biome.risk - prepScore * 0.2);
  const label = risk < 0.25 ? "низкий" : risk < 0.45 ? "средний" : "высокий";
  biomeRisk.textContent = `Риск: ${label}`;
}

function updateExpeditionPrepUI() {
  teamSizeLabel.textContent = String(gameState.exploration.team);
  foodPackLabel.textContent = String(gameState.exploration.packs.food);
  waterPackLabel.textContent = String(gameState.exploration.packs.water);
  toolsPackLabel.textContent = String(gameState.exploration.packs.tools);
  updateBiomeRisk();
}

function logExpedition(message) {
  gameState.exploration.log.unshift(message);
  if (gameState.exploration.log.length > 6) {
    gameState.exploration.log.pop();
  }
  expeditionLog.innerHTML = gameState.exploration.log.map((entry) => `<li>${entry}</li>`).join("");
}

function triggerChoice(choice) {
  gameState.choice = choice;
  choiceTitle.textContent = choice.title;
  choiceBody.textContent = choice.body;
  choiceAButton.textContent = choice.options[0].label;
  choiceBButton.textContent = choice.options[1].label;
  choiceModal.classList.add("show");
  gameState.paused = true;
  togglePauseButton.textContent = "Продолжить";
}

function resolveChoice(index) {
  if (!gameState.choice) return;
  const option = gameState.choice.options[index];
  if (option?.apply) option.apply();
  gameState.choice = null;
  choiceModal.classList.remove("show");
  gameState.paused = false;
  togglePauseButton.textContent = "Пауза";
}

function maybeTriggerStoryChoice(biomeId) {
  if (biomeId === "ruins" && !gameState.storyFlags.archiveExposed) {
    triggerChoice({
      title: "Архив катастрофы",
      body: "Нашли архив. Раскрыть правду колонистам или скрыть?",
      options: [
        {
          label: "Раскрыть правду",
          apply: () => {
            gameState.storyFlags.archiveExposed = true;
            gameState.storyFlags.path = gameState.storyFlags.path ?? "humanity";
            pushEvent("Правда раскрыта. Мораль выросла, но страх остался.");
            gameState.colonists.forEach((col) => (col.mood = Math.min(100, col.mood + 5)));
          }
        },
        {
          label: "Скрыть архив",
          apply: () => {
            gameState.storyFlags.archiveExposed = true;
            gameState.storyFlags.path = gameState.storyFlags.path ?? "tech";
            pushEvent("Архив скрыт. Порядок сохранён, доверие упало.");
            gameState.colonists.forEach((col) => (col.mood = Math.max(10, col.mood - 6)));
          }
        }
      ]
    });
  }
  if (biomeId === "wasteland" && !gameState.storyFlags.caravanRobbed) {
    triggerChoice({
      title: "Караван в пустоши",
      body: "Обнаружен караван. Торговать или ограбить?",
      options: [
        {
          label: "Торговать",
          apply: () => {
            gameState.storyFlags.caravanRobbed = true;
            gameState.storyFlags.path = gameState.storyFlags.path ?? "humanity";
            gameState.resources.food += 4;
            gameState.resources.tools += 1;
            pushEvent("Обмен успешен. Репутация растёт.");
          }
        },
        {
          label: "Ограбить",
          apply: () => {
            gameState.storyFlags.caravanRobbed = true;
            gameState.storyFlags.path = gameState.storyFlags.path ?? "military";
            gameState.resources.food += 6;
            gameState.resources.stone += 4;
            pushEvent("Караван ограблен. Слухи могут вернуться.");
          }
        }
      ]
    });
  }
  if (biomeId === "swamp" && !gameState.storyFlags.toxinUsed) {
    triggerChoice({
      title: "Болотные токсины",
      body: "Есть шанс использовать токсины для обороны. Очистить или применить?",
      options: [
        {
          label: "Очистить",
          apply: () => {
            gameState.storyFlags.toxinUsed = true;
            gameState.storyFlags.path = gameState.storyFlags.path ?? "humanity";
            gameState.resources.water += 3;
            pushEvent("Токсины очищены. Воды стало больше.");
          }
        },
        {
          label: "Использовать",
          apply: () => {
            gameState.storyFlags.toxinUsed = true;
            gameState.storyFlags.path = gameState.storyFlags.path ?? "military";
            gameState.resources.tools += 1;
            pushEvent("Токсины использованы. Оборона усилена, но риск растёт.");
          }
        }
      ]
    });
  }
  if (biomeId === "mountains" && !gameState.storyFlags.survivorsAccepted) {
    triggerChoice({
      title: "Выжившие в горах",
      body: "Обнаружена группа выживших. Принять или отказать?",
      options: [
        {
          label: "Принять",
          apply: () => {
            gameState.storyFlags.survivorsAccepted = true;
            gameState.storyFlags.path = gameState.storyFlags.path ?? "humanity";
            pushEvent("Выжившие приняты. Потребление ресурсов увеличится.");
            gameState.resources.food = Math.max(0, gameState.resources.food - 4);
          }
        },
        {
          label: "Отказать",
          apply: () => {
            gameState.storyFlags.survivorsAccepted = true;
            gameState.storyFlags.path = gameState.storyFlags.path ?? "tech";
            pushEvent("Вы отказали. Колония сохранила ресурсы, но мораль упала.");
            gameState.colonists.forEach((col) => (col.mood = Math.max(10, col.mood - 5)));
          }
        }
      ]
    });
  }
}

function resolveExpedition() {
  const biome = getBiomeById(gameState.exploration.selectedBiome);
  if (!biome) return;
  const { team, packs } = gameState.exploration;
  if (team < 1 || team > 3) return;
  if (
    gameState.resources.food < packs.food ||
    gameState.resources.water < packs.water ||
    gameState.resources.tools < packs.tools
  ) {
    pushEvent("Недостаточно ресурсов для экспедиции.");
    return;
  }
  if (gameState.colonists.length < team) {
    pushEvent("Недостаточно колонистов.");
    return;
  }
  gameState.resources.food -= packs.food;
  gameState.resources.water -= packs.water;
  gameState.resources.tools -= packs.tools;

  const prepScore = (packs.food + packs.water + packs.tools * 2 + team) / 10;
  const successChance = Math.min(0.85, Math.max(0.2, 0.6 - biome.risk + prepScore * 0.2));
  const roll = Math.random();
  const outcome = roll < successChance ? "success" : roll < successChance + 0.2 ? "partial" : "fail";

  const loot = {};
  const addLoot = (type, min, max) => {
    const amount = Math.floor(min + Math.random() * (max - min + 1));
    loot[type] = (loot[type] ?? 0) + amount;
  };

  if (outcome !== "fail") {
    if (biome.resources.wood) addLoot("wood", ...biome.resources.wood);
    if (biome.resources.food) addLoot("food", ...biome.resources.food);
    if (biome.resources.stone) addLoot("stone", ...biome.resources.stone);
    if (biome.resources.water) addLoot("water", ...biome.resources.water);
  }

  if (outcome === "success" && Math.random() < 0.25) {
    addLoot("tools", 1, 2);
    logExpedition(`Редкая находка: ${biome.rare[Math.floor(Math.random() * biome.rare.length)]}.`);
  }

  if (Math.random() < 0.35) {
    logExpedition(`Скрытое событие: ${biome.hidden[Math.floor(Math.random() * biome.hidden.length)]}.`);
  }

  if (outcome === "partial") {
    gameState.colonists.slice(0, team).forEach((col) => {
      col.mood = Math.max(10, col.mood - 4);
      col.rest = Math.max(0, col.rest - 10);
    });
  }
  if (outcome === "fail") {
    gameState.colonists.slice(0, team).forEach((col) => {
      col.mood = Math.max(10, col.mood - 8);
      col.rest = Math.max(0, col.rest - 20);
    });
  }

  Object.entries(loot).forEach(([resource, amount]) => {
    gameState.resources[resource] = (gameState.resources[resource] ?? 0) + amount;
  });

  logExpedition(
    `Экспедиция в ${biome.name}: ${outcome === "success" ? "успех" : outcome === "partial" ? "частично" : "провал"}.`
  );

  const lootSummary = Object.entries(loot)
    .map(([resource, amount]) => `${resource}+${amount}`)
    .join(", ");
  if (lootSummary) {
    pushEvent(`Экспедиция: ${biome.name}, добыча: ${lootSummary}.`);
  } else {
    pushEvent(`Экспедиция: ${biome.name}, добычи нет, но последствия остаются.`);
  }

  if (!gameState.storyFlags.swampHint && biome.id === "forest") {
    gameState.storyFlags.swampHint = true;
    logExpedition("Открыт биом: Болото.");
  }
  if (!gameState.storyFlags.wastelandHint && biome.id === "ruins") {
    gameState.storyFlags.wastelandHint = true;
    logExpedition("Открыт биом: Пустошь.");
  }
  if (!gameState.storyFlags.mountainHint && biome.id === "wasteland") {
    gameState.storyFlags.mountainHint = true;
    logExpedition("Открыт биом: Горы.");
  }

  renderBiomes();
  updateBiomeRisk();
  maybeTriggerStoryChoice(biome.id);
}

function updateOrders() {
  ordersList.innerHTML = gameState.buildOrders
    .map((order) => `<li>${order.type ?? "постройка"}: ${order.progress}/${order.cost}</li>`)
    .join("");
}

function updateSelectedUnit() {
  const unit = gameState.colonists.find((col) => col.id === gameState.selectedColonistId);
  if (!unit) {
    selectedUnitLabel.textContent = "Никто не выбран.";
    return;
  }
  selectedUnitLabel.textContent = `${unit.name}: ${unit.task} · голод ${unit.hunger.toFixed(0)} · отдых ${unit.rest.toFixed(0)}`;
}

function updateInfoPanel() {
  if (!gameState.selectedObject) {
    infoPanel.innerHTML = `<p class="muted">Выберите объект, чтобы увидеть детали.</p>`;
    return;
  }
  const { type, data } = gameState.selectedObject;
  if (type === "colonist") {
    infoPanel.innerHTML = `<h4>${data.name}</h4>
      <p>Пешка · ${data.role}</p>
      <p class="muted">Колонист, выполняющий задания.</p>
      <ul>
        <li>Голод: ${data.hunger.toFixed(0)}</li>
        <li>Отдых: ${data.rest.toFixed(0)}</li>
        <li>Настроение: ${data.mood.toFixed(0)}</li>
      </ul>`;
  } else if (type === "animal") {
    const animal = ANIMALS.find((item) => item.id === data.type);
    infoPanel.innerHTML = `<h4>${data.name}</h4>
      <p>Животное · ${animal?.behavior ?? "неизвестно"}</p>
      <p class="muted">${animal?.description ?? "Нет данных."}</p>
      <ul>
        <li>Еда: ${animal?.food ?? "?"}</li>
        <li>Опасность: ${animal?.danger ?? "?"}</li>
        <li>Побег: ${animal?.fleeChance ?? "?"}</li>
      </ul>`;
  } else if (type === "resource") {
    const resource = RESOURCE_DEFS[data.type];
    infoPanel.innerHTML = `<h4>${resource?.name ?? data.type}</h4>
      <p>Ресурсный узел</p>
      <p class="muted">${resource?.description ?? "Нет данных."}</p>
      <ul>
        <li>Остаток: ${data.amount}</li>
        <li>Восстановление: ${data.regrow.toFixed(1)}</li>
        <li>Добыча: ${resource?.yields ?? "?"}</li>
      </ul>`;
  } else if (type === "structure") {
    const def = BUILDING_DEFS[data.type];
    infoPanel.innerHTML = `<h4>${def?.label ?? data.type}</h4>
      <p>Постройка</p>
      <p class="muted">${def?.description ?? "Нет данных."}</p>
      <ul>
        <li>Состояние: ${data.disabled ? "разбирается" : "активна"}</li>
      </ul>`;
  }
}

function updateZoomLabel() {
  zoomLevelLabel.textContent = `${Math.round(gameState.zoom * 100)}%`;
}

function setupTutorial() {
  tutorialModal.classList.add("show");
  startNewButton.addEventListener("click", () => {
    tutorialModal.classList.remove("show");
    init();
  });
  continueButton.addEventListener("click", () => {
    tutorialModal.classList.remove("show");
  });
}

function renderColonistSelection() {
  colonistGrid.innerHTML = colonistRoster
    .map(
      (colonist) =>
        `<div class="colonist-card" data-id="${colonist.id}">
          <strong>${colonist.name}</strong>
          <ul class="colonist-traits">
            ${colonist.traits.map((trait) => `<li>${trait}</li>`).join("")}
          </ul>
        </div>`
    )
    .join("");
  const cards = colonistGrid.querySelectorAll(".colonist-card");
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.id;
      const selected = gameState.selectedColonists.find((item) => item.id === id);
      if (selected) {
        gameState.selectedColonists = gameState.selectedColonists.filter((item) => item.id !== id);
        card.classList.remove("active");
        return;
      }
      if (gameState.selectedColonists.length >= 3) return;
      const data = colonistRoster.find((item) => item.id === id);
      if (data) {
        gameState.selectedColonists.push(data);
        card.classList.add("active");
      }
    });
  });
}

function startGame(storyMode) {
  gameState.storyMode = storyMode;
  if (gameState.selectedColonists.length !== 3) {
    gameState.selectedColonists = colonistRoster.slice(0, 3);
  }
  setupModal.classList.remove("show");
  init();
  renderBiomes();
  updateExpeditionPrepUI();
}

window.addEventListener("resize", resizeCanvas);
let isPanning = false;
let lastPan = { x: 0, y: 0 };
let spaceDown = false;
let panMoved = false;

document.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    spaceDown = true;
    gameState.paused = !gameState.paused;
    togglePauseButton.textContent = gameState.paused ? "Продолжить" : "Пауза";
  }
});

document.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    spaceDown = false;
  }
});

canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("mousedown", (event) => {
  if (event.button === 2 || event.button === 1) {
    isPanning = true;
    panMoved = false;
    lastPan = { x: event.clientX, y: event.clientY };
  }
});

window.addEventListener("mouseup", () => {
  isPanning = false;
  if (panMoved) {
    panMoved = false;
  }
});

window.addEventListener("mousemove", (event) => {
  if (!isPanning) return;
  const dx = (event.clientX - lastPan.x) / gameState.zoom;
  const dy = (event.clientY - lastPan.y) / gameState.zoom;
  lastPan = { x: event.clientX, y: event.clientY };
  gameState.pan.x += dx;
  gameState.pan.y += dy;
  panMoved = true;
  updateCamera();
});

choiceAButton.addEventListener("click", () => resolveChoice(0));
choiceBButton.addEventListener("click", () => resolveChoice(1));
dismantleCancel.addEventListener("click", () => {
  dismantleModal.classList.remove("show");
  gameState.pendingDismantle = null;
});
dismantleConfirm.addEventListener("click", () => {
  const structure = gameState.pendingDismantle;
  if (!structure) return;
  structure.disabled = true;
  const def = BUILDING_DEFS[structure.type];
  gameState.buildOrders.push({
    x: structure.x,
    y: structure.y,
    cost: Math.max(4, def?.work ?? 6),
    progress: 0,
    type: structure.type,
    label: def?.label ?? structure.type,
    mode: "dismantle"
  });
  dismantleModal.classList.remove("show");
  gameState.pendingDismantle = null;
  pushEvent(`Создан заказ на разбор: ${def?.label ?? structure.type}.`);
});

toggleDismantleButton.addEventListener("click", () => {
  gameState.buildMode = gameState.buildMode === "build" ? "dismantle" : "build";
  toggleDismantleButton.textContent =
    gameState.buildMode === "build" ? "Режим: строительство" : "Режим: разбор";
});

document.querySelectorAll("[data-step]").forEach((button) => {
  button.addEventListener("click", () => {
    const step = button.dataset.step;
    const dir = Number(button.dataset.dir);
    if (step === "team") {
      gameState.exploration.team = Math.min(3, Math.max(1, gameState.exploration.team + dir));
    } else {
      const value = gameState.exploration.packs[step];
      gameState.exploration.packs[step] = Math.max(0, value + dir);
    }
    updateExpeditionPrepUI();
  });
});

sendExpeditionButton.addEventListener("click", () => resolveExpedition());

function renderLoop() {
  if (gameState.started) {
    update(1 / TICK_RATE);
  }
  render();
  updateHud();
  updateOrders();
  updateSelectedUnit();
  updateInfoPanel();
  requestAnimationFrame(renderLoop);
}

resizeCanvas();
setTab("overview");
updateTasks();
updateZoomLabel();
setupTutorial();
renderColonistSelection();
renderBiomes();
updateExpeditionPrepUI();
startCampaignButton.addEventListener("click", () => startGame(true));
freePlayButton.addEventListener("click", () => startGame(false));
renderLoop();
