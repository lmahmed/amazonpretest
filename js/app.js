// ═══════════════════════════════════════════════════════════════
// AMAZON ENGLISH TEST PRACTICE — app.js
// ═══════════════════════════════════════════════════════════════

// ─── STATE ──────────────────────────────────────────────────────
const state = {
  section: 0,
  questionIndex: 0,
  mcScore: 0,
  mcTotal: 0,
  sentenceIndex: 0,
  storyIndex: 0,
  mcSet: [],
  sentenceSet: [],
  storySet: [],
  recognition: null,
  isRecording: false,
  transcript: '',
  originalText: '',
  audioContext: null,
  analyser: null,
  animFrameId: null,
  timerInterval: null,
  timerSeconds: 0,
  ttsUtterance: null,
};

// ─── DATA ────────────────────────────────────────────────────────
let DATA = { mc: [], sentences: [], stories: [] };
let currentReplayAudio = null;

// ─── LOAD DATA ───────────────────────────────────────────────────
async function loadData() {
  try {
    const [mc, sentences, stories] = await Promise.all([
      fetch('data/mc.json').then(r => r.json()),
      fetch('data/sentences.json').then(r => r.json()),
      fetch('data/stories.json').then(r => r.json()),
    ]);
    DATA.mc = mc;
    DATA.sentences = sentences;
    DATA.stories = stories;
  } catch (e) {
    console.error('Failed to load data:', e);
    alert('Could not load question banks. Make sure the data/ folder is in the same directory.');
  }
}

// ─── UTILITIES ───────────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function show(id) { document.getElementById(id).classList.add('active'); }
function hide(id) { document.getElementById(id).classList.remove('active'); }
function showScreen(id) {
  window.speechSynthesis.cancel();
  stopReplayAudio();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function el(id) { return document.getElementById(id); }

// ─── TTS ─────────────────────────────────────────────────────────
function speak(text, onEnd) {
  return new Promise((resolve) => {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.92;
    utt.pitch = 1.0;
    utt.lang = 'en-US';

    // Try to pick a natural voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Google US') || v.name.includes('Alex') || v.name.includes('Karen'))
    ) || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utt.voice = preferred;

    utt.onend = () => { if (onEnd) onEnd(); resolve(); };
    utt.onerror = () => resolve();
    window.speechSynthesis.speak(utt);
    state.ttsUtterance = utt;
  });
}

// ─── LANDING ─────────────────────────────────────────────────────
let audioChecked = false;
let micChecked = false;

el('btn-test-audio').addEventListener('click', async () => {
  const btn = el('btn-test-audio');
  if (btn.classList.contains('testing')) return;
  if (btn.classList.contains('success')) {
    await speak("This is a sample sentence to test your audio. If you can hear this, your audio is working.");
    return;
  }

  btn.classList.add('testing');
  btn.querySelector('.check-label').textContent = 'Playing...';
  el('audio-confirm').style.display = 'none';

  await speak("This is a sample sentence to test your audio. If you can hear this, your audio is working.");

  btn.querySelector('.check-label').textContent = 'Did you hear it?';
  btn.classList.remove('testing');

  el('audio-confirm').style.display = 'flex';
  el('audio-confirm').innerHTML = `
    <button onclick="confirmAudio(true)" style="padding:10px 6px;border-radius:10px;border:1.5px solid var(--success);background:rgba(62,207,142,0.08);color:var(--success);font-family:var(--font-body);font-size:12px;font-weight:600;cursor:pointer;width:100%;">✅ Yes, heard it</button>
    <button onclick="confirmAudio(false)" style="padding:10px 6px;border-radius:10px;border:1.5px solid var(--border2);background:var(--surface2);color:var(--muted2);font-family:var(--font-body);font-size:12px;font-weight:600;cursor:pointer;width:100%;">↺ Play again</button>
  `;
});

window.confirmAudio = async function(passed) {
  if (passed) {
    el('audio-confirm').style.display = 'none';
    const btn = el('btn-test-audio');
    btn.classList.add('success');
    btn.querySelector('.icon').textContent = '✅';
    btn.querySelector('.check-label').textContent = 'Audio OK';
    audioChecked = true;
    checkReady();
  } else {
    el('audio-confirm').style.display = 'none';
    el('btn-test-audio').classList.remove('success');
    el('btn-test-audio').click();
  }
};

