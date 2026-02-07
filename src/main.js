const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("hud");
const resourcesList = document.getElementById("resources");
const colonistsList = document.getElementById("colonists");
const eventsList = document.getElementById("events");
const togglePauseButton = document.getElementById("toggle-pause");
const speedButton = document.getElementById("speed");

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const MAP_SIZE = 22;
const TICK_RATE = 60;

const mapOffset = {
  x: canvas.width / 2,
  y: 80
};

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
    stone: 6
  },
  events: [],
  map: [],
  nodes: [],
  buildOrders: [],
  structures: [],
  colonists: []
};

function isoToScreen(x, y) {
  return {
    x: (x - y) * (TILE_WIDTH / 2) + mapOffset.x,
    y: (x + y) * (TILE_HEIGHT / 2) + mapOffset.y
  };
}

function screenToIso(x, y) {
  const dx = x - mapOffset.x;
  const dy = y - mapOffset.y;
  const isoX = (dx / (TILE_WIDTH / 2) + dy / (TILE_HEIGHT / 2)) / 2;
  const isoY = (dy / (TILE_HEIGHT / 2) - dx / (TILE_WIDTH / 2)) / 2;
  return {
    x: Math.floor(isoX),
    y: Math.floor(isoY)
  };
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

function assignTask(colonist) {
  if (colonist.hunger < 35 && gameState.resources.food > 0) {
    colonist.task = "eat";
    colonist.goal = { x: 11, y: 11 };
    return;
  }
  if (colonist.rest < 30) {
    const camp = gameState.structures.find((structure) => structure.type === "camp");
    colonist.task = "rest";
    colonist.goal = camp ? { x: camp.x, y: camp.y } : { x: 11, y: 11 };
    return;
  }
  if (colonist.carry) {
    colonist.task = "haul";
    colonist.goal = { x: 11, y: 11 };
    return;
  }
  const order = findClosestOrder(colonist.x, colonist.y);
  if (order) {
    colonist.task = "deliver";
    colonist.goal = { x: order.x, y: order.y };
    colonist.carry = { type: "wood", amount: 2 };
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
      colonist.goal = { x: 11, y: 11 };
      break;
    }
    case "deliver": {
      const order = gameState.buildOrders.find((item) => item.x === colonist.goal.x && item.y === colonist.goal.y);
      if (order && colonist.carry) {
        order.progress += colonist.carry.amount;
        colonist.carry = null;
        if (order.progress >= order.cost) {
          gameState.structures.push({ type: "camp", x: order.x, y: order.y });
          gameState.buildOrders = gameState.buildOrders.filter((item) => item !== order);
          pushEvent("Построен лагерь: отдых стал быстрее.");
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
  if (Math.random() < 0.02) {
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

function update(delta) {
  if (gameState.paused) return;
  gameState.time += delta * gameState.speed;
  if (gameState.time >= 24) {
    gameState.day += 1;
    gameState.time = 0;
    pushEvent(`Начался день ${gameState.day}.`);
  }
  tickEvents();

  for (const colonist of gameState.colonists) {
    updateNeeds(colonist, delta);
    if (colonist.task === "idle") {
      assignTask(colonist);
    }
    handleTask(colonist, delta);
  }
}

function drawTile(x, y, color) {
  const { x: screenX, y: screenY } = isoToScreen(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(screenX, screenY);
  ctx.lineTo(screenX + TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
  ctx.lineTo(screenX, screenY + TILE_HEIGHT);
  ctx.lineTo(screenX - TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
  ctx.closePath();
  ctx.fill();
}

function drawResource(node) {
  const { x: screenX, y: screenY } = isoToScreen(node.x, node.y);
  ctx.fillStyle = resourcePalette[node.type];
  ctx.beginPath();
  ctx.arc(screenX, screenY + 8, 10, 0, Math.PI * 2);
  ctx.fill();
}

function drawStructure(structure) {
  const { x: screenX, y: screenY } = isoToScreen(structure.x, structure.y);
  ctx.fillStyle = "#d1a94b";
  ctx.beginPath();
  ctx.moveTo(screenX, screenY - 6);
  ctx.lineTo(screenX + 12, screenY + 8);
  ctx.lineTo(screenX, screenY + 20);
  ctx.lineTo(screenX - 12, screenY + 8);
  ctx.closePath();
  ctx.fill();
}

function drawColonist(colonist) {
  const { x: screenX, y: screenY } = isoToScreen(colonist.x, colonist.y);
  ctx.fillStyle = "#f2c14e";
  ctx.beginPath();
  ctx.arc(screenX, screenY - 4, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1c1f2a";
  ctx.font = "10px Segoe UI";
  ctx.fillText(colonist.name, screenX - 12, screenY - 14);
}

function drawOrders() {
  for (const order of gameState.buildOrders) {
    const { x: screenX, y: screenY } = isoToScreen(order.x, order.y);
    ctx.strokeStyle = "#5fe1ff";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(screenX, screenY + 8, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let layer = 0; layer < MAP_SIZE * 2; layer += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      const y = layer - x;
      if (y < 0 || y >= MAP_SIZE) continue;
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

function loop() {
  update(1 / TICK_RATE);
  render();
  updateHud();
  requestAnimationFrame(loop);
}

function init() {
  gameState.map = createMap();
  gameState.nodes = createResources();
  gameState.colonists = createColonists();
  gameState.structures.push({ type: "camp", x: 11, y: 11 });
  pushEvent("Колония высадилась. Удачи!");
  loop();
}

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;
  const tile = screenToIso(clickX, clickY);
  if (!canWalk(tile.x, tile.y)) return;
  const existing = gameState.buildOrders.find((order) => order.x === tile.x && order.y === tile.y);
  if (existing) return;
  const cost = 10;
  if (gameState.resources.wood < cost) {
    pushEvent("Недостаточно дерева для лагеря (нужно 10)." );
    return;
  }
  gameState.resources.wood -= cost;
  gameState.buildOrders.push({ x: tile.x, y: tile.y, cost, progress: 0 });
  pushEvent("Создан заказ на лагерь.");
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

init();
