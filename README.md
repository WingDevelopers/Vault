# WalletWing

A private personal-finance web app built mainly for iPhone, with a midnight-navy and electric-blue look.
You install it from Safari with **Add to Home Screen**. It works offline, and **all data stays on your device** in IndexedDB. There's no backend, no sign-up and no tracking.

It's built with React, TypeScript and Vite, uses Dexie (IndexedDB) for storage, and uses vite-plugin-pwa to work offline. It's hosted free on GitHub Pages.

---

## 1. Run it on your Windows PC

**Install Node.js once.** Download the **LTS** version from <https://nodejs.org> and install it with the default options.

**Start the app:**

1. Unzip the project, for example to `Documents\walletwing`.
2. Open the folder in File Explorer. Right-click an empty area and choose **Open in Terminal** (or type `powershell` in the address bar and press Enter).
3. Run:

   ```powershell
   npm install
   npm run dev
   ```

4. Open <http://localhost:5173> in Chrome or Edge. Press `F12` and turn on the phone toolbar to see it at iPhone size.

Press `Ctrl + C` in the terminal to stop it.

## 2. Quick look on your iPhone (same Wi-Fi)

```powershell
npm run dev:phone
```

The terminal shows a **Network** address such as `http://192.168.1.25:5173`. Open it in Safari on your iPhone.
If Windows asks about the firewall, allow **Private networks**.

> This is only a preview. Over plain `http://`, iPhone won't allow offline mode, App Lock or encrypted backups. Don't enter real data here, because it's stored under this temporary address. For real use, publish the app (step 3).

## 3. Publish to GitHub Pages (same flow as Atlas)

The repo includes `.github/workflows/deploy.yml`. Every push to `main` runs the tests, builds the app and publishes it to GitHub Pages. The build works at any repo path, so you don't need to change any settings.

**One-time setup:**

1. On GitHub, create a new repository, for example `walletwing`. It can be private, but GitHub Pages on a private repo needs a paid plan, so public is fine. Only the app's code is public; your financial data never leaves your phone.
2. Push this folder to it. Use either option:
   - **GitHub Desktop:** *File → Add local repository* → pick the folder → *Publish repository*.
   - **Command line** (needs Git):

     ```powershell
     git remote add origin https://github.com/<your-user>/walletwing.git
     git push -u origin main
     ```

3. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
4. Open the **Actions** tab and wait for the green check, which takes about a minute. Your app is then live at
   **`https://<your-user>.github.io/walletwing/`**

**After that:** edit, commit and push. The site updates on its own, and the installed app picks up the new version the next time you open it.

## 4. Install on your iPhone

1. Open your GitHub Pages address in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Open **WalletWing** from your Home Screen. It runs full-screen and works in Airplane Mode.
4. Choose your currency and add your accounts, or tap **Explore with demo data** to look around first.

Important things to know:

- **Your data is tied to this exact address and to the Home Screen app.** The Home Screen app has its own storage, separate from Safari tabs. Enter your real data in the Home Screen app, and keep using the same URL. If you rename the repo, the URL changes and the app starts empty.
- **Back up regularly:** *Settings → Backup & restore → Export backup*. You'll get an encrypted `.json` file; save it to Files or iCloud Drive. To move to a new phone or URL, restore that file.
- **App Lock:** *Settings → App lock*. You set a PIN, and you can also turn on Face ID.

## Features

These match the earlier SwiftUI version:

- **Home:** net worth with a 12-month chart you can drag across, plus available cash, portfolio value, income, expenses, savings and savings rate. You can switch between this month, last month or a custom period. It also shows your primary goal and recent activity.
- **Activity:** income, expenses and transfers in ₡ or $, with categories, accounts and notes. You can search, filter, go month by month or see all time, and see spending by category. Repeating transactions (salary, subscriptions) are posted automatically, including any missed while the app was closed.
- **Budget:** one monthly spending allowance with a per-day pace, plus optional budgets per category. Rollover is off unless you turn it on, and overspending never carries into the next month.
- **Investments:** enter contributions, withdrawals and market values by hand. The app shows invested capital, value, unrealized gain, allocation, and value against contributions over time. It never fetches prices.
- **Goals:** multiple goals (for example *The Nest*), money set aside for each, amount remaining, estimated finish date, and the monthly amount needed to hit a target date.
- **Accounts and categories:** bank, cash, savings and investment-cash accounts with opening balances. You can archive or delete accounts, and add, edit, recolor, reorder or delete categories.
- **Privacy:**
  - Optional PIN or Face ID lock.
  - A *Hide amounts* mode.
  - The screen is covered when the app goes to the background.
  - Backups are encrypted with AES-256.
- **Import and export:**
  - A full JSON backup, encrypted or not, that you can restore.
  - Transactions as CSV to open in Excel or Numbers, and CSV import using the same columns.

### How the money math works

- Amounts are stored as **whole cents**, so totals are always exact.
- **Transfers** are never counted as income or spending. Transfers between currencies store the amount that arrived.
- Each transaction **saves the ₡/$ rate it was entered with**. Changing the rate later doesn't change past totals.
- Colones and dollars are **never added together silently**. A combined total always shows the rate used next to it.
- **Investing doesn't double-count.** A contribution moves money out of an account and into the holding, so net worth stays the same.
- **Deposits aren't returns.** An investment's value is its last market value plus any contributions made after that date. A gain only appears once you enter a market value.
- **Goals are labels.** Setting money aside for a goal doesn't move it between accounts or change net worth.

## Project layout

```
src/
  core/      Pure TypeScript finance logic + tests (money, dates, ledger, portfolio, budgets, goals, recurrence)
  db/        IndexedDB (Dexie): schema, saving and deleting, demo data, backups/CSV + tests
  ui/        Design system: components, charts (hand-made SVG), icons
  screens/   Home, Activity, Budget, Investments, Goals, Settings, Onboarding, editors, lock
  App.tsx    Tab bar, navigation, + button, lock & privacy screens
public/      App icons
.github/workflows/deploy.yml   Test → build → GitHub Pages
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts a local dev server at <http://localhost:5173> |
| `npm run dev:phone` | Same, but reachable from your phone on the same Wi-Fi |
| `npm test` | Runs the 26 tests for the money math and data storage |
| `npm run build` | Builds the production site into `dist/` |
| `npm run preview -- --host` | Serves the production build, with offline support, at <http://localhost:4173> |

## Privacy notes

- Nothing is ever sent over the network. The service worker only caches the app's own files.
- iOS encrypts the app's storage, tied to your device passcode. App Lock controls *who can open* the app; it doesn't add another layer of encryption.
- Apps under the same `<you>.github.io` domain (Atlas, for example) share a browser origin. That means they can technically read each other's storage. This app uses its own database name, so nothing collides. Only host apps you trust on that domain.
