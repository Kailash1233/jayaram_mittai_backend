// WhatsApp Cloud API delivery for login OTPs.
// No imports, so it runs unchanged in Deno (the Edge Function) and in
// Node (the unit tests).

export interface WhatsAppConfig {
  /** Permanent access token of a Meta system user. */
  token: string;
  /** "Phone number ID" of the WhatsApp Business number (not the number). */
  phoneNumberId: string;
  /** Approved template in the Authentication category, with a copy-code button. */
  templateName: string;
  /** The template's language code, e.g. "en" or "en_US". */
  templateLanguage: string;
  /** Graph API version, e.g. "v23.0". */
  graphVersion: string;
}

const REQUIRED = {
  token: 'WHATSAPP_TOKEN',
  phoneNumberId: 'WHATSAPP_PHONE_NUMBER_ID',
  templateName: 'WHATSAPP_TEMPLATE_NAME',
} as const;

export function readConfig(
  get: (name: string) => string | undefined,
): WhatsAppConfig {
  const missing = Object.values(REQUIRED).filter((name) => !get(name));
  if (missing.length > 0) {
    throw new Error(`Missing secrets: ${missing.join(', ')}`);
  }
  return {
    token: get(REQUIRED.token)!,
    phoneNumberId: get(REQUIRED.phoneNumberId)!,
    templateName: get(REQUIRED.templateName)!,
    templateLanguage: get('WHATSAPP_TEMPLATE_LANGUAGE') || 'en',
    graphVersion: get('WHATSAPP_GRAPH_VERSION') || 'v23.0',
  };
}

/**
 * The Cloud API request for an authentication template. The OTP goes in
 * the body text and in the copy-code button, as Meta requires.
 */
export function buildOtpRequest(
  phone: string,
  otp: string,
  config: WhatsAppConfig,
) {
  // Supabase sends "919840012345"; WhatsApp wants digits only, no "+"
  const to = phone.replace(/\D/g, '');

  return {
    url: `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: config.templateName,
          language: { code: config.templateLanguage },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: otp }] },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: otp }],
            },
          ],
        },
      }),
    },
  };
}

/** Sends the OTP; throws with Meta's error message if WhatsApp rejects it. */
export async function sendOtp(
  fetchFn: typeof fetch,
  phone: string,
  otp: string,
  config: WhatsAppConfig,
): Promise<void> {
  const { url, init } = buildOtpRequest(phone, otp, config);
  const response = await fetchFn(url, init);

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const reason = body?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`WhatsApp rejected the message: ${reason}`);
  }
}
