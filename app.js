// Trivial Minimal — logica base + suoni (WebAudio)
// Dataset: questions.it.json (topics + questions)
// Regole: d10 argomento; difficoltà scelta (Facile/Medio/Difficile); timer 60s; punti 0,5/1/2,5; vittoria a 50.

const DIFF_MAP = {
  1: { label: "Facile", points: 1 },
  2: { label: "Medio", points: 2 },
  3: { label: "Difficile", points: 3 },
};

let audioCtx = null;
function ensureAudio(){
  if(!audioCtx){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if(audioCtx.state === "suspended") audioCtx.resume();
}
function tone(freq, ms, type="sine", gain=0.06){
  ensureAudio();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + ms/1000);
}
function sRoll(){
  ensureAudio();
  // piccolo arpeggio
  tone(440, 80, "triangle", 0.06);
  setTimeout(()=>tone(523.25, 80, "triangle", 0.06), 80);
  setTimeout(()=>tone(659.25, 90, "triangle", 0.06), 160);
}
function sCorrect(){
  ensureAudio();
  tone(523.25, 120, "sine", 0.07);
  setTimeout(()=>tone(659.25, 160, "sine", 0.07), 40);
  setTimeout(()=>tone(783.99, 220, "sine", 0.06), 80);
}
function sWrong(){
  ensureAudio();
  tone(196, 180, "sawtooth", 0.05);
  setTimeout(()=>tone(146.83, 220, "sawtooth", 0.05), 90);
}
function sTimeout(){
  ensureAudio();
  tone(220, 120, "square", 0.05);
  setTimeout(()=>tone(220, 120, "square", 0.05), 140);
}
function sWin(){
  ensureAudio();
  tone(523.25, 140, "triangle", 0.07);
  setTimeout(()=>tone(659.25, 140, "triangle", 0.07), 140);
  setTimeout(()=>tone(783.99, 240, "triangle", 0.07), 280);

function speakFX(text, {durationMs=2000, rate=1, pitch=1, volume=1} = {}){
  // Usa SpeechSynthesis (quando disponibile) per effetti vocali tipo "Eureka!".
  // Su iOS il primo avvio richiede una interazione utente (click) per abilitare audio.
  try{
    if(!("speechSynthesis" in window)) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "it-IT";
    u.rate = rate;
    u.pitch = pitch;
    u.volume = volume;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    // stop dopo durationMs
    setTimeout(()=>{ try{ window.speechSynthesis.cancel(); }catch(e){} }, durationMs);
    return true;
  }catch(e){
    return false;
  }
}

function showSpecialFeedbackImage(kind){
  // kind: "asino" | "scienziato" | null
  const map = {
    asino: {src: "./assets/asino.png", alt: "Asino"},
    scienziato: {src: "./assets/scienziato.png", alt: "Scienziato"},
  };
  if(!kind || !map[kind]) return "";
  return `<img src="${map[kind].src}" alt="${map[kind].alt}" loading="lazy" />`;
}
}

// UI refs
const setupView = document.getElementById("setupView");
const gameView = document.getElementById("gameView");
const statusPill = document.getElementById("statusPill");

const playerCountSel = document.getElementById("playerCount");
const playersBox = document.getElementById("playersBox");
const targetScoreInput = document.getElementById("targetScore");
const secondsPerTurnInput = document.getElementById("secondsPerTurn");
const startBtn = document.getElementById("startBtn");
const mappingBox = document.getElementById("mappingBox");

const currentPlayerEl = document.getElementById("currentPlayer");
const timerValueEl = document.getElementById("timerValue");
const scoreboardEl = document.getElementById("scoreboard");

const rollTopicBtn = document.getElementById("rollTopicBtn");
const diffEasyBtn = document.getElementById("diffEasyBtn");
const diffMedBtn = document.getElementById("diffMedBtn");
const diffHardBtn = document.getElementById("diffHardBtn");
const drawQuestionBtn = document.getElementById("drawQuestionBtn");
const endTurnBtn = document.getElementById("endTurnBtn");

const topicResultEl = document.getElementById("topicResult");
const diffResultEl = document.getElementById("diffResult");

const questionBox = document.getElementById("questionBox");
const metaTopic = document.getElementById("metaTopic");
const metaDiff = document.getElementById("metaDiff");
const metaPoints = document.getElementById("metaPoints");
const questionText = document.getElementById("questionText");
const answersBox = document.getElementById("answersBox");
const feedbackEl = document.getElementById("feedback");
const nextTurnBtn = document.getElementById("nextTurnBtn");

