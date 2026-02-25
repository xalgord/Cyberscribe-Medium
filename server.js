require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const puppeteer = null;

const app = express();
const PORT = process.env.PORT || 3005;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Safeguard: do not crash on load if API key is missing (e.g. forgot to set on Vercel)
const ai = new GoogleGenerativeAI(GEMINI_API_KEY || 'MISSING_API_KEY_PREVENT_CRASH');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Letmein1122@';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Ensure data directory exists (use /tmp on Vercel)
const IS_VERCEL = process.env.VERCEL === '1';
const DATA_DIR = IS_VERCEL
  ? path.join('/tmp', 'data', 'posts')
  : path.join(__dirname, 'data', 'posts');
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('⚠️  Could not create data directory:', e.message);
}

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ============ AUTH ============

function generateToken(username) {
  const payload = `${username}:${Date.now()}`;
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64')}.${hmac}`;
}

function verifyToken(token) {
  try {
    const [payloadB64, hmac] = token.split('.');
    if (!payloadB64 || !hmac) return false;
    const payload = Buffer.from(payloadB64, 'base64').toString();
    const expectedHmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac));
  } catch {
    return false;
  }
}

// Auth middleware — protect all routes except login and public post viewing
function authMiddleware(req, res, next) {
  // Allow login page and login API
  if (req.path === '/login' || req.path === '/login.html' || req.path === '/api/login') {
    return next();
  }

  // Allow public access to view posts
  if (req.path.startsWith('/post/') || req.path.startsWith('/api/posts/')) {
    return next();
  }

  // Allow static assets needed for pages to render (fonts, css, js)
  if (req.path.endsWith('.woff2') || req.path.endsWith('.woff') || req.path.endsWith('.ttf') || req.path.endsWith('.css') || req.path.endsWith('.js')) {
    return next();
  }

  const token = req.cookies?.auth_token;
  if (token && verifyToken(token)) {
    return next();
  }

  // For API requests, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  // For page requests, redirect to login
  return res.redirect('/login');
}

app.use(authMiddleware);

// Serve static files (after auth middleware)
app.use(express.static(path.join(__dirname, 'public')));

// Login page
app.get('/login', (req, res) => {
  // If already logged in, redirect to home
  const token = req.cookies?.auth_token;
  if (token && verifyToken(token)) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login API
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = generateToken(username);
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Invalid username or password' });
});

// Logout
app.get('/api/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.redirect('/login');
});

// Extract video ID from various YouTube URL formats
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Generate a URL-friendly slug from title
function generateSlug(title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60)
    .replace(/-$/, '');
  const shortId = crypto.randomBytes(3).toString('hex');
  return `${slug}-${shortId}`;
}

