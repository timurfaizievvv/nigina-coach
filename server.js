const express = require("express");
const app = express();

app.use(express.json());

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
let pendingRejects = {};

// Проверка сервера
app.get("/", (req, res) => {
  res.send("Server is working");
});

// 📌 СОЗДАНИЕ ЗАЯВКИ
app.post("/book", async (req, res) => {
  const { date, time, training, format, name, contact, telegram_id } = req.body;

  // 1. Сохраняем в базу
  const response = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({
      date,
      time,
      training,
      format,
      name,
      contact,
      telegram_id,
      status: "pending"
    })
  });

  // 2. Отправляем в Telegram группу
  const text = `
📥 Новая заявка

👤 ${name}
📅 ${date}
⏰ ${time}
🏋️ ${training}
📌 ${format}
📞 ${contact}
`;

  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Принять", callback_data: `approve|${telegram_id}|${date}|${time}` },
            { text: "Отклонить", callback_data: `reject|${telegram_id}|${date}|${time}` }
          ]
        ]
      }
    })
  });

  // 3. Ответ клиенту
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: telegram_id,
      text: "✅ Вы записались. Ожидайте подтверждения"
    })
  });

  res.json({ ok: true });
});


// 📌 WEBHOOK ОТ TELEGRAM
app.post(`/bot${TOKEN}`, async (req, res) => {
  const data = req.body;
  
  // 📩 ОБРАБОТКА ТЕКСТА (КОММЕНТАРИЙ)
if (data.message && pendingRejects[data.message.chat.id]) {
  const { userId, date, time } = pendingRejects[data.message.chat.id];
  const comment = data.message.text;

  await fetch(`${SUPABASE_URL}/rest/v1/bookings?telegram_id=eq.${userId}&date=eq.${date}&time=eq.${time}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({
      status: "rejected",
      admin_comment: comment
    })
  });

  delete pendingRejects[data.message.chat.id];
}

  if (data.callback_query) {
    const { data: cbData, message } = data.callback_query;
    const [action, userId, date, time] = cbData.split("|");

    if (action === "approve") {
      // обновляем статус
      await fetch(`${SUPABASE_URL}/rest/v1/bookings?telegram_id=eq.${userId}&date=eq.${date}&time=eq.${time}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify({ status: "confirmed" })
      });

      // пишем клиенту
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: userId,
          text: `✅ Ваша заявка подтверждена\n📅 ${date} ⏰ ${time}`
        })
      });
    }

if (action === "reject") {
  pendingRejects[message.chat.id] = {
    userId,
    date,
    time
  };

  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: message.chat.id,
      text: "✏️ Напишите причину отказа:"
    })
  });
}

      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: userId,
          text: "❌ Ваша заявка отклонена"
        })
      });
    }
  }

  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});
