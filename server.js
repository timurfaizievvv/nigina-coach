require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("./"));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

// запись в базу
async function save(data) {
  return await fetch(`${process.env.SUPABASE_URL}/rest/v1/records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
    },
    body: JSON.stringify(data),
  });
}

// отправка в телеграм
async function sendTG(text) {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.CHAT_ID,
      text,
    }),
  });
}

// запись
app.post("/book", async (req, res) => {
  const data = req.body;

  try {
    await save(data);

    await sendTG(`
Новая запись:
${data.name}
${data.contact}
${data.training}
${data.format}
${data.date} ${data.time}
    `);

    res.json({ ok: true });

  } catch (e) {
    console.log(e);
    res.status(500).json({ error: "занято" });
  }
});

app.get("/slots-all", async (req, res) => {
  const r = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/records`,
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

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.listen(PORT, () => console.log("Server started"));
