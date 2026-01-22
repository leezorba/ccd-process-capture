# CCD Process Capture

AI-guided process documentation for the Church Communication Department.

## Quick Start

### 1. Deploy to Railway

```bash
# Push to GitHub repo, then connect to Railway
# Or use Railway CLI:
railway login
railway init
railway up
```

### 2. Set Environment Variables in Railway

- `GEMINI_API_KEY`: Your Google AI Studio API key (from aistudio.google.com)
- `POWER_AUTOMATE_WEBHOOK_URL`: (from Power Automate HTTP trigger)

### 3. Create Power Automate Flow

See `power-automate-flow.md` for setup instructions.

## Local Development

```bash
# Install dependencies
npm install

# Set up .env
cp .env.example .env
# Edit .env with your GEMINI_API_KEY

# Run
npm run dev
```

## Architecture

```
User (Browser)
    |
    v
Railway Web App (Node.js + Express)
    |
    +---> Gemini 2.5 Flash (Google AI) - Interview AI
    |
    +---> Power Automate (HTTP trigger)
              |
              +---> SharePoint (Word doc storage)
              |
              +---> Teams (Notification)
              |
              +---> M365 Copilot (Chat with docs)
```

## File Structure

```
process-capture/
+-- server.js         # Express server + Gemini integration
+-- public/
|   +-- index.html    # Chat UI with voice input
+-- package.json
+-- Dockerfile
+-- .env.example
```
