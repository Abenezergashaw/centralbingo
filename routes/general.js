const express = require("express");
const router = express.Router();
const pool = require("../db");
const { v4: uuidv4 } = require("uuid");
const bot = require("../telegram");
const axios = require("axios");
const { signES256 } = require("../utils/cryptography");
const admin_phone = ["934596919", "938880223"];
const cheerio = require("cheerio");

const admin_name = "KALEAB FIKRU MEKONEN";
const admin_telebirr_phone = "2519****2626";

const PRIVATE_KEY = `
-----BEGIN EC PRIVATE KEY-----
Mgdfgdfgdfgdfgfdg==
-----END EC PRIVATE KEY-----
`;

const MERCHANT_ID = "feb8050e-9569-4c1f-sdfsdfsd-89186c5ff500";

const BASE_URL = "https://services.santimpay.com/api/v1/gateway";

function generateTxnId() {
  return Math.floor(Math.random() * 1e20).toString();
}

function createSignedTokenForCheckout(amount, reason) {
  const payload = {
    amount,
    paymentReason: reason,
    merchantId: MERCHANT_ID,
    generated: Math.floor(Date.now() / 1000),
  };
  return signES256(payload, PRIVATE_KEY);
}

// GET balance and bonus using ?phone=...
router.get("/get_balance", async (req, res) => {
  const phone = req.query.phone?.replace(/\s/g, "");
  console.log("m", phone);

  if (!phone) {
    return res
      .status(400)
      .json({ status: false, message: "Phone number is required." });
  }

  try {
    const [rows] = await pool.query(
      "SELECT balance, bonus FROM users WHERE phone = ?",
      [phone]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ status: false, message: "User not found." });
    }

    const { balance, bonus } = rows[0];
    return res.json({ status: true, balance, bonus });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ status: false, message: "Server error." });
  }
});

router.get("/get_user", async (req, res) => {
  const telegram_id = req.query.telegram_id?.replace(/\s/g, "");

  console.log("index:", telegram_id);

  if (!telegram_id) {
    return res
      .status(400)
      .json({ status: false, message: "Telegram ID number is required." });
  }

  try {
    const [rows] = await pool.query(
      "SELECT phone FROM users WHERE telegram_id = ?",
      [telegram_id]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ status: false, message: "User not found." });
    }

    const { phone } = rows[0];
    return res.json({ status: true, phone });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ status: false, message: "Server error." });
  }
});

router.get("/filter_games", async (req, res) => {
  const phone = req.query.phone?.trim();

  if (!phone) {
    return res.status(400).json({ status: false, message: "Tag is required." });
  }

  try {
    const [rows] = await pool.query(
      "SELECT * FROM games WHERE FIND_IN_SET(?, players)",
      [phone]
    );

    return res.json({ status: true, data: rows });
  } catch (err) {
    console.error("DB error:", err);
    return res.status(500).json({ status: false, message: "Server error." });
  }
});

router.post("/create_deposit_transaction", async (req, res) => {
  const { txn_id, phone, amount, method, type, status } = req.body;

  if (!txn_id || !phone || !amount || !method || !type || !status) {
    return res
      .status(400)
      .json({ status: false, message: "Missing required fields" });
  }
  console.log(phone);

  try {
    // ✅ Check if txn_id already exists
    const [existing] = await pool.query(
      "SELECT id FROM transaction WHERE txn_id = ?",
      [txn_id]
    );

    if (existing.length > 0) {
      return res
        .status(409)
        .json({ status: false, message: "Transaction already exists" });
    }

    // ✅ Insert new transaction
    await pool.query(
      `INSERT INTO transaction (txn_id, phone, amount, method, type, name, account, status)
       VALUES (?, ?, ?, ?, ?, ?,? ,?)`,
      [
        txn_id,
        phone,
        parseFloat(amount.replace(/,/g, "")),
        method,
        type,
        "NA",
        "NA",
        status,
      ]
    );

    const summary = `💰 New Deposit Request
🏦 Bank: ${method}
👤 Phone Number: ${phone}
💵 Amount: ETB ${parseFloat(amount.replace(/,/g, ""))}
📄 Ref: ${txn_id}`;

    bot.sendMessage("353008986", summary, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Confirm",
              callback_data: `confirm_d_${phone}_${amount}_${txn_id}`,
            },
          ],
        ],
      },
    });

    res.json({ status: true, message: "Transaction saved" });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ status: false, message: "Server error" });
  }
});

