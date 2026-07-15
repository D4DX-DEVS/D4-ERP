/**
 * Certificate/Letter template generation and management.
 * Provides default templates for certificates, appointment letters, experience letters, relieving letters, etc.
 */

import { Timestamp } from "@/lib/firestore";

export interface CertificateTemplate {
  key: string;
  name: string;
  bodyHtml: string;
  logoUrl?: string;
  signatureUrl?: string;
  signatoryName?: string;
}

export interface IssuedLetter {
  templateKey: string;
  templateName: string;
  staffId: string;
  staffName: string;
  designation?: string;
  values: Record<string, string>;
  fileUrl?: string;
  issuedBy: string;
  issuedByName?: string;
  issuedAt?: Timestamp;
}

export const DEFAULT_TEMPLATES: CertificateTemplate[] = [
  {
    key: "best-employee-month",
    name: "Best Employee (Monthly)",
    bodyHtml: `
      <div style="font-family: Georgia, serif; text-align: center; padding: 60px 40px; min-height: 800px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          {{#logoUrl}}
          <div style="margin-bottom: 30px;">
            <img src="{{logoUrl}}" alt="Company Logo" style="max-width: 120px; height: auto;" />
          </div>
          {{/logoUrl}}
          <h1 style="font-size: 36px; margin: 0 0 10px 0; color: #1a5f3d;">Certificate of Excellence</h1>
          <p style="font-size: 18px; color: #666; margin: 0 0 30px 0;">Best Employee - {{month}}/{{year}}</p>
        </div>

        <div style="margin: 40px 0;">
          <p style="font-size: 16px; line-height: 1.8; color: #333; text-align: justify;">
            This is to certify that <span style="font-weight: bold; text-decoration: underline;">{{name}}</span>,
            {{designation}}, {{department}}, has been selected as the <strong>Best Employee</strong> for the month of {{month}}, {{year}},
            in recognition of their exceptional performance, dedication, and outstanding contribution to the organization.
          </p>
          <p style="font-size: 16px; line-height: 1.8; color: #333; text-align: justify; margin-top: 20px;">
            Their exemplary work ethic, innovation, and commitment to excellence have significantly contributed to the success of our team and organization.
          </p>
        </div>

        <div style="margin-top: 60px;">
          {{#signatureUrl}}
          <div style="height: 60px; margin-bottom: 10px;">
            <img src="{{signatureUrl}}" alt="Signature" style="max-height: 60px;" />
          </div>
          {{/signatureUrl}}
          <p style="margin: 0; font-weight: bold;">{{signatoryName}}</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">{{companyName}}</p>
        </div>

        <div style="margin-top: 40px; font-size: 12px; color: #999;">
          <p>Date: {{issuanceDate}}</p>
        </div>
      </div>
    `,
  },
  {
    key: "best-employee-year",
    name: "Best Employee (Yearly)",
    bodyHtml: `
      <div style="font-family: Georgia, serif; text-align: center; padding: 60px 40px; min-height: 800px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          {{#logoUrl}}
          <div style="margin-bottom: 30px;">
            <img src="{{logoUrl}}" alt="Company Logo" style="max-width: 120px; height: auto;" />
          </div>
          {{/logoUrl}}
          <h1 style="font-size: 40px; margin: 0 0 15px 0; color: #1a5f3d;">Certificate of Outstanding Achievement</h1>
          <p style="font-size: 20px; color: #666; margin: 0 0 30px 0;">Best Employee - {{year}}</p>
        </div>

        <div style="margin: 40px 0;">
          <p style="font-size: 16px; line-height: 1.8; color: #333; text-align: justify;">
            This is to certify that <span style="font-weight: bold; text-decoration: underline;">{{name}}</span>,
            {{designation}}, {{department}}, has been recognized as the <strong>Best Employee</strong> for the year {{year}},
            in acknowledgment of their outstanding performance, leadership, and exceptional contributions to our organization's success.
          </p>
          <p style="font-size: 16px; line-height: 1.8; color: #333; text-align: justify; margin-top: 20px;">
            Their consistent excellence, innovative thinking, and unwavering commitment have set a benchmark for organizational values and achievement.
          </p>
        </div>

        <div style="margin-top: 60px;">
          {{#signatureUrl}}
          <div style="height: 60px; margin-bottom: 10px;">
            <img src="{{signatureUrl}}" alt="Signature" style="max-height: 60px;" />
          </div>
          {{/signatureUrl}}
          <p style="margin: 0; font-weight: bold;">{{signatoryName}}</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">{{companyName}}</p>
        </div>

        <div style="margin-top: 40px; font-size: 12px; color: #999;">
          <p>Date: {{issuanceDate}}</p>
        </div>
      </div>
    `,
  },
  {
    key: "appointment-letter",
    name: "Appointment Letter",
    bodyHtml: `
      <div style="font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; min-height: 800px;">
        {{#logoUrl}}
        <div style="text-align: center; margin-bottom: 30px;">
          <img src="{{logoUrl}}" alt="Company Logo" style="max-width: 100px; height: auto;" />
        </div>
        {{/logoUrl}}

        <p style="text-align: right; margin-bottom: 30px; font-size: 12px; color: #666;">
          Date: {{issuanceDate}}
        </p>

        <p style="margin-bottom: 30px;">
          <span style="font-weight: bold;">{{name}}</span><br/>
          {{address}}
        </p>

        <p style="margin-bottom: 30px;">
          <strong>Dear {{name}},</strong>
        </p>

        <p style="margin-bottom: 30px; text-align: justify;">
          Congratulations! We are pleased to offer you the position of <strong>{{designation}}</strong>
          in the <strong>{{department}}</strong> department at <strong>{{companyName}}</strong>.
        </p>

        <p style="margin-bottom: 20px; text-align: justify;">
          <strong>Appointment Details:</strong>
        </p>

        <ul style="margin-bottom: 30px;">
          <li>Position: {{designation}}</li>
          <li>Department: {{department}}</li>
          <li>Date of Joining: {{joinDate}}</li>
          <li>Employment Type: {{employmentType}}</li>
          <li>Reporting To: {{reportingTo}}</li>
        </ul>

        <p style="margin-bottom: 30px; text-align: justify;">
          Your responsibilities, benefits, and terms of employment are detailed in the attached offer letter and employment agreement.
        </p>

        <p style="margin-bottom: 30px; text-align: justify;">
          Please confirm your acceptance of this offer by signing and returning this letter within 5 days of receipt.
        </p>

        <p style="margin-bottom: 30px;">
          Welcome to {{companyName}}!
        </p>

        <p>Yours sincerely,</p>

        {{#signatureUrl}}
        <div style="height: 50px; margin: 20px 0;">
          <img src="{{signatureUrl}}" alt="Signature" style="max-height: 50px;" />
        </div>
        {{/signatureUrl}}

        <p style="margin: 0; font-weight: bold;">{{signatoryName}}</p>
        <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">{{companyName}}</p>
      </div>
    `,
  },
  {
    key: "experience-certificate",
    name: "Experience Certificate",
    bodyHtml: `
      <div style="font-family: Georgia, serif; text-align: center; padding: 60px 40px; min-height: 800px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          {{#logoUrl}}
          <div style="margin-bottom: 30px;">
            <img src="{{logoUrl}}" alt="Company Logo" style="max-width: 120px; height: auto;" />
          </div>
          {{/logoUrl}}
          <h1 style="font-size: 36px; margin: 0 0 10px 0; color: #1a5f3d;">Experience Certificate</h1>
        </div>

        <div style="margin: 40px 0;">
          <p style="font-size: 16px; line-height: 1.8; color: #333; text-align: justify;">
            This is to certify that <span style="font-weight: bold; text-decoration: underline;">{{name}}</span>
            was employed with <strong>{{companyName}}</strong> as <strong>{{designation}}</strong>
            in the <strong>{{department}}</strong> department from <strong>{{joinDate}}</strong> to <strong>{{endDate}}</strong>.
          </p>

          <p style="font-size: 16px; line-height: 1.8; color: #333; text-align: justify; margin-top: 20px;">
            During their tenure, {{name}} demonstrated professional competence, dedication, and a strong commitment to organizational goals.
            They were reliable, punctual, and maintained high standards of work quality and conduct.
          </p>

          <p style="font-size: 16px; line-height: 1.8; color: #333; text-align: justify; margin-top: 20px;">
            We wish them every success in their future endeavors.
          </p>
        </div>

        <div style="margin-top: 60px;">
          {{#signatureUrl}}
          <div style="height: 60px; margin-bottom: 10px;">
            <img src="{{signatureUrl}}" alt="Signature" style="max-height: 60px;" />
          </div>
          {{/signatureUrl}}
          <p style="margin: 0; font-weight: bold;">{{signatoryName}}</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">{{companyName}}</p>
        </div>

        <div style="margin-top: 40px; font-size: 12px; color: #999;">
          <p>Date: {{issuanceDate}}</p>
        </div>
      </div>
    `,
  },
  {
    key: "relieving-letter",
    name: "Relieving Letter",
    bodyHtml: `
      <div style="font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; min-height: 800px;">
        {{#logoUrl}}
        <div style="text-align: center; margin-bottom: 30px;">
          <img src="{{logoUrl}}" alt="Company Logo" style="max-width: 100px; height: auto;" />
        </div>
        {{/logoUrl}}

        <p style="text-align: right; margin-bottom: 30px; font-size: 12px; color: #666;">
          Date: {{issuanceDate}}
        </p>

        <p style="margin-bottom: 30px;">
          <span style="font-weight: bold;">{{name}}</span><br/>
          {{address}}
        </p>

        <p style="margin-bottom: 30px;">
          <strong>RELIEVING LETTER</strong>
        </p>

        <p style="margin-bottom: 30px;">
          <strong>Dear {{name}},</strong>
        </p>

        <p style="margin-bottom: 30px; text-align: justify;">
          This letter is to acknowledge that your resignation/separation from {{companyName}} has been accepted.
          Your services as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department
          have been relieved with effect from <strong>{{endDate}}</strong>.
        </p>

        <p style="margin-bottom: 30px; text-align: justify;">
          During your tenure from {{joinDate}} to {{endDate}}, you have served the organization with dedication and professionalism.
          We appreciate your contributions and wish you all the best in your future endeavors.
        </p>

        <p style="margin-bottom: 30px; text-align: justify;">
          We confirm that you have submitted all company property and completed all exit formalities.
          You are relieved of all duties and responsibilities effective immediately.
        </p>

        <p style="margin-bottom: 30px;">
          Yours sincerely,
        </p>

        {{#signatureUrl}}
        <div style="height: 50px; margin: 20px 0;">
          <img src="{{signatureUrl}}" alt="Signature" style="max-height: 50px;" />
        </div>
        {{/signatureUrl}}

        <p style="margin: 0; font-weight: bold;">{{signatoryName}}</p>
        <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">{{companyName}}</p>
      </div>
    `,
  },
  {
    key: "internship-completion",
    name: "Internship Completion Certificate",
    bodyHtml: `
      <div style="font-family: Georgia, serif; text-align: center; padding: 60px 40px; min-height: 800px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          {{#logoUrl}}
          <div style="margin-bottom: 30px;">
            <img src="{{logoUrl}}" alt="Company Logo" style="max-width: 120px; height: auto;" />
          </div>
          {{/logoUrl}}
          <h1 style="font-size: 36px; margin: 0 0 10px 0; color: #1a5f3d;">Internship Completion Certificate</h1>
        </div>

        <div style="margin: 40px 0;">
          <p style="font-size: 16px; line-height: 1.8; color: #333; text-align: justify;">
            This is to certify that <span style="font-weight: bold; text-decoration: underline;">{{name}}</span>
            has successfully completed their internship program at <strong>{{companyName}}</strong>
            from <strong>{{joinDate}}</strong> to <strong>{{endDate}}</strong>.
          </p>

          <p style="font-size: 16px; line-height: 1.8; color: #333; text-align: justify; margin-top: 20px;">
            During the internship period, {{name}} worked as an intern in the <strong>{{department}}</strong> department
            and demonstrated a strong commitment to learning, professional conduct, and quality of work.
            They have gained valuable practical knowledge and hands-on experience in their field of study.
          </p>

          <p style="font-size: 16px; line-height: 1.8; color: #333; text-align: justify; margin-top: 20px;">
            We wish them continued success in their academic and professional pursuits.
          </p>
        </div>

        <div style="margin-top: 60px;">
          {{#signatureUrl}}
          <div style="height: 60px; margin-bottom: 10px;">
            <img src="{{signatureUrl}}" alt="Signature" style="max-height: 60px;" />
          </div>
          {{/signatureUrl}}
          <p style="margin: 0; font-weight: bold;">{{signatoryName}}</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">{{companyName}}</p>
        </div>

        <div style="margin-top: 40px; font-size: 12px; color: #999;">
          <p>Date: {{issuanceDate}}</p>
        </div>
      </div>
    `,
  },
];

