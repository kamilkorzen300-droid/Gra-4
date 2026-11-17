
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const $ = id => document.getElementById(id);

let token = "";
let nick = "";
let coins = 0;

let scene, camera, renderer, socket;
let player;
let enemies = [];
let remotePlayers = new Map();
let bullets = [];

let yaw = 0;
let pitch = -0.12;
let velocityY = 0;
let onGround = true;

const keys = {};
const joystick = { x: 0, y: 0 };
const clock = new THREE.Clock();

let lastSend = 0;
let lastShot = 0;

$("loginButton").onclick = () => account("login");
$("registerButton").onclick = () => account("register");

async function account(action) {
  const enteredNick = $("nick").value.trim();
  const password = $("password").value;

  $("loginMessage").textContent = "Łączenie...";

  try {
    const response = await fetch("/api/" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nick: enteredNick, password })
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error);

    token = data.token;
    nick = data.nick;

    $("loginScreen").classList.add("hidden");
    $("gameScreen").classList.remove("hidden");
    $("playerName").textContent = nick;

    startGame();
  } catch (error) {
    $("loginMessage").textContent =
      error.message || "Nie udało się połączyć.";
  }
}

function startGame() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x91b8d1);
  scene.fog = new THREE.Fog(0x91b8d1, 35, 110);

  camera = new THREE.PerspectiveCamera(
    75,
    innerWidth / innerHeight,
    0.1,
    500
  );

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  $("gameScreen").appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x505050, 2));

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(20, 35, 15);
  sun.castShadow = true;
  scene.add(sun);

  makeWorld();

  player = createHuman(nick, 0x287bd1);
  scene.add(player.group);

  // Boty powstają po utworzeniu sceny.
  for (let i = 0; i < 6; i++) {
    addEnemy();
  }

  connectMultiplayer();
  setupControls();

  window.addEventListener("resize", resize);

  animate();
}

// MAPA

function makeWorld() {
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(120, 1, 120),
    new THREE.MeshStandardMaterial({ color: 0x526344 })
  );

  ground.position.y = -0.55;
  ground.receiveShadow = true;
  scene.add(ground);

  const road = new THREE.Mesh(
    new THREE.BoxGeometry(120, 0.05, 12),
    new THREE.MeshStandardMaterial({ color: 0x353535 })
  );

  road.position.y = -0.01;
  scene.add(road);

  createBuilding(-17, 5, -15, 17, 10, 24, 0x777b80);
  createBuilding(17, 5, -15, 17, 10, 24, 0x696e74);
  createBuilding(-25, 5, 22, 18, 10, 15, 0x858585);
  createBuilding(25, 5, 22, 18, 10, 15, 0x858585);

  for (let i = 0; i < 12; i++) {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0x96652e })
    );

    crate.position.set(
      Math.random() * 35 - 17,
      1,
      Math.random() * 45 - 22
    );

    crate.castShadow = true;
    scene.add(crate);
  }

  for (let i = 0; i < 15; i++) {
    const tree = new THREE.Group();

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.35, 3),
      new THREE.MeshStandardMaterial({ color: 0x604127 })
    );
    trunk.position.y = 1.5;
    tree.add(trunk);

    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x285d2b })
    );
    leaves.position.y = 3.5;
    tree.add(leaves);

    tree.position.set(
      Math.random() * 100 - 50,
      0,
      Math.random() * 100 - 50
    );

    scene.add(tree);
  }
}

function createBuilding(x, y, z, w, h, d, color) {
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color })
  );

  building.position.set(x, y, z);
  building.castShadow = true;
  building.receiveShadow = true;
  scene.add(building);
}

// LUDZIK 3D

function createHuman(name, color) {
  const group = new THREE.Group();

  const clothes = new THREE.MeshStandardMaterial({ color });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe4b58b });
  const dark = new THREE.MeshStandardMaterial({ color: 0x252525 });

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 16),
    skin
  );
  head.position.y = 1.75;
  group.add(head);

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.8, 0.35),
    clothes
  );
  torso.position.y = 1.15;
  group.add(torso);

  function makeArm(x) {
    const arm = new THREE.Group();
    arm.position.set(x, 1.45, 0);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.65, 0.2),
      skin
    );
    mesh.position.y = -0.3;
    arm.add(mesh);
    group.add(arm);
    return arm;
  }

  function makeLeg(x) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.75, 0);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.65, 0.25),
      dark
    );
    mesh.position.y = -0.32;
    leg.add(mesh);

    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.15, 0.42),
      dark
    );
    shoe.position.set(0, -0.62, -0.06);
    leg.add(shoe);

    group.add(leg);
    return leg;
  }

  const leftArm = makeArm(-0.43);
  const rightArm = makeArm(0.43);
  const leftLeg = makeLeg(-0.19);
  const rightLeg = makeLeg(0.19);

  const weapon = new THREE.Group();

  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.16, 0.7),
    dark
  );
  gun.position.z = -0.3;
  weapon.add(gun);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.35),
    dark
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.8;
  weapon.add(barrel);

  weapon.position.set(0.43, 1.15, -0.25);
  group.add(weapon);

  return {
    group,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    name
  };
}

