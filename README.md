<div align="center">

# Manager Team — Sprint & Release Capacity Planner

**A desktop app built with Electron + React that gives Tech Leads, POs, and PMs full visibility over squad capacity, sprint workload, and release initiatives — in real time.**

[![Electron](https://img.shields.io/badge/Electron-31-47848F?style=flat&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat)](https://github.com/rafafariii/ProjetsAmazon)

> Currently running in production across **3 squads** — built to solve a real team management pain point.

</div>

---

## The Problem

Managing sprint capacity across multiple squads is painful. Spreadsheets get out of sync, hours are miscounted, and Tech Leads lose visibility over who is doing what during a release cycle.

## The Solution

**Manager Team** is a cross-platform desktop application that centralizes everything:

- Tech Leads, POs, and PMs register **initiatives and user stories** with estimated hours
- The team has **full visibility** over sprint and release workload
- Capacity is tracked **per squad member**, per sprint, per release
- No backend required — data persists in a portable `.xlsx` file (SharePoint/network-drive friendly)

---

## Key Features

| Feature | Description |
|---|---|
| **Initiative Management** | Register and refine backlog items with hour estimates |
| **Capacity Dashboard** | Visual overview of team capacity per sprint and release |
| **Squad View** | Each member can see their own workload and the full team's |
| **Release Planning** | Map stories to releases and track progress in real time |
| **OKR / KPI Tracking** | Monitor team goals alongside delivery metrics |
| **Risk Register** | Surface and track risks across the release |
| **Zero Infrastructure** | `.xlsx` as a portable database — no server, no cloud required |
| **Cross-platform builds** | Windows (NSIS), macOS (DMG), Linux (AppImage/deb) |

---

## Tech Stack

```
Frontend     React 18 · Vite 5 · Tailwind CSS 3 · Recharts
Desktop      Electron 31 — secure IPC via contextBridge
Data layer   SheetJS (xlsx) — reads/writes .xlsx natively
Icons        Lucide React
Packaging    electron-builder → Windows · macOS · Linux
```

**Security model:** `contextIsolation: true`, `nodeIntegration: false` — only 5 safe methods are exposed to the renderer via `contextBridge.exposeInMainWorld`.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Electron Shell                  │
│                                                   │
│   Main Process (Node.js)    Renderer (React/Vite) │
│   ├── main.js               ├── App.jsx           │
│   ├── File I/O via xlsx     ├── Dashboards        │
│   └── Native dialogs        └── Tailwind UI       │
│              ↕  preload.js (contextBridge)        │
└──────────────────────────────────────────────────┘
```

---

## Getting Started

```bash
# Clone the repository
git clone https://github.com/rafafariii/ProjetsAmazon.git
cd ProjetsAmazon/NewQBR/electron-app

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build a distributable package
npm run dist:win    # Windows installer + portable
npm run dist:mac    # macOS DMG + zip
npm run dist:linux  # AppImage + deb
```

---

## Background

This project was built to explore the capabilities of **Claude Code** as a development accelerator — and the result exceeded expectations. What started as an internal experiment is now actively used by **3 agile squads** for release planning and sprint capacity management.

---

## Author

**Rafael Santos** — Tech Lead  
[GitHub](https://github.com/rafafariii)
