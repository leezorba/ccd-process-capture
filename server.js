const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  BorderStyle,
  WidthType,
  ShadingType,
  AlignmentType,
  LevelFormat,
} = require("docx");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
require("dotenv").config();

const app = express();

// ============================================
// BASIC AUTH MIDDLEWARE
// ============================================
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || "ccd";
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS || "internaluseonly";

const basicAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="CCD Process Capture"');
    return res.status(401).send("Authentication required");
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString("utf8");
  const [username, password] = credentials.split(":");

  if (username === BASIC_AUTH_USER && password === BASIC_AUTH_PASS) {
    next();
  } else {
    res.setHeader("WWW-Authenticate", 'Basic realm="CCD Process Capture"');
    return res.status(401).send("Invalid credentials");
  }
};

// Apply basic auth to all routes
app.use(basicAuth);

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

// ============================================
// SESSION CONFIGURATION
// ============================================
const SESSION_CONFIG = {
  MAX_MESSAGES: 100, // Hard limit
  WARNING_AT: 80, // First warning
  FINAL_WARNING_AT: 90, // "10 left, wrap up"
  TIMEOUT_MINUTES: 90, // Session expires after 90 min of inactivity
};

// Store active sessions in memory (for MVP - use Redis in production)
const sessions = new Map();

// Session cleanup interval (every 10 minutes)
setInterval(
  () => {
    const now = Date.now();
    const timeoutMs = SESSION_CONFIG.TIMEOUT_MINUTES * 60 * 1000;

    for (const [sessionId, session] of sessions.entries()) {
      const lastActivity = new Date(
        session.lastActivity || session.createdAt,
      ).getTime();
      if (now - lastActivity > timeoutMs) {
        console.log(`Session ${sessionId} expired due to inactivity`);
        sessions.delete(sessionId);
      }
    }
  },
  10 * 60 * 1000,
); // Run every 10 minutes

// Google AI setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// CCD Divisions for selection
const CCD_DIVISIONS = [
  "Management & Administration",
  "Media Relations",
  "Content Strategy & Coordination",
  "Enterprise Social Media",
  "Channel Strategy & Management",
  "Area Relations",
  "Government, Community, and Interfaith Relations",
  "Reputation Management & Special Projects",
  "Messaging & Strategic Initiatives",
  "Controller",
];