// Persistent mic stream — opened once, reused across retries
let micTestStream = null;
let micTestMimeType = '';

async function runMicTest() {
  const btn = el('btn-test-mic');
  el('mic-confirm').style.display = 'none';
  btn.classList.remove('success');
  btn.classList.add('testing');

  try {
    // Only open the mic stream once — reuse on retries
    if (!micTestStream || micTestStream.getTracks().every(t => t.readyState === 'ended')) {
      btn.querySelector('.icon').textContent = '⏳';
      btn.querySelector('.check-label').textContent = 'Opening mic...';
      micTestStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micTestMimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find(t => MediaRecorder.isTypeSupported(t)) || '';
      // Give the audio pipeline a moment to warm up before recording
      await pause(500);
    }

    const chunks = [];
    const mediaRecorder = new MediaRecorder(
      micTestStream,
      micTestMimeType ? { mimeType: micTestMimeType } : {}
    );

    mediaRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    // Start recording — countdown begins only after this
    mediaRecorder.start(100);

    let secs = 3;
    btn.querySelector('.icon').textContent = '⏺';
    btn.querySelector('.check-label').textContent = `Recording ${secs}s...`;

    await new Promise(res => {
      const countdown = setInterval(() => {
        secs--;
        if (secs > 0) {
          btn.querySelector('.check-label').textContent = `Recording ${secs}s...`;
        } else {
          clearInterval(countdown);
          res();
        }
      }, 1000);
    });

    // Stop just the recorder — NOT the stream (keep stream alive for retry)
    await new Promise(res => {
      mediaRecorder.onstop = res;
      mediaRecorder.stop();
    });

    btn.querySelector('.icon').textContent = '🔊';
    btn.querySelector('.check-label').textContent = 'Playing back...';

    await pause(100);

    await new Promise(res => {
      if (chunks.length === 0) { res(); return; }
      const blob = new Blob(chunks, { type: micTestMimeType || 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); res(); };
      audio.onerror = () => { URL.revokeObjectURL(url); res(); };
      audio.play().catch(() => res());
    });

    btn.querySelector('.icon').textContent = '🎤';
    btn.querySelector('.check-label').textContent = 'Did you hear yourself?';
    btn.classList.remove('testing');

    el('mic-confirm').style.display = 'flex';
    el('mic-confirm').innerHTML = `
      <button onclick="confirmMic(true)" style="padding:10px 6px;border-radius:10px;border:1.5px solid var(--success);background:rgba(62,207,142,0.08);color:var(--success);font-family:var(--font-body);font-size:12px;font-weight:600;cursor:pointer;width:100%;">✅ Yes, heard it</button>
      <button onclick="confirmMic(false)" style="padding:10px 6px;border-radius:10px;border:1.5px solid var(--border2);background:var(--surface2);color:var(--muted2);font-family:var(--font-body);font-size:12px;font-weight:600;cursor:pointer;width:100%;">↺ Try again</button>
    `;
  } catch (e) {
    // On error, release stream so next attempt re-opens it
    if (micTestStream) { micTestStream.getTracks().forEach(t => t.stop()); micTestStream = null; }
    btn.classList.remove('testing');
    btn.querySelector('.icon').textContent = '❌';
    btn.querySelector('.check-label').textContent = 'Denied — check settings';
  }
}

el('btn-test-mic').addEventListener('click', () => {
  const btn = el('btn-test-mic');
  if (btn.classList.contains('testing') || btn.classList.contains('success')) return;
  runMicTest();
});

window.confirmMic = async function(passed) {
  if (passed) {
    // Release stream now that we're done with mic test
    if (micTestStream) { micTestStream.getTracks().forEach(t => t.stop()); micTestStream = null; }
    el('mic-confirm').style.display = 'none';
    const btn = el('btn-test-mic');
    btn.classList.add('success');
    btn.querySelector('.icon').textContent = '✅';
    btn.querySelector('.check-label').textContent = 'Mic OK';
    micChecked = true;
    checkReady();
  } else {
    // Retry — stream stays open, just run again immediately
    runMicTest();
  }
};

function checkReady() {
  if (audioChecked && micChecked) {
    el('start-btn').classList.add('ready');
  }
}

el('start-btn').addEventListener('click', startTest);

