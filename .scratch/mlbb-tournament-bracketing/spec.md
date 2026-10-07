# MLBB Tournament Bracketing System

Status: ready-for-agent

## Problem Statement

An organizer needs a reliable way to set up an MLBB tournament, register teams, run matches, and determine a champion. Without a single tournament workspace, team details, brackets, match times, and results are difficult to keep consistent, and spectators lack one clear place to follow the event.

## Solution

Provide a responsive, dark esports-style tournament desk that runs as a standalone vanilla JavaScript app. Organizers create and manage multiple tournaments in one browser, enter teams and rosters, generate single-elimination, double-elimination, or round-robin formats, schedule matches, record results, and view standings and champions. A read-only public view is available in the organizer's browser; a standalone HTML snapshot can be exported for spectators, and JSON export/import supports backup and restore.

## User Stories

1. As an organizer, I want to create multiple tournaments, so that I can manage separate MLBB events without mixing their teams or results.
2. As an organizer, I want to switch between saved tournaments, so that I can work on the intended event.
3. As an organizer, I want to enter a tournament name, date, venue, format, team limit, and default series length, so that the event has the details needed to run.
4. As an organizer, I want a tournament to move from registration to in progress and then completed, so that its lifecycle is clear.
5. As an organizer, I want to edit tournament details before and during the event, so that corrections do not require recreating the tournament.
6. As an organizer, I want a tournament limit between 2 and 32 teams, so that entries fit the supported bracket and browser storage constraints.
7. As an organizer, I want to add, edit, and remove teams during registration, so that the roster reflects accepted entries.
8. As an organizer, I want to save a team with an incomplete roster, so that registration can be recorded before every player detail is available.
9. As an organizer, I want to enter a team name and upload its logo, so that the bracket and public view identify the team clearly.
10. As an organizer, I want to enter five starting players and optionally one substitute, so that each team's competition roster is recorded.
11. As an organizer, I want to mark an optional team captain, so that the roster identifies its point of contact.
12. As an organizer, I want incomplete rosters to be blocked from bracket generation, so that every eligible team has five starters.
13. As an organizer, I want teams to receive editable, unique seeds before bracket generation, so that I can control bracket placement.
14. As an organizer, I want team status to show Registered before bracket generation, Qualified while a team can still advance, and Eliminated after its final loss, so that participation state is understandable.
15. As an organizer, I want teams in round robin to remain Qualified during the event, so that a match loss is not mistaken for elimination.
16. As an organizer, I want to generate a single-elimination bracket for the registered teams, so that each loss removes a team from championship contention.
17. As an organizer, I want to generate a double-elimination bracket, so that a team remains in contention after one loss and is eliminated after its second.
18. As an organizer, I want a conditional grand-final reset when the lower-bracket finalist wins the first grand final, so that both finalists have to lose twice.
19. As an organizer, I want to generate a round-robin schedule containing each team pairing once, so that every team competes against every other team.
20. As an organizer, I want non-power-of-two elimination brackets to award byes to the highest seeds, so that every entrant can be placed without inventing a match.
21. As an organizer, I want bracket rounds to be labeled by stage, such as round of 16, quarterfinals, semifinals, and grand final, so that the path to the champion is easy to follow.
22. As an organizer, I want a bye to advance its team automatically without counting as a played match, so that match totals reflect actual contests.
23. As an organizer, I want a match to display both teams, its stage, schedule, series format, status, and result, so that match details are visible at a glance.
24. As an organizer, I want to schedule each match manually in my local timezone, so that fixtures fit the venue and event plan.
25. As an organizer, I want to set each match to best of 1, best of 3, or best of 5, so that the series length can vary by stage.
26. As an organizer, I want best of 3 to be the default series length, so that match setup is quick while still allowing per-match overrides.
27. As an organizer, I want a match to be marked upcoming or live, so that the bracket distinguishes future and ongoing play.
28. As an organizer, I want to enter games won in a series and have the app infer the winner at the series threshold, so that valid results advance automatically.
29. As an organizer, I want invalid or tied series scores to be rejected, so that a match cannot complete without a valid winner.
30. As an organizer, I want to record a forfeit by selecting the winning team and optionally entering a reason, so that no artificial game score is required.
31. As an organizer, I want to correct a match result, so that an entry mistake does not permanently corrupt the tournament.
32. As an organizer, I want changing an earlier winner to clear downstream results that no longer have valid entrants, so that the bracket remains consistent.
33. As an organizer, I want the bracket to advance winners automatically, so that I do not have to manually copy teams into later rounds.
34. As an organizer, I want the dashboard to show total teams, total matches, completed matches, upcoming matches, live matches, and the champion, so that event progress is easy to scan.
35. As an organizer, I want round-robin standings to rank teams by match wins, then a head-to-head mini-table, then overall game differential, so that tied records are resolved consistently.
36. As an organizer, I want to order any standings groups that remain tied after the agreed criteria, so that final placements and the champion can be decided explicitly.
37. As a spectator, I want a read-only public view of the tournament, so that I can follow teams, brackets, schedules, results, standings, and the champion without editing event data.
38. As a spectator, I want completed winners and scores highlighted in the bracket, so that I can understand the event's current state.
39. As an organizer, I want to export a standalone HTML public snapshot, so that I can share tournament information without requiring a server.
40. As a spectator, I want the exported snapshot to identify itself as a point-in-time copy, so that I know it will not receive later updates automatically.
41. As an organizer, I want to export and restore tournament data as JSON, so that I can back up or move my local records.
42. As an organizer, I want tournament data to persist in localStorage, so that it remains available when I reopen the app in the same browser.
43. As an organizer, I want the interface to adapt to desktop and mobile screens, so that I can manage matches at the venue from different devices.
44. As an organizer, I want the public view and bracket to use a clear MLBB esports visual style, so that the event feels coherent and the tournament path remains easy to scan.
45. As an organizer or spectator, I want right-angle bracket connectors to show winner and loser advancement between matches, including bye and cross-bracket paths, so that I can follow each route through single- and double-elimination formats.
46. As an organizer or spectator, I want double-elimination upper and lower paths arranged as one connected top-and-bottom diagram, with the championship between them at the right, so that the full route to the champion is easy to follow.