const winnerBox = document.getElementById("winnerBox");
const winnerText = document.getElementById("winnerText");
const restartBtn = document.getElementById("restartBtn");

// Stato gioco
let DATA = null;
let TOPIC_DICE_MAP = {}; // num -> topic
let game = null; // { players:[{name,score}], turnIndex, targetScore, seconds, ... }
let rolledTopic = null;
let rolledDiff = null;
let timer = { id:null, remaining:0, active:false, lastBeep: null };
let pools = {}; // key: topic|diffLabel -> [questionIds shuffled]

function setStatus(text){ statusPill.textContent = text; }

function buildPlayersInputs(){
  playersBox.innerHTML = "";
  const n = parseInt(playerCountSel.value, 10);
  for(let i=1; i<=n; i++){
    const inp = document.createElement("input");
    inp.type = "text";
    inp.placeholder = `Nome giocatore ${i}`;
    inp.value = `Giocatore ${i}`;
    inp.dataset.player = String(i);
    playersBox.appendChild(inp);
  }
}

function buildMapping(){
  mappingBox.innerHTML = "";
  // d10: 1..10 topics in current order
  TOPIC_DICE_MAP = {};
  DATA.topics.forEach((t, idx)=>{
    const n = idx+1;
    TOPIC_DICE_MAP[n] = t;
    const div = document.createElement("div");
    div.textContent = `${n} → ${t}`;
    mappingBox.appendChild(div);
  });
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function poolKey(topic, diffLabel){
  return `${topic}||${diffLabel}`;
}

function initPools(){
  pools = {};
  for(const q of DATA.questions){
    const k = poolKey(q.argomento, q.difficolta);
    if(!pools[k]) pools[k] = [];
    pools[k].push(q.id);
  }
  // shuffle each pool
  for(const k of Object.keys(pools)) shuffle(pools[k]);
}

function getNextQuestion(topic, diffLabel){
  const k = poolKey(topic, diffLabel);
  if(!pools[k] || pools[k].length === 0){
    // ricrea pool per quel gruppo (riuso consentito quando finite)
    pools[k] = DATA.questions.filter(q => q.argomento === topic && q.difficolta === diffLabel).map(q => q.id);
    shuffle(pools[k]);
  }
  const id = pools[k].pop();
  return DATA.questions.find(q => q.id === id);
}

function renderScoreboard(){
  scoreboardEl.innerHTML = "";
  game.players.forEach((p, idx)=>{
    const row = document.createElement("div");
    row.className = "scoreRow";
    const left = document.createElement("div");
    left.className = "name";
    left.textContent = (idx === game.turnIndex ? "▶ " : "") + p.name;
    const right = document.createElement("div");
    right.className = "pts";
    const s = (Math.round(p.score*10)/10).toString().replace(".", ",");
    right.textContent = `${s} / ${game.targetScore}`;
    row.appendChild(left);
    row.appendChild(right);
    scoreboardEl.appendChild(row);
  });
}

function setCurrentPlayer(){
  currentPlayerEl.textContent = game.players[game.turnIndex].name;
  renderScoreboard();
}

function resetTurnUI(){
  // abilita il lancio argomento all’inizio del turno
  rollTopicBtn.disabled = false;
  [diffEasyBtn, diffMedBtn, diffHardBtn].forEach(b=> b && (b.disabled = false));

  rolledTopic = null;
  rolledDiff = null;
  [diffEasyBtn, diffMedBtn, diffHardBtn].forEach(b=> { if(b){ b.classList.remove("selected"); b.disabled = true; } });
  topicResultEl.textContent = "—";
  diffResultEl.textContent = "—";
  drawQuestionBtn.disabled = true;
  endTurnBtn.disabled = true; // si sblocca dopo aver risposto
  questionBox.classList.add("hidden");
  feedbackEl.classList.add("hidden");
  nextTurnBtn.classList.add("hidden");
  answersBox.innerHTML = "";
  questionText.textContent = "—";
  metaTopic.textContent = "—";
  metaDiff.textContent = "—";
  metaPoints.textContent = "—";
  stopTimer();
  timerValueEl.textContent = "—";
}

function canDraw(){
  return rolledTopic !== null && rolledDiff !== null;
}

function rollD10(){
  // una sola volta per turno
  if(rolledTopic !== null) return;

  sRoll();
  const n = Math.floor(Math.random()*10)+1;
  const t = TOPIC_DICE_MAP[n];
  rolledTopic = { n, topic: t };
  topicResultEl.textContent = `${n} → ${t}`;
  rollTopicBtn.disabled = true;
  [diffEasyBtn, diffMedBtn, diffHardBtn].forEach(b=> b && (b.disabled = false));
  drawQuestionBtn.disabled = !canDraw();
}

function selectDifficulty(n){
  // n: 1 facile, 2 medio, 3 difficile
  sRoll();
  const d = DIFF_MAP[n];
  rolledDiff = { n, label: d.label, points: d.points };
  diffResultEl.textContent = `${n} → ${d.label}`;
  // UI selected state
  [diffEasyBtn, diffMedBtn, diffHardBtn].forEach(b=> { if(b){ b.classList.remove("selected"); b.disabled = true; } });
  if(n===1) diffEasyBtn.classList.add("selected");
  if(n===2) diffMedBtn.classList.add("selected");
  if(n===3) diffHardBtn.classList.add("selected");
  drawQuestionBtn.disabled = !canDraw();
}

function startTimer(){
  stopTimer();
  timer.active = true;
  timer.remaining = game.seconds;
  timer.lastBeep = null;
  timerValueEl.textContent = `${timer.remaining}s`;
  timer.id = setInterval(()=>{
    timer.remaining -= 1;
    timerValueEl.textContent = `${timer.remaining}s`;

    // beep ultimi 5 secondi
    if(timer.remaining <= 5 && timer.remaining > 0 && timer.lastBeep !== timer.remaining){
      timer.lastBeep = timer.remaining;
      tone(880, 60, "sine", 0.04);
    }

    if(timer.remaining <= 0){
      stopTimer();
      onTimeout();
    }
  }, 1000);
}

function stopTimer(){
  if(timer.id) clearInterval(timer.id);
  timer.id = null;
  timer.active = false;
}

function showQuestion(q){
  questionBox.classList.remove("hidden");
  feedbackEl.classList.add("hidden");
  feedbackEl.classList.remove("ok","bad");
  nextTurnBtn.classList.add("hidden");

  metaTopic.textContent = q.argomento;
  metaDiff.textContent = q.difficolta;
  metaPoints.textContent = `+${rolledDiff.points.toString().replace(".", ",")} punti`;

  questionText.textContent = q.domanda;

  // risposte random
  const opts = [
    { text: q.corretta, correct:true },
    { text: q.errate[0], correct:false },
    { text: q.errate[1], correct:false },
    { text: q.errate[2], correct:false },
  ];
  shuffle(opts);

  answersBox.innerHTML = "";
  opts.forEach(opt=>{
    const btn = document.createElement("button");
    btn.textContent = opt.text;
    btn.onclick = ()=> onAnswer(opt.correct, q.corretta);
    answersBox.appendChild(btn);
  });

  startTimer();
  setStatus("Rispondi!");
}

function lockAnswers(){
  const btns = answersBox.querySelectorAll("button");
  btns.forEach(b=> b.disabled = true);
}

function onAnswer(isCorrect, correctText){
  if(!timer.active) return;
  stopTimer();
  lockAnswers();

  const player = game.players[game.turnIndex];

  if(isCorrect){
    sCorrect();
    player.score += rolledDiff.points;
    feedbackEl.classList.remove("hidden");
    feedbackEl.classList.add("ok");
    const ptsTxt = rolledDiff.points.toString().replace(".", ",");

    // Special FX: corretto su Difficile → immagine + "Eureka!"
    let specialHtml = "";
    if(rolledDiff.label === "Difficile"){
      specialHtml = showSpecialFeedbackImage("scienziato");
      // prova a dire "Eureka!" (fallback: tono)
      const ok = speakFX("Eureka!", {durationMs: 2000, rate: 0.95, pitch: 1.05, volume: 1});
      if(!ok) tone(880, 240, "triangle", 0.06);
    }

    feedbackEl.innerHTML = `✅ Corretto! +${ptsTxt} punti.` + (specialHtml ? `<div>${specialHtml}</div>` : ``);
    renderScoreboard();

    if(player.score >= game.targetScore){
      endGame(player.name);
      return;
    }
  }else{
    sWrong();
    feedbackEl.classList.remove("hidden");
    feedbackEl.classList.add("bad");

    // Special FX: sbagliato su Facile → immagine + raglio (2s)
    let specialHtml = "";
    if(rolledDiff.label === "Facile"){
      specialHtml = showSpecialFeedbackImage("asino");
      // raglio: prova con SpeechSynthesis ("I-A!") per ~2 secondi
      const ok = speakFX("I A!", {durationMs: 2000, rate: 0.7, pitch: 0.6, volume: 1});
      if(!ok){
        // fallback semplice
        tone(180, 120, "sawtooth", 0.05);
        setTimeout(()=>tone(140, 220, "sawtooth", 0.05), 120);
      }
    }

    feedbackEl.innerHTML = `❌ Sbagliato. La risposta corretta era: “${correctText}”.` + (specialHtml ? `<div>${specialHtml}</div>` : ``);
  }

  endTurnBtn.disabled = false;
  setStatus("Fine turno");
}

function onTimeout(){
  sTimeout();
  lockAnswers();
  feedbackEl.classList.remove("hidden");
  feedbackEl.classList.add("bad");
  feedbackEl.textContent = `⏱️ Tempo scaduto! Turno perso.`;
  endTurnBtn.disabled = false;
  setStatus("Tempo scaduto");
}

function nextTurn(){
  // passa al prossimo giocatore
  game.turnIndex = (game.turnIndex + 1) % game.players.length;
  setCurrentPlayer();
  resetTurnUI();
  setStatus("Lancia i dadi");
}

function endGame(winnerName){
  sWin();
  setStatus("Partita conclusa");
  winnerBox.classList.remove("hidden");
  winnerText.textContent = `🏆 Vince ${winnerName}! Ha raggiunto ${game.targetScore} punti.`;
  // disabilita controlli
  rollTopicBtn.disabled = true;
  [diffEasyBtn, diffMedBtn, diffHardBtn].forEach(b=> b && (b.disabled = false));
  drawQuestionBtn.disabled = true;
  endTurnBtn.disabled = true;
  nextTurnBtn.classList.add("hidden");
  stopTimer();
}

function startGame(){
  ensureAudio();
  const n = parseInt(playerCountSel.value,10);
  const names = Array.from(playersBox.querySelectorAll("input")).slice(0,n).map(i => i.value.trim() || i.placeholder);
  const targetScore = parseInt(targetScoreInput.value,10) || 50;
  const seconds = parseInt(secondsPerTurnInput.value,10) || 60;

  game = {
    players: names.map(name => ({ name, score: 0 })),
    turnIndex: 0,
    targetScore,
    seconds,
  };

  initPools();

  setupView.classList.add("hidden");
  gameView.classList.remove("hidden");
  winnerBox.classList.add("hidden");

  rollTopicBtn.disabled = false;
  [diffEasyBtn, diffMedBtn, diffHardBtn].forEach(b=> b && (b.disabled = false));

  setCurrentPlayer();
  resetTurnUI();
  setStatus("Lancia i dadi");
}

function drawQuestion(){
  if(!canDraw()) return;
  const topic = rolledTopic.topic;
  const diffLabel = rolledDiff.label;

  const q = getNextQuestion(topic, diffLabel);
  showQuestion(q);

  drawQuestionBtn.disabled = true;
  endTurnBtn.disabled = true;
}

function restart(){
  // torna al setup
  setupView.classList.remove("hidden");
  gameView.classList.add("hidden");
  setStatus("Pronto");
  buildPlayersInputs();
}

async function loadData(){
  setStatus("Caricamento domande…");
  const res = await fetch("questions.it.json");
  const data = await res.json();
  DATA = data;
  buildPlayersInputs();
  buildMapping();
  setStatus("Pronto");
}

// Hook eventi
playerCountSel.addEventListener("change", buildPlayersInputs);

startBtn.addEventListener("click", startGame);

rollTopicBtn.addEventListener("click", ()=>{ rollD10(); });
diffEasyBtn.addEventListener("click", ()=> selectDifficulty(1));
diffMedBtn.addEventListener("click", ()=> selectDifficulty(2));
diffHardBtn.addEventListener("click", ()=> selectDifficulty(3));

drawQuestionBtn.addEventListener("click", drawQuestion);

endTurnBtn.addEventListener("click", ()=>{
  if(endTurnBtn.disabled) return;
  sRoll();
  nextTurn();
});

nextTurnBtn.addEventListener("click", ()=>{ endTurnBtn.disabled=false; endTurnBtn.click(); });
restartBtn.addEventListener("click", restart);

// Avvio
loadData();
