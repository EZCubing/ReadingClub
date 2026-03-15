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

    // CALENDAR BOOKING LINK — Replace this with your Cal.com link once set up
    const BOOKING_LINK = 'https://cal.com/jennifer-jaramillo';

    // Email to the parent
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Jennifer Jaramillo <jennifer@jointhereadingclub.com>',
        reply_to: 'dj.jaramillo99@gmail.com',
        to: parentEmail,
        subject: `Summer Reading & Math Club — Next Steps ☀️📚➕`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #4CAF50, #81C784); padding: 28px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 26px;">Summer Reading &amp; Math Club 2026</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">☀️ Building confident learners, one lesson at a time</p>
            </div>
            <div style="background: #ffffff; padding: 32px; border: 1px solid #e0e0e0; border-radius: 0 0 12px 12px;">

              <p style="color: #333; line-height: 1.8; font-size: 15px;">Dear ${parentName},</p>

              <p style="color: #333; line-height: 1.8; font-size: 15px;">Thank you for your interest in the <strong>Summer Reading &amp; Math Club 2026!</strong> I am excited about the opportunity to support <strong>${childName}</strong>'s learning this summer.</p>

              <p style="color: #333; line-height: 1.8; font-size: 15px;">To ensure students are placed in the most effective small group, I conduct a <strong>brief assessment</strong> prior to the start of sessions. This allows me to better understand your child's current skills and learning needs.</p>

              <div style="background: #FFF8E7; border-radius: 10px; padding: 20px; margin: 24px 0; border-left: 4px solid #F4D03F;">
                <h3 style="color: #333; margin: 0 0 12px; font-size: 16px;">Assessment Details</h3>
                <p style="color: #555; margin: 6px 0; font-size: 14px;">📍 <strong>Location:</strong> In-person, one-on-one</p>
                <p style="color: #555; margin: 6px 0; font-size: 14px;">⏰ <strong>Duration:</strong> Approximately 20–30 minutes</p>
                <p style="color: #555; margin: 6px 0; font-size: 14px;">💛 <strong>Cost:</strong> No cost — included as part of registration</p>
              </div>

              <div style="text-align: center; margin: 28px 0;">
                <a href="${BOOKING_LINK}" style="background: #4CAF50; color: white; padding: 16px 36px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">📅 Schedule Your Assessment</a>
                <p style="color: #888; font-size: 13px; margin-top: 10px;">Click the button to choose a date and time that works for you</p>
              </div>

              <p style="color: #333; line-height: 1.8; font-size: 15px;">If you have any questions or need to suggest an alternative time, simply reply to this email or call me directly.</p>

              <p style="color: #333; line-height: 1.8; font-size: 15px;">After the assessment, you will receive <strong>session placement, schedule options, and tuition details</strong>.</p>

              <p style="color: #333; line-height: 1.8; font-size: 15px;">Thank you again for your interest. I look forward to meeting <strong>${childName}</strong> and helping them grow in confidence and skills this summer!</p>

              <p style="color: #333; line-height: 1.8; font-size: 15px;">Warmly,</p>

              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;" />
              <table style="width: 100%;">
                <tr>
                  <td style="vertical-align: top; padding-right: 16px;">
                    <p style="margin: 0; font-size: 15px;"><strong style="color: #2E7D32;">Mrs. Jennifer Jaramillo</strong></p>
                    <p style="margin: 4px 0 0; color: #888; font-size: 13px;">M.Ed. | Level 3 Teacher | 20+ Years Experience</p>
                    <p style="margin: 4px 0 0; color: #888; font-size: 13px;">Summer Reading &amp; Math Club</p>
                    <p style="margin: 8px 0 0; font-size: 13px;">
                      📞 <a href="tel:5053068309" style="color: #4CAF50; text-decoration: none;">(505) 306-8309</a><br />
                      ✉️ <a href="mailto:dj.jaramillo99@gmail.com" style="color: #4CAF50; text-decoration: none;">dj.jaramillo99@gmail.com</a><br />
                      🌐 <a href="https://jointhereadingclub.com" style="color: #4CAF50; text-decoration: none;">jointhereadingclub.com</a>
                    </p>
                  </td>
                </tr>
              </table>
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
        subject: `🔔 New Registration: ${childName} (${grade}, ${club})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #1E88E5; padding: 20px; border-radius: 12px 12px 0 0;">
              <h2 style="color: white; margin: 0;">🔔 New Registration</h2>
            </div>
            <div style="background: #ffffff; padding: 24px; border: 1px solid #e0e0e0; border-radius: 0 0 12px 12px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 10px 0; color: #888; width: 140px; border-bottom: 1px solid #f0f0f0;">Child's Name</td><td style="padding: 10px 0; font-weight: bold; border-bottom: 1px solid #f0f0f0;">${childName}</td></tr>
                <tr><td style="padding: 10px 0; color: #888; border-bottom: 1px solid #f0f0f0;">Grade</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${grade}</td></tr>
                <tr><td style="padding: 10px 0; color: #888; border-bottom: 1px solid #f0f0f0;">Program</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${club}</td></tr>
                <tr><td style="padding: 10px 0; color: #888; border-bottom: 1px solid #f0f0f0;">Parent</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">${parentName}</td></tr>
                <tr><td style="padding: 10px 0; color: #888;">Email</td><td style="padding: 10px 0;"><a href="mailto:${parentEmail}" style="color: #1E88E5;">${parentEmail}</a></td></tr>
              </table>
              <div style="margin-top: 24px; display: flex; gap: 12px;">
                <a href="https://jointhereadingclub.com/admin.html" style="background: #4CAF50; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Open Dashboard</a>
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