## Implementation Decisions

- The application is a standalone vanilla JavaScript experience with responsive HTML and CSS and no backend or account system.
- Tournament data is stored in localStorage in the organizer's browser. Multiple tournaments are supported, with one selected as active.
- Public mode is read-only in the interface but is not a security boundary. A standalone HTML export is a frozen snapshot; cross-device live updates are not supported.
- JSON export/import is the backup and restore mechanism. Imported logo data is restricted to supported raster image data.
- The tournament lifecycle is Draft -> Registration -> In Progress -> Completed. Bracket generation closes registration; a champion completes the tournament.
- Team capacity is 2 to 32. Teams may be saved with incomplete rosters, but bracket generation requires five named starters. One substitute and one captain marker are optional.
- Team seeds are organizer-editable and must be unique from 1 through the number of entrants. Structural changes or entrant changes after bracket generation require an explicit reset that clears match schedules and results. Team details remain editable.
- Elimination brackets use seeded placement and automatically advance byes for the highest seeds. Double elimination uses upper and lower brackets; a lower-bracket win in the first grand final activates a reset match.
- Single- and double-elimination views draw right-angle connectors from their persisted match sources, including bye advancement, upper/lower cross-bracket paths, and a visibly conditional grand-final reset. Double elimination is one horizontally scrollable diagram with upper matches in a top lane, lower matches in a bottom lane, and the championship between them at the right. Single elimination keeps its path-to-final layout; round-robin views are unchanged.
- A waiting reset remains visible with its conditional path; once the first Grand Final makes the reset unnecessary, omit the cancelled reset card and its connector from both organizer and public bracket views. An activated reset remains visible and playable.
- Round-robin fixtures include every unique pairing once. Standings use match wins, head-to-head mini-table wins among the tied group, overall game differential, then organizer-entered ordering for any remaining tie.
- Matches are scheduled manually. Best of 3 is the default; each match can be set to best of 1, 3, or 5. Series scores count games won and require one team to reach the series threshold. Forfeits record a selected winner and optional reason without a fabricated score.
- Correcting a result recalculates progression and clears dependent results when their entrants change. A match can be marked live independently of its scheduled time.
- Team logos are accepted as PNG, JPG, or WebP, resized to a small local raster representation, and stored with the tournament data.
- Public and organizer views use the same persisted tournament state. The public bracket is read-only and includes teams, matches, schedules, scores, standings where applicable, and champion state.
- The domain vocabulary is defined in the project's glossary: Tournament, Team, Match, Series score, Bye, Upper bracket, Lower bracket, Grand-final reset, Team status, Round-robin tie, and Public snapshot.

## Testing Decisions

- Tests should verify externally visible behavior and domain outcomes rather than private helper structure.
- Keep focused Node tests for bracket generation, byes, valid series scores, automatic advancement, round-robin fixtures and standings, double-elimination resets, and result corrections. The existing bracket-engine suite is prior art for these rules.
- Use one browser-level acceptance seam through the rendered application with isolated localStorage. Cover tournament creation, incomplete and complete roster handling, bracket generation, score entry and advancement, public read-only results, persistence after reload, and HTML/JSON export behavior.
- Include scenarios at the supported boundaries: 2 and 32 teams, non-power-of-two brackets, a round-robin tie requiring organizer ordering, a double-elimination reset, and a corrected result that invalidates downstream entrants.
- Verify bracket connector rendering and control usability at desktop and mobile viewport sizes using the existing Playwright browser-test setup.

## Out of Scope

- User accounts, authentication, roles, cloud persistence, and cross-device synchronization.
- A remotely hosted live public page or real-time spectator updates.
- Self-service team registration from other devices.
- Automatic match scheduling, venue optimization, or conflict detection.
- Additional tournament formats, qualifier stages, or automatic tie-break rules beyond those listed above.
- MLBB game-server integration, live game telemetry, payments, or external tournament-service imports.

## Further Notes

- LocalStorage is scoped to the organizer's browser profile and can be cleared by browser settings; organizers should use JSON backups for portability.
- The public HTML file is a point-in-time snapshot. Re-export it after results or schedules change.
- The local issue-tracker convention uses one feature directory per spec. Implementation tickets, if needed, belong in that feature's `issues/` directory and should use the configured triage vocabulary.
