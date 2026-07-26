(function () {
  "use strict";

  const STORAGE_KEY = "todoAppData";
  const state = loadState();

  /* Load saved data. Falls back to an empty state if nothing is stored
     or the JSON is corrupt, so a bad value can never break startup. */
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      const habits = saved.habits || [];
      for (let i = 0; i < habits.length; i++) {   // migrate old single completedOn -> completedDates
        if (!habits[i].completedDates) {
          habits[i].completedDates = habits[i].completedOn ? [habits[i].completedOn] : [];
        }
        delete habits[i].completedOn;
      }
      const projects = saved.projects || [];
      for (let i = 0; i < projects.length; i++) {
        delete projects[i].subtasks;   // projects moved from subtasks to milestones
        delete projects[i].done;       // projects aren't completable, they have milestones
        if (!projects[i].icon) projects[i].icon = "folder";
      }
      const events = saved.events || [];
      for (let i = 0; i < events.length; i++) {   // events are past/pending now, not checkable
        delete events[i].done;
        if (events[i].important == null) events[i].important = false;
        if (!events[i].icon) events[i].icon = "calendar";
      }
      return {
        tasks: saved.tasks || [],
        projects: projects,
        habits: habits,
        notes: saved.notes || [],
        events: events,
        sun: saved.sun || null,
        settings: {
          name: (saved.settings && saved.settings.name) || "",
          theme: (saved.settings && saved.settings.theme) || "auto",
          language: (saved.settings && saved.settings.language) || "fr",
          palette: (saved.settings && saved.settings.palette) || "aurora",
          decorations: (saved.settings && saved.settings.decorations) || []
        }
      };
    } catch (err) {
      return { tasks: [], projects: [], habits: [], notes: [], events: [], sun: null, settings: { name: "", theme: "auto", language: "fr", palette: "aurora", decorations: [] } };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /* All interface strings, one block per language. */
  const translations = {
    fr: {
      greetingPrefix: "Bonjour",
      greetingSuffix: " !",
      welcomeQuestion: "Qu'est-ce qui compte aujourd'hui ?",
      enterAria: "Entrer dans l'application",
      settingsAria: "Paramètres",
      settingsTitle: "Paramètres",
      tabSystem: "Système",
      tabCustom: "Personnalisation",
      tasksTitle: "Vos tâches du jour",
      projectsTitle: "Vos projets",
      taskInputAria: "Nouvelle tâche",
      projectInputAria: "Nouveau projet",
      addTaskPlaceholder: "Ajouter une tâche…",
      addProjectPlaceholder: "Ajouter un projet…",
      addAria: "Ajouter",
      deleteAria: "Supprimer",
      emptyList: "Rien pour l'instant.",
      closeAria: "Fermer",
      nameLabel: "Votre prénom",
      namePlaceholder: "Ex. Aymane",
      themeLabel: "Thème",
      themeLight: "Clair",
      themeDark: "Sombre",
      themeRose: "Rose",
      themeAuto: "Adaptatif",
      themeDawn: "Aube",
      themeDay: "Jour",
      themeRain: "Pluie",
      themeDusk: "Crépuscule",
      themeNight: "Nuit",
      languageLabel: "Langue",
      langFr: "Français",
      langEn: "English",
      dataLabel: "Sauvegarde",
      exportBtn: "Exporter",
      importBtn: "Importer",
      importConfirm: "Remplacer toutes les données actuelles par le fichier importé ?",
      importError: "Fichier de sauvegarde invalide.",
      importDone: "Données importées.",
      exportDone: "Sauvegarde exportée.",
      addEventTitle: "Ajouter un événement",
      undoDeleted: "Élément supprimé",
      undoBtn: "Annuler",
      decorLabel: "Décorations",
      decorParticles: "Particules",
      decorPetals: "Pétales",
      decorBubbles: "Bulles",
      decorFireflies: "Lucioles",
      decorRain: "Pluie",
      decorSnow: "Neige",
      decorFog: "Brouillard",
      decorStorm: "Orage",
      focusLabel: "Mode focus",
      focusAria: "Passer en mode focus",
      focusExitAria: "Quitter le mode focus",
      habitsTitle: "Vos habitudes",
      addHabitAria: "Ajouter une habitude",
      pickIconTitle: "Choisir une icône",
      habitDeleteAria: "Supprimer l'habitude",
      habitToggleAria: "Compléter l'habitude",
      habitNameLabel: "Nom de l'habitude",
      habitNamePlaceholder: "Ex. Boire de l'eau",
      pickDateAria: "Choisir une date",
      calendarTitle: "Échéance",
      calTimeLabel: "Heure (optionnel)",
      calClear: "Effacer",
      calConfirm: "Valider",
      prevMonthAria: "Mois précédent",
      nextMonthAria: "Mois suivant",
      reminderTitle: "Rappel",
      importanceAria: "Importance",
      paletteLabel: "Palette",
      paletteAurora: "Aurore",
      paletteMeadow: "Prairie",
      paletteSunset: "Coucher",
      editAria: "Modifier",
      editTitle: "Modifier",
      editNameLabel: "Nom",
      editIconLabel: "Icône",
      editDateNone: "Aucune date",
      pinLabel: "Épingler",
      backAria: "Retour",
      notesLabel: "Notes",
      notesPlaceholder: "Ajouter des notes…",
      subtasksLabel: "Sous-tâches",
      addSubtaskPlaceholder: "Ajouter une sous-tâche…",
      milestonesLabel: "Jalons",
      milestonePlaceholder: "Jalon",
      milestoneAdd: "Ajouter un jalon",
      addEventPlaceholder: "Ajouter un événement…",
      eventDateLabel: "Date",
      timeLabel: "Heure",
      eventStatusPending: "En attente",
      eventStatusPast: "Passé",
      rescheduleBtn: "Replanifier",
      importantAria: "Marquer comme important",
      importantLabel: "Important",
      todayLabel: "Aujourd'hui",
      locationLabel: "Localisation",
      cityPlaceholder: "Rechercher une ville…",
      habitsHistoryAria: "Suivi des habitudes",
      historyLabel: "Historique",
      streakLabel: "Série",
      notesToolAria: "Prise de notes",
      addNoteAria: "Nouvelle note",
      boldAria: "Gras",
      italicAria: "Italique",
      underlineAria: "Souligner",
      highlightAria: "Surligner",
      notePlaceholder: "Votre note…",
      notesTitle: "Notes",
      untitledNote: "Note vide",
      noteTitlePlaceholder: "Titre",
      searchPlaceholder: "Rechercher…",
      focusPhrases: [
        "Hedy est le meilleur",
        "Hedy est meilleur que bary",
        "Skuba skubaa"
      ]
    },
    en: {
      greetingPrefix: "Hello",
      greetingSuffix: "!",
      welcomeQuestion: "What matters today?",
      enterAria: "Enter the app",
      settingsAria: "Settings",
      settingsTitle: "Settings",
      tabSystem: "System",
      tabCustom: "Customization",
      tasksTitle: "Your tasks today",
      projectsTitle: "Your projects",
      taskInputAria: "New task",
      projectInputAria: "New project",
      addTaskPlaceholder: "Add a task…",
      addProjectPlaceholder: "Add a project…",
      addAria: "Add",
      deleteAria: "Delete",
      emptyList: "Nothing yet.",
      closeAria: "Close",
      nameLabel: "Your first name",
      namePlaceholder: "e.g. Aymane",
      themeLabel: "Theme",
      themeLight: "Light",
      themeDark: "Dark",
      themeRose: "Rose",
      themeAuto: "Adaptive",
      themeDawn: "Dawn",
      themeDay: "Day",
      themeRain: "Rain",
      themeDusk: "Dusk",
      themeNight: "Night",
      languageLabel: "Language",
      langFr: "Français",
      langEn: "English",
      dataLabel: "Backup",
      exportBtn: "Export",
      importBtn: "Import",
      importConfirm: "Replace all current data with the imported file?",
      importError: "Invalid backup file.",
      importDone: "Data imported.",
      exportDone: "Backup exported.",
      addEventTitle: "Add an event",
      undoDeleted: "Item deleted",
      undoBtn: "Undo",
      decorLabel: "Decorations",
      decorParticles: "Particles",
      decorPetals: "Petals",
      decorBubbles: "Bubbles",
      decorFireflies: "Fireflies",
      decorRain: "Rain",
      decorSnow: "Snow",
      decorFog: "Fog",
      decorStorm: "Storm",
      focusLabel: "Focus mode",
      focusAria: "Enter focus mode",
      focusExitAria: "Exit focus mode",
      habitsTitle: "Your habits",
      addHabitAria: "Add a habit",
      pickIconTitle: "Choose an icon",
      habitDeleteAria: "Remove habit",
      habitToggleAria: "Complete habit",
      habitNameLabel: "Habit name",
      habitNamePlaceholder: "e.g. Drink water",
      pickDateAria: "Pick a date",
      calendarTitle: "Deadline",
      calTimeLabel: "Time (optional)",
      calClear: "Clear",
      calConfirm: "Confirm",
      prevMonthAria: "Previous month",
      nextMonthAria: "Next month",
      reminderTitle: "Reminder",
      importanceAria: "Importance",
      paletteLabel: "Palette",
      paletteAurora: "Aurora",
      paletteMeadow: "Meadow",
      paletteSunset: "Sunset",
      editAria: "Edit",
      editTitle: "Edit",
      editNameLabel: "Name",
      editIconLabel: "Icon",
      editDateNone: "No date",
      pinLabel: "Pin",
      backAria: "Back",
      notesLabel: "Notes",
      notesPlaceholder: "Add notes…",
      subtasksLabel: "Subtasks",
      addSubtaskPlaceholder: "Add a subtask…",
      milestonesLabel: "Milestones",
      milestonePlaceholder: "Milestone",
      milestoneAdd: "Add a milestone",
      addEventPlaceholder: "Add an event…",
      eventDateLabel: "Date",
      timeLabel: "Time",
      eventStatusPending: "Pending",
      eventStatusPast: "Past",
      rescheduleBtn: "Reschedule",
      importantAria: "Mark as important",
      importantLabel: "Important",
      todayLabel: "Today",
      locationLabel: "Location",
      cityPlaceholder: "Search a city…",
      habitsHistoryAria: "Habit tracking",
      historyLabel: "History",
      streakLabel: "Streak",
      notesToolAria: "Notes",
      addNoteAria: "New note",
      boldAria: "Bold",
      italicAria: "Italic",
      underlineAria: "Underline",
      highlightAria: "Highlight",
      notePlaceholder: "Your note…",
      notesTitle: "Notes",
      untitledNote: "Empty note",
      noteTitlePlaceholder: "Title",
      searchPlaceholder: "Search…",
      focusPhrases: [
        "Breathe.",
        "One thing at a time.",
        "You are where you need to be.",
        "Calm comes before clarity.",
        "Focus on the present moment.",
        "Each breath brings you back.",
        "Move at your own pace.",
        "What matters is here, now."
      ]
    }
  };

  /* Current label for a key. */
  function translate(key) {
    return translations[state.settings.language][key];
  }

  /* Apply a language to every tagged element (text, placeholder, aria). */
  function applyLanguage(language) {
    document.documentElement.setAttribute("lang", language);
    const dictionary = translations[language];

    const textNodes = document.querySelectorAll("[data-i18n]");
    for (let i = 0; i < textNodes.length; i++) {
      textNodes[i].textContent = dictionary[textNodes[i].dataset.i18n];
    }

    const placeholderNodes = document.querySelectorAll("[data-i18n-placeholder]");
    for (let i = 0; i < placeholderNodes.length; i++) {
      placeholderNodes[i].setAttribute("placeholder", dictionary[placeholderNodes[i].dataset.i18nPlaceholder]);
    }

    const ariaNodes = document.querySelectorAll("[data-i18n-aria]");
    for (let i = 0; i < ariaNodes.length; i++) {
      ariaNodes[i].setAttribute("aria-label", dictionary[ariaNodes[i].dataset.i18nAria]);
    }

    const languageButtons = document.querySelectorAll(".lang");
    for (let i = 0; i < languageButtons.length; i++) {
      languageButtons[i].classList.toggle("is-active", languageButtons[i].dataset.lang === language);
    }
  }

  const themeBarColors = {
    light: "#f6ecf7", dark: "#1e1c26", rose: "#fdeef2",
    dawn: "#ffc9d8", day: "#d0e6ff", dusk: "#e97ba0", night: "#0c0f1a", rain: "#39414c"
  };

  /* today's cached weather is rain/drizzle/showers/storm */
  function isRainyNow() {
    if (!(state.sun && state.sun.date === todayKey() && state.sun.code != null)) return false;
    const code = state.sun.code;
    return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  }

  /* adaptive theme: dawn / day / dusk / night by the hour, but the grey rain
     theme takes over when it rains (except at night, already dark enough) */
  function timeTheme() {
    const h = new Date().getHours();
    let base;
    if (h >= 5 && h < 8) base = "dawn";
    else if (h >= 8 && h < 18) base = "day";
    else if (h >= 18 && h < 21) base = "dusk";
    else base = "night";
    if (base !== "night" && isRainyNow()) return "rain";
    return base;
  }

  /* Apply a theme. "auto" resolves to the current time-of-day theme. */
  function applyTheme(themeName) {
    const effective = themeName === "auto" ? timeTheme() : themeName;
    document.documentElement.setAttribute("data-theme", effective);

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", themeBarColors[effective] || themeBarColors.light);
    }

    const themeButtons = document.querySelectorAll(".theme");
    for (let i = 0; i < themeButtons.length; i++) {
      themeButtons[i].classList.toggle("is-active", themeButtons[i].dataset.theme === themeName);
    }
  }

  /* Apply a color palette (aurora / meadow / sunset) via a root attribute. */
  function applyPalette(paletteName) {
    document.documentElement.setAttribute("data-palette", paletteName);
    const paletteButtons = document.querySelectorAll(".palette");
    for (let i = 0; i < paletteButtons.length; i++) {
      paletteButtons[i].classList.toggle("is-active", paletteButtons[i].dataset.palette === paletteName);
    }
  }

  /* localized current time: "il est 01:00" / "it is 01:00 am" */
  function clockText() {
    const now = new Date();
    if (state.settings.language === "fr") {
      const h = String(now.getHours()).padStart(2, "0");
      const m = String(now.getMinutes()).padStart(2, "0");
      return "il est " + h + ":" + m;
    }
    return "it is " + formatClock12(now);
  }

  /* time-aware greeting word — never "good morning" in the small hours */
  function greetingWord() {
    const h = new Date().getHours();
    if (state.settings.language === "fr") return (h >= 5 && h < 18) ? "Bonjour" : "Bonsoir";
    if (h >= 5 && h < 12) return "Good morning";
    if (h >= 12 && h < 18) return "Good afternoon";
    return "Good evening";   // 18:00–04:59
  }

  /* welcome phrase "Bonjour <name> !" and the main-view line "Bonsoir, il est ..." (no name) */
  function renderGreeting() {
    const name = state.settings.name;
    document.getElementById("welcomeGreeting").textContent =
      translate("greetingPrefix") + (name ? " " + name : "") + translate("greetingSuffix");
    document.getElementById("appGreetWord").textContent = greetingWord();
    document.getElementById("appGreetTime").textContent = ", " + clockText();
  }

  /* generate the night stars once (shown only under the night theme) */
  function initSky() {
    const sky = document.getElementById("sky");
    for (let i = 0; i < 44; i++) {
      const star = document.createElement("span");
      star.className = "star";
      const size = 1 + Math.random() * 1.6;
      star.style.width = size + "px";
      star.style.height = size + "px";
      star.style.left = Math.random() * 100 + "%";
      star.style.top = Math.random() * 72 + "%";
      star.style.animationDuration = (2 + Math.random() * 3) + "s";
      star.style.animationDelay = -Math.random() * 4 + "s";
      sky.appendChild(star);
    }
  }

  const welcomeScreen = document.getElementById("welcome");
  const appScreen = document.getElementById("app");

  const rosace = document.getElementById("rosace");
  const enterBtn = document.getElementById("enterBtn");

  /* Draw a rose from Bezier petals radiating around the center. The mask in CSS
     hides the busy middle, so only the outer tips show. */
  function buildRosace() {
    if (!rosace) return;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 300 300");

    const cx = 150, cy = 150;
    const tipRadius = 128;      // distance from center to petal tip
    const controlWidth = 44;    // how wide each petal bulges
    const petalCount = 30;
    const tipY = cy - tipRadius;
    // one upward petal, reused and rotated around the center
    const petal = "M" + cx + " " + cy
      + " C" + (cx + controlWidth) + " " + (cy - tipRadius * 0.30)
        + ", " + (cx + controlWidth * 0.5) + " " + (cy - tipRadius * 0.82) + ", " + cx + " " + tipY
      + " C" + (cx - controlWidth * 0.5) + " " + (cy - tipRadius * 0.82)
        + ", " + (cx - controlWidth) + " " + (cy - tipRadius * 0.30) + ", " + cx + " " + cy + " Z";

    for (let i = 0; i < petalCount; i++) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", petal);
      path.setAttribute("transform", "rotate(" + (i * 360 / petalCount) + " " + cx + " " + cy + ")");
      svg.appendChild(path);
    }
    const spin = rosace.querySelector(".rosace__spin");
    (spin || rosace).appendChild(svg);
  }

  /* the rosace spins on its own; hovering the arrow stops it with a reverse recoil */
  if (enterBtn && rosace) {
    enterBtn.addEventListener("mouseenter", function () { rosace.classList.add("is-recoil"); });
    enterBtn.addEventListener("mouseleave", function () { rosace.classList.remove("is-recoil"); });
  }

  /* on click the rosace spins outward and vanishes while the app fades in behind */
  enterBtn.addEventListener("click", function () {
    appScreen.hidden = false;   // app waits behind the welcome
    if (rosace) rosace.classList.add("is-launching");
    welcomeScreen.classList.add("is-leaving");
    setTimeout(function () { welcomeScreen.style.display = "none"; }, 550);
    ensureSunData();   // ask for location only once the app is entered
  });

  const settingsModal = document.getElementById("settings");

  document.getElementById("settingsBtn").addEventListener("click", function () {
    settingsModal.hidden = false;
  });

  /* close on the × or on the backdrop */
  const closeButtons = settingsModal.querySelectorAll("[data-close]");
  for (let i = 0; i < closeButtons.length; i++) {
    closeButtons[i].addEventListener("click", function () {
      settingsModal.hidden = true;
    });
  }

  /* settings tabs: system / customization */
  const settingsTabs = settingsModal.querySelectorAll(".tab");
  const settingsPanels = settingsModal.querySelectorAll(".tab-panel");
  for (let i = 0; i < settingsTabs.length; i++) {
    settingsTabs[i].addEventListener("click", function () {
      const target = this.dataset.tab;
      for (let j = 0; j < settingsTabs.length; j++) {
        settingsTabs[j].classList.toggle("is-active", settingsTabs[j].dataset.tab === target);
      }
      for (let j = 0; j < settingsPanels.length; j++) {
        settingsPanels[j].hidden = settingsPanels[j].dataset.tabpanel !== target;
      }
    });
  }

  const nameInput = document.getElementById("nameInput");
  nameInput.value = state.settings.name;
  nameInput.addEventListener("input", function () {
    state.settings.name = nameInput.value.trim();
    renderGreeting();
    saveState();
  });

  const themeButtons = document.querySelectorAll(".theme");
  for (let i = 0; i < themeButtons.length; i++) {
    themeButtons[i].addEventListener("click", function () {
      state.settings.theme = themeButtons[i].dataset.theme;
      applyTheme(state.settings.theme);
      applyDecorations();   // the adaptive theme adds/removes the weather effect
      saveState();
    });
  }

  const paletteButtons = document.querySelectorAll(".palette");
  for (let i = 0; i < paletteButtons.length; i++) {
    paletteButtons[i].addEventListener("click", function () {
      state.settings.palette = paletteButtons[i].dataset.palette;
      applyPalette(state.settings.palette);
      saveState();
    });
  }

  const languageButtons = document.querySelectorAll(".lang");
  for (let i = 0; i < languageButtons.length; i++) {
    languageButtons[i].addEventListener("click", function () {
      state.settings.language = languageButtons[i].dataset.lang;
      applyLanguage(state.settings.language);
      renderList("tasks");     // refresh empty text and delete labels
      renderList("projects");
      renderHabits();
      renderEventCal();
      renderDailyTimeline();
      renderGreeting();
      saveState();
    });
  }

  /* TOAST — brief bottom message, optionally with an action (used by Undo) */
  let toastTimer = null;
  function showToast(message, actionLabel, onAction) {
    const el = document.getElementById("toast");
    const msg = document.getElementById("toastMsg");
    const action = document.getElementById("toastAction");
    msg.textContent = message;
    if (actionLabel && onAction) {
      action.textContent = actionLabel;
      action.hidden = false;
      action.onclick = function () { hideToast(); onAction(); };
    } else {
      action.hidden = true;
      action.onclick = null;
    }
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add("is-open"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }
  function hideToast() {
    const el = document.getElementById("toast");
    el.classList.remove("is-open");
    clearTimeout(toastTimer);
    setTimeout(function () { el.hidden = true; }, 250);
  }

  /* EXPORT / IMPORT — a portable JSON backup (works on mobile via file download/upload) */
  document.getElementById("exportBtn").addEventListener("click", function () {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "todo-backup-" + todayKey() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast(translate("exportDone"));
  });

  const importFile = document.getElementById("importFile");
  document.getElementById("importBtn").addEventListener("click", function () { importFile.click(); });
  importFile.addEventListener("change", function () {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      let data = null;
      try { data = JSON.parse(reader.result); } catch (err) { data = null; }
      const valid = data && typeof data === "object" && ("settings" in data || "tasks" in data);
      if (!valid) { showToast(translate("importError")); importFile.value = ""; return; }
      if (!window.confirm(translate("importConfirm"))) { importFile.value = ""; return; }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      location.reload();   // cleanest: re-init from the imported data
    };
    reader.readAsText(file);
  });

  /* DECORATIONS — activatable ambient effects (particles / petals / bubbles / fireflies) */
  const decor = document.getElementById("decor");

  function rand(min, max) { return min + Math.random() * (max - min); }
  function decorEl(cls) {
    const el = document.createElement("span");
    el.className = cls;
    return el;
  }

  function spawnParticles() {
    for (let i = 0; i < 14; i++) {
      const p = decorEl("dp");
      const size = rand(4, 9);
      p.style.width = size + "px";
      p.style.height = size + "px";
      p.style.left = rand(0, 100) + "%";
      p.style.top = rand(0, 100) + "%";
      p.style.animationDuration = rand(9, 18) + "s";
      p.style.animationDelay = -rand(0, 12) + "s";
      decor.appendChild(p);
    }
  }
  function spawnPetals() {
    for (let i = 0; i < 16; i++) {
      const p = decorEl("petal");
      const size = rand(9, 16);
      p.style.width = size + "px";
      p.style.height = size + "px";
      p.style.left = rand(0, 100) + "%";
      p.style.setProperty("--sway", rand(-70, 70) + "px");
      p.style.setProperty("--spin", rand(180, 560) + "deg");
      p.style.animationDuration = rand(6, 12) + "s";
      p.style.animationDelay = -rand(0, 12) + "s";
      decor.appendChild(p);
    }
  }
  function spawnBubbles() {
    for (let i = 0; i < 12; i++) {
      const b = decorEl("bubble2");
      const size = rand(8, 22);
      b.style.width = size + "px";
      b.style.height = size + "px";
      b.style.left = rand(0, 100) + "%";
      b.style.setProperty("--sway", rand(-30, 30) + "px");
      b.style.animationDuration = rand(7, 14) + "s";
      b.style.animationDelay = -rand(0, 12) + "s";
      decor.appendChild(b);
    }
  }
  function spawnFireflies() {
    for (let i = 0; i < 16; i++) {
      const f = decorEl("firefly");
      f.style.left = rand(0, 100) + "%";
      f.style.top = rand(10, 90) + "%";
      f.style.animationDuration = rand(4, 8) + "s, " + rand(2, 5) + "s";
      f.style.animationDelay = -rand(0, 6) + "s, " + -rand(0, 4) + "s";
      decor.appendChild(f);
    }
  }

  /* WEATHER DECORATIONS — ambient effects, combinable with any theme */
  function spawnRain() {
    for (let i = 0; i < 60; i++) {
      const drop = decorEl("wx-rain");
      drop.style.left = rand(-6, 100) + "%";   // start left, the slant drifts them right
      drop.style.height = rand(16, 30) + "px";
      drop.style.animationDuration = rand(0.45, 0.85) + "s";
      drop.style.animationDelay = -rand(0, 2) + "s";
      decor.appendChild(drop);
    }
  }
  function spawnSnow() {
    for (let i = 0; i < 40; i++) {
      const flake = decorEl("wx-snow");
      const size = rand(3, 7);
      flake.style.width = size + "px";
      flake.style.height = size + "px";
      flake.style.left = rand(0, 100) + "%";
      flake.style.setProperty("--sway", rand(-40, 40) + "px");
      flake.style.animationDuration = rand(6, 13) + "s";
      flake.style.animationDelay = -rand(0, 13) + "s";
      decor.appendChild(flake);
    }
  }
  function spawnFog() {
    for (let i = 0; i < 4; i++) {
      const bank = decorEl("wx-fog");
      bank.style.top = rand(5, 80) + "%";
      bank.style.opacity = rand(0.12, 0.26);
      bank.style.animationDuration = rand(28, 50) + "s";
      bank.style.animationDelay = -rand(0, 40) + "s";
      decor.appendChild(bank);
    }
  }
  function spawnStorm() {
    spawnRain();                            // slanted rain plus lightning flashes
    decor.appendChild(decorEl("wx-flash"));
  }

  /* rain / snow / storm implied by the weather, only under the adaptive theme */
  function weatherDecoration() {
    if (state.settings.theme !== "auto") return null;
    if (!(state.sun && state.sun.date === todayKey() && state.sun.code != null)) return null;
    const code = state.sun.code;
    if (code >= 95) return "storm";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
    return null;
  }

  /* rebuild the decor layer: manual decorations plus the adaptive weather one */
  function applyDecorations() {
    decor.innerHTML = "";
    const active = state.settings.decorations;
    let rainShown = false;
    for (let i = 0; i < active.length; i++) {
      if (active[i] === "particles") spawnParticles();
      else if (active[i] === "petals") spawnPetals();
      else if (active[i] === "bubbles") spawnBubbles();
      else if (active[i] === "fireflies") spawnFireflies();
      else if (active[i] === "rain") { spawnRain(); rainShown = true; }
      else if (active[i] === "snow") spawnSnow();
      else if (active[i] === "fog") spawnFog();
      else if (active[i] === "storm") { spawnStorm(); rainShown = true; }
    }
    // adaptive theme adds the weather effect, unless it's already on manually
    const weather = weatherDecoration();
    if (weather && active.indexOf(weather) === -1) {
      if (weather === "rain") { spawnRain(); rainShown = true; }
      else if (weather === "snow") spawnSnow();
      else if (weather === "storm") { spawnStorm(); rainShown = true; }
    }
    // the grey rain theme (manual pick or adaptive) always has falling rain
    if (document.documentElement.getAttribute("data-theme") === "rain" && !rainShown) {
      spawnRain();
    }

    const buttons = document.querySelectorAll(".decor-opt");
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle("is-active", active.indexOf(buttons[i].dataset.decor) !== -1);
    }
  }

  const decorButtons = document.querySelectorAll(".decor-opt");
  for (let i = 0; i < decorButtons.length; i++) {
    decorButtons[i].addEventListener("click", function () {
      const name = this.dataset.decor;
      const active = state.settings.decorations;
      const at = active.indexOf(name);
      if (at === -1) active.push(name);
      else active.splice(at, 1);
      saveState();
      applyDecorations();
    });
  }

  /* focus mode: black screen, breathing dot, motivational phrases */
  const focusOverlay = document.getElementById("focus");
  const focusPhrase = document.getElementById("focusPhrase");
  const scubaGif = document.getElementById("scubaGif");
  let focusTimer = null;
  let focusIndex = 0;

  /* Fade the next phrase in, hold it, fade out, then queue the following one. */
  function showNextPhrase() {
    const phrases = translations[state.settings.language].focusPhrases;
    const phrase = phrases[focusIndex % phrases.length];
    focusPhrase.textContent = phrase;
    focusPhrase.classList.add("is-visible");
    scubaGif.hidden = !/s[ck]uba/i.test(phrase); // easter egg: dancing diver
    focusIndex++;

    focusTimer = setTimeout(function () {
      focusPhrase.classList.remove("is-visible");
      focusTimer = setTimeout(showNextPhrase, 2500); // wait for the fade-out
    }, 5000);
  }

  function openFocus() {
    focusIndex = 0;
    focusOverlay.hidden = false;
    showNextPhrase();
  }

  function closeFocus() {
    clearTimeout(focusTimer);
    focusOverlay.hidden = true;
    focusPhrase.classList.remove("is-visible");
    scubaGif.hidden = true;
  }

  document.getElementById("focusBtn").addEventListener("click", openFocus);
  document.getElementById("focusExit").addEventListener("click", closeFocus);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !focusOverlay.hidden) {
      closeFocus();
    }
  });

  /* Redraw one list (tasks or projects) from state. */
  function renderList(listName) {
    const listElement = document.getElementById(listName + "List");
    const items = sortedByDue(state[listName]);
    listElement.innerHTML = "";

    if (items.length === 0) {
      const emptyRow = document.createElement("li");
      emptyRow.className = "empty";
      emptyRow.textContent = translate("emptyList");
      listElement.appendChild(emptyRow);
      return;
    }

    for (let i = 0; i < items.length; i++) {
      listElement.appendChild(createItemRow(listName, items[i]));
    }
  }

  /* Build one row: checkbox, label, delete button. Undated & unpinned rows get a
     drag handle so they can be reordered (they show in array order under sortedByDue). */
  function createItemRow(listName, item) {
    const row = document.createElement("li");
    row.className = item.done ? "item item--open done" : "item item--open";
    row.dataset.id = item.id;
    row.addEventListener("click", function () { openDetail(listName, item.id); });

    const reorderable = !item.pinned && !item.dueDate;
    if (reorderable) {
      row.dataset.reorder = "1";
      const grip = document.createElement("span");
      grip.className = "item__grip";
      grip.setAttribute("aria-hidden", "true");
      grip.innerHTML = ICON_GRIP;
      grip.addEventListener("click", function (e) { e.stopPropagation(); });
      grip.addEventListener("pointerdown", function (e) { startRowDrag(e, row, listName); });
      row.appendChild(grip);
    }

    // a task has a completion checkbox; a project shows an icon instead (not "done"-able)
    if (listName === "projects") {
      const icon = document.createElement("span");
      icon.className = "item__ico";
      icon.innerHTML = habitSvg(item.icon || "folder");
      row.appendChild(icon);
    } else {
      const checkbox = document.createElement("span");
      checkbox.className = "item__check";
      checkbox.textContent = item.done ? "✓" : "";
      checkbox.addEventListener("click", function (event) {
        event.stopPropagation();   // the box toggles; the rest of the row opens the detail
        toggleItem(listName, item.id);
      });
      row.appendChild(checkbox);
    }

    const label = document.createElement("span");
    label.className = "item__text";
    label.textContent = item.text;

    row.appendChild(label);
    if (item.notes && item.notes.trim()) row.appendChild(createNoteMark());
    if (listName === "tasks" && item.subtasks && item.subtasks.length) row.appendChild(createSubBadge(item));
    if (listName === "projects" && item.milestones && item.milestones.length) row.appendChild(createMilestoneBadge(item));
    if (item.pinned) row.appendChild(createPinMarker());
    if (item.dueDate) {
      row.appendChild(createDueBadge(item));
    }
    if (listName === "projects") {
      row.appendChild(createImportanceBars(item.importance || 0));
    }
    return row;
  }

  const ICON_GRIP = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>';

  /* pointer-based drag reorder (works on touch); moves the row among its
     reorderable siblings, then persists the new order into the state array */
  let rowDrag = null;
  function startRowDrag(event, row, listName) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const grip = event.currentTarget;
    grip.setPointerCapture(event.pointerId);
    rowDrag = { row: row, listName: listName, listEl: row.parentNode, grip: grip, pointerId: event.pointerId };
    row.classList.add("is-dragging");
    grip.addEventListener("pointermove", onRowDragMove);
    grip.addEventListener("pointerup", endRowDrag);
    grip.addEventListener("pointercancel", endRowDrag);
  }
  function onRowDragMove(event) {
    if (!rowDrag) return;
    const listEl = rowDrag.listEl;
    const siblings = listEl.querySelectorAll('.item[data-reorder]:not(.is-dragging)');
    let inserted = false;
    for (let i = 0; i < siblings.length; i++) {
      const rect = siblings[i].getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        listEl.insertBefore(rowDrag.row, siblings[i]);
        inserted = true;
        break;
      }
    }
    if (!inserted && siblings.length) {
      const last = siblings[siblings.length - 1];
      listEl.insertBefore(rowDrag.row, last.nextSibling);
    }
  }
  function endRowDrag(event) {
    if (!rowDrag) return;
    const drag = rowDrag;
    rowDrag = null;
    drag.row.classList.remove("is-dragging");
    drag.grip.removeEventListener("pointermove", onRowDragMove);
    drag.grip.removeEventListener("pointerup", endRowDrag);
    drag.grip.removeEventListener("pointercancel", endRowDrag);
    try { drag.grip.releasePointerCapture(event.pointerId); } catch (err) {}

    const ordered = [];
    const rows = drag.listEl.querySelectorAll('.item[data-reorder]');
    for (let i = 0; i < rows.length; i++) ordered.push(rows[i].dataset.id);
    persistOrder(drag.listName, ordered);
    saveState();
    renderList(drag.listName);
  }
  /* rebuild state[listName] so the reorderable items follow `ordered`,
     while pinned/dated items keep their slots */
  function persistOrder(listName, ordered) {
    const items = state[listName];
    const byId = {};
    for (let i = 0; i < items.length; i++) byId[items[i].id] = items[i];
    let take = 0;
    const result = [];
    for (let i = 0; i < items.length; i++) {
      if (ordered.indexOf(items[i].id) !== -1) result.push(byId[ordered[take++]]);
      else result.push(items[i]);
    }
    state[listName] = result;
  }

  function addItem(listName, text, due, importance) {
    const item = { id: Date.now().toString(), text: text }; // timestamp id
    if (listName === "projects") item.icon = "folder";      // projects use an icon, no "done"
    else item.done = false;
    if (due && due.date) {
      item.dueDate = due.date;
      item.dueTime = due.time || null;
      item.notified = false;
    }
    if (importance) item.importance = importance;
    state[listName].push(item);
    saveState();
    renderList(listName);
  }

  /* Remove an item from a state list, keeping its slot so Undo can restore it.
     rerender() redraws whatever views showed it. */
  function removeWithUndo(listName, id, rerender) {
    const items = state[listName];
    let index = -1;
    let removed = null;
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) { index = i; removed = items[i]; break; }
    }
    if (!removed) return;
    items.splice(index, 1);
    saveState();
    rerender();
    showToast(translate("undoDeleted"), translate("undoBtn"), function () {
      state[listName].splice(index, 0, removed);
      saveState();
      rerender();
    });
  }

  /* Find the item by id, drop it, redraw. */
  function removeItem(listName, id) {
    removeWithUndo(listName, id, function () { renderList(listName); });
  }

  function toggleItem(listName, id) {
    const items = state[listName];
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) {
        items[i].done = !items[i].done; // flip done state
        break;
      }
    }
    saveState();
    renderList(listName);
  }

  const addForms = document.querySelectorAll(".add");
  for (let i = 0; i < addForms.length; i++) {
    addForms[i].addEventListener("submit", function (event) {
      event.preventDefault();
      const input = this.querySelector(".add__input");
      const text = input.value.trim();
      if (text) {
        addItem(this.dataset.list, text);   // date/importance are set later in the detail view
        input.value = "";
        input.focus();
      }
    });
  }

  /* HABITS */
  const HABIT_SLOTS = 5;

  /* line-art icon catalog (same stroke style as the rest of the app) */
  const HABIT_ICONS = {
    water: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    run: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    sleep: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    coffee: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
    write: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    leaf: '<path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    sport: '<line x1="2.5" y1="9" x2="2.5" y2="15"/><line x1="5.5" y1="7" x2="5.5" y2="17"/><line x1="18.5" y1="7" x2="18.5" y2="17"/><line x1="21.5" y1="9" x2="21.5" y2="15"/><line x1="5.5" y1="12" x2="18.5" y2="12"/>',
    meditation: '<circle cx="12" cy="5" r="2"/><path d="M12 8v3"/><path d="M7.5 18.5c1.2 -.8 2.7 -1.2 4.5 -1.2s3.3 .4 4.5 1.2"/><path d="M12 11c-2.5 .5 -4 2 -4.5 4"/><path d="M12 11c2.5 .5 4 2 4.5 4"/>',
    walk: '<circle cx="13" cy="4" r="1.6"/><path d="M7 21l3 -4"/><path d="M16 21l-2 -4l-3 -3l1 -6"/><path d="M6 12l2 -3l4 -1l3 3l3 1"/>',
    game: '<rect x="2" y="7" width="20" height="10" rx="5"/><line x1="6" y1="12" x2="9" y2="12"/><line x1="7.5" y1="10.5" x2="7.5" y2="13.5"/><circle cx="15.5" cy="13" r="1"/><circle cx="18.5" cy="11" r="1"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    cake: '<path d="M4 21h16"/><path d="M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7"/><path d="M4 16.4c1.4 0 1.4 1 2.8 1s1.4-1 2.8-1 1.4 1 2.8 1 1.4-1 2.8-1 1.4 1 2.8 1"/><path d="M12 6.5V9"/><path d="M12 3.5a1 1 0 0 0-1 1c0 .8 1 1.5 1 1.5s1-.7 1-1.5a1 1 0 0 0-1-1z"/>',
    meeting: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    course: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.1 2.7 3 6 3s6-1.9 6-3v-5"/><line x1="22" y1="10" x2="22" y2="15"/>',
    gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.9.7-2.2-.1-3a2.1 2.1 0 0 0-2.9 0z"/><path d="M12 15l-3-3a11 11 0 0 1 5-8c1.9-1.9 4-2 5-2s1.1 3.1-.8 5a11 11 0 0 1-8 5z"/><path d="M9 12H4s.5-2.8 2-4c1.5-.4 3 0 3 0"/><path d="M12 15v5s2.8-.5 4-2c.4-1.5 0-3 0-3"/>'
  };

  const iconPicker = document.getElementById("iconPicker");
  const habitsGrid = document.getElementById("habitsGrid");

  /* today's date as YYYY-MM-DD in local time */
  function todayKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return now.getFullYear() + "-" + month + "-" + day;
  }

  /* wrap catalog markup in a styled svg (markup is trusted, not user text) */
  function habitSvg(iconKey) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
         + 'stroke-linecap="round" stroke-linejoin="round">' + HABIT_ICONS[iconKey] + '</svg>';
  }

  /* Draw the 5 slots: a tile per habit, an empty "+" slot for the rest. */
  function renderHabits() {
    const today = todayKey();
    habitsGrid.innerHTML = "";
    for (let i = 0; i < HABIT_SLOTS; i++) {
      const habit = state.habits[i];
      habitsGrid.appendChild(habit ? createHabitTile(habit, today) : createEmptySlot());
    }
  }

  /* A filled habit: icon, rising water, delete button. */
  function createHabitTile(habit, today) {
    const done = !!(habit.completedDates && habit.completedDates.indexOf(today) !== -1);
    const tile = document.createElement("div");
    tile.className = done ? "habit done" : "habit";
    tile.setAttribute("aria-label", translate("habitToggleAria"));

    const water = document.createElement("div");
    water.className = "habit__water";

    const icon = document.createElement("span");
    icon.className = "habit__icon";
    if (HABIT_ICONS[habit.icon]) {
      icon.innerHTML = habitSvg(habit.icon);
    }

    tile.addEventListener("click", function () { toggleHabit(habit.id, tile); });
    tile.append(water, icon);
    return tile;
  }

  /* An empty slot: a "+" with a soft blurred glow behind it. */
  function createEmptySlot() {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "habit habit--empty";
    slot.setAttribute("aria-label", translate("addHabitAria"));

    const plus = document.createElement("span");
    plus.className = "habit__plus";
    plus.textContent = "+";

    slot.appendChild(plus);
    slot.addEventListener("click", openIconPicker);
    return slot;
  }

  /* Complete or un-complete for today. Toggling the class drives the water. */
  function toggleHabit(id, tile) {
    const today = todayKey();
    const habit = findItem("habits", id);
    if (!habit) return;
    if (!habit.completedDates) habit.completedDates = [];
    const at = habit.completedDates.indexOf(today);
    const nowDone = at === -1;
    if (nowDone) habit.completedDates.push(today);
    else habit.completedDates.splice(at, 1);
    tile.classList.toggle("done", nowDone);
    saveState();
  }

  function removeHabit(id) {
    removeWithUndo("habits", id, function () {
      renderHabits();
      if (!habitsView.hidden) renderHabitsView();
    });
  }

  /* Fill the picker with one button per catalog icon. */
  function buildIconPicker() {
    const grid = document.getElementById("iconGrid");
    const keys = Object.keys(HABIT_ICONS);
    grid.innerHTML = "";
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = "icon-choice";
      choice.innerHTML = habitSvg(key);
      choice.addEventListener("click", function () { chooseIcon(key); });
      grid.appendChild(choice);
    }
  }

  let iconPickerMode = { kind: "habit-new" };   // habit-new | habit-edit | detail

  /* Apply a picked icon: create a habit, update a habit's icon, or the open detail item's. */
  function chooseIcon(iconKey) {
    if (iconPickerMode.kind === "detail") {   // the open event/project detail
      const item = currentDetailItem();
      if (item) item.icon = iconKey;
      saveState();
      iconPicker.hidden = true;
      detailIcon.innerHTML = habitSvg(iconKey);   // update the square button
      refreshDetailSource();   // update rows / calendar / timeline
      return;
    }
    if (iconPickerMode.kind === "habit-new") {
      const nameInput = document.getElementById("habitNameInput");
      // name is stored but not shown; a future history graph will use it
      state.habits.push({
        id: Date.now().toString(),
        name: nameInput.value.trim(),
        icon: iconKey,
        completedDates: []
      });
      nameInput.value = "";
    } else {
      const habit = findItem("habits", iconPickerMode.id);
      if (habit) habit.icon = iconKey;
    }
    saveState();
    iconPicker.hidden = true;
    renderHabits();
    if (!habitsView.hidden) renderHabitsView();   // reflect an icon change in the view
  }

  /* open to create a new habit (name field shown) */
  function openIconPicker() {
    iconPickerMode = { kind: "habit-new" };
    document.getElementById("habitNameField").hidden = false;
    document.getElementById("habitNameInput").value = "";
    iconPicker.hidden = false;
  }

  /* open to change an existing habit's icon (name field hidden) */
  function openIconPickerForEdit(habitId) {
    iconPickerMode = { kind: "habit-edit", id: habitId };
    document.getElementById("habitNameField").hidden = true;
    iconPicker.hidden = false;
  }

  /* open to change the icon of the item in the detail view (event or project) */
  function openIconPickerForDetail() {
    iconPickerMode = { kind: "detail" };
    document.getElementById("habitNameField").hidden = true;
    iconPicker.hidden = false;
  }

  /* close the picker on the × or the backdrop */
  const iconCloseButtons = iconPicker.querySelectorAll("[data-close]");
  for (let i = 0; i < iconCloseButtons.length; i++) {
    iconCloseButtons[i].addEventListener("click", function () {
      iconPicker.hidden = true;
    });
  }

  /* IMPORTANCE — a 5-bar level on projects (shown on rows, edited in the detail view) */

  /* Build the 5 bars. Read-only divs when no onSelect; clickable buttons for editing. */
  function createImportanceBars(level, onSelect) {
    const wrap = document.createElement("div");
    wrap.className = onSelect ? "imp imp--edit" : "imp";
    for (let i = 1; i <= 5; i++) {
      const bar = document.createElement(onSelect ? "button" : "div");
      bar.className = i <= level ? "imp__bar is-on" : "imp__bar";
      if (onSelect) {
        bar.type = "button";
        bar.setAttribute("aria-label", translate("importanceAria") + " " + i);
        const barLevel = i;
        bar.addEventListener("click", function () { onSelect(barLevel); });
      }
      wrap.appendChild(bar);
    }
    return wrap;
  }

  /* AGENDA — date/time picker, reused for a task's due date and an event's reschedule */
  const calendarModal = document.getElementById("calendar");
  let pickerContext = "new";                      // "new" or an existing task/event id
  let pickerKind = "tasks";                        // "tasks" or "events"
  let pickerSelected = null;                      // "YYYY-MM-DD" chosen in the grid
  let pickerYear = 0;
  let pickerMonth = 0;

  function findTask(id) {
    for (let i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id) return state.tasks[i];
    }
    return null;
  }

  /* "YYYY-MM-DD" from numeric parts */
  function dateKey(year, month, day) {
    return year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  }

  /* Pinned first, then undated (in order), then dated soonest-first. */
  function sortedByDue(items) {
    const pinned = [];
    const undated = [];
    const dated = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].pinned) pinned.push(items[i]);
      else if (items[i].dueDate) dated.push(items[i]);
      else undated.push(items[i]);
    }
    dated.sort(function (a, b) { return dueSortKey(a) - dueSortKey(b); });
    return pinned.concat(undated, dated);
  }

  /* date-only tasks sort at the end of their day */
  function dueSortKey(task) {
    return new Date(task.dueDate + "T" + (task.dueTime || "23:59")).getTime();
  }

  /* "24 juil. · 14:00" — localized short due label. */
  function dueLabel(task) {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const when = new Date(task.dueDate + "T" + (task.dueTime || "00:00"));
    let text = when.toLocaleDateString(locale, { day: "numeric", month: "short" });
    if (task.dueTime) text += " · " + task.dueTime;
    return text;
  }

  /* Small badge, clickable to edit the date. */
  function createDueBadge(task) {
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "item__due";
    if (!task.done && dueSortKey(task) < Date.now()) badge.classList.add("is-overdue");
    badge.textContent = dueLabel(task);
    badge.addEventListener("click", function (event) {
      event.stopPropagation(); // don't toggle the task
      openCalendar(task.id);
    });
    return badge;
  }

  /* Draw the month grid: weekday row, leading blanks, then the days. */
  function renderCalendar() {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const firstOfMonth = new Date(pickerYear, pickerMonth, 1);
    document.getElementById("calMonth").textContent =
      firstOfMonth.toLocaleDateString(locale, { month: "long", year: "numeric" });

    const grid = document.getElementById("calGrid");
    grid.innerHTML = "";

    // weekday headers, Monday first (Jan 1 2024 was a Monday)
    for (let i = 0; i < 7; i++) {
      const head = document.createElement("div");
      head.className = "cal__wd";
      head.textContent = new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "short" });
      grid.appendChild(head);
    }

    // blanks so day 1 lands on the right weekday (getDay: 0=Sun -> Monday-first)
    const lead = (firstOfMonth.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) {
      const blank = document.createElement("div");
      blank.className = "cal__day is-blank";
      grid.appendChild(blank);
    }

    const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
    const today = todayKey();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(pickerYear, pickerMonth, d);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cal__day";
      if (key === today) cell.classList.add("is-today");
      if (key === pickerSelected) cell.classList.add("is-selected");
      cell.textContent = String(d);
      cell.addEventListener("click", function () {
        pickerSelected = key;
        renderCalendar();
      });
      grid.appendChild(cell);
    }
  }

  /* Open the calendar to edit a task's date (context = task id). */
  function openCalendar(context, kind) {
    pickerContext = context;
    pickerKind = kind || "tasks";
    let date = null;
    let time = "";
    if (pickerKind === "events") {
      const event = findItem("events", context);
      if (event) { date = event.date || null; time = event.time || ""; }
    } else {
      const task = findTask(context);
      if (task) { date = task.dueDate || null; time = task.dueTime || ""; }
    }
    pickerSelected = date || todayKey();   // today highlighted by default
    const base = new Date(pickerSelected + "T00:00");
    pickerYear = base.getFullYear();
    pickerMonth = base.getMonth();
    document.getElementById("calTime").value = time;
    document.getElementById("calClear").hidden = pickerKind === "events";   // an event always has a date
    renderCalendar();
    calendarModal.hidden = false;
  }

  /* Write the chosen (or cleared) date to the edited task or rescheduled event. */
  function applyDue(date, time) {
    if (pickerKind === "events") {
      const event = findItem("events", pickerContext);
      if (event && date) {
        event.date = date;
        event.time = time || null;
        saveState();
        renderEventCal();
        renderDailyTimeline();
        if (!dayView.hidden) renderDayList();
        refreshDetailIfOpen();
      }
      calendarModal.hidden = true;
      return;
    }
    const task = findTask(pickerContext);
    if (task) {
      task.dueDate = date;
      task.dueTime = date ? (time || null) : null;
      task.notified = false;   // re-arm the reminder
      saveState();
      renderList("tasks");
      refreshDetailIfOpen();
    }
    if (date && time) ensureNotifyPermission();
    calendarModal.hidden = true;
  }

  document.getElementById("calPrev").addEventListener("click", function () {
    pickerMonth--;
    if (pickerMonth < 0) { pickerMonth = 11; pickerYear--; }
    renderCalendar();
  });
  document.getElementById("calNext").addEventListener("click", function () {
    pickerMonth++;
    if (pickerMonth > 11) { pickerMonth = 0; pickerYear++; }
    renderCalendar();
  });
  document.getElementById("calConfirm").addEventListener("click", function () {
    applyDue(pickerSelected, document.getElementById("calTime").value);
  });
  document.getElementById("calClear").addEventListener("click", function () {
    applyDue(null, "");
  });
  const calCloseButtons = calendarModal.querySelectorAll("[data-close]");
  for (let i = 0; i < calCloseButtons.length; i++) {
    calCloseButtons[i].addEventListener("click", function () {
      calendarModal.hidden = true;
    });
  }

  /* REMINDERS — foreground while open, plus catch-up on launch (no server) */
  function ensureNotifyPermission() {
    if (window.Notification && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  /* only tasks with both a date and a time get a timed reminder */
  function dueTimestamp(task) {
    if (!task.dueDate || !task.dueTime) return null;
    return new Date(task.dueDate + "T" + task.dueTime).getTime();
  }

  function showReminder(task) {
    const title = translate("reminderTitle");
    const options = { body: task.text, icon: "./icons/icon-192.png", tag: "task-" + task.id };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(function (reg) { reg.showNotification(title, options); });
    } else if (window.Notification) {
      new Notification(title, options);
    }
  }

  /* Notify for any due, not-yet-notified task. Runs on load and on a timer. */
  function checkReminders() {
    if (!window.Notification || Notification.permission !== "granted") return;
    const now = Date.now();
    let changed = false;
    for (let i = 0; i < state.tasks.length; i++) {
      const task = state.tasks[i];
      if (task.done || task.notified) continue;
      const ts = dueTimestamp(task);
      if (ts && ts <= now) {
        showReminder(task);
        task.notified = true;
        changed = true;
      }
    }
    if (changed) saveState();
  }

  /* SHARED — small helpers used across the views */
  const ICON_FLOWER = '<circle cx="12" cy="6" r="3"/><circle cx="17.7" cy="10.15" r="3"/><circle cx="15.5" cy="16.85" r="3"/><circle cx="8.47" cy="16.85" r="3"/><circle cx="6.3" cy="10.15" r="3"/><circle cx="12" cy="12" r="2.2"/>';

  function iconSvg(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
         + 'stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }

  function findItem(list, id) {
    const items = state[list];
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
    }
    return null;
  }

  /* floral marker on a pinned task/project */
  function createPinMarker() {
    const pin = document.createElement("span");
    pin.className = "item__pin";
    pin.innerHTML = iconSvg(ICON_FLOWER);
    return pin;
  }

  /* HABITS VIEW — manage all habits (rename / icon / delete) + completion history */
  const habitsView = document.getElementById("habitsView");
  const habitsViewBody = document.getElementById("habitsViewBody");

  function openHabitsView() {
    renderHabitsView();
    habitsView.hidden = false;
    requestAnimationFrame(function () { habitsView.classList.add("is-open"); });   // slide in
  }
  function closeHabitsView() {
    habitsView.classList.remove("is-open");
    setTimeout(function () { habitsView.hidden = true; }, 300);
  }

  function renderHabitsView() {
    habitsViewBody.innerHTML = "";
    if (state.habits.length === 0) {
      const empty = document.createElement("p");
      empty.className = "detail__empty";
      empty.textContent = translate("emptyList");
      habitsViewBody.appendChild(empty);
      return;
    }
    for (let i = 0; i < state.habits.length; i++) {
      habitsViewBody.appendChild(createHabitCard(state.habits[i]));
    }
  }

  /* one habit: icon (tap to change), name, delete, streak, history heatmap */
  function createHabitCard(habit) {
    const card = document.createElement("div");
    card.className = "hcard";

    const iconBtn = document.createElement("button");
    iconBtn.type = "button";
    iconBtn.className = "hcard__icon";
    iconBtn.setAttribute("aria-label", translate("editIconLabel"));
    iconBtn.innerHTML = HABIT_ICONS[habit.icon] ? habitSvg(habit.icon) : "";
    iconBtn.addEventListener("click", function () { openIconPickerForEdit(habit.id); });

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "hcard__name";
    nameInput.maxLength = 40;
    nameInput.value = habit.name || "";
    nameInput.addEventListener("input", function () {
      habit.name = nameInput.value;
      saveState();
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "hcard__del";
    del.setAttribute("aria-label", translate("habitDeleteAria"));
    del.textContent = "×";
    del.addEventListener("click", function () {
      removeHabit(habit.id);   // handles re-render + undo
    });

    const head = document.createElement("div");
    head.className = "hcard__head";
    head.append(iconBtn, nameInput, del);

    const stats = document.createElement("div");
    stats.className = "hcard__stats";
    const histLabel = document.createElement("span");
    histLabel.textContent = translate("historyLabel");
    const streak = document.createElement("span");
    streak.className = "hcard__streak";
    streak.textContent = translate("streakLabel") + " " + habitStreak(habit);
    stats.append(histLabel, streak);

    card.append(head, stats, createHeatmap(habit));
    return card;
  }

  /* completed dates as a lookup object */
  function completedSet(habit) {
    const set = {};
    const dates = habit.completedDates || [];
    for (let i = 0; i < dates.length; i++) set[dates[i]] = true;
    return set;
  }

  /* consecutive completed days ending today (or yesterday if today isn't done yet) */
  function habitStreak(habit) {
    const set = completedSet(habit);
    const day = new Date();
    if (!set[todayKey()]) day.setDate(day.getDate() - 1);
    let streak = 0;
    while (set[dateKey(day.getFullYear(), day.getMonth(), day.getDate())]) {
      streak++;
      day.setDate(day.getDate() - 1);
    }
    return streak;
  }

  /* contribution grid: 13 weeks x 7 days, filled on completed days */
  function createHeatmap(habit) {
    const set = completedSet(habit);
    const today = new Date();
    const todayK = todayKey();
    const grid = document.createElement("div");
    grid.className = "heat";

    const weeks = 13;
    const start = new Date(today);
    start.setDate(today.getDate() - (weeks - 1) * 7 - ((today.getDay() + 6) % 7));   // back to a Monday
    for (let w = 0; w < weeks; w++) {
      const col = document.createElement("div");
      col.className = "heat__col";
      for (let d = 0; d < 7; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        const key = dateKey(day.getFullYear(), day.getMonth(), day.getDate());
        const cell = document.createElement("span");
        cell.className = "heat__cell";
        if (day > today) cell.classList.add("is-future");
        else if (set[key]) cell.classList.add("is-on");
        if (key === todayK) cell.classList.add("is-today");
        col.appendChild(cell);
      }
      grid.appendChild(col);
    }
    return grid;
  }

  document.getElementById("habitsViewBtn").addEventListener("click", openHabitsView);
  document.getElementById("habitsBack").addEventListener("click", closeHabitsView);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !habitsView.hidden) closeHabitsView();
  });

  /* DETAIL — full-screen view of a task/project: rename, props, notes, subtasks */
  const detail = document.getElementById("detail");
  const detailName = document.getElementById("detailName");
  const detailIcon = document.getElementById("detailIcon");
  const detailProps = document.getElementById("detailProps");
  const detailPin = document.getElementById("detailPin");
  const detailNotes = document.getElementById("detailNotes");
  const subtaskList = document.getElementById("subtaskList");
  const subtaskSection = document.getElementById("subtaskSection");
  const timelineSection = document.getElementById("timelineSection");
  const timeline = document.getElementById("timeline");
  // kind: "tasks" | "projects" | "milestone" (a milestone lives inside a project)
  let detailTarget = { kind: null, id: null, projectId: null };
  let detailReturn = null;   // project to reopen after closing a milestone detail

  /* the object the detail view currently edits */
  function currentDetailItem() {
    if (detailTarget.kind === "milestone") {
      const project = findItem("projects", detailTarget.projectId);
      return project ? findMilestone(project, detailTarget.id) : null;
    }
    return findItem(detailTarget.kind, detailTarget.id);
  }

  /* refresh whatever list the edited item belongs to (row badges / marks) */
  function refreshDetailSource() {
    if (detailTarget.kind === "milestone") renderList("projects");
    else if (detailTarget.kind === "events") {
      renderEventCal();
      renderDailyTimeline();
      if (!dayView.hidden) renderDayList();
    } else renderList(detailTarget.kind);
  }

  const ICON_NOTE = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>';
  const ICON_BELL = '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>';

  /* small "has notes" mark on a row */
  function createNoteMark() {
    const mark = document.createElement("span");
    mark.className = "item__note";
    mark.innerHTML = iconSvg(ICON_NOTE);
    return mark;
  }

  /* "2/5" subtask progress badge on a row */
  function createSubBadge(item) {
    let done = 0;
    for (let i = 0; i < item.subtasks.length; i++) {
      if (item.subtasks[i].done) done++;
    }
    const badge = document.createElement("span");
    badge.className = "item__sub";
    badge.textContent = done + "/" + item.subtasks.length;
    return badge;
  }

  /* milestone progress badge on a project row, as a percentage.
     The start milestone is the origin and is not counted. */
  function createMilestoneBadge(item) {
    const milestones = item.milestones;
    let done = 0;
    let total = 0;
    for (let i = 1; i < milestones.length; i++) {   // skip the start milestone
      total++;
      if (milestones[i].completedDate) done++;
    }
    const badge = document.createElement("span");
    badge.className = "item__sub";
    badge.textContent = (total ? Math.round(done / total * 100) : 0) + "%";
    return badge;
  }

  /* label + control wrapper (reuses the .field look); modifier for a row layout */
  function detailField(labelText, control, modifier) {
    const field = document.createElement("div");
    field.className = modifier ? "field " + modifier : "field";
    const label = document.createElement("span");
    label.className = "field__label";
    label.textContent = labelText;
    field.append(label, control);
    return field;
  }

  /* an on/off switch with a sliding, animated knob */
  function createToggle(isOn, onChange) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = isOn ? "toggle is-on" : "toggle";
    btn.setAttribute("role", "switch");
    btn.setAttribute("aria-checked", isOn ? "true" : "false");
    const knob = document.createElement("span");
    knob.className = "toggle__knob";
    btn.appendChild(knob);
    btn.addEventListener("click", function () {
      const on = !btn.classList.contains("is-on");
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
      onChange(on);
    });
    return btn;
  }

  /* type-specific controls — add per-type fields here (modular) */
  function renderDetailProps(item, list) {
    detailProps.innerHTML = "";
    if (list === "tasks") {
      const dateBtn = document.createElement("button");
      dateBtn.type = "button";
      dateBtn.className = "edit-prop";
      dateBtn.textContent = item.dueDate ? dueLabel(item) : translate("editDateNone");
      dateBtn.addEventListener("click", function () { openCalendar(item.id); });
      detailProps.appendChild(detailField(translate("calendarTitle"), dateBtn));
    } else if (list === "projects") {
      const bars = createImportanceBars(item.importance || 0, function (level) {
        item.importance = item.importance === level ? 0 : level;
        saveState();
        renderList("projects");
        renderDetailProps(item, "projects");
      });
      detailProps.appendChild(detailField(translate("importanceAria"), bars));
    } else if (list === "events") {
      const dateSpan = document.createElement("span");
      dateSpan.className = "edit-prop edit-prop--static";
      dateSpan.textContent = fullDateLabel(item.date) + (item.time ? " · " + item.time : "");
      detailProps.appendChild(detailField(translate("eventDateLabel"), dateSpan));

      const rescheduleBtn = document.createElement("button");
      rescheduleBtn.type = "button";
      rescheduleBtn.className = "edit-prop event-reschedule";
      rescheduleBtn.textContent = translate("rescheduleBtn");
      rescheduleBtn.addEventListener("click", function () { openCalendar(item.id, "events"); });
      detailProps.appendChild(rescheduleBtn);

      const toggle = createToggle(!!item.important, function (on) {
        item.important = on;
        saveState();
        refreshDetailSource();   // calendar bell / row highlight
      });
      toggle.setAttribute("aria-label", translate("importantAria"));
      detailProps.appendChild(detailField(translate("importantLabel"), toggle, "field--row"));
    }
  }

  /* top-level task or project */
  function openDetail(list, id) {
    const item = findItem(list, id);
    if (!item) return;
    detailTarget = { kind: list, id: id, projectId: null };
    fillDetail(item);
  }

  /* a milestone, edited like a task but stored inside its project */
  function openMilestoneDetail(project, milestone) {
    detailReturn = project.id;   // back returns to the project timeline
    detailTarget = { kind: "milestone", id: milestone.id, projectId: project.id };
    fillDetail(milestone);
  }

  /* populate and show the detail view for the current target */
  function fillDetail(item) {
    const kind = detailTarget.kind;
    detailName.value = item.text || "";
    detailPin.hidden = kind === "milestone" || kind === "events";   // not pinnable
    if (!detailPin.hidden) detailPin.classList.toggle("is-on", !!item.pinned);
    // events and projects carry an icon, shown as a square button left of the title
    const hasIcon = kind === "events" || kind === "projects";
    detailIcon.hidden = !hasIcon;
    if (hasIcon) detailIcon.innerHTML = habitSvg(item.icon || (kind === "events" ? "calendar" : "folder"));
    renderDetailProps(item, kind);
    detailNotes.value = item.notes || "";

    // projects show the milestone timeline, everything else shows subtasks
    const isProject = kind === "projects";
    subtaskSection.hidden = isProject;
    timelineSection.hidden = !isProject;
    if (isProject) renderTimeline(item);
    else renderSubtasks(item);

    detail.hidden = false;
    requestAnimationFrame(function () {
      detail.classList.add("is-open");
      if (isProject) layoutTimeline();   // measure once the view is visible
    });
  }

  function closeDetail() {
    // a milestone detail steps back to its project timeline, not out to the app
    if (detailTarget.kind === "milestone" && detailReturn) {
      const projectId = detailReturn;
      detailReturn = null;
      openDetail("projects", projectId);
      return;
    }
    detail.classList.remove("is-open");
    setTimeout(function () { detail.hidden = true; }, 300);   // after the slide out
  }

  /* refresh the type-specific controls after the calendar edits a date */
  function refreshDetailIfOpen() {
    if (detail.hidden) return;
    const item = currentDetailItem();
    if (item) renderDetailProps(item, detailTarget.kind);
  }

  /* SUBTASKS */
  function renderSubtasks(item) {
    subtaskList.innerHTML = "";
    const subs = item.subtasks || [];
    for (let i = 0; i < subs.length; i++) {
      subtaskList.appendChild(createSubtaskRow(item, subs[i]));
    }
  }

  function createSubtaskRow(item, sub) {
    const row = document.createElement("li");
    row.className = sub.done ? "item done" : "item";

    const checkbox = document.createElement("span");
    checkbox.className = "item__check";
    checkbox.textContent = sub.done ? "✓" : "";
    checkbox.addEventListener("click", function () { toggleSubtask(item, sub.id); });

    const label = document.createElement("span");
    label.className = "item__text";
    label.textContent = sub.text;
    label.addEventListener("click", function () { toggleSubtask(item, sub.id); });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "item__del";
    del.setAttribute("aria-label", translate("deleteAria"));
    del.textContent = "×";
    del.addEventListener("click", function () { removeSubtask(item, sub.id); });

    row.append(checkbox, label, del);
    return row;
  }

  function toggleSubtask(item, subId) {
    for (let i = 0; i < item.subtasks.length; i++) {
      if (item.subtasks[i].id === subId) {
        item.subtasks[i].done = !item.subtasks[i].done;
        break;
      }
    }
    saveState();
    renderSubtasks(item);
    refreshDetailSource();   // refresh the row badge
  }

  function removeSubtask(item, subId) {
    for (let i = 0; i < item.subtasks.length; i++) {
      if (item.subtasks[i].id === subId) {
        item.subtasks.splice(i, 1);
        break;
      }
    }
    saveState();
    renderSubtasks(item);
    refreshDetailSource();
  }

  /* MILESTONE TIMELINE (projects) — a vertical line of dots, text on the right,
     a gauge that fills down to the last completed dot, and a "+" node to extend it.
     A milestone behaves like a task (its own detail view) but lives inside a project.
     First and last dots are unnamed start/finish anchors; the "+" sits before finish. */
  function renderTimeline(project) {
    if (!project.milestones || project.milestones.length === 0) {
      project.milestones = [
        { id: Date.now().toString(), completedDate: null },        // start anchor
        { id: (Date.now() + 1).toString(), completedDate: null }   // finish anchor
      ];
      saveState();
    }

    timeline.innerHTML = "";
    const line = document.createElement("div");
    line.className = "tl-line";
    const fill = document.createElement("div");
    fill.className = "tl-fill";
    line.appendChild(fill);
    timeline.appendChild(line);

    const milestones = project.milestones;
    const lastIndex = milestones.length - 1;
    // once the finish milestone is completed the timeline is closed: no more adding
    const finishDone = !!milestones[lastIndex].completedDate;
    for (let i = 0; i < milestones.length; i++) {
      if (i === lastIndex && !finishDone) timeline.appendChild(createAddRow(project));
      const role = i === 0 ? "start" : (i === lastIndex ? "finish" : "");
      timeline.appendChild(createMilestoneRow(project, milestones[i], role));
    }
    layoutTimeline();
  }

  /* one dot on the line. Anchors are just a highlighted dot; a named milestone
     also shows its title (and completion date), and opens a task-like detail.
     role: "start" (origin, not clickable), "finish", or "" (a normal milestone). */
  function createMilestoneRow(project, milestone, role) {
    const isAnchor = role === "start" || role === "finish";
    const done = !!milestone.completedDate;
    const row = document.createElement("div");
    row.className = "tl-row";
    if (done) row.classList.add("is-done");
    if (isAnchor) row.classList.add("tl-row--anchor");

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "tl-dot";
    if (role === "start") {
      dot.disabled = true;   // the origin is fixed, not a completable step
      dot.classList.add("tl-dot--fixed");
    } else {
      dot.setAttribute("aria-label", translate("habitToggleAria"));
      dot.addEventListener("click", function (event) {
        event.stopPropagation();   // the dot toggles; the row opens the detail
        toggleMilestone(project, milestone.id);
      });
    }
    row.appendChild(dot);

    if (!isAnchor) {
      const content = document.createElement("div");
      content.className = "tl-content";

      const title = document.createElement("span");
      title.className = milestone.text ? "tl-title" : "tl-title is-empty";
      title.textContent = milestone.text || translate("milestonePlaceholder");
      content.appendChild(title);

      if (done) {
        const date = document.createElement("span");
        date.className = "tl-date";
        date.textContent = milestoneDateLabel(milestone.completedDate);
        content.appendChild(date);
      }

      row.appendChild(content);
      row.classList.add("tl-row--clickable");
      row.addEventListener("click", function () { openMilestoneDetail(project, milestone); });
    }
    return row;
  }

  /* "12 juil." — localized short completion date */
  function milestoneDateLabel(isoDate) {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    return new Date(isoDate + "T00:00").toLocaleDateString(locale, { day: "numeric", month: "short" });
  }

  /* the add row: a "+" dot and a title field; typing + Enter creates a milestone */
  function createAddRow(project) {
    const add = document.createElement("form");
    add.className = "tl-add";

    const dot = document.createElement("span");
    dot.className = "tl-add__dot";
    dot.textContent = "+";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "tl-add__input";
    input.maxLength = 120;
    input.placeholder = translate("milestoneAdd");

    add.addEventListener("submit", function (event) {
      event.preventDefault();
      const text = input.value.trim();
      if (text) addMilestone(project, text);
    });

    add.append(dot, input);
    return add;
  }

  /* insert a titled milestone just before the last one, keeping the finish at the end */
  function addMilestone(project, text) {
    if (!project.milestones) project.milestones = [];
    const at = Math.max(0, project.milestones.length - 1);
    project.milestones.splice(at, 0, { id: Date.now().toString(), text: text, completedDate: null });
    saveState();
    renderTimeline(project);
    renderList("projects");
    const input = timeline.querySelector(".tl-add__input");
    if (input) input.focus();   // ready for the next one
  }

  /* mark done (stamps today's date) or clear it, then refill the gauge */
  function toggleMilestone(project, id) {
    const milestone = findMilestone(project, id);
    if (!milestone) return;
    milestone.completedDate = milestone.completedDate ? null : todayKey();
    saveState();
    renderTimeline(project);
    renderList("projects");
  }

  function removeMilestone(project, id) {
    const milestones = project.milestones || [];
    for (let i = 0; i < milestones.length; i++) {
      if (milestones[i].id === id) { milestones.splice(i, 1); break; }
    }
    saveState();
    renderList("projects");
  }

  function findMilestone(project, id) {
    const milestones = project.milestones || [];
    for (let i = 0; i < milestones.length; i++) {
      if (milestones[i].id === id) return milestones[i];
    }
    return null;
  }

  /* current palette as five parsed rgb stops (--imp-1 .. --imp-5) */
  function paletteStops() {
    const style = getComputedStyle(document.documentElement);
    const stops = [];
    for (let i = 1; i <= 5; i++) {
      stops.push(hexToRgb(style.getPropertyValue("--imp-" + i).trim()));
    }
    return stops;
  }

  function hexToRgb(text) {
    let hex = text.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }

  /* color at position t (0..1) along the five evenly-spaced palette stops */
  function paletteColorAt(stops, t) {
    const scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    const low = Math.floor(scaled);
    const high = Math.min(low + 1, stops.length - 1);
    const frac = scaled - low;
    const a = stops[low];
    const b = stops[high];
    const r = Math.round(a.r + (b.r - a.r) * frac);
    const g = Math.round(a.g + (b.g - a.g) * frac);
    const blue = Math.round(a.b + (b.b - a.b) * frac);
    return "rgb(" + r + ", " + g + ", " + blue + ")";
  }

  /* run the line from the first dot to the "+" node, fill down to the last done dot,
     and tint every dot with its palette color at that height */
  function layoutTimeline() {
    const line = timeline.querySelector(".tl-line");
    const fill = timeline.querySelector(".tl-fill");
    if (!line || !fill) return;
    const dots = timeline.querySelectorAll(".tl-dot, .tl-add__dot");
    if (dots.length === 0) { line.style.height = "0"; fill.style.height = "0"; return; }

    const base = timeline.getBoundingClientRect().top;
    const centerY = function (dot) {
      const rect = dot.getBoundingClientRect();
      return rect.top + rect.height / 2 - base;
    };
    const firstY = centerY(dots[0]);
    const lastY = centerY(dots[dots.length - 1]);
    const span = lastY - firstY;
    line.style.top = firstY + "px";
    line.style.height = span + "px";

    // palette gradient mapped to the whole line, revealed as the fill grows
    fill.style.backgroundSize = "100% " + span + "px";

    const doneDots = timeline.querySelectorAll(".tl-row.is-done .tl-dot");
    const fillY = doneDots.length ? centerY(doneDots[doneDots.length - 1]) : firstY;
    fill.style.height = Math.max(0, fillY - firstY) + "px";   // fill sits inside the line

    // tint each milestone dot with the palette color at its height
    const stops = paletteStops();
    const milestoneDots = timeline.querySelectorAll(".tl-dot");
    for (let i = 0; i < milestoneDots.length; i++) {
      const dot = milestoneDots[i];
      const row = dot.parentNode;
      const color = paletteColorAt(stops, span > 0 ? (centerY(dot) - firstY) / span : 0);
      const isDone = row.classList.contains("is-done");
      const isAnchor = row.classList.contains("tl-row--anchor");
      const isFinish = i === milestoneDots.length - 1;
      // the finish anchor only fills once completed; the start anchor stays solid
      const solid = isDone || (isAnchor && !isFinish);
      dot.style.borderColor = color;
      dot.style.background = solid ? color : "var(--surface)";
    }
  }

  /* live rename */
  detailName.addEventListener("input", function () {
    const item = currentDetailItem();
    if (!item) return;
    item.text = detailName.value;
    saveState();
    refreshDetailSource();
  });

  /* auto-saved notes */
  detailNotes.addEventListener("input", function () {
    const item = currentDetailItem();
    if (!item) return;
    item.notes = detailNotes.value;
    saveState();
    refreshDetailSource();   // refresh the note mark
  });

  detailPin.addEventListener("click", function () {
    const item = currentDetailItem();
    if (!item) return;
    item.pinned = !item.pinned;
    saveState();
    refreshDetailSource();
    detailPin.classList.toggle("is-on", !!item.pinned);
  });

  detailIcon.addEventListener("click", openIconPickerForDetail);

  document.getElementById("subtaskForm").addEventListener("submit", function (event) {
    event.preventDefault();
    const input = document.getElementById("subtaskInput");
    const text = input.value.trim();
    if (!text) return;
    const item = currentDetailItem();
    if (!item) return;
    if (!item.subtasks) item.subtasks = [];
    item.subtasks.push({ id: Date.now().toString(), text: text, done: false });
    saveState();
    input.value = "";
    input.focus();
    renderSubtasks(item);
    refreshDetailSource();
  });

  document.getElementById("detailBack").addEventListener("click", closeDetail);
  document.getElementById("detailDelete").addEventListener("click", function () {
    if (detailTarget.kind === "milestone") {
      const project = findItem("projects", detailTarget.projectId);
      if (project) removeMilestone(project, detailTarget.id);
    } else if (detailTarget.kind === "events") {
      removeEvent(detailTarget.id);
    } else {
      removeItem(detailTarget.kind, detailTarget.id);
    }
    closeDetail();   // milestone/event deletion steps back to its source view
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !detail.hidden) closeDetail();
  });

  /* EVENTS — a calendar in the main view. Clicking a day opens that day's
     events (add + list); each event is a task-like item with its own detail. */
  const dayView = document.getElementById("dayView");
  const ecalGrid = document.getElementById("ecalGrid");
  let ecalYear = new Date().getFullYear();
  let ecalMonth = new Date().getMonth();
  let dayViewKey = null;

  function eventsOnDay(key) {
    const found = [];
    for (let i = 0; i < state.events.length; i++) {
      if (state.events[i].date === key) found.push(state.events[i]);
    }
    return found;
  }

  /* "past" once its time (or the end of its day, if no time) has gone by */
  function eventStatus(event) {
    const at = new Date(event.date + "T" + (event.time || "23:59:59"));
    return Date.now() > at.getTime() ? "past" : "pending";
  }

  /* "vendredi 25 juillet 2026" — full localized date, first letter capitalized */
  function fullDateLabel(key) {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const text = new Date(key + "T00:00").toLocaleDateString(locale,
      { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /* Draw the month: label, weekday row, leading blanks, day cells with event dots. */
  function renderEventCal() {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    document.getElementById("ecalMonth").textContent =
      new Date(ecalYear, ecalMonth, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });

    ecalGrid.innerHTML = "";
    for (let i = 0; i < 7; i++) {   // weekday headers, Monday first
      const head = document.createElement("div");
      head.className = "ecal__wd";
      head.textContent = new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "short" });
      ecalGrid.appendChild(head);
    }

    const firstOfMonth = new Date(ecalYear, ecalMonth, 1);
    const lead = (firstOfMonth.getDay() + 6) % 7;   // Monday-first offset
    for (let i = 0; i < lead; i++) {
      const pad = document.createElement("div");
      pad.className = "ecal__pad";
      ecalGrid.appendChild(pad);
    }

    const daysInMonth = new Date(ecalYear, ecalMonth + 1, 0).getDate();
    const today = todayKey();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(ecalYear, ecalMonth, d);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = key === today ? "ecal__day is-today" : "ecal__day";

      const num = document.createElement("span");
      num.textContent = String(d);
      cell.appendChild(num);

      const dayEvents = eventsOnDay(key);
      if (dayEvents.length) {
        const icons = document.createElement("span");   // event icons along the bottom
        icons.className = "ecal__icons";
        const shown = Math.min(dayEvents.length, 3);
        let hasImportant = false;
        for (let k = 0; k < dayEvents.length; k++) {
          if (dayEvents[k].important) { hasImportant = true; break; }
        }
        for (let k = 0; k < shown; k++) {
          const ico = document.createElement("span");
          ico.className = "ecal__ico";
          ico.innerHTML = habitSvg(dayEvents[k].icon || "calendar");
          icons.appendChild(ico);
        }
        cell.appendChild(icons);
        if (hasImportant) {   // a red bell in the top-right corner, away from the icons
          const bell = document.createElement("span");
          bell.className = "ecal__bell";
          bell.innerHTML = iconSvg(ICON_BELL);
          cell.appendChild(bell);
        }
        cell.appendChild(eventPreview(dayEvents));
      }
      cell.addEventListener("click", function () { openDayView(key); });
      ecalGrid.appendChild(cell);
    }
  }

  /* hover card listing a day's events (up to four, then a "+N" line) */
  function eventPreview(dayEvents) {
    const card = document.createElement("span");   // span: valid inside the day button
    card.className = "ecal__preview";
    const shown = Math.min(dayEvents.length, 4);
    for (let i = 0; i < shown; i++) {
      const line = document.createElement("span");
      line.className = dayEvents[i].important ? "ecal__prev-item important" : "ecal__prev-item";
      const ico = document.createElement("span");
      ico.className = "ecal__prev-ico";
      ico.innerHTML = habitSvg(dayEvents[i].icon || "calendar");
      const text = document.createElement("span");
      text.className = "ecal__prev-text";
      text.textContent = dayEvents[i].text;
      line.append(ico, text);
      card.appendChild(line);
    }
    if (dayEvents.length > shown) {
      const more = document.createElement("span");
      more.className = "ecal__prev-more";
      more.textContent = "+" + (dayEvents.length - shown);
      card.appendChild(more);
    }
    return card;
  }

  document.getElementById("ecalPrev").addEventListener("click", function () {
    ecalMonth--;
    if (ecalMonth < 0) { ecalMonth = 11; ecalYear--; }
    renderEventCal();
  });
  document.getElementById("ecalNext").addEventListener("click", function () {
    ecalMonth++;
    if (ecalMonth > 11) { ecalMonth = 0; ecalYear++; }
    renderEventCal();
  });

  /* DAY VIEW */
  function openDayView(key) {
    dayViewKey = key;
    document.getElementById("dayTitle").textContent = fullDateLabel(key);
    renderDayList();
    dayView.hidden = false;
    requestAnimationFrame(function () {
      dayView.classList.add("is-open");
      document.getElementById("dayAddInput").focus();
    });
  }
  function closeDayView() {
    dayView.classList.remove("is-open");
    setTimeout(function () { dayView.hidden = true; }, 300);
  }

  function renderDayList() {
    const list = document.getElementById("dayList");
    list.innerHTML = "";
    const dayEvents = eventsOnDay(dayViewKey);
    if (dayEvents.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = translate("emptyList");
      list.appendChild(empty);
      return;
    }
    for (let i = 0; i < dayEvents.length; i++) {
      list.appendChild(createEventRow(dayEvents[i]));
    }
  }

  /* one event row: rectangular, time on the left; a click opens the detail.
     No checkbox — an event is past or pending, never "completed". */
  function createEventRow(event) {
    const status = eventStatus(event);
    const row = document.createElement("li");
    row.className = "event-row is-" + status + (event.important ? " is-important" : "");
    row.addEventListener("click", function () { openEventDetail(event); });

    const icon = document.createElement("span");
    icon.className = "event-row__icon";
    icon.innerHTML = habitSvg(event.icon || "calendar");
    row.appendChild(icon);

    const time = document.createElement("span");
    time.className = "event-row__time";
    time.textContent = event.time || "—";
    row.appendChild(time);

    const main = document.createElement("div");
    main.className = "event-row__main";

    const title = document.createElement("span");
    title.className = "event-row__title";
    title.textContent = event.text;
    main.appendChild(title);

    const meta = document.createElement("span");
    meta.className = "event-row__meta";
    const statusEl = document.createElement("span");
    statusEl.className = "event-row__status";
    statusEl.textContent = translate(status === "past" ? "eventStatusPast" : "eventStatusPending");
    meta.appendChild(statusEl);
    if (event.notes && event.notes.trim()) meta.appendChild(createNoteMark());
    if (event.subtasks && event.subtasks.length) meta.appendChild(createSubBadge(event));
    main.appendChild(meta);

    row.appendChild(main);
    if (event.important) {
      const alert = document.createElement("span");
      alert.className = "event-row__alert";
      alert.innerHTML = iconSvg(ICON_BELL);
      row.appendChild(alert);
    }
    return row;
  }

  function openEventDetail(event) {
    detailReturn = null;   // the day view stays open underneath
    detailTarget = { kind: "events", id: event.id, projectId: null };
    fillDetail(event);
  }

  function addEvent(key, text) {
    state.events.push({ id: Date.now().toString(), text: text, important: false, icon: "calendar", date: key });
    saveState();
    renderDayList();
    renderEventCal();
    renderDailyTimeline();
  }

  function removeEvent(id) {
    removeWithUndo("events", id, function () {
      if (!dayView.hidden) renderDayList();
      renderEventCal();
      renderDailyTimeline();
    });
  }

  document.getElementById("dayAddForm").addEventListener("submit", function (event) {
    event.preventDefault();
    const input = document.getElementById("dayAddInput");
    const text = input.value.trim();
    if (!text) return;
    addEvent(dayViewKey, text);
    input.value = "";
    input.focus();
  });
  document.getElementById("dayBack").addEventListener("click", closeDayView);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && detail.hidden && !dayView.hidden) closeDayView();
  });

  /* DAILY TIMELINE — a 24h sun bar (sunrise/sunset from Open-Meteo, cached once a
     day) with the day's events as chips underneath. Falls back to a plain bar. */
  // half-sun (horizon) marker for sunrise/sunset, and the sun/moon cursor glyphs
  const HALFSUN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
    + 'stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="18" x2="21" y2="18"/>'
    + '<path d="M7.5 18 a4.5 4.5 0 0 1 9 0"/><line x1="12" y1="5" x2="12" y2="8"/>'
    + '<line x1="5.5" y1="9.8" x2="7" y2="11.3"/><line x1="18.5" y1="9.8" x2="17" y2="11.3"/></svg>';
  const SUN_CURSOR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" '
    + 'stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="5" stroke="none"/>'
    + '<g fill="none"><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/>'
    + '<line x1="3.6" y1="3.6" x2="5.3" y2="5.3"/><line x1="18.7" y1="18.7" x2="20.4" y2="20.4"/>'
    + '<line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/>'
    + '<line x1="3.6" y1="20.4" x2="5.3" y2="18.7"/><line x1="18.7" y1="5.3" x2="20.4" y2="3.6"/></g></svg>';
  const MOON_CURSOR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">'
    + '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>';

  function toMinutes(hhmm) {
    const parts = hhmm.split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  function capitalizeFirst(text) { return text.charAt(0).toUpperCase() + text.slice(1); }

  /* current time as HH:MM am/pm */
  function formatClock12(date) {
    let hours = date.getHours();
    const ampm = hours < 12 ? "am" : "pm";
    hours = hours % 12 || 12;
    return String(hours).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0") + " " + ampm;
  }

  function todaySun() {
    return (state.sun && state.sun.date === todayKey() && state.sun.sunrise) ? state.sun : null;
  }

  /* gradient that follows the real daylight window when we have it */
  function stripGradient(sun) {
    if (!sun) return "linear-gradient(90deg, var(--dtl-night), var(--dtl-day) 50%, var(--dtl-night))";
    const sr = toMinutes(sun.sunrise) / 1440 * 100;
    const ss = toMinutes(sun.sunset) / 1440 * 100;
    const noon = (toMinutes(sun.sunrise) + toMinutes(sun.sunset)) / 2 / 1440 * 100;
    return "linear-gradient(90deg,"
      + " var(--dtl-night) 0%, var(--dtl-night) " + Math.max(0, sr - 7).toFixed(1) + "%,"
      + " var(--dtl-dawn) " + sr.toFixed(1) + "%, var(--dtl-day) " + noon.toFixed(1) + "%,"
      + " var(--dtl-dusk) " + ss.toFixed(1) + "%, var(--dtl-night) "
      + Math.min(100, ss + 7).toFixed(1) + "%, var(--dtl-night) 100%)";
  }

  /* a sunrise/sunset marker: the time above a small sun icon, placed at its hour */
  function sunMarker(timeText, pct) {
    const marker = document.createElement("div");
    marker.className = "dtl__marker";
    marker.style.left = pct + "%";
    const time = document.createElement("span");
    time.className = "dtl__marker-time";
    time.textContent = timeText;
    const icon = document.createElement("span");
    icon.className = "dtl__marker-ico";
    icon.innerHTML = HALFSUN_SVG;
    marker.append(time, icon);
    return marker;
  }

  function renderDtlTicks() {
    const ticks = document.getElementById("dtlTicks");
    ticks.innerHTML = "";
    for (let h = 0; h <= 24; h += 3) {
      const label = document.createElement("span");
      label.textContent = (h < 10 ? "0" : "") + h + ":00";
      ticks.appendChild(label);
    }
  }

  function renderDailyTimeline() {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    document.getElementById("dtlDate").textContent = capitalizeFirst(
      new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" }));

    const sun = todaySun();
    document.getElementById("dtlStrip").style.background = stripGradient(sun);
    renderDtlTicks();

    // place + current weather pill next to the date
    const weather = document.getElementById("dtlWeather");
    weather.innerHTML = "";
    if (sun && sun.temp != null) {
      weather.hidden = false;
      if (sun.place) {
        const place = document.createElement("span");
        place.className = "dtl__place";
        place.textContent = sun.place;
        weather.appendChild(place);
      }
      const icon = document.createElement("span");
      icon.className = "dtl__wico";
      icon.innerHTML = weatherIcon(sun.code);   // trusted svg markup
      const temp = document.createElement("span");
      temp.className = "dtl__temp";
      temp.textContent = Math.round(sun.temp) + "°";
      weather.append(icon, temp);
    } else {
      weather.hidden = true;
    }

    const markers = document.getElementById("dtlMarkers");
    const cursor = document.getElementById("dtlCursor");
    markers.innerHTML = "";

    if (sun) {
      const srMin = toMinutes(sun.sunrise);
      const ssMin = toMinutes(sun.sunset);
      markers.appendChild(sunMarker(sun.sunrise, srMin / 1440 * 100));
      markers.appendChild(sunMarker(sun.sunset, ssMin / 1440 * 100));

      const now = new Date();
      updateCursor(cursor, now.getHours() * 60 + now.getMinutes(), srMin, ssMin);
      cursor.hidden = false;
    } else {
      cursor.hidden = true;
    }

    renderEventTicks();
    renderDtlEvents();
  }

  /* place the cursor at the current time on the bar: sun by day (halo fading
     within an hour of sunrise/sunset), moon with a white halo by night */
  function updateCursor(cursor, nowMin, srMin, ssMin) {
    cursor.style.left = (nowMin / 1440 * 100) + "%";
    const isDay = nowMin >= srMin && nowMin <= ssMin;
    cursor.classList.toggle("is-day", isDay);
    cursor.classList.toggle("is-night", !isDay);
    const icon = cursor.querySelector(".dtl__cursor-ico");
    let halo;
    if (isDay) {
      icon.innerHTML = SUN_CURSOR_SVG;
      const edge = Math.min(nowMin - srMin, ssMin - nowMin);   // minutes to nearest edge
      halo = edge >= 60 ? 1 : Math.max(0.12, edge / 60);
    } else {
      icon.innerHTML = MOON_CURSOR_SVG;
      halo = 0.9;
    }
    cursor.style.setProperty("--halo", halo.toFixed(2));
  }

  /* one tick per timed event, placed on the bar at its hour (hover shows it) */
  function renderEventTicks() {
    const layer = document.getElementById("dtlEticks");
    layer.innerHTML = "";
    const dayEvents = eventsOnDay(todayKey());
    for (let i = 0; i < dayEvents.length; i++) {
      const event = dayEvents[i];
      if (!event.time) continue;
      const tick = document.createElement("button");
      tick.type = "button";
      tick.className = "dtl__etick";
      tick.style.left = (toMinutes(event.time) / 1440 * 100) + "%";
      tick.addEventListener("click", function () { openEventDetail(event); });

      const line = document.createElement("span");
      line.className = "dtl__etick-line";
      const tip = document.createElement("span");
      tip.className = "dtl__etick-tip";
      tip.textContent = event.time + " · " + event.text;
      tick.append(line, tip);
      layer.appendChild(tick);
    }
  }

  function dtlEventSort(a, b) {
    const ta = a.time || "99:99";
    const tb = b.time || "99:99";
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  }

  function renderDtlEvents() {
    const box = document.getElementById("dtlEvents");
    box.innerHTML = "";
    const today = todayKey();
    const list = eventsOnDay(today).slice().sort(dtlEventSort);
    for (let i = 0; i < list.length; i++) box.appendChild(dtlEventRow(list[i]));

    const add = document.createElement("button");
    add.type = "button";
    add.className = "dtl-ev dtl-ev--add";
    const plus = document.createElement("span");
    plus.className = "dtl-ev__plus";
    plus.textContent = "+";
    const label = document.createElement("span");
    label.className = "dtl-ev__title";
    label.textContent = translate("addEventTitle");
    add.append(plus, label);
    add.addEventListener("click", function () { openDayView(today); });
    box.appendChild(add);
  }

  /* an event under the gauge: a rectangle with icon, title, and time on the right */
  function dtlEventRow(event) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "dtl-ev is-" + eventStatus(event) + (event.important ? " is-important" : "");
    row.addEventListener("click", function () { openEventDetail(event); });

    const icon = document.createElement("span");
    icon.className = "dtl-ev__ico";
    icon.innerHTML = habitSvg(event.icon || "calendar");
    row.appendChild(icon);

    const title = document.createElement("span");
    title.className = "dtl-ev__title";
    title.textContent = event.text;
    row.appendChild(title);

    if (event.important) {
      const bell = document.createElement("span");
      bell.className = "dtl-ev__bell";
      bell.innerHTML = iconSvg(ICON_BELL);
      row.appendChild(bell);
    }
    if (event.time) {
      const time = document.createElement("span");
      time.className = "dtl-ev__time";
      time.textContent = event.time;
      row.appendChild(time);
    }
    return row;
  }

  /* sunrise/sunset (once a day) and weather (refreshed every few hours) from
     Open-Meteo. Never re-prompts geolocation once coordinates are known. */
  const WEATHER_MAX_AGE = 3 * 3600 * 1000;   // 3h
  function ensureSunData() {
    const sun = state.sun;
    const freshSun = sun && sun.date === todayKey() && sun.sunrise;
    const freshWeather = sun && sun.weatherAt && (Date.now() - sun.weatherAt < WEATHER_MAX_AGE);
    if (freshSun && freshWeather) return;
    if (sun && sun.lat != null) {
      fetchSun(sun.lat, sun.lon);   // reuse known coords, no prompt
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function (pos) {
        fetchSun(pos.coords.latitude, pos.coords.longitude);
      }, function () {});   // denied: use the city search in settings instead
    }
  }

  function fetchSun(lat, lon) {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon
      + "&daily=sunrise,sunset&current=temperature_2m,weather_code&timezone=auto";
    fetch(url).then(function (res) { return res.json(); }).then(function (data) {
      const sunrise = data.daily.sunrise[0];   // "2026-06-25T05:59"
      const sunset = data.daily.sunset[0];
      state.sun = {
        date: todayKey(), lat: lat, lon: lon,
        place: (state.sun && state.sun.place) || placeFromTimezone(data.timezone),
        sunrise: sunrise.slice(11, 16), sunset: sunset.slice(11, 16),
        temp: data.current.temperature_2m,
        code: data.current.weather_code,
        weatherAt: Date.now()
      };
      saveState();
      renderDailyTimeline();
      if (state.settings.theme === "auto") applyTheme("auto");   // may switch to/from rain
      applyDecorations();   // reflect the new weather under the adaptive theme
    }).catch(function () {});
  }

  /* rough place name from a tz like "Europe/Paris" -> "Paris" (for geolocation) */
  function placeFromTimezone(tz) {
    if (!tz) return null;
    const parts = tz.split("/");
    return parts[parts.length - 1].replace(/_/g, " ");
  }

  /* pick a weather glyph from the WMO code (0 clear … 95+ storm) */
  function weatherIcon(code) {
    const sun = '<circle cx="12" cy="12" r="4"/><line x1="12" y1="3" x2="12" y2="5"/>'
      + '<line x1="12" y1="19" x2="12" y2="21"/><line x1="3" y1="12" x2="5" y2="12"/>'
      + '<line x1="19" y1="12" x2="21" y2="12"/><line x1="6" y1="6" x2="7.4" y2="7.4"/>'
      + '<line x1="16.6" y1="16.6" x2="18" y2="18"/><line x1="6" y1="18" x2="7.4" y2="16.6"/>'
      + '<line x1="16.6" y1="7.4" x2="18" y2="6"/>';
    const cloud = '<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1.4A3.6 3.6 0 0 1 18 18z"/>';
    const partly = '<circle cx="8" cy="8" r="2.6"/><line x1="8" y1="3" x2="8" y2="4.2"/>'
      + '<line x1="3.4" y1="8" x2="4.6" y2="8"/><line x1="4.8" y1="4.8" x2="5.6" y2="5.6"/>'
      + '<path d="M9 19a3.5 3.5 0 0 1 0-7 4.5 4.5 0 0 1 8.5-1.2A3.2 3.2 0 0 1 18 19z"/>';
    const rain = cloud + '<line x1="8" y1="20" x2="7" y2="22"/><line x1="12" y1="20" x2="11" y2="22"/>'
      + '<line x1="16" y1="20" x2="15" y2="22"/>';
    const snow = cloud + '<line x1="8" y1="20.5" x2="8" y2="20.51"/><line x1="12" y1="21" x2="12" y2="21.01"/>'
      + '<line x1="16" y1="20.5" x2="16" y2="20.51"/>';
    const storm = cloud + '<polyline points="12 19 10 22.5 13 22 11 25.5"/>';
    const fog = '<line x1="4" y1="9" x2="20" y2="9"/><line x1="3" y1="13" x2="21" y2="13"/>'
      + '<line x1="5" y1="17" x2="19" y2="17"/>';

    let inner;
    if (code === 0) inner = sun;
    else if (code <= 2) inner = partly;
    else if (code === 45 || code === 48) inner = fog;
    else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) inner = rain;
    else if ((code >= 71 && code <= 77) || code === 85 || code === 86) inner = snow;
    else if (code >= 95) inner = storm;
    else inner = cloud;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
      + 'stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }

  /* LOCATION — city search (Open-Meteo geocoding) as a fallback when geolocation
     is denied, or to set the place by hand */
  const citySearchInput = document.getElementById("citySearch");
  const cityResults = document.getElementById("cityResults");
  let citySearchTimer = null;

  citySearchInput.addEventListener("input", function () {
    clearTimeout(citySearchTimer);
    const query = citySearchInput.value.trim();
    if (query.length < 2) { cityResults.innerHTML = ""; return; }
    citySearchTimer = setTimeout(function () { searchCity(query); }, 300);   // debounce
  });

  function searchCity(query) {
    const url = "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(query)
      + "&count=5&language=" + state.settings.language;
    fetch(url).then(function (res) { return res.json(); }).then(function (data) {
      renderCityResults(data.results || []);
    }).catch(function () {});
  }

  function renderCityResults(results) {
    cityResults.innerHTML = "";
    for (let i = 0; i < results.length; i++) {
      const place = results[i];
      const parts = [place.name];
      if (place.admin1) parts.push(place.admin1);
      if (place.country) parts.push(place.country);
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = "city-result";
      choice.textContent = parts.join(", ");
      choice.addEventListener("click", function () {
        setLocation(place.latitude, place.longitude, place.name);
      });
      cityResults.appendChild(choice);
    }
  }

  function setLocation(lat, lon, name) {
    state.sun = { date: null, lat: lat, lon: lon, place: name };   // force a refetch
    saveState();
    citySearchInput.value = "";
    cityResults.innerHTML = "";
    fetchSun(lat, lon);
  }

  /* NOTES — a list of note titles; clicking one opens a rich-text editor.
     The emoji list is feature data requested by the user (not decorative code). */
  const NOTE_EMOJIS = ["😀", "👍", "❤️", "🔥", "⭐", "✅", "📌", "💡", "🎉", "⚠️"];
  const notesView = document.getElementById("notes");
  const notesList = document.getElementById("notesList");
  const noteEditor = document.getElementById("noteEditor");
  const noteEditorBody = document.getElementById("noteEditorBody");
  const noteTitleInput = document.getElementById("noteTitleInput");
  const noteSearch = document.getElementById("noteSearch");
  let editorNoteId = null;

  function findNote(id) {
    for (let i = 0; i < state.notes.length; i++) {
      if (state.notes[i].id === id) return state.notes[i];
    }
    return null;
  }

  /* plain text of a note's body */
  function noteText(note) {
    const tmp = document.createElement("div");
    tmp.innerHTML = note.html || "";
    return tmp.textContent.trim();
  }

  /* explicit title, or the body's first line as a fallback */
  function noteDisplayTitle(note) {
    const title = (note.title || "").trim();
    if (title) return title;
    return noteText(note).split("\n")[0];
  }

  function noteStamp(note) {
    return note.updatedAt || Number(note.id) || 0;
  }

  /* localized "il y a 2 h" for recent notes, a short date for older ones */
  function relativeTime(ts) {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const sec = Math.round((Date.now() - ts) / 1000);
    if (sec < 60) return rtf.format(-sec, "second");
    const min = Math.round(sec / 60);
    if (min < 60) return rtf.format(-min, "minute");
    const hr = Math.round(min / 60);
    if (hr < 24) return rtf.format(-hr, "hour");
    const day = Math.round(hr / 24);
    if (day < 7) return rtf.format(-day, "day");
    return new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "short" });
  }

  /* LIST */
  function openNotes() {
    renderNotesList();
    notesView.hidden = false;
    requestAnimationFrame(function () { notesView.classList.add("is-open"); });
  }
  function closeNotes() {
    notesView.classList.remove("is-open");
    setTimeout(function () { notesView.hidden = true; }, 300);
  }

  function renderNotesList() {
    notesList.innerHTML = "";
    const query = noteSearch.value.trim().toLowerCase();
    const sorted = state.notes.slice().sort(function (a, b) { return noteStamp(b) - noteStamp(a); });
    const shown = [];
    for (let i = 0; i < sorted.length; i++) {
      const haystack = (noteDisplayTitle(sorted[i]) + " " + noteText(sorted[i])).toLowerCase();
      if (!query || haystack.indexOf(query) !== -1) shown.push(sorted[i]);
    }
    if (shown.length === 0) {
      const empty = document.createElement("p");
      empty.className = "detail__empty";
      empty.textContent = translate("emptyList");
      notesList.appendChild(empty);
      return;
    }
    for (let i = 0; i < shown.length; i++) {
      notesList.appendChild(createNoteCard(shown[i]));
    }
  }

  /* a card: title + preview + relative date; click to edit, × to delete */
  function createNoteCard(note) {
    const card = document.createElement("div");
    card.className = "note-card";
    card.addEventListener("click", function () { openNoteEditor(note.id); });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "note-card__del";
    del.setAttribute("aria-label", translate("deleteAria"));
    del.textContent = "×";
    del.addEventListener("click", function (event) {
      event.stopPropagation();
      removeNote(note.id);
    });

    const title = document.createElement("div");
    title.className = "note-card__title";
    const displayed = noteDisplayTitle(note);
    if (displayed) {
      title.textContent = displayed;
    } else {
      title.textContent = translate("untitledNote");
      title.classList.add("is-empty");
    }

    const preview = document.createElement("div");
    preview.className = "note-card__preview";
    preview.textContent = noteText(note);

    const date = document.createElement("div");
    date.className = "note-card__date";
    date.textContent = relativeTime(noteStamp(note));

    card.append(del, title, preview, date);
    return card;
  }

  function addNote() {
    const note = { id: Date.now().toString(), title: "", html: "", updatedAt: Date.now() };
    state.notes.unshift(note);
    saveState();
    openNoteEditor(note.id);   // jump straight into editing
  }

  function removeNote(id) {
    removeWithUndo("notes", id, function () { renderNotesList(); });
  }

  /* EDITOR */
  function openNoteEditor(id) {
    editorNoteId = id;
    const note = findNote(id);
    noteTitleInput.value = note ? (note.title || "") : "";
    noteEditorBody.setAttribute("data-placeholder", translate("notePlaceholder"));
    noteEditorBody.innerHTML = note ? (note.html || "") : "";
    noteEditor.hidden = false;
    requestAnimationFrame(function () {
      noteEditor.classList.add("is-open");
      noteTitleInput.focus();
    });
  }
  function closeNoteEditor() {
    noteEditor.classList.remove("is-open");
    setTimeout(function () { noteEditor.hidden = true; }, 300);
    renderNotesList();   // refresh the list (title / order / date)
  }

  /* save title + body together and bump the timestamp */
  function touchNote() {
    const note = findNote(editorNoteId);
    if (!note) return;
    note.title = noteTitleInput.value;
    note.html = noteEditorBody.innerHTML;
    note.updatedAt = Date.now();
    saveState();
  }
  noteTitleInput.addEventListener("input", touchNote);
  noteEditorBody.addEventListener("input", touchNote);
  noteSearch.addEventListener("input", renderNotesList);

  /* toolbar — applies to the editor body's selection */
  function applyNoteFormat(cmd) {
    if (cmd === "hilite") {
      document.execCommand("styleWithCSS", false, true);
      document.execCommand("hiliteColor", false, "#ffe08a");
    } else {
      document.execCommand(cmd, false, null);
    }
  }

  /* toolbar buttons keep the selection (mousedown preventDefault), then run the command */
  const noteTools = document.querySelectorAll(".ntool[data-cmd]");
  for (let i = 0; i < noteTools.length; i++) {
    noteTools[i].addEventListener("mousedown", function (event) { event.preventDefault(); });
    noteTools[i].addEventListener("click", function () { applyNoteFormat(this.dataset.cmd); });
  }

  const emojiBox = document.getElementById("noteEmojis");
  for (let i = 0; i < NOTE_EMOJIS.length; i++) {
    const emoji = NOTE_EMOJIS[i];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ntool ntool--emoji";
    btn.textContent = emoji;
    btn.addEventListener("mousedown", function (event) { event.preventDefault(); });
    btn.addEventListener("click", function () { document.execCommand("insertText", false, emoji); });
    emojiBox.appendChild(btn);
  }

  document.getElementById("notesBtn").addEventListener("click", openNotes);
  document.getElementById("notesBack").addEventListener("click", closeNotes);
  document.getElementById("addNoteBtn").addEventListener("click", addNote);
  document.getElementById("noteEditorBack").addEventListener("click", closeNoteEditor);
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (!noteEditor.hidden) closeNoteEditor();
    else if (!notesView.hidden) closeNotes();
  });

  applyTheme(state.settings.theme);
  applyPalette(state.settings.palette);
  applyLanguage(state.settings.language);
  renderList("tasks");
  renderList("projects");
  renderHabits();
  renderEventCal();
  renderDailyTimeline();
  buildIconPicker();
  checkReminders();
  setInterval(checkReminders, 30000);
  renderGreeting();
  initSky();
  buildRosace();
  applyDecorations();
  setInterval(function () {
    renderGreeting();
    renderDailyTimeline();   // advance the sun, roll the date over at midnight
    if (state.sun && state.sun.lat != null) ensureSunData();   // refresh weather when stale
    if (state.settings.theme === "auto") applyTheme("auto");   // follow the hour
  }, 30000);

  /* register the service worker for offline use — but never on localhost,
     so local dev always serves fresh files (no stale cache to resync) */
  if ("serviceWorker" in navigator) {
    const host = location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "";
    if (isLocal) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        for (let i = 0; i < regs.length; i++) regs[i].unregister();   // drop any old worker
      });
      if (window.caches) {
        caches.keys().then(function (names) {
          for (let i = 0; i < names.length; i++) caches.delete(names[i]);
        });
      }
    } else {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("./service-worker.js");
      });
    }
  }
})();