// Fetch video metadata via oEmbed
async function fetchVideoMeta(videoId) {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl);
    if (!res.ok) throw new Error('oEmbed fetch failed');
    const data = await res.json();
    return {
      title: data.title || 'Untitled Video',
      author: data.author_name || 'Unknown',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    };
  } catch {
    return {
      title: 'YouTube Video',
      author: 'Unknown',
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}

// Build the Gemini prompt for text article generation
function buildPrompt(meta) {
  return `You are an expert cybersecurity and bug bounty technical writer with a VIRAL, engaging writing style. You have just watched the YouTube video linked above. Your task is to transform the video content into a fun, emoji-packed, visually rich article that can be directly copy-pasted into Medium.com's editor.

VIDEO TITLE: "${meta.title}"
VIDEO AUTHOR: "${meta.author}"

CRITICAL: Medium.com ONLY supports these HTML elements. Do NOT use anything else:
- <h1> (one, for the title)
- <h2> and <h3> (section and subsection headings)
- <p> (paragraphs)
- <strong> and <em> (bold and italic)
- <a href="..."> (links)
- <ul> and <ol> with <li> (lists)
- <blockquote> (quotes and callouts)
- <pre> and <code> (code blocks)
- <hr> (horizontal rules / section dividers)

DO NOT USE any of these — Medium will strip them:
- NO <table>, <thead>, <tbody>, <tr>, <td>, <th>
- NO <div>, <span>, <section>, <article>
- NO <svg>, <canvas>
- NO custom CSS classes or inline styles
- NO <mark>, <figure>, <figcaption>
- NO data attributes or custom elements

FORMATTING RULES:

1. Start directly with the content. NO wrapper divs, NO <article> tags.

2. STRUCTURE:
   - Begin with <h1> title (include a relevant emoji in the title! e.g. "🔥 How Hackers...")
   - Add: <p><em>Based on "${meta.title}" by ${meta.author}</em></p>
   - Add a TL;DR section using blockquote with key bullet points (use emojis for each bullet)
   - Break content into logical sections using <h2> headings
   - Use <h3> for subsections
   - End with a Conclusion section
   - Add References & Further Reading as a list of links

3. 🔥 EMOJI USAGE — USE STRATEGICALLY:
   Use emojis to add personality, but don't overdo it:
   - EVERY <h2> and <h3> heading MUST start with a relevant emoji (🔥 🚀 💀 🎯 🛡️ 💡 ⚡ 🧠 🔓 🐛 💰 🔍 🤖 🕵️)
   - Sprinkle emojis in some paragraphs to highlight key moments — NOT every paragraph
   - Use emojis in a few key list items, not all of them
   - Aim for about 15-20 emojis total in the article — quality over quantity
   - Keep it professional but fun

4. ✂️ PARAGRAPH LENGTH — KEEP IT SHORT:
   - EVERY paragraph must be 2-3 sentences MAX. No exceptions!
   - One idea per paragraph. Break up walls of text.
   - Write like you're explaining this to a friend over coffee — casual, punchy, fun.
   - Use short, impactful sentences. "This is huge." "Let that sink in."
   - It's okay to have single-sentence paragraphs for dramatic effect.

5. 🖼️ IMAGE MARKERS — This is very important:
   Insert image markers FREQUENTLY throughout the article (every 200-400 words):
   [IMAGE: detailed description of a doodle-style illustration that would help explain the preceding content]
   
   All images should be in a FUN DOODLE / HAND-DRAWN SKETCH style with:
   - Simple hand-drawn lines, cute characters, and playful annotations
   - White or light background with colorful doodle elements
   - Whiteboard/notebook sketch aesthetic
   
   Examples:
   [IMAGE: A hand-drawn doodle sketch of the bug bounty workflow on a whiteboard: stick figure hacker going through steps Target → Recon → Find Bug → Report → Get Paid, with little arrows and fun annotations, colorful marker style]
   [IMAGE: A cute doodle-style illustration of a web app architecture: browser talking to server talking to database, with little speech bubbles and hand-drawn arrows showing where hackers attack, notebook sketch style]
   [IMAGE: A funny hand-drawn doodle of a stick figure hacker doing a victory dance after finding a critical bug, with confetti and "FOUND IT!" written in comic style, whiteboard marker aesthetic]
   [IMAGE: A before/after doodle sketch: left shows sad stick figure developer surrounded by bug doodles, right shows happy developer with all bugs squashed, fun and simple hand-drawn style]
   
   Include 6-8 image markers total spread throughout the article.
   At least 2-3 should be meme/humor doodle style for engagement.

6. INSTEAD OF TABLES, use bold labels in lists:
   <ul><li><strong>Tool Name:</strong> Description</li></ul>

7. FOR EMPHASIS:
   - Use <blockquote> for tips, warnings, important notes — short text only
   - Start blockquotes with emoji: ⚠️ Warning:, 💡 Pro Tip:, 🔑 Key Insight:
   - NEVER use bullets, <ul>, <ol>, or any list elements inside <blockquote>. Blockquotes must contain ONLY plain text in <p> tags. If you need a list, close the blockquote first, then use a separate <ul> or <ol> outside it.
   - Use <strong> for key terms, <em> for emphasis

8. CODE BLOCKS — Use plain <pre><code> (no class attributes).

9. CONTENT QUALITY:
   - Explain every concept clearly but concisely
   - Add context and background beyond the video
   - Include tool names, CVE IDs, technical details
   - Keep paragraphs SHORT (2-3 sentences max!)
   - Total: 2500-4000+ words
   - Viral, engaging, fun Medium blog style — like a popular tech Twitter thread turned into an article
   - Use conversational tone: "Here's the thing...", "Let me break this down 👇", "You won't believe this but..."

10. LINKEDIN PROMO POST:
   At the very end of your response, after the conclusion, output a separator line: "---LINKEDIN-START---"
   Then write a short, engaging LinkedIn post (100-150 words) promoting this article.
   - Hook the reader immediately.
   - Summarize the key value ("I just watched X and learned Y...").
   - Use LOTS of emojis (🚀, 🛡️, 💡, 🔥, 💀, 🎯).
   - Use visual formatting (bullet points with emojis).
   - Call to action: "Read the full breakdown below!"

Generate the complete HTML article now, followed by the LinkedIn post. Return ONLY clean HTML with image markers. No markdown, no code fences. Start with <h1>.`;
}

// Generate images using doodle style
async function generateImage(prompt, outputPath) {
  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash-image' });
    const response = await model.generateContent([
      `Create a fun, hand-drawn DOODLE-STYLE illustration for a cybersecurity blog article. The image should look like a whiteboard sketch or notebook doodle with these characteristics:\n- Simple hand-drawn lines and cute stick figures\n- White or light background with colorful marker-style elements\n- Playful annotations and labels written in a casual handwriting font\n- Fun, approachable, and easy to understand\n- Whiteboard/notebook sketch aesthetic\n- DO NOT include any text that is hard to read\n\nHere is what to illustrate:\n\n${prompt}`
    ]);
    const result = await response.response;

    // Extract image data from response
    if (result.candidates && result.candidates[0]) {
      for (const part of result.candidates[0].content.parts) {
        if (part.inlineData) {
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          fs.writeFileSync(outputPath, buffer);
          console.log(`    🖼️  Image saved: ${path.basename(outputPath)}`);
          return true;
        }
      }
    }
    console.log(`    ⚠️  No image data in response`);
    return false;
  } catch (err) {
    console.error(`    ❌ Image generation failed: ${err.message}`);
    return false;
  }
}

