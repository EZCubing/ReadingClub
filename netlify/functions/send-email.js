exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { parentName, parentEmail, childName, grade, club } = JSON.parse(event.body);

    if (!parentEmail || !childName) {
      return { statusCode: 400, body: 'Missing required fields' };
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    // Email to the parent
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Jennifer Jaramillo <jennifer@jointhereadingclub.com>',
        to: parentEmail,
        subject: `Thank you for registering ${childName} for Reading Club!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #4CAF50; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Reading Club</h1>
            </div>
            <div style="background: #ffffff; padding: 32px; border: 1px solid #e0e0e0; border-radius: 0 0 12px 12px;">
              <h2 style="color: #2E7D32; margin-top: 0;">Thank you for your interest, ${parentName}!</h2>
              <p style="color: #555; line-height: 1.7;">We've received your registration for <strong>${childName}</strong> (${grade}, ${club}).</p>
              <p style="color: #555; line-height: 1.7;">Here's what happens next:</p>
              <ol style="color: #555; line-height: 2;">
                <li>We'll contact you to <strong>schedule a one-on-one assessment</strong> for ${childName}</li>
                <li>After the assessment, we'll determine the best placement</li>
                <li>You'll receive session details and schedule options by email</li>
              </ol>
              <p style="color: #555; line-height: 1.7;">We look forward to meeting your family!</p>
              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;" />
              <p style="color: #888; font-size: 13px;">
                <strong>Jennifer Jaramillo</strong> — Founder, Reading Club<br />
                M.Ed. | Level 3 Teacher | 20+ Years Experience<br />
                <a href="mailto:dj.jaramillo99@gmail.com" style="color: #4CAF50;">dj.jaramillo99@gmail.com</a> | (505) 306-8309<br />
                <a href="https://jointhereadingclub.com" style="color: #4CAF50;">jointhereadingclub.com</a>
              </p>
            </div>
          </div>
        `,
      }),
    });

    // Email to Jennifer (admin notification)
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Jennifer Jaramillo <jennifer@jointhereadingclub.com>',
        to: 'dj.jaramillo99@gmail.com',
        subject: `New Registration: ${childName} (${grade}, ${club})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #1E88E5; padding: 20px; border-radius: 12px 12px 0 0;">
              <h2 style="color: white; margin: 0;">New Registration</h2>
            </div>
            <div style="background: #ffffff; padding: 24px; border: 1px solid #e0e0e0; border-radius: 0 0 12px 12px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #888; width: 140px;">Child's Name</td><td style="padding: 8px 0; font-weight: bold;">${childName}</td></tr>
                <tr><td style="padding: 8px 0; color: #888;">Grade</td><td style="padding: 8px 0;">${grade}</td></tr>
                <tr><td style="padding: 8px 0; color: #888;">Program</td><td style="padding: 8px 0;">${club}</td></tr>
                <tr><td style="padding: 8px 0; color: #888;">Parent</td><td style="padding: 8px 0;">${parentName}</td></tr>
                <tr><td style="padding: 8px 0; color: #888;">Email</td><td style="padding: 8px 0;"><a href="mailto:${parentEmail}">${parentEmail}</a></td></tr>
              </table>
              <div style="margin-top: 20px;">
                <a href="https://jointhereadingclub.com/admin.html" style="background: #4CAF50; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Open Dashboard</a>
              </div>
            </div>
          </div>
        `,
      }),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error('Email error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send email' }),
    };
  }
};
