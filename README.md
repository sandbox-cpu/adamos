# Personal AI operating system

A private, beautiful workspace where a team of AI agents takes work off your plate. It covers projects, the calendar, research, decks, landing pages, press work, pictures and live voice calls, and shows your Obsidian notes as a living 3D brain.

Everything runs in the browser. There is no server and no account: your work and your keys stay on your computer.

The OS is named after its owner, so Adam gets **AdamOS**. It is a generic template, with no client branding.

---

## What's inside

| Area | What it does |
| --- | --- |
| **Home** | A cinematic 3D welcome ("Good morning, Adam"), today's meetings, what needs attention, a morning brief and the time your team has saved you. |
| **Agents** | One lead agent (your chief of staff) who delegates to specialists. Hire from a bank of ready-made roles (PR, marketing, legal, competitor research, technical, crisis, social and more) or describe a new one. Give each agent a personality, house rules and memories, and choose which AI it thinks with. |
| **Direct and Huddle** | Chat one to one, or bring up to four agents into a group discussion that ends with a wrap-up and actions. |
| **Mastermind** | A structured planning session with several agents that produces a plan of action: objectives, next 48 hours, milestones, workstreams, risks and measures. Send it to your task board, calendar or a deck in one click. |
| **Projects** | Boards with drag and drop. Agents can do tasks for you and hand them back for review. |
| **Calendar** | Week, month and agenda views. Connect Google Calendar or any calendar link, or import a file. "Prep me for this" briefs you before a meeting. |
| **Brain** | Your Obsidian vault as a 3D map (brain, neural and galaxy views). Open notes, follow links, and ask your brain questions. |
| **Research Lab** | Market, competitor, audience and trend research, with sources, ready to turn into a deck. |
| **Deck Studio** | Decks written and designed from a brief, edited by asking, presented full screen, and exported to PowerPoint or PDF. |
| **Landing Pages** | Launch pages, event sign-ups and campaign microsites. Click any part of the page to edit it, or ask for changes in plain English. Preview on computer, tablet and phone, then download one file and put it online. |
| **Media Studio** | Pictures from a sentence using free services, a social graphics maker for posts and stories, and a library shared with decks and pages. |
| **Press Office** | Press releases, pitches, statements and social posts; media contacts; coverage tracking with charts and reports. |
| **Live** | Talk to any agent out loud, share your screen or camera, and get a transcript, summary and tasks at the end. |
| **Vault** | API keys stored with strong encryption, unlocked with your passphrase. |

Nothing is shown as code or settings files: everything is done with plain-English prompts and visual controls.

---

## Getting started

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The first visit walks through five short steps: your name, the look, connecting an AI, linking your Obsidian vault, and meeting your team. You can skip any of them and come back later.

Without an AI connected, everything works in **demo mode** with sample answers, so you can explore safely.

### Putting it online

```bash
npm run build
```

This creates a `dist` folder that can be hosted anywhere that serves plain files. It works from a domain or a sub-folder, with no extra setup.