router.post("/auto_create_deposit_transaction", async (req, res) => {
  const { txn_id, phone, amount, method, type, status } = req.body;

  if (!txn_id || !phone || !amount || !method || !type || !status) {
    return res
      .status(400)
      .json({ status: false, message: "Missing required fields" });
  }
  console.log(phone);

  try {
    // ✅ Check if txn_id already exists
    const [existing] = await pool.query(
      "SELECT id FROM transaction WHERE txn_id = ?",
      [txn_id]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        status: false,
        message: "Transaction number already proccessed",
      });
    }

    const receiptData = await validateTelebrirReceipt(
      txn_id,
      admin_name,
      admin_telebirr_phone,
      "2519****6919"
    );

    console.log(
      receiptData.valid,
      receiptData.receiptData.amount -
        receiptData.receiptData.serviceFee -
        receiptData.receiptData.serviceFeeVAT
    );

    if (!receiptData.valid) {
      return res.status(400).json({
        status: false,
        message: "Invalid transaction number",
      });
    }

    const requestedAmount =
      receiptData.receiptData.amount -
      receiptData.receiptData.serviceFee -
      receiptData.receiptData.serviceFeeVAT;

    // ✅ Insert new transaction
    await pool.query(
      `INSERT INTO transaction (txn_id, phone, amount, method, type, name, account, status)
           VALUES (?, ?, ?, ?, ?, ?,? ,?)`,
      [txn_id, phone, requestedAmount, method, type, "NA", "NA", "active"]
    );

    const summary = `Money has been deposited. Details: 
    🏦 Bank: ${method}
    👤 Phone Number: ${phone}
    💵 Amount: ETB ${requestedAmount}
    📄 Ref: ${txn_id}`;

    bot.sendMessage("353008986", summary, {
      // reply_markup: {
      //   inline_keyboard: [
      //     [
      //       {
      //         text: "Confirm",
      //         callback_data: `confirm_d_${phone}_${amount}_${txn_id}`,
      //       },
      //     ],
      //   ],
      // },
    });
    await pool.query("UPDATE users SET bonus = bonus + ? WHERE phone = ?", [
      requestedAmount,
      phone,
    ]);

    res.json({
      status: true,
      message: "Transaction saved",
      amount: requestedAmount,
    });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ status: false, message: "Server error" });
  }
});

router.post("/create_withdraw_transaction", async (req, res) => {
  const { phone, amount, method, name, account, status } = req.body;

  console.log(phone, amount, method, name, account, status);

  if (!phone || !amount || !method || !name || !account || !status) {
    return res
      .status(400)
      .json({ status: false, message: "Missing required fields" });
  }

  try {
    // 1. ✅ Check user balance
    const [users] = await pool.query(
      "SELECT balance FROM users WHERE phone = ?",
      [phone]
    );

    if (users.length === 0) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const balance = parseFloat(users[0].balance);
    const requested = parseFloat(amount);

    if (balance < requested) {
      return res.status(400).json({
        status: false,
        message: `Insufficient balance. Available: ETB ${balance}`,
      });
    }

    // 2. ✅ Check if user has deposited at least 100 birr
    const [deposits] = await pool.query(
      "SELECT SUM(amount) AS total_deposit FROM transaction WHERE phone = ? AND type = 'd' AND status = 'active'",
      [phone]
    );

    const totalDeposit = parseFloat(deposits[0].total_deposit || 0);

    if (totalDeposit < 100) {
      return res.status(400).json({
        status: false,
        message: `Minimum deposit of 100 ETB required to withdraw. Your total deposit: ${totalDeposit}`,
      });
    }

    // 3. Check if user has apply for withdrawal for the day before
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    const formatted = `${yyyy}-${mm}-${dd}`;

    const [apply_before] = await pool.query(
      "SELECT * FROM transaction WHERE phone = ? AND type = 'w' AND created_at = ? AND status = 'pending'",
      [phone, formatted]
    );

    if (apply_before.length > 0) {
      return res.status(404).json({
        status: false,
        message: "Wait for verfication for your earlier application.",
      });
    }

    // 4. ✅ Passed checks — insert withdraw transaction
    const txn_id = uuidv4();

    await pool.query(
      `INSERT INTO transaction (txn_id, phone, amount, method, type, name, account, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [txn_id, phone, requested, method, "w", name, account, status]
    );

    await pool.query(
      `UPDATE users set balance = balance - ? where phone = ? `,
      [requested, phone]
    );

    const summary = `💰 New Withdraw Request
🏦 Bank: ${method}
🏦 Account name: ${name}
👤 Phone Number: ${phone}
💵 Amount: ETB ${requested}
💵 Account: \`${account}\`
📄 Ref: ${txn_id}`;

    bot.sendMessage("353008986", summary, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Confirm",
              callback_data: `confirm_w_${phone}_${amount}_${txn_id}`,
            },
          ],
        ],
      },
    });

    return res.json({
      status: true,
      message: "Withdraw transaction saved",
      txn_id,
    });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ status: false, message: "Server error" });
  }
});

