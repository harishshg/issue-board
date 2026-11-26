/* Data layer. Everything lives in this browser's localStorage, seeded from data/seed.js.
 * Export / import moves a board between browsers. */
window.Store = (() => {
  'use strict';

  const STORAGE_KEY = 'issueboard.db.v1';
  const STATUSES = ['To Do', 'In Progress', 'In Review', 'Done'];
  const TYPES = ['Bug', 'Story', 'Task'];
  const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
  const TEXT_FIELDS = ['summary', 'description', 'reporter', 'severity', 'component', 'environment',
    'affectsVersion', 'epic', 'sprint', 'branch', 'pullRequest', 'dueDate'];
  const MAX_TEXT = 50000;

  let db = null;
  let persistent = true;

  const now = () => new Date().toISOString();
  const uid = () => Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  class ValidationError extends Error {}
  const fail = (msg) => { throw new ValidationError(msg); };

  function normaliseIssue(raw, rank, stamp) {
    return {
      key: raw.key,
      type: TYPES.includes(raw.type) ? raw.type : 'Task',
      summary: String(raw.summary || '').trim() || '(no summary)',
      description: raw.description || '',
      status: STATUSES.includes(raw.status) ? raw.status : 'To Do',
      priority: PRIORITIES.includes(raw.priority) ? raw.priority : 'Medium',
      assignee: raw.assignee || null,
      reporter: raw.reporter || 'Mentor',
      labels: Array.isArray(raw.labels) ? raw.labels : [],
      storyPoints: Number.isInteger(raw.storyPoints) ? raw.storyPoints : null,
      rank: typeof raw.rank === 'number' ? raw.rank : rank,
      created: raw.created || stamp,
      updated: raw.updated || stamp,
      comments: Array.isArray(raw.comments) ? raw.comments : [],
      history: Array.isArray(raw.history) ? raw.history : [],
      ...Object.fromEntries(TEXT_FIELDS
        .filter((f) => !['summary', 'description', 'reporter'].includes(f) && raw[f])
        .map((f) => [f, String(raw[f])])),
    };
  }

  function fromSeed() {
    const seed = window.ISSUEBOARD_SEED || { project: { key: 'OMS', name: 'Project' }, users: [], issues: [] };
    const stamp = now();
    return {
      version: 1,
      project: clone(seed.project),
      users: clone(seed.users),
      issues: seed.issues.map((i, idx) => normaliseIssue(i, idx * 1000, stamp)),
    };
  }

  function validateDb(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.issues) || !Array.isArray(data.users) || !data.project) {
      fail('This file is not an IssueBoard export.');
    }
    const stamp = now();
    return {
      version: 1,
      project: { key: String(data.project.key || 'OMS'), name: String(data.project.name || 'Project') },
      users: data.users.filter((u) => u && u.name).map((u) => ({ name: String(u.name).slice(0, 60) })),
      issues: data.issues.filter((i) => i && /^[A-Z]+-\d+$/.test(i.key)).map((i, idx) => normaliseIssue(i, idx * 1000, stamp)),
    };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      persistent = true;
    } catch (e) {
      persistent = false;
    }
  }

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      persistent = false;
    }
    if (raw) {
      try {
        db = validateDb(JSON.parse(raw));
        // People added to the seed later (e.g. a new team member) also appear on boards saved before.
        const seedUsers = (window.ISSUEBOARD_SEED && window.ISSUEBOARD_SEED.users) || [];
        const known = new Set(db.users.map((u) => u.name.toLowerCase()));
        const missing = seedUsers.filter((u) => u && u.name && !known.has(String(u.name).toLowerCase()));
        if (missing.length) {
          db.users.push(...missing.map((u) => ({ name: String(u.name) })));
          save();
        }
        return;
      } catch (e) {
        console.warn('Stored board was unreadable; starting from the original tickets.', e);
      }
    }
    db = fromSeed();
    save();
  }

  const userNames = () => db.users.map((u) => u.name);

  function find(key) {
    const issue = db.issues.find((i) => i.key === key);
    if (!issue) fail(`Issue ${key} does not exist`);
    return issue;
  }

  function clean(field, value) {
    switch (field) {
      case 'status': return STATUSES.includes(value) ? value : fail(`Unknown status ${value}`);
      case 'type': return TYPES.includes(value) ? value : fail(`Unknown type ${value}`);
      case 'priority': return PRIORITIES.includes(value) ? value : fail(`Unknown priority ${value}`);
      case 'assignee':
        if (value === null || value === '') return null;
        return userNames().includes(value) ? value : fail(`Unknown person ${value}`);
      case 'labels': {
        const arr = Array.isArray(value) ? value : String(value || '').split(',');
        const out = [];
        arr.map((l) => String(l).trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40))
          .forEach((l) => { if (l && !out.includes(l)) out.push(l); });
        return out;
      }
      case 'storyPoints': {
        if (value === null || value === '' || value === undefined) return null;
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0 || n > 100) fail('Story points must be a whole number from 0 to 100');
        return n;
      }
      case 'rank': {
        const n = Number(value);
        return Number.isFinite(n) ? n : fail('Invalid rank');
      }
      default:
        if (!TEXT_FIELDS.includes(field)) fail(`${field} cannot be edited`);
        value = value == null ? '' : String(value);
        if (value.length > MAX_TEXT) fail(`${field} is too long`);
        if (field === 'summary') {
          value = value.trim();
          if (!value) fail('Summary is required');
          if (value.length > 255) fail('Summary must be at most 255 characters');
        }
        if (field === 'pullRequest' && value && !/^https?:\/\//i.test(value)) fail('Pull request must be a http(s) link');
        return field === 'description' ? value : value.trim();
    }
  }

  function update(key, changes, actor) {
    const issue = find(key);
    const stamp = now();
    const cleaned = Object.fromEntries(Object.entries(changes).map(([f, v]) => [f, clean(f, v)]));
    let changed = false;
    for (const [field, value] of Object.entries(cleaned)) {
      const old = issue[field] ?? null;
      if (JSON.stringify(old) === JSON.stringify(value)) continue;
      issue[field] = value;
      changed = true;
      if (field !== 'rank') {
        issue.history.push({ id: uid(), at: stamp, author: actor, field, from: old, to: value });
      }
    }
    if (changed) {
      issue.updated = stamp;
      save();
    }
    return issue;
  }

  function create(data, actor) {
    const summary = clean('summary', data.summary);
    const numbers = db.issues.map((i) => parseInt(i.key.split('-')[1], 10)).filter(Number.isFinite);
    const key = `${db.project.key}-${Math.max(0, ...numbers) + 1}`;
    const status = clean('status', data.status || 'To Do');
    const ranks = db.issues.filter((i) => i.status === status).map((i) => i.rank);
    const stamp = now();
    const issue = normaliseIssue({
      key,
      summary,
      type: clean('type', data.type || 'Task'),
      priority: clean('priority', data.priority || 'Medium'),
      status,
      assignee: clean('assignee', data.assignee || null),
      description: clean('description', data.description || ''),
      labels: clean('labels', data.labels || []),
      storyPoints: clean('storyPoints', data.storyPoints),
      reporter: actor,
      rank: ranks.length ? Math.max(...ranks) + 1000 : 0,
    }, 0, stamp);
    issue.history.push({ id: uid(), at: stamp, author: actor, field: 'created', from: null, to: key });
    db.issues.push(issue);
    save();
    return issue;
  }

  function remove(key) {
    const issue = find(key);
    db.issues = db.issues.filter((i) => i !== issue);
    save();
  }

  function addComment(key, body, actor) {
    const issue = find(key);
    const text = String(body || '').trim();
    if (!text) fail('Comment cannot be empty');
    if (text.length > MAX_TEXT) fail('Comment is too long');
    const comment = { id: uid(), at: now(), author: actor, body: text };
    issue.comments.push(comment);
    issue.updated = comment.at;
    save();
    return comment;
  }

  function editComment(key, id, body) {
    const comment = find(key).comments.find((c) => c.id === id) || fail('Comment not found');
    const text = String(body || '').trim();
    if (!text) fail('Comment cannot be empty');
    comment.body = text;
    comment.edited = now();
    save();
    return comment;
  }

  function deleteComment(key, id) {
    const issue = find(key);
    issue.comments = issue.comments.filter((c) => c.id !== id);
    save();
  }

  function addUser(name) {
    const clean = String(name || '').replace(/\s+/g, ' ').trim();
    if (!clean || clean.length > 60) fail('Name must be 1–60 characters');
    if (userNames().some((n) => n.toLowerCase() === clean.toLowerCase())) fail(`${clean} already exists`);
    db.users.push({ name: clean });
    save();
    return clean;
  }

  function exportJson() {
    return JSON.stringify({ ...db, exportedAt: now() }, null, 2);
  }

  function importJson(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      fail('That file is not valid JSON.');
    }
    db = validateDb(parsed);
    save();
  }

  function reset() {
    db = fromSeed();
    save();
  }

  load();

  return {
    STATUSES, TYPES, PRIORITIES, ValidationError,
    get project() { return db.project; },
    get users() { return db.users; },
    get issues() { return db.issues; },
    get persistent() { return persistent; },
    STORAGE_KEY,
    reload: load,
    get: (key) => db.issues.find((i) => i.key === key) || null,
    update, create, remove, addComment, editComment, deleteComment, addUser,
    exportJson, importJson, reset,
  };
})();
