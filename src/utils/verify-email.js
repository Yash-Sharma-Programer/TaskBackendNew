import {
  emailTransportConfigured,
  verifyEmailTransport,
} from '../services/email.service.js';

if (!emailTransportConfigured) {
  console.error(
    'Brevo SMTP is not configured. Add SMTP_USER, SMTP_PASS and SMTP_FROM to server/.env.',
  );
  process.exitCode = 1;
} else {
  try {
    await verifyEmailTransport();
    console.log('Brevo SMTP connection verified successfully.');
  } catch (error) {
    console.error(`Brevo SMTP verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
