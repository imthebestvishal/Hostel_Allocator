# GGSIPU Hostel Allocation System 🎓🏨

A modern, production-grade Web Application & Automated Allocation System designed for **Guru Gobind Singh Indraprastha University (GGSIPU), East Delhi Campus**.

Featuring a dynamic drone sequence hero section, a 4-step student registration wizard, a student self-service portal, an admin control center, browser-native PDF generation, and a complete Google Apps Script backend connected to Google Sheets & Gmail automation.

---

## ✨ Features

- **🚁 Animated 3D Scroll Hero**: Canvas-rendered sequence (56 frame drone capture of East Delhi Campus).
- **📋 4-Step Registration Wizard**: Real-time form validation, conditional Domicile & Distance rules, PWD priority declaration.
- **🛡️ Student Self-Service Portal**: Authenticated dashboard displaying overview, room details, application timeline, PDF downloads, and grievance ticketing.
- **📊 Admin Dashboard SPA**: Stat cards, real-time Chart.js graphs (Occupancy vs Capacity, Priority Tiers I-V), room grid (176 official EDC rooms), student directory with search, CSV export, and allocation engine modal.
- **⚙️ Google Apps Script Engine**:
  - Priority Rules Engine (PWD → Outside Delhi Merit → Delhi Transferred → Delhi Distance → Waiting List).
  - Automated Gmail Allotment Letters dispatch.
  - Live 2-way Google Sheets DB sync.

---

## 🏫 Official EDC Campus Capacity

- **EDC Boys Hostel**: 264 Seats (108 Rooms — Single, Triple, Four Seated)
- **EDC Girls Hostel**: 176 Seats (68 Rooms — Single, Triple, Four Seated)
- **Total Campus Infrastructure**: 440 Seats across 176 Rooms.

---

## 🚀 Local Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
   cd YOUR_REPOSITORY
   ```

2. **Serve locally:**
   ```bash
   python -m http.server 3000
   ```
   Open `http://localhost:3000` in your browser.

---

## ⚡ Google Apps Script Integration

1. Create a Google Sheet and note its `SHEET_ID`.
2. Deploy the scripts from the `backend/` directory into a Google Apps Script project.
3. Update `GAS_CONFIG.URL` in `api.js` with your Web App deployment URL.