// Process article: find [IMAGE: ...] markers, generate images, replace with <img> tags
async function processArticleImages(html, slug) {
  const imageDir = path.join(DATA_DIR, slug);
  try {
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }
  } catch (e) {
    console.warn('⚠️  Could not create image directory:', e.message);
  }

  const imageRegex = /\[IMAGE:\s*(.*?)\]/g;
  const matches = [...html.matchAll(imageRegex)];

  if (matches.length === 0) {
    console.log('  📷 No image markers found in article');
    return html;
  }

  console.log(`  📷 Found ${matches.length} image markers, generating with Nano Banana...`);

  let processedHtml = html;
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const description = match[1].trim();
    const filename = `img-${i + 1}.png`;
    const outputPath = path.join(imageDir, filename);
    const imageUrl = `/api/images/${slug}/${filename}`;

    console.log(`  [${i + 1}/${matches.length}] Generating: ${description.substring(0, 80)}...`);

    const success = await generateImage(description, outputPath);

    if (success) {
      // Replace marker with img tag — Medium supports images
      processedHtml = processedHtml.replace(
        match[0],
        `<p><img src="${imageUrl}" alt="${description.replace(/"/g, '&quot;')}" style="max-width:100%;"></p>`
      );
    } else {
      // Remove the marker if image generation failed
      processedHtml = processedHtml.replace(match[0], '');
    }
  }

  return processedHtml;
}

