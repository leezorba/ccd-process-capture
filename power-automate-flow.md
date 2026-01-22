# Power Automate Flow Setup

## Flow Name: Process Capture - New Entry

### Trigger: When a HTTP request is received

**Method:** POST

**Request Body JSON Schema:**
```json
{
  "type": "object",
  "properties": {
    "sessionId": { "type": "string" },
    "employeeName": { "type": "string" },
    "division": { "type": "string" },
    "processName": { "type": "string" },
    "summary": { "type": "string" },
    "filename": { "type": "string" },
    "documentBase64": { "type": "string" },
    "submittedAt": { "type": "string" }
  }
}
```

### Action 1: Create file (SharePoint)

- **Site Address:** https://churchofjesuschrist.sharepoint.com/sites/CCDProcessCapture
- **Folder Path:** /Shared Documents/Process Docs
- **File Name:** `@{triggerBody()?['filename']}`
- **File Content:** `@{base64ToBinary(triggerBody()?['documentBase64'])}`

### Action 2: Post adaptive card in a chat or channel (Teams)

- **Post as:** Flow bot
- **Post in:** Channel
- **Team:** CCD Process Capture
- **Channel:** New Process Entry

**Adaptive Card JSON:**
```json
{
  "type": "AdaptiveCard",
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "version": "1.4",
  "body": [
    {
      "type": "TextBlock",
      "text": "📋 New Process Documented",
      "weight": "Bolder",
      "size": "Large"
    },
    {
      "type": "FactSet",
      "facts": [
        {
          "title": "Employee",
          "value": "@{triggerBody()?['employeeName']}"
        },
        {
          "title": "Division",
          "value": "@{triggerBody()?['division']}"
        },
        {
          "title": "Process",
          "value": "@{triggerBody()?['processName']}"
        },
        {
          "title": "Submitted",
          "value": "@{formatDateTime(triggerBody()?['submittedAt'], 'MMM d, yyyy h:mm tt')}"
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "Summary",
      "weight": "Bolder",
      "spacing": "Medium"
    },
    {
      "type": "TextBlock",
      "text": "@{triggerBody()?['summary']}",
      "wrap": true
    }
  ],
  "actions": [
    {
      "type": "Action.OpenUrl",
      "title": "View in SharePoint",
      "url": "https://churchofjesuschrist.sharepoint.com/sites/CCDProcessCapture/Shared%20Documents/Process%20Docs"
    }
  ]
}
```

### Action 3: Respond to HTTP request

- **Status Code:** 200
- **Body:** `{"success": true}`

---

## Folder Setup in SharePoint

1. Go to: https://churchofjesuschrist.sharepoint.com/sites/CCDProcessCapture
2. Navigate to Documents (Shared Documents)
3. Create folder: `Process Docs`

---

## Getting the HTTP Trigger URL

After saving the flow:
1. Click on the HTTP trigger step
2. Copy the "HTTP POST URL"
3. Add this to Railway as `POWER_AUTOMATE_WEBHOOK_URL`
