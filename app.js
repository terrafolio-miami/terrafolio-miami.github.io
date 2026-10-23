// Terrafolio app: the Today screen, Check yourself, and the Progress map.
// Reads data.json (built by build.py). Everything the reader does is kept on
// this device only, in localStorage; there are no accounts.
// The design and the research behind it are in docs/gamification.md.

(function () {
  "use strict";

  var KEY = "terrafolio";
  var LAST = 19;
  var MASTERED = 3;                                   // box 3 = right in three separate sessions
  var INTERVAL = { 1: 1, 2: 1, 3: 3, 4: 7, 5: 14 };   // days until a topic in this box is due again
  var MAX_REVIEWS = 5;
  var app = document.getElementById("app");
  var view = app.dataset.view || "today";

  // ---- storage and dates -------------------------------------------------

  function load() {
    var s;
    try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { s = {}; }
    s.seen = s.seen || {};
    s.topics = s.topics || {};
    s.active = s.active || [];
    s.reviewed = s.reviewed || [];
    s.milestones = s.milestones || {};
    s.shown = s.shown || [];
    if (s.chapter && !s.done) s.done = range(1, s.chapter - 1);  // readers from before the map
    s.done = s.done || [];
    return s;
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode: this visit only */ }
  }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function today() { return iso(new Date()); }
  function addDays(date, n) { var d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); }
  function weekday(date) { var w = new Date(date + "T12:00:00").getDay(); return w > 0 && w < 6; }
  function prevWeekday(date) { do { date = addDays(date, -1); } while (!weekday(date)); return date; }
  function nextWeekday(date) { do { date = addDays(date, 1); } while (!weekday(date)); return date; }
  function remember(list, date) { if (list.indexOf(date) < 0) list.push(date); while (list.length > 400) list.shift(); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function el(html) { app.innerHTML = html; window.scrollTo(0, 0); }
  function on(id, fn) { var b = document.getElementById(id); if (b) b.addEventListener("click", fn); }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  // ---- the weekday run (streak) ------------------------------------------
  // Counts weekdays the reader opened Today. Weekends never count against it.
  // A single missed weekday is repaired by a Check session on the next weekday.
  // It is never shown as broken: after a gap it simply starts again.

  function run(s, assumeRepair) {
    var reviewed = assumeRepair ? s.reviewed.concat([today()]) : s.reviewed;
    var day = weekday(today()) ? today() : prevWeekday(today());
    var n = 0;
    for (var i = 0; i < 400; i++) {
      if (s.active.indexOf(day) >= 0) n++;
      else if (day !== today() && reviewed.indexOf(nextWeekday(day)) >= 0 && s.active.indexOf(prevWeekday(day)) >= 0) { /* repaired */ }
      else if (day !== today()) break;
      day = prevWeekday(day);
    }
    if (n > (s.best || 0)) s.best = n;
    return n;
  }
  function runLine(s) {
    if (repairHint(s)) return "This run: " + run(s, true) + " weekdays, if you Check today";
    var n = run(s);
    if (!n) return "";
    if (n === 1) {
      var back = s.active.some(function (d) { return d < today(); });
      var monday = new Date().getDay() === 1;
      return back ? (monday ? "New week · day 1" : "Fresh start · day 1") : "Day 1";
    }
    return "This run: " + n + " weekdays" + (s.best > n ? " · Best: " + s.best : "");
  }
  function repairHint(s) {
    var t = today();
    if (!weekday(t)) return "";
    var missed = prevWeekday(t);
    if (s.active.indexOf(missed) >= 0 || s.reviewed.indexOf(t) >= 0) return "";
    return s.active.indexOf(prevWeekday(missed)) >= 0 ? "Missed a day? One Check today keeps your run going." : "";
  }

  // ---- mastery -----------------------------------------------------------

  function mastered(s, id) { var t = s.topics[id]; return !!t && t.box >= MASTERED; }
  function due(s, data) {
    return Object.keys(s.topics).filter(function (id) {
      return data.topics[id] && s.topics[id].due <= today() && s.topics[id].last !== today();
    }).sort(function (a, b) { return s.topics[a].due < s.topics[b].due ? -1 : 1; }).slice(0, MAX_REVIEWS);
  }
  function grade(s, id, right) {
    var t = s.topics[id] || { box: 0 };
    if (t.last === today()) return t;               // one step per topic per day: sessions must be days apart
    t.box = right ? Math.min((t.box || 0) + 1, 5) : 1;
    t.n = (t.n || 0) + 1;
    t.last = today();
    t.due = addDays(today(), INTERVAL[t.box]);
    s.topics[id] = t;
    return t;
  }
  function chapterMastery(s, data, n) {
    var ids = data.chapters[n].topics || [];
    return { total: ids.length, mastered: ids.filter(function (id) { return mastered(s, id); }).length };
  }
  function readiness(s, data) {
    var total = 0, got = 0;
    s.done.forEach(function (n) { var m = chapterMastery(s, data, n); total += m.total; got += m.mastered; });
    return total ? { pct: Math.round(100 * got / total), got: got, total: total } : null;
  }

  // ---- milestones ----------------------------------------------------------

  var MILESTONES = {
    "first-chapter": "First chapter done. One square filled on the map, and that is the whole point of this app.",
    "first-mastered": "First topic mastered: answered right in three separate sessions, days apart. That is how things stay remembered for an exam.",
    "halfway": "Halfway: Chapter 10 is done. Nine to go.",
    "all-done": "All nineteen chapters done. What is left is the state exam."
  };
  function award(s, data) {
    var t = today(), m = s.milestones;
    if ((s.doneCount || 0) >= 1 && !m["first-chapter"]) m["first-chapter"] = t;
    if (Object.keys(s.topics).some(function (id) { return mastered(s, id); }) && !m["first-mastered"]) m["first-mastered"] = t;
    if (s.done.indexOf(10) >= 0 && !m.halfway) m.halfway = t;
    if (s.done.length >= LAST && !m["all-done"]) m["all-done"] = t;
    Object.keys(data.chapters).forEach(function (n) {
      var c = chapterMastery(s, data, n);
      if (c.total && c.mastered === c.total && !m["mastered-" + n]) m["mastered-" + n] = t;
    });
  }
  function milestoneText(key) {
    if (MILESTONES[key]) return MILESTONES[key];
    var n = key.split("-")[1];
    return "Chapter " + n + " mastered: every topic in it answered right three times, days apart.";
  }
  function newMilestones(s) {
    var fresh = Object.keys(s.milestones).filter(function (k) { return s.shown.indexOf(k) < 0; });
    fresh.forEach(function (k) { s.shown.push(k); });
    return fresh.map(function (k) { return '<p class="milestone">' + esc(milestoneText(k)) + "</p>"; }).join("");
  }

  // ---- setup: chapter, then plan -------------------------------------------

  function picker(data, s) {
    var rows = Object.keys(data.chapters).map(function (n) {
      return '<li><button class="row" data-ch="' + n + '"' + (+n === s.chapter ? ' aria-current="true"' : "") + ">" +
        "Chapter " + n + "<small>" + esc(data.chapters[n].name) + "</small></button></li>";
    }).join("");
    el('<h1>Which chapter are you on?</h1><p class="tagline">The one you will open next in your course. Everything before it counts as done.</p>' +
      '<ul class="toc chapters">' + rows + "</ul>");
    app.querySelectorAll("button[data-ch]").forEach(function (b) {
      b.addEventListener("click", function () {
        s.chapter = +b.dataset.ch;
        s.done = range(1, s.chapter - 1);
        s.day = null;
        save(s);
        if (!s.planAsked) planner(data, s); else start(data);
      });
    });
  }

  function planner(data, s) {
    var ideas = ["Weekdays, with morning coffee", "Weekdays, on my lunch break", "Weekdays, before bed"];
    el('<h1>When will you read?</h1><p class="tagline">A time and a place you already have. People who name one follow through far more often.</p>' +
      ideas.map(function (i) { return '<button class="row" data-plan="' + esc(i) + '">' + esc(i) + "</button>"; }).join("") +
      '<p><input id="plan" class="field" placeholder="Or write your own" value="' + esc(s.plan || "") + '"></p>' +
      '<button class="done" id="save-plan">Save</button><p class="quiet"><button class="link" id="skip">Skip</button></p>');
    function finish(plan) { s.plan = plan; s.planAsked = true; save(s); start(data); }
    app.querySelectorAll("button[data-plan]").forEach(function (b) {
      b.addEventListener("click", function () { finish(b.dataset.plan); });
    });
    on("save-plan", function () { finish(document.getElementById("plan").value.trim()); });
    on("skip", function () { finish(s.plan || ""); });
  }

  // ---- Today -----------------------------------------------------------------

  function pick(s, chapter) {
    var items = chapter.items;
    if (!items.length) return null;
    var day = s.day;
    if (day && day.date === today() && day.chapter === s.chapter) {
      var kept = items.filter(function (i) { return i.id === day.id; })[0];
      if (kept) return kept;
    }
    var seen = s.seen[s.chapter] || [];
    var next = items.filter(function (i) { return seen.indexOf(i.id) < 0; })[0];
    if (!next) { seen = []; next = items[0]; }  // read them all: start the chapter's set over
    seen.push(next.id);
    s.seen[s.chapter] = seen;
    s.day = { date: today(), chapter: s.chapter, id: next.id };
    return next;
  }

  function todayView(data) {
    var s = load();
    if (!s.chapter) return picker(data, s);
    if (s.chapter > LAST) return finished(data, s);
    remember(s.active, today());
    var chapter = data.chapters[s.chapter];
    var item = pick(s, chapter);
    award(s, data);
    var banner = newMilestones(s);
    var streak = runLine(s);
    save(s);

    if (item && item.type === "deck") return deckView(data, s, item, banner, streak);

    var date = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    var body;
    if (!item) {
      body = "<p>There is nothing for Chapter " + s.chapter + " in the library yet. Read the chapter in your course.</p>";
    } else if (item.type === "note") {
      body = item.html;
    } else {
      body = '<article class="note"><p class="meta">From the Chapter ' + s.chapter + " companion</p>" +
        "<h2>" + esc(item.title) + "</h2>" + item.html +
        '<p class="pointer"><a href="' + item.href + '">This section in the companion</a></p></article>';
    }

    el(banner +
      '<p class="kicker">Today · ' + esc(date) + (streak ? " · " + esc(streak) : "") + "</p>" +
      "<h1>Chapter " + s.chapter + "</h1>" +
      '<p class="tagline">' + esc(chapter.name) + "</p>" +
      (s.plan ? '<p class="plan">Your plan: ' + esc(s.plan) + "</p>" : "") +
      body +
      checkLine(s, data, item) +
      (chapter.companion ? '<a class="next" href="' + chapter.companion + '"><small>Before you open the chapter</small>Read the Chapter ' + s.chapter + " companion →</a>" : "") +
      '<button class="done" id="done">Done with this chapter</button>' +
      '<p class="quiet"><button class="link" id="change">Change chapter</button></p>');

    on("check", function () { check(data, checkTopic(s, data, item)); });
    on("done", function () { doneWithChapter(data, s); });
    on("change", function () { picker(data, s); });
  }

  // ---- Today as cards ----------------------------------------------------------
  // One topic a day as four short cards and one question, like stories: tap the
  // right side (or swipe left) for the next card, the left side to go back.

  var LABELS = { idea: "The idea", scene: "Picture it", trap: "The trap", remember: "Remember" };

  function deckView(data, s, item, banner, streak) {
    var keys = ["idea", "scene", "trap", "remember"];
    var steps = keys.length + (item.question ? 1 : 0);
    var finishedToday = s.day && s.day.finished;
    var i = 0;

    function chrome(inner) {
      var bars = "";
      for (var k = 0; k < steps; k++) bars += '<span class="seg' + (k <= i ? " on" : "") + '"></span>';
      return banner +
        '<p class="kicker">Today · Chapter ' + s.chapter + (streak ? " · " + esc(streak) : "") + "</p>" +
        '<h1 class="deck-title">' + esc(item.title) + "</h1>" +
        '<div class="segments">' + bars + "</div>" + inner;
    }

    function show() {
      if (i < keys.length) {
        el(chrome('<div class="card" id="card"><p class="card-label">' + LABELS[keys[i]] + "</p>" +
          '<p class="card-text">' + esc(item.cards[keys[i]]) + "</p>" +
          '<p class="card-hint">' + (i === 0 ? "Tap to continue" : "") + "</p></div>"));
        var card = document.getElementById("card");
        card.addEventListener("click", function (e) {
          var r = card.getBoundingClientRect();
          go(e.clientX - r.left < r.width / 3 ? -1 : 1);
        });
        var x0 = null;
        card.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
        card.addEventListener("touchend", function (e) {
          if (x0 === null) return;
          var dx = e.changedTouches[0].clientX - x0;
          x0 = null;
          if (Math.abs(dx) > 40) { e.preventDefault(); go(dx < 0 ? 1 : -1); }
        });
      } else {
        ask();
      }
    }
    function go(d) {
      i = Math.max(0, i + d);
      if (i >= steps) return end();
      show();
    }

    function ask() {
      var q = item.question;
      el(chrome('<div class="card quiz"><p class="card-label">Quick check</p>' +
        '<p class="card-q">' + esc(q.q) + '</p><div class="options">' +
        q.options.map(function (o, k) { return '<button class="option" data-k="' + k + '">' + esc(o) + "</button>"; }).join("") +
        '</div><div id="feedback"></div></div>'));
      app.querySelectorAll("button.option").forEach(function (b) {
        b.addEventListener("click", function () {
          var right = +b.dataset.k === q.answer;
          app.querySelectorAll("button.option").forEach(function (o) {
            o.disabled = true;
            if (+o.dataset.k === q.answer) o.classList.add("right");
            else if (o === b) o.classList.add("wrong");
          });
          var s2 = load();
          if (data.topics[item.topic]) grade(s2, item.topic, right);
          remember(s2.reviewed, today());
          award(s2, data);
          save(s2);
          document.getElementById("feedback").innerHTML =
            '<p class="verdict">' + (right ? "Right." : "Not quite.") + "</p><p>" + esc(q.why) + "</p>" +
            '<button class="done" id="finish">Done for today</button>';
          on("finish", end);
        });
      });
    }

    function end() {
      var s2 = load();
      if (s2.day) s2.day.finished = true;
      award(s2, data);
      var b = newMilestones(s2);
      save(s2);
      s = s2;
      var chapter = data.chapters[s.chapter];
      el(b + '<p class="kicker">Today · Chapter ' + s.chapter + (streak ? " · " + esc(streak) : "") + "</p>" +
        "<h1>Done for today.</h1>" +
        '<p class="remember">' + esc(item.cards.remember) + "</p>" +
        '<p class="quiet-left"><button class="link" id="again">See the cards again</button> · <a class="link" href="' + item.href + '">Read the full section</a></p>' +
        checkLine(s, data, item) +
        (s.plan ? '<p class="plan">Your plan: ' + esc(s.plan) + "</p>" : "") +
        '<button class="done" id="done">Done with Chapter ' + s.chapter + " in my course</button>" +
        '<p class="quiet"><button class="link" id="change">Change chapter</button> · <a class="link" href="' + chapter.companion + '">Chapter ' + s.chapter + " companion</a></p>");
      on("again", function () { i = 0; show(); });
      on("check", function () { check(data, checkTopic(s, data, item)); });
      on("done", function () { doneWithChapter(data, s); });
      on("change", function () { picker(data, s); });
    }

    if (finishedToday) end(); else show();
  }

  function doneWithChapter(data, s) {
    var to = s.chapter + 1;
    var msg = to > LAST ? "Done with Chapter " + s.chapter + ", the last one?"
      : "Done with Chapter " + s.chapter + "? Today moves on to Chapter " + to + ".";
    if (!window.confirm(msg)) return;
    if (s.done.indexOf(s.chapter) < 0) s.done.push(s.chapter);
    s.doneCount = (s.doneCount || 0) + 1;
    s.chapter = to;
    s.day = null;
    save(s);
    todayView(data);
  }

  // The topic to check today: the day's own topic if it has questions, otherwise
  // the chapter's first quizzed topic not yet started (a note may sit outside them).
  function checkTopic(s, data, item) {
    if (item && item.topic && data.topics[item.topic]) return item.topic;
    var ids = data.chapters[s.chapter].topics || [];
    return ids.filter(function (id) { return !s.topics[id]; })[0] || null;
  }

  function checkLine(s, data, item) {
    var topic = checkTopic(s, data, item);
    var reviews = due(s, data).filter(function (id) { return id !== topic; }).length;
    var checked = topic && s.topics[topic] && s.topics[topic].last === today();
    var hint = repairHint(s);
    if (checked) {
      var t = s.topics[topic];
      return '<p class="check-done">Checked today. This topic comes back in ' + plural(INTERVAL[t.box], "day") +
        (mastered(s, topic) ? " (mastered)." : ".") + "</p>" +
        (reviews ? '<button class="check" id="check">' + plural(reviews, "topic") + " to review</button>" : "");
    }
    if (!topic && !reviews) return hint ? '<p class="check-done">' + esc(hint) + "</p>" : "";
    var label = topic ? "Check yourself · " + plural(data.topics[topic].questions.length, "question") : "";
    if (reviews) label += (label ? " · " : "") + plural(reviews, "topic") + " to review";
    return '<button class="check" id="check">' + label + "<small>Optional. Answers explain themselves.</small></button>" +
      (hint ? '<p class="check-done">' + esc(hint) + "</p>" : "");
  }

  function finished(data, s) {
    el("<h1>That was the last chapter.</h1><p>All nineteen are done. What is left is the state exam; the companions and your reviews stay here.</p>" +
      '<p><a class="next" href="progress.html">See your progress</a></p>' +
      '<p class="quiet"><button class="link" id="change">Change chapter</button></p>');
    on("change", function () { picker(data, s); });
  }

  // ---- Check yourself --------------------------------------------------------
  // Due reviews (one question each), then all of today's topic. Optional, no
  // timer, no score screen; every answer shows why.

  function check(data, topic) {
    var s = load();
    var queue = [];
    due(s, data).filter(function (id) { return id !== topic; }).forEach(function (id) {
      var qs = data.topics[id].questions;
      var t = s.topics[id];
      queue.push({ topic: id, q: qs[(t.n || 0) % qs.length], review: true });  // a different question each review
    });
    if (topic && data.topics[topic] && !(s.topics[topic] && s.topics[topic].last === today())) {
      data.topics[topic].questions.forEach(function (q) { queue.push({ topic: topic, q: q }); });
    }
    var results = {};
    var i = 0;

    function ask() {
      if (i >= queue.length) return finish();
      var item = queue[i], q = item.q, info = data.topics[item.topic];
      el('<p class="kicker">' + (item.review ? "Review" : "Check yourself") + " · " + (i + 1) + " of " + queue.length + "</p>" +
        '<p class="meta">Chapter ' + info.chapter + " · " + esc(info.title) + "</p>" +
        '<h2 class="question">' + esc(q.q) + "</h2>" +
        '<div class="options">' + q.options.map(function (o, k) {
          return '<button class="option" data-k="' + k + '">' + esc(o) + "</button>";
        }).join("") + "</div>" +
        '<div id="feedback"></div>' +
        '<p class="quiet"><button class="link" id="stop">Stop here</button></p>');
      app.querySelectorAll("button.option").forEach(function (b) {
        b.addEventListener("click", function () {
          var k = +b.dataset.k, right = k === q.answer;
          if (results[item.topic] === undefined) results[item.topic] = true;
          if (!right) results[item.topic] = false;
          app.querySelectorAll("button.option").forEach(function (o) {
            o.disabled = true;
            if (+o.dataset.k === q.answer) o.classList.add("right");
            else if (o === b) o.classList.add("wrong");
          });
          document.getElementById("feedback").innerHTML =
            '<p class="verdict">' + (right ? "Right." : "Not quite.") + "</p><p>" + esc(q.why) + "</p>" +
            '<button class="done" id="next">' + (i + 1 < queue.length ? "Next" : "Finish") + "</button>";
          on("next", function () { i++; ask(); });
        });
      });
      on("stop", finish);
    }

    function finish() {
      var s2 = load();
      var lines = Object.keys(results).map(function (id) {
        var t = grade(s2, id, results[id]);
        var title = esc(data.topics[id].title);
        if (!results[id]) return "<li>" + title + ": back tomorrow, so it sticks.</li>";
        return "<li>" + title + ": " + (t.box >= MASTERED ? "mastered, " : "") + "next review in " + plural(INTERVAL[t.box], "day") + ".</li>";
      });
      if (lines.length) remember(s2.reviewed, today());
      award(s2, data);
      var banner = newMilestones(s2);
      save(s2);
      el(banner + "<h1>" + (lines.length ? "Checked." : "Stopped.") + "</h1>" +
        (lines.length ? '<ul class="results">' + lines.join("") + "</ul>" : "<p>Nothing was recorded. Come back to it any time.</p>") +
        '<p><a class="next" href="./">Back to today</a></p>' +
        '<p class="quiet"><a class="link" href="progress.html">Progress</a></p>');
    }

    if (!queue.length) {
      el("<h1>Nothing to check right now.</h1><p>Today's topic is done and no reviews are due.</p>" +
        '<p><a class="next" href="./">Back to today</a></p>');
      return;
    }
    ask();
  }

  // ---- Progress (the course map) ---------------------------------------------

  function progressView(data) {
    var s = load();
    if (!s.chapter) {
      el('<h1>Your course</h1><p>Pick your chapter on the <a href="./">Today</a> screen and your map starts here.</p>');
      return;
    }
    award(s, data);
    var banner = newMilestones(s);
    var streak = runLine(s);
    save(s);

    var doneN = s.done.length;
    var rows = Object.keys(data.chapters).map(function (n) {
      n = +n;
      var state = s.done.indexOf(n) >= 0 ? "done" : n === s.chapter ? "current" : "todo";
      var m = chapterMastery(s, data, n);
      return '<li class="ch ' + state + '"><span class="dot">' + (state === "done" ? "✓" : n) + "</span>" +
        "<span>Chapter " + n + "<small>" + esc(data.chapters[n].name) +
        (m.total ? " · " + m.mastered + " of " + m.total + " topics mastered" : "") + "</small></span></li>";
    }).join("");
    var ready = readiness(s, data);
    var earned = Object.keys(s.milestones).sort(function (a, b) { return s.milestones[a] < s.milestones[b] ? -1 : 1; });
    var masteredN = Object.keys(s.topics).filter(function (id) { return mastered(s, id); }).length;

    el(banner + "<h1>Your course</h1>" +
      '<p class="tagline">' + doneN + " of 19 chapters done</p>" +
      '<div class="bar"><span style="width:' + Math.round(100 * doneN / LAST) + '%"></span></div>' +
      '<p class="stats">' + (streak ? esc(streak) + " · " : "") + plural(masteredN, "topic") + " mastered</p>" +
      (ready ? '<p class="stats">Exam readiness: ' + ready.pct + "% of the topics in your finished chapters are mastered (" + ready.got + " of " + ready.total + "). A guide, not a prediction.</p>"
        : '<p class="stats">Exam readiness appears once you finish a chapter that has questions.</p>') +
      '<ol class="map">' + rows + "</ol>" +
      (earned.length ? "<h2>Milestones</h2><ul class=\"results\">" + earned.map(function (k) {
        return "<li>" + esc(milestoneText(k)) + ' <span class="meta">' + s.milestones[k] + "</span></li>";
      }).join("") + "</ul>" : "") +
      "<h2>Your plan</h2><p>" + (s.plan ? esc(s.plan) : "No plan yet.") + ' <button class="link" id="plan">Change</button></p>' +
      '<button class="done" id="share">Share progress</button><pre id="share-text" class="share" hidden></pre>' +
      '<p class="quiet">Your progress is stored on this phone only.</p>');

    on("plan", function () { planner(data, s); });
    on("share", function () {
      var text = "Terrafolio: Chapter " + Math.min(s.chapter, LAST) + " · " + doneN + " of 19 chapters done · " +
        plural(masteredN, "topic") + " mastered" + (streak ? " · " + streak : "") + " · " + today();
      if (navigator.share) { navigator.share({ text: text }).catch(function () {}); return; }
      var box = document.getElementById("share-text");
      box.textContent = text;
      box.hidden = false;
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
    });
  }

  function start(data) { if (view === "progress") progressView(data); else todayView(data); }

  fetch("data.json")
    .then(function (r) { return r.json(); })
    .then(start)
    .catch(function () {
      el('<p>The app could not load. Open the <a href="library.html">library</a> instead.</p>');
    });
})();
