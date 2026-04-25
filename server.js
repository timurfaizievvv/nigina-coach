require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("./")); // важно

const PORT = process.env.PORT || 3000;

// 📩 отправка в Telegram
async function sendTelegram(text) {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.CHAT_ID,
      text
    })
  });
}

// 💾 запись в Supabase
async function saveToDB(data) {
  return await fetch(`${process.env.SUPABASE_URL}/rest/v1/records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      Prefer: "return=minimal"
    },
    body: JSON.stringify(data)
  });
}

// 📥 получить занятые слоты
app.get("/slots", async (req, res) => {
  const { date } = req.query;

  const r = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/records?date=eq.${date}`,
    {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    }
  );

  const data = await r.json();
  res.json(data);
});

// 📤 запись
app.post("/book", async (req, res) => {
  const data = req.body;

  try {
    await saveToDB(data);

    await sendTelegram(`
Новая запись:
Имя: ${data.name}
Контакт: ${data.contact}
Тренировка: ${data.training}
Формат: ${data.format}
Дата: ${data.date}
Время: ${data.time}
    `);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Ошибка записи" });
  }
});

app.listen(PORT, () => console.log("Server started"));
