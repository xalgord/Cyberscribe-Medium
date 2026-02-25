async function testH1() {
    const url = 'https://hackerone.com/reports/123.json';
    console.log('Fetching:', url);
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
            }
        });
        if (!res.ok) {
            console.log('Status:', res.status);
            return;
        }
        const text = await res.text();
        console.log('Success!', text.substring(0, 200));
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

testH1();