// PRZECIWNICY

function addEnemy() {
  const enemy = createHuman("Przeciwnik", 0xb93636);

  enemy.group.position.set(
    Math.random() * 30 - 15,
    0,
    -Math.random() * 35 - 8
  );

  enemy.hp = 100;
  enemy.alive = true;
  enemy.phase = Math.random() * 10;

  scene.add(enemy.group);
  enemies.push(enemy);
}

// MULTIPLAYER

function connectMultiplayer() {
  socket = io({ auth: { token } });

  socket.on("connect", () => {
    $("status").textContent = "Online";
  });

  socket.on("connect_error", () => {
    $("status").textContent = "Błąd połączenia";
  });

  socket.on("world:players", list => {
    list.forEach(addRemotePlayer);
  });

  socket.on("player:joined", addRemotePlayer);

  socket.on("player:moved", data => {
    const other = remotePlayers.get(data.id);
    if (!other) return;

    other.group.position.set(data.x, data.y, data.z);
    other.group.rotation.y = data.rotation;
  });

  socket.on("player:left", id => {
    const other = remotePlayers.get(id);
    if (!other) return;

    scene.remove(other.group);
    remotePlayers.delete(id);
  });
}

function addRemotePlayer(data) {
  if (!data || data.id === socket.id) return;
  if (remotePlayers.has(data.id)) return;

  const other = createHuman(data.nick, 0x27aa75);

  other.group.position.set(data.x || 0, data.y || 0, data.z || 0);
  other.group.rotation.y = data.rotation || 0;

  scene.add(other.group);
  remotePlayers.set(data.id, other);
}

// STEROWANIE

function setupControls() {
  window.addEventListener("keydown", e => {
    keys[e.code] = true;

    if (e.code === "Space") {
      e.preventDefault();
      jump();
    }
  });

  window.addEventListener("keyup", e => {
    keys[e.code] = false;
  });

  renderer.domElement.addEventListener("click", () => {
    if (matchMedia("(pointer:fine)").matches &&
        document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock();
    }
  });

  document.addEventListener("mousemove", e => {
    if (document.pointerLockElement !== renderer.domElement) return;

    yaw -= e.movementX * 0.002;
    pitch -= e.movementY * 0.002;
    pitch = Math.max(-0.8, Math.min(0.45, pitch));
  });

  renderer.domElement.addEventListener("mousedown", e => {
    if (
      e.button === 0 &&
      document.pointerLockElement === renderer.domElement
    ) {
      shoot();
    }
  });

  $("fireButton").addEventListener("pointerdown", e => {
    e.preventDefault();
    shoot();
  });

  $("jumpButton").addEventListener("pointerdown", e => {
    e.preventDefault();
    jump();
  });

  const joy = $("joystick");
  const stick = $("stick");
  let pointerId = null;

  function updateJoy(e) {
    const rect = joy.getBoundingClientRect();

    let x = e.clientX - rect.left - rect.width / 2;
    let y = e.clientY - rect.top - rect.height / 2;

    const length = Math.hypot(x, y);
    const max = 38;

    if (length > max) {
      x = x / length * max;
      y = y / length * max;
    }

    joystick.x = x / max;
    joystick.y = y / max;

    stick.style.transform = `translate(${x}px, ${y}px)`;
  }

  joy.addEventListener("pointerdown", e => {
    pointerId = e.pointerId;
    joy.setPointerCapture(pointerId);
    updateJoy(e);
  });

  joy.addEventListener("pointermove", e => {
    if (e.pointerId === pointerId) updateJoy(e);
  });

  function stopJoy(e) {
    if (e.pointerId !== pointerId) return;

    pointerId = null;
    joystick.x = 0;
    joystick.y = 0;
    stick.style.transform = "translate(0px, 0px)";
  }

  joy.addEventListener("pointerup", stopJoy);
  joy.addEventListener("pointercancel", stopJoy);
}

function jump() {
  if (!onGround) return;

  velocityY = 7;
  onGround = false;
}

// STRZELANIE

