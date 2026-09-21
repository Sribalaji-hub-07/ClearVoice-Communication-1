import emailjs from '@emailjs/browser';

interface OTPRecord {
  code: string;
  email: string;
  expiresAt: number;
}

// In-memory OTP storage (not persisted — intentional for security)
let activeOTP: OTPRecord | null = null;

// Demo mode toast callback
let demoToastCallback: ((msg: string) => void) | null = null;

export function setDemoToastCallback(cb: (msg: string) => void) {
  demoToastCallback = cb;
}

export function isEmailJSConfigured(): boolean {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
  return !!(serviceId && templateId && publicKey && serviceId.trim() && templateId.trim() && publicKey.trim());
}

export function getActiveDemoOTP(): string | null {
  if (!activeOTP) return null;
  if (Date.now() > activeOTP.expiresAt) return null;
  return activeOTP.code;
}

export function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

export async function sendOTP(email: string): Promise<{ success: boolean; error?: string; isRealEmail: boolean }> {
  const code = generateOTP();
  const normalizedEmail = email.trim().toLowerCase();

  // Store OTP with 5-minute expiry
  activeOTP = {
    code,
    email: normalizedEmail,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };

  if (isEmailJSConfigured()) {
    try {
      await emailjs.send(
        import.meta.env.VITE_EMAILJS_SERVICE_ID as string,
        import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string,
        {
          to_email: normalizedEmail,
          otp_code: code,
          app_name: 'ClearVoice',
        },
        import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string,
      );
      return { success: true, isRealEmail: true };
    } catch (err: any) {
      console.error('EmailJS send failed, falling back to demo mode:', err);
      if (demoToastCallback) {
        demoToastCallback(`DEMO MODE · Your OTP is: ${code}`);
      }
      return { success: true, isRealEmail: false, error: err?.text || 'Email delivery failed; using on-screen OTP.' };
    }
  } else {
    // Demo mode — show OTP in toast and on-screen
    console.log(`[ClearVoice Demo] OTP for ${normalizedEmail}: ${code}`);
    if (demoToastCallback) {
      demoToastCallback(`DEMO MODE · Your OTP is: ${code}`);
    }
    return { success: true, isRealEmail: false };
  }
}

export function verifyOTP(email: string, code: string): { valid: boolean; error?: string } {
  if (!activeOTP) {
    return { valid: false, error: 'No OTP was generated. Please request a new one.' };
  }

  if (activeOTP.email !== email.trim().toLowerCase()) {
    return { valid: false, error: 'OTP was sent to a different email address.' };
  }

  if (Date.now() > activeOTP.expiresAt) {
    activeOTP = null;
    return { valid: false, error: 'OTP has expired. Please request a new one.' };
  }

  if (activeOTP.code !== code.trim()) {
    return { valid: false, error: 'Incorrect OTP. Please check the code and try again.' };
  }

  // OTP verified — clear it
  activeOTP = null;
  return { valid: true };
}

export function clearActiveOTP(): void {
  activeOTP = null;
}
