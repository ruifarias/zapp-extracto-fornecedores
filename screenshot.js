const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:5173');

    const title = await page.$eval('h1', el => el.textContent);
    console.log('Page title:', title);

    await page.screenshot({ path: 'screenshot.png', fullPage: true });
    console.log('Screenshot saved to screenshot.png');

    await browser.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
