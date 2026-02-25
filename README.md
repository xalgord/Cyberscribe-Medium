# ⚡ CyberScribe

AI-powered cybersecurity writeup generator that transforms YouTube videos, HackerOne reports, and trending topics into premium Medium-style articles with auto-generated doodle illustrations.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express)
![Gemini](https://img.shields.io/badge/Gemini_AI-Powered-4285F4?logo=google&logoColor=white)

## ✨ Features

- **📺 YouTube → Writeup** — Paste any YouTube video URL and get a comprehensive article
- **🐛 HackerOne → Writeup** — Transform bug reports into educational blog posts
- **🔍 Find & Generate** — Auto-discover trending cybersecurity YouTube videos
- **🧠 Research & Generate** — Research trending topics from X/Twitter, LinkedIn, Google News, and security blogs
- **🎨 Doodle-Style Images** — Auto-generated hand-drawn illustrations via Gemini
- **📝 LinkedIn Promo Posts** — Auto-generated LinkedIn posts for each article
- **🔐 Login Authentication** — Secure access with credentials
- **📱 Responsive UI** — Premium dark-themed Medium-style design

## 🚀 Quick Start

### Prerequisites

- ** Node.js** 22+
- **Gemini API Key** — Get one from [Google AI Studio](https://aistudio.google.com/)

### Installation

```bash
git clone https://github.com/your-repo/cyberscribe.git
cd cyberscribe
npm install
```

### Configuration

Create a `.env` file in the root directory:

```env
ADMIN_USER=admin
ADMIN_PASS=Letmein1122@
GEMINI_API_KEY=your_gemini_api_key_here
SESSION_SECRET=your_random_secret_here
```

### Run Locally

```bash
npm start
```

Open `http://localhost:3005` — you'll be greeted with the login page.

## 🔐 Authentication

The app is protected with cookie-based authentication.

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_USER` | `admin` | Login username |
| `ADMIN_PASS` | `Letmein1122@` | Login password |
| `SESSION_SECRET` | auto-generated | HMAC secret for token signing |

## 📖 Usage

### 1. Manual URL
Paste a **YouTube** or **HackerOne** URL and click **Generate Writeup**.

### 2. Find & Generate
Click the **🔍 Find & Generate** button to let AI discover a trending cybersecurity video and auto-generate a writeup.

### 3. Research & Generate
Click the **🧠 Research & Generate** button to research trending topics across X/Twitter, LinkedIn, Google News, and security blogs, then generate a comprehensive article.

## 🏗️ Tech Stack

- **Backend:** Node.js + Express
- **AI:** Google Gemini (gemini-3-pro, gemini-2.5-flash)
- **Image Generation:** Gemini Image Preview (doodle style)
- **Auth:** HMAC-signed cookies (stateless, no DB needed)
- **Frontend:** Vanilla HTML/CSS/JS with premium dark theme
- **Scraping:** Puppeteer (for HackerOne reports)

## 📁 Project Structure

```
cyberscribe/
├── server.js          # Express server, AI generation, auth
├── public/
│   ├── index.html     # Main dashboard
│   ├── login.html     # Login page
│   ├── post.html      # Article viewer
│   ├── app.js         # Frontend logic
│   └── style.css      # Styling
├── data/posts/        # Generated articles (JSON)
├── .env               # Environment variables
└── package.json
```

## 📄 License

MIT
