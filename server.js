const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ──────────────────────────────────────────────
//  Strona główna – HTML + JS
// ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Roblox Cookie Extractor & Checker</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f0f17;
      color: #e0e0ff;
      margin: 0;
      padding: 20px;
      line-height: 1.5;
    }
    .container { max-width: 780px; margin: 0 auto; }
    h1 { color: #6ab0ff; text-align: center; }
    textarea {
      width: 100%;
      min-height: 220px;
      background: #1a1a2e;
      color: #d0d0ff;
      border: 1px solid #334;
      border-radius: 8px;
      padding: 14px;
      font-family: Consolas, monospace;
      font-size: 14px;
      resize: vertical;
      margin: 16px 0;
    }
    button {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 14px 36px;
      font-size: 16px;
      border-radius: 6px;
      cursor: pointer;
      display: block;
      margin: 0 auto 24px;
    }
    button:hover { background: #2563eb; }
    #result {
      background: #1a1a2e;
      border: 1px solid #334;
      border-radius: 8px;
      padding: 20px;
      min-height: 180px;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .error   { color: #ff6b6b; font-weight: bold; }
    .success { color: #4ade80; font-weight: bold; }
    .loading { color: #fbbf24; font-style: italic; }
    img#avatar {
      max-width: 160px;
      border-radius: 10px;
      border: 2px solid #334;
      margin: 12px 0;
      display: block;
    }
  </style>
</head>
<body>
<div class="container">
  <h1>Roblox Cookie Checker (automatyczne wyciąganie)</h1>

  <p>Wklej dowolny tekst zawierający cookie (logi, konsola, request headers, JSON itp.)<br>
  Wartość zostanie automatycznie wyciągnięta, jeśli znajduje się pomiędzy <code>-and-items.|_</code> i <code>",</code></p>

  <textarea id="input" placeholder="Wklej tutaj cały fragment tekstu..."></textarea>

  <button onclick="check()">Sprawdź konto</button>

  <div id="result"></div>
</div>

<script>
async function check() {
  const raw = document.getElementById('input').value.trim();
  const result = document.getElementById('result');

  result.innerHTML = '';

  if (!raw) {
    result.innerHTML = '<span class="error">Nic nie wklejono</span>';
    return;
  }

  // Wyciąganie cookie - dokładnie wg Twojego wzorca
  const regex = /-and-items\.\|_(.*?)(?=",\s*)/s;
  const match = raw.match(regex);

  let cookie = null;
  if (match && match[1]) {
    cookie = match[1].trim();
  }

  if (!cookie || cookie.length < 180 || !cookie.startsWith('_')) {
    result.innerHTML = '<span class="error">Nie znaleziono poprawnego .ROBLOSECURITY w podanym tekście</span>';
    return;
  }

  result.innerHTML = '<span class="loading">Znaleziono cookie – sprawdzam konto...</span>';

  try {
    const res = await fetch('/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie })
    });

    if (!res.ok) throw new Error('Błąd serwera: ' + res.status);

    const json = await res.json();

    if (json.error) {
      result.innerHTML = \`<span class="error">Błąd: \${json.error}</span>\`;
      return;
    }

    let html = \`<span class="success">Konto sprawdzone pomyślnie!</span><br><br>\`;

    if (json.avatarUrl) {
      html += \`<img id="avatar" src="\${json.avatarUrl}" alt="Avatar"><br>\`;
    }

    html += \`
      <b>Username:</b> \${json.username || '?'}<br>
      <b>User ID:</b> \${json.userId || '?'}<br>
      <b>Premium:</b> \${json.hasPremium ? 'True' : 'False'}<br>
      <b>Email Verified:</b> \${json.emailVerified ? 'True' : 'False'}<br>
      <b>Robux:</b> \${json.robux?.toLocaleString('en-US') || 0}<br>
      <b>Headless:</b> \${json.hasHeadless ? 'True' : 'False'}<br>
      <b>Korblox:</b> \${json.hasKorblox ? 'True' : 'False'}<br>
      <b>MM2 passes:</b> \${json.mm2Count || 0}<br>
      <b>AMP passes:</b> \${json.ampCount || 0}<br>
      <b>SAB passes:</b> \${json.sabCount || 0}<br>
      <b>Account age (days):</b> \${json.accountAgeDays || '?'}<br>
      <b>Created:</b> \${json.created !== 'failed' ? new Date(json.created).toLocaleDateString('en-US') : '?'}
    \`;

    result.innerHTML = html;

  } catch (err) {
    result.innerHTML = \`<span class="error">Błąd podczas sprawdzania: \${err.message}</span>\`;
  }
}
</script>
</body>
</html>
  `);
});

// ──────────────────────────────────────────────
// Endpoint /check – backend sprawdzający cookie
// ──────────────────────────────────────────────
app.post('/check', async (req, res) => {
  const { cookie } = req.body || {};
  if (!cookie || typeof cookie !== 'string' || cookie.length < 180) {
    return res.status(400).json({ error: 'Missing or invalid cookie' });
  }

  try {
    // ─────── CSRF ───────
    const tokenRes = await fetch('https://auth.roblox.com/v2/logout', {
      method: 'POST',
      headers: {
        'Cookie': `.ROBLOSECURITY=${cookie}`,
        'Content-Type': 'application/json'
      }
    });
    const csrfToken = tokenRes.headers.get('x-csrf-token');
    if (!csrfToken) throw new Error('Failed to get CSRF token');

    // ─────── Dane użytkownika ───────
    const userRes = await fetch('https://users.roblox.com/v1/users/authenticated', {
      headers: {
        'Cookie': `.ROBLOSECURITY=${cookie}`,
        'X-CSRF-TOKEN': csrfToken,
        'Accept': 'application/json'
      }
    });
    if (!userRes.ok) throw new Error('Invalid cookie');
    const user = await userRes.json();

    // ─────── Email verified (hat) ───────
    let emailVerified = false;
    try {
      const owns = await fetch(`https://inventory.roblox.com/v1/users/${user.id}/items/Asset/102611803`, {
        headers: { 'Cookie': `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': csrfToken }
      });
      if (owns.ok) {
        const d = await owns.json();
        emailVerified = !!d.data?.length;
      }
    } catch {}

    // ─────── Premium ───────
    let hasPremium = false;
    try {
      const prem = await fetch(`https://premiumfeatures.roblox.com/v1/users/${user.id}/validate-membership`, {
        headers: { 'Cookie': `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': csrfToken }
      });
      if (prem.ok) hasPremium = await prem.json();
    } catch {}

    // ─────── Robux ───────
    let robux = 0;
    try {
      const cur = await fetch(`https://economy.roblox.com/v1/users/${user.id}/currency`, {
        headers: { 'Cookie': `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': csrfToken }
      });
      if (cur.ok) {
        const d = await cur.json();
        robux = d.robux || 0;
      }
    } catch {}

    // ─────── Data utworzenia + wiek ───────
    let created = null;
    let accountAgeDays = 0;
    try {
      const prof = await fetch(`https://users.roblox.com/v1/users/${user.id}`);
      if (prof.ok) {
        const p = await prof.json();
        if (p.created) {
          created = p.created;
          accountAgeDays = Math.floor((Date.now() - new Date(created).getTime()) / 86400000);
        }
      }
    } catch {}

    // ─────── Avatar ───────
    let avatarUrl = null;
    try {
      const thumb = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.id}&size=720x720&format=Png&isCircular=false`);
      if (thumb.ok) {
        const t = await thumb.json();
        avatarUrl = t.data?.[0]?.imageUrl;
      }
    } catch {}

    // ─────── Gamepasses (przykładowe ID – możesz zmienić) ───────
    const mm2Ids = [429957, 1308795];
    const ampIds = [189425850, 951065968, 951441773, 6408694, 60406961585546290, 7124470, 6965379, 3196348, 5300198];
    const sabIds = [1227013099, 1229510262, 1228591447];
    const all = [...mm2Ids, ...ampIds, ...sabIds];

    let mm2Count = 0, ampCount = 0, sabCount = 0;

    for (const id of all) {
      try {
        const r = await fetch(`https://inventory.roblox.com/v1/users/${user.id}/items/GamePass/${id}`, {
          headers: { 'Cookie': `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': csrfToken }
        });
        if (r.ok) {
          const d = await r.json();
          if (d.data?.length) {
            if (mm2Ids.includes(id)) mm2Count++;
            if (ampIds.includes(id)) ampCount++;
            if (sabIds.includes(id)) sabCount++;
          }
        }
      } catch {}
    }

    // ─────── Headless / Korblox (bundle) ───────
    let hasHeadless = false, hasKorblox = false;
    try {
      const h = await fetch(`https://inventory.roblox.com/v1/users/${user.id}/items/Bundle/201`, {
        headers: { 'Cookie': `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': csrfToken }
      });
      if (h.ok) {
        const d = await h.json();
        hasHeadless = !!d.data?.length;
      }

      const k = await fetch(`https://inventory.roblox.com/v1/users/${user.id}/items/Bundle/192`, {
        headers: { 'Cookie': `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': csrfToken }
      });
      if (k.ok) {
        const d = await k.json();
        hasKorblox = !!d.data?.length;
      }
    } catch {}

    res.json({
      success: true,
      username: user.name,
      userId: user.id,
      hasPremium,
      robux,
      accountAgeDays,
      created: created || 'failed',
      avatarUrl,
      emailVerified,
      hasHeadless,
      hasKorblox,
      mm2Count,
      ampCount,
      sabCount
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});
