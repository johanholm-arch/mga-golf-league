# MGA — Setup Guide

This gets your league app online. It takes about 20 minutes, and you only do it once.
You'll use two free websites:

- **GitHub** stores your app's files.
- **Netlify** puts the app on the internet and stores your league's data.

---

## Part 1 — Put the files on GitHub

1. Unzip `mga-netlify.zip` on your computer. Open the `mga-netlify` folder. You should see:
   `public`, `netlify`, `netlify.toml`, `package.json`, `SETUP-GUIDE.md`
2. Go to **github.com** and create a free account (or sign in).
3. Click the **+** in the top-right corner → **New repository**.
4. Name it `mga-league`. Choose **Private**. Click **Create repository**.
5. On the next page, click the link **"uploading an existing file"**.
6. Select everything **inside** the `mga-netlify` folder (the 5 items above) and drag them onto the page.
   Drag the items themselves, not the `mga-netlify` folder.
7. Wait until all files finish uploading, then click the green **Commit changes** button.

✅ Check: your repository page should list `public`, `netlify`, `netlify.toml`, `package.json` and `SETUP-GUIDE.md`.

---

## Part 2 — Choose two secret values

Write these down somewhere safe (a password manager is ideal). You'll paste them into Netlify in Part 3.

| Name | What it is | Example |
|---|---|---|
| `SESSION_SECRET` | A long random password that protects everyone's logins. At least 32 characters. Nobody ever types it — just make it long and random. | `k8Qz2vLw9Rt4Xp7Nb1Hs6Yc3Fm5Jd0Ga` |
| `SETUP_CODE` | A password you'll type **once**, to create your Commissioner account. | `FairwaysAndGreens26` |

Don't reuse the examples — make up your own.

---

## Part 3 — Put the app online with Netlify

1. Go to **netlify.com** → **Sign up** → choose **Sign up with GitHub**. Approve the request.
2. Click **Add new project** (or **Add new site**) → **Import an existing project** → **GitHub**.
3. If asked, allow Netlify to access your GitHub. Pick the `mga-league` repository.
4. On the settings screen, **don't change the build settings.** The app already tells Netlify what to do.
5. On the same screen, click **Add environment variables** (you may need to click **Show advanced** first).
   Add the two values from Part 2:
   - Key `SESSION_SECRET` → your long random value
   - Key `SETUP_CODE` → your setup code
6. Click **Deploy**. Wait 1–2 minutes until it says **Published**.
7. Click the link Netlify shows (it ends in `.netlify.app`). That's your league's website.

**Optional — a nicer address:** go to **Project configuration → Change project name** and pick something like `mga-league`. Your address becomes `mga-league.netlify.app`.

**Missed step 5?** Go to **Project configuration → Environment variables**, add the two values, then go to **Deploys → Trigger deploy → Deploy project**.

---

## Part 4 — Create your Commissioner account

1. Open your website. It opens on the **Account** tab with **First-time setup**.
2. Enter your name, your team's name, the League Year (e.g. `2027`), a PIN (6+ characters), and your `SETUP_CODE`.
3. Click **Create league**. You're now signed in as League Commissioner.
4. Go to **Roster**. Add the teams, then the players. Set each player's **Role** (Player, Captain or Commissioner).

💡 **Tip:** make one other trusted person a Commissioner too. If you ever forget your own PIN, they can reset it for you.

---

## Part 5 — Invite your league

1. Send everyone the website link.
2. Anyone can **view** the league without signing in.
3. To make changes, each person goes to **Account → Set up your account**, picks their name, and chooses their own PIN.
   (They must already be on the Roster.)
4. Next time, they use **Account → Sign in** with their name and PIN.

---

## Who can do what

| | Commissioner | Captain / Player |
|---|---|---|
| View everything | ✅ | ✅ (no sign-in needed) |
| Enter scores, pairings, schedule, RSVPs, roster details | ✅ | ✅ (signed in) |
| Switch / add / delete League Years | ✅ | ❌ |
| Change the Course | ✅ | ❌ |
| Run the Playoffs | ✅ | ❌ |
| Change anyone's role | ✅ | ❌ |
| Reset someone's login (forgotten PIN) | ✅ | ❌ |

The League Year the Commissioner selects is the one everyone sees.

---

## Good to know

- **Your test data from the Claude version doesn't carry over.** The website starts fresh.
- **Updates from other people appear within about 5 seconds.** If two people save at the exact same moment, one of them sees a message asking them to redo their last change. Nothing gets silently overwritten.
- **Forgotten PIN:** the Commissioner opens **Roster**, expands the team, and clicks **Reset login** next to that person. They then set up a new PIN on the Account tab.
- **5 wrong PINs** in a row locks that account for 15 minutes.

---

## Updating the app later

When I give you a new version of `index.html`:

1. In GitHub, open your `mga-league` repository → open the `public` folder.
2. Click **Add file → Upload files**, drag in the new `index.html`, and click **Commit changes**.
3. Netlify notices automatically and updates the site in about a minute. **Your league data is not affected.**

---

## If something goes wrong

| You see | What to do |
|---|---|
| "Server not configured: SESSION_SECRET…" or "SETUP_CODE…" | A value from Part 2 is missing or too short. Fix it in **Environment variables**, then **Trigger deploy**. |
| "Could not reach the league server" | Wait a minute and refresh. If it persists, check **Deploys** in Netlify for a failed deploy. |
| "Wrong setup code" | Type the `SETUP_CODE` exactly as saved in Netlify (capitals matter). |
| Page shows "Page not found" | In GitHub, check that `public`, `netlify`, `netlify.toml` and `package.json` sit at the top level of the repository, not inside another folder. |
