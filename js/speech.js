// Text-to-speech engine: Web Speech API synthesis for guides, tutorials and tips.
// Works seamlessly in Hebrew and English with smart markup stripping and pause management.

var activeUtterance = null;
var activeButton = null;
var keepAliveTimer = null;
var speechListeners = [];
var cachedVoices = [];

function hasSpeechSupport() {
  return typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined" &&
    typeof window.SpeechSynthesisUtterance !== "undefined";
}

function loadVoices() {
  if (!hasSpeechSupport()) return;
  try {
    cachedVoices = window.speechSynthesis.getVoices() || [];
  } catch (_) {
    cachedVoices = [];
  }
}

if (hasSpeechSupport()) {
  loadVoices();
  if (typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
  window.addEventListener("pagehide", function () { stopSpeaking(); });
  window.addEventListener("beforeunload", function () { stopSpeaking(); });
}

function findVoice(langCode) {
  if (!hasSpeechSupport()) return null;
  if (!cachedVoices.length) loadVoices();
  var prefix = (langCode || "he").toLowerCase().slice(0, 2);
  for (var i = 0; i < cachedVoices.length; i++) {
    var v = cachedVoices[i];
    var vLang = (v.lang || "").toLowerCase().replace("_", "-");
    if (vLang.startsWith(prefix)) return v;
  }
  return null;
}

function startKeepAlive() {
  stopKeepAlive();
  if (!hasSpeechSupport()) return;
  // Chrome synthesis pauses silently on utterances longer than ~15 seconds without this poke
  keepAliveTimer = setInterval(function () {
    if (!window.speechSynthesis || !window.speechSynthesis.speaking) {
      stopKeepAlive();
      return;
    }
    window.speechSynthesis.pause();
    window.speechSynthesis.resume();
  }, 10000);
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

function notifyListeners(speaking, button) {
  for (var i = 0; i < speechListeners.length; i++) {
    try {
      speechListeners[i](speaking, button);
    } catch (_) {}
  }
}

export function onSpeechStateChange(fn) {
  if (typeof fn !== "function") return function () {};
  speechListeners.push(fn);
  return function off() {
    var i = speechListeners.indexOf(fn);
    if (i !== -1) speechListeners.splice(i, 1);
  };
}

export function isSpeaking() {
  if (!hasSpeechSupport()) return false;
  try {
    return !!(window.speechSynthesis.speaking || window.speechSynthesis.pending);
  } catch (_) {
    return false;
  }
}

export function stopSpeaking() {
  stopKeepAlive();
  var hadBtn = activeButton;
  activeUtterance = null;
  activeButton = null;
  if (hasSpeechSupport()) {
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
  }
  notifyListeners(false, hadBtn);
}

export function cleanSpeechText(input, lang) {
  var he = String(lang || "he").toLowerCase().slice(0, 2) !== "en";
  if (Array.isArray(input)) {
    return input
      .map(function (item) { return cleanSpeechText(item, lang); })
      .filter(function (str) { return !!str; })
      // the joiner supplies the sentence break, so an item that already ends in
      // one must not keep it — otherwise the reader hits ".." between entries
      .map(function (str) { return str.replace(/\s*\.\s*$/, ""); })
      .join(". ");
  }
  if (!input) return "";
  var str = String(input);
  // Replace HTML breaks and paragraph tags with periods to create natural speech pauses
  str = str.replace(/<\/(p|div|li|h[1-6])>/gi, ". ");
  str = str.replace(/<br\s*[\/]?>/gi, ". ");
  // Strip remaining HTML tags
  str = str.replace(/<[^>]*>/g, " ");
  // Replace directional and bullet symbols with commas / pauses
  str = str.replace(/[\u2190-\u2193\u2196-\u2199\u21D0-\u21D3\u2794\u279C\u27A1]/g, ", ");
  str = str.replace(/[·•|✕✓✔]/g, ", ");
  // Normalize units and angles IN THE SPOKEN LANGUAGE — saying the English
  // "degrees" inside a Hebrew sentence is what a hardcoded literal produced.
  str = str.replace(/(\d+)\s*°/g, he ? "$1 מעלות " : "$1 degrees ");
  str = str.replace(/(\d+)\s*ס[״"]מ/g, "$1 סנטימטר");
  // Collapse whitespace and consecutive periods
  str = str.replace(/\s+/g, " ");
  // Sentence periods only: a period between two digits is a decimal point and
  // must not be turned into a pause ("3.00 m" was read as "3" … "00 m").
  str = str.replace(/\.{2,}/g, ".");
  str = str.replace(/\s*([,;:!?])\s*/g, "$1 ");
  str = str.replace(/\.(?!\d)\s*/g, ". ");
  return str.trim();
}

export function speak(textOrList, options) {
  var opts = options || {};
  stopSpeaking();
  var lang = (opts.lang || "he").toLowerCase().startsWith("en") ? "en-US" : "he-IL";
  var rawText = cleanSpeechText(textOrList, lang);
  if (!rawText || !hasSpeechSupport()) {
    if (opts.onEnd) {
      setTimeout(function () { try { opts.onEnd(); } catch (_) {} }, 0);
    }
    return false;
  }

  var utterance = new window.SpeechSynthesisUtterance(rawText);
  utterance.lang = lang;
  utterance.rate = typeof opts.rate === "number" ? opts.rate : (lang === "he-IL" ? 0.95 : 1.0);
  utterance.pitch = typeof opts.pitch === "number" ? opts.pitch : 1.0;
  utterance.volume = typeof opts.volume === "number" ? opts.volume : 1.0;

  var voice = findVoice(lang);
  if (voice) utterance.voice = voice;

  var btn = opts.button || null;
  activeButton = btn;
  activeUtterance = utterance;

  utterance.onstart = function () {
    startKeepAlive();
    notifyListeners(true, btn);
    if (opts.onStart) {
      try { opts.onStart(); } catch (_) {}
    }
  };

  function finish() {
    stopKeepAlive();
    if (activeUtterance === utterance) {
      activeUtterance = null;
      activeButton = null;
    }
    notifyListeners(false, btn);
    if (opts.onEnd) {
      try { opts.onEnd(); } catch (_) {}
    }
  }

  utterance.onend = finish;
  utterance.onerror = function (err) {
    finish();
    if (opts.onError) {
      try { opts.onError(err); } catch (_) {}
    }
  };

  try {
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (_) {
    finish();
    return false;
  }
}

export function toggleSpeak(textOrList, options, btnElement) {
  var opts = options || {};
  if (btnElement) opts.button = btnElement;
  if (isSpeaking() && (activeButton === btnElement || !btnElement)) {
    stopSpeaking();
    return false;
  }
  return speak(textOrList, opts);
}

/* Wire a speaker button to some text. Callers re-render their panel and call
   this again on the SAME element (the tour card is built once and only its
   contents are rewritten per step), so a bind has to REPLACE the previous one.
   Stacking handlers meant one click ran every generation at once: the newest
   started an utterance and an older one immediately cancelled it, so the button
   went dead after the first step change — and when it did speak, a stale
   closure read the previous step's text. The teardown is parked on the element
   itself so re-binding is self-cleaning without every caller tracking it. */
export function bindSpeakButton(btn, getTextFn, getLangFn, options) {
  if (!btn) return function () {};
  var opts = options || {};
  if (typeof btn.__speakUnbind === "function") {
    try { btn.__speakUnbind(); } catch (_) {}
  }

  function resolveLang() {
    var l = typeof getLangFn === "function" ? getLangFn() : getLangFn;
    return String(l || "he").toLowerCase().slice(0, 2);
  }

  function updateVisual(speakingNow, currentBtn) {
    var on = speakingNow && currentBtn === btn;
    btn.classList.toggle("is-speaking", on);
    var icon = btn.querySelector("i");
    if (icon) {
      icon.className = on
        ? "ph " + (opts.iconActive || "ph-speaker-slash")
        : "ph " + (opts.iconIdle || "ph-speaker-high");
    }
    // getLangFn is documented as "a function OR a plain code" — handleClick
    // already accepted both, this one assumed a function and threw on a string
    var en = resolveLang() === "en";
    var label = on
      ? (opts.labelStop || (en ? "Stop reading" : "עצור הקראה"))
      : (opts.labelPlay || (en ? "Read aloud" : "הקראה קולית"));
    btn.setAttribute("aria-label", label);
    btn.title = label;
    var span = btn.querySelector("span");
    if (span && opts.showLabel) {
      span.textContent = label;
    }
  }

  function handleClick(e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (isSpeaking() && activeButton === btn) {
      stopSpeaking();
      return;
    }
    var text = typeof getTextFn === "function" ? getTextFn() : getTextFn;
    var lang = resolveLang();
    speak(text, {
      lang: lang,
      button: btn,
      rate: opts.rate,
      onStart: function () { updateVisual(true, btn); },
      onEnd: function () { updateVisual(false, btn); },
    });
  }

  btn.addEventListener("click", handleClick);
  var offState = onSpeechStateChange(function (speaking, targetBtn) {
    updateVisual(speaking, targetBtn);
  });
  updateVisual(isSpeaking(), activeButton);

  function unbind() {
    btn.removeEventListener("click", handleClick);
    offState();
    if (btn.__speakUnbind === unbind) btn.__speakUnbind = null;
  }
  btn.__speakUnbind = unbind;
  return unbind;
}
