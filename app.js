(function () {
  "use strict";

  const STORAGE_KEY = "todoAppData";
  const CONSTELLATION_ICON_KEYS = [
    "constellation-star", "constellation-orbit", "constellation-dipper",
    "constellation-crown", "constellation-kite", "constellation-arrow",
    "constellation-twins", "constellation-wave", "constellation-cluster",
    "constellation-cross", "constellation-triangle", "constellation-comet"
  ];
  /* The only two glyphs actually deleted from the catalogs, and what stands in
     for them. Everything else that left a catalog still lives in another one, so
     it keeps drawing. Up here because loadState runs before the catalogs do. */
  const RETIRED_ICONS = { walk: "run", game: "star" };
  const state = loadState();
  // loadState migrates in memory; write it down once so the stored data matches
  // what the app is actually running on, instead of migrating again every launch
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  let appReady = false;   // startup draws everything once; nothing may redraw before

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

  /* "rose" became "sakura" — same room, a name and a season. Everything keyed by
     theme name has to follow, or a user's edits would be stranded on a theme
     that no longer exists. */
  function migrateThemeName(saved) {
    return saved === "rose" ? "sakura" : (saved || "auto");
  }
  function renameThemeKeys(store) {
    if (store && store.rose) {
      if (!store.sakura) store.sakura = store.rose;
      delete store.rose;
    }
    return store || {};
  }

  /* The step ramp belongs to the theme now, so "theme" is the default palette
     and the old bespoke-per-theme palette ("custom") is the same thing — it just
     starts from the theme's ramp instead of from aurora. Aurora was the former
     default, so anyone still on it who never touched it moves across; anyone who
     tuned aurora keeps it. */
  function paletteName(saved, paletteEdits) {
    if (!saved || saved === "custom") return "theme";
    if (saved === "aurora" && !(paletteEdits && paletteEdits.aurora)) return "theme";
    return saved;
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
      // two glyphs left the catalogs for good; anything wearing one is moved over
      for (let i = 0; i < habits.length; i++) {
        if (RETIRED_ICONS[habits[i].icon]) habits[i].icon = RETIRED_ICONS[habits[i].icon];
      }
      const projects = saved.projects || [];
      for (let i = 0; i < projects.length; i++) {
        const project = projects[i];
        if (RETIRED_ICONS[project.icon]) project.icon = RETIRED_ICONS[project.icon];
        delete project.subtasks;       // projects moved from subtasks to milestones
        if (!project.icon) project.icon = "folder";
        if (!project.sky) project.sky = freeSkySpot(i);   // its place in the sky
        if (!project.journal) project.journal = [];
        if (!project.dream) project.dream = [];
        if (project.why == null) project.why = "";
        if (project.outcome == null) project.outcome = "";
        delete project.targetDate;   // a project no longer has a date of its own
        // the notes box left with the detail card; the text becomes a journal line
        // rather than staying in the data with nowhere to be read
        if (project.notes && project.notes.trim()) {
          project.journal.unshift({ id: project.id + "n", date: todayKey(), text: project.notes.trim() });
        }
        delete project.notes;
        // milestones and next steps were two names for the same thing: one list now
        if (project.milestones) {
          if (!project.steps) project.steps = project.milestones;
          delete project.milestones;
        }
        if (!project.stepsView) project.stepsView = "timeline";
        // The roadmap used to keep its start and finish caps inside the step list,
        // which is why the list and the roadmap never quite showed the same thing.
        // The caps are drawn now, not stored; the finish was the project's own
        // completion all along.
        if (project.steps) {
          for (let j = project.steps.length - 1; j >= 0; j--) {
            if (project.steps[j].text) continue;
            if (j === project.steps.length - 1 && project.steps[j].completedDate) {
              project.done = true;
            }
            project.steps.splice(j, 1);
          }
        }
        if (!project.steps) project.steps = [];
        // An objective is pursued by several distinct ways at once; the one list
        // becomes the first of them, and nothing is lost doing it.
        if (!project.constellations || !project.constellations.length) {
          project.constellations = [{
            id: project.id + "c", name: "", icon: CONSTELLATION_ICON_KEYS[0],
            habitIds: [], steps: project.steps
          }];
        }
        delete project.steps;
        for (let c = 0; c < project.constellations.length; c++) {
          const branch = project.constellations[c];
          if (!branch.steps) branch.steps = [];
          if (!branch.habitIds) branch.habitIds = [];
          if (branch.name == null) branch.name = "";
          if (!branch.icon) branch.icon = CONSTELLATION_ICON_KEYS[c % CONSTELLATION_ICON_KEYS.length];
          // a course is walked in order: what was reached comes first, the rest
          // keeps the order it was written in
          const reached = [];
          const ahead = [];
          for (let s = 0; s < branch.steps.length; s++) {
            (branch.steps[s].completedDate ? reached : ahead).push(branch.steps[s]);
          }
          branch.steps = reached.concat(ahead);
        }
        let activeBranchFound = false;
        for (let c = 0; c < project.constellations.length; c++) {
          if (project.constellations[c].id === project.activeConstellationId) {
            activeBranchFound = true;
            break;
          }
        }
        if (!activeBranchFound) project.activeConstellationId = project.constellations[0].id;
      }
      absorbProjectTasksIntoSteps(projects, saved.tasks || []);
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
        if (RETIRED_ICONS[events[i].icon]) events[i].icon = RETIRED_ICONS[events[i].icon];
        if (!events[i].date) events[i].date = null;   // it waits over the rule
        if (!events[i].time) events[i].time = null;   // a day without an hour is allowed
        if (events[i].projectId === undefined) events[i].projectId = null;
      }
      // an element carries the project it serves, the same way a task always has
      for (let i = 0; i < habits.length; i++) {
        if (habits[i].projectId === undefined) habits[i].projectId = null;
      }
      let canvases = saved.canvases || [];
      for (let i = 0; i < canvases.length; i++) {
        if ([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].indexOf(canvases[i].thinkingTreeVersion) === -1
            || canvases[i].type !== "canvas") {
          canvases = [];
          break;
        }
      }
      for (let i = 0; i < canvases.length; i++) {
        let canvas = canvases[i];
        const compactOldBlocks = canvas.thinkingTreeVersion < 5;
        const oldCanvasTitles = canvas.thinkingTreeVersion < 6;
        const oldFolderLayout = canvas.thinkingTreeVersion < 11;
        canvas.parentId = null;
        canvas.title = "";
        if (!canvas.blocks) canvas.blocks = [];
        if (!canvas.links) canvas.links = [];
        if (!canvas.createdAt) canvas.createdAt = Date.now();
        if (!canvas.updatedAt) canvas.updatedAt = canvas.createdAt;
        for (let j = 0; j < canvas.blocks.length; j++) {
          const block = canvas.blocks[j];
          if (["problem", "solution", "example", "idea", "question", "answer", "canvas",
            "folder", "document", "planner", "logbook", "text", "note", "task", "event",
            "habit", "step", "journal", "loop", "condition"]
            .indexOf(block.type) === -1) block.type = "note";
          delete block.icon;
          delete block.color;
          if (compactOldBlocks) delete block.blockHeight;
          if (["canvas", "folder", "document", "planner", "logbook"].indexOf(block.type) !== -1) {
            if (block.canvasWidth == null) block.canvasWidth = 650;
            if (block.canvasHeight == null) block.canvasHeight = 330;
            if (block.cameraX == null) block.cameraX = 9000;
            if (block.cameraY == null) block.cameraY = 5000;
            if (block.collapsed == null) block.collapsed = false;
          }
          if (block.type === "folder") {
            if (oldFolderLayout) block.blockWidth = 420;
            delete block.canvasWidth;
            delete block.canvasHeight;
            delete block.previewX;
            delete block.previewY;
          }
          if (block.type === "document" && block.documentHtml == null) block.documentHtml = "";
          if (block.type === "loop") {
            if (!Array.isArray(block.loopDays)) {
              const parsedDays = thinkingParseLoopDays(block.loopDaysText || "");
              block.loopDays = parsedDays.length ? parsedDays : [1, 2, 3, 4, 5];
            }
            delete block.loopDaysText;
            delete block.loopHour;
            delete block.blockHeight;
            if (block.loopWeeks == null) block.loopWeeks = 4;
          }
          if (block.type === "condition" && block.conditionHour == null) {
            block.conditionHour = "19:00";
          }
          if (block.type === "condition") delete block.blockHeight;
          // the objective left the canvas: its blocks and bindings go with it
          delete block.linkedProjectId;
          delete block.stepProjectId;
          delete block.stepId;
          delete block.journalProjectId;
          delete block.journalEntryId;
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
          if (["canvas", "folder", "document", "planner", "logbook"].indexOf(block.type) === -1) continue;
          if (!(block.title || "").trim()
              || (oldCanvasTitles && ["New canvas", "Nouvelle toile"].indexOf(block.title) !== -1)) {
            block.title = "";
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
          if (parent && ["canvas", "folder", "document", "planner", "logbook"].indexOf(parent.type) === -1) {
            delete block.blockWidth;
            delete block.blockHeight;
          }
        }
        const folderPositions = {};
        for (let j = 0; j < canvas.blocks.length; j++) {
          const block = canvas.blocks[j];
          const parent = canvasBlocks[block.parentId];
          if (!parent || parent.type !== "folder") continue;
          folderPositions[parent.id] = (folderPositions[parent.id] || 0) + 1;
          if (block.folderOrder == null) block.folderOrder = folderPositions[parent.id] * 100;
          delete block.stuckToId;
          delete block.stuckSide;
        }
        const stuckSides = ["top", "right", "bottom", "left"];
        const occupiedStuckSides = {};
        for (let j = 0; j < canvas.blocks.length; j++) {
          const block = canvas.blocks[j];
          const target = canvasBlocks[block.stuckToId];
          const parent = canvasBlocks[block.parentId];
          const key = block.stuckToId + ":" + block.stuckSide;
          if (!target || target.id === block.id || target.parentId !== block.parentId
              || !parent || parent.type === "folder"
              || stuckSides.indexOf(block.stuckSide) === -1 || occupiedStuckSides[key]) {
            delete block.stuckToId;
            delete block.stuckSide;
          } else {
            occupiedStuckSides[key] = true;
          }
        }
        for (let j = 0; j < canvas.blocks.length; j++) {
          const block = canvas.blocks[j];
          const visited = {};
          let branch = block;
          while (branch && branch.stuckToId) {
            if (visited[branch.id]) {
              delete block.stuckToId;
              delete block.stuckSide;
              break;
            }
            visited[branch.id] = true;
            branch = canvasBlocks[branch.stuckToId];
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
          directCanvas.thinkingTreeVersion = 16;
          canvas = directCanvas;
          canvases[i] = canvas;
        }
        canvas.title = "";
        // The former desk is now an ordinary canvas. Its blocks and bindings stay,
        // but there is no second, automatically synchronized reflection space.
        delete canvas.desk;
        canvas.thinkingTreeVersion = 16;
      }
      canvases = migrateStandaloneNotes(canvases, saved.notes || [],
        saved.settings && saved.settings.language);
      return {
        tasks: tasks,
        projects: projects,
        habits: habits,
        canvases: canvases,
        events: events,
        sun: saved.sun || null,
        settings: {
          name: (saved.settings && saved.settings.name) || "",
          theme: migrateThemeName(saved.settings && saved.settings.theme),
          language: (saved.settings && saved.settings.language) || "fr",
          palette: paletteName(saved.settings && saved.settings.palette,
                               saved.settings && saved.settings.paletteEdits),
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
          themeDecorLent: (saved.settings && saved.settings.themeDecorLent) || [],
          themeEdits: renameThemeKeys(saved.settings && saved.settings.themeEdits),
          paletteEdits: (saved.settings && saved.settings.paletteEdits) || {},
          themePalettes: renameThemeKeys(saved.settings && saved.settings.themePalettes)
        }
      };
    } catch (err) {
      return { tasks: [], projects: [], habits: [], canvases: [], events: [], sun: null, settings: { name: "", theme: "auto", language: "fr", palette: "theme", glass: "motif", decorations: ["field"], fieldOn: true, timeScrub: false, treeFull: false, treeWisps: true, treeTrunk: true, treeBranches: true, treeBlooms: ["corolla"], treeSap: true, themeDecorLent: [], themeEdits: {}, paletteEdits: {}, themePalettes: {} } };
    }
  }

  /* Notes used to live in a separate app-wide tool. Move them once into real
     notepad blocks before dropping the retired data key, so removing the old
     interface never removes what the user wrote. */
  function migrateStandaloneNotes(canvases, notes, language) {
    if (!notes.length) return canvases;
    let stamp = Date.now();
    for (let i = 0; i < notes.length; i++) {
      stamp = Math.max(stamp, notes[i].updatedAt || Number(notes[i].id) || 0);
    }
    let suffix = stamp.toString(36);
    let canvasId = "cnotes" + suffix;
    let used = true;
    while (used) {
      used = false;
      for (let i = 0; i < canvases.length; i++) {
        if (canvases[i].id === canvasId) { used = true; break; }
      }
      if (used) canvasId += "m";
    }
    const folderId = "fnotes" + suffix;
    const folder = {
      id: folderId,
      type: "folder",
      title: language === "en" ? "Imported notes" : "Notes importées",
      text: "",
      x: 9080,
      y: 5060,
      parentId: canvasId,
      blockWidth: 420,
      cameraX: 9000,
      cameraY: 5000,
      collapsed: false
    };
    const blocks = [folder];
    for (let i = 0; i < notes.length; i++) {
      blocks.push({
        id: "dnote" + suffix + i.toString(36),
        type: "document",
        title: notes[i].title || "",
        text: "",
        documentHtml: notes[i].html || "",
        x: 9080,
        y: 5060,
        parentId: folderId,
        folderOrder: (i + 1) * 100,
        canvasWidth: 650,
        canvasHeight: 330,
        cameraX: 9000,
        cameraY: 5000,
        collapsed: true
      });
    }
    canvases.unshift({
      id: canvasId,
      type: "canvas",
      thinkingTreeVersion: 16,
      parentId: null,
      title: "",
      text: "",
      x: 0,
      y: 0,
      icon: "target",
      canvasWidth: 650,
      canvasHeight: 330,
      cameraX: 9000,
      cameraY: 5000,
      collapsed: false,
      createdAt: stamp,
      updatedAt: stamp,
      blocks: blocks,
      links: []
    });
    return canvases;
  }

  /* The project's own tasks were a second list of steps sitting beside the roadmap.
     They join it, once. A task with no date has nothing keeping it in the day, so it
     simply becomes a step; a dated one stays a task and gets a step pointing at it,
     because silently taking a dated task out of someone's day would lose work. */
  function absorbProjectTasksIntoSteps(projects, tasks) {
    for (let i = tasks.length - 1; i >= 0; i--) {
      const task = tasks[i];
      if (!task.projectId || task.stepId || task.stepId) continue;
      let project = null;
      for (let j = 0; j < projects.length; j++) {
        if (projects[j].id === task.projectId) { project = projects[j]; break; }
      }
      if (!project) continue;
      if (!project.steps) project.steps = [];   // the branches are formed just after
      const step = {
        id: task.id + "s",
        text: task.text,
        completedDate: task.done ? (task.doneDate || todayKey()) : null,
        targetDate: task.dueDate || null
      };
      project.steps.push(step);
      if (task.dueDate) task.stepId = step.id;   // it keeps its place in the day
      else tasks.splice(i, 1);
    }
  }

  /* THE CONSTELLATIONS — an objective is not one course but several: the language
     you learn by lessons, by films, by the people you meet. Each branch is its own
     series of steps, and they do not advance at the same pace. Everything that used
     to read one list now reads across the branches through these. */
  function projectBranches(project) {
    if (!project.constellations || !project.constellations.length) {
      project.constellations = [{
        id: project.id + "c", name: "", icon: CONSTELLATION_ICON_KEYS[0],
        habitIds: [], steps: []
      }];
    }
    return project.constellations;
  }

  function findBranch(project, id) {
    const branches = projectBranches(project);
    for (let i = 0; i < branches.length; i++) {
      if (branches[i].id === id) return branches[i];
    }
    return null;
  }

  function activeProjectBranch(project) {
    const branches = projectBranches(project);
    const active = findBranch(project, project.activeConstellationId);
    if (active) return active;
    project.activeConstellationId = branches[0].id;
    return branches[0];
  }

  function switchProjectBranch(project) {
    const branches = projectBranches(project);
    if (branches.length < 2) return;
    const active = activeProjectBranch(project);
    let index = branches.indexOf(active);
    if (index < 0) index = 0;
    project.activeConstellationId = branches[(index + 1) % branches.length].id;
    saveState();
    redrawSteps(project);   // the star's panel shows one branch too, redraw it as well
  }

  /* every step of every branch, in branch order — what progress and momentum read */
  function allProjectSteps(project) {
    const branches = projectBranches(project);
    const all = [];
    for (let i = 0; i < branches.length; i++) {
      for (let j = 0; j < branches[i].steps.length; j++) all.push(branches[i].steps[j]);
    }
    return all;
  }

  /* THE MOONS — a constellation is driven by habits as much as by steps, and a
     habit does not progress, it returns. So it is drawn as a moon, whose phase is
     its regularity over the last fortnight: full when kept every day, dark when it
     has been let go. The steps say where you are; the moons say whether you are
     still at it. The two disagree often, and that is the useful moment. */
  const MOON_WINDOW = 14;

  function branchHabits(branch) {
    const found = [];
    const ids = branch.habitIds || [];
    for (let i = 0; i < ids.length; i++) {
      const habit = findItem("habits", ids[i]);
      if (habit) found.push(habit);        // a deleted habit simply stops being drawn
    }
    return found;
  }

  /* the lit fraction: days kept over the window it is judged on */
  function habitPhase(habit) {
    const dates = habit.completedDates || [];
    const from = shiftDateKey(todayKey(), -(MOON_WINDOW - 1));
    let kept = 0;
    for (let i = 0; i < dates.length; i++) {
      if (dates[i] >= from && dates[i] <= todayKey()) kept++;
    }
    return Math.min(1, kept / MOON_WINDOW);
  }

  /* the branch's own pulse: what its line carries, read from a distance */
  function branchPulse(branch) {
    const habits = branchHabits(branch);
    if (!habits.length) return null;
    let total = 0;
    for (let i = 0; i < habits.length; i++) total += habitPhase(habits[i]);
    return total / habits.length;
  }

  function toggleBranchHabit(branch, habitId) {
    if (!branch.habitIds) branch.habitIds = [];
    const at = branch.habitIds.indexOf(habitId);
    if (at === -1) branch.habitIds.push(habitId);   // creation order, never sorted
    else branch.habitIds.splice(at, 1);
    saveState();
  }

  function addBranch(project, name) {
    const branches = projectBranches(project);
    const branch = {
      id: Date.now().toString(), name: name || "",
      icon: CONSTELLATION_ICON_KEYS[branches.length % CONSTELLATION_ICON_KEYS.length],
      habitIds: [], steps: []
    };
    branches.push(branch);
    saveState();
    return branch;
  }

  function removeBranch(project, id) {
    const branches = projectBranches(project);
    if (branches.length < 2) return;   // an objective always keeps one way forward
    let removedAt = 0;
    for (let i = 0; i < branches.length; i++) {
      if (branches[i].id === id) { removedAt = i; branches.splice(i, 1); break; }
    }
    if (!findBranch(project, project.activeConstellationId)) {
      project.activeConstellationId = branches[Math.min(removedAt, branches.length - 1)].id;
    }
    saveState();
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
      homeAria: "Retour à l'accueil",
      settingsTitle: "Paramètres",
      tabSystem: "Système",
      tabCustom: "Personnalisation",
      brushAria: "Changer de thème",
      brushedTo: "Thème :",
      tasksTitle: "Vos tâches",
      backToToday: "Revenir à aujourd'hui",
      newEventName: "Nouvel événement",
      undatedLabel: "Sans date",
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
      themeSakura: "Sakura",
      themeAqua: "Aquatique",
      themeForest: "Forêt",
      themeBoreal: "Boréal",
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
      habitDropProject: "Lier à ce projet",
      habitLinkedProject: "Habitude liée au projet.",
      habitAlreadyLinkedProject: "Cette habitude est déjà liée.",
      undoDeleted: "Élément supprimé",
      undoBtn: "Annuler",
      decorLabel: "Décorations",
      decorParticles: "Particules",
      decorPetals: "Pétales",
      decorBubbles: "Bulles",
      decorSeabed: "Fond marin",
      decorAurora: "Aurores",
      decorPollen: "Pollen",
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
      paletteTheme: "Du thème",
      paletteAurora: "Aurore",
      paletteMeadow: "Prairie",
      paletteSunset: "Coucher",
      editTitle: "Modifier",
      editNameLabel: "Nom",
      editIconLabel: "Icône",
      editDateNone: "Aucune date",
      notesLabel: "Notes",
      subtasksLabel: "Sous-tâches",
      stepsLabel: "Étapes",
      pinLabel: "Épingler",
      importantLabel: "Important",
      backAria: "Retour",
      notesPlaceholder: "Ajouter des notes…",
      noteShowAria: "Afficher la note",
      noteHideAria: "Masquer la note",
      addSubtaskPlaceholder: "Ajouter une sous-tâche…",
      stepPlaceholder: "Étape",
      stepAdd: "Ajouter une étape",
      stepDragAria: "Glisser cette étape vers les tâches",
      stepDropTasks: "Déposer dans les tâches",
      stepDropTimeline: "Déposer sur la timeline",
      newerItemsAria: "Voir les éléments plus récents",
      olderItemsAria: "Voir les éléments plus anciens",
      skyAria: "Le ciel des projets",
      skyTitle: "Le ciel",
      skyEmpty: "Le ciel est vide. Allumez une première étoile.",
      skyOpenAria: "Ouvrir le projet",
      capLabel: "Le cap",
      whyPlaceholder: "Pourquoi ce projet ?",
      outcomePlaceholder: "À quoi ça ressemble, une fois fini ?",
      stepsEmptyAdd: "Aucune étape pour l'instant — ajoutez-en une…",
      stepsViewRoadmap: "Parcours",
      branchAdd: "Ajouter une liste",
      branchRemove: "Retirer cette constellation",
      branchName: "Nom de la constellation",
      branchIconAria: "Changer l’icône de cette constellation",
      branchSwitchAria: "Afficher la constellation suivante",
      moonAttach: "Habitudes de cette constellation",
      moonNew: "Nouvelle habitude…",
      moonOff: "Détacher l'habitude",
      moonEmptyAdd: "Aucune habitude pour l'instant — ajoutez-en une…",
      stepsViewList: "Liste",
      dreamLabel: "Mur de rêve",
      dreamAdd: "Carte",
      dreamPlaceholder: "Une idée, une référence, une envie…",
      journalLabel: "Journal",
      journalAdd: "Noter une avancée, une idée…",
      journalEmpty: "Rien de consigné pour l'instant.",
      journalShowAria: "Afficher le journal",
      journalHideAria: "Masquer le journal",
      promoteStep: "En faire une étape",
      promotedLabel: "Devenu une étape",
      taskLinked: "Tâche rattachée au projet",
      stepCreated: "Étape ajoutée.",
      stepTarget: "Date visée",
      lateLabel: "en retard",
      dormantFor: "sans nouvelles depuis",
      daysShort: "j",
      addEventPlaceholder: "Ajouter un événement…",
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
      thinkingAria: "Espace de réflexion",
      thinkingUntitled: "Toile sans titre",
      thinkingSaved: "Enregistré",
      thinkingTools: "Outils de la toile",
      thinkingAddBlock: "Ajouter un bloc",
      thinkingAdd: "Ajouter",
      thinkingOrganization: "Organisation",
      thinkingBlocksLabel: "Blocs",
      thinkingPlanningLabel: "Planification",
      thinkingSwitchTools: "Changer de catégorie d’outils",
      thinkingAddStuck: "Ajouter un élément collé",
      thinkingMoveStuckSingle: "Déplacer uniquement cet élément",
      thinkingSelect: "Sélection",
      thinkingSelectionOne: "1 bloc sélectionné",
      thinkingSelectionMany: "{count} blocs sélectionnés",
      thinkingPutInCanvas: "Mettre dans une nouvelle toile",
      blockProblem: "Problème",
      blockSolution: "Solution",
      blockExample: "Exemple",
      blockIdea: "Idée",
      blockQuestion: "Question",
      blockAnswer: "Réponse",
      blockCanvas: "Toile",
      blockFolder: "Dossier",
      blockDocument: "Bloc-note",
      blockPlanner: "Planificateur",
      blockText: "Texte",
      blockNote: "Note",
      blockTask: "Tâche",
      blockEvent: "Événement",
      blockProject: "Projet",
      blockHabit: "Habitude",
      blockStep: "Étape",
      blockJournal: "Entrée",
      blockLogbook: "Journal",
      blockPlaceholderLogbook: "Journal",
      thinkingLogbookEmpty: "Rien de consigné.",
      thinkingLogbookAdd: "Écrire aujourd'hui",
      blockPlaceholderJournal: "Ce qui a bougé, une idée…",
      blockPlaceholderStep: "Étape",
      blockLoop: "Boucle for",
      blockCondition: "Condition if",
      blockPlaceholderProblem: "Ce qui bloque…",
      blockPlaceholderSolution: "Une solution possible…",
      blockPlaceholderExample: "Un cas concret…",
      blockPlaceholderIdea: "Une piste à explorer…",
      blockPlaceholderQuestion: "Une question ouverte…",
      blockPlaceholderAnswer: "Une réponse…",
      blockPlaceholderCanvas: "Toile",
      blockPlaceholderFolder: "Dossier",
      blockPlaceholderDocument: "Bloc-note",
      blockPlaceholderText: "Écrivez librement…",
      blockPlaceholderNote: "Un détail à garder…",
      blockPlaceholderTask: "À faire…",
      blockPlaceholderEvent: "Événement à planifier…",
      blockPlaceholderProject: "Projet à lancer…",
      blockPlaceholderHabit: "Habitude à installer…",
      blockPlaceholderLoop: "Boucle",
      blockPlaceholderCondition: "Condition",
      blockPlaceholderPlanner: "Planificateur",
      thinkingLoopFor: "for day in",
      thinkingLoopChooseDays: "Choisir les jours",
      thinkingConditionIfHour: "if hour ==",
      thinkingConditionNoHour: "Choisissez une heure pour la condition.",
      thinkingLoopRun: "Marche",
      thinkingLoopRewind: "Annuler cette boucle",
      thinkingLoopNoDays: "Sélectionnez au moins un jour.",
      thinkingLoopNoActions: "Ajoutez au moins une action dans la boucle.",
      thinkingLoopCreated: "{count} éléments planifiés",
      thinkingLoopRewound: "Boucle annulée : {count} éléments supprimés",
      thinkingQuestionAddAnswer: "Ajouter une réponse",
      thinkingCanvasEmpty: "Déposez vos blocs ici.",
      thinkingFolderAdd: "Ajouter dans le dossier",
      thinkingDocumentEmpty: "Écrivez, ou déposez un bloc.",
      thinkingDocumentPlaceholder: "Commencez à écrire…",
      thinkingDocumentFormatting: "Mise en forme de la note",
      thinkingBulletsAria: "Liste à puces",
      thinkingNumberedAria: "Liste numérotée",
      thinkingResizeCanvas: "Redimensionner la toile",
      thinkingResizeFolder: "Rogner la vue du dossier",
      thinkingResizeBlock: "Redimensionner le bloc",
      thinkingCollapseCanvas: "Replier la toile",
      thinkingExpandCanvas: "Déplier la toile",
      thinkingOpenCanvasFullscreen: "Ouvrir la toile en plein écran",
      thinkingCollapseOrganization: "Replier",
      thinkingExpandOrganization: "Prévisualiser",
      thinkingOpenOrganization: "Ouvrir en plein écran",
      thinkingCloseCanvas: "Replier dans la toile mère",
      thinkingBaseCanvas: "Toile mère de base",
      thinkingExit: "Quitter le laboratoire",
      thinkingTrash: "Déposer pour supprimer",
      thinkingLinkHint: "Choisissez un autre bloc à relier.",
      thinkingLinkTool: "Liaison",
      thinkingCancel: "Annuler",
      thinkingChangeType: "Changer le type du bloc",
      thinkingConnectionOne: "liaison",
      thinkingConnectionMany: "liaisons",
      thinkingBlankTitle: "Commencez par ce qui vous occupe",
      thinkingBlankCopy: "Un problème, une question, une idée.",
      thinkingDeleteLink: "Glissez le fond pour déplacer la caméra · cliquez sur une liaison pour la supprimer.",
      boldAria: "Gras",
      italicAria: "Italique",
      underlineAria: "Souligner",
      highlightAria: "Surligner"
    },
    en: {
      greetingPrefix: "Hello",
      greetingSuffix: "!",
      welcomeQuestion: "What is happening today?",
      enterAria: "Enter the app",
      settingsAria: "Settings",
      homeAria: "Back to the welcome screen",
      settingsTitle: "Settings",
      tabSystem: "System",
      tabCustom: "Customization",
      brushAria: "Change the theme",
      brushedTo: "Theme:",
      tasksTitle: "Your tasks",
      backToToday: "Back to today",
      newEventName: "New event",
      undatedLabel: "No date",
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
      themeSakura: "Sakura",
      themeAqua: "Aquatic",
      themeForest: "Forest",
      themeBoreal: "Boreal",
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
      habitDropProject: "Link to this project",
      habitLinkedProject: "Habit linked to the project.",
      habitAlreadyLinkedProject: "This habit is already linked.",
      undoDeleted: "Item deleted",
      undoBtn: "Undo",
      decorLabel: "Decorations",
      decorParticles: "Particles",
      decorPetals: "Petals",
      decorBubbles: "Bubbles",
      decorSeabed: "Seabed",
      decorAurora: "Aurora",
      decorPollen: "Pollen",
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
      paletteTheme: "Theme\u2019s own",
      paletteAurora: "Aurora",
      paletteMeadow: "Meadow",
      paletteSunset: "Sunset",
      editTitle: "Edit",
      editNameLabel: "Name",
      editIconLabel: "Icon",
      editDateNone: "No date",
      notesLabel: "Notes",
      subtasksLabel: "Subtasks",
      stepsLabel: "Steps",
      pinLabel: "Pin",
      importantLabel: "Important",
      backAria: "Back",
      notesPlaceholder: "Add notes…",
      noteShowAria: "Show note",
      noteHideAria: "Hide note",
      addSubtaskPlaceholder: "Add a subtask…",
      stepPlaceholder: "Step",
      stepAdd: "Add a step",
      stepDragAria: "Drag this step to the tasks",
      stepDropTasks: "Drop into tasks",
      stepDropTimeline: "Drop onto the timeline",
      newerItemsAria: "Show newer items",
      olderItemsAria: "Show older items",
      skyAria: "The project sky",
      skyTitle: "The sky",
      skyEmpty: "The sky is empty. Light a first star.",
      skyOpenAria: "Open the project",
      capLabel: "The heading",
      whyPlaceholder: "Why this project?",
      outcomePlaceholder: "What does it look like once done?",
      stepsEmptyAdd: "No step yet — add one…",
      stepsViewRoadmap: "Roadmap",
      branchAdd: "Add a list",
      branchRemove: "Remove this constellation",
      branchName: "Constellation name",
      branchIconAria: "Change this constellation’s icon",
      branchSwitchAria: "Show the next constellation",
      moonAttach: "Habits of this constellation",
      moonNew: "New habit…",
      moonOff: "Detach the habit",
      moonEmptyAdd: "No habit yet — add one…",
      stepsViewList: "List",
      dreamLabel: "Dream wall",
      dreamAdd: "Card",
      dreamPlaceholder: "An idea, a reference, a want…",
      journalLabel: "Journal",
      journalAdd: "Log a move, an idea…",
      journalEmpty: "Nothing logged yet.",
      journalShowAria: "Show journal",
      journalHideAria: "Hide journal",
      promoteStep: "Make it a step",
      promotedLabel: "Became a step",
      taskLinked: "Task linked to the project",
      stepCreated: "Step added.",
      stepTarget: "Target date",
      lateLabel: "late",
      dormantFor: "nothing for",
      daysShort: "d",
      addEventPlaceholder: "Add an event…",
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
      thinkingAria: "Thinking space",
      thinkingUntitled: "Untitled canvas",
      thinkingSaved: "Saved",
      thinkingTools: "Canvas tools",
      thinkingAddBlock: "Add a block",
      thinkingAdd: "Add",
      thinkingOrganization: "Organization",
      thinkingBlocksLabel: "Blocks",
      thinkingPlanningLabel: "Planning",
      thinkingSwitchTools: "Switch tool category",
      thinkingAddStuck: "Add a stuck element",
      thinkingMoveStuckSingle: "Move only this element",
      thinkingSelect: "Select",
      thinkingSelectionOne: "1 block selected",
      thinkingSelectionMany: "{count} blocks selected",
      thinkingPutInCanvas: "Put in a new canvas",
      blockProblem: "Problem",
      blockSolution: "Solution",
      blockExample: "Example",
      blockIdea: "Idea",
      blockQuestion: "Question",
      blockAnswer: "Answer",
      blockCanvas: "Canvas",
      blockFolder: "Folder",
      blockDocument: "Notepad",
      blockPlanner: "Planner",
      blockText: "Text",
      blockNote: "Note",
      blockTask: "Task",
      blockEvent: "Event",
      blockProject: "Project",
      blockHabit: "Habit",
      blockStep: "Step",
      blockJournal: "Entry",
      blockLogbook: "Journal",
      blockPlaceholderLogbook: "Journal",
      thinkingLogbookEmpty: "Nothing logged.",
      thinkingLogbookAdd: "Write today",
      blockPlaceholderJournal: "What moved, an idea…",
      blockPlaceholderStep: "Step",
      blockLoop: "For loop",
      blockCondition: "If condition",
      blockPlaceholderProblem: "What is in the way…",
      blockPlaceholderSolution: "A possible solution…",
      blockPlaceholderExample: "A concrete case…",
      blockPlaceholderIdea: "A path to explore…",
      blockPlaceholderQuestion: "An open question…",
      blockPlaceholderAnswer: "An answer…",
      blockPlaceholderCanvas: "Canvas",
      blockPlaceholderFolder: "Folder",
      blockPlaceholderDocument: "Notepad",
      blockPlaceholderText: "Write freely…",
      blockPlaceholderNote: "A detail to keep…",
      blockPlaceholderTask: "To do…",
      blockPlaceholderEvent: "Event to schedule…",
      blockPlaceholderProject: "Project to start…",
      blockPlaceholderHabit: "Habit to build…",
      blockPlaceholderLoop: "Loop",
      blockPlaceholderCondition: "Condition",
      blockPlaceholderPlanner: "Planner",
      thinkingLoopFor: "for day in",
      thinkingLoopChooseDays: "Choose days",
      thinkingConditionIfHour: "if hour ==",
      thinkingConditionNoHour: "Choose a time for the condition.",
      thinkingLoopRun: "Run",
      thinkingLoopRewind: "Undo this loop",
      thinkingLoopNoDays: "Select at least one day.",
      thinkingLoopNoActions: "Add at least one action to the loop.",
      thinkingLoopCreated: "{count} items scheduled",
      thinkingLoopRewound: "Loop undone: {count} items removed",
      thinkingQuestionAddAnswer: "Add an answer",
      thinkingCanvasEmpty: "Drop your blocks here.",
      thinkingFolderAdd: "Add to the folder",
      thinkingDocumentEmpty: "Write, or drop a block.",
      thinkingDocumentPlaceholder: "Start writing…",
      thinkingDocumentFormatting: "Note formatting",
      thinkingBulletsAria: "Bulleted list",
      thinkingNumberedAria: "Numbered list",
      thinkingResizeCanvas: "Resize canvas",
      thinkingResizeFolder: "Crop folder view",
      thinkingResizeBlock: "Resize block",
      thinkingCollapseCanvas: "Collapse canvas",
      thinkingExpandCanvas: "Expand canvas",
      thinkingOpenCanvasFullscreen: "Open canvas fullscreen",
      thinkingCollapseOrganization: "Collapse",
      thinkingExpandOrganization: "Preview",
      thinkingOpenOrganization: "Open fullscreen",
      thinkingCloseCanvas: "Collapse into the parent canvas",
      thinkingBaseCanvas: "Base parent canvas",
      thinkingExit: "Exit the idea laboratory",
      thinkingTrash: "Drop to delete",
      thinkingLinkHint: "Choose another block to connect.",
      thinkingLinkTool: "Link",
      thinkingCancel: "Cancel",
      thinkingChangeType: "Change block type",
      thinkingConnectionOne: "connection",
      thinkingConnectionMany: "connections",
      thinkingBlankTitle: "Start with what is on your mind",
      thinkingBlankCopy: "A problem, a question, an idea.",
      thinkingDeleteLink: "Drag the background to move the camera · click a connection to delete it.",
      boldAria: "Bold",
      italicAria: "Italic",
      underlineAria: "Underline",
      highlightAria: "Highlight"
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
    light: "#f6ecf7", dark: "#1e1c26", sakura: "#fdeef2",
    dawn: "#ffc9d8", day: "#d0e6ff", dusk: "#e97ba0", night: "#0c0f1a", rain: "#39414c",
    aqua: "#0d3145", forest: "#e9efdd", boreal: "#0b1c2c"
  };

  /* A theme can bring decorations with it — sakura its petals, aquatic its
     bubbles and its seabed. They are lent, not given: leaving the theme takes
     back whatever it lent, or sakura's petals would go on falling underwater.
     Touch one in the decoration panel and it stops being lent and becomes
     yours, which is how you keep the petals if you want them everywhere. */
  const THEME_DECOR = {
    sakura: ["petals"],
    aqua: ["bubbles", "seabed"],
    forest: ["pollen"],
    boreal: ["aurora"]
  };

  function applyThemeDecor(effective) {
    const active = state.settings.decorations;
    const lent = state.settings.themeDecorLent;
    for (let i = 0; i < lent.length; i++) {
      const at = active.indexOf(lent[i]);
      if (at !== -1) active.splice(at, 1);
    }
    lent.length = 0;
    const wanted = THEME_DECOR[effective] || [];
    for (let i = 0; i < wanted.length; i++) {
      if (active.indexOf(wanted[i]) === -1) {
        active.push(wanted[i]);
        lent.push(wanted[i]);
      }
    }
  }

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
  let shownTheme = null;
  function applyTheme(themeName) {
    const effective = themeName === "auto" ? timeTheme() : themeName;
    const changed = effective !== shownTheme;
    shownTheme = effective;
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
    tuneThresholdInk();   // a new sky may be a new colour under the threshold
    if (changed) renderScene();   // and a new theme is a different place entirely
    // The step ramp is the theme's now, and step colours are written inline by
    // the script — so they only follow once what carries them is laid out again.
    // Guarded on a real change: the adaptive theme comes back through here twice
    // a minute and must not rebuild three lists for nothing.
    if (changed) repaintPalette();
  }

  /* Apply a color palette (theme / aurora / meadow / sunset) via a root attribute. */
  function applyPalette(paletteName) {
    document.documentElement.setAttribute("data-palette", paletteName);
    applyPaletteVars();
    const paletteButtons = document.querySelectorAll(".palette");
    for (let i = 0; i < paletteButtons.length; i++) {
      paletteButtons[i].classList.toggle("is-active", paletteButtons[i].dataset.palette === paletteName);
    }
    paintZellige();
    repaintPalette();
  }

  /* everything drawn with a stop read back from the ramp */
  function repaintPalette() {
    if (!appReady) return;   // startup lays all of this out anyway
    renderList("tasks");
    renderList("projects");
    renderHabits();
    renderDailyTimeline();
    if (!skyView.hidden) renderSky();
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
  // where the rule lives in the app, so it can be handed straight back
  const dayLineHome = dayLine && dayLine.parentNode;
  const dayLineNext = dayLine && dayLine.nextSibling;

  /* The day rule spends the welcome screen in the middle of the page, blown up.
     Entering does not swap one for another: the very same element is moved back
     where it belongs and flown from where it was to where it lands. */
  if (dayLine && welcomeSlot) welcomeSlot.appendChild(dayLine);

  /* THE SCENERY — the threshold is looked at, not worked in, so it can afford
     what the workspace cannot: silhouettes across the whole page, things that
     cross it, drawings big enough to be read as drawings. It is built when the
     threshold is up and torn down on the way in, so none of it costs anything
     while there is work on screen.

     Everything here is a span with a class; the shapes and the motion live in
     the stylesheet, and the script only says how many, where, and how fast. */
  const scene = document.getElementById("scene");

  function sceneEl(cls, host) {
    const el = document.createElement("span");
    el.className = cls;
    (host || scene).appendChild(el);
    return el;
  }

  function clearScene() {
    if (scene) scene.innerHTML = "";
  }

  const SCENERY = {
    /* the hanami view: branches from three corners, at three scales, each
       breathing on its own time so the canopy never moves as one piece */
    sakura: function () {
      const corners = [
        { cls: "sc-bough--ne", w: 46, delay: 0 },
        { cls: "sc-bough--nw", w: 38, delay: -4 },
        { cls: "sc-bough--w", w: 26, delay: -8 }
      ];
      for (let i = 0; i < corners.length; i++) {
        const bough = sceneEl("sc-bough " + corners[i].cls);
        bough.style.width = corners[i].w + "%";
        // the sway lives on the pseudo-element, so it is handed over as a var
        bough.style.setProperty("--sway", rand(11, 17) + "s");
        bough.style.setProperty("--sway-at", corners[i].delay + "s");
      }
      for (let i = 0; i < 4; i++) {
        const cluster = sceneEl("sc-blossom");
        cluster.style.left = rand(6, 90) + "%";
        cluster.style.top = rand(8, 30) + "%";
        const size = rand(22, 38);
        cluster.style.width = size + "px";
        cluster.style.height = size + "px";
        cluster.style.animationDuration = rand(7, 13) + "s";
        cluster.style.animationDelay = -rand(0, 10) + "s";
      }
    },

    /* the kelp bed proper, and a school crossing it: both are far too busy for
       a page with tasks on it, and exactly right for one with nothing on it */
    aqua: function () {
      for (let i = 0; i < 16; i++) {
        const weed = sceneEl("sc-weed");
        weed.style.height = rand(14, 40) + "vh";
        weed.style.width = rand(12, 34) + "px";
        weed.style.left = rand(-3, 99) + "%";
        weed.style.setProperty("--lean", rand(6, 15) + "deg");
        weed.style.opacity = rand(0.22, 0.6).toFixed(2);
        weed.style.animationDuration = rand(5, 10) + "s";
        weed.style.animationDelay = -rand(0, 8) + "s";
      }
      for (let s = 0; s < 3; s++) {
        const school = sceneEl("sc-school");
        school.style.top = rand(18, 48) + "%";   // where there is still light to be seen against
        school.style.animationDuration = rand(38, 72) + "s";
        school.style.animationDelay = -rand(0, 60) + "s";
        if (s % 2) school.classList.add("sc-school--back");
        for (let f = 0; f < 9; f++) {
          const fish = sceneEl("sc-fish", school);
          fish.style.left = rand(0, 190) + "px";
          fish.style.top = rand(0, 84) + "px";
          const size = rand(13, 26);
          fish.style.width = size + "px";
          fish.style.height = size * 0.5 + "px";
          fish.style.animationDuration = rand(1.6, 3.2) + "s";
          fish.style.animationDelay = -rand(0, 3) + "s";
        }
      }
    },

    /* a ridge of pines under the aurora, and the sky above it deepened */
    boreal: function () { sceneEl("sc-ridge sc-ridge--pines"); },

    /* undergrowth along the bottom edge, in silhouette */
    forest: function () {
      sceneEl("sc-ridge sc-ridge--ferns");
      for (let i = 0; i < 7; i++) {
        const trunk = sceneEl("sc-trunk");
        trunk.style.left = rand(-4, 98) + "%";
        trunk.style.width = rand(6, 18) + "px";
        trunk.style.height = rand(38, 78) + "vh";
        trunk.style.opacity = rand(0.05, 0.13).toFixed(2);
        trunk.style.animationDuration = rand(9, 16) + "s";
        trunk.style.animationDelay = -rand(0, 12) + "s";
      }
    },

    dawn: function () { skyScene(); flock(); },
    dusk: function () { skyScene(); },

    day: function () {
      for (let i = 0; i < 4; i++) {
        const cloud = sceneEl("sc-cloud");
        cloud.style.top = rand(4, 34) + "%";
        cloud.style.width = rand(180, 420) + "px";
        cloud.style.height = rand(48, 96) + "px";
        cloud.style.opacity = rand(0.3, 0.7).toFixed(2);
        cloud.style.animationDuration = rand(90, 190) + "s";
        cloud.style.animationDelay = -rand(0, 160) + "s";
      }
      flock();
    }
  };

  /* DUSK AND DAWN — here the sky is the whole subject, so the scenery is light
     and not things. The rule of time is the horizon, and the sun it already
     carries is the only sun there is. All the scenery adds is cloud, which is
     what makes a sky read as a sunset rather than as a gradient. */
  function skyScene() {
    for (let i = 0; i < 8; i++) {
      const band = sceneEl("sc-band");
      band.style.width = rand(16, 52) + "%";
      band.style.height = rand(6, 18) + "px";
      band.style.left = rand(-10, 82) + "%";
      // bands sit above the horizon far more often than below it
      band.style.setProperty("--above", rand(-4, 30) + "vh");
      band.style.opacity = rand(0.18, 0.6).toFixed(2);
      band.style.animationDuration = rand(120, 260) + "s";
      band.style.animationDelay = -rand(0, 200) + "s";
    }
    syncSceneHorizon();
  }

  /* THE RULE IS THE HORIZON — the cloud bands hang above and below it, so they
     need to know where it actually sits. Read off the strip, which is the scale
     the rule draws everything against, and re-run on every redraw, since the
     weather answers long after the threshold is built. */
  function syncSceneHorizon() {
    if (!scene) return;
    const box = scene.getBoundingClientRect();
    const strip = welcomeSlot.querySelector(".dtl__strip");
    if (!box.height || !strip) return;
    const rule = strip.getBoundingClientRect();
    if (!rule.width) return;
    scene.style.setProperty("--horizon", (rule.top + rule.height / 2 - box.top) + "px");
  }

  /* a handful of birds crossing, in silhouette, flapping out of step */
  function flock() {
    const line = sceneEl("sc-flock");
    line.style.top = rand(14, 30) + "%";
    line.style.animationDuration = rand(46, 78) + "s";
    line.style.animationDelay = -rand(0, 40) + "s";
    for (let i = 0; i < 6; i++) {
      const bird = sceneEl("sc-bird", line);
      bird.style.left = rand(0, 120) + "px";
      bird.style.top = rand(0, 34) + "px";
      const size = rand(7, 13);
      bird.style.width = size + "px";
      bird.style.height = size * 0.62 + "px";
      bird.style.animationDuration = rand(0.5, 0.9) + "s";
      bird.style.animationDelay = -rand(0, 1) + "s";
    }
  }

  function renderScene() {
    if (!scene) return;
    clearScene();
    if (welcomeScreen.dataset.gone) return;   // nothing to look at, nothing to build
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const build = SCENERY[currentThemeName()];
    if (build) build();
  }

  /* the rule is one element flown between two homes; both directions measure it
     where it is, move it, then play it from there to where it landed */
  function flyRule(from, scaleFrom) {
    if (!from || !dayLine) return;
    const to = dayLine.getBoundingClientRect();
    dayLine.style.transformOrigin = "50% 50%";
    dayLine.style.transition = "none";
    dayLine.style.transform = "translate(" + (from.left - to.left) + "px,"
      + (from.top - to.top) + "px) scale(" + scaleFrom + ")";
    dayLine.offsetWidth;                       // commit before releasing
    dayLine.style.transition = "transform " + APP_ENTER_MS + "ms cubic-bezier(.22,.8,.25,1)";
    dayLine.style.transform = "";
    setTimeout(function () {
      dayLine.style.transition = "";
      dayLine.style.transformOrigin = "";
      renderTimeRule();                        // measure it where it landed
    }, APP_ENTER_MS);
  }

  /* enterApp arms two timers that undo the threshold; going back has to cancel
     them or a quick return lands on a screen still being taken down */
  let thresholdTimers = [];
  function clearThresholdTimers() {
    for (let i = 0; i < thresholdTimers.length; i++) clearTimeout(thresholdTimers[i]);
    thresholdTimers = [];
  }

  function enterApp() {
    if (!welcomeScreen || welcomeScreen.dataset.gone) return;
    welcomeScreen.dataset.gone = "1";
    clearThresholdTimers();

    const from = dayLine ? dayLine.getBoundingClientRect() : null;
    appScreen.hidden = false;
    if (dayLine && dayLineHome) dayLineHome.insertBefore(dayLine, dayLineNext);
    // the rail was measured while the app was still display:none, so its height
    // was zero; now that it has a size, take it again
    syncPagesHeight(false);
    requestAnimationFrame(function () {
      syncPagesHeight(false);
      renderDailyTimeline();
    });

    flyRule(from, WELCOME_RULE_SCALE);

    welcomeScreen.classList.add("is-leaving");
    clearScene();          // the scenery is the threshold's, and goes with it
    setZelligeOn(false);   // parked, but keep the threshold tidy either way
    thresholdTimers.push(setTimeout(function () {
      welcomeScreen.style.display = "none";
    }, 560));
    thresholdTimers.push(setTimeout(function () {
      setFieldWelcome(false);   // let the ground settle
    }, 900));
    ensureSunData();   // ask for location only once the app is entered
  }

  /* Back out to the threshold. Everything enterApp did, undone in the same
     terms: the same rule flies the other way, the threshold's own ground comes
     back up, and the scenery is built again for whatever theme is on now. */
  function leaveApp() {
    if (!welcomeScreen || !welcomeScreen.dataset.gone) return;
    clearThresholdTimers();
    delete welcomeScreen.dataset.gone;

    const from = dayLine ? dayLine.getBoundingClientRect() : null;
    welcomeScreen.style.display = "";
    welcomeScreen.classList.remove("is-leaving");
    if (dayLine && welcomeSlot) welcomeSlot.appendChild(dayLine);
    appScreen.hidden = true;
    renderDailyTimeline();
    // the rule is 1.35x on the threshold, so coming back it starts small
    flyRule(from, 1 / WELCOME_RULE_SCALE);

    setFieldWelcome(true);
    renderGreeting();
    renderWelcomeHabits();
    renderScene();
  }

  document.getElementById("homeBtn").addEventListener("click", leaveApp);

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

  /* THE BRUSH — repaints the app with another theme. Semi-random rather than
     random: it draws from a bag holding every theme once, so it never repeats
     and never clumps, and refills only when the bag is empty. Straight random
     gives you the same theme twice in a row often enough to feel broken.
     "auto" is left out of the bag — it is an hour, not a colour, and the point
     of the brush is to see somewhere else. */
  const BRUSH_THEMES = ["light", "dark", "sakura", "aqua", "forest", "boreal",
                        "dawn", "day", "dusk", "night", "rain"];
  let brushBag = [];

  function brushNextTheme() {
    const here = currentThemeName();
    if (!brushBag.length) {
      brushBag = BRUSH_THEMES.slice();
      // never open a fresh bag on the theme already showing
      const at = brushBag.indexOf(here);
      if (at !== -1) brushBag.splice(at, 1);
    }
    const pick = Math.floor(Math.random() * brushBag.length);
    return brushBag.splice(pick, 1)[0];
  }

  document.getElementById("lookBtn").addEventListener("click", function () {
    const next = brushNextTheme();
    state.settings.theme = next;
    applyTheme(next);
    applyThemeDecor(next);   // it arrives with whatever it brings, as when picked
    applyDecorations();
    saveState();
    showToast(translate("brushedTo") + " " + translate("theme" + next.charAt(0).toUpperCase() + next.slice(1)));
  });

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
      applyThemeDecor(currentThemeName());   // sakura arrives with its petals
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
  const PAINT_THEMES = ["light", "dark", "sakura", "aqua", "forest", "boreal",
                        "dawn", "day", "dusk", "night", "rain"];
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
  function probeFor(pairs) {
    const key = pairs.join("|");
    if (slotProbes[key]) return slotProbes[key];
    if (!probeHost) {
      probeHost = document.createElement("div");
      probeHost.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;"
        + ALL_SLOTS.concat(IMP_SLOTS).map(function (slot) { return slot + ":initial"; }).join(";");
      document.body.appendChild(probeHost);
    }
    const probe = document.createElement("div");
    for (let i = 0; i < pairs.length; i += 2) probe.setAttribute(pairs[i], pairs[i + 1]);
    probeHost.appendChild(probe);
    slotProbes[key] = probe;
    return probe;
  }
  function readThemeSlot(name, slot) {
    return getComputedStyle(probeFor(["data-theme", name])).getPropertyValue(slot).trim();
  }
  function readPaletteSlot(name, slot) {
    return getComputedStyle(probeFor(["data-palette", name])).getPropertyValue(slot).trim();
  }
  /* the theme's own ramp needs both attributes: it is declared on the pair */
  function readThemeStop(name, slot) {
    return getComputedStyle(probeFor(["data-palette", "theme", "data-theme", name]))
      .getPropertyValue(slot).trim();
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
     their touch-ups live under the palette name. The theme's own ramp belongs to
     the theme on screen instead — one editable ramp per theme. */
  function impStore() {
    if (state.settings.palette !== "theme") {
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
        applyThemeDecor(currentThemeName());
        applyDecorations();
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
    const names = ["theme", "aurora", "meadow", "sunset"];
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const button = document.createElement("button");
      button.type = "button";
      button.className = name === state.settings.palette ? "palette is-active" : "palette";
      button.dataset.palette = name;
      button.innerHTML = '<span class="palette__sw"></span><span>'
        + translate("palette" + name.charAt(0).toUpperCase() + name.slice(1)) + "</span>";
      // the swatch bar previews the stops the button stands for; the theme's own
      // ramp is not on this button's attributes, so it is written on by hand
      if (name === "theme") {
        const own = state.settings.themePalettes[currentThemeName()];
        for (let k = 0; k < IMP_SLOTS.length; k++) {
          button.style.setProperty(IMP_SLOTS[k], (own && own[IMP_SLOTS[k]])
            || readThemeStop(currentThemeName(), IMP_SLOTS[k]));
        }
      }
      button.addEventListener("click", function () {
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
    if (state.settings.palette === "theme") return readThemeStop(currentThemeName(), slot);
    return readPaletteSlot(state.settings.palette, slot);
  }

  function editImp(slot, hex) {
    const settings = state.settings;
    let store;
    if (settings.palette === "theme") {
      const theme = currentThemeName();
      store = settings.themePalettes[theme] || (settings.themePalettes[theme] = {});
    } else {
      store = settings.paletteEdits[settings.palette] || (settings.paletteEdits[settings.palette] = {});
    }
    store[slot] = hex;
    applyPaletteVars();
    repaintPalette();
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
    if (state.settings.palette === "theme") delete state.settings.themePalettes[currentThemeName()];
    else delete state.settings.paletteEdits[state.settings.palette];
    applyPaletteVars();
    repaintPalette();
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
      p.style.height = size * 1.2 + "px";   // a petal is longer than it is wide
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
  /* the seabed: a floor, its kelp, and the shafts coming down from the surface.
     One layer, so bubbles alone still work without the whole underwater room. */
  function spawnSeabed() {
    decor.appendChild(decorEl("sea-floor"));
    for (let i = 0; i < 9; i++) {
      const weed = decorEl("sea-weed");
      const height = rand(9, 26);
      weed.style.height = height + "vh";
      weed.style.width = rand(10, 26) + "px";
      weed.style.left = rand(-2, 98) + "%";
      weed.style.setProperty("--lean", rand(5, 13) + "deg");
      weed.style.animationDuration = rand(5, 9) + "s";
      weed.style.animationDelay = -rand(0, 6) + "s";
      decor.appendChild(weed);
    }
    // The sun sits at one point above the surface, so every shaft leans away
    // from it by its own distance: that spread is what stops them reading as a
    // row of painted stripes. Widths are deliberately uneven for the same reason.
    const sunAt = rand(28, 66);
    for (let i = 0; i < 7; i++) {
      const ray = decorEl("sea-ray");
      const at = rand(-16, 108);
      ray.style.left = at + "%";
      ray.style.width = rand(26, 120) + "px";
      ray.style.height = rand(58, 100) + "vh";
      ray.style.setProperty("--tilt", (at - sunAt) * 0.17 + "deg");
      ray.style.setProperty("--thin", rand(0.5, 0.8).toFixed(2));
      ray.style.setProperty("--wide", rand(1.1, 1.5).toFixed(2));
      ray.style.setProperty("--dim", rand(0.14, 0.3).toFixed(2));
      ray.style.setProperty("--lit", rand(0.55, 0.9).toFixed(2));
      ray.style.animationDuration = rand(8, 19) + "s";
      ray.style.animationDelay = -rand(0, 16) + "s";
      decor.appendChild(ray);
    }
  }

  /* aurora curtains: the envelope drifts, the striations scroll inside it */
  function spawnAurora() {
    // one curtain per third of the width, jittered inside it: left to chance they
    // stack in the same corner half the time and the sky looks lopsided
    for (let i = 0; i < 3; i++) {
      const curtain = decorEl("aurora");
      curtain.style.width = rand(26, 44) + "%";
      curtain.style.left = (i * 34 - 10 + rand(-7, 7)) + "%";
      curtain.style.top = rand(-12, -2) + "%";
      curtain.style.animationDuration = rand(16, 28) + "s";
      curtain.style.animationDelay = -rand(0, 20) + "s";
      const veil = decorEl("aurora__veil");
      veil.style.animationDuration = rand(14, 24) + "s";
      veil.style.animationDelay = -rand(0, 18) + "s";
      curtain.appendChild(veil);
      decor.appendChild(curtain);
    }
  }

  function spawnPollen() {
    for (let i = 0; i < 22; i++) {
      const p = decorEl("pollen");
      const size = rand(2, 5);
      p.style.width = size + "px";
      p.style.height = size + "px";
      p.style.left = rand(0, 100) + "%";
      p.style.top = rand(20, 100) + "%";
      p.style.setProperty("--sway", rand(-60, 60) + "px");
      p.style.animationDuration = rand(16, 30) + "s, " + rand(3, 7) + "s";
      p.style.animationDelay = -rand(0, 26) + "s, " + -rand(0, 6) + "s";
      decor.appendChild(p);
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
    + " .quick__field, .ecal, .modal__card";
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
  /* The zellige is parked, not removed: the whole painter is still here and
     comes back by flipping this to true. The threshold meanwhile stands on the
     app's own ground — the sky, with the block field over it. */
  const ZELLIGE_ON_THRESHOLD = false;

  function setFieldWelcome(on) {
    setZelligeOn(on && ZELLIGE_ON_THRESHOLD);
    setFieldOn((!on || !ZELLIGE_ON_THRESHOLD)
               && state.settings.decorations.indexOf("field") !== -1);
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
      else if (active[i] === "seabed") spawnSeabed();
      else if (active[i] === "aurora") spawnAurora();
      else if (active[i] === "pollen") spawnPollen();
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
      // touching it takes it off the theme's hands, either way round
      const lent = state.settings.themeDecorLent;
      const lentAt = lent.indexOf(name);
      if (lentAt !== -1) lent.splice(lentAt, 1);
      saveState();
      applyDecorations();
    });
  }

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
    const places = taskRowPlaces();   // where every row stood before the rebuild
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

    slideTaskRows(places);
  }

  /* MOVED, NOT REDRAWN — a list is rebuilt whole on every change, so without this
     every row plays its entry again and the whole thing flashes for one item
     changing place. Rows that were already there are handed their old position
     back and then let go, so they slide to where they now belong; only rows that
     are genuinely new still fade in. Both axes: a roadmap lays its steps across. */
  const ROW_SLIDE_MS = 260;

  function rowPlaces(selector, key) {
    const places = {};
    const rows = document.querySelectorAll(selector);
    for (let i = 0; i < rows.length; i++) {
      const id = rows[i].dataset[key];
      if (id) places[id] = rows[i].getBoundingClientRect();
    }
    return places;
  }

  function slideRows(selector, key, places) {
    const rows = document.querySelectorAll(selector);
    const moving = [];
    for (let i = 0; i < rows.length; i++) {
      const was = places[rows[i].dataset[key]];
      if (!was) continue;                   // new here: let it arrive on its own
      rows[i].classList.add("is-settled");  // a survivor does not enter twice
      const box = rows[i].getBoundingClientRect();
      const dx = was.left - box.left;
      const dy = was.top - box.top;
      if (!dx && !dy) continue;
      rows[i].style.transform = "translate(" + dx.toFixed(1) + "px, " + dy.toFixed(1) + "px)";
      moving.push(rows[i]);
    }
    if (!moving.length) return;

    requestAnimationFrame(function () {
      for (let i = 0; i < moving.length; i++) {
        moving[i].style.transition = "transform " + ROW_SLIDE_MS + "ms cubic-bezier(.22, .8, .25, 1)";
        moving[i].style.transform = "";
      }
      setTimeout(function () {
        for (let i = 0; i < moving.length; i++) {
          moving[i].style.transition = "";
        }
      }, ROW_SLIDE_MS + 40);
    });
  }

  function taskRowPlaces() { return rowPlaces("#tasksList .item", "id"); }
  function slideTaskRows(places) { slideRows("#tasksList .item", "id", places); }

  /* the same, for every step on screen: checklist rows and roadmap dots alike */
  const STEP_NODES = ".psteps [data-step-id]";
  function stepPlaces() { return rowPlaces(STEP_NODES, "stepId"); }
  function slideSteps(places) { slideRows(STEP_NODES, "stepId", places); }

  /* One day of the flow. Today is always open and carries no control: it is the
     day being lived. Every other day arrives folded and unfolds on its head —
     the whole anchored bar is the target, not just the chevron. */
  function createTaskDay(key, tasks) {
    const isToday = key === todayKey();
    const collapsed = !isToday && dayCollapsed(key);
    const group = document.createElement("div");
    group.className = "tgroup tgroup--day";
    group.dataset.day = key;        // the grid reaches its day through this
    group.dataset.dropGroup = key;  // and a step or a row can be dropped into it
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
    if (key === "none") group.dataset.dropGroup = "";   // no day: the undated tail
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
      const stepColor = stepTaskColor(item);
      if (stepColor) {
        row.classList.add("item--step-linked");
        row.style.setProperty("--task-step-color", stepColor);
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
        ".unfold, .detail__titlerow, .item__check, .goal-inline__name, .goal-inline__journal-toggle")) return;
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
    // Every task can be dropped on the clock and every row can reach the bin.
    // Projects otherwise keep their existing manual reorder behaviour.
    if (listName === "tasks" || listName === "projects") {
      if (listName === "tasks") row.dataset.schedulable = "1";
      armLongPress(row, listName);
    }

    if (listName === "projects") {
      const icon = document.createElement("button");
      icon.type = "button";
      icon.className = "item__ico item__ico--editable";
      icon.setAttribute("aria-label", translate("editIconLabel"));
      icon.title = translate("editIconLabel");
      icon.innerHTML = projectSvg(item.icon || "folder");
      icon.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        openIconPickerForProject(item);
      });
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
    if (listName === "projects" && allProjectSteps(item).length) meta.appendChild(createStepBadge(item));
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
      if (event.target.closest(
        ".item__check, .row-acts, .unfold, .detail__titlerow, .goal-inline__name, .goal-inline__journal-toggle")) return;
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
      canDelete: listName === "tasks" || listName === "projects",
      ghost: ghost,
      offsetX: Math.max(20, Math.min(rect.width - 20, event.clientX - rect.left)),
      offsetY: Math.max(12, Math.min(rect.height - 12, event.clientY - rect.top)),
      pointerX: event.clientX,
      pointerY: event.clientY,
      pointerId: event.pointerId,
      drop: null,
      deleting: false,
      undatedDrop: false,
      undatedBeforeId: null,
      undatedDay: null,
      projectDrop: null,
      projectRow: null,
      crossedLists: false,
      reordered: false
    };
    if (row.setPointerCapture) {
      try { row.setPointerCapture(event.pointerId); } catch (err) {}
    }
    row.classList.add("is-dragging");
    // a selection made before the press became a drag would ride along with it
    const selection = window.getSelection && window.getSelection();
    if (selection && selection.removeAllRanges) selection.removeAllRanges();
    if (rowDrag.canDelete) showTimelineTrash(true, false);
    // the objectives offer themselves for the length of the drag, guide and all
    if (listName === "tasks") showHabitProjectTargets();
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

  const PREVIEW_TASK_ICON = '<circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/>';

  function showTaskDrop(drop, task, under, iconMarkup) {
    const preview = document.getElementById("taskDropPreview");
    if (!drop) {
      preview.hidden = true;
      dtlEl.classList.remove("is-task-target");
      return;
    }
    // the preview stands or hangs like the thing it stands in for, and its stem
    // is drawn from the matching end — the two must not disagree
    const hangs = under !== false;
    preview.classList.toggle("dtl__event--under", hangs);
    // an event is not a task: it keeps its own icon and its own colour, or the
    // preview promises to drop something other than what is in hand
    preview.classList.toggle("dtl__task", !iconMarkup);
    preview.querySelector(".dtl__event-icon").innerHTML =
      iconMarkup || iconSvg(PREVIEW_TASK_ICON);
    preview.querySelector(".dtl__event-path").setAttribute("d", hangs
      ? "M40 44 C40 26 40 30 40 2" : "M40 30 C40 48 40 44 40 72");
    preview.querySelector(".dtl__event-foot").setAttribute("cy", hangs ? "2" : "72");
    // A real marker is placed inside its box by the renderer; the preview is written
    // in the page and has no such placement of its own. Hanging releases the CSS
    // top without supplying a bottom, so without this its icon falls back to the
    // head of a box that now hangs — the card pointing the wrong way.
    restIcon(preview, hangs);
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

  /* List rows use the same bin as timeline markers. Check it before either
     scheduling destination so a destructive drop is always unambiguous. */
  function updateRowTrashDrop() {
    if (!rowDrag || !rowDrag.canDelete) return false;
    const deleting = timelineTrashHit(rowDrag.pointerX, rowDrag.pointerY);
    rowDrag.deleting = deleting;
    rowDrag.ghost.classList.toggle("is-delete-target", deleting);
    showTimelineTrash(true, deleting);
    if (!deleting) return false;

    rowDrag.drop = null;
    showTaskDrop(null);
    const group = document.querySelector('.tgroup[data-drop-group=""]');
    if (group) group.classList.remove("is-drop-target");
    rowDrag.undatedDrop = false;
    rowDrag.undatedBeforeId = null;
    if (rowDrag.crossedLists) restoreDraggedRowOrigin(rowDrag);
    return true;
  }

  function updateRowDragDestinations() {
    const deleting = updateRowTrashDrop();
    const project = deleting ? null : updateProjectDrop();
    const drop = (deleting || project) ? null : updateRowTimelineDrop();
    const undatedDrop = (deleting || project) ? false : updateUndatedDrop();
    return { deleting: deleting, drop: drop, undatedDrop: undatedDrop };
  }

  /* A TASK GIVEN TO A PROJECT — dropped on a project's row it joins that project,
     exactly as a habit does, and through the same targets and the same guide: one
     visual for one gesture, whatever is being carried. It takes precedence over
     the day groups, since a project row sits in a column of its own and landing
     on one can only ever have been meant. */
  function updateProjectDrop() {
    if (!rowDrag || rowDrag.listName !== "tasks") return null;
    const target = habitProjectDropAt(rowDrag.pointerX, rowDrag.pointerY);
    // the habit drag marks and unmarks one row at a time; do the same rather than
    // sweep every row on every frame
    if (rowDrag.projectRow && rowDrag.projectRow !== (target && target.row)) {
      rowDrag.projectRow.classList.remove("is-habit-drop-target");
    }
    rowDrag.projectRow = target ? target.row : null;
    if (target) target.row.classList.add("is-habit-drop-target");
    rowDrag.projectDrop = target ? target.project.id : null;
    return rowDrag.projectDrop;
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

  /* WHICH GROUP OF THE LIST IS UNDER THE POINTER — the undated tail and every day
     on show answer the same way, so a step or a row is dropped into any of them
     through one reader. `day` is the key it lands on, or "" for no date at all. */
  function dropGroupAt(clientX, clientY) {
    const groups = document.querySelectorAll(".tgroup[data-drop-group]");
    for (let i = 0; i < groups.length; i++) {
      const rect = groups[i].getBoundingClientRect();
      if (clientX >= rect.left - 10 && clientX <= rect.right + 10
        && clientY >= rect.top - 10 && clientY <= rect.bottom + 18) return groups[i];
    }
    return null;
  }

  function undatedDropPosition(clientX, clientY) {
    const group = dropGroupAt(clientX, clientY);
    if (!group) return null;

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
      day: group.dataset.dropGroup || null,
      beforeNode: beforeNode,
      beforeId: beforeNode ? beforeNode.dataset.id : null
    };
  }

  /* The permanent "Sans date" group accepts a drop on its head, its empty
     space, or between two rows. Moving the real source row gives an exact
     insertion preview while the floating copy stays under the pointer. */
  function clearDropGroups() {
    const groups = document.querySelectorAll(".tgroup[data-drop-group]");
    for (let i = 0; i < groups.length; i++) groups[i].classList.remove("is-drop-target");
  }

  function updateUndatedDrop() {
    if (!rowDrag || !rowDrag.canSchedule) return false;
    const task = findTask(rowDrag.row.dataset.id);
    if (!task || task.done) return false;
    const position = undatedDropPosition(rowDrag.pointerX, rowDrag.pointerY);
    clearDropGroups();
    if (!position) {
      rowDrag.undatedDrop = false;
      rowDrag.undatedBeforeId = null;
      rowDrag.undatedDay = null;
      if (rowDrag.crossedLists) restoreDraggedRowOrigin(rowDrag);
      return false;
    }

    const group = position.group;
    group.classList.add("is-drop-target");
    rowDrag.undatedDrop = true;
    rowDrag.undatedDay = position.day;
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
      updateRowDragDestinations();
    }
    rowDragScrollFrame = requestAnimationFrame(autoScrollRowDrag);
  }

  function onRowDragMove(event) {
    if (!rowDrag) return;
    event.preventDefault();   // don't scroll the page while dragging
    rowDrag.pointerX = event.clientX;
    rowDrag.pointerY = event.clientY;
    moveRowGhost(event);
    const destination = updateRowDragDestinations();
    if (destination.deleting || destination.drop || destination.undatedDrop || !rowDrag.canReorder) return;

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
    if (drag.canDelete) showTimelineTrash(false, false);
    clearDropGroups();
    clearHabitProjectTargets();
    dragEndedAt = Date.now() + 350;   // swallow the click that ends the drag
    cancelAnimationFrame(rowDragScrollFrame);
    rowDragScrollFrame = 0;
    document.removeEventListener("pointermove", onRowDragMove);
    document.removeEventListener("pointerup", endRowDrag);
    document.removeEventListener("pointercancel", cancelRowDrag);
  }

  function endRowDrag(event) {
    if (!rowDrag) return;
    if (event) {
      rowDrag.pointerX = event.clientX;
      rowDrag.pointerY = event.clientY;
      updateRowDragDestinations();
    }
    const drag = rowDrag;
    rowDrag = null;
    cleanRowDrag(drag);

    if (drag.deleting && drag.canDelete) {
      removeItem(drag.listName, drag.row.dataset.id);
      return;
    }

    if (drag.projectDrop) {
      const task = findTask(drag.row.dataset.id);
      const project = findItem("projects", drag.projectDrop);
      if (task && project) {
        linkTaskToProject(task, project);
        saveState();
        renderList("tasks");
        renderList("projects");
        refreshStepStructure(project);
        showToast(translate("taskLinked"));
      }
      return;
    }

    if (drag.drop && drag.canSchedule) {
      const task = findTask(drag.row.dataset.id);
      if (!task) return;
      task.dueDate = drag.drop.date;
      task.dueTime = drag.drop.time;
      task.notified = false;
      saveState();
      renderList("tasks");
      renderDailyTimeline();
      if (task.projectId) refreshProjectSteps(findItem("projects", task.projectId));
      ensureNotifyPermission();
      return;
    }

    if (drag.undatedDrop && drag.canSchedule) {
      const task = findTask(drag.row.dataset.id);
      if (!task || task.done) return;
      // dropped into a day it takes that day and no hour; into the tail, no date
      task.dueDate = drag.undatedDay || null;
      task.dueTime = null;
      task.notified = false;
      if (task.dueDate) collapsedGroups["day:" + task.dueDate] = false;
      else {
        collapsedGroups.none = false;
        persistUndatedTaskOrder(undatedTaskOrderFor(task.id, drag.undatedBeforeId));
      }
      saveState();
      renderList("tasks");
      renderDailyTimeline();
      if (task.projectId) refreshProjectSteps(findItem("projects", task.projectId));
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
    const group = document.querySelector('.tgroup[data-drop-group=""]');
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
      item.dueTime = due.time || null;   // a day may be fixed without an hour
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
  function removeWithUndo(listName, id, rerender, onRestore) {
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
      if (onRestore) onRestore();   // whatever pointed at it points again
      saveState();
      rerender();
    });
  }

  /* Find the item by id, drop it, redraw. */
  function removeItem(listName, id) {
    if (listName === "projects" && openInlineProject === id) {
      openInlineProject = null;
      inlineJournalOpen = false;
      openInlineStep = null;
      inlineStepAdd = null;
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
    let linkedStep = null;
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) {
        items[i].done = !items[i].done; // flip done state
        now = items[i].done;
        items[i].doneDate = now ? todayKey() : null;   // feeds the project's momentum
        if (listName === "tasks" && now) linkedStep = completeTaskStep(items[i]);
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
      if (linkedStep) refreshLinkedStepProject(linkedStep);
      return;
    }
    renderList(listName);
    if (listName === "tasks") renderDailyTimeline();
    if (linkedStep) refreshLinkedStepProject(linkedStep);
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
    return writtenDay(parsed);
  }

  /* WHAT A WRITTEN LINE MEANS BY "WHEN" — one reading for tasks and events alike:
     a day named in the line wins; an hour on its own means the day on show, so it
     can be placed at once; nothing at all leaves the thing undated, which is a
     state of its own and not a hole to be filled with today. */
  function writtenDay(parsed) {
    if (parsed.date && !parsed.inferred) return parsed.date;
    if (parsed.time) return sectionDay || todayKey();
    return sectionDay;
  }

  /* a new project lands in the sky and opens straight into its workspace */
  function newProject() {
    const project = createProject("");
    saveState();
    renderList("projects");
    liveSky();                    // its star lights up where it stands
    return project;
  }

  document.getElementById("addProjectBtn").addEventListener("click", function () {
    closeAllInlineRows();
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
  /* The catalogs are looked through in turn, so a key that has moved from one
     list to another still draws: only a glyph deleted outright needs migrating.
     The svg wears cat-ico, which is the whole hover contract - the CSS moves the
     named parts inside whenever the icon's own box is hovered, wherever it sits. */
  function catalogIconSvg(iconKey, catalog) {
    const drawing = (catalog && catalog[iconKey]) || HABIT_ICONS[iconKey]
      || EVENT_ICONS[iconKey] || PROJECT_ICONS[iconKey] || EXERCISE_ICONS[iconKey]
      || CONSTELLATION_ICONS[iconKey] || "";
    // the celestial alphabet shares one gesture, so it is grouped rather than
    // having every point and thread of twelve drawings named by hand
    const body = iconKey && iconKey.indexOf("constellation-") === 0
      ? '<g class="ci-constel">' + drawing + "</g>" : drawing;
    return '<svg class="cat-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + ' stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + body + '</svg>';
  }

  function habitSvg(iconKey) { return catalogIconSvg(iconKey); }
  function projectSvg(iconKey) { return catalogIconSvg(iconKey, PROJECT_ICONS); }
  function eventSvg(iconKey) { return catalogIconSvg(iconKey, EVENT_ICONS); }

  /* A small celestial alphabet reserved for constellation lists. The points and
     their threads stay legible at the compact size used beside a branch name. */
  const CONSTELLATION_ICONS = {
    "constellation-star": '<path d="m12 2 2.2 6.2L21 10l-5.3 4.1.5 6.9-4.2-3.2L7.8 21l.5-6.9L3 10l6.8-1.8L12 2z"/>',
    "constellation-orbit": '<ellipse cx="12" cy="12" rx="9" ry="4.7" transform="rotate(-28 12 12)"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="7" r="1.3" fill="currentColor" stroke="none"/>',
    "constellation-dipper": '<polyline points="3 7 7 9 11 7 14 11 18 9 21 12"/><circle cx="3" cy="7" r="1.2" fill="currentColor"/><circle cx="7" cy="9" r="1.2" fill="currentColor"/><circle cx="11" cy="7" r="1.2" fill="currentColor"/><circle cx="14" cy="11" r="1.2" fill="currentColor"/><circle cx="18" cy="9" r="1.2" fill="currentColor"/><circle cx="21" cy="12" r="1.2" fill="currentColor"/>',
    "constellation-crown": '<polyline points="3 16 6 8 12 14 18 6 21 16 3 16"/><circle cx="6" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="14" r="1.2" fill="currentColor"/><circle cx="18" cy="6" r="1.2" fill="currentColor"/>',
    "constellation-kite": '<polygon points="12 3 18 10 12 18 6 10 12 3"/><line x1="12" y1="18" x2="9" y2="22"/><circle cx="12" cy="3" r="1.1" fill="currentColor"/><circle cx="18" cy="10" r="1.1" fill="currentColor"/><circle cx="12" cy="18" r="1.1" fill="currentColor"/><circle cx="6" cy="10" r="1.1" fill="currentColor"/>',
    "constellation-arrow": '<polyline points="3 18 9 12 14 13 21 5"/><polyline points="15 5 21 5 21 11"/><circle cx="3" cy="18" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="14" cy="13" r="1.2" fill="currentColor"/>',
    "constellation-twins": '<polyline points="6 4 9 9 7 15 11 20"/><polyline points="18 4 15 9 17 15 13 20"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="7" y1="15" x2="17" y2="15"/><circle cx="6" cy="4" r="1.2" fill="currentColor"/><circle cx="18" cy="4" r="1.2" fill="currentColor"/>',
    "constellation-wave": '<polyline points="2 13 6 9 10 14 14 8 18 12 22 6"/><circle cx="2" cy="13" r="1.1" fill="currentColor"/><circle cx="6" cy="9" r="1.1" fill="currentColor"/><circle cx="10" cy="14" r="1.1" fill="currentColor"/><circle cx="14" cy="8" r="1.1" fill="currentColor"/><circle cx="18" cy="12" r="1.1" fill="currentColor"/><circle cx="22" cy="6" r="1.1" fill="currentColor"/>',
    "constellation-cluster": '<line x1="12" y1="12" x2="5" y2="6"/><line x1="12" y1="12" x2="18" y2="5"/><line x1="12" y1="12" x2="20" y2="16"/><line x1="12" y1="12" x2="7" y2="19"/><circle cx="12" cy="12" r="2"/><circle cx="5" cy="6" r="1.3" fill="currentColor"/><circle cx="18" cy="5" r="1.3" fill="currentColor"/><circle cx="20" cy="16" r="1.3" fill="currentColor"/><circle cx="7" cy="19" r="1.3" fill="currentColor"/>',
    "constellation-cross": '<polyline points="12 2 12 22 5 9 19 9"/><circle cx="12" cy="2" r="1.2" fill="currentColor"/><circle cx="12" cy="22" r="1.2" fill="currentColor"/><circle cx="5" cy="9" r="1.2" fill="currentColor"/><circle cx="19" cy="9" r="1.2" fill="currentColor"/><circle cx="12" cy="9" r="1.5" fill="currentColor"/>',
    "constellation-triangle": '<polygon points="12 3 21 19 3 19 12 3"/><line x1="12" y1="3" x2="12" y2="19"/><circle cx="12" cy="3" r="1.3" fill="currentColor"/><circle cx="21" cy="19" r="1.3" fill="currentColor"/><circle cx="3" cy="19" r="1.3" fill="currentColor"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/>',
    "constellation-comet": '<path d="M4 18 13 9"/><path d="M7 20 15 12"/><path d="M2 15 10 7"/><circle cx="16.5" cy="7.5" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>'
  };

  /* THE THREE CATALOGS — one list per thing being named, so a habit is offered
     habits and an event is offered events. Every glyph is cut into parts the CSS
     can move on hover; the class names are the contract between the two files. */
  const HABIT_ICONS = {
    water: '<path class="ci-drop" d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    sleep: '<path class="ci-moon" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
      + '<path class="ci-twinkle" d="m18.4 2.6.75 2 2 .75-2 .75-.75 2-.75-2-2-.75 2-.75z"/>',
    sun: '<circle class="ci-disc" cx="12" cy="12" r="5"/>'
      + '<g class="ci-rays"><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></g>',
    coffee: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>'
      + '<line class="ci-steam ci-steam--1" x1="6" y1="1" x2="6" y2="4"/>'
      + '<line class="ci-steam ci-steam--2" x1="10" y1="1" x2="10" y2="4"/>'
      + '<line class="ci-steam ci-steam--3" x1="14" y1="1" x2="14" y2="4"/>',
    run: '<polyline class="ci-trace" pathLength="1" points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    sport: '<g class="ci-lift"><line x1="2.5" y1="9" x2="2.5" y2="15"/><line x1="5.5" y1="7" x2="5.5" y2="17"/><line x1="18.5" y1="7" x2="18.5" y2="17"/><line x1="21.5" y1="9" x2="21.5" y2="15"/><line x1="5.5" y1="12" x2="18.5" y2="12"/></g>',
    meditation: '<g class="ci-breathe"><circle cx="12" cy="5" r="2"/><path d="M12 8v3"/><path d="M7.5 18.5c1.2 -.8 2.7 -1.2 4.5 -1.2s3.3 .4 4.5 1.2"/><path d="M12 11c-2.5 .5 -4 2 -4.5 4"/><path d="M12 11c2.5 .5 4 2 4.5 4"/></g>',
    heart: '<path class="ci-heart" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>'
      + '<path class="ci-leaf-page" d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    write: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>'
      + '<path class="ci-pencil" d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    code: '<polyline class="ci-chev ci-chev--r" points="16 18 22 12 16 6"/>'
      + '<polyline class="ci-chev ci-chev--l" points="8 6 2 12 8 18"/>',
    music: '<path class="ci-beam" d="M9 18V5l12-2v13"/>'
      + '<circle class="ci-note ci-note--1" cx="6" cy="18" r="3"/>'
      + '<circle class="ci-note ci-note--2" cx="18" cy="16" r="3"/>',
    leaf: '<g class="ci-frond"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="17.5" y1="15" x2="9" y2="15"/></g>'
      + '<line x1="16" y1="8" x2="2" y2="22"/>',
    star: '<polygon class="ci-star" points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'
  };

  /* what goes in a diary: a date, people, a class, a birthday, a present, a reminder */
  const EVENT_ICONS = {
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>'
      + '<line class="ci-pin ci-pin--1" x1="8" y1="2" x2="8" y2="6"/>'
      + '<line class="ci-pin ci-pin--2" x1="16" y1="2" x2="16" y2="6"/>'
      + '<rect class="ci-day" x="7" y="13.5" width="4" height="4" rx="1"/>',
    meeting: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>'
      + '<g class="ci-joiner"><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></g>',
    course: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.1 2.7 3 6 3s6-1.9 6-3v-5"/>'
      + '<line class="ci-tassel" x1="22" y1="10" x2="22" y2="15"/>',
    cake: '<path d="M4 21h16"/><path d="M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7"/><path d="M4 16.4c1.4 0 1.4 1 2.8 1s1.4-1 2.8-1 1.4 1 2.8 1 1.4-1 2.8-1 1.4 1 2.8 1"/><path d="M12 6.5V9"/>'
      + '<path class="ci-flame" d="M12 3.5a1 1 0 0 0-1 1c0 .8 1 1.5 1 1.5s1-.7 1-1.5a1 1 0 0 0-1-1z"/>',
    gift: '<polyline points="20 12 20 22 4 22 4 12"/><line x1="12" y1="22" x2="12" y2="12"/>'
      + '<g class="ci-lid"><rect x="2" y="7" width="20" height="5"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></g>',
    bell: '<g class="ci-bell"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></g>'
      + '<path class="ci-clapper" d="M13.73 21a2 2 0 0 1-3.46 0"/>'
  };

  /* A goal is something you drive at, so the list is aim, launch, route and
     workplace. The first four are the canvas glyphs, animation included. */
  const PROJECT_ICONS = {
    target: '<g class="ti-rings"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></g>'
      + '<g class="ti-arrow"><path d="m15 9 5-5M16 4h4v4"/></g>',
    flag: '<path d="M6 21V4"/><g class="ti-flag"><path d="M6 5h11l-2 3 2 3H6"/></g>',
    compass: '<circle cx="12" cy="12" r="9"/><g class="ti-needle"><path d="m15.5 8.5-2 5-5 2 2-5Z"/></g>',
    lightbulb: '<g class="ti-rays"><path d="M12 1.5v1.6M4.4 4.4l1.1 1.1M19.6 4.4l-1.1 1.1M2 11h1.6M20.4 11H22"/></g>'
      + '<g class="ti-glass"><path d="M8.5 15.5C7 14.3 6 12.5 6 10.5a6 6 0 1 1 12 0c0 2-1 3.8-2.5 5-.6.5-.8 1-.8 1.5H9.3c0-.5-.2-1-.8-1.5Z"/></g>'
      + '<g class="ti-wire"><path stroke-width="1.15" d="M10.5 15.4v-2.5M13.5 15.4v-2.5M10.5 12.9l.75-1.6.75 1.6.75-1.6.75 1.6"/></g>'
      + '<path d="M9 18h6M10 21h4"/>',
    rocket: '<g class="ci-rocket"><path d="M12 15l-3-3a11 11 0 0 1 5-8c1.9-1.9 4-2 5-2s1.1 3.1-.8 5a11 11 0 0 1-8 5z"/><path d="M9 12H4s.5-2.8 2-4c1.5-.4 3 0 3 0"/><path d="M12 15v5s2.8-.5 4-2c.4-1.5 0-3 0-3"/></g>'
      + '<path class="ci-exhaust" d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.9.7-2.2-.1-3a2.1 2.1 0 0 0-2.9 0z"/>',
    folder: '<path d="M3 19.5V6a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2v11"/>'
      + '<path class="ci-fold-front" d="M2 11h20l-1.6 7.6A2 2 0 0 1 18.4 20.5H5.6a2 2 0 0 1-1.96-1.5Z"/>',
    briefcase: '<g class="ci-case"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/><path d="M10 12v2h4v-2"/></g>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/>'
      + '<path class="ci-door" d="M9.5 21v-6h5v6"/>',
    book: HABIT_ICONS.book,
    write: HABIT_ICONS.write,
    code: HABIT_ICONS.code,
    star: HABIT_ICONS.star
  };

  /* the preconfigured exercise habit draws from here; out of the picker grid */
  const EXERCISE_ICONS = {
    pushup: '<polyline points="6 8 12 13 18 8"/><polyline points="6 15 12 20 18 15"/>',
    squat: '<line x1="4" y1="4" x2="20" y2="4"/><path d="M8 4v6l4 4 4-4V4"/><line x1="4" y1="20" x2="20" y2="20"/>',
    crunch: '<rect x="6" y="3" width="5" height="5" rx="1"/><rect x="13" y="3" width="5" height="5" rx="1"/><rect x="6" y="9.5" width="5" height="5" rx="1"/><rect x="13" y="9.5" width="5" height="5" rx="1"/><rect x="6" y="16" width="5" height="5" rx="1"/><rect x="13" y="16" width="5" height="5" rx="1"/>',
    lunge: '<path d="M12 3v6"/><path d="M8 9l4 6 4-6"/><path d="M8 21l4-6 4 6"/>',
    pullup: '<line x1="3" y1="5" x2="21" y2="5"/><line x1="8" y1="5" x2="8" y2="13"/><line x1="16" y1="5" x2="16" y2="13"/><polyline points="6 10 8 13 10 10"/><polyline points="14 10 16 13 18 10"/>',
    dip: '<line x1="5" y1="4" x2="5" y2="20"/><line x1="19" y1="4" x2="19" y2="20"/><polyline points="9 9 12 13 15 9"/>',
    sport: HABIT_ICONS.sport
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
    // the constellations that carried it, remembered before they let go: Undo
    // must hand the habit back where it was, not merely bring it back adrift
    const carried = unlinkHabitFromProjects(id);
    removeWithUndo("habits", id, function () {
      renderHabits();
      renderWelcomeHabits();
      refreshCarriers(carried);
    }, function () { relinkHabitToProjects(id, carried); });
  }

  /* A habit taken away leaves nothing pointing at it: every constellation holding
     its id lets go, the same way a step taken away frees the task it stood for.
     The places it was held are returned so the move can be undone whole. */
  function unlinkHabitFromProjects(habitId) {
    const carried = [];
    for (let p = 0; p < state.projects.length; p++) {
      const branches = projectBranches(state.projects[p]);
      for (let b = 0; b < branches.length; b++) {
        const ids = branches[b].habitIds || [];
        const at = ids.indexOf(habitId);
        if (at === -1) continue;
        ids.splice(at, 1);
        carried.push({ project: state.projects[p], branch: branches[b], at: at });
      }
    }
    return carried;
  }

  function relinkHabitToProjects(habitId, carried) {
    for (let i = 0; i < carried.length; i++) {
      const branch = carried[i].branch;
      if (!branch.habitIds) branch.habitIds = [];
      if (branch.habitIds.indexOf(habitId) === -1) {
        branch.habitIds.splice(carried[i].at, 0, habitId);
      }
    }
  }

  /* the objectives that held it, redrawn — they no longer carry the id to be
     found by, so they have to be remembered rather than searched for */
  function refreshCarriers(carried) {
    const seen = [];
    for (let i = 0; i < carried.length; i++) {
      if (seen.indexOf(carried[i].project) !== -1) continue;
      seen.push(carried[i].project);
      refreshStepSections(carried[i].project);
    }
    if (!skyView.hidden) renderSky();
  }

  /* Fill the shared picker from the catalog relevant to the object being edited. */
  function buildIconPicker(catalog, activeKey) {
    const grid = document.getElementById("iconGrid");
    const source = catalog || HABIT_ICONS;
    const keys = Object.keys(source);
    grid.innerHTML = "";
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = key === activeKey ? "icon-choice is-on" : "icon-choice";
      choice.setAttribute("aria-label", translate("pickIconTitle"));
      choice.innerHTML = catalogIconSvg(key, source);
      choice.addEventListener("click", function () { chooseIcon(key); });
      grid.appendChild(choice);
    }
  }

  let iconPickerMode = { kind: "habit-new" };

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
      const project = findItem("projects", iconPickerMode.projectId);
      if (project) project.icon = iconKey;
      saveState();
      iconPicker.hidden = true;
      if (currentProject() && currentProject().id === iconPickerMode.projectId) {
        pviewIcon.innerHTML = projectSvg(iconKey);
      }
      const rowIcon = document.querySelector('#projectsList .item[data-id="'
        + iconPickerMode.projectId + '"] .item__ico--editable');
      if (rowIcon) rowIcon.innerHTML = projectSvg(iconKey);
      return;
    }
    if (iconPickerMode.kind === "branch") {
      const project = findItem("projects", iconPickerMode.projectId);
      const branch = project && findBranch(project, iconPickerMode.branchId);
      if (branch) branch.icon = iconKey;
      saveState();
      iconPicker.hidden = true;
      if (project) refreshStepSections(project);
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
      if (habit) {
        habit.icon = iconKey;
        const inlineIcons = document.querySelectorAll(".phabits__icon");
        for (let i = 0; i < inlineIcons.length; i++) {
          if (inlineIcons[i].dataset.habitId === habit.id) {
            inlineIcons[i].innerHTML = habitSvg(iconKey);
          }
        }
      }
    }
    saveState();
    iconPicker.hidden = true;
    renderHabits();
    renderHabits();   // reflect an icon change on the well-being page
  }

  /* open to create a new habit (name field shown) */
  function openIconPicker() {
    iconPickerMode = { kind: "habit-new" };
    buildIconPicker(HABIT_ICONS);
    document.getElementById("habitNameField").hidden = false;
    document.getElementById("habitNameInput").value = "";
    document.getElementById("iconPresets").hidden = false;   // presets only when creating
    iconPicker.hidden = false;
  }

  /* open to change an existing habit's icon (name field hidden) */
  function openIconPickerForEdit(habitId) {
    iconPickerMode = { kind: "habit-edit", id: habitId };
    const habit = findItem("habits", habitId);
    buildIconPicker(HABIT_ICONS, habit && habit.icon);
    document.getElementById("habitNameField").hidden = true;
    document.getElementById("iconPresets").hidden = true;
    iconPicker.hidden = false;
  }

  /* open to change the icon of the event in the detail view */
  function openIconPickerForDetail() {
    iconPickerMode = { kind: "detail" };
    const item = currentDetailItem();
    buildIconPicker(EVENT_ICONS, item && item.icon);
    document.getElementById("habitNameField").hidden = true;
    document.getElementById("iconPresets").hidden = true;
    iconPicker.hidden = false;
  }

  /* same, for the project on screen in its workspace */
  function openIconPickerForProject(projectOrEvent) {
    const project = projectOrEvent && projectOrEvent.id ? projectOrEvent : currentProject();
    if (!project) return;
    iconPickerMode = { kind: "project", projectId: project.id };
    buildIconPicker(PROJECT_ICONS, project.icon);
    document.getElementById("habitNameField").hidden = true;
    document.getElementById("iconPresets").hidden = true;
    iconPicker.hidden = false;
  }

  function openIconPickerForBranch(project, branch) {
    iconPickerMode = { kind: "branch", projectId: project.id, branchId: branch.id };
    document.getElementById("habitNameField").hidden = true;
    document.getElementById("iconPresets").hidden = true;
    buildIconPicker(CONSTELLATION_ICONS, branch.icon);
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
  let pickerContext = "new";                      // an id, or {projectId, stepId}
  let pickerKind = "tasks";                        // tasks | events | project | step
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

  /* Open the calendar on a task, an event, a project horizon or a step
     target. The context is an id, except for a step which needs both. */
  function openCalendar(context, kind) {
    pickerContext = context;
    pickerKind = kind || "tasks";
    let date = null;
    let time = "";
    if (pickerKind === "events") {
      const event = findItem("events", context);
      // an event takes its hour from the rule alone: the picker is a day picker,
      // and loading it with no time is what keeps the slider panel shut
      if (event) { date = event.date || null; time = ""; }
    } else if (pickerKind === "step") {
      const project = findItem("projects", context.projectId);
      const step = project && findStep(project, context.stepId);
      if (step) date = step.targetDate || null;
    } else {
      const task = findTask(context);
      if (task) { date = task.dueDate || null; time = task.dueTime || ""; }
    }
    pickerSelected = date || todayKey();   // today highlighted by default
    const base = new Date(pickerSelected + "T00:00");
    pickerYear = base.getFullYear();
    pickerMonth = base.getMonth();
    setPickerTime(time);
    // a step target is a date only; setPickerTime already shut the sliders
    // since they were loaded with no time
    // an event's hour is only ever set by dragging it on the rule of time, so the
    // picker offers the day alone — as it already did for a step's target
    document.getElementById("calTimeRow").hidden =
      pickerKind === "step" || pickerKind === "events";
    document.getElementById("calClear").hidden = pickerKind === "events";   // an event always has a date
    renderCalendar();
    calendarModal.hidden = false;
  }

  /* Write the chosen (or cleared) date to whatever the picker was opened on. */
  function applyDue(date, time) {
    if (pickerKind === "events") {
      const event = findItem("events", pickerContext);
      if (event && date) {
        event.date = date;   // its hour, whatever it is, is not this dialog's business
        saveState();
        renderEventCal();
        renderDailyTimeline();
        renderUndated();
      }
      calendarModal.hidden = true;
      return;
    }
    // a step target is a date only, no time
    if (pickerKind === "step") {
      const project = findItem("projects", pickerContext.projectId);
      const step = project && findStep(project, pickerContext.stepId);
      if (step) {
        step.targetDate = date;
        syncTaskForStep(project, step);
        saveState();
        refreshStepSections(project);
        renderList("tasks");
        renderDailyTimeline();
      }
      calendarModal.hidden = true;
      return;
    }
    const task = findTask(pickerContext);
    if (task) {
      task.dueDate = date;
      // the hour switch left off means no hour, not nine in the morning
      task.dueTime = date ? (time || null) : null;
      task.notified = false;   // re-arm the reminder
      saveState();
      renderList("tasks");
      renderDailyTimeline();
      if (task.projectId) {
        refreshProjectSteps(findItem("projects", task.projectId));
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

  /* THE HABIT BAND — compact yes-or-no icons atop the task column, with water
     rising over an icon once ticked. They always tick today, whatever day the
     grid is showing: a habit is lived now, it is not planned. Sleep and exercise
     are left out — they are a value to enter, not a box to tick. */
  function renderHabitCells() {
    const box = document.getElementById("habitCells");
    box.innerHTML = "";
    const today = todayKey();
    for (let i = 0; i < state.habits.length; i++) {
      const habit = state.habits[i];
      if (habit.type === "sleep" || habit.type === "exercise") continue;
      box.appendChild(habitCell(habit, today));
    }
  }

  let habitDrag = null;
  let habitDragUntil = 0;
  let habitDragScrollFrame = 0;

  function armHabitDrag(handle, habit) {
    handle.addEventListener("pointerdown", function (event) {
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
        startHabitDrag(pointerEvent, handle, habit);
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

  function habitProjectGuide() {
    const guide = document.createElement("span");
    guide.className = "habit-project-drop-guide";
    const icon = document.createElement("span");
    icon.innerHTML = iconSvg('<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/>'
      + '<path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>');
    const text = document.createElement("span");
    text.textContent = translate("habitDropProject");
    guide.append(icon, text);
    return guide;
  }

  function showHabitProjectTargets() {
    const rows = document.querySelectorAll("#projectsList .item--project");
    for (let i = 0; i < rows.length; i++) {
      rows[i].classList.add("is-habit-drop-available");
      const tab = rows[i].querySelector(".project-tab");
      if (tab) tab.appendChild(habitProjectGuide());
    }
  }

  function clearHabitProjectTargets() {
    const rows = document.querySelectorAll("#projectsList .item--project");
    for (let i = 0; i < rows.length; i++) {
      rows[i].classList.remove("is-habit-drop-available", "is-habit-drop-target");
    }
    const guides = document.querySelectorAll(".habit-project-drop-guide");
    for (let i = 0; i < guides.length; i++) guides[i].remove();
  }

  function habitProjectDropAt(clientX, clientY) {
    const at = document.elementFromPoint(clientX, clientY);
    const row = at && at.closest ? at.closest("#projectsList .item--project") : null;
    if (!row) return null;
    const project = findItem("projects", row.dataset.id);
    return project ? { row: row, project: project } : null;
  }

  function startHabitDrag(event, handle, habit) {
    if (habitDrag) return;
    const ghost = document.createElement("div");
    ghost.className = "habit-drag-ghost";
    const icon = document.createElement("span");
    icon.className = "habit-drag-ghost__icon";
    icon.innerHTML = habitSvg(habit.icon || "star");
    const name = document.createElement("span");
    name.textContent = habit.name || translate("habitsTitle");
    ghost.append(icon, name);
    document.body.appendChild(ghost);

    habitDrag = {
      handle: handle,
      habit: habit,
      ghost: ghost,
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      deleting: false,
      projectTarget: null,
      paneSwitchAt: 0
    };
    if (handle.setPointerCapture) {
      try { handle.setPointerCapture(event.pointerId); } catch (err) {}
    }
    handle.classList.add("is-habit-dragging");
    handle.blur();
    showTimelineTrash(true, false);
    showHabitProjectTargets();
    moveHabitGhost(event.clientX, event.clientY);
    updateHabitDragTargets(event.clientX, event.clientY);
    document.addEventListener("pointermove", moveHabitDrag, { passive: false });
    document.addEventListener("pointerup", endHabitDrag);
    document.addEventListener("pointercancel", cancelHabitDrag);
    cancelAnimationFrame(habitDragScrollFrame);
    habitDragScrollFrame = requestAnimationFrame(autoScrollHabitDrag);
  }

  function moveHabitGhost(clientX, clientY) {
    if (!habitDrag) return;
    habitDrag.ghost.style.left = (clientX + 14) + "px";
    habitDrag.ghost.style.top = (clientY + 12) + "px";
  }

  function maybeSwitchHabitPane() {
    if (!habitDrag || !railed() || Date.now() < habitDrag.paneSwitchAt) return;
    let next = paneAt;
    if (habitDrag.pointerX > window.innerWidth - 26 && paneAt === 0) next = 1;
    else if (habitDrag.pointerX < 26 && paneAt === 1) next = 0;
    if (next === paneAt) return;
    pagesTrack.classList.add("is-habit-dragging");
    setPane(next);
    habitDrag.paneSwitchAt = Date.now() + 650;
  }

  function updateHabitDragTargets(clientX, clientY) {
    if (!habitDrag) return;
    habitDrag.pointerX = clientX;
    habitDrag.pointerY = clientY;
    maybeSwitchHabitPane();
    const deleting = timelineTrashHit(clientX, clientY);
    const target = deleting ? null : habitProjectDropAt(clientX, clientY);
    if (habitDrag.projectTarget) {
      habitDrag.projectTarget.row.classList.remove("is-habit-drop-target");
    }
    habitDrag.deleting = deleting;
    habitDrag.projectTarget = target;
    if (target) target.row.classList.add("is-habit-drop-target");
    showTimelineTrash(true, deleting);
    habitDrag.ghost.classList.toggle("is-delete-target", deleting);
    habitDrag.ghost.classList.toggle("is-link-target", !!target);
  }

  function moveHabitDrag(event) {
    if (!habitDrag) return;
    event.preventDefault();
    moveHabitGhost(event.clientX, event.clientY);
    updateHabitDragTargets(event.clientX, event.clientY);
  }

  function autoScrollHabitDrag() {
    if (!habitDrag) return;
    const edge = Math.min(100, window.innerHeight * .17);
    let amount = 0;
    if (habitDrag.pointerY < edge) {
      amount = -Math.ceil((edge - habitDrag.pointerY) / edge * 16);
    } else if (habitDrag.pointerY > window.innerHeight - edge) {
      amount = Math.ceil((habitDrag.pointerY - (window.innerHeight - edge)) / edge * 16);
    }
    if (amount) {
      window.scrollBy(0, amount);
      updateHabitDragTargets(habitDrag.pointerX, habitDrag.pointerY);
    }
    habitDragScrollFrame = requestAnimationFrame(autoScrollHabitDrag);
  }

  function cleanHabitDrag(drag) {
    drag.handle.classList.remove("is-habit-dragging");
    if (drag.handle.hasPointerCapture && drag.handle.hasPointerCapture(drag.pointerId)) {
      drag.handle.releasePointerCapture(drag.pointerId);
    }
    drag.ghost.remove();
    showTimelineTrash(false, false);
    clearHabitProjectTargets();
    pagesTrack.classList.remove("is-habit-dragging");
    habitDragUntil = Date.now() + 350;
    cancelAnimationFrame(habitDragScrollFrame);
    habitDragScrollFrame = 0;
    document.removeEventListener("pointermove", moveHabitDrag);
    document.removeEventListener("pointerup", endHabitDrag);
    document.removeEventListener("pointercancel", cancelHabitDrag);
  }

  function linkHabitToProject(habit, project) {
    const branch = activeProjectBranch(project);
    if ((branch.habitIds || []).indexOf(habit.id) !== -1) {
      showToast(translate("habitAlreadyLinkedProject"));
      return;
    }
    if (!branch.habitIds) branch.habitIds = [];
    branch.habitIds.push(habit.id);
    saveState();
    refreshBranchHabits(project);
    showToast(translate("habitLinkedProject"));
  }

  function endHabitDrag(event) {
    if (!habitDrag) return;
    updateHabitDragTargets(event.clientX, event.clientY);
    const drag = habitDrag;
    habitDrag = null;
    cleanHabitDrag(drag);
    if (drag.deleting) removeHabit(drag.habit.id);
    else if (drag.projectTarget) linkHabitToProject(drag.habit, drag.projectTarget.project);
  }

  function cancelHabitDrag() {
    if (!habitDrag) return;
    const drag = habitDrag;
    habitDrag = null;
    cleanHabitDrag(drag);
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

    armHabitDrag(tile, habit);
    tile.addEventListener("click", function (event) {
      if (Date.now() < habitDragUntil) {
        event.preventDefault();
        return;
      }
      toggleHabit(habit.id, tile);   // flips the "done" class the water reads
      tile.setAttribute("aria-pressed", tile.classList.contains("done") ? "true" : "false");
      renderWelcomeHabits();         // the rings on the threshold show the same day
    });
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
  const detailPin = document.getElementById("detailPin");
  const detailBell = document.getElementById("detailBell");
  const detailTrash = document.getElementById("detailTrash");
  const detailWhenDay = document.getElementById("detailWhenDay");
  const detailNoteToggle = document.getElementById("detailNoteToggle");
  const detailWorkspace = document.getElementById("detailWorkspace");
  const detailMain = document.getElementById("detailMain");
  const detailNoteSection = document.getElementById("detailNoteSection");
  const detailNotes = document.getElementById("detailNotes");
  const subtaskList = document.getElementById("subtaskList");
  const subtaskSection = document.getElementById("subtaskSection");
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
  const ICON_STAR = '<path d="M12 3 13.6 8.2 18.5 9.4 14.7 12.6 15.5 17.6 12 15.1 8.5 17.6 9.3 12.6 5.5 9.4 10.4 8.2 Z"/>';
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

  /* step progress badge on a project row, as a percentage */
  function createStepBadge(item) {
    const badge = document.createElement("span");
    badge.className = "item__sub";
    badge.textContent = Math.round(stepProgress(item) * 100) + "%";
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
    detailPin.hidden = kind === "events";   // an event is not pinnable
    if (!detailPin.hidden) detailPin.classList.toggle("is-on", !!item.pinned);
    // the bell is the event's own flag, and the only way to take it back off
    // the bin and the day picker travel with the bell: an event has no actions
    // row to hold them
    detailTrash.hidden = kind !== "events";
    detailWhenDay.hidden = kind !== "events";
    detailBell.hidden = kind !== "events";
    if (kind === "events") {
      detailBell.classList.toggle("is-on", !!item.important);
      detailBell.setAttribute("aria-pressed", item.important ? "true" : "false");
    }
    // an event carries an icon, shown as a square button left of the title
    detailIcon.hidden = kind !== "events";
    if (kind === "events") detailIcon.innerHTML = eventSvg(item.icon || "calendar");
    detailNotes.value = item.notes || "";

    detailNoteToggle.hidden = kind !== "tasks";
    detailMain.hidden = kind === "events";
    detailWorkspace.classList.toggle("is-event", kind === "events");
    subtaskSection.hidden = kind === "events";   // an event just has notes
    if (kind !== "events") renderSubtasks(item);
    // Scheduling and deletion stay on the row and through drag-and-drop; the
    // unfolded surface remains focused on the object's content.
    setInlineTaskNote(false);
    fitNotes();
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
  let inlineTaskNoteOpen = false;

  function setInlineTaskLayout(open) {
    const track = document.getElementById("pagesTrack");
    if (track) track.classList.toggle("is-task-note-open", !!open);
  }

  function setInlineTaskNote(open) {
    inlineTaskNoteOpen = !!open && detailTarget.kind === "tasks";
    setInlineTaskLayout(inlineTaskNoteOpen);
    detailWorkspace.classList.toggle("is-note-open", inlineTaskNoteOpen);
    detailNoteSection.hidden = detailTarget.kind === "tasks" ? !inlineTaskNoteOpen : false;
    const row = openHost && hostRow(openHost);
    if (row) row.classList.toggle("is-note-open", inlineTaskNoteOpen);
    const label = translate(inlineTaskNoteOpen ? "noteHideAria" : "noteShowAria");
    detailNoteToggle.classList.toggle("is-active", inlineTaskNoteOpen);
    detailNoteToggle.setAttribute("aria-pressed", inlineTaskNoteOpen ? "true" : "false");
    detailNoteToggle.setAttribute("aria-label", label);
    detailNoteToggle.title = label;
    if (inlineTaskNoteOpen) requestAnimationFrame(fitNotes);
  }

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
    setInlineTaskNote(false);
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

  /* A task and an objective may stay open side by side. Leaving both working
     surfaces closes them together, so no orphaned fold remains in either column. */
  document.addEventListener("click", function (event) {
    if ((!openHost && !openInlineProject) || !event.target.closest) return;
    // A handler may have redrawn its own section before this one runs, detaching
    // the node that was clicked. closest() then walks a tree no longer on the
    // page and finds nothing — and a click that came from inside something we
    // have just rebuilt was never a click outside it.
    if (!event.target.isConnected) return;
    // a square and the fold it opens are one object, even though they are apart
    // a chip and the fold it opens are one object, though they sit apart
    if (event.target.closest(".item.is-open, .item--project.is-inline-open, "
      + ".dtl__event:not(.dtl__add), .undated__chip, .day-fold, #addProjectBtn")) return;
    if (event.target.closest(".modal, .detail")) return;   // pickers the editor opens
    closeAllInlineRows();
  });


  /* SUBTASKS */
  function renderSubtasks(item) {
    subtaskList.innerHTML = "";
    const subs = item.subtasks || [];
    for (let i = subs.length - 1; i >= 0; i--) {
      subtaskList.appendChild(createSubtaskRow(item, subs[i], i, subs.length));
    }
  }

  function createSubtaskRow(item, sub, index, total) {
    const row = document.createElement("li");
    row.className = sub.done ? "step is-done" : "step";
    row.dataset.subtaskId = sub.id;
    const color = paletteColorAt(paletteStops(), total > 1 ? index / (total - 1) : 0);
    row.style.setProperty("--step-color", color);

    const checkbox = createCheckbox(function () { toggleSubtask(item, sub.id); });

    const label = document.createElement("input");
    label.type = "text";
    label.className = "step__text";
    label.maxLength = 200;
    label.value = sub.text || "";
    label.addEventListener("input", function () {
      sub.text = label.value;
      saveState();
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "step__del";
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
    refreshOpenRow(item);
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
    refreshOpenRow(item);
  }

  /* INLINE OBJECTIVE — the main app gets a compact working view of an objective.
     Rêve keeps the complete workspace; this fold only carries the trajectory and
     the concrete steps so they remain beside today's tasks. */
  const INLINE_PROJECT_MS = 420;
  let openInlineProject = null;
  let inlineJournalOpen = false;
  let openInlineStep = null;
  let inlineStepAdd = null;
  let stepDrag = null;
  let stepDragUntil = 0;
  let stepDragScrollFrame = 0;

  /* The objective stays in the planning column by default. On desktop, opening
     its optional journal grows that workspace into a third visual column. */
  function setInlineProjectLayout(open) {
    const track = document.getElementById("pagesTrack");
    if (track) track.classList.toggle("is-goal-open", !!open);
  }

  function setInlineJournal(open, row) {
    inlineJournalOpen = !!open;
    setInlineProjectLayout(inlineJournalOpen);
    if (!row) return;
    row.classList.toggle("is-journal-open", inlineJournalOpen);
    const workspace = row.querySelector(".goal-inline__workspace");
    if (workspace) workspace.classList.toggle("is-journal-open", inlineJournalOpen);
    const journal = row.querySelector(".goal-inline__journal-section");
    if (journal) journal.hidden = !inlineJournalOpen;
    const toggle = row.querySelector(".goal-inline__journal-toggle");
    if (toggle) {
      const label = translate(inlineJournalOpen ? "journalHideAria" : "journalShowAria");
      toggle.classList.toggle("is-active", inlineJournalOpen);
      toggle.setAttribute("aria-pressed", inlineJournalOpen ? "true" : "false");
      toggle.setAttribute("aria-label", label);
      toggle.title = label;
    }
  }

  function closeInlineProjectRow(row) {
    if (!row) return;
    const fold = row.querySelector(".unfold");
    const tabName = row.querySelector(".project-tab > .goal-inline__name");
    const skyJump = row.querySelector(".project-tab > .goal-inline__sky");
    if (skyJump) skyJump.remove();
    const journalToggle = row.querySelector(".project-tab > .goal-inline__journal-toggle");
    const rowName = row.querySelector(".project-tab > .item__text");
    if (tabName) tabName.remove();
    if (journalToggle) journalToggle.remove();
    if (rowName) rowName.hidden = false;
    row.classList.remove("is-inline-open", "is-journal-open");
    inlineJournalOpen = false;
    setInlineProjectLayout(false);
    row.setAttribute("aria-expanded", "false");
    fold.style.height = fold.getBoundingClientRect().height + "px";
    fold.offsetWidth;
    fold.style.height = "0px";
    setTimeout(function () {
      if (!row.classList.contains("is-inline-open")) fold.firstChild.innerHTML = "";
    }, INLINE_PROJECT_MS);
  }

  function closeOpenInlineProject() {
    if (!openInlineProject) return;
    const row = document.querySelector("#projectsList .item--project.is-inline-open");
    openInlineProject = null;
    openInlineStep = null;
    inlineStepAdd = null;
    if (row) closeInlineProjectRow(row);
    else {
      inlineJournalOpen = false;
      setInlineProjectLayout(false);
    }
  }

  function closeAllInlineRows() {
    if (openHost) closeDetail();
    closeOpenInlineProject();
  }

  function toggleInlineProjectRow(row, project, fold) {
    fieldWake();
    if (openInlineProject === project.id) {
      closeOpenInlineProject();
      return;
    }

    const previous = document.querySelector("#projectsList .item--project.is-inline-open");
    if (previous && previous !== row) closeInlineProjectRow(previous);

    openInlineProject = project.id;
    inlineJournalOpen = false;
    openInlineStep = null;
    inlineStepAdd = null;
    setInlineProjectLayout(false);
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
      renameProject(project, name.value);
      if (rowName) rowName.textContent = project.text;
    });
    name.addEventListener("change", function () {
      if (!skyView.hidden) renderSky();
    });
    if (rowName) rowName.hidden = true;
    tab.insertBefore(name, rowName || tab.querySelector(".item__slot"));

    const journalToggle = document.createElement("button");
    journalToggle.type = "button";
    journalToggle.className = "goal-inline__journal-toggle";
    journalToggle.innerHTML = iconSvg(ICON_NOTE);
    const journalToggleText = document.createElement("span");
    journalToggleText.textContent = translate("journalLabel");
    journalToggle.appendChild(journalToggleText);
    journalToggle.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      setInlineJournal(!inlineJournalOpen, row);
    });
    tab.insertBefore(journalToggle, rowName || tab.querySelector(".item__slot"));

    /* the same objective, seen from the sky: one press leaves the column for the
       map where it sits among the others */
    const skyJump = document.createElement("button");
    skyJump.type = "button";
    skyJump.className = "goal-inline__journal-toggle goal-inline__sky";
    skyJump.innerHTML = iconSvg(ICON_STAR);
    const skyJumpText = document.createElement("span");
    skyJumpText.textContent = translate("skyTitle");
    skyJump.appendChild(skyJumpText);
    skyJump.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      openSky();
      openProjectView(project.id);
    });
    tab.insertBefore(skyJump, rowName || tab.querySelector(".item__slot"));

    // The dashboard objective is a working view: steps stay in their concrete
    // list here, while Rêve keeps the choice between its list and roadmap.
    const stepsSection = createProjectStepsHost(project, true);
    stepsSection.classList.add("goal-inline__section");

    const journalSection = document.createElement("section");
    journalSection.className = "goal-inline__section goal-inline__journal-section";
    const journalLabel = document.createElement("span");
    journalLabel.className = "detail__label";
    journalLabel.textContent = translate("journalLabel");

    const journalForm = document.createElement("form");
    journalForm.className = "sub-add goal-inline__journal-add";
    const journalInput = document.createElement("input");
    journalInput.type = "text";
    journalInput.className = "add__input";
    journalInput.maxLength = 400;
    journalInput.placeholder = translate("journalAdd");
    journalInput.required = true;
    const journalButton = document.createElement("button");
    journalButton.type = "submit";
    journalButton.className = "add__btn";
    journalButton.setAttribute("aria-label", translate("addAria"));
    journalButton.textContent = "+";
    journalForm.append(journalInput, journalButton);

    const journal = document.createElement("div");
    journal.className = "jrn goal-inline__journal";
    renderJournalInto(journal, project);
    journalForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const text = journalInput.value.trim();
      if (!text) return;
      addProjectJournal(project, text);
      journalInput.value = "";
      try { journalInput.focus({ preventScroll: true }); }
      catch (err) { journalInput.focus(); }
    });

    journalSection.append(journalLabel, journalForm, journal);
    const workspace = document.createElement("div");
    workspace.className = "goal-inline__workspace";
    workspace.append(stepsSection, journalSection);
    view.appendChild(workspace);

    host.appendChild(view);
    setInlineJournal(inlineJournalOpen, row);
  }

  /* The roadmap's start and finish are drawn, never stored: the list holds steps
     and nothing else, which is what lets the roadmap and the checklist show the
     same thing. The finish is the project's own completion. */
  function renderInlineSteps(host, project, branchIn) {
    host.innerHTML = "";
    const branch = branchIn || projectBranches(project)[0];
    const steps = branch.steps;
    const entries = [{ kind: "start" }];
    for (let i = 0; i < steps.length; i++) {
      entries.push({ kind: "step", step: steps[i], index: i });
    }
    if (!project.done) entries.push({ kind: "add" });
    entries.push({ kind: "finish" });

    const canvas = document.createElement("div");
    canvas.className = "goal-roadmap__canvas";
    canvas.style.setProperty("--goal-nodes", entries.length);
    canvas.style.setProperty("--goal-edge", (50 / entries.length).toFixed(3) + "%");
    canvas.style.minWidth = (entries.length * 112) + "px";
    const track = document.createElement("span");
    track.className = "goal-roadmap__track";
    const fill = document.createElement("span");
    fill.className = "goal-roadmap__fill";
    fill.style.width = (stepProgress(project) * 100).toFixed(1) + "%";
    track.appendChild(fill);
    const nodes = document.createElement("div");
    nodes.className = "goal-roadmap__nodes";

    const stops = paletteStops();
    const span = Math.max(1, steps.length + 1);
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.kind === "add") nodes.appendChild(createInlineStepAdd(project, branch));
      else if (entry.kind === "start") nodes.appendChild(createInlineStepCap("start", project,
        paletteColorAt(stops, 0)));
      else if (entry.kind === "finish") nodes.appendChild(createInlineStepCap("finish", project,
        paletteColorAt(stops, 1)));
      else {
        nodes.appendChild(createInlineStepNode(project, entry.step, entry.index,
          paletteColorAt(stops, (entry.index + 1) / span)));
      }
    }
    canvas.append(track, nodes);
    host.appendChild(canvas);
  }

  /* Repaint only the roadmap that changed. Rebuilding #projectsList replaces
     the browser's scroll anchor and is the source of the visible page jumps.
     This keeps both axes fixed and uses preventScroll for the add field. */
  /* Redrawing the objective must not rebuild #projectsList: replacing the row also
     replaces the browser's scroll anchor, which is what made the page jump. An
     objective now carries several courses, so every one of them is redrawn and every
     one keeps the place it was scrolled to. */
  function refreshInlineSteps(project, options) {
    const host = document.querySelector('#projectsList .item[data-id="' + project.id
      + '"] .psteps');
    if (!host) return false;
    const pageX = window.scrollX;
    const pageY = window.scrollY;
    const before = [];
    const maps = host.querySelectorAll(".goal-roadmap");
    for (let i = 0; i < maps.length; i++) {
      const gap = Math.max(0, maps[i].scrollWidth - maps[i].clientWidth - maps[i].scrollLeft);
      before.push({ left: maps[i].scrollLeft, gap: gap, followedEnd: gap < 36 });
    }

    renderStepsInto(host, project);

    const restore = function () {
      if (!host.isConnected) return;
      const after = host.querySelectorAll(".goal-roadmap");
      for (let i = 0; i < after.length && i < before.length; i++) {
        after[i].scrollLeft = before[i].followedEnd
          ? Math.max(0, after[i].scrollWidth - after[i].clientWidth - before[i].gap)
          : before[i].left;
      }
      if (window.scrollX !== pageX || window.scrollY !== pageY) window.scrollTo(pageX, pageY);
    };
    restore();

    const row = host.closest(".item--project");
    const badge = row && row.querySelector(".project-tab .item__sub");
    if (badge) badge.textContent = Math.round(stepProgress(project) * 100) + "%";

    if (options && options.focusAdd) {
      const input = host.querySelector(".goal-ms--add.is-open input");
      if (input) {
        try { input.focus({ preventScroll: true }); }
        catch (err) { input.focus(); restore(); }
      }
    }
    if (options && options.focusBranch) {
      const body = host.querySelector('.psteps__body[data-branch="'
        + options.focusBranch + '"]');
      const input = body && body.querySelector("form.sub-add .add__input");
      if (input) {
        try { input.focus({ preventScroll: true }); }
        catch (err) { input.focus(); restore(); }
      }
    }
    requestAnimationFrame(restore);   // also defeat delayed scroll anchoring/focus
    return true;
  }

  function createInlineStepCap(role, project, color) {
    const node = document.createElement("div");
    node.className = "goal-ms is-anchor is-" + role;
    node.style.setProperty("--goal-color", color);
    if (role === "finish" && project.done) node.classList.add("is-done");
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "goal-ms__dot";
    if (role === "start") {
      dot.disabled = true;
      dot.setAttribute("aria-label", translate("stepsLabel"));
    } else {
      dot.setAttribute("aria-label", translate("completeLabel"));
      dot.setAttribute("aria-pressed", project.done ? "true" : "false");
      dot.addEventListener("click", function () {
        project.done = !project.done;
        saveState();
        refreshProjectSteps(project);
        renderList("projects");
        if (!skyView.hidden) renderSky();
      });
    }
    node.appendChild(dot);
    return node;
  }

  function createInlineStepNode(project, step, index, color) {
    const node = document.createElement("div");
    node.className = "goal-ms";
    node.dataset.stepId = step.id;
    node.style.setProperty("--goal-color", color);
    if (step.completedDate) node.classList.add("is-done");

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "goal-ms__dot";
    {
      dot.classList.add("goal-ms__dot--step");
      dot.setAttribute("aria-label", step.text || translate("stepPlaceholder"));
      dot.setAttribute("aria-pressed", step.completedDate ? "true" : "false");
      dot.addEventListener("click", function (event) {
        if (Date.now() < stepDragUntil) {
          event.preventDefault();
          return;
        }
        openInlineStep = null;
        toggleStep(project, step.id, node);
      });
      armInlineStepDrag(dot, node, project, step);
    }
    node.appendChild(dot);

    {
      const panel = document.createElement("div");
      panel.className = "goal-ms__panel";
      panel.appendChild(createInlineStepEditor(project, step));
      node.appendChild(panel);
    }
    return node;
  }

  /* A step can become concrete by being carried onto the task flow or the
     clock. A mouse drag starts on movement; touch waits for the same long press
     as task rows so an ordinary tap remains a completion toggle. */
  function armInlineStepDrag(dot, node, project, step) {
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
        startStepDrag(pointerEvent, dot, node, project, step);
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

  function createStepDropGuide(kind, label, icon) {
    const guide = document.createElement("div");
    guide.className = "step-drop-guide step-drop-guide--" + kind;
    guide.setAttribute("aria-hidden", "true");
    const mark = document.createElement("span");
    mark.className = "step-drop-guide__icon";
    mark.innerHTML = iconSvg(icon);
    const text = document.createElement("span");
    text.textContent = label;
    guide.append(mark, text);
    return guide;
  }

  function showStepDropGuides(drag) {
    const group = document.querySelector('.tgroup[data-drop-group=""]');
    const stage = document.getElementById("dayLineStage");
    const tasks = createStepDropGuide("tasks", translate("stepDropTasks"),
      '<circle cx="7" cy="7" r="2"/><circle cx="7" cy="17" r="2"/>'
      + '<line x1="12" y1="7" x2="21" y2="7"/><line x1="12" y1="17" x2="21" y2="17"/>');
    const timeline = createStepDropGuide("timeline", translate("stepDropTimeline"),
      '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>');
    if (group) group.appendChild(tasks);
    if (stage) stage.appendChild(timeline);
    drag.guides = { tasks: group ? tasks : null, timeline: stage ? timeline : null };
  }

  function updateStepDropGuides(drag, drop, undated) {
    if (!drag.guides) return;
    if (drag.guides.timeline) drag.guides.timeline.classList.toggle("is-active", !!drop);
    if (drag.guides.tasks) drag.guides.tasks.classList.toggle("is-active", !!undated);
  }

  function removeStepDropGuides(drag) {
    if (!drag.guides) return;
    if (drag.guides.tasks) drag.guides.tasks.remove();
    if (drag.guides.timeline) drag.guides.timeline.remove();
    drag.guides = null;
  }

  function startStepDrag(event, dot, node, project, step) {
    if (stepDrag) return;
    const ghost = document.createElement("div");
    ghost.className = "step-drag-ghost";
    const ghostDot = document.createElement("span");
    ghostDot.className = "step-drag-ghost__dot";
    const ghostLabel = document.createElement("span");
    ghostLabel.textContent = step.text || translate("stepPlaceholder");
    ghost.append(ghostDot, ghostLabel);
    ghost.style.setProperty("--goal-color", node.style.getPropertyValue("--goal-color"));
    document.body.appendChild(ghost);

    stepDrag = {
      dot: dot,
      node: node,
      project: project,
      step: step,
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
    const undated = document.querySelector('.tgroup[data-drop-group=""]');
    if (undated) undated.classList.add("is-drop-available");
    showStepDropGuides(stepDrag);
    showTimelineTrash(true, false);   // a step can be unmade there too
    moveStepGhost(event.clientX, event.clientY);
    updateStepDragTargets(event.clientX, event.clientY);
    document.addEventListener("pointermove", moveStepDrag, { passive: false });
    document.addEventListener("pointerup", endStepDrag);
    document.addEventListener("pointercancel", cancelStepDrag);
    cancelAnimationFrame(stepDragScrollFrame);
    stepDragScrollFrame = requestAnimationFrame(autoScrollStepDrag);
  }

  function moveStepGhost(clientX, clientY) {
    if (!stepDrag) return;
    stepDrag.ghost.style.left = (clientX + 14) + "px";
    stepDrag.ghost.style.top = (clientY + 12) + "px";
  }

  function updateStepDragTargets(clientX, clientY) {
    if (!stepDrag) return;
    stepDrag.pointerX = clientX;
    stepDrag.pointerY = clientY;

    // the bin wins over every other target: it is the only one that unmakes
    const deleting = timelineTrashHit(clientX, clientY);
    stepDrag.deleting = deleting;
    stepDrag.ghost.classList.toggle("is-delete-target", deleting);
    showTimelineTrash(true, deleting);

    const drop = deleting ? null : taskDropAt(clientX, clientY);
    stepDrag.drop = drop;
    showTaskDrop(drop, { text: stepDrag.step.text || translate("stepPlaceholder") });

    const group = document.querySelector('.tgroup[data-drop-group=""]');
    const undated = (deleting || drop) ? null : undatedDropPosition(clientX, clientY);
    stepDrag.undated = undated;
    if (group) group.classList.toggle("is-drop-target", !!undated);
    updateStepDropGuides(stepDrag, drop, undated);
  }

  function moveStepDrag(event) {
    if (!stepDrag) return;
    event.preventDefault();
    moveStepGhost(event.clientX, event.clientY);
    updateStepDragTargets(event.clientX, event.clientY);
  }

  function autoScrollStepDrag() {
    if (!stepDrag) return;
    const edge = Math.min(110, window.innerHeight * .18);
    let amount = 0;
    if (stepDrag.pointerY < edge) {
      amount = -Math.ceil((edge - stepDrag.pointerY) / edge * 18);
    } else if (stepDrag.pointerY > window.innerHeight - edge) {
      amount = Math.ceil((stepDrag.pointerY - (window.innerHeight - edge)) / edge * 18);
    }
    if (amount) {
      window.scrollBy(0, amount);
      updateStepDragTargets(stepDrag.pointerX, stepDrag.pointerY);
    }
    stepDragScrollFrame = requestAnimationFrame(autoScrollStepDrag);
  }

  function cleanStepDrag(drag) {
    drag.node.classList.remove("is-dragging");
    if (drag.dot.hasPointerCapture && drag.dot.hasPointerCapture(drag.pointerId)) {
      drag.dot.releasePointerCapture(drag.pointerId);
    }
    drag.ghost.remove();
    showTaskDrop(null);
    showTimelineTrash(false, false);
    removeStepDropGuides(drag);
    const undated = document.querySelector('.tgroup[data-drop-group=""]');
    if (undated) undated.classList.remove("is-drop-available", "is-drop-target");
    stepDragUntil = Date.now() + 350;
    cancelAnimationFrame(stepDragScrollFrame);
    stepDragScrollFrame = 0;
    document.removeEventListener("pointermove", moveStepDrag);
    document.removeEventListener("pointerup", endStepDrag);
    document.removeEventListener("pointercancel", cancelStepDrag);
  }

  function endStepDrag(event) {
    if (!stepDrag) return;
    updateStepDragTargets(event.clientX, event.clientY);
    const drag = stepDrag;
    stepDrag = null;
    cleanStepDrag(drag);
    if (drag.deleting) removeStep(drag.project, drag.step.id);
    else if (drag.drop) createTaskFromStep(drag.project, drag.step, drag.drop, null);
    else if (drag.undated) {
      createTaskFromStep(drag.project, drag.step, null,
                         drag.undated.beforeId, drag.undated.day);
    }
  }

  function cancelStepDrag() {
    if (!stepDrag) return;
    const drag = stepDrag;
    stepDrag = null;
    cleanStepDrag(drag);
  }

  /* `drop` is a spot on the rule (a day and an hour); `day` is a group of the list
     (a day, or "" for the undated tail). One or the other, never both. */
  /* THE OTHER DIRECTION — a step dropped on the list becomes a task; a task
     dropped on an objective becomes a step there. The pair keeps each other's id,
     which is the same invariant the start-up migration establishes: an objective
     shows its courses as steps, so a task attached to one without a step would
     belong to it invisibly. */
  function taskOfStep(stepId) {
    for (let i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].stepId === stepId) return state.tasks[i];
    }
    return null;
  }

  /* THE PAIR, READ FROM THE OTHER END — a task given to an objective becomes a
     step there, dated by its day alone. The reverse holds: a step given a day
     becomes a task due that day, so the work turns up where the day is read. The
     hour is never carried either way; it belongs to the task and to the rule.
     Clearing the step's day does not take the task away, only its date: what has
     been written down is not thrown out by a change of plan. */
  function syncTaskForStep(project, step) {
    const existing = taskOfStep(step.id);
    if (existing) {
      existing.dueDate = step.targetDate || null;
      if (!existing.dueDate) existing.dueTime = null;
      return existing;
    }
    if (!step.targetDate) return null;   // no day: nothing to put in a day

    const task = {
      id: Date.now().toString(),
      text: step.text || translate("stepPlaceholder"),
      done: !!step.completedDate,
      doneDate: step.completedDate || null,
      dueDate: step.targetDate,
      dueTime: null,
      projectId: project.id,
      stepId: step.id,
      notified: false
    };
    state.tasks.push(task);
    collapsedGroups["day:" + task.dueDate] = false;   // open where it landed
    return task;
  }

  function linkTaskToProject(task, project) {
    if (task.projectId === project.id && findStep(project, task.stepId)) return;
    // carried from one objective to another, it does not leave a step behind
    if (task.projectId && task.stepId && task.projectId !== project.id) {
      const from = findItem("projects", task.projectId);
      if (from) removeStep(from, task.stepId);
    }
    const step = {
      id: task.id + "s",
      text: task.text,
      completedDate: task.done ? (task.doneDate || todayKey()) : null,
      targetDate: task.dueDate || null
    };
    // the constellation on show, the same one a habit dropped here would join
    addStepToBranch(activeProjectBranch(project), step);
    task.projectId = project.id;
    task.stepId = step.id;
  }

  function createTaskFromStep(project, step, drop, beforeId, day) {
    const completedDate = step.completedDate || null;
    const task = {
      id: Date.now().toString(),
      text: step.text || translate("stepPlaceholder"),
      done: !!completedDate,
      doneDate: completedDate,
      dueDate: drop ? drop.date : (day || null),
      dueTime: drop ? drop.time : null,
      projectId: project.id,
      stepId: step.id,
      notified: false
    };
    state.tasks.push(task);
    if (!drop && !task.dueDate) {
      collapsedGroups.none = false;
      persistUndatedTaskOrder(undatedTaskOrderFor(task.id, beforeId));
    } else if (!drop) {
      collapsedGroups["day:" + task.dueDate] = false;   // open where it landed
    }
    saveState();
    renderList("tasks");
    renderDailyTimeline();
    if (drop) ensureNotifyPermission();
    showToast(translate("stepCreated"));
  }

  function createInlineStepEditor(project, step) {
    const editor = document.createElement("div");
    editor.className = "goal-ms__editor";
    const top = document.createElement("div");
    top.className = "goal-ms__editor-top";
    const done = document.createElement("button");
    done.type = "button";
    done.className = step.completedDate ? "goal-ms__check is-on" : "goal-ms__check";
    done.setAttribute("aria-label", translate("doneAria"));
    done.setAttribute("aria-pressed", step.completedDate ? "true" : "false");
    done.innerHTML = iconSvg(ICON_TICK);
    done.addEventListener("click", function () {
      toggleStep(project, step.id, done.closest(".goal-ms"));
    });
    const name = document.createElement("input");
    name.type = "text";
    name.className = "goal-ms__name";
    name.maxLength = 120;
    name.value = step.text || "";
    name.placeholder = translate("stepPlaceholder");
    name.addEventListener("input", function () {
      step.text = name.value;
      saveState();
    });
    top.append(done, name);

    const actions = document.createElement("div");
    actions.className = "goal-ms__actions";
    const when = document.createElement("button");
    when.type = "button";
    when.className = "goal-ms__action";
    when.textContent = step.targetDate
      ? shortDateLabel(step.targetDate) : translate("stepTarget");
    when.addEventListener("click", function () {
      openCalendar({ projectId: project.id, stepId: step.id }, "step");
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "goal-ms__action goal-ms__action--icon goal-ms__action--del";
    del.setAttribute("aria-label", translate("deleteAria"));
    del.innerHTML = iconSvg(ICON_TRASH);
    del.addEventListener("click", function () {
      openInlineStep = null;
      removeStep(project, step.id, del.closest(".goal-roadmap"));
    });
    actions.append(when, del);
    editor.append(top, actions);
    return editor;
  }

  function createInlineStepAdd(project, branch) {
    const node = document.createElement("div");
    node.className = "goal-ms goal-ms--add";
    if (inlineStepAdd === branch.id) node.classList.add("is-open");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "goal-ms__dot goal-ms__dot--add";
    button.textContent = "+";
    button.setAttribute("aria-label", translate("stepAdd"));
    button.setAttribute("aria-expanded", inlineStepAdd === branch.id ? "true" : "false");
    button.addEventListener("click", function () {
      inlineStepAdd = inlineStepAdd === branch.id ? null : branch.id;
      openInlineStep = null;
      redrawSteps(project, { focusAdd: inlineStepAdd === branch.id });
    });
    const panel = document.createElement("div");
    panel.className = "goal-ms__panel";
    if (inlineStepAdd === branch.id) {
      const form = document.createElement("form");
      form.className = "goal-ms__add-form";
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 120;
      input.placeholder = translate("stepAdd");
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "+";
      submit.setAttribute("aria-label", translate("addAria"));
      form.append(input, submit);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        openInlineStep = null;
        inlineStepAdd = null;
        addStep(project, text, branch.id);
      });
      panel.appendChild(form);
    } else {
      const label = document.createElement("span");
      label.className = "goal-ms__title";
      label.textContent = translate("stepAdd");
      panel.appendChild(label);
    }
    node.append(button, panel);
    return node;
  }

  /* THE STEPS — Rêve can still read them as a roadmap or a checklist. The task
     dashboard is the working surface, so its host is marked list-only and keeps
     that mode through every local redraw. */
  function renderStepsInto(host, project) {
    host.innerHTML = "";
    host.dataset.project = project.id;
    const listOnly = host.dataset.listOnly === "1";

    const head = document.createElement("div");
    head.className = "psteps__head";
    const label = document.createElement("span");
    label.className = "detail__label";
    label.textContent = translate("stepsLabel");
    const add = document.createElement("button");
    add.type = "button";
    add.className = "zone__action psteps__addbranch";
    add.setAttribute("aria-label", translate("branchAdd"));
    add.textContent = translate("branchAdd");
    add.addEventListener("click", function () {
      const branch = addBranch(project, "");
      if (listOnly) {
        project.activeConstellationId = branch.id;
        saveState();
      }
      refreshStepSections(project);
    });
    head.appendChild(label);
    if (!listOnly) head.appendChild(createStepsViewSwitch(project));
    head.appendChild(add);
    host.appendChild(head);

    const branches = projectBranches(project);
    const upright = host.id === "pviewSteps";   // the panel is a column, not a strip
    if (listOnly) {
      host.appendChild(createBranchBlock(project, activeProjectBranch(project),
        branches.length > 1, true, upright));
      return;
    }
    for (let i = 0; i < branches.length; i++) {
      host.appendChild(createBranchBlock(project, branches[i], branches.length > 1,
        listOnly, upright));
    }
  }

  /* Up to four moons in an arc, then a pill for the rest: four phases are read at
     a glance, eight are noise. The order never changes — a moon that moved as it
     waned would make the sky unreadable, so the dark one is found by looking. */
  const MOONS_SHOWN = 4;

  function createMoonStrip(branch) {
    const strip = document.createElement("span");
    strip.className = "moons";
    const habits = branchHabits(branch);
    for (let i = 0; i < habits.length && i < MOONS_SHOWN; i++) {
      strip.appendChild(createMoon(habits[i]));
    }
    if (habits.length > MOONS_SHOWN) {
      const more = document.createElement("span");
      more.className = "moons__more";
      more.textContent = "+" + (habits.length - MOONS_SHOWN);
      strip.appendChild(more);
    }
    return strip;
  }

  /* The same star the sky draws, in miniature: kept every day it burns, let go it
     barely shows. One vocabulary for a habit, here and in the sky. */
  function createMoon(habit) {
    const phase = habitPhase(habit);
    const mark = document.createElement("span");
    mark.className = "moon";
    mark.style.setProperty("--mag", (0.25 + phase * 0.75).toFixed(2));
    mark.title = (habit.name || "") + " · " + Math.round(phase * 100) + "%";
    return mark;
  }

  /* Habits live under the steps: the steps say what to do once, these say what to
     keep doing. Typing a name makes the habit right here — but a name already taken
     attaches that habit instead of raising a twin. */
  function createBranchHabits(project, branch) {
    const section = document.createElement("div");
    section.className = "phabits";

    const list = document.createElement("div");
    list.className = "phabits__list";
    const habits = branchHabits(branch);
    for (let i = 0; i < habits.length; i++) {
      list.appendChild(createBranchHabitRow(project, branch, habits[i]));
    }
    section.appendChild(list);

    const form = document.createElement("form");
    form.className = "sub-add phabits__add";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "add__input";
    input.maxLength = 80;
    input.placeholder = translate(habits.length ? "moonNew" : "moonEmptyAdd");
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "add__btn";
    submit.textContent = "+";
    form.append(input, submit);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      attachHabitNamed(project, branch, name);
      input.value = "";
    });
    section.appendChild(form);
    return section;
  }

  function createBranchHabitRow(project, branch, habit) {
    const row = document.createElement("div");
    row.className = "phabits__row";
    const icon = document.createElement("button");
    icon.type = "button";
    icon.className = "phabits__icon";
    icon.dataset.habitId = habit.id;
    icon.setAttribute("aria-label", translate("pickIconTitle"));
    icon.title = translate("pickIconTitle");
    icon.innerHTML = habitSvg(habit.icon || "star");
    icon.addEventListener("click", function () {
      openIconPickerForEdit(habit.id);
    });
    const name = document.createElement("span");
    name.className = "phabits__name";
    name.textContent = habit.name || translate("blockHabit");
    const kept = document.createElement("span");
    kept.className = "phabits__kept";
    kept.textContent = Math.round(habitPhase(habit) * 100) + "%";
    const off = document.createElement("button");
    off.type = "button";
    off.className = "phabits__off";
    off.setAttribute("aria-label", translate("moonOff"));
    off.title = translate("moonOff");
    off.textContent = "\u00d7";
    off.addEventListener("click", function () {
      toggleBranchHabit(branch, habit.id);
      refreshBranchHabits(project);
    });
    row.append(icon, name, kept, off);
    return row;
  }

  function attachHabitNamed(project, branch, name) {
    const lowered = name.toLowerCase();
    let habit = null;
    for (let i = 0; i < state.habits.length; i++) {
      if ((state.habits[i].name || "").trim().toLowerCase() === lowered) {
        habit = state.habits[i];
        break;
      }
    }
    if (!habit) {
      habit = { id: Date.now().toString(), name: name, icon: "star", completedDates: [] };
      state.habits.push(habit);
    }
    if ((branch.habitIds || []).indexOf(habit.id) === -1) toggleBranchHabit(branch, habit.id);
    else saveState();
    renderHabits();
    refreshBranchHabits(project);
  }

  /* the moons hang off the star, so a change here redraws the sky too */
  function refreshBranchHabits(project) {
    refreshStepSections(project);
    if (!skyView.hidden) renderSky();
  }

  /* one branch: its name, then the same two readings the objective had before */
  function createBranchBlock(project, branch, removable, listOnly, vertical) {
    const block = document.createElement("section");
    block.className = "pbranch";

    const head = document.createElement("div");
    head.className = "pbranch__head";
    const icon = document.createElement("button");
    icon.type = "button";
    icon.className = listOnly && removable ? "pbranch__icon is-switch" : "pbranch__icon";
    icon.disabled = listOnly && !removable;
    const iconAction = translate(listOnly ? "branchSwitchAria" : "branchIconAria");
    icon.setAttribute("aria-label", iconAction);
    icon.title = iconAction;
    icon.innerHTML = habitSvg(branch.icon || CONSTELLATION_ICON_KEYS[0]);
    icon.addEventListener("click", function (event) {
      event.stopPropagation();
      if (listOnly) switchProjectBranch(project);
      else openIconPickerForBranch(project, branch);
    });
    const name = document.createElement("input");
    name.type = "text";
    name.className = "pbranch__name";
    name.maxLength = 80;
    name.value = branch.name || "";
    name.placeholder = translate("branchName");
    name.addEventListener("input", function () {
      branch.name = name.value;
      saveState();
    });
    head.append(icon, name);
    head.appendChild(createMoonStrip(branch));
    if (removable) {
      const drop = document.createElement("button");
      drop.type = "button";
      drop.className = "pbranch__del";
      drop.setAttribute("aria-label", translate("branchRemove"));
      drop.textContent = "×";
      drop.addEventListener("click", function () {
        removeBranch(project, branch.id);
        refreshStepStructure(project);
      });
      head.appendChild(drop);
    }
    block.appendChild(head);

    const body = document.createElement("div");
    const roadmap = !listOnly && project.stepsView !== "list";
    // The dashboard row is wide and short, the star's panel is a narrow column.
    // Same course, laid the way the space it sits in can actually read it.
    const upright = roadmap && vertical;
    body.className = roadmap
      ? (upright ? "psteps__body psteps__body--rail" : "psteps__body goal-roadmap")
      : "psteps__body";
    body.dataset.branch = branch.id;
    if (listOnly) body.dataset.listOnly = "1";
    const pulse = branchPulse(branch);
    if (pulse !== null) body.style.setProperty("--branch-pulse", pulse.toFixed(2));
    if (upright) renderRailSteps(body, project, branch);
    else if (roadmap) renderInlineSteps(body, project, branch);
    else renderStepChecklist(body, project, branch);
    block.appendChild(body);
    block.appendChild(createBranchHabits(project, branch));
    return block;
  }

  /* A thread running down, the steps written beside it. The line is drawn by the
     rail rather than by each row, so it stays unbroken however tall a step grows. */
  function renderRailSteps(host, project, branch) {
    const rail = document.createElement("span");
    rail.className = "vrail";
    const fill = document.createElement("span");
    fill.className = "vrail__fill";
    const steps = branch.steps;
    let done = 0;
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].completedDate) done++;
    }
    // the thread is lit as far as the last step reached
    fill.style.height = steps.length ? (done / steps.length * 100).toFixed(1) + "%" : "0";
    rail.appendChild(fill);
    host.appendChild(rail);
    renderStepChecklist(host, project, branch);
  }

  function createStepsViewSwitch(project) {
    const wrap = document.createElement("div");
    wrap.className = "psteps__switch";
    const views = [
      { key: "timeline", label: "stepsViewRoadmap" },
      { key: "list", label: "stepsViewList" }
    ];
    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      const button = document.createElement("button");
      button.type = "button";
      button.className = (project.stepsView === view.key) ? "psteps__tab is-on" : "psteps__tab";
      button.textContent = translate(view.label);
      button.addEventListener("click", function () {
        project.stepsView = view.key;
        saveState();
        refreshProjectSteps(project);
      });
      wrap.appendChild(button);
    }
    return wrap;
  }

  /* The dashboard has a scroll-preserving path of its own; everywhere else — the
     panel a star opens — there is no row to spare, so the section is simply redrawn.
     Anything that changes the steps goes through here rather than picking one. */
  function redrawSteps(project, options) {
    const inline = refreshInlineSteps(project, options);
    refreshProjectSteps(project, inline ? "#projectsList" : null);
    if (inline) return;
    if (options && options.focusAdd) {
      const input = document.querySelector(".psteps .goal-ms--add.is-open input");
      if (input) {
        try { input.focus({ preventScroll: true }); }
        catch (err) { input.focus(); }
      }
    }
  }

  /* Refresh only the steps surfaces. Structural changes use this instead of
     rebuilding #projectsList, so the title, journal and open objective survive. */
  function refreshStepSections(project, options) {
    const inline = refreshInlineSteps(project, options);
    refreshProjectSteps(project, inline ? "#projectsList" : null);
    return inline;
  }

  function refreshStepStructure(project, options) {
    const inline = refreshStepSections(project, options);
    if (!inline) renderList("projects");   // update the badge of a closed objective
    return inline;
  }

  /* every steps section on screen, redrawn */
  function refreshProjectSteps(project, skipInside) {
    const hosts = document.querySelectorAll('.psteps[data-project="' + project.id + '"]');
    for (let i = 0; i < hosts.length; i++) {
      if (skipInside && hosts[i].closest(skipInside)) continue;   // already redrawn
      renderStepsInto(hosts[i], project);
    }
    liveSky();
  }

  function createProjectStepsHost(project, listOnly) {
    const host = document.createElement("section");
    host.className = "psteps";
    if (listOnly) host.dataset.listOnly = "1";
    renderStepsInto(host, project);
    return host;
  }

  const PROJECT_LIST_PAGE_SIZE = 6;
  const stepListPages = {};
  const journalListPages = {};

  function boundedListPage(store, key, total) {
    const last = Math.max(0, Math.ceil(total / PROJECT_LIST_PAGE_SIZE) - 1);
    const page = Math.max(0, Math.min(last, store[key] || 0));
    store[key] = page;
    return { page: page, last: last };
  }

  /* The same quiet navigation frames both columns. The upper chevron returns to
     newer work; the lower one reveals the preceding group of six. */
  function createProjectListPager(position, pageState, onMove) {
    const nav = document.createElement("div");
    nav.className = "project-list-pager project-list-pager--" + position;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-list-pager__button";
    const newer = position === "top";
    button.disabled = newer ? pageState.page === 0 : pageState.page === pageState.last;
    button.setAttribute("aria-label", translate(newer ? "newerItemsAria" : "olderItemsAria"));
    button.innerHTML = iconSvg(newer
      ? '<polyline points="6 15 12 9 18 15"/>'
      : '<polyline points="6 9 12 15 18 9"/>');
    button.addEventListener("click", function () {
      onMove(pageState.page + (newer ? -1 : 1));
    });
    nav.appendChild(button);
    return nav;
  }

  /* The checklist follows the journal: its add line and newest six steps are at
     the top. Older groups are reached without making the objective grow forever. */
  function renderStepChecklist(host, project, branch) {
    const steps = branch.steps;
    const limited = host.dataset.listOnly === "1";
    if (!limited) {
      for (let i = 0; i < steps.length; i++) {
        host.appendChild(createStepChecklistRow(project, steps[i], i, steps.length, branch));
      }
      host.appendChild(createStepChecklistAdd(project, branch));
      return;
    }
    const pageKey = project.id + "|" + branch.id;
    const pageState = boundedListPage(stepListPages, pageKey, steps.length);
    host.appendChild(createStepChecklistAdd(project, branch));
    if (pageState.last > 0) {
      host.appendChild(createProjectListPager("top", pageState, function (page) {
        stepListPages[pageKey] = page;
        refreshInlineSteps(project);
      }));
    }

    const newest = steps.length - 1 - pageState.page * PROJECT_LIST_PAGE_SIZE;
    const oldest = Math.max(0, newest - PROJECT_LIST_PAGE_SIZE + 1);
    for (let i = newest; i >= oldest; i--) {
      host.appendChild(createStepChecklistRow(project, steps[i], i, steps.length, branch));
    }
    if (pageState.last > 0) {
      host.appendChild(createProjectListPager("bottom", pageState, function (page) {
        stepListPages[pageKey] = page;
        refreshInlineSteps(project);
      }));
    }
  }

  function createStepChecklistRow(project, step, index, total, branch) {
    const row = document.createElement("div");
    row.className = step.completedDate ? "step is-done" : "step";
    row.dataset.stepId = step.id;
    const color = paletteColorAt(paletteStops(), total > 1 ? index / (total - 1) : 0);
    row.style.setProperty("--step-color", color);
    row.style.setProperty("--goal-color", color);

    const drag = document.createElement("button");
    drag.type = "button";
    drag.className = "step__drag";
    drag.setAttribute("aria-label", translate("stepDragAria"));
    drag.title = translate("stepDragAria");
    drag.innerHTML = iconSvg('<circle cx="8" cy="7" r="1"/><circle cx="16" cy="7" r="1"/>'
      + '<circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/>'
      + '<circle cx="8" cy="17" r="1"/><circle cx="16" cy="17" r="1"/>');
    armInlineStepDrag(drag, row, project, step);
    row.appendChild(drag);

    row.appendChild(createCheckbox(function () { toggleStep(project, step.id, row); }));

    // a textarea rather than an input: a long step has to be readable whole, and
    // a single-line field can only ever show the end of what was typed
    const label = document.createElement("textarea");
    label.className = "step__text";
    label.rows = 1;
    label.value = step.text || "";
    label.maxLength = 200;
    label.addEventListener("input", function () {
      step.text = label.value;
      fitLine(label);
      saveState();
    });
    // Enter commits instead of opening a line: a step is one sentence, not a note
    label.addEventListener("keydown", function (key) {
      if (key.key === "Enter") { key.preventDefault(); label.blur(); }
    });
    row.appendChild(label);
    requestAnimationFrame(function () { fitLine(label); });

    const when = document.createElement("button");
    when.type = "button";
    when.className = step.targetDate ? "step__when is-set" : "step__when";
    when.innerHTML = iconSvg('<rect x="3" y="4" width="18" height="18" rx="2"/>'
      + '<line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>'
      + '<line x1="3" y1="10" x2="21" y2="10"/>');
    if (step.targetDate) {
      const tag = document.createElement("span");
      tag.textContent = shortDateLabel(step.targetDate);
      if (!step.completedDate && step.targetDate < todayKey()) when.classList.add("is-late");
      when.appendChild(tag);
    }
    when.addEventListener("click", function () {
      openCalendar({ projectId: project.id, stepId: step.id }, "step");
    });
    row.appendChild(when);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "step__del";
    del.setAttribute("aria-label", translate("deleteAria"));
    del.textContent = "×";
    del.addEventListener("click", function () { removeStep(project, step.id); });
    row.appendChild(del);
    return row;
  }

  function createStepChecklistAdd(project, branch) {
    const form = document.createElement("form");
    form.className = "sub-add";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "add__input";
    input.placeholder = translate(branch.steps.length ? "stepAdd" : "stepsEmptyAdd");
    input.required = true;
    const button = document.createElement("button");
    button.type = "submit";
    button.className = "add__btn";
    button.setAttribute("aria-label", translate("addAria"));
    button.textContent = "+";
    form.append(input, button);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const text = input.value.trim();
      if (text) addStep(project, text, branch.id, { focusBranch: branch.id });
    });
    return form;
  }

  /* "12 juil." — localized short date */
  function shortDateLabel(isoDate) {
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    return new Date(isoDate + "T00:00").toLocaleDateString(locale, { day: "numeric", month: "short" });
  }

  function addStep(project, text, branchId, options) {
    const branch = (branchId && findBranch(project, branchId)) || projectBranches(project)[0];
    const step = { id: Date.now().toString(), text: text, completedDate: null, targetDate: null };
    addStepToBranch(branch, step);
    stepListPages[project.id + "|" + branch.id] = 0;
    saveState();
    refreshStepStructure(project, options);
    return step;
  }

  /* THE ORDER OF A COURSE — a constellation is walked, not picked at: the steps
     reached form one unbroken block at its head, and what is left follows it. So
     checking a step that sits below unfinished work is not refused — the step
     slides up to just after the last one reached. Unchecking one from inside that
     block leaves it by the same boundary, from the other side. Neither list ever
     has to be put back in agreement by hand. */
  function doneBoundary(steps) {
    let at = 0;
    while (at < steps.length && steps[at].completedDate) at++;
    return at;
  }

  /* put a step back where its state says it belongs; true if that moved it */
  function settleStep(branch, step) {
    if (!branch) return false;
    const steps = branch.steps;
    const from = steps.indexOf(step);
    if (from === -1) return false;
    steps.splice(from, 1);
    const to = doneBoundary(steps);
    steps.splice(to, 0, step);
    return to !== from;
  }

  /* a step arriving already done — a task linked to an objective after the fact —
     joins the block it belongs to rather than the end of the course */
  function addStepToBranch(branch, step) {
    branch.steps.push(step);
    if (step.completedDate) settleStep(branch, step);
    return step;
  }

  /* A step that has just changed rank must not disappear while being checked:
     the dashboard shows its checklist six at a time, newest first, so settling
     one often sends it onto another page. The page follows it. */
  function followStepPage(project, branch, step) {
    const index = branch.steps.indexOf(step);
    if (index < 0) return;
    const fromNewest = branch.steps.length - 1 - index;
    stepListPages[project.id + "|" + branch.id] =
      Math.floor(fromNewest / PROJECT_LIST_PAGE_SIZE);
  }

  /* mark done (stamps today's date) or clear it, settle the order, refill the gauge */
  function toggleStep(project, id, inlineNode) {
    const step = findStep(project, id);
    if (!step) return;
    const branch = branchOfStep(project, id);
    const places = stepPlaces();   // measured while the old order is still on screen
    step.completedDate = step.completedDate ? null : todayKey();
    const moved = settleStep(branch, step);
    const completedTasks = step.completedDate
      ? completeStepTasks(project, step) : [];
    saveState();
    if (moved) {
      // its rank changed: no section can be patched in place, but they all slide
      followStepPage(project, branch, step);
      if (completedTasks.length) refreshTasksCompletedByStep(project, completedTasks);
      refreshStepStructure(project);
      refreshProjectBadge(project);
      slideSteps(places);
      return;
    }
    const localDashboardNode = inlineNode && inlineNode.isConnected
      && inlineNode.closest("#projectsList");
    if (localDashboardNode) refreshInlineStep(project, step, inlineNode);
    if (completedTasks.length) refreshTasksCompletedByStep(project, completedTasks);
    if (localDashboardNode) {
      // Keep a simultaneously open Rêve panel current without replacing the
      // objective row that was just clicked.
      refreshProjectSteps(project, "#projectsList");
      return;
    }
    refreshProjectSteps(project);
    renderList("projects");
  }

  /* A click in the dashboard must not rebuild the project list: replacing the
     whole row also replaces the browser's scroll anchor, which made the page
     jump. Named steps update in place. The finish anchor is the sole case
     that changes the number of nodes (+ appears/disappears), so only its local
     roadmap is rebuilt while both page and horizontal positions are retained. */
  function refreshInlineStep(project, step, node) {
    const done = !!step.completedDate;
    if (node.classList.contains("step")) {
      node.classList.toggle("is-done", done);
      const checkbox = node.querySelector(".item__check");
      if (checkbox) checkbox.setAttribute("aria-pressed", done ? "true" : "false");
      const when = node.querySelector(".step__when");
      if (when) {
        when.classList.toggle("is-late",
          !done && !!step.targetDate && step.targetDate < todayKey());
      }
      refreshProjectBadge(project);
      return;
    }
    const roadmap = node.closest(".goal-roadmap");
    if (!roadmap) return;

    {
      node.classList.toggle("is-done", done);
      const dot = node.querySelector(".goal-ms__dot");
      const check = node.querySelector(".goal-ms__check");
      if (dot) dot.setAttribute("aria-pressed", done ? "true" : "false");
      if (check) {
        check.classList.toggle("is-on", done);
        check.setAttribute("aria-pressed", done ? "true" : "false");
      }
      const fill = roadmap.querySelector(".goal-roadmap__fill");
      if (fill) fill.style.width = (stepProgress(project) * 100).toFixed(1) + "%";
    }
    refreshProjectBadge(project);
  }

  /* the percentage on the closed objective tab, wherever a step changed */
  function refreshProjectBadge(project) {
    const badge = document.querySelector('#projectsList .item[data-id="' + project.id
      + '"] .project-tab .item__sub');
    if (badge) badge.textContent = Math.round(stepProgress(project) * 100) + "%";
  }

  function removeStep(project, id) {
    const branch = branchOfStep(project, id);
    if (branch) {
      for (let i = 0; i < branch.steps.length; i++) {
        if (branch.steps[i].id === id) { branch.steps.splice(i, 1); break; }
      }
    }
    const freed = unlinkTasksFromStep(id);
    saveState();
    refreshStepStructure(project);
    if (freed) renderList("tasks");   // the star it carried is gone with the step
  }

  /* A step taken away leaves nothing pointing at it. The task it stood for is not
     deleted with it — it keeps its place in the day — but it goes back to being a
     plain task: an objective shows its work as steps, so a task still claiming to
     belong to one without a step there would belong to it invisibly. */
  function unlinkTasksFromStep(stepId) {
    if (!stepId) return false;
    let freed = false;
    for (let i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].stepId !== stepId) continue;
      state.tasks[i].stepId = null;
      state.tasks[i].projectId = null;
      freed = true;
    }
    return freed;
  }

  function findStep(project, id) {
    const branches = projectBranches(project);
    for (let i = 0; i < branches.length; i++) {
      for (let j = 0; j < branches[i].steps.length; j++) {
        if (branches[i].steps[j].id === id) return branches[i].steps[j];
      }
    }
    return null;
  }

  /* the branch a step belongs to, needed to take it out again */
  function branchOfStep(project, id) {
    const branches = projectBranches(project);
    for (let i = 0; i < branches.length; i++) {
      for (let j = 0; j < branches[i].steps.length; j++) {
        if (branches[i].steps[j].id === id) return branches[i];
      }
    }
    return null;
  }

  /* A task born from a step keeps both ids. Resolve that relation in one
     place so its colour and its completion always point at the same dot. */
  function taskStepLink(task) {
    if (!task || !task.projectId || !task.stepId) return null;
    const project = findItem("projects", task.projectId);
    if (!project) return null;
    const branches = projectBranches(project);
    for (let b = 0; b < branches.length; b++) {
      const steps = branches[b].steps;
      for (let i = 0; i < steps.length; i++) {
        if (steps[i].id === task.stepId) {
          return {
            project: project, branch: branches[b],
            step: steps[i], index: i, total: steps.length
          };
        }
      }
    }
    return null;
  }

  function stepTaskColor(task) {
    const link = taskStepLink(task);
    if (!link) return null;
    const position = link.total > 1 ? link.index / (link.total - 1) : 0;
    return paletteColorAt(paletteStops(), position);
  }

  /* Completion travels from the concrete task back to its source step.
     Reopening the task does not reopen the step: reaching a step is
     a durable event, while the task can still be reviewed independently. */
  function completeTaskStep(task) {
    const link = taskStepLink(task);
    if (!link || link.step.completedDate) return null;
    link.step.completedDate = task.doneDate || todayKey();
    link.moved = settleStep(link.branch, link.step);
    return link;
  }

  /* The relation also travels back to concrete work: reaching a step
     completes every task that was created from that exact dot. */
  function completeStepTasks(project, step) {
    const completed = [];
    for (let i = 0; i < state.tasks.length; i++) {
      const task = state.tasks[i];
      if (task.projectId !== project.id || task.stepId !== step.id || task.done) continue;
      task.done = true;
      task.doneDate = step.completedDate;
      completed.push(task.id);
    }
    return completed;
  }

  function refreshTasksCompletedByStep(project, taskIds) {
    renderList("tasks");
    // If an editor currently freezes the task list, update its visible source
    // rows immediately and leave the structural move to the deferred repaint.
    for (let i = 0; i < taskIds.length; i++) {
      const row = document.querySelector('.item[data-id="' + taskIds[i] + '"]');
      if (row) row.classList.add("done");
    }
    renderTasksRing();
    renderDailyTimeline();
  }

  /* Keep every visible representation current without rebuilding the complete
     project list (which would move the scroll anchor of an open objective). */
  function refreshLinkedStepProject(link) {
    const project = link && link.project;
    const step = link && link.step;
    if (!project) return;
    if (link.moved) {
      // the step changed rank in its course, so no section can be patched
      const places = stepPlaces();
      followStepPage(project, link.branch, step);
      refreshStepSections(project);
      refreshProjectBadge(project);
      slideSteps(places);
      return;
    }
    const projectRow = document.querySelector('#projectsList .item[data-id="' + project.id + '"]');
    if (projectRow && step) {
      const nodes = projectRow.querySelectorAll("[data-step-id]");
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].dataset.stepId === step.id) {
          refreshInlineStep(project, step, nodes[i]);
          break;
        }
      }
    }
    refreshProjectBadge(project);
    refreshProjectSteps(project, "#projectsList");
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

  function relLuminance(rgb) {
    const channel = [rgb.r, rgb.g, rgb.b];
    let out = 0;
    const weight = [0.2126, 0.7152, 0.0722];
    for (let i = 0; i < 3; i++) {
      const s = channel[i] / 255;
      out += weight[i] * (s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4));
    }
    return out;
  }

  /* The sky is one gradient from --c-sky-1 at the bottom to --c-sky-3 at the
     top, with --c-sky-2 at --c-sky-mid. Resolve what colour it holds a given
     way up, so anything standing on it can ask what it is standing on. */
  /* the sun ramp further down owns `mixRgb`, and it speaks in [r,g,b] arrays
     while hexToRgb speaks in objects; blending here rather than adding a second
     function under the same name, which is exactly how this first went wrong */
  function skyColorAt(t) {
    const css = getComputedStyle(document.documentElement);
    const low = hexToRgb(css.getPropertyValue("--c-sky-1").trim());
    const mid = hexToRgb(css.getPropertyValue("--c-sky-2").trim());
    const high = hexToRgb(css.getPropertyValue("--c-sky-3").trim());
    const at = (parseFloat(css.getPropertyValue("--c-sky-mid")) || 45) / 100;
    const a = t <= at ? low : mid;
    const b = t <= at ? mid : high;
    const k = t <= at ? (at ? t / at : 0) : (t - at) / (1 - at);
    return {
      r: a.r + (b.r - a.r) * k,
      g: a.g + (b.g - a.g) * k,
      b: a.b + (b.b - a.b) * k
    };
  }

  /* THE THRESHOLD'S INK — the welcome screen shows the sky raw and at full
     strength; the app lays the page colour over it, and its text leans on that
     floor. Most horizons sit close enough to their own page for the theme's
     inks to hold. Dusk's does not: it runs dark violet overhead to hot orange
     at the horizon, so the pale ink meant for a dark page lands on a bright one
     and the hint measured 1.01:1 — invisible. The threshold therefore asks the
     sky what colour it is, at the height the lower writing actually sits. */
  const THRESHOLD_SAMPLE = 0.26;   // how far up from the bottom that writing is

  function tuneThresholdInk() {
    if (!welcomeScreen) return;
    const lit = relLuminance(skyColorAt(THRESHOLD_SAMPLE)) > 0.30;
    welcomeScreen.classList.toggle("is-on-light", lit);
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
    projectView.hidden = false;
    fillProjectView(project);
    requestAnimationFrame(function () {
      projectView.classList.add("is-open");
      focusStar(project);
    });
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
    pviewIcon.innerHTML = projectSvg(project.icon || "folder");
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
    pviewDone.classList.toggle("is-on", !!project.done);
    document.getElementById("pviewDoneLabel").textContent =
      translate(project.done ? "reopenLabel" : "completeLabel");
    // In the sky the constellation is the course: showing it again as a roadmap
    // beside it says the same thing twice. The panel keeps the plain list.
    pviewSteps.dataset.listOnly = "1";
    renderStepsInto(pviewSteps, project);
    renderJournal(project);
    renderWall(project);
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

  /* PROMOTION — an idea in the journal and a step on the line are both things
     you can only act on once they become a step. One button turns either into one,
     without leaving the workspace. */
  const ICON_PROMOTE = '<polyline points="4 12 8.5 16.5 20 5"/><line x1="4" y1="19" x2="14" y2="19"/>';

  /* an idea in the journal becomes a step on the project's own list, not a loose
     task: the list of steps is the project's single course now */
  function promoteToStep(project, text) {
    const step = addStep(project, text);
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

  /* JOURNAL — dated lines, newest first. It is both a log of what moved and the
     place ideas land before they become steps; it also feeds the star's glow. */
  function renderJournal(project) {
    renderJournalInto(pviewJournal, project);
  }

  function renderJournalInto(host, project) {
    host.innerHTML = "";
    const entries = project.journal || (project.journal = []);
    const pageState = boundedListPage(journalListPages, project.id, entries.length);
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "detail__empty";
      empty.textContent = translate("journalEmpty");
      host.appendChild(empty);
      return;
    }
    if (pageState.last > 0) {
      host.appendChild(createProjectListPager("top", pageState, function (page) {
        journalListPages[project.id] = page;
        refreshProjectJournals(project);
      }));
    }
    const newest = entries.length - 1 - pageState.page * PROJECT_LIST_PAGE_SIZE;
    const oldest = Math.max(0, newest - PROJECT_LIST_PAGE_SIZE + 1);
    for (let i = newest; i >= oldest; i--) {
      host.appendChild(createJournalRow(project, entries[i]));
    }
    if (pageState.last > 0) {
      host.appendChild(createProjectListPager("bottom", pageState, function (page) {
        journalListPages[project.id] = page;
        refreshProjectJournals(project);
      }));
    }
  }

  function refreshProjectJournals(project) {
    liveSky();                    // a line written feeds the star's own glow
    if (openProject === project.id) renderJournal(project);
    const inline = document.querySelector('#projectsList .item[data-id="' + project.id
      + '"] .goal-inline__journal');
    if (inline) renderJournalInto(inline, project);
  }

  /* THE PROJECT MODEL — a project is worked on in three places: the panel a star
     opens, the objective unfolded in the dashboard list, and a block on a canvas.
     Everything that makes or changes one goes through here, so the three cannot
     drift apart, and a project made on a canvas is the same object as any other. */
  function createProject(text, extra) {
    const project = {
      id: (extra && extra.id) || Date.now().toString(),
      text: text || translate("addProjectAria"),
      icon: "folder",
      sky: freeSkySpot(state.projects.length),
      why: "", outcome: "",
      journal: [], dream: []
    };
    if (extra) {
      const keys = Object.keys(extra);
      for (let i = 0; i < keys.length; i++) project[keys[i]] = extra[keys[i]];
    }
    state.projects.push(project);
    return project;
  }

  function renameProject(project, text) {
    project.text = text;
    saveState();
  }

  function addProjectJournal(project, text) {
    if (!project.journal) project.journal = [];
    const entry = { id: Date.now().toString(), date: todayKey(), text: text };
    project.journal.push(entry);
    journalListPages[project.id] = 0;
    saveState();
    refreshProjectJournals(project);
    return entry;
  }

  function removeProjectJournal(project, entryId) {
    if (!project || !project.journal) return;
    for (let i = 0; i < project.journal.length; i++) {
      if (project.journal[i].id === entryId) { project.journal.splice(i, 1); break; }
    }
    saveState();
    refreshProjectJournals(project);
  }

  /* every surface a project shows on, refreshed at once */
  /* The sky is a live view of the same objects, not a picture taken on entering.
     Redrawing it is cheap, but never while a star is in hand or a constellation is
     still swinging: the simulation holds the very elements a redraw would replace. */
  function liveSky() {
    if (skyView.hidden || skyChain || thinkingDragging) return;
    renderSky();
  }

  function refreshProjectViews(project) {
    renderList("projects");
    if (!skyView.hidden) renderSky();
    if (project) {
      refreshProjectJournals(project);
      if (openProject === project.id) fillProjectView(project);
    }
    const canvas = currentCanvas();
    if (canvas && !thinkingView.hidden) renderThinkingCanvas(canvas);
  }

  function createJournalRow(project, entry) {
    const row = document.createElement("div");
    row.className = "jrn__row";

    const date = document.createElement("span");
    date.className = "jrn__date";
    date.textContent = shortDateLabel(entry.date);

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
        refreshProjectJournals(project);
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
      refreshProjectJournals(project);
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
    addProjectJournal(project, text);
    input.value = "";
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
    if (project) renameProject(project, pviewName.value);
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
     its colour walks the palette with that same progress. Stars are placed by hand:
     where a project sits is the user's own map, and nothing rearranges it. */
  const skyView = document.getElementById("skyView");
  const skyField = document.getElementById("skyField");
  const skyCamera = document.getElementById("skyCamera");
  const skyBranches = document.getElementById("skyBranches");
  const skyDeep = document.getElementById("skyDeep");
  const skyShoot = document.getElementById("skyShoot");
  const skyEmptyMsg = document.getElementById("skyEmpty");
  const DORMANT_DAYS = 30;
  let starDragEnd = 0;   // a drag must not read as a click on the star

  /* THE DEEP — three sheets of stars at three distances, each a tile of scattered
     points repeated for ever. Tiling is what makes the sky endless without holding
     a single star in memory, and the different tile sizes keep the repeat from
     ever being seen. The scatter is deterministic: the same sky every night. */
  function seedRandom(seed) {
    let value = seed;
    return function () {
      value = (value * 1103515245 + 12345) % 2147483648;
      return value / 2147483648;
    };
  }

  /* Each sheet is drawn once into a bitmap and then tiled. Hundreds of live CSS
     gradients brought the compositor to its knees — the view took seconds to even
     fade in. One raster, repeated, costs nothing and looks the same.
     Dots near an edge are drawn again on the opposite side so the tile is seamless
     and the repeat never shows as a grid. */
  function tilePaint(size, draw) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    draw(ctx, function (x, y, radius, paint) {
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const cx = x + ox * size;
          const cy = y + oy * size;
          if (cx < -radius || cy < -radius || cx > size + radius || cy > size + radius) continue;
          paint(ctx, cx, cy);
        }
      }
    });
    return "url(" + canvas.toDataURL("image/png") + ")";
  }

  /* A star is a point, not a blob: a hard bright core barely wider than a pixel,
     with a small halo around it. Most are faint and tiny; a few carry the eye.
     Softening them evenly is what made the first sky look like out-of-focus lights. */
  function dustTile(seed, count, tile, maxSize, brightness) {
    const rand = seedRandom(seed);
    return tilePaint(tile, function (ctx, wrapped) {
      for (let i = 0; i < count; i++) {
        const x = rand() * tile;
        const y = rand() * tile;
        const roll = rand();
        // cubed, so the sky is mostly faint pinpricks and rarely a bright one
        const core = 0.32 + roll * roll * roll * maxSize;
        const glow = 0.28 + roll * roll * brightness;
        const reach = core + 1.6;
        wrapped(x, y, reach, function (c, cx, cy) {
          const halo = c.createRadialGradient(cx, cy, 0, cx, cy, reach);
          halo.addColorStop(0, "rgba(226,238,255," + (glow * 0.55).toFixed(3) + ")");
          halo.addColorStop(1, "rgba(200,220,255,0)");
          c.fillStyle = halo;
          c.beginPath();
          c.arc(cx, cy, reach, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "rgba(248,251,255," + Math.min(1, glow + 0.25).toFixed(3) + ")";
          c.beginPath();
          c.arc(cx, cy, core, 0, Math.PI * 2);
          c.fill();
        });
      }
    });
  }

  function buildStarfield() {
    if (skyDeep.dataset.built) return;
    skyDeep.dataset.built = "1";
    const sheets = [
      { sel: ".skydeep__dust--far", seed: 20260804, count: 260, tile: 420, size: 0.5, glow: 0.30 },
      { sel: ".skydeep__dust--mid", seed: 77003311, count: 150, tile: 560, size: 0.9, glow: 0.45 },
      { sel: ".skydeep__dust--near", seed: 991221, count: 70, tile: 700, size: 1.5, glow: 0.62 }
    ];
    for (let i = 0; i < sheets.length; i++) {
      const el = skyDeep.querySelector(sheets[i].sel);
      el.style.backgroundImage = dustTile(sheets[i].seed, sheets[i].count, sheets[i].tile,
        sheets[i].size, sheets[i].glow);
      el.style.backgroundSize = sheets[i].tile + "px " + sheets[i].tile + "px";
    }
    buildNebula();
    buildGalaxies();
  }

  /* Clouds of gas: broad, faint, never twice the same colour, which is what keeps
     them from reading as a gradient someone drew. */
  function buildNebula() {
    const rand = seedRandom(5150607);
    const tile = 1400;
    const hues = [252, 266, 284, 300, 318];      // violet drifting to mauve and rose
    const neb = skyDeep.querySelector(".skydeep__neb");
    neb.style.backgroundImage = tilePaint(tile, function (ctx, wrapped) {
      for (let i = 0; i < 11; i++) {
        const x = rand() * tile;
        const y = rand() * tile;
        const wide = 240 + rand() * 460;
        const tall = 140 + rand() * 280;
        const hue = hues[Math.floor(rand() * hues.length)];
        const alpha = 0.06 + rand() * 0.10;
        wrapped(x, y, wide, function (c, cx, cy) {
          c.save();
          c.translate(cx, cy);
          c.scale(1, tall / wide);
          const cloud = c.createRadialGradient(0, 0, 0, 0, 0, wide);
          cloud.addColorStop(0, "hsla(" + hue + ",66%,66%," + alpha.toFixed(3) + ")");
          cloud.addColorStop(0.55, "hsla(" + (hue - 14) + ",64%,54%," + (alpha * 0.42).toFixed(3) + ")");
          cloud.addColorStop(1, "hsla(" + (hue - 14) + ",64%,50%,0)");
          c.fillStyle = cloud;
          c.beginPath();
          c.arc(0, 0, wide, 0, Math.PI * 2);
          c.fill();
          c.restore();
        });
      }
      carveRifts(ctx, rand, tile, wrapped);
    });
    neb.style.backgroundSize = tile + "px " + tile + "px";
  }

  /* THE RIFTS — the dark lanes across the Milky Way are not shadow painted on, they
     are dust standing in front of the gas. So they are cut out of the cloud rather
     than drawn over it: a chain of soft blots walking a curve, erasing as it goes,
     which leaves the ragged channels the band actually has. */
  function carveRifts(ctx, rand, tile, wrapped) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 4; i++) {
      let x = rand() * tile;
      let y = rand() * tile;
      let heading = rand() * Math.PI * 2;
      const steps = 26 + Math.floor(rand() * 18);
      const stride = tile / 34;
      for (let k = 0; k < steps; k++) {
        heading += (rand() - 0.5) * 0.55;        // it wanders, it does not run straight
        x += Math.cos(heading) * stride;
        y += Math.sin(heading) * stride;
        const blot = 26 + rand() * 46;
        const bite = 0.1 + rand() * 0.16;
        wrapped(x, y, blot, function (c, cx, cy) {
          const hole = c.createRadialGradient(cx, cy, 0, cx, cy, blot);
          hole.addColorStop(0, "rgba(0,0,0," + bite.toFixed(3) + ")");
          hole.addColorStop(0.6, "rgba(0,0,0," + (bite * 0.5).toFixed(3) + ")");
          hole.addColorStop(1, "rgba(0,0,0,0)");
          c.fillStyle = hole;
          c.beginPath();
          c.arc(cx, cy, blot, 0, Math.PI * 2);
          c.fill();
        });
      }
    }
    ctx.restore();
  }

  /* Far galaxies are clouds, not lamps. A single ellipse with a bright middle read
     as a lens flare — a heap of light. Each is built instead from several faint
     lobes, offset and turned a little, so the edge is ragged and the light comes
     from the gas rather than from a point. Violet, because that is what a dust
     cloud lit from within actually leans towards. */
  function buildGalaxies() {
    const rand = seedRandom(31415926);
    const tile = 1800;
    const gal = skyDeep.querySelector(".skydeep__gal");
    gal.style.backgroundImage = tilePaint(tile, function (ctx, wrapped) {
      for (let i = 0; i < 5; i++) {
        const x = rand() * tile;
        const y = rand() * tile;
        const wide = 52 + rand() * 66;
        const tilt = rand() * Math.PI;
        const hue = 262 + rand() * 26;              // violet, drifting towards mauve
        const lobes = [];
        for (let k = 0; k < 5; k++) {
          lobes.push({
            dx: (rand() - 0.5) * wide * 0.5,
            dy: (rand() - 0.5) * wide * 0.28,
            size: wide * (0.45 + rand() * 0.5),
            squash: 0.3 + rand() * 0.3,
            turn: (rand() - 0.5) * 0.8,
            alpha: 0.025 + rand() * 0.035
          });
        }
        wrapped(x, y, wide * 1.4, function (c, cx, cy) {
          c.save();
          c.translate(cx, cy);
          c.rotate(tilt);
          for (let k = 0; k < lobes.length; k++) {
            const lobe = lobes[k];
            c.save();
            c.translate(lobe.dx, lobe.dy);
            c.rotate(lobe.turn);
            c.scale(1, lobe.squash);
            const cloud = c.createRadialGradient(0, 0, 0, 0, 0, lobe.size);
            cloud.addColorStop(0, "hsla(" + hue.toFixed(0) + ",70%,72%," + lobe.alpha.toFixed(3) + ")");
            cloud.addColorStop(0.5, "hsla(" + (hue - 12).toFixed(0) + ",68%,62%,"
              + (lobe.alpha * 0.55).toFixed(3) + ")");
            cloud.addColorStop(1, "hsla(" + (hue - 12).toFixed(0) + ",68%,58%,0)");
            c.fillStyle = cloud;
            c.beginPath();
            c.arc(0, 0, lobe.size, 0, Math.PI * 2);
            c.fill();
            c.restore();
          }
          // the middle is only a little denser, never a point of light
          c.scale(1, 0.34);
          const heart = c.createRadialGradient(0, 0, 0, 0, 0, wide * 0.42);
          heart.addColorStop(0, "hsla(" + (hue + 8).toFixed(0) + ",60%,82%,0.075)");
          heart.addColorStop(1, "hsla(" + (hue + 8).toFixed(0) + ",60%,78%,0)");
          c.fillStyle = heart;
          c.beginPath();
          c.arc(0, 0, wide * 0.42, 0, Math.PI * 2);
          c.fill();
          c.restore();
        });
      }
    });
    gal.style.backgroundSize = tile + "px " + tile + "px";
  }

  /* One streak now and then, never on a schedule you could learn. */
  let shootTimer = 0;
  function startShootingStars() {
    clearTimeout(shootTimer);
    const again = function () {
      shootTimer = setTimeout(function () {
        if (!skyView.hidden) shootOnce();
        again();
      }, 5000 + Math.random() * 12000);
    };
    again();
  }

  function shootOnce() {
    const streak = document.createElement("i");
    streak.className = "skyshoot__one";
    streak.style.left = (5 + Math.random() * 60) + "%";
    streak.style.top = (2 + Math.random() * 45) + "%";
    streak.style.setProperty("--fall", (14 + Math.random() * 22).toFixed(0) + "deg");
    streak.style.setProperty("--reach", (180 + Math.random() * 260).toFixed(0) + "px");
    streak.style.animationDuration = (0.7 + Math.random() * 0.7).toFixed(2) + "s";
    streak.addEventListener("animationend", function () { streak.remove(); });
    skyShoot.appendChild(streak);
  }

  function openSky() {
    skyView.hidden = false;
    buildStarfield();
    placeCamera();
    applyCamera();
    startShootingStars();
    renderSky();
    requestAnimationFrame(function () { skyView.classList.add("is-open"); });
  }

  function closeSky() {
    clearTimeout(shootTimer);
    if (openProject) closeProjectView();   // the panel cannot outlive the sky it sits in
    skyView.classList.remove("is-open");
    setTimeout(function () { skyView.hidden = true; }, PVIEW_MS);
  }

  function renderSky() {
    closeStepCard(true);
    const stars = skyCamera.querySelectorAll(".pstar");
    for (let i = 0; i < stars.length; i++) stars[i].remove();
    skyEmptyMsg.hidden = state.projects.length > 0;
    const spots = {};
    for (let i = 0; i < state.projects.length; i++) {
      const project = state.projects[i];
      const star = createStar(project, i);
      spots[project.id] = { x: parseFloat(star.style.left), y: parseFloat(star.style.top) };
      skyCamera.appendChild(star);
    }
    renderBranches(spots);
    renderSkyRoll();
    if (openProject) markFocusedStar(openProject);   // a redraw must not lose the dive
  }

  /* THE ROLL — the same projects, listed by name in the corner. Twelve stars are a
     map, and a map is scanned; when what you want is one you already have in mind,
     reading its name is quicker than finding its light. Finished ones drop off. */
  function renderSkyRoll() {
    const host = document.getElementById("skyList");
    host.innerHTML = "";
    for (let i = 0; i < state.projects.length; i++) {
      const project = state.projects[i];
      if (project.done) continue;
      host.appendChild(createRollRow(project));
    }
    host.hidden = !host.children.length;
  }

  function createRollRow(project) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = openProject === project.id ? "skylist__item is-on" : "skylist__item";
    const icon = document.createElement("span");
    icon.className = "skylist__ico";
    icon.innerHTML = projectSvg(project.icon || "folder");
    const name = document.createElement("span");
    name.className = "skylist__name";
    name.textContent = project.text || translate("addProjectAria");
    row.append(icon, name);
    row.addEventListener("click", function () {
      openProjectView(project.id);
    });
    return row;
  }

  /* THE CONSTELLATIONS — a star does not stand alone: each way of pursuing the
     objective leaves it as a ray, its steps strung along it and its moons at the
     root. Read from the star outwards: how many ways, how far each has gone, and
     whether anyone is still walking it. */
  const BRANCH_FAN = 104;      // degrees the rays spread over
  const BRANCH_FIRST = 74;     // pixels from the star to the first node
  const BRANCH_GAP = 40;       // pixels between two nodes of a ray
  const BRANCH_MOON = 42;      // where the moons sit: clear of the star's own halo

  /* Where every piece of an objective's constellation sits, worked out in one place
     so that drawing it and dragging it can never disagree about the shape. */
  function layoutConstellation(project, centre, area) {
    const branches = projectBranches(project);
    const out = [];
    for (let b = 0; b < branches.length; b++) {
      const angle = branchAngle(b, branches.length);
      const nodes = branchNodes(centre, angle, branches[b].steps, area);
      const habits = branchHabits(branches[b]).slice(0, MOONS_SHOWN);
      const habitSpots = [];
      for (let h = 0; h < habits.length; h++) {
        habitSpots.push(habitSpot(centre, angle, nodes, h, area, branches[b], habits[h]));
      }
      out.push({
        branch: branches[b],
        nodes: nodes,
        moons: habits,
        moonSpots: habitSpots
      });
    }
    return out;
  }

  function renderBranches(spots) {
    const old = skyCamera.querySelectorAll(".bstar, .bmoon");
    for (let i = 0; i < old.length; i++) old[i].remove();
    const area = skyField.getBoundingClientRect();
    if (!area.width || !area.height) { skyBranches.innerHTML = ""; return; }
    let markup = "";

    for (let p = 0; p < state.projects.length; p++) {
      const project = state.projects[p];
      const centre = spots[project.id];
      if (!centre) continue;
      const laid = layoutConstellation(project, centre, area);
      for (let b = 0; b < laid.length; b++) {
        markup += branchRay(centre, laid[b].nodes, laid[b].branch, project.id, b);
        markup += habitFacets(laid[b], project.id, b);
        for (let i = 0; i < laid[b].nodes.length; i++) {
          const star = createBranchStar(project, laid[b].branch.steps[i], laid[b].nodes[i]);
          star.dataset.project = project.id;
          skyCamera.appendChild(star);
        }
        for (let m = 0; m < laid[b].moons.length; m++) {
          const habitStar = createHabitStar(laid[b].moons[m], laid[b].moonSpots[m],
            project, laid[b].branch);
          habitStar.dataset.project = project.id;
          skyCamera.appendChild(habitStar);
        }
      }
    }
    skyBranches.innerHTML = markup;
  }

  /* A CONSTELLATION ON A STRING — dragging the star does not carry the shape rigidly.
     Each star follows the one before it, arriving late and overshooting a little, so
     the branch trails and settles the way a line of beads pulled by its head does.
     Every node is a spring towards where it ought to be relative to its predecessor;
     the lag compounds down the chain on its own, which is what gives the whip. */
  const CHAIN_STIFF = 0.3;
  const CHAIN_DAMP = 0.66;
  const CHAIN_REST = 0.012;    // percent of a field: below this it has settled

  let skyChain = null;   // the running simulation, if a star is in hand

  function startChain(project, centre, held) {
    const area = skyField.getBoundingClientRect();
    if (!area.width || !area.height) return;
    const laid = layoutConstellation(project, centre, area);
    const parts = [];
    const stars = skyCamera.querySelectorAll('.bstar:not(.is-habit)[data-project="'
      + project.id + '"]');
    const moons = skyCamera.querySelectorAll('.bmoon[data-project="' + project.id + '"]');
    let starAt = 0;
    let moonAt = 0;
    for (let b = 0; b < laid.length; b++) {
      const chain = [];
      let previous = centre;
      for (let i = 0; i < laid[b].nodes.length && starAt < stars.length; i++, starAt++) {
        const node = laid[b].nodes[i];
        chain.push({
          el: stars[starAt],
          offset: { x: node.x - previous.x, y: node.y - previous.y },
          at: { x: node.x, y: node.y },
          v: { x: 0, y: 0 }
        });
        previous = node;
      }
      const hangs = [];
      for (let m = 0; m < laid[b].moonSpots.length && moonAt < moons.length; m++, moonAt++) {
        const spot = laid[b].moonSpots[m];
        hangs.push({
          el: moons[moonAt],
          offset: { x: spot.x - centre.x, y: spot.y - centre.y },
          at: { x: spot.x, y: spot.y },
          v: { x: 0, y: 0 }
        });
      }
      parts.push({ chain: chain, hangs: hangs });
    }
    skyChain = { project: project, centre: { x: centre.x, y: centre.y }, parts: parts,
      area: area, frame: 0, held: !!held };
    stepChain();   // held, so it cannot end the simulation before the drag begins
  }

  function aimChain(centre) {
    if (skyChain) { skyChain.centre.x = centre.x; skyChain.centre.y = centre.y; }
  }

  /* One tick of the spring. The aspect of the field is folded in so a pull sideways
     and a pull downwards travel at the same speed, instead of the sky being springier
     in its narrow direction. */
  function stepChain() {
    if (!skyChain) return;
    const ratio = skyChain.area.width / skyChain.area.height;
    let awake = false;

    for (let p = 0; p < skyChain.parts.length; p++) {
      const part = skyChain.parts[p];
      let previous = skyChain.centre;
      for (let i = 0; i < part.chain.length; i++) {
        awake = pullTowards(part.chain[i], previous, ratio) || awake;
        previous = part.chain[i].at;
      }
      for (let m = 0; m < part.hangs.length; m++) {
        awake = pullTowards(part.hangs[m], skyChain.centre, ratio) || awake;
      }
      const nodes = [];
      for (let i = 0; i < part.chain.length; i++) nodes.push(part.chain[i].at);
      setRaySegments(skyChain.project.id, p, skyChain.centre, nodes);
    }

    if (awake || skyChain.held) {
      skyChain.frame = requestAnimationFrame(stepChain);
    } else {
      // once it has stopped swinging, put it exactly where it belongs: a shape left
      // a hair off by the damping would drift a little further with every drag
      moveConstellation(skyChain.project, skyChain.centre);
      skyChain = null;
    }
  }

  function pullTowards(bead, anchor, ratio) {
    const wantX = anchor.x + bead.offset.x;
    const wantY = anchor.y + bead.offset.y;
    bead.v.x = (bead.v.x + (wantX - bead.at.x) * CHAIN_STIFF) * CHAIN_DAMP;
    bead.v.y = (bead.v.y + (wantY - bead.at.y) * CHAIN_STIFF) * CHAIN_DAMP;
    bead.at.x += bead.v.x;
    bead.at.y += bead.v.y;
    bead.el.style.left = bead.at.x + "%";
    bead.el.style.top = bead.at.y + "%";
    const offX = (wantX - bead.at.x) * ratio;
    return Math.abs(offX) + Math.abs(wantY - bead.at.y) > CHAIN_REST
      || Math.abs(bead.v.x) + Math.abs(bead.v.y) > CHAIN_REST;
  }

  /* the shape without the physics, for a redraw that is not a drag */
  function moveConstellation(project, centre) {
    const area = skyField.getBoundingClientRect();
    if (!area.width || !area.height) return;
    const laid = layoutConstellation(project, centre, area);
    const stars = skyCamera.querySelectorAll('.bstar:not(.is-habit)[data-project="'
      + project.id + '"]');
    const moons = skyCamera.querySelectorAll('.bmoon[data-project="' + project.id + '"]');
    let starAt = 0;
    let moonAt = 0;
    for (let b = 0; b < laid.length; b++) {
      for (let i = 0; i < laid[b].nodes.length && starAt < stars.length; i++, starAt++) {
        stars[starAt].style.left = laid[b].nodes[i].x + "%";
        stars[starAt].style.top = laid[b].nodes[i].y + "%";
      }
      for (let m = 0; m < laid[b].moonSpots.length && moonAt < moons.length; m++, moonAt++) {
        moons[moonAt].style.left = laid[b].moonSpots[m].x + "%";
        moons[moonAt].style.top = laid[b].moonSpots[m].y + "%";
      }
      setRaySegments(project.id, b, centre, laid[b].nodes);
    }
  }

  /* rays fan out to the right of the star rather than all around it, so a sky of
     several objectives stays readable instead of turning into a web */
  /* Constellations are not fans. Every node is nudged off the perfect ray by an
     amount drawn from its own id, so the shape is irregular and yet never moves. */
  function idNoise(id, salt) {
    let hash = 2166136261;
    const text = String(id) + ":" + salt;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 1000) / 1000;
  }

  function branchAngle(index, total) {
    if (total < 2) return 0;
    return (-BRANCH_FAN / 2 + index * (BRANCH_FAN / (total - 1))) * Math.PI / 180;
  }

  /* a point at `pixels` from the star along the ray, given back in field percent:
     the field is not square, so a circle in percent would read as an ellipse */
  function alongRay(centre, angle, pixels, area) {
    return {
      x: centre.x + Math.cos(angle) * pixels / area.width * 100,
      y: centre.y + Math.sin(angle) * pixels / area.height * 100
    };
  }

  function branchNodes(centre, angle, steps, area) {
    const nodes = [];
    let walked = BRANCH_FIRST;
    for (let i = 0; i < steps.length; i++) {
      const id = steps[i].id;
      walked += i ? BRANCH_GAP * (0.72 + idNoise(id, "far") * 0.75) : 0;
      let spot;
      if (steps[i].dx != null) {                            // placed by hand, and kept
        spot = { x: centre.x + steps[i].dx, y: centre.y + steps[i].dy };
      } else {
        const swing = (idNoise(id, "side") - 0.5) * 0.5;    // radians off the ray
        spot = alongRay(centre, angle + swing, walked, area);
      }
      spot.magnitude = 0.55 + idNoise(id, "mag") * 0.45;    // stars are not all equal
      nodes.push(spot);
    }
    return nodes;
  }

  /* A habit sits opposite one of the branch's stars, across the line its neighbours
     make: the four then close a diamond, the shape a constellation actually has.
     With too few stars to reflect against, it simply steps aside from the ray. */
  function habitSpot(centre, angle, nodes, index, area, branch, habit) {
    const placed = branch && branch.habitSky && branch.habitSky[habit.id];
    if (placed) return { x: centre.x + placed.dx, y: centre.y + placed.dy };
    const at = index + 1;
    if (nodes.length >= at + 2) {
      const before = nodes[at - 1];
      const star = nodes[at];
      const after = nodes[at + 1];
      const midX = (before.x + after.x) / 2;
      const midY = (before.y + after.y) / 2;
      return { x: midX * 2 - star.x, y: midY * 2 - star.y };   // mirrored across the axis
    }
    const side = index % 2 ? -1 : 1;
    const reach = BRANCH_MOON + Math.floor(index / 2) * 22;
    return alongRay(centre, angle + side * 0.85, reach, area);
  }

  /* the ray itself, dimmed by the pulse of its moons: lit while someone walks it */
  /* Move the segments of one branch onto the positions given, without rebuilding
     them: the chain simulation calls this on every frame. */
  function setRaySegments(projectId, index, centre, nodes) {
    const segs = skyBranches.querySelectorAll('[data-project="' + projectId
      + '"][data-branch="' + index + '"]');
    let from = centre;
    for (let i = 0; i < segs.length && i < nodes.length; i++) {
      segs[i].setAttribute("x1", from.x);
      segs[i].setAttribute("y1", from.y);
      segs[i].setAttribute("x2", nodes[i].x);
      segs[i].setAttribute("y2", nodes[i].y);
      from = nodes[i];
    }
  }

  /* the two sides that turn a lone habit star into the fourth corner of a diamond */
  function habitFacets(part, projectId, index) {
    let markup = "";
    for (let h = 0; h < part.moonSpots.length; h++) {
      const at = h + 1;
      if (part.nodes.length < at + 2) continue;
      const spot = part.moonSpots[h];
      markup += '<polyline class="facet" data-project="' + projectId + '" data-facet="'
        + index + "-" + h + '" points="' + part.nodes[at - 1].x + "," + part.nodes[at - 1].y
        + " " + spot.x + "," + spot.y + " " + part.nodes[at + 1].x + "," + part.nodes[at + 1].y
        + '" vector-effect="non-scaling-stroke"/>';
    }
    return markup;
  }

  /* The line between two steps already reached is lit: the course shows how far it
     has actually been walked, not merely where it goes. The central star counts as
     reached — it is where the walking started. */
  function branchRay(centre, nodes, branch, projectId, index) {
    if (!nodes.length) return "";
    const pulse = branchPulse(branch);
    const faint = pulse === null ? 0.34 : (0.12 + pulse * 0.42).toFixed(2);
    const steps = branch.steps;
    let markup = "";
    let from = centre;
    let reached = true;                       // the star itself is the first landfall
    for (let i = 0; i < nodes.length; i++) {
      const here = !!(steps[i] && steps[i].completedDate);
      const lit = reached && here;
      markup += '<line class="ray' + (lit ? " is-lit" : "") + '" data-project="' + projectId
        + '" data-branch="' + index + '" data-seg="' + i + '"'
        + ' x1="' + from.x + '" y1="' + from.y + '" x2="' + nodes[i].x + '" y2="' + nodes[i].y
        + '" opacity="' + (lit ? 1 : faint) + '" vector-effect="non-scaling-stroke"/>';
      from = nodes[i];
      reached = here;
    }
    return markup;
  }

  function createBranchStar(project, step, spot) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = step.completedDate ? "bstar is-done" : "bstar";
    dot.style.left = spot.x + "%";
    dot.style.top = spot.y + "%";
    dot.style.setProperty("--mag", (spot.magnitude || 0.8).toFixed(2));
    dot.setAttribute("aria-label", step.text || translate("stepPlaceholder"));
    dot.title = step.text || "";
    dot.addEventListener("click", function (event) {
      event.stopPropagation();
      if (Date.now() < nodeDragEnd) return;   // the click that ends a drag
      toggleStep(project, step.id);
      liveSky();
    });
    dot.addEventListener("pointerenter", function () { openStepCard(project, step, dot); });
    dot.addEventListener("pointerleave", function () { closeStepCard(false); });
    armNodeDrag(dot, project, function (dx, dy) {
      step.dx = dx;
      step.dy = dy;
    });
    return dot;
  }

  /* Any star of a constellation can be taken and put where it looks right. What is
     stored is its offset from its objective, so the shape still travels as one. */
  let nodeDragEnd = 0;
  let nodeDragging = false;

  function armNodeDrag(el, project, place) {
    el.addEventListener("pointerdown", function (event) {
      if (openProject) return;
      event.stopPropagation();
      try { el.setPointerCapture(event.pointerId); } catch (err) { /* pointer already gone */ }
      const area = skyField.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY,
        left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
      let moved = false;

      const move = function (moveEvent) {
        const dx = moveEvent.clientX - start.x;
        const dy = moveEvent.clientY - start.y;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        moved = true;
        nodeDragging = true;
        closeStepCard(true);        // the card belongs to a star standing still
        el.classList.add("is-dragging");
        const at = {
          x: Math.max(1, Math.min(99, start.left + dx / area.width / sky.scale * 100)),
          y: Math.max(1, Math.min(95, start.top + dy / area.height / sky.scale * 100))
        };
        el.style.left = at.x + "%";
        el.style.top = at.y + "%";
        place(at.x - project.sky.x, at.y - project.sky.y);
        redrawRays(project);
      };
      const up = function () {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        el.removeEventListener("lostpointercapture", up);
        el.classList.remove("is-dragging");
        nodeDragging = false;
        if (!moved) return;
        nodeDragEnd = Date.now() + 250;
        saveState();
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("lostpointercapture", up);
    });
  }

  /* only the lines, so a star being dragged is not fought over by the layout */
  function redrawRays(project) {
    const area = skyField.getBoundingClientRect();
    if (!area.width || !area.height) return;
    const laid = layoutConstellation(project, project.sky, area);
    for (let b = 0; b < laid.length; b++) {
      setRaySegments(project.id, b, project.sky, laid[b].nodes);
      for (let h = 0; h < laid[b].moonSpots.length; h++) {
        const facet = skyBranches.querySelector('[data-project="' + project.id
          + '"][data-facet="' + b + "-" + h + '"]');
        const at = h + 1;
        if (!facet || laid[b].nodes.length < at + 2) continue;
        facet.setAttribute("points", laid[b].nodes[at - 1].x + "," + laid[b].nodes[at - 1].y
          + " " + laid[b].moonSpots[h].x + "," + laid[b].moonSpots[h].y
          + " " + laid[b].nodes[at + 1].x + "," + laid[b].nodes[at + 1].y);
      }
    }
  }

  /* Its brightness is what the phase of a moon used to say: kept every day, it burns;
     let go, it barely shows. */
  /* EDITING A STEP IN THE SKY — a plain click still ticks it, because that is the
     move you make twenty times a day. Everything else waits on hover: the card
     opens beside the star and stays while the pointer travels to it, so reaching it
     never means crossing a gap that closes behind you. */
  let stepCardFor = null;
  let stepCardTimer = 0;

  function openStepCard(project, step, star) {
    if (nodeDragging) return;
    if (stepCardFor === step.id) { clearTimeout(stepCardTimer); return; }
    closeStepCard(true);
    stepCardFor = step.id;
    const card = document.createElement("div");
    card.className = "scard";
    const area = skyField.getBoundingClientRect();
    const at = star.getBoundingClientRect();
    card.style.left = (at.left + at.width / 2 - area.left) + "px";
    card.style.top = (at.top + at.height / 2 - area.top + 16) + "px";

    const name = document.createElement("input");
    name.type = "text";
    name.className = "scard__name";
    name.maxLength = 200;
    name.value = step.text || "";
    name.placeholder = translate("stepPlaceholder");
    name.addEventListener("input", function () {
      step.text = name.value;
      saveState();
      star.title = step.text || "";
    });

    const when = document.createElement("button");
    when.type = "button";
    when.className = "scard__btn";
    when.textContent = step.targetDate ? shortDateLabel(step.targetDate) : translate("stepTarget");
    when.addEventListener("click", function () {
      openCalendar({ projectId: project.id, stepId: step.id }, "step");
    });

    const drop = document.createElement("button");
    drop.type = "button";
    drop.className = "scard__btn scard__btn--del";
    drop.setAttribute("aria-label", translate("deleteAria"));
    drop.innerHTML = iconSvg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>');
    drop.addEventListener("click", function () {
      closeStepCard(true);
      removeStep(project, step.id);
      liveSky();
    });

    card.append(name, when, drop);
    card.addEventListener("pointerenter", function () { clearTimeout(stepCardTimer); });
    card.addEventListener("pointerleave", function () { closeStepCard(false); });
    skyField.appendChild(card);
    requestAnimationFrame(function () { card.classList.add("is-open"); });
  }

  function closeStepCard(now) {
    clearTimeout(stepCardTimer);
    const shut = function () {
      const card = skyField.querySelector(".scard");
      if (card) card.remove();
      stepCardFor = null;
    };
    if (now) shut();
    else stepCardTimer = setTimeout(shut, 260);   // time to travel from star to card
  }

  function createHabitStar(habit, spot, project, branch) {
    const star = document.createElement("span");
    star.className = "bstar bmoon is-habit";
    star.style.left = spot.x + "%";
    star.style.top = spot.y + "%";
    star.style.setProperty("--mag", (0.4 + habitPhase(habit) * 0.6).toFixed(2));
    star.title = (habit.name || "") + " · " + Math.round(habitPhase(habit) * 100) + "%";
    armNodeDrag(star, project, function (dx, dy) {
      if (!branch.habitSky) branch.habitSky = {};
      branch.habitSky[habit.id] = { dx: dx, dy: dy };
    });
    return star;
  }


  function createStar(project, index) {
    const progress = stepProgress(project);
    const momentum = projectMomentum(project);
    const silence = projectSilence(project);
    const dormant = silence >= DORMANT_DAYS && !project.done;
    const spot = project.sky;

    const star = document.createElement("button");
    star.type = "button";
    star.className = "pstar";
    if (dormant) star.classList.add("is-dormant");
    if (project.done) star.classList.add("is-done");
    star.setAttribute("aria-label", translate("skyOpenAria") + " " + project.text);
    star.dataset.id = project.id;
    star.style.left = spot.x + "%";
    star.style.top = spot.y + "%";
    star.style.setProperty("--star-size", (11 + (project.importance || 0) * 3.4) + "px");
    star.style.setProperty("--star-glow", momentum.toFixed(2));
    star.style.animationDuration = (7 - momentum * 4).toFixed(1) + "s";

    star.innerHTML = STAR_MARKUP;

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
      openProjectView(project.id);
    });
    return star;
  }

  /* halo and core; the trajectory is told by which stars are lit, not by a gauge */
  const STAR_MARKUP = '<span class="pstar__glow"></span>'
    + '<span class="pstar__core"></span>';

  /* share of the trajectory reached, the start anchor not counting as a step */
  function stepProgress(project) {
    const steps = allProjectSteps(project);
    let done = 0;
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].completedDate) done++;
    }
    return steps.length ? done / steps.length : 0;
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

  /* every dated trace a project leaves: steps reached, journal lines, tasks ticked */
  function activityDates(project) {
    const dates = [];
    const steps = allProjectSteps(project);
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].completedDate) dates.push(steps[i].completedDate);
    }
    for (let i = 0; i < project.journal.length; i++) dates.push(project.journal[i].date);
    // a habit kept is work on the objective too, even between two steps
    const branches = projectBranches(project);
    for (let b = 0; b < branches.length; b++) {
      const habits = branchHabits(branches[b]);
      for (let h = 0; h < habits.length; h++) {
        const kept = habits[h].completedDates || [];
        for (let k = 0; k < kept.length; k++) dates.push(kept[k]);
      }
    }
    // tasks the project spawned onto a day still count as movement
    for (let i = 0; i < state.tasks.length; i++) {
      const task = state.tasks[i];
      if (task.projectId === project.id && task.doneDate) dates.push(task.doneDate);
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
  const STAR_ZOOM = 1.45;   // how much closer than wherever the wheel left the sky

  /* THE CAMERA — one state for the whole sky. Panning by hand and diving onto a star
     write the same three numbers, so the deep layers, which read those numbers to
     place themselves, always travel with whatever moved the view. */
  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 2.4;
  const SKY_REST = 0.8;         // the sky opens pulled back a little
  const sky = { x: 0, y: 0, scale: SKY_REST };
  const skyWant = { x: 0, y: 0, scale: SKY_REST };
  let skyRest = SKY_REST;       // where the wheel left it, to come back to after a dive
  let skyPlaced = false;
  let skyRolling = 0;
  let skyLayers = null;

  /* The sky opens centred at rest zoom, but only the first time: coming back to a
     map you have panned and left where it was is the whole point of placing stars. */
  function placeCamera() {
    if (skyPlaced) return;
    const area = skyField.getBoundingClientRect();
    if (!area.width) return;
    skyPlaced = true;
    sky.scale = skyWant.scale = skyRest;
    sky.x = skyWant.x = area.width * (1 - skyRest) / 2;
    sky.y = skyWant.y = area.height * (1 - skyRest) / 2;
  }

  /* Zoom around a point: whatever sits under it stays under it. Reading off the
     aimed camera rather than the eased one keeps a fast wheel from fighting itself. */
  function zoomSky(scale, px, py) {
    const worldX = (px - skyWant.x) / skyWant.scale;
    const worldY = (py - skyWant.y) / skyWant.scale;
    skyRest = scale;
    aimCamera(px - worldX * scale, py - worldY * scale, scale);
  }

  function applyCamera() {
    skyCamera.style.transform = "translate(" + sky.x.toFixed(1) + "px,"
      + sky.y.toFixed(1) + "px) scale(" + sky.scale.toFixed(3) + ")";
    if (!skyLayers) skyLayers = skyDeep.querySelectorAll("[data-far]");
    for (let i = 0; i < skyLayers.length; i++) {
      const far = parseFloat(skyLayers[i].dataset.far);
      // the further a layer, the less it answers: that difference is the depth
      skyLayers[i].style.backgroundPosition =
        (sky.x * far).toFixed(1) + "px " + (sky.y * far).toFixed(1) + "px";
    }
  }

  function aimCamera(x, y, scale) {
    skyWant.x = x;
    skyWant.y = y;
    skyWant.scale = scale;
    if (!skyRolling) skyRolling = requestAnimationFrame(rollCamera);
  }

  function rollCamera() {
    const ease = 0.13;
    sky.x += (skyWant.x - sky.x) * ease;
    sky.y += (skyWant.y - sky.y) * ease;
    sky.scale += (skyWant.scale - sky.scale) * ease;
    applyCamera();
    if (Math.abs(skyWant.x - sky.x) + Math.abs(skyWant.y - sky.y) > 0.4
        || Math.abs(skyWant.scale - sky.scale) > 0.002) {
      skyRolling = requestAnimationFrame(rollCamera);
    } else {
      sky.x = skyWant.x;
      sky.y = skyWant.y;
      sky.scale = skyWant.scale;
      applyCamera();
      skyRolling = 0;
    }
  }

  function focusStar(project) {
    markFocusedStar(project.id);
    const area = skyField.getBoundingClientRect();
    if (!area.width) return;
    const x = project.sky.x / 100 * area.width;
    const y = project.sky.y / 100 * area.height;
    // the panel takes the right half, or the bottom of a narrow screen
    const narrow = window.matchMedia("(max-width: 860px)").matches;
    const restX = narrow ? area.width * 0.5 : area.width * 0.22;
    const restY = narrow ? area.height * 0.17 : area.height * 0.44;
    // the dive is relative: the sky the user zoomed to is the one it moves in on
    const scale = Math.min(ZOOM_MAX, skyRest * STAR_ZOOM);
    aimCamera(restX - x * scale, restY - y * scale, scale);
  }

  function markFocusedStar(projectId) {
    const stars = skyCamera.querySelectorAll(".pstar");
    for (let i = 0; i < stars.length; i++) {
      stars[i].classList.toggle("is-focused", stars[i].dataset.id === projectId);
    }
    skyView.classList.add("is-diving");
  }

  function resetCamera() {
    const area = skyField.getBoundingClientRect();
    zoomSky(skyRest, area.width / 2, area.height / 2);   // pull back, keep the place
    skyView.classList.remove("is-diving");
    const stars = skyCamera.querySelectorAll(".pstar");
    for (let i = 0; i < stars.length; i++) stars[i].classList.remove("is-focused");
  }

  // the frame changed size, so the star is no longer where it was aimed at
  window.addEventListener("resize", function () {
    const project = currentProject();
    if (project && !skyView.hidden) focusStar(project);
  });

  // clicking the empty sky surfaces back out of the project
  skyField.addEventListener("click", function (event) {
    if (event.target.closest(".pstar")) return;
    if (Date.now() < skyPanEnd) return;      // the click that ends a pan
    if (openProject) closeProjectView();
  });

  /* PANNING — the sky has no edges. Taking hold of the empty black and pulling moves
     the camera, and everything reads that camera: the constellations at full rate,
     the deep sheets each at their own. Letting go, it glides on a little. */
  let skyPanEnd = 0;

  /* A wheel event carries no word on what made it. Two fingers on a trackpad and a
     mouse wheel arrive the same way, and every rule for telling them apart reads the
     shape of the numbers: notches, round steps, a sideways amount. They all break on
     the same case — a straight vertical push lands on round numbers with nothing
     sideways in it, which is exactly what a notch looks like, and the turn that
     follows arrives in the middle of a zoom that should never have started.

     So we stop guessing and take the convention every canvas tool uses: the wheel
     moves the sky, ctrl (or cmd) with it pulls the sky closer. A pinch on a trackpad
     already reaches the page as ctrl+wheel, so it zooms without asking for anything. */
  skyField.addEventListener("wheel", function (event) {
    if (openProject) return;                 // a dive owns the camera
    event.preventDefault();
    if (!event.ctrlKey && !event.metaKey) {
      sky.x = skyWant.x = sky.x - event.deltaX;
      sky.y = skyWant.y = sky.y - event.deltaY;
      applyCamera();
      return;
    }
    const area = skyField.getBoundingClientRect();
    // a line-mode wheel reports notches where a trackpad reports pixels
    const amount = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX,
      skyWant.scale * Math.pow(0.998, amount)));
    zoomSky(next, event.clientX - area.left, event.clientY - area.top);
  }, { passive: false });

  skyField.addEventListener("pointerdown", function (event) {
    if (event.target.closest(".pstar, .bstar")) return;
    event.preventDefault();                  // no native drag to steal the pointer
    const from = { x: event.clientX, y: event.clientY, camX: sky.x, camY: sky.y };
    let panned = false;
    let last = { x: event.clientX, y: event.clientY, at: Date.now() };
    const drift = { x: 0, y: 0 };
    try { skyField.setPointerCapture(event.pointerId); } catch (err) { /* pointer already gone */ }

    const move = function (moveEvent) {
      const dx = moveEvent.clientX - from.x;
      const dy = moveEvent.clientY - from.y;
      if (!panned && Math.abs(dx) + Math.abs(dy) < 5) return;
      panned = true;
      skyField.classList.add("is-panning");
      const now = Date.now();
      const span = Math.max(16, now - last.at);
      drift.x = (moveEvent.clientX - last.x) / span * 16;
      drift.y = (moveEvent.clientY - last.y) / span * 16;
      last = { x: moveEvent.clientX, y: moveEvent.clientY, at: now };
      sky.x = from.camX + dx;
      sky.y = from.camY + dy;
      skyWant.x = sky.x;
      skyWant.y = sky.y;
      applyCamera();
    };
    const up = function (endEvent) {
      skyField.removeEventListener("pointermove", move);
      skyField.removeEventListener("pointerup", up);
      skyField.removeEventListener("pointercancel", up);
      skyField.removeEventListener("lostpointercapture", up);
      skyField.classList.remove("is-panning");
      if (!panned) return;
      skyPanEnd = Date.now() + 250;
      // a pointer taken away is not a flick: stop where it stands rather than
      // gliding on from a gesture the user never finished
      if (endEvent && endEvent.type !== "pointerup") {
        aimCamera(sky.x, sky.y, sky.scale);
        return;
      }
      // a flick keeps going a moment, the way a star chart does under the hand
      aimCamera(sky.x + drift.x * 9, sky.y + drift.y * 9, sky.scale);
    };
    skyField.addEventListener("pointermove", move);
    skyField.addEventListener("pointerup", up);
    // A pointer can be taken away without ever sending pointerup: the cursor
    // leaves the window, a native drag starts, a touch is interrupted. Without
    // these the gesture never ends and the sky follows a mouse nobody holds.
    skyField.addEventListener("pointercancel", up);
    skyField.addEventListener("lostpointercapture", up);
  });

  /* Drag a star anywhere: where it sits is the map the user drew. */
  function armStarDrag(star, project) {
    star.addEventListener("pointerdown", function (event) {
      if (openProject) return;   // a dive has the camera moving under us
      try { star.setPointerCapture(event.pointerId); } catch (err) { /* pointer already gone */ }
      const area = skyField.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY, sx: project.sky.x, sy: project.sky.y };
      let moved = false;

      const move = function (moveEvent) {
        const dx = moveEvent.clientX - start.x;
        const dy = moveEvent.clientY - start.y;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;   // a plain click stays a click
        moved = true;
        star.classList.add("is-dragging");
        project.sky.x = Math.max(3, Math.min(97,
          start.sx + dx / area.width / sky.scale * 100));
        project.sky.y = Math.max(4, Math.min(80,
          start.sy + dy / area.height / sky.scale * 100));
        star.style.left = project.sky.x + "%";
        star.style.top = project.sky.y + "%";
        // built from where the shape still is, not from where the star has gone:
        // that gap is the whole point of the string
        if (!skyChain) startChain(project, { x: start.sx, y: start.sy }, true);
        aimChain(project.sky);
      };
      const up = function () {
        star.removeEventListener("pointermove", move);
        star.removeEventListener("pointerup", up);
        star.removeEventListener("pointercancel", up);
        star.removeEventListener("lostpointercapture", up);
        star.classList.remove("is-dragging");
        if (!moved) return;
        starDragEnd = Date.now() + 250;
        if (skyChain) skyChain.held = false;   // let it swing itself to a stop
        saveState();
      };
      star.addEventListener("pointermove", move);
      star.addEventListener("pointerup", up);
      star.addEventListener("pointercancel", up);
      star.addEventListener("lostpointercapture", up);
    });
  }

  /* Two clicks make a constellation, and a third pass on the same pair breaks it.
     The lines are hidden while the stars travel, otherwise they would snap to the
     arrival before the stars get there. */
  const STAR_MOVE_MS = 560;   // matches the left/top transition on .pstar





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
    else if (!projectView.hidden) closeProjectView();
    else if (!skyView.hidden) closeSky();
  });

  /* live rename */
  detailName.addEventListener("input", function () {
    const item = currentDetailItem();
    if (!item) return;
    item.text = detailName.value;
    saveState();
    // A name does not change where a thing belongs, so nothing has to be rebuilt:
    // the row's own label is written in place. Rebuilding would queue a redraw of
    // the whole list, which the list defers while the row is open and then plays
    // the moment it folds — the row blinking back at you for no reason.
    refreshOpenRow(item);
  });

  /* THE OPEN ROW, BROUGHT UP TO DATE IN PLACE — a name or a ticked subtask does
     not change where a thing belongs, so nothing needs rebuilding. Rebuilding
     would queue a redraw that the list defers while the row is open and then
     plays the moment it folds: the row blinking back at you for no reason.
     A badge appearing or disappearing does change the row's shape, and only that
     falls back to a real redraw. */
  function refreshOpenRow(item) {
    const row = openHost && openHost.closest(".item");
    if (!row || detailTarget.kind !== "tasks") { refreshDetailSource(); return; }

    const label = row.querySelector(".item__text");
    if (label) label.textContent = item.text;

    const badge = row.querySelector(".item__sub");
    const subs = item.subtasks || [];
    if (subs.length && !badge) {
      const marks = rowMarks(row);
      // the badge sits after the note mark and before the star, the pin and the
      // date — the same order createItemRow lays them out in
      marks.insertBefore(createSubBadge(item),
        marks.querySelector(".item__star, .item__pin, .item__due"));
    } else if (!subs.length && badge) {
      const marks = badge.parentNode;
      badge.remove();
      if (marks && !marks.firstChild) marks.remove();   // nothing left to carry
    } else if (badge) {
      let done = 0;
      for (let i = 0; i < subs.length; i++) {
        if (subs[i].done) done++;
      }
      badge.textContent = done + "/" + subs.length;
    }
  }

  /* the row's strip of marks, made if the row had none to carry until now */
  function rowMarks(row) {
    let marks = row.querySelector(".item__meta");
    if (!marks) {
      marks = document.createElement("span");
      marks.className = "item__meta";
      const head = row.querySelector(".project-tab") || row;
      head.insertBefore(marks, head.querySelector(".row-acts"));
    }
    return marks;
  }

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

  detailWhenDay.addEventListener("click", function () {
    const item = currentDetailItem();
    if (item) openCalendar(item.id, "events");
  });

  detailTrash.addEventListener("click", function () {
    const item = currentDetailItem();
    if (item) deleteTimelineMarker("events", item);   // it closes the editor first
  });

  detailBell.addEventListener("click", function () {
    const item = currentDetailItem();
    if (!item) return;
    item.important = !item.important;
    saveState();
    detailBell.classList.toggle("is-on", !!item.important);
    detailBell.setAttribute("aria-pressed", item.important ? "true" : "false");
    renderEventCal();
    renderDailyTimeline();
    renderUndated();
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
    refreshOpenRow(item);
  });

  detailNoteToggle.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    setInlineTaskNote(!inlineTaskNoteOpen);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && (openHost || openInlineProject)) closeAllInlineRows();
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
    if (!event.date) return "pending";   // nothing that has no day can have gone by
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
    renderUndated();   // the day changed, so did its hourless events
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

  /* key may be null: an event with no day yet waits over the rule of time. Its
     hour stays null too — an hour without a day would be a half-truth. */
  function addEvent(key, text, time, important) {
    state.events.push({
      id: Date.now().toString(), text: text, important: !!important,
      icon: "calendar", date: key || null, time: time || null
    });
    saveState();
    renderEventCal();
    renderDailyTimeline();
    renderUndated();
  }

  /* WHAT HAS NO DAY YET — written without a date, waiting over the rule of time.
     Dropping one onto the rule is what dates it, and the drop reuses the same
     reader and the same preview the task rows already use. */
  function undatedEvents() {
    const found = [];
    for (let i = 0; i < state.events.length; i++) {
      if (!state.events[i].date) found.push(state.events[i]);
    }
    return found;
  }

  /* Events of the day on show that carry no hour: they have a place in the week
     but none on the rule, so they wait on the same line as the dateless ones —
     under the name of their day, and only while the grid is on that day. */
  function timelessEventsOnShownDay() {
    const key = sectionDay || todayKey();
    const found = [];
    for (let i = 0; i < state.events.length; i++) {
      if (state.events[i].date === key && !state.events[i].time) found.push(state.events[i]);
    }
    return found;
  }

  function renderUndated() {
    const box = document.getElementById("undatedItems");
    if (!box) return;
    const loose = undatedEvents();
    const timeless = timelessEventsOnShownDay();
    box.innerHTML = "";
    // The strip itself is never taken away, only emptied: it holds its height so
    // that opening its halves mid-drag cannot push the rule of time down under a
    // pointer that has already been measured against it.
    document.getElementById("loose").hidden = loose.length === 0;
    document.getElementById("undatedLabel").hidden = loose.length === 0;
    for (let i = 0; i < loose.length; i++) box.appendChild(undatedChip(loose[i]));

    const dayBox = document.getElementById("timelessItems");
    const dayGroup = document.getElementById("timeless");
    dayBox.innerHTML = "";
    dayGroup.hidden = timeless.length === 0;
    if (timeless.length) {
      document.getElementById("timelessLabel").textContent = shownDayLabel();
      for (let i = 0; i < timeless.length; i++) dayBox.appendChild(undatedChip(timeless[i]));
    }
  }

  /* the day a grid cell stands for, written out */
  function dayKeyLabel(key) {
    if (key === todayKey()) return translate("groupToday");
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const text = new Date(key + "T00:00").toLocaleDateString(locale,
      { weekday: "long", day: "numeric", month: "long" });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /* "Aujourd'hui" while the grid is on today, the day written out otherwise */
  function shownDayLabel() {
    const key = sectionDay || todayKey();
    if (key === todayKey()) return translate("groupToday");
    const locale = state.settings.language === "fr" ? "fr-FR" : "en-US";
    const text = new Date(key + "T00:00").toLocaleDateString(locale,
      { weekday: "long", day: "numeric", month: "long" });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function undatedChip(event) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = event.important ? "undated__chip is-important" : "undated__chip";
    chip.dataset.event = event.id;
    chip.title = event.text;

    const icon = document.createElement("span");
    icon.className = "undated__chip-ico";
    icon.innerHTML = eventSvg(event.icon || "calendar");
    const text = document.createElement("span");
    text.className = "undated__chip-text";
    text.textContent = event.text;
    chip.append(icon, text);

    armUndatedDrag(chip, event);
    return chip;
  }

  function armUndatedDrag(chip, event) {
    chip.addEventListener("pointerdown", function (down) {
      if (down.pointerType === "mouse" && down.button !== 0) return;
      down.preventDefault();
      chip.setPointerCapture(down.pointerId);
      let moved = false;
      let drop = null;

      let deleting = false;
      let grabX = 0;
      let grabY = 0;
      let origin = { x: 0, y: 0 };
      let zone = null;    // null, "loose" or "day"
      let onDay = null;   // a day key when the grid is being aimed at

      const move = function (at) {
        if (!moved && Math.abs(at.clientX - down.clientX)
                    + Math.abs(at.clientY - down.clientY) < 6) return;
        if (!moved) {
          moved = true;
          freezeUndatedHeight();   // before anything here changes the strip's size
          // Lift it out of the flow before anything else: showing the drop halves
          // resizes the strip underneath, and a chip still in that flow would be
          // carried sideways by the reflow the moment it was picked up.
          const box = chip.getBoundingClientRect();
          grabX = down.clientX - box.left;
          grabY = down.clientY - box.top;
          chip.style.width = box.width + "px";
          chip.classList.add("is-dragging");
          origin = fixedOrigin(chip);
          showTimelineTrash(true, false);
        }
        chip.style.left = (at.clientX - grabX - origin.x).toFixed(0) + "px";
        chip.style.top = (at.clientY - grabY - origin.y).toFixed(0) + "px";

        // the bin wins over everything: it is the only target that unmakes.
        // Then the strip, then the rule — the strip is a small deliberate area
        // and the rule's catch margins are wide enough to swallow it.
        deleting = timelineTrashHit(at.clientX, at.clientY);
        onDay = deleting ? null : calendarDayHit(at.clientX, at.clientY);
        zone = (deleting || onDay) ? null : undatedZoneHit(at.clientX, at.clientY);
        chip.classList.toggle("is-delete-target", deleting);
        showTimelineTrash(true, deleting);
        showCalendarDayTarget(onDay);
        showUndatedZone(true, zone);
        drop = (deleting || onDay || zone) ? null : taskDropAt(at.clientX, at.clientY);
        showTaskDrop(drop, event, false, eventSvg(event.icon || "calendar"));
      };
      const up = function () {
        const remove = deleting;
        const landed = zone;
        const moveTo = onDay;
        chip.releasePointerCapture(down.pointerId);
        chip.removeEventListener("pointermove", move);
        chip.removeEventListener("pointerup", up);
        chip.removeEventListener("pointercancel", up);
        chip.classList.remove("is-dragging", "is-delete-target");
        releaseUndatedHeight();
        chip.style.left = "";
        chip.style.top = "";
        chip.style.width = "";
        showTaskDrop(null, event);
        showTimelineTrash(false, false);
        showCalendarDayTarget(null);
        showUndatedZone(false, null);
        // a press that never travelled is a click: open it instead
        if (!moved) { openEventFold(event); return; }
        if (remove) { deleteTimelineMarker("events", event); return; }
        if (moveTo) {
          // put down on the grid: it takes that day and stays without an hour
          event.date = moveTo;
          event.time = null;
        } else if (landed) {
          // between the two halves of the strip: it gains or loses its day, and
          // stays without an hour either way
          event.date = landed === "day" ? (sectionDay || todayKey()) : null;
          event.time = null;
        } else if (drop) {
          event.date = drop.date;
          event.time = drop.time;
        } else return;
        saveState();
        renderEventCal();
        renderDailyTimeline();
        renderUndated();
      };
      chip.addEventListener("pointermove", move);
      chip.addEventListener("pointerup", up);
      chip.addEventListener("pointercancel", up);
    });
  }

  function removeEvent(id) {
    removeWithUndo("events", id, function () {
      renderEventCal();
      renderDailyTimeline();
      renderUndated();   // an undated one lives only in the strip: redraw it too
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

  function onThreshold() {
    return !!welcomeScreen && !welcomeScreen.dataset.gone;
  }

  /* Until the day's real sunrise and sunset come back, the cursor runs on these.
     They are only ever used to place and colour the sun itself — the sunrise and
     sunset markers stay away, since those carry a time and must not be invented. */
  const CIVIL_RISE = 7 * 60;
  const CIVIL_SET = 19 * 60;

  function fitTimelineWindow() {
    spanMs = DAY_MS;
    // On the threshold the rule is the only thing on screen, so the present sits
    // dead centre and the sun is in view whatever the hour. Pinned to midnight
    // the way the app frames it, an evening sun ends up squashed against the
    // right edge and a small-hours one against the left.
    if (sectionDay || onThreshold()) { nowAnchor = .5; return; }
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
    // the threshold hangs its whole sunset on this dot, and needs to know which
    marker.dataset.sun = captionKey === "sunriseLabel" ? "rise" : "set";

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
    }

    // the sun shows even before the real times are known: hiding it left the
    // threshold with a rule and no sun on the first opening of any day
    if (sectionDay) {
      cursor.hidden = true;
    } else {
      updateCursor(cursor,
        sun ? toMinutes(sun.sunrise) : CIVIL_RISE,
        sun ? toMinutes(sun.sunset) : CIVIL_SET);
      cursor.hidden = false;
    }

    renderTimelineItems(windowStart);
    fieldWake();   // the block field carries the sun's light, so it repaints too
    syncSceneHorizon();   // and the threshold's cloud hangs off the rule
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

  let trashTossTimer = null;

  /* Going away while it was the live target means something was just dropped in
     it — the one moment the bin actually swallows anything. So the lid takes it
     and falls shut, and only then does the bin go. Catching it here rather than
     at each of the four drag ends is what keeps them from drifting apart. */
  function showTimelineTrash(show, active) {
    clearTimeout(trashTossTimer);
    if (!show && dtlTrashEl.classList.contains("is-active")) {
      dtlTrashEl.classList.remove("is-active");
      dtlTrashEl.classList.add("is-tossing");
      trashTossTimer = setTimeout(function () {
        dtlTrashEl.classList.remove("is-tossing");
        dtlTrashEl.hidden = true;
        dtlTrashEl.setAttribute("aria-hidden", "true");
      }, 620);
      return;
    }
    dtlTrashEl.classList.remove("is-tossing");
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

  /* THE UNDATED ZONE AS A TARGET — dropping a dated event into the strip above
     takes its day away. The strip is only on the page when it holds something,
     so it is shown on purpose for the length of a drag: otherwise there would be
     nowhere to drop the first one. */
  const undatedEl = document.getElementById("undated");

  /* The strip has two halves and they mean different things to a drop: the loose
     one takes the day away, the day's one takes only the hour. Both are shown for
     the length of a drag, empty or not, or there would be nothing to aim at. */
  /* Whatever the strip does inside itself while a drag is on — a chip leaving the
     flow, a half opening, a line of chips reflowing to one — its outer height is
     pinned for the length of the gesture. Anything above the rule that changes
     size moves the rule, and the rule is what every coordinate is measured from. */
  function freezeUndatedHeight() {
    if (!undatedEl || undatedEl.style.height) return;
    undatedEl.style.height = undatedEl.getBoundingClientRect().height + "px";
  }

  function releaseUndatedHeight() {
    if (undatedEl) undatedEl.style.height = "";
  }

  function showUndatedZone(show, active) {
    if (!undatedEl) return;
    const dayGroup = document.getElementById("timeless");
    const looseGroup = document.getElementById("loose");
    undatedEl.classList.toggle("is-target", !!show);
    looseGroup.classList.toggle("is-target", !!show);
    dayGroup.classList.toggle("is-target", !!show);
    looseGroup.classList.toggle("is-active", active === "loose");
    dayGroup.classList.toggle("is-active", active === "day");
    if (show) {
      // both halves and both names, whether or not they hold anything: an empty
      // half with no label has no width, and cannot be dropped into
      looseGroup.hidden = false;
      dayGroup.hidden = false;
      document.getElementById("undatedLabel").hidden = false;
      document.getElementById("timelessLabel").textContent = shownDayLabel();
    } else {
      releaseUndatedHeight();
      renderUndated();   // back to whatever the two should be on their own
    }
  }

  function inBox(el, clientX, clientY, pad) {
    if (!el || el.hidden) return false;
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return false;
    return clientX >= rect.left - pad && clientX <= rect.right + pad
      && clientY >= rect.top - pad && clientY <= rect.bottom + pad;
  }

  /* "day" over the day's half, "loose" over the loose one, null outside. Each
     half is measured on its own box — the strip as a whole would hand almost
     everything to whichever half happens to be wider. */
  function undatedZoneHit(clientX, clientY) {
    if (!undatedEl) return null;
    if (inBox(document.getElementById("timeless"), clientX, clientY, 8)) return "day";
    if (inBox(document.getElementById("loose"), clientX, clientY, 8)) return "loose";
    return null;
  }

  /* the third place an event can be put down: a day on the grid. It changes the
     day and leaves the hour alone — the rule is what sets an hour. */
  function calendarDayHit(clientX, clientY) {
    const cells = ecalGrid.querySelectorAll(".ecal__day");
    for (let i = 0; i < cells.length; i++) {
      if (inBox(cells[i], clientX, clientY, 0)) return cells[i].dataset.key;
    }
    return null;
  }

  function showCalendarDayTarget(key) {
    const cells = ecalGrid.querySelectorAll(".ecal__day");
    for (let i = 0; i < cells.length; i++) {
      cells[i].classList.toggle("is-drop-target", !!key && cells[i].dataset.key === key);
    }
  }

  /* LIFTING OFF — a marker dragged away from the rule stops pretending to be on
     it. Within reach, above or below, it stays hooked and its stem holds; past
     that it lifts off and follows the pointer as a card. Brought back, it lands
     on the rule again. The reach is generous on purpose: sliding an hour is the
     common gesture, and it must not detach under a shaky hand. */
  /* The stem at rest spans from the icon down to the rule: 42 units of the 74-unit
     box, plus whatever the collision layout lifted this marker by. That length is
     the whole budget — a marker is never further from the rule than its own stem
     can reach, and past it the stem is gone rather than stretched. */
  const STEM_REST = 42;

  function stemBudget(marker) {
    return STEM_REST + Number(marker.dataset.lift || 0);
  }

  /* how far the pointer stands off the rule, on the given face; 0 when over it */
  function offRule(clientY, hangs) {
    const line = ruleLineY();
    return Math.max(0, hangs ? clientY - line : line - clientY);
  }

  /* position: fixed resolves against the nearest ancestor carrying a transform, a
     filter or a backdrop-filter — not against the window. The rule's rail takes a
     transform to slide between days, so window coordinates land short by exactly
     the page's scroll. Rather than hunt for which ancestor it is, ask the element
     where its own (0,0) actually falls, once, and take that out afterwards. */
  function fixedOrigin(el) {
    const left = el.style.left;
    const top = el.style.top;
    el.style.left = "0px";
    el.style.top = "0px";
    const box = el.getBoundingClientRect();
    el.style.left = left;
    el.style.top = top;
    return { x: box.left, y: box.top };
  }

  const MARKER_HALF = 40;   // the marker box is 80 wide, its icon centred in it

  function liftMarker(marker, clientX, clientY, iconY) {
    if (!marker.classList.contains("is-floating")) {
      marker.classList.add("is-floating");
      // Put the icon back at rest inside its box first. While the marker was
      // hooked, stretchMarker was moving the icon about within the box to draw
      // the stem; leaving it there would offset the whole card from the pointer
      // by however far the stem happened to be stretched when it let go — which
      // is why the offset looked to have no pattern.
      restIcon(marker, iconY > 40);
    }
    // Measured every frame, not cached: the ancestor this resolves against sits
    // in the page, so it slides whenever the page does — and a task drag can
    // scroll the page under the pointer while it is held.
    const origin = fixedOrigin(marker);
    // iconY is how far the icon sits from the top of the box: 16 for a marker
    // standing over the rule, 58 for one hanging under it
    marker.style.left = (clientX - origin.x - MARKER_HALF) + "px";
    marker.style.top = (clientY - origin.y - iconY) + "px";
  }

  /* the icon and its label back where the stylesheet expects them in their box */
  function restIcon(marker, hangs) {
    const icon = marker.querySelector(".dtl__event-icon");
    const tip = marker.querySelector(".dtl__event-tip");
    if (icon) {
      icon.style.top = hangs ? "" : "0px";
      icon.style.bottom = hangs ? "0px" : "";
    }
    if (tip) {
      tip.style.top = hangs ? "" : "-30px";
      tip.style.bottom = hangs ? "-30px" : "";
    }
  }

  /* HOOKED, BUT NOT PINNED — within reach the marker follows the pointer away from
     the rule as well as along it: the stem lengthens to keep the icon under the
     finger and its foot on the rule, and it is drawn straight up, because a link
     that leans reads as a lean rather than as a measure. Past the reach it is let
     go entirely; dropping it redraws the marker, so the stem returns to rest. */
  /* Draw the stem to a given length. The icon rides at its far end, so a length of
     zero puts the icon on the rule itself with no stem at all, and the resting
     length puts it back where the renderer had it. Straight, not curved: a link
     that leans reads as a lean rather than as a measure. */
  function stretchMarker(marker, length, hangs) {
    const y = Math.max(0, length);
    const icon = marker.querySelector(".dtl__event-icon");
    const tip = marker.querySelector(".dtl__event-tip");
    const path = marker.querySelector(".dtl__event-path");
    if (!icon || !path) return;
    icon.style.left = "50%";
    if (tip) tip.style.left = "50%";
    // the foot is its own circle, not part of the path: it has to change ends with
    // the stem, or it stays behind on the face the marker has just left
    const foot = marker.querySelector(".dtl__event-foot");
    if (foot) { foot.setAttribute("cx", "40"); foot.setAttribute("cy", hangs ? "2" : "72"); }
    if (hangs) {
      icon.style.top = "";
      icon.style.bottom = (40 - y) + "px";
      if (tip) { tip.style.top = ""; tip.style.bottom = (10 - y) + "px"; }
      path.setAttribute("d", "M40 " + (2 + y) + " L40 2");
    } else {
      icon.style.bottom = "";
      icon.style.top = (40 - y) + "px";
      if (tip) { tip.style.bottom = ""; tip.style.top = (10 - y) + "px"; }
      path.setAttribute("d", "M40 " + (72 - y) + " L40 72");
    }
  }

  /* The line itself, not the box that holds it: .dtl is 78px tall and its rule is
     the 2px strip pinned to the bottom of it. Measuring sides and distances from
     the box's top or middle put both of them out by most of that height. */
  function ruleLineY() {
    return dtlEl.getBoundingClientRect().bottom;
  }

  /* which face of the rule the pointer is on */
  function pointerUnderRule(clientY) {
    return clientY > ruleLineY();
  }

  /* Dragged across the rule, a marker changes face rather than stretching a stem
     back over the line: the stem always leaves the rule on the side the hand is. */
  function faceMarker(marker, under) {
    marker.classList.toggle("dtl__event--under", under);
    const icon = marker.querySelector(".dtl__event-icon");
    const tip = marker.querySelector(".dtl__event-tip");
    if (icon) { icon.style.top = ""; icon.style.bottom = ""; }
    if (tip) { tip.style.top = ""; tip.style.bottom = ""; }
  }

  function landMarker(marker) {
    marker.classList.remove("is-floating");
    marker.style.top = "";
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
      let undating = null;   // null, "loose" or "day"
      let onDay = null;      // a day key when the grid is being aimed at

      let pointerX = downEvent.clientX;
      let pointerY = downEvent.clientY;
      let scrollFrame = 0;

      marker.setPointerCapture(downEvent.pointerId);

      const rest = function (label) {
        event.time = originalTime;
        // a lifted marker is placed by the pointer, not by the clock
        if (!marker.classList.contains("is-floating")) {
          marker.style.left = Math.max(0, Math.min(100, timePct(originalAt, windowStart))).toFixed(2) + "%";
        }
        marker.classList.toggle("is-past", originalPast);
        marker.classList.toggle("is-pending", !originalPast);
        marker.setAttribute("aria-label", label + " · " + event.text);
        marker.querySelector(".dtl__event-tip").textContent = label;
      };

      const applyMove = function (clientX, clientY) {
        const dx = clientX - downEvent.clientX;
        if (!marker.classList.contains("is-dragging")) {
          marker.classList.add("is-dragging");
          freezeUndatedHeight();
          showTimelineTrash(true, false);
          showUndatedZone(true, false);
        }

        // the bin first — it is the only one that unmakes — then the grid, then
        // the strip, and the rule last: its catch margins are the widest
        deleting = timelineTrashHit(clientX, clientY);
        onDay = deleting ? null : calendarDayHit(clientX, clientY);
        undating = (deleting || onDay) ? null
          : undatedZoneHit(clientX, clientY);
        marker.classList.toggle("is-delete-target", deleting);
        showTimelineTrash(true, deleting);
        showCalendarDayTarget(onDay);
        showUndatedZone(true, undating);

        // near the rule it stays hooked; away from it, it lifts off and follows
        const under = pointerUnderRule(clientY);
        const off = offRule(clientY, under);
        const hooked = off <= stemBudget(marker) && !deleting && !onDay && !undating;
        if (hooked) {
          landMarker(marker);
          faceMarker(marker, under);
          stretchMarker(marker, off, under);
        } else {
          liftMarker(marker, clientX, clientY, under ? 58 : 16);
        }

        if (onDay) { rest(dayKeyLabel(onDay)); return; }
        if (undating) {
          rest(undating === "day" ? shownDayLabel() : translate("undatedLabel"));
          return;
        }
        if (deleting) { rest(translate("timelineDelete")); return; }
        if (!hooked) { rest(event.text); return; }   // lifted, waiting for a target

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

      /* the page follows the pointer at the edges, so an event can be carried to a
         day or a bin that is off screen — the same reach a task already had */
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
        if (!moved) { moved = true; scrollFrame = requestAnimationFrame(autoScroll); }
        applyMove(pointerX, pointerY);
      };

      const cleanup = function () {
        cancelAnimationFrame(scrollFrame);
        scrollFrame = 0;
        marker.removeEventListener("pointermove", move);
        marker.removeEventListener("pointerup", up);
        marker.removeEventListener("pointercancel", cancel);
        marker.classList.remove("is-dragging", "is-delete-target");
        landMarker(marker);
        releaseUndatedHeight();
        showTimelineTrash(false, false);
        showCalendarDayTarget(null);
        showUndatedZone(false, false);
        if (marker.hasPointerCapture(downEvent.pointerId)) {
          marker.releasePointerCapture(downEvent.pointerId);
        }
      };

      const up = function () {
        const remove = deleting;
        const loosen = undating;
        const moveTo = onDay;
        cleanup();
        if (!moved) return;
        eventDragUntil = Date.now() + 300;
        if (moveTo) {
          event.date = moveTo;   // the grid moves the day, the rule sets the hour
          event.time = originalTime;
          saveState();
          renderEventCal();
          renderDailyTimeline();
          renderUndated();
          return;
        }
        if (loosen) {
          // it keeps its name and its icon; dropped on the day's half it keeps
          // that day too, and only its hour is given back
          event.date = loosen === "day" ? (sectionDay || todayKey()) : null;
          event.time = null;
          saveState();
          renderEventCal();
          renderDailyTimeline();
          renderUndated();
          return;
        }
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

        const undatedGroup = document.querySelector('.tgroup[data-drop-group=""]');
        if (undatedGroup) {
          undatedGroup.classList.add("is-drop-available");
          undatedGroup.classList.toggle("is-drop-target", undating);
        }

        // near the rule it stays hooked; away from it, it lifts off and follows
        const under = pointerUnderRule(clientY);
        const off = offRule(clientY, under);
        const hooked = off <= stemBudget(marker) && !deleting && !undating;
        if (hooked) {
          landMarker(marker);
          faceMarker(marker, under);
          stretchMarker(marker, off, under);
        } else {
          liftMarker(marker, clientX, clientY, under ? 58 : 16);
        }

        const rest = function (label) {
          task.dueDate = originalDate;
          task.dueTime = originalTime;
          if (!marker.classList.contains("is-floating")) {
            marker.style.left = Math.max(0, Math.min(100, timePct(originalAt, windowStart))).toFixed(2) + "%";
          }
          marker.setAttribute("aria-label", label + " · " + task.text);
          marker.querySelector(".dtl__event-tip").textContent = label;
        };

        if (deleting) { rest(translate("timelineDelete")); return; }
        if (undating) { rest(translate("groupNone")); return; }
        if (!hooked) { rest(task.text); return; }

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
          freezeUndatedHeight();
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
        landMarker(marker);
        releaseUndatedHeight();
        showTimelineTrash(false, false);
        cancelAnimationFrame(scrollFrame);
        const undatedGroup = document.querySelector('.tgroup[data-drop-group=""]');
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
          if (task.projectId) refreshProjectSteps(findItem("projects", task.projectId));
          return;
        }
        task.notified = false;
        saveState();
        renderList("tasks");
        renderDailyTimeline();
        if (task.projectId) refreshProjectSteps(findItem("projects", task.projectId));
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

  function eventMinute(event) {
    if (!event.time) return null;
    const parts = event.time.split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
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
        // dated but not timed: it belongs to its day, not to a minute of it, so
        // it stays in the day's part of the list and never reaches the rule
        if (!task.dueTime) continue;
        const at = new Date(task.dueDate + "T" + task.dueTime).getTime();
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
      const time = isTask ? data.dueTime : data.time;
      cluster = item.at - lastAt < 45 * 60000 ? cluster + 1 : 0;
      lastAt = item.at;
      const lane = cluster % 2;
      const spread = Math.floor(cluster / 2);
      let shift = spread ? (spread % 2 ? 36 : -36) : 0;
      const lift = lane * 38;
      if (item.pct < 5 && shift < 0) shift *= -1;
      if (item.pct > 95 && shift > 0) shift *= -1;

      const hangs = isTask;   // tasks below the rule, events above it
      const marker = document.createElement("button");
      marker.type = "button";
      if (isTask) {
        marker.className = "dtl__event dtl__task dtl__event--under "
          + (data.done ? "is-done" : "is-" + eventStatus({ date: data.dueDate, time: time }));
        const stepColor = stepTaskColor(data);
        if (stepColor) {
          marker.classList.add("dtl__task--step-linked");
          marker.style.setProperty("--task-step-color", stepColor);
        }
      } else {
        marker.className = "dtl__event is-" + eventStatus(data)
          + (data.important ? " is-important" : "");
      }
      marker.style.left = item.pct.toFixed(2) + "%";
      marker.style.setProperty("--event-shift", shift + "px");
      marker.dataset.lift = lift;     // the stem's resting length, to stretch from
      marker.dataset[isTask ? "task" : "event"] = data.id;
      marker.setAttribute("aria-label", time + " · " + data.text);
      marker.addEventListener("click", function (clickEvent) {
        if (Date.now() < eventDragUntil) {
          clickEvent.preventDefault();
          return;
        }
        if (isTask) openTaskRow(data);
        else openEventFold(data);
      });

      const wire = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      wire.setAttribute("class", "dtl__event-filament");
      wire.setAttribute("viewBox", "0 0 80 74");
      wire.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "dtl__event-path");
      const startX = 40 + shift;
      // a task hangs under the rule, an event stands over it: the same curve,
      // read from the other end, so the two kinds never crowd the same side
      const startY = hangs ? 44 + lift : 30 - lift;
      path.setAttribute("d", hangs
        ? "M" + startX + " " + startY + " C" + startX + " 26 40 30 40 2"
        : "M" + startX + " " + startY + " C" + startX + " 48 40 44 40 72");
      const foot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      foot.setAttribute("class", "dtl__event-foot");
      foot.setAttribute("cx", "40");
      foot.setAttribute("cy", hangs ? "2" : "72");
      foot.setAttribute("r", "3.5");
      wire.append(path, foot);

      const icon = document.createElement("span");
      icon.className = "dtl__event-icon";
      icon.style.left = "calc(50% + " + shift + "px)";
      if (hangs) icon.style.bottom = -lift + "px";
      else icon.style.top = -lift + "px";
      icon.innerHTML = isTask
        ? iconSvg('<circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/>')
        : eventSvg(data.icon || "calendar");
      const tip = document.createElement("span");
      tip.className = "dtl__event-tip";
      tip.style.left = "calc(50% + " + shift + "px)";
      if (hangs) tip.style.bottom = (-30 - lift) + "px";
      else tip.style.top = (-30 - lift) + "px";
      tip.textContent = time + " · " + data.text;
      marker.append(wire, icon, tip);
      if (isTask) armTaskTimeDrag(marker, data, windowStart);
      else armEventTimeDrag(marker, data, windowStart);
      layer.appendChild(marker);
    }
  }

  let sectionDay = null;   // null means today

  /* The calendar and timeline travel together. The task flow is independent:
     changing the day must never rebuild, reorder or fold its rows. */
  function previewTimelineDay(key) {
    sectionDay = key === todayKey() ? null : key;
    scrubOffset = 0;
    markPickedDay();
    paintDayToday();
    renderDailyTimeline();
  }

  function showDay(key) {
    previewTimelineDay(key);
  }

  /* An event written without a day stays without one: it waits over the rule of
     time until it is dropped onto it. Only a day actually recognised in the line
     dates it — nothing is guessed on the writer's behalf any more. */
  function quickEventDay(parsed) {
    return writtenDay(parsed);
  }
  function quickEventTime(parsed) {
    return parsed.time || null;
  }

  wireQuickAdd({
    form: "quickEvent", input: "quickEventInput", mirror: "quickEventMirror",
    hint: "quickEventHint", button: "addEventBtn",
    flagLabel: "importantLabel", fallbackName: "newEventName",
    resolveDate: quickEventDay,
    resolveTime: quickEventTime,
    submit: function (parsed, title, day, time) {
      addEvent(day, title, time, parsed.flag);
      if (day) goToDay(day);   // follow the day it landed on rather than lose it
      else renderUndated();    // undated: it appears over the rule instead
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

  /* A task already has a place of its own in the list: clicking its mark on the
     rule unfolds that row rather than opening a second copy of it up here. Its
     day may be folded away, so the group is opened first and the row looked up
     afterwards — it does not exist until then. */
  function openTaskRow(task) {
    const group = task.dueDate ? "day:" + task.dueDate : null;
    if (group && collapsedGroups[group]) {
      collapsedGroups[group] = false;
      renderList("tasks");
    }
    const row = document.querySelector('#tasksList .item[data-id="' + task.id + '"]');
    if (!row) return;
    if (row.classList.contains("is-open")) { closeDetail(); return; }
    const inner = row.querySelector(".unfold__inner");
    if (!inner) return;
    openDetail("tasks", task.id, inner);
    row.scrollIntoView({ behavior: "smooth", block: "center" });
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
  /* Every sky is cut from the same three pieces — a sun, a cloud, and what falls
     out of it — so the button can play one weather story over any of them and
     still land back on the sky the day actually has. The code decides only which
     pieces are up and where the sun sits; the stylesheet holds both, per code,
     in custom properties the story's last keyframe reads back. That is what lets
     a clear day borrow a cloud for four seconds and then give it back. */
  const WX_PARTS =
      '<g class="wx-sun"><circle cx="12" cy="12" r="4"/>'
    + '<g class="wx-rays"><line x1="12" y1="3" x2="12" y2="5"/>'
    + '<line x1="12" y1="19" x2="12" y2="21"/><line x1="3" y1="12" x2="5" y2="12"/>'
    + '<line x1="19" y1="12" x2="21" y2="12"/><line x1="6" y1="6" x2="7.4" y2="7.4"/>'
    + '<line x1="16.6" y1="16.6" x2="18" y2="18"/><line x1="6" y1="18" x2="7.4" y2="16.6"/>'
    + '<line x1="16.6" y1="7.4" x2="18" y2="6"/></g></g>'
    + '<g class="wx-cloud"><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1.4A3.6 3.6 0 0 1 18 18z"/></g>'
    + '<g class="wx-drops"><line x1="8" y1="20" x2="7" y2="22"/>'
    + '<line x1="12" y1="20" x2="11" y2="22"/><line x1="16" y1="20" x2="15" y2="22"/></g>'
    + '<g class="wx-flakes"><line x1="8" y1="20.5" x2="8" y2="20.51"/>'
    + '<line x1="12" y1="21" x2="12" y2="21.01"/><line x1="16" y1="20.5" x2="16" y2="20.51"/></g>'
    + '<g class="wx-bolt"><polyline points="12 19 10 22.5 13 22 11 25.5"/></g>'
    + '<g class="wx-fogbars"><line x1="4" y1="9" x2="20" y2="9"/>'
    + '<line x1="3" y1="13" x2="21" y2="13"/><line x1="5" y1="17" x2="19" y2="17"/></g>';

  function weatherKind(code) {
    if (code === 0) return "clear";
    if (code <= 2) return "partly";
    if (code === 45 || code === 48) return "fog";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
    if (code >= 95) return "storm";
    return "cloud";
  }

  function weatherIcon(code) {
    return '<svg class="wx wx--' + weatherKind(code) + '" viewBox="0 0 24 24" fill="none" '
      + 'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
      + WX_PARTS + '</svg>';
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
           + 'stroke-linejoin="round" class="wx wx-glyph wx--' + weatherKind(codes[i]) + '">'
           + WX_PARTS + '</svg>';
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
  const thinkingSelect = document.getElementById("thinkingSelect");
  const thinkingLinkTool = document.getElementById("thinkingLinkTool");
  const thinkingSelectionActions = document.getElementById("thinkingSelectionActions");
  const thinkingSelectionCount = document.getElementById("thinkingSelectionCount");
  const thinkingSelectionCanvas = document.getElementById("thinkingSelectionCanvas");
  const thinkingToolSectionSwitch = document.getElementById("thinkingToolSectionSwitch");
  const thinkingToolPanels = document.querySelectorAll("[data-thinking-tool-panel]");
  /* Two closed families. A thinking block cycles among thinking blocks, a planning
     block among planning blocks; nothing crosses, and a project is neither — it is
     not something another block turns into. */
  const THINKING_BLOCK_TYPES = ["problem", "solution", "example", "idea", "question",
    "answer", "note", "journal"];
  const THINKING_PLANNING_TYPES = ["task", "step", "event", "habit"];
  const THINKING_ACTION_TYPES = ["task", "event", "habit", "step", "journal"];
  const THINKING_FLOW_TYPES = ["loop", "condition"];

  /* the list a block may cycle through, or null when it may not change at all */
  function thinkingTypeFamily(type) {
    if (THINKING_PLANNING_TYPES.indexOf(type) !== -1) return THINKING_PLANNING_TYPES;
    if (THINKING_BLOCK_TYPES.indexOf(type) !== -1) return THINKING_BLOCK_TYPES;
    return null;
  }
  const THINKING_ORGANIZATION_TYPES = ["canvas", "folder", "document", "planner", "logbook"];
  const THINKING_TOOL_SECTIONS = ["blocks", "organization", "planning"];
  const THINKING_WORLD_WIDTH = 20000;
  const THINKING_WORLD_HEIGHT = 12000;
  const THINKING_WORLD_X = 9000;
  const THINKING_WORLD_Y = 5000;
  const THINKING_CANVAS_CHROME = 70;
  const THINKING_STICK_SIDES = ["top", "right", "bottom", "left"];
  let openCanvasId = null;
  let thinkingLinkFrom = null;
  let thinkingDragging = false;
  let thinkingCounter = 0;
  let thinkingLinkFrame = null;
  let thinkingCameraTimer = null;
  let thinkingRecentering = false;
  let viewedCanvasId = null;
  let thinkingSuppressedTool = null;
  let thinkingCanvasAnimationTimer = null;
  let thinkingTrashTimer = null;
  let thinkingSelectionMode = false;
  let thinkingLinkMode = false;
  let thinkingSelectionParentId = null;
  let thinkingSelectedIds = {};
  let thinkingSelectionClickSuppressed = false;
  let thinkingClipboard = null;
  let thinkingPasteCount = 0;
  let thinkingToolContext = null;
  let thinkingAvailableToolSections = THINKING_TOOL_SECTIONS.slice();
  const thinkingCanvasFoldLocks = {};

  function setThinkingToolSection(section) {
    if (thinkingAvailableToolSections.indexOf(section) === -1) {
      section = thinkingAvailableToolSections[0] || "blocks";
    }
    const changed = thinkingToolSectionSwitch.dataset.thinkingToolSection !== section;
    thinkingToolSectionSwitch.dataset.thinkingToolSection = section;
    const key = section === "organization" ? "thinkingOrganization"
      : section === "planning" ? "thinkingPlanningLabel" : "thinkingBlocksLabel";
    const label = thinkingToolSectionSwitch.querySelector(".thinking-tools__section-label");
    label.dataset.i18n = key;
    label.textContent = translate(key);
    for (let i = 0; i < thinkingToolPanels.length; i++) {
      thinkingToolPanels[i].hidden = thinkingToolPanels[i].dataset.thinkingToolPanel !== section;
    }
    if (changed) {
      thinkingToolSectionSwitch.classList.remove("is-switching");
      requestAnimationFrame(function () {
        thinkingToolSectionSwitch.classList.add("is-switching");
      });
    }
  }

  function cycleThinkingToolSection() {
    const current = thinkingAvailableToolSections.indexOf(
      thinkingToolSectionSwitch.dataset.thinkingToolSection);
    setThinkingToolSection(thinkingAvailableToolSections[
      (current + 1) % thinkingAvailableToolSections.length]);
  }

  function syncThinkingToolSections(canvasNode) {
    const usefulSections = {};
    for (let i = 0; i < thinkingToolPanels.length; i++) {
      const tools = thinkingToolPanels[i].querySelectorAll(".thinking-tool[data-block-type]");
      for (let j = 0; j < tools.length; j++) {
        if (!tools[j].disabled) {
          usefulSections[thinkingToolPanels[i].dataset.thinkingToolPanel] = true;
          break;
        }
      }
    }
    const available = THINKING_TOOL_SECTIONS.filter(function (section) {
      return usefulSections[section];
    });
    thinkingAvailableToolSections = available;
    thinkingToolSectionSwitch.disabled = available.length < 2;

    const context = canvasNode.id + ":" + canvasNode.type;
    let section = thinkingToolSectionSwitch.dataset.thinkingToolSection;
    if (thinkingToolContext !== context) {
      section = canvasNode.type === "planner" ? "planning"
        : canvasNode.type === "folder" ? "organization" : "blocks";
      thinkingToolContext = context;
    }
    setThinkingToolSection(section);
  }

  function isThinkingOrganization(block) {
    return !!block && THINKING_ORGANIZATION_TYPES.indexOf(block.type) !== -1;
  }

  function thinkingOrganizationAllows(parent, child) {
    if (!isThinkingOrganization(parent) || !child) return false;
    if (parent.type === "folder") {
      return THINKING_ORGANIZATION_TYPES.indexOf(child.type) !== -1;
    }
    if (parent.type === "planner") {
      return THINKING_ACTION_TYPES.indexOf(child.type) !== -1
        || THINKING_FLOW_TYPES.indexOf(child.type) !== -1
        || ["note", "text"].indexOf(child.type) !== -1;
    }
    if (parent.type === "logbook") return child.type === "journal";
    return true;
  }

  function thinkingOrganizationTitle(block) {
    return (block.title || "").trim() || translate(thinkingTypeKey(block.type));
  }

  function thinkingFolderChildren(tree, folder) {
    const children = [];
    for (let i = 0; i < tree.blocks.length; i++) {
      if (tree.blocks[i].parentId === folder.id) children.push(tree.blocks[i]);
    }
    children.sort(function (a, b) {
      const aOrder = a.folderOrder == null ? tree.blocks.indexOf(a) * 100 : a.folderOrder;
      const bOrder = b.folderOrder == null ? tree.blocks.indexOf(b) * 100 : b.folderOrder;
      return aOrder - bOrder;
    });
    return children;
  }

  function nextThinkingFolderOrder(tree, folder) {
    const children = thinkingFolderChildren(tree, folder);
    return children.length ? (children[children.length - 1].folderOrder || children.length * 100)
      + 100 : 100;
  }

  function placeThinkingBlockInFolder(tree, block, folder, list, clientX, clientY) {
    const children = thinkingFolderChildren(tree, folder).filter(function (child) {
      return child.id !== block.id;
    });
    let insertAt = children.length;
    if (list && clientY != null) {
      const cards = list.querySelectorAll(":scope > .thinking-block");
      insertAt = children.length;
      let visualIndex = 0;
      for (let i = 0; i < cards.length; i++) {
        if (cards[i].dataset.blockId === block.id) continue;
        const rect = cards[i].getBoundingClientRect();
        const onThisRow = clientY >= rect.top && clientY <= rect.bottom;
        if (clientY < rect.top || (onThisRow && clientX < rect.left + rect.width / 2)) {
          insertAt = visualIndex;
          break;
        }
        visualIndex++;
      }
    }
    children.splice(Math.min(insertAt, children.length), 0, block);
    for (let i = 0; i < children.length; i++) children[i].folderOrder = (i + 1) * 100;
    block.parentId = folder.id;
    delete block.stuckToId;
    delete block.stuckSide;
  }

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

  function thinkingSubtask(owner, id) {
    if (!owner || !owner.subtasks) return null;
    for (let i = 0; i < owner.subtasks.length; i++) {
      if (owner.subtasks[i].id === id) return owner.subtasks[i];
    }
    return null;
  }

  function thinkingTaskOwner(block) {
    return block && block.taskId ? findItem("tasks", block.taskId) : null;
  }

  function thinkingTaskItem(block) {
    const owner = thinkingTaskOwner(block);
    if (!owner) return null;
    return block.subtaskId ? thinkingSubtask(owner, block.subtaskId) : owner;
  }

  function createThinkingTask(text) {
    const task = {
      id: thinkingId("t"),
      text: text || translate("newTaskName"),
      done: false,
      projectId: null
    };
    state.tasks.push(task);
    return task;
  }

  function linkThinkingBlockToNewTask(block, text) {
    const task = createThinkingTask(text);
    block.taskId = task.id;
    delete block.subtaskId;
    block.text = task.text;
    return task;
  }

  function createThinkingEvent(text) {
    const item = {
      id: thinkingId("e"), text: text || translate("blockEvent"), important: false,
      icon: "calendar", date: null, time: null
    };
    state.events.push(item);
    return item;
  }


  function createThinkingHabit(text) {
    const item = {
      id: thinkingId("h"), name: text || translate("blockHabit"), icon: "sun",
      completedDates: []
    };
    state.habits.push(item);
    return item;
  }

  function thinkingActionItem(block) {
    if (!block) return null;
    if (block.type === "task") return thinkingTaskItem(block);
    if (block.type === "event") return block.eventId ? findItem("events", block.eventId) : null;
    if (block.type === "habit") return block.habitId ? findItem("habits", block.habitId) : null;
    return null;
  }





  function linkThinkingBlockToNewAction(block, text) {
    let item = null;
    if (block.type === "task") return linkThinkingBlockToNewTask(block, text);
    if (block.type === "event") {
      item = createThinkingEvent(text);
      block.eventId = item.id;
      block.text = item.text;
    } else if (block.type === "habit") {
      item = createThinkingHabit(text);
      block.habitId = item.id;
      block.text = item.name;
    } else if (block.type === "step") {
      block.text = text || "";              // a step block stands for itself
      return null;
    } else if (block.type === "journal") {
      block.text = text || "";
      if (!block.journalDate) block.journalDate = todayKey();
      return null;
    }
    return item;
  }

  function syncThinkingActionText(block) {
    const item = thinkingActionItem(block);
    if (!item) return null;
    if (block.type === "habit") item.name = block.text;
    else item.text = block.text;
    return item;
  }

  function refreshThinkingActionViews() {
    renderList("tasks");
    renderList("projects");
    renderHabits();
    renderEventCal();
    renderDailyTimeline();
    renderUndated();
  }

  function removeThinkingTaskItem(block) {
    const owner = thinkingTaskOwner(block);
    if (!owner) return null;
    if (block.subtaskId) {
      for (let i = 0; i < owner.subtasks.length; i++) {
        if (owner.subtasks[i].id === block.subtaskId) {
          return owner.subtasks.splice(i, 1)[0];
        }
      }
      return null;
    }
    for (let i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === block.taskId) return state.tasks.splice(i, 1)[0];
    }
    return null;
  }

  function thinkingTaskForNote(canvas, block) {
    if (!canvas || !block || block.type !== "note") return null;
    const parent = findThinkingParent(canvas, block.parentId);
    return parent && parent.type === "task" ? thinkingTaskItem(parent) : null;
  }

  function refreshThinkingTaskViews() {
    renderList("tasks");
    renderDailyTimeline();
  }

  function syncThinkingBlockTaskPlacement(canvas, block, nextParent) {
    if (!block || !nextParent) return;
    if (block.type === "note") {
      const previousTask = thinkingTaskForNote(canvas, block);
      if (previousTask) block.text = previousTask.notes || "";
      if (nextParent.type === "task") {
        const nextTask = thinkingTaskItem(nextParent);
        if (nextTask) {
          if ((block.text || "").trim()) nextTask.notes = block.text;
          else block.text = nextTask.notes || "";
        }
      }
      refreshThinkingTaskViews();
      return;
    }
    if (block.type !== "task") return;

    let item = thinkingTaskItem(block);
    if (!item) item = linkThinkingBlockToNewTask(block, block.text);
    if (nextParent.type === "task" && !nextParent.subtaskId) {
      if (block.taskId === nextParent.taskId && !block.subtaskId) return;
      const parentTask = thinkingTaskItem(nextParent);
      if (!parentTask) return;
      item = removeThinkingTaskItem(block) || item;
      if (!parentTask.subtasks) parentTask.subtasks = [];
      const subtask = {
        id: item.id,
        text: item.text || translate("newTaskName"),
        done: !!item.done
      };
      if (item.notes) subtask.notes = item.notes;
      parentTask.subtasks.push(subtask);
      block.taskId = nextParent.taskId;
      block.subtaskId = subtask.id;
      block.text = subtask.text;
      refreshThinkingTaskViews();
      return;
    }
    if (block.subtaskId) {
      item = removeThinkingTaskItem(block) || item;
      const task = {
        id: item.id,
        text: item.text || translate("newTaskName"),
        done: !!item.done,
        projectId: null
      };
      if (item.notes) task.notes = item.notes;
      state.tasks.push(task);
      block.taskId = task.id;
      delete block.subtaskId;
      block.text = task.text;
      refreshThinkingTaskViews();
    }
  }

  function changeThinkingBlockType(canvas, block, nextType) {
    // Changing a planning block's type moves the thing it stands for: the text
    // travels and the old object goes, or the app would keep a twin nobody sees.
    if (block.type === "journal" && nextType !== "journal") delete block.journalDate;
    if (THINKING_PLANNING_TYPES.indexOf(block.type) !== -1 && block.type !== nextType) {
      const leaving = thinkingActionItem(block);
      if (leaving) {
        block.text = block.type === "habit" ? (leaving.name || "") : (leaving.text || "");
      }
      dropPlanningItem(block);
      if (block.type === "step") delete block.stepDone;
    }
    const linkedAction = thinkingActionItem(block);
    const linkedNote = thinkingTaskForNote(canvas, block);
    const parent = findThinkingParent(canvas, block.parentId);
    if (parent && parent.type === "planner"
        && !thinkingOrganizationAllows(parent, { type: nextType })) return;
    if (parent && THINKING_FLOW_TYPES.indexOf(parent.type) !== -1
        && THINKING_ACTION_TYPES.indexOf(nextType) === -1) return;
    if (nextType === "task" && parent && parent.type === "task" && parent.subtaskId) return;
    if (linkedAction) {
      block.text = block.type === "habit" ? linkedAction.name || "" : linkedAction.text || "";
    }
    else if (linkedNote) block.text = linkedNote.notes || "";
    const wasAction = THINKING_ACTION_TYPES.indexOf(block.type) !== -1;
    delete block.taskId;
    delete block.subtaskId;
    delete block.eventId;
    delete block.habitId;
    delete block.stepId;
    delete block.stepProjectId;
    delete block.journalEntryId;
    delete block.journalProjectId;
    delete block.projectId;   // it is no longer a canvas a project can hold
    block.type = nextType;
    if (THINKING_ACTION_TYPES.indexOf(nextType) !== -1) {
      linkThinkingBlockToNewAction(block, block.text);
      if (parent && parent.type === "task") {
        syncThinkingBlockTaskPlacement(canvas, block, parent);
      }
    } else {
      if (nextType === "note" && parent && parent.type === "task") {
        const task = thinkingTaskItem(parent);
        if (task) {
          if ((block.text || "").trim()) task.notes = block.text;
          else block.text = task.notes || "";
        }
      }
    }
    touchCanvas(canvas);
    if (wasAction || THINKING_ACTION_TYPES.indexOf(nextType) !== -1
        || (nextType === "note" && parent && parent.type === "task")) {
      refreshThinkingActionViews();
    }
    renderThinkingCanvas(canvas);
  }

  function touchCanvas(canvas) {
    canvas.updatedAt = Date.now();
    saveState();
    thinkingSaved.textContent = translate("thinkingSaved");
  }

  function clearThinkingSelection() {
    thinkingSelectedIds = {};
    thinkingSelectionParentId = null;
  }

  function selectedThinkingBlocks(canvas) {
    const selected = [];
    if (!canvas || !thinkingSelectionParentId) return selected;
    const parent = findThinkingParent(canvas, thinkingSelectionParentId);
    if (!isThinkingOrganization(parent)) {
      clearThinkingSelection();
      return selected;
    }
    const validIds = {};
    for (let i = 0; i < canvas.blocks.length; i++) {
      const block = canvas.blocks[i];
      if (thinkingSelectedIds[block.id] && block.parentId === thinkingSelectionParentId) {
        selected.push(block);
        validIds[block.id] = true;
      }
    }
    thinkingSelectedIds = validIds;
    return selected;
  }

  function syncThinkingSelection() {
    const selected = selectedThinkingBlocks(currentCanvas());
    thinkingBoard.classList.toggle("is-selecting", thinkingSelectionMode);
    thinkingSelect.setAttribute("aria-pressed", thinkingSelectionMode ? "true" : "false");
    thinkingSelect.title = translate("thinkingSelect") + " (S)";
    thinkingSelectionActions.hidden = !thinkingSelectionMode || !selected.length;
    thinkingSelectionCanvas.disabled = !selected.length;
    thinkingSelectionCount.textContent = selected.length === 1
      ? translate("thinkingSelectionOne")
      : translate("thinkingSelectionMany").replace("{count}", selected.length);
    const cards = thinkingBlocks.querySelectorAll(".thinking-block");
    for (let i = 0; i < cards.length; i++) {
      cards[i].classList.toggle("is-selected", !!thinkingSelectedIds[cards[i].dataset.blockId]);
    }
  }

  function setThinkingSelectionMode(active) {
    thinkingSelectionMode = !!active;
    if (thinkingSelectionMode) thinkingLinkMode = false;
    thinkingLinkFrom = null;
    clearThinkingLinkPreview();
    if (!thinkingSelectionMode) clearThinkingSelection();
    syncThinkingLinkMode();
    syncThinkingSelection();
  }

  function setThinkingLinkToolMode(active) {
    thinkingLinkMode = !!active;
    thinkingLinkFrom = null;
    clearThinkingLinkPreview();
    if (thinkingLinkMode) {
      thinkingSelectionMode = false;
      clearThinkingSelection();
    }
    syncThinkingSelection();
    syncThinkingLinkMode();
  }

  function thinkingShortcutIsEditing(target) {
    if (!target || !target.closest) return false;
    return !!target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
  }

  function hoveredThinkingBlock(canvas) {
    const cards = thinkingBlocks.querySelectorAll(".thinking-block:hover");
    for (let i = cards.length - 1; i >= 0; i--) {
      const card = cards[i];
      const free = !card.classList.contains("thinking-block--nested")
        || card.classList.contains("thinking-block--canvas-child");
      if (!free) continue;
      const block = findThinkingParent(canvas, card.dataset.blockId);
      const parent = block ? findThinkingParent(canvas, block.parentId) : null;
      if (block && isThinkingOrganization(parent)) return block;
    }
    return null;
  }

  function hoveredThinkingDeleteTarget(canvas) {
    const cards = thinkingBlocks.querySelectorAll(".thinking-block:hover");
    for (let i = cards.length - 1; i >= 0; i--) {
      const block = findThinkingParent(canvas, cards[i].dataset.blockId);
      if (block) return block;
    }
    return null;
  }

  function copyThinkingBlocks() {
    const canvas = currentCanvas();
    if (!canvas) return false;
    let roots = selectedThinkingBlocks(canvas);
    if (!roots.length) {
      const hovered = hoveredThinkingBlock(canvas);
      if (hovered) roots = [hovered];
    }
    if (!roots.length) return false;

    const included = {};
    for (let i = 0; i < roots.length; i++) included[roots[i].id] = true;
    let foundChild = true;
    while (foundChild) {
      foundChild = false;
      for (let i = 0; i < canvas.blocks.length; i++) {
        const block = canvas.blocks[i];
        if (!included[block.id] && included[block.parentId]) {
          included[block.id] = true;
          foundChild = true;
        }
      }
    }

    const blocks = [];
    const links = [];
    for (let i = 0; i < canvas.blocks.length; i++) {
      if (included[canvas.blocks[i].id]) {
        const snapshot = JSON.parse(JSON.stringify(canvas.blocks[i]));
        const action = THINKING_ACTION_TYPES.indexOf(snapshot.type) !== -1
          ? thinkingActionItem(canvas.blocks[i]) : null;
        const noteTask = snapshot.type === "note"
          ? thinkingTaskForNote(canvas, canvas.blocks[i]) : null;
        if (action) snapshot.text = snapshot.type === "habit"
          ? action.name || "" : action.text || "";
        if (noteTask) snapshot.text = noteTask.notes || "";
        blocks.push(snapshot);
      }
    }
    for (let i = 0; i < canvas.links.length; i++) {
      if (included[canvas.links[i].from] && included[canvas.links[i].to]) {
        links.push(JSON.parse(JSON.stringify(canvas.links[i])));
      }
    }
    thinkingClipboard = {
      canvasId: canvas.id,
      parentId: roots[0].parentId,
      rootIds: roots.map(function (block) { return block.id; }),
      blocks: blocks,
      links: links
    };
    thinkingPasteCount = 0;
    return true;
  }

  function thinkingClipboardTarget(canvas, viewedCanvas) {
    if (!thinkingClipboard || thinkingClipboard.canvasId !== canvas.id) return viewedCanvas;
    const sourceParent = findThinkingParent(canvas, thinkingClipboard.parentId);
    if (!isThinkingOrganization(sourceParent)
        || (sourceParent.collapsed && sourceParent.id !== viewedCanvasId)) {
      return viewedCanvas;
    }
    if (sourceParent.id === viewedCanvas.id) return sourceParent;
    const card = thinkingBlocks.querySelector('[data-block-id="' + sourceParent.id + '"]');
    const stage = card ? card.querySelector(".thinking-canvas__stage") : null;
    return stage && stage.getClientRects().length ? sourceParent : viewedCanvas;
  }

  function pasteThinkingBlocks() {
    const canvas = currentCanvas();
    const viewedCanvas = currentThinkingCanvasNode();
    if (!canvas || !viewedCanvas || !thinkingClipboard || !thinkingClipboard.blocks.length) {
      return false;
    }
    const target = thinkingClipboardTarget(canvas, viewedCanvas);
    const rootIds = {};
    for (let i = 0; i < thinkingClipboard.rootIds.length; i++) {
      rootIds[thinkingClipboard.rootIds[i]] = true;
    }
    for (let i = 0; i < thinkingClipboard.blocks.length; i++) {
      const copied = thinkingClipboard.blocks[i];
      if (rootIds[copied.id] && !thinkingOrganizationAllows(target, copied)) return false;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < thinkingClipboard.blocks.length; i++) {
      const block = thinkingClipboard.blocks[i];
      if (!rootIds[block.id]) continue;
      const size = thinkingBlockSize(block);
      minX = Math.min(minX, block.x);
      minY = Math.min(minY, block.y);
      maxX = Math.max(maxX, block.x + size.width);
      maxY = Math.max(maxY, block.y + size.height);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return false;

    const sameParent = thinkingClipboard.canvasId === canvas.id
      && thinkingClipboard.parentId === target.id;
    let dx;
    let dy;
    if (sameParent) {
      dx = 32 * (thinkingPasteCount + 1);
      dy = dx;
    } else {
      dx = thinkingViewport.scrollLeft + thinkingViewport.clientWidth / 2
        - (minX + maxX) / 2;
      dy = thinkingViewport.scrollTop + thinkingViewport.clientHeight / 2
        - (minY + maxY) / 2;
    }
    const minimumDx = 18 - minX;
    const maximumDx = THINKING_WORLD_WIDTH - 18 - maxX;
    const minimumDy = 18 - minY;
    const maximumDy = THINKING_WORLD_HEIGHT - 18 - maxY;
    if (minimumDx <= maximumDx) dx = Math.max(minimumDx, Math.min(maximumDx, dx));
    if (minimumDy <= maximumDy) dy = Math.max(minimumDy, Math.min(maximumDy, dy));

    const idMap = {};
    for (let i = 0; i < thinkingClipboard.blocks.length; i++) {
      idMap[thinkingClipboard.blocks[i].id] = thinkingId("b");
    }
    const pastedRoots = [];
    const pastedBlocks = [];
    for (let i = 0; i < thinkingClipboard.blocks.length; i++) {
      const source = thinkingClipboard.blocks[i];
      const clone = JSON.parse(JSON.stringify(source));
      clone.id = idMap[source.id];
      if (rootIds[source.id]) {
        clone.parentId = target.id;
        clone.x += dx;
        clone.y += dy;
        if (target.type === "folder") {
          clone.folderOrder = nextThinkingFolderOrder(canvas, target);
          delete clone.stuckToId;
          delete clone.stuckSide;
        } else {
          delete clone.folderOrder;
        }
        pastedRoots.push(clone);
      } else {
        clone.parentId = idMap[source.parentId];
      }
      if (target.type !== "folder" && source.stuckToId && idMap[source.stuckToId]) {
        clone.stuckToId = idMap[source.stuckToId];
      } else {
        delete clone.stuckToId;
        delete clone.stuckSide;
      }
      if (THINKING_ACTION_TYPES.indexOf(clone.type) !== -1) {
        delete clone.taskId;
        delete clone.subtaskId;
        delete clone.eventId;
        delete clone.habitId;
        linkThinkingBlockToNewAction(clone, clone.text);
      }
      if (clone.type === "loop") delete clone.loopRun;
      canvas.blocks.push(clone);
      pastedBlocks.push(clone);
    }
    for (let i = 0; i < thinkingClipboard.links.length; i++) {
      const sourceLink = thinkingClipboard.links[i];
      canvas.links.push({
        id: thinkingId("l"),
        from: idMap[sourceLink.from],
        to: idMap[sourceLink.to]
      });
    }

    for (let i = 0; i < pastedBlocks.length; i++) {
      const clone = pastedBlocks[i];
      const parent = findThinkingParent(canvas, clone.parentId);
      if (parent && parent.type === "folder") {
        if (clone.folderOrder == null) clone.folderOrder = nextThinkingFolderOrder(canvas, parent);
        delete clone.stuckToId;
        delete clone.stuckSide;
      }
      if (clone.type === "task" && parent && parent.type === "task") {
        syncThinkingBlockTaskPlacement(canvas, clone, parent);
      }
    }
    for (let i = 0; i < pastedBlocks.length; i++) {
      const clone = pastedBlocks[i];
      const parent = findThinkingParent(canvas, clone.parentId);
      if (clone.type !== "note" || !parent || parent.type !== "task") continue;
      const task = thinkingTaskItem(parent);
      if (task) task.notes = clone.text || "";
    }

    thinkingSelectedIds = {};
    for (let i = 0; i < pastedRoots.length; i++) {
      thinkingSelectedIds[pastedRoots[i].id] = true;
      const size = thinkingBlockSize(pastedRoots[i]);
      growThinkingCanvasForBlock(canvas, pastedRoots[i], size.width, size.height);
    }
    thinkingSelectionParentId = target.id;
    thinkingPasteCount++;
    setThinkingSelectionMode(true);
    touchCanvas(canvas);
    refreshThinkingActionViews();
    renderThinkingCanvas(canvas);
    if (target.type === "folder") {
      requestAnimationFrame(function () {
        const folderCard = thinkingBlocks.querySelector('[data-block-id="' + target.id + '"]');
        if (folderCard) growThinkingCanvasForBlock(canvas, target,
          folderCard.offsetWidth, folderCard.offsetHeight);
      });
    }
    return true;
  }

  function toggleThinkingBlockSelection(canvas, block) {
    const parent = findThinkingParent(canvas, block.parentId);
    if (!isThinkingOrganization(parent)) return;
    if (thinkingSelectionParentId && thinkingSelectionParentId !== block.parentId) {
      clearThinkingSelection();
    }
    thinkingSelectionParentId = block.parentId;
    if (thinkingSelectedIds[block.id]) delete thinkingSelectedIds[block.id];
    else thinkingSelectedIds[block.id] = true;
    syncThinkingSelection();
  }

  function beginThinkingSelectionBox(event, canvas, parentId, captureElement) {
    if (!thinkingSelectionMode || !canvas || !parentId) return;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const baseIds = {};
    if (additive && thinkingSelectionParentId === parentId) {
      for (const id in thinkingSelectedIds) baseIds[id] = true;
    } else {
      clearThinkingSelection();
    }
    thinkingSelectionParentId = parentId;
    syncThinkingSelection();
    thinkingSelectionClickSuppressed = true;
    captureElement.setPointerCapture(event.pointerId);
    const pointerId = event.pointerId;
    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    let box = null;
    const move = function (moveEvent) {
      if (moveEvent.pointerId !== pointerId) return;
      const left = Math.min(start.x, moveEvent.clientX);
      const top = Math.min(start.y, moveEvent.clientY);
      const right = Math.max(start.x, moveEvent.clientX);
      const bottom = Math.max(start.y, moveEvent.clientY);
      if (!moved && Math.hypot(moveEvent.clientX - start.x,
        moveEvent.clientY - start.y) < 4) return;
      moveEvent.preventDefault();
      moved = true;
      if (!box) {
        box = document.createElement("div");
        box.className = "thinking-selection-box";
        document.body.appendChild(box);
      }
      box.style.left = left + "px";
      box.style.top = top + "px";
      box.style.width = right - left + "px";
      box.style.height = bottom - top + "px";
      const nextIds = {};
      for (const id in baseIds) nextIds[id] = true;
      const cards = thinkingBlocks.querySelectorAll(".thinking-block");
      for (let i = 0; i < cards.length; i++) {
        const block = findThinkingParent(canvas, cards[i].dataset.blockId);
        if (!block || block.parentId !== parentId) continue;
        const rect = cards[i].getBoundingClientRect();
        if (rect.right >= left && rect.left <= right
            && rect.bottom >= top && rect.top <= bottom) nextIds[block.id] = true;
      }
      thinkingSelectedIds = nextIds;
      syncThinkingSelection();
    };
    const up = function (upEvent) {
      if (upEvent.pointerId !== pointerId) return;
      captureElement.removeEventListener("pointermove", move);
      captureElement.removeEventListener("pointerup", up);
      captureElement.removeEventListener("pointercancel", up);
      if (box) box.remove();
      if (upEvent.type === "pointercancel") {
        thinkingSelectedIds = baseIds;
        if (!Object.keys(baseIds).length) thinkingSelectionParentId = null;
      } else if (!moved && !additive) {
        clearThinkingSelection();
      }
      syncThinkingSelection();
      setTimeout(function () { thinkingSelectionClickSuppressed = false; }, 260);
    };
    captureElement.addEventListener("pointermove", move, { passive: false });
    captureElement.addEventListener("pointerup", up);
    captureElement.addEventListener("pointercancel", up);
  }

  function hitsThinkingSelectionCard(target, card) {
    let pointed = target.closest(".thinking-block");
    while (pointed && pointed !== card) {
      if (!pointed.classList.contains("thinking-block--nested")
          || pointed.classList.contains("thinking-block--canvas-child")) return false;
      pointed = pointed.parentElement ? pointed.parentElement.closest(".thinking-block") : null;
    }
    return pointed === card;
  }

  function armThinkingSelection(card, head, block, canvas, contained) {
    if (contained) return;
    card.addEventListener("dblclick", function (event) {
      if (!thinkingSelectionMode || !hitsThinkingSelectionCard(event.target, card)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    card.addEventListener("click", function (event) {
      if (!thinkingSelectionMode || !hitsThinkingSelectionCard(event.target, card)) return;
      if (event.target.closest(".thinking-block__delete")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (thinkingSelectionClickSuppressed || card.dataset.selectionDragged) return;
      toggleThinkingBlockSelection(canvas, block);
    }, true);
    head.addEventListener("pointerdown", function (event) {
      if (!thinkingSelectionMode || !thinkingSelectedIds[block.id] || event.button !== 0
          || event.target.closest("button, input, textarea, select")) return;
      event.preventDefault();
      event.stopPropagation();
      head.setPointerCapture(event.pointerId);
      const selected = selectedThinkingBlocks(canvas);
      const starts = [];
      for (let i = 0; i < selected.length; i++) {
        const selectedCard = thinkingBlocks.querySelector('[data-block-id="'
          + selected[i].id + '"]');
        if (!selectedCard) continue;
        starts.push({ block: selected[i], card: selectedCard,
          x: selected[i].x, y: selected[i].y,
          left: selectedCard.offsetLeft, top: selectedCard.offsetTop,
          width: selectedCard.offsetWidth, height: selectedCard.offsetHeight });
      }
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let leftEdge = Infinity;
      let topEdge = Infinity;
      let rightEdge = -Infinity;
      let bottomEdge = -Infinity;
      for (let i = 0; i < starts.length; i++) {
        leftEdge = Math.min(leftEdge, starts[i].x);
        topEdge = Math.min(topEdge, starts[i].y);
        rightEdge = Math.max(rightEdge, starts[i].x + starts[i].width);
        bottomEdge = Math.max(bottomEdge, starts[i].y + starts[i].height);
      }
      let moved = false;
      let dropCanvas = null;
      let stickSnapshot = null;
      const move = function (moveEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        const rawDx = moveEvent.clientX - startX;
        const rawDy = moveEvent.clientY - startY;
        const dx = Math.max(18 - leftEdge,
          Math.min(THINKING_WORLD_WIDTH - 18 - rightEdge, rawDx));
        const dy = Math.max(18 - topEdge,
          Math.min(THINKING_WORLD_HEIGHT - 18 - bottomEdge, rawDy));
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moveEvent.preventDefault();
        if (!moved) {
          thinkingDragging = true;
          stickSnapshot = thinkingStickSnapshot(canvas);
          const detached = {};
          for (let i = 0; i < selected.length; i++) detached[selected[i].id] = true;
          detachThinkingIdsFromSticks(canvas, detached);
          layoutVisibleThinkingStuckBlocks(canvas);
          showThinkingTrash();
          thinkingBoard.classList.add("is-combining");
          markThinkingSelectionCanvasOptions(canvas, selected, true);
        }
        moved = true;
        for (let i = 0; i < starts.length; i++) {
          starts[i].block.x = starts[i].x + dx;
          starts[i].block.y = starts[i].y + dy;
          starts[i].card.style.left = starts[i].left + dx + "px";
          starts[i].card.style.top = starts[i].top + dy + "px";
          starts[i].card.classList.add("is-group-dragging");
        }
        clearThinkingDropTargets();
        dropCanvas = thinkingSelectionCanvasDropParent(moveEvent.clientX,
          moveEvent.clientY, selected, canvas);
        if (dropCanvas) dropCanvas.classList.add("is-drop-target");
        thinkingTrash.classList.toggle("is-active",
          pointInsideThinkingTrash(moveEvent.clientX, moveEvent.clientY));
        requestThinkingLinks(canvas);
      };
      const up = function (upEvent) {
        if (upEvent.pointerId !== pointerId) return;
        head.removeEventListener("pointermove", move);
        head.removeEventListener("pointerup", up);
        head.removeEventListener("pointercancel", up);
        const cancelled = upEvent.type === "pointercancel";
        const deleted = moved && !cancelled
          && pointInsideThinkingTrash(upEvent.clientX, upEvent.clientY);
        hideThinkingTrash();
        thinkingBoard.classList.remove("is-combining");
        markThinkingSelectionCanvasOptions(canvas, selected, false);
        clearThinkingDropTargets();
        for (let i = 0; i < starts.length; i++) {
          starts[i].card.classList.remove("is-group-dragging");
          if (cancelled || deleted) {
            starts[i].block.x = starts[i].x;
            starts[i].block.y = starts[i].y;
          }
        }
        thinkingDragging = false;
        if (!moved) return;
        if (cancelled) restoreThinkingStickSnapshot(canvas, stickSnapshot);
        if (deleted) {
          restoreThinkingStickSnapshot(canvas, stickSnapshot);
          removeThinkingSelection(canvas);
          return;
        }
        card.dataset.selectionDragged = "true";
        if (!cancelled) {
          dropCanvas = thinkingSelectionCanvasDropParent(upEvent.clientX,
            upEvent.clientY, selected, canvas);
          if (!integrateThinkingSelectionInCanvas(canvas, starts, dropCanvas)) {
            for (let i = 0; i < starts.length; i++) {
              growThinkingCanvasForBlock(canvas, starts[i].block,
                starts[i].width, starts[i].height);
            }
          }
          touchCanvas(canvas);
        }
        renderThinkingCanvas(canvas);
        setTimeout(function () { delete card.dataset.selectionDragged; }, 260);
      };
      head.addEventListener("pointermove", move, { passive: false });
      head.addEventListener("pointerup", up);
      head.addEventListener("pointercancel", up);
    });
  }

  function putThinkingSelectionInCanvas() {
    const canvas = currentCanvas();
    const selected = selectedThinkingBlocks(canvas);
    if (!canvas || !selected.length || !thinkingSelectionParentId) return;
    const parentId = thinkingSelectionParentId;
    const detached = {};
    for (let i = 0; i < selected.length; i++) detached[selected[i].id] = true;
    detachThinkingIdsFromSticks(canvas, detached);
    layoutVisibleThinkingStuckBlocks(canvas);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < selected.length; i++) {
      const card = thinkingBlocks.querySelector('[data-block-id="' + selected[i].id + '"]');
      const size = thinkingBlockSize(selected[i], card ? card.offsetWidth : null,
        card ? card.offsetHeight : null);
      minX = Math.min(minX, selected[i].x);
      minY = Math.min(minY, selected[i].y);
      maxX = Math.max(maxX, selected[i].x + size.width);
      maxY = Math.max(maxY, selected[i].y + size.height);
    }
    const padding = 28;
    const stageWidth = Math.max(360, maxX - minX + padding * 2);
    const stageHeight = Math.max(220, maxY - minY + padding * 2);
    const previewX = minX - padding;
    const previewY = minY - padding;
    const grouped = {
      id: thinkingId("b"), type: "canvas", title: "", text: "",
      parentId: parentId,
      x: Math.max(18, previewX - 10),
      y: Math.max(18, previewY - 28),
      icon: "target",
      canvasWidth: stageWidth + 20,
      canvasHeight: stageHeight,
      previewX: previewX,
      previewY: previewY,
      cameraX: previewX + stageWidth / 2 - thinkingViewport.clientWidth / 2,
      cameraY: previewY + stageHeight / 2 - thinkingViewport.clientHeight / 2,
      collapsed: false
    };
    for (let i = 0; i < selected.length; i++) selected[i].parentId = grouped.id;
    canvas.blocks.push(grouped);
    growThinkingCanvasForBlock(canvas, grouped, grouped.canvasWidth,
      grouped.canvasHeight + THINKING_CANVAS_CHROME);
    thinkingSelectedIds = {};
    thinkingSelectedIds[grouped.id] = true;
    thinkingSelectionParentId = parentId;
    touchCanvas(canvas);
    renderThinkingCanvas(canvas);
  }

  function thinkingTypeKey(type) {
    return "block" + type.charAt(0).toUpperCase() + type.slice(1);
  }

  function thinkingPlaceholderKey(type) {
    return "blockPlaceholder" + type.charAt(0).toUpperCase() + type.slice(1);
  }

  function thinkingTypeIcon(type) {
    if (type === "problem") return "target";
    if (type === "canvas") return "canvas";
    if (type === "folder") return "folder";
    if (type === "document") return "document";
    if (type === "planner") return "planner";
    if (type === "logbook") return "logbook";
    if (type === "solution") return "bulb";
    if (type === "answer") return "reply";       // shares the colour, not the glyph
    if (type === "example") return "flag";
    if (type === "question") return "compass";
    if (type === "idea") return "spark";
    if (type === "task") return "check";
    if (type === "event") return "calendar";
    if (type === "habit") return "habit";
    if (type === "step") return "check";
    if (type === "journal") return "note";
    if (type === "loop") return "loop";
    if (type === "condition") return "condition";
    if (type === "note") return "note";
    if (type === "text") return "lines";
    return "spark";
  }

  function thinkingIconSvg(name) {
    if (name === "logbook") {
      return '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">'
        + '<path d="M9 8a3 3 0 0 1 3-3h26a3 3 0 0 1 3 3v32a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3Z" fill="currentColor" opacity=".15"/>'
        + '<path d="M12 5h26a3 3 0 0 1 3 3v32a3 3 0 0 1-3 3H12" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>'
        + '<path d="M12 5a4 4 0 0 0 0 8h4V5Z" fill="currentColor"/>'
        // one path per ring, so the coil can turn as a ripple down the spine
        + '<path class="ti-coil ti-coil--1" d="M12 13a4 4 0 0 1 0-8" stroke="currentColor" stroke-width="2.6"/>'
        + '<path class="ti-coil ti-coil--2" d="M12 24a4 4 0 0 1 0-8" stroke="currentColor" stroke-width="2.6"/>'
        + '<path class="ti-coil ti-coil--3" d="M12 35a4 4 0 0 1 0-8" stroke="currentColor" stroke-width="2.6"/>'
        + '<path class="ti-coil ti-coil--4" d="M12 43a4 4 0 0 1 0-8" stroke="currentColor" stroke-width="2.6"/>'
        + '<path d="M22 15h13M22 23h13M22 31h9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
        + '</svg>';
    }
    if (name === "planner") {
      return '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">'
        + '<rect x="6" y="8" width="36" height="34" rx="7" fill="currentColor" opacity=".15"/>'
        + '<rect x="8" y="10" width="32" height="29" rx="5" stroke="currentColor" stroke-width="2.6"/>'
        + '<path d="M15 6v8M33 6v8M8 18h32" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'
        + '<path class="ti-day" d="M16 25h6v6h-6z" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>'
        + '<path class="ti-plan-line ti-plan-line--1" d="M27 25h6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
        + '<path class="ti-plan-line ti-plan-line--2" d="M27 31h6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
        + '</svg>';
    }
    if (name === "folder") {
      return '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">'
        + '<path d="M5 13a4 4 0 0 1 4-4h10l4.5 4.5H39a4 4 0 0 1 4 4V38a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" fill="currentColor" opacity=".46"/>'
        + '<path class="ti-fold-front" d="M5 21.5A3.5 3.5 0 0 1 8.5 18h31a3.5 3.5 0 0 1 3.4 4.3l-4 16.8A3.8 3.8 0 0 1 35.2 42H8.8A3.8 3.8 0 0 1 5 38.2Z" fill="currentColor"/>'
        + '<path class="ti-fold-tab" d="M9 14h11.5l2.8 3H39" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".72"/>'
        + '</svg>';
    }
    if (name === "canvas") {
      return '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">'
        + '<rect x="5" y="7" width="38" height="34" rx="5" fill="currentColor" opacity=".16"/>'
        + '<rect x="7" y="9" width="34" height="30" rx="4" stroke="currentColor" stroke-width="2.6"/>'
        + '<path d="M13 18h22M13 24h14M13 30h18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'
        + '<circle class="ti-chip" cx="35" cy="30" r="3.2" fill="currentColor"/>'
        + '</svg>';
    }
    if (name === "document") {
      return '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">'
        + '<path d="M12 5h25a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4H12Z" fill="currentColor" opacity=".17"/>'
        + '<path d="M12 5h25a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4H12Z" stroke="currentColor" stroke-width="2.5"/>'
        // split so each rule can draw itself; pathLength lets the dash run
        // from end to end without anyone measuring the path
        + '<path class="ti-doc-line ti-doc-line--1" pathLength="1" d="M19 15h15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>'
        + '<path class="ti-doc-line ti-doc-line--2" pathLength="1" d="M19 22h15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>'
        + '<path class="ti-doc-line ti-doc-line--3" pathLength="1" d="M19 29h11" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>'
        + '<path class="ti-doc-line ti-doc-line--4" pathLength="1" d="M19 36h13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>'
        + '<path class="ti-doc-line ti-doc-line--1" pathLength="1" d="M7 12h8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>'
        + '<path class="ti-doc-line ti-doc-line--2" pathLength="1" d="M7 21h8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>'
        + '<path class="ti-doc-line ti-doc-line--3" pathLength="1" d="M7 30h8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>'
        + '<path class="ti-doc-line ti-doc-line--4" pathLength="1" d="M7 39h8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>'
        + '</svg>';
    }
    let paths = "";
    if (name === "target") {
      paths = '<g class="ti-rings"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></g>'
        + '<g class="ti-arrow"><path d="m15 9 5-5M16 4h4v4"/></g>';
    } else if (name === "spark") {
      paths = '<g class="ti-star-big"><path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6Z"/></g>'
        + '<g class="ti-star-mid"><path vector-effect="non-scaling-stroke" d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6Z"/></g>'
        + '<g class="ti-star-new"><path vector-effect="non-scaling-stroke" d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6Z"/></g>';
    } else if (name === "bulb") {
      paths = '<g class="ti-rays"><path d="M12 1.5v1.6M4.4 4.4l1.1 1.1M19.6 4.4l-1.1 1.1M2 11h1.6M20.4 11H22"/></g>'
        + '<g class="ti-glass"><path d="M8.5 15.5C7 14.3 6 12.5 6 10.5a6 6 0 1 1 12 0c0 2-1 3.8-2.5 5-.6.5-.8 1-.8 1.5H9.3c0-.5-.2-1-.8-1.5Z"/></g>'
        + '<g class="ti-wire"><path stroke-width="1.15" d="M10.5 15.4v-2.5M13.5 15.4v-2.5'
        + 'M10.5 12.9l.75-1.6.75 1.6.75-1.6.75 1.6"/></g>'
        + '<path d="M9 18h6M10 21h4"/>';
    } else if (name === "flag") {
      paths = '<path d="M6 21V4"/><g class="ti-flag"><path d="M6 5h11l-2 3 2 3H6"/></g>';
    } else if (name === "compass") {
      paths = '<circle cx="12" cy="12" r="9"/><g class="ti-needle"><path d="m15.5 8.5-2 5-5 2 2-5Z"/></g>';
    } else if (name === "check") {
      paths = '<rect x="3" y="3" width="18" height="18" rx="5"/>'
        + '<path d="m7 12 3 3 7-7"/>';
    } else if (name === "calendar") {
      paths = '<rect x="3" y="5" width="18" height="16" rx="4"/>'
        + '<path d="M7 3v4M17 3v4M3 10h18M8 14h3v3H8Z"/>';
    } else if (name === "project") {
      paths = '<path d="M3 7a3 3 0 0 1 3-3h4l2 3h6a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z"/>'
        + '<path d="m8 15 2 2 5-5"/>';
    } else if (name === "habit") {
      paths = '<path d="M19 5c-8 0-13 4-13 10 0 3 2 5 5 5 6 0 9-7 8-15Z"/>'
        + '<path d="M5 21c2-6 6-9 11-12"/>';
    } else if (name === "loop") {
      paths = '<path d="M18 7a8 8 0 1 0 1 9"/><path d="M18 3v4h-4"/>'
        + '<path d="M7 9v6M7 9h3M7 15h3"/>';
    } else if (name === "condition") {
      paths = '<path d="M5 4v16M5 4h14M5 20h14"/>'
        + '<path d="m10 12 2 2 4-4"/>';
    } else if (name === "reply") {
      paths = '<g class="ti-reply"><path d="M10 8V4L3 11l7 7v-4c4.5 0 7.6 1.5 10 5-1-5.5-4-10-10-11Z"/></g>';
    } else if (name === "note") {
      paths = '<g class="ti-sheet" vector-effect="non-scaling-stroke">'
        + '<path vector-effect="non-scaling-stroke" d="M6 3h8l4 4v14H6Z"/>'
        + '<path vector-effect="non-scaling-stroke" d="M14 3v4h4"/>'
        + '<path vector-effect="non-scaling-stroke" d="M9.5 12h5M9.5 16h3"/></g>';
    } else if (name === "lines") {
      paths = '<path class="ti-line ti-line--1" vector-effect="non-scaling-stroke" d="M5 7h14"/>'
        + '<path class="ti-line ti-line--2" vector-effect="non-scaling-stroke" d="M5 12h10"/>'
        + '<path class="ti-line ti-line--3" vector-effect="non-scaling-stroke" d="M5 17h6"/>';
    } else {
      paths = '<path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z"/>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }

  function openThinking() {
    setThinkingLinkToolMode(false);
    setThinkingSelectionMode(false);
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
    setThinkingLinkToolMode(false);
    setThinkingSelectionMode(false);
    thinkingView.classList.remove("is-open");
    openCanvasId = null;
    viewedCanvasId = null;
    thinkingToolContext = null;
    thinkingLinkFrom = null;
    setTimeout(function () {
      thinkingView.hidden = true;
      document.body.insertBefore(fieldCanvas, document.getElementById("decor"));
    }, 280);
  }

  /* Take the object a planning block stood for out of the app, quietly: its text
     is already on its way into the block's next shape, so this is a move. */
  function dropPlanningItem(block) {
    if (block.type === "step") return;   // it stands for itself, nothing to remove
    const lists = { task: "tasks", event: "events", habit: "habits" };
    const listName = lists[block.type];
    const id = block.type === "task" ? block.taskId
      : block.type === "event" ? block.eventId : block.habitId;
    if (!listName || !id || block.subtaskId) return;   // a subtask belongs to its task
    const items = state[listName];
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) { items.splice(i, 1); break; }
    }
  }
  function makeThinkingCanvas() {
    const now = Date.now();
    const canvas = {
      id: thinkingId("c"),
      type: "canvas",
      thinkingTreeVersion: 16,
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
    return canvas;
  }

  function openThinkingCanvas(id) {
    const canvas = findCanvas(id);
    if (!canvas) return;
    setThinkingLinkToolMode(false);
    setThinkingSelectionMode(false);
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
      if (isThinkingOrganization(branch)) return branch;
    }
    return null;
  }

  function syncThinkingCanvasHeader(tree, canvasNode) {
    const parent = thinkingCanvasParent(tree, canvasNode);
    thinkingName.disabled = !parent;
    thinkingName.value = parent ? thinkingOrganizationTitle(canvasNode) : "";
    const back = document.getElementById("thinkingBoardBack");
    back.disabled = !parent;
    back.setAttribute("aria-label", translate(parent ? "thinkingCloseCanvas" : "thinkingBaseCanvas"));
    thinkingName.placeholder = translate(parent ? "thinkingUntitled" : "thinkingBaseCanvas");
    const tools = document.querySelectorAll(".thinking-tool[data-block-type]");
    for (let i = 0; i < tools.length; i++) {
      tools[i].disabled = !thinkingOrganizationAllows(canvasNode, {
        type: tools[i].dataset.blockType
      });
    }
    syncThinkingToolSections(canvasNode);
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
    if (canvasNode.type === "folder") return;
    const width = Math.max(220, (canvasNode.canvasWidth || 650) - 20);
    const height = canvasNode.canvasHeight || 330;
    canvasNode.previewX = canvasNode.cameraX + thinkingViewport.clientWidth / 2 - width / 2;
    canvasNode.previewY = canvasNode.cameraY + thinkingViewport.clientHeight / 2 - height / 2;
  }

  function navigateThinkingCanvas(id, transition) {
    const tree = currentCanvas();
    const canvasNode = tree ? findThinkingParent(tree, id) : null;
    if (!tree || !isThinkingOrganization(canvasNode)) return;
    const current = currentThinkingCanvasNode();
    if (current) {
      current.cameraX = thinkingViewport.scrollLeft;
      current.cameraY = thinkingViewport.scrollTop;
      syncThinkingCanvasPreview(current);
    }
    prepareThinkingWorld(tree, canvasNode);
    setThinkingLinkToolMode(false);
    setThinkingSelectionMode(false);
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

  function thinkingDocumentFormatIcon(command) {
    const paths = {
      bold: '<path d="M7 4h6.5a4 4 0 0 1 0 8H7Z"/><path d="M7 12h7a4 4 0 0 1 0 8H7Z"/>',
      italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
      underline: '<path d="M6 3v7a6 6 0 0 0 12 0V3M4 21h16"/>',
      hilite: '<path d="m14 4 6 6-8.5 8.5H5.5v-6Z"/><path d="m11 7 6 6"/>'
        + '<path class="thinking-document-tool__swatch" d="M4 21h16"/>',
      insertUnorderedList: '<path d="M9 6h11M9 12h11M9 18h11"/>'
        + '<path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="3"/>',
      insertOrderedList: '<path d="M10 6h10M10 12h10M10 18h10"/>'
        + '<path d="M4 4h1v4M3.5 15.5c.3-.9 2.5-1.1 2.5.3 0 1-2.5 2.1-2.5 3.7H6"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + (paths[command] || "") + '</svg>';
  }

  function noteResolvedColor(value) {
    const probe = document.createElement("span");
    probe.style.position = "fixed";
    probe.style.pointerEvents = "none";
    probe.style.backgroundColor = value;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = resolved;
    context.fillRect(0, 0, 1, 1);
    const pixel = context.getImageData(0, 0, 1, 1).data;
    return pixel[3] === 255
      ? "rgb(" + pixel[0] + "," + pixel[1] + "," + pixel[2] + ")"
      : "rgba(" + pixel[0] + "," + pixel[1] + "," + pixel[2] + ","
        + (pixel[3] / 255).toFixed(3) + ")";
  }

  function noteHighlightColor() {
    return noteResolvedColor("var(--note-highlight)");
  }

  function normalizeNoteHighlights(body, allBackgrounds) {
    const styled = body.querySelectorAll("[style]");
    let changed = false;
    for (let i = 0; i < styled.length; i++) {
      const inline = styled[i].style.backgroundColor;
      if (!inline || inline === "var(--note-highlight)") continue;
      const normalized = inline.toLowerCase().replace(/\s/g, "");
      if (normalized === "transparent" || normalized === "rgba(0,0,0,0)") continue;
      const legacy = normalized === "#ffe08a" || normalized === "rgb(255,224,138)"
        || normalized === "rgba(255,224,138,1)";
      if (!allBackgrounds && !legacy) continue;
      styled[i].style.backgroundColor = "var(--note-highlight)";
      changed = true;
    }
    return changed;
  }

  function materializeNoteHighlights(body) {
    const color = noteHighlightColor();
    const styled = body.querySelectorAll("[style]");
    for (let i = 0; i < styled.length; i++) {
      if (styled[i].style.backgroundColor === "var(--note-highlight)") {
        styled[i].style.backgroundColor = color;
      }
    }
  }

  function noteInlineIsHighlight(inline) {
    if (!inline) return false;
    const normalized = inline.toLowerCase().replace(/\s/g, "");
    return normalized === "var(--note-highlight)" || normalized === "#ffe08a"
      || normalized === "rgb(255,224,138)" || normalized === "rgba(255,224,138,1)";
  }

  function liftNoteTransparentRuns(body) {
    const styled = body.querySelectorAll("[style]");
    let changed = false;
    for (let i = 0; i < styled.length; i++) {
      const transparent = styled[i];
      const background = transparent.style.backgroundColor.toLowerCase().replace(/\s/g, "");
      if (background !== "transparent" && background !== "rgba(0,0,0,0)") continue;
      let highlight = transparent.parentElement;
      while (highlight && highlight !== body
          && (!highlight.style || !noteInlineIsHighlight(highlight.style.backgroundColor))) {
        highlight = highlight.parentElement;
      }
      if (!highlight || highlight === body || !highlight.parentNode) continue;
      const selection = window.getSelection();
      const moveCaret = !!(selection && selection.isCollapsed
        && transparent.contains(selection.anchorNode));

      const tailRange = document.createRange();
      tailRange.setStartAfter(transparent);
      tailRange.setEnd(highlight, highlight.childNodes.length);
      const tail = tailRange.extractContents();
      const tailHasContent = !!tail.textContent || !!tail.querySelector("br, img, svg");
      const tailHighlight = tailHasContent ? highlight.cloneNode(false) : null;
      if (tailHighlight) tailHighlight.appendChild(tail);

      let content = document.createDocumentFragment();
      while (transparent.firstChild) content.appendChild(transparent.firstChild);
      let ancestor = transparent.parentElement;
      while (ancestor && ancestor !== highlight) {
        const shell = ancestor.cloneNode(false);
        shell.style.removeProperty("background-color");
        if (!shell.getAttribute("style")) shell.removeAttribute("style");
        shell.appendChild(content);
        content = document.createDocumentFragment();
        content.appendChild(shell);
        ancestor = ancestor.parentElement;
      }
      const caretTarget = content.lastChild;
      transparent.remove();

      const parent = highlight.parentNode;
      const next = highlight.nextSibling;
      parent.insertBefore(content, next);
      if (tailHighlight) parent.insertBefore(tailHighlight, next);
      if (!highlight.textContent && !highlight.querySelector("br, img, svg")) highlight.remove();
      if (moveCaret && caretTarget) {
        const outside = document.createRange();
        outside.selectNodeContents(caretTarget);
        outside.collapse(false);
        selection.removeAllRanges();
        selection.addRange(outside);
      }
      changed = true;
    }
    return changed;
  }

  function exitNoteHighlightAtCaret(body) {
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed || !selection.rangeCount) return false;
    const caret = selection.getRangeAt(0);
    let highlight = caret.startContainer.nodeType === Node.ELEMENT_NODE
      ? caret.startContainer : caret.startContainer.parentElement;
    while (highlight && highlight !== body
        && (!highlight.style || !noteInlineIsHighlight(highlight.style.backgroundColor))) {
      highlight = highlight.parentElement;
    }
    if (!highlight || highlight === body || !highlight.parentNode) return false;

    const tailRange = document.createRange();
    tailRange.setStart(caret.startContainer, caret.startOffset);
    tailRange.setEnd(highlight, highlight.childNodes.length);
    const tail = tailRange.extractContents();
    const tailHasContent = !!tail.textContent || !!tail.querySelector("br, img, svg");
    const tailHighlight = tailHasContent ? highlight.cloneNode(false) : null;
    if (tailHighlight) tailHighlight.appendChild(tail);

    const boundaryShell = highlight.cloneNode(false);
    boundaryShell.style.removeProperty("background-color");
    if (!boundaryShell.getAttribute("style")) boundaryShell.removeAttribute("style");
    const keepShell = boundaryShell.tagName !== "SPAN" || boundaryShell.attributes.length > 0;
    const boundaryMarker = document.createElement("span");
    boundaryMarker.dataset.noteHighlightBoundary = "1";
    boundaryMarker.setAttribute("aria-hidden", "true");
    const boundary = keepShell ? boundaryShell : boundaryMarker;
    if (keepShell) boundaryShell.appendChild(boundaryMarker);

    const parent = highlight.parentNode;
    const next = highlight.nextSibling;
    parent.insertBefore(boundary, next);
    if (tailHighlight) parent.insertBefore(tailHighlight, next);
    if (!highlight.textContent && !highlight.querySelector("br, img, svg")) highlight.remove();

    const outside = document.createRange();
    outside.setStartAfter(boundaryMarker);
    outside.collapse(true);
    selection.removeAllRanges();
    selection.addRange(outside);
    return true;
  }

  function thinkingDocumentHighlightActive(body) {
    try {
      const selection = window.getSelection();
      const commandColor = noteResolvedColor(
        String(document.queryCommandValue("hiliteColor") || "transparent"));
      const commandActive = commandColor === noteHighlightColor()
        || commandColor === noteResolvedColor("#ffe08a");
      /* With a caret there is no selected node to inspect: Firefox stores a
         pending typing style. Its command value is the source of truth, even
         when the caret still lives inside the previous highlighted span. */
      if (selection && selection.isCollapsed) return commandActive;
      if (commandActive) return true;
      const highlightedAncestor = function (node) {
        let element = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
        while (element && element !== body) {
          if (element.style && noteInlineIsHighlight(element.style.backgroundColor)) return true;
          element = element.parentElement;
        }
        return false;
      };
      if (selection && highlightedAncestor(selection.anchorNode)
          && highlightedAncestor(selection.focusNode)) return true;
      if (selection && selection.rangeCount) {
        const range = selection.getRangeAt(0);
        const styled = body.querySelectorAll("[style]");
        for (let i = 0; i < styled.length; i++) {
          if (noteInlineIsHighlight(styled[i].style.backgroundColor)
              && range.intersectsNode(styled[i])) return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  function applyThinkingDocumentFormat(command, body, highlightWasActive) {
    body.focus();
    if (command === "hilite") {
      document.execCommand("styleWithCSS", false, true);
      const active = highlightWasActive == null
        ? thinkingDocumentHighlightActive(body) : highlightWasActive;
      if (active) {
        exitNoteHighlightAtCaret(body);
        materializeNoteHighlights(body);
      }
      document.execCommand("hiliteColor", false, active ? "transparent" : noteHighlightColor());
      normalizeNoteHighlights(body, true);
      return !active;
    } else {
      document.execCommand(command, false, null);
    }
    return null;
  }

  function createThinkingDocumentSheet(tree, documentNode) {
    const sheetWidth = Math.min(820, Math.max(620, thinkingViewport.clientWidth - 160));
    if (documentNode.sheetX == null) {
      documentNode.sheetX = documentNode.cameraX
        + thinkingViewport.clientWidth / 2 - sheetWidth / 2;
    }
    if (documentNode.sheetY == null) documentNode.sheetY = documentNode.cameraY + 56;

    const sheet = document.createElement("section");
    sheet.className = "thinking-document-sheet";
    sheet.style.left = documentNode.sheetX + "px";
    sheet.style.top = documentNode.sheetY + "px";
    sheet.style.width = sheetWidth + "px";

    const toolbar = document.createElement("div");
    toolbar.className = "thinking-document-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", translate("thinkingDocumentFormatting"));
    const tools = [
      { command: "bold", label: "boldAria" },
      { command: "italic", label: "italicAria" },
      { command: "underline", label: "underlineAria" },
      { command: "hilite", label: "highlightAria" },
      { command: "insertUnorderedList", label: "thinkingBulletsAria", separated: true },
      { command: "insertOrderedList", label: "thinkingNumberedAria" }
    ];

    const body = document.createElement("div");
    body.className = "thinking-document-body";
    body.contentEditable = "true";
    body.setAttribute("data-placeholder", translate("thinkingDocumentPlaceholder"));
    body.innerHTML = documentNode.documentHtml || "";
    const liftedLegacyHighlight = liftNoteTransparentRuns(body);
    const normalizedLegacyHighlight = normalizeNoteHighlights(body, false);
    if (liftedLegacyHighlight || normalizedLegacyHighlight) {
      documentNode.documentHtml = body.innerHTML;
      touchCanvas(tree);
    }
    let savedSelection = null;
    let pendingHighlight = false;
    let managesHighlightTyping = false;

    function serializedDocumentHtml() {
      const clone = body.cloneNode(true);
      const boundaries = clone.querySelectorAll("[data-note-highlight-boundary]");
      for (let i = 0; i < boundaries.length; i++) boundaries[i].remove();
      return clone.innerHTML;
    }

    function caretHighlightElement() {
      const selection = window.getSelection();
      if (!selection || !selection.isCollapsed) return null;
      let element = selection.anchorNode && selection.anchorNode.nodeType === Node.ELEMENT_NODE
        ? selection.anchorNode : selection.anchorNode && selection.anchorNode.parentElement;
      while (element && element !== body) {
        if (element.style && noteInlineIsHighlight(element.style.backgroundColor)) return element;
        element = element.parentElement;
      }
      return null;
    }

    function caretIsInsideHighlight() {
      return !!caretHighlightElement();
    }

    function rememberSelection() {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      const common = range.commonAncestorContainer;
      if (common !== body && !body.contains(common)) return;
      savedSelection = range.cloneRange();
    }

    function restoreSelection() {
      if (!savedSelection || !body.isConnected) return;
      body.focus();
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedSelection);
    }
    function commitDocumentInput() {
      const boundaries = body.querySelectorAll("[data-note-highlight-boundary]");
      for (let i = 0; i < boundaries.length; i++) boundaries[i].remove();
      liftNoteTransparentRuns(body);
      normalizeNoteHighlights(body, true);
      documentNode.documentHtml = serializedDocumentHtml();
      touchCanvas(tree);
      /* Typing must never override the explicit toolbar choice. The DOM caret
         can briefly remain next to the previous highlighted wrapper while the
         browser dispatches input, which used to turn the tool back on. */
      syncToolbarState(true);
    }

    body.addEventListener("input", commitDocumentInput);
    body.addEventListener("beforeinput", function (event) {
      if (!managesHighlightTyping || event.inputType !== "insertText"
          || event.data == null) return;
      const selection = window.getSelection();
      if (!selection || !selection.isCollapsed || !selection.rangeCount) return;
      event.preventDefault();

      if (!pendingHighlight && caretIsInsideHighlight()) exitNoteHighlightAtCaret(body);
      const currentSelection = window.getSelection();
      if (!currentSelection || !currentSelection.rangeCount) return;
      const range = currentSelection.getRangeAt(0);
      const textNode = document.createTextNode(event.data);
      if (pendingHighlight && !caretHighlightElement()) {
        const highlight = document.createElement("span");
        highlight.style.backgroundColor = "var(--note-highlight)";
        highlight.appendChild(textNode);
        range.insertNode(highlight);
      } else {
        range.insertNode(textNode);
      }
      const after = document.createRange();
      after.setStart(textNode, textNode.data.length);
      after.collapse(true);
      currentSelection.removeAllRanges();
      currentSelection.addRange(after);
      commitDocumentInput();
    });

    function syncToolbarState(preservePendingHighlight) {
      rememberSelection();
      const selection = window.getSelection();
      const insideBody = !!(selection && selection.anchorNode
        && body.contains(selection.anchorNode));
      if (insideBody && selection.isCollapsed && !preservePendingHighlight) {
        pendingHighlight = caretIsInsideHighlight();
      }
      const buttons = toolbar.querySelectorAll(".thinking-document-tool");
      for (let i = 0; i < buttons.length; i++) {
        const command = buttons[i].dataset.command;
        let active = false;
        if (insideBody) {
          active = command === "hilite" && selection.isCollapsed ? pendingHighlight
            : command === "hilite" ? thinkingDocumentHighlightActive(body)
            : !!document.queryCommandState(command);
        }
        buttons[i].classList.toggle("is-active", active);
        buttons[i].setAttribute("aria-pressed", active ? "true" : "false");
      }
    }

    for (let i = 0; i < tools.length; i++) {
      if (tools[i].separated) {
        const separator = document.createElement("span");
        separator.className = "thinking-document-toolbar__separator";
        separator.setAttribute("aria-hidden", "true");
        toolbar.appendChild(separator);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "thinking-document-tool";
      button.classList.add("thinking-document-tool--" + tools[i].command.toLowerCase());
      button.dataset.command = tools[i].command;
      button.setAttribute("aria-label", translate(tools[i].label));
      button.setAttribute("aria-pressed", "false");
      button.title = translate(tools[i].label);
      button.innerHTML = thinkingDocumentFormatIcon(tools[i].command);
      button.addEventListener("pointerdown", function (event) {
        rememberSelection();
        event.preventDefault();
      });
      button.addEventListener("click", function () {
        restoreSelection();
        const selection = window.getSelection();
        const collapsedHighlight = this.dataset.command === "hilite"
          && selection && selection.isCollapsed;
        if (collapsedHighlight) {
          managesHighlightTyping = true;
          if (pendingHighlight) exitNoteHighlightAtCaret(body);
          pendingHighlight = !pendingHighlight;
        } else {
          applyThinkingDocumentFormat(this.dataset.command, body, null);
        }
        rememberSelection();
        documentNode.documentHtml = serializedDocumentHtml();
        touchCanvas(tree);
        syncToolbarState(true);
      });
      toolbar.appendChild(button);
    }
    body.addEventListener("focus", function () { syncToolbarState(false); });
    body.addEventListener("keyup", function (event) {
      const movedCaret = event.key.indexOf("Arrow") === 0
        || ["Home", "End", "PageUp", "PageDown"].indexOf(event.key) !== -1;
      syncToolbarState(!movedCaret);
    });
    body.addEventListener("mouseup", function () { syncToolbarState(false); });
    sheet.append(toolbar, body);
    return sheet;
  }

/* THE LOGBOOK — a journal is kept by the day, so its entries are not scattered
   on a surface: they stack, newest first, down the same ruled paper the notepad
   uses, and each one's date sits in the margin that paper already draws. The
   entries are ordinary journal blocks, so dragging, linking and deleting them
   all keep working; nothing here invents a second way to store a line. */
  function thinkingLogbookEntries(tree, logbook) {
    const entries = [];
    for (let i = 0; i < tree.blocks.length; i++) {
      if (tree.blocks[i].parentId === logbook.id) entries.push(tree.blocks[i]);
    }
    entries.sort(function (a, b) {
      const dateA = a.journalDate || "";
      const dateB = b.journalDate || "";
      if (dateA !== dateB) return dateA < dateB ? 1 : -1;   // newest first
      return (b.id || "") < (a.id || "") ? 1 : -1;
    });
    return entries;
  }

  function createThinkingLogbookSheet(tree, logbook, fullscreen) {
    const sheet = document.createElement("div");
    sheet.className = "thinking-logbook";
    sheet.classList.add(fullscreen ? "thinking-logbook--fullscreen" : "thinking-logbook--preview");
    sheet.dataset.blockId = logbook.id;
    sheet.dataset.organizationId = logbook.id;

    const add = document.createElement("button");
    add.type = "button";
    add.className = "thinking-logbook__add";
    add.textContent = "+ " + translate("thinkingLogbookAdd");
    add.addEventListener("click", function (event) {
      event.stopPropagation();
      addThinkingLogbookEntry(tree, logbook);
    });
    sheet.appendChild(add);

    const entries = thinkingLogbookEntries(tree, logbook);
    for (let i = 0; i < entries.length; i++) {
      const row = document.createElement("div");
      row.className = "thinking-logbook__entry";
      const when = document.createElement("span");
      when.className = "thinking-logbook__date";
      when.textContent = shortDateLabel(entries[i].journalDate || todayKey());
      row.append(when, createThinkingBlock(tree, entries[i], true, false, logbook));
      sheet.appendChild(row);
    }
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "thinking-logbook__empty";
      empty.textContent = translate("thinkingLogbookEmpty");
      sheet.appendChild(empty);
    }
    if (fullscreen) {
      const width = Math.min(720, Math.max(420, thinkingViewport.clientWidth - 160));
      sheet.style.width = width + "px";
      sheet.style.left = (logbook.cameraX + thinkingViewport.clientWidth / 2 - width / 2) + "px";
      sheet.style.top = (logbook.cameraY + 44) + "px";
    }
    return sheet;
  }

  /* Today's page. One click has to land you on a caret, not on a form. */
  function addThinkingLogbookEntry(tree, logbook) {
    const entry = {
      id: thinkingId("b"), type: "journal", text: "",
      x: logbook.x, y: logbook.y, parentId: logbook.id,
      journalDate: todayKey()
    };
    tree.blocks.push(entry);
    touchCanvas(tree);
    renderThinkingCanvas(tree);
    const field = thinkingBlocks.querySelector('[data-block-id="' + entry.id + '"] textarea');
    if (field) field.focus();
  }

  function createThinkingFolderList(tree, folder, fullscreen) {
    const list = document.createElement("div");
    list.className = "thinking-folder__list";
    list.classList.add(fullscreen ? "thinking-folder__list--fullscreen"
      : "thinking-folder__list--preview");
    list.dataset.blockId = folder.id;
    list.dataset.organizationId = folder.id;
    const children = thinkingFolderChildren(tree, folder);
    for (let i = 0; i < children.length; i++) {
      list.appendChild(createThinkingBlock(tree, children[i], true, false, folder));
    }
    list.appendChild(createThinkingFolderAdd(tree, folder));
    if (fullscreen) {
      const width = Math.min(620, Math.max(360, thinkingViewport.clientWidth - 120));
      list.style.width = width + "px";
      list.style.left = (folder.cameraX + thinkingViewport.clientWidth / 2 - width / 2) + "px";
      list.style.top = (folder.cameraY + 44) + "px";
    } else if (folder.folderHeight) {
      list.style.height = folder.folderHeight + "px";
    }
    return list;
  }

  /* The + tile in a folder. A folder holds containers and nothing else, so the
     three it can take are offered straight away rather than behind a menu. */
  function createThinkingFolderAdd(tree, folder) {
    const tile = document.createElement("div");
    tile.className = "thinking-folder__add";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "thinking-folder__add-open";
    open.setAttribute("aria-expanded", "false");
    open.setAttribute("aria-label", translate("thinkingFolderAdd"));
    open.textContent = "+";
    const choices = document.createElement("div");
    choices.className = "thinking-folder__add-choices";
    for (let i = 0; i < THINKING_ORGANIZATION_TYPES.length; i++) {
      const type = THINKING_ORGANIZATION_TYPES[i];
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "thinking-folder__add-choice thinking-add--" + type;
      pick.setAttribute("aria-label", translate(thinkingTypeKey(type)));
      pick.title = translate(thinkingTypeKey(type));
      pick.innerHTML = thinkingIconSvg(thinkingTypeIcon(type));
      pick.addEventListener("click", function (event) {
        event.stopPropagation();
        addThinkingContainerToFolder(tree, folder, type);
      });
      choices.appendChild(pick);
    }
    open.addEventListener("click", function (event) {
      event.stopPropagation();
      const shown = tile.classList.toggle("is-open");
      open.setAttribute("aria-expanded", shown ? "true" : "false");
      if (!shown) return;
      // one click anywhere else puts the three away again
      setTimeout(function () {
        document.addEventListener("click", function close() {
          tile.classList.remove("is-open");
          open.setAttribute("aria-expanded", "false");
          document.removeEventListener("click", close);
        }, { once: true });
      }, 0);
    });
    tile.append(open, choices);
    return tile;
  }

  function addThinkingContainerToFolder(tree, folder, type) {
    const block = {
      id: thinkingId("b"), type: type, text: "", title: "",
      x: folder.x, y: folder.y, parentId: folder.id,
      collapsed: true,
      cameraX: THINKING_WORLD_X, cameraY: THINKING_WORLD_Y,
      folderOrder: nextThinkingFolderOrder(tree, folder)
    };
    if (type === "folder" || type === "logbook") {
      block.blockWidth = 420;
    } else {
      block.canvasWidth = 650;
      block.canvasHeight = 330;
      block.previewX = THINKING_WORLD_X
        + thinkingViewport.clientWidth / 2 - (block.canvasWidth - 20) / 2;
      block.previewY = THINKING_WORLD_Y
        + thinkingViewport.clientHeight / 2 - block.canvasHeight / 2;
    }
    if (type === "document") block.documentHtml = "";
    tree.blocks.push(block);
    touchCanvas(tree);
    renderThinkingCanvas(tree);
  }

  function renderThinkingCanvas(canvas) {
    const viewedCanvas = currentThinkingCanvasNode() || canvas;
    syncThinkingCanvasHeader(canvas, viewedCanvas);
    thinkingBoard.classList.toggle("is-folder-view", viewedCanvas.type === "folder");
    thinkingBlocks.innerHTML = "";
    let visibleCount = 0;
    if (viewedCanvas.type === "folder") {
      thinkingBlocks.appendChild(createThinkingFolderList(canvas, viewedCanvas, true));
      visibleCount++;
    } else if (viewedCanvas.type === "document") {
      thinkingBlocks.appendChild(createThinkingDocumentSheet(canvas, viewedCanvas));
      visibleCount++;
    } else if (viewedCanvas.type === "logbook") {
      thinkingBlocks.appendChild(createThinkingLogbookSheet(canvas, viewedCanvas, true));
      visibleCount++;
    }
    if (viewedCanvas.type !== "folder" && viewedCanvas.type !== "logbook") {
      for (let i = 0; i < canvas.blocks.length; i++) {
        if (canvas.blocks[i].parentId === viewedCanvas.id) {
          thinkingBlocks.appendChild(createThinkingBlock(canvas, canvas.blocks[i], false, false,
            viewedCanvas));
          visibleCount++;
        }
      }
    }
    thinkingBlank.hidden = visibleCount !== 0;
    thinkingBlank.style.left = (viewedCanvas.cameraX + thinkingViewport.clientWidth / 2) + "px";
    thinkingBlank.style.top = (viewedCanvas.cameraY + thinkingViewport.clientHeight * .38) + "px";
    layoutVisibleThinkingStuckBlocks(canvas);
    syncThinkingLinkMode();
    syncThinkingSelection();
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
      const nextParent = findThinkingParent(canvas, parent.parentId);
      if (nextParent) syncThinkingBlockTaskPlacement(canvas, child, nextParent);
      child.parentId = parent.parentId;
      child.x = Math.min(THINKING_WORLD_WIDTH - 300, parent.x + 28 + released * 24);
      child.y = Math.min(THINKING_WORLD_HEIGHT - 220, parent.y + 180 + released * 32);
      released++;
    }
  }

  function armThinkingCanvasResize(handle, card, canvasStage, block, canvas) {
    handle.addEventListener("pointerdown", function (event) {
      if (thinkingSelectionMode) return;
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      const start = { x: event.clientX, y: event.clientY,
        width: card.offsetWidth, height: canvasStage.offsetHeight };
      card.classList.add("is-resizing");
      const move = function (moveEvent) {
        const width = Math.max(360, start.width + moveEvent.clientX - start.x);
        const stageHeight = Math.max(220, start.height + moveEvent.clientY - start.y);
        resizeThinkingStuckSide(canvas, block, "width", width);
        resizeThinkingStuckSide(canvas, block, "height", stageHeight + THINKING_CANVAS_CHROME);
        layoutVisibleThinkingStuckBlocks(canvas);
        requestThinkingLinks(canvas);
      };
      const up = function () {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        card.classList.remove("is-resizing");
        alignThinkingCameraWithPreview(block);
        growThinkingCanvasForBlock(canvas, block, block.canvasWidth,
          block.canvasHeight + THINKING_CANVAS_CHROME);
        touchCanvas(canvas);
        renderThinkingCanvas(canvas);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }

  function armThinkingFolderResize(handle, card, folderGrid, block, canvas) {
    handle.addEventListener("pointerdown", function (event) {
      if (thinkingSelectionMode || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      const pointerId = event.pointerId;
      const start = { x: event.clientX, y: event.clientY,
        width: card.offsetWidth, height: folderGrid.offsetHeight };
      let moved = false;
      card.classList.add("is-resizing");
      const move = function (moveEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        moveEvent.preventDefault();
        const width = Math.max(230, Math.round(start.width + moveEvent.clientX - start.x));
        const height = Math.max(96, Math.round(start.height + moveEvent.clientY - start.y));
        if (width === start.width && height === start.height) return;
        moved = true;
        block.blockWidth = width;
        block.folderHeight = height;
        card.style.width = width + "px";
        folderGrid.style.height = height + "px";
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

  function armThinkingBlockResize(handle, card, block, canvas) {
    handle.addEventListener("pointerdown", function (event) {
      if (thinkingSelectionMode || event.button !== 0) return;
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
          resizeThinkingStuckSide(canvas, block, "width",
            Math.max(minimumWidth, Math.round(start.width + dx)));
        }
        if (Math.abs(dy) >= 2) {
          resizeThinkingStuckSide(canvas, block, "height",
            Math.max(minimumHeight, Math.round(start.height + dy)));
        }
        layoutVisibleThinkingStuckBlocks(canvas);
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
    if (block.type === "folder") return block.blockWidth || 420;
    if (isThinkingOrganization(block)) return block.canvasWidth || 650;
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
    if (block.type === "folder" || block.type === "logbook") {
      return { width: block.collapsed ? 112 : block.blockWidth || 420,
        height: block.collapsed ? 112 : 180 };
    }
    if (isThinkingOrganization(block)) {
      return {
        width: block.collapsed ? 112 : block.canvasWidth || 650,
        height: block.collapsed ? 112 : (block.canvasHeight || 330) + THINKING_CANVAS_CHROME
      };
    }
    if (block.type === "text") return { width: thinkingBlockNaturalWidth(block),
      height: block.blockHeight || 56 };
    if (THINKING_FLOW_TYPES.indexOf(block.type) !== -1) {
      return { width: thinkingBlockNaturalWidth(block),
      height: block.blockHeight || 210 };
    }
    return { width: thinkingBlockNaturalWidth(block),
      height: block.blockHeight || (block.type === "question" ? 90 : 64) };
  }

  function oppositeThinkingStickSide(side) {
    if (side === "top") return "bottom";
    if (side === "bottom") return "top";
    if (side === "left") return "right";
    return "left";
  }

  function thinkingStickSnapshot(canvas) {
    const snapshot = [];
    for (let i = 0; i < canvas.blocks.length; i++) {
      const block = canvas.blocks[i];
      snapshot.push({
        id: block.id,
        parentId: block.parentId,
        stuckToId: block.stuckToId,
        stuckSide: block.stuckSide,
        x: block.x,
        y: block.y,
        blockWidth: block.blockWidth,
        blockHeight: block.blockHeight,
        canvasWidth: block.canvasWidth,
        canvasHeight: block.canvasHeight
      });
    }
    return snapshot;
  }

  function restoreThinkingStickSnapshot(canvas, snapshot) {
    if (!snapshot) return;
    for (let i = 0; i < snapshot.length; i++) {
      const block = findThinkingParent(canvas, snapshot[i].id);
      if (!block) continue;
      block.parentId = snapshot[i].parentId;
      block.x = snapshot[i].x;
      block.y = snapshot[i].y;
      const optional = ["stuckToId", "stuckSide", "blockWidth", "blockHeight",
        "canvasWidth", "canvasHeight"];
      for (let j = 0; j < optional.length; j++) {
        const key = optional[j];
        if (snapshot[i][key] == null) delete block[key];
        else block[key] = snapshot[i][key];
      }
    }
  }

  /* Keep the unselected chain closed. */
  function detachThinkingIdsFromSticks(canvas, detachedIds) {
    for (let i = 0; i < canvas.blocks.length; i++) {
      const block = canvas.blocks[i];
      if (detachedIds[block.id] || !detachedIds[block.stuckToId]) continue;
      const side = block.stuckSide;
      let branch = findThinkingParent(canvas, block.stuckToId);
      while (branch && detachedIds[branch.id]) {
        if (branch.stuckSide !== side) {
          branch = null;
          break;
        }
        branch = findThinkingParent(canvas, branch.stuckToId);
      }
      if (branch && branch.parentId === block.parentId) {
        block.stuckToId = branch.id;
      } else {
        delete block.stuckToId;
        delete block.stuckSide;
      }
    }
    for (let i = 0; i < canvas.blocks.length; i++) {
      const block = canvas.blocks[i];
      if (detachedIds[block.id] && block.stuckToId && !detachedIds[block.stuckToId]) {
        delete block.stuckToId;
        delete block.stuckSide;
      }
    }
  }

  function thinkingAttachedBlock(canvas, targetId, side, ignoredId) {
    for (let i = 0; i < canvas.blocks.length; i++) {
      const block = canvas.blocks[i];
      if (block.id !== ignoredId && block.stuckToId === targetId && block.stuckSide === side) {
        return block;
      }
    }
    return null;
  }

  function thinkingStickContinuationSide(canvas, block) {
    const target = block.stuckToId ? findThinkingParent(canvas, block.stuckToId) : null;
    if (target && target.parentId === block.parentId
        && THINKING_STICK_SIDES.indexOf(block.stuckSide) !== -1) {
      return block.stuckSide;
    }
    for (let i = 0; i < THINKING_STICK_SIDES.length; i++) {
      const side = THINKING_STICK_SIDES[i];
      const attached = thinkingAttachedBlock(canvas, block.id, side);
      if (attached && attached.parentId === block.parentId) return side;
    }
    return null;
  }

  /* The chain direction is useful on every member, but the quick-add affordance
     belongs only to its free end. Containers are deliberately excluded: adding
     canvases, folders or documents remains an explicit action from the toolbar. */
  function thinkingStickAdditionSide(canvas, block) {
    if (isThinkingOrganization(block) || !block.stuckToId
        || THINKING_STICK_SIDES.indexOf(block.stuckSide) === -1) return null;
    const target = findThinkingParent(canvas, block.stuckToId);
    if (!target || target.parentId !== block.parentId) return null;
    const next = thinkingAttachedBlock(canvas, block.id, block.stuckSide);
    if (next && next.parentId === block.parentId) return null;
    return block.stuckSide;
  }

  function thinkingUsesCompactStuckHeader(canvas, block) {
    const target = block.stuckToId ? findThinkingParent(canvas, block.stuckToId) : null;
    if (target && target.parentId === block.parentId && target.type === block.type
        && (block.stuckSide === "bottom" || block.stuckSide === "right")) {
      return true;
    }
    const above = thinkingAttachedBlock(canvas, block.id, "top");
    if (above && above.parentId === block.parentId && above.type === block.type) return true;
    const left = thinkingAttachedBlock(canvas, block.id, "left");
    return !!(left && left.parentId === block.parentId && left.type === block.type);
  }

  function thinkingIsStuckListLead(canvas, block) {
    if (!thinkingStickContinuationSide(canvas, block)) return false;
    const target = block.stuckToId ? findThinkingParent(canvas, block.stuckToId) : null;
    if (target && target.parentId === block.parentId
        && (block.stuckSide === "bottom" || block.stuckSide === "right")) {
      return false;
    }
    const above = thinkingAttachedBlock(canvas, block.id, "top");
    if (above && above.parentId === block.parentId) return false;
    const left = thinkingAttachedBlock(canvas, block.id, "left");
    return !(left && left.parentId === block.parentId);
  }

  function thinkingStuckComponent(canvas, start) {
    const found = {};
    const blocks = [];
    const queue = [start];
    found[start.id] = true;
    for (let index = 0; index < queue.length; index++) {
      const block = queue[index];
      blocks.push(block);
      const target = block.stuckToId ? findThinkingParent(canvas, block.stuckToId) : null;
      if (target && target.parentId === start.parentId && !found[target.id]) {
        found[target.id] = true;
        queue.push(target);
      }
      for (let i = 0; i < canvas.blocks.length; i++) {
        const child = canvas.blocks[i];
        if (child.parentId !== start.parentId || child.stuckToId !== block.id
            || found[child.id]) continue;
        found[child.id] = true;
        queue.push(child);
      }
    }
    return blocks;
  }

  function thinkingNestedChildGroups(canvas, parentId) {
    const items = [];
    const byId = {};
    for (let i = 0; i < canvas.blocks.length; i++) {
      if (canvas.blocks[i].parentId !== parentId) continue;
      const item = { block: canvas.blocks[i], index: i, x: 0, y: 0 };
      items.push(item);
      byId[item.block.id] = item;
    }
    const visited = {};
    const groups = [];
    for (let i = 0; i < items.length; i++) {
      if (visited[items[i].block.id]) continue;
      const component = [];
      const queue = [items[i]];
      visited[items[i].block.id] = true;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const current = queue[cursor];
        component.push(current);
        const target = byId[current.block.stuckToId];
        if (target && !visited[target.block.id]) {
          visited[target.block.id] = true;
          queue.push(target);
        }
        for (let j = 0; j < items.length; j++) {
          if (items[j].block.stuckToId !== current.block.id
              || visited[items[j].block.id]) continue;
          visited[items[j].block.id] = true;
          queue.push(items[j]);
        }
      }

      const memberIds = {};
      let horizontal = false;
      let vertical = false;
      let firstIndex = Infinity;
      for (let j = 0; j < component.length; j++) {
        memberIds[component[j].block.id] = true;
        firstIndex = Math.min(firstIndex, component[j].index);
      }
      const positions = {};
      const locate = function (item, trail) {
        if (positions[item.block.id]) return positions[item.block.id];
        if (trail[item.block.id]) return { x: 0, y: 0 };
        const nextTrail = Object.assign({}, trail);
        nextTrail[item.block.id] = true;
        const target = memberIds[item.block.stuckToId] ? byId[item.block.stuckToId] : null;
        const origin = target ? locate(target, nextTrail) : { x: 0, y: 0 };
        const position = { x: origin.x, y: origin.y };
        if (target) {
          if (item.block.stuckSide === "left") { position.x--; horizontal = true; }
          else if (item.block.stuckSide === "right") { position.x++; horizontal = true; }
          else if (item.block.stuckSide === "top") { position.y--; vertical = true; }
          else if (item.block.stuckSide === "bottom") { position.y++; vertical = true; }
        }
        positions[item.block.id] = position;
        return position;
      };
      for (let j = 0; j < component.length; j++) {
        const position = locate(component[j], {});
        component[j].x = position.x;
        component[j].y = position.y;
      }
      const axis = horizontal && !vertical ? "horizontal"
        : vertical && !horizontal ? "vertical" : horizontal || vertical ? "grid" : null;
      component.sort(function (a, b) {
        if (axis === "horizontal" && a.x !== b.x) return a.x - b.x;
        if (axis === "vertical" && a.y !== b.y) return a.y - b.y;
        if (axis === "grid" && a.y !== b.y) return a.y - b.y;
        if (axis === "grid" && a.x !== b.x) return a.x - b.x;
        return a.index - b.index;
      });
      groups.push({ items: component, axis: axis, index: firstIndex });
    }
    groups.sort(function (a, b) { return a.index - b.index; });
    return groups;
  }

  function setThinkingBlockAxisSize(block, card, axis, value) {
    if (axis === "width") {
      const width = Math.max(110, Math.round(value));
      if (block.type === "folder") block.blockWidth = width;
      else if (isThinkingOrganization(block)) block.canvasWidth = width;
      else block.blockWidth = width;
      if (card) card.style.width = width + "px";
      return;
    }
    const height = Math.max(52, Math.round(value));
    if (block.type === "folder") return;
    if (isThinkingOrganization(block)) {
      block.canvasHeight = Math.max(50, height - THINKING_CANVAS_CHROME);
      const stage = card ? card.querySelector(":scope > .thinking-canvas__stage") : null;
      if (stage) stage.style.height = block.canvasHeight + "px";
    } else {
      block.blockHeight = height;
      if (card) {
        card.style.height = height + "px";
        card.classList.add("is-manually-sized");
      }
    }
  }

  function resizeThinkingStuckSide(canvas, source, axis, value) {
    const vertical = axis === "width";
    const acceptedSides = vertical ? ["top", "bottom"] : ["left", "right"];
    const queued = {};
    const queue = [source];
    queued[source.id] = true;
    for (let index = 0; index < queue.length; index++) {
      const block = queue[index];
      if (block.stuckToId && acceptedSides.indexOf(block.stuckSide) !== -1) {
        const target = findThinkingParent(canvas, block.stuckToId);
        if (target && target.parentId === block.parentId && !queued[target.id]) {
          queued[target.id] = true;
          queue.push(target);
        }
      }
      for (let i = 0; i < canvas.blocks.length; i++) {
        const child = canvas.blocks[i];
        if (child.stuckToId === block.id && child.parentId === block.parentId
            && acceptedSides.indexOf(child.stuckSide) !== -1 && !queued[child.id]) {
          queued[child.id] = true;
          queue.push(child);
        }
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const card = thinkingBlocks.querySelector('[data-block-id="' + queue[i].id + '"]');
      setThinkingBlockAxisSize(queue[i], card, axis, value);
    }
  }

  function setThinkingStuckCrossSize(block, card, side, targetWidth, targetHeight) {
    if (side === "top" || side === "bottom") {
      setThinkingBlockAxisSize(block, card, "width", targetWidth);
    } else {
      setThinkingBlockAxisSize(block, card, "height", targetHeight);
    }
  }

  function positionThinkingStuckCard(tree, block, card, parent) {
    const viewedCanvas = currentThinkingCanvasNode();
    if (viewedCanvas && parent.id === viewedCanvas.id) {
      card.style.left = block.x + "px";
      card.style.top = block.y + "px";
      return;
    }
    const parentCard = thinkingBlocks.querySelector('[data-block-id="' + parent.id + '"]');
    const stage = parentCard ? parentCard.querySelector(":scope > .thinking-canvas__stage") : null;
    if (!stage) return;
    const origin = thinkingCanvasPreviewOrigin(parent, stage.clientWidth, stage.clientHeight);
    card.style.left = block.x - origin.x + "px";
    card.style.top = block.y - origin.y + "px";
  }

  function layoutThinkingStuckParent(tree, parent) {
    const directBlocks = [];
    const cards = {};
    let hasStuckBlocks = false;
    for (let i = 0; i < tree.blocks.length; i++) {
      const block = tree.blocks[i];
      if (block.parentId !== parent.id) continue;
      const card = thinkingBlocks.querySelector('[data-block-id="' + block.id + '"]');
      if (!card) continue;
      directBlocks.push(block);
      cards[block.id] = card;
      if (block.stuckToId) hasStuckBlocks = true;
    }
    if (!hasStuckBlocks) return;

    const placed = {};
    const placeBranch = function (target) {
      if (!target || placed[target.id]) return;
      placed[target.id] = true;
      const targetCard = cards[target.id];
      if (!targetCard) return;
      for (let i = 0; i < THINKING_STICK_SIDES.length; i++) {
        const side = THINKING_STICK_SIDES[i];
        const child = thinkingAttachedBlock(tree, target.id, side);
        const childCard = child ? cards[child.id] : null;
        if (!child || !childCard || placed[child.id]) continue;
        setThinkingStuckCrossSize(child, childCard, side,
          targetCard.offsetWidth, targetCard.offsetHeight);
        const childWidth = childCard.offsetWidth;
        const childHeight = childCard.offsetHeight;
        if (side === "top") {
          child.x = target.x;
          child.y = target.y - childHeight + 1;
        } else if (side === "right") {
          child.x = target.x + targetCard.offsetWidth - 1;
          child.y = target.y;
        } else if (side === "bottom") {
          child.x = target.x;
          child.y = target.y + targetCard.offsetHeight - 1;
        } else {
          child.x = target.x - childWidth + 1;
          child.y = target.y;
        }
        positionThinkingStuckCard(tree, child, childCard, parent);
        placeBranch(child);
      }
    };

    for (let i = 0; i < directBlocks.length; i++) {
      const target = findThinkingParent(tree, directBlocks[i].stuckToId);
      if (!target || target.parentId !== parent.id) placeBranch(directBlocks[i]);
    }
    for (let i = 0; i < directBlocks.length; i++) placeBranch(directBlocks[i]);
    for (let i = 0; i < directBlocks.length; i++) {
      const block = directBlocks[i];
      const card = cards[block.id];
      growThinkingCanvasForBlock(tree, block, card.offsetWidth, card.offsetHeight);
    }
    for (let i = 0; i < directBlocks.length; i++) {
      positionThinkingStuckCard(tree, directBlocks[i], cards[directBlocks[i].id], parent);
    }
  }

  function layoutVisibleThinkingStuckBlocks(tree) {
    const viewedCanvas = currentThinkingCanvasNode();
    if (!viewedCanvas) return;
    if (viewedCanvas.type !== "folder") layoutThinkingStuckParent(tree, viewedCanvas);
    const stages = thinkingBlocks.querySelectorAll(".thinking-canvas__stage");
    for (let i = 0; i < stages.length; i++) {
      const card = stages[i].closest(".thinking-block--organization");
      const canvasNode = card ? findThinkingParent(tree, card.dataset.blockId) : null;
      if (canvasNode && !canvasNode.collapsed) layoutThinkingStuckParent(tree, canvasNode);
    }
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
      if (thinkingSelectionMode) {
        event.preventDefault();
        event.stopPropagation();
        beginThinkingSelectionBox(event, tree, canvasNode.id, stage);
        return;
      }
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
    if (!isThinkingOrganization(parent)) return;
    if (parent.type === "folder") {
      if (parent.id === viewedCanvasId) return;
      if (parent.parentId) {
        const parentCard = thinkingBlocks.querySelector('[data-block-id="' + parent.id + '"]');
        growThinkingCanvasForBlock(tree, parent,
          parentCard ? parentCard.offsetWidth : thinkingBlockNaturalWidth(parent),
          parentCard ? parentCard.offsetHeight : thinkingBlockSize(parent).height);
      }
      return;
    }
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
      growThinkingCanvasForBlock(tree, parent, parent.canvasWidth,
        parent.canvasHeight + THINKING_CANVAS_CHROME);
    }
  }

  function toggleThinkingCanvas(block, canvas) {
    if (thinkingCanvasFoldLocks[block.id]) return;
    thinkingCanvasFoldLocks[block.id] = true;
    setTimeout(function () { delete thinkingCanvasFoldLocks[block.id]; }, 280);
    block.collapsed = !block.collapsed;
    if (!block.collapsed && block.type !== "folder") {
      growThinkingCanvasForBlock(canvas, block, block.canvasWidth,
        block.canvasHeight + THINKING_CANVAS_CHROME);
    }
    touchCanvas(canvas);
    renderThinkingCanvas(canvas);
    if (block.type === "folder" && block.parentId) {
      requestAnimationFrame(function () {
        const card = thinkingBlocks.querySelector('[data-block-id="' + block.id + '"]');
        if (card) growThinkingCanvasForBlock(canvas, block, card.offsetWidth, card.offsetHeight);
      });
    }
  }

  function armThinkingCanvasClicks(card, head, block, canvas) {
    let clickTimer = null;
    const hitsCanvasSurface = function (event) {
      if (card.dataset.dragged || card.dataset.panned) return false;
      if (event.target.closest("button, input, textarea, select")) return false;
      return event.target.closest(".thinking-block") === card;
    };
    card.addEventListener("pointerdown", function () { clearTimeout(clickTimer); });
    card.addEventListener("click", function (event) {
      if (!hitsCanvasSurface(event)) return;
      if (!block.collapsed && !head.contains(event.target)) return;
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

  function createThinkingChildren(canvas, block, ownerCanvas, parentCard) {
    const children = document.createElement("div");
    children.className = "thinking-block__children";
    const childGroups = thinkingNestedChildGroups(canvas, block.id);
    let nestedMinimumWidth = 0;
    for (let i = 0; i < childGroups.length; i++) {
      const group = childGroups[i];
      if (group.items.length === 1 || !group.axis) {
        for (let j = 0; j < group.items.length; j++) {
          children.appendChild(createThinkingBlock(canvas, group.items[j].block,
            true, false, ownerCanvas));
        }
        continue;
      }
      const stuckList = document.createElement("div");
      stuckList.className = "thinking-block__stuck-list thinking-block__stuck-list--"
        + group.axis;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      for (let j = 0; j < group.items.length; j++) {
        minX = Math.min(minX, group.items[j].x);
        minY = Math.min(minY, group.items[j].y);
        maxX = Math.max(maxX, group.items[j].x);
      }
      if (group.axis === "horizontal") {
        nestedMinimumWidth = Math.max(nestedMinimumWidth, group.items.length * 110 + 20);
      } else if (group.axis === "grid") {
        nestedMinimumWidth = Math.max(nestedMinimumWidth, (maxX - minX + 1) * 110 + 20);
      }
      for (let j = 0; j < group.items.length; j++) {
        const childCard = createThinkingBlock(canvas, group.items[j].block,
          true, false, ownerCanvas);
        if (group.axis === "grid") {
          childCard.style.gridColumn = group.items[j].x - minX + 1;
          childCard.style.gridRow = group.items[j].y - minY + 1;
        }
        stuckList.appendChild(childCard);
      }
      children.appendChild(stuckList);
    }
    if (nestedMinimumWidth) parentCard.style.minWidth = nestedMinimumWidth + "px";
    return children;
  }

  function thinkingParseLoopDays(value) {
    const normalized = (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[\[\]()]/g, " ").trim();
    if (!normalized) return [];
    if (/^(semaine|jours ouvrables|week|weekdays|workweek)$/.test(normalized)) {
      return [1, 2, 3, 4, 5];
    }
    if (/^(weekend|week-end|fin de semaine)$/.test(normalized)) return [6, 0];
    const aliases = {
      "0": 0, dim: 0, dimanche: 0, sun: 0, sunday: 0,
      "1": 1, lun: 1, lundi: 1, mon: 1, monday: 1,
      "2": 2, mar: 2, mardi: 2, tue: 2, tues: 2, tuesday: 2,
      "3": 3, mer: 3, mercredi: 3, wed: 3, wednesday: 3,
      "4": 4, jeu: 4, jeudi: 4, thu: 4, thur: 4, thursday: 4,
      "5": 5, ven: 5, vendredi: 5, fri: 5, friday: 5,
      "6": 6, sam: 6, samedi: 6, sat: 6, saturday: 6,
      "7": 0
    };
    const found = {};
    const tokens = normalized.split(/[,;|\s]+/);
    for (let i = 0; i < tokens.length; i++) {
      if (aliases[tokens[i]] != null) found[aliases[tokens[i]]] = true;
    }
    return [1, 2, 3, 4, 5, 6, 0].filter(function (day) { return found[day]; });
  }

  function thinkingLoopDayOptions() {
    const names = state.settings.language === "en"
      ? [[1, "Mo", "Monday"], [2, "Tu", "Tuesday"], [3, "We", "Wednesday"],
        [4, "Th", "Thursday"], [5, "Fr", "Friday"], [6, "Sa", "Saturday"],
        [0, "Su", "Sunday"]]
      : [[1, "Lu", "Lundi"], [2, "Ma", "Mardi"], [3, "Me", "Mercredi"],
        [4, "Je", "Jeudi"], [5, "Ve", "Vendredi"], [6, "Sa", "Samedi"],
        [0, "Di", "Dimanche"]];
    return names.map(function (item) {
      return { value: item[0], short: item[1], label: item[2] };
    });
  }

  function thinkingLoopDaysSummary(days) {
    const selected = Array.isArray(days) ? days : [];
    const options = thinkingLoopDayOptions();
    const labels = [];
    for (let i = 0; i < options.length; i++) {
      if (selected.indexOf(options[i].value) !== -1) labels.push(options[i].short);
    }
    return labels.length ? labels.join(" · ") : "—";
  }

  function thinkingLoopActions(canvas, loop) {
    const actions = [];
    const visited = {};
    const collect = function (parent, inheritedHour) {
      if (!parent || visited[parent.id]) return;
      visited[parent.id] = true;
      for (let i = 0; i < canvas.blocks.length; i++) {
        const child = canvas.blocks[i];
        if (child.parentId !== parent.id) continue;
        if (THINKING_ACTION_TYPES.indexOf(child.type) !== -1) {
          actions.push({ block: child, hour: inheritedHour || null });
        } else if (child.type === "condition") {
          if (!child.conditionHour) actions.missingHour = true;
          else collect(child, child.conditionHour);
        } else if (child.type === "loop") {
          collect(child, inheritedHour || null);
        }
      }
    };
    collect(loop, null);
    return actions;
  }

  function thinkingLoopDates(loop) {
    const selected = Array.isArray(loop.loopDays) ? loop.loopDays : [];
    const weeks = Math.max(1, Math.min(12, Number(loop.loopWeeks) || 4));
    const dates = [];
    const start = new Date(todayKey() + "T12:00:00");
    for (let offset = 0; offset < weeks * 7; offset++) {
      const day = new Date(start);
      day.setDate(start.getDate() + offset);
      if (selected.indexOf(day.getDay()) !== -1) {
        dates.push(dateKey(day.getFullYear(), day.getMonth(), day.getDate()));
      }
    }
    return dates;
  }

  function removeThinkingLoopGenerated(loop) {
    const generated = loop.loopRun && Array.isArray(loop.loopRun.generated)
      ? loop.loopRun.generated : [];
    const lists = { task: state.tasks, event: state.events,
      project: state.projects, habit: state.habits };
    let removed = 0;
    for (let i = 0; i < generated.length; i++) {
      const list = lists[generated[i].kind];
      if (!list) continue;
      for (let j = list.length - 1; j >= 0; j--) {
        if (list[j].id === generated[i].id) {
          list.splice(j, 1);
          removed++;
        }
      }
    }
    delete loop.loopRun;
    return removed;
  }

  function rewindThinkingLoop(canvas, loop) {
    const removed = removeThinkingLoopGenerated(loop);
    touchCanvas(canvas);
    refreshThinkingActionViews();
    renderThinkingCanvas(canvas);
    showToast(translate("thinkingLoopRewound").replace("{count}", removed));
  }

  function thinkingLoopActionText(action) {
    const linked = thinkingActionItem(action);
    if (linked) return action.type === "habit" ? linked.name || action.text
      : linked.text || action.text;
    return (action.text || "").trim() || translate(thinkingTypeKey(action.type));
  }

  function runThinkingLoop(canvas, loop) {
    const actions = thinkingLoopActions(canvas, loop);
    const dates = thinkingLoopDates(loop);
    if (!dates.length) {
      showToast(translate("thinkingLoopNoDays"));
      return;
    }
    if (actions.missingHour) {
      showToast(translate("thinkingConditionNoHour"));
      return;
    }
    if (!actions.length) {
      showToast(translate("thinkingLoopNoActions"));
      return;
    }
    const generated = [];
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i].block;
      const conditionHour = actions[i].hour || null;
      const hour = conditionHour || "09:00";
      const text = thinkingLoopActionText(action);
      if (action.type === "habit") {
        const habit = {
          id: thinkingId("g"), name: text, icon: "sun", completedDates: [],
          plannerDays: loop.loopDays.slice(), plannerTime: conditionHour,
          plannerLoopId: loop.id
        };
        state.habits.push(habit);
        generated.push({ kind: "habit", id: habit.id, sourceBlockId: action.id });
        continue;
      }
      for (let j = 0; j < dates.length; j++) {
        let item = null;
        if (action.type === "event") {
          item = { id: thinkingId("g"), text: text, important: false, icon: "calendar",
            date: dates[j], time: hour, plannerLoopId: loop.id };
          state.events.push(item);
        } else if (action.type === "task") {
          item = { id: thinkingId("g"), text: text, done: false, projectId: null,
            dueDate: dates[j], dueTime: hour, plannerLoopId: loop.id };
          state.tasks.push(item);
        }
        if (item) generated.push({ kind: action.type, id: item.id,
          sourceBlockId: action.id });
      }
    }
    loop.loopRun = {
      ranAt: Date.now(), count: generated.length,
      generated: generated
    };
    touchCanvas(canvas);
    refreshThinkingActionViews();
    renderThinkingCanvas(canvas);
    showToast(translate("thinkingLoopCreated").replace("{count}", generated.length));
  }

  function createThinkingFlowHead(canvas, block, head, del) {
    head.classList.add("thinking-flow__head");
    if (block.type === "loop") {
      if (!Array.isArray(block.loopDays)) block.loopDays = [1, 2, 3, 4, 5];
      if (block.loopWeeks == null) block.loopWeeks = 4;
      const run = document.createElement("button");
      run.type = "button";
      run.className = "thinking-loop__run";
      const hasRun = !!(block.loopRun && Array.isArray(block.loopRun.generated)
        && block.loopRun.generated.length);
      run.classList.toggle("is-rewind", hasRun);
      run.setAttribute("aria-label", translate(hasRun
        ? "thinkingLoopRewind" : "thinkingLoopRun"));
      run.title = translate(hasRun ? "thinkingLoopRewind" : "thinkingLoopRun");
      run.innerHTML = hasRun
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6v12M18 6l-7 6 7 6ZM11 6l-7 6 7 6Z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>';
      run.addEventListener("click", function () {
        if (hasRun) rewindThinkingLoop(canvas, block);
        else runThinkingLoop(canvas, block);
      });
      const keyword = document.createElement("code");
      keyword.className = "thinking-flow__keyword";
      keyword.textContent = translate("thinkingLoopFor");
      const value = document.createElement("span");
      value.className = "thinking-flow__value";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "thinking-flow__days-toggle";
      toggle.textContent = thinkingLoopDaysSummary(block.loopDays);
      toggle.setAttribute("aria-label", translate("thinkingLoopChooseDays"));
      toggle.setAttribute("aria-expanded", "false");
      const chevron = document.createElement("span");
      chevron.className = "thinking-flow__days-chevron";
      chevron.textContent = "⌄";
      toggle.appendChild(chevron);
      value.appendChild(toggle);

      const picker = document.createElement("div");
      picker.className = "thinking-flow__days-picker";
      picker.hidden = true;
      picker.setAttribute("role", "group");
      picker.setAttribute("aria-label", translate("thinkingLoopChooseDays"));
      const options = thinkingLoopDayOptions();
      const syncToggle = function () {
        toggle.firstChild.textContent = thinkingLoopDaysSummary(block.loopDays);
      };
      for (let i = 0; i < options.length; i++) {
        const choice = document.createElement("label");
        choice.className = "thinking-flow__day-choice";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.value = options[i].value;
        check.checked = block.loopDays.indexOf(options[i].value) !== -1;
        const label = document.createElement("span");
        label.textContent = options[i].label;
        check.addEventListener("change", function () {
          const selected = {};
          const checks = picker.querySelectorAll('input[type="checkbox"]');
          for (let j = 0; j < checks.length; j++) {
            if (checks[j].checked) selected[Number(checks[j].value)] = true;
          }
          block.loopDays = options.map(function (option) { return option.value; })
            .filter(function (day) { return selected[day]; });
          syncToggle();
          touchCanvas(canvas);
        });
        choice.append(check, label);
        picker.appendChild(choice);
      }
      toggle.addEventListener("click", function () {
        picker.hidden = !picker.hidden;
        toggle.setAttribute("aria-expanded", picker.hidden ? "false" : "true");
      });
      head.addEventListener("focusout", function () {
        setTimeout(function () {
          if (!head.contains(document.activeElement)) {
            picker.hidden = true;
            toggle.setAttribute("aria-expanded", "false");
          }
        }, 0);
      });
      head.addEventListener("keydown", function (event) {
        if (event.key !== "Escape" || picker.hidden) return;
        picker.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      });
      head.append(run, keyword, value, del, picker);
      return;
    }

    if (block.conditionHour == null) block.conditionHour = "19:00";
    const keyword = document.createElement("code");
    keyword.className = "thinking-flow__keyword";
    keyword.textContent = translate("thinkingConditionIfHour");
    const hour = document.createElement("input");
    hour.type = "time";
    hour.className = "thinking-flow__hour-input";
    hour.value = block.conditionHour;
    hour.setAttribute("aria-label", translate("thinkingConditionIfHour"));
    hour.addEventListener("change", function () {
      block.conditionHour = hour.value;
      touchCanvas(canvas);
    });
    head.append(keyword, hour, del);
  }

  function createThinkingBlock(canvas, block, nested, insideCanvas, ownerCanvas) {
    const linkedTask = block.type === "task" ? thinkingTaskItem(block) : null;
    const linkedAction = THINKING_ACTION_TYPES.indexOf(block.type) !== -1
      ? thinkingActionItem(block) : null;
    const linkedNoteTask = block.type === "note" ? thinkingTaskForNote(canvas, block) : null;
    if (linkedAction) {
      block.text = block.type === "habit" ? linkedAction.name || "" : linkedAction.text || "";
    }
    if (linkedNoteTask) block.text = linkedNoteTask.notes || "";
    const card = document.createElement("article");
    const contained = nested && !insideCanvas;
    const organization = isThinkingOrganization(block);
    const flow = THINKING_FLOW_TYPES.indexOf(block.type) !== -1;
    card.className = "thinking-block thinking-block--" + block.type;
    if (organization) card.classList.add("thinking-block--organization");
    if (flow) card.classList.add("thinking-block--flow");
    if (linkedTask && linkedTask.done) card.classList.add("is-task-done");
    if (block.type === "step"
        && (linkedAction ? linkedAction.completedDate : block.stepDone)) {
      card.classList.add("is-task-done");
    }
    if (nested) card.classList.add("thinking-block--nested");
    if (insideCanvas) card.classList.add("thinking-block--canvas-child");
    if (organization) {
      card.classList.toggle("is-collapsed", !!block.collapsed);
    }
    card.dataset.blockId = block.id;
    card.classList.toggle("is-selected", !!thinkingSelectedIds[block.id]);
    const stuckTarget = block.stuckToId ? findThinkingParent(canvas, block.stuckToId) : null;
    if (stuckTarget && stuckTarget.parentId === block.parentId) {
      card.classList.add("is-stuck", "is-stuck-" + block.stuckSide);
    }
    if (thinkingUsesCompactStuckHeader(canvas, block)) card.classList.add("is-stuck-compact");
    const stickContinuation = thinkingStickContinuationSide(canvas, block);
    const stickAdditionSide = thinkingStickAdditionSide(canvas, block);
    const stuckListLead = thinkingIsStuckListLead(canvas, block);
    if (stuckListLead && (stickContinuation === "left" || stickContinuation === "right")) {
      let horizontalNeighbor = thinkingAttachedBlock(canvas, block.id, stickContinuation);
      if (!horizontalNeighbor && block.stuckSide === stickContinuation && block.stuckToId) {
        horizontalNeighbor = findThinkingParent(canvas, block.stuckToId);
      }
      if (horizontalNeighbor && horizontalNeighbor.parentId === block.parentId
          && horizontalNeighbor.type === block.type) {
        card.classList.add("is-stuck-horizontal-title-raised");
      }
    }
    for (let i = 0; i < THINKING_STICK_SIDES.length; i++) {
      const attached = thinkingAttachedBlock(canvas, block.id, THINKING_STICK_SIDES[i]);
      if (attached && attached.parentId === block.parentId) {
        card.classList.add("has-stuck-" + THINKING_STICK_SIDES[i]);
      }
    }
    if (block.type === "folder" || block.type === "logbook") {
      if (!contained) card.style.width = (block.blockWidth || 360) + "px";
    } else if (organization && block.canvasWidth) {
      card.style.width = block.canvasWidth + "px";
    } else if (block.blockWidth && !contained) {
      card.style.width = block.blockWidth + "px";
    } else if (!nested || insideCanvas) {
      card.style.width = thinkingBlockNaturalWidth(block) + "px";
    }
    if (!organization && block.blockHeight && !contained) {
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

    const icon = document.createElement(organization ? "span" : "button");
    if (!organization) icon.type = "button";
    icon.className = "thinking-block__icon";
    icon.innerHTML = thinkingIconSvg(thinkingTypeIcon(block.type));
    const family = organization ? null : thinkingTypeFamily(block.type);
    if (family) {
      icon.setAttribute("aria-label", translate("thinkingChangeType"));
      icon.addEventListener("click", function () {
        const current = family.indexOf(block.type);
        const parent = findThinkingParent(canvas, block.parentId);
        for (let offset = 1; offset <= family.length; offset++) {
          const next = family[(current + offset) % family.length];
          if (parent && parent.type === "planner"
              && !thinkingOrganizationAllows(parent, { type: next })) continue;
          if (parent && THINKING_FLOW_TYPES.indexOf(parent.type) !== -1
              && THINKING_ACTION_TYPES.indexOf(next) === -1) continue;
          changeThinkingBlockType(canvas, block, next);
          break;
        }
      });
    }

    const type = document.createElement("span");
    type.className = "thinking-block__type";
    if (organization) type.classList.add("thinking-block__type--canvas-title");
    type.textContent = organization
      ? thinkingOrganizationTitle(block)
      : translate(thinkingTypeKey(block.type));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "thinking-block__delete";
    del.setAttribute("aria-label", translate("deleteAria"));
    del.textContent = "×";
    del.addEventListener("click", function (event) {
      event.stopPropagation();
      if (thinkingSelectionMode && thinkingSelectedIds[block.id]) {
        removeThinkingSelection(canvas);
      } else {
        removeThinkingBlock(canvas, block.id);
      }
    });
    if (flow) {
      createThinkingFlowHead(canvas, block, head, del);
    } else {
      if (block.type !== "text") head.append(icon, type);
      if (organization) {
        const rule = document.createElement("span");   // the fading filet, as in a task group
        rule.className = "thinking-block__rule";
        head.appendChild(rule);
      }
      head.appendChild(del);
    }
    if (stuckListLead) armThinkingStuckGroupDrag(head, card, block, canvas);
    else armThinkingDrag(head, card, block, canvas, nested, insideCanvas);

    let text = null;
    let taskBody = null;
    let children = null;
    let canvasStage = null;
    let folderList = null;
    if (block.type === "folder") {
      folderList = createThinkingFolderList(canvas, block, false);
    } else if (block.type === "logbook") {
      folderList = createThinkingLogbookSheet(canvas, block, false);
    } else if (organization) {
      canvasStage = document.createElement("div");
      canvasStage.className = "thinking-canvas__stage";
      canvasStage.classList.add("thinking-canvas__stage--" + block.type);
      if (block.canvasHeight) canvasStage.style.height = block.canvasHeight + "px";
      let documentPaper = null;
      if (block.type === "document") {
        documentPaper = document.createElement("div");
        documentPaper.className = "thinking-document-paper";
        canvasStage.appendChild(documentPaper);
      }
      if (block.type === "document" && (block.documentHtml || "").trim()) {
        const previewText = document.createElement("div");
        previewText.className = "thinking-document-preview";
        previewText.innerHTML = block.documentHtml;
        documentPaper.appendChild(previewText);
      }
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
        empty.textContent = translate(block.type === "document"
          ? "thinkingDocumentEmpty" : "thinkingCanvasEmpty");
        if (block.type === "document" && (block.documentHtml || "").trim()) empty.hidden = true;
        (documentPaper || canvasStage).appendChild(empty);
      }
      const resize = document.createElement("button");
      resize.type = "button";
      resize.className = "thinking-canvas__resize";
      resize.setAttribute("aria-label", translate("thinkingResizeCanvas"));
      armThinkingCanvasResize(resize, card, canvasStage, block, canvas);
      canvasStage.appendChild(resize);
      armThinkingCanvasPan(canvasStage, card, block, canvas);
      positionThinkingCanvasChildren(canvasStage, canvas, block);
    } else if (flow) {
      children = createThinkingChildren(canvas, block, ownerCanvas, card);
      children.classList.add("thinking-loop__slot");
    } else {
      text = document.createElement("textarea");
      text.className = "thinking-block__text";
      text.value = block.text || "";
      text.placeholder = translate(thinkingPlaceholderKey(block.type));
      armThinkingLists(text);
      text.addEventListener("scroll", function () {
        if (!block.blockHeight || contained) return;
        text.scrollTop = 0;
        text.scrollLeft = 0;
      });
      text.addEventListener("input", function () {
        applyThinkingListSyntax(text);
        block.text = text.value;
        const currentAction = THINKING_ACTION_TYPES.indexOf(block.type) !== -1
          ? syncThinkingActionText(block) : null;
        const currentNoteTask = block.type === "note" ? thinkingTaskForNote(canvas, block) : null;
        if (currentNoteTask) currentNoteTask.notes = block.text;
        if (!block.blockHeight || contained) {
          fitThinkingText(text, block.type === "text" ? 32 : nested ? 32 : 36);
        }
        if (!nested || insideCanvas) {
          const naturalWidth = thinkingBlockNaturalWidth(block);
          card.style.width = naturalWidth + "px";
          growThinkingCanvasForBlock(canvas, block, naturalWidth, card.offsetHeight);
        }
        layoutVisibleThinkingStuckBlocks(canvas);
        touchCanvas(canvas);
        if (currentAction || currentNoteTask) refreshThinkingActionViews();
        requestThinkingLinks(canvas);
      });

      if (block.type === "journal") {
        taskBody = document.createElement("div");
        taskBody.className = "thinking-journal__body";
        const when = document.createElement("span");
        when.className = "thinking-journal__date";
        when.textContent = shortDateLabel(block.journalDate || todayKey());
        taskBody.append(when, text);
      } else if (block.type === "step") {
        const ticked = !!block.stepDone;
        taskBody = document.createElement("div");
        taskBody.className = "thinking-task__body";
        const check = document.createElement("button");
        check.type = "button";
        check.className = "thinking-task__check";
        check.setAttribute("role", "checkbox");
        check.setAttribute("aria-label", translate("doneAria"));
        check.setAttribute("aria-checked", ticked ? "true" : "false");
        check.innerHTML = thinkingIconSvg("check");
        check.addEventListener("click", function (event) {
          event.stopPropagation();
          block.stepDone = !block.stepDone;
          touchCanvas(canvas);
          renderThinkingCanvas(canvas);
        });
        taskBody.append(check, text);
      } else if (block.type === "task") {
        taskBody = document.createElement("div");
        taskBody.className = "thinking-task__body";
        const check = document.createElement("button");
        check.type = "button";
        check.className = "thinking-task__check";
        check.setAttribute("role", "checkbox");
        check.setAttribute("aria-label", translate("doneAria"));
        check.setAttribute("aria-checked", linkedTask && linkedTask.done ? "true" : "false");
        check.innerHTML = thinkingIconSvg("check");
        if (!linkedTask) check.disabled = true;
        check.addEventListener("click", function (event) {
          event.stopPropagation();
          const item = thinkingTaskItem(block);
          if (!item) return;
          if (block.subtaskId) {
            item.done = !item.done;
            saveState();
            refreshThinkingTaskViews();
          } else {
            toggleItem("tasks", block.taskId);
          }
          renderThinkingCanvas(canvas);
        });
        taskBody.append(check, text);
      }

      children = createThinkingChildren(canvas, block, ownerCanvas, card);
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
    if (organization) {
      const fold = document.createElement("button");
      fold.type = "button";
      fold.className = "thinking-block__canvas-action";
      fold.dataset.canvasFold = "true";
      fold.setAttribute("aria-label", translate(block.collapsed
        ? "thinkingExpandOrganization" : "thinkingCollapseOrganization"));
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
      fullscreen.setAttribute("aria-label", translate("thinkingOpenOrganization"));
      fullscreen.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg>';
      fullscreen.addEventListener("click", function () {
        const rect = card.getBoundingClientRect();
        navigateThinkingCanvas(block.id, { kind: "open",
          origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } });
      });
      actions.append(fold, fullscreen);
    }

    /* An organization block has no footer strip: its count and its two canvas
       actions ride in the head, at the far end of the filet. */
    if (organization) {
      head.insertBefore(count, del);
      head.insertBefore(actions, del);
    } else {
      foot.append(count, actions);
    }

    let blockResize = null;
    if (block.type === "folder" && !contained && !block.collapsed) {
      blockResize = document.createElement("button");
      blockResize.type = "button";
      blockResize.className = "thinking-block__resize thinking-folder__resize";
      blockResize.setAttribute("aria-label", translate("thinkingResizeFolder"));
      armThinkingFolderResize(blockResize, card, folderList, block, canvas);
    } else if (!organization && !contained && !flow) {
      blockResize = document.createElement("button");
      blockResize.type = "button";
      blockResize.className = "thinking-block__resize";
      blockResize.setAttribute("aria-label", translate("thinkingResizeBlock"));
      armThinkingBlockResize(blockResize, card, block, canvas);
    }

    let soloDrag = null;
    if (stuckListLead) {
      soloDrag = document.createElement("button");
      soloDrag.type = "button";
      soloDrag.className = "thinking-block__solo-drag";
      soloDrag.setAttribute("aria-label", translate("thinkingMoveStuckSingle"));
      armThinkingDrag(soloDrag, card, block, canvas, nested, insideCanvas);
    }

    let stickAdd = null;
    if (stickAdditionSide) {
      stickAdd = document.createElement("button");
      stickAdd.type = "button";
      stickAdd.className = "thinking-block__stick-add thinking-block__stick-add--"
        + stickAdditionSide;
      stickAdd.textContent = "+";
      stickAdd.setAttribute("aria-label", translate("thinkingAddStuck"));
      stickAdd.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        const rect = card.getBoundingClientRect();
        let x = rect.left + rect.width / 2;
        let y = rect.top + rect.height / 2;
        if (stickAdditionSide === "top") y = rect.top;
        else if (stickAdditionSide === "right") x = rect.right;
        else if (stickAdditionSide === "bottom") y = rect.bottom;
        else x = rect.left;
        addThinkingBlock(block.type, { x: x, y: y }, null, block.id, stickAdditionSide);
      });
    }

    card.appendChild(head);
    if (soloDrag) card.appendChild(soloDrag);
    if (block.type === "folder" || block.type === "logbook") {
      card.appendChild(folderList);
    } else if (organization) {
      card.appendChild(canvasStage);
    } else {
      if (taskBody || text) card.appendChild(taskBody || text);
      if (flow || children.childElementCount) card.appendChild(children);
    }
    if (!organization && !flow && (linked || actions.childElementCount)) card.appendChild(foot);
    if (blockResize) card.appendChild(blockResize);
    if (stickAdd) card.appendChild(stickAdd);
    if (text && (!block.blockHeight || contained)) requestAnimationFrame(function () {
      fitThinkingText(text, block.type === "text" ? 32 : nested ? 32 : 36);
      layoutVisibleThinkingStuckBlocks(canvas);
      requestThinkingLinks(canvas);
    });
    armThinkingSelection(card, head, block, canvas, contained);
    armThinkingLinkTool(card, block, canvas);
    if (organization) armThinkingCanvasClicks(card, head, block, canvas);
    return card;
  }

  function removeThinkingBlock(canvas, id) {
    removeThinkingBlocks(canvas, [id]);
  }

  function removeThinkingSelection(canvas) {
    const selected = selectedThinkingBlocks(canvas);
    const ids = [];
    for (let i = 0; i < selected.length; i++) ids.push(selected[i].id);
    if (ids.length) removeThinkingBlocks(canvas, ids);
  }

  function removeThinkingBlocks(canvas, ids) {
    const roots = [];
    const removedIds = {};
    const removedBranches = {};
    const removedBlocks = [];
    const removedLinks = [];
    const releasedChildren = [];
    for (let i = 0; i < ids.length; i++) {
      const root = findThinkingParent(canvas, ids[i]);
      if (!root || removedIds[root.id]) continue;
      roots.push(root);
      removedIds[root.id] = true;
      if (isThinkingOrganization(root)) removedBranches[root.id] = true;
    }
    if (!roots.length) return;
    const stickSnapshot = thinkingStickSnapshot(canvas);
    let foundChild = true;
    while (foundChild) {
      foundChild = false;
      for (let i = 0; i < canvas.blocks.length; i++) {
        const block = canvas.blocks[i];
        if (!removedIds[block.id] && removedBranches[block.parentId]) {
          removedIds[block.id] = true;
          removedBranches[block.id] = true;
          foundChild = true;
        }
      }
    }
    detachThinkingIdsFromSticks(canvas, removedIds);
    for (let i = 0; i < roots.length; i++) {
      const removed = roots[i];
      if (isThinkingOrganization(removed)) continue;
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
    let selectionRemains = false;
    for (const selectedId in thinkingSelectedIds) {
      if (removedIds[selectedId]) delete thinkingSelectedIds[selectedId];
      else selectionRemains = true;
    }
    if (!selectionRemains) thinkingSelectionParentId = null;
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
        const restoredParent = findThinkingParent(canvas, child.parentId);
        if (restoredParent) {
          syncThinkingBlockTaskPlacement(canvas, child.block, restoredParent);
        }
        child.block.parentId = child.parentId;
        child.block.x = child.x;
        child.block.y = child.y;
      }
      for (let i = 0; i < removedLinks.length; i++) {
        const item = removedLinks[i];
        canvas.links.splice(Math.min(item.index, canvas.links.length), 0, item.link);
      }
      restoreThinkingStickSnapshot(canvas, stickSnapshot);
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

  /* going away while it was the live target means something was just dropped in
     it, same as the bin under the rule of time: the lid takes it and shuts */
  function hideThinkingTrash() {
    clearTimeout(thinkingTrashTimer);
    const took = thinkingTrash.classList.contains("is-active");
    thinkingTrash.classList.remove("is-active");
    thinkingTrash.classList.toggle("is-tossing", took);
    thinkingTrash.setAttribute("aria-hidden", "true");
    thinkingTrashTimer = setTimeout(function () {
      thinkingTrash.classList.remove("is-visible", "is-tossing");
      thinkingTrash.hidden = true;
    }, took ? 620 : 180);
    if (!took) thinkingTrash.classList.remove("is-visible");
  }

  function pointInsideThinkingTrash(x, y) {
    if (thinkingTrash.hidden) return false;
    const rect = thinkingTrash.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function clearThinkingDropTargets() {
    const targets = thinkingBlocks.querySelectorAll(".is-drop-target, .is-stick-target");
    for (let i = 0; i < targets.length; i++) {
      targets[i].classList.remove("is-drop-target", "is-stick-target",
        "is-stick-target-top", "is-stick-target-right",
        "is-stick-target-bottom", "is-stick-target-left");
    }
  }

  function markThinkingCombineOptions(canvas, block, on) {
    const cards = thinkingBlocks.querySelectorAll(".thinking-block");
    for (let i = 0; i < cards.length; i++) {
      const candidate = findThinkingParent(canvas, cards[i].dataset.blockId);
      cards[i].classList.toggle("is-drop-option", on
        && canCombineThinkingBlocks(canvas, block, candidate));
      cards[i].classList.toggle("is-stick-option", on
        && canStickThinkingBlocks(canvas, block, candidate));
    }
  }

  function canStickThinkingBlocks(canvas, block, target) {
    if (!block || !target || target.id === block.id) return false;
    const targetParent = findThinkingParent(canvas, target.parentId);
    if (!targetParent) return false;
    if (isThinkingOrganization(targetParent)) {
      if (targetParent.type === "folder"
          || !thinkingOrganizationAllows(targetParent, block)) return false;
    } else if (block.parentId !== targetParent.id
        && !canCombineThinkingBlocks(canvas, block, targetParent)) {
      return false;
    }
    let branch = target;
    while (branch) {
      if (branch.id === block.id) return false;
      branch = branch.parentId ? findThinkingParent(canvas, branch.parentId) : null;
    }
    branch = target;
    while (branch && branch.stuckToId) {
      if (branch.stuckToId === block.id) return false;
      branch = findThinkingParent(canvas, branch.stuckToId);
    }
    return true;
  }

  function thinkingStickDrop(draggedCard, block, canvas) {
    if (!draggedCard) return null;
    const draggedRect = draggedCard.getBoundingClientRect();
    const corners = [
      { x: draggedRect.left, y: draggedRect.top,
        sides: ["bottom", "right"] },
      { x: draggedRect.right, y: draggedRect.top,
        sides: ["bottom", "left"] },
      { x: draggedRect.left, y: draggedRect.bottom,
        sides: ["top", "right"] },
      { x: draggedRect.right, y: draggedRect.bottom,
        sides: ["top", "left"] }
    ];
    let best = null;
    const snapDistance = 14;
    const cards = thinkingBlocks.querySelectorAll(".thinking-block");
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (card === draggedCard || draggedCard.contains(card)) continue;
      const target = findThinkingParent(canvas, card.dataset.blockId);
      if (!canStickThinkingBlocks(canvas, block, target)) continue;
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      for (let j = 0; j < corners.length; j++) {
        for (let k = 0; k < corners[j].sides.length; k++) {
          const side = corners[j].sides[k];
          const horizontal = side === "top" || side === "bottom";
          const aligned = horizontal
            ? corners[j].x >= rect.left && corners[j].x <= rect.right
            : corners[j].y >= rect.top && corners[j].y <= rect.bottom;
          if (!aligned) continue;
          let distance;
          if (side === "top") distance = Math.abs(corners[j].y - rect.top);
          else if (side === "right") distance = Math.abs(corners[j].x - rect.right);
          else if (side === "bottom") distance = Math.abs(corners[j].y - rect.bottom);
          else distance = Math.abs(corners[j].x - rect.left);
          if (distance <= snapDistance && (!best || distance < best.distance)) {
            best = { card: card, target: target, side: side, distance: distance };
          }
        }
      }
    }
    return best;
  }

  function markThinkingStickTarget(drop) {
    if (!drop) return;
    drop.card.classList.add("is-stick-target", "is-stick-target-" + drop.side);
  }

  function stickThinkingBlock(canvas, block, target, side) {
    if (!canStickThinkingBlocks(canvas, block, target)
        || THINKING_STICK_SIDES.indexOf(side) === -1) return false;
    const detached = {};
    detached[block.id] = true;
    detachThinkingIdsFromSticks(canvas, detached);

    const targetParent = findThinkingParent(canvas, target.parentId);
    const targetAnchor = findThinkingParent(canvas, target.stuckToId);
    if (block.parentId !== targetParent.id) {
      syncThinkingBlockTaskPlacement(canvas, block, targetParent);
    }
    block.parentId = targetParent.id;
    if (!isThinkingOrganization(targetParent)) {
      delete block.blockWidth;
      delete block.blockHeight;
      delete block.folderOrder;
    }
    block.x = target.x;
    block.y = target.y;
    if (targetAnchor && oppositeThinkingStickSide(target.stuckSide) === side) {
      block.stuckToId = targetAnchor.id;
      block.stuckSide = target.stuckSide;
      target.stuckToId = block.id;
      return true;
    }

    const next = thinkingAttachedBlock(canvas, target.id, side, block.id);
    block.stuckToId = target.id;
    block.stuckSide = side;
    if (next) {
      next.stuckToId = block.id;
      next.stuckSide = side;
    }
    return true;
  }

  function canCombineThinkingBlocks(canvas, child, possibleParent) {
    if (!possibleParent || possibleParent.id === child.id) return false;
    const childTask = child.type === "task" ? thinkingTaskItem(child) : null;
    if (isThinkingOrganization(child) && !isThinkingOrganization(possibleParent)) return false;
    if (THINKING_FLOW_TYPES.indexOf(possibleParent.type) !== -1
        && THINKING_ACTION_TYPES.indexOf(child.type) === -1
        && THINKING_FLOW_TYPES.indexOf(child.type) === -1) return false;
    if (isThinkingOrganization(possibleParent)
        && (!thinkingOrganizationAllows(possibleParent, child)
          || (possibleParent.collapsed && possibleParent.id !== viewedCanvasId))) {
      return false;
    }
    if (child.type === "task" && possibleParent.type === "task"
        && (possibleParent.subtaskId
          || (childTask && childTask.subtasks && childTask.subtasks.length)
          || (child.taskId && child.taskId === possibleParent.taskId))) return false;
    let branch = possibleParent;
    while (branch) {
      if (branch.id === child.id) return false;
      branch = branch.parentId ? findThinkingParent(canvas, branch.parentId) : null;
    }
    return true;
  }

  function canIntegrateThinkingSelection(canvas, selected, possibleParent, sourceParentId) {
    const source = sourceParentId === undefined ? thinkingSelectionParentId : sourceParentId;
    if (!isThinkingOrganization(possibleParent)
        || (possibleParent.collapsed && possibleParent.id !== viewedCanvasId)
        || possibleParent.id === source) return false;
    for (let i = 0; i < selected.length; i++) {
      if (!canCombineThinkingBlocks(canvas, selected[i], possibleParent)) return false;
    }
    return true;
  }

  function markThinkingSelectionCanvasOptions(canvas, selected, on, sourceParentId) {
    const cards = thinkingBlocks.querySelectorAll(".thinking-block--organization");
    for (let i = 0; i < cards.length; i++) {
      const candidate = findThinkingParent(canvas, cards[i].dataset.blockId);
      cards[i].classList.toggle("is-drop-option", on
        && canIntegrateThinkingSelection(canvas, selected, candidate, sourceParentId));
    }
  }

  function thinkingOrganizationDropContainers() {
    return thinkingBlocks.querySelectorAll(".thinking-canvas__stage, .thinking-folder__list");
  }

  function thinkingDropContainerParent(canvas, container) {
    const card = container.closest(".thinking-block--organization");
    const id = container.dataset.organizationId || (card ? card.dataset.blockId : null);
    return id ? findThinkingParent(canvas, id) : null;
  }

  function thinkingDropContainerHost(container) {
    if (container.classList.contains("thinking-folder__list")) return container;
    return container.closest(".thinking-block--organization");
  }

  function thinkingSelectionCanvasDropParent(clientX, clientY, selected, canvas,
      sourceParentId) {
    const stages = thinkingOrganizationDropContainers();
    let chosen = null;
    let chosenArea = Infinity;
    for (let i = 0; i < stages.length; i++) {
      const rect = stages[i].getBoundingClientRect();
      if (!rect.width || !rect.height || clientX < rect.left || clientX > rect.right
          || clientY < rect.top || clientY > rect.bottom) continue;
      const candidate = thinkingDropContainerParent(canvas, stages[i]);
      if (!canIntegrateThinkingSelection(canvas, selected, candidate, sourceParentId)) continue;
      const area = rect.width * rect.height;
      if (!chosen || chosen.contains(stages[i]) || area < chosenArea) {
        chosen = stages[i];
        chosenArea = area;
      }
    }
    return chosen ? thinkingDropContainerHost(chosen) : null;
  }

  function integrateThinkingSelectionInCanvas(canvas, starts, targetCard, sourceParentId,
      updateSelection) {
    if (!targetCard) return false;
    const target = findThinkingParent(canvas,
      targetCard.dataset.organizationId || targetCard.dataset.blockId);
    if (!target) return false;
    const stage = target.type === "folder" ? targetCard
      : targetCard.querySelector(".thinking-canvas__stage");
    const selected = [];
    for (let i = 0; i < starts.length; i++) selected.push(starts[i].block);
    if (!stage || !canIntegrateThinkingSelection(canvas, selected, target,
      sourceParentId)) return false;
    if (target.type === "folder") {
      for (let i = 0; i < starts.length; i++) {
        placeThinkingBlockInFolder(canvas, starts[i].block, target, stage, null, null);
      }
      if (updateSelection !== false) thinkingSelectionParentId = target.id;
      return true;
    }
    const stageRect = stage.getBoundingClientRect();
    const preview = thinkingCanvasPreviewOrigin(target, stage.clientWidth, stage.clientHeight);
    for (let i = 0; i < starts.length; i++) {
      const rect = starts[i].card.getBoundingClientRect();
      starts[i].block.parentId = target.id;
      starts[i].block.x = preview.x + rect.left - stageRect.left;
      starts[i].block.y = preview.y + rect.top - stageRect.top;
    }
    if (updateSelection !== false) thinkingSelectionParentId = target.id;
    for (let i = 0; i < starts.length; i++) {
      growThinkingCanvasForBlock(canvas, starts[i].block,
        starts[i].width, starts[i].height);
    }
    return true;
  }

  function thinkingCanvasDropParent(clientX, clientY, draggedElement, block, canvas) {
    const stages = thinkingOrganizationDropContainers();
    let chosen = null;
    let chosenArea = Infinity;
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      if (draggedElement && draggedElement.contains(stage)) continue;
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height || clientX < rect.left || clientX > rect.right
          || clientY < rect.top || clientY > rect.bottom) continue;
      const parent = thinkingDropContainerParent(canvas, stage);
      if (!canCombineThinkingBlocks(canvas, block, parent)) continue;
      const area = rect.width * rect.height;
      if (!chosen || chosen.contains(stage) || area < chosenArea) {
        chosen = stage;
        chosenArea = area;
      }
    }
    return chosen ? thinkingDropContainerHost(chosen) : null;
  }

  function thinkingDropParent(clientX, clientY, card, block, canvas) {
    const underPointer = document.elementsFromPoint(clientX, clientY);
    for (let i = 0; i < underPointer.length; i++) {
      if (card.contains(underPointer[i])) continue;
      const target = underPointer[i].closest
        ? underPointer[i].closest(".thinking-block") : null;
      if (!target) continue;
      const parent = findThinkingParent(canvas, target.dataset.blockId);
      if (isThinkingOrganization(parent)) continue;
      if (canCombineThinkingBlocks(canvas, block, parent)) return target;
    }
    return thinkingCanvasDropParent(clientX, clientY, card, block, canvas);
  }

  function placeBlockInThinkingParent(canvas, block, parentElement, lastPoint, start) {
    const parent = findThinkingParent(canvas,
      parentElement.dataset.organizationId || parentElement.dataset.blockId);
    if (!parent) return;
    syncThinkingBlockTaskPlacement(canvas, block, parent);
    block.parentId = parent.id;
    if (!isThinkingOrganization(parent)) {
      delete block.blockWidth;
      delete block.blockHeight;
      delete block.folderOrder;
      return;
    }
    if (parent.type === "folder") {
      placeThinkingBlockInFolder(canvas, block, parent, parentElement,
        lastPoint.x, lastPoint.y);
      return;
    }
    delete block.folderOrder;
    const canvasStage = parentElement.querySelector(".thinking-canvas__stage");
    if (!canvasStage) return;
    const rect = canvasStage.getBoundingClientRect();
    const preview = thinkingCanvasPreviewOrigin(parent, canvasStage.clientWidth,
      canvasStage.clientHeight);
    block.x = preview.x + Math.max(10, lastPoint.x - start.offsetX - rect.left);
    block.y = preview.y + Math.max(10, lastPoint.y - start.offsetY - rect.top);
    growThinkingCanvasForBlock(canvas, block, start.width, start.height);
  }

  function armThinkingStuckGroupDrag(handle, leadCard, leadBlock, canvas) {
    handle.addEventListener("pointerdown", function (event) {
      if (thinkingSelectionMode || event.button !== 0
          || event.target.closest("button, input, textarea, select")) return;
      const members = thinkingStuckComponent(canvas, leadBlock);
      if (members.length < 2) return;
      handle.setPointerCapture(event.pointerId);
      const starts = [];
      for (let i = 0; i < members.length; i++) {
        const card = thinkingBlocks.querySelector('[data-block-id="' + members[i].id + '"]');
        if (!card) continue;
        starts.push({
          block: members[i], card: card,
          x: members[i].x, y: members[i].y,
          left: card.offsetLeft, top: card.offsetTop,
          width: card.offsetWidth, height: card.offsetHeight
        });
      }
      if (starts.length < 2) return;
      const pointerId = event.pointerId;
      const sourceParentId = leadBlock.parentId;
      const startX = event.clientX;
      const startY = event.clientY;
      let leftEdge = Infinity;
      let topEdge = Infinity;
      let rightEdge = -Infinity;
      let bottomEdge = -Infinity;
      for (let i = 0; i < starts.length; i++) {
        leftEdge = Math.min(leftEdge, starts[i].x);
        topEdge = Math.min(topEdge, starts[i].y);
        rightEdge = Math.max(rightEdge, starts[i].x + starts[i].width);
        bottomEdge = Math.max(bottomEdge, starts[i].y + starts[i].height);
      }
      let moved = false;
      let dropCanvas = null;
      const move = function (moveEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        const rawDx = moveEvent.clientX - startX;
        const rawDy = moveEvent.clientY - startY;
        const dx = Math.max(18 - leftEdge,
          Math.min(THINKING_WORLD_WIDTH - 18 - rightEdge, rawDx));
        const dy = Math.max(18 - topEdge,
          Math.min(THINKING_WORLD_HEIGHT - 18 - bottomEdge, rawDy));
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moveEvent.preventDefault();
        if (!moved) {
          leadCard.dataset.dragged = "true";
          showThinkingTrash();
          thinkingBoard.classList.add("is-combining");
          markThinkingSelectionCanvasOptions(canvas, members, true, sourceParentId);
        }
        moved = true;
        for (let i = 0; i < starts.length; i++) {
          starts[i].block.x = starts[i].x + dx;
          starts[i].block.y = starts[i].y + dy;
          starts[i].card.style.left = starts[i].left + dx + "px";
          starts[i].card.style.top = starts[i].top + dy + "px";
          starts[i].card.classList.add("is-group-dragging");
        }
        clearThinkingDropTargets();
        dropCanvas = thinkingSelectionCanvasDropParent(moveEvent.clientX,
          moveEvent.clientY, members, canvas, sourceParentId);
        if (dropCanvas) dropCanvas.classList.add("is-drop-target");
        thinkingTrash.classList.toggle("is-active",
          pointInsideThinkingTrash(moveEvent.clientX, moveEvent.clientY));
        requestThinkingLinks(canvas);
      };
      const up = function (upEvent) {
        if (upEvent.pointerId !== pointerId) return;
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        const cancelled = upEvent.type === "pointercancel";
        const deleted = moved && !cancelled
          && pointInsideThinkingTrash(upEvent.clientX, upEvent.clientY);
        hideThinkingTrash();
        thinkingBoard.classList.remove("is-combining");
        markThinkingSelectionCanvasOptions(canvas, members, false, sourceParentId);
        clearThinkingDropTargets();
        for (let i = 0; i < starts.length; i++) {
          starts[i].card.classList.remove("is-group-dragging");
          if (cancelled || deleted) {
            starts[i].block.x = starts[i].x;
            starts[i].block.y = starts[i].y;
          }
        }
        if (!moved) return;
        if (deleted) {
          const ids = [];
          for (let i = 0; i < members.length; i++) ids.push(members[i].id);
          removeThinkingBlocks(canvas, ids);
          return;
        }
        if (!cancelled) {
          dropCanvas = thinkingSelectionCanvasDropParent(upEvent.clientX,
            upEvent.clientY, members, canvas, sourceParentId);
          if (!integrateThinkingSelectionInCanvas(canvas, starts, dropCanvas,
            sourceParentId, false)) {
            for (let i = 0; i < starts.length; i++) {
              growThinkingCanvasForBlock(canvas, starts[i].block,
                starts[i].width, starts[i].height);
            }
          }
          touchCanvas(canvas);
        }
        renderThinkingCanvas(canvas);
      };
      handle.addEventListener("pointermove", move, { passive: false });
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }

  function armThinkingDrag(handle, card, block, canvas, nested, insideCanvas) {
    handle.addEventListener("pointerdown", function (event) {
      if (thinkingSelectionMode) return;
      const interactive = event.target.closest("button, input, textarea, select");
      if (event.button !== 0 || (interactive && interactive !== handle)) return;
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
      let stickDrop = null;
      let stickSnapshot = null;
      let lastPoint = { x: event.clientX, y: event.clientY };
      card.classList.add("is-dragging");
      thinkingBoard.classList.add("is-combining");
      markThinkingCombineOptions(canvas, block, true);
      const move = function (moveEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        lastPoint = { x: moveEvent.clientX, y: moveEvent.clientY };
        if (!moved && Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) < 4) return;
        if (!moved) {
          stickSnapshot = thinkingStickSnapshot(canvas);
          const detached = {};
          detached[block.id] = true;
          detachThinkingIdsFromSticks(canvas, detached);
          layoutVisibleThinkingStuckBlocks(canvas);
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
          card.style.setProperty("width", start.width + "px", "important");
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
        stickDrop = thinkingStickDrop(card, block, canvas);
        dropParent = stickDrop ? null
          : thinkingDropParent(moveEvent.clientX, moveEvent.clientY, card, block, canvas);
        markThinkingStickTarget(stickDrop);
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
          restoreThinkingStickSnapshot(canvas, stickSnapshot);
          if (portaled) card.remove();
          renderThinkingCanvas(canvas);
          return;
        }
        if (deleted) {
          restoreThinkingStickSnapshot(canvas, stickSnapshot);
          if (portaled) card.remove();
          removeThinkingBlock(canvas, block.id);
          return;
        }
        stickDrop = thinkingStickDrop(card, block, canvas);
        dropParent = stickDrop ? null
          : thinkingDropParent(upEvent.clientX, upEvent.clientY, card, block, canvas);
        if (moved && !stickDrop && !dropParent && insideCanvas) {
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
        if (moved && stickDrop) {
          stickThinkingBlock(canvas, block, stickDrop.target, stickDrop.side);
        } else if (moved && dropParent) {
          placeBlockInThinkingParent(canvas, block, dropParent, lastPoint, start);
        } else if (moved && nested) {
          const planeRect = thinkingPlane.getBoundingClientRect();
          const viewedCanvas = currentThinkingCanvasNode();
          if (viewedCanvas && viewedCanvas.type === "folder") {
            const folderList = thinkingBlocks.querySelector(".thinking-folder__list--fullscreen");
            placeThinkingBlockInFolder(canvas, block, viewedCanvas, folderList,
              lastPoint.x, lastPoint.y);
          } else {
            if (viewedCanvas) syncThinkingBlockTaskPlacement(canvas, block, viewedCanvas);
            block.parentId = viewedCanvas ? viewedCanvas.id : canvas.id;
            delete block.folderOrder;
            block.x = Math.max(18, Math.min(THINKING_WORLD_WIDTH - 300,
              lastPoint.x - start.offsetX - planeRect.left));
            block.y = Math.max(18, Math.min(THINKING_WORLD_HEIGHT - 220,
              lastPoint.y - start.offsetY - planeRect.top));
          }
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

  function addThinkingBlock(type, point, dropParentId, stickTargetId, stickSide) {
    const canvas = currentCanvas();
    const viewedCanvas = currentThinkingCanvasNode();
    if (!canvas || !viewedCanvas) return;
    const organization = THINKING_ORGANIZATION_TYPES.indexOf(type) !== -1;
    if (!dropParentId && !thinkingOrganizationAllows(viewedCanvas, { type: type })) return;
    if (dropParentId) {
      const requestedParent = findThinkingParent(canvas, dropParentId);
      if (isThinkingOrganization(requestedParent)
          && !thinkingOrganizationAllows(requestedParent, { type: type })) return;
      if (requestedParent && THINKING_FLOW_TYPES.indexOf(requestedParent.type) !== -1
          && THINKING_ACTION_TYPES.indexOf(type) === -1
          && THINKING_FLOW_TYPES.indexOf(type) === -1) return;
    }
    const step = canvas.blocks.length;
    const flow = THINKING_FLOW_TYPES.indexOf(type) !== -1;
    const blockWidth = type === "folder" || type === "logbook" ? 420 : organization ? 650
      : flow ? 420 : type === "question" ? 176 : type === "text" ? 150 : 160;
    const blockHeight = type === "folder" || type === "logbook" ? 64
      : organization ? 330 + THINKING_CANVAS_CHROME
      : flow ? 210 : type === "question" ? 90 : type === "text" ? 56 : 64;
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
    if (THINKING_ACTION_TYPES.indexOf(type) !== -1) {
      linkThinkingBlockToNewAction(block, translate(type === "task" ? "newTaskName"
        : thinkingTypeKey(type)));
    }
    if (type === "loop") {
      block.blockWidth = 420;
      block.loopDays = [1, 2, 3, 4, 5];
      block.loopWeeks = 4;
    }
    if (type === "condition") {
      block.blockWidth = 420;
      block.conditionHour = "19:00";
    }
    if (organization) {
      block.title = "";
      block.cameraX = THINKING_WORLD_X;
      block.cameraY = THINKING_WORLD_Y;
      if (type === "folder" || type === "logbook") {
        block.blockWidth = 420;
      } else {
        block.canvasWidth = 650;
        block.canvasHeight = 330;
        block.previewX = THINKING_WORLD_X
          + thinkingViewport.clientWidth / 2 - (block.canvasWidth - 20) / 2;
        block.previewY = THINKING_WORLD_Y
          + thinkingViewport.clientHeight / 2 - block.canvasHeight / 2;
      }
      block.collapsed = true;
      if (type === "document") block.documentHtml = "";
    }
    if (point && stickTargetId) {
      const stickTarget = findThinkingParent(canvas, stickTargetId);
      if (stickTarget) stickThinkingBlock(canvas, block, stickTarget, stickSide);
    } else if (point && dropParentId) {
      const parentElement = thinkingBlocks.querySelector('.thinking-folder__list[data-organization-id="'
        + dropParentId + '"]') || thinkingBlocks.querySelector('.thinking-block[data-block-id="'
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
    if (block.parentId === viewedCanvas.id && viewedCanvas.type === "folder"
        && block.folderOrder == null) {
      block.folderOrder = nextThinkingFolderOrder(canvas, viewedCanvas);
    }
    canvas.blocks.push(block);
    growThinkingCanvasForBlock(canvas, block, blockWidth, blockHeight);
    touchCanvas(canvas);
    if (THINKING_ACTION_TYPES.indexOf(type) !== -1) refreshThinkingActionViews();
    renderThinkingCanvas(canvas);
    const parentAfterAdd = findThinkingParent(canvas, block.parentId);
    if (parentAfterAdd && parentAfterAdd.type === "folder") {
      requestAnimationFrame(function () {
        const folderCard = thinkingBlocks.querySelector('[data-block-id="'
          + parentAfterAdd.id + '"]');
        if (folderCard) growThinkingCanvasForBlock(canvas, parentAfterAdd,
          folderCard.offsetWidth, folderCard.offsetHeight);
      });
    }
    const field = thinkingBlocks.querySelector('[data-block-id="' + block.id + '"] textarea');
    if (field) {
      field.focus();
      if (type === "task") field.select();
    }
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
      let stickDrop = null;

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
        stickDrop = inside ? thinkingStickDrop(ghost, draft, canvas) : null;
        dropParent = inside && !stickDrop
          ? thinkingDropParent(moveEvent.clientX, moveEvent.clientY, ghost, draft, canvas) : null;
        markThinkingStickTarget(stickDrop);
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
        let finalStickDrop = null;
        if (!cancelled && pointInsideThinkingViewport(endEvent.clientX, endEvent.clientY)) {
          finalStickDrop = thinkingStickDrop(ghost, draft, canvas);
          if (!finalStickDrop) {
            finalDropParent = thinkingDropParent(endEvent.clientX, endEvent.clientY,
              ghost, draft, canvas);
          }
        }
        const finalDropParentId = finalDropParent ? finalDropParent.dataset.blockId : null;
        clearThinkingDropTargets();
        markThinkingCombineOptions(canvas, draft, false);
        thinkingBoard.classList.remove("is-tool-dragging");
        thinkingViewport.classList.remove("is-tool-drop");
        if (!cancelled && pointInsideThinkingViewport(endEvent.clientX, endEvent.clientY)) {
          addThinkingBlock(type, { x: endEvent.clientX, y: endEvent.clientY },
            finalDropParentId, finalStickDrop ? finalStickDrop.target.id : null,
            finalStickDrop ? finalStickDrop.side : null);
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

  function thinkingLinkBlockAt(clientX, clientY, sourceId) {
    const elements = document.elementsFromPoint(clientX, clientY);
    for (let i = 0; i < elements.length; i++) {
      const card = elements[i].closest ? elements[i].closest(".thinking-block") : null;
      if (card && card.dataset.blockId !== sourceId) return card;
    }
    return null;
  }

  function clearThinkingLinkPreview() {
    const preview = thinkingLinks.querySelector(".thinking-link-preview");
    if (preview) preview.remove();
    const targets = thinkingBlocks.querySelectorAll(".thinking-block.is-link-drop-target");
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

  function armThinkingLinkTool(card, block, canvas) {
    let suppressClick = false;
    card.addEventListener("click", function (event) {
      if (!thinkingLinkMode || event.target.closest(".thinking-block") !== card) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      chooseThinkingLink(canvas, block.id);
    }, true);
    card.addEventListener("dblclick", function (event) {
      if (!thinkingLinkMode || event.target.closest(".thinking-block") !== card) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    card.addEventListener("pointerdown", function (event) {
      if (!thinkingLinkMode || event.button !== 0
          || event.target.closest(".thinking-block") !== card) return;
      event.preventDefault();
      event.stopImmediatePropagation();
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
        const nextTarget = thinkingLinkBlockAt(moveEvent.clientX, moveEvent.clientY, block.id);
        if (target !== nextTarget) {
          if (target) target.classList.remove("is-link-drop-target");
          target = nextTarget;
          if (target) target.classList.add("is-link-drop-target");
        }
        drawThinkingLinkPreview(card, moveEvent.clientX, moveEvent.clientY, target);
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
    }, true);
  }

  function syncThinkingLinkMode() {
    thinkingLinkHint.hidden = !thinkingLinkMode || !thinkingLinkFrom;
    thinkingLinkTool.setAttribute("aria-pressed", thinkingLinkMode ? "true" : "false");
    thinkingLinkTool.title = translate("thinkingLinkTool");
    thinkingBoard.classList.toggle("is-link-tool", thinkingLinkMode);
    thinkingBoard.classList.toggle("is-linking", thinkingLinkMode && !!thinkingLinkFrom);
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
      /* A toile is a web, so a link is a thread and a thread has slack: it
         droops with its own length, and pulls taut while either end is being
         carried. The links are already redrawn on every move, so the tightening
         happens on its own as you drag. */
      const taut = fromEl.classList.contains("is-dragging")
        || toEl.classList.contains("is-dragging")
        || fromEl.classList.contains("is-group-dragging")
        || toEl.classList.contains("is-group-dragging");
      const span = Math.hypot(end.x - start.x, end.y - start.y);
      const droop = taut ? 0 : Math.min(34, span * .13);
      const d = "M " + start.x.toFixed(1) + " " + start.y.toFixed(1)
        + " C " + (start.x + bend * direction).toFixed(1) + " " + (start.y + droop).toFixed(1)
        + ", " + (end.x - bend * direction).toFixed(1) + " " + (end.y + droop).toFixed(1)
        + ", " + end.x.toFixed(1) + " " + end.y.toFixed(1);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "thinking-link");
      path.setAttribute("d", d);
      // a link wears the colour of what it comes from, so a board reads by hue
      const fromBlock = findThinkingParent(canvas, link.from);
      if (fromBlock) path.setAttribute("class", "thinking-link thinking-link--" + fromBlock.type);
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hit.setAttribute("class", "thinking-link-hit");
      hit.setAttribute("d", d);
      hit.addEventListener("pointerenter", function () { path.classList.add("is-doomed"); });
      hit.addEventListener("pointerleave", function () { path.classList.remove("is-doomed"); });
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
  thinkingSelect.addEventListener("click", function () {
    setThinkingSelectionMode(!thinkingSelectionMode);
  });
  thinkingLinkTool.addEventListener("click", function () {
    setThinkingLinkToolMode(!thinkingLinkMode);
  });
  thinkingToolSectionSwitch.addEventListener("click", cycleThinkingToolSection);
  thinkingSelectionCanvas.addEventListener("click", putThinkingSelectionInCanvas);
  const thinkingTools = document.querySelectorAll(".thinking-tool[data-block-type]");
  for (let i = 0; i < thinkingTools.length; i++) {
    // the palette shows the glyph the block will wear, off the same map
    thinkingTools[i].querySelector(".thinking-tool__mark").innerHTML =
      thinkingIconSvg(thinkingTypeIcon(thinkingTools[i].dataset.blockType));
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
    if (canvasNode.type === "document" && canvasNode.sheetX != null) {
      canvasNode.sheetX += dx;
      canvasNode.sheetY += dy;
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
      ? event.target.closest(".thinking-block, .thinking-folder__list, button, input, textarea, select, [contenteditable], .thinking-link-hit") : null;
    if (control) return;
    const viewedOrganization = currentThinkingCanvasNode();
    if (viewedOrganization && viewedOrganization.type === "folder") return;
    if (thinkingSelectionMode) {
      const canvas = currentCanvas();
      const canvasNode = currentThinkingCanvasNode();
      if (canvas && canvasNode) {
        event.preventDefault();
        beginThinkingSelectionBox(event, canvas, canvasNode.id, thinkingViewport);
      }
      return;
    }
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
    if (thinkingSelectionMode) return;
    const tree = currentCanvas();
    const canvasNode = currentThinkingCanvasNode();
    if (!tree || !canvasNode || !thinkingCanvasParent(tree, canvasNode)) return;
    if (event.target.closest("button, input, textarea, select, [contenteditable]")) return;
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
    const viewed = currentThinkingCanvasNode();
    if (canvas && viewed && viewed.type === "folder") renderThinkingCanvas(canvas);
    else if (canvas) requestThinkingLinks(canvas);
  });
  document.addEventListener("keydown", function (event) {
    if (thinkingView.hidden || !thinkingView.classList.contains("is-open")) return;
    if (event.key === "Escape") {
      closeThinking();
      return;
    }
    if (thinkingShortcutIsEditing(event.target)) return;
    if (event.key === "Delete") {
      const canvas = currentCanvas();
      const selected = selectedThinkingBlocks(canvas);
      const target = selected.length ? null : hoveredThinkingDeleteTarget(canvas);
      if (selected.length || target) {
        event.preventDefault();
        if (selected.length) removeThinkingSelection(canvas);
        else removeThinkingBlock(canvas, target.id);
      }
      return;
    }
    const key = event.key.toLowerCase();
    if (!event.ctrlKey && !event.metaKey && !event.altKey && key === "s") {
      if (event.repeat) return;
      event.preventDefault();
      setThinkingSelectionMode(!thinkingSelectionMode);
      return;
    }
    if (event.shiftKey || event.altKey || (!event.ctrlKey && !event.metaKey)) return;
    if (key === "c" && copyThinkingBlocks()) event.preventDefault();
    else if (key === "v" && pasteThinkingBlocks()) event.preventDefault();
  });

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
    if (!projectView.hidden) { closeProjectView(); return true; }
    if (!wellView.hidden) { closeWell(); return true; }
    if (!skyView.hidden) { closeSky(); return true; }
    if (openHost || openInlineProject) { closeAllInlineRows(); return true; }
    return false;
  }
  window.addEventListener("popstate", function () {
    if (closeTopOverlay()) history.pushState(null, "");   // re-arm for the next Back
  });
  history.pushState(null, "");   // arm the trap

  applyTheme(state.settings.theme);
  applyPalette(state.settings.palette);
  applyLanguage(state.settings.language);
  appReady = true;
  renderList("tasks");
  renderList("projects");
  renderHabits();
  renderEventCal();
  renderDailyTimeline();
  renderUndated();
  buildIconPicker();
  checkReminders();
  checkSleepReminder();
  setInterval(function () { checkReminders(); checkSleepReminder(); }, 30000);
  renderGreeting();
  renderWelcomeHabits();
  initSky();
  renderScene();   // the threshold is standing, so give it its place
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
