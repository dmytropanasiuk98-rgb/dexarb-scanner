const $ = (id) => document.getElementById(id);

let state = {
    longEx: "Ondo",
    shortEx: "RH_Lighter",
    symbol: "BTC",
    minSpread: 0.01,
    isRunning: true, // Start running immediately
    // Звукові налаштування: null означає "вимкнено"
    entryAlert: null,
    exitAlert: null,
    lastAlertTime: 0
};

let chart, inSeries, outSeries;
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playAlertSound() {
    // Не грати звук частіше ніж раз на 5 секунд
    if (Date.now() - state.lastAlertTime < 5000) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
    state.lastAlertTime = Date.now();
}

function initChart() {
    if (!$("chart")) return;
    chart = LightweightCharts.createChart($("chart"), {
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#848e9c' },
        grid: { vertLines: { color: '#2b2f36' }, horzLines: { color: '#2b2f36' } },
        timeScale: { timeVisible: true, secondsVisible: true },
    });
    inSeries = chart.addLineSeries({ color: '#2ebd85', lineWidth: 2 });
    outSeries = chart.addLineSeries({ color: '#f6465d', lineWidth: 2 });
}

let allSymbols = [];
let selectedIndex = -1;

async function loadSymbols() {
    try {
        const r = await fetch('/api/symbols');
        const d = await r.json();
        allSymbols = d.symbols || [];
        // Optional: set default symbol if not set
        if (!state.symbol && allSymbols.length > 0) {
            state.symbol = allSymbols[0];
        }
    } catch (e) {
        console.error("Failed to load symbols", e);
        allSymbols = ["BTC", "ETH", "SOL"]; // Fallback
    }
}

function filterSymbols(query) {
    if (!query) return allSymbols;
    const q = query.toUpperCase();
    return allSymbols.filter(s => s.toUpperCase().startsWith(q));
}

function showDropdown(symbols) {
    const dropdown = $("symbolDropdown");
    if (!dropdown) return;

    dropdown.innerHTML = "";
    selectedIndex = -1;

    if (!symbols || symbols.length === 0) {
        dropdown.classList.remove("show");
        return;
    }

    symbols.forEach((sym, idx) => {
        const opt = document.createElement("div");
        opt.className = "symbol-option";
        opt.innerHTML = `<span class="symbol-name">${sym}</span>`;
        // Use window.selectSymbol to ensure global access
        opt.onclick = () => window.selectSymbol(sym);
        opt.dataset.index = idx;
        dropdown.appendChild(opt);
    });

    dropdown.classList.add("show");
}

// Global selectSymbol function
window.selectSymbol = (sym) => {
    state.symbol = sym;
    const searchInput = $("symbolSearch");
    if (searchInput) searchInput.value = sym;

    const dropdown = $("symbolDropdown");
    if (dropdown) dropdown.classList.remove("show");

    updateDashboard();
};

function updateSelection(direction) {
    const dropdown = $("symbolDropdown");
    if (!dropdown) return;

    const options = dropdown.querySelectorAll(".symbol-option");
    if (options.length === 0) return;

    options.forEach(o => o.classList.remove("selected"));

    if (direction === "down") {
        selectedIndex = (selectedIndex + 1) % options.length;
    } else if (direction === "up") {
        selectedIndex = selectedIndex <= 0 ? options.length - 1 : selectedIndex - 1;
    }

    if (options[selectedIndex]) {
        options[selectedIndex].classList.add("selected");
        options[selectedIndex].scrollIntoView({ block: "nearest" });
    }
}

const searchInput = $("symbolSearch");
if (searchInput) {
    searchInput.oninput = (e) => {
        const query = e.target.value;
        const filtered = filterSymbols(query);
        showDropdown(filtered);
    };

    searchInput.onfocus = (e) => {
        const query = e.target.value;
        const filtered = filterSymbols(query);
        showDropdown(filtered);
    };

    searchInput.onkeydown = (e) => {
        const dropdown = $("symbolDropdown");
        if (!dropdown || !dropdown.classList.contains("show")) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            updateSelection("down");
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            updateSelection("up");
        } else if (e.key === "Enter") {
            e.preventDefault();
            const options = dropdown.querySelectorAll(".symbol-option");
            if (selectedIndex >= 0 && selectedIndex < options.length) {
                const sym = options[selectedIndex].querySelector(".symbol-name").textContent;
                window.selectSymbol(sym);
            } else if (options.length > 0) {
                const sym = options[0].querySelector(".symbol-name").textContent;
                window.selectSymbol(sym);
            } else {
                const typed = e.target.value.toUpperCase();
                if (typed) window.selectSymbol(typed);
            }
        } else if (e.key === "Escape") {
            dropdown.classList.remove("show");
        }
    };
}

