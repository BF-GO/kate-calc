(() => {
	'use strict';

	const LOG = (...a) => console.debug('KATE:', ...a);

	const SINGLETON_ID = '__KATE_PANEL_HOST__';
	if (window[SINGLETON_ID]) {
		LOG('panel already injected');
		return;
	}
	window[SINGLETON_ID] = true;

	const STORAGE_KEYS = Object.freeze({
		pos: 'katePanelPos',
		state: 'katePanelState',
		history: 'kateHistory',
	});
	const MAX_HISTORY = 20;
	const EPS_MONEY = 0.005;

	function parseNumLoose(v) {
		if (v == null) return NaN;
		let s = String(v).trim();
		if (!s) return NaN;
		s = s.replace(/\u00A0/g, ' ').replace(/[\s\u202F]/g, '');
		const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
		if (lastSep > -1) {
			const intPart = s.slice(0, lastSep).replace(/[.,]/g, '');
			const fracPart = s.slice(lastSep + 1);
			s = `${intPart}.${fracPart}`;
		} else {
			s = s.replace(/[^\d\-]/g, '');
		}
		if (s === '' || s === '-' || s === '+') return NaN;
		const n = Number(s);
		return Number.isFinite(n) ? n : NaN;
	}
	const roundTo = (n, d = 2) =>
		Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : NaN;
	const fmt2 = (n) => (Number.isFinite(n) ? roundTo(n, 2).toString() : '');
	const fmt1 = (n) => (Number.isFinite(n) ? roundTo(n, 1).toString() : '');
	const nearEq = (a, b, eps) =>
		Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;

	let memStore = {
		[STORAGE_KEYS.pos]: undefined,
		[STORAGE_KEYS.state]: undefined,
		[STORAGE_KEYS.history]: [],
	};
	const hasChromeStorage =
		typeof chrome !== 'undefined' && chrome?.storage?.local;

	async function lsGet(key) {
		if (hasChromeStorage) {
			try {
				const obj = await chrome.storage.local.get(key);
				const val = obj?.[key] ?? memStore[key];
				LOG('lsGet', key, val);
				return val;
			} catch (e) {
				LOG('lsGet failed, fallback', key, e);
				return memStore[key];
			}
		}
		LOG('lsGet (mem)', key, memStore[key]);
		return memStore[key];
	}
	async function lsSet(obj) {
		Object.assign(memStore, obj);
		LOG('lsSet mem', obj);
		if (hasChromeStorage) {
			try {
				await chrome.storage.local.set(obj);
				LOG('lsSet chrome ok');
			} catch (e) {
				LOG('lsSet chrome failed', e);
			}
		}
	}

	let hostEl = null;

	if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
		chrome.runtime.onMessage.addListener((msg) => {
			if (msg?.type === 'TOGGLE_KATE_PANEL') togglePanel();
		});
	}

	async function togglePanel() {
		if (hostEl && document.body.contains(hostEl)) {
			LOG('remove panel');
			hostEl.remove();
			hostEl = null;
			return;
		}
		const savedPos = await lsGet(STORAGE_KEYS.pos);
		const savedState = await lsGet(STORAGE_KEYS.state);
		createPanel(savedPos, savedState);
	}

	function createPanel(savedPos, savedState) {
		hostEl = document.createElement('div');
		Object.assign(hostEl.style, {
			position: 'fixed',
			zIndex: '2147483647',
			pointerEvents: 'none',
			inset: '0 0 auto auto',
		});
		const root = hostEl.attachShadow({ mode: 'open' });

		root.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Inter, Arial; }
        .wrap {
          position: fixed; top: ${savedPos?.top ?? 24}px; left: ${
			savedPos?.left ?? 24
		}px; width: 360px;
          background: rgba(28,28,32,0.9); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12);
          border-radius: 12px; backdrop-filter: blur(6px); box-shadow: 0 10px 30px rgba(0,0,0,.35);
          /* Критично: сама панель кликабельна */
          pointer-events: auto;
        }
        .bar {
          cursor: move; user-select: none; padding: 10px 12px; display:flex; align-items:center; justify-content:space-between;
          border-bottom: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03);
          border-top-left-radius: 12px; border-top-right-radius: 12px;
        }
        .title { font-size: 14px; font-weight: 600; letter-spacing: .2px; }
        .btn {
          appearance:none; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06);
          color:#e5e7eb; border-radius:8px; padding:8px 10px; font-size:13px; line-height:1; cursor:pointer;
        }
        .btn:hover { background: rgba(255,255,255,.12); }
        .btn-ghost { border:none; background:transparent; }
        .close { font-size:18px; padding:2px 6px; line-height:1; border-radius:8px; }
        .close:hover { background: rgba(255,255,255,.1); }
        .icon { margin-right:6px; opacity:.9 }
        .body { padding: 12px; }
        .row { display:flex; gap:8px; margin-bottom:10px; }
        .col { flex:1; min-width: 0; }
        label { display:block; font-size:12px; opacity:.8; margin-bottom:6px; }
        .muted { font-size:12px; opacity:.7; }
        .tabs { display:flex; gap:8px; margin: 8px 0 10px; }
        .tab { position:relative; flex:1; text-align:center; padding:8px 10px; border-radius:8px; cursor:pointer;
               border:1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.04); }
        .tab.active { background: rgba(99,102,241,.16); border-color: rgba(99,102,241,.4); }
        .err { color:#fca5a5; font-size:12px; min-height:16px; }
        .foot { display:flex; gap:8px; margin-top:6px; justify-content: space-between; align-items:center; }
        a.link { color:#a5b4fc; text-decoration:none; font-size:12px; }

        /* inputs */
        .num-wrap { position: relative; }
        .num {
          width:100%; padding:10px 38px 10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,.16);
          background:rgba(255,255,255,.06); color:#e5e7eb; font-size:14px; -moz-appearance:textfield;
        }
        .num:focus { outline: 2px solid rgba(99,102,241,.5); outline-offset: 1px; }
        .num::-webkit-outer-spin-button, .num::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
        .spinbox {
          position:absolute; top:4px; right:4px; bottom:4px; width:28px; display:flex; flex-direction:column;
          border-left:1px solid rgba(255,255,255,.16); border-radius:0 8px 8px 0; overflow:hidden;
        }
        .spinbtn { flex:1; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.06); border:0; cursor:pointer; }
        .spinbtn:hover { background:rgba(255,255,255,.12); } .spinbtn:active { background:rgba(255,255,255,.18); }
        .spinbtn svg { width:12px; height:12px; opacity:.9; }

        /* tooltips */
        .tooltip { position: relative; }
        .tooltip::after {
          content: attr(data-tip);
          position: absolute; left: 50%; top: calc(100% + 8px); transform: translate(-50%, 6px);
          background: rgba(17,17,20,0.96); color:#e5e7eb; border:1px solid rgba(255,255,255,.12);
          padding:10px 12px; border-radius:10px; box-shadow: 0 10px 20px rgba(0,0,0,.35);
          opacity:0; pointer-events:none; transition: opacity .12s ease, transform .12s ease; white-space:pre-line; max-width: 300px; z-index: 10;
        }
        .tooltip::before {
          content:""; position:absolute; left:50%; top:100%; transform: translateX(-50%);
          border:6px solid transparent; border-top-color: rgba(17,17,20,0.96); opacity:0; transition: opacity .12s ease;
        }
        .tooltip:hover::after, .tooltip:focus-visible::after { opacity:1; transform: translate(-50%, 0); }
        .tooltip:hover::before, .tooltip:focus-visible::before { opacity:1; }

        .derived { font-size: 12px; opacity: .85; }

        /* history */
        .hist-panel { display:none; margin-top:8px; border-top:1px solid rgba(255,255,255,.12); padding-top:8px; max-height: 220px; overflow:auto; }
        .hist-row {
          display:grid; grid-template-columns: 1fr auto; gap:8px; padding:6px 8px; border-radius:8px;
          border:1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03); cursor:pointer;
        }
        .hist-row + .hist-row { margin-top:6px; }
        .hist-row:hover { background: rgba(255,255,255,.07); }
        .hist-meta { font-size: 11px; opacity: .7; }
        .hist-actions { display:flex; gap:6px; justify-content:flex-end; margin-top:8px; }
        .row-actions { display:flex; gap:8px; align-items:center; }
        .del { border:none; background:transparent; color:#fca5a5; cursor:pointer; padding:0 4px; }
        .del:hover { text-decoration: underline; }

        .no-drag { pointer-events: auto; }

        /* toast: теперь ВНУТРИ панели и не ловит клики */
        .toast {
          position: absolute; right: 12px; bottom: 12px;
          background: rgba(17,17,20,0.98); color:#e5e7eb;
          border:1px solid rgba(255,255,255,.12); padding:8px 12px; border-radius:10px; box-shadow: 0 10px 20px rgba(0,0,0,.35);
          opacity:0; transform: translateY(8px); transition: opacity .15s ease, transform .15s ease;
          pointer-events: none; z-index: 2;
        }
        .toast.show { opacity:1; transform: translateY(0); }
      </style>

      <div class="wrap" part="wrap" id="wrap">
        <div class="bar" id="drag">
          <div class="title">Kate & Lisäys</div>
          <div class="no-drag">
            <button class="btn" id="historyBtn" title="Historia" type="button"><span class="icon">🕘</span>Historia</button>
            <button class="btn-ghost close" id="close" title="Sulje" aria-label="Sulje" type="button">×</button>
          </div>
        </div>

        <div class="body">
          <div class="row">
            <div class="col">
              <label for="cost">Ostohinta (€)</label>
              <div class="num-wrap">
                <input type="number" id="cost" class="num" min="0" step="0.01" inputmode="decimal" placeholder="esim. 10,00" aria-label="Ostohinta">
                <div class="spinbox no-drag" data-for="cost">
                  <button class="spinbtn" data-dir="up" aria-label="Kasvata" type="button"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5"/></svg></button>
                  <button class="spinbtn" data-dir="down" aria-label="Vähennä" type="button"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5"/></svg></button>
                </div>
              </div>
            </div>
            <div class="col">
              <label for="price">Myyntihinta (muokattava)</label>
              <div class="num-wrap">
                <input type="number" id="price" class="num" min="0" step="0.01" inputmode="decimal" placeholder="laske tai syötä" aria-label="Myyntihinta">
                <div class="spinbox no-drag" data-for="price">
                  <button class="spinbtn" data-dir="up" aria-label="Kasvata" type="button"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5"/></svg></button>
                  <button class="spinbtn" data-dir="down" aria-label="Vähennä" type="button"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5"/></svg></button>
                </div>
              </div>
            </div>
          </div>

          <div class="tabs" role="tablist">
            <div class="tab tooltip" id="tabKate" role="tab" tabindex="0" aria-controls="paneKate"
                 data-mode="kate" data-tip="Lasketaan myyntihinta kateprosentin mukaan.\A Kate% on osuus myyntihinnasta.">Kate %</div>
            <div class="tab tooltip" id="tabMarkup" role="tab" tabindex="0" aria-controls="paneMarkup"
                 data-mode="markup" data-tip="Kustannuslisäys: lisätään M % ostohintaan (kustannukseen).">Lisäys %</div>
          </div>

          <div id="paneKate" role="tabpanel">
            <div class="row">
              <div class="col">
                <label for="kate">Kate %</label>
                <div class="num-wrap">
                  <input type="number" id="kate" class="num" min="0" max="99.9999" step="0.1" inputmode="decimal" placeholder="esim. 99" aria-label="Kate prosentti">
                  <div class="spinbox no-drag" data-for="kate">
                    <button class="spinbtn" data-dir="up" aria-label="Kasvata" type="button"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5"/></svg></button>
                    <button class="spinbtn" data-dir="down" aria-label="Vähennä" type="button"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5"/></svg></button>
                  </div>
                </div>
                <div class="err" id="errKate"></div>
              </div>
            </div>
          </div>

          <div id="paneMarkup" role="tabpanel" style="display:none;">
            <div class="row">
              <div class="col">
                <label for="markup">Lisäys %</label>
                <div class="num-wrap">
                  <input type="number" id="markup" class="num" min="-99.99" step="0.1" inputmode="decimal" placeholder="esim. 99" aria-label="Lisäys prosentti">
                  <div class="spinbox no-drag" data-for="markup">
                    <button class="spinbtn" data-dir="up" aria-label="Kasvata" type="button"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5"/></svg></button>
                    <button class="spinbtn" data-dir="down" aria-label="Vähennä" type="button"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5"/></svg></button>
                  </div>
                </div>
                <div class="err" id="errMarkup"></div>
              </div>
            </div>
          </div>

          <div class="foot">
            <div class="derived" id="derivedLine">Johdettu: —</div>
            <div>
              <button id="copy" class="btn no-drag" aria-label="Kopioi myyntihinta" type="button">Kopioi</button>
              <a class="link no-drag" id="resetPos" href="#" title="Palauta sijainti">Palauta sijainti</a>
            </div>
          </div>

          <div class="hist-panel" id="histPanel" aria-live="polite">
            <div id="histList"></div>
            <div class="hist-actions">
              <button class="btn" id="saveToHist" type="button">Tallenna</button>
              <button class="btn" id="clearHist" type="button">Tyhjennä</button>
            </div>
          </div>
        </div>

        <div class="toast" id="toast" role="status" aria-live="polite">Kopioitu</div>
      </div>
    `;

		document.body.appendChild(hostEl);

		const wrap = root.getElementById('wrap');
		const drag = root.getElementById('drag');
		const closeBtn = root.getElementById('close');
		const historyBtn = root.getElementById('historyBtn');
		const histPanel = root.getElementById('histPanel');
		const histList = root.getElementById('histList');
		const clearHistBtn = root.getElementById('clearHist');
		const saveToHistBtn = root.getElementById('saveToHist');
		const resetPos = root.getElementById('resetPos');
		const toast = root.getElementById('toast');

		const tabKate = root.getElementById('tabKate');
		const tabMarkup = root.getElementById('tabMarkup');
		const paneKate = root.getElementById('paneKate');
		const paneMarkup = root.getElementById('paneMarkup');

		const costEl = root.getElementById('cost');
		const priceEl = root.getElementById('price');
		const kateEl = root.getElementById('kate');
		const markupEl = root.getElementById('markup');

		const errKate = root.getElementById('errKate');
		const errMarkup = root.getElementById('errMarkup');
		const derivedLine = root.getElementById('derivedLine');
		const copyBtn = root.getElementById('copy');

		let dragging = false,
			sx = 0,
			sy = 0,
			startTop = 0,
			startLeft = 0;

		function clampToViewport(left, top) {
			const rect = wrap.getBoundingClientRect();
			const maxLeft = Math.max(0, window.innerWidth - rect.width - 4);
			const maxTop = Math.max(0, window.innerHeight - rect.height - 4);
			return {
				left: Math.min(Math.max(0, left), maxLeft),
				top: Math.min(Math.max(0, top), maxTop),
			};
		}

		drag.addEventListener('pointerdown', (e) => {
			if (e.button !== 0) return;
			if (e.target.closest('button, .no-drag, a')) return;
			dragging = true;
			sx = e.clientX;
			sy = e.clientY;
			const rect = wrap.getBoundingClientRect();
			startTop = rect.top;
			startLeft = rect.left;
			drag.setPointerCapture(e.pointerId);
		});
		drag.addEventListener('pointermove', (e) => {
			if (!dragging) return;
			const nx = startLeft + (e.clientX - sx);
			const ny = startTop + (e.clientY - sy);
			const { left, top } = clampToViewport(nx, ny);
			wrap.style.left = left + 'px';
			wrap.style.top = top + 'px';
		});
		drag.addEventListener('pointerup', async (e) => {
			if (!dragging) return;
			dragging = false;
			try {
				drag.releasePointerCapture(e.pointerId);
			} catch {}
			const rect = wrap.getBoundingClientRect();
			const { left, top } = clampToViewport(rect.left, rect.top);
			wrap.style.left = left + 'px';
			wrap.style.top = top + 'px';
			await lsSet({ [STORAGE_KEYS.pos]: { left, top } });
		});
		window.addEventListener('resize', () => {
			const rect = wrap.getBoundingClientRect();
			const { left, top } = clampToViewport(rect.left, rect.top);
			wrap.style.left = left + 'px';
			wrap.style.top = top + 'px';
		});

		closeBtn.addEventListener('click', () => {
			hostEl.remove();
			hostEl = null;
		});
		resetPos.addEventListener('click', async (e) => {
			e.preventDefault();
			const left = 24,
				top = 24;
			LOG('resetPos click', { left, top });
			wrap.style.left = left + 'px';
			wrap.style.top = top + 'px';
			await lsSet({ [STORAGE_KEYS.pos]: { left, top } });
			showToast('Sijainti palautettu');
		});

		let mode = savedState?.mode || 'kate';
		let suspend = false;
		let lastEdited = null;

		costEl.value = savedState?.cost ?? '';
		priceEl.value = savedState?.price ?? '';
		kateEl.value = savedState?.kate ?? '99';
		markupEl.value = savedState?.markup ?? '99';

		function setMode(m) {
			mode = m;
			tabKate.classList.toggle('active', mode === 'kate');
			tabMarkup.classList.toggle('active', mode === 'markup');
			paneKate.style.display = mode === 'kate' ? '' : 'none';
			paneMarkup.style.display = mode === 'markup' ? '' : 'none';
			compute();
			persistState();
		}

		function tabKeyHandler(e, targetMode) {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				setMode(targetMode);
			}
			if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
				e.preventDefault();
				setMode(targetMode === 'kate' ? 'markup' : 'kate');
				(mode === 'kate' ? tabKate : tabMarkup).focus();
			}
		}
		tabKate.addEventListener('click', () => setMode('kate'));
		tabMarkup.addEventListener('click', () => setMode('markup'));
		tabKate.addEventListener('keydown', (e) => tabKeyHandler(e, 'kate'));
		tabMarkup.addEventListener('keydown', (e) => tabKeyHandler(e, 'markup'));

		function persistState() {
			lsSet({
				[STORAGE_KEYS.state]: {
					mode,
					cost: costEl.value,
					price: priceEl.value,
					kate: kateEl.value,
					markup: markupEl.value,
				},
			});
		}

		function compute() {
			errKate.textContent = '';
			errMarkup.textContent = '';

			const cost = parseNumLoose(costEl.value);
			let price = parseNumLoose(priceEl.value);
			let kate = parseNumLoose(kateEl.value);
			let markup = parseNumLoose(markupEl.value);

			if (lastEdited === 'price') {
				if (Number.isFinite(price) && price > 0 && Number.isFinite(cost)) {
					if (mode === 'kate') {
						const k = (100 * (price - cost)) / price;
						setVal(kateEl, fmt1(k));
					} else {
						const m =
							Number.isFinite(cost) && cost !== 0
								? 100 * (price / cost - 1)
								: NaN;
						setVal(markupEl, fmt1(m));
					}
				}
			} else {
				if (Number.isFinite(cost)) {
					if (mode === 'kate' && Number.isFinite(kate)) {
						if (kate >= 100) {
							errKate.textContent = 'Kate% tulee olla < 100.';
							setVal(priceEl, '');
						} else {
							price = cost / (1 - kate / 100);
							setVal(priceEl, fmt2(price));
						}
					}
					if (mode === 'markup' && Number.isFinite(markup)) {
						price = cost * (1 + markup / 100);
						setVal(priceEl, fmt2(price));
					}
				}
			}

			const c = parseNumLoose(costEl.value);
			const p = parseNumLoose(priceEl.value);
			if (Number.isFinite(c) && Number.isFinite(p) && p > 0) {
				const dKate = (100 * (p - c)) / p;
				const dMarkup = c !== 0 ? 100 * (p / c - 1) : NaN;
				derivedLine.textContent = `Johdettu: Kate ${fmt1(
					dKate
				)} % • Lisäys ${fmt1(dMarkup)} %`;
			} else {
				derivedLine.textContent = 'Johdettu: —';
			}
		}

		function setVal(el, val) {
			suspend = true;
			el.value = val;
			suspend = false;
		}

		[costEl, priceEl, kateEl, markupEl].forEach((el) => {
			el.addEventListener('input', () => {
				if (suspend) return;
				if (el === priceEl) lastEdited = 'price';
				else if (el === costEl) lastEdited = 'cost';
				else lastEdited = 'percent';
				compute();
				persistState();
			});
			el.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') pushCurrentToHistory(true);
			});
		});

		for (const box of root.querySelectorAll('.spinbox')) {
			const forId = box.getAttribute('data-for');
			const input = root.getElementById(forId);
			let tId = null,
				repeatId = null;

			const step = (dir, big = false) => {
				if (input.disabled) return;
				if (dir === 'up') big ? input.stepUp(10) : input.stepUp();
				else big ? input.stepDown(10) : input.stepDown();
				input.dispatchEvent(new Event('input', { bubbles: true }));
			};

			const startRepeat = (dir, big) => {
				step(dir, big);
				tId = setTimeout(() => {
					repeatId = setInterval(() => step(dir, big), 50);
				}, 350);
			};
			const stopRepeat = () => {
				if (tId) clearTimeout(tId), (tId = null);
				if (repeatId) clearInterval(repeatId), (repeatId = null);
			};

			box.addEventListener('pointerdown', (e) => {
				const btn = e.target.closest('.spinbtn');
				if (!btn) return;
				const dir = btn.getAttribute('data-dir');
				const big = e.shiftKey || e.ctrlKey || e.metaKey;
				btn.setPointerCapture(e.pointerId);
				lastEdited =
					input === priceEl ? 'price' : input === costEl ? 'cost' : 'percent';
				startRepeat(dir, big);
			});
			box.addEventListener('pointerup', stopRepeat);
			box.addEventListener('pointerleave', stopRepeat);
		}

		copyBtn.addEventListener('click', async () => {
			const txt = priceEl.value?.trim();
			if (!txt) return;
			try {
				await navigator.clipboard.writeText(txt);
				showToast('Kopioitu');
			} catch {}
			pushCurrentToHistory(false);
		});

		function showToast(msg = 'OK') {
			toast.textContent = msg;
			toast.classList.add('show');
			setTimeout(() => toast.classList.remove('show'), 1200);
		}

		historyBtn.addEventListener('click', async () => {
			LOG('history open');
			await renderHistory();
			histPanel.style.display =
				histPanel.style.display === 'none' || !histPanel.style.display
					? 'block'
					: 'none';
		});
		clearHistBtn.addEventListener('click', async (e) => {
			e.preventDefault();
			LOG('clear history click');
			await lsSet({ [STORAGE_KEYS.history]: [] });
			await renderHistory();
			showToast('Historia tyhjennetty');
		});
		saveToHistBtn.addEventListener('click', () => pushCurrentToHistory(true));

		async function getHistory() {
			const hist = await lsGet(STORAGE_KEYS.history);
			return Array.isArray(hist) ? hist : [];
		}

		function buildEntry() {
			const cost = parseNumLoose(costEl.value);
			const price = parseNumLoose(priceEl.value);
			if (!Number.isFinite(cost) || !Number.isFinite(price) || price <= 0)
				return null;
			const kate = (100 * (price - cost)) / price;
			const markup = cost !== 0 ? 100 * (price / cost - 1) : NaN;
			return {
				t: Date.now(),
				mode,
				cost: Number.isFinite(cost) ? roundTo(cost, 2) : null,
				price: Number.isFinite(price) ? roundTo(price, 2) : null,
				kate: Number.isFinite(kate) ? roundTo(kate, 1) : null,
				markup: Number.isFinite(markup) ? roundTo(markup, 1) : null,
			};
		}

		async function pushCurrentToHistory(showPanelAfter) {
			const entry = buildEntry();
			if (!entry) return;
			const hist = await getHistory();
			const last = hist[0];
			const same =
				last &&
				last.mode === entry.mode &&
				nearEq(last.cost, entry.cost, EPS_MONEY) &&
				nearEq(last.price, entry.price, EPS_MONEY);

			if (!same) {
				hist.unshift(entry);
				if (hist.length > MAX_HISTORY) hist.length = MAX_HISTORY;
				await lsSet({ [STORAGE_KEYS.history]: hist });
			}
			if (showPanelAfter) {
				await renderHistory();
				histPanel.style.display = 'block';
			}
		}

		async function renderHistory() {
			const hist = await getHistory();
			LOG('renderHistory', hist.length);
			histList.innerHTML = '';
			if (!hist.length) {
				histList.innerHTML = `<div class="muted">Ei merkintöjä.</div>`;
				return;
			}
			const frag = document.createDocumentFragment();
			hist.forEach((h, idx) => {
				const row = document.createElement('div');
				row.className = 'hist-row';

				const date = new Date(h.t);
				const when = date.toLocaleString(undefined, {
					hour: '2-digit',
					minute: '2-digit',
					day: '2-digit',
					month: '2-digit',
				});

				const left = document.createElement('div');
				left.innerHTML = `
          <div><strong>${
						h.mode === 'kate' ? 'Kate' : 'Lisäys'
					}</strong> • C €${fmt2(h.cost)} → P €${fmt2(h.price)}</div>
          <div class="hist-meta">Kate ${fmt1(h.kate)} % • Lisäys ${fmt1(
					h.markup
				)} % • ${when}</div>
        `;

				const right = document.createElement('div');
				right.className = 'row-actions';
				right.innerHTML = `<span class="muted">#${
					idx + 1
				}</span> <button class="del" title="Poista" type="button">Poista</button>`;

				row.appendChild(left);
				row.appendChild(right);

				row.addEventListener('click', (e) => {
					if (e.target.closest('.del')) return;
					setMode(h.mode);
					setVal(costEl, fmt2(h.cost));
					setVal(priceEl, fmt2(h.price));
					setVal(kateEl, fmt1(h.kate));
					setVal(markupEl, fmt1(h.markup));
					lastEdited = 'price';
					compute();
					persistState();
				});

				right.querySelector('.del').addEventListener('click', async (e) => {
					e.stopPropagation();
					const list = await getHistory();
					list.splice(idx, 1);
					await lsSet({ [STORAGE_KEYS.history]: list });
					await renderHistory();
				});

				frag.appendChild(row);
			});
			histList.appendChild(frag);
		}

		root.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				hostEl.remove();
				hostEl = null;
			}
			if (e.altKey && (e.key === 'r' || e.key === 'R')) {
				const left = 24,
					top = 24;
				wrap.style.left = left + 'px';
				wrap.style.top = top + 'px';
				lsSet({ [STORAGE_KEYS.pos]: { left, top } });
			}
		});

		setMode(mode);
		compute();
	}

	window.toggleKatePanel = togglePanel;
	LOG('content ready');
})();
