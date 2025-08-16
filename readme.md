# 🧠 AI Agent – Website Cloner

This project is an **AI-powered CLI tool** that clones websites into fully functional offline versions using **plain HTML, CSS, and JS**.

The agent follows a structured reasoning process (**START → THINK → TOOL → OBSERVE → OUTPUT**) while executing the cloning operation.

---

## 📂 Project Structure

```
.
├── scrapeWebsite.ts          # Website cloning logic
├── index.ts                  # Main entry (AI Agent loop)
├── package.json
├── pnpm-lock.yaml
└── .env                      # API keys & environment variables
```

---

## ⚙️ Setup

1. **Clone the repo**

   ```bash
   git clone <your-repo-url>
   cd <your-repo-name>
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root:

   ```env
   OPENAI_API_KEY=your_openai_api_key
   ```

---

## 🚀 Running the Agent

Run:

```bash
pnpm dev
```

👉 The agent will prompt you for a website URL:

```
💡 Enter the website URL:
```

Example:

```
💡 Enter the website URL: https://www.piyushgarg.dev
```

The agent will then:

- Think through the request
- Call the `scrapeWebsite()` tool
- Clone the site into `./output/`
- Rewrite assets/links so the site runs fully **offline**

---

## 🛠️ Output

- The cloned website will be available in:

  ```
  ./output/
  ```

- Assets are organized into subfolders (`/css`, `/js`, `/images`, etc.).
- You can open `index.html` directly in a browser to view the offline site.

# OR

## Run the scrapped website locally

```bash
npx serve output
```
---

## 📌 Notes

- Currently, the agent is **focused on website cloning**.
- Other tools (`getWeatherDetailsByCity`, `getGithubUserInfoByUsername`, `executeCommand`) are still available but not part of the default input flow.
- If a site has complex APIs or dynamic content, some manual adjustments may be needed.

---

✅ That’s it! Just run `pnpm dev`, enter a website URL, and get a fully offline clone 🚀

## 🎥 Demo

[![Watch the video]](https://youtu.be/om7hPTGVbUE)