document.addEventListener("click", (e) => {
    if (!e.target.closest(".symbol-search-wrapper")) {
        const dropdown = $("symbolDropdown");
        if (dropdown) dropdown.classList.remove("show");
    }
});

async function poll() {
    if (!state.isRunning) return;
    try {
        const r = await fetch(`/api/poll?symbol=${state.symbol}&long_ex=${state.longEx}&short_ex=${state.shortEx}`);
        const data = await r.json();
        if (data.ok) {
            if ($("inVal")) $("inVal").textContent = data.entry_pct.toFixed(4) + "%";
            if ($("outVal")) $("outVal").textContent = data.exit_pct.toFixed(4) + "%";
            if ($("lat")) $("lat").textContent = data.latency_ms;
            if ($("dot")) $("dot").className = "dot ok";

            if ($("longExName")) $("longExName").textContent = state.longEx;
            if ($("shortExName")) $("shortExName").textContent = state.shortEx;

            const lfr = (data.long_funding !== undefined && data.long_funding !== null) ? data.long_funding : 0.0;
            const sfr = (data.short_funding !== undefined && data.short_funding !== null) ? data.short_funding : 0.0;
            const nfr = (data.net_funding !== undefined) ? data.net_funding : (sfr - lfr);

            if ($("longFundingVal")) {
                $("longFundingVal").textContent = (lfr >= 0 ? "+" : "") + lfr.toFixed(4) + "%";
                $("longFundingVal").style.color = lfr >= 0 ? "var(--green)" : "var(--red)";
            }
            if ($("shortFundingVal")) {
                $("shortFundingVal").textContent = (sfr >= 0 ? "+" : "") + sfr.toFixed(4) + "%";
                $("shortFundingVal").style.color = sfr >= 0 ? "var(--green)" : "var(--red)";
            }
            if ($("netFundingVal")) {
                $("netFundingVal").textContent = (nfr >= 0 ? "+" : "") + nfr.toFixed(4) + "% APR";
                $("netFundingVal").style.color = nfr >= 0 ? "var(--green)" : "var(--red)";
            }

            const t = Math.floor(Date.now() / 1000);
            if (inSeries) inSeries.update({ time: t, value: data.entry_pct });
            if (outSeries) outSeries.update({ time: t, value: data.exit_pct });

            let shouldPlay = false;
            if (state.entryAlert !== null && data.entry_pct >= state.entryAlert) shouldPlay = true;
            if (state.exitAlert !== null && data.exit_pct >= state.exitAlert) shouldPlay = true;

            if (shouldPlay) playAlertSound();

            if ($("mainTitle")) $("mainTitle").innerHTML = `<b>${state.symbol}</b> | <span class="green">L: ${state.longEx}</span> | <span class="red">S: ${state.shortEx}</span>`;
        } else {
            if ($("dot")) $("dot").className = "dot err";
        }
    } catch (e) {
        if ($("dot")) $("dot").className = "dot err";
    }
}

let pinnedSymbols = JSON.parse(localStorage.getItem("pinnedSymbols") || "[]");
let lastScanItems = [];