// System prompt
const SYSTEM_PROMPT = `You are a Process Documentation Assistant for the Church Communication Department (CCD). Your ONLY purpose is to help CCD employees document their work processes.

# Church Acronym Glossary
Know these common Church organization acronyms:
- CCD: Church Communication Department
- ICS: Information and Communications Services
- PSD: Publishing Services Department
- AIWG: AI Working Group
- PBO: Presiding Bishopric Office
- WSR: Welfare and Self-Reliance
- PTH: Priesthood and Family
- FHD: Family History Department
- GSD: Global Service Desk
- OGC: Office of General Counsel

If an employee uses an acronym or term you don't recognize, ask them to clarify: "I'm not familiar with [term] — could you tell me what that stands for?"

# Handling Name or Division Corrections
If an employee corrects their name or division during the conversation:
- Acknowledge the correction warmly: "Got it, thanks for clarifying!"
- Use their corrected name going forward
- If they mention a division name that's close to a valid one (e.g., "Channels" for "Channel Strategy & Management"), confirm: "Just to confirm — is that Channel Strategy & Management?"
- If they ask "what is my division" or similar, remind them what they stated earlier in the conversation

# Opening Message
When someone introduces themselves, respond warmly:

"Welcome to CCD Process Capture! I'm here to help document your work so others can learn from your expertise — and so we can work better as a team.

This interview typically takes 20-30 minutes. Your session will expire after 90 minutes of inactivity, but you can save your progress at any time using the End Early button if needed.

We can approach this two ways:

1. Start with your role — Tell me about your job overall, and I'll help identify what's worth documenting
2. Jump into a specific process — If you already have a workflow, project, or product in mind

Which would you prefer?

(Tip: You can use the microphone button to speak instead of typing. And if any of my questions are unclear, just ask — I'm happy to clarify!)"

Note: Do NOT use markdown formatting (no asterisks, no bold, no headers). Just use plain text with line breaks.

# Your Goal
Document ONE process so clearly that a colleague could execute it tomorrow using only this documentation.

# Interview Flow
Guide the conversation through these areas, asking ONE question at a time. Don't rush — get quality answers before moving on.

**1. Process Definition**
- What is the name of this process? (Use a clear, action-oriented title like "Publishing a Social Media Post" or "Responding to a Media Inquiry")
- Why does this process exist? What's its purpose or job statement?
- What does success look like? How do we know it was done correctly?

**2. Triggers & Timeline**
- What initiates or triggers this process?
- How long does it typically take from start to finish?
- What happens when it's complete? What's the output or deliverable?

**3. Critical Steps**
- Walk me through the 5-7 essential steps in order
- Are there any decision points where you have to choose a path?
- Are there any approvals or handoffs required?

**4. Roles & Responsibilities (RACI)**
- Who is Responsible (does the actual work)?
- Who is Accountable (owns the outcome)?
- Who needs to be Consulted (provides input)?
- Who needs to be Informed (kept in the loop)?

**5. Tools & Systems**
- What tools or systems are used? (SharePoint, Teams, Jira, Workfront, etc.)
- Are there any templates, checklists, or reference documents?

**6. Risks & Continuity**
- Where is judgment or experience especially needed?
- What are common breakdowns or things that can go wrong?
- What happens if you're out — could someone else pick this up?
- Are there any training gaps or tribal knowledge concerns?

**7. Improvements (Optional)**
- Are there any pain points or inefficiencies you've noticed?
- Any quick wins or ideas for improvement?

# Conversation Guidelines
- Be warm, professional, and encouraging
- Ask ONE question at a time — don't overwhelm
- If an answer is vague or incomplete, gently ask for more detail: "Could you tell me a bit more about that step?" or "What specifically happens there?"
- Acknowledge their expertise: "That makes sense" / "Great detail, thanks!"
- Redirect rambling gently: "That's helpful context — let's focus on the specific steps. What happens next?"
- Aim for 20-30 minutes of content

# Stay On Topic
- ONLY discuss process documentation for CCD work
- Do NOT answer general knowledge questions, trivia, coding help, or unrelated requests

For OFF-TOPIC requests (trivia, general questions, unrelated tasks):
→ Say: "I'm only set up to help with process documentation. Want to get back to capturing your workflow?"

For CCD-RELATED questions you can't answer (policies, org structure, who to contact, etc.):
→ Say: "That's a great question, but I'm not sure about that one. Spencer Arntsen at CCD would be the best person to ask. Ready to continue with your process?"

# Wrapping Up
When you've covered the key areas and have enough detail:

1. Say: "I think we've captured everything we need! Here's a quick summary of what we documented:" then provide a brief recap (process name, purpose, key steps, who's involved).
2. Ask: "Does that look right? Anything you'd like to add or change?"
3. Once they confirm, ask: "Before we finish — do you have any feedback or comments? Could be suggestions for this tool, notes for your team, or anything else."
4. After they respond (or say no), thank them by name:

"Thanks so much for taking the time to document this, [Name]! Your knowledge helps the whole CCD team."

Then output EXACTLY:
[INTERVIEW_COMPLETE]
Process: {process name}
Summary: {2-3 sentence summary}
Feedback: {any feedback they provided, or "None provided"}

This signals the system to generate the final document.

# Formatting Rule
IMPORTANT: Do NOT use any markdown formatting in your responses. No asterisks for bold, no headers with #, no bullet points with *. Use plain text only with numbered lists (1. 2. 3.) and line breaks for readability.`;

