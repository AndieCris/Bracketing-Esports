(function attachTournamentEngine(root, factory) {
  const engine = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = engine;
  }
  root.TournamentEngine = engine;
})(typeof globalThis === "undefined" ? this : globalThis, function createTournamentEngine() {
  const formats = new Set(["single-elimination", "double-elimination", "round-robin"]);
  const bestOfValues = new Set([1, 3, 5]);

  function nextPowerOfTwo(value) {
    let size = 1;
    while (size < value) size *= 2;
    return size;
  }

  function seedOrder(size) {
    let order = [1, 2];
    for (let currentSize = 4; currentSize <= size; currentSize *= 2) {
      order = order.flatMap((seed) => [seed, currentSize + 1 - seed]);
    }
    return order;
  }

  function orderedTeams(teams) {
    return teams
      .map((team, index) => ({ team, index }))
      .sort((left, right) => {
        const leftSeed = Number.isInteger(left.team.seed) ? left.team.seed : left.index + 1;
        const rightSeed = Number.isInteger(right.team.seed) ? right.team.seed : right.index + 1;
        return leftSeed - rightSeed || left.index - right.index;
      })
      .map(({ team }) => team);
  }

  function roundLabel(bracketSize, roundIndex) {
    const teamsInRound = bracketSize / 2 ** roundIndex;
    if (teamsInRound === 2) return "Grand Final";
    if (teamsInRound === 4) return "Semifinals";
    if (teamsInRound === 8) return "Quarterfinals";
    return `Round of ${teamsInRound}`;
  }

  function createMatch(id, details) {
    return {
      id,
      bracket: details.bracket,
      roundIndex: details.roundIndex ?? 0,
      roundName: details.roundName,
      label: details.label,
      teamAId: details.teamAId ?? null,
      teamBId: details.teamBId ?? null,
      sourceA: details.sourceA ?? null,
      sourceB: details.sourceB ?? null,
      resetSourceId: details.resetSourceId ?? null,
      status: details.status ?? "waiting",
      live: false,
      winnerId: null,
      loserId: null,
      result: null,
    };
  }

  function sourceValue(matchesById, source) {
    if (!source) return { resolved: true, teamId: null };
    const sourceMatch = matchesById.get(source.matchId);
    if (!sourceMatch || !["completed", "bye", "empty"].includes(sourceMatch.status)) {
      return { resolved: false, teamId: null };
    }
    return {
      resolved: true,
      teamId: source.outcome === "winner" ? sourceMatch.winnerId : sourceMatch.loserId,
    };
  }

  function recalculate(matches) {
    const matchesById = new Map(matches.map((match) => [match.id, match]));

    for (const match of matches) {
      if (match.resetSourceId) {
        const final = matchesById.get(match.resetSourceId);
        const shouldReset = final?.status === "completed" && final.winnerId === final.teamBId;
        const previousA = match.teamAId;
        const previousB = match.teamBId;
        match.teamAId = shouldReset ? final.teamAId : null;
        match.teamBId = shouldReset ? final.teamBId : null;
        if (shouldReset) {
          if (previousA !== match.teamAId || previousB !== match.teamBId) {
            match.result = null;
            match.winnerId = null;
            match.loserId = null;
            match.live = false;
          }
          match.status = match.result ? "completed" : "upcoming";
        } else {
          match.result = null;
          match.winnerId = null;
          match.loserId = null;
          match.status = final?.status === "completed" ? "cancelled" : "waiting";
        }
        continue;
      }

      const valueA = sourceValue(matchesById, match.sourceA);
      const valueB = sourceValue(matchesById, match.sourceB);
      const nextA = match.sourceA ? valueA.teamId : match.teamAId;
      const nextB = match.sourceB ? valueB.teamId : match.teamBId;
      const previousA = match.teamAId;
      const previousB = match.teamBId;
      match.teamAId = nextA;
      match.teamBId = nextB;

      if (previousA !== nextA || previousB !== nextB) {
        match.result = null;
        match.winnerId = null;
        match.loserId = null;
        match.live = false;
      }

      if (!valueA.resolved || !valueB.resolved) {
        match.status = "waiting";
      } else if (!nextA && !nextB) {
        match.status = "empty";
      } else if (!nextA || !nextB) {
        match.status = "bye";
        match.winnerId = nextA || nextB;
        match.loserId = null;
        match.result = { type: "bye" };
      } else if (match.result && match.winnerId) {
        match.status = "completed";
      } else {
        match.status = "upcoming";
      }
    }
    return matches;
  }

  function validateTeams(teams) {
    if (!Array.isArray(teams) || teams.length < 2 || teams.length > 32) {
      throw new Error("A tournament needs between 2 and 32 teams.");
    }
    const ids = teams.map((team) => team.id);
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
      throw new Error("Every team needs a unique ID.");
    }
  }

  function createSingleElimination(teams, bracketSize) {
    const positions = new Array(bracketSize).fill(null);
    const seeds = seedOrder(bracketSize);
    const teamsBySeed = new Map(orderedTeams(teams).map((team, index) => [index + 1, team]));
    seeds.forEach((seed, index) => {
      positions[index] = teamsBySeed.get(seed)?.id ?? null;
    });

    const matches = [];
    let priorRound = [];
    const roundCount = Math.log2(bracketSize);
    for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
      const matchCount = bracketSize / 2 ** (roundIndex + 1);
      const round = [];
      for (let slotIndex = 0; slotIndex < matchCount; slotIndex += 1) {
        const id = `M${String(matches.length + 1).padStart(3, "0")}`;
        const details = {
          bracket: "main",
          roundIndex,
          roundName: roundLabel(bracketSize, roundIndex),
          label: `${roundLabel(bracketSize, roundIndex)} ${slotIndex + 1}`,
        };
        if (roundIndex === 0) {
          details.teamAId = positions[slotIndex * 2];
          details.teamBId = positions[slotIndex * 2 + 1];
        } else {
          details.sourceA = { matchId: priorRound[slotIndex * 2].id, outcome: "winner" };
          details.sourceB = { matchId: priorRound[slotIndex * 2 + 1].id, outcome: "winner" };
        }
        const match = createMatch(id, details);
        matches.push(match);
        round.push(match);
      }
      priorRound = round;
    }
    return recalculate(matches);
  }

  function createDoubleElimination(teams, bracketSize) {
    if (bracketSize === 2) {
      const matches = createSingleElimination(teams, bracketSize);
      matches[0].bracket = "grand";
      matches[0].roundName = "Grand Final";
      matches[0].label = "Grand Final";
      return matches;
    }

    const upperRounds = [];
    const matches = [];
    const positions = new Array(bracketSize).fill(null);
    const teamsBySeed = new Map(orderedTeams(teams).map((team, index) => [index + 1, team]));
    seedOrder(bracketSize).forEach((seed, index) => {
      positions[index] = teamsBySeed.get(seed)?.id ?? null;
    });

    const upperRoundCount = Math.log2(bracketSize);
    for (let roundIndex = 0; roundIndex < upperRoundCount; roundIndex += 1) {
      const round = [];
      const matchCount = bracketSize / 2 ** (roundIndex + 1);
      for (let slotIndex = 0; slotIndex < matchCount; slotIndex += 1) {
        const id = `M${String(matches.length + 1).padStart(3, "0")}`;
        const roundName = roundLabel(bracketSize, roundIndex);
        const details = {
          bracket: "upper",
          roundIndex,
          roundName,
          label: `Upper ${roundName} ${slotIndex + 1}`,
        };
        if (roundIndex === 0) {
          details.teamAId = positions[slotIndex * 2];
          details.teamBId = positions[slotIndex * 2 + 1];
        } else {
          details.sourceA = { matchId: upperRounds[roundIndex - 1][slotIndex * 2].id, outcome: "winner" };
          details.sourceB = { matchId: upperRounds[roundIndex - 1][slotIndex * 2 + 1].id, outcome: "winner" };
        }
        const match = createMatch(id, details);
        matches.push(match);
        round.push(match);
      }
      upperRounds.push(round);
    }

    const lowerRounds = [];
    let lowerRoundNumber = 1;
    const firstLowerRound = [];
    for (let slotIndex = 0; slotIndex < bracketSize / 4; slotIndex += 1) {
      const id = `M${String(matches.length + 1).padStart(3, "0")}`;
      const match = createMatch(id, {
        bracket: "lower",
        roundIndex: 0,
        roundName: `Lower Round ${lowerRoundNumber}`,
        label: `Lower Round ${lowerRoundNumber} ${slotIndex + 1}`,
        sourceA: { matchId: upperRounds[0][slotIndex * 2].id, outcome: "loser" },
        sourceB: { matchId: upperRounds[0][slotIndex * 2 + 1].id, outcome: "loser" },
      });
      matches.push(match);
      firstLowerRound.push(match);
    }
    lowerRounds.push(firstLowerRound);

    let previousLowerRound = firstLowerRound;
    for (let upperRoundIndex = 1; upperRoundIndex < upperRoundCount; upperRoundIndex += 1) {
      lowerRoundNumber += 1;
      const crossRound = [];
      for (let slotIndex = 0; slotIndex < upperRounds[upperRoundIndex].length; slotIndex += 1) {
        const id = `M${String(matches.length + 1).padStart(3, "0")}`;
        const match = createMatch(id, {
          bracket: "lower",
          roundIndex: lowerRoundNumber - 1,
          roundName: `Lower Round ${lowerRoundNumber}`,
          label: `Lower Round ${lowerRoundNumber} ${slotIndex + 1}`,
          sourceA: { matchId: previousLowerRound[slotIndex].id, outcome: "winner" },
          sourceB: { matchId: upperRounds[upperRoundIndex][slotIndex].id, outcome: "loser" },
        });
        matches.push(match);
        crossRound.push(match);
      }
      lowerRounds.push(crossRound);
      previousLowerRound = crossRound;

      if (upperRoundIndex < upperRoundCount - 1) {
        lowerRoundNumber += 1;
        const consolidationRound = [];
        for (let slotIndex = 0; slotIndex < previousLowerRound.length / 2; slotIndex += 1) {
          const id = `M${String(matches.length + 1).padStart(3, "0")}`;
          const match = createMatch(id, {
            bracket: "lower",
            roundIndex: lowerRoundNumber - 1,
            roundName: `Lower Round ${lowerRoundNumber}`,
            label: `Lower Round ${lowerRoundNumber} ${slotIndex + 1}`,
            sourceA: { matchId: previousLowerRound[slotIndex * 2].id, outcome: "winner" },
            sourceB: { matchId: previousLowerRound[slotIndex * 2 + 1].id, outcome: "winner" },
          });
          matches.push(match);
          consolidationRound.push(match);
        }
        lowerRounds.push(consolidationRound);
        previousLowerRound = consolidationRound;
      }
    }

    const upperFinal = upperRounds.at(-1)[0];
    const lowerFinal = lowerRounds.at(-1)[0];
    const finalId = `M${String(matches.length + 1).padStart(3, "0")}`;
    const grandFinal = createMatch(finalId, {
      bracket: "grand",
      roundName: "Grand Final",
      label: "Grand Final",
      sourceA: { matchId: upperFinal.id, outcome: "winner" },
      sourceB: { matchId: lowerFinal.id, outcome: "winner" },
    });
    matches.push(grandFinal);
    matches.push(createMatch(`M${String(matches.length + 1).padStart(3, "0")}`, {
      bracket: "grand",
      roundName: "Grand Final Reset",
      label: "Grand Final Reset",
      resetSourceId: grandFinal.id,
      status: "conditional",
    }));

    return recalculate(matches);
  }

  function createRoundRobin(teams) {
    const entrants = orderedTeams(teams).map((team) => team.id);
    if (entrants.length % 2) entrants.push(null);
    const rotation = [...entrants];
    const matches = [];
    const roundCount = rotation.length - 1;
    let matchNumber = 0;

    for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
      for (let slotIndex = 0; slotIndex < rotation.length / 2; slotIndex += 1) {
        const teamAId = rotation[slotIndex];
        const teamBId = rotation[rotation.length - 1 - slotIndex];
        if (!teamAId || !teamBId) continue;
        matchNumber += 1;
        matches.push(createMatch(`M${String(matchNumber).padStart(3, "0")}`, {
          bracket: "round-robin",
          roundIndex,
          roundName: `Matchday ${roundIndex + 1}`,
          label: `Match ${matchNumber}`,
          teamAId,
          teamBId,
          status: "upcoming",
        }));
      }
      rotation.splice(1, 0, rotation.pop());
    }
    return matches;
  }

  function generateMatches(teams, format) {
    validateTeams(teams);
    if (!formats.has(format)) throw new Error("Choose a supported tournament format.");
    if (format === "round-robin") return createRoundRobin(teams);
    const bracketSize = nextPowerOfTwo(teams.length);
    return format === "double-elimination"
      ? createDoubleElimination(teams, bracketSize)
      : createSingleElimination(teams, bracketSize);
  }

  function getMatch(matches, matchId) {
    const match = matches.find((item) => item.id === matchId);
    if (!match) throw new Error("Match not found.");
    if (!["upcoming", "completed"].includes(match.status)) {
      throw new Error("This match is not ready for a result.");
    }
    if (!match.teamAId || !match.teamBId) throw new Error("Both teams must be assigned before recording a result.");
    return match;
  }

  function recordScore(matches, matchId, scoreA, scoreB, bestOf) {
    if (!bestOfValues.has(bestOf)) throw new Error("Best-of must be 1, 3, or 5.");
    const match = getMatch(matches, matchId);
    const target = Math.ceil(bestOf / 2);
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)
      || scoreA < 0 || scoreB < 0 || scoreA > target || scoreB > target
      || (scoreA !== target && scoreB !== target) || scoreA === scoreB) {
      throw new Error(`A BO${bestOf} score must end when one team reaches ${target} game${target === 1 ? "" : "s"}.`);
    }
    match.result = { type: "score", scoreA, scoreB };
    match.winnerId = scoreA > scoreB ? match.teamAId : match.teamBId;
    match.loserId = scoreA > scoreB ? match.teamBId : match.teamAId;
    match.status = "completed";
    match.live = false;
    return recalculate(matches);
  }

  function recordForfeit(matches, matchId, winnerId, reason = "") {
    const match = getMatch(matches, matchId);
    if (![match.teamAId, match.teamBId].includes(winnerId)) {
      throw new Error("The forfeit winner must be one of the assigned teams.");
    }
    match.result = { type: "forfeit", reason: String(reason).trim() };
    match.winnerId = winnerId;
    match.loserId = winnerId === match.teamAId ? match.teamBId : match.teamAId;
    match.status = "completed";
    match.live = false;
    return recalculate(matches);
  }

  function getStandings(teams, matches) {
    const stats = new Map(teams.map((team, index) => [team.id, {
      team,
      registrationOrder: index,
      matchWins: 0,
      matchLosses: 0,
      gameWins: 0,
      gameLosses: 0,
      gameDifferential: 0,
      miniTableWins: 0,
    }]));
    const completedMatches = matches.filter((match) => match.status === "completed");

    for (const match of completedMatches) {
      const winner = stats.get(match.winnerId);
      const loser = stats.get(match.loserId);
      if (!winner || !loser) continue;
      winner.matchWins += 1;
      loser.matchLosses += 1;
      if (match.result?.type === "score") {
        const sideA = stats.get(match.teamAId);
        const sideB = stats.get(match.teamBId);
        sideA.gameWins += match.result.scoreA;
        sideA.gameLosses += match.result.scoreB;
        sideB.gameWins += match.result.scoreB;
        sideB.gameLosses += match.result.scoreA;
      }
    }
    for (const row of stats.values()) row.gameDifferential = row.gameWins - row.gameLosses;

    const rows = [...stats.values()].sort((left, right) => right.matchWins - left.matchWins
      || left.registrationOrder - right.registrationOrder);
    const matchWinGroups = [];
    for (const row of rows) {
      const group = matchWinGroups.at(-1);
      if (!group || group[0].matchWins !== row.matchWins) matchWinGroups.push([row]);
      else group.push(row);
    }

    const orderedRows = [];
    for (const group of matchWinGroups) {
      if (group.length < 2) continue;
      const tiedIds = new Set(group.map((row) => row.team.id));
      for (const match of completedMatches) {
        if (tiedIds.has(match.teamAId) && tiedIds.has(match.teamBId)) {
          const winner = stats.get(match.winnerId);
          if (winner) winner.miniTableWins += 1;
        }
      }
      group.sort((left, right) => right.miniTableWins - left.miniTableWins
        || right.gameDifferential - left.gameDifferential
        || left.registrationOrder - right.registrationOrder);
    }
    for (const group of matchWinGroups) orderedRows.push(...group);

    let previousKey = null;
    let rank = 0;
    return orderedRows.map((row, index) => {
      const key = `${row.matchWins}:${row.miniTableWins}:${row.gameDifferential}`;
      if (key !== previousKey) rank = index + 1;
      previousKey = key;
      return { ...row, rank, tied: orderedRows.filter((candidate) =>
        candidate.matchWins === row.matchWins
        && candidate.miniTableWins === row.miniTableWins
        && candidate.gameDifferential === row.gameDifferential).length > 1 };
    });
  }

  return { generateMatches, getStandings, recordForfeit, recordScore, recalculate };
});