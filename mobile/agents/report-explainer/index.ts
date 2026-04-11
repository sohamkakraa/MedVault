/**
 * Report Explainer Agent
 *
 * Specialized agent for interpreting medical documents (lab reports, imaging summaries,
 * diagnoses, discharge summaries, etc.). Runs on the cloud (Claude API) because it
 * needs to handle PDF analysis and full document context.
 *
 * Triggered when:
 * - User uploads a PDF and asks "what does this mean?"
 * - User asks about a specific report or document
 * - User asks "explain this result" or similar
 *
 * Responsibilities:
 * - Explain findings in plain language
 * - Highlight important values and their meanings
 * - Connect findings to the user's existing conditions/medications when relevant
 * - Never be alarmist — frame results supportively
 * - Recommend saving the document to the store
 * - Suggest consulting the clinician who ordered the test for interpretation
 */

import {
  Agent,
  IntentClassification,
  OrchestrationDecision,
} from "../types";
import {
  AgentContext,
  AgentResponse,
  AgentAction,
  ExtractedDoc,
} from "../../lib/types";
import { callCloudAI } from "../../lib/ai/cloud";

const REPORT_EXPLAINER_SYSTEM_PROMPT = `You are a medical document expert who explains lab reports, imaging results, pathology reports, and other medical documents in plain language that patients can understand.

YOUR ROLE:
- Translate medical jargon into everyday language
- Explain what tests measure and what the results mean
- Highlight important findings and any concerning values
- Connect results to the patient's known conditions and medications (if provided)
- Explain reference ranges and what "normal" means
- Note trends if multiple results are available (e.g., "Your glucose is trending upward")

TONE:
- Be informative but not alarming
- Use supportive language ("Here's what your results show..." not "Your results are concerning")
- Acknowledge if results are good news
- Frame concerning results matter-of-factly without catastrophizing

NEVER:
- Diagnose or suggest specific treatments
- Over-interpret results beyond what the test actually measures
- Make assumptions about what caused an abnormal result
- Suggest stopping or changing medications
- Replace consultation with the ordering clinician

WHEN TO RECOMMEND CONSULTATION:
- Abnormal or concerning values
- Unclear results or conflicting findings
- Questions about what treatment or lifestyle changes are needed
- Results that contradict the patient's previous tests (trends)
- Any result that requires medical interpretation or decision-making

RESPONSE STRUCTURE:
1. Start with a summary of what was tested
2. Explain the key findings in plain language
3. For abnormal values, explain what the value means and why it matters
4. Connect to the patient's health context if relevant
5. Suggest next steps (usually: "Talk to your doctor about these results")
6. Offer to save the document for future reference

EXAMPLE RESPONSE:

"Your blood glucose test from March 10 shows a fasting glucose of 138 mg/dL.
- Normal range for fasting glucose is 70-100 mg/dL
- Your result is slightly elevated, which could mean your blood sugar control needs attention
- This matters because you have Type 2 diabetes, and good glucose control helps prevent complications
- The good news is that your previous test in January was 142 mg/dL, so this shows improvement!

What to do next: Discuss these results with your doctor. They may suggest adjusting your Metformin dose, reviewing your diet, or increasing exercise. You should also ask about your target range — different people have different goals.

I'd recommend saving this report to your health records for future reference."

IMPORTANT DISCLAIMERS:
- Always note: "I'm interpreting your report based on standard medical knowledge, but your doctor should confirm how these results apply to your specific situation."
- If results are concerning, be clear: "Please schedule a follow-up with your doctor to discuss these findings."

HANDLING MISSING DATA:
- If the patient's history isn't provided, explain what "normal" usually means
- Note that some interpretations depend on the patient's medical history, medications, or conditions
- Recommend providing context to their doctor

VISUAL ELEMENTS:
- Summarize any charts, graphs, or images described in the report
- Explain what imaging findings mean (e.g., "A normal chest X-ray means the lungs look clear")
- Avoid technical terminology when describing imaging findings`;

/**
 * Report Explainer Agent Implementation
 */
class ReportExplainerAgent implements Agent {
  readonly id = "report-explainer";
  readonly name = "Report Explainer";
  readonly description =
    "Explains medical reports, lab results, and imaging findings in plain language you can understand.";
  readonly runtime = "cloud";
  readonly systemPrompt = REPORT_EXPLAINER_SYSTEM_PROMPT;

