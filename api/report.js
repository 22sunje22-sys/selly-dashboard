const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;
const AHMED_SLACK_ID = 'U0A6YEGD6GY';

async function asanaRequest(endpoint, options = {}) {
  const ASANA_PAT = process.env.ASANA_PAT;
  const res = await fetch(`https://app.asana.com/api/1.0${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${ASANA_PAT}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Asana API error: ${JSON.stringify(data)}`);
  return data;
}

async function findSellyProjectAndAhmed() {
  const { data: workspaces } = await asanaRequest('/workspaces');
  for (const workspace of workspaces) {
    const { data: projects } = await asanaRequest(`/projects?workspace=${workspace.gid}&limit=100`);
    const sellyProject = projects.find(p => p.name.toLowerCase().includes('selly'));
    if (sellyProject) {
      const { data: users } = await asanaRequest(`/users?workspace=${workspace.gid}&opt_fields=name,email&limit=100`);
      const ahmed = users.find(u => u.name.toLowerCase().includes('ahmed'));
      if (!ahmed) throw new Error('Could not find Ahmed in workspace');
      return { projectGid: sellyProject.gid, workspaceGid: workspace.gid, ahmedGid: ahmed.gid };
    }
  }
  throw new Error('Could not find Selly project in Asana');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.ASANA_PAT) throw new Error('ASANA_PAT environment variable not set');

    const { feature, issueType, severity, description, steps, reporter, expectedVsActual } = req.body;
    if (!description) return res.status(400).json({ error: 'Description is required' });

    const { projectGid, ahmedGid } = await findSellyProjectAndAhmed();

    const taskNotes = [
      `🐛 Bug Report from Selly Dashboard`,
      ``,
      `Reporter: ${reporter || 'Unknown'}`,
      `Feature: ${feature}`,
      `Issue Type: ${issueType}`,
      `Severity: ${severity}`,
      ``,
      `Description:`,
      description,
      ``,
      steps ? `Steps to Reproduce:\n${steps}` : null,
      expectedVsActual ? `Expected vs Actual:\n${expectedVsActual}` : null,
    ].filter(Boolean).join('\n');

    const taskTitle = `[${severity}] ${feature}: ${description.substring(0, 60)}${description.length > 60 ? '...' : ''}`;

    const { data: task } = await asanaRequest('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          name: taskTitle,
          notes: taskNotes,
          assignee: ahmedGid,
          projects: [projectGid]
        }
      })
    });

    const taskUrl = `https://app.asana.com/0/${projectGid}/${task.gid}`;

    const slackMessage = {
      text: `🐛 *New Bug Report* — <@${AHMED_SLACK_ID}> needs your attention!`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: '🐛 New Bug Report from Selly Dashboard' } },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Reporter:*\n${reporter || 'Unknown'}` },
            { type: 'mrkdwn', text: `*Feature:*\n${feature}` },
            { type: 'mrkdwn', text: `*Issue Type:*\n${issueType}` },
            { type: 'mrkdwn', text: `*Severity:*\n${severity}` }
          ]
        },
        { type: 'section', text: { type: 'mrkdwn', text: `*Description:*\n${description}` } },
        steps ? { type: 'section', text: { type: 'mrkdwn', text: `*Steps to Reproduce:*\n${steps}` } } : null,
        expectedVsActual ? { type: 'section', text: { type: 'mrkdwn', text: `*Expected vs Actual:*\n${expectedVsActual}` } } : null,
        { type: 'section', text: { type: 'mrkdwn', text: `<@${AHMED_SLACK_ID}> — assigned to you in Asana: <${taskUrl}|View Task>` } }
      ].filter(Boolean)
    };

    await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage)
    });

    res.status(200).json({ success: true, taskUrl, taskGid: task.gid });
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ error: error.message });
  }
};
