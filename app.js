const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

const COUNTRY_LANGUAGE_MAP = {
  US: ["English"], GB: ["English"], DE: ["English"], FR: ["French"], ES: ["Spanish"], IT: ["Italian"],
  PL: ["Polish"], TR: ["Turkish"], UA: ["Ukrainian"], RU: ["Russian"], UZ: ["Russian", "Uzbek"],
  KZ: ["Russian", "Kazakh"], CN: ["Chinese"], JP: ["Japanese"], KR: ["Korean"], IN: ["English", "Hindi"],
  BR: ["Portuguese"], SA: ["Arabic"]
};

const RANKS = [
  { minXp: 0, name: "Anfänger", icon: "icons/rank1.png" },
  { minXp: 20, name: "Schüler", icon: "icons/rank2.png" },
  { minXp: 40, name: "Sprachfreund", icon: "icons/rank3.png" },
  { minXp: 60, name: "Experte", icon: "icons/rank4.png" },
  { minXp: 80, name: "Meister", icon: "icons/rank5.png" },
  { minXp: 100, name: "Legende", icon: "icons/rank6.png" }
];

const BASE_WORDS = [
  { german: "der Apfel", translation: { English: "apple", Russian: "яблоко", French: "pomme", Spanish: "manzana", Italian: "mela", Turkish: "elma", Ukrainian: "яблуко", Polish: "jabłko", Portuguese: "maçã", Arabic: "تفاحة", Chinese: "苹果", Japanese: "りんご", Korean: "사과", Hindi: "सेब", Uzbek: "olma", Kazakh: "алма" } },
  { german: "das Haus", translation: { English: "house", Russian: "дом", French: "maison", Spanish: "casa", Italian: "casa", Turkish: "ev", Ukrainian: "будинок", Polish: "dom", Portuguese: "casa", Arabic: "منزل", Chinese: "房子", Japanese: "家", Korean: "집", Hindi: "घर", Uzbek: "uy", Kazakh: "үй" } },
  { german: "das Wasser", translation: { English: "water", Russian: "вода", French: "eau", Spanish: "agua", Italian: "acqua", Turkish: "su", Ukrainian: "вода", Polish: "woda", Portuguese: "água", Arabic: "ماء", Chinese: "水", Japanese: "水", Korean: "물", Hindi: "पानी", Uzbek: "suv", Kazakh: "су" } },
  { german: "der Baum", translation: { English: "tree", Russian: "дерево", French: "arbre", Spanish: "árbol", Italian: "albero", Turkish: "ağaç", Ukrainian: "дерево", Polish: "drzewo", Portuguese: "árvore", Arabic: "شجرة", Chinese: "树", Japanese: "木", Korean: "나무", Hindi: "पेड़", Uzbek: "daraxt", Kazakh: "ағаш" } },
  { german: "die Schule", translation: { English: "school", Russian: "школа", French: "école", Spanish: "escuela", Italian: "scuola", Turkish: "okul", Ukrainian: "школа", Polish: "szkoła", Portuguese: "escola", Arabic: "مدرسة", Chinese: "学校", Japanese: "学校", Korean: "학교", Hindi: "स्कूल", Uzbek: "maktab", Kazakh: "мектеп" } }
];

const SYN_ANT = [
  { word: "schnell", type: "Синоним", correct: "rasch", options: ["rasch", "langsam", "klein", "billig"] },
  { word: "glücklich", type: "Антоним", correct: "traurig", options: ["fröhlich", "traurig", "mutig", "warm"] },
  { word: "groß", type: "Синоним", correct: "riesig", options: ["klein", "riesig", "alt", "eng"] }
];

const state = {
  firebaseReady: false,
  auth: null,
  db: null,
  user: null,
  profile: { name: "Гость", xp: 0, streak: 0, dailyCorrect: 0, chests: 0, lang: "English" },
  currentWord: null,
  duel: { roomId: null, words: [], index: 0, score: 0, startTime: 0, timer: null },
  myWords: []
};

const $ = (id) => document.getElementById(id);
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const todayKey = () => new Date().toISOString().slice(0, 10);

function safeAudioPlay(audioEl) {
  audioEl?.play?.().catch(() => {});
}

function getRank(xp) {
  return [...RANKS].reverse().find((r) => xp >= r.minXp) || RANKS[0];
}

function getDetectedLanguages() {
  const locale = navigator.language || "en-US";
  const cc = locale.split("-")[1]?.toUpperCase() || "US";
  return COUNTRY_LANGUAGE_MAP[cc] || ["English"];
}