// Save post to disk
function savePost(slug, data) {
  try {
    const filePath = path.join(DATA_DIR, `${slug}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return filePath;
  } catch (e) {
    console.warn('⚠️  Could not save post:', e.message);
    return null;
  }
}

// Load post from disk
function loadPost(slug) {
  const filePath = path.join(DATA_DIR, `${slug}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// List all posts
function listPosts() {
  try {
    if (!fs.existsSync(DATA_DIR)) return [];
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
        return {
          slug: f.replace('.json', ''),
          title: data.meta?.title || 'Untitled',
          author: data.meta?.author || 'Unknown',
          createdAt: data.createdAt,
          thumbnailUrl: data.meta?.thumbnailUrl,
        };
      } catch {
        return null;
      }
    }).filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (e) {
    console.warn('⚠️  Could not list posts:', e.message);
    return [];
  }
}

// ============ HACKERONE HELPERS ============

function extractHackerOneId(url) {
  const match = url.match(/hackerone\.com\/reports\/(\d+)/);
  return match ? match[1] : null;
}

async function fetchHackerOneReport(url) {
  console.log(`🤖 Launching Puppeteer for: ${url}`);
  if (!puppeteer) {
    throw new Error('HackerOne scraping is not available in this environment (Puppeteer not installed).');
  }
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    const data = await page.evaluate(() => {
      const titleEl = document.querySelector('.report-heading .report-title') || document.querySelector('h1');
      const title = titleEl ? titleEl.innerText.trim() : 'Unknown HackerOne Report';
      const contentEl = document.querySelector('.report-timeline-container') || document.body;
      const content = contentEl.innerText;
      return { title, content };
    });
    return data;
  } catch (err) {
    console.error('Puppeteer error:', err);
    throw new Error('Failed to fetch report: ' + err.message);
  } finally {
    await browser.close();
  }
}

function buildHackerOnePrompt(report) {
  return `You are an expert cybersecurity researcher with a VIRAL, engaging writing style. Analyze the following HackerOne bug report and write a fun, emoji-packed, visually rich educational writeup for Medium.com.
  
REPORT TITLE: "${report.title}"

REPORT CONTENT:
${report.content.substring(0, 50000)} ... [truncated]

TASK:
Transform this raw report into a polished, ENGAGING blog post that goes viral.
Follow the same FORMATTING RULES as previous instructions (HTML only, no markdown, H1 title, etc.).

ENGAGEMENT RULES (CRITICAL!):
- 🔥 Use emojis strategically — every heading gets one, sprinkle a few in key paragraphs. Aim for 15-20 emojis total.
- ✂️ Keep EVERY paragraph to 2-3 sentences MAX. One idea per paragraph. No walls of text!
- 🖼️ Include 6-8 [IMAGE: ...] markers, in DOODLE / HAND-DRAWN SKETCH style (whiteboard sketches, stick figures, notebook doodles). At least 2-3 should be funny doodle memes.
- 💬 Write casually like explaining to a friend: "Here's the thing...", "Let that sink in."
- NEVER use bullets, <ul>, <ol>, or any list elements inside <blockquote>. Blockquotes must contain ONLY plain text. Close the blockquote first, then list separately.

Structure the writeup as:
1. 🏷️ HEADER: <h1> with emoji + italicized attribution line
2. 💀 Introduction & Impact (Explain the bug type and its severity — make the reader feel the danger)
3. 🔍 Discovery (How it was found, simplified for learners)
4. 💣 Exploitation (Step-by-step breakdown with images/memes)
5. 🛡️ Remediation (How to fix it)
6. 🎯 Key Takeaways for Bug Bounty Hunters

Use [IMAGE: ...] markers frequently to illustrate the attack flow. Use doodle/sketch style.
Include a LinkedIn promo post at the end (separator: ---LINKEDIN-START---).

Generate the complete HTML article now. Start with <h1>.`;
}

// ============ HTML CLEANUP ============

