const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

const SLACK_IDS = {
  'Cosmin': 'U07UZFZK6BN',
  'Paul': 'U042PH2AF0C',
  'Osama': 'U03TW0TEX5B',
  'Alexandra': 'U02SQH3RXPV',
  'Ahmed': 'U04S96Y1FGZ',
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!SLACK_WEBHOOK) throw new Error('SLACK_WEBHOOK_URL environment variable not set');

    const { assignee, assignedBy, eventTitle, eventUrl } = req.body;
    if (!assignee || !assignedBy || !eventTitle) {
      return res.status(400).json({ error: 'assignee, assignedBy, and eventTitle are required' });
    }

    const assigneeSlackId = SLACK_IDS[assignee];
    const mentionSuffix = assigneeSlackId ? ` <@${assigneeSlackId}>` : '';

    const slackMessage = {
      text: `🔔 ${assignedBy} assigned ${assignee} to a new lead`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🔔 New Lead Assignment' }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${assignedBy}* assigned *${assignee}*${mentionSuffix} to a new lead:`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: eventUrl
              ? `📌 *<${eventUrl}|${eventTitle}>*`
              : `📌 *${eventTitle}*`
          }
        }
      ]
    };

    await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage)
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Slack notification error:', error);
    res.status(500).json({ error: error.message });
  }
};