// ─── START TEST ───────────────────────────────────────────────────
function startTest() {
  // Always random
  state.mcSet        = shuffle([...DATA.mc]).slice(0, 6);
  state.sentenceSet  = shuffle([...DATA.sentences]).slice(0, 8);
  state.storySet     = shuffle([...DATA.stories]).slice(0, 2);

  state.section       = 0;
  state.mcScore       = 0;
  state.mcTotal       = 0;
  state.questionIndex = 0;
  state.sentenceIndex = 0;
  state.storyIndex    = 0;

  showIntro(0);
}

// ─── INTRO SCREENS ────────────────────────────────────────────────
const SECTION_INFO = [
  {
    badge: 'Part 1 of 3',
    title: 'Choose a Response',
    desc: 'You will hear a statement followed by three possible responses — A, B, and C. Choose the one that makes the most sense.',
    rules: [
      { icon: '🔊', text: 'Tap the play button to hear the statement and choices.' },
      { icon: '⏱', text: 'You have 8 seconds after the audio ends to select an answer.' },
      { icon: '❌', text: 'No replays — listen carefully the first time.' },
      { icon: '📝', text: '6 questions total.' },
    ],
    btnText: 'Begin Part 1',
  },
  {
    badge: 'Part 2 of 3',
    title: 'Repeat the Sentence',
    desc: 'You will hear a sentence. After the audio ends, repeat it out loud as accurately as you can.',
    rules: [
      { icon: '🔊', text: 'Tap play to hear the sentence once.' },
      { icon: '🎤', text: 'Your microphone opens automatically after the audio ends.' },
      { icon: '✅', text: 'Tap Done when you finish speaking.' },
      { icon: '📝', text: '8 sentences total.' },
    ],
    btnText: 'Begin Part 2',
  },
  {
    badge: 'Part 3 of 3',
    title: 'Retell the Story',
    desc: 'You will hear a short story twice. After the second telling, retell it in your own words.',
    rules: [
      { icon: '🔊', text: 'Tap play — the story will be read to you twice.' },
      { icon: '🎤', text: 'Your mic opens automatically after the second telling.' },
      { icon: '⏱', text: 'You have 30 seconds to retell the story out loud.' },
      { icon: '📝', text: '2 stories total.' },
    ],
    btnText: 'Begin Part 3',
  },
];

function showIntro(sectionIndex) {
  const info = SECTION_INFO[sectionIndex];
  el('intro-badge').textContent = info.badge;
  el('intro-title').textContent = info.title;
  el('intro-desc').textContent = info.desc;

  const rulesList = el('intro-rules');
  rulesList.innerHTML = info.rules.map(r =>
    `<div class="rule-item"><span class="rule-icon">${r.icon}</span><span>${r.text}</span></div>`
  ).join('');

  el('intro-next-btn').textContent = info.btnText;
  el('intro-next-btn').onclick = () => {
    state.section = sectionIndex;
    if (sectionIndex === 0) loadMCQuestion();
    else if (sectionIndex === 1) loadSentenceQuestion();
    else if (sectionIndex === 2) loadStoryQuestion();
    showScreen('screen-question');
  };

  showScreen('screen-intro');
}

// ─── QUESTION SCREEN HELPERS ──────────────────────────────────────
function setHeader(label, current, total) {
  el('q-section-label').textContent = label;
  el('q-counter').textContent = `${current} / ${total}`;
  el('q-progress').style.width = `${((current - 1) / total) * 100}%`;
}

function resetQuestionUI() {
  window.speechSynthesis.cancel();
  stopReplayAudio();
  stopRecording();
  clearTimers();
  // Hide all dynamic sections
  el('play-wrap').style.display = '';
  el('choices-wrap').classList.remove('show');
  el('timer-wrap').classList.remove('show');
  el('visualizer-wrap').classList.remove('show');
  el('done-btn').classList.remove('show');
  el('reveal-wrap').classList.remove('show');
  el('q-next-btn').classList.remove('show');

  // Reset play btn
  const pb = el('play-btn');
  pb.disabled = false;
  pb.classList.remove('playing', 'played');
  pb.innerHTML = '▶';
  el('play-hint').style.display = '';
  el('playing-label').classList.remove('show');

  // Reset timer
  resetTimerBar();

  state.transcript = '';
  state.originalText = '';
}

function resetTimerBar() {
  const track = el('timer-track');
  track.classList.remove('run-8', 'run-30');
  // Force reflow
  void track.offsetWidth;
}

function clearTimers() {
  if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
}

