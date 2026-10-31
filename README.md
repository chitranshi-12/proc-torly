# 👁️ Proctorly — Online Exam Proctoring System

Proctorly is a full-featured, production-ready online exam proctoring web application with dedicated **Student** and **Teacher** portals. It combines browser integrity defense, computer vision AI face tracking, WebRTC live desktop monitoring, and cloud evidence logging.

---

## 📌 Features Overview

### 1. 🎓 Student Side (Test Screen)
* **Fullscreen API Enforcement**: The exam automatically launches in full screen when the student begins. Exiting full screen is immediately flagged.
* **Full-Screen MCQ Experience**: Clean, distraction-free questions with Next / Previous navigation, Clear Choice, and a Question Palette.
* **Countdown Timer**: Synchronized timer at the top with critical threshold alerts and automatic submission upon expiration.
* **Mandatory Self-View Webcam Box (160x120px)**: A live webcam video box permanently pinned in the bottom-right corner. It cannot be minimized, closed, or moved by the candidate.
* **Hardware Permission Lock**: Camera and screen share permissions must be granted before the exam can commence.

### 2. 🚨 Cheating Detection (10 Core Integrity Checks)
1. **Exiting Fullscreen** (`fullscreenchange` event): Detects when the candidate presses Escape or exits fullscreen.
2. **Switching Tabs** (`visibilitychange` event): Detects when `document.visibilityState === 'hidden'`.
3. **Window Focus Loss** (`window.onblur` event): Flags when another desktop window, application, or popup gains focus.
4. **Right-Click Context Menu** (`contextmenu` event): Context menu is blocked (`preventDefault()`) and flagged as a prohibited action.
5. **Copy, Cut, Paste** (`copy`, `cut`, `paste` events): Intercepts and blocks clipboard operations.
6. **Prohibited Keystrokes**: Blocks `F12`, `Ctrl+Shift+I` (DevTools), `Ctrl+U` (View Source), `Alt+Tab`, `PrintScreen`, `Meta/Windows key`, and `Ctrl+C/V/X`.
7. **Window Resizing** (`resize` event): Flags window dimensions changing during an active exam.
8. **Mouse Leaving Screen** (`mouseleave` event): Flags when the cursor exits the active test viewport boundaries.
9. **AI Face Detection**: Continuously checks that exactly one face is visible in the camera frame (flags face absence or multiple people).
10. **Inactivity / Idle Timeout**: Detects 30+ seconds without mouse or keyboard interaction.

### 3. ⚠️ Instant Evidence Capture & 3-Strike Warning System
Whenever any cheating violation occurs:
1. **Dual Evidence Capture**:
   - Captures a high-resolution screenshot of the student's screen using `html2canvas`.
   - Captures a synchronized webcam photo from the video frame onto an HTML5 canvas.
2. **Popup Warning to the Student**:
   - Displays a large red modal alert:
     > **"⚠️ Warning! You performed a prohibited action. This has been reported to your teacher."**
   - Displays the current strike count: **Warning 1/3, Warning 2/3, Warning 3/3**.
3. **Instant Report to Teacher**:
   - The student's Name, Roll ID, violation type, timestamp, screenshot, and webcam photo are instantly transmitted to the teacher dashboard.
4. **Automatic 3-Strike Termination**:
   - Upon reaching 3 warnings, the test is automatically terminated, saved, and submitted.

### 4. 👨‍🏫 Teacher Side (Dashboard)
* **Dedicated Teacher Access**: Separate teacher login supporting Google Sign-In and Email/Password credentials.
* **Live Student Roster**: Real-time cards showing enrolled students, online/offline heartbeats, active status, risk scores, and current warning counts.
* **Instant Alert Notifications**:
  - Whenever a student cheats, an instant top-right popup toast appears:
    > **"🚨 Student ID: 101 (Rahul) did something wrong - Tab switch - 10:32 AM"**
  - Includes a dual-tone audio chime and instant thumbnail previews of the screen screenshot and webcam photo.
