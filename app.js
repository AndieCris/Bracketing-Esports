(() => {
  const storageKey = "arena-circuit-tournaments-v1";
  const engine = window.TournamentEngine;
  const page = document.getElementById("app-page");
  const dialog = document.getElementById("app-dialog");
  const dialogForm = document.getElementById("dialog-form");
  const dialogBody = document.getElementById("dialog-body");
  const dialogFooter = document.getElementById("dialog-footer");
  const toast = document.getElementById("toast");
  const views = {
    overview: { title: "Overview", description: "Your tournament operations, one clear view." },
    bracket: { title: "Bracket", description: "Follow every path to the grand final." },
    teams: { title: "Teams", description: "Manage entries, rosters, seeds, and status." },
    matches: { title: "Matches", description: "Schedule fixtures and report series results." },
    public: { title: "Public view", description: "A read-only view for spectators on this device." },
  };
  const formatNames = {
    "single-elimination": "Single elimination",
    "double-elimination": "Double elimination",
    "round-robin": "Round robin",
  };
  const statusNames = { registration: "Registration", "in-progress": "In progress", completed: "Completed" };
  let state = loadState();
  let activeView = "overview";
  let pendingLogo = null;
  let toastTimer = null;
  let matchFilter = "all";

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && Array.isArray(saved.tournaments)) return saved;
    } catch (error) {
      console.warn("Could not read tournament data.", error);
    }
    return { tournaments: [], activeTournamentId: null };
  }

  function saveState(message) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      if (message) notify(message);
      return true;
    } catch (error) {
      notify("Browser storage is full. Export a backup or remove a logo and try again.", true);
      return false;
    }
  }

  function tournament() {
    return state.tournaments.find((item) => item.id === state.activeTournamentId) || null;
  }

  function makeId(prefix) {
    const random = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    return `${prefix}-${random}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function icon(name) {
    const paths = {
      edit: '<path d="m14 5 5 5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 9h18"/>',
      team: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19v-1.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V19zM16 5.3a3 3 0 0 1 0 5.4M17 13.2a4.6 4.6 0 0 1 3.5 4.5V19h-3"/>',
      trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/>',
      match: '<path d="M4 5h6v6H4zM14 13h6v6h-6zM10 8h4v8h-4"/>',
      download: '<path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3"/>',
      reset: '<path d="M4 11a8 8 0 1 1 2 5.3M4 5v6h6"/>',
      eye: '<path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.5"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
      export: '<path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3"/>',
      upload: '<path d="M12 15V3M7 8l5-5 5 5M4 17v3h16v-3"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.match}</svg>`;
  }

  function button(label, action, className = "button", symbol = "") {
    return `<button type="button" class="${className}" data-action="${escapeHtml(action)}">${symbol ? icon(symbol) : ""}<span>${escapeHtml(label)}</span></button>`;
  }

  function teamById(tournamentData, teamId) {
    return tournamentData.teams.find((team) => team.id === teamId) || null;
  }

  function teamAvatar(team, large = false) {
    const sizeClass = large ? "large" : "";
    if (team?.logo) return `<img class="team-logo ${sizeClass}" src="${escapeHtml(team.logo)}" alt="">`;
    const initials = (team?.name || "TBD").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    return `<span class="team-initials ${sizeClass}" aria-hidden="true">${escapeHtml(initials || "T")}</span>`;
  }

  function teamStatus(tournamentData, team) {
    if (!tournamentData.matches.length || tournamentData.status === "registration") return "Registered";
    if (tournamentData.format === "round-robin") return "Qualified";
    const losses = tournamentData.matches.filter((match) =>
      match.status === "completed" && match.loserId === team.id).length;
    const lossLimit = tournamentData.format === "double-elimination" ? 2 : 1;
    return losses >= lossLimit ? "Eliminated" : "Qualified";
  }

  function matchIsActual(match) {
    return !["bye", "empty", "conditional", "cancelled"].includes(match.status);
  }

  function realMatches(tournamentData) {
    return tournamentData.matches.filter(matchIsActual);
  }

  function standings(tournamentData) {
    const rows = engine.getStandings(tournamentData.teams, tournamentData.matches);
    const order = tournamentData.manualTieBreakOrder || [];
    const groups = new Map();
    for (const row of rows) {
      if (!row.tied) continue;
      if (!groups.has(row.rank)) groups.set(row.rank, []);
      groups.get(row.rank).push(row);
    }
    for (const [rank, group] of groups) {
      const indices = group.map((row) => order.indexOf(row.team.id));
      if (indices.some((index) => index < 0)) continue;
      group.sort((left, right) => order.indexOf(left.team.id) - order.indexOf(right.team.id));
      group.forEach((row, index) => {
        row.rank = rank + index;
        row.tied = false;
      });
    }
    return rows.sort((left, right) => left.rank - right.rank);
  }

  function championId(tournamentData) {
    if (!tournamentData.matches.length) return null;
    if (tournamentData.format === "round-robin") {
      if (!tournamentData.matches.every((match) => match.status === "completed")) return null;
      const rows = standings(tournamentData);
      if (!rows.length) return null;
      return rows[0].tied ? null : rows[0].team.id;
    }
    const reset = tournamentData.matches.find((match) => match.label === "Grand Final Reset");
    if (reset?.status === "completed") return reset.winnerId;
    if (reset?.status === "upcoming" || reset?.status === "waiting") return null;
    const finals = tournamentData.matches.filter((match) => match.bracket === "grand" || match.roundName === "Grand Final");
    const final = finals.find((match) => match.label === "Grand Final") || finals.at(-1);
    return final?.status === "completed" ? final.winnerId : null;
  }

  function refreshTournamentStatus(tournamentData) {
    if (!tournamentData.matches.length) {
      tournamentData.status = "registration";
      tournamentData.teams.forEach((team) => { team.status = "Registered"; });
      tournamentData.championId = null;
      return;
    }
    tournamentData.teams.forEach((team) => { team.status = teamStatus(tournamentData, team); });
    tournamentData.championId = championId(tournamentData);
    tournamentData.status = tournamentData.championId ? "completed" : "in-progress";
  }

  function formatDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
    if (!value) return "Date to be announced";
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, options).format(date);
  }

  function formatMatchDate(value) {
    if (!value) return "Time to be announced";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return value;
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
  }

  function displayStatus(match) {
    if (match.status === "completed") return "Completed";
    if (match.live) return "Live";
    if (match.status === "bye") return "Bye";
    if (match.status === "cancelled") return "Not needed";
    if (match.status === "conditional") return "Conditional";
    if (match.status === "waiting" || match.status === "empty") return "Waiting";
    return "Upcoming";
  }

  function statusClass(match) {
    if (match.status === "completed") return "completed";
    if (match.live) return "live";
    return "registration";
  }

  function matchScore(match, teamId) {
    if (match.result?.type !== "score") return match.result?.type === "forfeit" && match.winnerId === teamId ? "FF" : "";
    return match.teamAId === teamId ? match.result.scoreA : match.result.scoreB;
  }

  function renderTeamLine(tournamentData, teamId, match) {
    const team = teamById(tournamentData, teamId);
    const isWinner = match.winnerId && match.winnerId === teamId;
    const isLoser = match.loserId && match.loserId === teamId;
    const score = match.result ? matchScore(match, teamId) : "";
    return `<div class="team-line ${isWinner ? "winner" : ""}">
      ${teamAvatar(team)}<span>${escapeHtml(team?.name || "Waiting for team")}</span>
      ${score !== "" ? `<span class="score">${escapeHtml(score)}</span>` : ""}
      ${isLoser ? '<span class="sr-only">lost</span>' : ""}
    </div>`;
  }

  function renderBanner(tournamentData) {
    const status = tournamentData.status;
    return `<section class="tournament-banner">
      <div class="banner-main">
        <span class="event-mark">${escapeHtml((tournamentData.name || "AC").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase())}</span>
        <div class="banner-copy"><strong>${escapeHtml(tournamentData.name)}</strong><span>${escapeHtml(formatDate(tournamentData.date))} <span aria-hidden="true">/</span> ${escapeHtml(tournamentData.venue || "Venue not set")}</span></div>
      </div>
      <div class="banner-meta"><span class="status-chip ${status}">${escapeHtml(statusNames[status])}</span><span class="banner-divider"></span><span class="format-chip">${escapeHtml(formatNames[tournamentData.format])}</span></div>
    </section>`;
  }

  function renderStats(tournamentData) {
    const matches = realMatches(tournamentData);
    const done = matches.filter((match) => match.status === "completed").length;
    const upcoming = matches.filter((match) => match.status === "upcoming" && !match.live).length;
    const champion = teamById(tournamentData, tournamentData.championId);
    const stats = [
      ["Teams", tournamentData.teams.length, `of ${tournamentData.teamLimit} slots`, "team"],
      ["Matches", matches.length, `${matches.filter((match) => match.live).length} live now`, "match"],
      ["Completed", done, "results recorded", "check"],
      ["Upcoming", upcoming, "ready to play", "clock"],
      ["Champion", champion?.name || "TBD", champion ? "tournament winner" : "awaiting final", "trophy"],
    ];
    return `<section class="stat-grid" aria-label="Tournament statistics">${stats.map(([label, value, note, symbol]) => `
      <div class="stat"><div class="stat-label">${escapeHtml(label)}${icon(symbol)}</div><strong class="stat-value ${typeof value === "string" && value.length > 5 ? "text" : ""}">${escapeHtml(value)}</strong><small class="stat-note">${escapeHtml(note)}</small></div>`).join("")}</section>`;
  }

  function upcomingMatches(tournamentData, count = 5) {
    return realMatches(tournamentData).filter((match) => match.status === "upcoming" && !match.live)
      .sort((left, right) => {
        if (!left.scheduledAt) return 1;
        if (!right.scheduledAt) return -1;
        return left.scheduledAt.localeCompare(right.scheduledAt);
      }).slice(0, count);
  }

  function renderMatchRow(tournamentData, match, readOnly = false) {
    const completed = match.status === "completed";
    const sides = `${teamById(tournamentData, match.teamAId)?.name || "TBD"} vs ${teamById(tournamentData, match.teamBId)?.name || "TBD"}`;
    return `<div class="match-row">
      <div class="match-teams">${renderTeamLine(tournamentData, match.teamAId, match)}${renderTeamLine(tournamentData, match.teamBId, match)}</div>
      <div class="match-time"><strong>${escapeHtml(match.roundName || match.label)}</strong><span>${escapeHtml(formatMatchDate(match.scheduledAt))} / BO${match.bestOf || tournamentData.bestOf}</span></div>
      <div class="match-row-actions"><span class="status-chip ${statusClass(match)}">${escapeHtml(displayStatus(match))}</span>${readOnly || match.status === "waiting" ? "" : button(completed ? "Edit" : "Manage", `manage-match:${match.id}`, "text-button", completed ? "edit" : "calendar")}</div>
      <span class="sr-only">${escapeHtml(sides)}</span>
    </div>`;
  }

  function renderChecklist(tournamentData) {
    const completeRosters = tournamentData.teams.filter((team) => team.players.filter((player) => player.starter && player.name.trim()).length === 5).length;
    const generated = tournamentData.matches.length > 0;
    const done = tournamentData.status === "completed";
    const entries = [
      ["Tournament details", Boolean(tournamentData.name && tournamentData.format), "Name, format, date, venue"],
      ["Team registration", tournamentData.teams.length >= 2 && completeRosters === tournamentData.teams.length, `${tournamentData.teams.length} teams / ${completeRosters} complete rosters`],
      ["Bracket generated", generated, generated ? formatNames[tournamentData.format] : "Ready when at least 2 rosters are complete"],
      ["Champion decided", done, tournamentData.championId ? teamById(tournamentData, tournamentData.championId)?.name : "Results update the bracket automatically"],
    ];
    return `<section class="panel"><div class="panel-head"><div><h2>Event readiness</h2><p>Setup checklist</p></div><span class="tag acid">${entries.filter((entry) => entry[1]).length}/${entries.length} ready</span></div><div class="panel-body setup-checklist">${entries.map(([label, complete, note], index) => `
      <div class="check-row"><div class="check-copy"><span class="check-icon ${complete ? "done" : ""}">${complete ? icon("check") : String(index + 1).padStart(2, "0")}</span><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(note)}</small></span></div><span class="tag ${complete ? "acid" : ""}">${complete ? "Ready" : "Pending"}</span></div>`).join("")}</div></section>`;
  }

  function renderOverview(tournamentData) {
    const next = upcomingMatches(tournamentData, 4);
    const recent = realMatches(tournamentData).filter((match) => match.status === "completed").slice(-4).reverse();
    return `${renderBanner(tournamentData)}${renderStats(tournamentData)}
      <div class="overview-grid">
        <section class="section-block"><div class="section-heading"><div><div class="eyebrow">UP NEXT</div><h2>Match control</h2></div>${button("All matches", "view:matches", "text-button", "arrow")}</div>
          <div class="panel">${next.length ? `<div class="match-list">${next.map((match) => renderMatchRow(tournamentData, match)).join("")}</div>` : `<div class="match-empty">${tournamentData.matches.length ? "No upcoming matches. Your results are up to date." : "Generate a bracket to create the match schedule."}</div>`}</div>
          ${recent.length ? `<div class="section-heading" style="margin-top:22px"><div><div class="eyebrow">LATEST RESULTS</div><h2>Completed matches</h2></div></div><div class="panel"><div class="match-list">${recent.map((match) => renderMatchRow(tournamentData, match)).join("")}</div></div>` : ""}
        </section>
        <div class="section-block">${renderChecklist(tournamentData)}<section class="panel" style="margin-top:17px"><div class="panel-head"><div><h2>Event details</h2><p>Organizer workspace</p></div>${button("Edit", "edit-tournament", "text-button", "edit")}</div><div class="panel-body">
          <div class="activity-line"><span>Date</span><strong>${escapeHtml(formatDate(tournamentData.date))}</strong></div>
          <div class="activity-line"><span>Venue</span><strong>${escapeHtml(tournamentData.venue || "Not set")}</strong></div>
          <div class="activity-line"><span>Series default</span><strong>Best of ${tournamentData.bestOf}</strong></div>
          <div class="activity-line"><span>Roster capacity</span><strong>${tournamentData.teams.length} / ${tournamentData.teamLimit}</strong></div>
        </div></section></div>
      </div>`;
  }

  function renderEmpty() {
    return `<section class="empty-state">
      <div class="empty-copy"><div class="eyebrow">MLBB / TOURNAMENT DESK</div><h2>Your next champion starts here.</h2><p>Build the event, register the roster, then let the bracket carry every result through to the final.</p>${button("Create tournament", "new-tournament", "button button-primary", "plus")}</div>
      <div class="empty-visual" aria-hidden="true"><div class="empty-bracket"><div class="empty-round"><i class="empty-slot"></i><i class="empty-slot"></i><i class="empty-slot"></i><i class="empty-slot"></i></div><div class="empty-round"><i class="empty-slot"></i><i class="empty-slot"></i></div><div class="empty-round"><i class="empty-slot"></i></div></div><span class="empty-index">32 TEAM CAPACITY / LOCAL SAVE</span></div>
    </section>`;
  }

  function renderStatusChip(match) {
    return `<span class="status-chip ${statusClass(match)}">${escapeHtml(displayStatus(match))}</span>`;
  }

  function renderBracketMatch(tournamentData, match, readOnly = false) {
    const sources = `data-match-id="${escapeHtml(match.id)}" data-source-a="${escapeHtml(match.sourceA?.matchId || "")}" data-source-a-outcome="${escapeHtml(match.sourceA?.outcome || "")}" data-source-b="${escapeHtml(match.sourceB?.matchId || "")}" data-source-b-outcome="${escapeHtml(match.sourceB?.outcome || "")}" data-reset-source="${escapeHtml(match.resetSourceId || "")}"`;
    if (match.status === "conditional") return `<div class="bracket-match" ${sources}><div class="bracket-match-head"><span>${escapeHtml(match.label)}</span><span class="status-chip registration">Conditional</span></div><div class="bracket-empty">Reset if lower finalist wins</div></div>`;
    const getSide = (teamId, side) => {
      const team = teamById(tournamentData, teamId);
      const winner = Boolean(teamId && match.winnerId === teamId);
      const loser = Boolean(teamId && match.loserId === teamId);
      const score = match.result ? matchScore(match, teamId) : "";
      return `<div class="bracket-team ${winner ? "winner" : ""} ${loser ? "loser" : ""}">${teamAvatar(team)}<span class="bracket-team-name">${escapeHtml(team?.name || (match.status === "bye" ? "BYE" : "Waiting"))}</span>${score !== "" ? `<span class="bracket-score">${escapeHtml(score)}</span>` : ""}</div>`;
    };
    const headStatus = match.status === "bye" ? '<span class="tag">Bye</span>' : renderStatusChip(match);
    const manage = !readOnly && (match.status === "upcoming" || match.status === "completed");
    return `<div class="bracket-match" ${sources}>
      <div class="bracket-match-head"><span>${escapeHtml(match.label || match.roundName)}</span>${headStatus}</div>
      ${getSide(match.teamAId, "A")}${getSide(match.teamBId, "B")}
      ${manage ? `<div class="bracket-match-head">${button(match.status === "completed" ? "Edit result" : "Manage", `manage-match:${match.id}`, "text-button", match.status === "completed" ? "edit" : "calendar")}</div>` : ""}
    </div>`;
  }

  function bracketStages(matches) {
    const stages = new Map();
    for (const match of matches) {
      const sourceIds = [match.sourceA?.matchId, match.sourceB?.matchId, match.resetSourceId].filter(Boolean);
      const sourceStage = Math.max(-1, ...sourceIds.map((id) => stages.get(id) ?? -1));
      stages.set(match.id, sourceStage + 1);
    }
    return stages;
  }

  function renderBracketRounds(tournamentData, matches, heading, stages, stageCount, readOnly = false) {
    const rounds = Array.from({ length: stageCount }, (_, stage) => {
      const roundMatches = matches.filter((match) => stages.get(match.id) === stage);
      const labels = [...new Set(roundMatches.map((match) => match.roundName || "Matches"))];
      const label = labels.join(" / ");
      return `<div class="bracket-round" data-stage="${stage}">${label ? `<div class="round-label">${escapeHtml(label)}</div>` : ""}${roundMatches.map((match) => renderBracketMatch(tournamentData, match, readOnly)).join("")}</div>`;
    });
    return `<section class="bracket-section"><div class="bracket-heading"><h2>${escapeHtml(heading)}</h2><span>${matches.filter(matchIsActual).length} matches</span></div>
      <div class="bracket-rounds">${rounds.join("")}</div></section>`;
  }

  function renderIntegratedBracketLane(tournamentData, matches, lane, stages, stageCount, laneHeight, readOnly) {
    return Array.from({ length: stageCount }, (_, stage) => {
      const roundMatches = matches.filter((match) => stages.get(match.id) === stage);
      const labels = [...new Set(roundMatches.map((match) => match.roundName || "Matches"))];
      const caption = stage === 0 ? `${lane === "upper" ? "Upper bracket" : "Lower bracket"}${labels.length ? ` / ${labels.join(" / ")}` : ""}` : labels.join(" / ");
      return `<div class="bracket-round bracket-${lane}-round" data-stage="${stage}" style="--lane-height:${laneHeight}px">${caption ? `<div class="round-label">${escapeHtml(caption)}</div>` : ""}${roundMatches.map((match) => renderBracketMatch(tournamentData, match, readOnly)).join("")}</div>`;
    });
  }

  function renderIntegratedDoubleElimination(tournamentData, upper, lower, grand, stages, stageCount, readOnly) {
    const maxCount = (matches) => Math.max(0, ...Array.from({ length: stageCount }, (_, stage) =>
      matches.filter((match) => stages.get(match.id) === stage).length));
    const laneHeight = (matches) => Math.max(280, maxCount(matches) * 166);
    const upperHeight = laneHeight(upper);
    const lowerHeight = laneHeight(lower);
    const upperColumns = renderIntegratedBracketLane(tournamentData, upper, "upper", stages, stageCount, upperHeight, readOnly);
    const lowerColumns = renderIntegratedBracketLane(tournamentData, lower, "lower", stages, stageCount, lowerHeight, readOnly);
    const columns = Array.from({ length: stageCount }, (_, stage) => {
      const finalMatches = grand.filter((match) => stages.get(match.id) === stage);
      const championship = finalMatches.length
        ? `<div class="bracket-final-lane" data-stage="${stage}" role="group" aria-label="Championship"><div class="round-label bracket-final-title">Championship</div><div class="bracket-final-matches">${finalMatches.map((match) => renderBracketMatch(tournamentData, match, readOnly)).join("")}</div></div>`
        : "";
      return `<div class="bracket-stage-column" data-stage="${stage}">
        ${upperColumns[stage]}
        ${lowerColumns[stage]}
        ${championship}
      </div>`;
    }).join("");
    return `<div class="bracket-integrated-grid" role="group" aria-label="Double-elimination bracket" style="--upper-lane-height:${upperHeight}px;--lower-lane-height:${lowerHeight}px">${columns}</div>`;
  }

  function renderBracketBoard(tournamentData, readOnly = false) {
    const upper = tournamentData.matches.filter((match) => match.bracket === "upper" || match.bracket === "main");
    const lower = tournamentData.matches.filter((match) => match.bracket === "lower");
    const grand = tournamentData.matches.filter((match) => match.bracket === "grand" && match.status !== "cancelled");
    const stages = bracketStages(tournamentData.matches);
    if (tournamentData.format === "double-elimination") {
      const grandFinal = grand.find((match) => match.label === "Grand Final");
      if (grandFinal) {
        for (const reset of grand.filter((match) => match.resetSourceId === grandFinal.id)) {
          stages.set(reset.id, stages.get(grandFinal.id));
        }
      }
      const visibleMatches = [...upper, ...lower, ...grand];
      const stageCount = Math.max(0, ...visibleMatches.map((match) => stages.get(match.id))) + 1;
      const legend = `<div class="bracket-legend" aria-label="Connector legend"><span><i class="winner"></i>Winner advances</span><span><i class="loser"></i>Loss drops to lower bracket</span><span><i class="conditional"></i>Conditional reset</span></div>`;
      return `${legend}<div class="bracket-scroll"><div class="bracket-board bracket-board-integrated"><svg class="bracket-connectors" aria-hidden="true" focusable="false"></svg>${renderIntegratedDoubleElimination(tournamentData, upper, lower, grand, stages, stageCount, readOnly)}</div></div>`;
    }
    const visibleMatches = [...upper, ...lower, ...grand];
    const stageCount = Math.max(0, ...visibleMatches.map((match) => stages.get(match.id))) + 1;
    const sections = [
      upper.length && renderBracketRounds(tournamentData, upper, "Road to the final", stages, stageCount, readOnly),
      grand.length && renderBracketRounds(tournamentData, grand, "Championship", stages, stageCount, readOnly),
    ].filter(Boolean).join("");
    return `<div class="bracket-scroll"><div class="bracket-board"><svg class="bracket-connectors" aria-hidden="true" focusable="false"></svg>${sections}</div></div>`;
  }

  function drawBracketConnectors() {
    document.querySelectorAll(".bracket-board").forEach((board) => {
      const svg = board.querySelector(".bracket-connectors");
      const matches = [...board.querySelectorAll(".bracket-match[data-match-id]")];
      const matchesById = new Map(matches.map((match) => [match.dataset.matchId, match]));
      const edges = matches.flatMap((target) => [
        { sourceId: target.dataset.sourceA, outcome: target.dataset.sourceAOutcome, target, slot: 0 },
        { sourceId: target.dataset.sourceB, outcome: target.dataset.sourceBOutcome, target, slot: 1 },
        { sourceId: target.dataset.resetSource, outcome: "conditional", target, slot: 0 },
      ].filter((edge) => edge.sourceId));
      const boardRect = board.getBoundingClientRect();
      const width = board.scrollWidth;
      const height = board.scrollHeight;
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      svg.replaceChildren();

      for (const edge of edges) {
        const source = matchesById.get(edge.sourceId);
        if (!source) continue;
        const sourceRect = source.getBoundingClientRect();
        const targetRect = edge.target.getBoundingClientRect();
        const sourceX = sourceRect.right - boardRect.left;
        const sourceY = sourceRect.top + sourceRect.height / 2 - boardRect.top;
        const teamRows = edge.target.querySelectorAll(".bracket-team");
        const targetRow = teamRows[edge.slot];
        const targetY = targetRow
          ? targetRow.getBoundingClientRect().top + targetRow.getBoundingClientRect().height / 2 - boardRect.top
          : targetRect.top + targetRect.height / 2 - boardRect.top;
        const targetX = targetRect.left - boardRect.left;
        const sourceStage = Number(source.closest(".bracket-round, .bracket-stage-column").dataset.stage);
        const targetStage = Number(edge.target.closest(".bracket-round, .bracket-stage-column").dataset.stage);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const className = edge.outcome === "conditional" ? "conditional" : edge.outcome;
        path.setAttribute("class", `bracket-connector ${className}`);
        if (edge.outcome === "conditional") {
          const startX = sourceRect.left + sourceRect.width / 2 - boardRect.left;
          const startY = sourceRect.bottom - boardRect.top;
          const endX = targetRect.left + targetRect.width / 2 - boardRect.left;
          const endY = targetRect.top - boardRect.top;
          const middleY = startY + (endY - startY) / 2;
          path.setAttribute("d", `M ${startX} ${startY} V ${middleY} H ${endX} V ${endY}`);
        } else if (targetStage - sourceStage > 1) {
          const laneY = (sourceY + targetY) / 2;
          path.setAttribute("d", `M ${sourceX} ${sourceY} H ${sourceX + 8} V ${laneY} H ${targetX - 8} V ${targetY} H ${targetX}`);
        } else {
          const middleX = sourceX + (targetX - sourceX) / 2;
          path.setAttribute("d", `M ${sourceX} ${sourceY} H ${middleX} V ${targetY} H ${targetX}`);
        }
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = edge.outcome === "conditional"
          ? `Conditional reset path from ${source.querySelector(".bracket-match-head span")?.textContent || "match"}`
          : `${edge.outcome === "loser" ? "Loser" : "Winner"} advances to ${edge.target.querySelector(".bracket-match-head span")?.textContent || "next match"}`;
        path.append(title);
        svg.append(path);
      }
    });
  }

  function renderStandingsTable(tournamentData, withAction = false) {
    const rows = standings(tournamentData);
    const tiedGroups = new Set(rows.filter((row) => row.tied).map((row) => row.rank));
    const canResolve = withAction && tournamentData.matches.length > 0
      && tournamentData.matches.every((match) => match.status === "completed") && tiedGroups.size > 0;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Rank</th><th>Team</th><th>W</th><th>L</th><th>Games</th><th>Diff</th></tr></thead><tbody>${rows.map((row) => `
      <tr><td><span class="standing-rank ${row.rank === 1 ? "first" : ""}">${row.tied ? `T${row.rank}` : String(row.rank).padStart(2, "0")}</span></td><td><div class="team-line">${teamAvatar(row.team)}<strong>${escapeHtml(row.team.name)}</strong></div></td><td>${row.matchWins}</td><td>${row.matchLosses}</td><td>${row.gameWins}-${row.gameLosses}</td><td>${row.gameDifferential > 0 ? "+" : ""}${row.gameDifferential}</td></tr>`).join("")}</tbody></table></div>${canResolve ? `<div style="margin-top:10px">${button("Resolve standings ties", "resolve-tie", "button button-compact", "trophy")}</div>` : ""}`;
  }

  function renderBracketPage(tournamentData) {
    if (!tournamentData.matches.length) return `${renderBanner(tournamentData)}<div class="panel panel-pad" style="margin-top:17px"><div class="section-heading"><div><div class="eyebrow">BRACKET NOT GENERATED</div><h2>Registration is open</h2><p>At least two teams with five starters are needed to seed the first round.</p></div>${button("Generate bracket", "generate-bracket", "button button-primary", "arrow")}</div></div>`;
    if (tournamentData.format === "round-robin") {
      return `${renderBanner(tournamentData)}<div class="bracket-layout" style="margin-top:18px"><section class="bracket-main"><div class="section-heading"><div><div class="eyebrow">LEAGUE TABLE</div><h2>Standings</h2></div></div>${renderStandingsTable(tournamentData, true)}</section><section class="bracket-side"><div class="section-heading"><div><div class="eyebrow">FIXTURES</div><h2>Matchdays</h2></div></div><div class="panel"><div class="panel-body">${renderFixtureList(tournamentData)}</div></div></section></div>`;
    }
    return `${renderBanner(tournamentData)}<div style="margin-top:20px">${renderBracketBoard(tournamentData)}</div>`;
  }

  function renderFixtureList(tournamentData) {
    const matches = realMatches(tournamentData).sort((left, right) => left.roundIndex - right.roundIndex || left.id.localeCompare(right.id));
    if (!matches.length) return '<div class="match-empty">No fixtures yet.</div>';
    return `<div class="schedule-list">${matches.map((match) => `<div class="schedule-item"><strong>${escapeHtml(teamById(tournamentData, match.teamAId)?.name || "TBD")} <span style="color:var(--quiet)">vs</span> ${escapeHtml(teamById(tournamentData, match.teamBId)?.name || "TBD")}</strong>${renderStatusChip(match)}<small>${escapeHtml(match.roundName)} / BO${match.bestOf || tournamentData.bestOf}</small><small>${escapeHtml(formatMatchDate(match.scheduledAt))}</small><div style="grid-column:1/-1">${button(match.status === "completed" ? "Edit result" : "Manage match", `manage-match:${match.id}`, "text-button", match.status === "completed" ? "edit" : "calendar")}</div></div>`).join("")}</div>`;
  }

  function renderTeams(tournamentData) {
    const rosterComplete = (team) => team.players.filter((player) => player.starter && player.name.trim()).length === 5;
    return `${renderBanner(tournamentData)}<div class="registration-banner" style="margin-top:16px"><div><strong>${tournamentData.matches.length ? "BRACKET ENTRIES LOCKED" : "REGISTRATION DESK"}</strong><p>${tournamentData.matches.length ? "Add or remove entrants only after resetting this bracket." : `${tournamentData.teams.length} of ${tournamentData.teamLimit} team slots filled. Five starter names are needed before bracket generation.`}</p></div>${!tournamentData.matches.length ? button("Add team", "add-team", "button button-primary button-compact", "plus") : button("Reset bracket", "reset-bracket", "button button-compact", "reset")}</div>
      <div class="section-heading"><div><div class="eyebrow">ROSTER MANAGEMENT</div><h2>${tournamentData.teams.length} registered ${tournamentData.teams.length === 1 ? "team" : "teams"}</h2></div>${button("Edit event details", "edit-tournament", "text-button", "edit")}</div>
      ${tournamentData.teams.length ? `<div class="team-grid">${tournamentData.teams.slice().sort((left, right) => left.seed - right.seed).map((team) => `<article class="team-card">
        <div class="team-card-top">${teamAvatar(team, true)}<div class="team-card-copy"><strong>${escapeHtml(team.name)}</strong><small>Seed ${String(team.seed).padStart(2, "0")} / ${team.players.filter((player) => player.starter && player.name.trim()).length}/5 starters</small></div><div class="team-card-actions"><button type="button" class="icon-button" data-action="edit-team:${team.id}" title="Edit ${escapeHtml(team.name)}" aria-label="Edit ${escapeHtml(team.name)}">${icon("edit")}</button>${!tournamentData.matches.length ? `<button type="button" class="icon-button" data-action="remove-team:${team.id}" title="Remove team" aria-label="Remove ${escapeHtml(team.name)}">${icon("trash")}</button>` : ""}</div></div>
        <div class="team-roster">${team.players.map((player, index) => `<div class="roster-player"><span class="roster-number">${player.starter ? String(index + 1).padStart(2, "0") : "SUB"}</span><span>${escapeHtml(player.name || "Roster slot open")}</span>${player.captain ? '<b class="captain-mark">C</b>' : ""}</div>`).join("")}</div>
        <div class="team-card-footer"><span class="status-chip ${team.status === "Eliminated" ? "completed" : tournamentData.matches.length ? "in-progress" : "registration"}">${escapeHtml(team.status || "Registered")}</span>${!rosterComplete(team) ? '<span class="tag coral">Roster incomplete</span>' : ""}</div>
      </article>`).join("")}</div>` : `<div class="panel match-empty">No teams registered yet. Add the first roster to open the draw.</div>`}`;
  }

  function renderMatches(tournamentData) {
    const matches = realMatches(tournamentData).slice().sort((left, right) => {
      if (left.status === "completed" && right.status !== "completed") return 1;
      if (right.status === "completed" && left.status !== "completed") return -1;
      if (!left.scheduledAt) return 1;
      if (!right.scheduledAt) return -1;
      return left.scheduledAt.localeCompare(right.scheduledAt);
    });
    const filtered = matchFilter === "all" ? matches : matches.filter((match) => {
      if (matchFilter === "live") return match.live;
      if (matchFilter === "upcoming") return match.status === "upcoming" && !match.live;
      return match.status === matchFilter;
    });
    return `${renderBanner(tournamentData)}<div class="section-heading" style="margin-top:20px"><div><div class="eyebrow">FIXTURE CONTROL</div><h2>${filtered.length} ${filtered.length === 1 ? "match" : "matches"}</h2></div><div class="segmented" role="group" aria-label="Filter matches">${[["all", "All"], ["upcoming", "Upcoming"], ["live", "Live"], ["completed", "Completed"]].map(([value, label]) => `<button type="button" data-action="filter-matches:${value}" aria-pressed="${matchFilter === value}">${label}</button>`).join("")}</div></div>
      ${filtered.length ? `<div class="panel"><div class="match-list">${filtered.map((match) => renderMatchRow(tournamentData, match)).join("")}</div></div>` : `<div class="panel match-empty">${tournamentData.matches.length ? "No matches in this view." : "Generate the bracket to create fixtures."}</div>`}`;
  }

  function renderPublic(tournamentData) {
    const champion = teamById(tournamentData, tournamentData.championId);
    const liveMatches = realMatches(tournamentData);
    const publicTeams = tournamentData.teams.slice().sort((left, right) => left.seed - right.seed);
    const roundRobin = tournamentData.format === "round-robin";
    return `<section class="public-head"><div><div class="eyebrow">MLBB TOURNAMENT / ${escapeHtml(formatNames[tournamentData.format]).toUpperCase()}</div><h2>${escapeHtml(tournamentData.name)}</h2><p>${escapeHtml(formatDate(tournamentData.date))} / ${escapeHtml(tournamentData.venue || "Venue to be announced")} / ${publicTeams.length} teams</p></div><div class="public-champion"><small>${champion ? "CHAMPION" : "TITLE RACE"}</small><strong>${escapeHtml(champion?.name || (tournamentData.status === "registration" ? "Registration open" : "In progress"))}</strong></div></section>
      <div class="public-grid"><section class="public-panel"><div class="panel-head"><div><h2>${roundRobin ? "Standings" : "Tournament bracket"}</h2><p>${roundRobin ? "Match wins / head-to-head / game differential" : `${formatNames[tournamentData.format]} / automatic advancement`}</p></div></div><div class="panel-body">${roundRobin ? renderStandingsTable(tournamentData) : tournamentData.matches.length ? renderPublicBracket(tournamentData) : '<div class="match-empty">Bracket will appear after registration closes.</div>'}</div></section>
        <section class="public-panel"><div class="panel-head"><div><h2>Teams</h2><p>${publicTeams.length} entrants</p></div></div><div class="public-team-list">${publicTeams.map((team) => `<div class="public-team">${teamAvatar(team)}<strong>${escapeHtml(team.name)}</strong><small>${escapeHtml(teamStatus(tournamentData, team))}</small></div>`).join("") || '<div class="match-empty">Teams will appear here.</div>'}</div></section>
        <section class="public-panel full"><div class="panel-head"><div><h2>Schedule & results</h2><p>Match times are shown in your local timezone.</p></div></div><div class="match-list">${liveMatches.length ? liveMatches.sort((left, right) => (left.scheduledAt || "").localeCompare(right.scheduledAt || "")).map((match) => renderMatchRow(tournamentData, match, true)).join("") : '<div class="match-empty">Fixtures will appear when the bracket is generated.</div>'}</div></section></div>
      <p class="export-hint">Read-only public view / Event data is stored in the organizer's browser.</p>`;
  }

  function renderPublicBracket(tournamentData) {
    if (tournamentData.format === "round-robin") return renderStandingsTable(tournamentData);
    return renderBracketBoard(tournamentData, true);
  }

  function renderHeading() {
    const view = views[activeView] || views.overview;
    const selected = tournament();
    document.getElementById("page-title").textContent = view.title;
    document.getElementById("page-description").textContent = selected && activeView === "public"
      ? "Spectator view / no editing controls on this page."
      : view.description;
    document.getElementById("page-eyebrow").textContent = selected
      ? `${formatNames[selected.format].toUpperCase()} / ${statusNames[selected.status].toUpperCase()}`
      : "MLBB / ADMIN CONSOLE";
    const actions = document.getElementById("heading-actions");
    if (!selected) actions.innerHTML = "";
    else if (activeView === "overview") actions.innerHTML = `${button("Edit event", "edit-tournament", "button", "edit")}${selected.matches.length ? "" : button("Generate bracket", "generate-bracket", "button button-primary", "arrow")}`;
    else if (activeView === "teams") actions.innerHTML = selected.matches.length ? button("Reset bracket", "reset-bracket", "button", "reset") : button("Add team", "add-team", "button button-primary", "plus");
    else if (activeView === "bracket" || activeView === "public") actions.innerHTML = button("Export public page", "export-html", "button button-primary", "download");
    else actions.innerHTML = selected.matches.length ? button("Export public page", "export-html", "button", "download") : button("Generate bracket", "generate-bracket", "button button-primary", "arrow");
  }

  function renderSwitcher() {
    const switcher = document.getElementById("tournament-switcher");
    const context = document.getElementById("context-tournament");
    const selected = tournament();
    if (!state.tournaments.length) {
      switcher.hidden = true;
      context.textContent = "No active event";
      return;
    }
    switcher.hidden = false;
    switcher.innerHTML = state.tournaments.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === state.activeTournamentId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
    context.textContent = selected?.name || "Tournament";
  }

  function render() {
    const selected = tournament();
    renderSwitcher();
    renderHeading();
    document.querySelectorAll("[data-view]").forEach((link) => {
      if (link.dataset.view === activeView) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (!selected) {
      page.innerHTML = renderEmpty();
      return;
    }
    if (activeView === "overview") page.innerHTML = renderOverview(selected);
    else if (activeView === "bracket") page.innerHTML = renderBracketPage(selected);
    else if (activeView === "teams") page.innerHTML = renderTeams(selected);
    else if (activeView === "matches") page.innerHTML = renderMatches(selected);
    else page.innerHTML = renderPublic(selected);
    drawBracketConnectors();
  }

  function notify(message, isError = false) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.add("visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
  }

  function showDialog(kind, title, body, primaryLabel = "Save") {
    pendingLogo = null;
    dialog.dataset.kind = kind;
    document.getElementById("dialog-title").textContent = title;
    dialogBody.innerHTML = body;
    dialogFooter.innerHTML = `<button class="button button-quiet" type="button" data-action="close-dialog">Cancel</button><div><button class="button button-primary" type="submit">${escapeHtml(primaryLabel)}</button></div>`;
    dialog.showModal();
  }

  function closeDialog() {
    dialog.close();
    dialog.dataset.kind = "";
    pendingLogo = null;
  }

  function openTournamentDialog(existing = null) {
    const isEditing = Boolean(existing);
    const formatOptions = Object.entries(formatNames).map(([value, label]) => `<option value="${value}" ${existing?.format === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
    showDialog(isEditing ? "edit-tournament" : "new-tournament", isEditing ? "Edit tournament" : "Create tournament", `
      <p class="modal-note">Tournament details stay on this device. Create a separate tournament for each event you manage.</p>
      <div class="field-grid">
        <div class="field full"><label for="tournament-name">Tournament name</label><input id="tournament-name" name="name" required maxlength="70" placeholder="e.g. Northern Rift Cup" value="${escapeHtml(existing?.name || "")}"></div>
        <div class="field"><label for="tournament-date">Date</label><input id="tournament-date" name="date" type="date" value="${escapeHtml(existing?.date || "")}"></div>
        <div class="field"><label for="tournament-venue">Venue</label><input id="tournament-venue" name="venue" maxlength="80" placeholder="City or venue" value="${escapeHtml(existing?.venue || "")}"></div>
        <div class="field"><label for="tournament-format">Format</label><select id="tournament-format" name="format" ${existing?.matches.length ? "disabled" : ""}>${formatOptions}</select>${existing?.matches.length ? '<small class="field-help">Reset the bracket before changing format.</small>' : ""}</div>
        <div class="field"><label for="tournament-cap">Team limit</label><input id="tournament-cap" name="teamLimit" type="number" min="2" max="32" value="${escapeHtml(existing?.teamLimit || 32)}"></div>
        <div class="field"><label for="tournament-bestof">Default series</label><select id="tournament-bestof" name="bestOf">${[1, 3, 5].map((value) => `<option value="${value}" ${(existing?.bestOf || 3) === value ? "selected" : ""}>Best of ${value}</option>`).join("")}</select></div>
      </div><p class="form-error" id="form-error"></p>`, isEditing ? "Save details" : "Create tournament");
  }

  function ensureRosterEditable() {
    const selected = tournament();
    if (!selected?.matches.length) return true;
    const accepted = window.confirm("Reset the bracket before changing its entrants? All match results will be cleared.");
    if (!accepted) return false;
    selected.matches = [];
    selected.status = "registration";
    selected.championId = null;
    selected.manualTieBreakOrder = [];
    selected.teams.forEach((team) => { team.status = "Registered"; });
    saveState();
    return true;
  }

  function openTeamDialog(team = null) {
    const selected = tournament();
    if (!selected) return;
    if (!team && selected.teams.length >= selected.teamLimit) {
      notify("This tournament has reached its team limit.", true);
      return;
    }
    const players = team?.players || Array.from({ length: 5 }, (_, index) => ({ starter: true, name: "", captain: false, order: index }));
    const captainIndex = team?.players.findIndex((player) => player.captain && player.starter) ?? -1;
    const starters = Array.from({ length: 5 }, (_, index) => {
      const player = players.find((item) => item.starter && item.order === index) || players.filter((item) => item.starter)[index] || { name: "" };
      return `<div class="player-input-row"><span>${String(index + 1).padStart(2, "0")}</span><div class="field"><label class="sr-only" for="player-${index}">Starter ${index + 1} in-game name</label><input id="player-${index}" name="player-${index}" maxlength="30" placeholder="Starter ${index + 1} in-game name" value="${escapeHtml(player.name)}"></div><span class="roster-number">STARTER</span></div>`;
    });
    const captainOptions = Array.from({ length: 5 }, (_, index) => `<option value="${index}" ${captainIndex === index ? "selected" : ""}>Player ${index + 1}${players[index]?.name ? ` / ${escapeHtml(players[index].name)}` : ""}</option>`).join("");
    const substitute = players.find((player) => !player.starter)?.name || "";
    showDialog(team ? "edit-team" : "add-team", team ? `Edit ${team.name}` : "Register a team", `
      <p class="modal-note">A team can be saved with an incomplete roster, but all five starter names are required before generating the bracket.</p>
      <div class="field-grid">
        <div class="field full"><label for="team-name">Team name</label><input id="team-name" name="name" required maxlength="50" placeholder="Team name" value="${escapeHtml(team?.name || "")}"></div>
        <div class="field full"><label>Team logo</label><div class="logo-upload"><span class="logo-preview" id="logo-preview">${team?.logo ? `<img src="${escapeHtml(team.logo)}" alt="">` : "LOGO"}</span><div><label class="file-pick">Choose image<input id="team-logo" type="file" accept="image/png,image/jpeg,image/webp"></label><div class="field-help">PNG, JPG, or WebP / resized for local storage</div></div></div></div>
        <div class="field full"><span class="field-label">Starting five</span><div class="roster-editor">${starters.join("")}</div></div>
        <div class="field"><label for="captain-index">Captain <span style="color:var(--quiet)">/ optional</span></label><select id="captain-index" name="captainIndex"><option value="">No captain selected</option>${captainOptions}</select></div>
        <div class="field full"><label for="substitute">Substitute <span style="color:var(--quiet)">/ optional</span></label><input id="substitute" name="substitute" maxlength="30" placeholder="Substitute in-game name" value="${escapeHtml(substitute)}"></div>
        ${team ? `<div class="field"><label for="team-seed">Seed</label><input id="team-seed" name="seed" type="number" min="1" max="32" value="${escapeHtml(team.seed)}" ${selected.matches.length ? "disabled" : ""}>${selected.matches.length ? '<small class="field-help">Reset the bracket before changing seeds.</small>' : ""}</div>` : ""}
      </div><p class="form-error" id="form-error"></p>`, team ? "Save team" : "Save team");
    dialogForm.dataset.teamId = team?.id || "";
    dialogForm.dataset.logo = team?.logo || "";
    dialogBody.querySelector('[name="captainIndex"]').value = captainIndex >= 0 ? String(captainIndex) : "";
  }

  function openTournamentEdit() {
    const selected = tournament();
    if (selected) openTournamentDialog(selected);
  }

  function openMatchDialog(match) {
    const selected = tournament();
    if (!selected || !match) return;
    const teamA = teamById(selected, match.teamAId);
    const teamB = teamById(selected, match.teamBId);
    const isForfeit = match.result?.type === "forfeit";
    const scoreA = match.result?.type === "score" ? match.result.scoreA : "";
    const scoreB = match.result?.type === "score" ? match.result.scoreB : "";
    showDialog("manage-match", match.status === "completed" ? "Edit match result" : "Manage match", `
      <div class="match-editor-sides"><div class="field"><label>${escapeHtml(teamA?.name || "Team A")}</label><div class="team-line">${teamAvatar(teamA, true)}<strong>${escapeHtml(teamA?.name || "Waiting")}</strong></div></div><div class="versus">VS</div><div class="field"><label>${escapeHtml(teamB?.name || "Team B")}</label><div class="team-line">${teamAvatar(teamB, true)}<strong>${escapeHtml(teamB?.name || "Waiting")}</strong></div></div></div>
      <div class="form-divider"></div><div class="field-grid">
        <div class="field"><label for="match-scheduled">Match date & time</label><input id="match-scheduled" name="scheduledAt" type="datetime-local" value="${escapeHtml(match.scheduledAt || "")}"></div>
        <div class="field"><label for="match-bestof">Series format</label><select id="match-bestof" name="bestOf">${[1, 3, 5].map((value) => `<option value="${value}" ${(match.bestOf || selected.bestOf) === value ? "selected" : ""}>Best of ${value}</option>`).join("")}</select></div>
        ${match.status !== "completed" ? `<div class="field full"><button type="button" class="text-button" data-action="toggle-live:${match.id}">${icon("match")}<span>${match.live ? "Mark as upcoming" : "Mark as live now"}</span></button></div>` : ""}
        <div class="field full"><span class="field-label">Result entry</span><div class="radio-row"><label class="radio-choice"><input type="radio" name="resultMode" value="score" ${!isForfeit ? "checked" : ""}> Series score</label><label class="radio-choice"><input type="radio" name="resultMode" value="forfeit" ${isForfeit ? "checked" : ""}> Forfeit</label></div></div>
        <div class="field full" id="score-fields"><label>Games won</label><div class="match-score-fields"><input name="scoreA" type="number" min="0" max="3" aria-label="${escapeHtml(teamA?.name || "Team A")} games won" value="${escapeHtml(scoreA)}"><span>:</span><input name="scoreB" type="number" min="0" max="3" aria-label="${escapeHtml(teamB?.name || "Team B")} games won" value="${escapeHtml(scoreB)}"></div><small class="field-help">One team must reach ${Math.ceil((match.bestOf || selected.bestOf) / 2)} game${Math.ceil((match.bestOf || selected.bestOf) / 2) === 1 ? "" : "s"}. Leave both blank to save schedule only.</small></div>
        <div class="field full" id="forfeit-fields" ${isForfeit ? "" : "hidden"}><label for="forfeit-winner">Winner by forfeit</label><select id="forfeit-winner" name="forfeitWinner"><option value="">Select winning team</option><option value="${escapeHtml(teamA?.id)}" ${match.winnerId === teamA?.id ? "selected" : ""}>${escapeHtml(teamA?.name || "Team A")}</option><option value="${escapeHtml(teamB?.id)}" ${match.winnerId === teamB?.id ? "selected" : ""}>${escapeHtml(teamB?.name || "Team B")}</option></select><label for="forfeit-reason" style="margin-top:10px">Reason <span style="color:var(--quiet)">/ optional</span></label><input id="forfeit-reason" name="forfeitReason" maxlength="120" placeholder="e.g. Team did not report" value="${escapeHtml(match.result?.reason || "")}"></div>
      </div><p class="form-error" id="form-error"></p>`, "Save match");
    dialogForm.dataset.matchId = match.id;
    if (match.status === "completed") {
      dialogFooter.querySelector("div").insertAdjacentHTML("afterbegin", '<button class="button button-danger" type="button" data-action="clear-match-result">Clear result</button>');
    }
    dialogBody.querySelectorAll('input[name="resultMode"]').forEach((input) => input.addEventListener("change", updateResultMode));
    dialogBody.querySelector('[name="bestOf"]').addEventListener("change", (event) => {
      const target = Math.ceil(Number(event.target.value) / 2);
      dialogBody.querySelectorAll('[name="scoreA"], [name="scoreB"]').forEach((input) => { input.max = String(target); });
      const help = dialogBody.querySelector("#score-fields .field-help");
      if (help) help.textContent = `One team must reach ${target} game${target === 1 ? "" : "s"}. Leave both blank to save schedule only.`;
    });
  }

  function updateResultMode() {
    const mode = dialogBody.querySelector('input[name="resultMode"]:checked')?.value || "score";
    dialogBody.querySelector("#score-fields").hidden = mode !== "score";
    dialogBody.querySelector("#forfeit-fields").hidden = mode !== "forfeit";
  }

  function showError(message) {
    const error = dialogBody.querySelector("#form-error");
    if (error) {
      error.textContent = message;
      error.classList.add("visible");
    } else notify(message, true);
  }

  function submitTournament(form) {
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const teamLimit = Number(formData.get("teamLimit"));
    if (!name) return showError("Enter a tournament name.");
    if (!Number.isInteger(teamLimit) || teamLimit < 2 || teamLimit > 32) return showError("Team limit must be between 2 and 32.");
    const existing = dialog.dataset.kind === "edit-tournament" ? tournament() : null;
    if (existing && teamLimit < existing.teams.length) return showError("Team limit cannot be lower than the number of registered teams.");
    if (existing) {
      existing.name = name;
      existing.date = String(formData.get("date") || "");
      existing.venue = String(formData.get("venue") || "").trim();
      existing.teamLimit = teamLimit;
      existing.bestOf = Number(formData.get("bestOf"));
      if (!existing.matches.length) existing.format = String(formData.get("format"));
    } else {
      const created = {
        id: makeId("tournament"), name,
        date: String(formData.get("date") || ""),
        venue: String(formData.get("venue") || "").trim(),
        format: String(formData.get("format")),
        teamLimit,
        bestOf: Number(formData.get("bestOf")),
        status: "registration",
        teams: [], matches: [], championId: null, manualTieBreakOrder: [],
        createdAt: new Date().toISOString(),
      };
      state.tournaments.push(created);
      state.activeTournamentId = created.id;
      activeView = "overview";
    }
    saveState(existing ? "Tournament details updated." : "Tournament created.");
    closeDialog();
    render();
  }

  function submitTeam(form) {
    const selected = tournament();
    if (!selected) return;
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    if (!name) return showError("Enter a team name.");
    const teamId = form.dataset.teamId;
    let existing = teamId ? teamById(selected, teamId) : null;
    if (!existing && selected.teams.length >= selected.teamLimit) return showError("This tournament has reached its team limit.");
    const players = Array.from({ length: 5 }, (_, index) => ({
      id: existing?.players.find((player) => player.starter && player.order === index)?.id || makeId("player"),
      name: String(formData.get(`player-${index}`) || "").trim(),
      starter: true,
      order: index,
      captain: false,
    }));
    const captainIndex = String(formData.get("captainIndex") || "");
    if (captainIndex && !players[Number(captainIndex)]?.name) return showError("Enter the selected captain's in-game name first.");
    if (captainIndex) players[Number(captainIndex)].captain = true;
    const substituteName = String(formData.get("substitute") || "").trim();
    if (substituteName) players.push({ id: existing?.players.find((player) => !player.starter)?.id || makeId("player"), name: substituteName, starter: false, order: 5, captain: false });
    const logo = pendingLogo ?? form.dataset.logo ?? "";
    if (existing) {
      existing.name = name;
      existing.players = players;
      existing.logo = logo;
      existing.seed = Number(formData.get("seed")) || existing.seed;
    } else {
      selected.teams.push({ id: makeId("team"), name, logo, players, seed: selected.teams.length + 1, status: "Registered" });
    }
    refreshTournamentStatus(selected);
    saveState(existing ? "Team details updated." : "Team registered.");
    closeDialog();
    render();
  }

  function submitMatch(form) {
    const selected = tournament();
    const match = selected?.matches.find((item) => item.id === form.dataset.matchId);
    if (!match) return;
    const formData = new FormData(form);
    match.scheduledAt = String(formData.get("scheduledAt") || "");
    match.bestOf = Number(formData.get("bestOf"));
    const mode = String(formData.get("resultMode") || "score");
    if (mode === "forfeit") {
      const winnerId = String(formData.get("forfeitWinner") || "");
      if (!winnerId) return showError("Choose the winner for this forfeit.");
      try {
        engine.recordForfeit(selected.matches, match.id, winnerId, String(formData.get("forfeitReason") || ""));
      } catch (error) { return showError(error.message); }
      selected.manualTieBreakOrder = [];
    } else {
      const rawA = String(formData.get("scoreA") || "");
      const rawB = String(formData.get("scoreB") || "");
      if (rawA !== "" || rawB !== "") {
        if (rawA === "" || rawB === "") return showError("Enter both game scores, or leave both blank to save the schedule only.");
        try {
          engine.recordScore(selected.matches, match.id, Number(rawA), Number(rawB), match.bestOf);
        } catch (error) { return showError(error.message); }
        selected.manualTieBreakOrder = [];
      }
    }
    refreshTournamentStatus(selected);
    saveState(match.status === "completed" ? "Match result saved. Bracket progression updated." : "Match schedule saved.");
    closeDialog();
    render();
  }

  function submitTieResolution(form) {
    const selected = tournament();
    const rows = selected ? engine.getStandings(selected.teams, selected.matches) : [];
    const groups = new Map();
    for (const row of rows) {
      if (!row.tied) continue;
      if (!groups.has(row.rank)) groups.set(row.rank, []);
      groups.get(row.rank).push(row);
    }
    const formData = new FormData(form);
    const order = [];
    for (const group of groups.values()) {
      const placements = group.map((row) => ({
        teamId: row.team.id,
        placement: Number(formData.get(`placement-${row.team.id}`)),
      }));
      if (placements.some((item) => !Number.isInteger(item.placement) || item.placement < 1 || item.placement > group.length)
        || new Set(placements.map((item) => item.placement)).size !== group.length) {
        return showError("Assign each team in a tied group a unique position.");
      }
      order.push(...placements.sort((left, right) => left.placement - right.placement).map((item) => item.teamId));
    }
    if (!order.length) return showError("There are no unresolved standings ties.");
    selected.manualTieBreakOrder = order;
    refreshTournamentStatus(selected);
    saveState("Standings ties resolved.");
    closeDialog();
    render();
  }

  function submitDialog(event) {
    event.preventDefault();
    const kind = dialog.dataset.kind;
    if (kind === "new-tournament" || kind === "edit-tournament") submitTournament(dialogForm);
    else if (kind === "add-team" || kind === "edit-team") submitTeam(dialogForm);
    else if (kind === "manage-match") submitMatch(dialogForm);
    else if (kind === "resolve-tie") submitTieResolution(dialogForm);
  }

  function generateBracket() {
    const selected = tournament();
    if (!selected) return;
    if (selected.teams.length < 2) return notify("Register at least two teams first.", true);
    if (selected.teams.length > selected.teamLimit) return notify("Team count exceeds the tournament limit.", true);
    const incomplete = selected.teams.filter((team) => team.players.filter((player) => player.starter && player.name.trim()).length !== 5);
    if (incomplete.length) return notify(`Complete all five starter names for ${incomplete.map((team) => team.name).join(", ")}.`, true);
    const seeds = selected.teams.map((team) => team.seed);
    if (seeds.some((seed) => !Number.isInteger(seed) || seed < 1 || seed > selected.teams.length) || new Set(seeds).size !== seeds.length) {
      return notify(`Seeds must be unique and numbered 1-${selected.teams.length}. Edit team seeds before generating.`, true);
    }
    try {
      selected.matches = engine.generateMatches(selected.teams, selected.format);
      selected.matches.forEach((match) => { match.bestOf = selected.bestOf; match.live = false; });
      selected.status = "in-progress";
      selected.manualTieBreakOrder = [];
      refreshTournamentStatus(selected);
      saveState("Bracket generated. Registration is closed.");
      activeView = "bracket";
      render();
    } catch (error) { notify(error.message, true); }
  }

  function resetBracket() {
    const selected = tournament();
    if (!selected?.matches.length) return;
    if (!window.confirm("Reset this bracket? All match schedules and results will be cleared; registered teams will remain.")) return;
    selected.matches = [];
    selected.status = "registration";
    selected.championId = null;
    selected.manualTieBreakOrder = [];
    selected.teams.forEach((team) => { team.status = "Registered"; });
    saveState("Bracket reset. Registration is open again.");
    render();
  }

  function removeTeam(teamId) {
    const selected = tournament();
    const team = selected?.teams.find((item) => item.id === teamId);
    if (!team || !window.confirm(`Remove ${team.name} from this tournament?`)) return;
    if (!ensureRosterEditable()) return;
    selected.teams = selected.teams.filter((item) => item.id !== teamId);
    selected.teams.slice().sort((left, right) => left.seed - right.seed).forEach((item, index) => { item.seed = index + 1; });
    saveState("Team removed.");
    render();
  }

  function openTieResolution() {
    const selected = tournament();
    if (!selected) return;
    const rows = engine.getStandings(selected.teams, selected.matches);
    const groups = new Map();
    for (const row of rows) {
      if (!row.tied) continue;
      if (!groups.has(row.rank)) groups.set(row.rank, []);
      groups.get(row.rank).push(row);
    }
    const fields = [...groups.entries()].map(([rank, group]) => `<div class="form-divider"></div><div class="field-grid"><div class="field full"><strong>Position ${rank} tie</strong><small class="field-help">Set a unique order for this group.</small></div>${group.map((row, index) => `<div class="field"><label for="placement-${escapeHtml(row.team.id)}">${escapeHtml(row.team.name)}</label><select id="placement-${escapeHtml(row.team.id)}" name="placement-${escapeHtml(row.team.id)}">${group.map((_, placement) => `<option value="${placement + 1}" ${placement === index ? "selected" : ""}>Position ${placement + 1}</option>`).join("")}</select></div>`).join("")}</div>`).join("");
    showDialog("resolve-tie", "Resolve standings ties", `<p class="modal-note">Head-to-head and game differential leave these standings positions tied. Set the order for each group.</p>${fields}<p class="form-error" id="form-error"></p>`, "Save standings order");
  }

  function renderExportTable(title, headers, rows) {
    return `<section><h2>${escapeHtml(title)}</h2><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`;
  }

  function createPublicSnapshot(selected) {
    const champ = teamById(selected, selected.championId);
    const teamRows = selected.teams.slice().sort((left, right) => left.seed - right.seed).map((team) => [String(team.seed), team.name, teamStatus(selected, team)]);
    const matches = realMatches(selected).slice().sort((left, right) => (left.scheduledAt || "").localeCompare(right.scheduledAt || ""));
    const matchRows = matches.map((match) => {
      const result = match.result?.type === "score" ? `${match.result.scoreA}-${match.result.scoreB}` : match.result?.type === "forfeit" ? `Forfeit: ${teamById(selected, match.winnerId)?.name || "Winner"}` : "Upcoming";
      return [match.roundName || match.label, teamById(selected, match.teamAId)?.name || "TBD", teamById(selected, match.teamBId)?.name || "TBD", result, formatMatchDate(match.scheduledAt), `BO${match.bestOf || selected.bestOf}`];
    });
    const standingsSection = selected.format === "round-robin"
      ? renderExportTable("Standings", ["Rank", "Team", "Wins", "Losses", "Games", "Diff"], standings(selected).map((row) => [row.tied ? `T${row.rank}` : String(row.rank), row.team.name, String(row.matchWins), String(row.matchLosses), `${row.gameWins}-${row.gameLosses}`, String(row.gameDifferential)]))
      : "";
    const title = escapeHtml(selected.name);
    const contents = `${renderExportTable("Teams", ["Seed", "Team", "Status"], teamRows)}${standingsSection}${renderExportTable("Schedule & results", ["Round", "Team A", "Team B", "Result", "Date & time", "Series"], matchRows)}`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} / Tournament</title><style>
      :root{color-scheme:dark;--bg:#0b100e;--panel:#121916;--line:#2b3831;--ink:#f0f4ee;--muted:#94a098;--acid:#d3f36b;--cyan:#78d9ce}*{box-sizing:border-box}body{margin:0;padding:30px;background-color:var(--bg);background-image:linear-gradient(rgba(164,194,171,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(164,194,171,.025) 1px,transparent 1px);background-size:44px 44px;color:var(--ink);font:14px 'Segoe UI',sans-serif}.wrap{max-width:1100px;margin:auto}.head{padding:24px;border:1px solid var(--line);border-top:3px solid var(--acid);background:var(--panel)}.eyebrow{color:var(--acid);font:700 10px Consolas,monospace}.head h1{margin:9px 0;font-size:30px}.head p{color:var(--muted)}.champ{margin-top:16px;color:var(--cyan);font-size:12px}.champ strong{display:block;margin-top:5px;color:var(--ink);font-size:20px}section{margin-top:20px;padding:18px;border:1px solid var(--line);background:var(--panel)}h2{margin:0 0 13px;font-size:18px}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:10px;border-bottom:1px solid var(--line)}th{color:var(--muted);font:600 10px Consolas,monospace;text-transform:uppercase}td{font-size:12px}tr:last-child td{border-bottom:0}.foot{margin:18px 0;color:var(--muted);font-size:10px}@media(max-width:600px){body{padding:12px}.head,section{padding:14px}table{min-width:650px}section{overflow-x:auto}}
      </style></head><body><main class="wrap"><header class="head"><div class="eyebrow">MLBB TOURNAMENT / ${escapeHtml(formatNames[selected.format]).toUpperCase()}</div><h1>${title}</h1><p>${escapeHtml(formatDate(selected.date))} / ${escapeHtml(selected.venue || "Venue to be announced")} / ${selected.teams.length} teams</p><div class="champ">${champ ? "CHAMPION" : "CURRENT STATUS"}<strong>${escapeHtml(champ?.name || statusNames[selected.status])}</strong></div></header>${contents}<p class="foot">Public snapshot generated ${escapeHtml(new Date().toLocaleString())}. This file does not update automatically.</p></main></body></html>`;
    downloadFile(`${fileSlug(selected.name)}-public.html`, html, "text/html");
    notify("Standalone public snapshot downloaded.");
  }

  function fileSlug(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tournament";
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportBackup() {
    if (!state.tournaments.length) return notify("There is no tournament data to export yet.", true);
    downloadFile("arena-circuit-backup.json", JSON.stringify({ schemaVersion: 1, ...state }, null, 2), "application/json");
    notify("Tournament backup downloaded.");
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result));
        if (!imported || imported.schemaVersion !== 1 || !Array.isArray(imported.tournaments)) throw new Error("This is not a supported Arena Circuit backup.");
        for (const item of imported.tournaments) {
          if (!item.id || !item.name || !Array.isArray(item.teams) || !Array.isArray(item.matches) || item.teams.length > 32) throw new Error("A tournament entry in this backup is invalid.");
          for (const team of item.teams) {
            if (team.logo && !/^data:image\/(png|jpeg|webp);base64,/i.test(team.logo)) team.logo = "";
          }
        }
        if (!window.confirm(`Restore ${imported.tournaments.length} tournament(s)? This replaces the tournaments currently in this browser.`)) return;
        state = { tournaments: imported.tournaments, activeTournamentId: imported.activeTournamentId || imported.tournaments[0]?.id || null };
        saveState("Backup restored.");
        render();
      } catch (error) { notify(error.message || "Could not read this backup.", true); }
    };
    reader.onerror = () => notify("Could not read the selected backup file.", true);
    reader.readAsText(file);
  }

  function resizeLogo(file) {
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return Promise.reject(new Error("Choose a PNG, JPG, or WebP image."));
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that image."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("That image could not be decoded."));
        image.onload = () => {
          const scale = Math.min(1, 192 / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/webp", .76);
          if (dataUrl.length > 90_000) reject(new Error("That logo is too large to store. Choose a simpler image."));
          else resolve(dataUrl);
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function handleLogoChange(input) {
    const file = input.files?.[0];
    if (!file) return;
    resizeLogo(file).then((dataUrl) => {
      pendingLogo = dataUrl;
      dialogForm.dataset.logo = dataUrl;
      document.getElementById("logo-preview").innerHTML = `<img src="${dataUrl}" alt="">`;
    }).catch((error) => notify(error.message, true));
  }

  function handleAction(action) {
    if (action === "new-tournament") return openTournamentDialog();
    if (action === "edit-tournament") return openTournamentEdit();
    if (action === "close-dialog") return closeDialog();
    if (action === "add-team") {
      if (!ensureRosterEditable()) return;
      return openTeamDialog();
    }
    if (action === "generate-bracket") return generateBracket();
    if (action === "reset-bracket") return resetBracket();
    if (action === "export-json") return exportBackup();
    if (action === "import-json") return document.getElementById("backup-file").click();
    if (action === "export-html") {
      const selected = tournament();
      if (selected) return createPublicSnapshot(selected);
    }
    if (action === "resolve-tie") return openTieResolution();
    if (action === "view:matches") { activeView = "matches"; return render(); }
    if (action.startsWith("edit-team:")) {
      const selected = tournament();
      return openTeamDialog(teamById(selected, action.slice("edit-team:".length)));
    }
    if (action.startsWith("remove-team:")) return removeTeam(action.slice("remove-team:".length));
    if (action.startsWith("manage-match:")) {
      const selected = tournament();
      return openMatchDialog(selected?.matches.find((match) => match.id === action.slice("manage-match:".length)));
    }
    if (action.startsWith("filter-matches:")) {
      matchFilter = action.slice("filter-matches:".length);
      return render();
    }
    if (action.startsWith("toggle-live:")) {
      const selected = tournament();
      const match = selected?.matches.find((item) => item.id === action.slice("toggle-live:".length));
      if (match) {
        match.live = !match.live;
        saveState(match.live ? "Match marked live." : "Match marked upcoming.");
        render();
        const wasOpen = dialog.open;
        if (wasOpen) closeDialog();
        render();
        if (wasOpen) openMatchDialog(match);
      }
      return;
    }
  }

  document.addEventListener("click", (event) => {
    const viewLink = event.target.closest("[data-view-link]");
    if (viewLink) {
      event.preventDefault();
      activeView = viewLink.dataset.viewLink;
      render();
      return;
    }
    const nav = event.target.closest("[data-view]");
    if (nav) {
      activeView = nav.dataset.view;
      render();
      return;
    }
    const action = event.target.closest("[data-action]");
    if (action) handleAction(action.dataset.action);
  });

  dialogForm.addEventListener("submit", submitDialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  document.getElementById("tournament-switcher").addEventListener("change", (event) => {
    state.activeTournamentId = event.target.value;
    saveState();
    render();
  });
  document.getElementById("backup-file").addEventListener("change", (event) => {
    if (event.target.files?.[0]) importBackup(event.target.files[0]);
    event.target.value = "";
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "team-logo") handleLogoChange(event.target);
  });
  window.addEventListener("resize", drawBracketConnectors);
  document.addEventListener("click", (event) => {
    const clearButton = event.target.closest('[data-action="clear-match-result"]');
    if (!clearButton) return;
    const selected = tournament();
    const match = selected?.matches.find((item) => item.id === dialogForm.dataset.matchId);
    if (!match) return;
    match.result = null;
    match.winnerId = null;
    match.loserId = null;
    match.status = "upcoming";
    match.live = false;
    engine.recalculate(selected.matches);
    selected.manualTieBreakOrder = [];
    refreshTournamentStatus(selected);
    saveState("Match result cleared. Later matches may need to be replayed.");
    closeDialog();
    render();
  });

  render();
})();