// Strip markdown artifacts from HTML output
function cleanMarkdownArtifacts(html) {
  // Convert **text** to <strong>text</strong>
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Convert *text* to <em>text</em> (simple version without lookbehind)
  html = html.replace(/(?:^|[^*])\*([^*]+)\*(?:[^*]|$)/g, function (match, p1) {
    return match.replace('*' + p1 + '*', '<em>' + p1 + '</em>');
  });
  // Remove any remaining stray asterisks used as bullet points
  html = html.replace(/^\s*\*\s+/gm, '');
  // Remove markdown headers (# ## ###)
  html = html.replace(/^#{1,3}\s+/gm, '');
  return html;
}

// ============ API ROUTES ============

// Generate writeup
app.post('/api/generate', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check for HackerOne Report
    const h1Id = extractHackerOneId(url);
    if (h1Id) {
      console.log(`\n🐛 Processing HackerOne Report: ${h1Id}`);
      try {
        const report = await fetchHackerOneReport(url);
        const summaryPrompt = buildHackerOnePrompt(report);
        const slug = generateSlug(report.title);

        console.log(`🤖 Step 2: Extracting summary with Gemini...`);
        const model = ai.getGenerativeModel({ model: 'gemini-3-pro-preview' });
        const response = await model.generateContent([summaryPrompt]);
        const result = await response.response;
        let html = result.text().replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();

        let linkedinPost = '';
        if (html.includes('---LINKEDIN-START---')) {
          const parts = html.split('---LINKEDIN-START---');
          html = parts[0].trim();
          linkedinPost = parts[1].trim();
        }

        console.log('🎨 Step 2: Generating images with Nano Banana...');
        html = await processArticleImages(html, slug);

        const postData = {
          html,
          linkedinPost,
          meta: {
            title: report.title,
            author: 'HackerOne Report',
            videoId: h1Id,
            videoUrl: url,
            thumbnailUrl: 'https://hackerone.com/assets/logo.png',
          },
          createdAt: new Date().toISOString(),
        };

        savePost(slug, postData);
        console.log(`💾 Post saved: /post/${slug}\n`);
        return res.json({ ...postData, slug, postUrl: `/post/${slug}` });

      } catch (err) {
        console.error('H1 Error:', err);
        return res.status(500).json({ error: 'Failed to process H1 report: ' + err.message });
      }
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL.' });
    }

    const meta = await fetchVideoMeta(videoId);
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const slug = generateSlug(meta.title);

    console.log(`\n📺 Processing: "${meta.title}" (${videoId})`);

    // Step 1: Generate article text with Gemini 2.5 Flash
    console.log('🤖 Step 1: Analyzing video and generating article...');
    const prompt = buildPrompt(meta);

    const model = ai.getGenerativeModel({ model: 'gemini-2.5-pro' });
    const textResponse = await model.generateContent([
      {
        fileData: {
          mimeType: 'video/mp4',
          fileUri: videoUrl,
        },
      },
      prompt
    ]);
    const result = await textResponse.response;

    let html = '';
    try {
      html = result.text();
    } catch (err) {
      return res.status(500).json({ error: 'Failed to extract text from response.' });
    }

    // Clean up markdown code fences
    let fullText = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();

    // Split article and LinkedIn post
    let linkedinPost = '';
    const linkedinSeparator = '---LINKEDIN-START---';

    if (fullText.includes(linkedinSeparator)) {
      const parts = fullText.split(linkedinSeparator);
      html = parts[0].trim();
      linkedinPost = parts[1].trim();
      console.log('📝 Extracted LinkedIn post');
    } else {
      html = fullText;
    }

    console.log(`✅ Article generated (${html.length} chars)`);

    // Step 2: Generate images for [IMAGE: ...] markers
    console.log('🎨 Step 2: Generating images with Nano Banana...');
    html = await processArticleImages(html, slug);

    // Save post
    const postData = {
      html,
      linkedinPost,
      meta: {
        ...meta,
        videoId,
        videoUrl,
        thumbnailUrl: meta.thumbnail,
      },
      createdAt: new Date().toISOString(),
    };

    savePost(slug, postData);
    console.log(`💾 Post saved: /post/${slug}\n`);

    res.json({
      ...postData,
      slug,
      postUrl: `/post/${slug}`,
    });
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({
      error: `Failed to generate writeup: ${error.message}`,
    });
  }
});

// ============ FIND & GENERATE ============

