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
        if (habits[i].type === "sleep") {   // min/max = recommended zone; target = bedtime goal
          const c = habits[i].config || (habits[i].config = {});
          if (c.min == null) c.min = c.target != null ? c.target : 7;   // old target was the zone min
          if (c.max == null) c.max = 9;
          if (c.target == null) c.target = 8;
          if (!habits[i].sleepLog) habits[i].sleepLog = {};
        }
        if (habits[i].type === "exercise") {
          const c = habits[i].config || (habits[i].config = {});
          if (!c.items) c.items = [];
          if (!habits[i].exerciseLog) habits[i].exerciseLog = {};
        }
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
      welcomeQuestion: "Prêt à rester sur l'essentiel ?",
      enterAria: "Entrer dans l'application",
      settingsAria: "Paramètres",
      settingsTitle: "Paramètres",
      tabSystem: "Système",
      tabCustom: "Personnalisation",
      tasksTitle: "Vos tâches",
      todayTitle: "Aujourd'hui",
      projectsTitle: "Vos projets",
      addTaskTitle: "Ajouter une tâche",
      newTaskName: "Nouvelle tâche",
      quickPlaceholder: "Relire le rapport demain 18h !",
      groupLate: "En retard",
      groupToday: "Aujourd'hui",
      groupSoon: "À venir",
      groupNone: "Sans date",
      groupDone: "Terminées",
      addAria: "Ajouter",
      addProjectAria: "Nouveau projet",
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
      focusAria: "Passer en mode focus",
      focusExitAria: "Quitter le mode focus",
      addHabitAria: "Ajouter une habitude",
      pickIconTitle: "Choisir une icône",
      habitDeleteAria: "Supprimer l'habitude",
      habitToggleAria: "Compléter l'habitude",
      habitNameLabel: "Nom de l'habitude",
      habitNamePlaceholder: "Ex. Boire de l'eau",
      presetsLabel: "Préconfigurées",
      sleepTitle: "Sommeil",
      sleepTonight: "Cette nuit",
      sleepGood: "Dans la cible",
      sleepShort: "Trop court",
      sleepLong: "Trop long",
      sleepConfig: "Configuration",
      sleepAgeLabel: "Âge",
      sleepTargetLabel: "Objectif (h)",
      sleepWakeLabel: "Réveil visé",
      sleepReco: "Recommandé :",
      sleepBedtime: "Coucher conseillé :",
      sleepAvgLabel: "Moyenne 7 j",
      sleepDebtLabel: "Dette",
      sleepBedNotif: "Il est l'heure de dormir",
      exerciseTitle: "Exercices rapides",
      exerciseSearchPlaceholder: "Rechercher un exercice…",
      exerciseCatalogEmpty: "Aucun résultat.",
      exerciseItemsEmpty: "Ajoutez un exercice ci-dessous.",
      exerciseTargetLabel: "Objectif",
      exerciseAvgLabel: "Réussite 7 j",
      exerciseRemoveAria: "Retirer l'exercice",
      exercisePushup: "Pompes",
      exerciseSquat: "Squats",
      exerciseCrunch: "Abdos",
      exerciseLunge: "Fentes",
      exercisePullup: "Tractions",
      exerciseDip: "Dips",
      pickDateAria: "Choisir une date",
      calendarTitle: "Échéance",
      calTimeLabel: "Heure",
      calClear: "Effacer",
      calConfirm: "Valider",
      wellTitle: "Bien-être",
      wellTabAria: "Espace bien-être",
      expandCalAria: "Déplier le calendrier",
      prevMonthAria: "Mois précédent",
      nextMonthAria: "Mois suivant",
      sunriseLabel: "Lever du soleil",
      sunsetLabel: "Coucher du soleil",
      prevDayAria: "Jour précédent",
      nextDayAria: "Jour suivant",
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
      importantAria: "Marquer comme important",
      importantLabel: "Important",
      weatherTitle: "Météo du jour",
      locationLabel: "Localisation",
      cityPlaceholder: "Rechercher une ville…",
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
      tasksTitle: "Your tasks",
      todayTitle: "Today",
      projectsTitle: "Your projects",
      addTaskTitle: "Add a task",
      newTaskName: "New task",
      quickPlaceholder: "Read the report tomorrow 6pm !",
      groupLate: "Overdue",
      groupToday: "Today",
      groupSoon: "Upcoming",
      groupNone: "No date",
      groupDone: "Done",
      addAria: "Add",
      addProjectAria: "New project",
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
      focusAria: "Enter focus mode",
      focusExitAria: "Exit focus mode",
      addHabitAria: "Add a habit",
      pickIconTitle: "Choose an icon",
      habitDeleteAria: "Remove habit",
      habitToggleAria: "Complete habit",
      habitNameLabel: "Habit name",
      habitNamePlaceholder: "e.g. Drink water",
      presetsLabel: "Preset",
      sleepTitle: "Sleep",
      sleepTonight: "Last night",
      sleepGood: "On target",
      sleepShort: "Too short",
      sleepLong: "Too long",
      sleepConfig: "Configuration",
      sleepAgeLabel: "Age",
      sleepTargetLabel: "Target (h)",
      sleepWakeLabel: "Wake-up time",
      sleepReco: "Recommended:",
      sleepBedtime: "Suggested bedtime:",
      sleepAvgLabel: "7-day avg",
      sleepDebtLabel: "Debt",
      sleepBedNotif: "Time to sleep",
      exerciseTitle: "Quick exercises",
      exerciseSearchPlaceholder: "Search an exercise…",
      exerciseCatalogEmpty: "No match.",
      exerciseItemsEmpty: "Add an exercise below.",
      exerciseTargetLabel: "Target",
      exerciseAvgLabel: "7-day rate",
      exerciseRemoveAria: "Remove exercise",
      exercisePushup: "Push-ups",
      exerciseSquat: "Squats",
      exerciseCrunch: "Crunches",
      exerciseLunge: "Lunges",
      exercisePullup: "Pull-ups",
      exerciseDip: "Dips",
      pickDateAria: "Pick a date",
      calendarTitle: "Deadline",
      calTimeLabel: "Time",
      calClear: "Clear",
      calConfirm: "Confirm",
      wellTitle: "Well-being",
      wellTabAria: "Well-being space",
      expandCalAria: "Unfold the calendar",
      prevMonthAria: "Previous month",
      nextMonthAria: "Next month",
      sunriseLabel: "Sunrise",
      sunsetLabel: "Sunset",
      prevDayAria: "Previous day",
      nextDayAria: "Next day",
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
      importantAria: "Mark as important",
      importantLabel: "Important",
      weatherTitle: "Today's weather",
      locationLabel: "Location",
      cityPlaceholder: "Search a city…",
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
  /* welcome phrase "Bonjour <name> !" — the app itself no longer greets */
  function renderGreeting() {
    const name = state.settings.name;
    document.getElementById("welcomeGreeting").textContent =
      translate("greetingPrefix") + (name ? " " + name : "") + translate("greetingSuffix");
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
    if (listName === "tasks") { renderTasks(); return; }
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

  /* TASK GROUPS — the list splits itself by due date. Order inside a group stays
     manual (drag), so nothing the user arranged by hand is lost. */
  const TASK_GROUPS = ["late", "today", "soon", "none", "done"];
  const TASK_GROUP_LABELS = {
    late: "groupLate", today: "groupToday", soon: "groupSoon",
    none: "groupNone", done: "groupDone"
  };
  const collapsedGroups = { done: true };   // finished tasks start folded away

  function taskGroup(task) {
    if (task.done) return "done";
    if (!task.dueDate) return "none";
    if (dueSortKey(task) < Date.now()) return "late";
    if (task.dueDate === todayKey()) return "today";
    return "soon";
  }

  function renderTasks() {
    const box = document.getElementById("tasksList");
    box.innerHTML = "";
    renderTasksRing();

    const items = sortedByDue(state.tasks);
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = translate("emptyList");
      box.appendChild(empty);
      return;
    }

    const buckets = {};
    for (let i = 0; i < items.length; i++) {
      const key = taskGroup(items[i]);
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(items[i]);
    }

    // a single bucket needs no header: the panel title already says what it is
    let filled = 0;
    for (let i = 0; i < TASK_GROUPS.length; i++) {
      if (buckets[TASK_GROUPS[i]]) filled++;
    }
    for (let i = 0; i < TASK_GROUPS.length; i++) {
      const key = TASK_GROUPS[i];
      if (buckets[key]) box.appendChild(createTaskGroup(key, buckets[key], filled > 1));
    }
  }

  function createTaskGroup(key, tasks, withHead) {
    const group = document.createElement("div");
    group.className = "tgroup tgroup--" + key;
    const collapsed = withHead && !!collapsedGroups[key];
    if (collapsed) group.classList.add("is-collapsed");

    if (withHead) {
      const head = document.createElement("button");
      head.type = "button";
      head.className = "tgroup__head";
      head.setAttribute("aria-expanded", collapsed ? "false" : "true");

      const label = document.createElement("span");
      label.className = "tgroup__label";
      label.textContent = translate(TASK_GROUP_LABELS[key]);
      const count = document.createElement("span");
      count.className = "tgroup__count";
      count.textContent = tasks.length;
      const chevron = document.createElement("span");
      chevron.className = "tgroup__chev";
      chevron.textContent = "⌄";

      head.append(label, count, chevron);
      head.addEventListener("click", function () {
        collapsedGroups[key] = !collapsedGroups[key];
        renderTasks();
      });
      group.appendChild(head);
    }

    const list = document.createElement("ul");
    list.className = "list list--cards";
    for (let i = 0; i < tasks.length; i++) {
      list.appendChild(createItemRow("tasks", tasks[i]));
    }
    group.appendChild(list);
    return group;
  }

  const RING_MARKUP =
    '<svg class="ring" viewBox="0 0 24 24" aria-hidden="true">'
    + '<circle class="ring__track" cx="12" cy="12" r="9"/>'
    + '<circle class="ring__fill" cx="12" cy="12" r="9" stroke-dasharray="56.5"/></svg>'
    + '<span class="ring__label"></span>';

  /* progress ring + "2/5" next to the tasks title; blank when the list is empty.
     Reused rather than rebuilt so the arc animates when a task is checked. */
  function renderTasksRing() {
    const box = document.getElementById("tasksCount");
    const tasks = state.tasks;
    if (tasks.length === 0) { box.innerHTML = ""; return; }
    let done = 0;
    for (let i = 0; i < tasks.length; i++) {
      if (tasks[i].done) done++;
    }
    if (!box.firstChild) box.innerHTML = RING_MARKUP;
    box.querySelector(".ring__fill").setAttribute("stroke-dashoffset",
      (56.5 * (1 - done / tasks.length)).toFixed(1));
    box.querySelector(".ring__label").textContent = done + "/" + tasks.length;
  }

  /* Build one row: checkbox, label, delete button. Undated & unpinned rows get a
     drag handle so they can be reordered (the list shows items in manual order). */
  function createItemRow(listName, item) {
    const row = document.createElement("li");
    const kindClass = listName === "projects" ? " item--project" : " item--task";
    row.className = (item.done ? "item item--open done" : "item item--open") + kindClass;
    row.dataset.id = item.id;
    row.addEventListener("click", function () { openDetail(listName, item.id); });

    // pinned rows can't be dragged, but keep an empty grip so the columns line up
    const grip = document.createElement("span");
    grip.className = "item__grip";
    grip.setAttribute("aria-hidden", "true");
    row.appendChild(grip);
    if (!item.pinned) {
      row.dataset.reorder = "1";
      grip.innerHTML = ICON_GRIP;
      grip.addEventListener("click", function (e) { e.stopPropagation(); });
      grip.addEventListener("pointerdown", function (e) { startRowDrag(e, row, listName); });
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

  /* pointer-based drag reorder (works on touch). Listens on document so the drag
     survives the row moving in the DOM, then persists the new order to state. */
  let rowDrag = null;
  function startRowDrag(event, row, listName) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    rowDrag = { row: row, listName: listName, listEl: row.parentNode };
    row.classList.add("is-dragging");
    document.addEventListener("pointermove", onRowDragMove, { passive: false });
    document.addEventListener("pointerup", endRowDrag);
    document.addEventListener("pointercancel", endRowDrag);
  }
  function onRowDragMove(event) {
    if (!rowDrag) return;
    event.preventDefault();   // don't scroll the page while dragging
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
  function endRowDrag() {
    if (!rowDrag) return;
    const drag = rowDrag;
    rowDrag = null;
    drag.row.classList.remove("is-dragging");
    document.removeEventListener("pointermove", onRowDragMove);
    document.removeEventListener("pointerup", endRowDrag);
    document.removeEventListener("pointercancel", endRowDrag);

    const ordered = [];
    const rows = drag.listEl.querySelectorAll('.item[data-reorder]');
    for (let i = 0; i < rows.length; i++) ordered.push(rows[i].dataset.id);
    persistOrder(drag.listName, ordered);
    saveState();
    renderList(drag.listName);
  }
  /* rebuild state[listName] so the reorderable (unpinned) items follow `ordered`,
     while pinned items keep their slots */
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

  /* QUICK ADD — the rectangle unfolds into a single input. "Relire le rapport
     demain 18h !" becomes a task dated tomorrow at 18:00 and pinned; whatever
     isn't recognised stays in the title, so no text is ever swallowed. */
  const AMPM_RE = /\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i;
  const HOUR_RE = /\b(\d{1,2})\s*h\s*([0-5]\d)?\b/i;
  const COLON_RE = /\b(\d{1,2}):([0-5]\d)\b/;
  const NUMERIC_DATE_RE = /\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/;
  const BANG_RE = /(?:^|\s)(!{1,3})(?=\s|$)/;
  const WEEKDAY_RE = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  const WEEKDAY_INDEX = {
    lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0,
    monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0
  };
  // après-demain first, otherwise "demain" would match inside it
  const RELATIVE_DAYS = [
    { re: /\b(apr[eè]s[- ]demain)\b/i, days: 2 },
    { re: /\b(aujourd['’]?hui|today)\b/i, days: 0 },
    { re: /\b(demain|tomorrow)\b/i, days: 1 }
  ];

  function pad2(n) { return String(n).padStart(2, "0"); }

  /* the next time that weekday comes round, never today */
  function nextWeekday(weekday) {
    const day = new Date();
    let delta = (weekday - day.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    day.setDate(day.getDate() + delta);
    return dateKey(day.getFullYear(), day.getMonth(), day.getDate());
  }

  /* Read date / time / pin out of a line. `ranges` are the character spans that
     were consumed, used both to strip them from the title and to highlight them. */
  function parseQuickAdd(text) {
    const parsed = { date: null, time: null, pinned: false, ranges: [] };

    const ampm = AMPM_RE.exec(text);
    const clock = ampm || COLON_RE.exec(text) || HOUR_RE.exec(text);
    if (clock) {
      let hour = parseInt(clock[1], 10);
      const minute = clock[2] ? parseInt(clock[2], 10) : 0;
      if (ampm) {
        const isPm = /pm/i.test(clock[3]);
        if (hour === 12) hour = isPm ? 12 : 0;
        else if (isPm) hour += 12;
      }
      if (hour <= 23) {
        parsed.time = pad2(hour) + ":" + pad2(minute);
        parsed.ranges.push([clock.index, clock.index + clock[0].length]);
      }
    }

    const numeric = NUMERIC_DATE_RE.exec(text);
    if (numeric) {
      // day/month in French, month/day in English
      const english = state.settings.language === "en";
      const day = parseInt(numeric[english ? 2 : 1], 10);
      const month = parseInt(numeric[english ? 1 : 2], 10);
      let year = numeric[3] ? parseInt(numeric[3], 10) : new Date().getFullYear();
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        parsed.date = dateKey(year, month - 1, day);
        parsed.ranges.push([numeric.index, numeric.index + numeric[0].length]);
      }
    }
    if (!parsed.date) {
      for (let i = 0; i < RELATIVE_DAYS.length; i++) {
        const hit = RELATIVE_DAYS[i].re.exec(text);
        if (!hit) continue;
        parsed.date = shiftDateKey(todayKey(), RELATIVE_DAYS[i].days);
        parsed.ranges.push([hit.index, hit.index + hit[0].length]);
        break;
      }
    }
    if (!parsed.date) {
      const weekday = WEEKDAY_RE.exec(text);
      if (weekday) {
        parsed.date = nextWeekday(WEEKDAY_INDEX[weekday[1].toLowerCase()]);
        parsed.ranges.push([weekday.index, weekday.index + weekday[0].length]);
      }
    }

    const bang = BANG_RE.exec(text);
    if (bang) {
      parsed.pinned = true;
      const start = bang.index + bang[0].length - bang[1].length;   // skip the leading space
      parsed.ranges.push([start, start + bang[1].length]);
    }

    // a bare time needs a day to live on, or it would be silently dropped:
    // today if it is still ahead, tomorrow otherwise. The hint line shows which.
    if (parsed.time && !parsed.date) {
      const at = new Date(todayKey() + "T" + parsed.time).getTime();
      parsed.date = at >= Date.now() ? todayKey() : shiftDateKey(todayKey(), 1);
    }

    parsed.ranges.sort(function (a, b) { return a[0] - b[0]; });
    return parsed;
  }

  /* what's left once the recognised spans are taken out */
  function quickTitle(text, ranges) {
    let title = "";
    let at = 0;
    for (let i = 0; i < ranges.length; i++) {
      if (ranges[i][0] < at) continue;   // overlapping matches: keep the first
      title += text.slice(at, ranges[i][0]);
      at = ranges[i][1];
    }
    title += text.slice(at);
    return title.replace(/\s+/g, " ").trim();
  }

  const quickForm = document.getElementById("quickAdd");
  const quickInput = document.getElementById("quickInput");
  const quickMirror = document.getElementById("quickMirror");
  const quickHint = document.getElementById("quickHint");
  const addTaskBtn = document.getElementById("addTaskBtn");

  /* the mirror sits under the transparent input and only paints the highlights,
     so the recognised words light up exactly beneath what's typed */
  function renderQuickFeedback() {
    const text = quickInput.value;
    const parsed = parseQuickAdd(text);
    quickMirror.innerHTML = "";
    let at = 0;
    for (let i = 0; i < parsed.ranges.length; i++) {
      if (parsed.ranges[i][0] < at) continue;
      quickMirror.appendChild(document.createTextNode(text.slice(at, parsed.ranges[i][0])));
      const hit = document.createElement("span");
      hit.className = "quick__hit";
      hit.textContent = text.slice(parsed.ranges[i][0], parsed.ranges[i][1]);
      quickMirror.appendChild(hit);
      at = parsed.ranges[i][1];
    }
    quickMirror.appendChild(document.createTextNode(text.slice(at)));
    quickMirror.scrollLeft = quickInput.scrollLeft;

    const bits = [];
    if (parsed.date) bits.push(dueLabel({ dueDate: parsed.date, dueTime: parsed.time }));
    if (parsed.pinned) bits.push(translate("pinLabel"));
    quickHint.hidden = bits.length === 0;
    if (bits.length) {
      quickHint.textContent = (quickTitle(text, parsed.ranges) || translate("newTaskName"))
        + " · " + bits.join(" · ");
    }
    return parsed;
  }

  function openQuickAdd() {
    addTaskBtn.hidden = true;
    quickForm.hidden = false;
    quickInput.focus();
    renderQuickFeedback();
  }
  function closeQuickAdd() {
    quickInput.value = "";
    quickForm.hidden = true;
    addTaskBtn.hidden = false;
    renderQuickFeedback();
  }

  addTaskBtn.addEventListener("click", openQuickAdd);
  quickInput.addEventListener("input", renderQuickFeedback);
  quickInput.addEventListener("scroll", function () {
    quickMirror.scrollLeft = quickInput.scrollLeft;
  });
  quickInput.addEventListener("blur", function () {
    if (!quickInput.value.trim()) closeQuickAdd();   // keep a half-typed line alive
  });
  quickInput.addEventListener("keydown", function (event) {
    if (event.key === "Escape") { event.stopPropagation(); closeQuickAdd(); }
  });

  quickForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const text = quickInput.value;
    const parsed = parseQuickAdd(text);
    const title = quickTitle(text, parsed.ranges);
    if (!title && !parsed.date) return;
    addItem("tasks", title || translate("newTaskName"),
      parsed.date ? { date: parsed.date, time: parsed.time } : null);
    if (parsed.pinned) {
      state.tasks[state.tasks.length - 1].pinned = true;
      saveState();
      renderList("tasks");
    }
    if (parsed.time) ensureNotifyPermission();
    quickInput.value = "";
    renderQuickFeedback();
    quickInput.focus();   // ready for the next line
  });

  /* a project works the same way: it opens straight into its detail view */
  document.getElementById("addProjectBtn").addEventListener("click", function () {
    const project = { id: Date.now().toString(), text: translate("addProjectAria"), icon: "folder" };
    state.projects.push(project);
    saveState();
    renderList("projects");
    openDetail("projects", project.id);
    detailName.focus();
    detailName.select();
  });

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
    rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.9.7-2.2-.1-3a2.1 2.1 0 0 0-2.9 0z"/><path d="M12 15l-3-3a11 11 0 0 1 5-8c1.9-1.9 4-2 5-2s1.1 3.1-.8 5a11 11 0 0 1-8 5z"/><path d="M9 12H4s.5-2.8 2-4c1.5-.4 3 0 3 0"/><path d="M12 15v5s2.8-.5 4-2c.4-1.5 0-3 0-3"/>',
    pushup: '<polyline points="6 8 12 13 18 8"/><polyline points="6 15 12 20 18 15"/>',
    squat: '<line x1="4" y1="4" x2="20" y2="4"/><path d="M8 4v6l4 4 4-4V4"/><line x1="4" y1="20" x2="20" y2="20"/>',
    crunch: '<rect x="6" y="3" width="5" height="5" rx="1"/><rect x="13" y="3" width="5" height="5" rx="1"/><rect x="6" y="9.5" width="5" height="5" rx="1"/><rect x="13" y="9.5" width="5" height="5" rx="1"/><rect x="6" y="16" width="5" height="5" rx="1"/><rect x="13" y="16" width="5" height="5" rx="1"/>',
    lunge: '<path d="M12 3v6"/><path d="M8 9l4 6 4-6"/><path d="M8 21l4-6 4 6"/>',
    pullup: '<line x1="3" y1="5" x2="21" y2="5"/><line x1="8" y1="5" x2="8" y2="13"/><line x1="16" y1="5" x2="16" y2="13"/><polyline points="6 10 8 13 10 10"/><polyline points="14 10 16 13 18 10"/>',
    dip: '<line x1="5" y1="4" x2="5" y2="20"/><line x1="19" y1="4" x2="19" y2="20"/><polyline points="9 9 12 13 15 9"/>'
  };

  const EXERCISE_CATALOG = ["pushup", "squat", "crunch", "lunge", "pullup", "dip"];
  const EXERCISE_NAME_KEYS = {
    pushup: "exercisePushup", squat: "exerciseSquat", crunch: "exerciseCrunch",
    lunge: "exerciseLunge", pullup: "exercisePullup", dip: "exerciseDip"
  };
  function exerciseName(key) { return translate(EXERCISE_NAME_KEYS[key] || key); }

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

  /* A filled habit: icon, rising water. Sleep/exercise are special (their own tile). */
  function createHabitTile(habit, today) {
    if (habit.type === "sleep") return createSleepTile(habit, today);
    if (habit.type === "exercise") return createExerciseTile(habit, today);

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

  /* Sleep tile: water fills to last night's hours, hours label, opens the sleep view. */
  function createSleepTile(habit, today) {
    const cfg = habit.config || {};
    const hours = (habit.sleepLog || {})[today];
    const inRange = hours != null && hours >= (cfg.min || 0) && (cfg.max == null || hours <= cfg.max);
    const tile = document.createElement("div");
    tile.className = inRange ? "habit habit--sleep done" : "habit habit--sleep";
    tile.setAttribute("aria-label", translate("sleepTitle"));

    const water = document.createElement("div");
    water.className = "habit__water";
    if (hours != null) {
      const ref = cfg.max || cfg.target || 8;
      water.style.height = Math.max(6, Math.min(100, (hours / ref) * 100)) + "%";
    }

    const icon = document.createElement("span");
    icon.className = "habit__icon";
    icon.innerHTML = habitSvg(habit.icon || "sleep");

    tile.append(water, icon);
    if (hours != null) {
      const hrs = document.createElement("span");
      hrs.className = "habit__hours";
      hrs.textContent = formatHours(hours);
      tile.appendChild(hrs);
    }
    tile.addEventListener("click", function () { openSleepView(habit.id); });
    return tile;
  }

  /* reps logged today for one exercise; 0 if none */
  function exerciseCount(habit, key, date) {
    const day = (habit.exerciseLog || {})[date];
    return (day && day[key]) || 0;
  }
  /* every configured exercise reached its target that day */
  function exerciseAllDone(habit, date) {
    const items = (habit.config && habit.config.items) || [];
    if (!items.length) return false;
    for (let i = 0; i < items.length; i++) {
      if (exerciseCount(habit, items[i].key, date) < items[i].target) return false;
    }
    return true;
  }
  /* average completion across items, each capped at 100% */
  function exerciseOverallFraction(habit, date) {
    const items = (habit.config && habit.config.items) || [];
    if (!items.length) return 0;
    let sum = 0;
    for (let i = 0; i < items.length; i++) {
      sum += Math.min(1, exerciseCount(habit, items[i].key, date) / items[i].target);
    }
    return sum / items.length;
  }

  /* Exercise tile: water fills to today's overall completion, "n/n done" label. */
  function createExerciseTile(habit, today) {
    const items = (habit.config && habit.config.items) || [];
    const done = exerciseAllDone(habit, today);
    const tile = document.createElement("div");
    tile.className = done ? "habit habit--exercise done" : "habit habit--exercise";
    tile.setAttribute("aria-label", translate("exerciseTitle"));

    const water = document.createElement("div");
    water.className = "habit__water";
    if (items.length) water.style.height = Math.max(6, exerciseOverallFraction(habit, today) * 100) + "%";

    const icon = document.createElement("span");
    icon.className = "habit__icon";
    icon.innerHTML = habitSvg(habit.icon || "sport");

    tile.append(water, icon);
    if (items.length) {
      let metCount = 0;
      for (let i = 0; i < items.length; i++) {
        if (exerciseCount(habit, items[i].key, today) >= items[i].target) metCount++;
      }
      const label = document.createElement("span");
      label.className = "habit__hours";
      label.textContent = metCount + "/" + items.length;
      tile.appendChild(label);
    }
    tile.addEventListener("click", function () { openExerciseView(habit.id); });
    return tile;
  }

  /* "7.5" -> "7h30", "8" -> "8h" */
  function formatHours(h) {
    const whole = Math.floor(h);
    const min = Math.round((h - whole) * 60);
    return min ? whole + "h" + String(min).padStart(2, "0") : whole + "h";
  }

  /* scientifically-accepted nightly sleep range by age (National Sleep Foundation) */
  function recommendedSleep(age) {
    if (age == null || age === "" || isNaN(age)) return null;
    const a = Number(age);
    if (a < 1) return { min: 12, max: 16, label: "Nourrisson" };
    if (a <= 2) return { min: 11, max: 14, label: "Tout-petit" };
    if (a <= 5) return { min: 10, max: 13, label: "Préscolaire" };
    if (a <= 13) return { min: 9, max: 12, label: "Enfant" };
    if (a <= 17) return { min: 8, max: 10, label: "Adolescent" };
    if (a <= 64) return { min: 7, max: 9, label: "Adulte" };
    return { min: 7, max: 8, label: "Senior" };
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
      renderHabitsView();
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
    renderHabitsView();   // reflect an icon change on the well-being page
  }

  /* open to create a new habit (name field shown) */
  function openIconPicker() {
    iconPickerMode = { kind: "habit-new" };
    document.getElementById("habitNameField").hidden = false;
    document.getElementById("habitNameInput").value = "";
    document.getElementById("iconPresets").hidden = false;   // presets only when creating
    iconPicker.hidden = false;
  }

  /* open to change an existing habit's icon (name field hidden) */
  function openIconPickerForEdit(habitId) {
    iconPickerMode = { kind: "habit-edit", id: habitId };
    document.getElementById("habitNameField").hidden = true;
    document.getElementById("iconPresets").hidden = true;
    iconPicker.hidden = false;
  }

  /* open to change the icon of the item in the detail view (event or project) */
  function openIconPickerForDetail() {
    iconPickerMode = { kind: "detail" };
    document.getElementById("habitNameField").hidden = true;
    document.getElementById("iconPresets").hidden = true;
    iconPicker.hidden = false;
  }

  /* close the picker on the × or the backdrop */
  const iconCloseButtons = iconPicker.querySelectorAll("[data-close]");
  for (let i = 0; i < iconCloseButtons.length; i++) {
    iconCloseButtons[i].addEventListener("click", function () {
      iconPicker.hidden = true;
    });
  }

  /* preconfigured "Sommeil" habit: one per slots; reopen it if it already exists */
  document.getElementById("presetSleep").addEventListener("click", function () {
    iconPicker.hidden = true;
    for (let i = 0; i < state.habits.length; i++) {
      if (state.habits[i].type === "sleep") { openSleepView(state.habits[i].id); return; }
    }
    state.habits.push({
      id: Date.now().toString(),
      type: "sleep",
      name: translate("sleepTitle"),
      icon: "sleep",
      config: { age: null, min: 7, max: 9, target: 8, wake: "07:00" },
      sleepLog: {}
    });
    saveState();
    renderHabits();
    openSleepView(state.habits[state.habits.length - 1].id);
  });

  /* preconfigured "Exercices rapides" habit: one per slots; reopen it if it already exists */
  document.getElementById("presetExercise").addEventListener("click", function () {
    iconPicker.hidden = true;
    for (let i = 0; i < state.habits.length; i++) {
      if (state.habits[i].type === "exercise") { openExerciseView(state.habits[i].id); return; }
    }
    state.habits.push({
      id: Date.now().toString(),
      type: "exercise",
      name: translate("exerciseTitle"),
      icon: "sport",
      config: { items: [] },
      exerciseLog: {}
    });
    saveState();
    renderHabits();
    openExerciseView(state.habits[state.habits.length - 1].id);
  });

  /* SLEEP VIEW — log last night's hours on a slider, configure targets, get an
     age-based recommendation. */
  const sleepView = document.getElementById("sleepView");
  let sleepHabitId = null;
  const sleepSlider = document.getElementById("sleepSlider");
  const sleepAge = document.getElementById("sleepAge");
  const sleepTarget = document.getElementById("sleepTarget");
  const sleepWake = document.getElementById("sleepWake");

  function currentSleep() {
    const habit = findItem("habits", sleepHabitId);
    return (habit && habit.type === "sleep") ? habit : null;
  }

  const sleepZone = document.getElementById("sleepZone");
  const sleepBubble = document.getElementById("sleepBubble");

  // position within the track's inner region (thumb radius 11px inset each side)
  function insetLeft(fraction) { return "calc(11px + (100% - 22px) * " + fraction + ")"; }
  function sliderFrac(v) {
    const smin = parseFloat(sleepSlider.min), smax = parseFloat(sleepSlider.max);
    return (v - smin) / (smax - smin);
  }

  function openSleepView(id) {
    sleepHabitId = id;
    const habit = currentSleep();
    if (!habit) return;
    if (!habit.config) habit.config = { age: null, min: 7, max: 9, target: 8, wake: "07:00" };
    if (!habit.sleepLog) habit.sleepLog = {};
    const cfg = habit.config;
    sleepAge.value = cfg.age != null ? cfg.age : "";
    sleepTarget.value = cfg.target != null ? cfg.target : "";
    sleepWake.value = cfg.wake || "";
    const logged = habit.sleepLog[todayKey()];
    sleepSlider.value = logged != null ? logged : (cfg.target || cfg.min || 8);
    buildSleepTicks();
    renderSleepView();
    sleepView.hidden = false;
  }

  /* half-hour ticks under the track (taller on the hour) */
  function buildSleepTicks() {
    const ticks = document.getElementById("sleepTicks");
    ticks.innerHTML = "";
    const smin = parseFloat(sleepSlider.min), smax = parseFloat(sleepSlider.max);
    for (let v = smin; v <= smax + 0.001; v += 0.5) {
      const tick = document.createElement("span");
      tick.className = Math.abs(v - Math.round(v)) < 0.001 ? "sleep__tick is-hour" : "sleep__tick";
      tick.style.left = insetLeft((v - smin) / (smax - smin));
      ticks.appendChild(tick);
    }
  }

  function updateSleepBubble() {
    const val = parseFloat(sleepSlider.value);
    sleepBubble.textContent = formatHours(val);
    sleepBubble.style.left = insetLeft(sliderFrac(val));
  }

  function renderSleepView() {
    const habit = currentSleep();
    if (!habit) return;
    const cfg = habit.config;
    const val = parseFloat(sleepSlider.value);

    // good zone = the recommended [min, max] range
    if (cfg.min != null && cfg.max != null && cfg.max >= cfg.min) {
      sleepZone.hidden = false;
      sleepZone.style.left = insetLeft(sliderFrac(cfg.min));
      sleepZone.style.width = "calc((100% - 22px) * " + (sliderFrac(cfg.max) - sliderFrac(cfg.min)) + ")";
    } else {
      sleepZone.hidden = true;
    }
    updateSleepBubble();

    document.getElementById("sleepVal").textContent = formatHours(val);
    const status = document.getElementById("sleepStatus");
    if (cfg.min != null && val < cfg.min) { status.textContent = translate("sleepShort"); status.className = "sleep__status is-short"; }
    else if (cfg.max != null && val > cfg.max) { status.textContent = translate("sleepLong"); status.className = "sleep__status is-long"; }
    else { status.textContent = translate("sleepGood"); status.className = "sleep__status is-good"; }

    // recommended zone (min–max, set from age)
    const recoEl = document.getElementById("sleepReco");
    if (cfg.min != null && cfg.max != null) {
      recoEl.hidden = false;
      document.getElementById("sleepRecoTxt").textContent = translate("sleepReco") + " " + cfg.min + "–" + cfg.max + " h";
    } else {
      recoEl.hidden = true;
    }

    const bed = bedtime(cfg.wake, cfg.target);   // bedtime uses the objectif
    const bedEl = document.getElementById("sleepBedtime");
    bedEl.hidden = !bed;
    if (bed) bedEl.textContent = translate("sleepBedtime") + " " + bed;

    renderSleepWeek(habit);
  }

  /* bedtime = wake-up time minus the target hours (wraps past midnight) */
  function bedtime(wake, hours) {
    if (!wake || hours == null) return null;
    const parts = wake.split(":");
    let total = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) - Math.round(hours * 60);
    total = ((total % 1440) + 1440) % 1440;
    return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
  }

  /* last 7 days as {days, avg, debt}; debt is the deficit vs the recommended minimum */
  function sleepWeekData(habit) {
    const cfg = habit.config || {};
    const log = habit.sleepLog || {};
    const now = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
      days.push({ hours: log[key], date: new Date(d) });
    }
    let sum = 0, cnt = 0, debt = 0;
    for (let i = 0; i < days.length; i++) {
      const h = days[i].hours;
      if (h == null) continue;
      sum += h; cnt++;
      if (cfg.min != null && h < cfg.min) debt += cfg.min - h;
    }
    return { days: days, avg: cnt ? sum / cnt : null, debt: debt };
  }

  function renderSleepWeek(habit) {
    const wk = sleepWeekData(habit);
    document.getElementById("sleepAvg").textContent = wk.avg != null ? formatHours(wk.avg) : "–";
    document.getElementById("sleepDebt").textContent = wk.debt > 0.01 ? "-" + formatHours(wk.debt) : "0h";
    document.getElementById("sleepChart").innerHTML = sleepWeekSvg(wk.days, habit.config || {});
  }

  /* 7-day bar chart with the recommended [min,max] band shaded behind */
  function sleepWeekSvg(days, cfg) {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const W = 280, H = 122, padX = 6, padT = 10, padB = 20;
    const plotW = W - padX * 2, plotH = H - padT - padB, y0 = padT + plotH;
    let hi = cfg.max || 9;
    for (let i = 0; i < days.length; i++) if (days[i].hours != null && days[i].hours > hi) hi = days[i].hours;
    hi = Math.ceil(hi + 0.5);
    const yAt = function (h) { return y0 - (h / hi) * plotH; };
    const step = plotW / days.length;
    const bw = Math.min(24, step * 0.5);
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="swk">';
    if (cfg.min != null && cfg.max != null) {
      const yb = yAt(cfg.max).toFixed(1);
      const hb = Math.max(0, yAt(cfg.min) - yAt(cfg.max)).toFixed(1);
      svg += '<rect class="swk-zone" x="' + padX + '" y="' + yb + '" width="' + plotW + '" height="' + hb + '"/>';
    }
    for (let i = 0; i < days.length; i++) {
      const cx = padX + step * i + step / 2;
      svg += '<text class="swk-wd" x="' + cx.toFixed(1) + '" y="' + (H - 6) + '">'
        + days[i].date.toLocaleDateString(locale, { weekday: "narrow" }) + "</text>";
      const h = days[i].hours;
      if (h == null) continue;
      const inRange = cfg.min != null && h >= cfg.min && (cfg.max == null || h <= cfg.max);
      svg += '<rect class="swk-bar' + (inRange ? "" : " is-out") + '" x="' + (cx - bw / 2).toFixed(1)
        + '" y="' + yAt(h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (y0 - yAt(h)).toFixed(1) + '" rx="3"/>';
    }
    return svg + "</svg>";
  }

  sleepSlider.addEventListener("input", function () { updateSleepBubble(); renderSleepView(); });
  sleepSlider.addEventListener("change", function () {
    const habit = currentSleep();
    if (!habit) return;
    habit.sleepLog[todayKey()] = parseFloat(sleepSlider.value);
    saveState();
    renderSleepView();   // refresh week average / debt / chart
    renderHabits();
  });
  function bindSleepConfig(input, key, asNumber) {
    input.addEventListener("change", function () {
      const habit = currentSleep();
      if (!habit) return;
      const raw = input.value;
      habit.config[key] = raw === "" ? null : (asNumber ? parseFloat(raw) : raw);
      saveState();
      renderSleepView();
      renderHabits();
    });
  }
  bindSleepConfig(sleepTarget, "target", true);   // objectif (bedtime only)
  bindSleepConfig(sleepWake, "wake", false);
  sleepWake.addEventListener("change", ensureNotifyPermission);   // enable bedtime reminders

  // age fixes the recommended [min, max] zone
  sleepAge.addEventListener("change", function () {
    const habit = currentSleep();
    if (!habit) return;
    const raw = sleepAge.value;
    habit.config.age = raw === "" ? null : parseFloat(raw);
    const reco = recommendedSleep(habit.config.age);
    if (reco) { habit.config.min = reco.min; habit.config.max = reco.max; }
    saveState();
    renderSleepView();
    renderHabits();
  });

  const sleepCloseButtons = sleepView.querySelectorAll("[data-close]");
  for (let i = 0; i < sleepCloseButtons.length; i++) {
    sleepCloseButtons[i].addEventListener("click", function () { sleepView.hidden = true; });
  }

  /* EXERCISE VIEW — pick exercises from a catalog (search to add), log reps with
     -/+1/+10 controls, each with its own daily target. */
  const exerciseView = document.getElementById("exerciseView");
  let exerciseHabitId = null;
  const exerciseSearch = document.getElementById("exerciseSearch");

  function currentExercise() {
    const habit = findItem("habits", exerciseHabitId);
    return (habit && habit.type === "exercise") ? habit : null;
  }

  function openExerciseView(id) {
    exerciseHabitId = id;
    const habit = currentExercise();
    if (!habit) return;
    if (!habit.config) habit.config = { items: [] };
    if (!habit.config.items) habit.config.items = [];
    if (!habit.exerciseLog) habit.exerciseLog = {};
    exerciseSearch.value = "";
    renderExerciseView();
    exerciseView.hidden = false;
  }

  function renderExerciseView() {
    const habit = currentExercise();
    if (!habit) return;
    renderExerciseItems(habit);
    renderExerciseCatalog(habit);
    renderExerciseWeek(habit);
  }

  /* the selected exercises: icon, name, editable target, today's progress, -/+1/+10 */
  function renderExerciseItems(habit) {
    const box = document.getElementById("exerciseItems");
    box.innerHTML = "";
    const items = habit.config.items;
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "ex-empty";
      empty.textContent = translate("exerciseItemsEmpty");
      box.appendChild(empty);
      return;
    }
    for (let i = 0; i < items.length; i++) box.appendChild(createExerciseItemRow(habit, items[i]));
  }

  function createExerciseItemRow(habit, item) {
    const today = todayKey();
    const count = exerciseCount(habit, item.key, today);
    const pct = Math.min(100, Math.round((count / item.target) * 100));
    const row = document.createElement("div");
    row.className = pct >= 100 ? "ex-item is-done" : "ex-item";

    const head = document.createElement("div");
    head.className = "ex-item__head";
    const ico = document.createElement("span");
    ico.className = "ex-item__ico";
    ico.innerHTML = habitSvg(item.key);
    const name = document.createElement("span");
    name.className = "ex-item__name";
    name.textContent = exerciseName(item.key);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ex-item__remove";
    remove.setAttribute("aria-label", translate("exerciseRemoveAria"));
    remove.textContent = "×";
    remove.addEventListener("click", function () { removeExercise(item.key); });
    head.append(ico, name, remove);

    const targetRow = document.createElement("div");
    targetRow.className = "ex-item__target";
    const targetLabel = document.createElement("span");
    targetLabel.textContent = translate("exerciseTargetLabel");
    const targetInput = document.createElement("input");
    targetInput.type = "number";
    targetInput.min = "1";
    targetInput.className = "ex-item__target-input";
    targetInput.value = item.target;
    targetInput.addEventListener("change", function () {
      const v = parseInt(targetInput.value, 10);
      item.target = v > 0 ? v : 1;
      saveState();
      renderExerciseView();
      renderHabits();
    });
    targetRow.append(targetLabel, targetInput);

    const progress = document.createElement("div");
    progress.className = "ex-item__progress";
    const bar = document.createElement("div");
    bar.className = "ex-item__bar";
    const fill = document.createElement("div");
    fill.className = "ex-item__fill";
    fill.style.width = pct + "%";
    bar.appendChild(fill);
    const countLabel = document.createElement("span");
    countLabel.className = "ex-item__count";
    countLabel.textContent = count + "/" + item.target;
    progress.append(bar, countLabel);

    const controls = document.createElement("div");
    controls.className = "ex-item__controls";
    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "ex-item__btn";
    minus.textContent = "−";
    minus.addEventListener("click", function () { adjustExerciseCount(habit, item.key, -1); });
    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "ex-item__btn ex-item__btn--main";
    plus.textContent = "+1";
    plus.addEventListener("click", function () { adjustExerciseCount(habit, item.key, 1); });
    const plusTen = document.createElement("button");
    plusTen.type = "button";
    plusTen.className = "ex-item__btn";
    plusTen.textContent = "+10";
    plusTen.addEventListener("click", function () { adjustExerciseCount(habit, item.key, 10); });
    controls.append(minus, plus, plusTen);

    row.append(head, targetRow, progress, controls);
    return row;
  }

  function adjustExerciseCount(habit, key, delta) {
    const today = todayKey();
    if (!habit.exerciseLog[today]) habit.exerciseLog[today] = {};
    const next = Math.max(0, (habit.exerciseLog[today][key] || 0) + delta);
    habit.exerciseLog[today][key] = next;
    saveState();
    renderExerciseItems(habit);
    renderExerciseWeek(habit);
    renderHabits();
  }

  function addExercise(key) {
    const habit = currentExercise();
    if (!habit) return;
    habit.config.items.push({ key: key, target: 20 });
    saveState();
    renderExerciseView();
    renderHabits();
  }

  function removeExercise(key) {
    const habit = currentExercise();
    if (!habit) return;
    const items = habit.config.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].key === key) { items.splice(i, 1); break; }
    }
    saveState();
    renderExerciseView();
    renderHabits();
  }

  /* catalog of not-yet-added exercises, filtered live by the search box */
  function renderExerciseCatalog(habit) {
    const box = document.getElementById("exerciseCatalog");
    box.innerHTML = "";
    const query = exerciseSearch.value.trim().toLowerCase();
    const added = {};
    for (let i = 0; i < habit.config.items.length; i++) added[habit.config.items[i].key] = true;
    let shown = 0;
    for (let i = 0; i < EXERCISE_CATALOG.length; i++) {
      const key = EXERCISE_CATALOG[i];
      if (added[key]) continue;
      const name = exerciseName(key);
      if (query && name.toLowerCase().indexOf(query) === -1) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ex-cat-btn";
      btn.innerHTML = '<span class="ex-cat-btn__ico">' + habitSvg(key) + "</span><span>" + name + "</span>";
      btn.addEventListener("click", function () { addExercise(key); });
      box.appendChild(btn);
      shown++;
    }
    if (!shown) {
      const empty = document.createElement("p");
      empty.className = "ex-empty";
      empty.textContent = translate("exerciseCatalogEmpty");
      box.appendChild(empty);
    }
  }
  exerciseSearch.addEventListener("input", function () {
    const habit = currentExercise();
    if (habit) renderExerciseCatalog(habit);
  });

  /* last 7 days: overall completion fraction per day (0 if unlogged), and the average */
  function exerciseWeekData(habit) {
    const now = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
      days.push({ fraction: exerciseOverallFraction(habit, key), date: new Date(d) });
    }
    let sum = 0;
    for (let i = 0; i < days.length; i++) sum += days[i].fraction;
    return { days: days, avg: sum / days.length };
  }

  function renderExerciseWeek(habit) {
    const hasItems = habit.config.items.length > 0;
    const wk = exerciseWeekData(habit);
    document.getElementById("exerciseAvg").textContent = hasItems ? Math.round(wk.avg * 100) + "%" : "–";
    document.getElementById("exerciseChart").innerHTML = exerciseWeekSvg(wk.days);
  }

  /* 7-day bar chart, 0-100% completion, with a dashed line at the 100% goal */
  function exerciseWeekSvg(days) {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const W = 280, H = 122, padX = 6, padT = 10, padB = 20;
    const plotW = W - padX * 2, plotH = H - padT - padB, y0 = padT + plotH;
    const yAt = function (f) { return y0 - f * plotH; };
    const step = plotW / days.length;
    const bw = Math.min(24, step * 0.5);
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="swk">';
    const gy = yAt(1).toFixed(1);
    svg += '<line class="swk-target" x1="' + padX + '" y1="' + gy + '" x2="' + (W - padX) + '" y2="' + gy + '"/>';
    for (let i = 0; i < days.length; i++) {
      const cx = padX + step * i + step / 2;
      svg += '<text class="swk-wd" x="' + cx.toFixed(1) + '" y="' + (H - 6) + '">'
        + days[i].date.toLocaleDateString(locale, { weekday: "narrow" }) + "</text>";
      const f = days[i].fraction;
      if (f <= 0) continue;
      svg += '<rect class="swk-bar' + (f >= 1 ? "" : " is-out") + '" x="' + (cx - bw / 2).toFixed(1)
        + '" y="' + yAt(f).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (y0 - yAt(f)).toFixed(1) + '" rx="3"/>';
    }
    return svg + "</svg>";
  }

  const exerciseCloseButtons = exerciseView.querySelectorAll("[data-close]");
  for (let i = 0; i < exerciseCloseButtons.length; i++) {
    exerciseCloseButtons[i].addEventListener("click", function () { exerciseView.hidden = true; });
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
  let pickerTimeOn = false;                       // whether a time is set on top of the date

  /* time picker: an on/off toggle plus hour/minute sliders, live "HH:MM" readout */
  const timePicker = document.getElementById("timePicker");
  const timeHourSlider = document.getElementById("timeHour");
  const timeMinuteSlider = document.getElementById("timeMinute");
  const timeValueEl = document.getElementById("timeValue");
  const timeToggle = createToggle(false, function (on) {
    pickerTimeOn = on;
    timePicker.hidden = !on;
  });
  timeToggle.classList.add("toggle--accent");   // neutral accent, not the "important" red
  document.getElementById("timeToggleSlot").appendChild(timeToggle);

  function updateTimeDisplay() {
    const h = String(timeHourSlider.value).padStart(2, "0");
    const m = String(timeMinuteSlider.value).padStart(2, "0");
    timeValueEl.textContent = h + ":" + m;
  }
  timeHourSlider.addEventListener("input", updateTimeDisplay);
  timeMinuteSlider.addEventListener("input", updateTimeDisplay);

  /* load a "HH:MM" (or "" for no time) into the toggle + sliders */
  function setPickerTime(time) {
    const on = !!time;
    pickerTimeOn = on;
    timeToggle.classList.toggle("is-on", on);
    timeToggle.setAttribute("aria-checked", on ? "true" : "false");
    timePicker.hidden = !on;
    const parts = (time || "09:00").split(":");
    timeHourSlider.value = parseInt(parts[0], 10);
    timeMinuteSlider.value = Math.round(parseInt(parts[1], 10) / 5) * 5;   // snap to the 5-minute step
    updateTimeDisplay();
  }
  function pickerTimeValue() {
    if (!pickerTimeOn) return "";
    return String(timeHourSlider.value).padStart(2, "0") + ":" + String(timeMinuteSlider.value).padStart(2, "0");
  }

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

  /* a date key shifted by whole days (handles month/year rollover) */
  function shiftDateKey(key, delta) {
    const d = new Date(key + "T00:00");
    d.setDate(d.getDate() + delta);
    return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /* Pinned rows float to the top; everything else keeps its manual (drag) order. */
  function sortedByDue(items) {
    const pinned = [];
    const rest = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].pinned) pinned.push(items[i]);
      else rest.push(items[i]);
    }
    return pinned.concat(rest);
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
    setPickerTime(time);
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
    applyDue(pickerSelected, pickerTimeValue());
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

  function notify(title, body, tag) {
    if (!window.Notification || Notification.permission !== "granted") return;
    const options = { body: body, icon: "./icons/icon-192.png", tag: tag };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(function (reg) { reg.showNotification(title, options); });
    } else {
      new Notification(title, options);
    }
  }
  function showReminder(task) {
    notify(translate("reminderTitle"), task.text, "task-" + task.id);
  }

  /* foreground bedtime reminder: wake - target, once per day when the app is open */
  function checkSleepReminder() {
    if (!window.Notification || Notification.permission !== "granted") return;
    let habit = null;
    for (let i = 0; i < state.habits.length; i++) {
      if (state.habits[i].type === "sleep") { habit = state.habits[i]; break; }
    }
    if (!habit || !habit.config) return;
    const bt = bedtime(habit.config.wake, habit.config.target);
    if (!bt) return;
    const now = new Date();
    const nowHM = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    if (nowHM === bt && habit.bedNotifiedOn !== todayKey()) {
      habit.bedNotifiedOn = todayKey();
      saveState();
      notify(translate("sleepTitle"), translate("sleepBedNotif"), "sleep-bed");
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

  /* FLOATING VIEWS — the rectangle the user just clicked, captured before any
     re-render, so the card that opens can grow out of it */
  const OPEN_MS = 280;
  const ORIGIN_SELECTOR = ".item, .day-event, .event-row, .add-card, .ecal__day, .tl-row,"
    + " .note-card, .zone__action, .topbar__btn, .notes__add, .dtl__etick";
  let clickOrigin = null;
  document.addEventListener("click", function (event) {
    const source = event.target.closest ? event.target.closest(ORIGIN_SELECTOR) : null;
    clickOrigin = source ? source.getBoundingClientRect() : null;
  }, true);

  /* Show a floating view. On desktop the card expands from the clicked rectangle;
     on mobile it stays a bottom sheet, so the slide-up is left alone. onSettled
     runs once the motion is done — measuring inside a transform would be wrong. */
  function openFloating(view, onSettled) {
    view.hidden = false;
    const card = view.querySelector(".detail__card");
    const origin = clickOrigin;
    if (origin && !window.matchMedia("(max-width: 700px)").matches) {
      card.style.transition = "none";
      card.style.transform = "none";
      const target = card.getBoundingClientRect();
      const scale = Math.max(.62, Math.min(1, origin.width / target.width));
      const dx = origin.left + origin.width / 2 - (target.left + target.width / 2);
      const dy = origin.top + origin.height / 2 - (target.top + target.height / 2);
      card.style.transform = "translate(" + Math.round(dx) + "px, " + Math.round(dy)
        + "px) scale(" + scale.toFixed(3) + ")";
      card.offsetWidth;              // flush the start state before animating away from it
      card.style.transition = "";
    }
    requestAnimationFrame(function () {
      card.style.transform = "";
      view.classList.add("is-open");
    });
    if (onSettled) setTimeout(onSettled, OPEN_MS);
  }

  /* SHARED — small helpers used across the views */
  const ICON_FLOWER ='<circle cx="12" cy="6" r="3"/><circle cx="17.7" cy="10.15" r="3"/><circle cx="15.5" cy="16.85" r="3"/><circle cx="8.47" cy="16.85" r="3"/><circle cx="6.3" cy="10.15" r="3"/><circle cx="12" cy="12" r="2.2"/>';

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
  const habitsViewBody = document.getElementById("habitsViewBody");

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

    card.appendChild(head);
    if (habit.type === "sleep") card.appendChild(buildSleepStats(habit));   // avg / debt / week chart
    if (habit.type === "exercise") card.appendChild(buildExerciseStats(habit));   // per-exercise today + week rate

    const stats = document.createElement("div");
    stats.className = "hcard__stats";
    const histLabel = document.createElement("span");
    histLabel.textContent = translate("historyLabel");
    const streak = document.createElement("span");
    streak.className = "hcard__streak";
    streak.textContent = translate("streakLabel") + " " + habitStreak(habit);
    stats.append(histLabel, streak);

    card.append(stats, createHeatmap(habit));
    return card;
  }

  /* sleep-specific stats block for the habits view: 7-day average, debt, week chart */
  function buildSleepStats(habit) {
    const wk = sleepWeekData(habit);
    const wrap = document.createElement("div");
    wrap.className = "hcard__sleep";
    const avg = wk.avg != null ? formatHours(wk.avg) : "–";
    const debt = wk.debt > 0.01 ? "-" + formatHours(wk.debt) : "0h";
    const row = document.createElement("div");
    row.className = "sleep__weekstats";
    row.innerHTML =
      '<div class="sleep__stat"><span class="sleep__stat-v">' + avg + '</span><span class="sleep__stat-l">' + translate("sleepAvgLabel") + '</span></div>' +
      '<div class="sleep__stat"><span class="sleep__stat-v">' + debt + '</span><span class="sleep__stat-l">' + translate("sleepDebtLabel") + '</span></div>';
    const chart = document.createElement("div");
    chart.className = "sleep__chart";
    chart.innerHTML = sleepWeekSvg(wk.days, habit.config || {});
    wrap.append(row, chart);
    return wrap;
  }

  /* exercise-specific stats block for the habits view: today's per-exercise chips,
     7-day success rate, week chart */
  function buildExerciseStats(habit) {
    const items = (habit.config && habit.config.items) || [];
    const today = todayKey();
    const wk = exerciseWeekData(habit);
    const wrap = document.createElement("div");
    wrap.className = "hcard__sleep";

    if (items.length) {
      const chips = document.createElement("div");
      chips.className = "ex-stats__chips";
      for (let i = 0; i < items.length; i++) {
        const count = exerciseCount(habit, items[i].key, today);
        const chip = document.createElement("span");
        chip.className = count >= items[i].target ? "ex-stats__chip is-done" : "ex-stats__chip";
        chip.textContent = exerciseName(items[i].key) + " " + count + "/" + items[i].target;
        chips.appendChild(chip);
      }
      wrap.appendChild(chips);
    }

    const row = document.createElement("div");
    row.className = "sleep__weekstats";
    row.innerHTML = '<div class="sleep__stat"><span class="sleep__stat-v">' + (items.length ? Math.round(wk.avg * 100) + "%" : "–")
      + '</span><span class="sleep__stat-l">' + translate("exerciseAvgLabel") + "</span></div>";
    const chart = document.createElement("div");
    chart.className = "sleep__chart";
    chart.innerHTML = exerciseWeekSvg(wk.days);
    wrap.append(row, chart);
    return wrap;
  }

  /* completed dates as a lookup object. For sleep, a day counts when the logged
     hours land inside the target..max range. For exercise, when every configured
     item reached its target that day. */
  function completedSet(habit) {
    const set = {};
    if (habit.type === "sleep") {
      const log = habit.sleepLog || {};
      const cfg = habit.config || {};
      const days = Object.keys(log);
      for (let i = 0; i < days.length; i++) {
        const h = log[days[i]];
        if (h >= (cfg.min || 0) && (cfg.max == null || h <= cfg.max)) set[days[i]] = true;
      }
      return set;
    }
    if (habit.type === "exercise") {
      const log = habit.exerciseLog || {};
      const days = Object.keys(log);
      for (let i = 0; i < days.length; i++) {
        if (exerciseAllDone(habit, days[i])) set[days[i]] = true;
      }
      return set;
    }
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


  /* DETAIL — full-screen view of a task/project: rename, props, notes, subtasks */
  const detail = document.getElementById("detail");
  const detailName = document.getElementById("detailName");
  const detailIcon = document.getElementById("detailIcon");
  const detailDate = document.getElementById("detailDate");
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

  /* a bordered clickable property: leading icon (inner paths) + text */
  function propButton(innerIcon, text, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "edit-prop";
    const ico = document.createElement("span");
    ico.className = "edit-prop__ico";
    ico.innerHTML = iconSvg(innerIcon);
    const label = document.createElement("span");
    label.className = "edit-prop__text";
    label.textContent = text;
    btn.append(ico, label);
    btn.addEventListener("click", onClick);
    return btn;
  }
  function dayArrow(glyph, aria, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "date-nav__arrow";
    btn.textContent = glyph;
    btn.setAttribute("aria-label", aria);
    btn.addEventListener("click", onClick);
    return btn;
  }

  /* type-specific controls — add per-type fields here (modular) */
  function renderDetailProps(item, list) {
    detailProps.innerHTML = "";
    if (list === "projects") {
      const bars = createImportanceBars(item.importance || 0, function (level) {
        item.importance = item.importance === level ? 0 : level;
        saveState();
        renderList("projects");
        renderDetailProps(item, "projects");
      });
      detailProps.appendChild(detailField(translate("importanceAria"), bars));
    } else if (list === "events") {
      // the date itself opens the calendar to reschedule; the < > jump one day
      const dateNav = document.createElement("div");
      dateNav.className = "date-nav";
      const dateBtn = propButton(HABIT_ICONS.calendar,
        fullDateLabel(item.date) + (item.time ? " · " + item.time : ""),
        function () { openCalendar(item.id, "events"); });
      dateNav.append(
        dayArrow("‹", translate("prevDayAria"), function () { shiftEventDay(item, -1); }),
        dateBtn,
        dayArrow("›", translate("nextDayAria"), function () { shiftEventDay(item, 1); })
      );
      detailProps.appendChild(detailField(translate("eventDateLabel"), dateNav));

      const toggle = createToggle(!!item.important, function (on) {
        item.important = on;
        saveState();
        refreshDetailSource();   // calendar bell / row highlight
      });
      toggle.setAttribute("aria-label", translate("importantAria"));
      detailProps.appendChild(detailField(translate("importantLabel"), toggle, "field--row"));
    }
  }

  /* move an event one day back/forward from its detail view */
  function shiftEventDay(event, delta) {
    event.date = shiftDateKey(event.date, delta);
    saveState();
    renderDetailProps(event, "events");   // refresh the date label
    refreshDetailSource();                // calendar / timeline / day list
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
    syncTaskDate(item);
    renderDetailProps(item, kind);
    detailNotes.value = item.notes || "";

    // projects show the milestone timeline, everything else shows subtasks
    const isProject = kind === "projects";
    subtaskSection.hidden = isProject;
    timelineSection.hidden = !isProject;
    if (isProject) renderTimeline(item);
    else renderSubtasks(item);

    openFloating(detail, function () {
      if (isProject) layoutTimeline();   // measure once the view has settled
    });
    detail.querySelector(".detail__body").scrollTop = 0;   // always open at the top
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

  /* a task's due date is a discreet calendar button to the right of the title */
  function syncTaskDate(item) {
    const isTask = detailTarget.kind === "tasks";
    detailDate.hidden = !isTask;
    if (!isTask) return;
    detailDate.classList.toggle("is-set", !!item.dueDate);
    const label = item.dueDate ? dueLabel(item) : translate("editDateNone");
    detailDate.setAttribute("aria-label", label);
    detailDate.title = label;
  }

  /* refresh the type-specific controls after the calendar edits a date */
  function refreshDetailIfOpen() {
    if (detail.hidden) return;
    const item = currentDetailItem();
    if (item) { renderDetailProps(item, detailTarget.kind); syncTaskDate(item); }
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
  detailDate.addEventListener("click", function () {
    const item = currentDetailItem();
    if (item) openCalendar(item.id);
  });

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
  const ecalViewport = document.getElementById("ecalViewport");
  const ecalToggle = document.getElementById("ecalToggle");
  let ecalYear = new Date().getFullYear();
  let ecalMonth = new Date().getMonth();
  let calExpanded = false;   // folded to a single week by default
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
  /* one day cell, shared by the week strip and the month grid */
  function createCalDay(key, dayNumber) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = key === todayKey() ? "ecal__day is-today" : "ecal__day";

    const num = document.createElement("span");
    num.textContent = String(dayNumber);
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
    return cell;
  }

  /* Monday-first weekday headers, shared by both grids */
  function appendWeekdayHeads(grid) {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    for (let i = 0; i < 7; i++) {
      const head = document.createElement("div");
      head.className = "ecal__wd";
      head.textContent = new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "short" });
      grid.appendChild(head);
    }
  }

  /* folded, the calendar shows one week: the one holding today when we're on the
     current month, otherwise the month's opening week */
  function foldedWeekStart() {
    const now = new Date();
    const onThisMonth = now.getFullYear() === ecalYear && now.getMonth() === ecalMonth;
    const anchor = onThisMonth ? new Date(now) : new Date(ecalYear, ecalMonth, 1);
    anchor.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
    return anchor;
  }

  function renderEventCal() {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    document.getElementById("ecalMonth").textContent =
      new Date(ecalYear, ecalMonth, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });

    ecalGrid.innerHTML = "";
    appendWeekdayHeads(ecalGrid);

    if (!calExpanded) {
      const monday = foldedWeekStart();
      for (let i = 0; i < 7; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        ecalGrid.appendChild(createCalDay(dateKey(day.getFullYear(), day.getMonth(), day.getDate()), day.getDate()));
      }
      return;
    }

    const lead = (new Date(ecalYear, ecalMonth, 1).getDay() + 6) % 7;   // Monday-first offset
    for (let i = 0; i < lead; i++) {
      const pad = document.createElement("div");
      pad.className = "ecal__pad";
      ecalGrid.appendChild(pad);
    }
    const daysInMonth = new Date(ecalYear, ecalMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      ecalGrid.appendChild(createCalDay(dateKey(ecalYear, ecalMonth, d), d));
    }
  }

  /* Unfold or fold the month in place. The viewport is clipped and its height
     animated only for the length of the move, so hover previews stay free to
     overflow the rest of the time. */
  const CAL_MS = 450;
  let calTimer = null;
  function toggleCalendar() {
    const from = ecalViewport.getBoundingClientRect().height;
    calExpanded = !calExpanded;
    renderEventCal();

    ecalViewport.style.overflow = "hidden";
    ecalViewport.style.height = from + "px";
    ecalViewport.offsetWidth;                       // commit the start height
    ecalViewport.style.height = ecalGrid.getBoundingClientRect().height + "px";

    ecalGrid.classList.remove("is-morph");
    ecalGrid.offsetWidth;
    ecalGrid.classList.add("is-morph");

    ecalToggle.classList.toggle("is-open", calExpanded);
    ecalToggle.setAttribute("aria-expanded", calExpanded ? "true" : "false");

    clearTimeout(calTimer);
    calTimer = setTimeout(function () {
      ecalViewport.style.height = "";
      ecalViewport.style.overflow = "";
    }, CAL_MS + 20);
  }
  ecalToggle.addEventListener("click", toggleCalendar);

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
  function setDayViewDate(key) {
    dayViewKey = key;
    document.getElementById("dayTitle").textContent = fullDateLabel(key);
    renderDayList();
  }
  function openDayView(key) {
    setDayViewDate(key);
    openFloating(dayView, function () {
      document.getElementById("dayAddInput").focus();
    });
  }
  document.getElementById("dayPrev").addEventListener("click", function () {
    setDayViewDate(shiftDateKey(dayViewKey, -1));
  });
  document.getElementById("dayNext").addEventListener("click", function () {
    setDayViewDate(shiftDateKey(dayViewKey, 1));
  });

  /* swipe left/right on the day view to change day (mobile-friendly) */
  let daySwipeStart = null;
  let daySwipeUntil = 0;   // suppress the click that ends a swipe
  dayView.addEventListener("pointerdown", function (event) {
    daySwipeStart = (event.pointerType === "mouse" && event.button !== 0)
      ? null : { x: event.clientX, y: event.clientY };
  });
  dayView.addEventListener("pointerup", function (event) {
    if (!daySwipeStart) return;
    const dx = event.clientX - daySwipeStart.x;
    const dy = event.clientY - daySwipeStart.y;
    daySwipeStart = null;
    if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {   // clearly horizontal
      daySwipeUntil = Date.now() + 350;
      setDayViewDate(shiftDateKey(dayViewKey, dx < 0 ? 1 : -1));   // left = next day
    }
  });
  dayView.addEventListener("click", function (event) {
    if (Date.now() < daySwipeUntil) { event.stopPropagation(); event.preventDefault(); }
  }, true);
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

  /* DAILY TIMELINE — a 24h rule (sunrise/sunset from Open-Meteo, cached once a
     day) with the day's events as chips underneath. Falls back to a plain rule. */
  function toMinutes(hhmm) {
    const parts = hhmm.split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
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

  /* a sunrise/sunset marker: a dot on the rule, a stem, the reading above it */
  function sunMarker(timeText, captionKey, pct) {
    const marker = document.createElement("div");
    marker.className = "dtl__marker";
    marker.style.left = pct + "%";

    const time = document.createElement("span");
    time.className = "dtl__marker-time";
    time.textContent = timeText;
    const caption = document.createElement("span");
    caption.className = "dtl__marker-caption";
    caption.textContent = translate(captionKey);
    const stem = document.createElement("span");
    stem.className = "dtl__marker-stem";
    const dot = document.createElement("span");
    dot.className = "dtl__marker-dot";

    marker.append(time, caption, stem, dot);
    return marker;
  }

  /* a tick every hour, taller and labelled every three. Midnight keeps its tick
     but no label: it sits in the faded end of the rule. */
  function renderDtlTicks() {
    const ticks = document.getElementById("dtlTicks");
    ticks.innerHTML = "";
    for (let h = 0; h <= 24; h++) {
      const major = h % 3 === 0;
      const tick = document.createElement("span");
      tick.className = major ? "dtl__tick is-major" : "dtl__tick";
      tick.style.left = (h / 24 * 100) + "%";
      ticks.appendChild(tick);
      if (!major || h === 0 || h === 24) continue;
      const label = document.createElement("span");
      label.className = "dtl__tick-label";
      label.style.left = (h / 24 * 100) + "%";
      label.textContent = (h < 10 ? "0" : "") + h + ":00";
      ticks.appendChild(label);
    }
  }

  function renderDailyTimeline() {
    const sun = todaySun();
    document.getElementById("dtlStrip").style.background = stripGradient(sun);
    renderDtlTicks();

    // place + current weather, up in the top bar beside the tools
    const weather = document.getElementById("dtlWeather");
    weather.innerHTML = "";
    if (sun && sun.temp != null) {
      weather.hidden = false;
      if (sun.place) {
        const place = document.createElement("span");
        place.className = "topbar__place";
        place.textContent = sun.place;
        weather.appendChild(place);
      }
      const icon = document.createElement("span");
      icon.className = "topbar__wico";
      icon.innerHTML = weatherIcon(sun.code);   // trusted svg markup
      const temp = document.createElement("span");
      temp.className = "topbar__temp";
      temp.textContent = Math.round(sun.temp) + "°";
      weather.append(icon, temp);
      weather.classList.toggle("is-clickable", !!(sun.hourly && sun.hourly.temp));   // opens the day graph
    } else {
      weather.hidden = true;
    }

    const markers = document.getElementById("dtlMarkers");
    const cursor = document.getElementById("dtlCursor");
    markers.innerHTML = "";

    if (sun) {
      const srMin = toMinutes(sun.sunrise);
      const ssMin = toMinutes(sun.sunset);
      markers.appendChild(sunMarker(sun.sunrise, "sunriseLabel", srMin / 1440 * 100));
      markers.appendChild(sunMarker(sun.sunset, "sunsetLabel", ssMin / 1440 * 100));

      const now = new Date();
      updateCursor(cursor, now.getHours() * 60 + now.getMinutes(), srMin, ssMin);
      cursor.hidden = false;
    } else {
      cursor.hidden = true;
    }

    renderEventTicks();
    renderTodayEvents();
  }

  /* place the cursor at the current time on the bar: sun by day (halo fading
     within an hour of sunrise/sunset), moon with a white halo by night */
  function updateCursor(cursor, nowMin, srMin, ssMin) {
    cursor.style.left = (nowMin / 1440 * 100) + "%";
    const isDay = nowMin >= srMin && nowMin <= ssMin;
    cursor.classList.toggle("is-day", isDay);
    cursor.classList.toggle("is-night", !isDay);
    let halo = 0.9;
    if (isDay) {
      const edge = Math.min(nowMin - srMin, ssMin - nowMin);   // minutes to nearest edge
      halo = edge >= 60 ? 1 : Math.max(0.45, edge / 60);       // softens, never goes out
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

  function eventTimeSort(a, b) {
    const ta = a.time || "99:99";
    const tb = b.time || "99:99";
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  }

  function renderTodayEvents() {
    const box = document.getElementById("todayEvents");
    box.innerHTML = "";
    const today = todayKey();
    const list = eventsOnDay(today).slice().sort(eventTimeSort);
    for (let i = 0; i < list.length; i++) box.appendChild(todayEventRow(list[i]));

    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-card";
    const plus = document.createElement("span");
    plus.className = "add-card__plus";
    plus.textContent = "+";
    const label = document.createElement("span");
    label.textContent = translate("addEventTitle");
    add.append(plus, label);
    add.addEventListener("click", function () { openDayView(today); });
    box.appendChild(add);
  }

  /* an event under the gauge: a rectangle with icon, title, and time on the right */
  function todayEventRow(event) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "day-event is-" + eventStatus(event) + (event.important ? " is-important" : "");
    row.addEventListener("click", function () { openEventDetail(event); });

    const icon = document.createElement("span");
    icon.className = "day-event__ico";
    icon.innerHTML = habitSvg(event.icon || "calendar");
    row.appendChild(icon);

    const title = document.createElement("span");
    title.className = "day-event__title";
    title.textContent = event.text;
    row.appendChild(title);

    if (event.important) {
      const bell = document.createElement("span");
      bell.className = "day-event__bell";
      bell.innerHTML = iconSvg(ICON_BELL);
      row.appendChild(bell);
    }
    if (event.time) {
      const time = document.createElement("span");
      time.className = "day-event__time";
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
    // one request brings back daily (sunrise/sunset), current, and today's hourly
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon
      + "&daily=sunrise,sunset&current=temperature_2m,weather_code"
      + "&hourly=temperature_2m,weather_code&forecast_days=1&timezone=auto";
    fetch(url).then(function (res) { return res.json(); }).then(function (data) {
      const sunrise = data.daily.sunrise[0];   // "2026-06-25T05:59"
      const sunset = data.daily.sunset[0];
      state.sun = {
        date: todayKey(), lat: lat, lon: lon,
        place: (state.sun && state.sun.place) || placeFromTimezone(data.timezone),
        sunrise: sunrise.slice(11, 16), sunset: sunset.slice(11, 16),
        temp: data.current.temperature_2m,
        code: data.current.weather_code,
        hourly: data.hourly ? { time: data.hourly.time, temp: data.hourly.temperature_2m, code: data.hourly.weather_code } : null,
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

  /* inner SVG paths for a WMO weather code (0 clear … 95+ storm) */
  function weatherGlyph(code) {
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

    if (code === 0) return sun;
    if (code <= 2) return partly;
    if (code === 45 || code === 48) return fog;
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return rain;
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return snow;
    if (code >= 95) return storm;
    return cloud;
  }

  function weatherIcon(code) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
      + 'stroke-linecap="round" stroke-linejoin="round">' + weatherGlyph(code) + '</svg>';
  }

  /* WEATHER GRAPH — today's hourly temperature as a line+area chart, with condition
     glyphs, a "now" marker and a tap/hover readout. Uses the once-a-day cached data. */
  const weatherModal = document.getElementById("weatherModal");

  function smoothPath(pts) {
    if (pts.length < 2) return "";
    let d = "M " + pts[0].x.toFixed(1) + " " + pts[0].y.toFixed(1);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += " C " + c1x.toFixed(1) + " " + c1y.toFixed(1) + " " + c2x.toFixed(1) + " "
         + c2y.toFixed(1) + " " + p2.x.toFixed(1) + " " + p2.y.toFixed(1);
    }
    return d;
  }
  function interpTemp(arr, f) {
    const i = Math.floor(f);
    if (i >= arr.length - 1) return arr[arr.length - 1];
    if (i < 0) return arr[0];
    return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
  }
  function setWeatherReadout(hour, temp, code) {
    const el = document.getElementById("wxReadout");
    if (!el) return;
    el.innerHTML = '<span class="wx-readout__ico">' + weatherIcon(code) + '</span>'
      + '<span class="wx-readout__h">' + String(hour).padStart(2, "0") + ":00</span>"
      + '<span class="wx-readout__t">' + temp + "°</span>";
  }

  function renderWeatherChart() {
    const sun = state.sun;
    document.getElementById("weatherPlace").textContent = (sun && sun.place) ? sun.place : "";
    const container = document.getElementById("weatherChart");
    if (!sun || !sun.hourly || !sun.hourly.temp || !sun.hourly.temp.length) { container.innerHTML = ""; return; }

    const temps = sun.hourly.temp;
    const codes = sun.hourly.code;
    const n = temps.length;

    const W = 360, H = 240, padL = 18, padR = 18, padT = 52, padB = 26;
    const plotW = W - padL - padR;
    const yTop = padT, yBot = H - padB, plotH = yBot - yTop;

    let lo = Math.min.apply(null, temps);
    let hi = Math.max.apply(null, temps);
    if (hi - lo < 4) { const mid = (hi + lo) / 2; lo = mid - 2; hi = mid + 2; }
    lo = Math.floor(lo - 1);
    hi = Math.ceil(hi + 1);

    const xAt = function (i) { return padL + (i / (n - 1)) * plotW; };
    const yAt = function (t) { return yBot - (t - lo) / (hi - lo) * plotH; };

    const pts = [];
    for (let i = 0; i < n; i++) pts.push({ x: xAt(i), y: yAt(temps[i]) });
    const line = smoothPath(pts);
    const area = line + " L " + xAt(n - 1).toFixed(1) + " " + yBot + " L " + xAt(0).toFixed(1) + " " + yBot + " Z";

    let iMax = 0, iMin = 0;
    for (let i = 1; i < n; i++) {
      if (temps[i] > temps[iMax]) iMax = i;
      if (temps[i] < temps[iMin]) iMin = i;
    }

    const now = new Date();
    const nowF = Math.max(0, Math.min(n - 1, now.getHours() + now.getMinutes() / 60));
    const nowX = xAt(nowF);
    const nowY = yAt(interpTemp(temps, nowF));

    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="wx">';
    svg += '<defs><linearGradient id="wxFill" x1="0" y1="0" x2="0" y2="1">'
         + '<stop offset="0" class="wx-fill-top"/><stop offset="1" class="wx-fill-bot"/></linearGradient></defs>';
    svg += '<path class="wx-area" d="' + area + '" fill="url(#wxFill)"/>';
    svg += '<path class="wx-line" d="' + line + '"/>';
    for (let i = 0; i < n; i += 3) {   // condition glyph every 3h, hour label every 6h
      const gx = xAt(i);
      svg += '<svg x="' + (gx - 10).toFixed(1) + '" y="6" width="20" height="20" viewBox="0 0 24 24" '
           + 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" '
           + 'stroke-linejoin="round" class="wx-glyph">' + weatherGlyph(codes[i]) + '</svg>';
      if (i % 6 === 0) svg += '<text class="wx-hour" x="' + gx.toFixed(1) + '" y="' + (H - 8) + '">' + i + 'h</text>';
    }
    svg += '<line class="wx-now" x1="' + nowX.toFixed(1) + '" y1="' + yTop + '" x2="' + nowX.toFixed(1) + '" y2="' + yBot + '"/>';
    svg += '<circle class="wx-now-dot" cx="' + nowX.toFixed(1) + '" cy="' + nowY.toFixed(1) + '" r="3.2"/>';
    svg += '<text class="wx-ext" x="' + xAt(iMax).toFixed(1) + '" y="' + (yAt(temps[iMax]) - 8).toFixed(1) + '">' + Math.round(temps[iMax]) + '°</text>';
    svg += '<text class="wx-ext" x="' + xAt(iMin).toFixed(1) + '" y="' + (yAt(temps[iMin]) + 15).toFixed(1) + '">' + Math.round(temps[iMin]) + '°</text>';
    svg += '<line class="wx-cross" id="wxCross" y1="' + yTop + '" y2="' + yBot + '" style="display:none"/>';
    svg += '<circle class="wx-cross-dot" id="wxCrossDot" r="3.5" style="display:none"/>';
    svg += "</svg>";

    container.innerHTML = '<div class="wx-readout" id="wxReadout"></div>' + svg;
    const nowIdx = Math.min(n - 1, Math.round(nowF));
    setWeatherReadout(now.getHours(), Math.round(interpTemp(temps, nowF)), codes[nowIdx]);

    const svgEl = container.querySelector("svg.wx");
    const cross = container.querySelector("#wxCross");
    const crossDot = container.querySelector("#wxCrossDot");
    svgEl.addEventListener("pointermove", function (event) {
      const rect = svgEl.getBoundingClientRect();
      const vx = ((event.clientX - rect.left) / rect.width) * W;
      let i = Math.round(((vx - padL) / plotW) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      const cx = xAt(i);
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.style.display = "";
      crossDot.setAttribute("cx", cx); crossDot.setAttribute("cy", yAt(temps[i])); crossDot.style.display = "";
      setWeatherReadout(i, Math.round(temps[i]), codes[i]);
    });
    svgEl.addEventListener("pointerleave", function () {
      cross.style.display = "none";
      crossDot.style.display = "none";
      setWeatherReadout(now.getHours(), Math.round(interpTemp(temps, nowF)), codes[nowIdx]);
    });
  }

  function openWeather() {
    if (!(state.sun && state.sun.hourly && state.sun.hourly.temp)) return;
    renderWeatherChart();
    weatherModal.hidden = false;
  }
  document.getElementById("dtlWeather").addEventListener("click", openWeather);
  const weatherCloseButtons = weatherModal.querySelectorAll("[data-close]");
  for (let i = 0; i < weatherCloseButtons.length; i++) {
    weatherCloseButtons[i].addEventListener("click", function () { weatherModal.hidden = true; });
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
    openFloating(notesView);
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
    openFloating(noteEditor, function () { noteTitleInput.focus(); });
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

  /* every floating view closes on its backdrop, the way the habit dialogs do */
  const detailClosers = {
    detail: closeDetail, dayView: closeDayView,
    notes: closeNotes, noteEditor: closeNoteEditor
  };
  const detailBackdrops = document.querySelectorAll(".detail__backdrop");
  for (let i = 0; i < detailBackdrops.length; i++) {
    const view = detailBackdrops[i].parentNode;
    detailBackdrops[i].addEventListener("click", detailClosers[view.id]);
  }

  /* THE TWO SPACES — work and well-being sit on one rail under the day line.
     The tab on the edge is the handle: dragging it brings the other space in
     behind the pointer, and a plain click flips between them. */
  const pagesEl = document.getElementById("pages");
  const pagesTrack = document.getElementById("pagesTrack");
  const workPage = document.getElementById("workPage");
  const wellPage = document.getElementById("wellPage");
  const wellTab = document.getElementById("wellTab");
  const wellPull = document.getElementById("wellPull");
  let wellOpen = false;

  /* below this width the rail stacks and the tab is pulled upwards instead */
  function tabIsBottom() { return window.matchMedia("(max-width: 900px)").matches; }

  function trackOffset(progress) {
    if (tabIsBottom()) return "translateY(" + (-workPage.offsetHeight * progress).toFixed(1) + "px)";
    return "translateX(" + (-50 * progress).toFixed(2) + "%)";
  }

  /* the rail is as tall as the space on show; while dragging it takes the
     taller of the two so the incoming one is never clipped */
  function syncPagesHeight(dragging) {
    const work = workPage.offsetHeight;
    const well = wellPage.offsetHeight;
    pagesEl.style.height = (dragging ? Math.max(work, well) : (wellOpen ? well : work)) + "px";
  }

  function setWellOpen(open) {
    wellOpen = open;
    pagesTrack.classList.remove("is-dragging");
    pagesTrack.style.transform = trackOffset(open ? 1 : 0);
    wellTab.classList.toggle("is-open", open);
    wellPull.setAttribute("aria-expanded", open ? "true" : "false");
    syncPagesHeight(false);
  }

  let pullDrag = null;
  let pullClickBlockedUntil = 0;

  wellPull.addEventListener("pointerdown", function (event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    wellPull.setPointerCapture(event.pointerId);
    pullDrag = { x: event.clientX, y: event.clientY, moved: false, progress: wellOpen ? 1 : 0 };
    pagesTrack.classList.add("is-dragging");
    syncPagesHeight(true);
  });

  wellPull.addEventListener("pointermove", function (event) {
    if (!pullDrag) return;
    const bottom = tabIsBottom();
    const span = bottom ? window.innerHeight * 0.4 : window.innerWidth * 0.35;
    const delta = bottom ? (pullDrag.y - event.clientY) : (pullDrag.x - event.clientX);
    if (Math.abs(delta) > 4) pullDrag.moved = true;
    pullDrag.progress = Math.max(0, Math.min(1, (wellOpen ? 1 : 0) + delta / span));
    pagesTrack.style.transform = trackOffset(pullDrag.progress);
  });

  function endPull() {
    if (!pullDrag) return;
    const drag = pullDrag;
    pullDrag = null;
    // a tap flips; a real drag settles to whichever side it ended up closest to
    setWellOpen(drag.moved ? drag.progress > 0.5 : !wellOpen);
    if (drag.moved) pullClickBlockedUntil = Date.now() + 400;
  }
  wellPull.addEventListener("pointerup", endPull);
  wellPull.addEventListener("pointercancel", endPull);

  // keyboard activation still goes through click
  wellPull.addEventListener("click", function () {
    if (Date.now() < pullClickBlockedUntil) return;
    if (pullDrag) return;
    setWellOpen(!wellOpen);
  });

  window.addEventListener("resize", function () {
    if (pullDrag) return;
    pagesTrack.style.transform = trackOffset(wellOpen ? 1 : 0);
    syncPagesHeight(false);
  });

  // content grows and shrinks all the time; the rail follows without bookkeeping
  if (window.ResizeObserver) {
    const pageWatcher = new ResizeObserver(function () {
      if (!pullDrag) syncPagesHeight(false);
    });
    pageWatcher.observe(workPage);
    pageWatcher.observe(wellPage);
  }

  /* Trap the Back button (mobile) so it closes the top overlay instead of leaving
     the app. Closes the most-modal one first. */
  function closeTopOverlay() {
    if (!exerciseView.hidden) { exerciseView.hidden = true; return true; }
    if (!sleepView.hidden) { sleepView.hidden = true; return true; }
    if (!weatherModal.hidden) { weatherModal.hidden = true; return true; }
    if (!iconPicker.hidden) { iconPicker.hidden = true; return true; }
    if (!calendarModal.hidden) { calendarModal.hidden = true; return true; }
    if (!settingsModal.hidden) { settingsModal.hidden = true; return true; }
    if (!noteEditor.hidden) { closeNoteEditor(); return true; }
    if (!notesView.hidden) { closeNotes(); return true; }
    if (!focusOverlay.hidden) { closeFocus(); return true; }
    if (!detail.hidden) { closeDetail(); return true; }   // milestone steps back to its project
    if (!dayView.hidden) { closeDayView(); return true; }
    return false;
  }
  window.addEventListener("popstate", function () {
    if (closeTopOverlay()) history.pushState(null, "");   // re-arm for the next Back
  });
  history.pushState(null, "");   // arm the trap

  applyTheme(state.settings.theme);
  applyPalette(state.settings.palette);
  applyLanguage(state.settings.language);
  renderList("tasks");
  renderList("projects");
  renderHabits();
  renderEventCal();
  renderHabitsView();
  renderDailyTimeline();
  buildIconPicker();
  checkReminders();
  checkSleepReminder();
  setInterval(function () { checkReminders(); checkSleepReminder(); }, 30000);
  renderGreeting();
  initSky();
  buildRosace();
  applyDecorations();
  setWellOpen(false);
  requestAnimationFrame(function () { pagesEl.classList.add("is-live"); });
  setInterval(function () {
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