/**
 * Renders a template by replacing all {{placeholder}} with values.
 * Missing placeholders are replaced with empty string.
 * Supports Handlebars-style conditionals {{#key}}...{{/key}}
 */
export function renderTemplate(bodyHtml: string, values: Record<string, string>): string {
  let result = bodyHtml;

  // Handle conditionals: {{#key}}...{{/key}}
  const conditionalRegex = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  result = result.replace(conditionalRegex, (match, key, content) => {
    return values[key] ? content : "";
  });

  // Handle simple replacements: {{key}}
  const replacementRegex = /\{\{(\w+)\}\}/g;
  result = result.replace(replacementRegex, (match, key) => {
    return values[key] ?? "";
  });

  return result;
}

/**
 * Seeds the letterTemplates collection with default templates if empty.
 * Called on first access to ensure templates are available.
 */
export async function ensureDefaultTemplates(): Promise<void> {
  try {
    const { getDocuments, createDocument } = await import("@/lib/firestore");
    const existing = await getDocuments("letterTemplates");
    if (existing.length > 0) return;

    for (const template of DEFAULT_TEMPLATES) {
      await createDocument("letterTemplates", {
        key: template.key,
        name: template.name,
        bodyHtml: template.bodyHtml,
        logoUrl: template.logoUrl,
        signatureUrl: template.signatureUrl,
        signatoryName: template.signatoryName,
      });
    }
  } catch (error) {
    console.error("Failed to seed default certificate templates:", error);
  }
}