// Use Gemini + Google Search to find a trending video and auto-generate
app.post('/api/find-and-generate', async (req, res) => {
  try {
    // Get existing post titles to avoid duplicates
    const existingPosts = listPosts();
    const existingTitles = existingPosts.map(p => p.title).join(', ');

    const avoidClause = existingTitles
      ? `\n\nIMPORTANT: Do NOT pick any of these videos that have already been covered:\n${existingTitles}`
      : '';

    console.log('\n🔍 Finding a trending cybersecurity YouTube video...');

    const findModel = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const findPrompt = `Use Google Search to find a recent, trending, and highly educational cybersecurity or bug bounty YouTube video that was uploaded in the last 2 weeks. 

Look for videos about:
- Bug bounty hunting techniques, tips, or walkthroughs
- Web application security vulnerabilities (XSS, SQLi, SSRF, IDOR, etc.)
- Hacking tutorials or CTF walkthroughs
- New CVEs or zero-day exploits explained
- Penetration testing methodologies
- Security research breakthroughs

Pick a video that would make an excellent, comprehensive blog writeup.${avoidClause}

Return ONLY the full YouTube URL (e.g. https://www.youtube.com/watch?v=XXXXXXXXXXX) and nothing else. No explanation, no markdown, just the raw URL.`;

    const findResponse = await findModel.generateContent([findPrompt]);
    const findResult = await findResponse.response;

    let responseText = '';
    try {
      responseText = findResult.text().trim();
    } catch (parseErr) {
      console.error('❌ Error parsing response:', parseErr);
      return res.status(500).json({ error: 'Failed to parse AI response. Try again!' });
    }

    console.log(`🔗 Gemini found: ${responseText}`);

    // Extract the YouTube URL from the response
    const urlMatch = responseText.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]+/);
    if (!urlMatch) {
      console.error('❌ Could not extract YouTube URL from:', responseText);
      return res.status(500).json({ error: 'Could not find a suitable YouTube video. Try again!' });
    }

    const foundUrl = urlMatch[0];
    const videoId = extractVideoId(foundUrl);
    if (!videoId) {
      return res.status(500).json({ error: 'Found an invalid YouTube URL. Try again!' });
    }

    console.log(`✅ Selected video: ${foundUrl} (ID: ${videoId})`);

    // Now use the existing generation pipeline
    const meta = await fetchVideoMeta(videoId);
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const slug = generateSlug(meta.title);

    console.log(`📺 Processing: "${meta.title}" (${videoId})`);

    // Step 1: Generate article
    console.log('🤖 Step 1: Analyzing video and generating article...');
    const prompt = buildPrompt(meta);

    const model = ai.getGenerativeModel({ model: 'gemini-2.5-pro' });
    const textResponse = await model.generateContent([
      {
        fileData: {
          mimeType: 'video/mp4',
          fileUri: videoUrl,
        },
      },
      prompt
    ]);
    const result = await textResponse.response;

    let html = '';
    try {
      html = result.text();
    } catch (err) {
      return res.status(500).json({ error: 'Failed to extract text from response.' });
    }

    let fullText = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();

    let linkedinPost = '';
    const linkedinSeparator = '---LINKEDIN-START---';

    if (fullText.includes(linkedinSeparator)) {
      const parts = fullText.split(linkedinSeparator);
      html = parts[0].trim();
      linkedinPost = parts[1].trim();
      console.log('📝 Extracted LinkedIn post');
    } else {
      html = fullText;
    }

    console.log(`✅ Article generated (${html.length} chars)`);

    // Step 2: Generate images
    console.log('🎨 Step 2: Generating images with Nano Banana...');
    html = await processArticleImages(html, slug);

    // Save post
    const postData = {
      html,
      linkedinPost,
      meta: {
        ...meta,
        videoId,
        videoUrl,
        thumbnailUrl: meta.thumbnail,
      },
      createdAt: new Date().toISOString(),
    };

    savePost(slug, postData);
    console.log(`💾 Post saved: /post/${slug}\n`);

    res.json({
      ...postData,
      slug,
      postUrl: `/post/${slug}`,
    });
  } catch (error) {
    console.error('Find & Generate error:', error);
    res.status(500).json({
      error: `Failed to find and generate writeup: ${error.message}`,
    });
  }
});

// ============ RESEARCH & GENERATE ============