function initFirebase() {
  const looksConfigured = !Object.values(firebaseConfig).some((v) => String(v).includes("YOUR_"));
  if (!looksConfigured || typeof firebase === "undefined") return;
  firebase.initializeApp(firebaseConfig);
  firebase.analytics();
  state.auth = firebase.auth();
  state.db = firebase.firestore();
  state.firebaseReady = true;
}

async function signIn(type) {
  if (state.firebaseReady) {
    if (type === "google") return state.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    if (type === "facebook") return state.auth.signInWithPopup(new firebase.auth.FacebookAuthProvider());
    if (type === "email") {
      const email = prompt("Email:", "player@r1ntax.dev");
      const pass = prompt("Password (min 6):", "123456");
      if (!email || !pass) return;
      try { await state.auth.signInWithEmailAndPassword(email, pass); }
      catch { await state.auth.createUserWithEmailAndPassword(email, pass); }
      return;
    }
    if (type === "phone") return alert("Phone auth требует reCAPTCHA и настройки провайдера Firebase.");
    if (type === "telegram") return alert("Telegram login реализован как demo-кнопка (через custom token backend)." );
  }

  state.user = {
    uid: "local-user",
    displayName: `${type.toUpperCase()} Player`
  };
  localStorage.setItem("r1ntaxUser", JSON.stringify(state.user));
  await loadProfile();
  onLoginComplete();
}

async function loadProfile() {
  if (state.firebaseReady && state.auth.currentUser) {
    state.user = state.auth.currentUser;
    const ref = state.db.collection("users").doc(state.user.uid);
    const snap = await ref.get();
    const defaults = {
      name: state.user.displayName || state.user.email || "Spieler",
      xp: 0,
      streak: 0,
      chests: 0,
      dailyCorrect: 0,
      lastActiveDate: todayKey(),
      lang: getDetectedLanguages()[0]
    };
    if (!snap.exists) await ref.set(defaults);
    state.profile = { ...defaults, ...(snap.exists ? snap.data() : {}) };
    return;
  }

  const saved = JSON.parse(localStorage.getItem("r1ntaxProfile") || "null");
  state.profile = saved || {
    name: state.user?.displayName || "Local Spieler",
    xp: 0,
    streak: 0,
    chests: 0,
    dailyCorrect: 0,
    lastActiveDate: todayKey(),
    lang: getDetectedLanguages()[0]
  };
}

async function saveProfile() {
  if (state.firebaseReady && state.user?.uid) {
    await state.db.collection("users").doc(state.user.uid).set(state.profile, { merge: true });
  } else {
    localStorage.setItem("r1ntaxProfile", JSON.stringify(state.profile));
  }
}

function refreshProfileUI() {
  const rank = getRank(state.profile.xp);
  $("playerName").textContent = state.profile.name;
  $("rankName").textContent = rank.name;
  $("xpValue").textContent = state.profile.xp;
  $("rankIcon").src = rank.icon;
  $("streakValue").textContent = state.profile.streak;
  $("dailyValue").textContent = `${state.profile.dailyCorrect}/10`;
  $("chestValue").textContent = state.profile.chests;
  $("langDisplay").textContent = `German → ${state.profile.lang}`;
}

async function adjustXP(delta) {
  state.profile.xp = Math.max(0, state.profile.xp + delta);
  if (delta > 0) state.profile.dailyCorrect += 1;
  if (state.profile.dailyCorrect >= 10) {
    state.profile.chests += 1;
    state.profile.dailyCorrect = 0;
  }
  await saveProfile();
  refreshProfileUI();
}

function getWordTranslation(word, lang) {
  return word.translation[lang] || word.translation.English;
}

function renderOptions(container, options, onClick) {
  container.innerHTML = "";
  options.forEach((text) => {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = text;
    b.onclick = () => onClick(text, b);
    container.appendChild(b);
  });
}

function launchCardsMode() {
  const word = BASE_WORDS[Math.floor(Math.random() * BASE_WORDS.length)];
  state.currentWord = word;
  $("wordCard").textContent = word.german;
  const correct = getWordTranslation(word, state.profile.lang);
  const wrongs = shuffle(BASE_WORDS.filter((w) => w.german !== word.german)).slice(0, 3).map((w) => getWordTranslation(w, state.profile.lang));
  const variants = shuffle([correct, ...wrongs]);
  renderOptions($("cardOptions"), variants, async (answer) => {
    const feedback = $("cardFeedback");
    if (answer === correct) {
      feedback.className = "feedback ok";
      feedback.textContent = "✅ Верно! +1 XP";
      $("wordCard").classList.add("flash-ok");
      safeAudioPlay($("correctSound"));
      await adjustXP(1);
      setTimeout(() => { $("wordCard").classList.remove("flash-ok"); launchCardsMode(); }, 500);
    } else {
      feedback.className = "feedback bad";
      feedback.textContent = "❌ Неверно. -3 XP. Попробуйте снова.";
      $("wordCard").classList.add("flash-bad");
      safeAudioPlay($("wrongSound"));
      await adjustXP(-3);
      setTimeout(() => $("wordCard").classList.remove("flash-bad"), 500);
    }
  });
}

