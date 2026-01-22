# CCD Process Capture

AI-guided process documentation tool for Church Communication Department employees. Conducts conversational interviews to capture work processes and generates professional Word documents.

**Status:** Beta/PoC  
**Production URL:** https://ccd-process-capture-production.up.railway.app  
**Auth:** `ccd` / `internaluseonly`

## Features

- Conversational AI interview (Gemini 2.5 Flash)
- Voice input (Web Speech API)
- Word document generation with RACI matrix
- SharePoint submission via Power Automate
- Teams notifications
- Session recovery from chat logs
- 100 message limit with warnings

## Quick Start

### 1. Deploy to Railway

```bash
# Connect GitHub repo to Railway, or use CLI:
railway login
railway init
railway up
```

### 2. Set Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google AI Studio API key |
| `POWER_AUTOMATE_WEBHOOK_URL` | Power Automate HTTP trigger URL |
| `BASIC_AUTH_USER` | Basic auth username (default: `ccd`) |
| `BASIC_AUTH_PASS` | Basic auth password (default: `internaluseonly`) |
| `WEBHOOK_SECRET` | Secret for Power Automate validation |

### 3. Create Power Automate Flow

See `CCD-Process-Capture-Documentation.md` Section 10 for full setup.

**Flow structure:**
```
HTTP Trigger -> Condition (check webhookSecret) -> Create SharePoint file -> Post Teams message -> Response
```

## Local Development

```bash
npm install
cp .env.example .env
# Edit .env with your GEMINI_API_KEY
npm run dev
# Open http://localhost:3000
```

## Architecture

```
User (Browser)
     |
     v
Railway (Node.js + Express)
     |
     +---> Gemini 2.5 Flash (Google AI)
     |
     +---> Power Automate
               |
               +---> Condition: webhookSecret valid?
               |          |
               |     +----+----+
               |     |         |
               |    Yes        No
               |     |         |
               |     v         v
               +---> SharePoint   401 Response
               |     (save .docx)
               |
               +---> Teams
                     (notification)
```

## File Structure

```
ccd-process-capture/
+-- server.js                              # Express backend, Gemini, Word generation
+-- package.json                           # Dependencies
+-- public/
|   +-- index.html                         # Frontend (HTML + CSS + JS)
|   +-- favicon.svg                        # Clipboard icon
+-- CCD-Process-Capture-Documentation.md   # Full documentation
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/divisions` | CCD divisions list |
| POST | `/api/session/start` | Start interview |
| POST | `/api/chat` | Send message to AI |
| POST | `/api/extract` | Extract structured data |
| POST | `/api/end-early` | End interview early |
| POST | `/api/generate-doc` | Download Word document |
| POST | `/api/download-chat` | Download chat log |
| POST | `/api/submit` | Submit to SharePoint |
| POST | `/api/recover-from-chat` | Recover from chat log |

## Session Limits

| Setting | Value |
|---------|-------|
| Max messages | 100 |
| Warning at | 80 |
| Final warning | 90 |
| Timeout | 90 minutes |

## Known Limitations

- Voice input may not work behind VPN (uses Google cloud)
- Sessions in-memory only (reset on server restart)
- Use "Save chat" for backup

## Documentation

See `CCD-Process-Capture-Documentation.md` for:
- Full API reference with request/response examples
- Data structures and schemas
- Power Automate setup with webhook security
- UI features and design system
- Testing checklist
- Future improvements

## Contact

- **Project Owner:** Spencer Arntsen (CCD)
- **Developer:** Hwa Lee (Channel Strategy & Management)