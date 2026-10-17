import {
  buildOtpRequest,
  readConfig,
  sendOtp,
  type WhatsAppConfig,
} from '../supabase/functions/send-whatsapp-otp/whatsapp.js';

describe('WhatsApp OTP delivery', () => {
  const config: WhatsAppConfig = {
    token: 'meta-token',
    phoneNumberId: '1234567890',
    templateName: 'login_otp',
    templateLanguage: 'en',
    graphVersion: 'v23.0',
  };

  describe('readConfig', () => {
    it('reads the secrets and defaults the language and API version', () => {
      const secrets: Record<string, string> = {
        WHATSAPP_TOKEN: 'meta-token',
        WHATSAPP_PHONE_NUMBER_ID: '1234567890',
        WHATSAPP_TEMPLATE_NAME: 'login_otp',
      };

      expect(readConfig((name) => secrets[name])).toEqual(config);
    });

    it('names every missing secret', () => {
      expect(() => readConfig(() => undefined)).toThrow(
        'Missing secrets: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_NAME',
      );
    });
  });

  describe('buildOtpRequest', () => {
    it('posts an authentication template to the Cloud API', () => {
      const { url, init } = buildOtpRequest('919840012345', '482913', config);

      expect(url).toBe(
        'https://graph.facebook.com/v23.0/1234567890/messages',
      );
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer meta-token',
      });
      expect(JSON.parse(init.body)).toEqual({
        messaging_product: 'whatsapp',
        to: '919840012345',
        type: 'template',
        template: {
          name: 'login_otp',
          language: { code: 'en' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: '482913' }] },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: '482913' }],
            },
          ],
        },
      });
    });

    it('strips "+" and spaces from the phone number', () => {
      const { init } = buildOtpRequest('+91 98400 12345', '482913', config);

      expect(JSON.parse(init.body).to).toBe('919840012345');
    });
  });

  describe('sendOtp', () => {
    it('resolves when WhatsApp accepts the message', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response('{"messages":[{"id":"wamid.1"}]}', { status: 200 }),
      );

      await expect(
        sendOtp(fetchFn, '919840012345', '482913', config),
      ).resolves.toBeUndefined();
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("throws with Meta's reason when WhatsApp rejects it", async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(
          '{"error":{"message":"Template name does not exist in the translation"}}',
          { status: 404 },
        ),
      );

      await expect(
        sendOtp(fetchFn, '919840012345', '482913', config),
      ).rejects.toThrow(
        'WhatsApp rejected the message: Template name does not exist in the translation',
      );
    });

    it('falls back to the HTTP status when the error body is not JSON', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response('Bad Gateway', { status: 502 }),
      );

      await expect(
        sendOtp(fetchFn, '919840012345', '482913', config),
      ).rejects.toThrow('WhatsApp rejected the message: HTTP 502');
    });
  });
});
