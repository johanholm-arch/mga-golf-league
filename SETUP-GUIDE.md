# League app: Setup Guide

This gets your league app online. It takes about 20 minutes, and you only do it once.
You'll use two free websites:

- **GitHub** stores the app's files.
- **Netlify** puts the app on the internet and stores your league's data.

---

## Part 1 — Put the files on GitHub

1. Unzip the app folder on your computer. You should see:
   `public`, `netlify`, `netlify.toml`, `package.json`, `package-lock.json`, `SETUP-GUIDE.md`
2. Go to **github.com** and create a free account (or sign in).
3. Click the **+** in the top-right corner → **New repository**.
4. Name it `mga-league`. Choose **Private**. Click **Create repository**.
5. On the next page, click the link **"uploading an existing file"**.
6. Select everything **inside** the app folder (the items above) and drag them onto the page.
   Drag the items themselves, not the folder they are in. Folders are uploaded with everything inside them.
7. Wait until all files finish uploading, then click the green **Commit changes** button.

✅ Check: your repository page should list `public`, `netlify`, `netlify.toml`, `package.json`, `package-lock.json` and `SETUP-GUIDE.md`.

---

## Part 2 — Choose two secret values

Write these down somewhere safe (a password manager is ideal). You'll paste them into Netlify in Part 3.

| Name | What it is | Example |
|---|---|---|
| `SESSION_SECRET` | A long random password that protects everyone's logins. At least 32 characters. Nobody ever types it; just make it long and random. | `k8Qz2vLw9Rt4Xp7Nb1Hs6Yc3Fm5Jd0Ga` |
| `SETUP_CODE` | A password you'll type **once**, to create your Commissioner account. | `FairwaysAndGreens26` |

Don't reuse the examples. Make up your own.

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
6. Click **Deploy**. Wait 1 to 2 minutes until it says **Published**.
7. Click the link Netlify shows (it ends in `.netlify.app`). That's your league's website.

**Optional, a nicer address:** go to **Project configuration → Change project name** and pick something like `mga-league`. Your address becomes `mga-league.netlify.app`.

**Missed step 5?** Go to **Project configuration → Environment variables**, add the two values, then go to **Deploys → Trigger deploy → Deploy project**.

---

## Part 4 — Create your Commissioner account

1. Open your website. It opens on **First-time setup**.
2. Enter the league's name, your name, your team's name, the League Year (e.g. `2027`), a PIN (4 to 6 digits) and your `SETUP_CODE`.
3. Click **Create league**. You're now signed in as League Commissioner and land on the **League** tab.
4. On the **League** tab, note the **join code** (change it to something easy to say out loud if you like) and enter your **home course** par and stroke index.
5. Go to **Roster**. Add the teams, then the players with their 9-hole starting handicaps. Set each player's **Role** (Player, Captain or Commissioner).
6. Go to **Schedule** and click **Generate schedule** with the date of your first night.

💡 **Tip:** make one other trusted person a Commissioner too. If you ever forget your own PIN, they can reset it for you.

---

## Part 5 — Invite your league

1. Send everyone the website address **and the join code**.
2. Anyone can **view** the league without signing in.
3. To make changes, each person goes to **Sign in → Set up your account**, picks their name, types the join code and chooses a PIN.
   (They must already be on the Roster.)
4. Next time, they use **Sign in** with their name and PIN. Phones stay signed in for 6 months.

---

## Who can do what

| | Player | Captain | Commissioner |
|---|---|---|---|
| View everything (no sign-in needed) | ✅ | ✅ | ✅ |
| Enter and correct scores, set pairs, record forfeits | ✅ | ✅ | ✅ |
| RSVP for the outing; edit own name, phone, email | own | own team | everyone |
| Add weeks and matchups, set tee times and formats | ❌ | ✅ | ✅ |
| Delete weeks, teams or players | ❌ | ❌ | ✅ |
| Roster: add teams and players, change roles, reset logins | ❌ | ❌ | ✅ |
| Generate the schedule, change the course, League Years, playoffs | ❌ | ❌ | ✅ |
| Join code, backups, Recently deleted (League tab) | ❌ | ❌ | ✅ |

The League Year the Commissioner selects is the one everyone sees.

---

## Before the first night: checklist

- [ ] Course par and stroke index entered (League tab)
- [ ] Every team and player on the Roster, with starting handicaps
- [ ] Schedule generated and tee times checked (Schedule tab)
- [ ] Join code sent to everyone, with the website address
- [ ] At least two people have set up accounts and tried entering a score on a phone
- [ ] A backup downloaded (League tab → Download a backup)

## On league night

1. Open **Scorecard**. It opens on this week's date; on a phone, pick the matchup.
2. Set the **pairs** if they are not already set (Change pairs).
3. Type each player's gross score per hole. Totals, net scores and points update as you type. "Saved ✓" at the top means it reached the server.
4. If a team doesn't show up, use **Record a forfeit**.
5. **Standings** updates straight away for everyone.

---

## Good to know

- **Every change is saved immediately**, one hole at a time. Several people can enter scores at once without getting in each other's way.
- **Deleted something by mistake?** Commissioner: League tab → Recently deleted → Restore. Items stay there for 30 days.
- **Forgotten PIN:** the Commissioner opens **Roster**, expands the team, and clicks **Reset login** next to that person. They then set up their account again with the join code.
- **5 wrong PINs** in a row locks that account for 15 minutes.
- **Backups:** the server keeps the last 200 saves on its own. Download a backup file (League tab) before the season and after the last night anyway.
- **Light or dark, bigger text:** each person can choose on the Account tab.

---

## Updating the app later

When you get a new version of the app:

1. In GitHub, open your `mga-league` repository.
2. Click **Add file → Upload files**, drag in the new `public` and `netlify` folders (and `package.json` and `package-lock.json` if they came with the update), and click **Commit changes**.
3. Netlify notices automatically and updates the site in about a minute. **Your league data is not affected.**

---

## If something goes wrong

| You see | What to do |
|---|---|
| "Server not configured: SESSION_SECRET…" or "SETUP_CODE…" | A value from Part 2 is missing or too short. Fix it in **Environment variables**, then **Trigger deploy**. |
| "Could not reach the league server" | Wait a minute and refresh. If it persists, check **Deploys** in Netlify for a failed deploy. |
| "Wrong setup code" | Type the `SETUP_CODE` exactly as saved in Netlify (capitals matter). |
| "Wrong join code" | The member should ask the Commissioner for the current code (League tab). Capitals don't matter for the join code. |
| "Too many attempts from this connection" | More than 30 sign-in attempts in an hour from one place (for example the clubhouse Wi-Fi). Wait an hour. |
| Page shows "Page not found" | In GitHub, check that `public`, `netlify`, `netlify.toml` and `package.json` sit at the top level of the repository, not inside another folder. |
| A red message stays at the top of the page | Read it; it says what was not saved and why. Click Dismiss, then redo that one change. |
