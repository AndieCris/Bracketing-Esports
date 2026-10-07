const test = require("node:test");
const assert = require("node:assert/strict");
const TournamentEngine = require("../bracket.js");

function makeTeams(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `team-${index + 1}`,
    name: `Team ${index + 1}`,
    seed: index + 1,
  }));
}

test("single elimination gives byes to the highest seeds and advances winners", () => {
  const teams = makeTeams(6);
  const matches = TournamentEngine.generateMatches(teams, "single-elimination");
  const byes = matches.filter((match) => match.status === "bye");
  const openingGames = matches.filter((match) => match.status === "upcoming");

  assert.equal(byes.length, 2);
  assert.deepEqual(new Set(byes.map((match) => match.winnerId)), new Set(["team-1", "team-2"]));
  assert.equal(openingGames.length, 2);
  assert.throws(() => TournamentEngine.recordScore(matches, openingGames[0].id, 1, 1, 3), /BO3/);

  openingGames[0].live = true;
  TournamentEngine.recordScore(matches, openingGames[0].id, 2, 0, 3);
  assert.equal(openingGames[0].live, false);
  const semifinal = matches.find((match) => match.roundName === "Semifinals" && match.status === "upcoming");
  assert.ok(semifinal);
  assert.ok(semifinal.teamAId);
  assert.ok(semifinal.teamBId);
});

test("round robin schedules every pairing exactly once and orders standings", () => {
  const teams = makeTeams(5);
  const matches = TournamentEngine.generateMatches(teams, "round-robin");
  assert.equal(matches.length, 10);
  assert.equal(new Set(matches.map((match) => [match.teamAId, match.teamBId].sort().join(":"))).size, 10);

  for (const match of matches) {
    TournamentEngine.recordScore(matches, match.id, 2, 1, 3);
  }
  const standings = TournamentEngine.getStandings(teams, matches);
  assert.equal(standings.length, 5);
  assert.equal(standings.reduce((total, row) => total + row.matchWins, 0), 10);
  assert.equal(standings.reduce((total, row) => total + row.matchLosses, 0), 10);
});

test("head-to-head mini-table outranks overall game differential", () => {
  const teams = makeTeams(4);
  const matches = TournamentEngine.generateMatches(teams, "round-robin");
  const results = [
    ["team-1", "team-2", 2, 1],
    ["team-1", "team-3", 2, 0],
    ["team-4", "team-1", 2, 0],
    ["team-2", "team-3", 2, 0],
    ["team-2", "team-4", 2, 0],
    ["team-3", "team-4", 2, 0],
  ];

  for (const [teamAId, teamBId, scoreA, scoreB] of results) {
    const match = matches.find((item) =>
      [item.teamAId, item.teamBId].includes(teamAId)
      && [item.teamAId, item.teamBId].includes(teamBId));
    assert.ok(match);
    const teamAScore = match.teamAId === teamAId ? scoreA : scoreB;
    const teamBScore = match.teamBId === teamBId ? scoreB : scoreA;
    TournamentEngine.recordScore(matches, match.id, teamAScore, teamBScore, 3);
  }

  const standings = TournamentEngine.getStandings(teams, matches);
  assert.equal(standings[0].team.id, "team-1");
  assert.equal(standings[0].gameDifferential, 1);
  assert.equal(standings[1].team.id, "team-2");
  assert.equal(standings[1].gameDifferential, 3);
});

test("double elimination generates a lower bracket and conditional reset final", () => {
  const teams = makeTeams(8);
  const matches = TournamentEngine.generateMatches(teams, "double-elimination");
  assert.equal(matches.filter((match) => match.bracket === "upper").length, 7);
  assert.equal(matches.filter((match) => match.bracket === "lower").length, 6);
  assert.equal(matches.filter((match) => match.bracket === "grand").length, 2);
  assert.equal(matches.at(-1).status, "waiting");

  let guard = 0;
  while (matches.some((match) => match.label === "Grand Final" && match.status !== "completed")) {
    const match = matches.find((item) => item.status === "upcoming");
    assert.ok(match, "there should be a playable match until the grand final is complete");
    if (match.bracket === "grand" && match.label === "Grand Final") {
      TournamentEngine.recordScore(matches, match.id, 0, 2, 3);
    } else {
      TournamentEngine.recordScore(matches, match.id, 2, 0, 3);
    }
    guard += 1;
    assert.ok(guard < 30, "bracket should finish without a loop");
  }

  const resetFinal = matches.find((match) => match.label === "Grand Final Reset");
  const firstGrandFinal = matches.find((match) => match.label === "Grand Final");
  assert.equal(resetFinal.status, "upcoming");
  assert.deepEqual([resetFinal.teamAId, resetFinal.teamBId], [firstGrandFinal.teamAId, firstGrandFinal.teamBId]);
  TournamentEngine.recordScore(matches, resetFinal.id, 2, 1, 3);
  assert.equal(resetFinal.status, "completed");
});

test("double elimination completes with byes across odd and maximum team counts", () => {
  for (const count of [3, 5, 6, 9, 17, 31, 32]) {
    const matches = TournamentEngine.generateMatches(makeTeams(count), "double-elimination");
    let played = 0;
    while (matches.some((match) => match.bracket === "grand" && match.label === "Grand Final" && match.status !== "completed")) {
      const match = matches.find((item) => item.status === "upcoming");
      assert.ok(match, `${count} teams should always have a playable match`);
      TournamentEngine.recordScore(matches, match.id, 2, 0, 3);
      played += 1;
      assert.ok(played < count * 3, `${count} teams should finish within a bounded number of matches`);
    }
    assert.equal(matches.find((match) => match.label === "Grand Final").status, "completed", `${count} teams should reach a champion`);
    assert.equal(matches.find((match) => match.label === "Grand Final Reset").status, "cancelled", `${count} teams should not need a reset when the upper finalist wins`);
  }
});

test("a correction to a result clears downstream scores when entrants change", () => {
  const teams = makeTeams(4);
  const matches = TournamentEngine.generateMatches(teams, "single-elimination");
  const opening = matches.filter((match) => match.status === "upcoming");
  TournamentEngine.recordScore(matches, opening[0].id, 2, 0, 3);
  TournamentEngine.recordScore(matches, opening[1].id, 2, 0, 3);
  const final = matches.find((match) => match.roundName === "Grand Final");
  TournamentEngine.recordScore(matches, final.id, 2, 0, 3);

  TournamentEngine.recordScore(matches, opening[0].id, 0, 2, 3);
  assert.equal(final.status, "upcoming");
  assert.equal(final.result, null);
});