// ─── SECTION 1: MULTIPLE CHOICE ───────────────────────────────────
function loadMCQuestion() {
  resetQuestionUI();
  const q = state.mcSet[state.questionIndex];
  setHeader('Choose a Response', state.questionIndex + 1, state.mcSet.length);

  // Build choices — letters only, no text (user heard them via audio)
  const letters = ['A', 'B', 'C'];
  el('choices-wrap').innerHTML = q.choices.map((c, i) =>
    `<button class="choice-btn" data-index="${i}" onclick="selectMCChoice(${i})" disabled>
      <span class="choice-letter">${letters[i]}</span>
    </button>`
  ).join('');

  el('play-hint').textContent = 'Tap to hear the statement and choices';

  el('play-btn').onclick = () => playMCAudio(q);
}

async function playMCAudio(q) {
  const pb = el('play-btn');
  pb.disabled = true;
  pb.classList.add('playing');
  pb.innerHTML = '⏸';
  el('play-hint').style.display = 'none';
  el('playing-label').classList.add('show');
  el('playing-label').textContent = 'Playing statement...';

  // Speak statement
  await speak(q.statement);
  await pause(400);

  // Speak each choice
  const letters = ['A', 'B', 'C'];
  for (let i = 0; i < q.choices.length; i++) {
    el('playing-label').textContent = `Playing choice ${letters[i]}...`;
    await speak(`${letters[i]}. ${q.choices[i]}`);
    if (i < q.choices.length - 1) await pause(300);
  }

  // Audio done — show choices, start timer
  pb.classList.remove('playing');
  pb.classList.add('played');
  pb.innerHTML = '✓';
  el('playing-label').classList.remove('show');
  el('play-hint').style.display = 'none';

  el('choices-wrap').classList.add('show');
  document.querySelectorAll('.choice-btn').forEach(b => b.removeAttribute('disabled'));

  startMCTimer(q);
}

function startMCTimer(q) {
  el('timer-wrap').classList.add('show');
  el('timer-label-text').textContent = 'Time to answer';
  state.timerSeconds = 8;
  el('timer-num').textContent = state.timerSeconds;

  // CSS animation
  resetTimerBar();
  void el('timer-track').offsetWidth;
  el('timer-track').classList.add('run-8');

  state.timerInterval = setInterval(() => {
    state.timerSeconds--;
    el('timer-num').textContent = state.timerSeconds;
    if (state.timerSeconds <= 0) {
      clearTimers();
      timeUpMC(q);
    }
  }, 1000);
}

function timeUpMC(q) {
  document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
  revealMCAnswer(q, -1); // -1 = timed out, no selection
}

function selectMCChoice(idx) {
  clearTimers();
  document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
  revealMCAnswer(state.mcSet[state.questionIndex], idx);
}