// Use Gemini + Google Search to research trending topics and generate a writeup
app.post('/api/research-and-generate', async (req, res) => {
  try {
    const existingPosts = listPosts();
    const existingTitles = existingPosts.map(p => p.title).join(', ');
    const avoidClause = existingTitles
      ? `\n\nDo NOT write about these topics that have already been covered:\n${existingTitles}`
      : '';

    console.log('\n🧠 Researching trending cybersecurity topics across the web...');

    // Step 1: Research trending topics
    const modelOptions = { model: 'gemini-2.5-flash' }; // Note: 2.5 flash may not support tools in v0.21.0, using 1.5-flash which is widely supported
    const researchModel = ai.getGenerativeModel(modelOptions);

    // In older SDK, tool configuration is different or we just prompt it directly if Google Search tool isn't fully supported
    // For safety and compatibility with v0.21.0, we rely on Gemini's broad knowledge or basic tool config

    const researchPrompt = `Use Google Search to research what is currently trending in cybersecurity RIGHT NOW across multiple sources:

1. Search X/Twitter for trending cybersecurity hashtags and discussions
2. Search LinkedIn for popular cybersecurity posts and articles
3. Search Google News for breaking cybersecurity stories
4. Search security blogs (Krebs on Security, The Hacker News, BleepingComputer, etc.)
5. Check for recent CVEs, zero-days, or data breaches

Find THE most interesting, trending, and educational topic from the last 7 days.${avoidClause}

Return your response in this EXACT format:
TOPIC: [The specific topic title]
SUMMARY: [A 2-3 sentence summary of what happened and why it matters]
SOURCES: [List the key sources/URLs you found]`;

    const researchResponse = await researchModel.generateContent([researchPrompt]);
    const researchResult = await researchResponse.response;

    let researchText = '';
    try {
      researchText = researchResult.text().trim();
    } catch (parseErr) {
      return res.status(500).json({ error: 'Failed to parse research response. Try again!' });
    }

    console.log(`📰 Research result:\n${researchText.substring(0, 300)}...`);

    // Extract topic
    const topicMatch = researchText.match(/TOPIC:\s*(.+)/i);
    const topicTitle = topicMatch ? topicMatch[1].trim() : 'Trending Cybersecurity Topic';
    const slug = generateSlug(topicTitle);

    console.log(`🎯 Topic selected: "${topicTitle}"`);

    // Step 2: Generate comprehensive writeup from research
    console.log('🤖 Step 2: Generating comprehensive writeup from research...');

    const writeupPrompt = `You are an expert cybersecurity technical writer with a viral, engaging writing style. Based on the following research about a trending cybersecurity topic, write a comprehensive, in-depth article for Medium.com.

RESEARCH DATA:
${researchText}

⚠️ CRITICAL OUTPUT FORMAT: Return ONLY valid HTML. Absolutely NO markdown syntax.
- NO asterisks (*) for bold or italic — use <strong> and <em> instead
- NO markdown headers (#, ##) — use <h1>, <h2>, <h3> instead
- NO markdown bullet points (* item) — use <ul><li>item</li></ul> instead
- NO markdown links [text](url) — use <a href="url">text</a> instead
- NO backticks for code — use <pre><code> instead

Medium.com ONLY supports these HTML elements:
- <h1> (one, for the title)
- <h2> and <h3> (section headings)
- <p> (paragraphs)
- <strong> and <em> (bold and italic)
- <a href="..."> (links)
- <ul> and <ol> with <li> (lists)
- <blockquote> (quotes — plain text ONLY, NO lists inside)
- <pre> and <code> (code blocks)
- <hr> (section dividers)

DO NOT USE: <table>, <div>, <span>, <section>, <article>, <svg>, <canvas>, <mark>, <figure>, inline styles, or custom attributes.

FORMATTING RULES:
1. Start with <h1> title (include one emoji in the title)
2. Add a TL;DR using <blockquote> with plain text summary (NO bullets inside blockquote)
3. Break into logical sections with <h2> headings (each starts with an emoji)
4. ⚠️ PARAGRAPH LENGTH IS CRITICAL: EVERY <p> must be 2-3 sentences MAX. If a paragraph has more than 3 sentences, SPLIT IT into multiple <p> tags. One idea per paragraph. NO long walls of text.
5. Use 15-20 emojis total — headings + a few key moments
6. Write casually, like explaining to a friend
7. Include 6-8 [IMAGE: ...] markers in DOODLE/HAND-DRAWN SKETCH style (whiteboard sketches, stick figures, notebook doodles)
8. NEVER put <ul> or <ol> inside <blockquote>
9. Total length: 2500-4000+ words — be comprehensive but keep each paragraph SHORT
10. Include tool names, CVE IDs, technical details where relevant
11. Add References & Further Reading section with real links from the research
12. At the end, add separator "---LINKEDIN-START---" followed by a LinkedIn promo post (100-150 words)

Remember: Output ONLY clean HTML. No markdown. Every paragraph must be short. Start with <h1>.`;

    const writeupModel = ai.getGenerativeModel({ model: 'gemini-2.5-pro' });
    const writeupResponse = await writeupModel.generateContent([writeupPrompt]);
    const writeupResult = await writeupResponse.response;

    let html = '';
    try {
      html = writeupResult.text();
    } catch (e) {
      return res.status(500).json({ error: 'Failed to generate writeup. Try again!' });
    }

    let fullText = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();

    let linkedinPost = '';
    const linkedinSeparator = '---LINKEDIN-START---';
    if (fullText.includes(linkedinSeparator)) {
      const parts = fullText.split(linkedinSeparator);
      html = parts[0].trim();
      linkedinPost = parts[1].trim();
      console.log('📝 Extracted LinkedIn post');
    } else {
      html = fullText;
    }

    console.log(`✅ Article generated (${html.length} chars)`);

    // Clean up any markdown artifacts
    html = cleanMarkdownArtifacts(html);

    // Step 3: Generate images
    console.log('🎨 Step 3: Generating doodle-style images...');
    html = await processArticleImages(html, slug);

    const postData = {
      html,
      linkedinPost,
      meta: {
        title: topicTitle,
        author: 'Research (Multi-Source)',
        videoId: null,
        videoUrl: null,
        thumbnailUrl: null,
      },
      createdAt: new Date().toISOString(),
    };

    savePost(slug, postData);
    console.log(`💾 Post saved: /post/${slug}\n`);

    res.json({
      ...postData,
      slug,
      postUrl: `/post/${slug}`,
    });
  } catch (error) {
    console.error('Research & Generate error:', error);
    res.status(500).json({
      error: `Failed to research and generate writeup: ${error.message}`,
    });
  }
});

