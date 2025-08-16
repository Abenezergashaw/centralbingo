// pup.js
const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(
    "https://transactioninfo.ethiotelecom.et/receipt/CHG68PH0LK",
    {
      waitUntil: "networkidle2",
    }
  );

  console.log(await page.content());

  await browser.close();
})();
