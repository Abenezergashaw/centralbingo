import puppeteer from "puppeteer";

(async () => {
  const browser = await puppeteer.launch({
    headless: true, // run without opening window
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    // Navigate to the receipt URL
    await page.goto(
      "https://transactioninfo.ethiotelecom.et/receipt/CHG68PH0LK",
      {
        waitUntil: "networkidle2",
        timeout: 120000,
      }
    );

    // Example: extract full page text
    const content = await page.evaluate(() => document.body.innerText);

    console.log("Receipt Content:");
    console.log(content);

    // Or extract specific fields with selectors
    // const txnId = await page.$eval("#transactionId", el => el.innerText);
    // console.log("Transaction ID:", txnId);
  } catch (err) {
    console.error("Error scraping receipt:", err);
  } finally {
    await browser.close();
  }
})();
