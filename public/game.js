(function () {
  "use strict";

  const SYMBOLS = ["A", "K", "Q", "J", "10", "NINJA", "DRAGON", "PHOENIX", "SHOGUN", "WILD", "SCATTER"];
  const SYMBOL_META = {
    A: { label: "A", short: "A", kind: "low" },
    K: { label: "K", short: "K", kind: "low" },
    Q: { label: "Q", short: "Q", kind: "low" },
    J: { label: "J", short: "J", kind: "low" },
    "10": { label: "10", short: "10", kind: "low" },
    NINJA: { label: "Ninja", short: "NI", kind: "premium" },
    DRAGON: { label: "Dragon", short: "DR", kind: "premium" },
    PHOENIX: { label: "Phoenix", short: "PH", kind: "premium" },
    SHOGUN: { label: "Shogun", short: "SG", kind: "premium" },
    WILD: { label: "Wild", short: "W", kind: "wild" },
    SCATTER: { label: "Scatter", short: "SC", kind: "scatter" },
  };

  const WIN_TIERS = [
    { x: 500, title: "Legendary Win" },
    { x: 250, title: "Epic Win" },
    { x: 100, title: "Super Win" },
    { x: 50, title: "Mega Win" },
    { x: 25, title: "Big Win" },
  ];

  const TIMING = {
    cascadeWinHold: 1500,
    symbolRemove: 260,
    cascadeCountUp: 560,
    cascadeSettle: 220,
  };

  const INITIAL_GRID = [
    [{ symbol: "NINJA" }, { symbol: "A" }, { symbol: "K" }],
    [{ symbol: "DRAGON" }, { symbol: "WILD", multiplier: 2 }, { symbol: "Q" }],
    [{ symbol: "PHOENIX" }, { symbol: "SCATTER" }, { symbol: "J" }],
    [{ symbol: "SHOGUN" }, { symbol: "10" }, { symbol: "A" }],
    [{ symbol: "DRAGON" }, { symbol: "K" }, { symbol: "Q" }],
  ];

  const state = {
    phase: "boot",
    config: null,
    token: null,
    username: null,
    market: "MGA",
    balance: 0,
    bet: 1,
    displayedWin: 0,
    latestSpin: null,
    currentGrid: cloneGrid(INITIAL_GRID),
    spinIntervals: [],
    muted: true,
    toastTimer: null,
  };

  const els = {};
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    bindEvents();
    boot().catch((error) => showError(error));
  });

  function cacheElements() {
    for (const id of [
      "marketBadge",
      "profileBadge",
      "phaseBadge",
      "roundId",
      "featureStatus",
      "freeSpinStatus",
      "reels",
      "waysLayer",
      "displayedWin",
      "balanceValue",
      "lastWinValue",
      "usernameInput",
      "marketSelect",
      "betSelect",
      "loginButton",
      "spinButton",
      "muteButton",
      "sessionText",
      "paytableText",
      "loginOverlay",
      "overlayLoginButton",
      "celebrationOverlay",
      "celebrationKicker",
      "celebrationTitle",
      "celebrationAmount",
      "celebrationClose",
      "toast",
    ]) {
      els[id] = document.getElementById(id);
    }
  }

  function bindEvents() {
    els.loginButton.addEventListener("click", () => login().catch((error) => showError(error)));
    els.overlayLoginButton.addEventListener("click", () => login().catch((error) => showError(error)));
    els.spinButton.addEventListener("click", () => playSpin().catch((error) => showError(error)));
    els.celebrationClose.addEventListener("click", hideCelebration);
    els.muteButton.addEventListener("click", toggleMute);
    els.betSelect.addEventListener("change", () => {
      state.bet = Number(els.betSelect.value);
      updateSessionText();
    });
    els.marketSelect.addEventListener("change", () => {
      state.market = els.marketSelect.value;
      updateHud();
    });
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space" && state.phase === "idle") {
        event.preventDefault();
        playSpin().catch((error) => showError(error));
      }
    });
  }

  async function boot() {
    setPhase("loadingConfig");
    renderGrid(INITIAL_GRID);
    const config = await api("/api/config");
    state.config = config;
    state.market = config.markets?.default || "MGA";
    state.bet = config.bet?.default || 1;
    populateMarkets(config);
    populateBets(config);
    updateConfigText(config);
    updateHud();
    setPhase("loginRequired");
  }

  async function login() {
    setPhase("loginRequired");
    setControlsBusy(true);
    try {
      const username = els.usernameInput.value.trim() || "tester";
      const response = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, market: state.market }),
      });
      state.token = response.token;
      state.username = response.username;
      state.market = response.market || state.market;
      state.balance = Number(response.balance);
      els.marketSelect.value = state.market;
      els.loginOverlay.classList.remove("visible");
      showToast("Session started.");
      setPhase("idle");
      updateHud();
      updateSessionText();
    } finally {
      if (state.token) setPhase("idle");
      setControlsBusy(false);
    }
  }

  async function playSpin() {
    if (state.phase !== "idle") return;

    state.bet = Number(els.betSelect.value);
    state.displayedWin = 0;
    state.latestSpin = null;
    updateWinDisplay(0);
    setPhase("spinRequested");
    setControlsBusy(true);
    els.roundId.textContent = "Round: pending";
    els.featureStatus.textContent = "Reels spinning";
    els.freeSpinStatus.textContent = "Free spins: -";
    clearWaysLayer();
    startSpinAnimation();

    const startedAt = performance.now();
    let response;
    try {
      response = await api("/api/spin", {
        method: "POST",
        body: JSON.stringify({ bet: state.bet }),
      });
    } catch (error) {
      stopSpinAnimation();
      setPhase("idle");
      setControlsBusy(false);
      throw error;
    }

    const elapsed = performance.now() - startedAt;
    if (elapsed < 850) await sleep(850 - elapsed);

    state.latestSpin = response;
    await presentSpin(response);
    setPhase("settle");
    state.balance = Number(response.balance);
    state.displayedWin = Number(response.totalWin);
    els.balanceValue.textContent = formatMoney(state.balance);
    els.lastWinValue.textContent = formatMoney(response.totalWin);
    updateWinDisplay(response.totalWin);
    updateHud();
    await maybeShowCelebration(response);
    setPhase("idle");
    setControlsBusy(false);
  }

  async function presentSpin(response) {
    setPhase("spinning");
    els.roundId.textContent = `Round: ${response.roundId || "-"}`;
    await stopReelsToGrid(response.base.initialGrid);
    state.currentGrid = cloneGrid(response.base.initialGrid);

    setPhase("revealBase");
    els.featureStatus.textContent = "Base game result";
    await sleep(220);

    let accumulatedWin = 0;
    accumulatedWin = await playCascades({
      cascades: response.base.cascades || [],
      startingWin: accumulatedWin,
      label: "Base cascade",
    });

    if (response.base.scatterPay > 0 || response.base.freeSpinsTriggered) {
      setPhase("scatterAward");
      highlightScatters();
      const scatterPay = Number(response.base.scatterPay || 0);
      els.featureStatus.textContent = `${response.base.scatterCount} scatters${scatterPay > 0 ? ` pay ${formatMoney(scatterPay)}` : ""}`;
      if (scatterPay > 0) {
        await countWinTo(accumulatedWin + scatterPay, 520);
        accumulatedWin += scatterPay;
      } else {
        await sleep(520);
      }
      clearHighlights();
    }

    if (response.freeSpins) {
      accumulatedWin = await playFreeSpins(response.freeSpins, accumulatedWin);
    }

    if (response.capped || response.absoluteCapped) {
      els.featureStatus.textContent = response.absoluteCapped ? "Absolute win cap applied" : "Max win cap applied";
      await sleep(500);
    }

    await countWinTo(response.totalWin, 420);
  }

  async function playCascades({ cascades, startingWin, label }) {
    let total = startingWin;
    if (!cascades.length) {
      els.featureStatus.textContent = `${label}: no win`;
      await sleep(300);
      return total;
    }

    for (const cascade of cascades) {
      setPhase("cascadeStep");
      const cascadeNo = Number(cascade.index) + 1;
      const winText = describeWins(cascade.wins || []);
      els.featureStatus.textContent = `${label} ${cascadeNo}: ${formatMoney(cascade.cascadeWin)}${winText ? ` - ${winText}` : ""}`;
      drawWinningWays(cascade);
      markRemoved(cascade.removed || []);
      await sleep(TIMING.cascadeWinHold);
      clearWaysLayer();
      markRemoving(cascade.removed || []);
      await sleep(TIMING.symbolRemove);
      applyGridInPlace(cascade.gridAfter, { refilling: true });
      state.currentGrid = cloneGrid(cascade.gridAfter);
      await countWinTo(total + Number(cascade.cascadeWin || 0), TIMING.cascadeCountUp);
      total += Number(cascade.cascadeWin || 0);
      await sleep(TIMING.cascadeSettle);
      clearHighlights();
    }

    return total;
  }

  async function playFreeSpins(freeSpins, startingWin) {
    setPhase("freeSpinIntro");
    els.featureStatus.textContent = "Free spins triggered";
    els.freeSpinStatus.textContent = `${freeSpins.totalSpins} spins, ${freeSpins.retriggerCount} retriggers`;
    await showFeaturePause("Free Spins", `${freeSpins.totalSpins} spins awarded`);

    let total = startingWin;
    for (const spin of freeSpins.spins || []) {
      setPhase("freeSpinStep");
      els.freeSpinStatus.textContent = `FS ${spin.index}/${freeSpins.totalSpins} - multiplier x${spin.multiplierStep}`;
      els.featureStatus.textContent = spin.retrigger ? "Free spin retrigger lands" : "Free spin result";
      await startShortSpin();
      await stopReelsToGrid(spin.initialGrid, { minimumDelay: 120 });
      state.currentGrid = cloneGrid(spin.initialGrid);
      total = await playCascades({
        cascades: spin.cascades || [],
        startingWin: total,
        label: `FS ${spin.index}`,
      });
      if (spin.retrigger) {
        els.featureStatus.textContent = "Retrigger +5 free spins";
        await sleep(700);
      }
    }

    setPhase("freeSpinOutro");
    els.featureStatus.textContent = `Free spins complete: ${formatMoney(freeSpins.totalWin)}`;
    await sleep(700);
    return total;
  }

  async function showFeaturePause(title, amount) {
    els.celebrationKicker.textContent = "Feature";
    els.celebrationTitle.textContent = title;
    els.celebrationAmount.textContent = amount;
    els.celebrationOverlay.classList.add("visible");
    await sleep(1250);
    hideCelebration();
  }

  async function maybeShowCelebration(response) {
    const totalWin = Number(response.totalWin || 0);
    const bet = Number(response.bet || state.bet || 1);
    const winX = bet > 0 ? totalWin / bet : 0;
    const tier = WIN_TIERS.find((entry) => winX >= entry.x);
    if (!tier && !response.capped && !response.absoluteCapped) return;

    els.celebrationKicker.textContent = response.absoluteCapped || response.capped ? "Max Win" : `${winX.toFixed(1)}x`;
    els.celebrationTitle.textContent = response.absoluteCapped || response.capped ? "Cap Applied" : tier.title;
    els.celebrationAmount.textContent = formatMoney(totalWin);
    els.celebrationOverlay.classList.add("visible");
  }

  function startSpinAnimation() {
    stopSpinAnimation();
    setPhase("spinning");
    state.spinIntervals = [];
    for (let reel = 0; reel < 5; reel++) {
      const interval = window.setInterval(() => {
        for (let row = 0; row < 3; row++) {
          const cell = getCell(reel, row);
          if (!cell) continue;
          updateCell(cell, randomCell(), ["spinning"]);
        }
      }, 90 + reel * 12);
      state.spinIntervals.push(interval);
    }
  }

  async function startShortSpin() {
    startSpinAnimation();
    await sleep(420);
  }

  function stopSpinAnimation() {
    for (const interval of state.spinIntervals) window.clearInterval(interval);
    state.spinIntervals = [];
    for (const cell of els.reels.querySelectorAll(".symbol-cell")) {
      cell.classList.remove("spinning");
    }
  }

  async function stopReelsToGrid(grid, options = {}) {
    stopSpinAnimation();
    const minimumDelay = options.minimumDelay ?? 150;
    for (let reel = 0; reel < grid.length; reel++) {
      for (let row = 0; row < grid[reel].length; row++) {
        const cell = getCell(reel, row);
        if (!cell) continue;
        updateCell(cell, grid[reel][row], ["landing"]);
      }
      await sleep(minimumDelay);
    }
    await sleep(130);
    for (const cell of els.reels.querySelectorAll(".symbol-cell")) {
      cell.classList.remove("landing");
    }
  }

  function applyGridInPlace(grid, options = {}) {
    if (els.reels.children.length === 0) {
      renderGrid(grid, options);
      return;
    }

    const cols = grid.length;
    const rows = grid[0]?.length || 0;
    for (let reel = 0; reel < cols; reel++) {
      for (let row = 0; row < rows; row++) {
        const cell = getCell(reel, row);
        if (!cell) continue;
        updateCell(cell, grid[reel][row], options.refilling ? ["refilling"] : []);
      }
    }
  }

  function renderGrid(grid, options = {}) {
    els.reels.innerHTML = "";
    clearWaysLayer();
    const cols = grid.length;
    const rows = grid[0]?.length || 0;
    els.reels.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
    els.reels.style.gridTemplateRows = `repeat(${rows}, var(--cell-size))`;
    for (let row = 0; row < rows; row++) {
      for (let reel = 0; reel < cols; reel++) {
        const cell = document.createElement("div");
        cell.className = "symbol-cell";
        cell.dataset.reel = String(reel);
        cell.dataset.row = String(row);
        updateCell(cell, grid[reel][row], options.refilling ? ["refilling"] : []);
        els.reels.appendChild(cell);
      }
    }
  }

  function updateCell(cell, symbolCell, extraClasses = []) {
    const symbol = symbolCell?.symbol || "A";
    const meta = SYMBOL_META[symbol] || SYMBOL_META.A;
    cell.className = `symbol-cell kind-${meta.kind}${extraClasses.length ? ` ${extraClasses.join(" ")}` : ""}`;
    cell.dataset.symbol = symbol;
    cell.innerHTML = [
      `<span class="symbol-mark">${escapeHtml(meta.short)}</span>`,
      `<span class="symbol-name">${escapeHtml(meta.label)}</span>`,
      symbolCell?.multiplier ? `<span class="symbol-multiplier">x${escapeHtml(String(symbolCell.multiplier))}</span>` : "",
    ].join("");
  }

  function markRemoved(positions) {
    clearHighlights();
    for (const position of positions) {
      const cell = getCell(position.reel, position.row);
      if (cell) cell.classList.add("winning");
    }
  }

  function markRemoving(positions) {
    for (const position of positions) {
      const cell = getCell(position.reel, position.row);
      if (cell) {
        cell.classList.remove("winning");
        cell.classList.add("removing");
      }
    }
  }

  function highlightScatters() {
    clearHighlights();
    for (const cell of els.reels.querySelectorAll('.symbol-cell[data-symbol="SCATTER"]')) {
      cell.classList.add("winning");
    }
  }

  function clearHighlights() {
    for (const cell of els.reels.querySelectorAll(".symbol-cell")) {
      cell.classList.remove("winning", "removing", "refilling", "landing");
    }
  }

  function drawWinningWays(cascade) {
    clearWaysLayer();
    const grid = state.currentGrid;
    const wins = (cascade.wins || []).slice(0, 3);
    if (!grid?.length || !wins.length) return;

    resizeWaysLayer();
    wins.forEach((win, index) => {
      const pathCells = representativeWayCells(grid, win);
      if (pathCells.length < 3) return;
      drawWayPath(pathCells, index);
    });
  }

  function representativeWayCells(grid, win) {
    const cells = [];
    const matchCount = Number(win.matchCount || 0);
    for (let reel = 0; reel < matchCount; reel++) {
      const rows = [];
      for (let row = 0; row < grid[reel].length; row++) {
        if (cellParticipatesInWin(grid[reel][row], win.symbol)) rows.push(row);
      }
      if (!rows.length) break;
      const preferredRow = rows.includes(1) ? 1 : rows[0];
      const cell = getCell(reel, preferredRow);
      if (cell) cells.push(cell);
    }
    return cells;
  }

  function cellParticipatesInWin(cell, symbol) {
    if (!cell) return false;
    return cell.symbol === symbol || cell.symbol === "WILD";
  }

  function resizeWaysLayer() {
    const reelBox = els.reels.getBoundingClientRect();
    els.waysLayer.setAttribute("viewBox", `0 0 ${reelBox.width} ${reelBox.height}`);
  }

  function drawWayPath(cells, index) {
    const reelBox = els.reels.getBoundingClientRect();
    const points = cells.map((cell) => {
      const box = cell.getBoundingClientRect();
      return {
        x: box.left - reelBox.left + box.width / 2,
        y: box.top - reelBox.top + box.height / 2,
      };
    });

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", `ways-line line-${index + 1}`);
    path.setAttribute("d", smoothPath(points));
    els.waysLayer.appendChild(path);

    for (const point of points) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("class", "ways-point");
      dot.setAttribute("cx", String(point.x));
      dot.setAttribute("cy", String(point.y));
      dot.setAttribute("r", "7");
      els.waysLayer.appendChild(dot);
    }
  }

  function smoothPath(points) {
    if (!points.length) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const current = points[i];
      const midX = (prev.x + current.x) / 2;
      d += ` C ${midX} ${prev.y}, ${midX} ${current.y}, ${current.x} ${current.y}`;
    }
    return d;
  }

  function clearWaysLayer() {
    if (els.waysLayer) els.waysLayer.innerHTML = "";
  }

  async function countWinTo(target, duration) {
    const from = state.displayedWin;
    const to = Number(target || 0);
    if (duration <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      updateWinDisplay(to);
      return;
    }

    const startedAt = performance.now();
    return new Promise((resolve) => {
      function tick(now) {
        const t = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        updateWinDisplay(from + (to - from) * eased);
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          updateWinDisplay(to);
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
  }

  function updateWinDisplay(value) {
    state.displayedWin = Number(value || 0);
    els.displayedWin.textContent = formatMoney(state.displayedWin);
  }

  async function api(path, options = {}) {
    const headers = { "content-type": "application/json", ...(options.headers || {}) };
    if (state.token) headers.authorization = `Bearer ${state.token}`;
    const response = await fetch(path, { ...options, headers });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text || "Invalid server response" };
    }
    if (!response.ok) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }
    return data;
  }

  function populateMarkets(config) {
    const markets = config.markets?.available || ["MGA"];
    els.marketSelect.innerHTML = "";
    for (const market of markets) {
      const option = document.createElement("option");
      option.value = market;
      option.textContent = market;
      els.marketSelect.appendChild(option);
    }
    els.marketSelect.value = state.market;
  }

  function populateBets(config) {
    const min = Number(config.bet?.min || 0.1);
    const max = Number(config.bet?.max || 100);
    const preferred = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].filter((bet) => bet >= min && bet <= max);
    if (!preferred.includes(state.bet)) preferred.push(state.bet);
    preferred.sort((a, b) => a - b);
    els.betSelect.innerHTML = "";
    for (const bet of preferred) {
      const option = document.createElement("option");
      option.value = String(bet);
      option.textContent = formatMoney(bet);
      els.betSelect.appendChild(option);
    }
    els.betSelect.value = String(state.bet);
  }

  function updateConfigText(config) {
    const profile = config.mathProfile || {};
    els.profileBadge.textContent = `Profile: ${profile.profileId || "default"}@${profile.profileVersion || "-"}`;
    const topPays = (config.paytable || [])
      .filter((entry) => entry.kind === "premium")
      .slice(-2)
      .map((entry) => `${entry.id} ${Number(entry.pays?.[5] || 0).toFixed(0)}x`)
      .join(", ");
    els.paytableText.textContent = topPays ? `Top 5-symbol pays: ${topPays}. Ways: ${config.grid?.totalWays || 243}.` : "Paytable available from server config.";
  }

  function updateHud() {
    els.marketBadge.textContent = `Market: ${state.market || "-"}`;
    els.balanceValue.textContent = state.token ? formatMoney(state.balance) : "-";
  }

  function updateSessionText() {
    if (!state.token) {
      els.sessionText.textContent = "Load config and login to start.";
      return;
    }
    els.sessionText.textContent = `${state.username} playing ${state.market}. Bet ${formatMoney(state.bet)}. Press Space or Spin.`;
  }

  function setPhase(phase) {
    state.phase = phase;
    els.phaseBadge.textContent = phase;
  }

  function setControlsBusy(busy) {
    const canSpin = !busy && state.token && state.phase === "idle";
    els.spinButton.disabled = !canSpin;
    els.loginButton.disabled = busy;
    els.overlayLoginButton.disabled = busy;
    els.betSelect.disabled = busy || state.phase !== "idle";
    els.marketSelect.disabled = busy || !!state.token;
    els.usernameInput.disabled = busy || !!state.token;
  }

  function showError(error) {
    stopSpinAnimation();
    if (state.token) setPhase("idle");
    setControlsBusy(false);
    const message = error instanceof Error ? error.message : String(error);
    els.featureStatus.textContent = message;
    showToast(message);
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("visible");
    state.toastTimer = window.setTimeout(() => {
      els.toast.classList.remove("visible");
    }, 3200);
  }

  function hideCelebration() {
    els.celebrationOverlay.classList.remove("visible");
  }

  function toggleMute() {
    state.muted = !state.muted;
    els.muteButton.textContent = state.muted ? "Sound Off" : "Sound On";
    showToast(state.muted ? "Sound muted." : "Sound enabled. Audio assets are placeholders.");
  }

  function getCell(reel, row) {
    return els.reels.querySelector(`.symbol-cell[data-reel="${reel}"][data-row="${row}"]`);
  }

  function randomCell() {
    const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    if (symbol !== "WILD") return { symbol };
    const multipliers = [2, 3, 5];
    return { symbol, multiplier: multipliers[Math.floor(Math.random() * multipliers.length)] };
  }

  function describeWins(wins) {
    return wins
      .slice(0, 2)
      .map((win) => `${win.symbol} ${win.matchCount}x/${win.waysCount} ways`)
      .join(", ");
  }

  function cloneGrid(grid) {
    return grid.map((reel) => reel.map((cell) => ({ ...cell })));
  }

  function formatMoney(value) {
    return Number(value || 0).toFixed(2);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