function renderScanItems(rawItems) {
    const body = $("topSpreads") || $("scanBody");
    if (!body) return;

    let items = (rawItems || []).slice();
    items.sort((a, b) => {
        const aPinned = pinnedSymbols.includes(a.symbol);
        const bPinned = pinnedSymbols.includes(b.symbol);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return b.entry_pct - a.entry_pct;
    });

    body.innerHTML = "";
    items.forEach((it, idx) => {
        const tr = document.createElement("tr");
        const isPinned = pinnedSymbols.includes(it.symbol);
        const isLastPinned = isPinned && (idx === items.length - 1 || !pinnedSymbols.includes(items[idx + 1].symbol));
        
        if (isPinned) {
            tr.classList.add("pinned-row");
        }

        const lfr = it.long_funding || 0.0;
        const sfr = it.short_funding || 0.0;
        const nfr = (it.net_funding !== undefined) ? it.net_funding : (sfr - lfr);
        const sepClass = isLastPinned ? 'pin-separator-td' : '';

        tr.innerHTML = `
            <td class="${sepClass}">
                <button class="btn-pin ${isPinned ? 'pinned' : ''}" onclick="togglePin('${it.symbol}', event)" title="${isPinned ? 'Відкріпити монету' : 'Закріпити монету вгорі'}">📌</button>
                <span class="sym-link" onclick="selectSymbol('${it.symbol}')" title="Клікніть для аналізу монети ${it.symbol}">${it.symbol}</span>
            </td>
            <td class="${sepClass} ${it.entry_pct > 0 ? 'green' : 'red'}">${it.entry_pct.toFixed(3)}%</td>
            <td class="${sepClass}" style="font-size:11px; white-space:nowrap;">
                <span class="${lfr >= 0 ? 'green' : 'red'}">${lfr >= 0 ? '+' : ''}${lfr.toFixed(2)}%</span> / 
                <span class="${sfr >= 0 ? 'green' : 'red'}">${sfr >= 0 ? '+' : ''}${sfr.toFixed(2)}%</span>
            </td>
            <td class="${sepClass} ${nfr >= 0 ? 'green' : 'red'}" style="font-size:11px; font-weight:bold; white-space:nowrap;">${nfr >= 0 ? '+' : ''}${nfr.toFixed(2)}%</td>
        `;
        body.appendChild(tr);
    });
}

window.togglePin = (sym, event) => {
    if (event) event.stopPropagation();
    if (pinnedSymbols.includes(sym)) {
        pinnedSymbols = pinnedSymbols.filter(s => s !== sym);
    } else {
        pinnedSymbols.push(sym);
    }
    localStorage.setItem("pinnedSymbols", JSON.stringify(pinnedSymbols));
    renderScanItems(lastScanItems);
    scan();
};

async function scan() {
    try {
        const r = await fetch(`/api/scan_top?long_ex=${state.longEx}&short_ex=${state.shortEx}&min_spread=${state.minSpread}`);
        const data = await r.json();
        if (data.ok && data.items) {
            lastScanItems = data.items;
            renderScanItems(lastScanItems);
        }
    } catch (e) { }
}

async function loadChartHistory() {
    if (!inSeries || !outSeries) return;
    try {
        const r = await fetch(`/api/history?symbol=${encodeURIComponent(state.symbol)}&limit=500`);
        const d = await r.json();
        if (d.ok && d.items && d.items.length > 0) {
            const latest = d.items[0];
            const lfr = latest.long_funding || 0.0;
            const sfr = latest.short_funding || 0.0;
            const nfr = sfr - lfr;

            if ($("longFundingVal")) {
                $("longFundingVal").textContent = (lfr >= 0 ? "+" : "") + lfr.toFixed(4) + "%";
                $("longFundingVal").style.color = lfr >= 0 ? "var(--green)" : "var(--red)";
            }
            if ($("shortFundingVal")) {
                $("shortFundingVal").textContent = (sfr >= 0 ? "+" : "") + sfr.toFixed(4) + "%";
                $("shortFundingVal").style.color = sfr >= 0 ? "var(--green)" : "var(--red)";
            }
            if ($("netFundingVal")) {
                $("netFundingVal").textContent = (nfr >= 0 ? "+" : "") + nfr.toFixed(4) + "% APR";
                $("netFundingVal").style.color = nfr >= 0 ? "var(--green)" : "var(--red)";
            }

            const sorted = d.items.slice().reverse();
            const inData = [];
            const outData = [];
            let lastTime = 0;

            sorted.forEach(it => {
                const t = it.timestamp;
                if (t > lastTime) {
                    inData.push({ time: t, value: it.entry_pct });
                    outData.push({ time: t, value: it.exit_pct });
                    lastTime = t;
                }
            });

            inSeries.setData(inData);
            outSeries.setData(outData);
        } else {
            inSeries.setData([]);
            outSeries.setData([]);
        }
    } catch (e) {
        console.error("Failed to load chart history", e);
        inSeries.setData([]);
        outSeries.setData([]);
    }
}

function updateDashboard() {
    if ($("longEx")) state.longEx = $("longEx").value;
    if ($("shortEx")) state.shortEx = $("shortEx").value;

    if ($("mainTitle")) $("mainTitle").innerHTML = `<b>${state.symbol}</b> | <span class="green">L: ${state.longEx}</span> | <span class="red">S: ${state.shortEx}</span>`;
    if ($("longExName")) $("longExName").textContent = state.longEx;
    if ($("shortExName")) $("shortExName").textContent = state.shortEx;

    state.isRunning = true;

    if (audioCtx.state === 'suspended') audioCtx.resume();

    loadChartHistory();
    poll();
    scan();
}