router.post("/santim_deposit_order", async (req, res) => {
  const { phone, amount } = req.body;

  // const phone = "934596919";
  // const amount = 1;
  const reason = "Payment for coffee";
  const paymentMethod = "Telebirr";
  const notifyUrl = "https://abogidabingo.duckdns.org/api/general/webhook";

  const successRedirectUrl = "https://abogidabingo.duckdns.org";
  const failureRedirectUrl = "https://abogidabingo.duckdns.org";
  const cancelRedirectUrl = "https://abogidabingo.duckdns.org";

  const id = generateTxnId();
  const signedToken = createSignedTokenForCheckout(amount, reason);

  console.log("ID: ", id);

  const body = {
    id,
    amount,
    reason,
    merchantId: MERCHANT_ID,
    signedToken,
    successRedirectUrl,
    failureRedirectUrl,
    notifyUrl,
    cancelRedirectUrl,
    paymentMethod,
    phoneNumber: "+251" + phone,
  };

  try {
    // ✅ Check if txn_id already exists
    // const [existing] = await pool.query(
    //   "SELECT id FROM transaction WHERE txn_id = ?",
    //   [txn_id]
    // );

    // if (existing.length > 0) {
    //   // return res
    //   //   .status(409)
    //   //   .json({ status: false, message: "Transaction already exists" });
    //   return;
    // }

    // ✅ Insert new transaction
    await pool.query(
      `INSERT INTO transaction (txn_id, phone, amount, method, type, name, account, status)
       VALUES (?, ?, ?, ?, ?, ?,? ,?)`,
      [id, phone, amount, "", "d", "NA", "NA", "pending"]
    );

    // res.json({ status: true, message: "Transaction saved" });

    const response = await axios.post(`${BASE_URL}/initiate-payment`, body);
    // console.log("✅ Checkout URL:", response.data.url);
    res.json({ status: true, url: response.data.url });
  } catch (err) {
    console.error("❌ Checkout Error:", err.response?.data || err.message);
    res.status(500).json({
      status: false,
      message: err.response?.data || "Failed to initiate payment",
    });
  }
});

// Webhook
router.post("/webhook", async (req, res) => {
  // console.log("📦 Webhook payload:", req.body);
  const body = req.body;
  const txn_id = body.thirdPartyId;
  const status = body.Status;
  const method = body.paymentVia;
  const phone = body.msisdn.replace(/^\+251\s?/, "").replace(/\s+/g, "");
  const amount = body.totalAmount;
  console.log(txn_id, status, method, phone);

  if (status === "COMPLETED") {
    try {
      const [existing] = await pool.query(
        "SELECT id FROM transaction WHERE txn_id = ?",
        [txn_id]
      );

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
      }

      await pool.query(
        "UPDATE transaction SET status = ?, method = ? WHERE txn_id = ?",
        ["active", method, txn_id]
      );

      res.json({
        success: true,
        message: "Transaction status updated successfully",
      });

      // Apply balance/bonus update
      await pool.query("UPDATE users SET bonus = bonus + ? WHERE phone = ?", [
        amount,
        phone,
      ]);
    } catch (err) {
      console.error("DB error:", err);
      res.status(500).json({
        success: false,
        message: "Server error while updating transaction",
      });
    }
  }
});

// GET /transactions?phone=09XXXXXXXX
router.get("/transactions", async (req, res) => {
  const phone = req.query.phone?.trim();

  if (!phone) {
    return res
      .status(400)
      .json({ status: false, message: "Phone number is required." });
  }

  try {
    const [rows] = await pool.query(
      `SELECT *
       FROM transaction
       WHERE phone = ? 
       ORDER BY created_at DESC`,
      [phone]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ status: false, message: "No transactions found." });
    }

    res.json({ status: true, data: rows });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ status: false, message: "Server error." });
  }
});

// Get pending transactions
router.get("/pending_transactions", async (req, res) => {
  const phone = req.query.phone?.trim();
  const date = req.query.date?.trim();
  const start = `${date} 00:00:00`;
  const end = `${date} 23:59:59`;
  if (!phone) {
    return res
      .status(400)
      .json({ status: false, message: "Phone number is required." });
  }

  try {
    const [rows] = await pool.query(
      `SELECT *
       FROM transaction
       WHERE created_at BETWEEN ? AND ? AND status = 'pending'
       ORDER BY created_at DESC`,
      [start, end]
    );

    console.log("No found any pending trasnaction;");

    if (rows.length === 0) {
      return res
        .status(200)
        .json({ status: false, message: "No transactions found." });
    }

    res.json({ status: true, data: rows });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ status: false, message: "Server error." });
  }
});

