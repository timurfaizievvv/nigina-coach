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

function scheduleReminder(date, time, chat_id) {
  const trainingDate = new Date(`${date} ${time}`);

  const now = new Date();

  const ms24h = trainingDate - now - (24 * 60 * 60 * 1000);
  const ms2h = trainingDate - now - (2 * 60 * 60 * 1000);

  // за 24 часа
  if (ms24h > 0) {
    setTimeout(() => {
      fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          text: `Доброго времени суток!\nНапоминаю, что завтра Вы записаны ко мне на тренировку в ${time} ✨`
        }),
      });
    }, ms24h);
  }

  // за 2 часа
  if (ms2h > 0) {
    setTimeout(() => {
      fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          text: `Доброго времени суток!\nНапоминаю, что через 2 часа состоится наша тренировка ✨`
        }),
      });
    }, ms2h);
  }
}

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
🗓️ У тебя новая запись
👤 ${data.name}
☎️ ${data.contact}
✨ ${data.training}
📍 ${data.format}
📆 ${data.date} ${data.time}
    `);
    scheduleReminder(data.date, data.time, data.chat_id);

    // сообщение клиенту
await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: data.chat_id,
    text: "Вы успешно записаны на тренировку ✨\n\nЕсли у Вас есть вопросы, свяжитесь со мной @niginacoach"
  }),
});

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
