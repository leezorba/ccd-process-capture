# CCD Process Capture - Complete Documentation

**Version:** 1.1  
**Last Updated:** January 22, 2026  
**Developer:** Hwa Lee (Channel Strategy & Management)  
**Project Owner:** Spencer Arntsen (CCD)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technical Architecture](#2-technical-architecture)
3. [Deployment & Environment](#3-deployment--environment)
4. [Security](#4-security)
5. [Session Management](#5-session-management)
6. [AI System Prompt](#6-ai-system-prompt)
7. [API Reference](#7-api-reference)
8. [Data Structures](#8-data-structures)
9. [Document Generation](#9-document-generation)
10. [Power Automate Integration](#10-power-automate-integration)
11. [UI Features](#11-ui-features)
12. [Recovery Feature](#12-recovery-feature)
13. [Known Issues & Limitations](#13-known-issues--limitations)
14. [Testing Checklist](#14-testing-checklist)
15. [Future Improvements](#15-future-improvements)

---

## 1. Project Overview

### Purpose
AI-guided process documentation tool for Church Communication Department (CCD) employees. Employees have a conversational interview with Gemini AI that guides them through documenting a work process. The conversation generates a professional Word document (.docx) that can be downloaded or submitted to SharePoint with Teams notifications.

### Status
- **Phase:** Beta/PoC (Proof of Concept)
- **Deployed:** Yes - Railway
- **Production URL:** https://ccd-process-capture-production.up.railway.app

### Project Structure
```
ccd-process-capture/
+-- server.js              # Express backend, Gemini integration, Word generation
+-- package.json           # Dependencies and scripts
+-- package-lock.json      # Lock file
+-- .gitignore             # Excludes node_modules, .env
+-- .env.example           # Environment variable template
+-- public/
    +-- index.html         # Complete frontend (HTML + CSS + JS in single file)
    +-- favicon.svg        # Clipboard icon (Church blue #006184)
```

---

## 2. Technical Architecture

### Stack
| Layer | Technology |
|-------|------------|
| Frontend | Single HTML file, vanilla JS, Web Speech API |
| Backend | Node.js + Express |
| AI | Google Gemini 2.5 Flash (@google/generative-ai SDK) |
| Document Generation | docx package |
| Deployment | Railway (auto-deploy from GitHub) |
| Integration | Power Automate -> SharePoint + Teams |

### Data Flow
```
User -> Web UI -> Express API -> Gemini AI
                      |
                      v
              Session Storage (in-memory)
                      |
                      v
              Interview Complete
                      |
          +-----------+-----------+
          |                       |
          v                       v
    Download .docx         Submit to Power Automate
                                  |
                      +-----------+-----------+
                      |                       |
                      v                       v
                SharePoint              Teams Channel
             (save document)           (notification)
```

### Dependencies (package.json)
```json
{
  "express": "^4.18.2",
  "cors": "^2.8.5",
  "@google/generative-ai": "^0.2.0",
  "docx": "^8.2.0",
  "uuid": "^9.0.0",
  "dotenv": "^16.3.1"
}
```

---

## 3. Deployment & Environment

### GitHub Repository
- **Repo:** `leezorba/ccd-process-capture`
- **Branch:** `main`
- **Auto-deploy:** On push to main

### Railway Project
- **Project Name:** `fearless-energy` (auto-generated)
- **URL:** `ccd-process-capture-production.up.railway.app`
- **Port:** 8080 (Railway assigned)

### Environment Variables
| Variable | Description | Example |
|----------|-------------|---------|
| GEMINI_API_KEY | Google AI API key | `AIza...` |
| POWER_AUTOMATE_WEBHOOK_URL | Power Automate HTTP trigger URL | `https://...powerplatform.com/...` |
| BASIC_AUTH_USER | Basic auth username | `ccd` |
| BASIC_AUTH_PASS | Basic auth password | `internaluseonly` |
| WEBHOOK_SECRET | Secret for Power Automate validation | `ccd-proc-cap-x7Km9pL2qR4w` |
| PORT | Server port (optional, Railway sets this) | `3000` |

### Deployment Commands
```bash
git add .
git commit -m "Your commit message"
git push
# Railway auto-deploys on push to main
```

---

## 4. Security

### Layer 1: Basic Authentication
- Browser popup login (no separate login page)
- Protects the entire web application
- Default credentials: `ccd` / `internaluseonly` (configurable via env vars)

### Layer 2: Webhook Secret
- Validates Power Automate requests
- Sent in payload as `webhookSecret` field
- Power Automate Condition step checks value before processing
- Rejects invalid requests with 401

### Security Flow
```
User Request
     |
     v
Basic Auth Check --> 401 if invalid
     |
     v
App Usage (interview, download, etc.)
     |
     v
Submit to SharePoint
     |
     v
Power Automate receives request
     |
     v
Condition: webhookSecret == expected? --> 401 if invalid
     |
     v
Create file in SharePoint
```

---

## 5. Session Management

### Configuration
| Setting | Value | Purpose |
|---------|-------|---------|
| MAX_MESSAGES | 100 | Hard limit per session |
| WARNING_AT | 80 | Yellow warning banner appears |
| FINAL_WARNING_AT | 90 | Red warning, AI wraps up |
| TIMEOUT_MINUTES | 90 | Session expires after inactivity |

### Session Lifecycle
1. **Start:** User enters name + division, clicks "Start Interview"
2. **Active:** Conversation with AI, message counter tracks usage
3. **Warnings:** At 80 messages (yellow), 90 messages (red)
4. **Complete:** AI outputs `[INTERVIEW_COMPLETE]` signal
5. **End Early:** User can end anytime via "End Early" button
6. **Cleanup:** Sessions auto-expire after 90 min inactivity

### UI Warning Elements
- **Message counter:** "98 messages left" in chat info bar
- **Yellow banner:** "20 messages remaining. Consider using 'Save chat' if needed."
- **Red banner:** "10 messages left! Save chat now if you need to continue later."
- **Auto-disable:** Input disabled at limit, auto-triggers End Early flow

### Session Storage
- In-memory Map (resets on server restart)
- Cleanup interval: every 10 minutes
- Production recommendation: Use Redis for persistence

---

## 6. AI System Prompt

### Opening Behavior
- Welcomes user to "CCD Process Capture"
- Offers two paths: describe role OR jump into specific process
- Mentions voice input option, 20-30 minute estimate, 90-min timeout
- Offers to clarify questions

### Interview Flow (one question at a time)
1. **Process Definition:** name, purpose, success criteria
2. **Triggers & Timeline:** what starts it, duration, completion
3. **Critical Steps:** 5-7 steps, decision points, approvals
4. **Roles & Responsibilities:** RACI matrix (Responsible, Accountable, Consulted, Informed)
5. **Tools & Systems:** platforms, templates, checklists
6. **Risks & Continuity:** judgment needed, breakdowns, training gaps
7. **Improvements:** optional pain points and ideas

### Church Acronym Glossary
AI understands these internal terms:
| Acronym | Full Name |
|---------|-----------|
| CCD | Church Communication Department |
| ICS | Information and Communications Services |
| PSD | Publishing Services Department |
| AIWG | AI Working Group |
| PBO | Presiding Bishopric Office |
| WSR | Welfare and Self-Reliance |
| PTH | Priesthood and Family |
| FHD | Family History Department |
| GSD | Global Service Desk |
| OGC | Office of General Counsel |

Unknown terms: AI asks "I'm not familiar with [term] -- could you tell me what that stands for?"

### Guardrails
- Asks for clarification on vague answers
- Stays on topic - redirects off-topic questions
- Generic off-topic: "I'm only set up for process documentation..."
- CCD-related unknown: "Spencer Arntsen at CCD would be the best person to ask..."
- Session limit awareness: AI wraps up when approaching limit

### Completion Flow
1. Shows summary of captured process
2. Asks if anything to add
3. Asks for feedback on the tool
4. Thanks user by name
5. Outputs `[INTERVIEW_COMPLETE]` signal

### Formatting Rules
- Plain text only (no markdown asterisks, bold, headers)
- Uses `--` for dashes, `*` for bullets
- Line breaks preserved with `white-space: pre-wrap` in CSS

---

## 7. API Reference

### GET /api/divisions
Returns list of CCD divisions for dropdown.

**Response:**
```json
[
  "Management & Administration",
  "Media Relations",
  "Content Strategy & Coordination",
  "Enterprise Social Media",
  "Channel Strategy & Management",
  "Area Relations",
  "Government, Community, and Interfaith Relations",
  "Reputation Management & Special Projects",
  "Messaging & Strategic Initiatives",
  "Controller"
]
```

### POST /api/session/start
Starts new interview session.

**Request:**
```json
{
  "employeeName": "Hwa Lee",
  "division": "Channel Strategy & Management"
}
```

**Response:**
```json
{
  "sessionId": "uuid",
  "divisions": [...],
  "limits": {
    "maxMessages": 100,
    "warningAt": 80,
    "finalWarningAt": 90,
    "timeoutMinutes": 90
  }
}
```

### GET /api/session/status/:sessionId
Returns current session status.

**Response:**
```json
{
  "messageCount": 24,
  "remaining": 76,
  "maxMessages": 100,
  "warningAt": 80,
  "finalWarningAt": 90,
  "showWarning": false,
  "showFinalWarning": false,
  "atLimit": false
}
```

### POST /api/chat
Sends message to Gemini AI.

**Request:**
```json
{
  "sessionId": "uuid",
  "message": "User's message"
}
```

**Response:**
```json
{
  "message": "AI response",
  "isComplete": false,
  "sessionId": "uuid",
  "messageCount": 26,
  "remaining": 74,
  "showWarning": false,
  "showFinalWarning": false,
  "forceEnd": false
}
```

### POST /api/extract
Extracts structured data from conversation (called automatically on completion).

**Request:**
```json
{ "sessionId": "uuid" }
```

**Response:**
```json
{
  "success": true,
  "data": { /* processData object */ }
}
```

### POST /api/end-early
Ends interview early and extracts partial data.

**Request:**
```json
{ "sessionId": "uuid" }
```

**Response:**
```json
{
  "success": true,
  "data": { /* partial processData */ },
  "extractionError": "optional error message"
}
```

### POST /api/generate-doc
Generates and downloads Word document.

**Request:**
```json
{ "sessionId": "uuid" }
```

**Response:** Binary .docx file download

### POST /api/download-chat
Downloads chat log as text file.

**Request:**
```json
{ "sessionId": "uuid" }
```

**Response:** Text file download

### POST /api/submit
Submits document to Power Automate webhook.

**Request:**
```json
{ "sessionId": "uuid" }
```

**Response:**
```json
{
  "success": true,
  "filename": "Hwa-Lee_Channel-Strategy-Management_Process-Name_2026-01-22_093045.docx"
}
```

### POST /api/recover-from-chat
Recovers session from uploaded chat log.

**Request:**
```json
{ "chatLog": "CCD Process Capture - Chat Log\n================================\n..." }
```

**Response:**
```json
{
  "success": true,
  "sessionId": "new-uuid",
  "data": { /* extracted processData */ },
  "messageCount": 69
}
```

---

## 8. Data Structures

### Session Object
```javascript
{
  id: "uuid",
  employeeName: "Hwa Lee",
  division: "Channel Strategy & Management",
  messages: [
    { role: "user", content: "..." },
    { role: "assistant", content: "..." }
  ],
  messageCount: 24,
  processData: { /* see below */ },
  createdAt: "2026-01-22T03:15:39.000Z",
  lastActivity: "2026-01-22T03:45:12.000Z",
  status: "active" | "complete" | "ended_early" | "submitted",
  isRecovered: false
}
```

### Process Data Object
```javascript
{
  processName: "AI POC/MVP for CCD Business Use Cases",
  purpose: "To evaluate, propose, and develop AI solutions...",
  successCriteria: "The POC is iterated until it meets expected functionality...",
  trigger: "A CCD employee identifies a business use case...",
  timeline: "Typically takes anywhere from a month to a quarter",
  completion: "A working POC/MVP that addresses the business problem",
  steps: [
    "Meet with the CCD employee to identify business needs",
    "Fill out the AIWG form based on identified needs",
    "Present the proposed AI solution to AIWG for approval",
    "Build the POC/MVP, gather feedback, and iterate",
    "Hand off to ICS Solutions Team for further development"
  ],
  roles: {
    responsible: ["Hwa Lee"],
    accountable: ["The CCD employee (client)"],
    consulted: ["AIWG"],
    informed: ["Client's team", "AIWG"]
  },
  tools: ["Azure", "GCP", "LucidChart", "Readme files", "Microsoft Form"],
  painPoints: ["Approval delays from AIWG and CAC"],
  breakdowns: [
    "Evaluating if business case fits AI solution",
    "Ensuring compliance with Church AI policy",
    "Proceeding without AIWG approval"
  ],
  trainingGaps: ["Coding expertise concentrated in one person"],
  improvements: [],
  summary: "2-3 sentence summary...",
  feedback: "User feedback on the tool or null"
}
```

### CCD Divisions List
1. Management & Administration
2. Media Relations
3. Content Strategy & Coordination
4. Enterprise Social Media
5. Channel Strategy & Management
6. Area Relations
7. Government, Community, and Interfaith Relations
8. Reputation Management & Special Projects
9. Messaging & Strategic Initiatives
10. Controller
11. Other (custom text input)

---

## 9. Document Generation

### Filename Format
```
{DRAFT_}{EmployeeName}_{Division}_{ProcessName}_{Date}_{Time}.docx
```

**Example:** `Hwa-Lee_Channel-Strategy-Management_AI-POC-MVP-for-CCD-Business-Use-Cases_2026-01-22_093045.docx`

**Rules:**
- Employee name first (max 20 chars)
- Division second (max 30 chars)
- Process name third (max 40 chars)
- Non-alphanumeric chars replaced with dashes
- Multiple dashes collapsed to single dash
- Leading/trailing dashes removed
- DRAFT_ prefix for ended-early sessions
- Timestamp prevents overwrites

### Document Sections
1. **Header:** Employee name, division, date
2. **Process Name**
3. **Purpose (Job Statement)**
4. **Success Criteria**
5. **Primary Participants (RACI Matrix)** - 5-column table
6. **Tools & Channels** - Bullet list
7. **Critical Steps** - Numbered list
8. **Timeline** - Trigger, duration, completion
9. **Pain Points**
10. **Common Breakdowns**
11. **Training Gaps**
12. **Improvement Ideas**
13. **Summary** - Gray background
14. **User Feedback** - Yellow background (if provided)

### Draft Document Marking
- Yellow warning banner: "[!] DRAFT - Interview ended early. This document may be incomplete."
- Title: "DRAFT - Process Summary Card (Incomplete)"
- Filename prefixed with `DRAFT_`

---

## 10. Power Automate Integration

### Flow Name
`Process Capture - New Entry`

### Trigger Configuration
- **Type:** When HTTP request is received (POST)
- **Who can trigger:** Anyone (security via webhookSecret)

### Trigger Schema
```json
{
  "type": "object",
  "properties": {
    "webhookSecret": { "type": "string" },
    "sessionId": { "type": "string" },
    "employeeName": { "type": "string" },
    "division": { "type": "string" },
    "processName": { "type": "string" },
    "summary": { "type": "string" },
    "filename": { "type": "string" },
    "documentBase64": { "type": "string" },
    "submittedAt": { "type": "string" },
    "isDraft": { "type": "boolean" }
  }
}
```

### Flow Structure
```
manual (HTTP trigger)
     |
     v
Condition: webhookSecret == "ccd-proc-cap-x7Km9pL2qR4w"
     |
     +-- If yes:
     |        |
     |        v
     |   Create_file (SharePoint)
     |        |
     |        v
     |   Post_message (Teams)
     |        |
     |        v
     |   Response (200, {"success": true})
     |
     +-- If no:
              |
              v
          Response (401, {"error": "Unauthorized"})
```

### SharePoint Action
- **Site:** `https://churchofjesuschrist.sharepoint.com/sites/CCDProcessCapture`
- **Folder:** `/Shared Documents/Process Docs`
- **Filename:** `@{triggerBody()?['filename']}`
- **Content:** `@{base64ToBinary(triggerBody()?['documentBase64'])}`

### Teams Message Format (HTML)
```html
<p>
  ðŸ“‹ New Process: @{triggerBody()?['processName']}<br>
  ðŸ‘¤ Employee: @{triggerBody()?['employeeName']}<br>
  ðŸ¢ Division: @{triggerBody()?['division']}<br>
  <br>
  Summary: @{triggerBody()?['summary']}<br>
  ðŸ“Ž <a href="https://churchofjesuschrist.sharepoint.com/sites/CCDProcessCapture/Shared%20Documents/Process%20Docs/@{triggerBody()?['filename']}">View document</a>
</p>
```

### Response Actions
- **Success (If yes):** Status 200, Body `{"success": true}`
- **Unauthorized (If no):** Status 401, Body `{"error": "Unauthorized"}`

---

## 11. UI Features

### Setup Screen
- Name input field
- Division dropdown (with "Other" option + custom text field)
- "Start Interview" button (disabled until form complete)
- "Recover from saved chat log" link (shows spinner while processing)

### Chat Screen
- **Header:** "CCD Process Capture (Beta/PoC)" with clipboard icon, "End Early" button
- **Info bar:** Employee name, division, "Save chat" link, message counter
- **Warning banners:** Yellow (80+ messages), Red (90+ messages)
- **Message area:** User (blue, right), Assistant (gray, left), System (green, center)
- **Input area:** Text input (auto-grows), voice button, send button
- **Footer:** "Got questions? Contact Spencer at CCD"

### Complete Screen
- **Green checkmark** (or orange for draft)
- **Title:** "Interview Complete" or "Draft Saved"
- **Summary text**
- **Buttons:** Download Chat Log, Download Document, Submit to SharePoint
- **Status message** (success/error/loading)
- **Start New Interview** button

### Design System
- **Primary color:** Church Blue #006184
- **Dark variant:** #004d69
- **Light variant:** #e6f3f7
- **Gray:** #63666a
- **Success:** #2e7d32
- **Error:** #c62828
- **Warning:** #f57c00
- Mobile responsive
- System font stack

### Voice Input (Web Speech API)
- Uses `webkitSpeechRecognition` (Chrome)
- Continuous mode with interim results
- Language: en-US
- Shows interim transcript in placeholder
- Red button + "Listening..." when active
- **Note:** May not work behind VPN (uses Google cloud)

### Browser Leave Warning
- Warning appears when user tries to close, refresh, or navigate away during active session
- Only active during interview (not on setup or complete screens)
- Message: "You have an interview in progress. Are you sure you want to leave?"

### Modals
**End Early Modal:**
- Title: "End Interview Early?"
- Explains chat log will auto-download for recovery
- Buttons: "Cancel", "Download Chat & End"

**Recovery Choice Modal:**
- Title: "Session Recovered"
- Shows message count recovered
- Buttons: "Continue Interview" (primary), "Generate Document" (secondary)

---

## 12. Recovery Feature

### Purpose
Allows users to recover from a saved chat log if:
- Session expired
- Browser closed accidentally
- Server restarted
- User wants to continue later

### How It Works
1. User downloads chat log during or after interview ("Save chat" or "Download Chat Log")
2. Later, user clicks "Recover from saved chat log" on setup screen
3. Uploads the .txt file (shows loading spinner while processing)
4. System parses messages and extracts structured data
5. **Recovery Choice Modal** appears with two options:
   - **Continue Interview**: Loads messages into chat UI, Gemini auto-summarizes where you left off
   - **Generate Document**: Goes directly to complete screen for download/submit

### Recovery Continuation Flow
```
Upload chat log
       |
       v
Loading spinner ("Recovering...")
       |
       v
Recovery Modal appears
"Recovered X messages"
       |
   +---+---+
   |       |
   v       v
Continue  Generate
Interview Document
   |       |
   v       v
Chat UI   Complete
(resume)  Screen
```

When continuing:
- All recovered messages display in chat
- Green system banner: "[Recovered X messages from saved chat log]"
- Gemini automatically summarizes where you left off and asks how to proceed
- User can continue conversation normally
- Message counter reflects recovered + new messages

### End Early with Auto-Download
When user clicks "End Early":
1. Confirmation modal explains chat log will auto-download
2. User clicks "Download Chat & End"
3. Chat log (.txt) downloads automatically as backup
4. Draft document extraction proceeds
5. Complete screen shows download/submit options

This ensures users always have recovery option even if they forget to save.

### Chat Log Format
```
CCD Process Capture - Chat Log
================================
Employee: Hwa Lee
Division: Channel Strategy & Management
Date: 1/22/2026, 2:20:09 AM
================================

[You]
Hi, I'm Hwa Lee from Channel Strategy & Management...

[Assistant]
Welcome to CCD Process Capture...

================================
Total messages: 69
```

### Extraction Schema
Recovery uses the same extraction schema as normal completion:
- processName, purpose, successCriteria
- trigger, timeline, completion
- steps (array of strings)
- roles (RACI structure)
- tools, painPoints, breakdowns, trainingGaps, improvements
- summary, feedback

### Validation
- File must be .txt
- Must contain "CCD Process Capture - Chat Log"
- Must contain [You] and [Assistant] markers
- Max size: 500KB
- Warns if > 200 messages

---

## 13. Known Issues & Limitations

### Current Limitations
| Issue | Description | Workaround |
|-------|-------------|------------|
| Voice input | May not work behind VPN (Chrome Web Speech API uses Google cloud) | Use text input |
| Session storage | In-memory only; resets on server restart | Use "Save chat" for backup |
| No auth audit | No logging of who accesses the tool | Future enhancement |
| Top bar static | Employee/division don't update live if corrected | Final doc uses extracted data |

### Technical Debt
- Sessions stored in-memory (should use Redis for production scale)
- No user authentication beyond basic auth (all users share same credentials)
- No rate limiting beyond session message limits

---

## 14. Testing Checklist

### Setup & Auth
- [ ] Basic auth popup appears on first visit
- [ ] Invalid credentials rejected
- [ ] Session starts with correct division dropdown
- [ ] "Other" division shows custom text input

### Interview Flow
- [ ] AI responds appropriately to user messages
- [ ] Message counter updates after each exchange
- [ ] Yellow warning appears at 80 messages
- [ ] Red warning appears at 90 messages
- [ ] AI wraps up when approaching limit
- [ ] End Early button shows confirmation modal
- [ ] Voice input works (when not behind VPN)

### Document Generation
- [ ] Download Document creates valid .docx
- [ ] Filename includes employee name, division, process, timestamp
- [ ] Draft documents marked appropriately
- [ ] All sections populated from interview data
- [ ] RACI table renders correctly

### SharePoint Integration
- [ ] Submit creates file in SharePoint
- [ ] Teams notification posts with correct info
- [ ] SharePoint link in Teams message is clickable
- [ ] Invalid webhook secret returns 401
- [ ] Success message shows correct filename

### Recovery
- [ ] "Save chat" downloads .txt during interview
- [ ] "Download Chat Log" works on complete screen
- [ ] Recovery shows loading spinner while processing
- [ ] Recovery modal appears with two options
- [ ] "Continue Interview" loads messages into chat UI
- [ ] "Continue Interview" shows Gemini summary of where you left off
- [ ] "Generate Document" goes to complete screen
- [ ] Recovered session message counter is accurate
- [ ] End Early auto-downloads chat log before extracting
- [ ] End Early modal text explains auto-download

### Edge Cases
- [ ] Browser warns before leaving during interview
- [ ] Session timeout after 90 min inactivity
- [ ] Mobile view truncates long division names
- [ ] Special characters in names/titles handled correctly

---

## 15. Future Improvements

### Phase 2 Candidates
1. **Redis sessions** - Persist sessions across server restarts
2. **User authentication** - Individual login with audit trail
3. **Analytics dashboard** - Track usage, completion rates, common processes
4. **Template library** - Pre-fill common process patterns
5. **Multi-language** - Support for non-English interviews
6. **Batch export** - Admin can download all submitted documents

### Technical Improvements
- Add rate limiting middleware
- Implement proper logging (Winston or similar)
- Add health check endpoint
- Set up monitoring/alerting
- Add automated tests

### Recently Completed (v1.1)
- **Recovery continuation** - Users can choose "Continue Interview" or "Generate Document" after recovery
- **Auto-download on End Early** - Chat log downloads automatically when ending early for recovery safety
- **Gemini session summary** - AI summarizes where you left off when continuing recovered session
- **Loading spinner** - Visual feedback during recovery processing

---

## Contact

- **Project Owner:** Spencer Arntsen (CCD)
- **Developer:** Hwa Lee (Channel Strategy & Management)
- **Tool Questions:** Spencer at CCD

---

*Documentation generated: January 22, 2026*