// Initialize a new session
app.post("/api/session/start", (req, res) => {
  const sessionId = uuidv4();
  const { employeeName, division } = req.body;

  sessions.set(sessionId, {
    id: sessionId,
    employeeName: employeeName || null,
    division: division || null,
    messages: [],
    messageCount: 0, // Track message count for limits
    processData: {
      processName: null,
      purpose: null,
      successCriteria: null,
      trigger: null,
      timeline: null,
      completion: null,
      steps: [],
      roles: { responsible: [], accountable: [], consulted: [], informed: [] },
      tools: [],
      painPoints: [],
      breakdowns: [],
      trainingGaps: [],
      improvements: [],
    },
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    status: "active",
  });

  res.json({
    sessionId,
    divisions: CCD_DIVISIONS,
    limits: {
      maxMessages: SESSION_CONFIG.MAX_MESSAGES,
      warningAt: SESSION_CONFIG.WARNING_AT,
      finalWarningAt: SESSION_CONFIG.FINAL_WARNING_AT,
      timeoutMinutes: SESSION_CONFIG.TIMEOUT_MINUTES,
    },
  });
});

// Get session status (message count, limits)
app.get("/api/session/status/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: "Session not found or expired" });
  }

  const messageCount = session.messageCount || 0;
  const remaining = SESSION_CONFIG.MAX_MESSAGES - messageCount;

  res.json({
    messageCount,
    remaining,
    maxMessages: SESSION_CONFIG.MAX_MESSAGES,
    warningAt: SESSION_CONFIG.WARNING_AT,
    finalWarningAt: SESSION_CONFIG.FINAL_WARNING_AT,
    showWarning:
      messageCount >= SESSION_CONFIG.WARNING_AT &&
      messageCount < SESSION_CONFIG.FINAL_WARNING_AT,
    showFinalWarning: messageCount >= SESSION_CONFIG.FINAL_WARNING_AT,
    atLimit: messageCount >= SESSION_CONFIG.MAX_MESSAGES,
  });
});

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  const { sessionId, message } = req.body;

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found or expired" });
  }

  // Update last activity
  session.lastActivity = new Date().toISOString();

  // Check if at message limit
  if (session.messageCount >= SESSION_CONFIG.MAX_MESSAGES) {
    return res.json({
      message:
        "We've reached the session limit. Let me help you wrap up and save what we've captured so far.",
      isComplete: false,
      forceEnd: true,
      sessionId,
      messageCount: session.messageCount,
      remaining: 0,
    });
  }

  // Add user message to history
  session.messages.push({ role: "user", content: message });
  session.messageCount = (session.messageCount || 0) + 1;

  try {
    // Build conversation history for Gemini
    const history = session.messages.slice(0, -1).map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

    // Add context about employee if known
    let systemPrompt = SYSTEM_PROMPT;
    if (session.employeeName && session.division) {
      systemPrompt += `\n\n[Context: Speaking with ${session.employeeName} from ${session.division}]`;
    }

    // Add message limit context if approaching limit
    const remaining = SESSION_CONFIG.MAX_MESSAGES - session.messageCount;
    if (remaining <= 5 && remaining > 0) {
      systemPrompt += `\n\n[IMPORTANT: Only ${remaining} messages remaining in this session. Start wrapping up the interview and move toward completion.]`;
    }

    const chat = model.startChat({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      history: history,
    });

    const result = await chat.sendMessage(message);
    const assistantMessage = result.response.text();

    // Add assistant message to history
    session.messages.push({ role: "assistant", content: assistantMessage });
    session.messageCount = (session.messageCount || 0) + 1;

    // Check if interview is complete
    const isComplete = assistantMessage.includes("[INTERVIEW_COMPLETE]");

    if (isComplete) {
      session.status = "complete";
      // Extract the summary (text after [INTERVIEW_COMPLETE])
      const summary =
        assistantMessage.split("[INTERVIEW_COMPLETE]")[1]?.trim() || "";
      session.processData.summary = summary;
    }

    // Calculate warning states
    const messageCount = session.messageCount;
    const messagesRemaining = SESSION_CONFIG.MAX_MESSAGES - messageCount;

    res.json({
      message: assistantMessage.replace("[INTERVIEW_COMPLETE]", "").trim(),
      isComplete,
      sessionId,
      messageCount,
      remaining: messagesRemaining,
      showWarning:
        messageCount >= SESSION_CONFIG.WARNING_AT &&
        messageCount < SESSION_CONFIG.FINAL_WARNING_AT,
      showFinalWarning: messageCount >= SESSION_CONFIG.FINAL_WARNING_AT,
      forceEnd: false,
    });
  } catch (error) {
    console.error("Chat error:", error);
    res
      .status(500)
      .json({ error: "Failed to process message", details: error.message });
  }
});

