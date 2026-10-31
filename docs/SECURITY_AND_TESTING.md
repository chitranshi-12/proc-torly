# 🛡️ OmniProctor — Test Checklist & Security Architecture Document

## 🧪 Comprehensive Feature Verification Test Checklist

Use this checklist to systematically verify every module and security control of the OmniProctor system.

### Phase 1: Authentication & Exam Provisioning
- [x] **Default Admin Access**:
  - Open `/` in browser, click "Invigilator Sign In" at top right.
  - Click "Fill Default Admin Credentials" (`admin@proctor.edu` / `Admin@12345`).
  - Verify successful authentication and redirection to the Examinations Management Console.
- [x] **Invigilator Registration**:
  - Click "Create new Invigilator account", input new credentials.
  - Verify registration succeeds and receives a valid JWT token.
- [x] **Exam Creation (Manual MCQ Form)**:
  - Click "Create New Proctored Exam".
  - Specify title, duration, start/end window, and max violation threshold (e.g., 4).
  - Add multiple-choice questions with 4 options and mark the correct answer.
  - Submit and verify the exam appears on the exam card grid with its unique 6-character code.
- [x] **Exam Creation (CSV Import)**:
  - Click "CSV Upload" tab.
  - Download template or paste standard CSV (`question,optA,optB,optC,optD,correct,marks`).
  - Verify all rows are parsed and stored in the SQLite database.
- [x] **Exam Creation (Google Form JSON & Embed)**:
  - Verify Google Apps Script snippet copy functionality.
  - Paste Google Form JSON to verify batch question insertion.
  - Alternatively, create an exam with a Google Form URL to test embedded iframe mode.

---

### Phase 2: Candidate Onboarding & Pre-Exam Checklist
- [x] **Candidate Entry**:
  - Navigate to Candidate Portal (`/`).
  - Enter Full Name, Roll Number, and Exam Code `DEMO101` (or click "Fill Demo Exam").
  - Click "Proceed to Pre-Exam Setup & Verification".
- [x] **Consent & DPDP Act 2023 Logging**:
  - Review the 4-point proctoring disclosure (Screen, Camera, Audio, Retention).
  - Confirm checkbox is mandatory to enable the Next button.
  - Verify consent is registered with server ISO timestamp in `exam_sessions`.
- [x] **Camera & Microphone Verification**:
  - Click "Allow Camera & Microphone".
  - Verify live webcam stream renders in `<video>` element.
  - Speak into the microphone and verify the green/cyan audio meter responds dynamically.
- [x] **Facial Reference Photo & Verification**:
  - Click "Capture Facial Reference Photo".
  - TensorFlow COCO-SSD analyzes the frame and confirms "Reference face identity verified. Exactly 1 candidate confirmed."
- [x] **Entire Screen Share Enforcement**:
  - Click "Share Entire Screen".
  - **Negative Test**: Select an individual window or Chrome tab. Verify immediate rejection: *"Security Rejection: You selected a single Application Window or Browser Tab. You MUST select 'Entire Screen'"*.
  - **Positive Test**: Select the "Entire Screen" option. Verify the stream is accepted and previewed.
- [x] **System Diagnostics**:
  - Verify network latency ping test shows round-trip time in milliseconds.
  - Verify single display / multi-monitor check.
- [x] **Waiting Room**:
  - Enter the waiting room.
  - Verify server-synchronized countdown timer until the scheduled commencement.
  - Click "Start Proctored Exam (Enter Fullscreen)" to trigger fullscreen lock and commence the exam.

---

### Phase 3: In-Exam Proctoring & Anti-Tamper Detection
- [x] **Tab Switch & Window Blur Detection**:
  - Press `Alt+Tab` or switch to another browser tab.
  - Return to exam and verify a violation is logged with a timestamped screenshot.
- [x] **Fullscreen Exit**:
  - Press `Esc` to exit fullscreen.
  - Verify violation `FULLSCREEN_EXIT` is reported.
- [x] **Prohibited Shortcuts & Clipboard Defense**:
  - Press `F12`, `Ctrl+Shift+I`, `Ctrl+U`, or `Ctrl+C`.
  - Verify the browser action is cancelled (`preventDefault()`) and `CLIPBOARD_DEVTOOLS` is logged.
  - Right-click on the screen; verify custom context menu is blocked.