// Serve generated images
app.get('/api/images/:slug/:filename', (req, res) => {
  const { slug, filename } = req.params;
  // Validate filename to prevent path traversal
  if (!/^img-\d+\.png$/.test(filename)) {
    return res.status(400).send('Invalid filename');
  }
  const filePath = path.join(DATA_DIR, slug, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Image not found');
  }
  res.type('image/png').sendFile(filePath);
});

// Get single post
app.get('/api/posts/:slug', (req, res) => {
  const post = loadPost(req.params.slug);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json({ ...post, slug: req.params.slug });
});

// List all posts
app.get('/api/posts', (req, res) => {
  res.json(listPosts());
});

// Serve post viewer page
app.get('/post/:slug', (req, res) => {
  const post = loadPost(req.params.slug);
  if (!post) return res.status(404).send('Post not found');
  res.sendFile(path.join(__dirname, 'public', 'post.html'));
});

// Catch-all: serve index
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Only listen when running locally (not on Vercel)
// Vercel auto-injects VERCEL, VERCEL_ENV, and VERCEL_URL.
if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
  app.listen(PORT, () => {
    console.log(`\n🚀 CyberScribe running at http://localhost:${PORT}\n`);
    const posts = listPosts();
    if (posts.length > 0) {
      console.log(`📚 ${posts.length} saved post(s):`);
      posts.forEach(p => console.log(`   → /post/${p.slug}`));
    }
    console.log('');
  });
}

// Export for Vercel serverless
module.exports = app;

