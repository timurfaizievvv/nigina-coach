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

// ================= НАПОМИНАНИЯ =================
function scheduleReminder(date, time, chat_id) {
  const trainingDate = new Date(`${date} ${time}`);
  const now = new Date();

  const ms24h = trainingDate - now - (24 * 60 * 60 * 1000);
  const ms2h = trainingDate - now - (2 * 60 * 60 * 1000);

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

// ================= СОХРАНЕНИЕ В SUPABASE =================
async function save(data) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      Prefer: "return=representation" // 🔥 важно
    },
    body: JSON.stringify([data]) // 🔥 важно (массив)
  });

  const text = await response.text();
  console.log("SUPABASE RESPONSE:", text);

  if (!response.ok) {
    throw new Error("Ошибка записи в Supabase");
  }

  return text;
}

// ================= TELEGRAM =================
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

// ================= BOOK =================
app.post("/book", async (req, res) => {
  const data = req.body;

  console.log("NEW BOOKING:", data); // 🔥 лог входящих данных

  try {
    await save(data);

    // в группу
    await sendTG(`
🗓️ Новая запись
👤 ${data.name}
☎️ ${data.contact}
✨ ${data.training}
📍 ${data.format}
📆 ${data.date} ${data.time}
    `);

    // напоминания
    scheduleReminder(data.date, data.time, data.chat_id);

    // клиенту
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
    console.log("ERROR:", e.message);
    res.status(500).json({ error: "Ошибка записи" });
  }
});

// ================= ПОЛУЧЕНИЕ =================
app.get("/slots-all", async (req, res) => {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/records`, {
    headers: {
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`
    }
  });

  const data = await r.json();
  res.json(data);
});

// ================= МОИ ЗАПИСИ =================
app.get("/my-bookings/:chat_id", async (req, res) => {
  const chat_id = req.params.chat_id;

  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/records?chat_id=eq.${chat_id}&order=date.asc`,
      {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`
        }
      }
    );

    const data = await r.json();
    res.json(data);

  } catch (e) {
    console.log("ERROR MY BOOKINGS:", e);
    res.status(500).json({ error: "Ошибка получения записей" });
  }
});

// ================= CRON НАПОМИНАНИЯ =================
setInterval(async () => {
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/records`, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    });

    const bookings = await r.json();
    const now = new Date();

    for (const b of bookings) {
      const trainingDate = new Date(b.date + "T" + b.time);

      const diff = trainingDate - now;

      const hours = diff / (1000 * 60 * 60);

      // 🔔 за 24 часа
      if (hours > 23.9 && hours < 24.1 && !b.reminded_24h) {
        await sendReminder(b.chat_id, `Напоминаю, что завтра тренировка в ${b.time} ✨`);
        await markReminder(b.id, "reminded_24h");
      }

      // 🔔 за 2 часа
      if (hours > 1.9 && hours < 2.1 && !b.reminded_2h) {
        await sendReminder(b.chat_id, `Через 2 часа тренировка ✨`);
        await markReminder(b.id, "reminded_2h");
      }
    }

  } catch (e) {
    console.log("CRON ERROR", e);
  }
}, 60 * 1000); // каждую минуту

// ================= REMINDER HELPERS =================
async function sendReminder(chat_id, text) {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text }),
  });
}

async function markReminder(id, field) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/records?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`
    },
    body: JSON.stringify({ [field]: true })
  });
}

// ================= ROOT =================
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.listen(PORT, () => console.log("Server started"));
