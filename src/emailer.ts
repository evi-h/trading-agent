import nodemailer from "nodemailer";
import { ENV, type BriefingMeta } from "./config.js";

export async function sendBriefing(fullHtml: string, meta: BriefingMeta): Promise<void> {
  const transport = nodemailer.createTransport({
    host: ENV.smtpHost,
    port: ENV.smtpPort,
    secure: false,
    requireTLS: true, // refuse to send credentials over an unencrypted session
    auth: {
      user: ENV.smtpUser,
      pass: ENV.smtpPass,
    },
  });

  const setups = meta.setupCount ?? 0;
  const setupLabel = setups === 0 ? "no setups" : setups === 1 ? "1 setup" : `${setups} setups`;

  await transport.sendMail({
    from: ENV.emailFrom,
    to: ENV.emailTo,
    subject: `Evening Briefing — ${setupLabel} — ${meta.date}`,
    html: fullHtml,
  });

  console.log(`Email sent to ${ENV.emailTo}`);
}
