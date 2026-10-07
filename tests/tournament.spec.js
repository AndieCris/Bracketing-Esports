const { test, expect } = require("@playwright/test");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const fs = require("node:fs/promises");

const appUrl = pathToFileURL(path.resolve(__dirname, "..", "index.html")).href;

test("organizer creates a tournament, records a champion, and spectators see saved results", async ({ browser }) => {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(appUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "New tournament" }).click();
  await page.getByLabel("Tournament name").fill("Acceptance Cup");
  await page.getByLabel("Team limit").fill("2");
  await page.getByRole("button", { name: "Create tournament" }).click();

  await page.getByRole("button", { name: "Teams" }).click();
  await page.getByRole("button", { name: "Add team" }).first().click();
  await page.getByLabel("Team name").fill("North Stars");
  for (let index = 1; index <= 4; index += 1) {
    await page.getByLabel(`Starter ${index} in-game name`).fill(`North${index}`);
  }
  await page.getByRole("button", { name: "Save team" }).click();
  await page.getByRole("button", { name: "Add team" }).first().click();
  await page.getByLabel("Team name").fill("South Wolves");
  for (let index = 1; index <= 5; index += 1) {
    await page.getByLabel(`Starter ${index} in-game name`).fill(`South${index}`);
  }
  await page.getByRole("button", { name: "Save team" }).click();

  await page.getByRole("button", { name: "Generate bracket" }).first().click();
  await expect(page.getByRole("status")).toContainText("Complete all five starter names for North Stars.");
  await page.getByRole("button", { name: "Edit North Stars" }).click();
  await page.getByLabel("Starter 5 in-game name").fill("North5");
  await page.getByRole("button", { name: "Save team" }).click();

  await page.getByRole("button", { name: "Generate bracket" }).first().click();
  await expect(page.getByText("Grand Final 1")).toBeVisible();
  await page.getByRole("button", { name: "Bracket" }).click();
  await expect(page.locator(".bracket-board-integrated")).toHaveCount(0);
  await page.getByRole("button", { name: "Matches" }).click();
  await page.getByRole("button", { name: "Manage" }).click();
  await page.getByLabel("North Stars games won").fill("2");
  await page.getByLabel("South Wolves games won").fill("0");
  await page.getByRole("button", { name: "Save match" }).click();

  await page.getByRole("button", { name: "Overview" }).click();
  await expect(page.locator(".stat").nth(4).locator(".stat-value")).toHaveText("North Stars");
  await page.getByRole("button", { name: "Public view" }).click();
  await expect(page.getByRole("heading", { name: "Acceptance Cup" })).toBeVisible();
  await expect(page.locator(".public-champion")).toContainText("North Stars");
  await expect(page.locator(".match-row-actions button")).toHaveCount(0);
  await expect(page.locator(".public-team").filter({ hasText: "North Stars" })).toBeVisible();

  const [htmlDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export public page" }).click(),
  ]);
  const htmlSnapshot = await fs.readFile(await htmlDownload.path(), "utf8");
  expect(htmlSnapshot).toContain("This file does not update automatically.");

  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Backup" }).click(),
  ]);
  const backupPath = await jsonDownload.path();
  const backup = JSON.parse(await fs.readFile(backupPath, "utf8"));
  expect(backup.tournaments[0].name).toBe("Acceptance Cup");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  page.once("dialog", (nativeDialog) => nativeDialog.accept());
  await page.locator("#backup-file").setInputFiles(backupPath);
  await expect(page.getByRole("combobox", { name: "Select tournament" })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Public view" }).click();
  await expect(page.locator(".public-champion")).toContainText("North Stars");
  await expect(page.locator(".public-team").filter({ hasText: "North Stars" })).toBeVisible();
  await context.close();
});

test("double-elimination bracket shares aligned upper and lower lanes", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(appUrl);
  await page.evaluate(() => {
    const teams = Array.from({ length: 8 }, (_, index) => ({
      id: `team-${index + 1}`,
      name: `Team ${index + 1}`,
      seed: index + 1,
      players: [],
      status: "Registered",
      logo: "",
    }));
    const tournament = {
      id: "double-elimination-layout",
      name: "Layout Check",
      date: "",
      venue: "",
      format: "double-elimination",
      teamLimit: teams.length,
      bestOf: 3,
      status: "in-progress",
      teams,
      matches: window.TournamentEngine.generateMatches(teams, "double-elimination"),
      championId: null,
      manualTieBreakOrder: [],
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem("arena-circuit-tournaments-v1", JSON.stringify({
      tournaments: [tournament],
      activeTournamentId: tournament.id,
    }));
  });
  await page.reload();
  await page.getByRole("button", { name: "Bracket" }).click();

  const board = page.locator(".bracket-board-integrated");
  await expect(board).toBeVisible();
  await expect(board.locator(".bracket-upper-round")).toHaveCount(6);
  await expect(board.locator(".bracket-lower-round")).toHaveCount(6);
  await expect(board.locator(".bracket-final-lane .bracket-match")).toHaveCount(2);
  await expect(board.locator(".bracket-connector.loser")).toHaveCount(7);

  const geometry = await board.evaluate((element) => {
    const topLane = element.querySelector(".bracket-upper-round");
    const bottomLane = element.querySelector(".bracket-lower-round");
    const championship = element.querySelector(".bracket-final-lane");
    const finalColumn = championship.closest(".bracket-stage-column");
    return {
      topStartsBeforeBottom: topLane.getBoundingClientRect().top < bottomLane.getBoundingClientRect().top,
      championshipIsLastColumn: [...element.querySelectorAll(".bracket-stage-column")].at(-1) === finalColumn,
      championshipIsCenteredBetweenLanes: Math.abs(
        [...championship.querySelectorAll(".bracket-match")].reduce((_, match, index, matches) => {
          if (index !== matches.length - 1) return _;
          const first = matches[0].getBoundingClientRect();
          const last = match.getBoundingClientRect();
          return (first.top + last.bottom) / 2;
        }, 0) - (topLane.getBoundingClientRect().top + bottomLane.getBoundingClientRect().bottom) / 2,
      ) < 2,
      scrollableWidth: element.parentElement.scrollWidth > element.parentElement.clientWidth,
    };
  });
  expect(geometry.topStartsBeforeBottom).toBe(true);
  expect(geometry.championshipIsLastColumn).toBe(true);
  expect(geometry.championshipIsCenteredBetweenLanes).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileScroll = await board.evaluate((element) =>
    element.parentElement.scrollWidth > element.parentElement.clientWidth);
  expect(mobileScroll).toBe(true);
  await context.close();
});
