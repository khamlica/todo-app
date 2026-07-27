(function () {
  "use strict";

  const STORAGE_KEY = "todoAppData";
  const state = loadState();

  /* Load saved data. Falls back to an empty state if nothing is stored
     or the JSON is corrupt, so a bad value can never break startup. */
  /* The block field used to be one decoration among others; it is part of the
     app now. Anyone who already had a saved state gets it turned on once, and
     from then on their own choice is kept. */
  function withField(list, alreadyOffered) {
    if (alreadyOffered || list.indexOf("field") !== -1) return list;
    return list.concat("field");
  }

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
        const project = projects[i];
        delete project.subtasks;       // projects moved from subtasks to milestones
        if (!project.icon) project.icon = "folder";
        if (!project.sky) project.sky = freeSkySpot(i);   // its place in the sky
        if (!project.journal) project.journal = [];
        if (!project.dream) project.dream = [];
        if (project.why == null) project.why = "";
        if (project.outcome == null) project.outcome = "";
        if (project.targetDate === undefined) project.targetDate = null;
        // the notes box left with the detail card; the text becomes a journal line
        // rather than staying in the data with nowhere to be read
        if (project.notes && project.notes.trim()) {
          project.journal.unshift({ id: project.id + "n", date: todayKey(), text: project.notes.trim() });
        }
        delete project.notes;
      }
      // constellations: a plain visual link between two stars
      const links = saved.links || [];
      for (let i = links.length - 1; i >= 0; i--) {
        if (!hasProject(projects, links[i].a) || !hasProject(projects, links[i].b)) links.splice(i, 1);
      }
      const tasks = saved.tasks || [];
      for (let i = 0; i < tasks.length; i++) {   // tasks can now belong to a project
        if (tasks[i].projectId === undefined) tasks[i].projectId = null;
      }
      const events = saved.events || [];
      for (let i = 0; i < events.length; i++) {   // events are past/pending now, not checkable
        delete events[i].done;
        if (events[i].important == null) events[i].important = false;
        if (!events[i].icon) events[i].icon = "calendar";
      }
      return {
        tasks: tasks,
        projects: projects,
        links: links,
        habits: habits,
        notes: saved.notes || [],
        events: events,
        sun: saved.sun || null,
        settings: {
          name: (saved.settings && saved.settings.name) || "",
          theme: (saved.settings && saved.settings.theme) || "auto",
          language: (saved.settings && saved.settings.language) || "fr",
          palette: (saved.settings && saved.settings.palette) || "aurora",
          decorations: withField((saved.settings && saved.settings.decorations) || [],
                                 saved.settings && saved.settings.fieldOn),
          fieldOn: true,   // once seen, the choice is the user's
          timeScrub: !!(saved.settings && saved.settings.timeScrub),
          themeEdits: (saved.settings && saved.settings.themeEdits) || {},
          paletteEdits: (saved.settings && saved.settings.paletteEdits) || {},
          themePalettes: (saved.settings && saved.settings.themePalettes) || {}
        }
      };
    } catch (err) {
      return { tasks: [], projects: [], links: [], habits: [], notes: [], events: [], sun: null, settings: { name: "", theme: "auto", language: "fr", palette: "aurora", decorations: ["field"], fieldOn: true, timeScrub: false, themeEdits: {}, paletteEdits: {}, themePalettes: {} } };
    }
  }

  function hasProject(projects, id) {
    for (let i = 0; i < projects.length; i++) {
      if (projects[i].id === id) return true;
    }
    return false;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /* Where a project lands in the sky when it has never been placed. A golden-angle
     spiral keeps successive stars from piling onto the same spot, and the whole
     thing stays deterministic so a reload doesn't reshuffle the sky. */
  function freeSkySpot(index) {
    const angle = index * 2.39996;
    const radius = 9 + Math.sqrt(index + 0.7) * 12;
    return {
      x: Math.max(9, Math.min(91, 50 + Math.cos(angle) * radius)),
      y: Math.max(11, Math.min(70, 40 + Math.sin(angle) * radius * 0.66))
    };
  }

  /* All interface strings, one block per language. */
  const translations = {
    fr: {
      greetingPrefix: "Bonjour",
      greetingSuffix: " !",
      welcomeQuestion: "Que faites-vous aujourd'hui ?",
      enterAria: "Entrer dans l'application",
      settingsAria: "Paramètres",
      settingsTitle: "Paramètres",
      tabSystem: "Système",
      tabCustom: "Personnalisation",
      tasksTitle: "Vos tâches",
      todayTitle: "Aujourd'hui",
      backToToday: "Revenir à aujourd'hui",
      newEventName: "Nouvel événement",
      projectsTitle: "Vos projets",
      addTaskTitle: "Ajouter une tâche",
      newTaskName: "Nouvelle tâche",
      quickPlaceholder: "Relire le rapport demain 18h !",
      quickEventPlaceholder: "Réunion équipe vendredi 14h !",
      groupLate: "En retard",
      groupToday: "Aujourd'hui",
      groupSoon: "À venir",
      groupNone: "Sans date",
      groupDone: "Terminées",
      addAria: "Ajouter",
      addProjectAria: "Nouveau projet",
      deleteAria: "Supprimer",
      doneAria: "Marquer comme faite",
      emptyList: "Rien pour l'instant.",
      closeAria: "Fermer",
      nameLabel: "Votre prénom",
      namePlaceholder: "Ex. Aymane",
      paintAria: "Couleurs",
      paintTitle: "Couleurs",
      paintThemeLabel: "Thème à modifier",
      paintReset: "Réinitialiser ce thème",
      paintResetOne: "Réinitialiser",
      paintBase: "Base",
      paintInk: "Encre",
      paintSignal: "Signal",
      paintSky: "Ciel",
      slotBg: "Fond",
      slotSurface: "Surface",
      slotLine: "Trait",
      slotText: "Texte",
      slotMuted: "Discret",
      slotAccent: "Accent",
      slotDanger: "Alerte",
      slotSig: "Signature",
      slotSky1: "Horizon",
      slotSky2: "Milieu",
      slotSky3: "Zénith",
      slotStep: "Palier",
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
      decorField: "Champ",
      enterHint: "Touchez pour entrer",
      paintLabel: "Couleurs",
      paintOpen: "Ouvrir l'atelier",
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
      switchSpaceAria: "Changer d'espace",
      scrubLabel: "Faire défiler le temps",
      scrubHint: "Tirez la barre du temps pour voyager dans la journée",
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
      paletteCustom: "Du thème",
      editAria: "Modifier",
      editTitle: "Modifier",
      editNameLabel: "Nom",
      editIconLabel: "Icône",
      editDateNone: "Aucune date",
      notesLabel: "Notes",
      subtasksLabel: "Sous-tâches",
      milestonesLabel: "Jalons",
      pinLabel: "Épingler",
      importantLabel: "Important",
      backAria: "Retour",
      notesPlaceholder: "Ajouter des notes…",
      addSubtaskPlaceholder: "Ajouter une sous-tâche…",
      milestonePlaceholder: "Jalon",
      milestoneAdd: "Ajouter un jalon",
      skyAria: "Le ciel des projets",
      skyTitle: "Le ciel",
      skyEmpty: "Le ciel est vide. Allumez une première étoile.",
      skyFree: "Libre",
      skyAligned: "Rangé",
      skyModeAria: "Ranger le ciel ou le libérer",
      skyDormant: "En sommeil",
      skyNear: "Bientôt",
      skyFar: "Un jour",
      skyAmbition: "Ambition",
      skyOpenAria: "Ouvrir le projet",
      skyLinkAria: "Relier deux projets",
      skyLinkHint: "Choisissez deux étoiles à relier.",
      capLabel: "Le cap",
      whyPlaceholder: "Pourquoi ce projet ?",
      outcomePlaceholder: "À quoi ça ressemble, une fois fini ?",
      horizonLabel: "Horizon",
      horizonNone: "Sans date",
      stepsLabel: "Prochaines étapes",
      stepAdd: "Une étape concrète…",
      stepsEmpty: "Aucune étape en cours.",
      dreamLabel: "Mur de rêve",
      dreamAdd: "Carte",
      dreamPlaceholder: "Une idée, une référence, une envie…",
      journalLabel: "Journal",
      journalAdd: "Noter une avancée, une idée…",
      journalEmpty: "Rien de consigné pour l'instant.",
      promoteStep: "En faire une étape",
      promotedLabel: "Devenu une étape",
      stepCreated: "Étape ajoutée.",
      milestoneTarget: "Date visée",
      lateLabel: "en retard",
      dormantFor: "sans nouvelles depuis",
      daysShort: "j",
      addEventPlaceholder: "Ajouter un événement…",
      timeLabel: "Heure",
      eventStatusPending: "En attente",
      eventStatusPast: "Passé",
      importantAria: "Marquer comme important",
      rescheduleLabel: "Replanifier",
      completeLabel: "Compléter",
      reopenLabel: "Rouvrir",
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
      welcomeQuestion: "What is happening today?",
      enterAria: "Enter the app",
      settingsAria: "Settings",
      settingsTitle: "Settings",
      tabSystem: "System",
      tabCustom: "Customization",
      tasksTitle: "Your tasks",
      todayTitle: "Today",
      backToToday: "Back to today",
      newEventName: "New event",
      projectsTitle: "Your projects",
      addTaskTitle: "Add a task",
      newTaskName: "New task",
      quickPlaceholder: "Read the report tomorrow 6pm !",
      quickEventPlaceholder: "Team meeting friday 2pm !",
      groupLate: "Overdue",
      groupToday: "Today",
      groupSoon: "Upcoming",
      groupNone: "No date",
      groupDone: "Done",
      addAria: "Add",
      addProjectAria: "New project",
      deleteAria: "Delete",
      doneAria: "Mark as done",
      emptyList: "Nothing yet.",
      closeAria: "Close",
      nameLabel: "Your first name",
      namePlaceholder: "e.g. Aymane",
      paintAria: "Colours",
      paintTitle: "Colours",
      paintThemeLabel: "Theme to edit",
      paintReset: "Reset this theme",
      paintResetOne: "Reset",
      paintBase: "Base",
      paintInk: "Ink",
      paintSignal: "Signal",
      paintSky: "Sky",
      slotBg: "Background",
      slotSurface: "Surface",
      slotLine: "Line",
      slotText: "Text",
      slotMuted: "Quiet",
      slotAccent: "Accent",
      slotDanger: "Alert",
      slotSig: "Signature",
      slotSky1: "Horizon",
      slotSky2: "Middle",
      slotSky3: "Zenith",
      slotStep: "Step",
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
      decorField: "Field",
      enterHint: "Tap to enter",
      paintLabel: "Colours",
      paintOpen: "Open the workshop",
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
      switchSpaceAria: "Switch space",
      scrubLabel: "Scrub the timeline",
      scrubHint: "Drag the time bar to travel through the day",
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
      paletteCustom: "Theme\u2019s own",
      editAria: "Edit",
      editTitle: "Edit",
      editNameLabel: "Name",
      editIconLabel: "Icon",
      editDateNone: "No date",
      notesLabel: "Notes",
      subtasksLabel: "Subtasks",
      milestonesLabel: "Milestones",
      pinLabel: "Pin",
      importantLabel: "Important",
      backAria: "Back",
      notesPlaceholder: "Add notes…",
      addSubtaskPlaceholder: "Add a subtask…",
      milestonePlaceholder: "Milestone",
      milestoneAdd: "Add a milestone",
      skyAria: "The project sky",
      skyTitle: "The sky",
      skyEmpty: "The sky is empty. Light a first star.",
      skyFree: "Free",
      skyAligned: "Aligned",
      skyModeAria: "Align the sky or set it free",
      skyDormant: "Dormant",
      skyNear: "Soon",
      skyFar: "Someday",
      skyAmbition: "Ambition",
      skyOpenAria: "Open the project",
      skyLinkAria: "Link two projects",
      skyLinkHint: "Pick two stars to link.",
      capLabel: "The heading",
      whyPlaceholder: "Why this project?",
      outcomePlaceholder: "What does it look like once done?",
      horizonLabel: "Horizon",
      horizonNone: "No date",
      stepsLabel: "Next steps",
      stepAdd: "One concrete step…",
      stepsEmpty: "No step in progress.",
      dreamLabel: "Dream wall",
      dreamAdd: "Card",
      dreamPlaceholder: "An idea, a reference, a want…",
      journalLabel: "Journal",
      journalAdd: "Log a move, an idea…",
      journalEmpty: "Nothing logged yet.",
      promoteStep: "Make it a step",
      promotedLabel: "Became a step",
      stepCreated: "Step added.",
      milestoneTarget: "Target date",
      lateLabel: "late",
      dormantFor: "nothing for",
      daysShort: "d",
      addEventPlaceholder: "Add an event…",
      timeLabel: "Time",
      eventStatusPending: "Pending",
      eventStatusPast: "Past",
      importantAria: "Mark as important",
      rescheduleLabel: "Reschedule",
      completeLabel: "Complete",
      reopenLabel: "Reopen",
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
    const h = new Date(refTime()).getHours();
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
    applyThemeEdits(effective);
    applyPaletteVars();   // a custom palette belongs to the theme, so it follows

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
    applyPaletteVars();
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

  const dayLine = document.querySelector(".day-line");
  const welcomeSlot = document.getElementById("welcomeSlot");
  const APP_ENTER_MS = 620;
  const WELCOME_RULE_SCALE = 1.35;   // must match .welcome__slot .day-line

  /* The day rule spends the welcome screen in the middle of the page, blown up.
     Entering does not swap one for another: the very same element is moved back
     into the app and flown from where it was to where it lands, the way the
     editor card travels between rows. */
  if (dayLine && welcomeSlot) welcomeSlot.appendChild(dayLine);

  function enterApp(event) {
    if (!welcomeScreen || welcomeScreen.dataset.gone) return;
    welcomeScreen.dataset.gone = "1";
    // the light runs out from wherever the finger landed
    startFieldFlash(event ? event.clientX : innerWidth / 2,
                    event ? event.clientY : innerHeight / 2);

    const from = dayLine ? dayLine.getBoundingClientRect() : null;
    appScreen.hidden = false;
    if (dayLine) appScreen.insertBefore(dayLine, appScreen.firstChild);
    // the rail was measured while the app was still display:none, so its height
    // was zero; now that it has a size, take it again
    syncPagesHeight(false);
    requestAnimationFrame(function () { syncPagesHeight(false); });

    if (from && dayLine) {
      const to = dayLine.getBoundingClientRect();
      const scale = WELCOME_RULE_SCALE;
      dayLine.style.transformOrigin = "50% 50%";
      dayLine.style.transition = "none";
      dayLine.style.transform = "translate(" + (from.left - to.left) + "px,"
        + (from.top - to.top) + "px) scale(" + scale + ")";
      dayLine.offsetWidth;                       // commit before releasing
      dayLine.style.transition = "transform " + APP_ENTER_MS + "ms cubic-bezier(.22,.8,.25,1)";
      dayLine.style.transform = "";
      setTimeout(function () {
        dayLine.style.transition = "";
        dayLine.style.transformOrigin = "";
      }, APP_ENTER_MS);
    }

    welcomeScreen.classList.add("is-leaving");
    setTimeout(function () { welcomeScreen.style.display = "none"; }, 560);
    setTimeout(function () { setFieldWelcome(false); }, flashSpan + 60);   // let the light finish
    ensureSunData();   // ask for location only once the app is entered
  }

  // no target to aim at: the whole threshold is the door
  welcomeScreen.addEventListener("click", enterApp);


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

  /* COLOUR WORKSHOP — a theme is nine source colours plus an optional sky, and
     everything else in the stylesheet is derived from them. Editing one writes
     the same custom property inline on <html>, so the whole interface follows
     without a single recalculation here. */
  const PAINT_THEMES = ["light", "dark", "rose", "dawn", "day", "dusk", "night", "rain"];
  const PAINT_GROUPS = [
    { label: "paintBase", slots: [["--c-bg", "slotBg"], ["--c-surface", "slotSurface"], ["--c-line", "slotLine"]] },
    { label: "paintInk", slots: [["--c-text", "slotText"], ["--c-muted", "slotMuted"]] },
    { label: "paintSignal", slots: [["--c-accent", "slotAccent"], ["--c-danger", "slotDanger"], ["--c-sig", "slotSig"]] },
    { label: "paintSky", slots: [["--c-sky-1", "slotSky1"], ["--c-sky-2", "slotSky2"], ["--c-sky-3", "slotSky3"]] }
  ];
  const IMP_SLOTS = ["--c-imp-1", "--c-imp-2", "--c-imp-3", "--c-imp-4", "--c-imp-5"];
  const ALL_SLOTS = PAINT_GROUPS.reduce(function (list, group) {
    for (let i = 0; i < group.slots.length; i++) list.push(group.slots[i][0]);
    return list;
  }, []);

  const paintModal = document.getElementById("paint");
  let paintTheme = "night";   // the theme being edited, not necessarily the one in use

  /* the value a slot has once every edit is taken into account */
  function slotValue(themeName, slot) {
    const edits = state.settings.themeEdits[themeName];
    if (edits && edits[slot]) return edits[slot];
    return readThemeSlot(themeName, slot);
  }

  /* Read a slot straight out of the stylesheet through a hidden probe. The probe
     sits inside a host that resets every slot to `initial`, otherwise it would
     inherit them from <html> and a theme with no sky would report the sky of
     whatever theme happens to be on screen. */
  const slotProbes = {};
  let probeHost = null;
  function probeFor(attribute, value) {
    const key = attribute + "=" + value;
    if (slotProbes[key]) return slotProbes[key];
    if (!probeHost) {
      probeHost = document.createElement("div");
      probeHost.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;"
        + ALL_SLOTS.concat(IMP_SLOTS).map(function (slot) { return slot + ":initial"; }).join(";");
      document.body.appendChild(probeHost);
    }
    const probe = document.createElement("div");
    probe.setAttribute(attribute, value);
    probeHost.appendChild(probe);
    slotProbes[key] = probe;
    return probe;
  }
  function readThemeSlot(themeName, slot) {
    return getComputedStyle(probeFor("data-theme", themeName)).getPropertyValue(slot).trim();
  }
  function readPaletteSlot(paletteName, slot) {
    return getComputedStyle(probeFor("data-palette", paletteName)).getPropertyValue(slot).trim();
  }

  /* push the edits for whichever theme is on screen; inline props beat the
     stylesheet, so only the active theme's edits may be applied at a time */
  function applyThemeEdits(themeName) {
    const root = document.documentElement.style;
    for (let i = 0; i < ALL_SLOTS.length; i++) root.removeProperty(ALL_SLOTS[i]);
    const edits = state.settings.themeEdits[themeName];
    if (!edits) return;
    for (const slot in edits) root.setProperty(slot, edits[slot]);
  }

  /* Where the five stops in force are stored. The three presets are shared, so
     their touch-ups live under the palette name. "custom" belongs to the theme
     on screen instead — one bespoke palette per theme. */
  function impStore() {
    if (state.settings.palette !== "custom") {
      return state.settings.paletteEdits[state.settings.palette] || null;
    }
    return state.settings.themePalettes[currentThemeName()] || null;
  }

  function applyPaletteVars() {
    const root = document.documentElement.style;
    for (let i = 0; i < IMP_SLOTS.length; i++) root.removeProperty(IMP_SLOTS[i]);
    const values = impStore();
    if (!values) return;
    for (const slot in values) root.setProperty(slot, values[slot]);
  }

  /* hex is all <input type="color"> understands; computed values may be rgb() */
  function toHex(value) {
    if (!value) return "#000000";
    if (value.charAt(0) === "#") {
      return value.length === 4
        ? "#" + value[1] + value[1] + value[2] + value[2] + value[3] + value[3]
        : value.slice(0, 7);
    }
    const nums = value.match(/[\d.]+/g);
    if (!nums) return "#000000";
    let out = "#";
    for (let i = 0; i < 3; i++) out += Math.round(parseFloat(nums[i])).toString(16).padStart(2, "0");
    return out;
  }

  function createSwatch(labelKey, value, onPick) {
    const wrap = document.createElement("label");
    wrap.className = "swatch";
    const input = document.createElement("input");
    input.type = "color";
    input.value = toHex(value);
    input.addEventListener("input", function () { onPick(input.value); });
    const text = document.createElement("span");
    text.textContent = translate(labelKey);
    wrap.append(input, text);
    return wrap;
  }

  function renderPaint() {
    const themeList = document.getElementById("paintThemes");
    themeList.innerHTML = "";
    for (let i = 0; i < PAINT_THEMES.length; i++) {
      const name = PAINT_THEMES[i];
      const button = document.createElement("button");
      button.type = "button";
      button.className = name === paintTheme ? "theme is-active" : "theme";
      button.textContent = translate("theme" + name.charAt(0).toUpperCase() + name.slice(1));
      button.addEventListener("click", function () {
        paintTheme = name;
        state.settings.theme = name;   // edit what you can see
        applyTheme(name);
        renderPaint();
        saveState();
      });
      themeList.appendChild(button);
    }

    const box = document.getElementById("paintSlots");
    box.innerHTML = "";
    for (let g = 0; g < PAINT_GROUPS.length; g++) {
      const group = PAINT_GROUPS[g];
      const section = document.createElement("div");
      section.className = "paint__group";
      const label = document.createElement("span");
      label.className = "paint__group-label";
      label.textContent = translate(group.label);
      const row = document.createElement("div");
      row.className = "swatches";
      for (let i = 0; i < group.slots.length; i++) {
        const slot = group.slots[i][0];
        row.appendChild(createSwatch(group.slots[i][1], slotValue(paintTheme, slot), function (hex) {
          editSlot(paintTheme, slot, hex);
        }));
      }
      section.append(label, row);
      box.appendChild(section);
    }

    const palettes = document.getElementById("paintPalettes");
    palettes.innerHTML = "";
    const names = ["aurora", "meadow", "sunset", "custom"];
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const button = document.createElement("button");
      button.type = "button";
      button.className = name === state.settings.palette ? "palette is-active" : "palette";
      button.dataset.palette = name;
      button.innerHTML = '<span class="palette__sw"></span><span>'
        + translate("palette" + name.charAt(0).toUpperCase() + name.slice(1)) + "</span>";
      // the swatch bar previews the stops the button stands for
      if (name === "custom") {
        const own = state.settings.themePalettes[currentThemeName()];
        for (let k = 0; k < IMP_SLOTS.length; k++) {
          if (own && own[IMP_SLOTS[k]]) button.style.setProperty(IMP_SLOTS[k], own[IMP_SLOTS[k]]);
        }
      }
      button.addEventListener("click", function () {
        // picking the bespoke palette for the first time copies what is on
        // screen, so there is something to work from rather than a blank slate
        if (name === "custom" && !state.settings.themePalettes[currentThemeName()]) {
          const seed = {};
          for (let k = 0; k < IMP_SLOTS.length; k++) seed[IMP_SLOTS[k]] = toHex(resolvedImp(IMP_SLOTS[k]));
          state.settings.themePalettes[currentThemeName()] = seed;
        }
        state.settings.palette = name;
        applyPalette(name);
        renderPaint();
        saveState();
      });
      palettes.appendChild(button);
    }

    const imp = document.getElementById("paintImp");
    imp.innerHTML = "";
    for (let i = 0; i < IMP_SLOTS.length; i++) {
      const slot = IMP_SLOTS[i];
      imp.appendChild(createSwatch("slotStep", resolvedImp(slot), function (hex) {
        editImp(slot, hex);
      }));
    }
  }

  /* the stop as it stands: the stored value if there is one, else the preset */
  function resolvedImp(slot) {
    const stored = impStore();
    if (stored && stored[slot]) return stored[slot];
    const base = state.settings.palette === "custom" ? "aurora" : state.settings.palette;
    return readPaletteSlot(base, slot);
  }

  function editImp(slot, hex) {
    const settings = state.settings;
    let store;
    if (settings.palette === "custom") {
      const theme = currentThemeName();
      store = settings.themePalettes[theme] || (settings.themePalettes[theme] = {});
    } else {
      store = settings.paletteEdits[settings.palette] || (settings.paletteEdits[settings.palette] = {});
    }
    store[slot] = hex;
    applyPaletteVars();
    saveState();
  }

  function editSlot(themeName, slot, hex) {
    if (!state.settings.themeEdits[themeName]) state.settings.themeEdits[themeName] = {};
    state.settings.themeEdits[themeName][slot] = hex;
    applyThemeEdits(currentThemeName());
    saveState();
  }

  /* which theme is actually on screen right now */
  function currentThemeName() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }

  document.getElementById("paintBtn").addEventListener("click", function () {
    paintTheme = currentThemeName();
    renderPaint();
    paintModal.hidden = false;
  });
  const paintCloseButtons = paintModal.querySelectorAll("[data-close]");
  for (let i = 0; i < paintCloseButtons.length; i++) {
    paintCloseButtons[i].addEventListener("click", function () { paintModal.hidden = true; });
  }
  document.getElementById("paintReset").addEventListener("click", function () {
    delete state.settings.themeEdits[paintTheme];
    applyThemeEdits(currentThemeName());
    renderPaint();
    saveState();
  });
  document.getElementById("paintPaletteReset").addEventListener("click", function () {
    if (state.settings.palette === "custom") delete state.settings.themePalettes[currentThemeName()];
    else delete state.settings.paletteEdits[state.settings.palette];
    applyPaletteVars();
    renderPaint();
    saveState();
  });

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

  /* THE BLOCK FIELD — a grid of small squares that answers the pointer: a well
     that follows it, and a ring that travels outwards from every click. It
     invents no colour of its own; #field carries the theme's accent and the
     script only reads back what the browser resolved, so a palette change
     carries over on its own. The lattice is always drawn and never moves; what
     answers the pointer is the cells filling in, which is what keeps it reading
     as lit pixels rather than as cloth. */
  const fieldCanvas = document.getElementById("field");
  const FIELD_STEP = 25;      // side of a cell
  const REST_ALPHA = .025;    // the bare lattice: present, barely
  const SHADE_ALPHA = .34;    // how dark a cell goes under a click
  const SHADE_CHROMA = 2.2;   // the shade keeps its hue instead of going grey
  const SHADE_MIX = .62;      // and only loses this much of its light
  /* The pointer is ambient, so it is held well under a click: at full strength
     it stopped being a grid answering and became an effect of its own. */
  const WELL_WEIGHT = .38;
  const WELL_RADIUS = 100;    // a handful of cells around the pointer, no more
  const TRAIL_MS = 260;       // how far back the smear still reaches
  const TRAIL_STEP = 7;       // px between samples, so a slow drag is not a cluster
  const TRAIL_MAX = 26;       // samples kept at most, however fast the hand is
  const WELL_REST = .55;      // the hollow at a standstill, against a full one
  const WELL_SQUASH = .48;    // how far it is pressed flat along its own path
  const SPEED_FULL = 1400;    // px per second counted as full pelt
  const SPEED_COOL = 220;     // ms for a stopped pointer to read as stopped
  /* The sun on the rule is a real light on the page, so the field answers it:
     the cells around it lift instead of sinking, in the sun's own colour. It is
     the one thing here that gives light rather than taking it — and since that
     colour is sampled off the sky ramp, the field warms at dusk and turns to
     moonlight at night on its own. */
  /* THE FLASH — entering sends a band of light out across the grid from wherever
     it was clicked. It rides over the field rather than replacing it: the cells
     light up in turn, the ruling stays where it is. */
  const FLASH_SPEED = 1900;   // px per second the front travels
  const FLASH_WIDTH = 130;    // px, how broad the lit band is
  const FLASH_ALPHA = .5;
  /* THE LAYOUT'S WEIGHT — a panel presses the grid under it as deep as it is
     opaque: a solid card sinks the cells, a barely-tinted one grazes them. The
     rects are taken fresh on every frame the field draws, so a scroll drags the
     hollows along with the panels that made them, without a line of extra code. */
  const PANEL_SELECTOR = ".item--task, .item--project, .day-event, .habit, .hcard,"
    + " .quick__field, .ecal, .modal__card, .note-card";
  const PANEL_DEPTH = .55;    // how much of a panel's own opacity is dug
  let panels = [];
  let panelsMoving = false;
  let flashAt = 0, flashX = 0, flashY = 0, flashSpan = 0;

  const SUN_ALPHA = .15;
  const SUN_RADIUS = 120;
  // a click sinks the one cell it lands on, and nothing around it
  const PRESS_DECAY = 220;    // ms the press takes to shrink by e
  const PRESS_LIFE = 760;     // ms before a press is spent

  let fieldCtx = null;
  let fieldW = 0, fieldH = 0, fieldCols = 0, fieldRows = 0;
  let latticePath = null;
  let fieldInk = "rgb(255,255,255)";
  let rowShade = [];
  let shadeLift = 1;
  let inkReadAt = 0;
  const presses = [];
  const trail = [];
  let sunSpot = null;
  let fieldBoost = 1;
  let pointerX = -9999, pointerY = -9999;
  let wellTarget = 0, wellNow = 0;
  let fieldFrame = null, fieldLast = 0, pointerMoved = false;
  /* Anything that wakes the field keeps it drawing for a moment afterwards. A
     fold takes .42s to play out and a rail .45s, and neither says a word while
     it moves: without this tail the hollows would be left behind by the panels
     that cast them. */
  const FOLLOW_MS = 700;
  let liveUntil = 0;

  function readColour(text) {
    const raw = text.trim();
    if (raw.charAt(0) !== "#") {
      const parts = raw.match(/[\d.]+/g) || ["0", "0", "0"];
      return [+parts[0], +parts[1], +parts[2]];
    }
    const hex = raw.length < 7
      ? raw[1] + raw[1] + raw[2] + raw[2] + raw[3] + raw[3]
      : raw.slice(1, 7);
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16),
            parseInt(hex.slice(4, 6), 16)];
  }

  /* The colour a cell darkens to, worked out row by row. It follows the sky
     that is actually on screen: the raw gradient, which runs from the horizon
     at the bottom to the zenith at the top, then the veil that settles it into
     the page colour further down. So the same click comes out warm under a
     dusk horizon and cold under a night zenith, instead of one flat tint. */
  function buildRowShades() {
    const css = getComputedStyle(document.documentElement);
    const horizon = readColour(css.getPropertyValue("--c-sky-1"));
    const middle = readColour(css.getPropertyValue("--c-sky-2"));
    const zenith = readColour(css.getPropertyValue("--c-sky-3"));
    const page = readColour(css.getPropertyValue("--c-bg"));
    const mid = (parseFloat(css.getPropertyValue("--c-sky-mid")) || 45) / 100;
    /* A dark ground leaves almost nothing to take away: the same opacity that
       reads clearly on a pale theme moves two levels out of 255 on the night
       one. So the darker the page, the harder the field presses. */
    const pageLum = (page[0] * .2126 + page[1] * .7152 + page[2] * .0722) / 255;
    shadeLift = 1 + (1 - pageLum) * 2.2;

    rowShade = [];
    for (let r = 0; r <= fieldRows; r++) {
      const down = fieldRows ? r / fieldRows : 0;   // 0 at the top of the page
      const up = 1 - down;                          // the sky gradient runs upwards
      const sky = up <= mid
        ? mixRgb(horizon, middle, mid ? up / mid : 0)
        : mixRgb(middle, zenith, (up - mid) / (1 - mid));
      // the veil: nothing at the top, .78 of the page colour at 52%, all of it below
      const veil = down <= .52 ? down / .52 * .78 : .78 + (down - .52) / .48 * .22;
      /* Scaling the whole colour down keeps the hue in proportion but flattens
         the chroma, and a near-white day sky then shades grey. So the channels
         are pushed away from their own luminance first, and only then does the
         light come off: the shadow of a blue sky stays blue. */
      const seen = mixRgb(sky, page, veil);
      const lum = seen[0] * .2126 + seen[1] * .7152 + seen[2] * .0722;
      const tint = [];
      for (let i = 0; i < 3; i++) {
        const wide = lum + (seen[i] - lum) * SHADE_CHROMA;
        tint.push(Math.round(Math.max(0, Math.min(255, wide)) * SHADE_MIX));
      }
      rowShade.push(rgbText(tint));
    }
  }

  function fieldResize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    fieldW = window.innerWidth;
    fieldH = window.innerHeight;
    fieldCanvas.width = Math.round(fieldW * dpr);
    fieldCanvas.height = Math.round(fieldH * dpr);
    fieldCtx = fieldCanvas.getContext("2d");
    fieldCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fieldCols = Math.ceil(fieldW / FIELD_STEP);
    fieldRows = Math.ceil(fieldH / FIELD_STEP);

    // the lattice as one path: a single stroke per frame, whatever the size.
    // the half pixel keeps the lines on the pixel grid instead of straddling it
    latticePath = new Path2D();
    for (let c = 0; c <= fieldCols; c++) {
      const x = Math.round(c * FIELD_STEP) + .5;
      latticePath.moveTo(x, 0);
      latticePath.lineTo(x, fieldH);
    }
    for (let r = 0; r <= fieldRows; r++) {
      const y = Math.round(r * FIELD_STEP) + .5;
      latticePath.moveTo(0, y);
      latticePath.lineTo(fieldW, y);
    }
    buildRowShades();
  }

  /* energy from the well and from every live ring, gathered per cell. Only the
     cells a source can actually reach are visited, so a lone click near the
     edge does not cost a full sweep of the grid. */
  /* where the sun sits on screen, and what colour it is burning right now */
  function readSun() {
    const cursor = document.getElementById("dtlCursor");
    if (!cursor || cursor.hidden) { sunSpot = null; return; }
    const box = cursor.getBoundingClientRect();
    if (!box.width || box.bottom < -SUN_RADIUS || box.top > fieldH + SUN_RADIUS) {
      sunSpot = null;
      return;
    }
    sunSpot = {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
      ink: getComputedStyle(cursor).getPropertyValue("--sun-core").trim() || "#ffd67a"
    };
  }

  /* the alpha a panel paints with, whatever notation the theme resolved to */
  function alphaOf(colour) {
    const parts = colour.match(/[\d.]+/g);
    if (!parts) return 0;
    return parts.length > 3 ? +parts[3] : 1;
  }

  function readPanels() {
    const found = document.querySelectorAll(PANEL_SELECTOR);
    panels = [];
    for (let i = 0; i < found.length; i++) {
      const depth = alphaOf(getComputedStyle(found[i]).backgroundColor);
      if (depth > .02) panels.push({ el: found[i], depth: depth, top: NaN, left: NaN });
    }
  }

  function gatherEnergy(now) {
    const lit = new Map();
    const add = function (col, row, amount) {
      if (col < 0 || row < 0 || col >= fieldCols || row >= fieldRows) return;
      const key = row * fieldCols + col;
      lit.set(key, (lit.get(key) || 0) + amount);
    };
    // the trail keeps the strongest pass over a cell rather than piling up:
    // where the path crosses itself it must not burn brighter than elsewhere
    const raise = function (col, row, amount) {
      if (col < 0 || row < 0 || col >= fieldCols || row >= fieldRows) return;
      const key = row * fieldCols + col;
      const had = lit.get(key) || 0;
      if (amount > had) lit.set(key, amount);
    };

    /* The shade is dragged behind the pointer: the head sits under it, the
       places it came from hold on for a moment, narrower and fainter. Speed
       does two things to each hollow — it widens it, and it presses it flat
       along the heading it was made on, so the samples stop overlapping into a
       sausage and the path reads as a drawn line. At a standstill nothing is
       squashed and the whole thing draws back to a small circle. */
    const head = trail[trail.length - 1];
    if (wellNow > .002) {
      for (let s = -1; s < trail.length; s++) {
        const spot = s < 0 ? head : trail[s];
        const age = s < 0 ? 0 : now - spot.at;
        if (age > TRAIL_MS) continue;
        const life = 1 - age / TRAIL_MS;
        const x = s < 0 ? pointerX : spot.x;
        const y = s < 0 ? pointerY : spot.y;
        // the head cools down as the pointer sits still, the tail keeps its own
        let rush = spot ? spot.speed / SPEED_FULL : 0;
        if (s < 0 && head) rush *= Math.max(0, 1 - (now - head.at) / SPEED_COOL);
        if (rush > 1) rush = 1;
        else if (!(rush > 0)) rush = 0;

        const radius = WELL_RADIUS * (WELL_REST + (1 - WELL_REST) * rush) * (.55 + .45 * life);
        const squash = 1 - WELL_SQUASH * rush;
        const weight = wellNow * WELL_WEIGHT * life;
        const heading = spot && (spot.ux || spot.uy);
        const reach = radius * 1.6;
        const c0 = Math.floor((x - reach) / FIELD_STEP);
        const c1 = Math.ceil((x + reach) / FIELD_STEP);
        const r0 = Math.floor((y - reach) / FIELD_STEP);
        const r1 = Math.ceil((y + reach) / FIELD_STEP);
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const dx = (c + .5) * FIELD_STEP - x;   // the cell's middle
            const dy = (r + .5) * FIELD_STEP - y;
            let t;
            if (heading) {
              const along = (dx * spot.ux + dy * spot.uy) / squash;
              const across = dy * spot.ux - dx * spot.uy;
              t = (along * along + across * across) / (radius * radius);
            } else {
              t = (dx * dx + dy * dy) / (radius * radius);
            }
            if (t > 4) continue;
            raise(c, r, Math.exp(-t) * weight);
          }
        }
      }
    }

    /* A panel can move without a scroll event to announce it — a row unfolding,
       the rail sliding, a list rebuilt. So the field watches the rects it just
       drew: as long as one of them is still moving it keeps drawing, and the
       hollows stay under the panels that cast them. */
    let stalePanels = false;
    panelsMoving = false;
    for (let i = 0; i < panels.length; i++) {
      if (!panels[i].el.isConnected) { stalePanels = true; continue; }
      const box = panels[i].el.getBoundingClientRect();
      if (box.top !== panels[i].top || box.left !== panels[i].left) {
        panelsMoving = true;
        panels[i].top = box.top;
        panels[i].left = box.left;
      }
      if (!box.width || box.bottom < 0 || box.top > fieldH) continue;
      const depth = panels[i].depth * PANEL_DEPTH;
      const c0 = Math.floor(box.left / FIELD_STEP);
      const c1 = Math.ceil(box.right / FIELD_STEP);
      const r0 = Math.floor(box.top / FIELD_STEP);
      const r1 = Math.ceil(box.bottom / FIELD_STEP);
      for (let r = r0; r <= r1; r++) {
        const cy = (r + .5) * FIELD_STEP;
        // half a cell of give on each edge, so the hollow has a lip, not a step
        const iy = Math.min(1, Math.max(0, Math.min(cy - box.top, box.bottom - cy) / FIELD_STEP + .5));
        if (!iy) continue;
        for (let c = c0; c <= c1; c++) {
          const cx = (c + .5) * FIELD_STEP;
          const ix = Math.min(1, Math.max(0, Math.min(cx - box.left, box.right - cx) / FIELD_STEP + .5));
          if (ix) add(c, r, depth * ix * iy);
        }
      }
    }

    if (stalePanels) readPanels();   // a list was rebuilt under us

    // the one cell that was clicked goes down and eases back up, nothing else
    for (let i = 0; i < presses.length; i++) {
      const press = presses[i];
      const down = Math.exp(-(now - press.born) / PRESS_DECAY);
      add(Math.floor(press.x / FIELD_STEP), Math.floor(press.y / FIELD_STEP), down);
    }
    return lit;
  }

  /* the cells the sun reaches, gathered the same way the shade is */
  function gatherSun() {
    const glow = new Map();
    if (!sunSpot) return glow;
    const reach = SUN_RADIUS * 1.5;
    const c0 = Math.floor((sunSpot.x - reach) / FIELD_STEP);
    const c1 = Math.ceil((sunSpot.x + reach) / FIELD_STEP);
    const r0 = Math.floor((sunSpot.y - reach) / FIELD_STEP);
    const r1 = Math.ceil((sunSpot.y + reach) / FIELD_STEP);
    for (let r = r0; r <= r1; r++) {
      if (r < 0 || r >= fieldRows) continue;
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || c >= fieldCols) continue;
        const dx = (c + .5) * FIELD_STEP - sunSpot.x;
        const dy = (r + .5) * FIELD_STEP - sunSpot.y;
        const t = (dx * dx + dy * dy) / (SUN_RADIUS * SUN_RADIUS);
        if (t > 4) continue;
        glow.set(r * fieldCols + c, Math.exp(-t));
      }
    }
    return glow;
  }

  function fieldDraw(now) {
    const ctx = fieldCtx;
    ctx.clearRect(0, 0, fieldW, fieldH);
    if (now - inkReadAt > 800) {           // follows a theme or palette change
      fieldInk = getComputedStyle(fieldCanvas).color;
      buildRowShades();
      readPanels();          // lists get rebuilt, themes change their veil
      inkReadAt = now;
    }
    /* The sun first, then what the pointer takes away, then the lattice over
       both so the ruling stays legible. The pointer and a click only ever sink
       a square — the sun is the one source allowed to lift one. */
    readSun();
    const glow = gatherSun();
    glow.forEach(function (light, key) {
      if (light < .02) return;
      const col = key % fieldCols;
      const row = (key - col) / fieldCols;
      ctx.fillStyle = sunSpot.ink;
      ctx.globalAlpha = SUN_ALPHA * fieldBoost * light;
      ctx.fillRect(col * FIELD_STEP, row * FIELD_STEP, FIELD_STEP, FIELD_STEP);
    });

    const lit = gatherEnergy(now);
    lit.forEach(function (energy, key) {
      if (energy < .02) return;
      const col = key % fieldCols;
      const row = (key - col) / fieldCols;
      ctx.fillStyle = rowShade[row] || "#000";
      ctx.globalAlpha = Math.min(.75, SHADE_ALPHA * shadeLift * fieldBoost * (energy > 1 ? 1 : energy));
      ctx.fillRect(col * FIELD_STEP, row * FIELD_STEP, FIELD_STEP, FIELD_STEP);
    });

    if (flashAt) drawFieldFlash(now);

    ctx.strokeStyle = fieldInk;
    ctx.lineWidth = 1;
    ctx.globalAlpha = REST_ALPHA * fieldBoost;
    ctx.stroke(latticePath);
    ctx.globalAlpha = 1;
  }

  function fieldStep(now) {
    fieldFrame = null;
    const dt = Math.min((now - fieldLast) / 1000, .05);
    fieldLast = now;

    wellNow += (wellTarget - wellNow) * Math.min(1, dt * 7);   // eases in and out
    for (let i = presses.length - 1; i >= 0; i--) {
      if (now - presses[i].born > PRESS_LIFE) presses.splice(i, 1);
    }
    while (trail.length && now - trail[0].at > TRAIL_MS) trail.shift();
    fieldDraw(now);

    // nothing left to animate: stop, and let the last frame stand
    const settling = Math.abs(wellTarget - wellNow) > .002;
    if (flashAt || presses.length || trail.length || settling || pointerMoved
        || panelsMoving || now < liveUntil) {
      pointerMoved = false;
      fieldWake();
    }
  }

  function fieldWake() {
    if (fieldCanvas.hidden) return;
    liveUntil = performance.now() + FOLLOW_MS;
    if (fieldFrame) return;
    fieldFrame = requestAnimationFrame(fieldStep);
  }

  function onFieldMove(event) {
    const last = trail[trail.length - 1];
    if (!last || Math.abs(last.x - event.clientX) + Math.abs(last.y - event.clientY) > TRAIL_STEP) {
      // each sample remembers which way it was going and how fast, so the
      // hollow it leaves can be squashed along that heading
      const at = performance.now();
      const spot = { x: event.clientX, y: event.clientY, at: at, ux: 0, uy: 0, speed: 0 };
      if (last) {
        const dx = spot.x - last.x;
        const dy = spot.y - last.y;
        const len = Math.hypot(dx, dy) || 1;
        spot.ux = dx / len;
        spot.uy = dy / len;
        spot.speed = len / Math.max(16, at - last.at) * 1000;
      }
      trail.push(spot);
      if (trail.length > TRAIL_MAX) trail.shift();
    }
    pointerX = event.clientX;
    pointerY = event.clientY;
    wellTarget = 1;
    pointerMoved = true;
    fieldWake();
  }
  function onFieldDown(event) {
    pointerX = event.clientX;
    pointerY = event.clientY;
    presses.push({ x: event.clientX, y: event.clientY, born: performance.now() });
    wellTarget = 1;
    fieldWake();
  }
  function onFieldLeave() { wellTarget = 0; fieldWake(); }
  function onFieldResize() {
    if (fieldCanvas.hidden) return;
    fieldResize();
    fieldWake();
  }

  /* The threshold shows the field whether or not it is switched on as a
     decoration, and shows it louder: it is the ground the app comes through. */
  /* the light starts where it was clicked and runs outwards from there */
  function startFieldFlash(x, y) {
    flashX = x;
    flashY = y;
    flashAt = performance.now();
    const far = Math.hypot(Math.max(x, fieldW - x), Math.max(y, fieldH - y));
    flashSpan = (far + FLASH_WIDTH * 2) / FLASH_SPEED * 1000;
    fieldWake();
  }

  function drawFieldFlash(now) {
    const ctx = fieldCtx;
    const age = now - flashAt;
    if (age > flashSpan) { flashAt = 0; return; }
    const radius = FLASH_SPEED * age / 1000;
    const fade = 1 - age / flashSpan;         // it spends itself on the way out
    ctx.fillStyle = fieldInk;
    for (let r = 0; r < fieldRows; r++) {
      const cy = (r + .5) * FIELD_STEP;
      for (let c = 0; c < fieldCols; c++) {
        const cx = (c + .5) * FIELD_STEP;
        const off = (Math.hypot(cx - flashX, cy - flashY) - radius) / FLASH_WIDTH;
        if (off * off > 4) continue;
        ctx.globalAlpha = FLASH_ALPHA * Math.exp(-off * off) * fade * fade;
        ctx.fillRect(c * FIELD_STEP, r * FIELD_STEP, FIELD_STEP, FIELD_STEP);
      }
    }
    ctx.globalAlpha = 1;
  }

  function setFieldWelcome(on) {
    fieldBoost = on ? 2.6 : 1;
    if (on) setFieldOn(true);
    else setFieldOn(state.settings.decorations.indexOf("field") !== -1);
    fieldWake();
  }

  function setFieldOn(on) {
    if (on && window.matchMedia("(prefers-reduced-motion: reduce)").matches) on = false;
    if (on === !fieldCanvas.hidden) return;
    fieldCanvas.hidden = !on;
    if (on) {
      fieldResize();
      fieldLast = performance.now();
      window.addEventListener("pointermove", onFieldMove);
      window.addEventListener("pointerdown", onFieldDown);
      document.addEventListener("pointerleave", onFieldLeave);
      window.addEventListener("resize", onFieldResize);
      window.addEventListener("scroll", fieldWake, { passive: true });   // the sun rides with the page
      fieldWake();
    } else {
      if (fieldFrame) cancelAnimationFrame(fieldFrame);
      fieldFrame = null;
      presses.length = 0;
      trail.length = 0;
      wellNow = 0;
      wellTarget = 0;
      window.removeEventListener("pointermove", onFieldMove);
      window.removeEventListener("pointerdown", onFieldDown);
      document.removeEventListener("pointerleave", onFieldLeave);
      window.removeEventListener("resize", onFieldResize);
      window.removeEventListener("scroll", fieldWake);
    }
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
    setFieldOn(active.indexOf("field") !== -1);   // its own canvas, outside the wipe
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

  /* the scrub option lives with the other personalisation switches */
  const scrubToggle = createToggle(state.settings.timeScrub, function (on) {
    state.settings.timeScrub = on;
    document.getElementById("dtl").classList.toggle("is-scrubbable", on);
    saveState();
  });
  scrubToggle.classList.add("toggle--accent");
  scrubToggle.setAttribute("aria-label", translate("scrubLabel"));
  document.getElementById("scrubToggleSlot").appendChild(scrubToggle);

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

  /* While an object is unfolded its row must survive: rebuilding the list would
     tear out the very node the editor lives in, which is what made the panel
     snap shut on every keystroke. Redraws are deferred to the fold closing. */
  const listsDirty = {};
  function listsLocked(which) {
    if (!openHost) return false;
    listsDirty[which] = true;
    return true;
  }
  /* redraw only what changed: rebuilding all three read as the whole page reloading */
  function flushLists() {
    const pending = Object.keys(listsDirty);
    for (let i = 0; i < pending.length; i++) delete listsDirty[pending[i]];
    for (let i = 0; i < pending.length; i++) {
      if (pending[i] === "events") renderTodayEvents();
      else renderList(pending[i]);
    }
  }

  /* Redraw one list (tasks or projects) from state. */
  function renderList(listName) {
    if (listsLocked(listName)) return;
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
    const fold = createUnfold();
    row.addEventListener("click", function (event) {
      if (event.target.closest(".unfold, .detail__titlerow, .item__check")) return;
      if (Date.now() < dragEndedAt) return;          // the click that ends a drag
      // the dashboard list is a reminder: a project opens in its own workspace
      if (listName === "projects") { openProjectView(item.id); return; }
      if (row.classList.contains("is-open")) { closeDetail(); return; }
      openDetail(listName, item.id, fold.firstChild);
    });
    if (!item.pinned) {
      row.dataset.reorder = "1";
      armLongPress(row, listName);
    }

    // completion is the card's left edge: a full-height bar instead of a box
    if (listName === "projects") {
      const icon = document.createElement("span");
      icon.className = "item__ico";
      icon.innerHTML = habitSvg(item.icon || "folder");
      row.appendChild(icon);
    } else {
      row.appendChild(createCheckbox(function () { toggleItem(listName, item.id); }));
    }

    const label = document.createElement("span");
    label.className = "item__text";
    label.textContent = item.text;
    const slot = document.createElement("span");
    slot.className = "item__slot";

    row.append(label, slot);
    if (item.notes && item.notes.trim()) row.appendChild(createNoteMark());
    if (listName === "tasks" && item.subtasks && item.subtasks.length) row.appendChild(createSubBadge(item));
    if (listName === "tasks" && item.projectId) {
      const star = createStarMark(item.projectId);
      if (star) row.appendChild(star);
    }
    if (listName === "projects" && item.milestones && item.milestones.length) row.appendChild(createMilestoneBadge(item));
    if (item.pinned) row.appendChild(createPinMarker());
    if (item.dueDate) {
      row.appendChild(createDueBadge(item));
    }
    if (listName === "projects") {
      row.appendChild(createImportanceBars(item.importance || 0));
    }

    // a task completes with its ring, so only a project needs the tick here
    const actions = [];
    if (listName === "projects") {
      actions.push(rowAction("done", ICON_TICK, "completeLabel", function () {
        toggleItem("projects", item.id);
      }));
    } else {
      actions.push(rowAction("when", ICON_WHEN, "rescheduleLabel", function () {
        openCalendar(item.id, "tasks");
      }));
    }
    actions.push(rowAction("del", ICON_TRASH, "deleteAria", function () {
      removeItem(listName, item.id);
    }));
    row.appendChild(createRowActions(actions));
    armSwipe(row);

    row.appendChild(fold);
    return row;
  }

  /* the pocket an object unfolds into; the editor is moved inside it */
  function createUnfold() {
    const fold = document.createElement("div");
    fold.className = "unfold";
    const inner = document.createElement("div");
    inner.className = "unfold__inner";
    fold.appendChild(inner);
    return fold;
  }

  /* ROW ACTIONS — the rarer moves wait on the right of the row and are uncovered
     by a hover, or by a left swipe on touch. They are laid over the row rather
     than in it, so showing them never reflows the line. */
  const ICON_WHEN = '<rect x="3" y="4" width="18" height="18" rx="2"/>'
    + '<line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>'
    + '<line x1="3" y1="10" x2="21" y2="10"/>';
  const ICON_TRASH = '<polyline points="3 6 5 6 21 6"/>'
    + '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'
    + '<line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>';
  const ICON_TICK = '<polyline points="4 12.5 9.5 18 20 6"/>';

  function rowAction(name, paths, labelKey, onRun) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "row-act row-act--" + name;
    button.setAttribute("aria-label", translate(labelKey));
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + paths + '</svg>';
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      closeSwipe();
      onRun();
    });
    return button;
  }

  function createRowActions(buttons) {
    const group = document.createElement("span");
    group.className = "row-acts";
    for (let i = 0; i < buttons.length; i++) group.appendChild(buttons[i]);
    return group;
  }

  /* the tick is drawn, not typed: an SVG stroke that draws itself in */
  function createCheckbox(onToggle) {
    const box = document.createElement("button");
    box.type = "button";
    box.className = "item__check";
    box.setAttribute("aria-label", translate("doneAria"));
    box.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">'
      + '<polyline points="3.5 8.4 6.6 11.5 12.5 4.8"/></svg>';
    box.addEventListener("click", function (event) {
      event.stopPropagation();
      onToggle();
    });
    return box;
  }

  /* Touch has no hover, so a left swipe uncovers the same actions. The group
     follows the finger instead of snapping, and a swipe that turns out to be
     vertical is handed back to the scroll. */
  const SWIPE_MIN = 10;    // under this it could still become a scroll
  const SWIPE_FULL = 56;   // travel that uncovers the group completely
  let swipedRow = null;

  function closeSwipe() {
    if (!swipedRow) return;
    swipedRow.classList.remove("is-swiped");
    swipedRow = null;
  }

  function armSwipe(row) {
    let fromX = 0, fromY = 0, live = false, decided = false, shown = 0;

    row.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse") return;
      if (row.classList.contains("is-open")) return;
      if (event.target.closest(".row-acts, .unfold, .detail__titlerow")) return;
      fromX = event.clientX;
      fromY = event.clientY;
      live = true;
      decided = false;
      shown = 0;
    });

    row.addEventListener("pointermove", function (event) {
      if (!live) return;
      const dx = event.clientX - fromX;
      const dy = event.clientY - fromY;
      if (!decided) {
        if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
        if (Math.abs(dx) <= Math.abs(dy)) { live = false; return; }   // a scroll
        decided = true;
        closeSwipe();
        row.classList.add("is-swiping");
      }
      shown = Math.max(0, Math.min(1, -dx / SWIPE_FULL));
      row.style.setProperty("--swipe", shown.toFixed(3));
    });

    const release = function () {
      if (!live) return;
      live = false;
      if (!decided) return;
      row.classList.remove("is-swiping");
      row.style.removeProperty("--swipe");
      dragEndedAt = Date.now() + 350;   // the swipe must not also open the row
      if (shown > .5) {
        row.classList.add("is-swiped");
        swipedRow = row;
      }
    };
    row.addEventListener("pointerup", release);
    row.addEventListener("pointercancel", release);
  }

  // a touch anywhere else puts the uncovered row back
  document.addEventListener("pointerdown", function (event) {
    if (swipedRow && !event.target.closest(".is-swiped")) closeSwipe();
  });

  /* Reordering starts on a long press anywhere on the row, so the six-dot grip
     could go. A press that moves early, or ends early, is just a click. */
  const LONG_PRESS_MS = 380;
  let pressTimer = null;
  let dragEndedAt = 0;

  function armLongPress(row, listName) {
    row.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (event.target.closest(".item__check, .row-acts, .unfold, .detail__titlerow")) return;
      const from = { x: event.clientX, y: event.clientY };
      clearTimeout(pressTimer);
      pressTimer = setTimeout(function () {
        startRowDrag(event, row, listName);
      }, LONG_PRESS_MS);
      const give = function (move) {
        if (Math.abs(move.clientX - from.x) + Math.abs(move.clientY - from.y) > 8) drop();
      };
      const drop = function () {
        clearTimeout(pressTimer);
        document.removeEventListener("pointermove", give);
        document.removeEventListener("pointerup", drop);
        document.removeEventListener("pointercancel", drop);
      };
      document.addEventListener("pointermove", give);
      document.addEventListener("pointerup", drop);
      document.addEventListener("pointercancel", drop);
    });
  }


  /* pointer-based drag reorder (works on touch). Listens on document so the drag
     survives the row moving in the DOM, then persists the new order to state. */
  let rowDrag = null;
  function startRowDrag(event, row, listName) {
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
    dragEndedAt = Date.now() + 350;   // swallow the click that ends the drag
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
    const item = { id: Date.now().toString(), text: text, done: false, projectId: null };
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
    removeWithUndo(listName, id, function () {
      renderList(listName);
      // a project also owns a star, and Undo has to bring it back
      if (listName === "projects" && !skyView.hidden) renderSky();
    });
  }

  function toggleItem(listName, id) {
    const items = state[listName];
    let now = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) {
        items[i].done = !items[i].done; // flip done state
        now = items[i].done;
        items[i].doneDate = now ? todayKey() : null;   // feeds the project's momentum
        break;
      }
    }
    saveState();
    if (openHost) {
      // the list is frozen: repaint just this row and the ring
      const row = document.querySelector('.item[data-id="' + id + '"]');
      if (row) row.classList.toggle("done", now);
      renderTasksRing();
      listsDirty[listName] = true;
      return;
    }
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
    const parsed = { date: null, time: null, flag: false, inferred: false, ranges: [] };

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
      parsed.flag = true;
      const start = bang.index + bang[0].length - bang[1].length;   // skip the leading space
      parsed.ranges.push([start, start + bang[1].length]);
    }

    // a bare time needs a day to live on, or it would be silently dropped:
    // today if it is still ahead, tomorrow otherwise. The hint line shows which.
    if (parsed.time && !parsed.date) {
      const at = new Date(todayKey() + "T" + parsed.time).getTime();
      parsed.date = at >= Date.now() ? todayKey() : shiftDateKey(todayKey(), 1);
      parsed.inferred = true;   // guessed, not read: a day view may override it
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

  /* One typed line, with the parts it recognises lit up underneath. Tasks and
     events share it; only the day it falls back on, the word the "!" stands for
     and what submit does are different. `config.resolveDate` lets a caller have
     the last word on the day, so the hint and the object always agree. */
  function wireQuickAdd(config) {
    const form = document.getElementById(config.form);
    const input = document.getElementById(config.input);
    const mirror = document.getElementById(config.mirror);
    const hint = document.getElementById(config.hint);
    const button = document.getElementById(config.button);

    function dayOf(parsed) {
      return config.resolveDate ? config.resolveDate(parsed) : parsed.date;
    }

    // the mirror sits under the transparent input and only paints the
    // highlights, so the recognised words light up beneath what's typed
    function render() {
      const text = input.value;
      const parsed = parseQuickAdd(text);
      mirror.innerHTML = "";
      let at = 0;
      for (let i = 0; i < parsed.ranges.length; i++) {
        if (parsed.ranges[i][0] < at) continue;
        mirror.appendChild(document.createTextNode(text.slice(at, parsed.ranges[i][0])));
        const hit = document.createElement("span");
        hit.className = "quick__hit";
        hit.textContent = text.slice(parsed.ranges[i][0], parsed.ranges[i][1]);
        mirror.appendChild(hit);
        at = parsed.ranges[i][1];
      }
      mirror.appendChild(document.createTextNode(text.slice(at)));
      mirror.scrollLeft = input.scrollLeft;

      const bits = [];
      const day = dayOf(parsed);
      if (day) bits.push(dueLabel({ dueDate: day, dueTime: parsed.time }));
      if (parsed.flag) bits.push(translate(config.flagLabel));
      hint.hidden = bits.length === 0;
      if (bits.length) {
        hint.textContent = (quickTitle(text, parsed.ranges) || translate(config.fallbackName))
          + " · " + bits.join(" · ");
      }
      return parsed;
    }

    function open() {
      button.hidden = true;
      form.hidden = false;
      input.focus();
      render();
    }
    function close() {
      input.value = "";
      form.hidden = true;
      button.hidden = false;
      render();
    }

    button.addEventListener("click", open);
    input.addEventListener("input", render);
    input.addEventListener("scroll", function () { mirror.scrollLeft = input.scrollLeft; });
    input.addEventListener("blur", function () {
      if (!input.value.trim()) close();   // keep a half-typed line alive
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.stopPropagation(); close(); }
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const text = input.value;
      const parsed = parseQuickAdd(text);
      const title = quickTitle(text, parsed.ranges);
      if (!title && !parsed.date) return;
      config.submit(parsed, title || translate(config.fallbackName), dayOf(parsed));
      if (parsed.time) ensureNotifyPermission();
      input.value = "";
      render();
      input.focus();   // ready for the next line
    });
  }

  wireQuickAdd({
    form: "quickAdd", input: "quickInput", mirror: "quickMirror",
    hint: "quickHint", button: "addTaskBtn",
    flagLabel: "pinLabel", fallbackName: "newTaskName",
    submit: function (parsed, title, day) {
      addItem("tasks", title, day ? { date: day, time: parsed.time } : null);
      if (parsed.flag) {
        state.tasks[state.tasks.length - 1].pinned = true;
        saveState();
        renderList("tasks");
      }
    }
  });

  /* a new project lands in the sky and opens straight into its workspace */
  function newProject() {
    const project = {
      id: Date.now().toString(), text: translate("addProjectAria"), icon: "folder",
      sky: freeSkySpot(state.projects.length), why: "", outcome: "", targetDate: null,
      journal: [], dream: []
    };
    state.projects.push(project);
    saveState();
    renderList("projects");
    return project;
  }

  document.getElementById("addProjectBtn").addEventListener("click", function () {
    const project = newProject();
    openProjectView(project.id);
    pviewName.focus();
    pviewName.select();
  });

  /* HABITS */

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
  /* THE HABIT FOLD — one panel, moved under whichever tile is open, the way the
     editor card travels between task rows. It spans the whole grid row, so on a
     wrapped grid it opens under the right rank. */
  const HFOLD_MS = 380;
  let habitOpen = null;
  let hfoldTimer = null;

  function habitFoldEl() {
    let fold = document.getElementById("habitFold");
    if (fold) return fold;
    fold = document.createElement("div");
    fold.id = "habitFold";
    fold.className = "hfold";
    fold.appendChild(document.createElement("div")).className = "hfold__inner";
    return fold;
  }

  function closeHabitFold() {
    const fold = document.getElementById("habitFold");
    habitOpen = null;
    if (!fold) return;
    clearTimeout(hfoldTimer);
    fold.style.height = fold.getBoundingClientRect().height + "px";
    fold.offsetWidth;
    fold.style.height = "0px";
    hfoldTimer = setTimeout(function () { fold.remove(); }, HFOLD_MS);
  }

  /* `silent` true keeps the height as it is (a redraw), null closes */
  function mountHabitFold(id, silent) {
    if (silent === null) { closeHabitFold(); return; }
    const tile = habitsGrid.querySelector('[data-habit="' + id + '"]');
    const habit = habitById(id);
    if (!tile || !habit) { habitOpen = null; return; }
    const fold = habitFoldEl();
    clearTimeout(hfoldTimer);
    const inner = fold.firstChild;
    inner.innerHTML = "";
    inner.appendChild(createHabitPanel(habit));
    tile.after(fold);
    habitOpen = id;
    fold.style.height = silent ? "auto" : inner.getBoundingClientRect().height + "px";
    if (!silent) {
      hfoldTimer = setTimeout(function () { fold.style.height = "auto"; }, HFOLD_MS);
    }
  }

  function habitById(id) {
    for (let i = 0; i < state.habits.length; i++) {
      if (state.habits[i].id === id) return state.habits[i];
    }
    return null;
  }

  function renderHabits() {
    const today = todayKey();
    const openId = habitOpen;
    habitsGrid.innerHTML = "";
    for (let i = 0; i < state.habits.length; i++) {
      habitsGrid.appendChild(createHabitTile(state.habits[i], today));
    }
    habitsGrid.appendChild(createEmptySlot());
    if (openId) mountHabitFold(openId, true);   // survive a redraw
    renderHabitsRule();
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

    tile.addEventListener("click", function (event) {
      if (event.target.closest(".habit__more")) return;
      toggleHabit(habit.id, tile);
    });
    tile.dataset.habit = habit.id;
    tile.append(water, icon, createHabitMore(habit.id));
    return tile;
  }

  /* Ticking is what a tile is for, so opening its detail needs its own mark:
     a corner button that only shows on hover, as the row actions do. */
  function createHabitMore(id) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "habit__more";
    more.setAttribute("aria-label", translate("habitEditAria"));
    more.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="2.4" stroke-linecap="round" aria-hidden="true">'
      + '<circle cx="5" cy="12" r=".6"/><circle cx="12" cy="12" r=".6"/>'
      + '<circle cx="19" cy="12" r=".6"/></svg>';
    more.addEventListener("click", function (event) {
      event.stopPropagation();
      mountHabitFold(id, habitOpen === id ? null : false);
    });
    return more;
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
    renderHabitsRule();
  }

  function removeHabit(id) {
    removeWithUndo("habits", id, function () {
      renderHabits();
      renderHabits();
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

  let iconPickerMode = { kind: "habit-new" };   // habit-new | habit-edit | detail | project

  /* Apply a picked icon: create a habit, update a habit's icon, or the open item's. */
  function chooseIcon(iconKey) {
    if (iconPickerMode.kind === "detail") {   // the open event detail
      const item = currentDetailItem();
      if (item) item.icon = iconKey;
      saveState();
      iconPicker.hidden = true;
      detailIcon.innerHTML = habitSvg(iconKey);   // update the square button
      refreshDetailSource();   // update rows / calendar
      return;
    }
    if (iconPickerMode.kind === "project") {
      const project = currentProject();
      if (project) project.icon = iconKey;
      saveState();
      iconPicker.hidden = true;
      pviewIcon.innerHTML = habitSvg(iconKey);
      renderList("projects");
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
    renderHabits();   // reflect an icon change on the well-being page
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

  /* open to change the icon of the event in the detail view */
  function openIconPickerForDetail() {
    iconPickerMode = { kind: "detail" };
    document.getElementById("habitNameField").hidden = true;
    document.getElementById("iconPresets").hidden = true;
    iconPicker.hidden = false;
  }

  /* same, for the project on screen in its workspace */
  function openIconPickerForProject() {
    iconPickerMode = { kind: "project" };
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
  let pickerContext = "new";                      // an id, or {projectId, milestoneId}
  let pickerKind = "tasks";                        // tasks | events | project | milestone
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

  /* "YYYY-MM-DD" for a Date */
  function dateKeyOf(date) {
    return dateKey(date.getFullYear(), date.getMonth(), date.getDate());
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

  /* Open the calendar on a task, an event, a project horizon or a milestone
     target. The context is an id, except for a milestone which needs both. */
  function openCalendar(context, kind) {
    pickerContext = context;
    pickerKind = kind || "tasks";
    let date = null;
    let time = "";
    if (pickerKind === "events") {
      const event = findItem("events", context);
      if (event) { date = event.date || null; time = event.time || ""; }
    } else if (pickerKind === "project") {
      const project = findItem("projects", context);
      if (project) date = project.targetDate || null;
    } else if (pickerKind === "milestone") {
      const project = findItem("projects", context.projectId);
      const milestone = project && findMilestone(project, context.milestoneId);
      if (milestone) date = milestone.targetDate || null;
    } else {
      const task = findTask(context);
      if (task) { date = task.dueDate || null; time = task.dueTime || ""; }
    }
    pickerSelected = date || todayKey();   // today highlighted by default
    const base = new Date(pickerSelected + "T00:00");
    pickerYear = base.getFullYear();
    pickerMonth = base.getMonth();
    setPickerTime(time);
    // a horizon and a milestone target are dates only; setPickerTime already
    // shut the sliders since they were loaded with no time
    document.getElementById("calTimeRow").hidden =
      pickerKind === "project" || pickerKind === "milestone";
    document.getElementById("calClear").hidden = pickerKind === "events";   // an event always has a date
    renderCalendar();
    calendarModal.hidden = false;
  }

  /* Write the chosen (or cleared) date to whatever the picker was opened on. */
  function applyDue(date, time) {
    if (pickerKind === "events") {
      const event = findItem("events", pickerContext);
      if (event && date) {
        event.date = date;
        event.time = time || null;
        saveState();
        renderEventCal();
        renderDailyTimeline();
      }
      calendarModal.hidden = true;
      return;
    }
    // a project horizon and a milestone target are dates only, no time
    if (pickerKind === "project") {
      const project = findItem("projects", pickerContext);
      if (project) {
        project.targetDate = date;
        saveState();
        fillProjectView(project);
        renderList("projects");
      }
      calendarModal.hidden = true;
      return;
    }
    if (pickerKind === "milestone") {
      const project = findItem("projects", pickerContext.projectId);
      const milestone = project && findMilestone(project, pickerContext.milestoneId);
      if (milestone) {
        milestone.targetDate = date;
        saveState();
        renderTimeline(project);
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
      if (task.projectId) renderProjectSteps(findItem("projects", task.projectId));
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

  /* which star a task came from, shown quietly at the end of its row */
  function createStarMark(projectId) {
    const project = findItem("projects", projectId);
    if (!project) return null;
    const mark = document.createElement("span");
    mark.className = "item__star";
    mark.innerHTML = iconSvg('<path d="M12 4 13.4 9 18.2 10.1 14.5 12.9 15.3 17.8 12 15.4 8.7 17.8 9.5 12.9 5.8 10.1 10.6 9 Z"/>');
    const name = document.createElement("span");
    name.textContent = project.text;
    mark.appendChild(name);
    mark.addEventListener("click", function (event) {
      event.stopPropagation();
      openProjectView(project.id);
    });
    return mark;
  }

  /* floral marker on a pinned task/project */
  function createPinMarker() {
    const pin = document.createElement("span");
    pin.className = "item__pin";
    pin.innerHTML = iconSvg(ICON_FLOWER);
    return pin;
  }

  /* HABITS VIEW — manage all habits (rename / icon / delete) + completion history */
  /* THE THRESHOLD'S HABITS — the day's rings, under the drifting rule. Ticking
     one must not open the app, so the click stops where it lands. */
  const welcomeHabits = document.getElementById("welcomeHabits");

  function renderWelcomeHabits() {
    if (!welcomeHabits) return;
    welcomeHabits.innerHTML = "";
    const today = todayKey();
    for (let i = 0; i < state.habits.length; i++) {
      const habit = state.habits[i];
      if (habit.type === "sleep" || habit.type === "exercise") continue;   // not a yes or no
      welcomeHabits.appendChild(welcomeRing(habit, today));
    }
  }

  function welcomeRing(habit, today) {
    const done = !!(habit.completedDates && habit.completedDates.indexOf(today) !== -1);
    const ring = document.createElement("button");
    ring.type = "button";
    ring.className = done ? "welcome__ring is-done" : "welcome__ring";
    ring.setAttribute("aria-label", habit.name || translate("habitToggleAria"));
    ring.setAttribute("aria-pressed", done ? "true" : "false");
    if (HABIT_ICONS[habit.icon]) ring.innerHTML = habitSvg(habit.icon);
    ring.addEventListener("click", function (event) {
      event.stopPropagation();          // tick it, do not walk in
      toggleHabit(habit.id, ring);      // flips a "done" class on what it is given
      const on = ring.classList.contains("done");
      ring.classList.remove("done");
      ring.classList.toggle("is-done", on);
      ring.setAttribute("aria-pressed", on ? "true" : "false");
    });
    return ring;
  }

  /* THE HABIT RULE — every habit on one chart, days running left to right and a
     lane each, the way the day rule reads. One lane tells you an the habit, one
     column tells you a day: that second reading is what a stack of separate
     heatmaps could never give. */
  const RULE_DAYS = 70;
  const habitsRule = document.getElementById("habitsRule");

  function renderHabitsRule() {
    habitsRule.innerHTML = "";
    if (!state.habits.length) return;

    const today = new Date();
    const days = [];
    for (let i = RULE_DAYS - 1; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      days.push(day);
    }

    const lanes = document.createElement("div");
    lanes.className = "hrule__lanes";
    for (let h = 0; h < state.habits.length; h++) {
      lanes.appendChild(habitLane(state.habits[h], days));
    }
    habitsRule.append(lanes, ruleAxis(days));
    habitsRule.scrollLeft = habitsRule.scrollWidth;   // today, at the right edge
  }

  function habitLane(habit, days) {
    const lane = document.createElement("div");
    lane.className = "hrule__lane";

    const tag = document.createElement("span");
    tag.className = "hrule__tag";
    tag.title = habit.name || "";
    if (HABIT_ICONS[habit.icon]) tag.innerHTML = habitSvg(habit.icon);
    lane.appendChild(tag);

    const done = laneDays(habit);
    const todayK = todayKey();
    for (let i = 0; i < days.length; i++) {
      const key = dateKeyOf(days[i]);
      const mark = document.createElement("span");
      mark.className = "hrule__day";
      if (done[key]) mark.classList.add("is-on");
      if (key === todayK) mark.classList.add("is-today");
      mark.title = (habit.name || "") + " · " + key;
      lane.appendChild(mark);
    }
    return lane;
  }

  /* one lookup per habit kind: a plain tick, a night in range, a full session */
  function laneDays(habit) {
    if (habit.type === "sleep") {
      const cfg = habit.config || {};
      const log = habit.sleepLog || {};
      const out = {};
      for (const key in log) {
        const hours = log[key];
        out[key] = hours >= (cfg.min || 0) && (cfg.max == null || hours <= cfg.max);
      }
      return out;
    }
    if (habit.type === "exercise") {
      const out = {};
      const log = habit.exerciseLog || {};
      for (const key in log) out[key] = exerciseAllDone(habit, key);
      return out;
    }
    return completedSet(habit);
  }

  /* the months underneath, written once where each one starts */
  function ruleAxis(days) {
    const axis = document.createElement("div");
    axis.className = "hrule__axis";
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    axis.appendChild(document.createElement("span")).className = "hrule__tag";
    let lastMonth = -1;
    for (let i = 0; i < days.length; i++) {
      const slot = document.createElement("span");
      slot.className = "hrule__stamp";
      if (days[i].getMonth() !== lastMonth) {
        lastMonth = days[i].getMonth();
        slot.textContent = days[i].toLocaleDateString(locale, { month: "short" });
        slot.classList.add("is-start");
      }
      axis.appendChild(slot);
    }
    return axis;
  }

  /* one habit, unfolded under its tile: icon, name, delete, its own numbers */
  function createHabitPanel(habit) {
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
    const streak = document.createElement("span");
    streak.className = "hcard__streak";
    streak.textContent = translate("streakLabel") + " " + habitStreak(habit);
    stats.appendChild(streak);

    card.appendChild(stats);
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


  /* DETAIL — the inline editor for a task or an event: rename, notes, subtasks.
     Projects left this card for their own workspace, see PROJECT VIEW below. */
  const detail = document.getElementById("detail");
  const detailName = document.getElementById("detailName");
  const detailIcon = document.getElementById("detailIcon");
  const detailBell = document.getElementById("detailBell");
  const detailWhen = document.getElementById("detailWhen");
  const detailPin = document.getElementById("detailPin");
  const detailNotes = document.getElementById("detailNotes");
  const subtaskList = document.getElementById("subtaskList");
  const subtaskSection = document.getElementById("subtaskSection");
  const timeline = document.getElementById("timeline");
  // kind: "tasks" | "events"
  let detailTarget = { kind: null, id: null };

  /* the object the detail view currently edits */
  function currentDetailItem() {
    return findItem(detailTarget.kind, detailTarget.id);
  }

  /* refresh whatever list the edited item belongs to (row badges / marks) */
  function refreshDetailSource() {
    if (detailTarget.kind === "events") {
      renderEventCal();
      renderDailyTimeline();
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

  /* milestone progress badge on a project row, as a percentage */
  function createMilestoneBadge(item) {
    const badge = document.createElement("span");
    badge.className = "item__sub";
    badge.textContent = Math.round(milestoneProgress(item) * 100) + "%";
    return badge;
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


  /* a task or an event, opened inside its own row */
  function openDetail(list, id, host) {
    const item = findItem(list, id);
    if (!item) return;
    detailTarget = { kind: list, id: id };
    const mounted = host ? mountEditor(host) : false;
    fillDetail(item);
    if (mounted) openFold(host);
  }

  /* populate and show the detail view for the current target */
  function fillDetail(item) {
    const kind = detailTarget.kind;
    detailName.value = item.text || "";
    detailBell.hidden = kind !== "events";
    if (kind === "events") {
      detailBell.classList.toggle("is-on", !!item.important);
      detailBell.setAttribute("aria-pressed", item.important ? "true" : "false");
    }
    detailPin.hidden = kind === "events";   // an event is not pinnable
    if (!detailPin.hidden) detailPin.classList.toggle("is-on", !!item.pinned);
    // an event carries an icon, shown as a square button left of the title
    detailIcon.hidden = kind !== "events";
    if (kind === "events") detailIcon.innerHTML = habitSvg(item.icon || "calendar");
    detailNotes.value = item.notes || "";
    fitNotes();

    subtaskSection.hidden = kind === "events";   // an event just has notes
    if (kind !== "events") renderSubtasks(item);
    detailBody.scrollTop = 0;
  }

  /* INLINE EDITING — one editor card, moved into whichever row is open rather
     than a window opening over the page. Clicking a task unfolds the task
     itself, the way the calendar unfolds its month. */
  const UNFOLD_MS = 420;
  const detailCard = detail.querySelector(".detail__card");
  const detailBody = detail.querySelector(".detail__body");
  const detailHead = document.getElementById("detailHead");
  let openHost = null;   // the .unfold__inner currently holding the editor

  function hostRow(host) { return host.closest(".item, .day-event"); }

  /* returns true when the editor has just moved in, so the caller can unfold
     the row once the card is filled — measuring before that opens the fold on
     the previous object's height and it visibly snaps back */
  function mountEditor(host) {
    if (openHost === host) return false;
    if (openHost) releaseHost(openHost);
    const row = hostRow(host);
    host.appendChild(detailCard);
    // the identity line takes the place of the row's static label, so the title,
    // the date, the pin and the importance stay exactly where they were
    if (row) {
      row.querySelector(".item__slot, .day-event__slot").appendChild(detailHead);
      row.classList.add("is-open");
    }
    openHost = host;
    return true;
  }

  /* the fold's height is measured rather than left to the grid: a flexible row
     resolves to nothing here, which left the editor clipped to a sliver */
  let foldTimer = null;
  function openFold(host) {
    fieldWake();                 // everything below is about to move
    const fold = host.parentNode;
    clearTimeout(foldTimer);
    fold.style.height = host.getBoundingClientRect().height + "px";
    foldTimer = setTimeout(function () { fold.style.height = "auto"; }, UNFOLD_MS);
  }
  function shutFold(host) {
    fieldWake();
    const fold = host.parentNode;
    clearTimeout(foldTimer);
    fold.style.height = fold.getBoundingClientRect().height + "px";
    fold.offsetWidth;                       // commit the start height
    fold.style.height = "0px";
  }

  /* fold the row shut, then park the editor back out of the way */
  function releaseHost(host) {
    const row = hostRow(host);
    shutFold(host);
    if (row) row.classList.remove("is-open");
    setTimeout(function () {
      if (detailCard.parentNode === host) {
        detailCard.insertBefore(detailHead, detailCard.firstChild);
        detail.appendChild(detailCard);
      }
      flushLists();
    }, UNFOLD_MS);
  }

  function closeDetail() {
    if (!openHost) return;
    releaseHost(openHost);
    openHost = null;
    detailTarget = { kind: null, id: null };
  }

  /* a click anywhere outside the open object folds it back */
  document.addEventListener("click", function (event) {
    if (!openHost || !event.target.closest) return;
    if (event.target.closest(".item.is-open, .day-event.is-open")) return;
    if (event.target.closest(".modal, .detail")) return;   // pickers the editor opens
    closeDetail();
  });


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

    const checkbox = createCheckbox(function () { toggleSubtask(item, sub.id); });

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
  let openMilestone = null;   // the milestone unfolded in the timeline, if any

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
     shows its title and its date, and unfolds a small editor when clicked.
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
        event.stopPropagation();   // the dot toggles; the row unfolds the editor
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

      const when = milestoneWhen(milestone);
      if (when) content.appendChild(when);
      if (openMilestone === milestone.id) content.appendChild(createMilestoneEditor(project, milestone));

      row.appendChild(content);
      row.classList.add("tl-row--clickable");
      if (openMilestone === milestone.id) row.classList.add("is-open");
      row.addEventListener("click", function (event) {
        if (event.target.closest(".tl-edit")) return;   // clicks inside the editor stay there
        openMilestone = openMilestone === milestone.id ? null : milestone.id;
        renderTimeline(project);
      });
    }
    return row;
  }

  /* the date shown on a milestone: when it was reached, or when it is aimed at.
     A target already gone by and still not reached reads as late. */
  function milestoneWhen(milestone) {
    if (milestone.completedDate) {
      const date = document.createElement("span");
      date.className = "tl-date";
      date.textContent = milestoneDateLabel(milestone.completedDate);
      return date;
    }
    if (!milestone.targetDate) return null;
    const date = document.createElement("span");
    date.className = "tl-date tl-date--target";
    date.textContent = milestoneDateLabel(milestone.targetDate);
    if (milestone.targetDate < todayKey()) {
      date.classList.add("is-late");
      date.textContent += " · " + translate("lateLabel");
    }
    return date;
  }

  /* rename, aim at a date, delete — the whole milestone in one strip */
  function createMilestoneEditor(project, milestone) {
    const edit = document.createElement("div");
    edit.className = "tl-edit";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "tl-edit__name";
    input.maxLength = 120;
    input.value = milestone.text || "";
    input.placeholder = translate("milestonePlaceholder");
    input.addEventListener("input", function () {
      milestone.text = input.value;
      saveState();
      const title = edit.parentNode.querySelector(".tl-title");
      title.textContent = milestone.text || translate("milestonePlaceholder");
      title.classList.toggle("is-empty", !milestone.text);
    });

    const when = document.createElement("button");
    when.type = "button";
    when.className = "tl-edit__btn";
    when.textContent = milestone.targetDate
      ? milestoneDateLabel(milestone.targetDate) : translate("milestoneTarget");
    when.addEventListener("click", function () {
      openCalendar({ projectId: project.id, milestoneId: milestone.id }, "milestone");
    });

    // a milestone can need several steps to be reached, so this one never locks
    const promote = createPromoteButton("tl-edit__btn", function () {
      promoteToStep(project, milestone.text || translate("milestonePlaceholder"));
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "tl-edit__btn tl-edit__btn--del";
    del.setAttribute("aria-label", translate("deleteAria"));
    del.innerHTML = iconSvg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>');
    del.addEventListener("click", function () {
      openMilestone = null;
      removeMilestone(project, milestone.id);
    });

    edit.append(input, when, promote, del);
    return edit;
  }

  /* "12 juil." — localized short date */
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
    project.milestones.splice(at, 0,
      { id: Date.now().toString(), text: text, completedDate: null, targetDate: null });
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
    renderTimeline(project);
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

  /* PROJECT VIEW — the workspace a star opens into. A project is not a task with
     extra fields: it gets a heading, a dated trajectory, its own steps, a wall to
     think on and a journal. The dashboard list stays a reminder; work happens here. */
  const projectView = document.getElementById("projectView");
  const pviewName = document.getElementById("pviewName");
  const pviewIcon = document.getElementById("pviewIcon");
  const pviewImp = document.getElementById("pviewImp");
  const pviewWhy = document.getElementById("pviewWhy");
  const pviewOutcome = document.getElementById("pviewOutcome");
  const pviewDone = document.getElementById("pviewDone");
  const pviewHorizonLabel = document.getElementById("pviewHorizonLabel");
  const pviewSteps = document.getElementById("pviewSteps");
  const pviewJournal = document.getElementById("pviewJournal");
  const pviewWall = document.getElementById("pviewWall");
  const PVIEW_MS = 340;
  let openProject = null;   // id of the project on screen, if any

  function currentProject() {
    return openProject ? findItem("projects", openProject) : null;
  }

  /* The workspace always opens beside its star, never over it: coming from the
     dashboard the sky is raised first, then the camera dives to the right one. */
  function openProjectView(id) {
    const project = findItem("projects", id);
    if (!project) return;
    if (openProject === id) return;   // already dived on this one
    if (skyView.hidden) openSky();
    openProject = id;
    openMilestone = null;
    projectView.hidden = false;
    fillProjectView(project);
    requestAnimationFrame(function () {
      projectView.classList.add("is-open");
      focusStar(project);
    });
    setTimeout(layoutTimeline, PVIEW_MS);   // the line can only be measured once settled
  }

  function closeProjectView() {
    openProject = null;
    projectView.classList.remove("is-open");
    setTimeout(function () { projectView.hidden = true; }, PVIEW_MS);
    resetCamera();
    renderList("projects");
    if (!skyView.hidden) renderSky();
  }

  function fillProjectView(project) {
    pviewName.value = project.text || "";
    pviewIcon.innerHTML = habitSvg(project.icon || "folder");
    pviewImp.innerHTML = "";
    pviewImp.appendChild(createImportanceBars(project.importance || 0, function (level) {
      project.importance = project.importance === level ? 0 : level;
      saveState();
      fillProjectView(project);
    }));
    pviewWhy.value = project.why || "";
    pviewOutcome.value = project.outcome || "";
    fitLine(pviewWhy);
    fitLine(pviewOutcome);
    pviewHorizonLabel.textContent = project.targetDate
      ? horizonLabel(project.targetDate) : translate("horizonNone");
    pviewDone.classList.toggle("is-on", !!project.done);
    document.getElementById("pviewDoneLabel").textContent =
      translate(project.done ? "reopenLabel" : "completeLabel");
    renderTimeline(project);
    renderProjectSteps(project);
    renderJournal(project);
    renderWall(project);
  }

  /* "12 juil. · dans 34 j" — the date and how far off it still is */
  function horizonLabel(isoDate) {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const text = new Date(isoDate + "T00:00").toLocaleDateString(locale,
      { day: "numeric", month: "short", year: "numeric" });
    const days = daysUntil(isoDate);
    if (days < 0) return text + " · " + translate("lateLabel");
    return text + " · " + days + " " + translate("daysShort");
  }

  function daysUntil(isoDate) {
    const target = new Date(isoDate + "T00:00").getTime();
    const today = new Date(todayKey() + "T00:00").getTime();
    return Math.round((target - today) / 86400000);
  }

  /* a one-line field that grows with what is typed into it */
  function fitLine(field) {
    field.style.height = "auto";
    field.style.height = field.scrollHeight + "px";
  }

  /* NEXT STEPS — real tasks, tagged with the project. A dated one shows up in the
     day like any other: this is what stops a project from being a decoration. */
  function renderProjectSteps(project) {
    if (!project) return;
    pviewSteps.innerHTML = "";
    const steps = projectTasks(project.id);
    if (steps.length === 0) {
      const empty = document.createElement("p");
      empty.className = "detail__empty";
      empty.textContent = translate("stepsEmpty");
      pviewSteps.appendChild(empty);
      return;
    }
    for (let i = 0; i < steps.length; i++) {
      pviewSteps.appendChild(createStepRow(project, steps[i]));
    }
  }

  function projectTasks(projectId) {
    const found = [];
    for (let i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].projectId === projectId) found.push(state.tasks[i]);
    }
    return found;
  }

  function createStepRow(project, task) {
    const row = document.createElement("div");
    row.className = task.done ? "step is-done" : "step";

    row.appendChild(createCheckbox(function () {
      task.done = !task.done;
      task.doneDate = task.done ? todayKey() : null;
      saveState();
      renderProjectSteps(project);
      renderList("tasks");
    }));

    const label = document.createElement("input");
    label.type = "text";
    label.className = "step__text";
    label.value = task.text;
    label.maxLength = 200;
    label.addEventListener("input", function () {
      task.text = label.value;
      saveState();
      renderList("tasks");
    });
    row.appendChild(label);

    const when = document.createElement("button");
    when.type = "button";
    when.className = task.dueDate ? "step__when is-set" : "step__when";
    when.innerHTML = iconSvg('<rect x="3" y="4" width="18" height="18" rx="2"/>'
      + '<line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>'
      + '<line x1="3" y1="10" x2="21" y2="10"/>');
    if (task.dueDate) {
      const tag = document.createElement("span");
      tag.textContent = dueLabel(task);
      when.appendChild(tag);
    }
    when.addEventListener("click", function () { openCalendar(task.id, "tasks"); });
    row.appendChild(when);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "step__del";
    del.setAttribute("aria-label", translate("deleteAria"));
    del.textContent = "×";
    del.addEventListener("click", function () {
      removeItem("tasks", task.id);
      renderProjectSteps(project);
    });
    row.appendChild(del);
    return row;
  }

  /* PROMOTION — an idea in the journal and a milestone on the line are both things
     you can only act on once they become a step. One button turns either into one,
     without leaving the workspace. */
  const ICON_PROMOTE = '<polyline points="4 12 8.5 16.5 20 5"/><line x1="4" y1="19" x2="14" y2="19"/>';

  function promoteToStep(project, text) {
    const step = {
      id: Date.now().toString(), text: text, done: false,
      dueDate: null, dueTime: null, projectId: project.id
    };
    state.tasks.push(step);
    saveState();
    renderProjectSteps(project);
    renderList("tasks");
    showToast(translate("stepCreated"));
    return step;
  }

  function createPromoteButton(className, onRun) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("aria-label", translate("promoteStep"));
    button.title = translate("promoteStep");
    button.innerHTML = iconSvg(ICON_PROMOTE);
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      onRun();
    });
    return button;
  }

  document.getElementById("pviewStepForm").addEventListener("submit", function (event) {
    event.preventDefault();
    const input = document.getElementById("pviewStepInput");
    const text = input.value.trim();
    const project = currentProject();
    if (!text || !project) return;
    state.tasks.push({
      id: Date.now().toString(), text: text, done: false,
      dueDate: null, dueTime: null, projectId: project.id
    });
    saveState();
    input.value = "";
    input.focus();
    renderProjectSteps(project);
    renderList("tasks");
  });

  /* JOURNAL — dated lines, newest first. It is both a log of what moved and the
     place ideas land before they become steps; it also feeds the star's glow. */
  function renderJournal(project) {
    pviewJournal.innerHTML = "";
    const entries = project.journal;
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "detail__empty";
      empty.textContent = translate("journalEmpty");
      pviewJournal.appendChild(empty);
      return;
    }
    for (let i = entries.length - 1; i >= 0; i--) {
      pviewJournal.appendChild(createJournalRow(project, entries[i]));
    }
  }

  function createJournalRow(project, entry) {
    const row = document.createElement("div");
    row.className = "jrn__row";

    const date = document.createElement("span");
    date.className = "jrn__date";
    date.textContent = milestoneDateLabel(entry.date);

    const text = document.createElement("p");
    text.className = "jrn__text";
    text.textContent = entry.text;

    // an idea already acted on shows the mark instead of the button; if its step
    // was deleted since, it becomes promotable again
    const promoted = entry.stepId && findTask(entry.stepId);
    const tail = document.createElement("span");
    tail.className = "jrn__tail";
    if (promoted) {
      const mark = document.createElement("span");
      mark.className = "jrn__done";
      mark.title = translate("promotedLabel");
      mark.innerHTML = iconSvg(ICON_PROMOTE);
      tail.appendChild(mark);
    } else {
      tail.appendChild(createPromoteButton("jrn__step", function () {
        entry.stepId = promoteToStep(project, entry.text).id;
        saveState();
        renderJournal(project);
      }));
    }

    const del = document.createElement("button");
    del.type = "button";
    del.className = "jrn__del";
    del.setAttribute("aria-label", translate("deleteAria"));
    del.textContent = "×";
    del.addEventListener("click", function () {
      for (let i = 0; i < project.journal.length; i++) {
        if (project.journal[i].id === entry.id) { project.journal.splice(i, 1); break; }
      }
      saveState();
      renderJournal(project);
    });

    tail.appendChild(del);
    row.append(date, text, tail);
    return row;
  }

  document.getElementById("pviewJournalForm").addEventListener("submit", function (event) {
    event.preventDefault();
    const input = document.getElementById("pviewJournalInput");
    const text = input.value.trim();
    const project = currentProject();
    if (!text || !project) return;
    project.journal.push({ id: Date.now().toString(), date: todayKey(), text: text });
    saveState();
    input.value = "";
    renderJournal(project);
  });

  /* DREAM WALL — free canvas of text cards. Nothing is arranged for you: the
     layout is the thought. Cards are dragged around and edited in place. */
  function renderWall(project) {
    pviewWall.innerHTML = "";
    for (let i = 0; i < project.dream.length; i++) {
      pviewWall.appendChild(createDreamCard(project, project.dream[i]));
    }
  }

  function createDreamCard(project, card) {
    const el = document.createElement("div");
    el.className = "wall__card";
    el.style.left = card.x + "%";
    el.style.top = card.y + "%";

    const text = document.createElement("textarea");
    text.className = "wall__text";
    text.value = card.text || "";
    text.placeholder = translate("dreamPlaceholder");
    text.addEventListener("input", function () {
      card.text = text.value;
      saveState();
    });

    const grip = document.createElement("span");
    grip.className = "wall__grip";
    armWallDrag(grip, el, card);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "wall__del";
    del.setAttribute("aria-label", translate("deleteAria"));
    del.textContent = "×";
    del.addEventListener("click", function () {
      for (let i = 0; i < project.dream.length; i++) {
        if (project.dream[i].id === card.id) { project.dream.splice(i, 1); break; }
      }
      saveState();
      renderWall(project);
    });

    el.append(grip, del, text);
    return el;
  }

  /* drag by the grip only, so the textarea keeps its own pointer behaviour */
  function armWallDrag(grip, el, card) {
    grip.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      const area = pviewWall.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY, cx: card.x, cy: card.y };
      el.classList.add("is-dragging");

      const move = function (moveEvent) {
        const dx = (moveEvent.clientX - start.x) / area.width * 100;
        const dy = (moveEvent.clientY - start.y) / area.height * 100;
        card.x = Math.max(0, Math.min(88, start.cx + dx));
        card.y = Math.max(0, Math.min(84, start.cy + dy));
        el.style.left = card.x + "%";
        el.style.top = card.y + "%";
      };
      const up = function () {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        el.classList.remove("is-dragging");
        saveState();
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
    });
  }

  document.getElementById("pviewDreamAdd").addEventListener("click", function () {
    const project = currentProject();
    if (!project) return;
    // drop new cards down a gentle diagonal rather than all in the same corner
    const step = project.dream.length;
    project.dream.push({
      id: Date.now().toString(), text: "",
      x: 4 + (step * 17) % 70, y: 6 + (step * 13) % 60
    });
    saveState();
    renderWall(project);
    const last = pviewWall.lastChild.querySelector(".wall__text");
    if (last) last.focus();
  });

  pviewName.addEventListener("input", function () {
    const project = currentProject();
    if (!project) return;
    project.text = pviewName.value;
    saveState();
  });

  pviewWhy.addEventListener("input", function () {
    const project = currentProject();
    if (!project) return;
    project.why = pviewWhy.value;
    fitLine(pviewWhy);
    saveState();
  });

  pviewOutcome.addEventListener("input", function () {
    const project = currentProject();
    if (!project) return;
    project.outcome = pviewOutcome.value;
    fitLine(pviewOutcome);
    saveState();
  });

  document.getElementById("pviewHorizon").addEventListener("click", function () {
    if (openProject) openCalendar(openProject, "project");
  });

  pviewIcon.addEventListener("click", openIconPickerForProject);

  pviewDone.addEventListener("click", function () {
    const project = currentProject();
    if (!project) return;
    project.done = !project.done;
    saveState();
    fillProjectView(project);
  });

  document.getElementById("pviewDelete").addEventListener("click", function () {
    const project = currentProject();
    if (!project) return;
    removeItem("projects", project.id);
    closeProjectView();
  });

  document.getElementById("pviewBack").addEventListener("click", closeProjectView);

  /* THE SKY — one star per project, read at a glance on four channels: its size is
     ambition, its glow is momentum, its ring is how far the trajectory has come and
     its colour walks the palette with that same progress. Stars are placed by hand.
     "Rangé" drops them onto axes instead — time to the horizon across, ambition up —
     and under the horizon line lie the projects nothing has happened on in a month. */
  const skyView = document.getElementById("skyView");
  const skyField = document.getElementById("skyField");
  const skyCamera = document.getElementById("skyCamera");
  const skyLinks = document.getElementById("skyLinks");
  const skyEmptyMsg = document.getElementById("skyEmpty");
  const skyHint = document.getElementById("skyHint");
  const DORMANT_DAYS = 30;
  let skyAligned = false;
  let starDragEnd = 0;   // a drag must not read as a click on the star
  let linkMode = false;
  let linkFrom = null;   // the star waiting for its pair

  function openSky() {
    skyView.hidden = false;
    renderSky();
    requestAnimationFrame(function () { skyView.classList.add("is-open"); });
  }

  function closeSky() {
    if (openProject) closeProjectView();   // the panel cannot outlive the sky it sits in
    if (linkMode) setLinkMode(false);
    skyView.classList.remove("is-open");
    setTimeout(function () { skyView.hidden = true; }, PVIEW_MS);
  }

  function renderSky() {
    const stars = skyCamera.querySelectorAll(".pstar");
    for (let i = 0; i < stars.length; i++) stars[i].remove();
    skyEmptyMsg.hidden = state.projects.length > 0;
    syncSkyMode();
    const stops = paletteStops();
    const spots = {};
    for (let i = 0; i < state.projects.length; i++) {
      const project = state.projects[i];
      const star = createStar(project, stops, i);
      spots[project.id] = { x: parseFloat(star.style.left), y: parseFloat(star.style.top) };
      skyCamera.appendChild(star);
    }
    renderLinks(spots);
    if (openProject) markFocusedStar(openProject);   // a redraw must not lose the dive
  }

  /* CONSTELLATIONS — a line between two stars, and nothing else. It carries no
     rule and blocks nothing; it is there to say that these two belong together.
     The SVG spans the field in a 0-100 box, so a star's percent spot is its
     coordinate; non-scaling-stroke keeps the line thin under the camera zoom. */
  function renderLinks(spots) {
    let markup = "";
    for (let i = 0; i < state.links.length; i++) {
      const from = spots[state.links[i].a];
      const to = spots[state.links[i].b];
      if (!from || !to) continue;   // one end is deleted and waiting on Undo
      markup += '<line x1="' + from.x + '" y1="' + from.y + '" x2="' + to.x + '" y2="' + to.y
        + '" vector-effect="non-scaling-stroke"/>';
    }
    skyLinks.innerHTML = markup;
  }

  function syncSkyMode() {
    document.getElementById("skyAxes").hidden = !skyAligned;
    document.getElementById("skyModeLabel").textContent =
      translate(skyAligned ? "skyAligned" : "skyFree");
  }

  /* Tidying the sky moves the stars that are already there rather than drawing
     new ones: the rearrangement is the whole point, and it has to be watchable. */
  function layoutStars() {
    const stars = skyCamera.querySelectorAll(".pstar");
    const spots = {};
    for (let i = 0; i < stars.length; i++) {
      const project = findItem("projects", stars[i].dataset.id);
      if (!project) continue;
      const spot = starSpot(project, i, stars[i].classList.contains("is-dormant"));
      stars[i].style.left = spot.x + "%";
      stars[i].style.top = spot.y + "%";
      spots[project.id] = spot;
    }
    renderLinks(spots);   // the constellations follow the stars they join
  }

  function createStar(project, stops, index) {
    const progress = milestoneProgress(project);
    const momentum = projectMomentum(project);
    const silence = projectSilence(project);
    const dormant = silence >= DORMANT_DAYS && !project.done;
    const color = paletteColorAt(stops, progress);
    const spot = starSpot(project, index, dormant);

    const star = document.createElement("button");
    star.type = "button";
    star.className = "pstar";
    if (dormant) star.classList.add("is-dormant");
    if (project.done) star.classList.add("is-done");
    star.setAttribute("aria-label", translate("skyOpenAria") + " " + project.text);
    star.dataset.id = project.id;
    star.style.left = spot.x + "%";
    star.style.top = spot.y + "%";
    star.style.setProperty("--star-color", color);
    star.style.setProperty("--star-size", (11 + (project.importance || 0) * 3.4) + "px");
    star.style.setProperty("--star-glow", momentum.toFixed(2));
    star.style.animationDuration = (7 - momentum * 4).toFixed(1) + "s";

    star.innerHTML = STAR_MARKUP;
    star.querySelector(".pstar__arc").setAttribute("stroke-dashoffset",
      (STAR_RING_LENGTH * (1 - progress)).toFixed(1));

    const name = document.createElement("span");
    name.className = "pstar__name";
    name.textContent = project.text;
    star.appendChild(name);

    if (dormant) {
      const since = document.createElement("span");
      since.className = "pstar__since";
      since.textContent = translate("dormantFor") + " " + silence + " " + translate("daysShort");
      star.appendChild(since);
    }

    armStarDrag(star, project);
    // diving in leaves the sky open underneath, so going back surfaces into it
    star.addEventListener("click", function () {
      if (Date.now() < starDragEnd) return;   // the click that ends a drag
      if (linkMode) { pickForLink(project.id); return; }
      openProjectView(project.id);
    });
    return star;
  }

  /* halo, ring and core; JS only writes the arc offset and the custom properties */
  const STAR_RING_LENGTH = 100.5;   // 2 * PI * 16
  const STAR_MARKUP = '<span class="pstar__glow"></span>'
    + '<svg class="pstar__ring" viewBox="0 0 36 36" aria-hidden="true">'
    + '<circle class="pstar__track" cx="18" cy="18" r="16"/>'
    + '<circle class="pstar__arc" cx="18" cy="18" r="16" stroke-dasharray="'
    + STAR_RING_LENGTH + '"/></svg>'
    + '<span class="pstar__core"></span>';

  /* share of the trajectory reached, the start anchor not counting as a step */
  function milestoneProgress(project) {
    const milestones = project.milestones || [];
    let done = 0;
    let total = 0;
    for (let i = 1; i < milestones.length; i++) {
      total++;
      if (milestones[i].completedDate) done++;
    }
    return total ? done / total : 0;
  }

  /* Where a star is drawn. Placed by hand normally; on the axes when the sky is
     tidied; and pulled down to the dormant band when nothing has happened for a
     month — the stored spot is left alone, so reviving it puts it back. */
  function starSpot(project, index, dormant) {
    if (dormant) return { x: project.sky.x, y: 87 + (index % 3) * 2 };
    if (!skyAligned) return project.sky;
    let x;
    if (!project.targetDate) x = 92;                 // no horizon: parked at "someday"
    else {
      const days = Math.max(0, daysUntil(project.targetDate));
      x = 9 + Math.min(1, Math.log(days + 1) / Math.log(366)) * 74;
    }
    // same importance and no date would stack them, so fan them out slightly
    return { x: x, y: 64 - (project.importance || 0) * 9 + (index % 3 - 1) * 4 };
  }

  /* how alive a project is: what happened over the last three weeks, the most
     recent days weighing most. 0 is dead quiet, 1 is a project moving daily. */
  function projectMomentum(project) {
    const dates = activityDates(project);
    let score = 0;
    for (let i = 0; i < dates.length; i++) {
      const age = daysSince(dates[i]);
      if (age < 0 || age > 21) continue;
      score += 1 - age / 21;
    }
    return Math.min(1, score / 3);
  }

  /* every dated trace a project leaves: milestones reached, journal lines, steps ticked */
  function activityDates(project) {
    const dates = [];
    const milestones = project.milestones || [];
    for (let i = 0; i < milestones.length; i++) {
      if (milestones[i].completedDate) dates.push(milestones[i].completedDate);
    }
    for (let i = 0; i < project.journal.length; i++) dates.push(project.journal[i].date);
    const steps = projectTasks(project.id);
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].doneDate) dates.push(steps[i].doneDate);
    }
    return dates;
  }

  function daysSince(isoDate) { return -daysUntil(isoDate); }

  /* days since the last trace. A project that never had one falls back on its own
     age, so a brand new star doesn't start out under the horizon. */
  function projectSilence(project) {
    const dates = activityDates(project);
    let quietest = null;
    for (let i = 0; i < dates.length; i++) {
      const age = daysSince(dates[i]);
      if (quietest === null || age < quietest) quietest = age;
    }
    if (quietest !== null) return Math.max(0, quietest);
    const born = Number(project.id);
    if (!born) return 0;
    return Math.max(0, Math.floor((Date.now() - born) / 86400000));
  }

  /* THE CAMERA — opening a project must not cover the sky with a new page. The
     whole starfield slides instead, until the chosen star sits on the left (up top
     on a narrow screen) with the workspace opening in the space it just left. The
     star stays on screen the whole time, so nothing is ever lost sight of. */
  const STAR_ZOOM = 1.18;

  function focusStar(project) {
    markFocusedStar(project.id);
    const star = skyCamera.querySelector('.pstar[data-id="' + project.id + '"]');
    if (!star) return;
    const area = skyField.getBoundingClientRect();
    const x = parseFloat(star.style.left) / 100 * area.width;
    const y = parseFloat(star.style.top) / 100 * area.height;
    // the panel takes the right half, or the bottom of a narrow screen
    const narrow = window.matchMedia("(max-width: 860px)").matches;
    const restX = narrow ? area.width * 0.5 : area.width * 0.2;
    const restY = narrow ? area.height * 0.17 : area.height * 0.42;
    skyCamera.style.transform = "translate(" + Math.round(restX - x * STAR_ZOOM) + "px, "
      + Math.round(restY - y * STAR_ZOOM) + "px) scale(" + STAR_ZOOM + ")";
  }

  function markFocusedStar(projectId) {
    const stars = skyCamera.querySelectorAll(".pstar");
    for (let i = 0; i < stars.length; i++) {
      stars[i].classList.toggle("is-focused", stars[i].dataset.id === projectId);
    }
    skyView.classList.add("is-diving");
  }

  function resetCamera() {
    skyCamera.style.transform = "";
    skyView.classList.remove("is-diving");
    const stars = skyCamera.querySelectorAll(".pstar");
    for (let i = 0; i < stars.length; i++) stars[i].classList.remove("is-focused");
  }

  // the frame changed size, so the star is no longer where it was aimed at
  window.addEventListener("resize", function () {
    const project = currentProject();
    if (project && !skyView.hidden) focusStar(project);
  });

  // clicking the empty sky drops the pending link, or surfaces back out of the project
  skyField.addEventListener("click", function (event) {
    if (event.target.closest(".pstar")) return;
    if (linkFrom) { linkFrom = null; markLinkPending(); return; }
    if (openProject) closeProjectView();
  });

  /* Drag a star anywhere in the free sky; the tidied sky is arranged, not moved. */
  function armStarDrag(star, project) {
    star.addEventListener("pointerdown", function (event) {
      // the tidied sky is arranged, a sunk star is not where it was put, and a
      // dive has the camera moving under us
      if (skyAligned || openProject || star.classList.contains("is-dormant")) return;
      star.setPointerCapture(event.pointerId);
      const area = skyField.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY, sx: project.sky.x, sy: project.sky.y };
      let moved = false;

      const move = function (moveEvent) {
        const dx = moveEvent.clientX - start.x;
        const dy = moveEvent.clientY - start.y;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;   // a plain click stays a click
        moved = true;
        star.classList.add("is-dragging");
        project.sky.x = Math.max(3, Math.min(97, start.sx + dx / area.width * 100));
        project.sky.y = Math.max(4, Math.min(80, start.sy + dy / area.height * 100));
        star.style.left = project.sky.x + "%";
        star.style.top = project.sky.y + "%";
      };
      const up = function () {
        star.removeEventListener("pointermove", move);
        star.removeEventListener("pointerup", up);
        star.classList.remove("is-dragging");
        if (!moved) return;
        starDragEnd = Date.now() + 250;
        saveState();
      };
      star.addEventListener("pointermove", move);
      star.addEventListener("pointerup", up);
    });
  }

  /* Two clicks make a constellation, and a third pass on the same pair breaks it.
     The lines are hidden while the stars travel, otherwise they would snap to the
     arrival before the stars get there. */
  const STAR_MOVE_MS = 560;   // matches the left/top transition on .pstar

  function pickForLink(projectId) {
    if (!linkFrom || linkFrom === projectId) {
      linkFrom = linkFrom === projectId ? null : projectId;
      markLinkPending();
      return;
    }
    toggleLink(linkFrom, projectId);
    linkFrom = null;
    renderSky();
  }

  function toggleLink(a, b) {
    for (let i = 0; i < state.links.length; i++) {
      const link = state.links[i];
      if ((link.a === a && link.b === b) || (link.a === b && link.b === a)) {
        state.links.splice(i, 1);
        saveState();
        return;
      }
    }
    state.links.push({ a: a, b: b });
    saveState();
  }

  function markLinkPending() {
    const stars = skyCamera.querySelectorAll(".pstar");
    for (let i = 0; i < stars.length; i++) {
      stars[i].classList.toggle("is-linking", stars[i].dataset.id === linkFrom);
    }
  }

  function setLinkMode(on) {
    linkMode = on;
    linkFrom = null;
    skyView.classList.toggle("is-linking", on);
    skyHint.hidden = !on;
    const button = document.getElementById("skyLink");
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
    markLinkPending();
  }

  document.getElementById("skyLink").addEventListener("click", function () {
    setLinkMode(!linkMode);
  });

  document.getElementById("skyMode").addEventListener("click", function () {
    skyAligned = !skyAligned;
    syncSkyMode();
    skyLinks.style.opacity = "0";
    layoutStars();
    setTimeout(function () { skyLinks.style.opacity = ""; }, STAR_MOVE_MS);
  });

  document.getElementById("skyAdd").addEventListener("click", function () {
    const project = newProject();
    openProjectView(project.id);
    pviewName.focus();
    pviewName.select();
  });

  document.getElementById("skyBack").addEventListener("click", closeSky);
  document.getElementById("skyBtn").addEventListener("click", openSky);

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (linkMode) setLinkMode(false);
    else if (!projectView.hidden) closeProjectView();
    else if (!skyView.hidden) closeSky();
  });

  /* live rename */
  detailName.addEventListener("input", function () {
    const item = currentDetailItem();
    if (!item) return;
    item.text = detailName.value;
    saveState();
    refreshDetailSource();
  });

  /* auto-saved notes */
  /* grow the notes field to its content: empty notes cost a single line */
  function fitNotes() {
    detailNotes.style.height = "auto";
    detailNotes.style.height = detailNotes.scrollHeight + "px";
  }

  detailNotes.addEventListener("input", function () {
    fitNotes();
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

  detailBell.addEventListener("click", function () {
    const item = currentDetailItem();
    if (!item) return;
    item.important = !item.important;
    saveState();
    detailBell.classList.toggle("is-on", !!item.important);
    detailBell.setAttribute("aria-pressed", item.important ? "true" : "false");
    refreshDetailSource();   // calendar bell and row highlight
  });
  detailWhen.addEventListener("click", function () {
    const item = currentDetailItem();
    if (item) openCalendar(item.id, detailTarget.kind === "events" ? "events" : "tasks");
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

  document.getElementById("detailDelete").addEventListener("click", function () {
    if (detailTarget.kind === "events") removeEvent(detailTarget.id);
    else removeItem(detailTarget.kind, detailTarget.id);
    closeDetail();   // deleting steps back out of the row
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && openHost) closeDetail();
  });

  /* EVENTS — a calendar in the main view. Clicking a day opens that day's
     events (add + list); each event is a task-like item with its own detail. */
  const ecalGrid = document.getElementById("ecalGrid");
  const ecalViewport = document.getElementById("ecalViewport");
  const ecalToggle = document.getElementById("ecalToggle");
  let ecalYear = new Date().getFullYear();
  let ecalMonth = new Date().getMonth();
  let calExpanded = false;   // folded to a single week by default
  let weekStart = mondayOf(new Date());   // Monday of the week on show

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
  function createCalDay(key, dayNumber, row) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = key === todayKey() ? "ecal__day is-today" : "ecal__day";
    cell.dataset.key = key;
    cell.dataset.row = row;

    const num = document.createElement("span");
    num.textContent = String(dayNumber);
    cell.appendChild(num);

    const dayEvents = eventsOnDay(key);
    if (dayEvents.length) {
      const dots = document.createElement("span");   // one dot per event, along the bottom
      dots.className = "ecal__dots";
      const shown = Math.min(dayEvents.length, 3);
      let hasImportant = false;
      for (let k = 0; k < dayEvents.length; k++) {
        if (dayEvents[k].important) { hasImportant = true; break; }
      }
      for (let k = 0; k < shown; k++) {
        const dot = document.createElement("span");
        dot.className = "ecal__dot";
        dots.appendChild(dot);
      }
      cell.appendChild(dots);
      if (hasImportant) {   // a red bell in the top-right corner, away from the dots
        const bell = document.createElement("span");
        bell.className = "ecal__bell";
        bell.innerHTML = iconSvg(ICON_BELL);
        cell.appendChild(bell);
      }
      cell.appendChild(eventPreview(dayEvents));
    }
    cell.addEventListener("click", function () { showDay(key); });
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
  /* The two views navigate on their own axis: folded you walk week by week,
     unfolded month by month. Each keeps the other in step, so folding and
     unfolding always lands on the period you were looking at. */
  function mondayOf(date) {
    const day = new Date(date);
    day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
    return dateKey(day.getFullYear(), day.getMonth(), day.getDate());
  }
  /* a week belongs to the month of its Thursday, so a split week reads as one */
  function weekAnchorKey() { return shiftDateKey(weekStart, 3); }

  function syncMonthToWeek() {
    const anchor = new Date(weekAnchorKey() + "T00:00");
    ecalYear = anchor.getFullYear();
    ecalMonth = anchor.getMonth();
  }
  function syncWeekToMonth() {
    const now = new Date();
    const onThisMonth = now.getFullYear() === ecalYear && now.getMonth() === ecalMonth;
    weekStart = mondayOf(onThisMonth ? now : new Date(ecalYear, ecalMonth, 1));
  }

  function renderEventCal() {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const shown = calExpanded ? new Date(ecalYear, ecalMonth, 1) : new Date(weekAnchorKey() + "T00:00");
    document.getElementById("ecalMonth").textContent =
      shown.toLocaleDateString(locale, { month: "long", year: "numeric" });

    ecalGrid.innerHTML = "";
    appendWeekdayHeads(ecalGrid);

    if (!calExpanded) {
      const monday = new Date(weekStart + "T00:00");
      for (let i = 0; i < 7; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        ecalGrid.appendChild(createCalDay(dateKey(day.getFullYear(), day.getMonth(), day.getDate()), day.getDate(), 0));
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
      ecalGrid.appendChild(createCalDay(dateKey(ecalYear, ecalMonth, d), d, Math.floor((lead + d - 1) / 7)));
    }
  }

  /* Unfold or fold the month in place. Three things move together: the viewport
     grows, the grid slides so the week you were already looking at travels to
     its real row instead of teleporting, and the other rows drop in one after
     another from the top. The viewport is only clipped for the length of the
     move, so hover previews stay free to overflow the rest of the time. */
  const CAL_MS = 480;
  let calTimer = null;

  function cellTop(key) {
    const cell = ecalGrid.querySelector('[data-key="' + key + '"]');
    return cell ? cell.getBoundingClientRect().top : null;
  }

  function toggleCalendar() {
    const anchor = weekAnchorKey();          // the day both views have in common
    const fromHeight = ecalViewport.getBoundingClientRect().height;
    const fromTop = cellTop(anchor);

    calExpanded = !calExpanded;
    if (calExpanded) syncMonthToWeek();
    else syncWeekToMonth();
    renderEventCal();

    const toTop = cellTop(anchor);
    const slide = (fromTop != null && toTop != null) ? fromTop - toTop : 0;

    ecalViewport.style.overflow = "hidden";
    ecalViewport.style.height = fromHeight + "px";
    ecalGrid.style.transition = "none";
    ecalGrid.style.transform = "translateY(" + slide.toFixed(1) + "px)";
    ecalGrid.offsetWidth;                    // commit both start states
    ecalGrid.style.transition = "";
    ecalViewport.style.height = ecalGrid.getBoundingClientRect().height + "px";

    // the shared row is already in place; the rest unfolds behind it
    if (calExpanded) {
      const cells = ecalGrid.querySelectorAll(".ecal__day");
      const anchorRow = ecalGrid.querySelector('[data-key="' + anchor + '"]');
      const skip = anchorRow ? anchorRow.dataset.row : null;
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].dataset.row === skip) continue;
        cells[i].classList.add("is-unfolding");
        cells[i].style.animationDelay = (Number(cells[i].dataset.row) * 45) + "ms";
      }
    }

    requestAnimationFrame(function () { ecalGrid.style.transform = ""; });

    ecalToggle.classList.toggle("is-open", calExpanded);
    ecalToggle.setAttribute("aria-expanded", calExpanded ? "true" : "false");

    clearTimeout(calTimer);
    calTimer = setTimeout(function () {
      ecalViewport.style.height = "";
      ecalViewport.style.overflow = "";
    }, CAL_MS + 260);
  }
  ecalToggle.addEventListener("click", toggleCalendar);
  document.getElementById("dayToday").addEventListener("click", function () { showDay(todayKey()); });

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

  /* folded, the arrows walk a week at a time; unfolded, a month at a time */
  function stepCalendar(direction) {
    if (calExpanded) {
      ecalMonth += direction;
      if (ecalMonth < 0) { ecalMonth = 11; ecalYear--; }
      if (ecalMonth > 11) { ecalMonth = 0; ecalYear++; }
      syncWeekToMonth();
    } else {
      weekStart = shiftDateKey(weekStart, direction * 7);
      syncMonthToWeek();
    }
    renderEventCal();
  }
  document.getElementById("ecalPrev").addEventListener("click", function () { stepCalendar(-1); });
  document.getElementById("ecalNext").addEventListener("click", function () { stepCalendar(1); });


  function openEventDetail(event, host) {
    detailTarget = { kind: "events", id: event.id };
    const mounted = host ? mountEditor(host) : false;
    fillDetail(event);
    if (mounted) openFold(host);
  }

  function addEvent(key, text, time, important) {
    state.events.push({
      id: Date.now().toString(), text: text, important: !!important,
      icon: "calendar", date: key, time: time || ""
    });
    saveState();
    renderEventCal();
    renderDailyTimeline();
  }

  function removeEvent(id) {
    removeWithUndo("events", id, function () {
      renderEventCal();
      renderDailyTimeline();
    });
  }


  /* DAILY TIMELINE — a 24h window that rides the clock instead of framing the
     calendar day: the present is pinned a third of the way in, and the rule
     slides underneath it. Everything on the rule is placed by its position in
     that window, so the view crosses midnight without a seam. */
  const DAY_MS = 86400000;
  const SPAN_MS = 16 * 3600000;    // how much time the rule shows
  const NOW_ANCHOR = 1 / 3;        // where "now" sits: a third in, so more future than past

  /* the moment the rule is drawn around — the clock, unless the user is
     dragging the timeline (an option), in which case it is shifted */
  let scrubOffset = 0;
  function refTime() { return Date.now() + scrubOffset; }
  function windowStartMs() { return refTime() - SPAN_MS * NOW_ANCHOR; }

  /* a moment's position across the rule, in percent (may fall outside 0-100) */
  function timePct(ms, windowStart) {
    return (ms - windowStart) / SPAN_MS * 100;
  }

  function toMinutes(hhmm) {
    const parts = hhmm.split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function todaySun() {
    return (state.sun && state.sun.date === todayKey() && state.sun.sunrise) ? state.sun : null;
  }

  /* THE SKY RAMP — minutes from the horizon crossing, and the colour the sky is
     then. Negative is below the horizon. Twilight genuinely runs through indigo
     and rose before it turns blue; fading straight from orange to night was what
     made the rule pass through mud. The same table colours the strip and lights
     the cursor, so the two can never disagree. */
  const SKY_RAMP = [
    [-75, [23, 30, 56]],      // night
    [-52, [40, 47, 92]],      // nautical twilight
    [-32, [86, 62, 118]],     // the violet band
    [-16, [173, 92, 122]],    // the rose that follows it
    [-6,  [225, 121, 106]],   // the horizon catches fire
    [0,   [246, 150, 88]],    // the disc clears it
    [22,  [255, 186, 116]],
    [60,  [255, 214, 158]],
    [105, [255, 227, 178]]    // full day
  ];

  function rgbText(rgb) { return "rgb(" + rgb[0] + " " + rgb[1] + " " + rgb[2] + ")"; }
  function mixRgb(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t),
            Math.round(a[1] + (b[1] - a[1]) * t),
            Math.round(a[2] + (b[2] - a[2]) * t)];
  }

  /* the sky at `offset` minutes from the nearest horizon crossing. Straight sRGB
     is honest here: the ramp is fine enough that no segment spans a hue jump. */
  function rampColor(offset) {
    if (offset <= SKY_RAMP[0][0]) return SKY_RAMP[0][1];
    const last = SKY_RAMP[SKY_RAMP.length - 1];
    if (offset >= last[0]) return last[1];
    for (let i = 1; i < SKY_RAMP.length; i++) {
      if (offset > SKY_RAMP[i][0]) continue;
      const from = SKY_RAMP[i - 1];
      const to = SKY_RAMP[i];
      return mixRgb(from[1], to[1], (offset - from[0]) / (to[0] - from[0]));
    }
    return last[1];
  }

  /* how far a moment sits from the horizon: positive above it, negative below */
  function sunOffset(nowMin, srMin, ssMin) {
    if (nowMin < srMin) return nowMin - srMin;
    if (nowMin > ssMin) return ssMin - nowMin;
    return Math.min(nowMin - srMin, ssMin - nowMin);
  }

  /* the daylight colours laid over the window; the window can straddle midnight,
     so the stops are generated day by day. Sunrise and sunset move about a
     minute a day, so reusing today's times for the neighbours is invisible. */
  function stripGradient(sun, windowStart) {
    if (!sun) return "linear-gradient(90deg in oklab, var(--dtl-night), var(--dtl-day) 50%, var(--dtl-night))";
    const srMin = toMinutes(sun.sunrise);
    const ssMin = toMinutes(sun.sunset);
    const midday = (srMin + ssMin) / 2;
    const firstDay = new Date(windowStart);
    firstDay.setHours(0, 0, 0, 0);

    const parts = [];
    for (let d = -1; d <= 1; d++) {
      const base = firstDay.getTime() + d * DAY_MS;
      const at = function (minutes) {
        return ((base + minutes * 60000 - windowStart) / SPAN_MS * 100).toFixed(2) + "%";
      };
      for (let i = 0; i < SKY_RAMP.length; i++) {
        parts.push(rgbText(SKY_RAMP[i][1]) + " " + at(srMin + SKY_RAMP[i][0]));
      }
      parts.push(rgbText(SKY_RAMP[SKY_RAMP.length - 1][1]) + " " + at(midday));
      for (let i = SKY_RAMP.length - 1; i >= 0; i--) {   // the same ramp, mirrored
        parts.push(rgbText(SKY_RAMP[i][1]) + " " + at(ssMin - SKY_RAMP[i][0]));
      }
    }
    return "linear-gradient(90deg in oklab, " + parts.join(", ") + ")";
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

  /* the rule under the line: a tick every hour, taller and labelled every three,
     plus a marked line at midnight carrying the date of the day that begins */
  function renderDtlTicks(windowStart) {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const ticks = document.getElementById("dtlTicks");
    ticks.innerHTML = "";

    const first = new Date(windowStart);
    first.setMinutes(0, 0, 0);
    if (first.getTime() < windowStart) first.setHours(first.getHours() + 1);

    for (let hour = new Date(first); hour.getTime() <= windowStart + SPAN_MS; hour.setHours(hour.getHours() + 1)) {
      const h = hour.getHours();
      const left = timePct(hour.getTime(), windowStart).toFixed(2) + "%";
      const midnight = h === 0;
      const major = midnight || h % 2 === 0;   // a shorter window can label more often

      const tick = document.createElement("span");
      tick.className = midnight ? "dtl__tick is-day-break" : (major ? "dtl__tick is-major" : "dtl__tick");
      tick.style.left = left;
      ticks.appendChild(tick);
      if (!major) continue;

      const label = document.createElement("span");
      label.className = midnight ? "dtl__tick-label is-day-break" : "dtl__tick-label";
      label.style.left = left;
      label.textContent = midnight
        ? hour.toLocaleDateString(locale, { day: "numeric", month: "short" })
        : (h < 10 ? "0" : "") + h + ":00";
      ticks.appendChild(label);
    }
  }

  /* just the rule: this is what a scrub redraws, dozens of times a second */
  function renderTimeRule() {
    const sun = todaySun();
    const windowStart = windowStartMs();
    document.getElementById("dtlStrip").style.background = stripGradient(sun, windowStart);
    renderDtlTicks(windowStart);

    const markers = document.getElementById("dtlMarkers");
    const cursor = document.getElementById("dtlCursor");
    markers.innerHTML = "";

    if (sun) {
      const srMin = toMinutes(sun.sunrise);
      const ssMin = toMinutes(sun.sunset);
      const firstDay = new Date(windowStart);
      firstDay.setHours(0, 0, 0, 0);
      // one sunrise and one sunset always land in a 24h window, but which day
      // they belong to depends on where the window starts
      for (let d = 0; d <= 1; d++) {
        const base = firstDay.getTime() + d * DAY_MS;
        const rise = timePct(base + srMin * 60000, windowStart);
        const set = timePct(base + ssMin * 60000, windowStart);
        if (rise >= 0 && rise <= 100) markers.appendChild(sunMarker(sun.sunrise, "sunriseLabel", rise));
        if (set >= 0 && set <= 100) markers.appendChild(sunMarker(sun.sunset, "sunsetLabel", set));
      }
      updateCursor(cursor, srMin, ssMin);
      cursor.hidden = false;
    } else {
      cursor.hidden = true;
    }

    renderEventTicks(windowStart);
    fieldWake();   // the block field carries the sun's light, so it repaints too
  }

  function renderDailyTimeline() {
    const sun = todaySun();
    renderTimeRule();

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

    renderTodayEvents();
  }

  /* SCRUBBING (optional) — drag the rule and the reference moment moves with
     it, theme included, then eases back to the real clock on its own. */
  const SCRUB_HOLD_MS = 900;      // pause before the clock reels itself back in
  const SCRUB_RETURN_MS = 1600;
  const dtlEl = document.getElementById("dtl");
  let scrubDrag = null;
  let scrubHold = null;
  let scrubFrame = 0;
  let lastAutoTheme = null;

  /* the time-of-day theme follows the scrubbed hour, but only re-applied when
     it actually changes — applyTheme touches the meta tag and every button */
  function syncScrubTheme() {
    if (state.settings.theme !== "auto") return;
    const next = timeTheme();
    if (next === lastAutoTheme) return;
    lastAutoTheme = next;
    applyTheme("auto");
  }

  function scrubTo(offset) {
    scrubOffset = offset;
    renderTimeRule();
    syncScrubTheme();
  }

  /* ease the offset back to zero, so the day drifts home instead of snapping */
  function releaseScrub() {
    cancelAnimationFrame(scrubFrame);
    const from = scrubOffset;
    if (!from) return;
    const startedAt = performance.now();
    const step = function (at) {
      const t = Math.min(1, (at - startedAt) / SCRUB_RETURN_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      scrubTo(Math.round(from * (1 - eased)));
      if (t < 1) scrubFrame = requestAnimationFrame(step);
    };
    scrubFrame = requestAnimationFrame(step);
  }

  dtlEl.addEventListener("pointerdown", function (event) {
    if (!state.settings.timeScrub) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest(".dtl__etick")) return;   // event ticks stay clickable
    event.preventDefault();
    dtlEl.setPointerCapture(event.pointerId);
    cancelAnimationFrame(scrubFrame);
    clearTimeout(scrubHold);
    scrubDrag = { x: event.clientX, from: scrubOffset, width: dtlEl.getBoundingClientRect().width };
    dtlEl.classList.add("is-scrubbing");
  });

  dtlEl.addEventListener("pointermove", function (event) {
    if (!scrubDrag) return;
    // dragging the rule left brings later hours under the anchor
    const moved = (scrubDrag.x - event.clientX) / scrubDrag.width * SPAN_MS;
    scrubTo(scrubDrag.from + moved);
  });

  function endScrub() {
    if (!scrubDrag) return;
    scrubDrag = null;
    dtlEl.classList.remove("is-scrubbing");
    scrubHold = setTimeout(releaseScrub, SCRUB_HOLD_MS);
  }
  dtlEl.addEventListener("pointerup", endScrub);
  dtlEl.addEventListener("pointercancel", endScrub);

  /* Place the cursor on the bar and light it with the sky it stands in: gold at
     noon, rose as it nears the horizon, pale moonlight once under it. Close to
     the crossing the halo stretches sideways, the way a low sun smears along a
     sea horizon; high or deep in the night it draws back to a round bloom. */
  function updateCursor(cursor, srMin, ssMin) {
    const at = new Date(refTime());
    const nowMin = at.getHours() * 60 + at.getMinutes();
    cursor.style.left = (NOW_ANCHOR * 100) + "%";   // the present never moves

    const offset = sunOffset(nowMin, srMin, ssMin);
    const sky = rampColor(offset);
    // a dark sky would give a halo nobody can see, so lift it to a steady glow
    const lum = (sky[0] * .2126 + sky[1] * .7152 + sky[2] * .0722) / 255;
    const core = mixRgb(sky, [255, 251, 242], Math.max(0, .8 - lum));

    // one colour for the whole halo: tinting the tail towards the sky made it
    // vanish at night, leaving a round disc where the day had a long smear
    cursor.style.setProperty("--sun-core", rgbText(core));
    cursor.style.setProperty("--flare", Math.max(0, 1 - Math.abs(offset) / 75).toFixed(2));
  }

  /* one tick per timed event, placed on the bar at its hour (hover shows it) */
  function renderEventTicks(windowStart) {
    const layer = document.getElementById("dtlEticks");
    layer.innerHTML = "";
    // the window straddles midnight, so yesterday and tomorrow can show up too
    const anchorKey = dateKeyOf(new Date(refTime()));
    const dayEvents = eventsOnDay(shiftDateKey(anchorKey, -1))
      .concat(eventsOnDay(anchorKey), eventsOnDay(shiftDateKey(anchorKey, 1)));
    for (let i = 0; i < dayEvents.length; i++) {
      const event = dayEvents[i];
      if (!event.time) continue;
      const at = new Date(event.date + "T" + event.time).getTime();
      const pct = timePct(at, windowStart);
      if (pct < 0 || pct > 100) continue;
      const tick = document.createElement("button");
      tick.type = "button";
      tick.className = "dtl__etick";
      tick.style.left = pct.toFixed(2) + "%";
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

  /* The section under the calendar is the day view. Clicking a day in the grid
     retitles it instead of opening a window: the answer appears where the eye
     is already travelling. */
  let sectionDay = null;   // null means today

  function showDay(key) {
    sectionDay = key === todayKey() ? null : key;
    renderTodayEvents();
  }

  function renderTodayEvents() {
    if (listsLocked("events")) return;
    const box = document.getElementById("todayEvents");
    const key = sectionDay || todayKey();
    box.innerHTML = "";

    document.getElementById("dayTitle").textContent =
      sectionDay ? fullDateLabel(key) : translate("todayTitle");
    document.getElementById("dayToday").hidden = !sectionDay;

    const list = eventsOnDay(key).slice().sort(eventTimeSort);
    for (let i = 0; i < list.length; i++) box.appendChild(todayEventRow(list[i]));
  }

  /* the day on show has the last word: a bare time belongs to it, not to today */
  function quickEventDay(parsed) {
    return !parsed.date || parsed.inferred ? (sectionDay || todayKey()) : parsed.date;
  }

  wireQuickAdd({
    form: "quickEvent", input: "quickEventInput", mirror: "quickEventMirror",
    hint: "quickEventHint", button: "addEventBtn",
    flagLabel: "importantLabel", fallbackName: "newEventName",
    resolveDate: quickEventDay,
    submit: function (parsed, title, day) {
      addEvent(day, title, parsed.time, parsed.flag);
      goToDay(day);   // follow the day it landed on rather than lose it from view
    }
  });

  /* bring both the grid and the day view onto a day */
  function goToDay(key) {
    const day = new Date(key + "T00:00");
    ecalYear = day.getFullYear();
    ecalMonth = day.getMonth();
    weekStart = mondayOf(day);
    renderEventCal();
    showDay(key);
  }

  /* an event under the gauge: a rectangle with icon, title, and time on the right */
  function todayEventRow(event) {
    // a row that holds an editor cannot be a <button>: it would swallow the fields
    const row = document.createElement("div");
    row.className = "day-event is-" + eventStatus(event) + (event.important ? " is-important" : "");
    row.dataset.event = event.id;
    const fold = createUnfold();
    row.addEventListener("click", function (click) {
      if (click.target.closest(".unfold, .detail__titlerow")) return;
      if (Date.now() < dragEndedAt) return;          // the click that ends a swipe
      if (row.classList.contains("is-open")) { closeDetail(); return; }
      openEventDetail(event, fold.firstChild);
    });

    const icon = document.createElement("span");
    icon.className = "day-event__ico";
    icon.innerHTML = habitSvg(event.icon || "calendar");
    row.appendChild(icon);

    const title = document.createElement("span");
    title.className = "day-event__title";
    title.textContent = event.text;
    const slot = document.createElement("span");
    slot.className = "day-event__slot";
    row.append(title, slot);

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

    row.appendChild(createRowActions([
      rowAction("when", ICON_WHEN, "rescheduleLabel", function () {
        openCalendar(event.id, "events");
      }),
      rowAction("del", ICON_TRASH, "deleteAria", function () { removeEvent(event.id); })
    ]));
    armSwipe(row);

    row.appendChild(fold);
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
    notes: closeNotes, noteEditor: closeNoteEditor
  };
  const detailBackdrops = document.querySelectorAll(".detail__backdrop");
  for (let i = 0; i < detailBackdrops.length; i++) {
    const view = detailBackdrops[i].parentNode;
    detailBackdrops[i].addEventListener("click", detailClosers[view.id]);
  }

  /* THE TWO SPACES — work and well-being sit on one rail under the day line,
     and the switch above slides between them. */
  const pagesEl = document.getElementById("pages");
  const pagesTrack = document.getElementById("pagesTrack");
  const workPage = document.getElementById("workPage");
  const wellPage = document.getElementById("wellPage");
  const pageFlip = document.getElementById("pageFlip");
  let wellOpen = false;

  /* The rail is as tall as the space on show. Switching spaces animates it;
     content merely growing must not, or the page trails half a second behind
     the fold that caused it. */
  function syncPagesHeight(animate) {
    const height = (wellOpen ? wellPage.offsetHeight : workPage.offsetHeight) + "px";
    if (animate) { pagesEl.style.height = height; return; }
    pagesEl.style.transition = "none";
    pagesEl.style.height = height;
    pagesEl.offsetHeight;                 // commit before the transition returns
    pagesEl.style.transition = "";
  }

  function setWellOpen(open) {
    wellOpen = open;
    pagesTrack.style.transform = "translateX(" + (open ? -50 : 0) + "%)";
    pageFlip.classList.toggle("is-open", open);
    pageFlip.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("is-well", open);   // the room's light
    // the field sweeps the way the pages went, from the edge they came from
    startFieldFlash(open ? innerWidth : 0, innerHeight * .4);
    syncPagesHeight(true);
  }

  pageFlip.addEventListener("click", function () { setWellOpen(!wellOpen); });
  window.addEventListener("resize", function () { syncPagesHeight(false); });

  /* touch only: a horizontal swipe crosses between the two spaces. Mouse drags
     are left alone so they never fight the row reordering. */
  let pageSwipe = null;
  let pageSwipeUntil = 0;
  pagesEl.addEventListener("pointerdown", function (event) {
    pageSwipe = event.pointerType === "mouse" ? null : { x: event.clientX, y: event.clientY };
  });
  pagesEl.addEventListener("pointerup", function (event) {
    if (!pageSwipe) return;
    const dx = event.clientX - pageSwipe.x;
    const dy = event.clientY - pageSwipe.y;
    pageSwipe = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return;   // clearly horizontal
    pageSwipeUntil = Date.now() + 350;
    setWellOpen(dx < 0);   // swipe left reveals well-being, right goes back
  });
  pagesEl.addEventListener("click", function (event) {
    if (Date.now() < pageSwipeUntil) { event.stopPropagation(); event.preventDefault(); }
  }, true);

  // content grows and shrinks all the time; the rail follows without bookkeeping
  if (window.ResizeObserver) {
    const pageWatcher = new ResizeObserver(function () { syncPagesHeight(false); });
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
    if (linkMode) { setLinkMode(false); return true; }
    if (!projectView.hidden) { closeProjectView(); return true; }
    if (!skyView.hidden) { closeSky(); return true; }
    if (!focusOverlay.hidden) { closeFocus(); return true; }
    if (openHost) { closeDetail(); return true; }   // fold the open object back
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
  renderDailyTimeline();
  buildIconPicker();
  checkReminders();
  checkSleepReminder();
  setInterval(function () { checkReminders(); checkSleepReminder(); }, 30000);
  renderGreeting();
  renderWelcomeHabits();
  initSky();
  applyDecorations();
  setFieldWelcome(true);   // the threshold is standing
  document.getElementById("dtl").classList.toggle("is-scrubbable", state.settings.timeScrub);
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
