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
  tree: "#4d8f59",
  berries: "#7d3b7b",
  rock: "#7b7e84"
};

const resourceValues = {
  tree: { wood: 4 },
  berries: { food: 3 },
  rock: { stone: 4 }
};

const gameState = {
  day: 1,
  time: 0,
  speed: 1,
  paused: false,
  resources: {
    food: 16,
    wood: 20,
    stone: 6,
    tools: 0
  },
  events: [],
  map: [],
  nodes: [],
  buildOrders: [],
  structures: [],
  colonists: [],
  selectedTab: "overview",
  selectedBuild: "camp",
  selectedColonistId: null,
  commandMode: "move",
  zoom: 1
};

const camera = {
  offsetX: 0,
  offsetY: 0,
  viewWidth: 0,
  viewHeight: 0
};

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
  camera.offsetX = (camera.viewWidth / zoom - worldSize) / 2;
  camera.offsetY = (camera.viewHeight / zoom - worldSize) / 2;
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
      column.push({ terrain });
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
      nodes.push({ id: `${type}-${x}-${y}-${added}`, type, x, y, amount: 1 });
      added += 1;
    }
  };
  addNode("tree", 40);
  addNode("berries", 18);
  addNode("rock", 16);
  return nodes;
}

function createColonists() {
  return [
    createColonist("Айра", 9, 9),
    createColonist("Дан", 10, 12),
    createColonist("Ника", 13, 10)
  ];
}

