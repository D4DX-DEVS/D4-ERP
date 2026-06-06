// ==================== HR Letter templates ====================
// Pure helpers for the staff letter generator. Provides the three default
// letter bodies (experience / appointment / relieving), the list of supported
// placeholders, and a token-substitution renderer. Kept framework-agnostic so
// both the settings editor and the generator component can reuse it.

export type LetterType = "experience" | "appointment" | "relieving";

export interface LetterTypeMeta {
  type: LetterType;
  label: string;
  /** Default document title / heading shown on the letter. */
  heading: string;
}

export const LETTER_TYPES: LetterTypeMeta[] = [
  { type: "experience", label: "Experience Certificate", heading: "TO WHOMSOEVER IT MAY CONCERN" },
  { type: "appointment", label: "Appointment Letter", heading: "LETTER OF APPOINTMENT" },
  { type: "relieving", label: "Relieving Letter", heading: "RELIEVING LETTER" },
];

/** Tokens that can be used inside a template body. */
export const LETTER_PLACEHOLDERS = [
  "{{employeeName}}",
  "{{designation}}",
  "{{department}}",
  "{{employeeId}}",
  "{{joiningDate}}",
  "{{lastWorkingDate}}",
  "{{salary}}",
  "{{pronoun}}",
  "{{possessive}}",
  "{{companyName}}",
  "{{companyAddress}}",
  "{{date}}",
] as const;

/** Variables resolved from staff + settings data and substituted into a body. */
export interface LetterVariables {
  employeeName: string;
  designation: string;
  department: string;
  employeeId: string;
  joiningDate: string;
  lastWorkingDate: string;
  salary: string;
  /** "he" / "she" / "they". */
  pronoun: string;
  /** "his" / "her" / "their". */
  possessive: string;
  companyName: string;
  companyAddress: string;
  date: string;
}

export const DEFAULT_LETTER_BODIES: Record<LetterType, string> = {
  experience: `This is to certify that {{employeeName}} (Employee ID: {{employeeId}}) was employed with {{companyName}} as {{designation}} in the {{department}} department from {{joiningDate}} to {{lastWorkingDate}}.

During {{possessive}} tenure with us, {{pronoun}} was found to be sincere, hardworking and dedicated towards {{possessive}} responsibilities. {{pronoun}} maintained good conduct throughout the period of employment.

We wish {{employeeName}} all the very best in {{possessive}} future endeavours.`,

  appointment: `Dear {{employeeName}},

With reference to your application and the subsequent interview, we are pleased to appoint you as {{designation}} in the {{department}} department at {{companyName}}, with effect from {{joiningDate}}.

Your annual cost to company (CTC) will be {{salary}}. You will be governed by the rules, regulations and policies of the company as applicable from time to time.

We welcome you to the team and look forward to a long and mutually rewarding association.`,

  relieving: `This is to certify that {{employeeName}} (Employee ID: {{employeeId}}), who was working as {{designation}} in the {{department}} department at {{companyName}}, has been relieved from {{possessive}} duties with effect from the close of business on {{lastWorkingDate}}.

{{pronoun}} has handed over all the responsibilities and company property as per the exit process. We thank {{employeeName}} for {{possessive}} services and wish {{pronoun}} success in all future endeavours.`,
};

/** Replaces every {{token}} in the body with its resolved value. */
export function renderLetterBody(body: string, vars: LetterVariables): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = (vars as unknown as Record<string, string>)[key];
    return value !== undefined && value !== "" ? value : match;
  });
}