function revealMCAnswer(q, selectedIdx) {
  state.mcTotal++;
  const correct = selectedIdx === q.correct;
  if (correct) state.mcScore++;

  const btns = document.querySelectorAll('.choice-btn');
  if (selectedIdx >= 0) {
    btns[selectedIdx].classList.add(correct ? 'correct' : 'incorrect');
  }
  if (!correct) {
    btns[q.correct].classList.add('reveal-correct');
  }

  // Build reveal
  const isCorrect = correct;
  const timedOut  = selectedIdx === -1;

  el('reveal-wrap').innerHTML = `
    <div class="reveal-card">
      <div class="reveal-card-header ${isCorrect ? 'result-correct' : 'result-incorrect'}">
        ${timedOut ? '⏱ Time\'s Up' : isCorrect ? '✅ Correct!' : '❌ Incorrect'}
      </div>
      <div class="reveal-card-body">
        <div style="margin-bottom:10px">
          <span style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:4px">Statement</span>
          ${q.statement}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
          ${q.choices.map((c,i) => `
            <div style="display:flex;gap:10px;align-items:flex-start;padding:8px;border-radius:8px;background:${i===q.correct?'rgba(62,207,142,0.08)':selectedIdx===i&&!isCorrect?'rgba(224,92,92,0.08)':'transparent'}">
              <span style="font-family:var(--font-display);font-weight:700;font-size:13px;color:${i===q.correct?'var(--success)':selectedIdx===i&&!isCorrect?'var(--error)':'var(--muted)'};flex-shrink:0">${['A','B','C'][i]}</span>
              <span style="font-size:14px;color:${i===q.correct?'var(--text)':'var(--muted2)'}">${c}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="explanation-card ${isCorrect ? '' : 'wrong'}">
      ${isCorrect
        ? `<strong>Why this works:</strong> ${q.explanation_correct}`
        : `<strong>Why ${timedOut ? 'the correct answer works' : 'your answer doesn\'t fit'}:</strong> ${q.explanation_wrong}<br><br><strong>The correct answer works because:</strong> ${q.explanation_correct}`
      }
    </div>
  `;

  el('reveal-wrap').classList.add('show');
  el('timer-wrap').classList.remove('show');

  // Next button
  el('q-next-btn').textContent = state.questionIndex + 1 < state.mcSet.length ? 'Next Question →' : 'Continue to Part 2 →';
  el('q-next-btn').classList.add('show');
  el('q-next-btn').onclick = () => {
    state.questionIndex++;
    if (state.questionIndex < state.mcSet.length) {
      loadMCQuestion();
    } else {
      state.questionIndex = 0;
      showIntro(1);
    }
  };
}

// ─── SECTION 2: SENTENCES ─────────────────────────────────────────
function loadSentenceQuestion() {
  resetQuestionUI();
  const sentence = state.sentenceSet[state.sentenceIndex];
  state.originalText = sentence;
  setHeader('Repeat the Sentence', state.sentenceIndex + 1, state.sentenceSet.length);

  el('play-hint').textContent = 'Tap to hear the sentence';
  el('choices-wrap').innerHTML = '';

  el('play-btn').onclick = () => playSentenceAudio(sentence);
}

async function playSentenceAudio(sentence) {
  const pb = el('play-btn');
  pb.disabled = true;
  pb.classList.add('playing');
  pb.innerHTML = '⏸';
  el('play-hint').style.display = 'none';
  el('playing-label').classList.add('show');
  el('playing-label').textContent = 'Listen carefully...';

  await speak(sentence);

  pb.classList.remove('playing');
  pb.classList.add('played');
  pb.innerHTML = '✓';
  el('playing-label').classList.remove('show');

  // Auto-open mic
  await pause(300);
  startSentenceRecording();
}

async function startSentenceRecording() {
  el('visualizer-label-text').textContent = 'Opening mic...';
  el('visualizer-wrap').classList.add('show');
  el('done-btn').classList.add('show');
  state.isRecording = true;
  state.transcript = '';
  finalTranscriptBuffer = '';
  interimTranscriptBuffer = '';

  // Initialize both simultaneously — avoids mid-recording mic conflict
  await Promise.all([
    startVisualizer(),
    new Promise(res => {
      startSpeechRecognition();
      setTimeout(res, 100); // give SR a moment to init
    })
  ]);

  el('visualizer-label-text').textContent = 'Speak now — repeat the sentence';
}

el('done-btn').addEventListener('click', async () => {
  if (!state.isRecording) return;
  await stopRecording();
  revealSentence();
});

function revealSentence() {
  el('visualizer-wrap').classList.remove('show');
  el('done-btn').classList.remove('show');

  el('reveal-wrap').innerHTML = `
    <div class="reveal-card">
      <div class="reveal-card-header original">
        ✦ Original Sentence
        <button class="replay-btn" onclick="replayOriginal()">↺ Replay</button>
      </div>
      <div class="reveal-card-body">${state.originalText}</div>
    </div>
    <div class="reveal-card">
      <div class="reveal-card-header yours">
        🎤 What You Said
        <button class="replay-btn" onclick="replayYours()">↺ Replay</button>
      </div>
      <div class="reveal-card-body ${state.transcript ? '' : 'muted'}">
        ${state.transcript || 'No speech detected — try again in a quieter environment or check mic permissions.'}
      </div>
    </div>
  `;

  el('reveal-wrap').classList.add('show');

  const isLast = state.sentenceIndex + 1 >= state.sentenceSet.length;
  el('q-next-btn').textContent = isLast ? 'Continue to Part 3 →' : 'Next Sentence →';
  el('q-next-btn').classList.add('show');
  el('q-next-btn').onclick = () => {
    state.sentenceIndex++;
    if (state.sentenceIndex < state.sentenceSet.length) {
      loadSentenceQuestion();
    } else {
      state.sentenceIndex = 0;
      showIntro(2);
    }
  };
}

function stopReplayAudio() {
  if (currentReplayAudio) {
    currentReplayAudio.pause();
    currentReplayAudio.currentTime = 0;
    currentReplayAudio = null;
  }
}

function replayOriginal() { stopReplayAudio(); speak(state.originalText); }
function replayYours() {
  if (lastRecordingBlob) {
    stopReplayAudio();
    window.speechSynthesis.cancel();
    const url = URL.createObjectURL(lastRecordingBlob);
    currentReplayAudio = new Audio(url);
    currentReplayAudio.onended = () => { URL.revokeObjectURL(url); currentReplayAudio = null; };
    currentReplayAudio.onerror = () => { URL.revokeObjectURL(url); currentReplayAudio = null; };
    currentReplayAudio.play().catch(() => {});
  } else if (state.transcript) {
    speak(state.transcript);
  }
}

// ─── SECTION 3: STORIES ───────────────────────────────────────────
function loadStoryQuestion() {
  resetQuestionUI();
  const story = state.storySet[state.storyIndex];
  state.originalText = story.text;
  setHeader('Retell the Story', state.storyIndex + 1, state.storySet.length);

  el('play-hint').textContent = 'Tap to hear the story (played twice)';
  el('choices-wrap').innerHTML = '';

  el('play-btn').onclick = () => playStoryAudio(story);
}

async function playStoryAudio(story) {
  const pb = el('play-btn');
  pb.disabled = true;
  pb.classList.add('playing');
  pb.innerHTML = '⏸';
  el('play-hint').style.display = 'none';
  el('playing-label').classList.add('show');
  el('playing-label').textContent = 'First telling...';

  await speak(story.text);
  await pause(800);

  el('playing-label').textContent = 'The story will now be repeated.';
  await speak('The story will now be repeated.');
  await pause(600);

  el('playing-label').textContent = 'Second telling...';
  await speak(story.text);

  pb.classList.remove('playing');
  pb.classList.add('played');
  pb.innerHTML = '✓';
  el('playing-label').classList.remove('show');

  // Auto-open mic + 30s timer
  await pause(400);
  startStoryRecording(story);
}

async function startStoryRecording(story) {
  el('visualizer-label-text').textContent = 'Opening mic...';
  el('visualizer-wrap').classList.add('show');
  el('timer-label-text').textContent = 'Time to retell';
  state.timerSeconds = 30;
  el('timer-num').textContent = state.timerSeconds;
  state.isRecording = true;
  state.transcript = '';
  finalTranscriptBuffer = '';
  interimTranscriptBuffer = '';

  // Initialize both simultaneously — avoids mid-recording mic conflict
  await Promise.all([
    startVisualizer(),
    new Promise(res => {
      startSpeechRecognition();
      setTimeout(res, 100);
    })
  ]);

  // Show timer only after both are ready
  el('visualizer-label-text').textContent = 'Retell the story now — 30 seconds';
  el('timer-wrap').classList.add('show');
  resetTimerBar();
  void el('timer-track').offsetWidth;
  el('timer-track').classList.add('run-30');

  // Use async countdown instead of setInterval so we can await stopRecording
  (async () => {
    while (state.timerSeconds > 0 && state.isRecording) {
      await pause(1000);
      if (!state.isRecording) break;
      state.timerSeconds--;
      el('timer-num').textContent = state.timerSeconds;
    }
    if (state.isRecording) {
      state.isRecording = false;
      clearTimers();
      await stopRecording();
      revealStory(story);
    }
  })();
}

function revealStory(story) {
  el('visualizer-wrap').classList.remove('show');
  el('timer-wrap').classList.remove('show');

  el('reveal-wrap').innerHTML = `
    <div class="reveal-card">
      <div class="reveal-card-header original">
        ✦ Original Story
        <button class="replay-btn" onclick="replayStory()">↺ Replay</button>
      </div>
      <div class="reveal-card-body" style="font-size:14px;line-height:1.8">${story.text}</div>
    </div>
    <div class="reveal-card">
      <div class="reveal-card-header yours">
        🎤 What You Said
        <button class="replay-btn" onclick="replayYours()">↺ Replay</button>
      </div>
      <div class="reveal-card-body ${state.transcript ? '' : 'muted'}">
        ${state.transcript || 'No speech detected — try again in a quieter environment or check mic permissions.'}
      </div>
    </div>
    <div class="keypoints-card">
      <div class="keypoints-header">☑ Did you cover these?</div>
      ${story.key_points.map((kp, i) => `
        <div class="keypoint-item" id="kp-${i}" onclick="toggleKeypoint(${i})">
          <div class="kp-check" id="kpc-${i}"></div>
          <div class="kp-text">${kp}</div>
        </div>
      `).join('')}
    </div>
  `;

  el('reveal-wrap').classList.add('show');

  const isLast = state.storyIndex + 1 >= state.storySet.length;
  el('q-next-btn').textContent = isLast ? 'See Results →' : 'Next Story →';
  el('q-next-btn').classList.add('show');
  el('q-next-btn').onclick = () => {
    state.storyIndex++;
    if (state.storyIndex < state.storySet.length) {
      loadStoryQuestion();
    } else {
      showResults();
    }
  };
}

function replayStory() { speak(state.originalText); }

function toggleKeypoint(i) {
  const item = el(`kp-${i}`);
  const check = el(`kpc-${i}`);
  const checked = item.classList.toggle('checked');
  check.textContent = checked ? '✓' : '';
}

// ─── VISUALIZER ───────────────────────────────────────────────────
let questionMicStream = null;
let questionMicRecorder = null;
let questionRecordingChunks = [];
let questionRecordingMime = '';
let lastRecordingBlob = null;

async function startVisualizer() {
  try {
    questionMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    questionRecordingMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';

    if (!state.audioContext) {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioContext.state === 'suspended') {
      await state.audioContext.resume();
    }

    const source = state.audioContext.createMediaStreamSource(questionMicStream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 64;
    source.connect(state.analyser);

    questionRecordingChunks = [];
    lastRecordingBlob = null;
    questionMicRecorder = new MediaRecorder(
      questionMicStream,
      questionRecordingMime ? { mimeType: questionRecordingMime } : {}
    );
    questionMicRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) questionRecordingChunks.push(e.data);
    };
    questionMicRecorder.start(100);

    drawVisualizer();
  } catch (e) {
    console.error('Visualizer error:', e);
  }
}

function drawVisualizer() {
  const canvas = el('visualizer-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.offsetWidth;
  const H = canvas.height = canvas.offsetHeight;

  const bufferLength = state.analyser ? state.analyser.frequencyBinCount : 0;
  const dataArray = state.analyser ? new Uint8Array(bufferLength) : new Uint8Array(0);

  function draw() {
    state.animFrameId = requestAnimationFrame(draw);
    ctx.clearRect(0, 0, W, H);

    if (!state.analyser || !state.isRecording) {
      const barCount = 24;
      const barW = Math.floor(W / barCount) - 2;
      for (let i = 0; i < barCount; i++) {
        const x = i * (barW + 2);
        ctx.fillStyle = 'rgba(62,207,207,0.15)';
        ctx.beginPath();
        ctx.roundRect(x, H / 2 - 2, barW, 4, 2);
        ctx.fill();
      }
      return;
    }

    state.analyser.getByteFrequencyData(dataArray);

    const barCount = 28;
    const barW = Math.floor(W / barCount) - 2;

    for (let i = 0; i < barCount; i++) {
      const dataIndex = Math.floor((i / barCount) * bufferLength);
      const value = dataArray[dataIndex] / 255;
      const barH = Math.max(4, value * H * 0.85);
      const x = i * (barW + 2);
      const y = (H - barH) / 2;
      const alpha = 0.4 + value * 0.6;
      ctx.fillStyle = value > 0.6
        ? `rgba(245,166,35,${alpha})`
        : `rgba(62,207,207,${alpha})`;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 3);
      ctx.fill();
    }
  }

  draw();
}

// ─── VISUALIZER ───────────────────────────────────────────────────
async function stopVisualizer() {
  if (state.animFrameId) {
    cancelAnimationFrame(state.animFrameId);
    state.animFrameId = null;
  }
  state.analyser = null;

  // Stop recorder and build blob for playback
  if (questionMicRecorder && questionMicRecorder.state !== 'inactive') {
    await new Promise(res => {
      questionMicRecorder.onstop = res;
      questionMicRecorder.stop();
    });
    if (questionRecordingChunks.length > 0) {
      lastRecordingBlob = new Blob(questionRecordingChunks, { type: questionRecordingMime || 'audio/webm' });
    }
  }
  questionMicRecorder = null;

  // Close stream fully — this turns off the browser mic indicator
  if (questionMicStream) {
    questionMicStream.getTracks().forEach(t => t.stop());
    questionMicStream = null;
  }

  const canvas = el('visualizer-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// ─── SPEECH RECOGNITION ───────────────────────────────────────────
let recognitionRestarting = false;
let finalTranscriptBuffer = '';
let interimTranscriptBuffer = '';

function startSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    console.warn('Speech recognition not supported');
    return;
  }

  recognitionRestarting = false;
  finalTranscriptBuffer = '';
  interimTranscriptBuffer = '';

  function createAndStart() {
    if (!state.isRecording) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal) {
          finalTranscriptBuffer += t + ' ';
        } else {
          interim += t;
        }
      }
      interimTranscriptBuffer = interim;
      state.transcript = (finalTranscriptBuffer + interimTranscriptBuffer).trim();
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      console.warn('Recognition error:', e.error);
    };

    recognition.onend = () => {
      // Commit any interim that got cut off before finalizing
      if (interimTranscriptBuffer.trim()) {
        finalTranscriptBuffer += interimTranscriptBuffer.trim() + ' ';
        interimTranscriptBuffer = '';
        state.transcript = finalTranscriptBuffer.trim();
      }
      // Restart if still recording
      if (state.isRecording && !recognitionRestarting) {
        recognitionRestarting = true;
        setTimeout(() => {
          recognitionRestarting = false;
          createAndStart();
        }, 50);
      }
    };

    try {
      recognition.start();
      state.recognition = recognition;
    } catch(e) {
      console.warn('Recognition start failed:', e);
    }
  }

  createAndStart();
}

async function stopRecording() {
  state.isRecording = false;
  recognitionRestarting = true; // prevent any pending restart from firing
  if (state.recognition) {
    try { state.recognition.stop(); } catch(e) {}
    state.recognition = null;
  }
  await stopVisualizer();
}

// ─── RESULTS SCREEN ───────────────────────────────────────────────
function showResults() {
  el('result-mc-score').textContent   = state.mcScore;
  el('result-mc-total').textContent   = `out of ${state.mcSet.length}`;
  el('result-sent-total').textContent = `${state.sentenceSet.length} done`;
  el('result-story-total').textContent = `${state.storySet.length} done`;

  const pct = Math.round((state.mcScore / state.mcSet.length) * 100);
  let emoji = '🌟', msg = 'Great work!';
  if (pct === 100) { emoji = '🏆'; msg = 'Perfect score on MC!'; }
  else if (pct >= 66) { emoji = '👍'; msg = 'Good job — keep practicing!'; }
  else { emoji = '💪'; msg = 'Keep going — practice makes perfect!'; }

  el('results-emoji').textContent = emoji;
  el('results-msg').textContent = msg;

  showScreen('screen-results');
}

el('btn-retake-new').addEventListener('click', () => startTest());

el('btn-retake-same').addEventListener('click', () => {
  // Reset indexes but keep same sets from last test
  state.section       = 0;
  state.mcScore       = 0;
  state.mcTotal       = 0;
  state.questionIndex = 0;
  state.sentenceIndex = 0;
  state.storyIndex    = 0;
  showIntro(0);
});

// ─── DEV SKIP ────────────────────────────────────────────────────
window.devSkip = function(section) {
  window.speechSynthesis.cancel();
  stopReplayAudio();

  // Ensure data is loaded and sets are built
  if (!state.mcSet.length) {
    state.mcSet        = shuffle([...DATA.mc]).slice(0, 6);
    state.sentenceSet  = shuffle([...DATA.sentences]).slice(0, 8);
    state.storySet     = shuffle([...DATA.stories]).slice(0, 2);
  }

  if (section === 'landing') {
    showScreen('screen-landing');
  } else if (section === 'mc') {
    state.section = 0;
    state.questionIndex = 0;
    showIntro(0);
  } else if (section === 'sentences') {
    state.section = 1;
    state.sentenceIndex = 0;
    showIntro(1);
  } else if (section === 'stories') {
    state.section = 2;
    state.storyIndex = 0;
    showIntro(2);
  } else if (section === 'results') {
    showResults();
  }
};
function pause(ms) { return new Promise(res => setTimeout(res, ms)); }

// ─── INIT ─────────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  await loadData();
  // Preload voices
  window.speechSynthesis.getVoices();
  showScreen('screen-landing');
});

// Reload voices on change (needed for some browsers)
window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