// End interview early
app.post("/api/end-early", async (req, res) => {
  const { sessionId } = req.body;

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  // Mark as ended early
  session.status = "ended_early";
  session.processData.endedEarly = true;

  // If we have any conversation, try to extract what we can
  if (session.messages.length > 2) {
    try {
      const conversationText = session.messages
        .map(
          (m) =>
            `${m.role === "user" ? "Employee" : "Assistant"}: ${m.content}`,
        )
        .join("\n\n");

      const extractionPrompt = `Analyze this PARTIAL process documentation interview and extract whatever structured data is available.
This interview was ended early, so some fields may be incomplete or missing.

CONVERSATION:
${conversationText}

VALID DIVISIONS (use exact match or "Other" if not matching):
- Management & Administration
- Media Relations
- Content Strategy & Coordination
- Enterprise Social Media
- Channel Strategy & Management
- Area Relations
- Government, Community, and Interfaith Relations
- Reputation Management & Special Projects
- Messaging & Strategic Initiatives
- Controller

Extract the following information as JSON. Use null for any fields not discussed:

{
  "employeeName": "string",
  "division": "string - MUST be one of the valid divisions above, or 'Other: [what they said]' if no match",
  "processName": "string - clear action-oriented title, or 'Untitled Process' if not discussed",
  "purpose": "string - why this process exists",
  "successCriteria": "string - what 'done' looks like",
  "trigger": "string - what initiates this process",
  "timeline": "string - how long it typically takes",
  "completion": "string - what happens when complete",
  "steps": ["array of critical steps in order"],
  "roles": {
    "responsible": ["who does the work"],
    "accountable": ["who owns the outcome"],
    "consulted": ["who provides input"],
    "informed": ["who receives updates"]
  },
  "tools": ["systems/platforms used"],
  "painPoints": ["frustrating or time-consuming aspects"],
  "breakdowns": ["common failure modes"],
  "trainingGaps": ["areas needing more training"],
  "improvements": ["suggested improvements"],
  "summary": "2-3 sentence summary of what was captured (note if incomplete)",
  "feedback": null
}

Return ONLY valid JSON, no markdown or explanation.`;

      const result = await model.generateContent(extractionPrompt);
      let jsonText = result.response.text();

      // Clean up any markdown formatting
      jsonText = jsonText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const extractedData = JSON.parse(jsonText);

      // Merge with session data
      session.processData = { ...session.processData, ...extractedData };
      session.employeeName = extractedData.employeeName || session.employeeName;
      session.division = extractedData.division || session.division;

      res.json({ success: true, data: session.processData });
    } catch (error) {
      console.error("Early extraction error:", error);
      // Even if extraction fails, return success so they can still download
      res.json({
        success: true,
        data: session.processData,
        extractionError:
          "Partial data extraction failed, but you can still download what was captured.",
      });
    }
  } else {
    res.json({
      success: true,
      data: session.processData,
      note: "Not enough conversation data to extract. Document will be mostly empty.",
    });
  }
});

