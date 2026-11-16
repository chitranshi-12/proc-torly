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
Use Node.js 24.12 or newer.
```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev
```
The app runs on `http://localhost:3000`. To use live teacher authentication, student exam lookup, and server-side grading locally, set `FIREBASE_SERVICE_ACCOUNT_JSON` in your untracked `.env` file to the service account JSON for the same Firebase project. Demo Mode does not require this credential.

### 2. Firebase Setup
Live exams use Firebase Authentication, Cloud Firestore, and Cloud Storage. Demo Mode remains available without Firebase. Configure a Firebase project:
1. Enable **Authentication** providers for **Google**, **Email/Password**, and **Anonymous** student sessions.
2. Create the named Firestore database configured in `firebase-applet-config.json`, or change its `firestoreDatabaseId` to `(default)`. Keep that same database ID in `firebase.json` and Render's `FIREBASE_DATABASE_ID`.
3. Enable **Cloud Storage**. New Cloud Storage buckets may require a billing-enabled Firebase plan; set billing alerts and review Firebase usage charges before real exam data is uploaded.
4. Put the Firebase web app configuration in `firebase-applet-config.json`:
   ```json
   {
     "projectId": "your-project-id",
     "appId": "your-app-id",
     "apiKey": "your-api-key",
     "authDomain": "your-project-id.firebaseapp.com",
     "firestoreDatabaseId": "your-firestore-database-id",
     "storageBucket": "your-project-id.firebasestorage.app",
     "messagingSenderId": "your-sender-id"
   }
   ```
5. Deploy the Firestore and Storage rules from this repository with the Firebase CLI:
   ```bash
   firebase deploy --only firestore:rules,storage
   ```
The app stores question text separately from answer keys. Students receive only public question data; the Render API grades submissions using the private answer-key documents.

### 3. Google Sign-In for Teachers
Teacher email/password and Google sign-in both use Firebase Authentication. New teacher registrations receive a `pending` profile and cannot access exams until an administrator changes their `users/{uid}.role` to `invigilator` in Firestore. Never grant a role from the browser; assigning `invigilator` or `admin` exposes all exams and answer keys. Before deploying the new rules, review existing user profiles and remove any teacher roles that were not intentionally granted. Add `localhost` and your Vercel production/preview hostnames under **Authentication → Settings → Authorized domains**.

### 4. Deploy the API to Render

The repository includes an API Blueprint in `render.yaml`. Push the project to GitHub and import it into Vercel first to reserve the frontend hostname; you can add `VITE_API_BASE_URL` after the API is deployed. Then in Render choose **New → Blueprint** and connect that repository. Set the project folder as Render's Root Directory if it is nested in the repository.

The Render service verifies Firebase ID tokens, controls when exam sessions start, saves answers only while the server-side exam deadline is open, securely grades submissions, and returns exam questions without answer keys. Firestore is the application database; Firebase Storage stores captured evidence. No Render disk or SQLite database is needed.

In Render, set the Blueprint's `FIREBASE_SERVICE_ACCOUNT_JSON` to the full JSON key for a Firebase service account. Keep this secret only in Render—never commit it or put it in Vercel. Set `FRONTEND_ORIGINS` to the comma-separated, exact Vercel origins allowed to call the API (production and any preview hostnames you use). After Render is live, set Vercel's `VITE_API_BASE_URL` to the Render origin and redeploy the frontend.

### 5. Deploy the frontend to Vercel

Import the same GitHub repository into Vercel, set the project's **Root Directory** to this folder if needed, and add `VITE_API_BASE_URL` with the Render service origin (for example `https://proctorly-api.onrender.com`, without `/api` or a trailing slash). Vercel builds the Vite app and serves the static frontend. Add the final Vercel hostname to Firebase Authentication's Authorized domains and Render's `FRONTEND_ORIGINS`.

The Firebase web configuration is public client configuration, not a server credential. Do not add a Vercel API key; only the Firebase Admin service-account JSON is private and belongs in Render.

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