* **Manual Test Termination**: Teachers have a **"Terminate Test"** button to immediately lock and conclude any student's exam remotely.
* **Violation History Audit Table**: Tabular view listing Student ID, Candidate Name, Violation Type, Exact Time, Screen Capture, and Webcam Photo.
* **Audit Exports**: One-click download of **Official PDF Reports** (via `jsPDF`) and **CSV Spreadsheets**.
* **Dark / Light Theme**: Built-in theme switcher for invigilation environments.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons
- **Real-Time & Database**: Firebase Cloud Firestore & Firebase Auth (with fallback to an in-memory broadcast simulation engine)
- **Evidence Screenshots**: `html2canvas` (screen) + HTML5 Canvas API (webcam)
- **Computer Vision**: TensorFlow.js / MediaPipe Face Detection
- **Live Video Streaming**: WebRTC `RTCPeerConnection` with Firestore SDP offer/answer signaling
- **PDF Generation**: `jspdf`

---

## 🚀 Quick Setup & Run Instructions

### 1. Local Development
```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev
```
The app runs on `http://localhost:3000`.

### 2. Firebase Configuration (Optional for Cloud Mode)
OmniProctor features a zero-credential **Interactive Demo Mode** that runs out of the box. To connect your own live Firebase project:
1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project.
2. Enable **Authentication** (Google & Email/Password providers).
3. Enable **Cloud Firestore** and **Cloud Storage**.
4. Copy your web app config into `firebase-applet-config.json`:
   ```json
   {
     "projectId": "your-project-id",
     "appId": "your-app-id",
     "apiKey": "your-api-key",
     "authDomain": "your-project-id.firebaseapp.com",
     "firestoreDatabaseId": "(default)",
     "storageBucket": "your-project-id.firebasestorage.app",
     "messagingSenderId": "your-sender-id"
   }
   ```
5. Deploy security rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

---

## 📂 Key File Structure

| File | Purpose |
|---|---|
| `src/components/AdminLogin.tsx` | Teacher entrance portal with Google Sign-In and Demo launcher |
| `src/components/AdminExamList.tsx` | Exam creator, MCQ manager, CSV uploader, and Share Link / QR code generator |
| `src/components/StudentCodeEntry.tsx` | Student portal entrance (Name, Roll No, Institute, Exam Code validation) |
| `src/components/StudentChecklist.tsx` | Pre-exam verification (Consent, Camera & Mic, Entire Screen check) |
| `src/components/ExamRoom.tsx` | Main test room: Fullscreen, 160x120px webcam box, 10 cheating detections, html2canvas capture, warning popups |
| `src/components/InvigilatorDashboard.tsx`| Teacher monitoring console: Live candidate grid, instant alert toasts, manual termination, violation table, theme toggle |
| `src/services/demoService.ts` | Multi-tab simulation engine with `BroadcastChannel` syncing and audio chime generator |
| `src/services/firebaseExamService.ts` | Firestore & Firebase Auth operations |

---

## 💡 How Cheating Detection Works (Beginner Friendly Explanation)

1. **How does the app know if the student leaves the screen?**
   The browser fires a `visibilitychange` event whenever the active tab changes. If the student opens Google in a new tab, `document.visibilityState` changes from `"visible"` to `"hidden"`. OmniProctor listens for this and triggers an immediate strike.

2. **How does the webcam self-view stay on screen?**
   In `ExamRoom.tsx`, a `<video>` tag is fixed to the bottom right (`fixed bottom-4 right-4 z-40 w-40 h-28`). CSS rules like `pointer-events: none` ensure the student cannot drag, minimize, or inspect it away.

3. **How does the screenshot get captured?**
   When a violation occurs, `html2canvas(document.getElementById('exam-root'))` renders the current DOM into an image, while a secondary canvas draws the current frame from the webcam `<video>`. Both images are converted to data URLs and sent to the teacher.

4. **How does multi-tab demo testing work?**
   Modern browsers support the `BroadcastChannel` API. When you click **"Open Student Tab"** from the teacher dashboard, the two tabs communicate like a live backend without needing any server setup.