  /**
   * Can handle messages about documents, reports, labs, or images
   */
  canHandle(message: string, context: AgentContext): boolean {
    const docKeywords = [
      "pdf",
      "document",
      "report",
      "lab result",
      "imaging",
      "x-ray",
      "scan",
      "ct",
      "mri",
      "ultrasound",
      "ecg",
      "ekg",
      "explain",
      "what does this mean",
      "findings",
      "result",
    ];

    const lowerMessage = message.toLowerCase();
    const hasDocKeywords = docKeywords.some((kw) =>
      lowerMessage.includes(kw)
    );

    // Also return true if there are recent documents in the context
    // (user might be asking about the most recent upload without mentioning it)
    const hasRecentDocs = context.store.docs.length > 0;

    return hasDocKeywords || (hasRecentDocs && message.length < 100);
  }

  /**
   * Process the user message and extract/explain the document
   */
  async process(
    message: string,
    context: AgentContext
  ): Promise<AgentResponse> {
    try {
      // Try to find a relevant document from the context
      let targetDoc: ExtractedDoc | null = null;

      // If the user mentions a specific document type or date, try to find it
      const docTypeKeywords = ["lab", "imaging", "x-ray", "scan", "ct", "mri"];
      const mentionedType = docTypeKeywords.find((t) =>
        message.toLowerCase().includes(t)
      );

      if (mentionedType) {
        targetDoc =
          context.store.docs.find((d) =>
            d.type.toLowerCase().includes(mentionedType)
          ) || null;
      }

      // If no specific document found, use the most recent one
      if (!targetDoc && context.store.docs.length > 0) {
        targetDoc = context.store.docs[0];
      }

      if (!targetDoc) {
        return {
          message:
            "I don't see any documents to explain. Could you upload a lab report, imaging result, or other medical document?",
          agentId: this.id,
          needsClarification: true,
          confidence: "medium",
        };
      }

      // Build context about the patient for interpretation
      const patientContext = `
Patient: ${context.store.profile.name || "Unknown"}
Conditions: ${context.store.profile.conditions.join(", ") || "None listed"}
Current Medications: ${
        context.store.meds.length > 0
          ? context.store.meds
              .slice(0, 5)
              .map((m) => `${m.name} (${m.dose || "dose unknown"})`)
              .join(", ")
          : "None listed"
      }
Allergies: ${context.store.profile.allergies.join(", ") || "None listed"}
`;

      // Call the cloud AI to explain the document
      const systemPromptWithContext = `${this.systemPrompt}

---

PATIENT CONTEXT:
${patientContext}

---

DOCUMENT TO EXPLAIN:
Title: ${targetDoc.title}
Type: ${targetDoc.type}
Date: ${targetDoc.dateISO}
Provider: ${targetDoc.provider || "Unknown"}

Summary from extraction: ${targetDoc.summary}

${
  targetDoc.markdownArtifact
    ? `\nDetailed content:\n${targetDoc.markdownArtifact.substring(0, 2000)}`
    : ""
}`;

      const response = await callCloudAI({
        systemPrompt: systemPromptWithContext,
        userMessage: message,
        conversationHistory: [],
      });

      // Extract metadata if present
      const consultDoctorMatch = response.match(/\[consult_doctor\]/i);
      const consultDoctor = !!consultDoctorMatch;

      let cleanMessage = response.replace(/\[consult_doctor\]/i, "").trim();

      // Suggest saving the document if it's not already saved
      const actions: AgentAction[] = [];
      if (targetDoc && !targetDoc.uploadedAtISO) {
        actions.push({
          type: "save_document",
          doc: {
            ...targetDoc,
            uploadedAtISO: new Date().toISOString(),
          },
        });
      }

      return {
        message: cleanMessage,
        agentId: this.id,
        consultDoctor,
        confidence: "high",
        actions: actions.length > 0 ? actions : undefined,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Report Explainer API error:", errorMessage);

      return {
        message: `I'm having trouble analyzing the document right now. Could you try again?`,
        agentId: this.id,
        confidence: "low",
      };
    }
  }
}

export default ReportExplainerAgent;
export { ReportExplainerAgent };
