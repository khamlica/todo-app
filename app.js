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
    const retiredMosaic = list.indexOf("mosaic");
    if (retiredMosaic !== -1) {
      list.splice(retiredMosaic, 1);
      if (list.indexOf("field") === -1) list.push("field");
    }
    if (alreadyOffered || list.indexOf("field") !== -1) return list;
    return list.concat("field");
  }

  /* The cell is cut from the zellige now; the earlier cuts, and the amethyst
     druse that replaced them, are both gone. Anyone holding one lands on motif. */
  function glassCut(saved) {
    if (saved === "motif" || saved === "etoile") return saved;
    return "motif";
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
        // A dated task belongs to the timeline, which needs an exact position.
        if (tasks[i].dueDate && !tasks[i].dueTime) tasks[i].dueTime = "09:00";
      }
      const events = saved.events || [];
      for (let i = 0; i < events.length; i++) {   // events are past/pending now, not checkable
        delete events[i].done;
        if (events[i].important == null) events[i].important = false;
        if (!events[i].icon) events[i].icon = "calendar";
        if (!events[i].time) events[i].time = "09:00";
      }
      let canvases = saved.canvases || [];
      for (let i = 0; i < canvases.length; i++) {
        if ([2, 3, 4, 5].indexOf(canvases[i].thinkingTreeVersion) === -1
            || canvases[i].type !== "canvas") {
          canvases = [];
          break;
        }
      }
      for (let i = 0; i < canvases.length; i++) {
        let canvas = canvases[i];
        const compactOldBlocks = canvas.thinkingTreeVersion < 5;
        canvas.parentId = null;
        canvas.title = "";
        if (!canvas.blocks) canvas.blocks = [];
        if (!canvas.links) canvas.links = [];
        if (!canvas.createdAt) canvas.createdAt = Date.now();
        if (!canvas.updatedAt) canvas.updatedAt = canvas.createdAt;
        for (let j = 0; j < canvas.blocks.length; j++) {
          const block = canvas.blocks[j];
          if (["problem", "solution", "example", "idea", "question", "answer", "canvas", "text", "note"]
            .indexOf(block.type) === -1) block.type = "note";
          delete block.icon;
          delete block.color;
          if (compactOldBlocks) delete block.blockHeight;
          if (block.type === "canvas") {
            if (block.canvasWidth == null) block.canvasWidth = 650;
            if (block.canvasHeight == null) block.canvasHeight = 330;
            if (block.cameraX == null) block.cameraX = 9000;
            if (block.cameraY == null) block.cameraY = 5000;
          }
          if (block.x == null) block.x = 80 + (j % 5) * 280;
          if (block.y == null) block.y = 80 + Math.floor(j / 5) * 190;
        }
        const canvasBlocks = {};
        canvasBlocks[canvas.id] = canvas;
        for (let j = 0; j < canvas.blocks.length; j++) {
          canvasBlocks[canvas.blocks[j].id] = canvas.blocks[j];
        }
        for (let j = 0; j < canvas.blocks.length; j++) {
          const block = canvas.blocks[j];
          if (block.type !== "canvas") continue;
          if (!(block.title || "").trim()) {
            block.title = saved.settings && saved.settings.language === "en"
              ? "New canvas" : "Nouvelle toile";
          }
          delete block.directorId;
        }
        delete canvas.directorId;
        for (let j = 0; j < canvas.blocks.length; j++) {
          const block = canvas.blocks[j];
          if (!block.parentId) block.parentId = canvas.id;
          if (!canvasBlocks[block.parentId] || block.parentId === block.id) {
            block.parentId = canvas.id;
            continue;
          }
          const visited = {};
          let branch = block;
          while (branch && branch.parentId) {
            if (visited[branch.id]) { block.parentId = canvas.id; break; }
            visited[branch.id] = true;
            branch = canvasBlocks[branch.parentId];
          }
        }
        for (let j = 0; j < canvas.blocks.length; j++) {
          const block = canvas.blocks[j];
          const parent = canvasBlocks[block.parentId];
          if (parent && parent.type !== "canvas") {
            delete block.blockWidth;
            delete block.blockHeight;
          }
        }

        // Remove mothers made by the old back action.
        while (true) {
          let directCount = 0;
          let directCanvas = null;
          let directCanvasIndex = -1;
          for (let j = 0; j < canvas.blocks.length; j++) {
            if (canvas.blocks[j].parentId !== canvas.id) continue;
            directCount++;
            if (canvas.blocks[j].type === "canvas") {
              directCanvas = canvas.blocks[j];
              directCanvasIndex = j;
            }
          }
          const generatedMother = directCount === 1 && directCanvas && directCanvas.collapsed
            && Math.abs(directCanvas.x - 9180) < 2 && Math.abs(directCanvas.y - 5140) < 2
            && !(canvas.title || "").trim();
          if (!generatedMother) break;
          canvas.blocks.splice(directCanvasIndex, 1);
          directCanvas.parentId = null;
          directCanvas.blocks = canvas.blocks;
          directCanvas.links = canvas.links;
          directCanvas.thinkingTreeVersion = 5;
          canvas = directCanvas;
          canvases[i] = canvas;
        }
        canvas.title = "";
        canvas.thinkingTreeVersion = 5;
      }
      return {
        tasks: tasks,
        projects: projects,
        links: links,
        habits: habits,
        notes: saved.notes || [],
        canvases: canvases,
        events: events,
        sun: saved.sun || null,
        settings: {
          name: (saved.settings && saved.settings.name) || "",
          theme: (saved.settings && saved.settings.theme) || "auto",
          language: (saved.settings && saved.settings.language) || "fr",
          palette: (saved.settings && saved.settings.palette) || "aurora",
          glass: glassCut(saved.settings && saved.settings.glass),
          decorations: withField((saved.settings && saved.settings.decorations) || [],
                                 saved.settings && saved.settings.fieldOn),
          fieldOn: true,   // once seen, the choice is the user's
          timeScrub: !!(saved.settings && saved.settings.timeScrub),
          treeFull: !!(saved.settings && saved.settings.treeFull),
          treeWisps: !(saved.settings && saved.settings.treeWisps === false),
          treeTrunk: !(saved.settings && saved.settings.treeTrunk === false),
          treeBranches: !(saved.settings && saved.settings.treeBranches === false),
          treeBlooms: (saved.settings && saved.settings.treeBlooms) || ["corolla"],
          treeSap: !(saved.settings && saved.settings.treeSap === false),
          themeEdits: (saved.settings && saved.settings.themeEdits) || {},
          paletteEdits: (saved.settings && saved.settings.paletteEdits) || {},
          themePalettes: (saved.settings && saved.settings.themePalettes) || {}
        }
      };
    } catch (err) {
      return { tasks: [], projects: [], links: [], habits: [], notes: [], canvases: [], events: [], sun: null, settings: { name: "", theme: "auto", language: "fr", palette: "aurora", glass: "motif", decorations: ["field"], fieldOn: true, timeScrub: false, treeFull: false, treeWisps: true, treeTrunk: true, treeBranches: true, treeBlooms: ["corolla"], treeSap: true, themeEdits: {}, paletteEdits: {}, themePalettes: {} } };
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
      backToToday: "Revenir à aujourd'hui",
      newEventName: "Nouvel événement",
      projectsTitle: "Vos projets",
      addTaskTitle: "Ajouter une tâche",
      newTaskName: "Nouvelle tâche",
      quickPlaceholder: "Relire le rapport demain 18h !",
      quickEventPlaceholder: "Réunion équipe vendredi 14h !",
      groupLate: "En retard",
      groupToday: "Aujourd'hui",
      groupTomorrow: "Demain",
      groupNone: "Sans date",
      groupDone: "Terminées",
      emptyTasks: "Aucune tâche. La journée est à vous.",
      emptyTasksAdd: "Ajoutez-en une ci-dessous.",
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
      timelineDelete: "Déposer pour supprimer",
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
      treeTrunkLabel: "Afficher le tronc",
      treeBranchesLabel: "Afficher les branches",
      treePartsHint: "Pour regarder une famille de flux \u00e0 la fois",
      treeWispsLabel: "Fils fins de l'arbre",
      treeWispsHint: "Le duvet autour des veines. Coupez-le pour ne voir que la structure",
      treeFullLabel: "Arbre au maximum",
      treeFullHint: "Aper\u00e7u : l'arbre tel qu'il serait au mieux, toutes habitudes tenues",
      treeShopLabel: "Arbre",
      treeShopOpen: "Modifier l'arbre",
      treeShopTitle: "Modifier l'arbre",
      treeShopAria: "Modifier l'arbre",
      bloomLabel: "Floraison",
      bloomCorolla: "Corolles",
      bloomBurst: "\u00c9closions",
      bloomBud: "Boutons",
      bloomHint: "Une branche ne fleurit qu'une fois son habitude tenue longtemps",
      treeSapLabel: "Mouvement",
      treeSapHint: "La s\u00e8ve, l'air en suspension et le souffle du tronc",
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
      habitsTitle: "Vos habitudes",
      wellAria: "Bien-être",
      panesAria: "Changer de colonne",
      paneTasks: "Tâches",
      panePlan: "Planification",
      scrubLabel: "Faire défiler le temps",
      scrubHint: "Tirez la barre du temps pour voyager dans la journée",
      glassLabel: "Mosaïque du jour",
      glassHint: "Le cadrage du zellige qui marque aujourd'hui",
      glassMotif: "Motif",
      glassEtoile: "Étoile",
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
      editTitle: "Modifier",
      editNameLabel: "Nom",
      editIconLabel: "Icône",
      editDateNone: "Aucune date",
      notesLabel: "Notes",
      subtasksLabel: "Sous-tâches",
      dialHourAria: "Régler l'heure",
      dialMinAria: "Régler les minutes",
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
      thinkingAria: "Espace de réflexion",
      thinkingUntitled: "Toile sans titre",
      thinkingSaved: "Enregistré",
      thinkingAddBlock: "Ajouter un bloc",
      thinkingAdd: "Ajouter",
      thinkingNewCanvas: "Nouvelle toile",
      blockProblem: "Problème",
      blockSolution: "Solution",
      blockExample: "Exemple",
      blockIdea: "Idée",
      blockQuestion: "Question",
      blockAnswer: "Réponse",
      blockCanvas: "Toile",
      blockText: "Texte",
      blockNote: "Note",
      blockPlaceholderProblem: "Quel problème cherchez-vous à résoudre ?",
      blockPlaceholderSolution: "Une solution possible…",
      blockPlaceholderExample: "Un cas concret…",
      blockPlaceholderIdea: "Une piste à explorer…",
      blockPlaceholderQuestion: "Une question ouverte…",
      blockPlaceholderAnswer: "Une réponse, une hypothèse…",
      blockPlaceholderCanvas: "Toile",
      blockPlaceholderText: "Écrivez librement…",
      blockPlaceholderNote: "Un détail à garder…",
      thinkingQuestionAddAnswer: "Ajouter une réponse",
      thinkingCanvasEmpty: "Déposez ici les blocs de cette réflexion.",
      thinkingResizeCanvas: "Redimensionner la toile",
      thinkingResizeBlock: "Redimensionner le bloc",
      thinkingCollapseCanvas: "Replier la toile",
      thinkingExpandCanvas: "Déplier la toile",
      thinkingOpenCanvasFullscreen: "Ouvrir la toile en plein écran",
      thinkingCloseCanvas: "Replier dans la toile mère",
      thinkingBaseCanvas: "Toile mère de base",
      thinkingExit: "Quitter le laboratoire",
      thinkingTrash: "Déposer pour supprimer",
      thinkingLink: "Relier ce bloc",
      thinkingLinkHint: "Choisissez le point de liaison d'un autre bloc.",
      thinkingCancel: "Annuler",
      thinkingChangeType: "Changer le type du bloc",
      thinkingConnectionOne: "liaison",
      thinkingConnectionMany: "liaisons",
      thinkingBlankTitle: "Commencez par ce qui vous occupe",
      thinkingBlankCopy: "Ajoutez un problème, une question ou une première idée.",
      thinkingDeleteLink: "Glissez le fond pour déplacer la caméra · cliquez sur une liaison pour la supprimer.",
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
      backToToday: "Back to today",
      newEventName: "New event",
      projectsTitle: "Your projects",
      addTaskTitle: "Add a task",
      newTaskName: "New task",
      quickPlaceholder: "Read the report tomorrow 6pm !",
      quickEventPlaceholder: "Team meeting friday 2pm !",
      groupLate: "Overdue",
      groupToday: "Today",
      groupTomorrow: "Tomorrow",
      groupNone: "No date",
      groupDone: "Done",
      emptyTasks: "No tasks. The day is yours.",
      emptyTasksAdd: "Add one below.",
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
      timelineDelete: "Drop to delete",
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
      treeTrunkLabel: "Show the trunk",
      treeBranchesLabel: "Show the branches",
      treePartsHint: "To look at one family of flows at a time",
      treeWispsLabel: "Tree wisps",
      treeWispsHint: "The down around the veins. Turn it off to see the bare structure",
      treeFullLabel: "Tree at its fullest",
      treeFullHint: "Preview: the tree as it would be with every habit kept",
      treeShopLabel: "Tree",
      treeShopOpen: "Shape the tree",
      treeShopTitle: "Shape the tree",
      treeShopAria: "Shape the tree",
      bloomLabel: "Bloom",
      bloomCorolla: "Corollas",
      bloomBurst: "Bursts",
      bloomBud: "Buds",
      bloomHint: "A branch only flowers once its habit has been kept for a long while",
      treeSapLabel: "Motion",
      treeSapHint: "The sap, the air hanging around it and the trunk's own breath",
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
      habitsTitle: "Your habits",
      wellAria: "Well-being",
      panesAria: "Switch column",
      paneTasks: "Tasks",
      panePlan: "Planning",
      scrubLabel: "Scrub the timeline",
      scrubHint: "Drag the time bar to travel through the day",
      glassLabel: "Today's mosaic",
      glassHint: "How the zellige marking today is framed",
      glassMotif: "Motif",
      glassEtoile: "Star",
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
      editTitle: "Edit",
      editNameLabel: "Name",
      editIconLabel: "Icon",
      editDateNone: "No date",
      notesLabel: "Notes",
      subtasksLabel: "Subtasks",
      dialHourAria: "Set the hour",
      dialMinAria: "Set the minutes",
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
      thinkingAria: "Thinking space",
      thinkingUntitled: "Untitled canvas",
      thinkingSaved: "Saved",
      thinkingAddBlock: "Add a block",
      thinkingAdd: "Add",
      thinkingNewCanvas: "New canvas",
      blockProblem: "Problem",
      blockSolution: "Solution",
      blockExample: "Example",
      blockIdea: "Idea",
      blockQuestion: "Question",
      blockAnswer: "Answer",
      blockCanvas: "Canvas",
      blockText: "Text",
      blockNote: "Note",
      blockPlaceholderProblem: "What problem are you trying to solve?",
      blockPlaceholderSolution: "A possible solution…",
      blockPlaceholderExample: "A concrete case…",
      blockPlaceholderIdea: "A path to explore…",
      blockPlaceholderQuestion: "An open question…",
      blockPlaceholderAnswer: "An answer, a hypothesis…",
      blockPlaceholderCanvas: "Canvas",
      blockPlaceholderText: "Write freely…",
      blockPlaceholderNote: "A detail to keep…",
      thinkingQuestionAddAnswer: "Add an answer",
      thinkingCanvasEmpty: "Drop the blocks for this line of thought here.",
      thinkingResizeCanvas: "Resize canvas",
      thinkingResizeBlock: "Resize block",
      thinkingCollapseCanvas: "Collapse canvas",
      thinkingExpandCanvas: "Expand canvas",
      thinkingOpenCanvasFullscreen: "Open canvas fullscreen",
      thinkingCloseCanvas: "Collapse into the parent canvas",
      thinkingBaseCanvas: "Base parent canvas",
      thinkingExit: "Exit the idea laboratory",
      thinkingTrash: "Drop to delete",
      thinkingLink: "Connect this block",
      thinkingLinkHint: "Choose the connection point on another block.",
      thinkingCancel: "Cancel",
      thinkingChangeType: "Change block type",
      thinkingConnectionOne: "connection",
      thinkingConnectionMany: "connections",
      thinkingBlankTitle: "Start with what is on your mind",
      thinkingBlankCopy: "Add a problem, a question or a first idea.",
      thinkingDeleteLink: "Drag the background to move the camera · click a connection to delete it.",
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
    paintZellige();   // the mosaic is cut from the theme, so it is recut with it
  }

  /* Apply a color palette (aurora / meadow / sunset) via a root attribute. */
  function applyPalette(paletteName) {
    document.documentElement.setAttribute("data-palette", paletteName);
    applyPaletteVars();
    const paletteButtons = document.querySelectorAll(".palette");
    for (let i = 0; i < paletteButtons.length; i++) {
      paletteButtons[i].classList.toggle("is-active", paletteButtons[i].dataset.palette === paletteName);
    }
    paintZellige();
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

  function enterApp() {
    if (!welcomeScreen || welcomeScreen.dataset.gone) return;
    welcomeScreen.dataset.gone = "1";

    appScreen.hidden = false;
    // the rail was measured while the app was still display:none, so its height
    // was zero; now that it has a size, take it again
    syncPagesHeight(false);
    requestAnimationFrame(function () {
      syncPagesHeight(false);
      renderTimeRule();
    });

    welcomeScreen.classList.add("is-leaving");
    setZelligeOn(false);   // the mosaic goes with the threshold, not after it
    setTimeout(function () { welcomeScreen.style.display = "none"; }, 560);
    setTimeout(function () { setFieldWelcome(false); }, 900);   // let the ground settle
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
      if (!thinkingView.hidden && currentCanvas()) renderThinkingCanvas(currentCanvas());
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
  /* THE LAYOUT'S WEIGHT — a panel presses the grid under it as deep as it is
     opaque: a solid card sinks the cells, a barely-tinted one grazes them. The
     rects are taken fresh on every frame the field draws, so a scroll drags the
     hollows along with the panels that made them, without a line of extra code. */
  const PANEL_SELECTOR = ".item--task, .item--project, .habit, .hcard,"
    + " .quick__field, .ecal, .modal__card, .note-card";
  const PANEL_DEPTH = .55;    // how much of a panel's own opacity is dug
  let panels = [];
  let panelsMoving = false;

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
      ctx.globalAlpha = SUN_ALPHA * light;
      ctx.fillRect(col * FIELD_STEP, row * FIELD_STEP, FIELD_STEP, FIELD_STEP);
    });

    const lit = gatherEnergy(now);
    lit.forEach(function (energy, key) {
      if (energy < .02) return;
      const col = key % fieldCols;
      const row = (key - col) / fieldCols;
      ctx.fillStyle = rowShade[row] || "#000";
      ctx.globalAlpha = Math.min(.75, SHADE_ALPHA * shadeLift * (energy > 1 ? 1 : energy));
      ctx.fillRect(col * FIELD_STEP, row * FIELD_STEP, FIELD_STEP, FIELD_STEP);
    });

    ctx.strokeStyle = fieldInk;
    ctx.lineWidth = 1;
    ctx.globalAlpha = REST_ALPHA;
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
    if (presses.length || trail.length || settling || pointerMoved
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

  /* THE ZELLIGE — three interlocked meshes, painted once on the threshold. */
  const zelligeCanvas = document.getElementById("zellige");
  const ZL_SEEDS = ["--zl-1", "--zl-2", "--zl-3", "--zl-4",
                    "--zl-5", "--zl-6", "--zl-7", "--zl-8"];
  const ZL_STOPS = 32;        // the ramp the coarse noise walks along
  const ZL_PATCH = 7;         // noise cells across the screen: how big a patch is
  /* A glaze is fired at one strength whatever colour it is, and that is the
     whole reason a zellige panel holds together instead of reading as a heap of
     coloured bits. So only the hues come off the theme; how deep and how loud
     they are is fixed here. */
  const ZL_SAT = .74;
  const ZL_LIG = .5;
  const ZL_POLYGON_WIDTH = 1.3;
  const ZL_SIDE_PEAK_TO_WIDTH = 1 / 3;
  const ZL_GLOW = .95;
  /* How the light behaves. The pointer carries a halo a few tiles wide rather
     than lighting the one tile it happens to be over, and a fraction of the wall
     keeps a slow twinkle of its own so the mosaic is never quite still. */
  const ZL_HALO = 2.6;              // halo reach, in half-pitches
  const ZL_TWINKLE_SHARE = .09;
  const ZL_TWINKLE_PEAK = .5;
  let zelligeRamp = [];
  let zelligeRampHue = [];
  let zelligeMetal = ["#8a6524", "#d3a94c", "#f2dda2"];
  let zelligeDip = .2;
  let zelligeResizeTimer = null;
  let zelligeCtx = null;
  let zelligeBase = null;
  let zelligeW = 0, zelligeH = 0, zelligeBand = 0, zelligePitch = 100;
  let zelligeGrout = null;
  let zelligeTiles = [];
  let zelligeFrame = null, zelligeLast = 0, zelligeClock = 0;
  let zelligeAlive = false;
  let zelligePointerX = -9999, zelligePointerY = -9999;
  let zelligePointerInside = false;

  /* value noise: a coarse grid of random numbers, smoothed between the corners.
     Cheap, and its blobs are exactly the size of the patches we want. */
  function zelligeNoise(seed, cells) {
    const grid = [];
    let n = seed;
    for (let j = 0; j <= cells; j++) {
      const row = [];
      for (let i = 0; i <= cells; i++) {
        n = (n * 1664525 + 1013904223) % 4294967296;   // one small LCG, kept local
        row.push(n / 4294967296);
      }
      grid.push(row);
    }
    return function (u, v) {
      const x = Math.min(.9999, Math.max(0, u)) * cells;
      const y = Math.min(.9999, Math.max(0, v)) * cells;
      const i = Math.floor(x), j = Math.floor(y);
      let fx = x - i, fy = y - j;
      fx = fx * fx * (3 - 2 * fx);                     // smoothstep, so no creases
      fy = fy * fy * (3 - 2 * fy);
      const top = grid[j][i] + (grid[j][i + 1] - grid[j][i]) * fx;
      const bottom = grid[j + 1][i] + (grid[j + 1][i + 1] - grid[j + 1][i]) * fx;
      return top + (bottom - top) * fy;
    };
  }

  function hueOf(rgb) {
    const max = Math.max(rgb[0], rgb[1], rgb[2]);
    const min = Math.min(rgb[0], rgb[1], rgb[2]);
    if (max === min) return 0;
    const d = max - min;
    let h;
    if (max === rgb[0]) h = (rgb[1] - rgb[2]) / d % 6;
    else if (max === rgb[1]) h = (rgb[2] - rgb[0]) / d + 2;
    else h = (rgb[0] - rgb[1]) / d + 4;
    return (h * 60 + 360) % 360;
  }

  function hslRgb(h, sat, lig) {
    const hue = ((h % 360) + 360) % 360 / 360;
    const c = (1 - Math.abs(2 * lig - 1)) * sat;
    const x = c * (1 - Math.abs(hue * 6 % 2 - 1));
    const m = lig - c / 2;
    const seg = Math.floor(hue * 6) % 6;
    const wheel = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]];
    const rgb = wheel[seg];
    return [Math.round((rgb[0] + m) * 255), Math.round((rgb[1] + m) * 255),
            Math.round((rgb[2] + m) * 255)];
  }

  /* The palette the tiles are cut from. Only the hues are the theme's — they
     are walked in order so the coarse noise slides between neighbours instead
     of jumping across the wheel, and every stop is then fired at the one glaze
     strength. Mixing the theme's own colours together would have run a lavender
     into a teal through grey, which is how the whole thing went to pastel.
     The accent goes in twice so the theme's own colour holds more of the wall. */
  function buildZelligeRamp() {
    const css = getComputedStyle(zelligeCanvas);
    const page = readColour(getComputedStyle(document.documentElement)
      .getPropertyValue("--c-bg"));
    const pageLum = (page[0] * .2126 + page[1] * .7152 + page[2] * .0722) / 255;
    const damp = .04;             // the layer's own opacity does the attenuating

    const hues = [];
    for (let i = 0; i < ZL_SEEDS.length; i++) {
      const raw = css.getPropertyValue(ZL_SEEDS[i]).trim();
      if (raw) hues.push(hueOf(readColour(raw)));
    }
    const accentHue = hueOf(readColour(css.getPropertyValue("--zl-6")));
    hues.push(accentHue - 9, accentHue + 9);
    hues.sort(function (a, b) { return a - b; });

    zelligeRamp = [];
    zelligeRampHue = [];
    for (let i = 0; i < ZL_STOPS; i++) {
      const t = i / (ZL_STOPS - 1) * (hues.length - 1);
      const at = Math.min(hues.length - 2, Math.floor(t));
      const hue = hues[at] + (hues[at + 1] - hues[at]) * (t - at);
      zelligeRampHue.push(hue);   // kept: a lit tile burns its own hue, not white
      zelligeRamp.push(mixRgb(hslRgb(hue, ZL_SAT, ZL_LIG), page, damp));
    }

    /* The diagonal polygon is dark on a pale wall and lit on a dark one. The lit
       side has to reach further than it used to, because whitening now goes on
       at less than half weight. */
    zelligeDip = .28 - (1 - pageLum) * .7;

    const metal = mixRgb(readColour(css.getPropertyValue("--zl-metal")),
                         readColour(css.getPropertyValue("--zl-7")), .18);
    zelligeMetal = [
      rgbText(mixRgb(metal, [0, 0, 0], .46)),      // the seat the cord lies in
      rgbText(metal),
      rgbText(mixRgb(metal, [255, 255, 255], .42)) // and the light along its back
    ];
    // bright tiles carry further on a dark page, so the panel is hung lower
    zelligeCanvas.style.setProperty("--zl-lit", (.72 + pageLum * .14).toFixed(3));
  }

  /* One geometry for every use of the zellige. The threshold and the calendar
     cut must never drift apart again: both receive these exact two polygons,
     their small versions, and the same three placement passes below. */
  function makeZelligeGeometry(P) {
    const a = P / 2;
    const RA = P * .328;
    const RB = a * Math.SQRT2 - RA;
    const L = 2 * a;
    const Wp = (a - RB) * ZL_POLYGON_WIDTH;
    const flat = Wp / (1 + ZL_SIDE_PEAK_TO_WIDTH);
    const peakSide = flat * ZL_SIDE_PEAK_TO_WIDTH * 2;
    const peakHalf = peakSide / 2;
    const shoulder = L / 2 - flat;
    const firstLarge = [
      L / 2, 0,
      shoulder, flat,
      peakHalf, flat,
      0, flat + peakHalf,
      -peakHalf, flat,
      -shoulder, flat,
      -L / 2, 0,
      -shoulder, -flat,
      -peakHalf, -flat,
      0, -(flat + peakHalf),
      peakHalf, -flat,
      shoulder, -flat
    ];

    const secondPeak = flat * (Math.SQRT2 - 1);
    const secondLarge = [
      0, -flat - secondPeak,
      secondPeak, -flat,
      shoulder, -flat,
      shoulder, -secondPeak,
      shoulder + secondPeak, 0,
      shoulder, secondPeak,
      shoulder, flat,
      secondPeak, flat,
      0, flat + secondPeak,
      -secondPeak, flat,
      -shoulder, flat,
      -shoulder, secondPeak,
      -shoulder - secondPeak, 0,
      -shoulder, -secondPeak,
      -shoulder, -flat,
      -secondPeak, -flat
    ];

    const secondReach = shoulder + secondPeak;
    const smallScale = (a * Math.SQRT2 - secondReach) / secondReach;
    const firstSmall = [];
    const secondSmall = [];
    for (let i = 0; i < firstLarge.length; i++) {
      firstSmall.push(firstLarge[i] * smallScale);
    }
    for (let i = 0; i < secondLarge.length; i++) {
      secondSmall.push(secondLarge[i] * smallScale);
    }

    return {
      a: a,
      firstLarge: firstLarge,
      secondLarge: secondLarge,
      firstSmall: firstSmall,
      secondSmall: secondSmall
    };
  }

  function makeZelligePlacements(geometry, cols, rows) {
    const a = geometry.a;
    const placements = [];

    /* Phase 1: the large polygon 1 in horizontal/vertical series. */
    for (let row = -2; row < rows; row++) {
      for (let col = -2; col < cols; col++) {
        if (Math.abs(col + row) % 2 === 0) continue;
        const upright = Math.abs(col) % 2 === 0;
        const cx = (col + (upright ? -1 : 0)) * a;
        const cy = (row + (upright ? 0 : 1)) * a;
        placements.push([
          geometry.firstLarge, cx, cy, upright ? Math.PI / 2 : 0, false, 1
        ]);
      }
    }

    /* Phase 2: the large, then small, polygon 2 on the diagonal meshes. */
    for (let row = -3; row < rows + 2; row += 2) {
      for (let col = -3; col < cols + 2; col += 2) {
        const cx = col * a;
        const cy = row * a;
        placements.push([geometry.secondLarge, cx, cy, Math.PI / 4, true, 2]);
        placements.push([geometry.secondLarge, cx, cy, -Math.PI / 4, true, 2]);
      }
    }

    for (let row = -4; row < rows + 2; row += 2) {
      for (let col = -4; col < cols + 2; col += 2) {
        const cx = col * a;
        const cy = row * a;
        placements.push([geometry.secondSmall, cx, cy, Math.PI / 4, true, 2]);
        placements.push([geometry.secondSmall, cx, cy, -Math.PI / 4, true, 2]);
      }
    }

    /* Phase 3: the small polygon 1 halfway between the phase-1 axes. */
    for (let row = -4; row < rows + 2; row += 2) {
      for (let col = -4; col < cols + 2; col += 2) {
        const cx = col * a;
        const cy = row * a;
        placements.push([geometry.firstSmall, cx, cy, 0, false, 3]);
        placements.push([geometry.firstSmall, cx, cy, Math.PI / 2, false, 3]);
      }
    }

    return placements;
  }

  /* Today's calendar square is not a redrawn emblem. It is the literal unit
     cell between four consecutive phase-1 nodes. In local SVG coordinates those
     four nodes are (0,0), (100,0), (0,100), (100,100); the other two phases are
     clipped only after they have been placed by the same code as the threshold. */
  function installCalendarZelligeCut() {
    const P = 100;
    const geometry = makeZelligeGeometry(P);
    const a = geometry.a;
    const placements = makeZelligePlacements(geometry, 4, 4);
    const pieces = [];

    function clean(value) {
      const rounded = Math.round(value * 1000) / 1000;
      return Math.abs(rounded) < .0005 ? "0" : String(rounded);
    }

    for (let n = 0; n < placements.length; n++) {
      const placement = placements[n];
      const source = placement[0];
      const ca = Math.cos(placement[3]);
      const sa = Math.sin(placement[3]);
      const points = [];
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      for (let i = 0; i < source.length; i += 2) {
        const worldX = placement[1] + source[i] * ca - source[i + 1] * sa;
        const worldY = placement[2] + source[i] * sa + source[i + 1] * ca;
        minX = Math.min(minX, worldX);
        maxX = Math.max(maxX, worldX);
        minY = Math.min(minY, worldY);
        maxY = Math.max(maxY, worldY);
        points.push([worldX + a, worldY + a]);
      }

      /* Neighbouring polygons are built too, exactly as on the canvas, then
         discarded only when they cannot touch this node-to-node square. */
      if (maxX < -a || minX > a || maxY < -a || minY > a) continue;

      let d = "M" + clean(points[0][0]) + " " + clean(points[0][1]);
      for (let i = 1; i < points.length; i++) {
        d += "L" + clean(points[i][0]) + " " + clean(points[i][1]);
      }
      d += "Z";
      pieces.push({
        d: d,
        phase: placement[5],
        sweep: (placement[1] + placement[2] + P) / (P * 2)
      });
    }

    const head = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' " +
      "preserveAspectRatio='none'>";
    const paths = pieces.map(function (piece) {
      return "<path d='" + piece.d + "'/>";
    }).join("");
    const cutSvg = head + "<g fill='white'>" + paths + "</g></svg>";
    const edgeSvg = head + "<g fill='none' stroke='white' stroke-width='1.9' " +
      "stroke-linecap='round' stroke-linejoin='round'>" + paths + "</g></svg>";
    const sweeps = [];

    for (let frame = 0; frame < 8; frame++) {
      const at = frame / 7;
      let lit = "";
      for (let i = 0; i < pieces.length; i++) {
        const distance = Math.abs(pieces[i].sweep - at);
        const strength = Math.max(0, .17 * (1 - distance / .24));
        if (strength > .015) {
          lit += "<path fill-opacity='" + clean(strength) + "' d='" +
            pieces[i].d + "'/>";
        }
      }
      sweeps.push(head + "<g fill='white'>" + lit + "</g></svg>");
    }

    function svgUrl(svg) {
      return "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\")";
    }

    let rules = "[data-glass=\"motif\"]{" +
      "--glass-cut:" + svgUrl(cutSvg) + ";" +
      "--glass-edges:" + svgUrl(edgeSvg) + ";";
    for (let i = 0; i < sweeps.length; i++) {
      rules += "--glass-sweep-" + (i + 1) + ":" + svgUrl(sweeps[i]) + ";";
    }
    rules += "}";

    let style = document.getElementById("calendar-zellige-cut");
    if (!style) {
      style = document.createElement("style");
      style.id = "calendar-zellige-cut";
      document.head.appendChild(style);
    }
    style.textContent = rules;
  }

  function paintZellige(now) {
    const animated = typeof now === "number";
    if (animated) zelligeFrame = null;
    if (zelligeCanvas.hidden) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const rebuild = !animated || !zelligeCtx || w !== zelligeW || h !== zelligeH;

    if (rebuild) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      zelligeW = w;
      zelligeH = h;
      zelligeCanvas.width = Math.round(w * dpr);
      zelligeCanvas.height = Math.round(h * dpr);
      zelligeCtx = zelligeCanvas.getContext("2d");
      zelligeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildZelligeRamp();

      const P = Math.max(200, Math.min(320, Math.min(w, h) / 3.1));
      const geometry = makeZelligeGeometry(P);
      const a = geometry.a;
      zelligePitch = a;   // the halo is sized off it
      const cols = Math.ceil(w / a) + 2;
      const rows = Math.ceil(h / a) + 2;
      const placements = makeZelligePlacements(geometry, cols, rows);

      const family = zelligeNoise(20260729, ZL_PATCH);
      const value = zelligeNoise(77712345, ZL_PATCH * 3);
      zelligeGrout = new Path2D();
      zelligeTiles = [];
      let wobble = 991;

      for (let n = 0; n < placements.length; n++) {
        const placement = placements[n];
        const source = placement[0];
        const ca = Math.cos(placement[3]);
        const sa = Math.sin(placement[3]);
        const pts = [];
        let centreX = 0;
        let centreY = 0;

        for (let i = 0; i < source.length; i += 2) {
          const x = placement[1] + source[i] * ca - source[i + 1] * sa;
          const y = placement[2] + source[i] * sa + source[i + 1] * ca;
          pts.push(x, y);
          centreX += x;
          centreY += y;
        }

        centreX /= source.length / 2;
        centreY /= source.length / 2;
        wobble = (wobble * 1664525 + 1013904223) % 4294967296;
        const roll = wobble / 4294967296;
        const familyAt = family(centreX / w, centreY / h) + (roll - .5) * .18;
        const rampAt = Math.max(0, Math.min(ZL_STOPS - 1,
          Math.round(familyAt * ZL_STOPS)));
        const lift = (value(centreX / w, centreY / h) - .5) * .3
          - (placement[4] ? zelligeDip : 0);
        /* Darkening a glaze keeps its colour; whitening it eats it. So the two
           sides of the lift are not the same size — that asymmetry is most of
           why the wall used to read as pastel. */
        let ink = zelligeRamp[rampAt];
        ink = lift < 0
          ? mixRgb(ink, [0, 0, 0], -lift)
          : mixRgb(ink, [255, 255, 255], lift * .45);
        /* Lit, a tile burns its own hue harder rather than climbing to white,
           and a tile the noise already lifted burns a little brighter still. */
        const litInk = hslRgb(zelligeRampHue[rampAt],
                              Math.min(1, ZL_SAT * 1.2),
                              Math.min(.76, ZL_LIG + .14 + Math.max(0, lift) * .35));

        wobble = (wobble * 1664525 + 1013904223) % 4294967296;
        const twinkles = wobble / 4294967296 < ZL_TWINKLE_SHARE;
        wobble = (wobble * 1664525 + 1013904223) % 4294967296;
        const phase = wobble / 4294967296 * Math.PI * 2;
        wobble = (wobble * 1664525 + 1013904223) % 4294967296;
        const speed = .35 + wobble / 4294967296 * .5;

        const path = new Path2D();
        path.moveTo(pts[0], pts[1]);
        zelligeGrout.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) {
          path.lineTo(pts[i], pts[i + 1]);
          zelligeGrout.lineTo(pts[i], pts[i + 1]);
        }
        path.closePath();
        zelligeGrout.closePath();
        zelligeTiles.push({
          path: path,
          ink: ink,
          litInk: litInk,
          cx: centreX,
          cy: centreY,
          twinkles: twinkles,
          phase: phase,
          speed: speed,
          level: 0,
          target: 0
        });
      }
      zelligeBand = Math.max(2, P * .019);
      renderZelligeBase();
      if (zelligePointerInside) updateZelligeTargets();
    }

    let moving = false;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (animated) {
      const dt = zelligeLast ? Math.min((now - zelligeLast) / 1000, .05) : 1 / 60;
      zelligeClock += dt;
      for (let i = 0; i < zelligeTiles.length; i++) {
        const tile = zelligeTiles[i];
        if (still) {
          tile.level = tile.target;
          continue;
        }
        const rate = tile.target > tile.level ? 10 : 4;
        tile.level += (tile.target - tile.level) * Math.min(1, dt * rate);
        if (Math.abs(tile.target - tile.level) < .002) tile.level = tile.target;
        else moving = true;
      }
      zelligeLast = now;
    } else {
      zelligeLast = performance.now();
    }

    /* The wall itself never changes, so it is drawn once and blitted. The light
       then goes on top additively: order stops mattering (the meshes overlap),
       and only the tiles that are actually lit cost anything. Additive also
       means the light spills over the metal cord, which is what glaze does. */
    const ctx = zelligeCtx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, zelligeCanvas.width, zelligeCanvas.height);
    ctx.drawImage(zelligeBase, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < zelligeTiles.length; i++) {
      const tile = zelligeTiles[i];
      const glow = Math.max(tile.level, twinkleOf(tile, still));
      if (glow < .004) continue;
      const amount = glow * ZL_GLOW;
      ctx.fillStyle = rgbText([
        Math.max(0, Math.round((tile.litInk[0] - tile.ink[0]) * amount)),
        Math.max(0, Math.round((tile.litInk[1] - tile.ink[1]) * amount)),
        Math.max(0, Math.round((tile.litInk[2] - tile.ink[2]) * amount))
      ]);
      ctx.fill(tile.path);
    }
    ctx.globalCompositeOperation = "source-over";

    // the twinkle never settles, so an alive wall always asks for the next frame
    if (animated && (moving || (zelligeAlive && !still))) zelligeWake();
    else if (!animated && zelligeAlive) zelligeWake();
  }

  /* the wall as fired: every tile in its own ink, then the metal cord over it */
  function renderZelligeBase() {
    if (!zelligeBase) zelligeBase = document.createElement("canvas");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    zelligeBase.width = zelligeCanvas.width;    // also wipes it
    zelligeBase.height = zelligeCanvas.height;
    const ctx = zelligeBase.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < zelligeTiles.length; i++) {
      ctx.fillStyle = rgbText(zelligeTiles[i].ink);
      ctx.fill(zelligeTiles[i].path);
    }
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const width = zelligeBand - i * zelligeBand * .3;
      if (width < .6) continue;
      ctx.strokeStyle = zelligeMetal[i];
      ctx.lineWidth = width;
      ctx.stroke(zelligeGrout);
    }
  }

  /* A brief bloom and a long dark: cubed, the sine spends most of its period
     near nothing, so the wall reads as scintillating rather than pulsing. */
  function twinkleOf(tile, still) {
    if (!tile.twinkles || still || !zelligeAlive) return 0;
    const s = Math.sin(zelligeClock * tile.speed + tile.phase);
    return s <= 0 ? 0 : s * s * s * ZL_TWINKLE_PEAK;
  }

  /* The pointer carries a halo, not a hit test: every tile within reach lights
     by how close its centre is, so a cluster comes up together. */
  function updateZelligeTargets() {
    const reach = zelligePitch * ZL_HALO;
    for (let n = 0; n < zelligeTiles.length; n++) {
      const tile = zelligeTiles[n];
      if (!zelligePointerInside) {
        tile.target = 0;
        continue;
      }
      const dx = zelligePointerX - tile.cx;
      const dy = zelligePointerY - tile.cy;
      const near = 1 - Math.sqrt(dx * dx + dy * dy) / reach;
      tile.target = near <= 0 ? 0 : near * near * (3 - 2 * near);
    }
  }

  function zelligeWake() {
    if (zelligeCanvas.hidden || zelligeFrame) return;
    zelligeFrame = requestAnimationFrame(paintZellige);
  }

  function onZelligeMove(event) {
    zelligePointerX = event.clientX;
    zelligePointerY = event.clientY;
    zelligePointerInside = true;
    updateZelligeTargets();
    zelligeWake();
  }

  function onZelligeLeave() {
    zelligePointerInside = false;
    updateZelligeTargets();
    zelligeWake();
  }

  function setZelligeOn(on) {
    if (on === zelligeCanvas.classList.contains("is-lit")) return;
    if (on) {
      zelligeCanvas.hidden = false;
      zelligeAlive = true;
      paintZellige();
      requestAnimationFrame(function () { zelligeCanvas.classList.add("is-lit"); });
      window.addEventListener("resize", onZelligeResize);
      window.addEventListener("pointermove", onZelligeMove, { passive: true });
      document.addEventListener("pointerleave", onZelligeLeave);
    } else {
      window.removeEventListener("pointermove", onZelligeMove);
      document.removeEventListener("pointerleave", onZelligeLeave);
      zelligeAlive = false;   // stops the twinkle, so the loop can settle
      zelligePointerInside = false;
      if (zelligeFrame) cancelAnimationFrame(zelligeFrame);
      zelligeFrame = null;
      for (let i = 0; i < zelligeTiles.length; i++) {
        zelligeTiles[i].target = 0;
        zelligeTiles[i].level = 0;
      }
      paintZellige(performance.now());
      zelligeCanvas.classList.remove("is-lit");
      window.removeEventListener("resize", onZelligeResize);
      clearTimeout(zelligeResizeTimer);
      // let the fade finish before the canvas goes, or it blinks out
      setTimeout(function () { zelligeCanvas.hidden = true; }, 1200);
    }
  }

  function onZelligeResize() {
    clearTimeout(zelligeResizeTimer);
    zelligeResizeTimer = setTimeout(paintZellige, 180);   // a drag is one repaint
  }

  /* The threshold has a ground of its own: the mosaic, not the block field.
     The field belongs to the app, and comes back to whatever the user chose
     for it the moment the door is through. */
  function setFieldWelcome(on) {
    setZelligeOn(on);
    setFieldOn(!on && state.settings.decorations.indexOf("field") !== -1);
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

  /* a preview switch, to judge the tree at its best rather than at today's */
  const treeFullToggle = createToggle(state.settings.treeFull, function (on) {
    state.settings.treeFull = on;
    saveState();
    drawTree();
  });
  const treeTrunkToggle = createToggle(state.settings.treeTrunk, function (on) {
    state.settings.treeTrunk = on;
    saveState();
    drawTree();
  });
  treeTrunkToggle.setAttribute("aria-label", translate("treeTrunkLabel"));
  document.getElementById("treeTrunkSlot").appendChild(treeTrunkToggle);

  const treeBranchesToggle = createToggle(state.settings.treeBranches, function (on) {
    state.settings.treeBranches = on;
    saveState();
    drawTree();
  });
  treeBranchesToggle.setAttribute("aria-label", translate("treeBranchesLabel"));
  document.getElementById("treeBranchesSlot").appendChild(treeBranchesToggle);

  const treeSapToggle = createToggle(state.settings.treeSap, function (on) {
    state.settings.treeSap = on;
    saveState();
    if (on) startSap();
    else stopSap();
  });
  treeSapToggle.setAttribute("aria-label", translate("treeSapLabel"));
  document.getElementById("treeSapSlot").appendChild(treeSapToggle);

  const treeWispsToggle = createToggle(state.settings.treeWisps, function (on) {
    state.settings.treeWisps = on;
    saveState();
    drawTree();
  });
  treeWispsToggle.setAttribute("aria-label", translate("treeWispsLabel"));
  document.getElementById("treeWispsSlot").appendChild(treeWispsToggle);

  treeFullToggle.classList.add("toggle--accent");
  treeFullToggle.setAttribute("aria-label", translate("treeFullLabel"));
  document.getElementById("treeFullSlot").appendChild(treeFullToggle);

  /* the tree workshop, opened from the personalisation tab */
  const treeShop = document.getElementById("treeShop");
  document.getElementById("treeBtn").addEventListener("click", function () {
    treeShop.hidden = false;
  });
  const treeShopClose = treeShop.querySelectorAll("[data-close]");
  for (let i = 0; i < treeShopClose.length; i++) {
    treeShopClose[i].addEventListener("click", function () { treeShop.hidden = true; });
  }

  const bloomButtons = document.querySelectorAll(".bloom-opt");
  for (let i = 0; i < bloomButtons.length; i++) {
    bloomButtons[i].addEventListener("click", function () {
      const kinds = state.settings.treeBlooms;
      const at = kinds.indexOf(this.dataset.bloom);
      if (at === -1) kinds.push(this.dataset.bloom);
      else kinds.splice(at, 1);
      saveState();
      markBlooms();
      drawTree();
    });
  }

  function markBlooms() {
    for (let i = 0; i < bloomButtons.length; i++) {
      bloomButtons[i].classList.toggle(
        "is-active", state.settings.treeBlooms.indexOf(bloomButtons[i].dataset.bloom) !== -1);
    }
  }
  markBlooms();

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
      if (pending[i] === "events") renderDailyTimeline();
      else {
        renderList(pending[i]);
        if (pending[i] === "tasks") renderDailyTimeline();
      }
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

  /* THE TASK FLOW — one run read in clock order: what is late on top, then every
     dated task with a separator wherever the day turns, then the two dateless
     tails. The day being read is held at the top of the screen while its rows
     scroll under it. Only the dateless blocks keep their manual (drag) order —
     everywhere a date exists, the clock decides. */
  const collapsedGroups = { done: true };   // finished tasks start folded away

  function taskGroup(task) {
    if (task.done) return "done";
    if (!task.dueDate) return "none";
    if (dueSortKey(task) < Date.now()) return "late";
    if (task.dueDate === todayKey()) return "today";
    return "soon";
  }

  /* clock order, with the pinned rows still floating to the top of their block */
  function byDueThenPinned(a, b) {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return dueSortKey(a) - dueSortKey(b);
  }

  function renderTasks() {
    const box = document.getElementById("tasksList");
    box.innerHTML = "";
    renderTasksRing();

    const items = sortedByDue(state.tasks);
    if (items.length === 0) box.appendChild(createEmptyTasks());

    const buckets = {};
    for (let i = 0; i < items.length; i++) {
      const key = taskGroup(items[i]);
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(items[i]);
    }
    if (buckets.late) buckets.late.sort(byDueThenPinned);
    if (buckets.today) buckets.today.sort(byDueThenPinned);
    if (buckets.soon) buckets.soon.sort(byDueThenPinned);

    if (buckets.late) {
      box.appendChild(createTaskGroup("late", translate("groupLate"), buckets.late));
    }

    // today's bucket then upcoming, both already in clock order: one long run
    const dated = (buckets.today || []).concat(buckets.soon || []);
    const days = [];
    for (let i = 0; i < dated.length; i++) {
      const last = days[days.length - 1];
      if (last && last.key === dated[i].dueDate) last.tasks.push(dated[i]);
      else days.push({ key: dated[i].dueDate, tasks: [dated[i]] });
    }
    for (let i = 0; i < days.length; i++) {
      box.appendChild(createTaskDay(days[i].key, days[i].tasks));
    }

    // This group is also a permanent drop target, so it remains present at zero.
    box.appendChild(createTaskGroup("none", translate("groupNone"), buckets.none || []));
    if (buckets.done) {
      box.appendChild(createTaskGroup("done", translate("groupDone"), buckets.done));
    }
  }

  /* One day of the flow. Today is always open and carries no control: it is the
     day being lived. Every other day arrives folded and unfolds on its head —
     the whole anchored bar is the target, not just the chevron. */
  function createTaskDay(key, tasks) {
    const isToday = key === todayKey();
    const collapsed = !isToday && dayCollapsed(key);
    const group = document.createElement("div");
    group.className = "tgroup tgroup--day";
    group.dataset.day = key;   // the grid reaches its day through this
    if (isToday) group.classList.add("is-today");
    if (collapsed) group.classList.add("is-collapsed");

    const head = document.createElement(isToday ? "div" : "button");
    head.className = "tgroup__head tgroup__head--day";
    head.append(groupLabel(dayFlowLabel(key)), groupRule(), groupCount(tasks.length));

    if (!isToday) {
      head.type = "button";
      head.setAttribute("aria-expanded", collapsed ? "false" : "true");
      const chevron = document.createElement("span");
      chevron.className = "tgroup__chev";
      chevron.innerHTML = iconSvg('<polyline points="6 9 12 15 18 9"/>');
      head.appendChild(chevron);
      head.addEventListener("click", function () {
        collapsedGroups["day:" + key] = !dayCollapsed(key);
        renderTasks();
      });
    }

    group.append(head, taskRows(tasks, { draggable: false, dayKnown: true }));
    return group;
  }

  /* a day the user has not opened yet is folded: the flow lands on what is being
     done now, and the days after it wait behind their count */
  function dayCollapsed(key) {
    const stored = collapsedGroups["day:" + key];
    return stored === undefined ? true : stored;
  }

  /* "Aujourd'hui", "Demain", then "Ven. 1 août" */
  function dayFlowLabel(key) {
    const today = todayKey();
    if (key === today) return translate("groupToday");
    if (key === shiftDateKey(today, 1)) return translate("groupTomorrow");
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const text = new Date(key + "T00:00").toLocaleDateString(locale,
      { weekday: "short", day: "numeric", month: "short" });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /* the three blocks that are not a day: late on top, then the two dateless tails */
  function createTaskGroup(key, title, tasks) {
    const group = document.createElement("div");
    group.className = "tgroup tgroup--" + key;
    group.dataset.taskGroup = key;
    if (key === "none") group.dataset.undatedDrop = "1";
    const collapsed = !!collapsedGroups[key];
    if (collapsed) group.classList.add("is-collapsed");

    const head = document.createElement("button");
    head.type = "button";
    head.className = "tgroup__head";
    head.setAttribute("aria-expanded", collapsed ? "false" : "true");

    const chevron = document.createElement("span");
    chevron.className = "tgroup__chev";
    chevron.innerHTML = iconSvg('<polyline points="6 9 12 15 18 9"/>');

    head.append(groupLabel(title), groupRule(), groupCount(tasks.length), chevron);
    head.addEventListener("click", function () {
      collapsedGroups[key] = !collapsedGroups[key];
      renderTasks();
    });
    group.appendChild(head);

    // a block without dates is the only place an order can still be made by hand
    const byHand = key === "none" || key === "done";
    group.appendChild(taskRows(tasks, { draggable: byHand }));
    return group;
  }

  function taskRows(tasks, opts) {
    const list = document.createElement("ul");
    list.className = "list list--cards";
    for (let i = 0; i < tasks.length; i++) {
      list.appendChild(createItemRow("tasks", tasks[i], opts));
    }
    return list;
  }

  function groupLabel(text) {
    const label = document.createElement("span");
    label.className = "tgroup__label";
    label.textContent = text;
    return label;
  }
  /* the hairline that carries the label out to its count */
  function groupRule() {
    const rule = document.createElement("span");
    rule.className = "tgroup__rule";
    return rule;
  }
  function groupCount(total) {
    const count = document.createElement("span");
    count.className = "tgroup__count";
    count.textContent = total;
    return count;
  }

  /* nothing due yet: say it plainly, and point at the line just below */
  function createEmptyTasks() {
    const box = document.createElement("p");
    box.className = "empty empty--tasks";
    const line = document.createElement("span");
    line.textContent = translate("emptyTasks");
    const hint = document.createElement("span");
    hint.className = "empty__hint";
    hint.textContent = translate("emptyTasksAdd");
    box.append(line, hint);
    return box;
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

  /* Build one row: checkbox, label, its trailing marks, then the actions laid
     over the right end. A row is draggable only where the order is the user's to
     make — projects, and the undated tasks; a dated block belongs to the clock. */
  function eventPathMatches(event, selector) {
    if (event.target && event.target.closest && event.target.closest(selector)) return true;
    const path = event.composedPath ? event.composedPath() : [];
    for (let i = 0; i < path.length; i++) {
      if (path[i] && path[i].matches && path[i].matches(selector)) return true;
    }
    return false;
  }

  function createItemRow(listName, item, opts) {
    const draggable = !opts || opts.draggable !== false;
    const dayKnown = !!(opts && opts.dayKnown);   // its block head already names the day
    const row = document.createElement("li");
    const kindClass = listName === "projects" ? " item--project" : " item--task";
    row.className = (item.done ? "item item--open done" : "item item--open") + kindClass;
    row.dataset.id = item.id;
    if (listName === "tasks") {
      const milestoneColor = milestoneTaskColor(item);
      if (milestoneColor) {
        row.classList.add("item--milestone-linked");
        row.style.setProperty("--task-milestone-color", milestoneColor);
      }
    }
    const rowHead = listName === "projects" ? document.createElement("div") : row;
    if (listName === "projects") {
      rowHead.className = "project-tab";
      row.appendChild(rowHead);
    }
    const fold = createUnfold();
    row.addEventListener("click", function (event) {
      if (eventPathMatches(event,
        ".unfold, .detail__titlerow, .item__check, .goal-inline__name")) return;
      if (Date.now() < dragEndedAt) return;          // the click that ends a drag
      // In the main app an objective unfolds in place. Its star in Rêve still
      // opens the complete workspace with the journal and dream wall.
      if (listName === "projects") {
        toggleInlineProjectRow(row, item, fold);
        return;
      }
      if (row.classList.contains("is-open")) { closeDetail(); return; }
      openDetail(listName, item.id, fold.firstChild);
    });
    const reorderable = !item.pinned && draggable;
    if (reorderable) row.dataset.reorder = "1";
    // Every task can be dropped on the clock. Projects only keep their existing
    // manual reorder gesture.
    if (listName === "tasks" || reorderable) {
      if (listName === "tasks") row.dataset.schedulable = "1";
      armLongPress(row, listName);
    }

    if (listName === "projects") {
      const icon = document.createElement("span");
      icon.className = "item__ico";
      icon.innerHTML = habitSvg(item.icon || "folder");
      rowHead.appendChild(icon);
    } else {
      rowHead.appendChild(createCheckbox(function () { toggleItem(listName, item.id); }));
    }

    const label = document.createElement("span");
    label.className = "item__text";
    label.textContent = item.text;
    const slot = document.createElement("span");
    slot.className = "item__slot";

    rowHead.append(label, slot);

    // every mark travels together at the right end, so it can step aside as one
    // piece when the actions come over it instead of being half-covered
    const meta = document.createElement("span");
    meta.className = "item__meta";
    if (item.notes && item.notes.trim()) meta.appendChild(createNoteMark());
    if (listName === "tasks" && item.subtasks && item.subtasks.length) meta.appendChild(createSubBadge(item));
    if (listName === "tasks" && item.projectId) {
      const star = createStarMark(item.projectId);
      if (star) meta.appendChild(star);
    }
    if (listName === "projects" && item.milestones && item.milestones.length) meta.appendChild(createMilestoneBadge(item));
    if (item.pinned) meta.appendChild(createPinMarker());
    const due = item.dueDate ? createDueBadge(item, dayKnown) : null;
    if (due) meta.appendChild(due);
    if (listName === "projects") meta.appendChild(createImportanceBars(item.importance || 0));
    if (meta.firstChild) rowHead.appendChild(meta);

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
    rowHead.appendChild(createRowActions(actions));
    armSwipe(row);

    row.appendChild(fold);
    if (listName === "projects") {
      row.setAttribute("aria-expanded", openInlineProject === item.id ? "true" : "false");
      if (openInlineProject === item.id) {
        row.classList.add("is-inline-open");
        renderInlineProject(fold.firstChild, item);
        fold.style.height = "auto";
      }
    }
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
      if (row.classList.contains("is-dragging")) {
        live = false;
        row.classList.remove("is-swiping");
        row.style.removeProperty("--swipe");
        return;
      }
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

  /* Touch waits for a long press so vertical scrolling stays effortless. With a
     mouse, moving the row starts immediately: tasks can then be laid on the
     timeline, while rows in a manually ordered block can still be rearranged. */
  const LONG_PRESS_MS = 380;
  let pressTimer = null;
  let dragEndedAt = 0;

  function armLongPress(row, listName) {
    row.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (event.target.closest(".item__check, .row-acts, .unfold, .detail__titlerow")) return;
      const from = { x: event.clientX, y: event.clientY };
      let started = false;
      clearTimeout(pressTimer);
      if (event.pointerType !== "mouse") {
        pressTimer = setTimeout(function () {
          started = true;
          drop();
          startRowDrag(event, row, listName);
        }, LONG_PRESS_MS);
      }
      const give = function (move) {
        const distance = Math.abs(move.clientX - from.x) + Math.abs(move.clientY - from.y);
        if (event.pointerType === "mouse" && distance > 5 && !started) {
          started = true;
          drop();
          startRowDrag(move, row, listName);
        } else if (event.pointerType !== "mouse" && distance > 8) {
          drop();
        }
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


  /* One pointer drag serves two destinations: its own list for manual ordering,
     or the clock for scheduling. The floating copy keeps the source row legible
     and makes the date/time preview visible before anything is persisted. */
  let rowDrag = null;
  let rowDragScrollFrame = 0;
  function startRowDrag(event, row, listName) {
    if (rowDrag) return;
    closeSwipe();
    const rect = row.getBoundingClientRect();
    const ghost = row.cloneNode(true);
    const fold = ghost.querySelector(".unfold");
    const actions = ghost.querySelector(".row-acts");
    if (fold) fold.remove();
    if (actions) actions.remove();
    ghost.classList.remove("is-open", "is-swiped");
    ghost.classList.add("task-drag-ghost");
    ghost.style.width = rect.width + "px";
    document.body.appendChild(ghost);

    rowDrag = {
      row: row,
      listName: listName,
      listEl: row.parentNode,
      originNext: row.nextSibling,
      canReorder: row.dataset.reorder === "1",
      canSchedule: listName === "tasks" && row.dataset.schedulable === "1",
      ghost: ghost,
      offsetX: Math.max(20, Math.min(rect.width - 20, event.clientX - rect.left)),
      offsetY: Math.max(12, Math.min(rect.height - 12, event.clientY - rect.top)),
      pointerX: event.clientX,
      pointerY: event.clientY,
      pointerId: event.pointerId,
      drop: null,
      undatedDrop: false,
      undatedBeforeId: null,
      crossedLists: false,
      reordered: false
    };
    if (row.setPointerCapture) {
      try { row.setPointerCapture(event.pointerId); } catch (err) {}
    }
    row.classList.add("is-dragging");
    moveRowGhost(event);
    document.addEventListener("pointermove", onRowDragMove, { passive: false });
    document.addEventListener("pointerup", endRowDrag);
    document.addEventListener("pointercancel", cancelRowDrag);
    cancelAnimationFrame(rowDragScrollFrame);
    rowDragScrollFrame = requestAnimationFrame(autoScrollRowDrag);
  }

  function moveRowGhost(event) {
    if (!rowDrag) return;
    rowDrag.ghost.style.left = (event.clientX - rowDrag.offsetX) + "px";
    rowDrag.ghost.style.top = (event.clientY - rowDrag.offsetY) + "px";
  }

  function taskDropAt(clientX, clientY) {
    const line = dtlEl.getBoundingClientRect();
    if (!line.width || clientX < line.left || clientX > line.right
        || clientY < line.top - 30 || clientY > line.bottom + 36) return null;
    const ratio = Math.max(0, Math.min(1, (clientX - line.left) / line.width));
    const raw = windowStartMs() + ratio * spanMs;
    const snapped = Math.round(raw / (EVENT_DRAG_STEP * 60000)) * EVENT_DRAG_STEP * 60000;
    const at = new Date(snapped);
    return {
      date: dateKeyOf(at),
      time: String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0"),
      pct: timePct(snapped, windowStartMs())
    };
  }

  function showTaskDrop(drop, task) {
    const preview = document.getElementById("taskDropPreview");
    if (!drop) {
      preview.hidden = true;
      dtlEl.classList.remove("is-task-target");
      return;
    }
    preview.hidden = false;
    preview.style.left = drop.pct.toFixed(2) + "%";
    const text = drop.time + " · " + task.text;
    preview.setAttribute("aria-label", text);
    document.getElementById("taskDropTip").textContent = text;
    dtlEl.classList.add("is-task-target");
  }

  function updateRowTimelineDrop() {
    if (!rowDrag) return null;
    const task = rowDrag.canSchedule ? findTask(rowDrag.row.dataset.id) : null;
    const drop = task ? taskDropAt(rowDrag.pointerX, rowDrag.pointerY) : null;
    rowDrag.drop = drop;
    showTaskDrop(drop, task);
    return drop;
  }

  function restoreDraggedRowOrigin(drag) {
    if (drag.row.parentNode === drag.listEl) return;
    if (drag.originNext && drag.originNext.parentNode === drag.listEl) {
      drag.listEl.insertBefore(drag.row, drag.originNext);
    } else {
      drag.listEl.appendChild(drag.row);
    }
    drag.crossedLists = false;
  }

  function undatedDropPosition(clientX, clientY) {
    const group = document.querySelector('.tgroup[data-undated-drop="1"]');
    if (!group) return null;
    const rect = group.getBoundingClientRect();
    const inside = clientX >= rect.left - 10 && clientX <= rect.right + 10
      && clientY >= rect.top - 10 && clientY <= rect.bottom + 18;
    if (!inside) return null;

    const targetList = group.querySelector(".list");
    let beforeNode = null;
    if (!group.classList.contains("is-collapsed")) {
      const siblings = targetList.querySelectorAll(".item:not(.is-dragging)");
      for (let i = 0; i < siblings.length; i++) {
        const siblingRect = siblings[i].getBoundingClientRect();
        if (clientY < siblingRect.top + siblingRect.height / 2) {
          beforeNode = siblings[i];
          break;
        }
      }
    }
    return {
      group: group,
      list: targetList,
      beforeNode: beforeNode,
      beforeId: beforeNode ? beforeNode.dataset.id : null
    };
  }

  /* The permanent "Sans date" group accepts a drop on its head, its empty
     space, or between two rows. Moving the real source row gives an exact
     insertion preview while the floating copy stays under the pointer. */
  function updateUndatedDrop() {
    if (!rowDrag || !rowDrag.canSchedule) return false;
    const task = findTask(rowDrag.row.dataset.id);
    const group = document.querySelector('.tgroup[data-undated-drop="1"]');
    if (!task || task.done || !group) return false;
    const position = undatedDropPosition(rowDrag.pointerX, rowDrag.pointerY);
    if (!position) {
      group.classList.remove("is-drop-target");
      rowDrag.undatedDrop = false;
      rowDrag.undatedBeforeId = null;
      if (rowDrag.crossedLists) restoreDraggedRowOrigin(rowDrag);
      return false;
    }

    group.classList.add("is-drop-target");
    rowDrag.undatedDrop = true;
    const targetList = position.list;
    if (group.classList.contains("is-collapsed")) return true;

    // Resolve the hovered neighbour before removing the source from its old
    // group: that removal can shift the whole target list vertically.
    if (position.beforeNode) targetList.insertBefore(rowDrag.row, position.beforeNode);
    else targetList.appendChild(rowDrag.row);
    rowDrag.crossedLists = targetList !== rowDrag.listEl;
    rowDrag.undatedBeforeId = position.beforeId;
    rowDrag.reordered = true;
    return true;
  }

  /* A long list may have carried the clock off screen. Holding the dragged row
     near an edge scrolls it back into reach without releasing the task. */
  function autoScrollRowDrag() {
    if (!rowDrag) return;
    const edge = Math.min(110, window.innerHeight * .18);
    let amount = 0;
    if (rowDrag.pointerY < edge) {
      amount = -Math.ceil((edge - rowDrag.pointerY) / edge * 18);
    } else if (rowDrag.pointerY > window.innerHeight - edge) {
      amount = Math.ceil((rowDrag.pointerY - (window.innerHeight - edge)) / edge * 18);
    }
    if (amount) {
      window.scrollBy(0, amount);
      updateRowTimelineDrop();
      updateUndatedDrop();
    }
    rowDragScrollFrame = requestAnimationFrame(autoScrollRowDrag);
  }

  function onRowDragMove(event) {
    if (!rowDrag) return;
    event.preventDefault();   // don't scroll the page while dragging
    rowDrag.pointerX = event.clientX;
    rowDrag.pointerY = event.clientY;
    moveRowGhost(event);
    const drop = updateRowTimelineDrop();
    const undatedDrop = updateUndatedDrop();
    if (drop || undatedDrop || !rowDrag.canReorder) return;

    const listEl = rowDrag.listEl;
    const siblings = listEl.querySelectorAll('.item[data-reorder]:not(.is-dragging)');
    let inserted = false;
    for (let i = 0; i < siblings.length; i++) {
      const rect = siblings[i].getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        listEl.insertBefore(rowDrag.row, siblings[i]);
        rowDrag.reordered = true;
        inserted = true;
        break;
      }
    }
    if (!inserted && siblings.length) {
      const last = siblings[siblings.length - 1];
      listEl.insertBefore(rowDrag.row, last.nextSibling);
      rowDrag.reordered = true;
    }
  }

  function cleanRowDrag(drag) {
    drag.row.classList.remove("is-dragging");
    if (drag.row.hasPointerCapture && drag.row.hasPointerCapture(drag.pointerId)) {
      drag.row.releasePointerCapture(drag.pointerId);
    }
    if (drag.ghost.parentNode) drag.ghost.remove();
    showTaskDrop(null);
    const undatedGroup = document.querySelector('.tgroup[data-undated-drop="1"]');
    if (undatedGroup) undatedGroup.classList.remove("is-drop-target");
    dragEndedAt = Date.now() + 350;   // swallow the click that ends the drag
    cancelAnimationFrame(rowDragScrollFrame);
    rowDragScrollFrame = 0;
    document.removeEventListener("pointermove", onRowDragMove);
    document.removeEventListener("pointerup", endRowDrag);
    document.removeEventListener("pointercancel", cancelRowDrag);
  }

  function endRowDrag() {
    if (!rowDrag) return;
    const drag = rowDrag;
    rowDrag = null;
    cleanRowDrag(drag);

    if (drag.drop && drag.canSchedule) {
      const task = findTask(drag.row.dataset.id);
      if (!task) return;
      task.dueDate = drag.drop.date;
      task.dueTime = drag.drop.time;
      task.notified = false;
      saveState();
      renderList("tasks");
      renderDailyTimeline();
      if (task.projectId) renderProjectSteps(findItem("projects", task.projectId));
      ensureNotifyPermission();
      return;
    }

    if (drag.undatedDrop && drag.canSchedule) {
      const task = findTask(drag.row.dataset.id);
      if (!task || task.done) return;
      task.dueDate = null;
      task.dueTime = null;
      task.notified = false;
      collapsedGroups.none = false;
      persistUndatedTaskOrder(undatedTaskOrderFor(task.id, drag.undatedBeforeId));
      saveState();
      renderList("tasks");
      renderDailyTimeline();
      if (task.projectId) renderProjectSteps(findItem("projects", task.projectId));
      return;
    }

    if (drag.canReorder && drag.reordered) {
      const ordered = [];
      const rows = drag.listEl.querySelectorAll('.item[data-reorder]');
      for (let i = 0; i < rows.length; i++) ordered.push(rows[i].dataset.id);
      persistOrder(drag.listName, ordered);
      saveState();
      renderList(drag.listName);
    }
  }

  function cancelRowDrag() {
    if (!rowDrag) return;
    const drag = rowDrag;
    rowDrag = null;
    cleanRowDrag(drag);
    if (drag.reordered || drag.crossedLists) renderList(drag.listName);
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

  function undatedTaskOrderFor(taskId, beforeId) {
    const group = document.querySelector('.tgroup[data-undated-drop="1"]');
    const rows = group ? group.querySelectorAll(".list .item[data-id]") : [];
    const ordered = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].dataset.id !== taskId) ordered.push(rows[i].dataset.id);
    }
    const before = beforeId ? ordered.indexOf(beforeId) : -1;
    if (before === -1) ordered.push(taskId);
    else ordered.splice(before, 0, taskId);
    return ordered;
  }

  function persistUndatedTaskOrder(ordered) {
    const byId = {};
    for (let i = 0; i < state.tasks.length; i++) byId[state.tasks[i].id] = state.tasks[i];

    const normalized = [];
    for (let i = 0; i < ordered.length; i++) {
      const task = byId[ordered[i]];
      if (task && !task.done && !task.dueDate && normalized.indexOf(task.id) === -1) {
        normalized.push(task.id);
      }
    }
    for (let i = 0; i < state.tasks.length; i++) {
      const task = state.tasks[i];
      if (!task.done && !task.dueDate && normalized.indexOf(task.id) === -1) {
        normalized.push(task.id);
      }
    }

    let take = 0;
    const result = [];
    for (let i = 0; i < state.tasks.length; i++) {
      const task = state.tasks[i];
      if (!task.done && !task.dueDate) result.push(byId[normalized[take++]]);
      else result.push(task);
    }
    state.tasks = result;
  }

  function addItem(listName, text, due, importance) {
    const item = { id: Date.now().toString(), text: text, done: false, projectId: null };
    if (due && due.date) {
      item.dueDate = due.date;
      item.dueTime = due.time || "09:00";
      item.notified = false;
    }
    if (importance) item.importance = importance;
    state[listName].push(item);
    saveState();
    renderList(listName);
    if (listName === "tasks") renderDailyTimeline();
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
    if (listName === "projects" && openInlineProject === id) {
      openInlineProject = null;
      openInlineMilestone = null;
      inlineMilestoneAdd = null;
      setInlineProjectLayout(false);
    }
    removeWithUndo(listName, id, function () {
      renderList(listName);
      if (listName === "tasks") renderDailyTimeline();
      // a project also owns a star, and Undo has to bring it back
      if (listName === "projects" && !skyView.hidden) renderSky();
    });
  }

  function toggleItem(listName, id) {
    const items = state[listName];
    let now = false;
    let linkedProject = null;
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) {
        items[i].done = !items[i].done; // flip done state
        now = items[i].done;
        items[i].doneDate = now ? todayKey() : null;   // feeds the project's momentum
        if (listName === "tasks" && now) linkedProject = completeTaskMilestone(items[i]);
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
      if (listName === "tasks") renderDailyTimeline();
      if (linkedProject) refreshLinkedMilestoneProject(linkedProject);
      return;
    }
    renderList(listName);
    if (listName === "tasks") renderDailyTimeline();
    if (linkedProject) refreshLinkedMilestoneProject(linkedProject);
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
     and what submit does are different. Date and time resolvers let a caller
     set the defaults, so the hint and the object always agree. */
  function wireQuickAdd(config) {
    const form = document.getElementById(config.form);
    const input = document.getElementById(config.input);
    const mirror = document.getElementById(config.mirror);
    const hint = document.getElementById(config.hint);
    const button = document.getElementById(config.button);

    function dayOf(parsed) {
      return config.resolveDate ? config.resolveDate(parsed) : parsed.date;
    }
    function timeOf(parsed, day) {
      return config.resolveTime ? config.resolveTime(parsed, day) : parsed.time;
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
      if (day) bits.push(dueLabel({ dueDate: day, dueTime: timeOf(parsed, day) }));
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
      const day = dayOf(parsed);
      const time = timeOf(parsed, day);
      config.submit(parsed, title || translate(config.fallbackName), day, time);
      if (time) ensureNotifyPermission();
      input.value = "";
      render();
      input.focus();   // ready for the next line
    });
  }

  wireQuickAdd({
    form: "quickAdd", input: "quickInput", mirror: "quickMirror",
    hint: "quickHint", button: "addTaskBtn",
    flagLabel: "pinLabel", fallbackName: "newTaskName",
    resolveDate: quickTaskDay,
    submit: function (parsed, title, day) {
      addItem("tasks", title, day ? { date: day, time: parsed.time } : null);
      if (parsed.flag) {
        state.tasks[state.tasks.length - 1].pinned = true;
        saveState();
        renderList("tasks");
      }
      if (day) goToDay(day);   // follow it rather than lose it from view
    }
  });

  /* Navigating the grid is how a task gets its date: one written while another
     day is on show lands on that day. A date typed in the line still wins, and
     on today an undated line stays undated — the flow keeps its dateless tail. */
  function quickTaskDay(parsed) {
    if (parsed.date && !parsed.inferred) return parsed.date;
    return sectionDay || parsed.date || null;
  }

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
    const row = document.querySelector('#projectsList .item[data-id="' + project.id + '"]');
    if (row) toggleInlineProjectRow(row, project, row.querySelector(".unfold"));
    requestAnimationFrame(function () {
      const name = document.querySelector('#projectsList .item[data-id="' + project.id
        + '"] .goal-inline__name');
      if (name) { name.focus(); name.select(); }
    });
  });

  /* HABITS */

  /* line-art icon catalog (same stroke style as the rest of the app) */
  /* an icon path wrapped in the stroke settings they all share */
  function habitSvg(iconKey) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + (HABIT_ICONS[iconKey] || "") + '</svg>';
  }

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
  function habitById(id) {
    for (let i = 0; i < state.habits.length; i++) {
      if (state.habits[i].id === id) return state.habits[i];
    }
    return null;
  }

  function renderHabits() {
    drawTree();
    renderHabitsRule();
    renderHabitCells();
  }

  document.getElementById("addHabitBtn").addEventListener("click", openIconPicker);
  let regrow = 0;
  window.addEventListener("resize", function () {
    clearTimeout(regrow);                    // thousands of strokes: once the drag stops
    regrow = setTimeout(function () { if (!wellView.hidden) drawTree(); }, 160);
  });

  /* 7.5 -> "7h30", 8 -> "8h" */
  function formatHours(value) {
    const whole = Math.floor(value);
    const mins = Math.round((value - whole) * 60);
    return mins ? whole + "h" + String(mins).padStart(2, "0") : whole + "h";
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
  function todayKey() {
    const now = new Date();
    return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  }

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

  /* "24 juil. · 14:00", or just "14:00" when the block above already says the day */
  function dueLabel(task, dayKnown) {
    if (dayKnown) return task.dueTime || "";
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const when = new Date(task.dueDate + "T" + (task.dueTime || "00:00"));
    let text = when.toLocaleDateString(locale, { day: "numeric", month: "short" });
    if (task.dueTime) text += " · " + task.dueTime;
    return text;
  }

  /* Small badge, clickable to edit the date. Null when there is nothing left to
     say: an untimed task under a head that already carries its day. */
  function createDueBadge(task, dayKnown) {
    const text = dueLabel(task, dayKnown);
    if (!text) return null;
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "item__due";
    if (dayKnown) badge.classList.add("item__due--time");
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
        event.time = time || "09:00";
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
        if (!refreshInlineRoadmap(project)) renderList("projects");
      }
      calendarModal.hidden = true;
      return;
    }
    const task = findTask(pickerContext);
    if (task) {
      task.dueDate = date;
      task.dueTime = date ? (time || "09:00") : null;
      task.notified = false;   // re-arm the reminder
      saveState();
      renderList("tasks");
      renderDailyTimeline();
      if (task.projectId) {
        renderProjectSteps(findItem("projects", task.projectId));
      }
    }
    if (date) ensureNotifyPermission();
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
  const ORIGIN_SELECTOR = ".item, .event-row, .add-card, .ecal__day, .tl-row,"
    + " .note-card, .zone__action, .topbar__btn, .notes__add, .dtl__event";
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
  /* THE TREE — the well-being space is one drawing, and it is not a fractal.
     What the eye reads first are a dozen great strokes: the trunk running off
     the top of the frame, the long branches leaving the heart almost flat, the
     root plate under them. Each of those is a guide curve. Inside a guide run
     three to seven sub-flows that leave together and part company on the way
     out, and inside those run the filaments — bound to their sub-flow, never
     finding their own way. Nothing is an outline: everything is faint strokes
     piled up in "lighter" mode, and the white comes from them crossing.

     The shape is built once for a given stage and kept: growing a habit does
     not move a single line, it only reveals sub-flows, adds filaments and
     lights them. Each habit owns one or two branches, so the tree fills in by
     region rather than all over at once. */
  const treeCanvas = document.getElementById("treeCanvas");
  const sapCanvas = document.getElementById("treeSap");
  const treeNodes = document.getElementById("treeNodes");
  // it lives in the tree so it inherits the tree's tokens, and shows nothing
  const inkProbe = document.createElement("span");
  inkProbe.style.cssText = "position:absolute;width:0;height:0;visibility:hidden";
  if (treeCanvas) treeCanvas.parentNode.appendChild(inkProbe);
  let sapDpr = 1;
  let skyRise = 0;
  let growNow = 1;                        // how far the tree has come out, 0 to 1
  const FLOW_STEP = 8;             // px between two samples of a guide
  const FLOW_VEINS = 7;
  const VEIN_CHUNKS = 16;

  /* The great curves, composed by eye rather than generated: dx is a share of
     the stage width from the middle, y a share of its height, at the height on
     the trunk where the curve parts from it. The first five carry the
     silhouette; the rest fill between them and stay dimmer. */
  const BRANCH_GUIDES = [
    { at: .47, major: 1, pts: [[-.11, .488], [-.25, .506], [-.39, .487], [-.54, .451]] },
    { at: .45, major: 1, pts: [[.12, .462], [.27, .481], [.41, .459], [.56, .418]] },
    { at: .42, major: 1, pts: [[-.08, .383], [-.19, .303], [-.31, .247], [-.45, .228]] },
    { at: .40, major: 1, pts: [[.07, .352], [.18, .272], [.30, .205], [.43, .188]] },
    { at: .35, major: 1, pts: [[.05, .27], [.12, .166], [.23, .095], [.36, .07]] },
    { at: .50, major: 0, pts: [[-.09, .527], [-.20, .548], [-.32, .534], [-.44, .503]] },
    { at: .485, major: 0, pts: [[.09, .506], [.21, .491], [.34, .517], [.47, .494]] },
    { at: .44, major: 0, pts: [[-.07, .427], [-.16, .377], [-.27, .347], [-.38, .338]] },
    { at: .375, major: 0, pts: [[.06, .315], [.15, .238], [.25, .19], [.35, .175]] },
    { at: .33, major: 1, pts: [[-.04, .25], [-.10, .155], [-.18, .088], [-.29, .062]] },
    { at: .505, major: 0, pts: [[.10, .532], [.23, .557], [.36, .551], [.49, .527]] },
    { at: .30, major: 0, pts: [[-.035, .225], [-.08, .148], [-.14, .095], [-.22, .075]] },
    // one more in each of the widest gaps of the fan, all of them above the two
    // great horizontal curves. The last pair parts high on the column and hooks
    // upward instead of out: short branches, held in close, as in the reference.
    { at: .445, major: 0, pts: [[-.075, .408], [-.175, .372], [-.29, .34], [-.41, .318]] },
    { at: .385, major: 0, pts: [[-.055, .318], [-.125, .245], [-.215, .19], [-.33, .168]] },
    { at: .30, major: 0, pts: [[-.03, .232], [-.062, .162], [-.086, .092], [-.10, .022]] },
    { at: .43, major: 0, pts: [[.08, .392], [.185, .35], [.30, .312], [.44, .288]] },
    { at: .365, major: 0, pts: [[.05, .30], [.115, .225], [.20, .168], [.31, .142]] },
    { at: .29, major: 0, pts: [[.032, .222], [.068, .152], [.092, .082], [.108, .012]] }
  ];
  const BRANCH_COUNT = BRANCH_GUIDES.length;

  /* and the ones that do not lean away: same table, same treatment, they simply
     keep going and leave by the top of the frame */
  const UP_GUIDES = [
    { at: .52, major: 1, up: 1, pts: [[-.013, .33], [-.004, .1], [-.015, -.14], [-.006, -.44]] },
    { at: .52, major: 1, up: 1, pts: [[.011, .34], [.004, .12], [.013, -.12], [.005, -.44]] },
    { at: .53, major: 1, up: 1, pts: [[-.007, .31], [-.016, .09], [-.006, -.15], [-.012, -.44]] },
    { at: .53, major: 1, up: 1, pts: [[.016, .32], [.006, .11], [.017, -.13], [.008, -.44]] },
    { at: .51, major: 1, up: 1, pts: [[-.019, .35], [-.009, .13], [-.02, -.11], [-.01, -.44]] },
    { at: .51, major: 1, up: 1, pts: [[.005, .3], [.014, .08], [.004, -.16], [.011, -.44]] }
  ];

  /* The two that carry the tree's shape. They run up the middle of the column
     and out of the top like the others, but their foot does not dive: it runs
     out almost level, far past the rest of the root mass. Those are the great
     lateral roots of the reference, and they are what sets the tree's width.
     Their root is written by hand rather than drawn from the seed — a shape
     this important cannot be left to chance. */
  const SPREAD_GUIDES = [
    { at: .52, major: 1, up: 1, key: "spread", lane: -.55, veins: 9, calm: .38,
      pts: [[-.022, .30], [-.01, .05], [-.02, -.2], [-.012, -.46]],
      root: [[-.44, .785], [-.29, .748], [-.155, .716], [-.055, .672]] },
    { at: .52, major: 1, up: 1, key: "spread", lane: .55, veins: 9, calm: .38,
      pts: [[.022, .31], [.01, .06], [.02, -.19], [.012, -.46]],
      root: [[.45, .795], [.30, .755], [.16, .722], [.058, .678]] }
  ];
  /* The ramp a vein cools along as it leaves the heart: white, then gold, then
     amber and ember at the tip. Every vein runs its own stretch of it — some
     stay white to the very end, some are already warm at the collar — and that
     is where the reference gets its diversity, not from a tint per branch. */
  const TREE_RAMP = ["core", "fiber", "amber", "ember", "blaze"];
  // the sap does not take the veins' colours: it runs the cool side of the
  // palette, which is what lets it stay faint and still be seen at all
  const SAP_RAMP = ["dust", "sap"];
  const BREATH_GROW = .34;                // the column is out well before the branches
  const RAMP_STEPS = 24;
  const treeGeom = { w: 0, heart: 340 };   // last stage drawn, for the surge
  const treeCache = { key: "", tree: null };
  // what the little adders need to know about the stage they are filling, kept
  // here rather than threaded through six signatures that do not care
  const build = { fadeFrom: 0, fadeTo: 0, growBase: 0, flowLen: 1 };
  const GROW_SPAN = .44;                  // share of the growth one flow takes
  const HEART_FROM = .18, HEART_TO = .62;  // when the core lights, over the column

  /* a small deterministic generator: same seed, same tree, every time */
  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function seedOf(text) {
    let s = 2166136261;
    for (let i = 0; i < text.length; i++) {
      s ^= text.charCodeAt(i);
      s = Math.imul(s, 16777619);
    }
    return s >>> 0;
  }

  /* How much of a stroke survives up in the sky: whole at the tree's own top,
     nothing left by the end of the first screen above it. Baked in here rather
     than wiped off the finished image, because the tree is now painted a slice
     at a time and a wipe would bite the same pixels once per slice. */
  function skyFadeAt(y) {
    if (!build.fadeTo || y > -build.fadeFrom) return 1;
    return Math.max(0, 1 - (-y - build.fadeFrom) / (build.fadeTo - build.fadeFrom));
  }

  /* how much of a window [from, to] a slice (lo, hi] covers, so something drawn
     over several slices ends up at exactly its full strength */
  function spanShare(lo, hi, from, to) {
    const a = Math.max(lo, from), b = Math.min(hi, to);
    return b <= a ? 0 : (b - a) / (to - from);
  }

  /* when a thing comes out of the ground, 0 to 1 over the whole growth */
  function growAt(at) {
    return build.growBase + GROW_SPAN * Math.max(0, Math.min(1, at / (build.flowLen - 1)));
  }

  /* The tree's inks are now mixed from the theme's own signature, so reading the
     custom property gives back the color-mix() call rather than a colour. It is
     put on a probe and read as a real `color` instead, which always computes to
     rgb() whatever the theme wrote. */
  function treeInk(name, fallback) {
    inkProbe.style.color = fallback;                 // a floor if the token is empty
    inkProbe.style.color = "var(" + name + ", " + fallback + ")";
    return getComputedStyle(inkProbe).color || fallback;
  }

  /* A computed colour comes back as rgb(r, g, b), or — once it has been through
     a color-mix — as color(srgb r g b) with the channels running 0 to 1. */
  function rgbOf(colour) {
    if (colour.charAt(0) !== "#") {
      const nums = colour.match(/[\d.]+/g) || ["0", "0", "0"];
      const scale = colour.indexOf("color(") === 0 ? 255 : 1;
      return [Math.round(nums[0] * scale), Math.round(nums[1] * scale),
              Math.round(nums[2] * scale)];
    }
    const s = colour.slice(1);
    const full = s.length === 3
      ? s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2)
      : s;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* The ramp cut into steps once per draw, so a stroke only reads an index —
     there are a few thousand of them and they must not each build a string. */
  function rampOf(inks, names) {
    const stops = [];
    for (let i = 0; i < names.length; i++) stops.push(rgbOf(inks[names[i]]));
    const steps = [];
    for (let s = 0; s <= RAMP_STEPS; s++) {
      const at = s / RAMP_STEPS * (stops.length - 1);
      const k = Math.min(stops.length - 2, Math.floor(at));
      const t = at - k;
      const a = stops[k], b = stops[k + 1];
      steps.push("rgb(" + Math.round(a[0] * (1 - t) + b[0] * t) + "," +
                 Math.round(a[1] * (1 - t) + b[1] * t) + "," +
                 Math.round(a[2] * (1 - t) + b[2] * t) + ")");
    }
    return steps;
  }

  /* the tree wants the room: the stage takes the window, within reason */
  function stageHeight() {
    return Math.max(880, Math.round(window.innerHeight * 1.35));
  }

  /* Empty sky kept above the tree so the view can be pushed up past the last
     branch, where nothing is left but the column. Two screens of it: the first
     carries the trunk fading out, the second is bare. A page cannot be scrolled
     above its own start, so the room is made inside the canvas and the view is
     dropped to the tree when the room opens. */
  function skyHeight() {
    return Math.round(window.innerHeight * 2);
  }

  function smoothen(t) { return t * t * (3 - 2 * t); }

  /* how faithfully a habit has been kept lately: 0 to 1 over eight weeks, with
     the recent days counting for more than the old ones */
  function habitVigour(habit) {
    if (state.settings.treeFull) return 1;   // preview: as if never missed
    const done = laneDays(habit);
    const today = new Date();
    let sum = 0, total = 0;
    for (let i = 0; i < 56; i++) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      const weight = 1 - i / 70;               // today counts most
      total += weight;
      if (done[dateKeyOf(day)]) sum += weight;
    }
    return total ? sum / total : 0;
  }

  /* the trunk burns on what was kept in the last week, all habits together */
  function trunkGlow() {
    if (state.settings.treeFull) return 1;
    if (!state.habits.length) return .12;
    const today = new Date();
    let hit = 0;
    for (let i = 0; i < 7; i++) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      const key = dateKeyOf(day);
      for (let h = 0; h < state.habits.length; h++) {
        if (laneDays(state.habits[h])[key]) hit++;
      }
    }
    return Math.min(1, hit / (7 * state.habits.length));
  }

  /* A stable, balanced order of the great branches: low-left, high-right,
     low-right, high-left and round again. Habits are handed slots in that
     order, so the first ones never pile up on one side, and adding a habit
     never moves the branches the others already had. */
  function branchOrder() {
    const buckets = [[], [], [], []];        // low-left, low-right, high-left, high-right
    for (let b = 0; b < BRANCH_COUNT; b++) {
      const spec = BRANCH_GUIDES[b];
      const low = spec.at > .44 ? 0 : 2;
      buckets[low + (spec.pts[spec.pts.length - 1][0] > 0 ? 1 : 0)].push(b);
    }
    const rota = [0, 3, 1, 2];
    const order = [];
    while (order.length < BRANCH_COUNT) {
      for (let k = 0; k < 4; k++) {
        const pick = buckets[rota[k]];
        if (pick.length) order.push(pick.shift());
      }
    }
    return order;
  }

  /* which habits a branch answers to. Two branches each while there is room,
     one apiece once there are many — never two habits owning one outright. */
  function branchOwners() {
    const order = branchOrder();
    const owners = [];
    for (let b = 0; b < BRANCH_COUNT; b++) owners.push([]);
    const count = state.habits.length;
    if (!count) return owners;
    const each = count * 2 <= order.length ? 2 : 1;
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < each; k++) owners[order[(i * each + k) % order.length]].push(i);
    }
    owners.single = each === 1;
    return owners;
  }

  /* A smooth line through the given points, then resampled at a steady pace so
     the noise, the widths and the particles all read the same along it. */
  function guideThrough(controls) {
    const dense = [];
    for (let i = 0; i < controls.length - 1; i++) {
      const p0 = controls[i - 1] || controls[i];
      const p1 = controls[i];
      const p2 = controls[i + 1];
      const p3 = controls[i + 2] || p2;
      for (let k = 0; k < 26; k++) {
        const t = k / 26, t2 = t * t, t3 = t2 * t;
        dense.push({
          x: .5 * (2 * p1.x + (-p0.x + p2.x) * t +
                   (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                   (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: .5 * (2 * p1.y + (-p0.y + p2.y) * t +
                   (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                   (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    dense.push(controls[controls.length - 1]);

    const out = [dense[0]];
    let carry = 0;
    for (let i = 1; i < dense.length; i++) {
      const dx = dense[i].x - dense[i - 1].x;
      const dy = dense[i].y - dense[i - 1].y;
      const seg = Math.hypot(dx, dy);
      if (seg < .001) continue;
      let at = FLOW_STEP - carry;
      while (at <= seg) {
        out.push({ x: dense[i - 1].x + dx * (at / seg), y: dense[i - 1].y + dy * (at / seg) });
        at += FLOW_STEP;
      }
      carry = seg - (at - FLOW_STEP);
    }
    return out;
  }

  function normalsOf(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i > 0 ? i - 1 : 0];
      const b = pts[i < pts.length - 1 ? i + 1 : i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      out.push({ x: -dy / len, y: dx / len, tx: dx / len, ty: dy / len });
    }
    return out;
  }

  /* A wander with no rhythm: values drawn at irregular intervals and eased
     between them, so a line changes its mind without warning. Two sines, however
     slow, always read as regular — this does not. `span` sets how far apart the
     knots fall, which is what tells a long meander from a nervous drift. */
  function drifter(rnd, span) {
    const knots = [{ at: 0, v: (rnd() - .5) * 2 }];
    let at = 0;
    while (at < 900) {
      at += Math.round(span * (.35 + rnd()));
      knots.push({ at: at, v: (rnd() - .5) * 2 });
    }
    return function (i) {
      let k = 0;
      while (k < knots.length - 2 && knots[k + 1].at <= i) k++;
      const a = knots[k], b = knots[k + 1];
      const t = smoothen(Math.max(0, Math.min(1, (i - a.at) / (b.at - a.at))));
      return a.v * (1 - t) + b.v * t;
    };
  }

  /* a slow smooth wander in [-1, 1] — two sines, for the fine shiver */
  function wobbler(rnd) {
    const p1 = rnd() * 6.3, f1 = .03 + rnd() * .04;
    const p2 = rnd() * 6.3, f2 = .1 + rnd() * .08;
    return function (i) {
      return Math.sin(p1 + i * f1) * .68 + Math.sin(p2 + i * f2) * .32;
    };
  }

  function pathOf(px) {
    const path = new Path2D();
    path.moveTo(px[0], px[1]);
    for (let i = 2; i < px.length - 2; i += 2) {
      path.quadraticCurveTo(px[i], px[i + 1],
                            (px[i] + px[i + 2]) / 2, (px[i + 1] + px[i + 3]) / 2);
    }
    path.lineTo(px[px.length - 2], px[px.length - 1]);
    return path;
  }

  /* A sub-flow is braided, not parallel: it is given three lateral marks along
     the guide and eases from one to the next, so it may cross a neighbour, come
     back and leave again. A few are also handed a neighbouring guide, and drift
     part of the way over to it near the end — that is what ties two branches
     together instead of leaving a comb. */
  function subFlow(guide, norms, widths, rnd, opt) {
    const wob = wobbler(rnd);
    const base = opt.base;
    const from = opt.from;
    const other = opt.other;
    const swing = opt.braid === undefined ? 1 : opt.braid;
    const hold = opt.hold === undefined ? 0 : opt.hold;   // width used before it opens
    const part = opt.part || 0;                           // how far it parts once thin
    const span = opt.openIn || Math.max(8, (guide.length - from) * .35);
    const run = Math.max(1, guide.length - from);
    const away = [base * (.2 + rnd() * .5) + (rnd() - .5) * 2.1,
                  -base * (.4 + rnd() * 1.2),
                  base * (.4 + rnd() * 1.3)];
    const marks = [base,
                   base + (away[0] - base) * swing,
                   base + (away[1] - base) * swing,
                   base + (away[2] - base) * swing];
    const pts = [];
    for (let i = 0; i < guide.length; i++) {
      const t = Math.max(0, Math.min(1, (i - from) / run));
      const open = smoothen(Math.max(0, Math.min(1, (i - from) / span)));
      const room = widths[i] * (hold + (1 - hold) * open) + open * open * part;
      const off = (lane(marks, t) + wob(i) * .5 * open * swing) * room;
      let x = guide[i].x + norms[i].x * off;
      let y = guide[i].y + norms[i].y * off;
      if (other) {
        const near = other[Math.min(other.length - 1, Math.round(t * (other.length - 1)))];
        const pull = smoothen(Math.max(0, Math.min(1, (t - .45) / .5))) * .5;
        x += (near.x - x) * pull;
        y += (near.y - y) * pull;
      }
      pts.push({ x: x, y: y });
    }
    return pts;
  }

  /* eases through the lateral marks of a braid */
  function lane(marks, t) {
    const seg = t * (marks.length - 1);
    const i = Math.min(marks.length - 2, Math.floor(seg));
    const k = smoothen(seg - i);
    return marks[i] * (1 - k) + marks[i + 1] * k;
  }

  /* A VEIN is one visible line. It is stroked three times on the same curve —
     a wide, almost invisible halo, a gold body, and a thin bright core — so a
     single trajectory reads as a thick luminous vein without ever becoming a
     hard graphic stroke. Its weight is not the same all along: cut in short
     chunks and graded, it thickens out of the ground and thins away down the
     branch with no step showing at the joins. */
  function addVein(zone, line, opt) {
    const n = line.pts.length;
    for (let k = 0; k < VEIN_CHUNKS; k++) {
      const from = Math.round(n * k / VEIN_CHUNKS);
      const to = Math.min(n, Math.round(n * (k + 1) / VEIN_CHUNKS) + 1);
      if (to - from < 4) continue;
      const mid = (from + to) / 2;
      const grade = veinWeight(mid, line, n);
      // a tip thins, it does not go out: dimming it as hard as it narrows turns
      // the warm end of the ramp to brown instead of ember
      const lit = .72 + .28 * grade;
      const tint = opt.tintFrom + (opt.tintTo - opt.tintFrom) * veinHeat(mid, line, n);
      const seat = line.from + mid;
      const veil = skyFadeAt(line.pts[Math.round(mid)].y);
      const px = [];
      for (let i = from; i < to; i++) px.push(line.pts[i].x, line.pts[i].y);
      zone.veins.push({
        path: pathOf(px),
        halo: opt.halo * grade, haloAlpha: opt.haloAlpha * lit * veil,
        body: opt.body * grade, bodyAlpha: opt.bodyAlpha * lit * veil,
        grow: growAt(seat),
        tint: Math.round(Math.max(0, Math.min(1, tint)) * RAMP_STEPS),
        core: mid > line.foot && (line.up || line.split < 0 || mid < line.split) ? opt.core : 0,
        coreAlpha: opt.coreAlpha * veil,
        cap: k === 0 || k === VEIN_CHUNKS - 1 ? "round" : "butt",
        reveal: opt.reveal
      });
    }
  }

  /* thin in the ground, full in the column, fading away along the branch. A flow
     that carries on upward has no tip to fade into: it leaves by the top edge.

     A root tapers over the last stretch before its tip, not over its whole
     length — spread over the length, a root that reaches twice as far would be
     drawn twice as thin everywhere, and the great lateral ones would vanish. */
  function veinWeight(i, line, n) {
    const foot = line.foot, split = line.split;
    if (i < foot) return .3 + .7 * Math.pow(Math.min(1, i / Math.min(foot, 45)), .7);
    if (!line.up && split > 0 && i > split) {
      return 1 - .44 * ((i - split) / Math.max(1, n - split));
    }
    return 1;
  }

  /* 0 in the column, where the tree runs white-hot, 1 at either tip — the far
     end of a root and the far end of a branch cool the same way */
  function veinHeat(i, line, n) {
    if (i < line.foot) return 1 - i / Math.max(1, line.foot);
    if (line.split > 0 && i > line.split) {
      return (i - line.split) / Math.max(1, n - line.split);
    }
    return 0;
  }

  function drawVein(ctx, vein, inks, lift, pass) {
    ctx.lineCap = vein.cap;
    if (pass === 0) {
      ctx.strokeStyle = inks.ramp[vein.tint];
      ctx.globalAlpha = vein.haloAlpha * lift;
      ctx.lineWidth = vein.halo;
    } else if (pass === 1) {
      ctx.strokeStyle = inks.ramp[vein.tint];
      ctx.globalAlpha = vein.bodyAlpha * lift;
      ctx.lineWidth = vein.body;
    } else {
      if (!vein.core) return;
      ctx.strokeStyle = inks.core;
      ctx.globalAlpha = vein.coreAlpha * lift;
      ctx.lineWidth = vein.core;
    }
    ctx.stroke(vein.path);
  }

  /* The wisps: the stray hairs around the veins. They carry no structure — the
     switch in the settings takes them away so the skeleton can be judged. */
  function addWisps(zone, line, widths, rnd, opt) {
    const norms = normalsOf(line);
    const n = line.length;
    // a fibre is trimmed to its own length, so the anchor can fall past its end
    const anchor = Math.max(0, Math.min(opt.from, n - 1));
    for (let f = 0; f < opt.count; f++) {
      const pick = (rnd() - .5) * 2;
      const share = pick * (.45 + .55 * Math.abs(pick));
      const wob = wobbler(rnd);
      const stray = rnd() < .12;                  // a few leave the bundle
      const from = rnd() < opt.throughRate
        ? Math.round(rnd() * anchor)            // spread, or they all start on one line
        : Math.max(0, anchor - Math.round(rnd() * 22));
      const to = n - Math.round(rnd() * rnd() * (n - anchor) * .45);
      if (to - from < 6) continue;
      const px = [];
      for (let i = from; i < to; i++) {
        const off = (share * .85 + wob(i) * .45) * widths[i] * (stray ? 1.9 : 1);
        px.push(line[i].x + norms[i].x * off, line[i].y + norms[i].y * off);
      }
      const roll = rnd();
      const bright = roll > .985, mid = roll > .62;   // white is rare, gold carries
      // the bundle fills in first, then its core lights, then the strays
      let reveal = opt.reveal + (1 - opt.reveal) * rnd() * rnd();
      if (bright) reveal = Math.max(reveal, .62);
      if (stray) reveal = Math.max(reveal, .72);
      let alpha = opt.alpha * (bright ? 1.7 : mid ? 1 : .5);
      if (opt.fade) {                                  // roots give out with depth
        const deep = Math.max(0, Math.min(1, (line[to - 1].y - opt.fade.from) / opt.fade.span));
        alpha *= Math.exp(-3.6 * deep);
      }
      const seat = (opt.base || 0) + (from + to) / 2;
      zone.fibres.push({
        path: pathOf(px),
        width: (bright ? .9 : .45) + rnd() * .6,
        alpha: alpha * skyFadeAt(line[Math.round((from + to) / 2)].y),
        grow: growAt(seat),
        ink: bright ? "core" : mid ? opt.ink : opt.faint,
        pass: bright ? 2 : mid ? 1 : 0,
        reveal: reveal
      });
    }
  }

  /* The canopy is not leaves, it is dust: clusters strung along the last third
     of a flow, stretched the way the flow runs. Gold close in, turquoise out at
     the edge, with black left between the clusters. */
  function addClouds(zone, line, rnd, opt) {
    const pts = line.pts;
    const norms = normalsOf(pts);
    const n = pts.length;
    const clusters = 2 + Math.round(rnd() * 3);
    for (let c = 0; c < clusters; c++) {
      // most gather at the far end, but a few sit back down the flow: the
      // travelling wave is seen only through the grains it passes, so the cloud
      // has to reach the column and the roots too
      const reach = rnd() < .6 ? .62 + .36 * rnd() : rnd();
      const at = Math.round(reach * (n - 1));
      if (at < 2 || at >= n) continue;
      const spot = pts[at], dir = norms[at];
      // it lies along the flow rather than across it: a cluster as wide as it is
      // long sits beside the branch instead of clothing it
      const along = 46 + rnd() * 120;
      const across = (12 + rnd() * 34) * (.35 + .65 * reach);
      const grains = Math.round(opt.grains * (.35 + .65 * reach) * (.5 + rnd()));
      for (let g = 0; g < grains; g++) {
        const u = (rnd() + rnd() - 1);
        const v = (rnd() + rnd() - 1);
        const far = Math.abs(v);
        const big = rnd() > .94;
        zone.dots.push({
          x: spot.x + dir.tx * u * along + dir.x * v * across,
          y: spot.y + dir.ty * u * along + dir.y * v * across,
          r: big ? 2.6 + rnd() * 2.8 : .5 + rnd() * rnd() * 2.4,
          alpha: (.16 + rnd() * .4) * (1 - far * .45) * opt.alpha * skyFadeAt(spot.y),
          ink: far > .62 ? "dust" : rnd() > .93 ? "core" : "fiber",
          at: line.from + at,                  // where it sits along the flow
          grow: growAt(line.from + at),
          reveal: big ? .8 + rnd() * .2 : opt.reveal + (1 - opt.reveal) * rnd()
        });
      }
    }
  }

  /* A fine haze strung the whole length of a flow, one grain every few samples.
     The clusters alone left the travelling wave nothing to light between one
     and the next, so it read as two puffs blinking rather than as something
     crossing the tree. */
  function addHaze(zone, centre, rnd) {
    const pts = centre.pts;
    const norms = normalsOf(pts);
    const n = pts.length;
    const grains = Math.round(n / 3);
    for (let g = 0; g < grains; g++) {
      const at = Math.round(rnd() * (n - 1));
      const spot = pts[at], dir = norms[at];
      const off = (rnd() + rnd() - 1) * (6 + 18 * (at / n));
      zone.dots.push({
        x: spot.x + dir.x * off, y: spot.y + dir.y * off,
        r: .3 + rnd() * rnd() * .9,
        alpha: (.08 + rnd() * .14) * skyFadeAt(spot.y),
        ink: rnd() > .7 ? "dust" : "fiber",
        at: at, grow: growAt(at),
        reveal: .3 + .45 * rnd()
      });
    }
  }

  /* THE AIR — motes hanging around the tree, each leaving the branch it was
     born on and drifting off along the normal. Nothing is simulated: a mote's
     position is read straight off the clock, so there is no state to carry and
     the whole field costs one pass of arcs. */
  function addMotes(zone, centre, norms, up, rnd) {
    const pts = centre.pts;
    const count = up ? 16 : 42;
    for (let m = 0; m < count; m++) {
      // born along the limb, past the ground: the roots have no air to hold
      const at = Math.round(centre.foot + (pts.length - 1 - centre.foot) * rnd());
      const dir = norms[at];
      const side = rnd() < .5 ? -1 : 1;
      zone.motes.push({
        x: pts[at].x, y: pts[at].y, grow: growAt(at),
        dx: dir.x * side, dy: dir.y * side,
        reach: 60 + rnd() * 130,
        life: 15 + rnd() * 17, phase: rnd(),
        sway: 7 + rnd() * 14, beat: .1 + rnd() * .22, turn: rnd() * 6.3,
        r: .5 + rnd() * rnd() * 2.1,
        ink: rnd() > .55 ? "dust" : "fiber",
        reveal: .2 + .5 * rnd()
      });
    }
  }

  function newZone(kind, habitIndex) {
    return {
      kind: kind, habit: habitIndex,
      veins: [], fibres: [], dots: [], blooms: [], twinkles: [], motes: [], tips: []
    };
  }

  /* THE BLOOM — the last thing a branch grows, and the only part of the tree
     that has to be earned outright: a zone flowers once its habit has been kept
     long enough, well after the wisps and the dust. Three forms, each switched
     on its own and freely combined, so the three can be worn together.

     All three are built whatever the settings say and sorted out at draw time:
     the skeleton is cached by stage size, and rebuilding it on a switch would
     shuffle every seeded shape in the tree. */
  function addBlooms(zone, line, rnd, major) {
    const n = line.pts.length;
    if (n < 14 || line.split <= 0) return;
    const tip = line.pts[n - 1];
    const heading = Math.atan2(tip.y - line.pts[n - 6].y, tip.x - line.pts[n - 6].x);

    if (rnd() < .62) {
      zone.blooms.push({
        kind: "corolla", x: tip.x, y: tip.y,
        path: corollaPath(tip, heading, 7 + Math.round(rnd() * 4), rnd),
        glow: 11 + rnd() * 8, core: major ? 1.5 : 1.1,
        grow: growAt(line.from + n - 1), reveal: .72 + .2 * rnd()
      });
    }
    if (rnd() < .55) {
      const spread = 12 + rnd() * 15;
      const grains = [];
      const count = 16 + Math.round(rnd() * 18);
      for (let g = 0; g < count; g++) {
        const a = rnd() * Math.PI * 2;
        const far = Math.pow(rnd(), .55);
        grains.push({
          dx: Math.cos(a) * spread * far, dy: Math.sin(a) * spread * far,
          r: .5 + rnd() * rnd() * 2.2,
          ink: far > .6 ? "dust" : rnd() > .82 ? "core" : "fiber"
        });
      }
      zone.blooms.push({
        kind: "burst", x: tip.x, y: tip.y, grains: grains,
        glow: spread * .85, core: 1.3,
        grow: growAt(line.from + n - 1), reveal: .74 + .18 * rnd()
      });
    }
    let at = line.split + 6 + Math.round(rnd() * 12);
    while (at < n - 4) {
      const seat = line.pts[at];
      const lean = Math.atan2(seat.y - line.pts[at - 3].y, seat.x - line.pts[at - 3].x);
      zone.blooms.push({
        kind: "bud", x: seat.x, y: seat.y,
        path: hairsPath(seat, lean, 2 + Math.round(rnd() * 2), rnd),
        glow: 3.5 + rnd() * 3.5, core: .6 + rnd() * rnd() * 1.4,
        grow: growAt(line.from + at), reveal: .68 + .24 * rnd()
      });
      at += 17 + Math.round(rnd() * 30);          // spaced, or the branch beads
    }
  }

  /* short fibres leaving one point and curling as they go, the whole flower in
     a single path so it costs one stroke */
  function corollaPath(at, heading, petals, rnd) {
    const path = new Path2D();
    for (let p = 0; p < petals; p++) {
      // uneven spacing and uneven lengths, or the petals read as an asterisk:
      // most stay short like stamens, a few reach right out
      const a = heading + (p / petals) * Math.PI * 2 + (rnd() - .5) * .95;
      const len = 5 + rnd() * rnd() * 19;
      const curl = (rnd() < .5 ? -1 : 1) * (.45 + rnd() * .7);
      path.moveTo(at.x, at.y);
      for (let s = 1; s <= 5; s++) {
        const t = s / 5;
        const bend = curl * len * t * t;
        path.lineTo(at.x + Math.cos(a) * len * t + Math.cos(a + 1.5708) * bend,
                    at.y + Math.sin(a) * len * t + Math.sin(a + 1.5708) * bend);
      }
    }
    return path;
  }

  /* the two or three hairs a bud carries, leaning off the branch */
  function hairsPath(at, lean, hairs, rnd) {
    const path = new Path2D();
    for (let k = 0; k < hairs; k++) {
      const a = lean + (rnd() < .5 ? -1 : 1) * (.65 + rnd() * 1.5);
      const len = 4 + rnd() * 7;
      path.moveTo(at.x, at.y);
      path.lineTo(at.x + Math.cos(a) * len * .5, at.y + Math.sin(a) * len * .5);
      path.lineTo(at.x + Math.cos(a + .55) * len, at.y + Math.sin(a + .55) * len);
    }
    return path;
  }

  /* THE SKELETON — built once for a stage size, then only lit differently.

     Everything in the drawing is a root. A flow is a bundle of veins sharing
     one root system: it comes out of the ground, gathers into the column, and
     there it does one of two things — lean away into its branch, or carry on
     out of the top of the frame. That is the whole grammar. A vein is one
     single line from its tip in the ground to wherever it ends, so the trunk is
     nothing but the roots interlacing on their way up. */
  function buildTree(w, h, sky) {
    const cx = w / 2;
    const heart = h * .46;              // where the great branches leave
    const collar = h * .58;             // where the column becomes root
    const half = w * .026;              // the column's half width
    const zones = [];
    build.fadeFrom = sky * .06;
    build.fadeTo = sky * .48;

    // the order the tree comes out in: the column first, then the branches from
    // the lowest to the highest, each one climbing out of its own root
    for (let i = 0; i < SPREAD_GUIDES.length; i++) {
      build.growBase = .02 * i;
      buildFlow(zones, i, SPREAD_GUIDES[i], cx, w, h, heart, collar, half, sky);
    }
    for (let i = 0; i < UP_GUIDES.length; i++) {
      build.growBase = .01 * i;
      buildFlow(zones, i, UP_GUIDES[i], cx, w, h, heart, collar, half, sky);
    }
    const order = [];
    for (let b = 0; b < BRANCH_COUNT; b++) order.push(b);
    order.sort(function (a, b) { return BRANCH_GUIDES[b].at - BRANCH_GUIDES[a].at; });
    const branches = [];
    for (let r = 0; r < order.length; r++) {
      const b = order[r];
      build.growBase = .14 + .42 * (r / Math.max(1, order.length - 1));
      branches.push(buildFlow(zones, b, BRANCH_GUIDES[b], cx, w, h, heart, collar, half, sky));
    }
    buildCanopy(branches, cx, w, h);
    return { cx: cx, heart: heart, collar: collar, zones: zones, w: w, h: h };
  }

  function buildFlow(zones, index, spec, cx, w, h, heart, collar, half, sky) {
    const up = !!spec.up;
    const out = spec.pts[spec.pts.length - 1][0] > 0 ? 1 : -1;
    const major = spec.major;
    const veins = spec.veins || (major ? FLOW_VEINS : 4);
    const zone = newZone(up ? "trunk" : "branch", up ? null : index);
    const limb = { zone: zone, out: out, spec: spec, flowPts: [],
                   grow: build.growBase + GROW_SPAN };
    // one lane law for every flow, or the column reads at two different widths
    const band = spec.lane !== undefined ? spec.lane * half
               : up ? ((index + .5) / UP_GUIDES.length - .5) * 1.7 * half
                    : out * half * (.3 + .4 * ((index * .6180339) % 1));
    const name = (spec.key || (up ? "up" : "branch")) + index;
    const rootPath = spec.root ? handRoot(spec.root, w, h)
                               : flowRootGuide(index + (up ? 5 : 0), out, w, h, collar,
                                               seeded(seedOf(name + "_root")));
    const centre = veinLine(cx, w, h, heart, collar, band, rootPath, spec, sky,
                            seeded(seedOf(name + "_sway")));
    const norms = normalsOf(centre.pts);
    const radii = radiiOf(centre.pts);
    build.flowLen = centre.pts.length;
    zone.grow = build.growBase + GROW_SPAN;      // when the flow is fully out
    // the sap climbs the flow's own centre line, not any one of its fibres. It
    // crosses in a second or two and then the flow lies quiet for a minute or
    // more, so at any moment one or two of them are running, no more.
    const sapRnd = seeded(seedOf(name + "_sap"));
    zone.conduit = centre.pts;
    zone.norms = norms;
    // one or two threads leave their rest position and come back, the way a
    // filament lifts off the sun and settles. Below the collar the excursion
    // sits at the very tip, which reads as a root nosing for somewhere to dig.
    zone.strands = [];
    const strands = 1 + Math.round(sapRnd() * 1);
    for (let t = 0; t < strands; t++) {
      const root = sapRnd() < .4;
      const seat = root ? Math.round(centre.foot * (.05 + .25 * sapRnd()))
                        : Math.round(centre.foot + (centre.pts.length - centre.foot) *
                                     (.2 + .7 * sapRnd()));
      zone.strands.push({
        at: seat, span: 16 + Math.round(sapRnd() * 26), grow: growAt(seat),
        lane: (sapRnd() - .5) * half * .5,
        lift: (sapRnd() < .5 ? -1 : 1) * half * (.7 + 1.5 * sapRnd()),
        cycle: 17 + sapRnd() * 30, rise: 3.4 + sapRnd() * 4, phase: sapRnd()
      });
    }
    zone.sap = {
      cycle: 125 + sapRnd() * 200, climb: 2.1 + sapRnd() * 2.45, phase: sapRnd(),
      tail: 24 + Math.round(sapRnd() * 22)
    };
    addHaze(zone, centre, seeded(seedOf(name + "_haze")));
    addMotes(zone, centre, norms, up, seeded(seedOf(name + "_air")));

    for (let v = 0; v < veins; v++) {
      const rnd = seeded(seedOf(name + "_" + v));
      const rank = (v - (veins - 1) / 2) / Math.max(.5, (veins - 1) / 2);
      const edge = Math.abs(rank);                  // 0 in the middle, 1 at the rim
      const lane = rank * half * .15;
      const weave = half * (.09 + .17 * rnd());     // how wide its meander runs
      // three even parts: one keeps to the flow all the way, one walks off in
      // the middle of nowhere, one only opens out near the tip. The fibre in
      // the middle of the sheaf always keeps to it — it is the flow's own line.
      const reach = centre.pts.length - centre.split;
      const role = edge < .1 ? 0 : (v + index) % 3;
      const stray = role === 1 ? {
        at: Math.round(centre.foot + rnd() * (centre.pts.length - centre.foot) * .75),
        span: 26 + Math.round(rnd() * 44),
        // a vein straying inside the column would widen it, so there it is a
        // twist out of the bundle rather than a walk away from it
        away: (rnd() < .5 ? -1 : 1) * half * (up ? .1 + rnd() * .18 : .25 + rnd() * .55)
      } : null;
      const part = role === 2 && !up ? {
        at: centre.split + reach * (.34 + .48 * rnd()),
        span: reach * (.22 + .35 * rnd()),
        away: (rank || (rnd() - .5) * 1.6) * half * (.55 + .95 * rnd())
      } : null;
      const line = fibreOf(centre, norms, radii, lane, weave, stray, part, rnd);

      addWisps(zone, line.pts, line.widths, rnd, {
        count: major ? 5 : 3, from: line.split > 0 ? line.split : line.foot,
        base: line.from, throughRate: .25, alpha: .05, ink: "fiber", faint: "deep",
        reveal: .3 + .5 * rnd()
      });
      // a quarter of them are already warm when they leave the collar, and a
      // few never cool at all: that mix is what keeps a bundle from reading as
      // one flat colour. A flow going up stays close to white all the way.
      const tintFrom = rnd() < .25 ? .28 + .32 * rnd() : .02 + .13 * rnd();
      const tintTo = up ? tintFrom + .3 * rnd()
                        : rnd() < .18 ? tintFrom + .22 * rnd() : .55 + .45 * rnd();
      const weight = 1 - .4 * edge;
      addVein(zone, line, {
        halo: (major ? 8.5 : 4.6) * weight,
        haloAlpha: (major ? .036 : .022) * weight,
        body: (major ? 3 : 1.9) * weight,
        bodyAlpha: (major ? .3 : .24) * weight,
        tintFrom: tintFrom, tintTo: tintTo,
        core: edge < .1 ? (major ? .8 : .5) : 0, coreAlpha: .45,
        reveal: edge < .1 ? 0 : .12 + .6 * edge
      });
      // the column carries a thin cloud too, or the wave crosses it unseen
      addClouds(zone, line, rnd, {
        grains: up ? 4 : major ? 14 : 9, alpha: 1, reveal: .45 + .45 * (v / veins)
      });
      if (up) continue;

      addBlooms(zone, line, rnd, major);
      for (let i = line.split; i < line.pts.length; i += 3) limb.flowPts.push(line.pts[i]);
      const tip = line.pts[line.pts.length - 1];
      zone.tips.push({ x: tip.x, y: tip.y, out: out });

      if (major && v < 2 && rnd() < .6) {
        const at = Math.round(line.split + (line.pts.length - line.split) * (.55 + .3 * rnd()));
        if (at > line.split + 4 && at < line.pts.length - 6) {
          buildBranchlet(limb, line.pts, line.widths, at, rnd);
        }
      }
    }
    // the twinkles sit on grains of the cloud, so a star is always a mote of
    // dust catching the light rather than a mark added over the drawing
    const twinkles = 4 + Math.round(sapRnd() * 3);
    for (let t = 0; t < twinkles && zone.dots.length; t++) {
      const dot = zone.dots[Math.floor(sapRnd() * zone.dots.length)];
      zone.twinkles.push({
        x: dot.x, y: dot.y, arm: 3 + sapRnd() * 5, r: .7 + sapRnd() * .9,
        grow: dot.grow,
        cycle: 5 + sapRnd() * 14, hold: .3 + sapRnd() * .5, phase: sapRnd(),
        reveal: dot.reveal
      });
    }
    zones.push(zone);
    return limb;
  }

  /* One root guide per flow, drawn once and shared by all its veins — the flow
     is a single curve from its tip in the ground to its tip in the air, and the
     veins are only its fibres. Coordinates are relative to the middle. */
  function flowRootGuide(index, out, w, h, collar, rnd) {
    const seat = (index * .6180339) % 1;
    const reach = .1 + .9 * seat * seat;
    const tipX = out * w * (.012 + .3 * reach);
    const tipY = collar + (h - collar) *
                 Math.min(.95, .34 + .6 * (1 - reach * .5) * (.7 + .5 * rnd()));
    const deep = tipY - collar;
    const bow = (rnd() - .45) * w * .1;
    const knee = .28 + rnd() * .38;
    return [
      { x: tipX, y: tipY },
      { x: tipX * .8 + bow, y: collar + deep * .74 },
      { x: tipX * knee + bow * 1.3, y: collar + deep * .44 },
      { x: tipX * .14, y: collar + deep * .17 }
    ];
  }

  /* a root taken straight from the guide table, in the same frame as the drawn
     ones: x relative to the middle, y down the stage */
  function handRoot(pts, w, h) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      out.push({ x: pts[i][0] * w, y: pts[i][1] * h });
    }
    return out;
  }

  /* The line itself, in one stroke of control points: out of the ground, into
     the column, then away if it has a branch to follow. The last points of the
     root already sit on the column's own lane, which is what lets it join the
     trunk without a corner; the weave is a hair of lateral drift up the column,
     so two veins of the same flow twist around each other. */
  function veinLine(cx, w, h, heart, collar, band, rootPath, branch, sky, rnd) {
    const controls = [];
    for (let k = 0; k < rootPath.length; k++) {
      controls.push({ x: cx + rootPath[k].x + band, y: rootPath[k].y });
    }
    controls.push({ x: cx + band, y: collar });
    const splitY = branch.at * h;
    controls.push({ x: cx + band, y: (collar + splitY) / 2 });
    controls.push({ x: cx + band, y: splitY });
    // a branch dissolves its lane as it leans away; an upward flow keeps it all
    // the way, and its table points are only a wobble inside the column
    for (let k = 0; k < branch.pts.length; k++) {
      const hold = branch.up ? 1 : 1 - k / Math.max(1, branch.pts.length - 1);
      const reach = branch.up ? .35 : 1;
      controls.push({ x: cx + band * hold + branch.pts[k][0] * w * reach,
                      y: branch.pts[k][1] * h });
    }
    // an upward flow carries on into the sky, past where it will have faded out
    if (branch.up && sky > 0) {
      const last = branch.pts[branch.pts.length - 1][0];
      controls.push({ x: cx + band + last * w * .35, y: -sky * .62 });
    }

    const raw = guideThrough(controls);
    const foot = nearestY(raw, collar);
    // an upward flow is column the whole way: it never leaves it
    const head = branch.up ? raw.length : nearestY(raw, splitY);
    // the two shape-setting flows wander less: a kink there reads as a fault
    const pts = sway(raw, foot, head, w, rnd, branch.calm || 1);
    const split = nearestY(pts, splitY);
    const widths = [];
    for (let i = 0; i < pts.length; i++) {
      if (i < foot) widths.push(3 + 5 * (i / Math.max(1, foot)));
      else if (!branch.up && split > 0 && i > split) {
        widths.push(8 * (1 - (i - split) / Math.max(1, pts.length - split) * .8) + 2);
      } else widths.push(8);
    }
    return { pts: pts, widths: widths, foot: foot, split: split, up: !!branch.up };
  }

  /* One fibre of the sheaf: the flow's own line pushed sideways along its
     normal. Never along x — a bundle offset that way looks wide where the flow
     runs upright and collapses to nothing where it runs level, which is why the
     roots and the column read loose while the branches read tight. */
  function fibreOf(centre, norms, radii, lane, weave, stray, part, rnd) {
    // three scales, each with its own knots: a meander over the whole length, a
    // drift that changes its mind every few dozen samples, a shiver on top. One
    // scale alone reads as a wire that has been bent; three read as growth.
    const meander = drifter(rnd, 130);
    const slow = drifter(rnd, 26);
    const quick = wobbler(rnd);
    const n = centre.pts.length;
    // each fibre runs its own length, between seven tenths of the flow and all
    // of it, or the ends of a bundle close on themselves into a loop. A flow
    // that leaves by the top edge keeps every fibre: trimming it there would
    // cut the column short of the frame.
    const from = Math.round(rnd() * rnd() * n * .13);
    const to = centre.up ? n : Math.min(n, from + Math.round(n * (.7 + .3 * rnd())));
    const pts = [];
    let last = null;
    for (let i = from; i < to; i++) {
      const width = sheafWidth(i, centre, n);
      let off = lane * width + meander(i) * weave * width
                + slow(i) * 8 * width + quick(i * 2.6) * 3.2;
      if (stray) {                                 // this one leaves the flow here
        const gone = smoothen(Math.max(0, Math.min(1, (i - stray.at) / stray.span)));
        off += gone * stray.away * (1 + slow(i) * .5);
      }
      if (part) {                                  // and near the end they all part
        off += smoothen(Math.max(0, Math.min(1, (i - part.at) / part.span))) * part.away;
      }
      const room = radii[i] * .45;                 // never fold on a bend
      if (off > room) off = room;
      else if (off < -room) off = -room;
      // and never turn on the spot: a swing of more than this between two
      // samples is not a wander, it is a hairpin, and it reads as a fault
      if (last !== null) {
        if (off - last > 5.5) off = last + 5.5;
        else if (off - last < -5.5) off = last - 5.5;
      }
      last = off;
      pts.push({ x: centre.pts[i].x + norms[i].x * off,
                 y: centre.pts[i].y + norms[i].y * off });
    }
    return {
      pts: pts, widths: centre.widths.slice(from, to),
      foot: Math.max(0, centre.foot - from),
      split: Math.max(0, centre.split - from),
      from: from, span: n, up: centre.up
    };
  }

  /* The flow's own line wanders too, not only its fibres: a slow drift along
     its normal, held in close at the foot where the tree has to stand straight
     and freer the further it travels. Without it a flow is a clean spline and
     the whole drawing looks drafted. */
  function sway(pts, foot, head, w, rnd, calm) {
    // the meander has to be shorter than the limb it runs along, or it stops
    // undulating it and simply carries it off its course
    const meander = drifter(rnd, 62);
    const slow = drifter(rnd, 28);
    const norms = normalsOf(pts);
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      // held while it is inside the column, free once it is out: a flow given
      // a root's freedom all the way up opens the trunk to twice its width
      const away = i >= foot && i <= head ? 0
                                          : Math.abs(i - (i < foot ? foot : head)) / 45;
      const off = (meander(i) * .58 + slow(i) * .48)
                  * w * .014 * calm * Math.min(1.8, .3 + away);
      out.push({ x: pts[i].x + norms[i].x * off, y: pts[i].y + norms[i].y * off });
    }
    return out;
  }

  /* How tight the flow turns at each point. Pushing a fibre further sideways
     than that radius folds the bundle onto itself, and in "lighter" mode the
     fold lights up — one bright knot at every bend. */
  function radiiOf(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i > 0 ? i - 1 : 0];
      const b = pts[i];
      const c = pts[i < pts.length - 1 ? i + 1 : i];
      const ux = b.x - a.x, uy = b.y - a.y;
      const vx = c.x - b.x, vy = c.y - b.y;
      const step = (Math.hypot(ux, uy) + Math.hypot(vx, vy)) / 2 || 1;
      const turn = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
      out.push(turn > .0006 ? step / turn : 1e6);
    }
    return out;
  }

  /* tight at the collar, opening towards both tips */
  function sheafWidth(i, line, n) {
    if (i < line.foot) return 1 + 1.1 * (1 - i / Math.max(1, line.foot));
    // only a branch opens out past the split; the column keeps its width
    if (!line.up && i > line.split) {
      return 1 + .5 * ((i - line.split) / Math.max(1, n - line.split));
    }
    return 1;
  }

  function nearestY(pts, y) {
    let best = 0, gap = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].y - y);
      if (d < gap) { gap = d; best = i; }
    }
    return best;
  }

  /* A daughter branch: it rides its mother's line to the fork and carries on,
     so it is rooted through her. */
  function buildBranchlet(limb, pts, parentWidths, at, rnd) {
    const head = Math.max(0, at - 6);
    const lead = pts[at], back = pts[head];
    const side = rnd() < .5 ? -1 : 1;
    const len = (limb.spec.major ? 90 : 62) * (.7 + rnd() * .8);
    const ang = Math.atan2(lead.y - back.y, lead.x - back.x) + (.18 + rnd() * .4) * side;
    const controls = [back, lead];
    for (let k = 1; k <= 3; k++) {
      const t = k / 3;
      controls.push({
        x: lead.x + Math.cos(ang) * len * t + limb.out * len * t * t * .25,
        y: lead.y + Math.sin(ang) * len * t - len * t * t * .18
      });
    }
    const own = guideThrough(controls);
    const guide = pts.slice(0, head).concat(own);
    const norms = normalsOf(guide);
    const widths = [];
    for (let i = 0; i < guide.length; i++) {
      if (i < head) { widths.push(parentWidths[i] * .7); continue; }
      const t = (i - head) / Math.max(1, own.length);
      widths.push(parentWidths[Math.min(parentWidths.length - 1, at)] * .5 * (1 - t * .8) + 2);
    }
    for (let sIndex = 0; sIndex < 2; sIndex++) {
      const kid = subFlow(guide, norms, widths, rnd, {
        base: (sIndex - .5) * 1.4, from: head, hold: .5, part: 14
      });
      addWisps(limb.zone, kid, widths, rnd, {
        count: 3, from: head, base: build.flowLen - 1, throughRate: .1, alpha: .045,
        ink: "fiber", faint: "deep", reveal: .55 + .35 * rnd()
      });
      addVein(limb.zone, { pts: kid, widths: widths, foot: 0, split: head,
                           from: build.flowLen - 1, span: build.flowLen }, {
        halo: 3.4, haloAlpha: .018, body: 1.4, bodyAlpha: .18,
        tintFrom: .35 + .2 * rnd(), tintTo: .7 + .3 * rnd(),
        core: 0, coreAlpha: 0, reveal: .6 + .3 * rnd()
      });
      for (let i = head; i < kid.length; i += 3) limb.flowPts.push(kid[i]);
      limb.zone.tips.push({
        x: kid[kid.length - 1].x, y: kid[kid.length - 1].y, out: limb.out
      });
    }
  }

  const CANOPY_LOBES = [
    { x: -.36, y: .30, rx: .17, ry: .18 },
    { x: -.21, y: .18, rx: .13, ry: .13 },
    { x: .25, y: .16, rx: .14, ry: .14 },
    { x: .39, y: .28, rx: .17, ry: .17 },
    { x: -.46, y: .45, rx: .15, ry: .10 },
    { x: .49, y: .43, rx: .16, ry: .11 },
    { x: .09, y: .11, rx: .10, ry: .11 },
    { x: -.09, y: .34, rx: .09, ry: .10 },
    { x: -.58, y: .34, rx: .12, ry: .10 },
    { x: .60, y: .33, rx: .12, ry: .10 }
  ];
  const CANOPY_VOIDS = [
    { x: -.26, y: .40, rx: .08, ry: .07 },
    { x: .17, y: .34, rx: .09, ry: .08 },
    { x: -.05, y: .22, rx: .06, ry: .06 },
    { x: .32, y: .09, rx: .07, ry: .05 }
  ];

  function buildCanopy(branches, cx, w, h) {
    const rnd = seeded(seedOf("canopy"));
    // how far from a branch a grain may still belong to it. This, not the size
    // of the lobes, is what held the foliage tight against the limbs: widen the
    // lobes alone and the extra grains are simply thrown away.
    const cell = 104;
    const grid = {};
    for (let b = 0; b < branches.length; b++) {
      const pts = branches[b].flowPts;
      for (let i = 0; i < pts.length; i++) {
        const key = Math.floor(pts[i].x / cell) + ":" + Math.floor(pts[i].y / cell);
        if (grid[key] === undefined) grid[key] = b;
      }
    }
    for (let l = 0; l < CANOPY_LOBES.length; l++) {
      const lobe = CANOPY_LOBES[l];
      const ox = cx + lobe.x * w, oy = lobe.y * h;
      const rx = lobe.rx * w, ry = lobe.ry * h;
      const knots = [];
      for (let k = 0; k < 5 + Math.round(rnd() * 3); k++) {
        knots.push({ u: (rnd() - .5) * 1.05, v: (rnd() - .5) * 1.05, s: .16 + rnd() * .2 });
      }
      for (let g = 0; g < 2600; g++) {
        const knot = knots[Math.floor(rnd() * knots.length)];
        const u = knot.u + (rnd() + rnd() - 1) * knot.s;
        const v = knot.v + (rnd() + rnd() - 1) * knot.s;
        const far = Math.hypot(u, v);
        if (far > .55) continue;
        const x = ox + u * rx * 2, y = oy + v * ry * 2;
        if (inAny(CANOPY_VOIDS, x, y, cx, w, h)) continue;
        const owner = nearFlow(grid, cell, x, y);
        if (owner < 0) continue;
        const cool = far / .55;
        // the further out a grain sits the more likely it is a round one, and
        // the fatter it gets: that is what reads as foliage rather than haze
        const big = rnd() > .975 - cool * .045;
        branches[owner].zone.dots.push({
          x: x, y: y,
          r: big ? 2.2 + cool * 3.4 + rnd() * 2.6 : .35 + rnd() * rnd() * 2,
          // a fat grain is soft, not a filled disc, or the canopy reads as bubbles
          alpha: (big ? .06 + rnd() * .16 : .15 + rnd() * .38) * (1 - cool * .3),
          // turquoise thickens outwards but never takes the lobe over: tying the
          // ink to the distance alone turned every outer grain cold
          ink: rnd() < .16 + cool * .42 ? "dust" : rnd() > .93 ? "core" : "fiber",
          grow: branches[owner].grow,        // it hangs off its branch, so it comes with it
          reveal: big ? .8 + rnd() * .2 : .35 + rnd() * .6
        });
      }
    }
  }

  function inAny(holes, x, y, cx, w, h) {
    for (let i = 0; i < holes.length; i++) {
      const dx = (x - (cx + holes[i].x * w)) / (holes[i].rx * w);
      const dy = (y - holes[i].y * h) / (holes[i].ry * h);
      if (dx * dx + dy * dy < 1) return true;
    }
    return false;
  }

  function nearFlow(grid, cell, x, y) {
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const hit = grid[(gx + dx) + ":" + (gy + dy)];
        if (hit !== undefined) return hit;
      }
    }
    return -1;
  }

  /* the two switches in the settings take a whole family of flows out */
  function shownKind(kind) {
    return kind === "branch" ? state.settings.treeBranches : state.settings.treeTrunk;
  }

  /* how lit a zone is: a branch answers to the habits that own it, the trunk
     to the week as a whole */
  function zoneEnergy(zone, owners, glow) {
    if (zone.kind !== "branch") return glow;
    const mine = owners[zone.habit];
    // a branch no habit has claimed only ghosts along — except in the preview,
    // which owes you the whole tree
    if (!mine || !mine.length) {
      return state.settings.treeFull ? 1 : Math.max(.08, glow * .4);
    }
    let best = 0;
    for (let i = 0; i < mine.length; i++) {
      best = Math.max(best, habitVigour(state.habits[mine[i]]));
    }
    // one branch apiece means it must show more of itself
    return Math.max(.08, owners.single ? Math.min(1, best * 1.15) : best);
  }

  /* Sizes the stage, builds the skeleton if the stage changed and weighs each
     zone. Everything the painting needs, worked out once whether the tree is
     put up in one go or grown a slice at a time. */
  function readyTree() {
    if (!treeCanvas || !treeCanvas.parentNode.offsetWidth) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = treeCanvas.parentNode.offsetWidth;
    const h = stageHeight();
    const sky = skyHeight();
    const full = h + sky;
    if (treeCanvas.width !== Math.round(w * dpr) ||
        treeCanvas.height !== Math.round(full * dpr)) {
      treeCanvas.width = Math.round(w * dpr);
      treeCanvas.height = Math.round(full * dpr);
      treeCanvas.style.width = w + "px";
      treeCanvas.style.height = full + "px";
      sapCanvas.width = treeCanvas.width;
      sapCanvas.height = treeCanvas.height;
      sapCanvas.style.width = treeCanvas.style.width;
      sapCanvas.style.height = treeCanvas.style.height;
    }
    sapDpr = dpr;
    skyRise = sky;

    const key = w + "x" + h + "+" + sky;
    if (treeCache.key !== key) {
      treeCache.tree = buildTree(w, h, sky);
      treeCache.key = key;
    }
    const tree = treeCache.tree;
    treeGeom.w = w;
    treeGeom.heart = tree.heart;

    const ctx = treeCanvas.getContext("2d");
    // the whole drawing is pushed down by the empty sky above it, so the tree's
    // own coordinates never have to know the sky exists
    ctx.setTransform(dpr, 0, 0, dpr, 0, sky * dpr);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    const inks = {
      fiber: treeInk("--tree-fiber", "#ffe27a"),
      core: treeInk("--tree-core", "#fffbe8"),
      dust: treeInk("--tree-dust", "#4fd8d0"),
      sap: treeInk("--tree-sap", "#cfe86b"),
      amber: treeInk("--tree-amber", "#ffa832"),
      ember: treeInk("--tree-ember", "#f2661a"),
      blaze: treeInk("--tree-blaze", "#e8431a"),
      deep: treeInk("--tree-deep", "#2f5f8a")
    };
    inks.ramp = rampOf(inks, TREE_RAMP);
    inks.sapRamp = rampOf(inks, SAP_RAMP);
    const glow = trunkGlow();
    const owners = branchOwners();
    // held for the sap loop: it must not weigh the habits again every frame
    treeCache.inks = inks;
    treeCache.owners = owners;
    treeCache.glow = glow;
    for (let z = 0; z < tree.zones.length; z++) {
      tree.zones[z].energy = zoneEnergy(tree.zones[z], owners, glow);
    }
    return { ctx: ctx, tree: tree, inks: inks, glow: glow, owners: owners, w: w, sky: sky };
  }

  /* Paints what comes out of the ground between two moments of the growth. The
     canvas is additive and never cleared between slices, so painting the tree
     in twenty pieces costs exactly what painting it whole costs. */
  function paintTree(seen, lo, hi) {
    const ctx = seen.ctx, tree = seen.tree, inks = seen.inks;
    for (let pass = 0; pass < 3; pass++) {
      for (let z = 0; z < tree.zones.length; z++) {
        const zone = tree.zones[z];
        if (!shownKind(zone.kind)) continue;
        const energy = zone.energy;
        const lift = .12 + .88 * energy;
        for (let i = 0; i < zone.veins.length; i++) {
          const vein = zone.veins[i];
          if (vein.reveal > energy || vein.grow <= lo || vein.grow > hi) continue;
          drawVein(ctx, vein, inks, lift, pass);
        }
        if (!state.settings.treeWisps) continue;
        ctx.lineCap = "round";
        for (let i = 0; i < zone.fibres.length; i++) {
          const wisp = zone.fibres[i];
          if (wisp.pass !== pass || wisp.reveal > energy) continue;
          if (wisp.grow <= lo || wisp.grow > hi) continue;
          ctx.strokeStyle = inks[wisp.ink];
          ctx.globalAlpha = wisp.alpha * lift;
          ctx.lineWidth = wisp.width;
          ctx.stroke(wisp.path);
        }
      }
      // the heart is laid on in slices like everything else, or it lands whole
      // on the last frame and the tree lights up with a thump
      if (pass === 1) {
        const share = spanShare(lo, hi, HEART_FROM, HEART_TO);
        if (share > 0) drawHeart(ctx, tree, seen.glow, inks.core, share);
      }
    }

    for (let z = 0; z < tree.zones.length; z++) {
      const zone = tree.zones[z];
      if (!shownKind(zone.kind)) continue;
      const energy = zone.energy;
      for (let i = 0; i < zone.dots.length; i++) {
        const dot = zone.dots[i];
        if (dot.reveal > energy || dot.grow <= lo || dot.grow > hi) continue;
        ctx.globalAlpha = dot.alpha * (.25 + .75 * energy);
        ctx.fillStyle = inks[dot.ink];
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fill();
      }
      drawBlooms(ctx, zone, inks, energy, lo, hi);
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 1;
  }

  function drawTree() {
    const seen = readyTree();
    if (!seen) return;
    stopGrowth();
    growNow = 1;
    seen.ctx.clearRect(0, -seen.sky, seen.w, seen.tree.h + seen.sky);
    paintTree(seen, -1, 1);
    placeTreeNodes(seen.tree, seen.owners, seen.sky);
    startSap();
  }

  /* THE GROWTH — played once on stepping into the room. The tree is not faded
     in: it is painted in the order it would have grown, out of the ground and
     along each flow, the column first and the branches from the lowest up. */
  const GROW_MS = 4600;
  let growFrame = 0;

  function growTree() {
    const seen = readyTree();
    if (!seen) return;
    stopGrowth();
    treeNodes.innerHTML = "";
    seen.ctx.clearRect(0, -seen.sky, seen.w, seen.tree.h + seen.sky);
    growNow = 0;
    startSap();                           // the air comes up with the tree, not after
    placeTreeNodes(seen.tree, seen.owners, seen.sky, true);
    const begin = performance.now();
    let done = -1;
    const step = function (now) {
      const t = Math.min(1, (now - begin) / GROW_MS);
      growNow = smoothen(t);
      paintTree(seen, done, growNow);
      done = growNow;
      if (t < 1) {
        growFrame = requestAnimationFrame(step);
      } else {
        growFrame = 0;                    // the heart came with the last slice
        growNow = 1;
      }
    };
    growFrame = requestAnimationFrame(step);
  }

  function stopGrowth() {
    if (!growFrame) return;
    cancelAnimationFrame(growFrame);
    growFrame = 0;
    growNow = 1;
  }

  /* The animated canvas is cleared whole every frame, so it can still be wiped
     rather than having the fade baked into each mote. */
  function veilSky(ctx, w, sky) {
    if (sky <= 0) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 1;
    const veil = ctx.createLinearGradient(0, -sky * .06, 0, -sky * .48);
    veil.addColorStop(0, "rgba(0,0,0,0)");
    veil.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = veil;
    ctx.fillRect(0, -sky, w, sky);
  }

  /* THE SAP — the tree is not a still image. Three things move on a canvas of
     its own, laid over the skeleton: a wave that climbs a flow from its tip in
     the ground and goes out by its branch, the twinkling of the dust, and the
     column's own breath. Redrawing the skeleton at sixty frames a second is out
     of the question — several thousand strokes — while all of this costs a few
     dozen fills. */

  /* nothing animated shows before the growth has reached where it sits, and it
     comes up over a short band rather than switching on */
  function grownBy(grow) {
    if (growNow >= 1) return 1;
    return Math.max(0, Math.min(1, (growNow - grow) / .1));
  }

  function drawSap(now) {
    const tree = treeCache.tree;
    const ctx = sapCanvas.getContext("2d");
    ctx.setTransform(sapDpr, 0, 0, sapDpr, 0, skyRise * sapDpr);
    ctx.clearRect(0, -skyRise, tree.w, tree.h + skyRise);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    const inks = treeCache.inks;
    const clock = now / 1000;

    drawBreath(ctx, tree, inks, clock);
    for (let z = 0; z < tree.zones.length; z++) {
      const zone = tree.zones[z];
      if (!shownKind(zone.kind) || !zone.conduit) continue;
      drawMotes(ctx, zone, inks, clock);
      if (zone.grow > growNow) continue;               // the flow is still coming out
      drawTwinkles(ctx, zone, inks, clock);
      drawStrands(ctx, zone, inks, clock);
      const sap = zone.sap;
      const step = ((clock + sap.phase * sap.cycle) % sap.cycle) / sap.climb;
      if (step > 1) continue;                          // resting between climbs
      const pts = zone.conduit;
      const head = step * (pts.length - 1);
      // it fades in as it leaves the ground and out as it reaches the end, so
      // nothing is ever seen to start or stop
      const born = Math.min(1, head / 26);
      const gone = Math.min(1, (pts.length - 1 - head) / 34);
      const lit = born * gone * (.25 + .75 * zone.energy);
      if (lit < .02) continue;

      // the wave is not drawn on the flow: it is the cloud lighting up as it
      // goes through, a grain at a time. A stroked streak read as a line laid
      // over the branch; the dust it passes reads as the branch itself waking.
      for (let d = 0; d < zone.dots.length; d++) {
        const dot = zone.dots[d];
        if (dot.reveal > zone.energy) continue;
        const behind = head - dot.at;
        if (behind < -6 || behind > sap.tail) continue;
        const fade = behind < 0 ? 1 + behind / 6 : 1 - behind / sap.tail;
        const glow = Math.pow(fade, 1.3) * lit;
        ctx.fillStyle = inks.sapRamp[Math.round(RAMP_STEPS * fade)];
        ctx.globalAlpha = .9 * glow;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r + 1.6 * glow, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    veilSky(ctx, tree.w, skyRise);
  }

  /* The trunk breathes: one wide, slow swell of light held in the column at all
     times. It is the only thing here that never stops — the waves cross and are
     gone, this is the tree being alive while nothing happens. */
  function drawBreath(ctx, tree, inks, clock) {
    const out = grownBy(BREATH_GROW);
    if (!out) return;
    const swell = (.5 + .5 * Math.sin(clock * .38)) * out;
    const foot = tree.collar + tree.h * .05;
    const top = -(skyRise ? skyRise * .4 : tree.h * .12);
    // a dozen strokes widening quadratically make the falloff; three made a
    // capsule with hard edges. The gradient puts out both ends, or the round
    // caps show as the two ends of a pill.
    const rgb = rgbOf(inks.fiber).join(",");   // a token, not a ramp step: those are rgb()
    const reach = tree.w * .1;
    const steps = Math.ceil((foot - top) / (reach * .5));
    ctx.globalAlpha = 1;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const y = foot + (top - foot) * t;
      const hold = Math.min(1, t / .3) * Math.min(1, (1 - t) / .22);   // out at both ends
      const a = (.016 + .07 * swell) * hold;
      if (a < .002) continue;
      const glow = ctx.createRadialGradient(tree.cx, y, 0, tree.cx, y, reach);
      glow.addColorStop(0, "rgba(" + rgb + "," + a + ")");
      glow.addColorStop(.45, "rgba(" + rgb + "," + a * .35 + ")");
      glow.addColorStop(1, "rgba(" + rgb + ",0)");
      ctx.fillStyle = glow;
      ctx.fillRect(tree.cx - reach, y - reach, reach * 2, reach * 2);
    }
  }

  /* The atmosphere: each mote walks out from the branch it was born on, sways
     as it goes and fades in and out over its own life, so the field never shows
     a particle appearing or a loop restarting. */
  function drawMotes(ctx, zone, inks, clock) {
    for (let m = 0; m < zone.motes.length; m++) {
      const mote = zone.motes[m];
      if (mote.reveal > zone.energy) continue;
      const born = grownBy(mote.grow);
      if (!born) continue;
      const age = ((clock / mote.life) + mote.phase) % 1;
      const gone = mote.reach * age;
      const swing = Math.sin(clock * mote.beat + mote.turn) * mote.sway;
      ctx.fillStyle = inks[mote.ink];
      ctx.globalAlpha = Math.sin(age * Math.PI) * .34 * born * (.25 + .75 * zone.energy);
      ctx.beginPath();
      ctx.arc(mote.x + mote.dx * gone - mote.dy * swing,
              mote.y + mote.dy * gone + mote.dx * swing,
              mote.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* A thread pulled out of its rest position and let go: a warm arc that swells
     off the flow over a few seconds and settles back. It is drawn on top of the
     resting line rather than in its place — that is what the eye reads as a
     filament lifting, and it costs nothing on the static canvas. */
  function drawStrands(ctx, zone, inks, clock) {
    const pts = zone.conduit;
    const norms = zone.norms;
    for (let t = 0; t < zone.strands.length; t++) {
      const strand = zone.strands[t];
      if (!grownBy(strand.grow)) continue;
      const step = (clock + strand.phase * strand.cycle) % strand.cycle;
      if (step > strand.rise) continue;
      const open = Math.sin((step / strand.rise) * Math.PI);
      const lit = open * (.3 + .7 * zone.energy);
      const reach = Math.round(strand.span * 1.8);
      const from = Math.max(0, strand.at - reach);
      const to = Math.min(pts.length - 1, strand.at + reach);
      if (to - from < 6) continue;
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        const away = Math.abs(i - strand.at) / strand.span;
        const bump = away < 1 ? .5 + .5 * Math.cos(away * Math.PI) : 0;
        const off = strand.lane + strand.lift * bump * open;
        const x = pts[i].x + norms[i].x * off;
        const y = pts[i].y + norms[i].y * off;
        if (i === from) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = inks.ramp[Math.round(RAMP_STEPS * .34)];
      ctx.globalAlpha = .07 * lit;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = inks.ramp[Math.round(RAMP_STEPS * .12)];
      ctx.globalAlpha = .42 * lit;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /* The twinkles: a grain of the cloud catching the light for half a second,
     drawn as a point with two crossed rays, the way a star reads. */
  function drawTwinkles(ctx, zone, inks, clock) {
    for (let t = 0; t < zone.twinkles.length; t++) {
      const star = zone.twinkles[t];
      if (star.reveal > zone.energy || !grownBy(star.grow)) continue;
      const step = (clock + star.phase * star.cycle) % star.cycle;
      if (step > star.hold) continue;
      const open = Math.sin((step / star.hold) * Math.PI);
      const lit = open * open * (.3 + .7 * zone.energy);
      const arm = star.arm * open;
      ctx.strokeStyle = inks.core;
      ctx.globalAlpha = .5 * lit;
      ctx.lineWidth = .7;
      ctx.beginPath();
      ctx.moveTo(star.x - arm, star.y);
      ctx.lineTo(star.x + arm, star.y);
      ctx.moveTo(star.x, star.y - arm);
      ctx.lineTo(star.x, star.y + arm);
      ctx.stroke();
      ctx.fillStyle = inks.core;
      ctx.globalAlpha = .9 * lit;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let sapFrame = 0;
  function sapTick(now) {
    sapFrame = 0;
    if (!treeCache.tree || !treeCache.inks) return;
    drawSap(now);
    sapFrame = requestAnimationFrame(sapTick);
  }
  function startSap() {
    if (sapFrame || !state.settings.treeSap) return;
    sapFrame = requestAnimationFrame(sapTick);
  }
  function stopSap() {
    if (!sapFrame) return;
    cancelAnimationFrame(sapFrame);
    sapFrame = 0;
    const ctx = sapCanvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, sapCanvas.width, sapCanvas.height);
  }

  /* The blooms a zone has earned, in the forms the settings ask for. They fade
     in over a short band above their threshold rather than appearing whole, or
     a single good day would pop a flower onto the branch. */
  function drawBlooms(ctx, zone, inks, energy, lo, hi) {
    const kinds = state.settings.treeBlooms;
    if (!kinds.length) return;
    for (let i = 0; i < zone.blooms.length; i++) {
      const bloom = zone.blooms[i];
      if (bloom.reveal > energy || kinds.indexOf(bloom.kind) === -1) continue;
      if (bloom.grow <= lo || bloom.grow > hi) continue;
      const open = Math.min(1, (energy - bloom.reveal) / .18);
      ctx.fillStyle = inks.ramp[Math.round(RAMP_STEPS * .45)];
      ctx.globalAlpha = .055 * open;
      ctx.beginPath();
      ctx.arc(bloom.x, bloom.y, bloom.glow * open, 0, Math.PI * 2);
      ctx.fill();

      if (bloom.kind === "burst") {
        for (let g = 0; g < bloom.grains.length; g++) {
          const grain = bloom.grains[g];
          ctx.fillStyle = inks[grain.ink];
          ctx.globalAlpha = (.2 + .5 * open) * open;
          ctx.beginPath();
          ctx.arc(bloom.x + grain.dx * open, bloom.y + grain.dy * open,
                  grain.r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.lineCap = "round";
        ctx.strokeStyle = inks.ramp[Math.round(RAMP_STEPS * .3)];
        ctx.globalAlpha = .09 * open;
        ctx.lineWidth = bloom.kind === "corolla" ? 3.4 : 2.2;
        ctx.stroke(bloom.path);
        ctx.strokeStyle = inks.ramp[Math.round(RAMP_STEPS * .12)];
        ctx.globalAlpha = (bloom.kind === "corolla" ? .38 : .26) * open;
        ctx.lineWidth = bloom.kind === "corolla" ? 1.4 : .8;
        ctx.stroke(bloom.path);
      }

      ctx.fillStyle = inks.core;
      ctx.globalAlpha = .55 * open;
      ctx.beginPath();
      ctx.arc(bloom.x, bloom.y, bloom.core, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* No disc at the heart: a handful of wide, almost transparent strokes along
     the column. The hot core has to come from the lines piling up. */
  function drawHeart(ctx, tree, glow, coreInk, share) {
    const span = tree.h * .17;
    ctx.strokeStyle = coreInk;
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = share * (.014 + glow * .03) / (i + 1);
      ctx.lineWidth = 12 + i * 16;
      ctx.beginPath();
      ctx.moveTo(tree.cx - 2, tree.heart + span * .8);
      ctx.quadraticCurveTo(tree.cx + 3, tree.heart, tree.cx - 1, tree.heart - span);
      ctx.stroke();
    }
  }

  /* The habit circles, laid over the canvas on an end of one of the branches
     that habit owns, so a circle sits on the part of the tree it lights. They
     are real buttons: clicking one ticks the day, and a wave of light runs
     back down to the heart. */
  function placeTreeNodes(tree, owners, sky, growing) {
    treeNodes.innerHTML = "";
    const today = todayKey();
    const taken = [];
    for (let i = 0; i < state.habits.length; i++) {
      const habit = state.habits[i];
      const spot = habitSpot(tree, owners, i, taken);
      if (!spot) continue;
      taken.push(spot);
      const done = !!(habit.completedDates && habit.completedDates.indexOf(today) !== -1);

      const node = document.createElement("button");
      node.type = "button";
      node.className = done ? "tnode is-done" : "tnode";
      node.style.left = spot.x + "px";
      node.style.top = (spot.y + sky) + "px";      // the nodes ride the same drop
      // each circle waits for the branch it hangs on to have come out
      if (growing) node.style.animationDelay = Math.round(spot.grow * GROW_MS) + "ms";
      node.style.setProperty("--vigour", habitVigour(habit).toFixed(2));
      node.setAttribute("aria-label", habit.name || translate("habitToggleAria"));
      node.setAttribute("aria-pressed", done ? "true" : "false");
      if (HABIT_ICONS[habit.icon]) node.innerHTML = habitSvg(habit.icon);

      const tag = document.createElement("span");
      tag.className = "tnode__name";
      tag.textContent = habit.name || "";
      node.appendChild(tag);

      const edit = document.createElement("span");
      edit.className = "tnode__edit";
      edit.textContent = "\u00b7\u00b7\u00b7";
      edit.addEventListener("click", function (event) {
        event.stopPropagation();
        openTreeDetail(habit.id);
      });
      node.appendChild(edit);

      node.addEventListener("click", function () {
        if (habit.type === "sleep") { openSleepView(habit.id); return; }
        if (habit.type === "exercise") { openExerciseView(habit.id); return; }
        toggleHabit(habit.id, node);
        node.classList.remove("done");
        drawTree();                         // the tree answers straight away
        surge(spot, sky);
      });
      treeNodes.appendChild(node);
    }
  }

  /* an end of one of the habit's own branches, inside the stage and clear of
     the circles already placed */
  function habitSpot(tree, owners, index, taken) {
    const pool = [];
    for (let z = 0; z < tree.zones.length; z++) {
      const zone = tree.zones[z];
      if (zone.kind !== "branch") continue;
      if ((owners[zone.habit] || []).indexOf(index) === -1) continue;
      for (let t = 0; t < zone.tips.length; t++) {
        const tip = zone.tips[t];
        if (tip.x < 80 || tip.x > tree.w - 80) continue;
        if (tip.y < 46 || tip.y > tree.collar - 30) continue;
        tip.grow = zone.grow;                    // so the circle can wait its branch out
        pool.push(tip);
      }
    }
    let best = null, bestGap = -1;
    for (let i = 0; i < pool.length; i++) {
      let gap = Math.abs(pool[i].x - tree.cx);        // prefer well clear of the trunk
      for (let k = 0; k < taken.length; k++) {
        gap = Math.min(gap, Math.hypot(pool[i].x - taken[k].x, pool[i].y - taken[k].y) * 1.6);
      }
      if (gap > bestGap) { bestGap = gap; best = pool[i]; }
    }
    return best;
  }

  /* the light that runs back down the branch when a habit is ticked */
  function surge(spot, sky) {
    const spark = document.createElement("span");
    spark.className = "tsurge";
    spark.style.left = spot.x + "px";
    spark.style.top = (spot.y + sky) + "px";
    spark.style.setProperty("--to-x", (treeCanvas.offsetWidth / 2 - spot.x) + "px");
    spark.style.setProperty("--to-y", (treeGeom.heart - spot.y) + "px");
    treeNodes.appendChild(spark);
    setTimeout(function () { spark.remove(); }, 760);
  }

  function openTreeDetail(id) {
    const habit = habitById(id);
    if (!habit) return;
    const foot = document.getElementById("treeDetail");
    if (foot) foot.remove();
    const box = document.createElement("div");
    box.id = "treeDetail";
    box.className = "hfold__inner";
    box.appendChild(createHabitPanel(habit));
    document.getElementById("tree").after(box);
  }

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

  /* THE HABIT CELLS — the yes-or-no habits as tiles in the planning column, the
     water rising over the icon once ticked. They always tick today, whatever day
     the grid is showing: a habit is lived now, it is not planned. Sleep and
     exercise are left out — they are a value to enter, not a box to tick. */
  function renderHabitCells() {
    const box = document.getElementById("habitCells");
    box.innerHTML = "";
    const today = todayKey();
    for (let i = 0; i < state.habits.length; i++) {
      const habit = state.habits[i];
      if (habit.type === "sleep" || habit.type === "exercise") continue;
      box.appendChild(habitCell(habit, today));
    }
    box.appendChild(addHabitCell());
  }

  function habitCell(habit, today) {
    const done = !!(habit.completedDates && habit.completedDates.indexOf(today) !== -1);
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = done ? "habit done" : "habit";
    tile.setAttribute("aria-pressed", done ? "true" : "false");
    tile.setAttribute("aria-label", habit.name || translate("habitToggleAria"));

    const water = document.createElement("span");
    water.className = "habit__water";
    const icon = document.createElement("span");
    icon.className = "habit__icon";
    if (HABIT_ICONS[habit.icon]) icon.innerHTML = habitSvg(habit.icon);
    tile.append(water, icon);

    tile.addEventListener("click", function () {
      toggleHabit(habit.id, tile);   // flips the "done" class the water reads
      tile.setAttribute("aria-pressed", tile.classList.contains("done") ? "true" : "false");
      renderWelcomeHabits();         // the rings on the threshold show the same day
    });
    return tile;
  }

  /* the last slot is always an empty one, so a habit can be started from here */
  function addHabitCell() {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "habit habit--empty";
    tile.setAttribute("aria-label", translate("addHabitAria"));
    tile.innerHTML = '<span class="habit__plus">+</span>';
    tile.addEventListener("click", openIconPicker);
    return tile;
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
      renderHabitCells();               // the tiles inside show the same day
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
    } else {
      renderList(detailTarget.kind);
      if (detailTarget.kind === "tasks") renderDailyTimeline();
    }
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
    timeSection.hidden = kind !== "events";
    detailBody.classList.toggle("has-dial", kind === "events");
    if (kind === "events") setDialTo(item);
    detailBody.scrollTop = 0;
  }

  /* THE DIAL — the hour is set by turning a ring, not by typing into a field. It
     runs on 24 marks like everything else here, so noon is at the bottom and the
     day reads round once rather than twice. The readout above is the control: the
     half you press is the half the ring is turning. */
  const timeSection = document.getElementById("timeSection");
  const dialFace = document.getElementById("dialFace");
  const dialArm = document.getElementById("dialArm");
  const dialHourBtn = document.getElementById("dialHour");
  const dialMinBtn = document.getElementById("dialMin");
  const DIAL_R = 66;
  let dialMode = "hour";
  let dialEvent = null;

  function dialSteps() { return dialMode === "hour" ? 24 : 12; }

  /* a step's point on the ring: 0 at the top, running clockwise */
  function dialPoint(index, radius) {
    const angle = (index / dialSteps()) * Math.PI * 2 - Math.PI / 2;
    return { x: 100 + Math.cos(angle) * radius, y: 100 + Math.sin(angle) * radius };
  }

  function dialParts() {
    const bits = (dialEvent && dialEvent.time ? dialEvent.time : "09:00").split(":");
    return { h: parseInt(bits[0], 10) || 0, m: parseInt(bits[1], 10) || 0 };
  }

  function setDialTo(event) {
    dialEvent = event;
    dialMode = "hour";
    document.getElementById("dialDate").textContent = longDayLabel(event.date);
    renderDial();
  }

  /* "Vendredi 31 juillet" — the day spelled out, no year: an event on show is
     always inside the period the grid is holding */
  function longDayLabel(key) {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const text = new Date(key + "T00:00").toLocaleDateString(locale,
      { weekday: "long", day: "numeric", month: "long" });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function renderDial() {
    if (!dialEvent) return;
    const at = dialParts();
    dialHourBtn.textContent = pad2(at.h);
    dialMinBtn.textContent = pad2(at.m);
    dialHourBtn.classList.toggle("is-on", dialMode === "hour");
    dialMinBtn.classList.toggle("is-on", dialMode === "min");

    const marks = document.getElementById("dialTicks");
    marks.innerHTML = "";
    const steps = dialSteps();
    const live = dialMode === "hour" ? at.h : Math.round(at.m / 5) % 12;
    for (let i = 0; i < steps; i++) {
      // every third hour is named, the rest are only felt; on minutes all twelve
      // are named, there is room for them
      const named = dialMode === "min" || i % 3 === 0;
      const spot = dialPoint(i, DIAL_R);
      if (named) {
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("class", i === live ? "dial__num is-on" : "dial__num");
        label.setAttribute("x", spot.x.toFixed(1));
        label.setAttribute("y", spot.y.toFixed(1));
        label.textContent = pad2(dialMode === "hour" ? i : i * 5);
        marks.appendChild(label);
      } else {
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("class", "dial__dot");
        dot.setAttribute("cx", spot.x.toFixed(1));
        dot.setAttribute("cy", spot.y.toFixed(1));
        dot.setAttribute("r", "1.6");
        marks.appendChild(dot);
      }
    }

    const turn = live / steps * 360;
    dialArm.setAttribute("transform", "rotate(" + turn.toFixed(1) + " 100 100)");
  }

  /* where on the ring a pointer landed, as a step index */
  function dialIndexAt(clientX, clientY) {
    const box = dialFace.getBoundingClientRect();
    const x = (clientX - box.left) / box.width * 200 - 100;
    const y = (clientY - box.top) / box.height * 200 - 100;
    let deg = Math.atan2(x, -y) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    const steps = dialSteps();
    return Math.round(deg / (360 / steps)) % steps;
  }

  function writeDial(index) {
    if (!dialEvent) return;
    const at = dialParts();
    const time = dialMode === "hour"
      ? pad2(index) + ":" + pad2(at.m)
      : pad2(at.h) + ":" + pad2(index * 5);
    if (time === dialEvent.time) return;
    dialEvent.time = time;
    saveState();
    renderDial();
    renderEventCal();        // the day's dots and the grid's load
    renderDailyTimeline();   // the rule and the thread follow the minute live
  }

  let dialTurning = false;
  dialFace.addEventListener("pointerdown", function (event) {
    dialTurning = true;
    dialFace.setPointerCapture(event.pointerId);
    writeDial(dialIndexAt(event.clientX, event.clientY));
  });
  dialFace.addEventListener("pointermove", function (event) {
    if (dialTurning) writeDial(dialIndexAt(event.clientX, event.clientY));
  });
  dialFace.addEventListener("pointerup", function (event) {
    dialTurning = false;
    dialFace.releasePointerCapture(event.pointerId);
    // setting an hour then jumping to the minutes is the usual run of it
    if (dialMode === "hour") { dialMode = "min"; renderDial(); }
  });
  dialFace.addEventListener("pointercancel", function () { dialTurning = false; });

  dialHourBtn.addEventListener("click", function () { dialMode = "hour"; renderDial(); });
  dialMinBtn.addEventListener("click", function () { dialMode = "min"; renderDial(); });

  /* INLINE EDITING — one editor card, moved into whichever row is open rather
     than a window opening over the page. Clicking a task unfolds the task
     itself, the way the calendar unfolds its month. */
  const UNFOLD_MS = 420;
  const detailCard = detail.querySelector(".detail__card");
  const detailBody = detail.querySelector(".detail__body");
  const detailHead = document.getElementById("detailHead");
  let openHost = null;   // the .unfold__inner currently holding the editor

  function hostRow(host) { return host.closest(".item"); }

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
      row.querySelector(".item__slot").appendChild(detailHead);
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
    // a square and the fold it opens are one object, even though they are apart
    if (event.target.closest(".item.is-open, .dtl__event:not(.dtl__add), .day-fold")) return;
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

  /* INLINE OBJECTIVE — the main app gets a compact working view of an objective.
     Rêve keeps the complete workspace; this fold only carries the trajectory and
     the concrete steps so they remain beside today's tasks. */
  const INLINE_PROJECT_MS = 420;
  let openInlineProject = null;
  let openInlineMilestone = null;
  let inlineMilestoneAdd = null;
  let milestoneDrag = null;
  let milestoneDragUntil = 0;
  let milestoneDragScrollFrame = 0;

  /* On desktop an opened objective becomes the working surface, not merely a
     taller card in the planning column. The track grows from two column-units
     to three: tasks keep one, while planning (and therefore the objective)
     receives the other two. The mobile rail deliberately keeps its proportions. */
  function setInlineProjectLayout(open) {
    const track = document.getElementById("pagesTrack");
    if (track) track.classList.toggle("is-goal-open", !!open);
  }

  function closeInlineProjectRow(row) {
    if (!row) return;
    const fold = row.querySelector(".unfold");
    const tabName = row.querySelector(".project-tab > .goal-inline__name");
    const rowName = row.querySelector(".project-tab > .item__text");
    if (tabName) tabName.remove();
    if (rowName) rowName.hidden = false;
    row.classList.remove("is-inline-open");
    row.setAttribute("aria-expanded", "false");
    fold.style.height = fold.getBoundingClientRect().height + "px";
    fold.offsetWidth;
    fold.style.height = "0px";
    setTimeout(function () {
      if (!row.classList.contains("is-inline-open")) fold.firstChild.innerHTML = "";
    }, INLINE_PROJECT_MS);
  }

  function toggleInlineProjectRow(row, project, fold) {
    fieldWake();
    if (openHost) closeDetail();
    if (openInlineProject === project.id) {
      openInlineProject = null;
      openInlineMilestone = null;
      inlineMilestoneAdd = null;
      setInlineProjectLayout(false);
      closeInlineProjectRow(row);
      return;
    }

    const previous = document.querySelector("#projectsList .item--project.is-inline-open");
    if (previous && previous !== row) closeInlineProjectRow(previous);

    openInlineProject = project.id;
    openInlineMilestone = null;
    inlineMilestoneAdd = null;
    setInlineProjectLayout(true);
    renderInlineProject(fold.firstChild, project);
    row.classList.add("is-inline-open");
    row.setAttribute("aria-expanded", "true");
    fold.style.height = "0px";
    fold.offsetWidth;
    fold.style.height = fold.firstChild.scrollHeight + "px";
    setTimeout(function () {
      if (openInlineProject === project.id && fold.isConnected) fold.style.height = "auto";
    }, INLINE_PROJECT_MS);
  }

  function renderInlineProject(host, project) {
    host.innerHTML = "";
    const view = document.createElement("div");
    view.className = "goal-inline";

    const row = host.closest(".item--project");
    const tab = row.querySelector(".project-tab");
    const rowName = tab.querySelector(".item__text");
    const oldName = tab.querySelector(".goal-inline__name");
    if (oldName) oldName.remove();
    const name = document.createElement("input");
    name.type = "text";
    name.className = "goal-inline__name";
    name.maxLength = 120;
    name.value = project.text || "";
    name.addEventListener("input", function () {
      project.text = name.value;
      saveState();
      if (rowName) rowName.textContent = project.text;
    });
    name.addEventListener("change", function () {
      if (!skyView.hidden) renderSky();
    });
    if (rowName) rowName.hidden = true;
    tab.insertBefore(name, rowName || tab.querySelector(".item__slot"));

    const roadmapSection = document.createElement("section");
    roadmapSection.className = "goal-inline__section";
    const roadmapLabel = document.createElement("span");
    roadmapLabel.className = "detail__label";
    roadmapLabel.textContent = translate("milestonesLabel");
    const roadmap = document.createElement("div");
    roadmap.className = "goal-roadmap";
    renderInlineTimeline(roadmap, project);
    roadmapSection.append(roadmapLabel, roadmap);
    view.appendChild(roadmapSection);

    host.appendChild(view);
  }

  function ensureProjectMilestones(project) {
    if (project.milestones && project.milestones.length) return;
    project.milestones = [
      { id: Date.now().toString(), completedDate: null },
      { id: (Date.now() + 1).toString(), completedDate: null }
    ];
    saveState();
  }

  function renderInlineTimeline(host, project) {
    ensureProjectMilestones(project);
    host.innerHTML = "";
    const milestones = project.milestones;
    const lastIndex = milestones.length - 1;
    const canAdd = !milestones[lastIndex].completedDate;
    const entries = [];
    for (let i = 0; i < milestones.length; i++) {
      if (i === lastIndex && canAdd) entries.push({ kind: "add" });
      entries.push({ kind: "milestone", milestone: milestones[i], index: i });
    }

    const canvas = document.createElement("div");
    canvas.className = "goal-roadmap__canvas";
    canvas.style.setProperty("--goal-nodes", entries.length);
    canvas.style.setProperty("--goal-edge", (50 / entries.length).toFixed(3) + "%");
    canvas.style.minWidth = (entries.length * 112) + "px";
    const track = document.createElement("span");
    track.className = "goal-roadmap__track";
    const fill = document.createElement("span");
    fill.className = "goal-roadmap__fill";
    fill.style.width = (milestoneProgress(project) * 100).toFixed(1) + "%";
    track.appendChild(fill);
    const nodes = document.createElement("div");
    nodes.className = "goal-roadmap__nodes";

    const stops = paletteStops();
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].kind === "add") nodes.appendChild(createInlineMilestoneAdd(project));
      else {
        const position = lastIndex ? entries[i].index / lastIndex : 0;
        nodes.appendChild(createInlineMilestoneNode(project, entries[i].milestone,
          entries[i].index, lastIndex, paletteColorAt(stops, position)));
      }
    }
    canvas.append(track, nodes);
    host.appendChild(canvas);
  }

  /* Repaint only the roadmap that changed. Rebuilding #projectsList replaces
     the browser's scroll anchor and is the source of the visible page jumps.
     This keeps both axes fixed and uses preventScroll for the add field. */
  function refreshInlineRoadmap(project, options) {
    const roadmap = document.querySelector('#projectsList .item[data-id="' + project.id
      + '"] .goal-roadmap');
    if (!roadmap) return false;
    const pageX = window.scrollX;
    const pageY = window.scrollY;
    const roadLeft = roadmap.scrollLeft;
    const rightGap = Math.max(0, roadmap.scrollWidth - roadmap.clientWidth - roadLeft);
    const followedEnd = rightGap < 36;

    renderInlineTimeline(roadmap, project);
    const targetLeft = followedEnd
      ? Math.max(0, roadmap.scrollWidth - roadmap.clientWidth - rightGap)
      : roadLeft;
    const restore = function () {
      if (!roadmap.isConnected) return;
      roadmap.scrollLeft = targetLeft;
      if (window.scrollX !== pageX || window.scrollY !== pageY) window.scrollTo(pageX, pageY);
    };
    restore();

    const row = roadmap.closest(".item--project");
    const badge = row && row.querySelector(".project-tab .item__sub");
    if (badge) badge.textContent = Math.round(milestoneProgress(project) * 100) + "%";

    if (options && options.focusAdd) {
      const input = roadmap.querySelector(".goal-ms--add.is-open input");
      if (input) {
        try { input.focus({ preventScroll: true }); }
        catch (err) { input.focus(); restore(); }
      }
    }
    requestAnimationFrame(restore);   // also defeat delayed scroll anchoring/focus
    return true;
  }

  function createInlineMilestoneNode(project, milestone, index, lastIndex, color) {
    const start = index === 0;
    const finish = index === lastIndex;
    const anchor = start || finish;
    const node = document.createElement("div");
    node.className = "goal-ms";
    node.style.setProperty("--goal-color", color);
    if (anchor) node.classList.add("is-anchor");
    if (start) node.classList.add("is-start");
    if (finish) node.classList.add("is-finish");
    if (milestone.completedDate) node.classList.add("is-done");

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "goal-ms__dot";
    if (start) {
      dot.disabled = true;
      dot.setAttribute("aria-label", translate("milestonesLabel"));
    } else if (finish) {
      dot.setAttribute("aria-label", translate("completeLabel"));
      dot.setAttribute("aria-pressed", milestone.completedDate ? "true" : "false");
      dot.addEventListener("click", function () {
        toggleMilestone(project, milestone.id, node);
      });
    } else {
      dot.classList.add("goal-ms__dot--milestone");
      dot.setAttribute("aria-label", milestone.text || translate("milestonePlaceholder"));
      dot.setAttribute("aria-pressed", milestone.completedDate ? "true" : "false");
      dot.addEventListener("click", function (event) {
        if (Date.now() < milestoneDragUntil) {
          event.preventDefault();
          return;
        }
        openInlineMilestone = null;
        toggleMilestone(project, milestone.id, node);
      });
      armInlineMilestoneDrag(dot, node, project, milestone);
    }
    node.appendChild(dot);

    if (!anchor) {
      const panel = document.createElement("div");
      panel.className = "goal-ms__panel";
      panel.appendChild(createInlineMilestoneEditor(project, milestone));
      node.appendChild(panel);
    }
    return node;
  }

  /* A milestone can become concrete by being carried onto the task flow or the
     clock. A mouse drag starts on movement; touch waits for the same long press
     as task rows so an ordinary tap remains a completion toggle. */
  function armInlineMilestoneDrag(dot, node, project, milestone) {
    dot.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const from = { x: event.clientX, y: event.clientY };
      let started = false;
      let timer = null;

      const stopWaiting = function () {
        clearTimeout(timer);
        document.removeEventListener("pointermove", consider);
        document.removeEventListener("pointerup", stopWaiting);
        document.removeEventListener("pointercancel", stopWaiting);
      };
      const begin = function (pointerEvent) {
        if (started) return;
        started = true;
        stopWaiting();
        startMilestoneDrag(pointerEvent, dot, node, project, milestone);
      };
      const consider = function (move) {
        const distance = Math.abs(move.clientX - from.x) + Math.abs(move.clientY - from.y);
        if (event.pointerType === "mouse" && distance > 5) begin(move);
        else if (event.pointerType !== "mouse" && distance > 8) stopWaiting();
      };

      if (event.pointerType !== "mouse") {
        timer = setTimeout(function () { begin(event); }, LONG_PRESS_MS);
      }
      document.addEventListener("pointermove", consider);
      document.addEventListener("pointerup", stopWaiting);
      document.addEventListener("pointercancel", stopWaiting);
    });
  }

  function startMilestoneDrag(event, dot, node, project, milestone) {
    if (milestoneDrag) return;
    const ghost = document.createElement("div");
    ghost.className = "milestone-drag-ghost";
    const ghostDot = document.createElement("span");
    ghostDot.className = "milestone-drag-ghost__dot";
    const ghostLabel = document.createElement("span");
    ghostLabel.textContent = milestone.text || translate("milestonePlaceholder");
    ghost.append(ghostDot, ghostLabel);
    ghost.style.setProperty("--goal-color", node.style.getPropertyValue("--goal-color"));
    document.body.appendChild(ghost);

    milestoneDrag = {
      dot: dot,
      node: node,
      project: project,
      milestone: milestone,
      ghost: ghost,
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      drop: null,
      undated: null
    };
    if (dot.setPointerCapture) {
      try { dot.setPointerCapture(event.pointerId); } catch (err) {}
    }
    dot.blur();
    node.classList.add("is-dragging");
    const undated = document.querySelector('.tgroup[data-undated-drop="1"]');
    if (undated) undated.classList.add("is-drop-available");
    moveMilestoneGhost(event.clientX, event.clientY);
    updateMilestoneDragTargets(event.clientX, event.clientY);
    document.addEventListener("pointermove", moveMilestoneDrag, { passive: false });
    document.addEventListener("pointerup", endMilestoneDrag);
    document.addEventListener("pointercancel", cancelMilestoneDrag);
    cancelAnimationFrame(milestoneDragScrollFrame);
    milestoneDragScrollFrame = requestAnimationFrame(autoScrollMilestoneDrag);
  }

  function moveMilestoneGhost(clientX, clientY) {
    if (!milestoneDrag) return;
    milestoneDrag.ghost.style.left = (clientX + 14) + "px";
    milestoneDrag.ghost.style.top = (clientY + 12) + "px";
  }

  function updateMilestoneDragTargets(clientX, clientY) {
    if (!milestoneDrag) return;
    milestoneDrag.pointerX = clientX;
    milestoneDrag.pointerY = clientY;
    const drop = taskDropAt(clientX, clientY);
    milestoneDrag.drop = drop;
    showTaskDrop(drop, { text: milestoneDrag.milestone.text || translate("milestonePlaceholder") });

    const group = document.querySelector('.tgroup[data-undated-drop="1"]');
    const undated = drop ? null : undatedDropPosition(clientX, clientY);
    milestoneDrag.undated = undated;
    if (group) group.classList.toggle("is-drop-target", !!undated);
  }

  function moveMilestoneDrag(event) {
    if (!milestoneDrag) return;
    event.preventDefault();
    moveMilestoneGhost(event.clientX, event.clientY);
    updateMilestoneDragTargets(event.clientX, event.clientY);
  }

  function autoScrollMilestoneDrag() {
    if (!milestoneDrag) return;
    const edge = Math.min(110, window.innerHeight * .18);
    let amount = 0;
    if (milestoneDrag.pointerY < edge) {
      amount = -Math.ceil((edge - milestoneDrag.pointerY) / edge * 18);
    } else if (milestoneDrag.pointerY > window.innerHeight - edge) {
      amount = Math.ceil((milestoneDrag.pointerY - (window.innerHeight - edge)) / edge * 18);
    }
    if (amount) {
      window.scrollBy(0, amount);
      updateMilestoneDragTargets(milestoneDrag.pointerX, milestoneDrag.pointerY);
    }
    milestoneDragScrollFrame = requestAnimationFrame(autoScrollMilestoneDrag);
  }

  function cleanMilestoneDrag(drag) {
    drag.node.classList.remove("is-dragging");
    if (drag.dot.hasPointerCapture && drag.dot.hasPointerCapture(drag.pointerId)) {
      drag.dot.releasePointerCapture(drag.pointerId);
    }
    drag.ghost.remove();
    showTaskDrop(null);
    const undated = document.querySelector('.tgroup[data-undated-drop="1"]');
    if (undated) undated.classList.remove("is-drop-available", "is-drop-target");
    milestoneDragUntil = Date.now() + 350;
    cancelAnimationFrame(milestoneDragScrollFrame);
    milestoneDragScrollFrame = 0;
    document.removeEventListener("pointermove", moveMilestoneDrag);
    document.removeEventListener("pointerup", endMilestoneDrag);
    document.removeEventListener("pointercancel", cancelMilestoneDrag);
  }

  function endMilestoneDrag(event) {
    if (!milestoneDrag) return;
    updateMilestoneDragTargets(event.clientX, event.clientY);
    const drag = milestoneDrag;
    milestoneDrag = null;
    cleanMilestoneDrag(drag);
    if (drag.drop) createTaskFromMilestone(drag.project, drag.milestone, drag.drop, null);
    else if (drag.undated) {
      createTaskFromMilestone(drag.project, drag.milestone, null, drag.undated.beforeId);
    }
  }

  function cancelMilestoneDrag() {
    if (!milestoneDrag) return;
    const drag = milestoneDrag;
    milestoneDrag = null;
    cleanMilestoneDrag(drag);
  }

  function createTaskFromMilestone(project, milestone, drop, beforeId) {
    const completedDate = milestone.completedDate || null;
    const task = {
      id: Date.now().toString(),
      text: milestone.text || translate("milestonePlaceholder"),
      done: !!completedDate,
      doneDate: completedDate,
      dueDate: drop ? drop.date : null,
      dueTime: drop ? drop.time : null,
      projectId: project.id,
      milestoneId: milestone.id,
      notified: false
    };
    state.tasks.push(task);
    if (!drop) {
      collapsedGroups.none = false;
      persistUndatedTaskOrder(undatedTaskOrderFor(task.id, beforeId));
    }
    saveState();
    renderList("tasks");
    renderDailyTimeline();
    renderProjectSteps(project);
    if (drop) ensureNotifyPermission();
    showToast(translate("stepCreated"));
  }

  function createInlineMilestoneEditor(project, milestone) {
    const editor = document.createElement("div");
    editor.className = "goal-ms__editor";
    const top = document.createElement("div");
    top.className = "goal-ms__editor-top";
    const done = document.createElement("button");
    done.type = "button";
    done.className = milestone.completedDate ? "goal-ms__check is-on" : "goal-ms__check";
    done.setAttribute("aria-label", translate("doneAria"));
    done.setAttribute("aria-pressed", milestone.completedDate ? "true" : "false");
    done.innerHTML = iconSvg(ICON_TICK);
    done.addEventListener("click", function () {
      toggleMilestone(project, milestone.id, done.closest(".goal-ms"));
    });
    const name = document.createElement("input");
    name.type = "text";
    name.className = "goal-ms__name";
    name.maxLength = 120;
    name.value = milestone.text || "";
    name.placeholder = translate("milestonePlaceholder");
    name.addEventListener("input", function () {
      milestone.text = name.value;
      saveState();
    });
    top.append(done, name);

    const actions = document.createElement("div");
    actions.className = "goal-ms__actions";
    const when = document.createElement("button");
    when.type = "button";
    when.className = "goal-ms__action";
    when.textContent = milestone.targetDate
      ? milestoneDateLabel(milestone.targetDate) : translate("milestoneTarget");
    when.addEventListener("click", function () {
      openCalendar({ projectId: project.id, milestoneId: milestone.id }, "milestone");
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "goal-ms__action goal-ms__action--icon goal-ms__action--del";
    del.setAttribute("aria-label", translate("deleteAria"));
    del.innerHTML = iconSvg(ICON_TRASH);
    del.addEventListener("click", function () {
      openInlineMilestone = null;
      removeMilestone(project, milestone.id, del.closest(".goal-roadmap"));
    });
    actions.append(when, del);
    editor.append(top, actions);
    return editor;
  }

  function createInlineMilestoneAdd(project) {
    const node = document.createElement("div");
    node.className = "goal-ms goal-ms--add";
    if (inlineMilestoneAdd === project.id) node.classList.add("is-open");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "goal-ms__dot goal-ms__dot--add";
    button.textContent = "+";
    button.setAttribute("aria-label", translate("milestoneAdd"));
    button.setAttribute("aria-expanded", inlineMilestoneAdd === project.id ? "true" : "false");
    button.addEventListener("click", function () {
      inlineMilestoneAdd = inlineMilestoneAdd === project.id ? null : project.id;
      openInlineMilestone = null;
      refreshInlineRoadmap(project, { focusAdd: inlineMilestoneAdd === project.id });
    });
    const panel = document.createElement("div");
    panel.className = "goal-ms__panel";
    if (inlineMilestoneAdd === project.id) {
      const form = document.createElement("form");
      form.className = "goal-ms__add-form";
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 120;
      input.placeholder = translate("milestoneAdd");
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "+";
      submit.setAttribute("aria-label", translate("addAria"));
      form.append(input, submit);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        const created = { id: Date.now().toString(), text: text, completedDate: null, targetDate: null };
        project.milestones.splice(Math.max(0, project.milestones.length - 1), 0, created);
        openInlineMilestone = null;
        inlineMilestoneAdd = null;
        saveState();
        renderTimeline(project);
        refreshInlineRoadmap(project);
      });
      panel.appendChild(form);
    } else {
      const label = document.createElement("span");
      label.className = "goal-ms__title";
      label.textContent = translate("milestoneAdd");
      panel.appendChild(label);
    }
    node.append(button, panel);
    return node;
  }

  /* MILESTONE TIMELINE (projects) — a vertical line of dots, text on the right,
     a gauge that fills down to the last completed dot, and a "+" node to extend it.
     A milestone behaves like a task (its own detail view) but lives inside a project.
     First and last dots are unnamed start/finish anchors; the "+" sits before finish. */
  let openMilestone = null;   // the milestone unfolded in the timeline, if any

  function renderTimeline(project) {
    ensureProjectMilestones(project);

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
  function toggleMilestone(project, id, inlineNode) {
    const milestone = findMilestone(project, id);
    if (!milestone) return;
    milestone.completedDate = milestone.completedDate ? null : todayKey();
    const completedTasks = milestone.completedDate
      ? completeMilestoneTasks(project, milestone) : [];
    saveState();
    renderTimeline(project);
    if (completedTasks.length) refreshTasksCompletedByMilestone(project, completedTasks);
    if (inlineNode && inlineNode.isConnected) {
      refreshInlineMilestone(project, milestone, inlineNode);
      return;
    }
    renderList("projects");
  }

  /* A click in the dashboard must not rebuild the project list: replacing the
     whole row also replaces the browser's scroll anchor, which made the page
     jump. Named milestones update in place. The finish anchor is the sole case
     that changes the number of nodes (+ appears/disappears), so only its local
     roadmap is rebuilt while both page and horizontal positions are retained. */
  function refreshInlineMilestone(project, milestone, node) {
    const done = !!milestone.completedDate;
    const roadmap = node.closest(".goal-roadmap");
    if (!roadmap) return;

    if (node.classList.contains("is-finish")) {
      if (done) inlineMilestoneAdd = null;
      refreshInlineRoadmap(project);
    } else {
      node.classList.toggle("is-done", done);
      const dot = node.querySelector(".goal-ms__dot");
      const check = node.querySelector(".goal-ms__check");
      if (dot) dot.setAttribute("aria-pressed", done ? "true" : "false");
      if (check) {
        check.classList.toggle("is-on", done);
        check.setAttribute("aria-pressed", done ? "true" : "false");
      }
      const fill = roadmap.querySelector(".goal-roadmap__fill");
      if (fill) fill.style.width = (milestoneProgress(project) * 100).toFixed(1) + "%";
    }

    const row = roadmap.closest(".item--project");
    const badge = row && row.querySelector(".project-tab .item__sub");
    if (badge) badge.textContent = Math.round(milestoneProgress(project) * 100) + "%";
  }

  function removeMilestone(project, id, inlineRoadmap) {
    const milestones = project.milestones || [];
    for (let i = 0; i < milestones.length; i++) {
      if (milestones[i].id === id) { milestones.splice(i, 1); break; }
    }
    saveState();
    renderTimeline(project);
    if (inlineRoadmap && inlineRoadmap.isConnected && refreshInlineRoadmap(project)) return;
    renderList("projects");
  }

  function findMilestone(project, id) {
    const milestones = project.milestones || [];
    for (let i = 0; i < milestones.length; i++) {
      if (milestones[i].id === id) return milestones[i];
    }
    return null;
  }

  /* A task born from a milestone keeps both ids. Resolve that relation in one
     place so its colour and its completion always point at the same dot. */
  function taskMilestoneLink(task) {
    if (!task || !task.projectId || !task.milestoneId) return null;
    const project = findItem("projects", task.projectId);
    if (!project) return null;
    const milestones = project.milestones || [];
    for (let i = 0; i < milestones.length; i++) {
      if (milestones[i].id === task.milestoneId) {
        return { project: project, milestone: milestones[i], index: i, total: milestones.length };
      }
    }
    return null;
  }

  function milestoneTaskColor(task) {
    const link = taskMilestoneLink(task);
    if (!link) return null;
    const position = link.total > 1 ? link.index / (link.total - 1) : 0;
    return paletteColorAt(paletteStops(), position);
  }

  /* Completion travels from the concrete task back to its source milestone.
     Reopening the task does not reopen the milestone: reaching a milestone is
     a durable event, while the task can still be reviewed independently. */
  function completeTaskMilestone(task) {
    const link = taskMilestoneLink(task);
    if (!link || link.milestone.completedDate) return null;
    link.milestone.completedDate = task.doneDate || todayKey();
    return link.project;
  }

  /* The relation also travels back to concrete work: reaching a milestone
     completes every task that was created from that exact dot. */
  function completeMilestoneTasks(project, milestone) {
    const completed = [];
    for (let i = 0; i < state.tasks.length; i++) {
      const task = state.tasks[i];
      if (task.projectId !== project.id || task.milestoneId !== milestone.id || task.done) continue;
      task.done = true;
      task.doneDate = milestone.completedDate;
      completed.push(task.id);
    }
    return completed;
  }

  function refreshTasksCompletedByMilestone(project, taskIds) {
    renderList("tasks");
    // If an editor currently freezes the task list, update its visible source
    // rows immediately and leave the structural move to the deferred repaint.
    for (let i = 0; i < taskIds.length; i++) {
      const row = document.querySelector('.item[data-id="' + taskIds[i] + '"]');
      if (row) row.classList.add("done");
    }
    renderTasksRing();
    renderDailyTimeline();
    if (openProject === project.id) renderProjectSteps(project);
  }

  /* Keep every visible representation current without rebuilding the complete
     project list (which would move the scroll anchor of an open objective). */
  function refreshLinkedMilestoneProject(project) {
    if (!project) return;
    const refreshed = refreshInlineRoadmap(project);
    if (!refreshed) {
      const row = document.querySelector('#projectsList .item[data-id="' + project.id + '"]');
      const badge = row && row.querySelector(".project-tab .item__sub");
      if (badge) badge.textContent = Math.round(milestoneProgress(project) * 100) + "%";
    }
    if (openProject === project.id) renderTimeline(project);
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
      const linkedProject = task.done ? completeTaskMilestone(task) : null;
      saveState();
      renderProjectSteps(project);
      renderList("tasks");
      renderDailyTimeline();
      if (linkedProject) refreshLinkedMilestoneProject(linkedProject);
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
      renderDailyTimeline();
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

  /* WELL-BEING — its own space again. The tree only grows while it is on screen:
     it is a few thousand strokes and an animation, wasted behind a closed door. */
  const wellView = document.getElementById("wellView");

  function openWell() {
    wellView.hidden = false;
    requestAnimationFrame(function () {
      wellView.classList.add("is-open");
      growTree();   // measured here: the canvas had no size while the view was shut
    });
  }

  function closeWell() {
    wellView.classList.remove("is-open");
    stopGrowth();
    stopSap();
    setTimeout(function () { wellView.hidden = true; }, 300);
  }

  document.getElementById("wellBtn").addEventListener("click", openWell);
  document.getElementById("wellBack").addEventListener("click", closeWell);

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

  /* EVENTS — the calendar selects the day rendered by the timeline. */
  const ecalGrid = document.getElementById("ecalGrid");
  const ecalViewport = document.getElementById("ecalViewport");
  const ecalToggle = document.getElementById("ecalToggle");
  let ecalYear = new Date().getFullYear();
  let ecalMonth = new Date().getMonth();
  let calExpanded = false;   // folded to a single week by default
  // The compact calendar is a seven-day ribbon centred on its reference day,
  // rather than a rigid Monday-to-Sunday box.
  let weekStart = shiftDateKey(todayKey(), -3);

  function eventsOnDay(key) {
    const found = [];
    for (let i = 0; i < state.events.length; i++) {
      if (state.events[i].date === key) found.push(state.events[i]);
    }
    return found;
  }

  function tasksOnDay(key) {
    const found = [];
    for (let i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].dueDate === key) found.push(state.tasks[i]);
    }
    return found;
  }

  /* "past" once its time (or the end of its day, if no time) has gone by */
  function eventStatus(event) {
    const at = new Date(event.date + "T" + (event.time || "23:59:59"));
    return Date.now() > at.getTime() ? "past" : "pending";
  }

  /* Draw the month: label, weekday row, leading blanks, day cells with event dots. */
  /* one day cell, shared by the week strip and the month grid */
  function createCalDay(key, dayNumber, row, col, focus) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = key === todayKey() ? "ecal__day is-today" : "ecal__day";
    if (focus) cell.classList.add("is-focus");
    if (key === todayKey()) cell.setAttribute("aria-current", "date");
    cell.dataset.key = key;
    cell.dataset.row = row;
    cell.dataset.col = col;
    cell.style.gridRow = String(row + 2);     // row 1 is the weekday strip
    cell.style.gridColumn = String(col + 1);

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
    }
    cell.addEventListener("click", function () {
      if (Date.now() < calendarDayDragUntil) return;
      if (!calExpanded && col !== 3) centerWeekOnDay(key, cell);
      else showDay(key);
    });
    return cell;
  }

  /* a ring on the grid marks the day displayed by the timeline */
  function markPickedDay() {
    const cells = ecalGrid.querySelectorAll(".ecal__day");
    for (let i = 0; i < cells.length; i++) {
      cells[i].classList.toggle("is-picked", !!sectionDay && cells[i].dataset.key === sectionDay);
    }
  }

  /* The way home answers for the period on show as well as the day picked: the
     arrows can walk today's cell off the grid without any day being chosen, and
     that is just as much a place to come back from. */
  function paintDayToday() {
    const onScreen = !!ecalGrid.querySelector('[data-key="' + todayKey() + '"]');
    document.getElementById("dayToday").hidden = !sectionDay && onScreen;
  }

  /* The month remains Monday-first. The open week ribbon names the actual seven
     days around its centre, which lets today genuinely occupy the middle. */
  function appendWeekdayHeads(grid, firstKey) {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    for (let i = 0; i < 7; i++) {
      const head = document.createElement("div");
      head.className = "ecal__wd";
      const day = firstKey
        ? new Date(shiftDateKey(firstKey, i) + "T00:00")
        : new Date(2024, 0, 1 + i);
      head.textContent = day.toLocaleDateString(locale, { weekday: "short" });
      grid.appendChild(head);
    }
  }

  /* folded, the calendar shows one week: the one holding today when we're on the
     current month, otherwise the month's opening week */
  /* The two views navigate on their own axis: folded you walk week by week,
     unfolded month by month. Each keeps the other in step, so folding and
     unfolding always lands on the period you were looking at. */
  /* A ribbon belongs to the month of its central day. */
  function weekAnchorKey() { return shiftDateKey(weekStart, 3); }

  function syncMonthToWeek() {
    const anchor = new Date(weekAnchorKey() + "T00:00");
    ecalYear = anchor.getFullYear();
    ecalMonth = anchor.getMonth();
  }
  function syncWeekToMonth() {
    const now = new Date();
    const onThisMonth = now.getFullYear() === ecalYear && now.getMonth() === ecalMonth;
    const picked = sectionDay ? new Date(sectionDay + "T00:00") : null;
    const pickedInMonth = picked && picked.getFullYear() === ecalYear && picked.getMonth() === ecalMonth;
    const focus = pickedInMonth ? picked : (onThisMonth ? now : new Date(ecalYear, ecalMonth, 15));
    weekStart = shiftDateKey(dateKeyOf(focus), -3);
  }

  function renderEventCal() {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const shown = calExpanded ? new Date(ecalYear, ecalMonth, 1) : new Date(weekAnchorKey() + "T00:00");
    document.getElementById("ecalMonth").textContent =
      shown.toLocaleDateString(locale, { month: "long", year: "numeric" });

    ecalGrid.innerHTML = "";
    ecalGrid.classList.toggle("is-week", !calExpanded);
    ecalGrid.classList.toggle("is-month", calExpanded);
    ecalGrid.closest(".ecal").classList.toggle("is-expanded", calExpanded);
    appendWeekdayHeads(ecalGrid, calExpanded ? null : weekStart);

    // cells are placed by hand, which saves the run of empty pads before day 1
    if (!calExpanded) {
      const firstDay = new Date(weekStart + "T00:00");
      for (let i = 0; i < 7; i++) {
        const day = new Date(firstDay);
        day.setDate(firstDay.getDate() + i);
        const key = dateKey(day.getFullYear(), day.getMonth(), day.getDate());
        ecalGrid.appendChild(createCalDay(key, day.getDate(), 0, i, i === 3));
      }
    } else {
      const lead = (new Date(ecalYear, ecalMonth, 1).getDay() + 6) % 7;   // Monday-first offset
      const daysInMonth = new Date(ecalYear, ecalMonth + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const slot = lead + d - 1;
        ecalGrid.appendChild(createCalDay(dateKey(ecalYear, ecalMonth, d), d,
                                          Math.floor(slot / 7), slot % 7, false));
      }
    }

    markPickedDay();
    paintDayToday();
  }

  /* A side day travels into the centre instead of merely changing the timeline.
     The new ribbon is drawn first, then starts where the clicked cell was: this
     keeps that day under the pointer while the whole week slides around it. */
  const WEEK_SHIFT_MS = 480;
  let weekShiftTimer = null;
  const dayLineStage = document.getElementById("dayLineStage");
  const dayLineRail = document.getElementById("dayLineRail");
  let timelineDayTimer = null;
  let calendarDayDrag = null;
  let calendarDayDragUntil = 0;

  function finishTimelineDaySlide() {
    clearTimeout(timelineDayTimer);
    timelineDayTimer = null;
    dayLineStage.classList.remove("is-day-sliding");
    dayLineRail.style.removeProperty("transition");
    dayLineRail.style.removeProperty("transform");
    const ghost = dayLineStage.querySelector(".day-line__rail--ghost");
    if (ghost) ghost.remove();
  }

  /* The time rule changes day with the calendar: the complete old rail exits
     while the freshly rendered one enters from the clicked day's direction. */
  function slideTimelineToDay(key, direction) {
    finishTimelineDaySlide();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      showDay(key);
      return;
    }

    const ghost = dayLineRail.cloneNode(true);
    ghost.removeAttribute("id");
    const ghostIds = ghost.querySelectorAll("[id]");
    for (let i = 0; i < ghostIds.length; i++) ghostIds[i].removeAttribute("id");
    ghost.classList.add("day-line__rail--ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    dayLineStage.appendChild(ghost);

    showDay(key);

    dayLineStage.classList.add("is-day-sliding");
    ghost.style.transition = "none";
    ghost.style.transform = "translateX(0)";
    dayLineRail.style.transition = "none";
    dayLineRail.style.transform = "translateX(" + (direction * 100) + "%)";
    dayLineStage.offsetWidth;

    requestAnimationFrame(function () {
      ghost.style.transition = "";
      dayLineRail.style.transition = "";
      ghost.style.transform = "translateX(" + (-direction * 100) + "%)";
      dayLineRail.style.transform = "";
    });

    timelineDayTimer = setTimeout(finishTimelineDaySlide, WEEK_SHIFT_MS + 80);
  }

  function finishWeekShift() {
    clearTimeout(weekShiftTimer);
    weekShiftTimer = null;
    ecalGrid.classList.remove("is-recentering");
    ecalViewport.classList.remove("is-week-sliding");
    ecalGrid.style.removeProperty("transition");
    ecalGrid.style.removeProperty("transform");
    ecalViewport.style.removeProperty("overflow");
    const ghost = ecalViewport.querySelector(".ecal__grid--ghost");
    if (ghost) ghost.remove();
    const cells = ecalGrid.querySelectorAll(".ecal__day");
    for (let i = 0; i < cells.length; i++) {
      cells[i].style.removeProperty("transition");
      cells[i].style.removeProperty("transform");
    }
  }

  function centerWeekOnDay(key, sourceCell) {
    const from = sourceCell.getBoundingClientRect();
    const fromCenter = from.left + from.width / 2;
    const direction = Number(sourceCell.dataset.col) > 3 ? 1 : -1;

    finishWeekShift();
    slideTimelineToDay(key, direction);
    weekStart = shiftDateKey(key, -3);
    syncMonthToWeek();
    renderEventCal();

    const focus = ecalGrid.querySelector('.ecal__day.is-focus[data-key="' + key + '"]');
    if (!focus || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const to = focus.getBoundingClientRect();
    const slide = fromCenter - (to.left + to.width / 2);
    const scaleX = from.width / to.width;
    const scaleY = from.height / to.height;

    ecalViewport.style.overflow = "hidden";
    ecalGrid.classList.add("is-recentering");
    ecalGrid.style.transition = "none";
    ecalGrid.style.transform = "translateX(" + slide.toFixed(1) + "px)";
    focus.style.transition = "none";
    focus.style.transform = "scale(" + scaleX.toFixed(3) + ", " + scaleY.toFixed(3) + ")";
    ecalGrid.offsetWidth;

    requestAnimationFrame(function () {
      ecalGrid.style.transition = "";
      focus.style.transition = "";
      ecalGrid.style.transform = "";
      focus.style.transform = "";
    });

    weekShiftTimer = setTimeout(finishWeekShift, WEEK_SHIFT_MS + 80);
  }

  /* Week arrows move one complete ribbon. The outgoing seven days and the
     incoming seven days share the viewport for the duration of the slide, so
     no cell jumps or changes alone. */
  function slideWholeWeek(direction) {
    finishWeekShift();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      weekStart = shiftDateKey(weekStart, direction * 7);
      syncMonthToWeek();
      showDay(weekAnchorKey());
      renderEventCal();
      return;
    }

    const ghost = ecalGrid.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.classList.add("ecal__grid--ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    ecalViewport.appendChild(ghost);

    weekStart = shiftDateKey(weekStart, direction * 7);
    syncMonthToWeek();
    slideTimelineToDay(weekAnchorKey(), direction);
    renderEventCal();

    ecalViewport.classList.add("is-week-sliding");
    ecalViewport.style.overflow = "hidden";
    ghost.style.transition = "none";
    ghost.style.transform = "translateX(0)";
    ecalGrid.style.transition = "none";
    ecalGrid.style.transform = "translateX(" + (direction * 100) + "%)";
    ecalViewport.offsetWidth;

    requestAnimationFrame(function () {
      ghost.style.transition = "";
      ecalGrid.style.transition = "";
      ghost.style.transform = "translateX(" + (-direction * 100) + "%)";
      ecalGrid.style.transform = "";
    });

    weekShiftTimer = setTimeout(finishWeekShift, WEEK_SHIFT_MS + 80);
  }

  /* DRAG A DAY — the week ribbon and the time rail are the same carousel. The
     neighbouring day's rail is rendered beside the current one as soon as the
     gesture has a direction; both then follow the pointer without easing. */
  const DAY_DRAG_THRESHOLD = .28;
  const DAY_DRAG_SETTLE_MS = 260;

  function cloneDayLineRail() {
    const ghost = dayLineRail.cloneNode(true);
    ghost.removeAttribute("id");
    const ids = ghost.querySelectorAll("[id]");
    for (let i = 0; i < ids.length; i++) ids[i].removeAttribute("id");
    ghost.classList.add("day-line__rail--ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    return ghost;
  }

  function positionDayDrag(drag, progress) {
    const p = Math.max(0, Math.min(1, progress));
    drag.progress = p;
    ecalGrid.style.transform = "translateX(" + (-drag.direction * p * drag.step).toFixed(1) + "px)";
    drag.ghost.style.transform = "translateX(" + (-drag.direction * p * 100).toFixed(2) + "%)";
    dayLineRail.style.transform = "translateX(" + (drag.direction * (1 - p) * 100).toFixed(2) + "%)";
  }

  function prepareDayDrag(drag, direction) {
    drag.started = true;
    drag.direction = direction;
    drag.targetKey = shiftDateKey(drag.originKey, direction);

    const focus = ecalGrid.querySelector('.ecal__day[data-col="3"]');
    const side = ecalGrid.querySelector('.ecal__day[data-col="' + (3 + direction) + '"]');
    const focusRect = focus && focus.getBoundingClientRect();
    const sideRect = side && side.getBoundingClientRect();
    drag.step = focusRect && sideRect
      ? Math.abs((sideRect.left + sideRect.width / 2) - (focusRect.left + focusRect.width / 2))
      : Math.max(70, ecalViewport.clientWidth / 7);

    drag.ghost = cloneDayLineRail();
    dayLineStage.appendChild(drag.ghost);
    previewTimelineDay(drag.targetKey);

    ecalViewport.classList.add("is-day-dragging");
    dayLineStage.classList.add("is-day-dragging");
    ecalViewport.style.overflow = "hidden";
    ecalGrid.style.transition = "none";
    drag.ghost.style.transition = "none";
    dayLineRail.style.transition = "none";
  }

  function cleanDayDrag(drag) {
    ecalViewport.classList.remove("is-day-dragging");
    dayLineStage.classList.remove("is-day-dragging");
    ecalViewport.style.removeProperty("overflow");
    ecalGrid.style.removeProperty("transition");
    ecalGrid.style.removeProperty("transform");
    dayLineRail.style.removeProperty("transition");
    dayLineRail.style.removeProperty("transform");
    if (drag.ghost && drag.ghost.parentNode) drag.ghost.remove();
  }

  function settleDayDrag(drag, commit) {
    const targetProgress = commit ? 1 : 0;
    const duration = Math.max(120, Math.round(DAY_DRAG_SETTLE_MS * Math.abs(targetProgress - drag.progress)));
    const transition = "transform " + duration + "ms cubic-bezier(.22, .8, .25, 1)";
    ecalGrid.style.transition = transition;
    drag.ghost.style.transition = transition;
    dayLineRail.style.transition = transition;
    positionDayDrag(drag, targetProgress);

    setTimeout(function () {
      if (!commit) {
        // The old rail is currently visible; replace the off-screen live rail
        // with the same day before removing the ghost, so nothing flashes.
        previewTimelineDay(drag.originKey);
        cleanDayDrag(drag);
        return;
      }

      // At one full step the neighbouring cell is under the old centre. Redraw
      // it as the large focus cell and grow it from that exact on-screen rect.
      const source = ecalGrid.querySelector('.ecal__day[data-key="' + drag.targetKey + '"]');
      const from = source && source.getBoundingClientRect();
      cleanDayDrag(drag);
      weekStart = shiftDateKey(drag.targetKey, -3);
      syncMonthToWeek();
      renderEventCal();
      openTaskDay(drag.targetKey);

      const focus = ecalGrid.querySelector('.ecal__day.is-focus[data-key="' + drag.targetKey + '"]');
      if (!focus || !from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const to = focus.getBoundingClientRect();
      const move = (from.left + from.width / 2) - (to.left + to.width / 2);
      const scaleX = from.width / to.width;
      const scaleY = from.height / to.height;
      ecalGrid.classList.add("is-recentering");
      focus.style.transition = "none";
      focus.style.transform = "translateX(" + move.toFixed(1) + "px) scale("
        + scaleX.toFixed(3) + ", " + scaleY.toFixed(3) + ")";
      ecalGrid.offsetWidth;
      requestAnimationFrame(function () {
        focus.style.transition = "";
        focus.style.transform = "";
      });
      weekShiftTimer = setTimeout(finishWeekShift, WEEK_SHIFT_MS + 80);
    }, duration + 20);
  }

  ecalViewport.addEventListener("pointerdown", function (event) {
    const cell = event.target.closest && event.target.closest(".ecal__day");
    const mobileRibbon = window.matchMedia("(max-width: 999px)").matches;
    if (!cell || calExpanded || !mobileRibbon || event.pointerType === "mouse" || event.button !== 0) return;
    // Do not let the page-level mobile pane swipe claim the same gesture.
    event.stopPropagation();
    finishWeekShift();
    finishTimelineDaySlide();
    calendarDayDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      originKey: weekAnchorKey(),
      started: false,
      progress: 0
    };
    ecalViewport.setPointerCapture(event.pointerId);
  });

  ecalViewport.addEventListener("pointermove", function (event) {
    const drag = calendarDayDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.stopPropagation();
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.started) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      prepareDayDrag(drag, dx < 0 ? 1 : -1);
    }
    event.preventDefault();
    const directed = drag.direction > 0 ? Math.max(0, -dx) : Math.max(0, dx);
    positionDayDrag(drag, directed / drag.step);
  });

  function endCalendarDayDrag(event, cancelled) {
    const drag = calendarDayDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.stopPropagation();
    calendarDayDrag = null;
    if (ecalViewport.hasPointerCapture(drag.pointerId)) {
      ecalViewport.releasePointerCapture(drag.pointerId);
    }
    if (!drag.started) return;
    calendarDayDragUntil = Date.now() + 350;
    const elapsed = Math.max(1, performance.now() - drag.startedAt);
    const fast = drag.progress > .1 && drag.progress * drag.step / elapsed > .45;
    settleDayDrag(drag, !cancelled && (drag.progress >= DAY_DRAG_THRESHOLD || fast));
  }

  ecalViewport.addEventListener("pointerup", function (event) {
    endCalendarDayDrag(event, false);
  });
  ecalViewport.addEventListener("pointercancel", function (event) {
    endCalendarDayDrag(event, true);
  });

  /* Unfold or fold the month in place. Three things move together: the viewport
     grows, the grid slides so the week you were already looking at travels to
     its real row instead of teleporting, and the other rows drop in one after
     another from the top. */
  const CAL_MS = 480;
  let calTimer = null;

  function cellTop(key) {
    const cell = ecalGrid.querySelector('[data-key="' + key + '"]');
    return cell ? cell.getBoundingClientRect().top : null;
  }

  function toggleCalendar() {
    finishWeekShift();
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
  /* goToDay, not showDay: coming home has to walk the grid back to today's week
     as well as reset the day, or the band looks for a cell that is not on screen */
  document.getElementById("dayToday").addEventListener("click", function () { goToDay(todayKey()); });

  /* folded, the arrows walk a week at a time; unfolded, a month at a time */
  function stepCalendar(direction) {
    if (calExpanded) {
      finishWeekShift();
      ecalMonth += direction;
      if (ecalMonth < 0) { ecalMonth = 11; ecalYear--; }
      if (ecalMonth > 11) { ecalMonth = 0; ecalYear++; }
      syncWeekToMonth();
      renderEventCal();
    } else {
      slideWholeWeek(direction);
    }
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
      icon: "calendar", date: key, time: time || "09:00"
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


  /* DAILY TIMELINE — one stable scale from midnight to midnight. Its geometry
     never changes when a task or event appears, which also lets day dragging
     move two neighbouring rails continuously without a change of scale. */
  const DAY_MS = 86400000;
  let spanMs = DAY_MS;
  let nowAnchor = .5;

  /* the moment the rule is drawn around — the clock, unless the user is
     dragging the timeline (an option), in which case it is shifted */
  let scrubOffset = 0;
  function refTime() { return Date.now() + scrubOffset; }
  function timelineTime() {
    const base = sectionDay
      ? new Date(sectionDay + "T12:00").getTime()
      : Date.now();
    return base + scrubOffset;
  }
  function windowStartMs() { return timelineTime() - spanMs * nowAnchor; }

  function fitTimelineWindow() {
    spanMs = DAY_MS;
    if (sectionDay) { nowAnchor = .5; return; }
    const start = new Date(todayKey() + "T00:00").getTime();
    nowAnchor = Math.max(0, Math.min(1, (Date.now() - start) / DAY_MS));
  }

  /* a moment's position across the rule, in percent (may fall outside 0-100) */
  function timePct(ms, windowStart) {
    return (ms - windowStart) / spanMs * 100;
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
        return ((base + minutes * 60000 - windowStart) / spanMs * 100).toFixed(2) + "%";
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

    for (let hour = new Date(first); hour.getTime() <= windowStart + spanMs; hour.setHours(hour.getHours() + 1)) {
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
      if (sectionDay) {
        cursor.hidden = true;
      } else {
        updateCursor(cursor, srMin, ssMin);
        cursor.hidden = false;
      }
    } else {
      cursor.hidden = true;
    }

    renderTimelineItems(windowStart);
    renderAddEventSlot(windowStart);
    fieldWake();   // the block field carries the sun's light, so it repaints too
  }

  function renderDailyTimeline() {
    const sun = todaySun();
    fitTimelineWindow();
    renderTimeRule();

    // compact weather reading beside the other top-bar tools
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
      weather.classList.toggle("is-clickable", !!(sun.hourly && sun.hourly.temp));
    } else {
      weather.hidden = true;
      weather.classList.remove("is-clickable");
    }

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
    if (event.target.closest(".dtl__event")) return;
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
    const moved = (scrubDrag.x - event.clientX) / scrubDrag.width * spanMs;
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
    cursor.style.left = (nowAnchor * 100) + "%";   // the present never moves

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

  const EVENT_DRAG_STEP = 5;   // same five-minute step as the event time picker
  let eventDragUntil = 0;
  const dtlTrashEl = document.getElementById("dtlTrash");

  function showTimelineTrash(show, active) {
    dtlTrashEl.hidden = !show;
    dtlTrashEl.classList.toggle("is-active", !!active);
    dtlTrashEl.setAttribute("aria-hidden", show ? "false" : "true");
  }

  function timelineTrashHit(clientX, clientY) {
    if (dtlTrashEl.hidden) return false;
    const rect = dtlTrashEl.getBoundingClientRect();
    return clientX >= rect.left - 18 && clientX <= rect.right + 18
      && clientY >= rect.top - 18 && clientY <= rect.bottom + 18;
  }

  function deleteTimelineMarker(kind, item) {
    if (detailTarget.kind === kind && detailTarget.id === item.id) closeDetail();
    if (kind === "events") removeEvent(item.id);
    else removeItem("tasks", item.id);
  }

  /* Horizontal movement changes the time; pulling the icon down into the
     temporary bin deletes it, through the same undoable path as every delete. */
  function armEventTimeDrag(marker, event, windowStart) {
    marker.addEventListener("pointerdown", function (downEvent) {
      if (downEvent.pointerType === "mouse" && downEvent.button !== 0) return;
      downEvent.stopPropagation();

      const line = dtlEl.getBoundingClientRect();
      const parts = event.time.split(":");
      const originalTime = event.time;
      const originalMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      const originalAt = new Date(event.date + "T" + originalTime).getTime();
      const originalPast = eventStatus(event) === "past";
      let moved = false;
      let deleting = false;

      marker.setPointerCapture(downEvent.pointerId);

      const move = function (moveEvent) {
        const dx = moveEvent.clientX - downEvent.clientX;
        const dy = moveEvent.clientY - downEvent.clientY;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        if (!moved) {
          moved = true;
          marker.classList.add("is-dragging");
          showTimelineTrash(true, false);
        }

        deleting = timelineTrashHit(moveEvent.clientX, moveEvent.clientY);
        marker.classList.toggle("is-delete-target", deleting);
        showTimelineTrash(true, deleting);
        if (deleting) {
          event.time = originalTime;
          marker.style.left = Math.max(0, Math.min(100, timePct(originalAt, windowStart))).toFixed(2) + "%";
          marker.classList.toggle("is-past", originalPast);
          marker.classList.toggle("is-pending", !originalPast);
          marker.setAttribute("aria-label", translate("timelineDelete") + " · " + event.text);
          marker.querySelector(".dtl__event-tip").textContent = translate("timelineDelete");
          return;
        }

        const rawMinutes = originalMinutes + dx / line.width * spanMs / 60000;
        const snapped = Math.round(rawMinutes / EVENT_DRAG_STEP) * EVENT_DRAG_STEP;
        const minutes = Math.max(0, Math.min(24 * 60 - EVENT_DRAG_STEP, snapped));
        const time = String(Math.floor(minutes / 60)).padStart(2, "0")
          + ":" + String(minutes % 60).padStart(2, "0");
        event.time = time;

        const at = new Date(event.date + "T" + time).getTime();
        marker.style.left = Math.max(0, Math.min(100, timePct(at, windowStart))).toFixed(2) + "%";
        const past = eventStatus(event) === "past";
        marker.classList.toggle("is-past", past);
        marker.classList.toggle("is-pending", !past);
        marker.setAttribute("aria-label", time + " · " + event.text);
        marker.querySelector(".dtl__event-tip").textContent = time + " · " + event.text;
      };

      const cleanup = function () {
        marker.removeEventListener("pointermove", move);
        marker.removeEventListener("pointerup", up);
        marker.removeEventListener("pointercancel", cancel);
        marker.classList.remove("is-dragging", "is-delete-target");
        showTimelineTrash(false, false);
        if (marker.hasPointerCapture(downEvent.pointerId)) {
          marker.releasePointerCapture(downEvent.pointerId);
        }
      };

      const up = function () {
        const remove = deleting;
        cleanup();
        if (!moved) return;
        eventDragUntil = Date.now() + 300;
        if (remove) {
          event.time = originalTime;
          deleteTimelineMarker("events", event);
          return;
        }
        saveState();
        renderEventCal();
        renderDailyTimeline();
      };

      const cancel = function () {
        cleanup();
        if (!moved) return;
        event.time = originalTime;
        renderTimeRule();
      };

      marker.addEventListener("pointermove", move);
      marker.addEventListener("pointerup", up);
      marker.addEventListener("pointercancel", cancel);
    });
  }

  /* A task marker has three destinations: sideways changes its time, the bin
     deletes it, and the permanent dateless group detaches it from the clock. */
  function armTaskTimeDrag(marker, task, windowStart) {
    marker.addEventListener("pointerdown", function (downEvent) {
      if (downEvent.pointerType === "mouse" && downEvent.button !== 0) return;
      downEvent.stopPropagation();

      const line = dtlEl.getBoundingClientRect();
      const originalDate = task.dueDate;
      const originalTime = task.dueTime || "09:00";
      const originalAt = new Date(originalDate + "T" + originalTime).getTime();
      let moved = false;
      let deleting = false;
      let undating = false;
      let undatedPosition = null;
      let pointerX = downEvent.clientX;
      let pointerY = downEvent.clientY;
      let scrollFrame = 0;

      marker.setPointerCapture(downEvent.pointerId);

      const applyMove = function (clientX, clientY) {
        const dx = clientX - downEvent.clientX;
        deleting = timelineTrashHit(clientX, clientY);
        undatedPosition = deleting ? null : undatedDropPosition(clientX, clientY);
        undating = !!undatedPosition;
        marker.classList.toggle("is-delete-target", deleting);
        marker.classList.toggle("is-undate-target", undating);
        showTimelineTrash(true, deleting);

        const undatedGroup = document.querySelector('.tgroup[data-undated-drop="1"]');
        if (undatedGroup) {
          undatedGroup.classList.add("is-drop-available");
          undatedGroup.classList.toggle("is-drop-target", undating);
        }

        if (deleting) {
          task.dueDate = originalDate;
          task.dueTime = originalTime;
          marker.style.left = Math.max(0, Math.min(100, timePct(originalAt, windowStart))).toFixed(2) + "%";
          marker.setAttribute("aria-label", translate("timelineDelete") + " · " + task.text);
          marker.querySelector(".dtl__event-tip").textContent = translate("timelineDelete");
          return;
        }
        if (undating) {
          task.dueDate = originalDate;
          task.dueTime = originalTime;
          marker.style.left = Math.max(0, Math.min(100, timePct(originalAt, windowStart))).toFixed(2) + "%";
          marker.setAttribute("aria-label", translate("groupNone") + " · " + task.text);
          marker.querySelector(".dtl__event-tip").textContent = translate("groupNone");
          return;
        }

        const raw = originalAt + dx / line.width * spanMs;
        const snapped = Math.round(raw / (EVENT_DRAG_STEP * 60000)) * EVENT_DRAG_STEP * 60000;
        const at = new Date(snapped);
        task.dueDate = dateKeyOf(at);
        task.dueTime = String(at.getHours()).padStart(2, "0")
          + ":" + String(at.getMinutes()).padStart(2, "0");
        marker.style.left = Math.max(0, Math.min(100, timePct(snapped, windowStart))).toFixed(2) + "%";
        marker.setAttribute("aria-label", task.dueTime + " · " + task.text);
        marker.querySelector(".dtl__event-tip").textContent = task.dueTime + " · " + task.text;
      };

      const autoScroll = function () {
        if (!moved) return;
        const edge = Math.min(110, window.innerHeight * .18);
        let amount = 0;
        if (pointerY < edge) {
          amount = -Math.ceil((edge - pointerY) / edge * 18);
        } else if (pointerY > window.innerHeight - edge) {
          amount = Math.ceil((pointerY - (window.innerHeight - edge)) / edge * 18);
        }
        if (amount) {
          window.scrollBy(0, amount);
          applyMove(pointerX, pointerY);
        }
        scrollFrame = requestAnimationFrame(autoScroll);
      };

      const move = function (moveEvent) {
        pointerX = moveEvent.clientX;
        pointerY = moveEvent.clientY;
        const dx = pointerX - downEvent.clientX;
        const dy = pointerY - downEvent.clientY;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        if (!moved) {
          moved = true;
          marker.classList.add("is-dragging");
          showTimelineTrash(true, false);
          scrollFrame = requestAnimationFrame(autoScroll);
        }
        applyMove(pointerX, pointerY);
      };

      const cleanup = function () {
        marker.removeEventListener("pointermove", move);
        marker.removeEventListener("pointerup", up);
        marker.removeEventListener("pointercancel", cancel);
        marker.classList.remove("is-dragging", "is-delete-target", "is-undate-target");
        showTimelineTrash(false, false);
        cancelAnimationFrame(scrollFrame);
        const undatedGroup = document.querySelector('.tgroup[data-undated-drop="1"]');
        if (undatedGroup) {
          undatedGroup.classList.remove("is-drop-available", "is-drop-target");
        }
        if (marker.hasPointerCapture(downEvent.pointerId)) {
          marker.releasePointerCapture(downEvent.pointerId);
        }
      };

      const up = function () {
        const remove = deleting;
        const makeUndated = undating;
        const beforeId = undatedPosition ? undatedPosition.beforeId : null;
        cleanup();
        if (!moved) return;
        eventDragUntil = Date.now() + 300;
        if (remove) {
          task.dueDate = originalDate;
          task.dueTime = originalTime;
          deleteTimelineMarker("tasks", task);
          return;
        }
        if (makeUndated) {
          task.dueDate = null;
          task.dueTime = null;
          task.notified = false;
          collapsedGroups.none = false;
          persistUndatedTaskOrder(undatedTaskOrderFor(task.id, beforeId));
          saveState();
          if (detailTarget.kind === "tasks" && detailTarget.id === task.id) closeDetail();
          renderList("tasks");
          renderDailyTimeline();
          if (task.projectId) renderProjectSteps(findItem("projects", task.projectId));
          return;
        }
        task.notified = false;
        saveState();
        renderList("tasks");
        renderDailyTimeline();
        if (task.projectId) renderProjectSteps(findItem("projects", task.projectId));
        ensureNotifyPermission();
      };

      const cancel = function () {
        cleanup();
        if (!moved) return;
        task.dueDate = originalDate;
        task.dueTime = originalTime;
        renderTimeRule();
      };

      marker.addEventListener("pointermove", move);
      marker.addEventListener("pointerup", up);
      marker.addEventListener("pointercancel", cancel);
    });
  }

  const ADD_SLOT_STEP = 30;
  const ADD_SLOT_CLEARANCE = 90;
  let addEventSlot = null;

  function eventMinute(event) {
    if (!event.time) return null;
    const parts = event.time.split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function occupiedTimelineMinutes(dayKey) {
    const occupied = [];
    const dayEvents = eventsOnDay(dayKey);
    for (let i = 0; i < dayEvents.length; i++) {
      const minute = eventMinute(dayEvents[i]);
      if (minute != null && !isNaN(minute)) occupied.push(minute);
    }
    const dayTasks = tasksOnDay(dayKey);
    for (let i = 0; i < dayTasks.length; i++) {
      const minute = eventMinute({ time: dayTasks[i].dueTime || "09:00" });
      if (minute != null && !isNaN(minute)) occupied.push(minute);
    }
    return occupied;
  }

  function minuteClearOf(minute, occupied) {
    for (let i = 0; i < occupied.length; i++) {
      if (Math.abs(minute - occupied[i]) < ADD_SLOT_CLEARANCE) return false;
    }
    return true;
  }

  /* Find the nearest visible half-hour with enough quiet around every object
     already attached to the line. On today, "now" is occupied too: the add
     marker must never masquerade as the live cursor. */
  function freeEventMinute(dayKey, windowStart) {
    const reference = new Date(timelineTime());
    const referenceMinute = reference.getHours() * 60 + reference.getMinutes();
    const preferred = Math.round(referenceMinute / ADD_SLOT_STEP) * ADD_SLOT_STEP;

    const occupied = occupiedTimelineMinutes(dayKey);
    if (!sectionDay && dayKey === dateKeyOf(reference)) occupied.push(referenceMinute);

    const candidates = [];
    for (let minute = 0; minute < 24 * 60; minute += ADD_SLOT_STEP) {
      const time = String(Math.floor(minute / 60)).padStart(2, "0")
        + ":" + String(minute % 60).padStart(2, "0");
      const at = new Date(dayKey + "T" + time).getTime();
      const pct = timePct(at, windowStart);
      if (pct >= 4 && pct <= 96) candidates.push({ minute: minute, pct: pct });
    }
    candidates.sort(function (a, b) {
      const aDistance = Math.abs(a.minute - preferred);
      const bDistance = Math.abs(b.minute - preferred);
      if (aDistance !== bDistance) return aDistance - bDistance;
      if ((a.minute < preferred) !== (b.minute < preferred)) return a.minute < preferred ? 1 : -1;
      return a.minute - b.minute;
    });

    let fallback = candidates[0] || { minute: Math.max(0, Math.min(23 * 60 + 30, preferred)), pct: 50 };
    let fallbackClearance = -1;
    for (let i = 0; i < candidates.length; i++) {
      let clearance = 24 * 60;
      for (let j = 0; j < occupied.length; j++) {
        clearance = Math.min(clearance, Math.abs(candidates[i].minute - occupied[j]));
      }
      if (clearance >= ADD_SLOT_CLEARANCE) return candidates[i];
      if (clearance > fallbackClearance) {
        fallback = candidates[i];
        fallbackClearance = clearance;
      }
    }
    return fallback;
  }

  /* Keep the chosen add time anchored. It is replaced only when the visible day
     changes, it leaves the window, or a real task/event takes its quiet slot. */
  function retainedAddEventMinute(dayKey, windowStart) {
    if (!addEventSlot || addEventSlot.date !== dayKey) return null;
    const minute = eventMinute({ time: addEventSlot.time });
    if (minute == null || isNaN(minute)) return null;
    const at = new Date(dayKey + "T" + addEventSlot.time).getTime();
    const pct = timePct(at, windowStart);
    if (pct < 4 || pct > 96) return null;
    if (!minuteClearOf(minute, occupiedTimelineMinutes(dayKey))) return null;
    return { minute: minute, pct: pct };
  }

  function renderAddEventSlot(windowStart) {
    const marker = document.getElementById("addEventBtn");
    const reference = new Date(timelineTime());
    const day = sectionDay || dateKeyOf(reference);
    const slot = retainedAddEventMinute(day, windowStart)
      || freeEventMinute(day, windowStart);
    const time = String(Math.floor(slot.minute / 60)).padStart(2, "0")
      + ":" + String(slot.minute % 60).padStart(2, "0");
    addEventSlot = { date: day, time: time };

    marker.style.left = slot.pct.toFixed(2) + "%";
    marker.hidden = !document.getElementById("quickEvent").hidden;
    marker.setAttribute("aria-label", translate("addEventTitle") + " · " + time);
    document.getElementById("addEventTip").textContent = translate("addEventTitle") + " · " + time;
  }

  /* Events and dated tasks share one collision layout: each object gets its
     icon and the same filament down to its exact minute. */
  function renderTimelineItems(windowStart) {
    const layer = document.getElementById("dtlEticks");
    layer.innerHTML = "";

    const anchorKey = dateKeyOf(new Date(timelineTime()));
    const keys = [shiftDateKey(anchorKey, -1), anchorKey, shiftDateKey(anchorKey, 1)];
    const visible = [];

    for (let d = 0; d < keys.length; d++) {
      const dayEvents = eventsOnDay(keys[d]);
      for (let i = 0; i < dayEvents.length; i++) {
        const event = dayEvents[i];
        if (!event.time) continue;
        const at = new Date(event.date + "T" + event.time).getTime();
        const pct = timePct(at, windowStart);
        if (pct >= 0 && pct <= 100) {
          visible.push({ kind: "event", data: event, at: at, pct: pct });
        }
      }
      const dayTasks = tasksOnDay(keys[d]);
      for (let i = 0; i < dayTasks.length; i++) {
        const task = dayTasks[i];
        const time = task.dueTime || "09:00";
        const at = new Date(task.dueDate + "T" + time).getTime();
        const pct = timePct(at, windowStart);
        if (pct >= 0 && pct <= 100) {
          visible.push({ kind: "task", data: task, at: at, pct: pct });
        }
      }
    }
    visible.sort(function (a, b) { return a.at - b.at; });

    let cluster = 0;
    let lastAt = -Infinity;

    for (let i = 0; i < visible.length; i++) {
      const item = visible[i];
      const data = item.data;
      const isTask = item.kind === "task";
      const time = isTask ? (data.dueTime || "09:00") : data.time;
      cluster = item.at - lastAt < 45 * 60000 ? cluster + 1 : 0;
      lastAt = item.at;
      const lane = cluster % 2;
      const spread = Math.floor(cluster / 2);
      let shift = spread ? (spread % 2 ? 36 : -36) : 0;
      const lift = lane * 38;
      if (item.pct < 5 && shift < 0) shift *= -1;
      if (item.pct > 95 && shift > 0) shift *= -1;

      const marker = document.createElement("button");
      marker.type = "button";
      if (isTask) {
        marker.className = "dtl__event dtl__task "
          + (data.done ? "is-done" : "is-" + eventStatus({ date: data.dueDate, time: time }));
        const milestoneColor = milestoneTaskColor(data);
        if (milestoneColor) {
          marker.classList.add("dtl__task--milestone-linked");
          marker.style.setProperty("--task-milestone-color", milestoneColor);
        }
      } else {
        marker.className = "dtl__event is-" + eventStatus(data)
          + (data.important ? " is-important" : "");
      }
      marker.style.left = item.pct.toFixed(2) + "%";
      marker.style.setProperty("--event-shift", shift + "px");
      marker.dataset[isTask ? "task" : "event"] = data.id;
      marker.setAttribute("aria-label", time + " · " + data.text);
      marker.addEventListener("click", function (clickEvent) {
        if (Date.now() < eventDragUntil) {
          clickEvent.preventDefault();
          return;
        }
        if (isTask) openTaskFold(data);
        else openEventFold(data);
      });

      const wire = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      wire.setAttribute("class", "dtl__event-filament");
      wire.setAttribute("viewBox", "0 0 80 74");
      wire.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "dtl__event-path");
      const startX = 40 + shift;
      const startY = 30 - lift;
      path.setAttribute("d", "M" + startX + " " + startY
        + " C" + startX + " 48 40 44 40 72");
      const foot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      foot.setAttribute("class", "dtl__event-foot");
      foot.setAttribute("cx", "40");
      foot.setAttribute("cy", "72");
      foot.setAttribute("r", "3.5");
      wire.append(path, foot);

      const icon = document.createElement("span");
      icon.className = "dtl__event-icon";
      icon.style.left = "calc(50% + " + shift + "px)";
      icon.style.top = -lift + "px";
      icon.innerHTML = isTask
        ? iconSvg('<circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/>')
        : habitSvg(data.icon || "calendar");
      const tip = document.createElement("span");
      tip.className = "dtl__event-tip";
      tip.style.left = "calc(50% + " + shift + "px)";
      tip.style.top = (-30 - lift) + "px";
      tip.textContent = time + " · " + data.text;
      marker.append(wire, icon, tip);
      if (isTask) armTaskTimeDrag(marker, data, windowStart);
      else armEventTimeDrag(marker, data, windowStart);
      layer.appendChild(marker);
    }
  }

  let sectionDay = null;   // null means today

  /* During a calendar drag only the calendar/timeline pair previews the next
     day. The task flow waits for release, avoiding a vertical jump mid-gesture. */
  function previewTimelineDay(key) {
    sectionDay = key === todayKey() ? null : key;
    scrubOffset = 0;
    markPickedDay();
    paintDayToday();
    renderDailyTimeline();
  }

  function showDay(key) {
    previewTimelineDay(key);
    openTaskDay(key);
  }

  /* The grid drives the tasks too, but it does not filter them: the flow stays
     whole and only unfolds the day picked, folding the days opened before it so
     the run mirrors the grid instead of piling up. Today is never folded, so it
     stays in sight alongside. The timeline switches to that complete day without
     moving the task flow away from the calendar. */
  function openTaskDay(key) {
    const opened = Object.keys(collapsedGroups);
    for (let i = 0; i < opened.length; i++) {
      if (opened[i].indexOf("day:") === 0) delete collapsedGroups[opened[i]];
    }
    collapsedGroups["day:" + key] = false;
    renderList("tasks");
  }

  /* the day on show has the last word: a bare time belongs to it, not to today */
  function quickEventDay(parsed) {
    if (parsed.date && !parsed.inferred) return parsed.date;
    return (addEventSlot && addEventSlot.date) || sectionDay || todayKey();
  }
  function quickEventTime(parsed, day) {
    if (parsed.time) return parsed.time;
    return addEventSlot && addEventSlot.date === day ? addEventSlot.time : "09:00";
  }

  wireQuickAdd({
    form: "quickEvent", input: "quickEventInput", mirror: "quickEventMirror",
    hint: "quickEventHint", button: "addEventBtn",
    flagLabel: "importantLabel", fallbackName: "newEventName",
    resolveDate: quickEventDay,
    resolveTime: quickEventTime,
    submit: function (parsed, title, day, time) {
      addEvent(day, title, time, parsed.flag);
      goToDay(day);   // follow the day it landed on rather than lose it from view
    }
  });

  /* bring both the grid and the day view onto a day */
  function goToDay(key) {
    finishWeekShift();
    finishTimelineDaySlide();
    const day = new Date(key + "T00:00");
    ecalYear = day.getFullYear();
    ecalMonth = day.getMonth();
    weekStart = shiftDateKey(key, -3);
    renderEventCal();   // the period moved, so the grid has to be redrawn first
    showDay(key);
  }

  /* one fold under the day row, reused by timeline events */
  function openEventFold(event) {
    const host = document.getElementById("eventFold");
    const key = "event:" + event.id;
    if (host.dataset.object === key && openHost) { closeDetail(); return; }
    closeDetail();
    host.innerHTML = "";
    host.dataset.object = key;
    const fold = createUnfold();
    host.appendChild(fold);
    openEventDetail(event, fold.firstChild);
  }

  function openTaskFold(task) {
    const host = document.getElementById("eventFold");
    const key = "task:" + task.id;
    if (host.dataset.object === key && openHost) { closeDetail(); return; }
    closeDetail();
    host.innerHTML = "";
    host.dataset.object = key;
    const fold = createUnfold();
    host.appendChild(fold);
    openDetail("tasks", task.id, fold.firstChild);
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

  /* THINKING SPACE — typed blocks and canvases on one large surface. */
  const thinkingView = document.getElementById("thinkingView");
  const thinkingBoard = document.getElementById("thinkingBoard");
  const thinkingName = document.getElementById("thinkingName");
  const thinkingSaved = document.getElementById("thinkingSaved");
  const thinkingViewport = document.getElementById("thinkingViewport");
  const thinkingPlane = document.getElementById("thinkingPlane");
  const thinkingBlocks = document.getElementById("thinkingBlocks");
  const thinkingLinks = document.getElementById("thinkingLinks");
  const thinkingBlank = document.getElementById("thinkingBlank");
  const thinkingLinkHint = document.getElementById("thinkingLinkHint");
  const thinkingTrash = document.getElementById("thinkingTrash");
  const THINKING_BLOCK_TYPES = ["problem", "solution", "example", "idea", "question", "answer", "note"];
  const THINKING_WORLD_WIDTH = 20000;
  const THINKING_WORLD_HEIGHT = 12000;
  const THINKING_WORLD_X = 9000;
  const THINKING_WORLD_Y = 5000;
  let openCanvasId = null;
  let thinkingLinkFrom = null;
  let thinkingCounter = 0;
  let thinkingLinkFrame = null;
  let thinkingCameraTimer = null;
  let thinkingRecentering = false;
  let viewedCanvasId = null;
  let thinkingSuppressedTool = null;
  let thinkingCanvasAnimationTimer = null;
  let thinkingTrashTimer = null;
  const thinkingCanvasFoldLocks = {};

  function thinkingId(prefix) {
    thinkingCounter++;
    return prefix + Date.now().toString(36) + thinkingCounter.toString(36);
  }

  function findCanvas(id) {
    for (let i = 0; i < state.canvases.length; i++) {
      if (state.canvases[i].id === id) return state.canvases[i];
    }
    return null;
  }

  function currentCanvas() {
    return openCanvasId ? findCanvas(openCanvasId) : null;
  }

  function currentThinkingCanvasNode() {
    const tree = currentCanvas();
    return tree && viewedCanvasId ? findThinkingParent(tree, viewedCanvasId) : null;
  }

  function prepareThinkingWorld(tree, canvasNode) {
    if (canvasNode.cameraX != null && canvasNode.cameraY != null) return;
    canvasNode.cameraX = THINKING_WORLD_X;
    canvasNode.cameraY = THINKING_WORLD_Y;
    for (let i = 0; i < tree.blocks.length; i++) {
      if (tree.blocks[i].parentId !== canvasNode.id) continue;
      tree.blocks[i].x += THINKING_WORLD_X;
      tree.blocks[i].y += THINKING_WORLD_Y;
    }
    saveState();
  }

  function findThinkingParent(canvas, id) {
    if (canvas.id === id) return canvas;
    for (let i = 0; i < canvas.blocks.length; i++) {
      if (canvas.blocks[i].id === id) return canvas.blocks[i];
    }
    return null;
  }

  function touchCanvas(canvas) {
    canvas.updatedAt = Date.now();
    saveState();
    thinkingSaved.textContent = translate("thinkingSaved");
  }

  function thinkingTypeKey(type) {
    return "block" + type.charAt(0).toUpperCase() + type.slice(1);
  }

  function thinkingPlaceholderKey(type) {
    return "blockPlaceholder" + type.charAt(0).toUpperCase() + type.slice(1);
  }

  function thinkingTypeIcon(type) {
    if (type === "problem" || type === "canvas") return "target";
    if (type === "solution" || type === "answer") return "bulb";
    if (type === "example") return "flag";
    if (type === "question") return "compass";
    if (type === "idea") return "spark";
    return "spark";
  }

  function thinkingIconSvg(name) {
    let paths = "";
    if (name === "target") {
      paths = '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'
        + '<path d="m15 9 5-5M16 4h4v4"/>';
    } else if (name === "spark") {
      paths = '<path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6Z"/>'
        + '<path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6Z"/>';
    } else if (name === "bulb") {
      paths = '<path d="M9 18h6M10 21h4M8.5 15.5C7 14.3 6 12.5 6 10.5a6 6 0 1 1 12 0c0 2-1 3.8-2.5 5-.6.5-.8 1-.8 1.5H9.3c0-.5-.2-1-.8-1.5Z"/>';
    } else if (name === "flag") {
      paths = '<path d="M6 21V4m0 1h11l-2 3 2 3H6"/>';
    } else if (name === "compass") {
      paths = '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>';
    } else {
      paths = '<path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z"/>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }

  function openThinking() {
    thinkingLinkFrom = null;
    thinkingView.hidden = false;
    // the board stands on the app's own ground: the very same field canvas moves
    // in for as long as the view is up, rather than a second one being painted
    thinkingView.insertBefore(fieldCanvas, thinkingView.firstChild);
    requestAnimationFrame(function () { thinkingView.classList.add("is-open"); });
    let recentCanvas = null;
    for (let i = 0; i < state.canvases.length; i++) {
      const opened = state.canvases[i].lastOpenedAt || state.canvases[i].updatedAt || 0;
      const recentOpened = recentCanvas
        ? recentCanvas.lastOpenedAt || recentCanvas.updatedAt || 0 : 0;
      if (!recentCanvas || opened > recentOpened) {
        recentCanvas = state.canvases[i];
      }
    }
    if (recentCanvas) openThinkingCanvas(recentCanvas.id);
    else makeThinkingCanvas();
  }

  function closeThinking() {
    hideThinkingTrash();
    thinkingView.classList.remove("is-open");
    openCanvasId = null;
    viewedCanvasId = null;
    thinkingLinkFrom = null;
    setTimeout(function () {
      thinkingView.hidden = true;
      document.body.insertBefore(fieldCanvas, document.getElementById("decor"));
    }, 280);
  }

  function makeThinkingCanvas() {
    const now = Date.now();
    const canvas = {
      id: thinkingId("c"),
      type: "canvas",
      thinkingTreeVersion: 5,
      parentId: null,
      title: "",
      text: "",
      x: 0,
      y: 0,
      icon: "target",
      canvasWidth: 650,
      canvasHeight: 330,
      cameraX: THINKING_WORLD_X,
      cameraY: THINKING_WORLD_Y,
      collapsed: false,
      createdAt: now,
      updatedAt: now,
      blocks: [],
      links: []
    };
    state.canvases.unshift(canvas);
    saveState();
    openThinkingCanvas(canvas.id);
  }

  function openThinkingCanvas(id) {
    const canvas = findCanvas(id);
    if (!canvas) return;
    if (!canvas.blocks) canvas.blocks = [];
    if (!canvas.links) canvas.links = [];
    prepareThinkingWorld(canvas, canvas);
    openCanvasId = id;
    viewedCanvasId = id;
    canvas.lastOpenedAt = Date.now();
    saveState();
    thinkingLinkFrom = null;
    syncThinkingCanvasHeader(canvas, canvas);
    renderThinkingCanvas(canvas);
    requestAnimationFrame(function () {
      thinkingViewport.scrollLeft = canvas.cameraX;
      thinkingViewport.scrollTop = canvas.cameraY;
    });
  }

  function thinkingCanvasParent(tree, canvasNode) {
    let branch = canvasNode;
    while (branch && branch.parentId) {
      branch = findThinkingParent(tree, branch.parentId);
      if (branch && branch.type === "canvas") return branch;
    }
    return null;
  }

  function syncThinkingCanvasHeader(tree, canvasNode) {
    const parent = thinkingCanvasParent(tree, canvasNode);
    thinkingName.disabled = !parent;
    thinkingName.value = parent ? canvasNode.title || "" : "";
    const back = document.getElementById("thinkingBoardBack");
    back.disabled = !parent;
    back.setAttribute("aria-label", translate(parent ? "thinkingCloseCanvas" : "thinkingBaseCanvas"));
    thinkingName.placeholder = translate(parent ? "thinkingUntitled" : "thinkingBaseCanvas");
  }

  function thinkingCanvasTransition(kind, origin, targetId) {
    clearTimeout(thinkingCanvasAnimationTimer);
    thinkingViewport.classList.remove("is-canvas-opening", "is-canvas-closing");
    requestAnimationFrame(function () {
      let point = origin;
      if (!point && targetId) {
        const target = thinkingBlocks.querySelector('[data-block-id="' + targetId + '"]');
        if (target) {
          const rect = target.getBoundingClientRect();
          point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
      }
      const viewportRect = thinkingViewport.getBoundingClientRect();
      thinkingViewport.style.setProperty("--thinking-transition-x",
        ((point ? point.x : viewportRect.left + viewportRect.width / 2) - viewportRect.left) + "px");
      thinkingViewport.style.setProperty("--thinking-transition-y",
        ((point ? point.y : viewportRect.top + viewportRect.height / 2) - viewportRect.top) + "px");
      void thinkingViewport.offsetWidth;
      thinkingViewport.classList.add(kind === "open" ? "is-canvas-opening" : "is-canvas-closing");
      thinkingCanvasAnimationTimer = setTimeout(function () {
        thinkingViewport.classList.remove("is-canvas-opening", "is-canvas-closing");
      }, 460);
    });
  }

  function syncThinkingCanvasPreview(canvasNode) {
    const width = Math.max(220, (canvasNode.canvasWidth || 650) - 20);
    const height = canvasNode.canvasHeight || 330;
    canvasNode.previewX = canvasNode.cameraX + thinkingViewport.clientWidth / 2 - width / 2;
    canvasNode.previewY = canvasNode.cameraY + thinkingViewport.clientHeight / 2 - height / 2;
  }

  function navigateThinkingCanvas(id, transition) {
    const tree = currentCanvas();
    const canvasNode = tree ? findThinkingParent(tree, id) : null;
    if (!tree || !canvasNode || canvasNode.type !== "canvas") return;
    const current = currentThinkingCanvasNode();
    if (current) {
      current.cameraX = thinkingViewport.scrollLeft;
      current.cameraY = thinkingViewport.scrollTop;
      syncThinkingCanvasPreview(current);
    }
    prepareThinkingWorld(tree, canvasNode);
    viewedCanvasId = canvasNode.id;
    canvasNode.lastOpenedAt = Date.now();
    thinkingLinkFrom = null;
    syncThinkingCanvasHeader(tree, canvasNode);
    touchCanvas(tree);
    renderThinkingCanvas(tree);
    requestAnimationFrame(function () {
      thinkingViewport.scrollLeft = canvasNode.cameraX;
      thinkingViewport.scrollTop = canvasNode.cameraY;
      if (transition) {
        thinkingCanvasTransition(transition.kind, transition.origin, transition.targetId);
      }
    });
  }

  function closeCurrentThinkingCanvas() {
    const tree = currentCanvas();
    const canvasNode = currentThinkingCanvasNode();
    if (!tree || !canvasNode) return;
    const parent = thinkingCanvasParent(tree, canvasNode);
    if (!parent) return;
    canvasNode.collapsed = true;
    navigateThinkingCanvas(parent.id, { kind: "close", targetId: canvasNode.id });
  }

  function renderThinkingCanvas(canvas) {
    const viewedCanvas = currentThinkingCanvasNode() || canvas;
    syncThinkingCanvasHeader(canvas, viewedCanvas);
    thinkingBlocks.innerHTML = "";
    let visibleCount = 0;
    for (let i = 0; i < canvas.blocks.length; i++) {
      if (canvas.blocks[i].parentId === viewedCanvas.id) {
        thinkingBlocks.appendChild(createThinkingBlock(canvas, canvas.blocks[i], false, false,
          viewedCanvas));
        visibleCount++;
      }
    }
    thinkingBlank.hidden = visibleCount !== 0;
    thinkingBlank.style.left = (viewedCanvas.cameraX + thinkingViewport.clientWidth / 2) + "px";
    thinkingBlank.style.top = (viewedCanvas.cameraY + thinkingViewport.clientHeight * .38) + "px";
    syncThinkingLinkMode();
    requestThinkingLinks(canvas);
  }

  function fitThinkingText(textarea, minimum) {
    textarea.style.height = "auto";
    textarea.style.height = Math.max(minimum || 72, textarea.scrollHeight) + "px";
  }

  function connectionCount(canvas, id) {
    let count = 0;
    for (let i = 0; i < canvas.links.length; i++) {
      if (canvas.links[i].from === id || canvas.links[i].to === id) count++;
    }
    return count;
  }

  function applyThinkingListSyntax(textarea) {
    const before = textarea.value;
    const after = before.replace(/(^|\n)(\s*)[-*]\s/g, "$1$2• ");
    if (after === before) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = after;
    textarea.setSelectionRange(start, end);
  }

  function armThinkingLists(textarea) {
    textarea.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      const start = textarea.selectionStart;
      const lineStart = textarea.value.lastIndexOf("\n", start - 1) + 1;
      const line = textarea.value.slice(lineStart, start);
      const item = line.match(/^(\s*)•\s(.*)$/);
      if (!item) return;
      event.preventDefault();
      if (!item[2].trim()) {
        textarea.setRangeText("", lineStart, start, "end");
      } else {
        textarea.setRangeText("\n" + item[1] + "• ", start, textarea.selectionEnd, "end");
      }
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function releaseThinkingChildren(canvas, parent) {
    let released = 0;
    for (let i = 0; i < canvas.blocks.length; i++) {
      const child = canvas.blocks[i];
      if (child.parentId !== parent.id) continue;
      child.parentId = parent.parentId;
      child.x = Math.min(THINKING_WORLD_WIDTH - 300, parent.x + 28 + released * 24);
      child.y = Math.min(THINKING_WORLD_HEIGHT - 220, parent.y + 180 + released * 32);
      released++;
    }
  }

  function armThinkingCanvasResize(handle, card, canvasStage, block, canvas) {
    handle.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      const start = { x: event.clientX, y: event.clientY,
        width: card.offsetWidth, height: canvasStage.offsetHeight };
      card.classList.add("is-resizing");
      const move = function (moveEvent) {
        block.canvasWidth = Math.max(360, start.width + moveEvent.clientX - start.x);
        block.canvasHeight = Math.max(220, start.height + moveEvent.clientY - start.y);
        card.style.width = block.canvasWidth + "px";
        canvasStage.style.height = block.canvasHeight + "px";
        requestThinkingLinks(canvas);
      };
      const up = function () {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        card.classList.remove("is-resizing");
        alignThinkingCameraWithPreview(block);
        growThinkingCanvasForBlock(canvas, block, block.canvasWidth, block.canvasHeight + 110);
        touchCanvas(canvas);
        renderThinkingCanvas(canvas);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }

  function armThinkingBlockResize(handle, card, block, canvas) {
    handle.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      const pointerId = event.pointerId;
      const start = { x: event.clientX, y: event.clientY,
        width: card.offsetWidth, height: card.offsetHeight };
      const minimumWidth = block.type === "text" ? 110 : 140;
      const minimumHeight = block.type === "question" ? 84 : block.type === "text" ? 52 : 60;
      let moved = false;
      card.classList.add("is-resizing");
      const move = function (moveEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        moveEvent.preventDefault();
        const dx = moveEvent.clientX - start.x;
        const dy = moveEvent.clientY - start.y;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        moved = true;
        if (Math.abs(dx) >= 2) {
          block.blockWidth = Math.max(minimumWidth, Math.round(start.width + dx));
          card.style.width = block.blockWidth + "px";
        }
        if (Math.abs(dy) >= 2) {
          block.blockHeight = Math.max(minimumHeight, Math.round(start.height + dy));
          card.style.height = block.blockHeight + "px";
          card.classList.add("is-manually-sized");
        }
        growThinkingCanvasForBlock(canvas, block, card.offsetWidth, card.offsetHeight);
        requestThinkingLinks(canvas);
      };
      const up = function (upEvent) {
        if (upEvent.pointerId !== pointerId) return;
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        card.classList.remove("is-resizing");
        if (!moved) return;
        touchCanvas(canvas);
        renderThinkingCanvas(canvas);
      };
      handle.addEventListener("pointermove", move, { passive: false });
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }

  function thinkingCanvasPreviewOrigin(canvasNode, width, height) {
    const previewWidth = width || Math.max(220, (canvasNode.canvasWidth || 650) - 20);
    const previewHeight = height || canvasNode.canvasHeight || 330;
    if (canvasNode.previewX == null) {
      canvasNode.previewX = canvasNode.cameraX
        + thinkingViewport.clientWidth / 2 - previewWidth / 2;
    }
    if (canvasNode.previewY == null) {
      canvasNode.previewY = canvasNode.cameraY
        + thinkingViewport.clientHeight / 2 - previewHeight / 2;
    }
    return {
      x: canvasNode.previewX,
      y: canvasNode.previewY
    };
  }

  function thinkingBlockNaturalWidth(block) {
    if (block.type === "canvas") return block.canvasWidth || 650;
    if (block.blockWidth) return block.blockWidth;
    const lines = (block.text || "").split("\n");
    let longestLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > longestLine) longestLine = lines[i].length;
    }
    const minimum = block.type === "question" ? 176 : block.type === "text" ? 150 : 160;
    return Math.max(minimum, Math.min(440, Math.round(34 + longestLine * 7.2)));
  }

  function thinkingBlockSize(block, width, height) {
    if (width && height) return { width: width, height: height };
    if (block.type === "canvas") {
      return {
        width: block.collapsed ? 310 : block.canvasWidth || 650,
        height: block.collapsed ? 96 : (block.canvasHeight || 330) + 110
      };
    }
    if (block.type === "text") return { width: thinkingBlockNaturalWidth(block),
      height: block.blockHeight || 56 };
    return { width: thinkingBlockNaturalWidth(block),
      height: block.blockHeight || (block.type === "question" ? 90 : 64) };
  }

  function alignThinkingCameraWithPreview(canvasNode) {
    if (canvasNode.previewX == null || canvasNode.previewY == null) return;
    const width = Math.max(220, (canvasNode.canvasWidth || 650) - 20);
    const height = canvasNode.canvasHeight || 330;
    canvasNode.cameraX = canvasNode.previewX + width / 2 - thinkingViewport.clientWidth / 2;
    canvasNode.cameraY = canvasNode.previewY + height / 2 - thinkingViewport.clientHeight / 2;
  }

  function positionThinkingCanvasChildren(stage, tree, canvasNode) {
    const origin = thinkingCanvasPreviewOrigin(canvasNode, stage.clientWidth, stage.clientHeight);
    stage.style.backgroundPosition = (-origin.x % 20) + "px " + (-origin.y % 20) + "px";
    for (let i = 0; i < stage.children.length; i++) {
      const childElement = stage.children[i];
      if (!childElement.dataset || !childElement.dataset.blockId) continue;
      const child = findThinkingParent(tree, childElement.dataset.blockId);
      if (!child || child.parentId !== canvasNode.id) continue;
      childElement.style.left = child.x - origin.x + "px";
      childElement.style.top = child.y - origin.y + "px";
    }
  }

  function armThinkingCanvasPan(stage, card, canvasNode, tree) {
    stage.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      const pointedBlock = event.target.closest(".thinking-block");
      if ((pointedBlock && pointedBlock !== card)
          || event.target.closest("button, input, textarea, select")) return;
      event.stopPropagation();
      stage.setPointerCapture(event.pointerId);
      thinkingCanvasPreviewOrigin(canvasNode, stage.clientWidth, stage.clientHeight);
      const pointerId = event.pointerId;
      const start = { x: event.clientX, y: event.clientY,
        previewX: canvasNode.previewX, previewY: canvasNode.previewY };
      const last = { x: event.clientX, y: event.clientY };
      let moved = false;
      stage.classList.add("is-panning");
      const move = function (moveEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        if (!moved && Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) < 4) return;
        moveEvent.preventDefault();
        moved = true;
        card.dataset.panned = "true";
        canvasNode.previewX -= moveEvent.clientX - last.x;
        canvasNode.previewY -= moveEvent.clientY - last.y;
        last.x = moveEvent.clientX;
        last.y = moveEvent.clientY;
        alignThinkingCameraWithPreview(canvasNode);
        positionThinkingCanvasChildren(stage, tree, canvasNode);
        requestThinkingLinks(tree);
      };
      const up = function (upEvent) {
        if (upEvent.pointerId !== pointerId) return;
        stage.removeEventListener("pointermove", move);
        stage.removeEventListener("pointerup", up);
        stage.removeEventListener("pointercancel", up);
        stage.classList.remove("is-panning");
        if (upEvent.type === "pointercancel") {
          canvasNode.previewX = start.previewX;
          canvasNode.previewY = start.previewY;
          alignThinkingCameraWithPreview(canvasNode);
          positionThinkingCanvasChildren(stage, tree, canvasNode);
          requestThinkingLinks(tree);
        } else if (moved) {
          touchCanvas(tree);
        }
        if (moved) setTimeout(function () { delete card.dataset.panned; }, 320);
      };
      stage.addEventListener("pointermove", move, { passive: false });
      stage.addEventListener("pointerup", up);
      stage.addEventListener("pointercancel", up);
    });
  }

  function growThinkingCanvasForBlock(tree, block, width, height) {
    const parent = findThinkingParent(tree, block.parentId);
    if (!parent || parent.type !== "canvas") return;
    const size = thinkingBlockSize(block, width, height);
    const origin = thinkingCanvasPreviewOrigin(parent);
    const padding = 18;
    let localX = block.x - origin.x;
    let localY = block.y - origin.y;
    let stageWidth = Math.max(220, (parent.canvasWidth || 650) - 20);
    let stageHeight = parent.canvasHeight || 330;

    if (localX < padding) {
      const extra = padding - localX;
      parent.previewX -= extra;
      stageWidth += extra;
      localX = padding;
    }
    if (localY < padding) {
      const extra = padding - localY;
      parent.previewY -= extra;
      stageHeight += extra;
      localY = padding;
    }
    stageWidth = Math.max(stageWidth, localX + size.width + padding);
    stageHeight = Math.max(stageHeight, localY + size.height + padding);
    parent.canvasWidth = stageWidth + 20;
    parent.canvasHeight = stageHeight;
    if (parent.id !== viewedCanvasId) alignThinkingCameraWithPreview(parent);

    if (parent.parentId) {
      growThinkingCanvasForBlock(tree, parent, parent.canvasWidth, parent.canvasHeight + 110);
    }
  }

  function toggleThinkingCanvas(block, canvas) {
    if (thinkingCanvasFoldLocks[block.id]) return;
    thinkingCanvasFoldLocks[block.id] = true;
    setTimeout(function () { delete thinkingCanvasFoldLocks[block.id]; }, 280);
    block.collapsed = !block.collapsed;
    if (!block.collapsed) {
      growThinkingCanvasForBlock(canvas, block, block.canvasWidth, block.canvasHeight + 110);
    }
    touchCanvas(canvas);
    renderThinkingCanvas(canvas);
  }

  function armThinkingCanvasClicks(card, head, block, canvas) {
    let clickTimer = null;
    const hitsCanvasSurface = function (event) {
      if (card.dataset.dragged || card.dataset.panned) return false;
      if (event.target.closest("button, input, textarea, select")) return false;
      return event.target.closest(".thinking-block") === card;
    };
    head.addEventListener("pointerdown", function () { clearTimeout(clickTimer); });
    head.addEventListener("click", function (event) {
      if (!hitsCanvasSurface(event)) return;
      if (event.detail > 1) {
        clearTimeout(clickTimer);
        return;
      }
      clickTimer = setTimeout(function () {
        toggleThinkingCanvas(block, canvas);
      }, 230);
    });
    card.addEventListener("dblclick", function (event) {
      if (!hitsCanvasSurface(event)) return;
      event.stopPropagation();
      clearTimeout(clickTimer);
      const rect = card.getBoundingClientRect();
      navigateThinkingCanvas(block.id, { kind: "open",
        origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } });
    });
  }

  function createThinkingBlock(canvas, block, nested, insideCanvas, ownerCanvas) {
    const card = document.createElement("article");
    const contained = nested && !insideCanvas;
    card.className = "thinking-block thinking-block--" + block.type;
    if (nested) card.classList.add("thinking-block--nested");
    if (insideCanvas) card.classList.add("thinking-block--canvas-child");
    if (block.type === "canvas") {
      card.classList.toggle("is-collapsed", !!block.collapsed);
    }
    card.dataset.blockId = block.id;
    if (block.type === "canvas" && block.canvasWidth) {
      card.style.width = block.canvasWidth + "px";
    } else if (block.blockWidth && !contained) {
      card.style.width = block.blockWidth + "px";
    } else if (!nested || insideCanvas) {
      card.style.width = thinkingBlockNaturalWidth(block) + "px";
    }
    if (block.type !== "canvas" && block.blockHeight && !contained) {
      card.style.height = block.blockHeight + "px";
      card.classList.add("is-manually-sized");
    }
    if (!nested || insideCanvas) {
      const preview = insideCanvas ? thinkingCanvasPreviewOrigin(ownerCanvas) : null;
      card.style.left = (insideCanvas ? block.x - preview.x : block.x) + "px";
      card.style.top = (insideCanvas ? block.y - preview.y : block.y) + "px";
    }

    const head = document.createElement("div");
    head.className = "thinking-block__head";

    const icon = document.createElement(block.type === "canvas" ? "span" : "button");
    if (block.type !== "canvas") icon.type = "button";
    icon.className = "thinking-block__icon";
    icon.innerHTML = thinkingIconSvg(thinkingTypeIcon(block.type));
    if (THINKING_BLOCK_TYPES.indexOf(block.type) !== -1) {
      icon.setAttribute("aria-label", translate("thinkingChangeType"));
      icon.addEventListener("click", function () {
        const current = THINKING_BLOCK_TYPES.indexOf(block.type);
        block.type = THINKING_BLOCK_TYPES[(current + 1) % THINKING_BLOCK_TYPES.length];
        touchCanvas(canvas);
        renderThinkingCanvas(canvas);
      });
    }

    const type = document.createElement("span");
    type.className = "thinking-block__type";
    type.textContent = translate(thinkingTypeKey(block.type));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "thinking-block__delete";
    del.setAttribute("aria-label", translate("deleteAria"));
    del.textContent = "×";
    del.addEventListener("click", function () { removeThinkingBlock(canvas, block.id); });
    if (block.type !== "text") head.append(icon, type);
    head.appendChild(del);
    armThinkingDrag(head, card, block, canvas, nested, insideCanvas);

    let text = null;
    let children = null;
    let canvasHead = null;
    let canvasStage = null;
    if (block.type === "canvas") {
      canvasHead = document.createElement("div");
      canvasHead.className = "thinking-canvas__head";
      const canvasLabel = document.createElement("span");
      canvasLabel.className = "thinking-canvas__label";
      canvasLabel.textContent = translate("blockCanvas");
      const canvasTitle = document.createElement("input");
      canvasTitle.type = "text";
      canvasTitle.className = "thinking-canvas__title";
      canvasTitle.maxLength = 120;
      canvasTitle.value = block.title || "";
      canvasTitle.placeholder = translate("thinkingNewCanvas");
      canvasTitle.setAttribute("aria-label", translate("thinkingUntitled"));
      canvasTitle.addEventListener("input", function () {
        block.title = canvasTitle.value;
        touchCanvas(canvas);
      });
      canvasHead.append(canvasLabel, canvasTitle);

      canvasStage = document.createElement("div");
      canvasStage.className = "thinking-canvas__stage";
      if (block.canvasHeight) canvasStage.style.height = block.canvasHeight + "px";
      let canvasChildCount = 0;
      for (let i = 0; i < canvas.blocks.length; i++) {
        if (canvas.blocks[i].parentId === block.id) {
          canvasStage.appendChild(createThinkingBlock(canvas, canvas.blocks[i], true, true, block));
          canvasChildCount++;
        }
      }
      if (!canvasChildCount) {
        const empty = document.createElement("p");
        empty.className = "thinking-canvas__empty";
        empty.textContent = translate("thinkingCanvasEmpty");
        canvasStage.appendChild(empty);
      }
      const resize = document.createElement("button");
      resize.type = "button";
      resize.className = "thinking-canvas__resize";
      resize.setAttribute("aria-label", translate("thinkingResizeCanvas"));
      armThinkingCanvasResize(resize, card, canvasStage, block, canvas);
      canvasStage.appendChild(resize);
      armThinkingCanvasPan(canvasStage, card, block, canvas);
      positionThinkingCanvasChildren(canvasStage, canvas, block);
    } else {
      text = document.createElement("textarea");
      text.className = "thinking-block__text";
      text.value = block.text || "";
      text.placeholder = translate(thinkingPlaceholderKey(block.type));
      armThinkingLists(text);
      text.addEventListener("input", function () {
        applyThinkingListSyntax(text);
        block.text = text.value;
        if (!block.blockHeight || contained) {
          fitThinkingText(text, block.type === "text" ? 32 : nested ? 32 : 36);
        }
        if (!nested || insideCanvas) {
          const naturalWidth = thinkingBlockNaturalWidth(block);
          card.style.width = naturalWidth + "px";
          growThinkingCanvasForBlock(canvas, block, naturalWidth, card.offsetHeight);
        }
        touchCanvas(canvas);
        requestThinkingLinks(canvas);
      });

      children = document.createElement("div");
      children.className = "thinking-block__children";
      for (let i = 0; i < canvas.blocks.length; i++) {
        if (canvas.blocks[i].parentId === block.id) {
          children.appendChild(createThinkingBlock(canvas, canvas.blocks[i], true, false, ownerCanvas));
        }
      }
    }

    const foot = document.createElement("div");
    foot.className = "thinking-block__foot";
    const count = document.createElement("span");
    count.className = "thinking-block__connections";
    const linked = connectionCount(canvas, block.id);
    count.textContent = linked ? linked + " "
      + translate(linked === 1 ? "thinkingConnectionOne" : "thinkingConnectionMany") : "";

    const actions = document.createElement("span");
    actions.className = "thinking-block__actions";
    if (block.type === "question") {
      const addAnswer = document.createElement("button");
      addAnswer.type = "button";
      addAnswer.className = "thinking-block__add-answer";
      addAnswer.textContent = "+ " + translate("thinkingQuestionAddAnswer");
      addAnswer.addEventListener("click", function () { addThinkingAnswer(canvas, block); });
      actions.appendChild(addAnswer);
    }
    if (block.type === "canvas") {
      const fold = document.createElement("button");
      fold.type = "button";
      fold.className = "thinking-block__canvas-action";
      fold.dataset.canvasFold = "true";
      fold.setAttribute("aria-label", translate(block.collapsed
        ? "thinkingExpandCanvas" : "thinkingCollapseCanvas"));
      fold.setAttribute("aria-expanded", block.collapsed ? "false" : "true");
      fold.innerHTML = block.collapsed
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 9 5 5 5-5"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 15 5-5 5 5"/></svg>';
      fold.addEventListener("click", function () {
        toggleThinkingCanvas(block, canvas);
      });

      const fullscreen = document.createElement("button");
      fullscreen.type = "button";
      fullscreen.className = "thinking-block__canvas-action";
      fullscreen.setAttribute("aria-label", translate("thinkingOpenCanvasFullscreen"));
      fullscreen.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg>';
      fullscreen.addEventListener("click", function () {
        const rect = card.getBoundingClientRect();
        navigateThinkingCanvas(block.id, { kind: "open",
          origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } });
      });
      actions.append(fold, fullscreen);
    }

    foot.append(count, actions);

    const linkPoint = document.createElement("button");
    linkPoint.type = "button";
    linkPoint.className = "thinking-block__link-point";
    linkPoint.dataset.blockId = block.id;
    linkPoint.setAttribute("aria-label", translate("thinkingLink"));
    armThinkingLinkPoint(linkPoint, block, canvas);

    let blockResize = null;
    if (block.type !== "canvas" && !contained) {
      blockResize = document.createElement("button");
      blockResize.type = "button";
      blockResize.className = "thinking-block__resize";
      blockResize.setAttribute("aria-label", translate("thinkingResizeBlock"));
      armThinkingBlockResize(blockResize, card, block, canvas);
    }

    card.appendChild(head);
    if (block.type === "canvas") {
      card.append(canvasHead, canvasStage);
    } else {
      card.appendChild(text);
      if (children.childElementCount) card.appendChild(children);
    }
    if (linked || actions.childElementCount) card.appendChild(foot);
    if (blockResize) card.appendChild(blockResize);
    card.appendChild(linkPoint);
    if (text && (!block.blockHeight || contained)) requestAnimationFrame(function () {
      fitThinkingText(text, block.type === "text" ? 32 : nested ? 32 : 36);
    });
    if (block.type === "canvas") armThinkingCanvasClicks(card, head, block, canvas);
    return card;
  }

  function removeThinkingBlock(canvas, id) {
    const removed = findThinkingParent(canvas, id);
    if (!removed) return;
    const removedIds = {};
    const removedBlocks = [];
    const removedLinks = [];
    const releasedChildren = [];
    removedIds[id] = true;
    if (removed.type === "canvas") {
      let foundChild = true;
      while (foundChild) {
        foundChild = false;
        for (let i = 0; i < canvas.blocks.length; i++) {
          const block = canvas.blocks[i];
          if (!removedIds[block.id] && removedIds[block.parentId]) {
            removedIds[block.id] = true;
            foundChild = true;
          }
        }
      }
    } else {
      for (let i = 0; i < canvas.blocks.length; i++) {
        const child = canvas.blocks[i];
        if (child.parentId === removed.id) {
          releasedChildren.push({ block: child, parentId: child.parentId,
            x: child.x, y: child.y });
        }
      }
      releaseThinkingChildren(canvas, removed);
    }
    for (let i = 0; i < canvas.blocks.length; i++) {
      if (removedIds[canvas.blocks[i].id]) {
        removedBlocks.push({ index: i, block: canvas.blocks[i] });
      }
    }
    for (let i = 0; i < canvas.links.length; i++) {
      if (removedIds[canvas.links[i].from] || removedIds[canvas.links[i].to]) {
        removedLinks.push({ index: i, link: canvas.links[i] });
      }
    }
    for (let i = canvas.blocks.length - 1; i >= 0; i--) {
      if (removedIds[canvas.blocks[i].id]) canvas.blocks.splice(i, 1);
    }
    for (let i = canvas.links.length - 1; i >= 0; i--) {
      if (removedIds[canvas.links[i].from] || removedIds[canvas.links[i].to]) {
        canvas.links.splice(i, 1);
      }
    }
    if (removedIds[thinkingLinkFrom]) thinkingLinkFrom = null;
    touchCanvas(canvas);
    renderThinkingCanvas(canvas);
    showToast(translate("undoDeleted"), translate("undoBtn"), function () {
      for (let i = 0; i < removedBlocks.length; i++) {
        const item = removedBlocks[i];
        canvas.blocks.splice(Math.min(item.index, canvas.blocks.length), 0, item.block);
      }
      for (let i = 0; i < releasedChildren.length; i++) {
        const child = releasedChildren[i];
        if (canvas.blocks.indexOf(child.block) === -1) continue;
        child.block.parentId = child.parentId;
        child.block.x = child.x;
        child.block.y = child.y;
      }
      for (let i = 0; i < removedLinks.length; i++) {
        const item = removedLinks[i];
        canvas.links.splice(Math.min(item.index, canvas.links.length), 0, item.link);
      }
      touchCanvas(canvas);
      if (openCanvasId === canvas.id) renderThinkingCanvas(canvas);
    });
  }

  function removeThinkingLink(canvas, id) {
    let index = -1;
    let removed = null;
    for (let i = 0; i < canvas.links.length; i++) {
      if (canvas.links[i].id === id) {
        index = i;
        removed = canvas.links[i];
        break;
      }
    }
    if (!removed) return;
    canvas.links.splice(index, 1);
    touchCanvas(canvas);
    renderThinkingCanvas(canvas);
    showToast(translate("undoDeleted"), translate("undoBtn"), function () {
      canvas.links.splice(Math.min(index, canvas.links.length), 0, removed);
      touchCanvas(canvas);
      if (openCanvasId === canvas.id) renderThinkingCanvas(canvas);
    });
  }

  function showThinkingTrash() {
    clearTimeout(thinkingTrashTimer);
    thinkingTrash.hidden = false;
    thinkingTrash.setAttribute("aria-hidden", "false");
    requestAnimationFrame(function () { thinkingTrash.classList.add("is-visible"); });
  }

  function hideThinkingTrash() {
    clearTimeout(thinkingTrashTimer);
    thinkingTrash.classList.remove("is-visible", "is-active");
    thinkingTrash.setAttribute("aria-hidden", "true");
    thinkingTrashTimer = setTimeout(function () { thinkingTrash.hidden = true; }, 180);
  }

  function pointInsideThinkingTrash(x, y) {
    if (thinkingTrash.hidden) return false;
    const rect = thinkingTrash.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function clearThinkingDropTargets() {
    const targets = thinkingBlocks.querySelectorAll(".is-drop-target");
    for (let i = 0; i < targets.length; i++) targets[i].classList.remove("is-drop-target");
  }

  function markThinkingCombineOptions(canvas, block, on) {
    const cards = thinkingBlocks.querySelectorAll(".thinking-block");
    for (let i = 0; i < cards.length; i++) {
      const candidate = findThinkingParent(canvas, cards[i].dataset.blockId);
      cards[i].classList.toggle("is-drop-option", on
        && canCombineThinkingBlocks(canvas, block, candidate));
    }
  }

  function canCombineThinkingBlocks(canvas, child, possibleParent) {
    if (!possibleParent || possibleParent.id === child.id) return false;
    if (child.type === "canvas" && possibleParent.type !== "canvas") return false;
    if (possibleParent.type === "canvas" && possibleParent.collapsed) return false;
    let branch = possibleParent;
    while (branch) {
      if (branch.id === child.id) return false;
      branch = branch.parentId ? findThinkingParent(canvas, branch.parentId) : null;
    }
    return true;
  }

  function thinkingCanvasDropParent(clientX, clientY, draggedElement, block, canvas) {
    const stages = thinkingBlocks.querySelectorAll(".thinking-canvas__stage");
    let chosen = null;
    let chosenArea = Infinity;
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      if (draggedElement && draggedElement.contains(stage)) continue;
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height || clientX < rect.left || clientX > rect.right
          || clientY < rect.top || clientY > rect.bottom) continue;
      const card = stage.closest(".thinking-block--canvas");
      const parent = card ? findThinkingParent(canvas, card.dataset.blockId) : null;
      if (!canCombineThinkingBlocks(canvas, block, parent)) continue;
      const area = rect.width * rect.height;
      if (!chosen || chosen.contains(stage) || area < chosenArea) {
        chosen = stage;
        chosenArea = area;
      }
    }
    return chosen ? chosen.closest(".thinking-block--canvas") : null;
  }

  function thinkingDropParent(clientX, clientY, card, block, canvas) {
    const underPointer = document.elementsFromPoint(clientX, clientY);
    for (let i = 0; i < underPointer.length; i++) {
      if (card.contains(underPointer[i])) continue;
      const target = underPointer[i].closest
        ? underPointer[i].closest(".thinking-block") : null;
      if (!target) continue;
      const parent = findThinkingParent(canvas, target.dataset.blockId);
      if (parent && parent.type === "canvas") continue;
      if (canCombineThinkingBlocks(canvas, block, parent)) return target;
    }
    return thinkingCanvasDropParent(clientX, clientY, card, block, canvas);
  }

  function placeBlockInThinkingParent(canvas, block, parentElement, lastPoint, start) {
    block.parentId = parentElement.dataset.blockId;
    const parent = findThinkingParent(canvas, block.parentId);
    if (!parent) return;
    if (parent.type !== "canvas") {
      delete block.blockWidth;
      delete block.blockHeight;
      return;
    }
    const canvasStage = parentElement.querySelector(".thinking-canvas__stage");
    if (!canvasStage) return;
    const rect = canvasStage.getBoundingClientRect();
    const preview = thinkingCanvasPreviewOrigin(parent, canvasStage.clientWidth,
      canvasStage.clientHeight);
    block.x = preview.x + Math.max(10, lastPoint.x - start.offsetX - rect.left);
    block.y = preview.y + Math.max(10, lastPoint.y - start.offsetY - rect.top);
    growThinkingCanvasForBlock(canvas, block, start.width, start.height);
  }

  function armThinkingDrag(handle, card, block, canvas, nested, insideCanvas) {
    handle.addEventListener("pointerdown", function (event) {
      if (event.button !== 0 || event.target.closest("button, input, textarea, select")) return;
      handle.setPointerCapture(event.pointerId);
      const pointerId = event.pointerId;
      const cardRect = card.getBoundingClientRect();
      const start = {
        x: event.clientX, y: event.clientY, bx: block.x, by: block.y,
        parentId: block.parentId,
        offsetX: event.clientX - cardRect.left, offsetY: event.clientY - cardRect.top,
        width: cardRect.width, height: cardRect.height
      };
      let moved = false;
      let portaled = false;
      let dropParent = null;
      let lastPoint = { x: event.clientX, y: event.clientY };
      card.classList.add("is-dragging");
      thinkingBoard.classList.add("is-combining");
      markThinkingCombineOptions(canvas, block, true);
      const move = function (moveEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        lastPoint = { x: moveEvent.clientX, y: moveEvent.clientY };
        if (!moved && Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) < 4) return;
        if (!moved) {
          showThinkingTrash();
          card.dataset.dragged = "true";
        }
        moved = true;
        if (nested) {
          if (!portaled) {
            document.body.appendChild(card);
            portaled = true;
          }
          card.classList.add("is-detaching");
          card.style.width = start.width + "px";
          card.style.left = moveEvent.clientX - start.offsetX + "px";
          card.style.top = moveEvent.clientY - start.offsetY + "px";
        } else {
          block.x = Math.max(18, Math.min(thinkingPlane.clientWidth - card.offsetWidth - 18,
            start.bx + moveEvent.clientX - start.x));
          block.y = Math.max(18, Math.min(thinkingPlane.clientHeight - card.offsetHeight - 18,
            start.by + moveEvent.clientY - start.y));
          card.style.left = block.x + "px";
          card.style.top = block.y + "px";
        }
        clearThinkingDropTargets();
        dropParent = thinkingDropParent(moveEvent.clientX, moveEvent.clientY, card, block, canvas);
        if (dropParent) dropParent.classList.add("is-drop-target");
        thinkingTrash.classList.toggle("is-active",
          pointInsideThinkingTrash(moveEvent.clientX, moveEvent.clientY));
        requestThinkingLinks(canvas);
      };
      const up = function (upEvent) {
        if (upEvent.pointerId !== pointerId) return;
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", up);
        card.classList.remove("is-dragging");
        thinkingBoard.classList.remove("is-combining");
        markThinkingCombineOptions(canvas, block, false);
        clearThinkingDropTargets();
        const cancelled = upEvent.type === "pointercancel";
        const deleted = moved && !cancelled
          && pointInsideThinkingTrash(upEvent.clientX, upEvent.clientY);
        hideThinkingTrash();
        if (!moved) return;
        if (cancelled && moved) {
          block.parentId = start.parentId;
          block.x = start.bx;
          block.y = start.by;
          if (portaled) card.remove();
          renderThinkingCanvas(canvas);
          return;
        }
        if (deleted) {
          if (portaled) card.remove();
          removeThinkingBlock(canvas, block.id);
          return;
        }
        dropParent = thinkingDropParent(upEvent.clientX, upEvent.clientY, card, block, canvas);
        if (moved && !dropParent && insideCanvas) {
          const originalParent = findThinkingParent(canvas, block.parentId);
          const originalCard = originalParent
            ? thinkingBlocks.querySelector('[data-block-id="' + originalParent.id + '"]') : null;
          const originalStage = originalCard
            ? originalCard.querySelector(".thinking-canvas__stage") : null;
          if (originalStage) {
            const rect = originalStage.getBoundingClientRect();
            if (lastPoint.x >= rect.left && lastPoint.x <= rect.right
                && lastPoint.y >= rect.top && lastPoint.y <= rect.bottom) {
              dropParent = originalCard;
            }
          }
        }
        if (moved && dropParent) {
          placeBlockInThinkingParent(canvas, block, dropParent, lastPoint, start);
        } else if (moved && nested) {
          const planeRect = thinkingPlane.getBoundingClientRect();
          const viewedCanvas = currentThinkingCanvasNode();
          block.parentId = viewedCanvas ? viewedCanvas.id : canvas.id;
          block.x = Math.max(18, Math.min(THINKING_WORLD_WIDTH - 300,
            lastPoint.x - start.offsetX - planeRect.left));
          block.y = Math.max(18, Math.min(THINKING_WORLD_HEIGHT - 220,
            lastPoint.y - start.offsetY - planeRect.top));
        }
        if (moved) growThinkingCanvasForBlock(canvas, block, start.width, start.height);
        if (portaled) card.remove();
        touchCanvas(canvas);
        renderThinkingCanvas(canvas);
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", up);
    });
  }

  function addThinkingBlock(type, point, dropParentId) {
    const canvas = currentCanvas();
    const viewedCanvas = currentThinkingCanvasNode();
    if (!canvas || !viewedCanvas) return;
    const step = canvas.blocks.length;
    const blockWidth = type === "canvas" ? 650
      : type === "question" ? 176 : type === "text" ? 150 : 160;
    const blockHeight = type === "canvas" ? 440
      : type === "question" ? 90 : type === "text" ? 56 : 64;
    let x = Math.max(24, Math.min(THINKING_WORLD_WIDTH - 300,
      thinkingViewport.scrollLeft + thinkingViewport.clientWidth / 2 - blockWidth / 2
      + (step % 3) * 18));
    let y = Math.max(24, Math.min(THINKING_WORLD_HEIGHT - 220,
      thinkingViewport.scrollTop + thinkingViewport.clientHeight / 2 - 80 + (step % 4) * 14));
    if (point) {
      const planeRect = thinkingPlane.getBoundingClientRect();
      x = Math.max(18, Math.min(THINKING_WORLD_WIDTH - blockWidth - 18,
        point.x - planeRect.left - blockWidth / 2));
      y = Math.max(18, Math.min(THINKING_WORLD_HEIGHT - 220,
        point.y - planeRect.top - 28));
    }
    const block = {
      id: thinkingId("b"), type: type, text: "", x: x, y: y,
      parentId: viewedCanvas.id
    };
    if (type === "canvas") {
      block.title = translate("thinkingNewCanvas");
      block.canvasWidth = 650;
      block.canvasHeight = 330;
      block.cameraX = THINKING_WORLD_X;
      block.cameraY = THINKING_WORLD_Y;
      block.previewX = THINKING_WORLD_X
        + thinkingViewport.clientWidth / 2 - (block.canvasWidth - 20) / 2;
      block.previewY = THINKING_WORLD_Y
        + thinkingViewport.clientHeight / 2 - block.canvasHeight / 2;
      block.collapsed = false;
    }
    if (point && dropParentId) {
      const parentElement = thinkingBlocks.querySelector('.thinking-block[data-block-id="'
        + dropParentId + '"]');
      if (parentElement) {
        placeBlockInThinkingParent(canvas, block, parentElement, point, {
          offsetX: blockWidth / 2,
          offsetY: 28,
          width: blockWidth,
          height: blockHeight
        });
      }
    }
    canvas.blocks.push(block);
    growThinkingCanvasForBlock(canvas, block, blockWidth, blockHeight);
    touchCanvas(canvas);
    renderThinkingCanvas(canvas);
    const field = thinkingBlocks.querySelector('[data-block-id="' + block.id + '"] textarea');
    if (field) field.focus();
  }

  function pointInsideThinkingViewport(x, y) {
    const rect = thinkingViewport.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function armThinkingToolDrag(tool) {
    tool.addEventListener("pointerdown", function (event) {
      if (event.button !== 0 || !currentCanvas()) return;
      const pointerId = event.pointerId;
      const start = { x: event.clientX, y: event.clientY };
      const type = tool.dataset.blockType;
      const canvas = currentCanvas();
      const viewedCanvas = currentThinkingCanvasNode();
      const draft = { id: "draft", type: type,
        parentId: viewedCanvas ? viewedCanvas.id : canvas.id };
      let moved = false;
      let ghost = null;
      let dropParent = null;

      const move = function (moveEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        if (!moved && Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) < 5) return;
        if (!moved) {
          moved = true;
          ghost = document.createElement("div");
          ghost.className = "thinking-tool-drag thinking-tool--" + type;
          ghost.innerHTML = tool.innerHTML;
          document.body.appendChild(ghost);
          thinkingBoard.classList.add("is-tool-dragging");
          markThinkingCombineOptions(canvas, draft, true);
        }
        moveEvent.preventDefault();
        ghost.style.left = moveEvent.clientX + 12 + "px";
        ghost.style.top = moveEvent.clientY + 12 + "px";
        clearThinkingDropTargets();
        const inside = pointInsideThinkingViewport(moveEvent.clientX, moveEvent.clientY);
        thinkingViewport.classList.toggle("is-tool-drop", inside);
        dropParent = inside ? thinkingDropParent(moveEvent.clientX, moveEvent.clientY,
          ghost, draft, canvas) : null;
        if (dropParent) dropParent.classList.add("is-drop-target");
      };

      const finish = function (endEvent, cancelled) {
        if (endEvent.pointerId !== pointerId) return;
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", cancel);
        if (!moved) return;
        endEvent.preventDefault();
        thinkingSuppressedTool = tool;
        setTimeout(function () {
          if (thinkingSuppressedTool === tool) thinkingSuppressedTool = null;
        }, 350);
        let finalDropParent = null;
        if (!cancelled && pointInsideThinkingViewport(endEvent.clientX, endEvent.clientY)) {
          finalDropParent = thinkingDropParent(endEvent.clientX, endEvent.clientY,
            ghost, draft, canvas);
        }
        const finalDropParentId = finalDropParent ? finalDropParent.dataset.blockId : null;
        clearThinkingDropTargets();
        markThinkingCombineOptions(canvas, draft, false);
        thinkingBoard.classList.remove("is-tool-dragging");
        thinkingViewport.classList.remove("is-tool-drop");
        if (!cancelled && pointInsideThinkingViewport(endEvent.clientX, endEvent.clientY)) {
          addThinkingBlock(type, { x: endEvent.clientX, y: endEvent.clientY }, finalDropParentId);
        }
        ghost.remove();
      };
      const up = function (upEvent) { finish(upEvent, false); };
      const cancel = function (cancelEvent) { finish(cancelEvent, true); };
      document.addEventListener("pointermove", move, { passive: false });
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", cancel);
    });
  }

  function addThinkingAnswer(canvas, question) {
    const answer = {
      id: thinkingId("b"), type: "answer", text: "",
      x: question.x + 24, y: question.y + 180, parentId: question.id
    };
    canvas.blocks.push(answer);
    touchCanvas(canvas);
    renderThinkingCanvas(canvas);
    const field = thinkingBlocks.querySelector('[data-block-id="' + answer.id + '"] textarea');
    if (field) field.focus();
  }

  function chooseThinkingLink(canvas, id) {
    if (!thinkingLinkFrom) {
      thinkingLinkFrom = id;
      syncThinkingLinkMode();
      return;
    }
    if (thinkingLinkFrom === id) {
      thinkingLinkFrom = null;
      syncThinkingLinkMode();
      return;
    }
    let exists = false;
    for (let i = 0; i < canvas.links.length; i++) {
      if (canvas.links[i].from === thinkingLinkFrom && canvas.links[i].to === id) exists = true;
    }
    if (!exists) canvas.links.push({ id: thinkingId("l"), from: thinkingLinkFrom, to: id });
    thinkingLinkFrom = null;
    touchCanvas(canvas);
    renderThinkingCanvas(canvas);
  }

  function thinkingLinkPointAt(clientX, clientY, sourceId) {
    const elements = document.elementsFromPoint(clientX, clientY);
    for (let i = 0; i < elements.length; i++) {
      const point = elements[i].closest
        ? elements[i].closest(".thinking-block__link-point") : null;
      if (point && point.dataset.blockId !== sourceId) return point;
    }
    return null;
  }

  function clearThinkingLinkPreview() {
    const preview = thinkingLinks.querySelector(".thinking-link-preview");
    if (preview) preview.remove();
    const targets = thinkingBlocks.querySelectorAll(".thinking-block__link-point.is-link-drop-target");
    for (let i = 0; i < targets.length; i++) {
      targets[i].classList.remove("is-link-drop-target");
    }
    thinkingBoard.classList.remove("is-link-dragging");
  }

  function drawThinkingLinkPreview(source, clientX, clientY, target) {
    let preview = thinkingLinks.querySelector(".thinking-link-preview");
    if (!preview) {
      preview = document.createElementNS("http://www.w3.org/2000/svg", "path");
      preview.setAttribute("class", "thinking-link-preview");
      thinkingLinks.appendChild(preview);
    }
    const planeRect = thinkingPlane.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    let endX = clientX - planeRect.left;
    let endY = clientY - planeRect.top;
    if (target) {
      const targetRect = target.getBoundingClientRect();
      endX = targetRect.left - planeRect.left + targetRect.width / 2;
      endY = targetRect.top - planeRect.top + targetRect.height / 2;
    }
    const startX = sourceRect.left - planeRect.left + sourceRect.width / 2;
    const startY = sourceRect.top - planeRect.top + sourceRect.height / 2;
    const bend = Math.max(42, Math.min(180, Math.abs(endX - startX) * .42));
    const direction = endX >= startX ? 1 : -1;
    preview.setAttribute("d", "M " + startX.toFixed(1) + " " + startY.toFixed(1)
      + " C " + (startX + bend * direction).toFixed(1) + " " + startY.toFixed(1)
      + ", " + (endX - bend * direction).toFixed(1) + " " + endY.toFixed(1)
      + ", " + endX.toFixed(1) + " " + endY.toFixed(1));
  }

  function armThinkingLinkPoint(point, block, canvas) {
    let suppressClick = false;
    point.addEventListener("click", function (event) {
      event.stopPropagation();
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      chooseThinkingLink(canvas, block.id);
    });
    point.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      event.stopPropagation();
      const pointerId = event.pointerId;
      const start = { x: event.clientX, y: event.clientY };
      let moved = false;
      let target = null;

      const move = function (moveEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        if (!moved && Math.hypot(moveEvent.clientX - start.x,
          moveEvent.clientY - start.y) < 4) return;
        if (!moved) {
          moved = true;
          thinkingLinkFrom = block.id;
          syncThinkingLinkMode();
          thinkingBoard.classList.add("is-link-dragging");
        }
        moveEvent.preventDefault();
        const nextTarget = thinkingLinkPointAt(moveEvent.clientX, moveEvent.clientY, block.id);
        if (target !== nextTarget) {
          if (target) target.classList.remove("is-link-drop-target");
          target = nextTarget;
          if (target) target.classList.add("is-link-drop-target");
        }
        drawThinkingLinkPreview(point, moveEvent.clientX, moveEvent.clientY, target);
      };

      const finish = function (endEvent, cancelled) {
        if (endEvent.pointerId !== pointerId) return;
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", cancel);
        clearThinkingLinkPreview();
        if (!moved) return;
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 350);
        if (cancelled) {
          thinkingLinkFrom = null;
          syncThinkingLinkMode();
        } else if (target) {
          chooseThinkingLink(canvas, target.dataset.blockId);
        }
      };
      const up = function (upEvent) { finish(upEvent, false); };
      const cancel = function (cancelEvent) { finish(cancelEvent, true); };
      document.addEventListener("pointermove", move, { passive: false });
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", cancel);
    });
  }

  function syncThinkingLinkMode() {
    thinkingLinkHint.hidden = !thinkingLinkFrom;
    thinkingBoard.classList.toggle("is-linking", !!thinkingLinkFrom);
    const cards = thinkingBlocks.querySelectorAll(".thinking-block");
    for (let i = 0; i < cards.length; i++) {
      cards[i].classList.toggle("is-link-source", cards[i].dataset.blockId === thinkingLinkFrom);
    }
  }

  function requestThinkingLinks(canvas) {
    if (thinkingLinkFrame) cancelAnimationFrame(thinkingLinkFrame);
    thinkingLinkFrame = requestAnimationFrame(function () {
      thinkingLinkFrame = null;
      renderThinkingLinks(canvas);
    });
  }

  function blockEdgePoint(from, to, width, height) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (!dx && !dy) return { x: from.x, y: from.y };
    const kx = dx ? width / 2 / Math.abs(dx) : Infinity;
    const ky = dy ? height / 2 / Math.abs(dy) : Infinity;
    const k = Math.min(kx, ky);
    return { x: from.x + dx * k, y: from.y + dy * k };
  }

  function renderThinkingLinks(canvas) {
    const old = thinkingLinks.querySelectorAll(".thinking-link, .thinking-link-hit");
    for (let i = 0; i < old.length; i++) old[i].remove();
    const planeRect = thinkingPlane.getBoundingClientRect();
    for (let i = 0; i < canvas.links.length; i++) {
      const link = canvas.links[i];
      const fromEl = thinkingBlocks.querySelector('[data-block-id="' + link.from + '"]');
      const toEl = thinkingBlocks.querySelector('[data-block-id="' + link.to + '"]');
      if (!fromEl || !toEl) continue;
      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();
      if (!fromRect.width || !fromRect.height || !toRect.width || !toRect.height) continue;
      const from = { x: fromRect.left - planeRect.left + fromRect.width / 2,
        y: fromRect.top - planeRect.top + fromRect.height / 2 };
      const to = { x: toRect.left - planeRect.left + toRect.width / 2,
        y: toRect.top - planeRect.top + toRect.height / 2 };
      const start = blockEdgePoint(from, to, fromEl.offsetWidth, fromEl.offsetHeight);
      const end = blockEdgePoint(to, from, toEl.offsetWidth + 14, toEl.offsetHeight + 14);
      const bend = Math.max(44, Math.min(180, Math.abs(end.x - start.x) * .42));
      const direction = end.x >= start.x ? 1 : -1;
      const d = "M " + start.x.toFixed(1) + " " + start.y.toFixed(1)
        + " C " + (start.x + bend * direction).toFixed(1) + " " + start.y.toFixed(1)
        + ", " + (end.x - bend * direction).toFixed(1) + " " + end.y.toFixed(1)
        + ", " + end.x.toFixed(1) + " " + end.y.toFixed(1);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "thinking-link");
      path.setAttribute("d", d);
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hit.setAttribute("class", "thinking-link-hit");
      hit.setAttribute("d", d);
      hit.addEventListener("pointerenter", function () { path.style.stroke = "var(--danger)"; path.style.opacity = "1"; });
      hit.addEventListener("pointerleave", function () { path.style.stroke = ""; path.style.opacity = ""; });
      hit.addEventListener("click", function () {
        removeThinkingLink(canvas, link.id);
      });
      thinkingLinks.append(path, hit);
    }
  }

  thinkingName.addEventListener("input", function () {
    const canvas = currentCanvas();
    const canvasNode = currentThinkingCanvasNode();
    if (!canvas || !canvasNode || !thinkingCanvasParent(canvas, canvasNode)) return;
    canvasNode.title = thinkingName.value;
    touchCanvas(canvas);
  });
  document.getElementById("thinkingBtn").addEventListener("click", openThinking);
  document.getElementById("thinkingBoardBack").addEventListener("click", closeCurrentThinkingCanvas);
  document.getElementById("thinkingExit").addEventListener("click", closeThinking);
  document.getElementById("thinkingLinkCancel").addEventListener("click", function () {
    thinkingLinkFrom = null;
    clearThinkingLinkPreview();
    syncThinkingLinkMode();
  });
  const thinkingTools = document.querySelectorAll(".thinking-tool[data-block-type]");
  for (let i = 0; i < thinkingTools.length; i++) {
    armThinkingToolDrag(thinkingTools[i]);
    thinkingTools[i].addEventListener("click", function () {
      if (thinkingSuppressedTool === this) {
        thinkingSuppressedTool = null;
        return;
      }
      addThinkingBlock(this.dataset.blockType);
    });
  }

  function recenterThinkingWorld(canvas) {
    const canvasNode = currentThinkingCanvasNode();
    if (!canvasNode) return;
    let dx = 0;
    let dy = 0;
    const edge = 1800;
    if (thinkingViewport.scrollLeft < edge) dx = 6000;
    else if (thinkingViewport.scrollLeft > THINKING_WORLD_WIDTH
      - thinkingViewport.clientWidth - edge) dx = -6000;
    if (thinkingViewport.scrollTop < edge) dy = 3500;
    else if (thinkingViewport.scrollTop > THINKING_WORLD_HEIGHT
      - thinkingViewport.clientHeight - edge) dy = -3500;
    if (!dx && !dy) return;

    thinkingRecentering = true;
    for (let i = 0; i < canvas.blocks.length; i++) {
      if (canvas.blocks[i].parentId !== canvasNode.id) continue;
      canvas.blocks[i].x += dx;
      canvas.blocks[i].y += dy;
    }
    const nextX = thinkingViewport.scrollLeft + dx;
    const nextY = thinkingViewport.scrollTop + dy;
    canvasNode.cameraX = nextX;
    canvasNode.cameraY = nextY;
    renderThinkingCanvas(canvas);
    thinkingViewport.scrollLeft = nextX;
    thinkingViewport.scrollTop = nextY;
    setTimeout(function () { thinkingRecentering = false; }, 0);
  }

  thinkingViewport.addEventListener("scroll", function () {
    if (thinkingRecentering) return;
    const canvas = currentCanvas();
    const canvasNode = currentThinkingCanvasNode();
    if (!canvas || !canvasNode) return;
    canvasNode.cameraX = thinkingViewport.scrollLeft;
    canvasNode.cameraY = thinkingViewport.scrollTop;
    recenterThinkingWorld(canvas);
    clearTimeout(thinkingCameraTimer);
    thinkingCameraTimer = setTimeout(saveState, 180);
  });

  thinkingViewport.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    const control = event.target.closest
      ? event.target.closest(".thinking-block, button, input, textarea, select, .thinking-link-hit") : null;
    if (control) return;
    event.preventDefault();
    thinkingViewport.setPointerCapture(event.pointerId);
    const last = { x: event.clientX, y: event.clientY };
    thinkingViewport.classList.add("is-panning");
    const move = function (moveEvent) {
      thinkingViewport.scrollLeft -= moveEvent.clientX - last.x;
      thinkingViewport.scrollTop -= moveEvent.clientY - last.y;
      last.x = moveEvent.clientX;
      last.y = moveEvent.clientY;
    };
    const up = function () {
      thinkingViewport.removeEventListener("pointermove", move);
      thinkingViewport.removeEventListener("pointerup", up);
      thinkingViewport.removeEventListener("pointercancel", up);
      thinkingViewport.classList.remove("is-panning");
      const canvas = currentCanvas();
      const canvasNode = currentThinkingCanvasNode();
      if (canvas && canvasNode) {
        canvasNode.cameraX = thinkingViewport.scrollLeft;
        canvasNode.cameraY = thinkingViewport.scrollTop;
        saveState();
      }
    };
    thinkingViewport.addEventListener("pointermove", move);
    thinkingViewport.addEventListener("pointerup", up);
    thinkingViewport.addEventListener("pointercancel", up);
  });

  thinkingViewport.addEventListener("dblclick", function (event) {
    const tree = currentCanvas();
    const canvasNode = currentThinkingCanvasNode();
    if (!tree || !canvasNode || !thinkingCanvasParent(tree, canvasNode)) return;
    if (event.target.closest("button, input, textarea, select")) return;
    event.preventDefault();
    closeCurrentThinkingCanvas();
  });

  thinkingPlane.addEventListener("click", function (event) {
    if (!thinkingLinkFrom || event.target !== thinkingPlane) return;
    thinkingLinkFrom = null;
    syncThinkingLinkMode();
  });
  window.addEventListener("resize", function () {
    const canvas = currentCanvas();
    if (canvas) requestThinkingLinks(canvas);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || thinkingView.hidden) return;
    closeThinking();
  });

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

  /* THE THREE COLUMNS — tasks, the day, planning. Wide, they are a grid and the
     rail never moves. Narrow, they are three full-width panes and the rail slides
     between them: same three elements, one layout to reason about. */
  const pagesEl = document.getElementById("pages");
  const pagesTrack = document.getElementById("pagesTrack");
  const panes = pagesTrack.querySelectorAll(".app__col");
  const paneDots = document.getElementById("paneDots");
  let paneAt = 1;   // the day is the middle one, and where the app opens

  function railed() { return window.matchMedia("(max-width: 999px)").matches; }

  /* The rail is as tall as the pane on show, but only while it is a rail: as a
     grid it has to be left to its own height or the columns get cropped. */
  function syncPagesHeight(animate) {
    if (!railed()) {
      pagesEl.style.transition = "none";
      pagesEl.style.height = "";
      pagesEl.offsetHeight;
      pagesEl.style.transition = "";
      return;
    }
    const height = panes[paneAt].offsetHeight + "px";
    if (animate) { pagesEl.style.height = height; return; }
    pagesEl.style.transition = "none";
    pagesEl.style.height = height;
    pagesEl.offsetHeight;                 // commit before the transition returns
    pagesEl.style.transition = "";
  }

  function setPane(index) {
    paneAt = Math.max(0, Math.min(panes.length - 1, index));
    pagesTrack.style.transform = railed()
      ? "translateX(" + (-paneAt * (100 / panes.length)).toFixed(4) + "%)" : "";
    for (let i = 0; i < paneDots.children.length; i++) {
      paneDots.children[i].classList.toggle("is-on", i === paneAt);
    }
    syncPagesHeight(true);
  }

  /* one dot per pane, tappable: a swipe rail with nothing to point at is a maze */
  for (let i = 0; i < panes.length; i++) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "pane-dot";
    dot.setAttribute("aria-label", translate(["paneTasks", "panePlan"][i]));
    dot.addEventListener("click", function () { setPane(i); });
    paneDots.appendChild(dot);
  }

  window.addEventListener("resize", function () {
    setPane(paneAt);        // the transform belongs to the rail, not to the grid
    renderTimeRule();
  });

  /* touch only: a horizontal swipe walks the panes. Mouse drags are left alone so
     they never fight the row reordering. */
  let pageSwipe = null;
  let pageSwipeUntil = 0;
  pagesEl.addEventListener("pointerdown", function (event) {
    pageSwipe = event.pointerType === "mouse" ? null : { x: event.clientX, y: event.clientY };
  });
  pagesEl.addEventListener("pointerup", function (event) {
    if (!pageSwipe || !railed()) { pageSwipe = null; return; }
    const dx = event.clientX - pageSwipe.x;
    const dy = event.clientY - pageSwipe.y;
    pageSwipe = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return;   // clearly horizontal
    pageSwipeUntil = Date.now() + 350;
    setPane(paneAt + (dx < 0 ? 1 : -1));
  });
  pagesEl.addEventListener("click", function (event) {
    if (Date.now() < pageSwipeUntil) { event.stopPropagation(); event.preventDefault(); }
  }, true);

  // content grows and shrinks all the time; the rail follows without bookkeeping
  if (window.ResizeObserver) {
    const pageWatcher = new ResizeObserver(function () { syncPagesHeight(false); });
    for (let i = 0; i < panes.length; i++) pageWatcher.observe(panes[i]);
  }

  /* Trap the Back button (mobile) so it closes the top overlay instead of leaving
     the app. Closes the most-modal one first. */
  function closeTopOverlay() {
    if (!thinkingView.hidden) {
      closeThinking();
      return true;
    }
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
    if (!wellView.hidden) { closeWell(); return true; }
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
  setPane(1);        // the app opens on the day
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
