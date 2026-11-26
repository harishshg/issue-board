/* IssueBoard UI: board, list and issue pages. Hash routes:
 *   #/board   #/list   #/browse/OMS-101 */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = MD.escape;
  const app = $('#app');

  const STATUS_CLASS = { 'To Do': 'todo', 'In Progress': 'progress', 'In Review': 'progress', Done: 'done' };
  const FIELD_LABELS = {
    summary: 'Summary', description: 'Description', status: 'Status', assignee: 'Assignee', reporter: 'Reporter',
    priority: 'Priority', type: 'Type', labels: 'Labels', storyPoints: 'Story points', component: 'Component',
    sprint: 'Sprint', severity: 'Severity', environment: 'Environment', affectsVersion: 'Affects version',
    epic: 'Epic', dueDate: 'Due date', branch: 'Branch', pullRequest: 'Pull request', created: 'Created',
  };

  // ------------------------------------------------------------------ prefs
  const PREFS_KEY = 'issueboard.prefs.v1';
  function readPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function writePrefs(p) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* not fatal */ }
  }
  const prefs = readPrefs();
  let actor = Store.users.some((u) => u.name === prefs.actor) ? prefs.actor : (Store.users[0]?.name || 'Anonymous');

  const boardFilters = { q: '', people: new Set(), type: '' };
  let listSort = { field: 'key', dir: 1 };
  let activityTab = 'comments';

  // ------------------------------------------------------------------ helpers
  const COLORS = ['#0c66e4', '#6e5dc6', '#1f845a', '#c25100', '#ae2e24', '#206a83', '#943d73', '#5b7f24'];
  function colorFor(name) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
  }
  function initials(name) {
    const parts = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function avatar(name, size = 24) {
    const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
    if (!name) {
      return `<span class="avatar none" style="${style}" title="Unassigned" aria-label="Unassigned">
        <svg viewBox="0 0 24 24" width="${size * 0.6}" height="${size * 0.6}" aria-hidden="true"><path fill="currentColor" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z"/></svg></span>`;
    }
    return `<span class="avatar" style="${style};background:${colorFor(name)}" title="${esc(name)}" aria-label="${esc(name)}">${esc(initials(name))}</span>`;
  }
  function typeIcon(type, size = 16) {
    const s = `width="${size}" height="${size}" viewBox="0 0 16 16" class="type-icon" role="img" aria-label="${esc(type)}"`;
    if (type === 'Bug') return `<svg ${s}><title>Bug</title><rect width="16" height="16" rx="3" fill="#e2483d"/><circle cx="8" cy="8" r="3.2" fill="#fff"/></svg>`;
    if (type === 'Story') return `<svg ${s}><title>Story</title><rect width="16" height="16" rx="3" fill="#63ba3c"/><path d="M5 3.5h6v9l-3-2.2-3 2.2z" fill="#fff"/></svg>`;
    return `<svg ${s}><title>Task</title><rect width="16" height="16" rx="3" fill="#4bade8"/><path d="M4.5 8.2l2.3 2.3 4.7-5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function priorityIcon(p, size = 16) {
    const s = `width="${size}" height="${size}" viewBox="0 0 16 16" class="prio-icon" role="img" aria-label="${esc(p)} priority"`;
    const up = '<path d="M3.5 10.5L8 6l4.5 4.5" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    const up2 = '<path d="M3.5 8.5L8 4l4.5 4.5M3.5 12.5L8 8l4.5 4.5" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    const down = '<path d="M3.5 5.5L8 10l4.5-4.5" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    const down2 = '<path d="M3.5 3.5L8 8l4.5-4.5M3.5 7.5L8 12l4.5-4.5" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    const med = '<path d="M3 6h10M3 10h10" stroke-width="2" stroke-linecap="round"/>';
    const map = {
      Highest: [up2, '#c9372c'], High: [up, '#e2483d'], Medium: [med, '#e2b203'],
      Low: [down, '#2684ff'], Lowest: [down2, '#0065ff'],
    };
    const [path, color] = map[p] || map.Medium;
    return `<svg ${s} stroke="${color}"><title>${esc(p)}</title>${path}</svg>`;
  }
  const lozenge = (status) => `<span class="lozenge ${STATUS_CLASS[status] || 'todo'}">${esc(status)}</span>`;

  function relTime(iso) {
    const d = new Date(iso);
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
    const days = Math.round(h / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const fullTime = (iso) => new Date(iso).toLocaleString();
  const timeTag = (iso) => `<time datetime="${esc(iso)}" title="${esc(fullTime(iso))}">${esc(relTime(iso))}</time>`;

  // Branch convention (order-service CONTRIBUTING.md §2 and the CI check):
  //   bugfix/OMS-123-short-description  (Bug)      feature/OMS-123-short-description  (Story)
  //   chore/OMS-123-short-description   (Task: docs, CI, build, dependencies; use feature/ if it changes behaviour)
  // Ticket key as in Jira; description lower-case kebab-case, a few words long.
  const BRANCH_RE = /^(feature|bugfix|chore|hotfix)\/[A-Z]+-[0-9]+-[a-z0-9]+(-[a-z0-9]+)*$/;
  const FILLER = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'for', 'with', 'and', 'or', 'is', 'are',
    'be', 'by', 'at', 'as', 'it', 'its', 'when', 'that', 'this', 'from', 'can', 'always', 'same', 'every',
    'any', 'all']);  // negations (not, cant, dont...) are kept: dropping them flips the meaning
  function slugBranch(issue) {
    const prefix = { Bug: 'bugfix', Task: 'chore' }[issue.type] || 'feature';
    const words = issue.summary.toLowerCase()
      .replace(/\[[^\]]*\]/g, ' ')          // drop tags like [SECURITY]
      .replace(/['’]/g, '')                 // can't -> cant
      .split(/[^a-z0-9]+/)
      .filter((w) => w && !FILLER.has(w));
    const picked = [];
    for (const w of words) {
      if (picked.length === 5 || [...picked, w].join('-').length > 40) break;
      picked.push(w);
    }
    return `${prefix}/${issue.key}-${picked.join('-') || 'change'}`;
  }

  let toastTimer;
  function toast(html, isError = false) {
    const el = $('#toast');
    el.innerHTML = html;
    el.classList.toggle('error', isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 5000 : 3500);
  }

  /** Run a store mutation, show validation errors as a toast. Returns true on success. */
  function attempt(fn) {
    try {
      fn();
      refreshBanner();
      return true;
    } catch (e) {
      if (e instanceof Store.ValidationError) { toast(esc(e.message), true); return false; }
      console.error(e);
      toast('Something went wrong. See the browser console.', true);
      return false;
    }
  }

  function refreshBanner() {
    const banner = $('#banner');
    if (Store.persistent) { banner.hidden = true; return; }
    banner.hidden = false;
    banner.textContent = 'This browser is blocking local storage, so changes will be lost when you close the tab. Use ••• → Export to keep a copy.';
  }

  const userOptions = (selected, { allowNone = false, extra = null } = {}) => {
    const names = Store.users.map((u) => u.name);
    if (extra && !names.includes(extra)) names.push(extra);
    return (allowNone ? `<option value=""${!selected ? ' selected' : ''}>Unassigned</option>` : '')
      + names.map((n) => `<option value="${esc(n)}"${n === selected ? ' selected' : ''}>${esc(n)}</option>`).join('');
  };
  const options = (values, selected) => values
    .map((v) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');

  // ------------------------------------------------------------------ chrome
  function renderChrome() {
    $('#projectName').textContent = Store.project.name;
    $('#projectIcon').textContent = Store.project.key.slice(0, 4);
    const sel = $('#actorSelect');
    sel.innerHTML = userOptions(actor);
    refreshBanner();
  }

  $('#actorSelect').addEventListener('change', (e) => {
    actor = e.target.value;
    prefs.actor = actor;
    writePrefs(prefs);
    route();
  });
  $('#createBtn').addEventListener('click', openCreate);

  const menu = $('#menu');
  const menuBtn = $('#menuBtn');
  const closeMenu = () => { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) closeMenu(); });
  menu.addEventListener('click', (e) => {
    const action = e.target.closest('button')?.dataset.action;
    if (!action) return;
    closeMenu();
    if (action === 'people') openPeople();
    if (action === 'export') exportBoard();
    if (action === 'import') $('#importFile').click();
    if (action === 'reset') confirmReset();
  });
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    if (attempt(() => Store.importJson(text))) {
      if (!Store.users.some((u) => u.name === actor)) actor = Store.users[0]?.name || 'Anonymous';
      renderChrome();
      route();
      toast(`Imported ${Store.issues.length} issues.`);
    }
  });

  function exportBoard() {
    const blob = new Blob([Store.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `issueboard-${Store.project.key.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Board exported.');
  }

  function confirmReset() {
    modal(`
      <header>Reset the board?</header>
      <div class="body"><p>All statuses, assignees, comments and new issues in <strong>this browser</strong> will be replaced by the original tickets. Export first if you want a backup.</p></div>
      <footer><button class="btn subtle" data-close type="button">Cancel</button><button class="btn danger" id="doReset" type="button">Reset board</button></footer>`, 'narrow');
    $('#doReset').addEventListener('click', () => {
      Store.reset();
      closeModal();
      renderChrome();
      location.hash = '#/board';
      route();
      toast('Board reset to the original tickets.');
    });
  }

  // ------------------------------------------------------------------ modal
  let lastFocus = null;
  function modal(html, size = '') {
    lastFocus = document.activeElement;
    $('#modalRoot').innerHTML = `<div class="overlay" data-overlay><div class="modal ${size}" role="dialog" aria-modal="true">${html}</div></div>`;
    const root = $('#modalRoot');
    root.querySelector('[data-overlay]').addEventListener('mousedown', (e) => { if (e.target.dataset.overlay !== undefined) closeModal(); });
    $$('[data-close]', root).forEach((b) => b.addEventListener('click', closeModal));
    const first = root.querySelector('input, select, textarea, button:not([data-close])');
    if (first) first.focus();
  }
  function closeModal() {
    $('#modalRoot').innerHTML = '';
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  function openCreate() {
    modal(`
      <header>Create issue</header>
      <form id="createForm" class="body" novalidate>
        <div class="form-row">
          <label class="form-field"><span>Issue type</span><select name="type">${options(Store.TYPES, 'Task')}</select></label>
          <label class="form-field"><span>Status</span><select name="status">${options(Store.STATUSES, 'To Do')}</select></label>
        </div>
        <label class="form-field"><span>Summary <span class="req">*</span></span><input type="text" name="summary" maxlength="255" required></label>
        <label class="form-field"><span>Description (Markdown)</span><textarea name="description" rows="7" placeholder="Steps to reproduce, expected result, acceptance criteria…"></textarea></label>
        <div class="form-row">
          <label class="form-field"><span>Priority</span><select name="priority">${options(Store.PRIORITIES, 'Medium')}</select></label>
          <label class="form-field"><span>Assignee</span><select name="assignee">${userOptions(null, { allowNone: true })}</select></label>
        </div>
        <div class="form-row">
          <label class="form-field"><span>Story points</span><input type="number" name="storyPoints" min="0" max="100"></label>
          <label class="form-field"><span>Labels (comma separated)</span><input type="text" name="labels"></label>
        </div>
        <div class="error-text" id="createError" role="alert"></div>
      </form>
      <footer>
        <button class="btn subtle" type="button" data-close>Cancel</button>
        <button class="btn primary" type="submit" form="createForm">Create</button>
      </footer>`);
    $('[name=summary]').focus();
    $('#createForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        const issue = Store.create(data, actor);
        closeModal();
        route();
        toast(`Created <a href="#/browse/${esc(issue.key)}">${esc(issue.key)}</a>`);
      } catch (err) {
        if (!(err instanceof Store.ValidationError)) throw err;
        $('#createError').textContent = err.message;
      }
    });
  }

  function openPeople() {
    const render = () => `
      <header>People</header>
      <div class="body">
        <div class="people-list">${Store.users.map((u) => `<div class="person">${avatar(u.name, 28)} <span>${esc(u.name)}</span></div>`).join('')}</div>
        <form id="personForm" class="form-row" style="grid-template-columns:1fr auto;align-items:end">
          <label class="form-field"><span>Add a person</span><input type="text" name="name" maxlength="60" placeholder="e.g. Priya (QA)"></label>
          <button class="btn primary" type="submit">Add</button>
        </form>
        <div class="error-text" id="personError" role="alert"></div>
      </div>
      <footer><button class="btn subtle" type="button" data-close>Done</button></footer>`;
    const wire = () => {
      $('#personForm').addEventListener('submit', (e) => {
        e.preventDefault();
        try {
          Store.addUser(new FormData(e.target).get('name'));
          modal(render(), 'narrow');
          wire();
          $('#personForm [name=name]').focus();
          renderChrome();
          route();
        } catch (err) {
          if (!(err instanceof Store.ValidationError)) throw err;
          $('#personError').textContent = err.message;
        }
      });
    };
    modal(render(), 'narrow');
    wire();
  }

  // ------------------------------------------------------------------ board
  function filteredIssues() {
    const q = boardFilters.q.trim().toLowerCase();
    return Store.issues.filter((i) => {
      if (boardFilters.type && i.type !== boardFilters.type) return false;
      if (boardFilters.people.size) {
        const who = i.assignee || '__none__';
        if (!boardFilters.people.has(who)) return false;
      }
      if (q && !(`${i.key} ${i.summary} ${i.labels.join(' ')}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function toolbar() {
    const people = [...Store.users.map((u) => u.name), '__none__'];
    return `
      <div class="toolbar">
        <input type="search" id="search" placeholder="Search this board" value="${esc(boardFilters.q)}" aria-label="Search issues">
        <div class="avatar-filter" role="group" aria-label="Filter by assignee">
          ${people.map((p) => `<button type="button" class="${boardFilters.people.has(p) ? 'on' : ''}" data-person="${esc(p)}"
              aria-pressed="${boardFilters.people.has(p)}" title="${p === '__none__' ? 'Unassigned' : esc(p)}">${avatar(p === '__none__' ? null : p, 32)}</button>`).join('')}
        </div>
        <select id="typeFilter" aria-label="Filter by type"><option value="">All types</option>${options(Store.TYPES, boardFilters.type)}</select>
        <button type="button" class="btn subtle" id="clearFilters"${boardFilters.q || boardFilters.people.size || boardFilters.type ? '' : ' hidden'}>Clear filters</button>
      </div>`;
  }

  function wireToolbar(rerender) {
    $('#search').addEventListener('input', (e) => { boardFilters.q = e.target.value; rerender(); syncClear(); });
    $('#typeFilter').addEventListener('change', (e) => { boardFilters.type = e.target.value; rerender(); syncClear(); });
    $$('.avatar-filter button').forEach((b) => b.addEventListener('click', () => {
      const p = b.dataset.person;
      if (boardFilters.people.has(p)) boardFilters.people.delete(p); else boardFilters.people.add(p);
      b.classList.toggle('on');
      b.setAttribute('aria-pressed', String(boardFilters.people.has(p)));
      rerender();
      syncClear();
    }));
    $('#clearFilters').addEventListener('click', () => {
      boardFilters.q = ''; boardFilters.type = ''; boardFilters.people.clear();
      route();
    });
  }
  function syncClear() {
    $('#clearFilters').hidden = !(boardFilters.q || boardFilters.people.size || boardFilters.type);
  }

  function card(i) {
    const labels = i.labels.slice(0, 3).map((l) => `<span class="label">${esc(l)}</span>`).join('');
    return `
      <a class="card" href="#/browse/${esc(i.key)}" draggable="true" data-key="${esc(i.key)}">
        <div class="card-summary">${esc(i.summary)}</div>
        ${labels ? `<div class="card-labels">${labels}</div>` : ''}
        <div class="card-foot">
          ${typeIcon(i.type)}
          <span class="card-key${i.status === 'Done' ? ' done' : ''}">${esc(i.key)}</span>
          <span class="grow"></span>
          ${i.commentCount || i.comments.length ? `<span class="muted small" title="Comments">💬 ${i.comments.length}</span>` : ''}
          ${priorityIcon(i.priority)}
          ${i.storyPoints != null ? `<span class="points" title="Story points">${i.storyPoints}</span>` : ''}
          ${avatar(i.assignee, 24)}
        </div>
      </a>`;
  }

  function renderBoard() {
    app.innerHTML = `
      <div class="crumbs"><span>Projects</span><span>/</span><span>${esc(Store.project.name)}</span></div>
      <h1 class="page-title">${esc(Store.project.key)} board</h1>
      ${toolbar()}
      <div class="board" id="board"></div>`;
    const renderColumns = () => {
      const issues = filteredIssues();
      $('#board').innerHTML = Store.STATUSES.map((status) => {
        const col = issues.filter((i) => i.status === status).sort((a, b) => a.rank - b.rank);
        return `
          <section class="column" data-status="${esc(status)}" aria-label="${esc(status)}">
            <div class="column-head">${esc(status)} <span class="count">${col.length}</span>
              ${status === 'Done' && col.length ? '<span class="done-tick" aria-hidden="true">✓</span>' : ''}</div>
            <div class="cards">${col.map(card).join('') || '<div class="empty-col muted">No issues</div>'}</div>
          </section>`;
      }).join('');
      wireDnD();
    };
    renderColumns();
    wireToolbar(renderColumns);
  }

  function wireDnD() {
    let dragKey = null;
    const line = document.createElement('div');
    line.className = 'drop-line';

    $$('.card').forEach((c) => {
      c.addEventListener('dragstart', (e) => {
        dragKey = c.dataset.key;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragKey);
        requestAnimationFrame(() => c.classList.add('dragging'));
      });
      c.addEventListener('dragend', () => {
        c.classList.remove('dragging');
        line.remove();
        $$('.column').forEach((col) => col.classList.remove('drop-target'));
        dragKey = null;
      });
    });

    const cardAfter = (container, y) => {
      const cards = $$('.card:not(.dragging)', container);
      return cards.find((c) => {
        const r = c.getBoundingClientRect();
        return y < r.top + r.height / 2;
      }) || null;
    };

    $$('.column').forEach((col) => {
      const list = $('.cards', col);
      col.addEventListener('dragover', (e) => {
        if (!dragKey) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        $$('.column').forEach((c) => c.classList.toggle('drop-target', c === col));
        const after = cardAfter(list, e.clientY);
        const empty = $('.empty-col', list);
        if (empty) empty.remove();
        if (after) list.insertBefore(line, after); else list.appendChild(line);
      });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragKey) return;
        const status = col.dataset.status;
        const keysInOrder = $$('.card:not(.dragging), .drop-line', list).map((el) => el.dataset.key || '__line__');
        const pos = keysInOrder.indexOf('__line__');
        const neighbours = keysInOrder.filter((k) => k !== '__line__' && k !== dragKey).map((k) => Store.get(k));
        const prev = neighbours[pos - 1];
        const next = neighbours[pos];
        let rank;
        if (prev && next) rank = (prev.rank + next.rank) / 2;
        else if (prev) rank = prev.rank + 1000;
        else if (next) rank = next.rank - 1000;
        else rank = 0;
        const key = dragKey;
        const before = Store.get(key).status;
        if (attempt(() => Store.update(key, { status, rank }, actor))) {
          renderBoard();
          if (before !== status) toast(`${esc(key)} moved to <strong>${esc(status)}</strong>`);
        }
      });
    });
  }

  // ------------------------------------------------------------------ list
  function renderList() {
    const cols = [
      ['key', 'Key'], ['type', 'Type'], ['summary', 'Summary'], ['status', 'Status'], ['assignee', 'Assignee'],
      ['priority', 'Priority'], ['storyPoints', 'Points'], ['updated', 'Updated'],
    ];
    app.innerHTML = `
      <div class="crumbs"><span>Projects</span><span>/</span><span>${esc(Store.project.name)}</span></div>
      <h1 class="page-title">All issues</h1>
      ${toolbar()}
      <div class="table-wrap"><table class="issue-table">
        <thead><tr>${cols.map(([f, label]) => `<th data-sort="${f}" aria-sort="${listSort.field === f ? (listSort.dir > 0 ? 'ascending' : 'descending') : 'none'}">${label}${listSort.field === f ? `<span class="arrow">${listSort.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`).join('')}</tr></thead>
        <tbody id="rows"></tbody>
      </table></div>`;
    const order = {
      status: (i) => Store.STATUSES.indexOf(i.status),
      priority: (i) => Store.PRIORITIES.indexOf(i.priority),
      key: (i) => parseInt(i.key.split('-')[1], 10),
      storyPoints: (i) => i.storyPoints ?? -1,
      assignee: (i) => i.assignee || '~',
    };
    const renderRows = () => {
      const rows = filteredIssues().sort((a, b) => {
        const get = order[listSort.field] || ((i) => String(i[listSort.field] || '').toLowerCase());
        const x = get(a); const y = get(b);
        return (x < y ? -1 : x > y ? 1 : 0) * listSort.dir;
      });
      $('#rows').innerHTML = rows.map((i) => `
        <tr>
          <td><a href="#/browse/${esc(i.key)}">${esc(i.key)}</a></td>
          <td>${typeIcon(i.type)}</td>
          <td class="summary-cell"><a href="#/browse/${esc(i.key)}" style="color:inherit">${esc(i.summary)}</a></td>
          <td>${lozenge(i.status)}</td>
          <td><span class="cell-flex">${avatar(i.assignee, 22)} ${esc(i.assignee || 'Unassigned')}</span></td>
          <td><span class="cell-flex">${priorityIcon(i.priority)} ${esc(i.priority)}</span></td>
          <td>${i.storyPoints ?? ''}</td>
          <td class="muted">${timeTag(i.updated)}</td>
        </tr>`).join('') || '<tr><td colspan="8" class="muted">No issues match these filters.</td></tr>';
    };
    renderRows();
    wireToolbar(renderRows);
    $$('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
      const f = th.dataset.sort;
      listSort = { field: f, dir: listSort.field === f ? -listSort.dir : 1 };
      renderList();
    }));
  }

  // ------------------------------------------------------------------ issue page
  function renderIssue(key) {
    const issue = Store.get(key);
    if (!issue) {
      app.innerHTML = `<div class="not-found"><h1>Issue not found</h1><p class="muted">${esc(key)} doesn't exist or was deleted.</p><a class="btn primary" href="#/board">Back to board</a></div>`;
      return;
    }
    document.title = `[${issue.key}] ${issue.summary} - IssueBoard`;
    app.innerHTML = `
      <div class="crumbs">
        <span>Projects</span><span>/</span><a href="#/board">${esc(Store.project.name)}</a><span>/</span>
        <span class="with-icon">${typeIcon(issue.type)} <a href="#/browse/${esc(issue.key)}">${esc(issue.key)}</a></span>
      </div>
      <div id="summaryBox"></div>
      <div class="issue-grid">
        <section class="issue-main">
          <div class="section-title">Description</div>
          <div id="descBox"></div>
          <div class="section-title">Activity</div>
          <div class="tabs" role="tablist">
            <span class="muted small">Show:</span>
            <button type="button" class="tab${activityTab === 'comments' ? ' active' : ''}" data-tab="comments" role="tab" aria-selected="${activityTab === 'comments'}">Comments (${issue.comments.length})</button>
            <button type="button" class="tab${activityTab === 'history' ? ' active' : ''}" data-tab="history" role="tab" aria-selected="${activityTab === 'history'}">History (${issue.history.length})</button>
          </div>
          <div id="activityBox"></div>
        </section>
        <aside class="issue-side">
          <div class="side-actions">
            <select id="statusSelect" class="status-select ${STATUS_CLASS[issue.status]}" aria-label="Status">${options(Store.STATUSES, issue.status)}</select>
            <span class="spacer"></span>
            <button type="button" class="btn subtle small" id="copyLink" title="Copy link">Copy link</button>
            <button type="button" class="btn subtle small" id="deleteIssue" title="Delete issue">Delete</button>
          </div>
          <div class="panel"><h3>Details</h3><div id="detailsBox"></div></div>
          <div class="panel"><h3>Development</h3><div id="devBox"></div></div>
          <div class="dates">Created ${timeTag(issue.created)}<br>Updated ${timeTag(issue.updated)}</div>
        </aside>
      </div>`;

    const save = (changes, rerender = true) => {
      const ok = attempt(() => Store.update(issue.key, changes, actor));
      if (ok && rerender) renderIssue(issue.key);
      return ok;
    };

    renderSummary(issue, save);
    renderDescription(issue, save);
    renderActivity(issue);
    renderDetails(issue, save);
    renderDev(issue, save);

    $('#statusSelect').addEventListener('change', (e) => save({ status: e.target.value }));
    $$('.tab').forEach((t) => t.addEventListener('click', () => { activityTab = t.dataset.tab; renderIssue(issue.key); }));
    $('#copyLink').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        toast('Link copied.');
      } catch (e) {
        toast(esc(location.href));
      }
    });
    $('#deleteIssue').addEventListener('click', () => {
      modal(`
        <header>Delete ${esc(issue.key)}?</header>
        <div class="body"><p>The issue and its ${issue.comments.length} comment(s) will be removed from this browser's board. This can't be undone (unless you have an export).</p></div>
        <footer><button class="btn subtle" type="button" data-close>Cancel</button><button class="btn danger" id="doDelete" type="button">Delete</button></footer>`, 'narrow');
      $('#doDelete').addEventListener('click', () => {
        Store.remove(issue.key);
        closeModal();
        location.hash = '#/board';
        toast(`${esc(issue.key)} deleted.`);
      });
    });
  }

  function renderSummary(issue, save) {
    const box = $('#summaryBox');
    box.innerHTML = `<h1 class="issue-summary" tabindex="0" title="Click to edit">${esc(issue.summary)}</h1>`;
    const h = $('h1', box);
    const edit = () => {
      box.innerHTML = `<input type="text" class="summary-input" maxlength="255" value="${esc(issue.summary)}" aria-label="Summary">`;
      const input = $('input', box);
      input.focus();
      input.select();
      let done = false;
      const finish = (commit) => {
        if (done) return;
        done = true;
        if (commit && input.value.trim() !== issue.summary) { if (!save({ summary: input.value })) renderSummary(issue, save); }
        else renderSummary(issue, save);
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
    };
    h.addEventListener('click', edit);
    h.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); edit(); } });
  }

  function renderDescription(issue, save) {
    const box = $('#descBox');
    const view = () => {
      box.innerHTML = issue.description
        ? `<div class="desc md" tabindex="0" title="Click to edit">${MD.render(issue.description)}</div>`
        : '<div class="desc empty" tabindex="0">Add a description…</div>';
      const d = $('.desc', box);
      d.addEventListener('click', (e) => {
        if (e.target.closest('a, input')) return;
        if (window.getSelection().toString()) return; // let people select text without entering edit mode
        edit();
      });
      d.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === d) { e.preventDefault(); edit(); } });
      $$('.md-task', d).forEach((cb) => cb.addEventListener('change', () => {
        const next = MD.toggleTask(issue.description, Number(cb.dataset.task));
        if (save({ description: next }, false)) view();
      }));
    };
    const edit = () => {
      box.innerHTML = `
        <textarea rows="16" aria-label="Description">${esc(issue.description)}</textarea>
        <div class="editor-actions">
          <button type="button" class="btn primary" id="descSave">Save</button>
          <button type="button" class="btn subtle" id="descCancel">Cancel</button>
          <span class="hint muted small">Markdown supported · Ctrl/⌘ + Enter to save</span>
        </div>`;
      const ta = $('textarea', box);
      ta.focus();
      const commit = () => { if (save({ description: ta.value }, false)) view(); };
      $('#descSave').addEventListener('click', commit);
      $('#descCancel').addEventListener('click', view);
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
        if (e.key === 'Escape') view();
      });
    };
    view();
  }

  function renderActivity(issue) {
    const box = $('#activityBox');
    if (activityTab === 'history') {
      const items = [...issue.history].reverse();
      const fmt = (field, v) => {
        if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return '<span class="muted">None</span>';
        if (field === 'status') return lozenge(v);
        if (field === 'description') return '<span class="muted">(text)</span>';
        if (Array.isArray(v)) return v.map((l) => `<span class="label">${esc(l)}</span>`).join(' ');
        return esc(String(v).length > 80 ? String(v).slice(0, 80) + '…' : v);
      };
      box.innerHTML = items.map((h) => `
        <div class="history-item">
          ${avatar(h.author, 28)}
          <div>
            <div><strong>${esc(h.author)}</strong> ${h.field === 'created' ? 'created the issue' : `changed the <strong>${esc(FIELD_LABELS[h.field] || h.field)}</strong>`} · <span class="muted">${timeTag(h.at)}</span></div>
            ${h.field === 'created' ? '' : `<div class="change"><span class="old">${fmt(h.field, h.from)}</span> → <span>${fmt(h.field, h.to)}</span></div>`}
          </div>
        </div>`).join('') || '<p class="muted">No changes yet.</p>';
      return;
    }

    const comments = [...issue.comments].reverse();
    box.innerHTML = `
      <div class="composer">
        ${avatar(actor, 32)}
        <div class="grow">
          <textarea id="newComment" rows="2" placeholder="Add a comment… (Markdown supported)" aria-label="Add a comment"></textarea>
          <div class="editor-actions" id="commentActions" hidden>
            <button type="button" class="btn primary" id="postComment">Save</button>
            <button type="button" class="btn subtle" id="cancelComment">Cancel</button>
            <span class="hint muted small">Ctrl/⌘ + Enter to save</span>
          </div>
        </div>
      </div>
      ${comments.map((c) => `
        <div class="comment" data-id="${esc(c.id)}">
          ${avatar(c.author, 32)}
          <div class="comment-body">
            <div class="comment-meta"><strong>${esc(c.author)}</strong><span class="muted">${timeTag(c.at)}${c.edited ? ' · edited' : ''}</span></div>
            <div class="md comment-text">${MD.render(c.body)}</div>
            ${c.author === actor ? `<div class="comment-actions"><button type="button" class="link-btn" data-edit>Edit</button><button type="button" class="link-btn danger" data-delete>Delete</button></div>` : ''}
          </div>
        </div>`).join('')}`;

    const ta = $('#newComment');
    const actions = $('#commentActions');
    ta.addEventListener('focus', () => { actions.hidden = false; ta.rows = 4; });
    const post = () => {
      if (attempt(() => Store.addComment(issue.key, ta.value, actor))) renderIssue(issue.key);
    };
    $('#postComment').addEventListener('click', post);
    $('#cancelComment').addEventListener('click', () => { ta.value = ''; ta.rows = 2; actions.hidden = true; ta.blur(); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(); });

    $$('.comment').forEach((el) => {
      const id = el.dataset.id;
      const comment = issue.comments.find((c) => c.id === id);
      el.querySelector('[data-delete]')?.addEventListener('click', () => {
        modal(`
          <header>Delete this comment?</header>
          <div class="body"><p>Once you delete it, it's gone for good.</p></div>
          <footer><button class="btn subtle" type="button" data-close>Cancel</button><button class="btn danger" id="doDeleteComment" type="button">Delete</button></footer>`, 'narrow');
        $('#doDeleteComment').addEventListener('click', () => {
          Store.deleteComment(issue.key, id);
          closeModal();
          renderIssue(issue.key);
        });
      });
      el.querySelector('[data-edit]')?.addEventListener('click', () => {
        const text = el.querySelector('.comment-text');
        el.querySelector('.comment-actions').hidden = true;
        text.innerHTML = `<textarea rows="4" aria-label="Edit comment">${esc(comment.body)}</textarea>
          <div class="editor-actions"><button type="button" class="btn primary" data-save>Save</button><button type="button" class="btn subtle" data-cancel>Cancel</button></div>`;
        const eta = $('textarea', text);
        eta.focus();
        const commit = () => { if (attempt(() => Store.editComment(issue.key, id, eta.value))) renderIssue(issue.key); };
        $('[data-save]', text).addEventListener('click', commit);
        $('[data-cancel]', text).addEventListener('click', () => renderIssue(issue.key));
        eta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit(); });
      });
    });
  }

  /** A text field that shows its value and turns into an input on click. */
  function textField(issue, field, save, { type = 'text', placeholder = 'None', display } = {}) {
    const id = `f-${field}`;
    const value = field === 'labels' ? issue.labels.join(', ') : (issue[field] ?? '');
    const shown = value === '' ? '' : (display ? display(issue) : esc(value));
    return {
      html: `<span class="click-edit${value === '' ? ' placeholder' : ''}" id="${id}" tabindex="0" role="button" aria-label="Edit ${esc(FIELD_LABELS[field])}">${value === '' ? esc(placeholder) : shown}</span>`,
      wire() {
        const el = document.getElementById(id);
        const edit = (e) => {
          if (e && e.target.closest('a')) return;
          const input = document.createElement('input');
          input.type = type;
          input.value = value;
          if (type === 'number') { input.min = 0; input.max = 100; }
          input.setAttribute('aria-label', FIELD_LABELS[field]);
          el.replaceWith(input);
          input.focus();
          let done = false;
          const finish = (commit) => {
            if (done) return;
            done = true;
            if (commit && input.value !== String(value)) {
              if (!save({ [field]: input.value })) renderIssue(issue.key);
            } else {
              renderIssue(issue.key);
            }
          };
          input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') finish(true);
            if (ev.key === 'Escape') finish(false);
          });
          input.addEventListener('blur', () => finish(true));
        };
        el.addEventListener('click', edit);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); edit(); } });
      },
    };
  }

  function renderDetails(issue, save) {
    const row = (label, html) => `<div class="field-row"><div class="field-label">${label}</div><div class="field-value">${html}</div></div>`;
    const texts = {
      labels: textField(issue, 'labels', save, {
        display: (i) => i.labels.map((l) => `<span class="label">${esc(l)}</span>`).join(' '),
      }),
      storyPoints: textField(issue, 'storyPoints', save, { type: 'number' }),
      component: textField(issue, 'component', save),
      sprint: textField(issue, 'sprint', save),
      severity: textField(issue, 'severity', save),
      environment: textField(issue, 'environment', save),
      affectsVersion: textField(issue, 'affectsVersion', save),
      epic: textField(issue, 'epic', save),
      dueDate: textField(issue, 'dueDate', save),
    };
    $('#detailsBox').innerHTML = [
      row('Assignee', `<div class="with-icon">${avatar(issue.assignee, 24)}<select class="inline-select" id="assigneeSelect" aria-label="Assignee">${userOptions(issue.assignee, { allowNone: true })}</select></div>
        ${issue.assignee !== actor ? '<button type="button" class="link-btn assign-me" id="assignMe">Assign to me</button>' : ''}`),
      row('Reporter', `<div class="with-icon">${avatar(issue.reporter, 24)}<select class="inline-select" id="reporterSelect" aria-label="Reporter">${userOptions(issue.reporter, { extra: issue.reporter })}</select></div>`),
      row('Priority', `<div class="with-icon">${priorityIcon(issue.priority)}<select class="inline-select" id="prioritySelect" aria-label="Priority">${options(Store.PRIORITIES, issue.priority)}</select></div>`),
      row('Type', `<div class="with-icon">${typeIcon(issue.type)}<select class="inline-select" id="typeSelect" aria-label="Type">${options(Store.TYPES, issue.type)}</select></div>`),
      ...Object.entries(texts).map(([f, t]) => row(FIELD_LABELS[f], t.html)),
    ].join('');
    Object.values(texts).forEach((t) => t.wire());
    $('#assigneeSelect').addEventListener('change', (e) => save({ assignee: e.target.value || null }));
    $('#assignMe')?.addEventListener('click', () => save({ assignee: actor }));
    $('#reporterSelect').addEventListener('change', (e) => save({ reporter: e.target.value }));
    $('#prioritySelect').addEventListener('change', (e) => save({ priority: e.target.value }));
    $('#typeSelect').addEventListener('change', (e) => save({ type: e.target.value }));
  }

  function renderDev(issue, save) {
    const row = (label, html) => `<div class="field-row"><div class="field-label">${label}</div><div class="field-value">${html}</div></div>`;
    const branch = textField(issue, 'branch', save, {
      placeholder: 'No branch yet',
      display: (i) => `<span class="branch">${esc(i.branch)}</span>`,
    });
    const pr = textField(issue, 'pullRequest', save, {
      type: 'url',
      placeholder: 'Paste the PR link',
      display: (i) => `<a href="${esc(i.pullRequest)}" target="_blank" rel="noopener noreferrer">${esc(i.pullRequest.replace(/^https?:\/\/(www\.)?/, ''))}</a>`,
    });
    const suggestion = slugBranch(issue);
    let branchNote = '';
    if (!issue.branch) {
      branchNote = `<div class="suggest">Suggested: <span class="branch">${esc(suggestion)}</span> <button type="button" class="link-btn" id="useBranch">Use</button></div>`;
    } else if (!BRANCH_RE.test(issue.branch)) {
      branchNote = `<div class="suggest warn">⚠ Doesn't follow the naming convention <code>type/${esc(issue.key)}-short-description</code>. For example: <span class="branch">${esc(suggestion)}</span></div>`;
    } else if (!issue.branch.includes(`/${issue.key}-`)) {
      branchNote = `<div class="suggest warn">⚠ This branch names a different ticket than ${esc(issue.key)}.</div>`;
    }
    $('#devBox').innerHTML = [
      row('Branch', `${branch.html}${branchNote}`),
      row('Pull request', pr.html),
    ].join('');
    branch.wire();
    pr.wire();
    $('#useBranch')?.addEventListener('click', () => save({ branch: suggestion }));
  }

  // ------------------------------------------------------------------ router
  function route() {
    const hash = location.hash || '#/board';
    const issueMatch = hash.match(/^#\/browse\/([A-Za-z]+-\d+)$/);
    const view = issueMatch ? 'issue' : hash.startsWith('#/list') ? 'list' : 'board';
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === view || (view === 'issue' && a.dataset.nav === 'board')));
    if (view !== 'issue') document.title = 'IssueBoard';
    if (view === 'issue') renderIssue(issueMatch[1].toUpperCase());
    else if (view === 'list') renderList();
    else renderBoard();
  }

  let lastView = '';
  window.addEventListener('hashchange', () => {
    route();
    if (location.hash !== lastView) { window.scrollTo(0, 0); lastView = location.hash; }
  });

  // Keep several tabs of the same browser in sync.
  window.addEventListener('storage', (e) => {
    if (e.key !== Store.STORAGE_KEY) return;
    const active = document.activeElement;
    if (active && ['INPUT', 'TEXTAREA'].includes(active.tagName)) return; // don't wipe someone's typing
    Store.reload();
    renderChrome();
    route();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#modalRoot').innerHTML) { closeModal(); return; }
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (typing || e.metaKey || e.ctrlKey || e.altKey || $('#modalRoot').innerHTML) return;
    if (e.key === 'c') { e.preventDefault(); openCreate(); }
    if (e.key === '/') { const s = $('#search'); if (s) { e.preventDefault(); s.focus(); } }
  });

  renderChrome();
  route();
})();