// Extract structured data from conversation using AI
app.post("/api/extract", async (req, res) => {
  const { sessionId } = req.body;

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const conversationText = session.messages
    .map((m) => `${m.role === "user" ? "Employee" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const extractionPrompt = `Analyze this process documentation interview and extract structured data.

CONVERSATION:
${conversationText}

VALID DIVISIONS (use exact match or "Other" if not matching):
- Management & Administration
- Media Relations
- Content Strategy & Coordination
- Enterprise Social Media
- Channel Strategy & Management
- Area Relations
- Government, Community, and Interfaith Relations
- Reputation Management & Special Projects
- Messaging & Strategic Initiatives
- Controller

Extract the following information as JSON. Use null for any fields not discussed:

{
  "employeeName": "string",
  "division": "string - MUST be one of the valid divisions above, or 'Other: [what they said]' if no match", 
  "processName": "string - clear action-oriented title",
  "purpose": "string - why this process exists",
  "successCriteria": "string - what 'done' looks like",
  "trigger": "string - what initiates this process",
  "timeline": "string - how long it typically takes",
  "completion": "string - what happens when complete",
  "steps": ["array of critical steps in order"],
  "roles": {
    "responsible": ["who does the work"],
    "accountable": ["who owns the outcome"],
    "consulted": ["who provides input"],
    "informed": ["who receives updates"]
  },
  "tools": ["systems/platforms used"],
  "painPoints": ["frustrating or time-consuming aspects"],
  "breakdowns": ["common failure modes"],
  "trainingGaps": ["areas needing more training"],
  "improvements": ["suggested improvements"],
  "summary": "2-3 sentence summary of the entire process",
  "feedback": "any feedback the user provided about this tool or experience, or null if none"
}

Return ONLY valid JSON, no markdown or explanation.`;

  try {
    const result = await model.generateContent(extractionPrompt);
    let jsonText = result.response.text();

    // Clean up any markdown formatting
    jsonText = jsonText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const extractedData = JSON.parse(jsonText);

    // Merge with session data
    session.processData = { ...session.processData, ...extractedData };
    session.employeeName = extractedData.employeeName || session.employeeName;
    session.division = extractedData.division || session.division;

    res.json({ success: true, data: session.processData });
  } catch (error) {
    console.error("Extraction error:", error);
    res
      .status(500)
      .json({ error: "Failed to extract data", details: error.message });
  }
});

// Generate Word document
app.post("/api/generate-doc", async (req, res) => {
  const { sessionId } = req.body;

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const data = session.processData;

  try {
    const doc = createProcessDocument(
      data,
      session.employeeName,
      session.division,
      session.status === "ended_early", // Pass flag for draft marking
    );
    const buffer = await Packer.toBuffer(doc);

    // Generate filename
    const divisionSlug = (session.division || "Unknown")
      .replace(/[^a-zA-Z0-9]/g, "-")
      .substring(0, 30);
    const processSlug = (data.processName || "Process")
      .replace(/[^a-zA-Z0-9]/g, "-")
      .substring(0, 40);
    const timestamp = new Date().toISOString().split("T")[0];
    const draftPrefix = session.status === "ended_early" ? "DRAFT_" : "";
    const filename = `${draftPrefix}${divisionSlug}_${processSlug}_${timestamp}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error("Document generation error:", error);
    res
      .status(500)
      .json({ error: "Failed to generate document", details: error.message });
  }
});

