import * as nodemailer from "nodemailer";
import { ENV } from "../../utils/Env";
import { Log } from "../../utils/Log";

// Sending email (password reset and confirm links), over SMTP - any provider
// works (Postmark, SendGrid, Amazon SES, Mailgun, your own server). Set in
// server/.env:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE (true for port 465), SMTP_USER, SMTP_PASS
//   MAIL_FROM   e.g. "Wayfolk <no-reply@example.com>"
//   PUBLIC_URL  where the client is, for links in emails
// Until SMTP_HOST is set, emails aren't sent: they're written to the server
// log instead, so the links can be tried in development.

let transport: ReturnType<typeof nodemailer.createTransport> = null;

export function mailConfigured() {
    return !!ENV.SMTP_HOST;
}

// a link into the client, e.g. publicLink({ reset: token })
export function publicLink(params: { [key: string]: string }) {
    const url = new URL(ENV.PUBLIC_URL || "http://localhost/idlerealm/client/dist/");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
}

export async function sendMail(to: string, subject: string, text: string) {
    if (!mailConfigured()) {
        Log.info(`[mail not set up - would send to ${to}] ${subject}\n${text}`);
        return;
    }
    transport ??= nodemailer.createTransport({
        host: ENV.SMTP_HOST,
        port: Number(ENV.SMTP_PORT) || 587,
        secure: ENV.SMTP_SECURE == "true",
        auth: ENV.SMTP_USER ? { user: ENV.SMTP_USER, pass: ENV.SMTP_PASS } : undefined,
    });
    await transport.sendMail({ from: ENV.MAIL_FROM || ENV.SMTP_USER, to, subject, text });
}
