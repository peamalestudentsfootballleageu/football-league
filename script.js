/* ============================================================
   CONFIGURATION: THE ONLY PLACE YOU NEED TO EDIT
   Replace the text between the quotation marks with your
   Apps Script Web app URL. It must end with /exec
   Do NOT add ?action=... at the end.
   ============================================================ */
const API_URL = "https://script.google.com/macros/s/AKfycbwgUi3hwGmj9TqK7fy4CpVi2RK_V8HIlMfSn1fYATwiVMib77gGnSD41ow43iVbXkGK/exec";
/* ============================================================ */

const PAGE_NAMES = ["home", "table", "fixtures", "results", "teams"];

// Holds everything loaded from the sheet
const leagueData = { settings: {}, teams: [], fixtures: [], results: [] };

function byId(id) {
  return document.getElementById(id);
}

/* ---------- Loading / error message ---------- */
function showStatus(message, isError) {
  const box = byId("status-message");
  box.textContent = message;
  box.className = isError ? "status error" : "status";
  box.hidden = false;
}

function hideStatus() {
  byId("status-message").hidden = true;
}

/* ---------- Getting data from the API ---------- */
async function fetchLeagueData() {
  if (API_URL.indexOf("PASTE_YOUR") !== -1) {
    throw new Error("The API address has not been added yet. Open script.js and replace PASTE_YOUR_APPS_SCRIPT_URL_HERE with your Web app URL.");
  }

  const response = await fetch(API_URL + "?action=all");
  if (!response.ok) {
    throw new Error("The server replied with an error (code " + response.status + ").");
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error("The server reply could not be read. Check that the API URL is correct.");
  }

  if (!payload || payload.ok !== true || !payload.data) {
    throw new Error(payload && payload.error ? payload.error : "The server sent unexpected data.");
  }
  return payload.data;
}

// Makes sure each part of the data has the right shape, even if something is missing.
function cleanLeagueData(rawData) {
  return {
    settings: rawData.settings && typeof rawData.settings === "object" ? rawData.settings : {},
    teams: Array.isArray(rawData.teams) ? rawData.teams : [],
    fixtures: Array.isArray(rawData.fixtures) ? rawData.fixtures : [],
    results: Array.isArray(rawData.results) ? rawData.results : []
  };
}

/* ---------- Showing data on the page ---------- */
function showLogo(imageElement, url) {
  if (url) {
    imageElement.src = url;
    imageElement.hidden = false;
  } else {
    imageElement.hidden = true;
  }
}

function renderSettings() {
  const settings = leagueData.settings;
  const leagueName = settings["League Name"] || "Football League";
  const season = settings["Season"] ? "Season " + settings["Season"] : "";

  document.title = leagueName;
    byId("header-name").textContent = settings["School Name"] || leagueName;
  byId("hero-name").textContent = leagueName;
  byId("hero-season").textContent = season;
  byId("hero-description").textContent = settings["Description"] || "";
  byId("footer-text").textContent = leagueName + (season ? " | " + season : "");

  showLogo(byId("header-logo"), settings["League Logo"]);
  showLogo(byId("hero-logo"), settings["League Logo"]);
}

function renderHomeSummary() {
  byId("home-summary").textContent =
    leagueData.teams.length + " teams, " +
    leagueData.results.length + " matches played, " +
    leagueData.fixtures.length + " matches still to play.";
}

// Short text for the round badge, e.g. "Grade 9A" becomes "9A"
function getTeamInitials(teamName) {
  const words = teamName.split(" ");
  const lastWord = words[words.length - 1];
  return lastWord.length <= 4 ? lastWord : teamName.slice(0, 3).toUpperCase();
}

// Shows the team logo, or a round badge if there is no logo (or it fails to load)
function createTeamBadge(team) {
  const badge = document.createElement("div");
  badge.className = "team-badge";
  badge.textContent = getTeamInitials(team.name);

  if (!team.logo) return badge;

  const logo = document.createElement("img");
  logo.className = "team-logo";
  logo.alt = team.name + " logo";
  logo.addEventListener("error", function () {
    logo.replaceWith(badge);
  });
  logo.src = team.logo;
  return logo;
}

function renderTeamsList() {
  const grid = byId("teams-list");
  grid.innerHTML = "";

  if (leagueData.teams.length === 0) {
    grid.textContent = "No teams have been added yet.";
    return;
  }

  leagueData.teams.forEach(function (team) {
    const card = document.createElement("div");
    card.className = "team-card";

    const name = document.createElement("div");
    name.className = "team-name";
    name.textContent = team.name;

    card.appendChild(createTeamBadge(team));
    card.appendChild(name);
    grid.appendChild(card);
  });
}