// Confirm transaction by admin
router.post("/confirm_transaction", async (req, res) => {
  const { txn_id, phone, amount, type } = req.body;

  // console.log(txn_id, phone, parseFloat(amount.replace(/,/g, "")), type);

  try {
    const [existingTxn] = await pool.query(
      "SELECT * FROM transaction WHERE txn_id = ?",
      [txn_id]
    );

    if (existingTxn.length === 0) {
      return res.status(404).json({ error: "Reference number not found." });
    }

    const currentStatus = existingTxn[0].status;
    if (currentStatus === "active") {
      return res.status(400).json({ error: "Transaction already processed." });
    }

    // Get user
    const [user] = await pool.query("SELECT * FROM users WHERE phone = ?", [
      phone,
    ]);

    if (user.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    let updateQuery;
    if (type === "d") {
      updateQuery = "UPDATE users SET bonus = bonus + ? WHERE phone = ?";
    } else if (type === "w") {
      // Check balance
      if (user[0].balance < parseFloat(amount.replace(/,/g, ""))) {
        return res.status(400).json({ error: "Insufficient balance." });
      }
      updateQuery = "UPDATE users SET balance = balance - ? WHERE phone = ?";
    } else {
      return res.status(400).json({ error: "Invalid transaction type." });
    }

    // Apply balance/bonus update
    await pool.query(updateQuery, [
      type === "d" ? parseFloat(amount.replace(/,/g, "")) : 0,
      phone,
    ]);
    // Update transaction status to active
    await pool.query(
      "UPDATE transaction SET status = 'active' WHERE txn_id = ?",
      [txn_id]
    );

    const chatID = await get_telegram_id_from_phone(phone);
    bot.sendMessage(
      chatID,
      `Your ${
        type === "d" ? "Deopsit" : "Withdrawal"
      } request has been successfully confirmed. Check your balance.`
    );

    return res.json({ status: "success", txn_id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Receive messages from user
router.post("/save_message", async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: "Phone and message are required." });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO messages (phone, message) VALUES (?, ?)",
      [phone, message]
    );

    return res.status(201).json({
      message: "Message sent successfully. We will get back to you. Thanks.",
      id: result.insertId,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to save message." });
  }
});

// Get messages
router.get("/messages", async (req, res) => {
  const phone = req.query.phone?.trim();

  if (!phone) {
    return res
      .status(400)
      .json({ status: false, message: "Phone number is required." });
  }

  try {
    const [rows] = await pool.query(
      `SELECT *
       FROM messages
       ORDER BY created_at DESC`,
      []
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ status: false, message: "No Messages found." });
    }

    res.json({ status: true, data: rows });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ status: false, message: "Server error." });
  }
});

// Get pending bonus games
router.get("/pending_bonus_games", async (req, res) => {
  const phone = req.query.phone?.trim();

  if (!phone) {
    return res
      .status(400)
      .json({ status: false, message: "Phone number is required." });
  }

  try {
    const [rows] = await pool.query(
      `SELECT *
       FROM bonus WHERE status = 'pending'
       ORDER BY created_at DESC`,
      []
    );

    if (rows.length === 0) {
      return res.json({ status: false, message: "No bonus games found." });
    }

    res.json({ status: true, data: rows });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ status: false, message: "Server error." });
  }
});