- [x] **Phone & Book Detection**:
  - Hold a mobile phone up to the webcam.
  - Verify TensorFlow COCO-SSD detects `cell phone` and triggers `PHONE_DETECTED` (CRITICAL severity).
- [x] **Face Missing / Multiple Faces**:
  - Cover the webcam or step out of frame for > 3 seconds. Verify `FACE_MISSING` triggers.
  - Have a second person enter the webcam view. Verify `MULTIPLE_FACES` triggers.
- [x] **Web Audio Decibel Sampling**:
  - Speak loudly or play background noise (> 62 dB).
  - Verify `LOUD_AUDIO` violation triggers.
- [x] **Cloud Autosave & Resilient Resume**:
  - Answer 2 questions.
  - Wait 10 seconds and notice "Saved at [Time]".
  - Refresh the browser tab.
  - Verify the session state, remaining time, and previously selected answers are restored seamlessly.

---

### Phase 4: Invigilator Live Operations
- [x] **Live Candidate Grid**:
  - Open `http://localhost:3000` in a second incognito browser window as Admin.
  - Navigate to **Examinations -> Live Invigilation**.
  - Verify candidate Alex Rivera appears in the live grid with real-time video and status badge.
- [x] **Real-Time Threat Alerts Feed**:
  - When candidate triggers a violation, verify the alert appears in the right sidebar with an audio chime and screenshot thumbnail.
- [x] **Command Center Interventions**:
  - Click on the student card.
  - **Send Warning**: Transmit a warning message (e.g. *"Please center your face"*). Verify the candidate sees the warning banner on their screen with an Acknowledge button.
  - **Pause Exam**: Click Pause Exam. Verify student screen locks with *"Examination Paused"*. Click Resume to unlock.
  - **Add Time**: Click "+5 Min Extra Time". Verify 300 seconds are added to the candidate's timer.
  - **Terminate Exam**: Click Terminate. Verify candidate is auto-submitted with reason logged.

---

### Phase 5: Reporting, Exports & Data Retention
- [x] **Candidate Completion**:
  - Submit the exam. Verify celebratory confetti, auto-graded score, and proctoring risk index.
- [x] **Audit Reports**:
  - As Admin, open **Audit Reports**.
  - Verify candidate table with Scores, Violations, Risk Score, and Consent Timestamps.
  - Click **Export CSV**; verify `.csv` download.
  - Click **Export Official PDF Report**; verify multi-page official audit document generated via `jsPDF`.
- [x] **Retention Auto-Cleanup**:
  - Click "Retention Cleanup"; verify automated deletion of screenshot files older than retention policy.

---

## 🔐 Security & Statutory Privacy Documentation

### 1. DPDP Act 2023 Statutory Compliance
- **Digital Personal Data Protection (DPDP) Act 2023** compliance principles:
  - **Notice & Explicit Consent**: Candidates are presented with a detailed, unambiguous statement outlining the exact modalities of monitoring before capturing any biometric or screen data.
  - **Cryptographic Audit Trail**: Consent agreements are committed with unalterable ISO 8601 timestamps and hardware fingerprints.
  - **Purpose Limitation**: Data captured is strictly constrained to academic integrity verification.
  - **Automated Data Sanitization**: Recordings and thumbnails are permanently erased once the configurable retention duration expires.

### 2. HTTPS & Media Device Isolation
- In production, modern browsers strictly gate `navigator.mediaDevices.getUserMedia` and `navigator.mediaDevices.getDisplayMedia` behind secure contexts (`https://` or `localhost`).
- Screen share capture specifies `displaySurface: 'monitor'` to prevent partial window isolation attacks.

### 3. Server-Authoritative Integrity
- Timers are authoritative on the server. If a candidate alters local computer clock settings or pauses JavaScript execution, the server calculates remaining duration using `(start_time + duration + added_time) - server_now()`.
- Question grading occurs strictly server-side using the sealed answer key. Correct answers are stripped from all candidate API payloads.
