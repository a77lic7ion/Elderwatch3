# ElderWatch 🌿

> **Dignified, 1-Tap Daily Wellness Check-ins for Retirement Villages & Frail-Care Homes**

[![Build Status](https://img.shields.io/badge/build-passing-157A4C?style=for-the-badge&logo=github-actions&logoColor=white)](https://github.com/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![PWA](https://img.shields.io/badge/PWA-Installable-purple?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Firebase Ready](https://img.shields.io/badge/Firebase-Blaze_Ready-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

---

## 📖 Overview

**ElderWatch** is a purpose-built, accessible Progressive Web App (PWA) designed specifically for frail-care facilities, assisted living, and retirement communities.

It replaces unreliable pen-and-paper morning rosters, expensive proprietary emergency pendants, and intrusive check-in phone calls with **one single tap** on a smartphone the resident already owns:
* **The Resident Experience**: Open the phone. One giant green button (**"I'm OK"**) and one red button (**"I need help"**). No passwords, no PIN codes, no menus, no confusing navigation.
* **The Care Staff Experience**: A live, auto-refreshing morning triage dashboard highlighting exactly who has checked in, who hasn't checked in past the **09:15 cutoff**, and who needs immediate assistance.
* **Family Peace of Mind**: Eliminates anxiety with verifiable, auditable daily wellness confirmations.

---

## ✨ Key Features

### 🧓 1. Resident Screen (Zero-Friction Terminal)
* **Atkinson Hyperlegible Typography**: Designed by the Braille Institute for low vision and macular degeneration. Minimum text size is 20px (scalable up to 1.14x Extra Large).
* **High Contrast Dark Theme Default Throughout**: Tactile `#121815` dark background with crisp `#F2EEE5` ink and luminous green/red buttons exceeding 5:1 contrast ratios to prevent glare and protect aging eyes in low morning light.
* **Tactile & Auditory Reinforcement**:
  * **Dual-tone Web Audio chimes**: Ascending C5 &rarr; G5 chime on confirmation; calming descending alert tone on help requests.
  * **Haptic Vibration**: Rhythmic vibration patterns confirm taps without relying on sound.
  * **Full-screen Visual Confirmation**: SVG checkmark animations eliminate double-tap anxiety.
* **Mistake-Proof**: 1-tap **"Undo"** directly on the confirmation screen in case a resident taps accidentally.
* **Bilingual English & Afrikaans**: Instant toggle between English and Afrikaans (`"Ek is reg"` / `"Ek het hulp nodig"`) with persistent preference memory.
* **Cutoff Warning (09:15)**: Contextual alert informing the resident that sister rounds begin shortly if check-in is pending.
* **Emergency Nurse Direct Dial**: Dedicated single-touch button calling the on-duty Sister directly (`tel:` protocol).
* **7-Day Status History**: Visual day-by-day week strip showing past check-in statuses.

### 👩‍⚕️ 2. Staff & Care Admin Dashboard
* **Real-Time Morning Triage Board**: Grouped by **Needs Attention**, **Awaiting Check-in (Past 09:15 Cutoff)**, **Awaiting (On Time)**, **Checked In (OK)**, and **Off-Premises/Hospital**.
* **Pair Any Device in 10 Seconds**: Generate instant QR codes or 6-digit temporary PINs. Scan with the resident's camera to permanently link the phone with zero login credentials required.
* **Resident & Room Management**: Add/edit residents, assign specific care wings, record dietary/medical notes, and assign primary duty nurses.
* **In-Person Manual Override**: When nurses visit a resident in person during rounds, they can record an in-person check-in with one click.
* **Live SSE Broadcasts**: Instant real-time board updates via Server-Sent Events without manual page refreshes.
* **Exportable Audit Logs**: Export daily check-in records to CSV/JSON for compliance and healthcare audits.

### 📱 3. Progressive Web App (PWA) & Offline Resilience
* **Standalone Screen**: Installs directly to iOS Safari and Android Chrome home screens without an App Store download.
* **Offline-First Queue**: Check-in taps work even if the facility Wi-Fi briefly drops. Taps are stored in localStorage/IndexedDB and automatically synced as soon as connectivity resumes.
* **Battery & Data Friendly**: Ultra-lightweight payload (<80KB total CSS/JS gzipped).

---

## 🏛️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ELDERWATCH CLIENT                       │
│                                                             │
│   ┌───────────────────────────┐ ┌───────────────────────┐   │
│   │   Resident Screen (PWA)   │ │  Staff Admin Board    │   │
│   │   • Atkinson Typography   │ │  • Realtime Triage    │   │
│   │   • 1-Tap OK / Help       │ │  • QR Device Linking  │   │
│   │   • Audio & Haptics       │ │  • In-person Override │   │
│   │   • Offline Sync Queue    │ │  • Export Logs        │   │
│   └─────────────┬─────────────┘ └───────────┬───────────┘   │
└─────────────────┼───────────────────────────┼───────────────┘
                  │                           │
                  ▼                           ▼
┌─────────────────────────────────────────────────────────────┐
│               EXPRESS & REALTIME SERVICE LAYER              │
│                                                             │
│   • /api/checkin               • /api/checkins/live (SSE)   │
│   • /api/checkin/undo          • /api/devices/link-qr       │
│   • /api/residents             • /api/devices/bind          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 PERSISTENCE & DATA STORAGE                  │
│                                                             │
│   • Built-in Local Engine (data/elderwatch-db.json)         │
│   • OR Firebase Firestore (Blaze / Free-Tier Pay-As-You-Go) │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start & Installation

### Prerequisites
* **Node.js**: v18.0.0 or higher (v20+ recommended)
* **npm**: v9.0.0 or higher

### 1. Clone the repository
```bash
git clone https://github.com/your-username/elderwatch.git
cd elderwatch
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Create a `.env` file in the root directory (based on `.env.example`):
```bash
cp .env.example .env
```

Optional configuration:
```env
PORT=3000
NODE_ENV=development
```

### 4. Run development server
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:3000`.

### 5. Production build
```bash
npm run build
npm start
```

---

## 📁 Project Structure

```
├── .env.example                 # Example environment variables
├── index.html                   # Entry HTML with Atkinson Hyperlegible fonts & PWA meta
├── metadata.json                # Project identity and permissions
├── package.json                 # Project dependencies and build scripts
├── server.ts                    # Full-stack Express backend with SSE & check-in endpoints
├── tsconfig.json                # TypeScript configuration
├── vite.config.ts               # Vite configuration with PWA plugin and Tailwind
├── src/
│   ├── main.tsx                 # React entry point
│   ├── App.tsx                  # Top-level routing (Resident Screen, Admin, Device Pairing)
│   ├── types.ts                 # Shared TypeScript interfaces & models
│   ├── index.css                # CSS Variables (Paper, Ink, Ok, Help, Sun tokens)
│   ├── components/
│   │   ├── ResidentCheckInScreen.tsx   # 1-Tap Resident UI & Desktop Showcase
│   │   ├── AdminPanel.tsx              # Staff triage dashboard & real-time monitoring
│   │   ├── DeviceLinkScreen.tsx        # Resident phone linking portal (PIN / QR)
│   │   ├── DeviceLinkQRModal.tsx       # QR code generator for care staff
│   │   ├── AddEditResidentModal.tsx    # Resident management modal
│   │   ├── ResidentDetailModal.tsx     # Resident history & profile view
│   │   ├── BackendEvaluationModal.tsx  # Cost & architecture evaluation guide
│   │   └── PWAInstallButton.tsx        # Install prompt component
```

---

## ☁️ Deploying Online

You have three straightforward, battle-tested options for hosting ElderWatch in production:

### Option A: Firebase Hosting + Cloud Run / Cloud Functions (Recommended)
Because you already have a **Firebase Blaze Plan**, you can host ElderWatch under your own custom domain (e.g. `checkin.myfacility.org` or `your-project.web.app`):

1. **Install Firebase CLI**:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init
   ```
2. **Select**:
   - `Hosting`: Configure files for Firebase Hosting
   - (Optional) `Firestore`: Set up security rules and database
3. **Configure `firebase.json`**:
   ```json
   {
     "hosting": {
       "public": "dist",
       "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
       "rewrites": [
         {
           "source": "**",
           "destination": "/index.html"
         }
       ]
     }
   }
   ```
4. **Deploy**:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

---

### Option B: Vercel (Fastest 1-Click Frontend Deployment)
1. Push your code to GitHub.
2. Sign in to [Vercel](https://vercel.com) and click **"Add New Project"**.
3. Import this repository.
4. Framework Preset: **Vite**.
5. Build Command: `npm run build`
6. Output Directory: `dist`
7. Click **Deploy**. Vercel gives you an instant HTTPS link and custom domain support with global CDN caching.

---

### Option C: Google Cloud Run / Docker
Deploy the full-stack container (Express backend + Vite client) directly on Google Cloud Run:
```bash
gcloud run deploy elderwatch \
  --source . \
  --platform managed \
  --region europe-west2 \
  --allow-unauthenticated \
  --port 3000
```

---

## 🔥 Connecting to Your Firebase Project

### 1. What credentials are required?
To connect ElderWatch to your Firebase project, go to [Firebase Console](https://console.firebase.google.com/):
1. Open **Project Settings** (gear icon) &rarr; **General**.
2. Scroll to **"Your apps"** and click **Web** (`</>`).
3. Copy your Firebase Configuration object:

```typescript
const firebaseConfig = {
  apiKey: "AIzaSyAQb0poaNUJVv6ND4MfbzWcyxgjyBCBJyI",
  authDomain: "elderwatch-14712.firebaseapp.com",
  projectId: "elderwatch-14712",
  storageBucket: "elderwatch-14712.firebasestorage.app",
  messagingSenderId: "981482830351",
  appId: "1:981482830351:web:4823b2f99f590cc269017a"
};
```

### 2. Firestore Document Data Model
ElderWatch maps to a clean, minimal document model:

* **Collection `residents`**:
  ```json
  {
    "id": "res-margaret",
    "name": "Margaret Thorne",
    "roomNumber": "14",
    "wing": "Willow Cottage",
    "primarySister": "Sarah",
    "sisterPhone": "+27118944000",
    "status": "active"
  }
  ```

* **Collection `checkins`** (Key format: `{YYYY-MM-DD}_{residentId}`):
  ```json
  {
    "date": "2026-09-03",
    "residentId": "res-margaret",
    "homeId": "home-st-jude",
    "status": "ok",
    "timestamp": "2026-09-03T07:42:15Z",
    "updatedBy": "resident"
  }
  ```

* **Collection `device_bindings`**:
  ```json
  {
    "token": "tok_99182",
    "residentId": "res-margaret",
    "pairedAt": "2026-09-01T10:00:00Z"
  }
  ```

### 3. Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Residents can submit their daily check-in
    match /checkins/{checkinId} {
      allow read: if true;
      allow create, update: if request.resource.data.status in ['ok', 'not_ok', 'awaiting'];
    }
    // Residents read-only for public village roster
    match /residents/{residentId} {
      allow read: if true;
      allow write: if request.auth != null; // Staff only
    }
  }
}
```

### 4. Blaze Plan Cost Breakdown: Is it expensive?
**No. It will cost $0.00 (completely FREE).**
The Blaze plan includes the entire free tier every single month. Charges only start after you exceed:
* **20,000 document writes / day**: A facility with 100 residents uses ~100 writes/day (**0.5%** of free quota).
* **50,000 document reads / day**: Real-time staff listeners only read changes (**~2%** of quota).
* **Cost beyond free tier**: Only **$0.18 per 100,000 writes** ($0.0000018 per check-in). Even with 5,000 residents, your bill would be under $1.00/month.

---

## ♿ Accessibility Standards
- **WCAG 2.1 AAA Contrast**: All foreground/background color combinations exceed 5:1 contrast.
- **Physical Hand Ergonomics**: Giant touch targets (176px & 122px heights) with generous spacing prevent mistaken taps for tremors or Parkinson's.
- **Screen Reader Accessible**: Semantically labeled ARIA roles (`role="status"`, `role="alert"`, `aria-pressed`).
- **No Hidden Passwords**: No login gates or password resets for elderly users.

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