// Create a bonus game
router.post("/create_bonus_game", async (req, res) => {
  let { amount, reason, required_games, required_amount, play_date } = req.body;

  // Sanitize and default reason
  reason = (reason || "").trim();
  if (!reason) reason = "daily";

  // Validate presence
  if (
    amount === undefined ||
    required_games === undefined ||
    required_amount === undefined ||
    !play_date
  ) {
    return res.status(400).json({
      error: "All fields except reason are required.",
    });
  }

  // Parse as integers
  amount = parseInt(amount, 10);
  required_games = parseInt(required_games, 10);
  required_amount = parseInt(required_amount, 10);

  // Check that values are valid integers and non-negative
  if (
    isNaN(amount) ||
    amount < 0 ||
    isNaN(required_games) ||
    required_games < 0 ||
    isNaN(required_amount) ||
    required_amount < 0
  ) {
    return res.status(400).json({
      error:
        "Amount, required amount, and required games must be positive integers.",
    });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO bonus (amount, reason, required_games, required_amount, play_date, status, winner)
       VALUES (?, ?, ?, ?, ?, 'pending', '')`,
      [amount, reason, required_games, required_amount, play_date]
    );

    res.status(201).json({
      message: "Bonus created successfully.",
      id: result.insertId,
    });
  } catch (err) {
    console.error("Insert error:", err);
    res.status(500).json({ error: "Failed to create bonus." });
  }
});

// delete a bouns game
router.put("/deactivate_bonus/:id", async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "Bonus ID is required." });
  }

  try {
    const [result] = await pool.query(
      "UPDATE bonus SET status = 'inactive' WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Bonus not found." });
    }

    res.json({ message: "Bonus marked as inactive successfully." });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: "Failed to update bonus status." });
  }
});

// Get all data related to balance manageing
// 1. Total depoists of the specfied dates
// 2. Total withdraws of the specfied dates
// 3. calculate cashflow from these two data
// 4. Total profit of the specified date
// 5. total bonuses issues
// 6. Net profit

// router.get("/cashflow", async (req, res) => {
//   const { from, to, phone } = req.query;
//   const fromDateTime = `${from} 00:00:00`;
//   const toDateTime = `${to} 23:59:59`;

//   if (!phone && !admin_phone.includes(phone)) {
//     return res
//       .status(400)
//       .json({ status: false, message: "Phone number is required." });
//   }

//   try {
//     // 1. Transaction totals by date and type
//     const [transactions] = await pool.query(
//       `SELECT DATE(created_at) AS date, type, SUM(amount) AS total
//        FROM transaction
//        WHERE status = 'active' AND created_at BETWEEN ? AND ?
//        GROUP BY DATE(created_at), type`,
//       [fromDateTime, toDateTime]
//     );

//     // 2. Game income by day
//     const [games] = await pool.query(
//       `SELECT DATE(date) AS date, SUM(game * no_players * 0.2) AS income
//        FROM games
//        WHERE date BETWEEN ? AND ?
//        GROUP BY DATE(date)`,
//       [fromDateTime, toDateTime]
//     );

// // NPC wins
// const [npc] = await pool.query(
//       `SELECT DATE(date) AS date, SUM(game * npc_win * 0.2) AS income
//        FROM games
//        WHERE date BETWEEN ? AND ?
//        GROUP BY DATE(date)`,
//       [fromDateTime, toDateTime]
//     );

//     // 3. New users per day (bonus = new_users * 10)
//     const [users] = await pool.query(
//       `SELECT DATE(created_at) AS date, COUNT(*) AS new_users
//        FROM users
//        WHERE created_at BETWEEN ? AND ?
//        GROUP BY DATE(created_at)`,
//       [fromDateTime, toDateTime]
//     );

//     // 4. Referrals per day (bonus = count * 3)
//     const [referrals] = await pool.query(
//       `SELECT DATE(created_at) AS date, COUNT(*) AS count
//        FROM referrals
//        WHERE created_at BETWEEN ? AND ?
//        GROUP BY DATE(created_at)`,
//       [fromDateTime, toDateTime]
//     );

//     const resultMap = {};

//     const formatDate = (dateStr) => {
//       const d = new Date(dateStr);
//       const yyyy = d.getFullYear();
//       const mm = String(d.getMonth() + 1).padStart(2, "0");
//       const dd = String(d.getDate()).padStart(2, "0");
//       return `${yyyy}-${mm}-${dd}`;
//     };

//     // Populate transactions
//     for (const row of transactions) {
//       const dateKey = formatDate(row.date);
//       if (!resultMap[dateKey]) {
//         resultMap[dateKey] = {
//           date: dateKey,
//           total_deposit: 0,
//           total_withdrawal: 0,
//           game_income: 0,
//           bonus_given: 0,
//           referrals: { count: 0, bonus: 0 },
//         };
//       }
//       if (row.type === "d") {
//         resultMap[dateKey].total_deposit += Number(row.total);
//       } else if (row.type === "w") {
//         resultMap[dateKey].total_withdrawal += Number(row.total);
//       }
//     }

//     // Add game income
//     for (const row of games) {
//       const dateKey = formatDate(row.date);
//       if (!resultMap[dateKey]) {
//         resultMap[dateKey] = {
//           date: dateKey,
//           total_deposit: 0,
//           total_withdrawal: 0,
//           game_income: 0,
//           bonus_given: 0,
//           referrals: { count: 0, bonus: 0 },
//         };
//       }
//       resultMap[dateKey].game_income += Number(row.income || 0);
//     }

//     // Add bonus from new users
//     for (const row of users) {
//       const dateKey = formatDate(row.date);
//       if (!resultMap[dateKey]) {
//         resultMap[dateKey] = {
//           date: dateKey,
//           total_deposit: 0,
//           total_withdrawal: 0,
//           game_income: 0,
//           bonus_given: 0,
//           referrals: { count: 0, bonus: 0 },
//         };
//       }
//       resultMap[dateKey].bonus_given += row.new_users * 10;
//     }

//     // Add referral bonus
//     for (const row of referrals) {
//       const dateKey = formatDate(row.date);
//       if (!resultMap[dateKey]) {
//         resultMap[dateKey] = {
//           date: dateKey,
//           total_deposit: 0,
//           total_withdrawal: 0,
//           game_income: 0,
//           bonus_given: 0,
//           referrals: { count: 0, bonus: 0 },
//         };
//       }
//       resultMap[dateKey].referrals.count += row.count;
//       resultMap[dateKey].referrals.bonus += row.count * 3;
//     }

//     const resultArray = Object.values(resultMap).sort(
//       (a, b) => new Date(a.date) - new Date(b.date)
//     );

//     res.json(resultArray);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Error fetching cashflow summary." });
//   }
// });
router.get("/cashflow", async (req, res) => {
  const { from, to, phone } = req.query;
  const fromDateTime = `${from} 00:00:00`;
  const toDateTime = `${to} 23:59:59`;

  if (!phone && !admin_phone.includes(phone)) {
    return res
      .status(400)
      .json({ status: false, message: "Phone number is required." });
  }

  try {
    // 1. Transaction totals by date and type
    const [transactions] = await pool.query(
      `SELECT DATE(created_at) AS date, type, SUM(amount) AS total
       FROM transaction
       WHERE status = 'active' AND created_at BETWEEN ? AND ?
       GROUP BY DATE(created_at), type`,
      [fromDateTime, toDateTime]
    );

    // 2. Game income by day
    const [games] = await pool.query(
      `SELECT DATE(date) AS date, SUM(game * no_players * 0.2) AS income
       FROM games
       WHERE date BETWEEN ? AND ?
       GROUP BY DATE(date)`,
      [fromDateTime, toDateTime]
    );

    // 3. NPC wins (will be included in total_withdrawal)
    const [npc] = await pool.query(
      `SELECT DATE(date) AS date, SUM(game * no_players * 0.2) AS income
   FROM games
   WHERE date BETWEEN ? AND ? AND winner != 'npc'
   GROUP BY DATE(date)`,
      [fromDateTime, toDateTime]
    );

    // 4. New users per day (bonus = new_users * 10)
    const [users] = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS new_users
       FROM users
       WHERE created_at BETWEEN ? AND ?
       GROUP BY DATE(created_at)`,
      [fromDateTime, toDateTime]
    );

    // 5. Referrals per day (bonus = count * 3)
    const [referrals] = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM referrals
       WHERE created_at BETWEEN ? AND ?
       GROUP BY DATE(created_at)`,
      [fromDateTime, toDateTime]
    );

    const resultMap = {};

    const formatDate = (dateStr) => {
      const d = new Date(dateStr);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    // Populate transactions
    for (const row of transactions) {
      const dateKey = formatDate(row.date);
      if (!resultMap[dateKey]) {
        resultMap[dateKey] = {
          date: dateKey,
          total_deposit: 0,
          total_withdrawal: 0, // NPC losses will be added here
          game_income: 0,
          bonus_given: 0,
          referrals: { count: 0, bonus: 0 },
        };
      }
      if (row.type === "d") {
        resultMap[dateKey].total_deposit += Number(row.total);
      } else if (row.type === "w") {
        resultMap[dateKey].total_withdrawal += Number(row.total);
      }
    }

    // Add game income
    for (const row of games) {
      const dateKey = formatDate(row.date);
      if (!resultMap[dateKey]) {
        resultMap[dateKey] = {
          date: dateKey,
          total_deposit: 0,
          total_withdrawal: 0,
          game_income: 0,
          bonus_given: 0,
          referrals: { count: 0, bonus: 0 },
        };
      }
      resultMap[dateKey].game_income += Number(row.income || 0);
    }

    // Add NPC losses to withdrawals (maintaining same structure)
    for (const row of npc) {
      const dateKey = formatDate(row.date);
      if (!resultMap[dateKey]) {
        resultMap[dateKey] = {
          date: dateKey,
          total_deposit: 0,
          total_withdrawal: 0,
          game_income: 0,
          bonus_given: 0,
          referrals: { count: 0, bonus: 0 },
        };
      }
      resultMap[dateKey].bonus_given += Number(row.npc_loss || 0);
    }

    // Add bonus from new users
    for (const row of users) {
      const dateKey = formatDate(row.date);
      if (!resultMap[dateKey]) {
        resultMap[dateKey] = {
          date: dateKey,
          total_deposit: 0,
          total_withdrawal: 0,
          game_income: 0,
          bonus_given: 0,
          referrals: { count: 0, bonus: 0 },
        };
      }
      resultMap[dateKey].bonus_given += row.new_users * 10;
    }

    // Add referral bonus
    for (const row of referrals) {
      const dateKey = formatDate(row.date);
      if (!resultMap[dateKey]) {
        resultMap[dateKey] = {
          date: dateKey,
          total_deposit: 0,
          total_withdrawal: 0,
          game_income: 0,
          bonus_given: 0,
          referrals: { count: 0, bonus: 0 },
        };
      }
      resultMap[dateKey].referrals.count += row.count;
      resultMap[dateKey].referrals.bonus += row.count * 3;
    }

    const resultArray = Object.values(resultMap).sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    res.json(resultArray);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching cashflow summary." });
  }
});

// Get all users
router.get("/users", async (req, res) => {
  const phone = req.query.phone?.trim();

  if (!phone && !admin_phone.includes(phone)) {
    return res
      .status(400)
      .json({ status: false, message: "Phone number is required." });
  }

  try {
    const [rows] = await pool.query(
      `SELECT *
       FROM users
       ORDER BY created_at DESC`,
      [phone]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ status: false, message: "No users found." });
    }

    res.json({ status: true, data: rows });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ status: false, message: "Server error." });
  }
});

