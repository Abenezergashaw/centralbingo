const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // prevents shared memory issues
      "--disable-gpu",
    ],
  });

  const page = await browser.newPage();
  await page.goto(
    "https://transactioninfo.ethiotelecom.et/receipt/CHG68PH0LK",
    { waitUntil: "networkidle2" }
  );

  const content = await page.content();
  console.log(content);

  await browser.close();
})();
