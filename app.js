(function () {
  "use strict";

  const STORAGE_KEY = "todoAppData";
  const state = loadState();

  /* Load saved data. Falls back to an empty state if nothing is stored
     or the JSON is corrupt, so a bad value can never break startup. */
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      return {
        tasks: saved.tasks || [],
        projects: saved.projects || [],
        habits: saved.habits || [],
        settings: {
          name: (saved.settings && saved.settings.name) || "",
          theme: (saved.settings && saved.settings.theme) || "light",
          language: (saved.settings && saved.settings.language) || "fr",
          palette: (saved.settings && saved.settings.palette) || "aurora"
        }
      };
    } catch (err) {
      return { tasks: [], projects: [], habits: [], settings: { name: "", theme: "light", language: "fr", palette: "aurora" } };
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
      welcomeQuestion: "Prêt à travailler sur l'essentiel ?",
      enterAria: "Entrer dans l'application",
      settingsAria: "Paramètres",
      settingsTitle: "Paramètres",
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
      languageLabel: "Langue",
      langFr: "Français",
      langEn: "English",
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
      focusPhrases: [
        "Hedy est le meilleur",
        "Hedy est meilleur que bary",
        "Skuba skubaa"
      ]
    },
    en: {
      greetingPrefix: "Hello",
      greetingSuffix: "!",
      welcomeQuestion: "Are you ready to work on what matters?",
      enterAria: "Enter the app",
      settingsAria: "Settings",
      settingsTitle: "Settings",
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
      languageLabel: "Language",
      langFr: "Français",
      langEn: "English",
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

  const themeBarColors = { light: "#f6ecf7", dark: "#1e1c26", rose: "#fdeef2" };

  /* Apply a theme: html attribute, browser bar color, active button. */
  function applyTheme(themeName) {
    document.documentElement.setAttribute("data-theme", themeName);

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", themeBarColors[themeName] || themeBarColors.light);
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

  /* Set the middle of the greeting to "" or " <name>". */
  function applyGreetingName(name) {
    document.getElementById("greetName").textContent = name ? " " + name : "";
  }

  const welcomeScreen = document.getElementById("welcome");
  const appScreen = document.getElementById("app");

  document.getElementById("enterBtn").addEventListener("click", function () {
    welcomeScreen.classList.add("is-hidden");
    appScreen.hidden = false;
    setTimeout(function () { welcomeScreen.style.display = "none"; }, 600); // remove after fade
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

  const nameInput = document.getElementById("nameInput");
  nameInput.value = state.settings.name;
  nameInput.addEventListener("input", function () {
    state.settings.name = nameInput.value.trim();
    applyGreetingName(state.settings.name);
    saveState();
  });

  const themeButtons = document.querySelectorAll(".theme");
  for (let i = 0; i < themeButtons.length; i++) {
    themeButtons[i].addEventListener("click", function () {
      state.settings.theme = themeButtons[i].dataset.theme;
      applyTheme(state.settings.theme);
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
      saveState();
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

  /* Build one row: checkbox, label, delete button. */
  function createItemRow(listName, item) {
    const row = document.createElement("li");
    row.className = item.done ? "item done" : "item";

    const checkbox = document.createElement("span");
    checkbox.className = "item__check";
    checkbox.textContent = item.done ? "✓" : "";
    checkbox.addEventListener("click", function () { toggleItem(listName, item.id); });

    const label = document.createElement("span");
    label.className = "item__text";
    label.textContent = item.text;
    label.addEventListener("click", function () { toggleItem(listName, item.id); });

    const deleteButton = document.createElement("button");
    deleteButton.className = "item__del";
    deleteButton.setAttribute("aria-label", translate("deleteAria"));
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", function () { removeItem(listName, item.id); });

    row.append(checkbox, label);
    if (item.dueDate) {
      row.appendChild(createDueBadge(item));
    }
    if (listName === "projects") {
      row.appendChild(createImportanceBars(item.importance || 0));
    }
    row.appendChild(deleteButton);
    return row;
  }

  function addItem(listName, text, due, importance) {
    const item = { id: Date.now().toString(), text: text, done: false }; // timestamp id
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

  /* Find the item by id, drop it, redraw. */
  function removeItem(listName, id) {
    const items = state[listName];
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) {
        items.splice(i, 1);
        break;
      }
    }
    saveState();
    renderList(listName);
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
        const list = this.dataset.list;
        const due = list === "tasks" ? pendingDue : null;
        const importance = list === "projects" ? pendingImportance : 0;
        addItem(list, text, due, importance);
        if (list === "tasks") resetPendingDue();
        if (list === "projects") resetPendingImportance();
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
    game: '<rect x="2" y="7" width="20" height="10" rx="5"/><line x1="6" y1="12" x2="9" y2="12"/><line x1="7.5" y1="10.5" x2="7.5" y2="13.5"/><circle cx="15.5" cy="13" r="1"/><circle cx="18.5" cy="11" r="1"/>'
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
    const tile = document.createElement("div");
    tile.className = habit.completedOn === today ? "habit done" : "habit";
    tile.setAttribute("aria-label", translate("habitToggleAria"));

    const water = document.createElement("div");
    water.className = "habit__water";

    const icon = document.createElement("span");
    icon.className = "habit__icon";
    if (HABIT_ICONS[habit.icon]) {
      icon.innerHTML = habitSvg(habit.icon);
    }

    const del = document.createElement("button");
    del.type = "button";
    del.className = "habit__del";
    del.setAttribute("aria-label", translate("habitDeleteAria"));
    del.textContent = "×";
    del.addEventListener("click", function (event) {
      event.stopPropagation(); // don't also toggle the habit
      removeHabit(habit.id);
    });

    tile.addEventListener("click", function () { toggleHabit(habit.id, tile); });
    tile.append(water, icon, del);
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
    for (let i = 0; i < state.habits.length; i++) {
      if (state.habits[i].id === id) {
        const nowDone = state.habits[i].completedOn !== today;
        state.habits[i].completedOn = nowDone ? today : null;
        tile.classList.toggle("done", nowDone);
        break;
      }
    }
    saveState();
  }

  function removeHabit(id) {
    for (let i = 0; i < state.habits.length; i++) {
      if (state.habits[i].id === id) {
        state.habits.splice(i, 1);
        break;
      }
    }
    saveState();
    renderHabits();
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
      choice.addEventListener("click", function () { addHabit(key); });
      grid.appendChild(choice);
    }
  }

  function addHabit(iconKey) {
    const nameInput = document.getElementById("habitNameInput");
    // name is stored but not shown; a future history graph will use it
    state.habits.push({
      id: Date.now().toString(),
      name: nameInput.value.trim(),
      icon: iconKey,
      completedOn: null
    });
    saveState();
    nameInput.value = "";
    iconPicker.hidden = true;
    renderHabits();
  }

  /* open the picker with a fresh (empty) name field */
  function openIconPicker() {
    document.getElementById("habitNameInput").value = "";
    iconPicker.hidden = false;
  }

  /* close the picker on the × or the backdrop */
  const iconCloseButtons = iconPicker.querySelectorAll("[data-close]");
  for (let i = 0; i < iconCloseButtons.length; i++) {
    iconCloseButtons[i].addEventListener("click", function () {
      iconPicker.hidden = true;
    });
  }

  /* IMPORTANCE — a 5-bar level on projects, set when creating one */
  const projectImp = document.getElementById("projectImp");
  let pendingImportance = 0;

  /* Build the 5 bars. Read-only divs when no onSelect; clickable buttons in the form. */
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

  /* Redraw the interactive widget in the projects add form. */
  function renderImportanceInput() {
    projectImp.innerHTML = "";
    projectImp.appendChild(createImportanceBars(pendingImportance, function (level) {
      pendingImportance = (pendingImportance === level) ? 0 : level; // click the top bar again to clear
      renderImportanceInput();
    }));
  }

  function resetPendingImportance() {
    pendingImportance = 0;
    renderImportanceInput();
  }

  /* AGENDA — optional due date/time on tasks */
  const calendarModal = document.getElementById("calendar");
  const taskDateBtn = document.getElementById("taskDateBtn");
  const pendingDue = { date: null, time: "" };   // due for the task being typed
  let pickerContext = "new";                      // "new" or an existing task id
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

  /* Undated tasks stay first (in order); dated ones follow, soonest first. */
  function sortedByDue(items) {
    const undated = [];
    const dated = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].dueDate) dated.push(items[i]);
      else undated.push(items[i]);
    }
    dated.sort(function (a, b) { return dueSortKey(a) - dueSortKey(b); });
    return undated.concat(dated);
  }

  /* date-only tasks sort at the end of their day */
  function dueSortKey(task) {
    return new Date(task.dueDate + "T" + (task.dueTime || "23:59")).getTime();
  }

  /* Small localized badge like "24 juil. · 14:00", clickable to edit the date. */
  function createDueBadge(task) {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const when = new Date(task.dueDate + "T" + (task.dueTime || "00:00"));
    let text = when.toLocaleDateString(locale, { day: "numeric", month: "short" });
    if (task.dueTime) text += " · " + task.dueTime;

    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "item__due";
    if (!task.done && dueSortKey(task) < Date.now()) badge.classList.add("is-overdue");
    badge.textContent = text;
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

  /* Open the calendar for a new task ("new") or to edit an existing task id. */
  function openCalendar(context) {
    pickerContext = context;
    let date = null;
    let time = "";
    if (context === "new") {
      date = pendingDue.date;
      time = pendingDue.time;
    } else {
      const task = findTask(context);
      if (task) { date = task.dueDate || null; time = task.dueTime || ""; }
    }
    pickerSelected = date || todayKey();   // today highlighted by default
    const base = new Date(pickerSelected + "T00:00");
    pickerYear = base.getFullYear();
    pickerMonth = base.getMonth();
    document.getElementById("calTime").value = time;
    renderCalendar();
    calendarModal.hidden = false;
  }

  /* Write the chosen (or cleared) date to the pending task or the edited one. */
  function applyDue(date, time) {
    if (pickerContext === "new") {
      pendingDue.date = date;
      pendingDue.time = date ? time : "";
      taskDateBtn.classList.toggle("is-set", !!date);
    } else {
      const task = findTask(pickerContext);
      if (task) {
        task.dueDate = date;
        task.dueTime = date ? (time || null) : null;
        task.notified = false;   // re-arm the reminder
        saveState();
        renderList("tasks");
      }
    }
    if (date && time) ensureNotifyPermission();
    calendarModal.hidden = true;
  }

  function resetPendingDue() {
    pendingDue.date = null;
    pendingDue.time = "";
    taskDateBtn.classList.remove("is-set");
  }

  taskDateBtn.addEventListener("click", function () { openCalendar("new"); });
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

  applyTheme(state.settings.theme);
  applyPalette(state.settings.palette);
  applyLanguage(state.settings.language);
  applyGreetingName(state.settings.name);
  renderList("tasks");
  renderList("projects");
  renderHabits();
  buildIconPicker();
  renderImportanceInput();
  checkReminders();
  setInterval(checkReminders, 30000);

  /* register the service worker for offline use */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./service-worker.js");
    });
  }
})();
