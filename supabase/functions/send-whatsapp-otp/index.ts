// Supabase Auth "Send SMS" hook: delivers login OTPs over WhatsApp instead
// of SMS. Supabase still creates and verifies the code; this only sends it.
//
// Deploy:  npx supabase functions deploy send-whatsapp-otp --no-verify-jwt
// Secrets: SEND_SMS_HOOK_SECRET, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
//          WHATSAPP_TEMPLATE_NAME, optional WHATSAPP_TEMPLATE_LANGUAGE (en),
//          WHATSAPP_GRAPH_VERSION (v23.0)
// --no-verify-jwt: Supabase Auth calls this without a user token; the
// webhook signature below is what authenticates the call instead.

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';
import { readConfig, sendOtp } from './whatsapp.ts';

interface SendSmsEvent {
  user: { phone: string };
  sms: { otp: string };
}

// The error shape Supabase Auth expects from a hook
const hookError = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return hookError(405, 'Method not allowed.');
  }

  // Only Supabase Auth holds the hook secret, so only it can trigger a send
  const payload = await req.text();
  const secret = (Deno.env.get('SEND_SMS_HOOK_SECRET') ?? '').replace(
    'v1,whsec_',
    '',
  );
  let event: SendSmsEvent;
  try {
    event = new Webhook(secret).verify(
      payload,
      Object.fromEntries(req.headers),
    ) as SendSmsEvent;
  } catch {
    return hookError(401, 'Invalid hook signature.');
  }

  try {
    await sendOtp(
      fetch,
      event.user.phone,
      event.sms.otp,
      readConfig((name) => Deno.env.get(name)),
    );
  } catch (err) {
    // Never log the OTP itself
    console.error(err instanceof Error ? err.message : err);
    return hookError(500, 'Could not send the WhatsApp code.');
  }

  return new Response('{}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