- **Netlify Drop:** drag the `dist` folder onto [app.netlify.com/drop](https://app.netlify.com/drop).
- **Cloudflare Pages, Vercel or any web host:** upload the `dist` folder.
- **GitHub Pages:** in the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**. Then open **Actions → Deploy to GitHub Pages → Run workflow**.

The site must be served over **https** (or `localhost`) for the microphone, screen sharing and folder linking to work.

---

## Connecting an AI

Go to **Settings → AI → Connect**. Pick a service, paste its key and choose a model. Keys go into the encrypted vault in your browser and are only ever sent to the service they belong to. You can add several connections and choose which one each agent uses (**Agents → an agent → Thinks with**).

| Service | Get a key | Notes |
| --- | --- | --- |
| **Claude** (Anthropic), recommended | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | Web research uses Claude's web search tool. An organisation admin must switch web search on in the Claude Console first. |
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Also powers OpenAI Realtime voice calls and OpenAI pictures. |
| **Gemini** (Google) | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | Has a free tier. Also powers Gemini Live voice calls and Gemini pictures. |
| **OpenRouter** | [openrouter.ai/keys](https://openrouter.ai/keys) | Many models behind one key. |
| **Perplexity** | [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api) | Research with built-in web search. |
| **Groq** | [console.groq.com/keys](https://console.groq.com/keys) | Very fast open models. |
| **Mistral** | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) | |
| **DeepSeek** | [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) | |
| **Grok** (xAI) | [console.x.ai](https://console.x.ai) | |
| **Ollama** (free and private, runs on your computer) | [ollama.com/download](https://ollama.com/download) | Let the browser reach it by setting `OLLAMA_ORIGINS` to the site's address (for example `http://localhost:5173`), then restart Ollama. |
| **Other** | | Any OpenAI-compatible service: add its address and key. |

**Refusal fallbacks on Claude Opus 5 and Claude Fable 5.1.** For these two models, refusal fallbacks are switched on. If the model declines a request, the answer carries on automatically on a fallback Claude model instead of stopping, and a small notice says so. If an account doesn't support this, the app notices and simply continues without it.

---

## Live calls (voice and screen sharing)

Open **Live**, choose who picks up and how they talk:

| Option | Needs | Best for |
| --- | --- | --- |
| **Gemini Live** | A Gemini key (free tier available) | The most natural two-way conversation. It watches your shared screen as you talk. |
| **OpenAI Realtime** | An OpenAI key | Natural two-way conversation. It sees your screen through regular snapshots. |
| **Browser voice** | Chrome, Edge or Safari | Talking to any connected AI, including Claude. Your browser listens and speaks, and a snapshot of your screen goes with each question. |

The microphone, screen and camera are only used while a call is on, and sound and pictures go straight from the browser to the service you choose. After a call you get a summary, can add the agreed actions to your tasks, and can save the whole conversation to your brain.

---

## Pictures and social graphics

Choose the picture service in **Settings → Integrations → Image generation**.

- **Pollinations** (the default) is free and needs no account. Without a key it makes about one picture every 15 seconds, and the Media Studio shows a countdown while pictures wait their turn. A free key from [enter.pollinations.ai](https://enter.pollinations.ai), added in the Vault, makes it faster.
- **Hugging Face** is free with an account token from [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens), within its monthly allowance.
- **Gemini** and **OpenAI** pictures use your own keys.

The social graphics maker needs no service at all: it draws posts, stories and link images in the browser and saves them as PNG files.

---

## Calendar

- **Google Calendar** needs a Google sign-in client ID. A helper sets this up once:
  1. In the [Google Cloud Console](https://console.cloud.google.com), create a project and enable the **Google Calendar API**.
  2. Set up the **OAuth consent screen**. Choose External, and add yourself as a test user.
  3. Under **Credentials**, create an **OAuth client ID** of type **Web application**. Add the site's address (for example `http://localhost:5173` and your live address) under **Authorised JavaScript origins**.
  4. Paste the client ID into **Settings → Integrations**.

  Access is read-only, and the sign-in only lasts while the app is open.
- **Calendar links** (Outlook, Apple, or Google's secret iCal address): most calendar services don't let web pages read their links directly. Deploy the tiny free proxy in [`extras/calendar-proxy.worker.js`](extras/calendar-proxy.worker.js) as a Cloudflare Worker. Paste its address, ending in `?url=`, into **Settings → Integrations → Proxy for iCal links**. It only passes calendar files through and stores nothing.
- **Calendar files** (`.ics`) can always be imported directly.

---

## Your Obsidian brain

Go to **Brain → Link your vault**:

- **Chrome and Edge** can link the vault folder itself. New notes, such as saved research, plans and call notes, go into an `OS` folder inside it. Existing notes are never changed.
- **Other browsers** upload a copy of the vault. Upload again to refresh it.
- **A sample brain** is included to try things out.

---

## Privacy and security

- **Local-first.** All your work lives in this browser's storage. There is no server, tracking or analytics.
- **Encrypted keys.** API keys are encrypted with AES-GCM, using a key derived from your passphrase (PBKDF2). The vault locks itself after a while unless you choose to stay unlocked on this device.
- **Direct connections.** Requests go straight from your browser to the AI or picture service you chose.
- **Backups.** Go to **Settings → Data → Download backup** to move to another computer. Keys stay encrypted inside the backup.
- **Sandboxed previews.** Generated landing pages are previewed in a sandbox, cut off from the rest of the app.

---

## Making it your own

- **Settings → You:** your name, role, company and the OS name.
- **Settings → Appearance:** the accent colour, reduced motion and the welcome animation.

On the last step of first-run setup, you can keep the sample projects or start clean.

---

## For developers

**Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, Dexie (IndexedDB), Zustand, React Three Fiber, Motion, pptxgenjs and ical.js.

```bash
npm run dev        # start the app
npm run build      # typecheck and build to dist/
npm run preview    # serve the built app
npm test           # unit tests
npm run typecheck  # TypeScript only
npm run format     # Prettier
```

**Project layout:**

| Folder | Contents |
| --- | --- |
| `src/app/` | Shell, navigation, routes, command palette and the lead agent dock. |
| `src/features/` | One folder per area: `agents`, `brain`, `calendar`, `comms`, `decks`, `live`, `mastermind`, `media`, `press`, `projects`, `research`, `sites`, `settings`, `vault` and more. |
| `src/lib/llm/` | Adapters for each AI service: streaming, tools, JSON output and web search. |
| `src/lib/agents/` | The agent runtime, prompts, tools, delegation and the role bank (`roles.ts`). |
| `src/lib/` | The studios (`decks`, `sites`, `media`, `press`, `research`), plus `brain`, `calendar`, `live`, the database and the encryption. |
| `src/components/` | The shared interface kit. |
| `extras/` | The optional calendar link proxy. |

To add a role, edit `src/lib/agents/roles.ts`. To add an AI service, add it to `src/lib/llm/providers.ts`.