/* ---------- Dates and times for display ---------- */

// Turns "2026-10-10" into a date without any time zone shifting
function parseDateText(dateText) {
  const parts = String(dateText).split("-");
  if (parts.length !== 3) return null;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return isNaN(date.getTime()) ? null : date;
}

// "2026-10-10" becomes "Saturday, October 10"
function formatDateForDisplay(dateText) {
  const date = parseDateText(dateText);
  if (!date) return dateText || "Date to be confirmed";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// "15:00" becomes "3:00 PM"
function formatTimeForDisplay(timeText) {
  const parts = String(timeText).split(":");
  if (parts.length < 2) return timeText || "";
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (isNaN(hours) || isNaN(minutes)) return timeText;
  const period = hours >= 12 ? "PM" : "AM";
  const hourOnClock = hours % 12 || 12;
  return hourOnClock + ":" + String(minutes).padStart(2, "0") + " " + period;
}

/* ---------- Fixtures ---------- */

// Fixtures that do not have a result yet, soonest first
function getUpcomingFixtures() {
  const playedMatchIds = leagueData.results.map(function (result) {
    return result.matchId;
  });

  return leagueData.fixtures
    .filter(function (fixture) {
      return !fixture.matchId || playedMatchIds.indexOf(fixture.matchId) === -1;
    })
    .sort(function (a, b) {
      return (a.date + " " + a.time).localeCompare(b.date + " " + b.time);
    });
}

function createFixtureCard(fixture) {
  const card = document.createElement("article");
  card.className = "match-card";

  const dateLine = document.createElement("p");
  dateLine.className = "match-date";
  const timeText = formatTimeForDisplay(fixture.time);
  dateLine.textContent = formatDateForDisplay(fixture.date) + (timeText ? " at " + timeText : "");

  const teams = document.createElement("div");
  teams.className = "match-teams";

  const home = document.createElement("span");
  home.className = "match-team home";
  home.textContent = fixture.homeTeam;

  const versus = document.createElement("span");
  versus.className = "match-versus";
  versus.textContent = "vs";

  const away = document.createElement("span");
  away.className = "match-team away";
  away.textContent = fixture.awayTeam;

  teams.appendChild(home);
  teams.appendChild(versus);
  teams.appendChild(away);

  const details = document.createElement("div");
  details.className = "match-details";
  if (fixture.venue) {
    const venue = document.createElement("span");
    venue.textContent = fixture.venue;
    details.appendChild(venue);
  }
  if (fixture.status) {
    const status = document.createElement("span");
    status.className = "match-status";
    status.textContent = fixture.status;
    details.appendChild(status);
  }

  card.appendChild(dateLine);
  card.appendChild(teams);
  card.appendChild(details);
  return card;
}

function renderFixtures(listId, maxItems) {
  const list = byId(listId);
  list.innerHTML = "";

 const upcoming = getUpcomingFixtures().slice(0, maxItems);
  if (upcoming.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-message";
    message.textContent = "No upcoming fixtures right now.";
    list.appendChild(message);
    return;
  }

  upcoming.forEach(function (fixture) {
    list.appendChild(createFixtureCard(fixture));
  });
}

/* ---------- Results ---------- */

// Played matches, newest first
function getSortedResults() {
  return leagueData.results.slice().sort(function (a, b) {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return String(b.matchId).localeCompare(String(a.matchId), undefined, { numeric: true });
  });
}

function createResultCard(result) {
  const card = document.createElement("article");
  card.className = "match-card";

  const dateLine = document.createElement("p");
  dateLine.className = "match-date";
  dateLine.textContent = formatDateForDisplay(result.date);

  const teams = document.createElement("div");
  teams.className = "match-teams";

  const home = document.createElement("span");
  home.className = "match-team home";
  home.textContent = result.homeTeam;

  const score = document.createElement("span");
  score.className = "match-score";
  score.textContent = result.homeGoals + " \u2014 " + result.awayGoals;

  const away = document.createElement("span");
  away.className = "match-team away";
  away.textContent = result.awayTeam;

  teams.appendChild(home);
  teams.appendChild(score);
  teams.appendChild(away);

  card.appendChild(dateLine);
  card.appendChild(teams);
  return card;
}

function renderResults(listId, maxItems) {
  const list = byId(listId);
  list.innerHTML = "";

    const results = getSortedResults().slice(0, maxItems);
  if (results.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-message";
    message.textContent = "No results have been entered yet.";
    list.appendChild(message);
    return;
  }

  results.forEach(function (result) {
    list.appendChild(createResultCard(result));
  });
}
/* ---------- League table ---------- */

const POINTS_FOR_WIN = 3;
const POINTS_FOR_DRAW = 1;

// Adds one played match to one team's row (goalsScored and goalsConceded are from that team's point of view)
function addMatchToRow(row, goalsScored, goalsConceded) {
  row.played += 1;
  row.goalsFor += goalsScored;
  row.goalsAgainst += goalsConceded;

  if (goalsScored > goalsConceded) {
    row.won += 1;
    row.points += POINTS_FOR_WIN;
  } else if (goalsScored === goalsConceded) {
    row.drawn += 1;
    row.points += POINTS_FOR_DRAW;
  } else {
    row.lost += 1;
  }
  row.goalDifference = row.goalsFor - row.goalsAgainst;
}

// Works out the whole table from the Results tab. Nothing is stored by hand.
function calculateStandings() {
  const rowsByTeam = {};

  // Every team gets a row, even if it has not played yet
  leagueData.teams.forEach(function (team) {
    rowsByTeam[team.name] = {
      name: team.name,
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0
    };
  });

  leagueData.results.forEach(function (result) {
    const homeRow = rowsByTeam[result.homeTeam];
    const awayRow = rowsByTeam[result.awayTeam];

    // A result with a team name that is not in the Teams tab is skipped
    if (!homeRow || !awayRow) {
      console.warn("Result " + result.matchId + " skipped: team name not found in Teams tab.");
      return;
    }

    addMatchToRow(homeRow, result.homeGoals, result.awayGoals);
    addMatchToRow(awayRow, result.awayGoals, result.homeGoals);
  });

  // Sort by Points, then Goal Difference, then Goals For (then name, so the order is stable)
  return Object.keys(rowsByTeam)
    .map(function (teamName) { return rowsByTeam[teamName]; })
    .sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.name.localeCompare(b.name);
    });
}

