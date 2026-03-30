import nodemailer from "nodemailer";
import { ENV, type BriefingMeta } from "./config.js";

export async function sendBriefing(fullHtml: string, meta: BriefingMeta): Promise<void> {
  const transport = nodemailer.createTransport({
    host: ENV.smtpHost,
    port: ENV.smtpPort,
    secure: false,
    auth: {
      user: ENV.smtpUser,
      pass: ENV.smtpPass,
    },
  });

  await transport.sendMail({
    from: ENV.emailFrom,
    to: ENV.emailTo,
    subject: `Evening Briefing — ${meta.date}`,
    html: fullHtml,
  });

  console.log(`Email sent to ${ENV.emailTo}`);
}