router.get("/get_name", async (req, res) => {
  const phone = req.query.phone?.trim();

  if (!phone) {
    return res
      .status(400)
      .json({ status: false, message: "Phone number is required." });
  }

  try {
    const [rows] = await pool.query(
      `SELECT name
       FROM users where phone = ?`,
      [phone]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ status: false, message: "No users found." });
    }

    res.json({ status: true, data: rows });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ status: false, message: "Server error." });
  }
});

router.post("/transfer", async (req, res) => {
  const { phone1, phone2, amount } = req.body;
  const txn_id = uuidv4();

  try {
    const [reciever] = await pool.query(
      "SELECT bonus, balance FROM users WHERE phone = ?",
      [phone2]
    );

    if (reciever.length === 0) {
      return res
        .status(404)
        .json({ status: false, message: "Receiver does not exist" });
    }

    const [rows] = await pool.query(
      "SELECT bonus, balance FROM users WHERE phone = ?",
      [phone1]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ status: false, message: "No users found." });
    }

    let { bonus, balance } = rows[0];

    if (bonus >= amount) {
      bonus -= amount;
    } else if (bonus + balance >= amount) {
      const remaining = amount - bonus;
      bonus = 0;
      balance -= remaining;
    } else {
      return res
        .status(400)
        .json({ status: false, message: "Insufficient Balance" });
    }

    await pool.query(
      "UPDATE users SET bonus = ?, balance = ? WHERE phone = ?",
      [bonus, balance, phone1]
    );

    await pool.query("UPDATE users SET bonus = bonus + ? where phone = ?", [
      amount,
      phone2,
    ]);

    await pool.query(
      `INSERT INTO transaction (txn_id, phone, amount, method, type, name, account, status)
           VALUES (?, ?, ?, ?, ?, ?,? ,?)`,
      [txn_id, phone1, amount, "", "transfer", "NA", "NA", "active"]
    );

    const telegram_id_2 = await get_telegram_id_from_phone(phone2);
    const telegram_id_1 = await get_telegram_id_from_phone(phone1);

    bot.sendMessage(
      telegram_id_1,
      `You have transferred Br. ${amount} to user ${phone2} successfully. `
    );
    bot.sendMessage(
      telegram_id_2,
      `You have received Br. ${amount} from user ${phone1}. `
    );

    return res.status(200).json({ status: true, message: "Success" });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ status: false, message: "Server error." });
  }
});