function createTableCell(tagName, content) {
  const cell = document.createElement(tagName);
  cell.textContent = content;
  return cell;
}

function renderTable(wrapperId) {
  const wrapper = byId(wrapperId);
  wrapper.innerHTML = "";

  const standings = calculateStandings();
  if (standings.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-message";
    message.textContent = "No teams have been added yet.";
    wrapper.appendChild(message);
    return;
  }

  const table = document.createElement("table");
  table.className = "league-table";

  const headings = ["Pos", "Team", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"];
  const headRow = document.createElement("tr");
  headings.forEach(function (heading) {
    headRow.appendChild(createTableCell("th", heading));
  });
  const thead = document.createElement("thead");
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  standings.forEach(function (team, index) {
    const goalDifferenceText = team.goalDifference > 0 ? "+" + team.goalDifference : String(team.goalDifference);
    const values = [
      index + 1, team.name, team.played, team.won, team.drawn, team.lost,
      team.goalsFor, team.goalsAgainst, goalDifferenceText, team.points
    ];
    const row = document.createElement("tr");
    values.forEach(function (value) {
      row.appendChild(createTableCell("td", value));
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  wrapper.appendChild(table);
}
/* ---------- Navigation between pages ---------- */
function showPage() {
  const requestedPage = window.location.hash.replace("#", "");
  const pageName = PAGE_NAMES.indexOf(requestedPage) !== -1 ? requestedPage : "home";

  PAGE_NAMES.forEach(function (name) {
    byId(name).hidden = name !== pageName;
  });

  document.querySelectorAll(".main-nav a").forEach(function (link) {
    link.classList.toggle("active", link.dataset.page === pageName);
  });

  window.scrollTo(0, 0);
}

/* ---------- Start ---------- */
async function startWebsite() {
  showPage();
  window.addEventListener("hashchange", showPage);

  try {
    const rawData = await fetchLeagueData();
    Object.assign(leagueData, cleanLeagueData(rawData));
    renderSettings();
    renderHomeSummary();
        renderTeamsList();
           renderFixtures("fixtures-list", 100);
    renderResults("results-list", 100);
    renderTable("table-wrapper");
    renderTable("home-table");
    renderResults("home-results", 3);
    renderFixtures("home-fixtures", 3);
    hideStatus();
  } catch (error) {
    showStatus("Sorry, the league data could not be loaded. " + error.message, true);
  }
}

startWebsite();