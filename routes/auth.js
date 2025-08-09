// routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs"); // use bcryptjs or bcrypt
const router = express.Router();
const pool = require("../db"); // from db.js

router.post("/signup", async (req, res) => {
  const { telegram_id = "", phone, password, confirmPassword, name } = req.body;
  // Basic validations

  console.log("Telegram ID:", telegram_id);

  const cleaned = phone.replace(/\s/g, "");
  const startsCorrectly = cleaned[0] === "7" || cleaned[0] === "9";

  if (cleaned.length !== 9 || !startsCorrectly) {
    return res
      .status(400)
      .json({ status: false, message: "Invalid phone number." });
  }

  if (password.length < 8) {
    return res.status(400).json({
      status: false,
      message: "Password must be at least 8 characters.",
    });
  }

  if (password !== confirmPassword) {
    return res
      .status(400)
      .json({ status: false, message: "Passwords do not match." });
  }

  // if (name.length < 4) {
  //   return res
  //     .status(400)
  //     .json({ status: false, message: "Username too short." });
  // }

  try {
    const [existing] = await pool.query(
      "SELECT * FROM users WHERE phone = ? OR name = ?",
      [cleaned, name]
    );

    if (existing.length > 0) {
      if (existing.find((u) => u.phone === cleaned)) {
        return res
          .status(400)
          .json({ status: false, message: "Phone already exists." });
      }
      if (existing.find((u) => u.name === name)) {
        return res
          .status(400)
          .json({ status: false, message: "Username already exists." });
      }
    }
    console.log("Received:", req.body);

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (telegram_id,name, phone, password,  balance, bonus, played, won) VALUES (?, ?, ?, ?,?,?,?,?)",
      [telegram_id, name, cleaned, hashedPassword, 0, 10, 0, 0]
    );

    console.log("✅ Insertion complete. Sending response...");

    return res.json({ status: true, message: "Registered successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: false, message: "Server error." });
  }
});

router.post("/login", async (req, res) => {
  const { phone, password } = req.body;
  const cleaned = phone.replace(/\s/g, "");

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE phone = ?", [
      cleaned,
    ]);

    if (rows.length === 0) {
      return res
        .status(400)
        .json({ status: false, message: "User not found." });
    }

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ status: false, message: "Incorrect password." });
    }

    // Remove sensitive fields before returning user
    delete user.password;

    return res.json({ status: true, message: "Login successful.", user });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ status: false, message: "Server error." });
  }
});

module.exports = router;