async function loadMyWords() {
  if (state.firebaseReady && state.user?.uid) {
    const snap = await state.db.collection("myWords").where("owner", "==", state.user.uid).limit(50).get();
    state.myWords = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } else {
    state.myWords = JSON.parse(localStorage.getItem("r1ntaxMyWords") || "[]");
  }
  renderMyWords();
}

function renderMyWords() {
  const box = $("myWordsList");
  box.innerHTML = "";
  state.myWords.forEach((w, i) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.textContent = `${i + 1}. ${w.german} → ${w.translation}`;
    box.appendChild(row);
  });
}

async function addMyWord() {
  const german = $("myGerman").value.trim();
  const translation = $("myTranslation").value.trim();
  if (!german || !translation) return;
  if (state.myWords.length >= 50) return alert("Лимит 50 слов достигнут.");
  const entry = { german, translation, owner: state.user?.uid || "local-user", createdAt: Date.now() };
  if (state.firebaseReady && state.user?.uid) {
    await state.db.collection("myWords").add(entry);
  } else {
    state.myWords.push(entry);
    localStorage.setItem("r1ntaxMyWords", JSON.stringify(state.myWords));
  }
  $("myGerman").value = "";
  $("myTranslation").value = "";
  await loadMyWords();
}

function launchSynMode() {
  const task = SYN_ANT[Math.floor(Math.random() * SYN_ANT.length)];
  $("synTask").textContent = `Выберите: ${task.type}`;
  $("synWord").textContent = task.word;
  renderOptions($("synOptions"), shuffle(task.options), async (ans) => {
    const fb = $("synFeedback");
    if (ans === task.correct) {
      fb.className = "feedback ok";
      fb.textContent = "Правильно! +1 XP";
      safeAudioPlay($("correctSound"));
      await adjustXP(1);
    } else {
      fb.className = "feedback bad";
      fb.textContent = "Неправильно! -3 XP";
      safeAudioPlay($("wrongSound"));
      await adjustXP(-3);
    }
    setTimeout(launchSynMode, 650);
  });
}

async function runDuelMockOrOnline() {
  $("duelInfo").textContent = "Поиск соперника...";
  state.duel.words = shuffle(BASE_WORDS).slice(0, 5);
  state.duel.index = 0;
  state.duel.score = 0;
  state.duel.startTime = performance.now();
  playDuelQuestion();
}

function playDuelQuestion() {
  const current = state.duel.words[state.duel.index];
  if (!current) {
    const elapsed = ((performance.now() - state.duel.startTime) / 1000).toFixed(1);
    const bonus = Math.max(0, 8 - Number(elapsed));
    const total = state.duel.score + bonus;
    $("duelInfo").textContent = `Финиш! Очки: ${state.duel.score} + speed bonus ${bonus}. Итого: ${total}`;
    adjustXP(Math.max(1, Math.round(total / 4)));
    saveDuelResult(total, elapsed);
    $("duelQuestion").classList.add("hidden");
    return;
  }

  const correct = getWordTranslation(current, state.profile.lang);
  $("duelQuestion").classList.remove("hidden");
  $("duelQuestion").textContent = `(${state.duel.index + 1}/5) ${current.german}`;
  $("duelInfo").textContent = "Дуэль идёт: таймер активен.";
  const wrongs = shuffle(BASE_WORDS.filter((w) => w.german !== current.german)).slice(0, 3).map((w) => getWordTranslation(w, state.profile.lang));
  renderOptions($("duelOptions"), shuffle([correct, ...wrongs]), (ans) => {
    if (ans === correct) state.duel.score += 2;
    state.duel.index += 1;
    playDuelQuestion();
  });
}

async function saveDuelResult(score, elapsedSec) {
  const record = {
    owner: state.user?.uid || "local-user",
    score,
    elapsedSec,
    at: Date.now()
  };
  if (state.firebaseReady && state.user?.uid) await state.db.collection("duels").add(record);
}