function createColonist(name, x, y) {
  return {
    id: crypto.randomUUID(),
    name,
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
  colonist.hunger = Math.max(0, colonist.hunger - 0.7 * delta);
  colonist.rest = Math.max(0, colonist.rest - 0.5 * delta);
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
      const [type, amount] = Object.entries(gains)[0];
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

function updateStructures(delta) {
  for (const structure of gameState.structures) {
    if (structure.type === "farm") {
      structure.timer = (structure.timer ?? 0) + delta;
      if (structure.timer >= 20) {
        structure.timer = 0;
        gameState.resources.food += 2;
        pushEvent("Ферма дала урожай (+2 еды).");
      }
    }
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
  }
  tickEvents();
  updateStructures(delta * workBoost);

  for (const colonist of gameState.colonists) {
    updateNeeds(colonist, delta);
    if (colonist.task === "idle") {
      assignTask(colonist);
    }
    handleTask(colonist, delta * workBoost);
  }
}

function drawTile(x, y, color) {
  const { x: screenX, y: screenY } = gridToScreen(x, y);
  ctx.fillStyle = color;
  ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = "rgba(15, 20, 30, 0.3)";
  ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
}

function drawResource(node) {
  const { x: screenX, y: screenY } = gridToScreen(node.x, node.y);
  ctx.fillStyle = resourcePalette[node.type];
  ctx.beginPath();
  ctx.arc(screenX + TILE_SIZE / 2, screenY + TILE_SIZE / 2, 9, 0, Math.PI * 2);
  ctx.fill();
}

function drawStructure(structure) {
  const { x: screenX, y: screenY } = gridToScreen(structure.x, structure.y);
  const palette = {
    camp: "#d1a94b",
    stockpile: "#88b2b8",
    workshop: "#c96f5a",
    farm: "#6fbf73",
    watch: "#8a7bd1"
  };
  ctx.fillStyle = palette[structure.type] ?? "#d1a94b";
  ctx.fillRect(screenX + 6, screenY + 6, TILE_SIZE - 12, TILE_SIZE - 12);
}

function drawColonist(colonist) {
  const { x: screenX, y: screenY } = gridToScreen(colonist.x, colonist.y);
  if (colonist.id === gameState.selectedColonistId) {
    ctx.strokeStyle = "#f2c14e";
    ctx.lineWidth = 2;
    ctx.strokeRect(screenX + 2, screenY + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  }
  ctx.fillStyle = "#f2c14e";
  ctx.beginPath();
  ctx.arc(screenX + TILE_SIZE / 2, screenY + TILE_SIZE / 2, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1c1f2a";
  ctx.font = "10px Segoe UI";
  ctx.fillText(colonist.name, screenX - 2, screenY - 2);
}

function drawOrders() {
  for (const order of gameState.buildOrders) {
    const { x: screenX, y: screenY } = gridToScreen(order.x, order.y);
    ctx.strokeStyle = "#5fe1ff";
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(screenX + 3, screenY + 3, TILE_SIZE - 6, TILE_SIZE - 6);
    ctx.setLineDash([]);
  }
}

function render() {
  ctx.clearRect(0, 0, camera.viewWidth, camera.viewHeight);
  ctx.save();
  ctx.translate(camera.offsetX, camera.offsetY);
  ctx.scale(gameState.zoom, gameState.zoom);
  for (let x = 0; x < MAP_SIZE; x += 1) {
    for (let y = 0; y < MAP_SIZE; y += 1) {
      const tile = gameState.map[x][y];
      drawTile(x, y, terrainPalette[tile.terrain]);
    }
  }

  for (const node of gameState.nodes) {
    if (node.amount > 0) drawResource(node);
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
        `<li>${colonist.name} — ${colonist.task} · голод ${colonist.hunger.toFixed(0)} · отдых ${colonist.rest.toFixed(0)} · настроение ${colonist.mood.toFixed(0)}</li>`
    )
    .join("");
  eventsList.innerHTML = gameState.events.map((event) => `<li>${event.message}</li>`).join("");
}

function init() {
  gameState.map = createMap();
  gameState.nodes = createResources();
  gameState.colonists = createColonists();
  gameState.structures = [{ type: "camp", x: 14, y: 14 }];
  gameState.buildOrders = [];
  gameState.events = [];
  gameState.resources = { food: 16, wood: 20, stone: 6, tools: 0 };
  gameState.time = 0;
  gameState.day = 1;
  gameState.selectedColonistId = null;
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
    return true;
  }
  return false;
}

function handleBuildClick(tile) {
  if (!canBuild(tile.x, tile.y)) {
    pushEvent("Тут нельзя строить.");
    return;
  }
  const buildDefinitions = {
    camp: { label: "лагерь", cost: { wood: 10 }, work: 6 },
    stockpile: { label: "склад", cost: { wood: 12 }, work: 7 },
    workshop: { label: "мастерская", cost: { wood: 8, stone: 6 }, work: 8 },
    farm: { label: "ферма", cost: { wood: 6, food: 4 }, work: 6 }
  };
  const definition = buildDefinitions[gameState.selectedBuild];
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
}

canvas.addEventListener("click", (event) => {
  const position = getMousePosition(event);
  const tile = screenToGrid(position.x, position.y);
  if (tile.x < 0 || tile.y < 0 || tile.x >= MAP_SIZE || tile.y >= MAP_SIZE) return;
  if (selectColonistAt(tile)) return;
  if (gameState.selectedTab === "build") {
    handleBuildClick(tile);
    return;
  }
  if (gameState.selectedTab === "units") {
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
        "Построй склад и ферму для стабильности."
      ]
    },
    {
      title: "Инструменты и ремесло",
      items: [
        "Построй мастерскую.",
        "Создай хотя бы 2 инструмента."
      ]
    }
  ];
  tasksList.innerHTML = tasks
    .map(
      (task) =>
        `<li><strong>${task.title}</strong><ul>${task.items.map((item) => `<li>${item}</li>`).join("")}</ul></li>`
    )
    .join("");
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

window.addEventListener("resize", resizeCanvas);
document.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    gameState.paused = !gameState.paused;
    togglePauseButton.textContent = gameState.paused ? "Продолжить" : "Пауза";
  }
});

function renderLoop() {
  update(1 / TICK_RATE);
  render();
  updateHud();
  updateOrders();
  updateSelectedUnit();
  requestAnimationFrame(renderLoop);
}

resizeCanvas();
setTab("overview");
updateTasks();
updateZoomLabel();
init();
setupTutorial();
renderLoop();