router.post("/leaderboard", async (req, res) => {
  const { phone, game } = req.body;

  const data = await getTopPlayersIncludingUser(phone, game);

  if (!data || data.length === 0) {
    return res
      .status(404)
      .json({ status: false, message: "No players found." });
  }
  res.json({ status: true, data });
});

router.post("/profile", async (req, res) => {
  try {
    const { phone, name } = req.body;

    if (!phone || !name) {
      return res.status(400).json({ error: "Phone and name are required" });
    }

    console.log(phone, "named", name);

    await pool.query("update users set name = ? where phone = ?", [
      name,
      phone,
    ]);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      name: name,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/referrals", async (req, res) => {
  try {
    const { id, name } = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    // Query referrals by referrer_telegram_id
    const [rows] = await pool.query(
      `SELECT *
       FROM referrals 
       WHERE referrer_telegram_id = ? 
       ORDER BY created_at DESC`,
      [id]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("❌ Error querying profile:", err);
    res.status(500).json({ error: "Server error" });
  }
});

async function get_telegram_id_from_phone(phone) {
  if (!phone) return false;

  try {
    const [rows] = await pool.query(
      "SELECT telegram_id FROM users WHERE phone = ? LIMIT 1",
      [phone]
    );
    return rows[0].telegram_id;
  } catch (err) {
    console.error("Error checking user existence:", err);
    return false;
  }
}

async function validateTelebrirReceipt(
  reference,
  receiverName,
  receiverPhone,
  senderPhone
) {
  try {
    // Construct URL
    const receiptUrl = `https://transactioninfo.ethiotelecom.et/receipt/${reference}`;

    // Scrape data
    const receiptData = await scrapeTelebrirReceipt(receiptUrl);

    // Validate data
    const validation = {
      receiverNameMatch: receiptData.receiverName === receiverName,
      receiverPhoneMatch: receiptData.receiverPhone.endsWith(
        receiverPhone.slice(-4)
      ),
      senderPhoneMatch: receiptData.senderPhone.endsWith(senderPhone.slice(-4)),
      allMatch: function () {
        return (
          this.receiverNameMatch &&
          this.receiverPhoneMatch &&
          this.senderPhoneMatch
        );
      },
    };

    return {
      valid: validation.allMatch(),
      validationDetails: validation,
      receiptData: receiptData,
    };
  } catch (error) {
    console.error("Error validating receipt:", error);
    throw error;
  }
}

async function scrapeTelebrirReceipt(receiptUrl) {
  try {
    // Fetch the HTML content
    const response = await axios.get(receiptUrl);
    const html = response.data;

    // Load HTML into Cheerio
    const $ = cheerio.load(html);

    // Helper function to extract numeric value from currency string
    const extractNumericValue = (currencyString) => {
      const numericValue = parseFloat(currencyString.replace(/[^\d.]/g, ""));
      return isNaN(numericValue) ? null : numericValue;
    };

    // Extract the essential data
    const receiptData = {
      // Sender information
      senderName: $('td:contains("የከፋይ ስም/Payer Name")').next().text().trim(),
      senderPhone: $('td:contains("የከፋይ ቴሌብር ቁ./Payer telebirr no.")')
        .next()
        .text()
        .trim(),

      // Receiver information
      receiverName: $('td:contains("የገንዘብ ተቀባይ ስም/Credited Party name")')
        .next()
        .text()
        .trim(),
      receiverPhone: $(
        'td:contains("የገንዘብ ተቀባይ ቴሌብር ቁ./Credited party account no")'
      )
        .next()
        .text()
        .trim(),
      serviceFee: extractNumericValue(
        $('td:contains("የአገልግሎት ክፍያ/Service fee")').next().text().trim()
      ),
      serviceFeeVAT: extractNumericValue(
        $('td:contains("የአገልግሎት ክፍያ ተ.እ.ታ/Service fee VAT")')
          .next()
          .text()
          .trim()
      ),
      // Transaction details
      amount: extractNumericValue(
        $('td:contains("ጠቅላላ የተከፈለ/Total Paid Amount")').next().text().trim()
      ),
      status: $('td:contains("የክፍያው ሁኔታ/transaction status")')
        .next()
        .text()
        .trim(),
    };

    return receiptData;
  } catch (error) {
    console.error("Error scraping receipt:", error);
    throw error;
  }
}

// async function getTop10Players(gameName) {
//   // Query all players strings for the given game
//   const [rows] = await pool.query("SELECT players FROM games WHERE game = ?", [
//     gameName,
//   ]);

//   // Aggregate player counts
//   const counts = {};

//   for (const row of rows) {
//     if (!row.players) continue; // skip empty/null

//     const playersArray = row.players.split(",").map((p) => p.trim());

//     for (const player of playersArray) {
//       if (!player) continue;
//       counts[player] = (counts[player] || 0) + 1;
//     }
//   }

//   // Convert counts to array and sort descending
//   const sortedPlayers = Object.entries(counts)
//     .sort((a, b) => b[1] - a[1])
//     .slice(0, 10)
//     .map(([player, count]) => ({ player, count }));

//   return sortedPlayers;
// }

async function getTop10Players(gameName) {
  const [rows] = await pool.query("SELECT players FROM games WHERE game = ?", [
    gameName,
  ]);

  const counts = {};

  for (const row of rows) {
    if (!row.players) continue;

    const playersArray = row.players
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (playersArray.length < 5) {
      // Skip this game because it has fewer than 5 players
      continue;
    }

    for (const player of playersArray) {
      counts[player] = (counts[player] || 0) + 1;
    }
  }

  const sortedPlayers = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([player, count]) => ({ player, count }));

  return sortedPlayers;
}

async function countUserGamesWithMinPlayers(phone, gameName) {
  const [rows] = await pool.query(
    "SELECT players FROM games WHERE game = ? AND players LIKE ?",
    [gameName, `%${phone}%`]
  );

  let count = 0;

  for (const row of rows) {
    if (!row.players) continue;

    const playersArray = row.players
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    // Skip games with fewer than 5 players
    if (playersArray.length < 5) continue;

    // Check exact presence of phone number
    if (playersArray.includes(phone)) {
      count++;
    }
  }

  return count;
}

async function getTopPlayersIncludingUser(phone, gameName) {
  // Fetch all games for this gameName with ≥5 players
  const [rows] = await pool.query("SELECT players FROM games WHERE game = ?", [
    gameName,
  ]);

  const counts = {};

  for (const row of rows) {
    if (!row.players) continue;

    const playersArray = row.players
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (playersArray.length < 5) continue;

    for (const player of playersArray) {
      counts[player] = (counts[player] || 0) + 1;
    }
  }

  // Sort players by frequency descending
  const sortedPlayers = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  // Take top 10
  const top10 = sortedPlayers.slice(0, 10);

  // Check if user is in top 10
  const userInTop10 = top10.some(([player]) => player === phone);

  if (userInTop10) {
    // Map to desired output format and return top 10
    return top10.map(([player, count]) => ({ player, count }));
  } else {
    // Get user count (or 0 if not played)
    const userCount = counts[phone] || 0;

    // Prepare result: top 10 + user at bottom
    const result = top10.map(([player, count]) => ({ player, count }));

    // Append user at the bottom only if userCount > 0
    if (userCount > 0) {
      result.push({ player: phone, count: userCount });
    } else {
      // If userCount == 0, you can decide to append or not; here we skip
    }

    return result;
  }
}

(async () => {
  const players = await getTopPlayersIncludingUser("934596919", 10);
  console.log(players);
})();

module.exports = router;