async function refreshLeaderboard() {
  const board = $("leaderboard");
  board.innerHTML = "";
  let rows = [];

  if (state.firebaseReady) {
    const snap = await state.db.collection("users").orderBy("xp", "desc").limit(100).get();
    rows = snap.docs.map((d) => d.data());
  } else {
    rows = [state.profile, ...(JSON.parse(localStorage.getItem("r1ntaxDemoOthers") || "[]"))]
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 100);
  }

  rows.forEach((r, idx) => {
    const rank = getRank(r.xp || 0);
    const item = document.createElement("div");
    item.className = "list-item";
    item.textContent = `${idx + 1}. ${(r.name || "Spieler")} — ${rank.name} — XP ${(r.xp || 0)}`;
    board.appendChild(item);
  });
}

function showMode(mode) {
  document.querySelectorAll(".mode").forEach((m) => m.classList.add("hidden"));
  if (mode === "cards") { $("cardsMode").classList.remove("hidden"); launchCardsMode(); }
  if (mode === "duel") { $("duelMode").classList.remove("hidden"); }
  if (mode === "myWords") { $("myWordsMode").classList.remove("hidden"); loadMyWords(); }
  if (mode === "syn") { $("synMode").classList.remove("hidden"); launchSynMode(); }
}

function populateLanguageSelect() {
  const select = $("manualLanguage");
  const langs = ["English", "French", "Spanish", "Italian", "Polish", "Turkish", "Ukrainian", "Russian", "Uzbek", "Kazakh", "Chinese", "Japanese", "Korean", "Hindi", "Portuguese", "Arabic"];
  select.innerHTML = langs.map((l) => `<option value="${l}">${l}</option>`).join("");
  select.value = state.profile.lang;
}

function updateStreak() {
  const today = todayKey();
  const prev = state.profile.lastActiveDate;
  const oneDay = 24 * 3600 * 1000;
  if (!prev) state.profile.streak = 1;
  else {
    const diff = Math.floor((new Date(today) - new Date(prev)) / oneDay);
    if (diff === 1) state.profile.streak += 1;
    else if (diff > 1) state.profile.streak = 1;
  }
  state.profile.lastActiveDate = today;
}

function onLoginComplete() {
  $("authSection").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  populateLanguageSelect();
  refreshProfileUI();
  refreshLeaderboard();
}

function initParticles() {
  const canvas = $("particles");
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0;
  let stars = [];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    stars = Array.from({ length: Math.min(140, Math.floor(w / 8)) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.8,
      v: Math.random() * 0.5 + 0.12
    }));
  }
  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(180,220,255,.85)";
    stars.forEach((s) => {
      s.y += s.v;
      if (s.y > h) { s.y = -2; s.x = Math.random() * w; }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  resize();
  window.addEventListener("resize", resize);
  draw();
}

function attachEvents() {
  document.querySelectorAll(".auth-btn").forEach((b) => b.addEventListener("click", () => signIn(b.dataset.auth)));
  document.querySelectorAll(".mode-btn").forEach((b) => b.addEventListener("click", () => showMode(b.dataset.mode)));
  $("findDuelBtn").addEventListener("click", runDuelMockOrOnline);
  $("addWordBtn").addEventListener("click", addMyWord);

  $("manualLanguage").addEventListener("change", async (e) => {
    state.profile.lang = e.target.value;
    await saveProfile();
    refreshProfileUI();
  });

  const bgMusic = $("bgMusic");
  $("musicToggle").addEventListener("click", async () => {
    if (bgMusic.paused) {
      try { await bgMusic.play(); $("musicToggle").textContent = "🎵 Music: ON"; }
      catch { $("musicToggle").textContent = "🎵 Music blocked"; }
    } else {
      bgMusic.pause();
      $("musicToggle").textContent = "🎵 Music: OFF";
    }
  });

  $("logoutBtn").addEventListener("click", async () => {
    if (state.firebaseReady && state.auth.currentUser) await state.auth.signOut();
    state.user = null;
    $("dashboard").classList.add("hidden");
    $("authSection").classList.remove("hidden");
  });
}

async function bootstrap() {
  initFirebase();
  initParticles();
  attachEvents();

  if (state.firebaseReady) {
    state.auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      state.user = user;
      await loadProfile();
      updateStreak();
      await saveProfile();
      onLoginComplete();
    });
  } else {
    const user = JSON.parse(localStorage.getItem("r1ntaxUser") || "null");
    if (user) {
      state.user = user;
      await loadProfile();
      updateStreak();
      await saveProfile();
      onLoginComplete();
    }
  }

  const detected = getDetectedLanguages();
  $("authHint").textContent = `Автоопределение региона: German → ${detected.join(" / ")}. Можно сменить в настройках.`;
}

bootstrap();