function shoot() {
  if (!player) return;

  const now = performance.now();
  if (now - lastShot < 250) return;
  lastShot = now;

  const direction = new THREE.Vector3(
    -Math.sin(yaw),
    Math.sin(pitch),
    -Math.cos(yaw)
  ).normalize();

  const start = player.group.position.clone();
  start.y += 1.3;

  const bullet = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe36a })
  );

  bullet.position.copy(start);
  scene.add(bullet);

  bullets.push({
    mesh: bullet,
    direction,
    life: 1.5
  });

  const ray = new THREE.Raycaster(start, direction, 0, 50);

  const targets = enemies
    .filter(enemy => enemy.alive)
    .map(enemy => enemy.group);

  const hits = ray.intersectObjects(targets, true);

  if (hits.length > 0) {
    let object = hits[0].object;

    while (
      object.parent &&
      !enemies.some(enemy => enemy.group === object)
    ) {
      object = object.parent;
    }

    const enemy = enemies.find(e => e.group === object);

    if (enemy && enemy.alive) {
      enemy.hp -= 50;

      if (enemy.hp <= 0) {
        enemy.alive = false;
        scene.remove(enemy.group);

        coins += 15;
        $("coins").textContent = "🪙 " + coins;

        setTimeout(() => {
          enemy.hp = 100;
          enemy.alive = true;
          enemy.group.position.set(
            Math.random() * 30 - 15,
            0,
            -Math.random() * 35 - 8
          );
          scene.add(enemy.group);
        }, 2500);
      }
    }
  }
}

// GŁÓWNA PĘTLA GRY

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (!player) return;

  let forward = 0;
  let side = 0;

  if (keys.KeyW || keys.ArrowUp) forward++;
  if (keys.KeyS || keys.ArrowDown) forward--;
  if (keys.KeyD || keys.ArrowRight) side++;
  if (keys.KeyA || keys.ArrowLeft) side--;

  forward -= joystick.y;
  side += joystick.x;

  const length = Math.hypot(forward, side);

  if (length > 1) {
    forward /= length;
    side /= length;
  }

  const speed = keys.ShiftLeft ? 8 : 5;

  const moveX = (
    -Math.sin(yaw) * forward +
    Math.cos(yaw) * side
  ) * speed * delta;

  const moveZ = (
    -Math.cos(yaw) * forward -
    Math.sin(yaw) * side
  ) * speed * delta;

  player.group.position.x += moveX;
  player.group.position.z += moveZ;

  const moving = Math.abs(forward) + Math.abs(side) > 0.05;

  if (moving) {
    const swing = Math.sin(time * 10) * 0.55;

    player.leftLeg.rotation.x = swing;
    player.rightLeg.rotation.x = -swing;
    player.leftArm.rotation.x = -swing * 0.6;
    player.rightArm.rotation.x = swing * 0.6;
  } else {
    player.leftLeg.rotation.x = 0;
    player.rightLeg.rotation.x = 0;
    player.leftArm.rotation.x = 0;
    player.rightArm.rotation.x = 0;
  }

  velocityY -= 18 * delta;
  player.group.position.y += velocityY * delta;

  if (player.group.position.y <= 0) {
    player.group.position.y = 0;
    velocityY = 0;
    onGround = true;
  }

  player.group.rotation.y = yaw;

  const offset = new THREE.Vector3(
    Math.sin(yaw) * 5,
    2.3 - pitch * 2,
    Math.cos(yaw) * 5
  );

  camera.position.copy(
    player.group.position.clone().add(offset)
  );

  const lookAt = player.group.position.clone();
  lookAt.y += 1.35;
  camera.lookAt(lookAt);

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];

    bullet.mesh.position.addScaledVector(
      bullet.direction,
      35 * delta
    );

    bullet.life -= delta;

    if (bullet.life <= 0) {
      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
    }
  }

  enemies.forEach(enemy => {
    if (!enemy.alive) return;

    enemy.phase += delta * 2;

    enemy.group.position.x += Math.sin(enemy.phase) * delta * 0.5;
    enemy.leftLeg.rotation.x = Math.sin(enemy.phase * 3) * 0.3;
    enemy.rightLeg.rotation.x = -Math.sin(enemy.phase * 3) * 0.3;
  });

  if (socket?.connected && time - lastSend > 0.05) {
    lastSend = time;

    socket.emit("player:move", {
      x: player.group.position.x,
      y: player.group.position.y,
      z: player.group.position.z,
      rotation: yaw
    });
  }

  renderer.render(scene, camera);
}

function resize() {
  if (!camera || !renderer) return;

  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