// Send to Power Automate
app.post("/api/submit", async (req, res) => {
  const { sessionId } = req.body;

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const powerAutomateUrl = process.env.POWER_AUTOMATE_WEBHOOK_URL;

  if (!powerAutomateUrl) {
    return res
      .status(500)
      .json({ error: "Power Automate webhook URL not configured" });
  }

  try {
    // Generate the document
    const doc = createProcessDocument(
      session.processData,
      session.employeeName,
      session.division,
      session.status === "ended_early",
    );
    const buffer = await Packer.toBuffer(doc);
    const base64Doc = buffer.toString("base64");

    // Generate filename
    const divisionSlug = (session.division || "Unknown")
      .replace(/[^a-zA-Z0-9]/g, "-")
      .substring(0, 30);
    const processSlug = (session.processData.processName || "Process")
      .replace(/[^a-zA-Z0-9]/g, "-")
      .substring(0, 40);
    const timestamp = new Date().toISOString().split("T")[0];
    const draftPrefix = session.status === "ended_early" ? "DRAFT_" : "";
    const filename = `${draftPrefix}${divisionSlug}_${processSlug}_${timestamp}.docx`;

    // Send to Power Automate
    const payload = {
      sessionId: session.id,
      employeeName: session.employeeName,
      division: session.division,
      processName: session.processData.processName,
      summary: session.processData.summary,
      filename: filename,
      documentBase64: base64Doc,
      submittedAt: new Date().toISOString(),
      isDraft: session.status === "ended_early",
    };

    const response = await fetch(powerAutomateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Power Automate returned ${response.status}`);
    }

    session.status = "submitted";

    res.json({ success: true, filename });
  } catch (error) {
    console.error("Submit error:", error);
    res.status(500).json({ error: "Failed to submit", details: error.message });
  }
});

// Get divisions list
app.get("/api/divisions", (req, res) => {
  res.json(CCD_DIVISIONS);
});

// Download chat log as text file
app.post("/api/download-chat", (req, res) => {
  const { sessionId } = req.body;

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  // Format chat log
  let chatLog = `CCD Process Capture - Chat Log\n`;
  chatLog += `================================\n`;
  chatLog += `Employee: ${session.employeeName || "Not provided"}\n`;
  chatLog += `Division: ${session.division || "Not provided"}\n`;
  chatLog += `Date: ${new Date().toLocaleString()}\n`;
  chatLog += `================================\n\n`;

  session.messages.forEach((msg, index) => {
    const role = msg.role === "user" ? "You" : "Assistant";
    chatLog += `[${role}]\n${msg.content}\n\n`;
  });

  chatLog += `================================\n`;
  chatLog += `Total messages: ${session.messages.length}\n`;

  const filename = `chat-log_${session.employeeName?.replace(/[^a-zA-Z0-9]/g, "-") || "session"}_${new Date().toISOString().split("T")[0]}.txt`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(chatLog);
});

// Helper function to create the Word document
function createProcessDocument(data, employeeName, division, isDraft = false) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

  // Helper to create a section with header and content
  const createSection = (title, content) => {
    const paragraphs = [
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 120 },
        children: [new TextRun({ text: title, bold: true, size: 26 })],
      }),
    ];

    if (Array.isArray(content)) {
      content.forEach((item) => {
        if (item) {
          paragraphs.push(
            new Paragraph({
              spacing: { after: 60 },
              children: [new TextRun({ text: `• ${item}`, size: 22 })],
            }),
          );
        }
      });
      if (content.length === 0 || !content.some((item) => item)) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "(Not documented)",
                italics: true,
                color: "888888",
                size: 22,
              }),
            ],
          }),
        );
      }
    } else if (content) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: content, size: 22 })],
        }),
      );
    } else {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "(Not documented)",
              italics: true,
              color: "888888",
              size: 22,
            }),
          ],
        }),
      );
    }

    return paragraphs;
  };

  // Create RACI table rows
  const roles = data.roles || {};
  const maxRows = Math.max(
    roles.responsible?.length || 0,
    roles.accountable?.length || 0,
    roles.consulted?.length || 0,
    roles.informed?.length || 0,
    1,
  );

  const raciHeaderRow = new TableRow({
    children: [
      "Step/Task",
      "Responsible",
      "Accountable",
      "Consulted",
      "Informed",
    ].map(
      (header) =>
        new TableCell({
          borders,
          margins: cellMargins,
          width: { size: 1872, type: WidthType.DXA },
          shading: { fill: "E6E6E6", type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              children: [new TextRun({ text: header, bold: true, size: 20 })],
            }),
          ],
        }),
    ),
  });

  const raciRows = [raciHeaderRow];
  for (let i = 0; i < maxRows; i++) {
    raciRows.push(
      new TableRow({
        children: [
          new TableCell({
            borders,
            margins: cellMargins,
            width: { size: 1872, type: WidthType.DXA },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: data.steps?.[i] || `Step ${i + 1}`,
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
          ...[
            roles.responsible?.[i],
            roles.accountable?.[i],
            roles.consulted?.[i],
            roles.informed?.[i],
          ].map(
            (person) =>
              new TableCell({
                borders,
                margins: cellMargins,
                width: { size: 1872, type: WidthType.DXA },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: person || "",
                        size: 20,
                      }),
                    ],
                  }),
                ],
              }),
          ),
        ],
      }),
    );
  }

  // Build document title based on draft status
  const titleText = isDraft
    ? "DRAFT - Process Summary Card (Incomplete)"
    : "Process Summary Card";

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "numbers",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          run: { size: 22, font: "Arial" },
          paragraph: { spacing: { line: 276, after: 120 } },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 36, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 26, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 1 },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          // Draft warning banner (if applicable)
          ...(isDraft
            ? [
                new Paragraph({
                  shading: { fill: "FFEB3B", type: ShadingType.CLEAR },
                  spacing: { after: 240 },
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: "⚠ DRAFT - Interview ended early. This document may be incomplete.",
                      bold: true,
                      size: 24,
                    }),
                  ],
                }),
              ]
            : []),

          // Title
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: titleText,
                bold: true,
                size: 36,
              }),
            ],
          }),

          // Metadata
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({ text: "Employee: ", bold: true, size: 22 }),
              new TextRun({ text: employeeName || "(Not provided)", size: 22 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({ text: "Division: ", bold: true, size: 22 }),
              new TextRun({ text: division || "(Not provided)", size: 22 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({ text: "Date: ", bold: true, size: 22 }),
              new TextRun({
                text: new Date().toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }),
                size: 22,
              }),
            ],
          }),

          // Process Name
          ...createSection("Process Name", data.processName),

          // Purpose
          ...createSection("Purpose (Job Statement)", data.purpose),

          // Success Criteria
          ...createSection("Success Criteria", data.successCriteria),

          // RACI Table
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 120 },
            children: [
              new TextRun({
                text: "Primary Participants (RACI Matrix)",
                bold: true,
                size: 26,
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [1872, 1872, 1872, 1872, 1872],
            rows:
              raciRows.length > 1
                ? raciRows
                : [
                    raciRows[0],
                    new TableRow({
                      children: Array(5)
                        .fill(null)
                        .map(
                          () =>
                            new TableCell({
                              borders,
                              margins: cellMargins,
                              width: { size: 1872, type: WidthType.DXA },
                              children: [
                                new Paragraph({
                                  children: [
                                    new TextRun({
                                      text: "(To be filled)",
                                      italics: true,
                                      color: "888888",
                                      size: 20,
                                    }),
                                  ],
                                }),
                              ],
                            }),
                        ),
                    }),
                  ],
          }),

          // Tools & Channels
          ...createSection("Tools & Channels", data.tools),

          // Critical Steps
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 120 },
            children: [
              new TextRun({ text: "Critical Steps", bold: true, size: 26 }),
            ],
          }),
          ...(data.steps && data.steps.length > 0
            ? data.steps.map(
                (step, i) =>
                  new Paragraph({
                    numbering: { reference: "numbers", level: 0 },
                    children: [new TextRun({ text: step, size: 22 })],
                  }),
              )
            : [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "(Not documented)",
                      italics: true,
                      color: "888888",
                      size: 22,
                    }),
                  ],
                }),
              ]),

          // Timeline
          ...createSection(
            "Timeline",
            data.timeline
              ? `Trigger: ${data.trigger || "N/A"}\nDuration: ${data.timeline}\nCompletion: ${data.completion || "N/A"}`
              : null,
          ),

          // Pain Points
          ...createSection("Pain Points", data.painPoints),

          // Common Breakdowns
          ...createSection("Common Breakdowns", data.breakdowns),

          // Training Gaps
          ...createSection("Training Gaps", data.trainingGaps),

          // Improvement Ideas
          ...createSection("Improvement Ideas", data.improvements),

          // Summary
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 120 },
            children: [new TextRun({ text: "Summary", bold: true, size: 26 })],
          }),
          new Paragraph({
            shading: { fill: "F5F5F5", type: ShadingType.CLEAR },
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: data.summary || "(No summary generated)",
                italics: !data.summary,
                size: 22,
              }),
            ],
          }),

          // User Feedback (if provided)
          ...(data.feedback
            ? [
                new Paragraph({
                  heading: HeadingLevel.HEADING_2,
                  spacing: { before: 300, after: 120 },
                  children: [
                    new TextRun({
                      text: "User Feedback",
                      bold: true,
                      size: 26,
                    }),
                  ],
                }),
                new Paragraph({
                  shading: { fill: "FFF9E6", type: ShadingType.CLEAR },
                  spacing: { after: 240 },
                  children: [
                    new TextRun({
                      text: data.feedback,
                      italics: true,
                      size: 22,
                    }),
                  ],
                }),
              ]
            : []),
        ],
      },
    ],
  });

  return doc;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Process Capture server running on port ${PORT}`);
  console.log(`Basic Auth enabled: ${BASIC_AUTH_USER} / [hidden]`);
  console.log(
    `Session limits: ${SESSION_CONFIG.MAX_MESSAGES} messages, ${SESSION_CONFIG.TIMEOUT_MINUTES} min timeout`,
  );
});