const longExSelect = $("longEx");
if (longExSelect) longExSelect.onchange = updateDashboard;

const shortExSelect = $("shortEx");
if (shortExSelect) shortExSelect.onchange = updateDashboard;

const swapBtn = $("swapExchanges");
if (swapBtn) {
    swapBtn.onclick = () => {
        const longSel = $("longEx");
        const shortSel = $("shortEx");
        if (longSel && shortSel) {
            const tmp = longSel.value;
            longSel.value = shortSel.value;
            shortSel.value = tmp;
            updateDashboard();
        }
    };
}

// Settings Modal
if ($("openSettings")) $("openSettings").onclick = () => $("modal").style.display = "flex";
if ($("closeSettings")) $("closeSettings").onclick = () => $("modal").style.display = "none";
if ($("saveSettings")) $("saveSettings").onclick = () => {
    state.minSpread = parseFloat($("minSpreadInput").value);
    $("modal").style.display = "none";
    scan();
};

// History Modal Logic
async function loadHistory() {
    try {
        const symInput = $("historySymbolFilter");
        const sym = symInput ? symInput.value.trim() : "";
        const url = sym ? `/api/history?symbol=${encodeURIComponent(sym)}&limit=50` : `/api/history?limit=50`;
        
        const r = await fetch(url);
        const data = await r.json();
        const body = $("historyTableBody");
        if (!body) return;

        body.innerHTML = "";
        if (!data.ok || !data.items || data.items.length === 0) {
            body.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 10px; color: #888;">Немає збережених записів</td></tr>`;
            return;
        }

        data.items.forEach(it => {
            const tr = document.createElement("tr");
            tr.style.borderBottom = "1px solid #222";
            tr.innerHTML = `
                <td style="padding: 6px; color: #888;">${it.time_str}</td>
                <td style="padding: 6px;"><b>${it.symbol}</b></td>
                <td style="padding: 6px;">${it.long_ask.toFixed(2)}</td>
                <td style="padding: 6px;">${it.short_bid.toFixed(2)}</td>
                <td style="padding: 6px;" class="${it.entry_pct >= 0 ? 'green' : 'red'}">${it.entry_pct.toFixed(3)}%</td>
            `;
            body.appendChild(tr);
        });
    } catch (e) {
        console.error("Failed to load history", e);
    }
}

if ($("openHistory")) $("openHistory").onclick = () => {
    $("historyModal").style.display = "flex";
    loadHistory();
};
if ($("closeHistory")) $("closeHistory").onclick = () => $("historyModal").style.display = "none";
if ($("refreshHistory")) $("refreshHistory").onclick = () => loadHistory();
if ($("historySymbolFilter")) $("historySymbolFilter").oninput = () => loadHistory();

// Alerts Modal
if ($("openAlerts")) $("openAlerts").onclick = () => $("alertModal").style.display = "flex";
if ($("closeAlerts")) $("closeAlerts").onclick = () => $("alertModal").style.display = "none";
if ($("saveAlerts")) $("saveAlerts").onclick = () => {
    const entryVal = parseFloat($("entryAlertLevel").value);
    const exitVal = parseFloat($("exitAlertLevel").value);
    state.entryAlert = isNaN(entryVal) ? null : entryVal;
    state.exitAlert = isNaN(exitVal) ? null : exitVal;
    $("alertModal").style.display = "none";
    if (audioCtx.state === 'suspended') audioCtx.resume();
};

// Start application
async function start() {
    initChart();
    // Load symbols but continue anyway if it fails
    await loadSymbols();
    await loadChartHistory();

    setInterval(poll, 500);
    setInterval(scan, 10000);

    // Initial scan
    scan();
}

// Sidebar toggle
const sidebarToggleBtn = $("sidebarToggle");
if (sidebarToggleBtn) {
    sidebarToggleBtn.onclick = () => {
        const sidebar = document.querySelector(".sidebar");
        if (sidebar) {
            sidebar.classList.toggle("collapsed");
            const isCollapsed = sidebar.classList.contains("collapsed");
            sidebarToggleBtn.title = isCollapsed ? "Показати панель" : "Сховати панель";

            setTimeout(() => {
                if (chart && $("chart")) {
                    chart.resize($("chart").offsetWidth, 400);
                }
            }, 400);
        }
    };
}

start();