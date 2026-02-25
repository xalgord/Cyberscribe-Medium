// ============================================
// CyberScribe — Frontend Logic
// ============================================

document.addEventListener('DOMContentLoaded', () => {


    // DOM elements
    const form = document.getElementById('generateForm');
    const urlInput = document.getElementById('videoUrl');
    const generateBtn = document.getElementById('generateBtn');
    const findGenerateBtn = document.getElementById('findGenerateBtn');
    const researchGenerateBtn = document.getElementById('researchGenerateBtn');
    const errorMessage = document.getElementById('errorMessage');
    const loadingSection = document.getElementById('loadingSection');
    const loadingStatus = document.getElementById('loadingStatus');
    const recentPostsSection = document.getElementById('recentPostsSection');

    const statusMessages = [
        'Sending video to Gemini AI for analysis...',
        'Watching and understanding video content...',
        'Identifying key cybersecurity concepts...',
        'Structuring the article layout...',
        'Generating detailed writeup with AI...',
        'Creating tables and diagrams...',
        'Building infographics and visuals...',
        'Polishing the final article...',
    ];

    const findStatusMessages = [
        '🔍 Searching for trending cybersecurity videos...',
        '🌐 Scanning YouTube for recent uploads...',
        '🎯 Finding the best video for a writeup...',
        '✅ Video found! Now analyzing content...',
        '🤖 Generating detailed writeup with AI...',
        '🎨 Creating infographics and visuals...',
        '📝 Structuring the article layout...',
        '✨ Polishing the final article...',
    ];

    const researchStatusMessages = [
        '🧠 Researching trending cybersecurity topics...',
        '🐦 Scanning X/Twitter for hot security discussions...',
        '💼 Checking LinkedIn for industry insights...',
        '🔍 Searching Google for breaking security news...',
        '📰 Analyzing trending CVEs and vulnerabilities...',
        '✅ Topic selected! Generating comprehensive writeup...',
        '🤖 Writing detailed article with AI...',
        '🎨 Creating doodle-style illustrations...',
        '✨ Polishing the final article...',
    ];

    let statusInterval = null;

    // Show error
    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 8000);
    }

    // Cycle loading status messages
    function startStatusCycle(mode) {
        let idx = 0;
        const messages = mode === 'research' ? researchStatusMessages : mode === 'find' ? findStatusMessages : statusMessages;
        loadingStatus.textContent = messages[0];
        statusInterval = setInterval(() => {
            idx = (idx + 1) % messages.length;
            loadingStatus.textContent = messages[idx];
        }, 3000);
    }

    function stopStatusCycle() {
        if (statusInterval) {
            clearInterval(statusInterval);
            statusInterval = null;
        }
    }

    // Set UI state
    function setLoading(loading, mode) {
        if (loading) {
            generateBtn.disabled = true;
            findGenerateBtn.disabled = true;
            researchGenerateBtn.disabled = true;
            generateBtn.querySelector('.btn-text').textContent = 'Generating...';
            findGenerateBtn.querySelector('.btn-find-text').textContent = mode === 'find' ? 'Searching...' : 'Find & Generate';
            researchGenerateBtn.querySelector('.btn-find-text').textContent = mode === 'research' ? 'Researching...' : 'Research & Generate';
            loadingSection.style.display = 'block';
            errorMessage.style.display = 'none';
            if (recentPostsSection) recentPostsSection.style.display = 'none';
            startStatusCycle(mode);
        } else {
            generateBtn.disabled = false;
            findGenerateBtn.disabled = false;
            researchGenerateBtn.disabled = false;
            generateBtn.querySelector('.btn-text').textContent = 'Generate Writeup';
            findGenerateBtn.querySelector('.btn-find-text').textContent = 'Find & Generate';
            researchGenerateBtn.querySelector('.btn-find-text').textContent = 'Research & Generate';
            loadingSection.style.display = 'none';
            stopStatusCycle();
        }
    }

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = urlInput.value.trim();
        if (!url) return;

        setLoading(true, 'url');

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate writeup');
            }

            // Redirect to the saved post page
            if (data.postUrl) {
                window.location.href = data.postUrl;
            }
        } catch (err) {
            setLoading(false);
            showError(err.message);
        }
    });

    // Find & Generate button
    findGenerateBtn.addEventListener('click', async () => {
        setLoading(true, 'find');

        try {
            const response = await fetch('/api/find-and-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to find and generate writeup');
            }

            if (data.postUrl) {
                window.location.href = data.postUrl;
            }
        } catch (err) {
            setLoading(false);
            showError(err.message);
        }
    });

    // Research & Generate button
    researchGenerateBtn.addEventListener('click', async () => {
        setLoading(true, 'research');

        try {
            const response = await fetch('/api/research-and-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to research and generate writeup');
            }

            if (data.postUrl) {
                window.location.href = data.postUrl;
            }
        } catch (err) {
            setLoading(false);
            showError(err.message);
        }
    });

    // Load recent posts
    loadRecentPosts();

    // Auto-focus input
    urlInput.focus();
});

// Load and display recent posts
async function loadRecentPosts() {
    const section = document.getElementById('recentPostsSection');
    const list = document.getElementById('recentPostsList');
    if (!section || !list) return;

    try {
        const res = await fetch('/api/posts');
        if (!res.ok) return;
        const posts = await res.json();

        if (posts.length === 0) {
            section.style.display = 'none';
            return;
        }

        list.innerHTML = posts.map(post => `
            <a href="/post/${post.slug}" class="recent-post-card">
                <img class="recent-post-thumb" src="${post.thumbnailUrl || ''}" alt="" loading="lazy" />
                <div class="recent-post-info">
                    <h4>${escapeHtml(post.title)}</h4>
                    <p class="recent-post-meta">
                        <span>${escapeHtml(post.author)}</span>
                        <span>•</span>
                        <span>${post.createdAt ? new Date(post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
                    </p>
                </div>
            </a>
        `).join('');

        section.style.display = 'block';
    } catch {
        section.style.display = 'none';
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
}
