# IssueBoard

A lightweight, Jira-style issue tracker for the OMS mentoring programme. It's a static site:
plain HTML/CSS/JS, no build step, no backend, no dependencies. It runs from GitHub Pages, any
static host, or straight from your disk.

It comes preloaded with the 21 tickets from [`../jira-tickets`](../jira-tickets/README.md)
(OMS-101 to OMS-115 bugs, OMS-201 to OMS-206 stories).

## Features

* **Board:** To Do / In Progress / In Review / Done columns. Drag cards to change status or
  reorder them. Filter by text, assignee or type.
* **List:** every issue in a sortable table.
* **Issue page:**
  * Edit the summary in place.
  * Edit the description in Markdown. Acceptance-criteria checkboxes can be ticked directly.
  * Change status, assignee, reporter, priority, type, labels, story points, component, sprint
    and more.
  * Add, edit and delete comments.
  * **History** tab: an audit trail of every change.
* **Development panel:** record the git branch (with a suggested name that follows the
  `bugfix/OMS-123-…` convention) and the pull request link.
* **Create issues** (`+ Create`, or press `c`). Keys continue from the highest number, e.g. OMS-207.
* **People:** add team members via **••• → Manage people**. Pick who you're acting as in the top bar;
  comments and history are recorded under that name.
* Dark mode follows the operating system setting.

## Where is the data stored?

In **your browser's local storage**, on the device you're using. That means:

| | |
|---|---|
| ✅ | Nothing to install or host. Works offline. |
| ⚠️ | Each person and each browser has **its own copy** of the board. The mentor's and the student's changes don't sync automatically. |
| ⚠️ | Clearing site data, or using a private window, loses changes. |

To share or back up a board, use **••• → Export board (JSON)** and send the file. The other person
loads it with **••• → Import board (JSON)…**, which *replaces* their board with yours.

**••• → Reset board to original tickets** starts over from the bundled tickets.

> A suggested routine: the student owns the board and updates it as they work. Once a week (or at
> every review) they export it and send it to the mentor, who imports it to see progress and comments.

## Run locally

Opening `index.html` directly from disk works. A local web server mirrors GitHub Pages more
closely:

```bash
cd issue-board
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Publish on GitHub Pages

1. Create a **new** GitHub repository (e.g. `oms-issue-board`). Keep it separate from
   `order-service`, so the board isn't mixed into the codebase.
2. Push this folder:
   ```bash
   cd issue-board
   git init -b main
   git add .
   git commit -m "IssueBoard for OMS mentoring"
   git remote add origin git@github.com:<your-username>/oms-issue-board.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch:
   `main`, folder `/ (root)` → Save**.
4. After a minute the site is live at `https://<your-username>.github.io/oms-issue-board/`.

All paths are relative, so it works under the `/oms-issue-board/` sub-path. The empty `.nojekyll`
file tells Pages to serve the files as they are.

> **Visibility:** on free GitHub plans, a Pages site is **public**, even if the repository is private.
> The tickets contain no answers, so that's normally fine. Never add the mentor answer key here.

## Changing the starting tickets

The bundled tickets live in `data/seed.js`, generated from the Markdown files in `../jira-tickets`.
After editing those files, regenerate it:

```bash
python3 tools/build_seed.py
```

Browsers that have already opened the board keep their saved copy. Use **Reset board** to load
the new seed.

## Project layout

```
issue-board/
├── index.html          app shell
├── assets/
│   ├── app.js          UI: board, list, issue page, dialogs
│   ├── store.js        data layer (localStorage, validation, history, import/export)
│   ├── markdown.js     small, safe Markdown renderer
│   └── styles.css
├── data/seed.js        generated starting tickets
└── tools/build_seed.py regenerates data/seed.js
```
